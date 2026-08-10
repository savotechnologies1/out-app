const Booking = require("../models/Booking");
const HotelAvailability = require("../models/Availability");
const ServiceAvailability = require("../models/ServiceAvailability");
const { sendNotification } = require("../utils/notificationService");
const axios = require("axios");

/**
 * Calculates the provider acceptance deadline based on check-in date.
 * If check-in is > 24 hours from creation: created + 24 hours.
 * If check-in is <= 24 hours from creation: created + 2 hours.
 *
 * @param {Date|string} checkInDate 
 * @param {Date|string} [createdAtDate=new Date()] 
 * @returns {Date}
 */
function calculateAcceptanceDeadline(checkInDate, createdAtDate = new Date()) {
  const checkInTime = new Date(checkInDate).getTime();
  const createdTime = new Date(createdAtDate).getTime();
  const diffHours = (checkInTime - createdTime) / (1000 * 60 * 60);

  if (diffHours > 24) {
    return new Date(createdTime + 24 * 60 * 60 * 1000);
  } else {
    return new Date(createdTime + 2 * 60 * 60 * 1000);
  }
}

/**
 * Periodically executed cron worker to automatically cancel and refund
 * booking requests whose acceptance deadline has passed.
 */
async function autoCancelExpiredBookings() {
  try {
    const now = new Date();

    const expiredBookings = await Booking.find({
      bookingStatus: "pending",
      pendingReason: "approval_pending",
      paymentStatus: "paid",
      isCancelled: false,
      acceptanceDeadline: { $exists: true, $lte: now }
    });

    for (const booking of expiredBookings) {
      // Atomic status check and update to prevent race conditions
      const updatedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          bookingStatus: "pending",
          paymentStatus: "paid",
          pendingReason: "approval_pending",
          isCancelled: false
        },
        {
          $set: {
            bookingStatus: "cancelled",
            isCancelled: true,
            pendingReason: "expired",
            cancellationReason: "PROVIDER_ACCEPTANCE_TIMEOUT",
            cancellationDate: now,
            autoCancelledAt: now
          }
        },
        { new: true }
      );

      // If atomic update returned null, another process already handled this booking
      if (!updatedBooking) continue;

      let tapRefundId = null;
      let refundAmount = updatedBooking.totalAmount || 0;
      let refundStatus = "processed";

      // Trigger refund if charge ID exists
      if (updatedBooking.tapChargeId && refundAmount > 0) {
        try {
          const response = await axios.post(
            "https://api.tap.company/v2/refunds",
            {
              charge_id: updatedBooking.tapChargeId,
              amount: Number(refundAmount),
              currency: "SAR",
              reason: "Provider acceptance timeout",
              reference: {
                merchant: updatedBooking.orderId
              }
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
                "Content-Type": "application/json"
              }
            }
          );
          tapRefundId = response.data?.id || "REFUNDED_ON_TAP";
        } catch (err) {
          console.error(
            `Auto-cancel refund failed for booking ${updatedBooking._id}:`,
            err.response?.data || err.message
          );
          refundStatus = "failed";
        }
      }

      updatedBooking.refundAmount = refundAmount;
      updatedBooking.refundPercentage = 100;
      updatedBooking.refundStatus = refundStatus;
      updatedBooking.refundTransactionId = tapRefundId;
      await updatedBooking.save();

      // Release availability if blocked
      if (updatedBooking.property) {
        await HotelAvailability.deleteMany({
          hotel: updatedBooking.property,
          booking: updatedBooking._id
        });
      }

      if (updatedBooking.services?.length > 0) {
        const serviceIds = updatedBooking.services.map((s) => s.service);
        await ServiceAvailability.deleteMany({
          service: { $in: serviceIds },
          booking: updatedBooking._id
        });
      }

      const notificationData = {
        bookingId: updatedBooking._id.toString(),
        totalAmount: updatedBooking.totalAmount,
        refundAmount,
        cancellationReason: "PROVIDER_ACCEPTANCE_TIMEOUT",
        checkIn: updatedBooking.checkIn,
        checkOut: updatedBooking.checkOut
      };

      // Notify Customer
      await sendNotification({
        receiverId: updatedBooking.user,
        receiverModel: "User",
        title: "Booking Request Cancelled ❌",
        body: "Your booking request was automatically cancelled because the service provider did not accept it within the required time. Your held payment has been released/refunded.",
        type: "REFUND",
        referenceId: updatedBooking._id,
        referenceType: "Booking",
        data: notificationData
      });

      // Notify Service Provider(s)
      if (updatedBooking.providerBreakdown?.length > 0) {
        for (const provider of updatedBooking.providerBreakdown) {
          await sendNotification({
            receiverId: provider.user,
            receiverModel: "ServiceUser",
            title: "Booking Request Expired ⏳",
            body: "A booking request has expired because it was not accepted within the required time.",
            type: "BOOKING",
            referenceId: updatedBooking._id,
            referenceType: "Booking",
            data: {
              bookingId: updatedBooking._id.toString(),
              cancellationReason: "PROVIDER_ACCEPTANCE_TIMEOUT",
              providerType: provider.type
            }
          });
        }
      }

      console.log(`✅ Auto-cancelled expired booking: ${updatedBooking._id}`);
    }
  } catch (error) {
    console.error("❌ Error in autoCancelExpiredBookings cron:", error.message);
  }
}


module.exports = {
  calculateAcceptanceDeadline,
  autoCancelExpiredBookings
};
