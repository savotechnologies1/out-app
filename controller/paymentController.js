const Booking = require("../models/Booking");
const HotelAvailability = require("../models/Availability");
const PaymentTransaction = require("../models/PaymentTransaction");
const Coupon = require("../models/Coupon");
const Wallet = require("../models/Wallet");
const Properties = require("../models/Properties");
const WalletTransaction = require("../models/WalletTransaction");
const ServiceAvailability = require("../models/ServiceAvailability");
const Service = require("../models/Service");
const UserWallet = require("../models/UserWallet");
const UserWalletTransaction = require("../models/UserWalletTransaction");
const { sendNotification } = require("../utils/notificationService");
const { calculateAcceptanceDeadline } = require("../services/bookingExpiryService");
const { reserveServiceSlots } = require("../utils/serviceAvailabilityUtils");


function getDatesBetween(startDate, endDate) {

  const dates = [];

  let currentDate = new Date(startDate);

  while (currentDate < new Date(endDate)) {

    dates.push(new Date(currentDate));

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}



exports.paymentWebhook = async (req, res) => {
  try {

    const payload = req.body;

    const chargeId = payload.id;

    const status = payload.status;

    const orderId = payload.reference?.order;

    if (!orderId) {
      return res.status(400).send({
        message: "Order id missing"
      });
    }

    const booking = await Booking.findOne({ orderId });

    if (!booking) {
      return res.status(404).send({
        message: "Booking not found"
      });
    }

    if (booking.webhookProcessed) {
      return res.status(200).json({
        success: true,
        message: "Webhook already processed"
      });
    }

    /* ===============================================
       SAVE PAYMENT TRANSACTION
    =============================================== */

    await PaymentTransaction.create({
      booking: booking._id,
      orderId,
      tapChargeId: chargeId,
      totalAmount:
        booking.onlinePayableAmount !== undefined && booking.onlinePayableAmount !== null
          ? booking.onlinePayableAmount
          : booking.totalAmount,
      commissionAmount: booking.commissionAmount,
      providerAmount: booking.providerAmount,
      platformFee: booking.platformFee,
      tax: booking.tax,
      currency: payload.currency || "SAR",
      status:
        status === "CAPTURED"
          ? "success"
          : "failed",
      rawResponse: payload,
    });

    /* ===============================================
       PAYMENT SUCCESS
    =============================================== */

    if (status === "CAPTURED") {

      let isInstantBooking = false;

      /* ===============================================
         PROPERTY BOOKING
      =============================================== */

      if (
        booking.bookingType === "PROPERTY"
      ) {

        const property =
          await Properties.findById(
            booking.property
          ).select("instantBooking");

        isInstantBooking =
          property?.instantBooking || false;
      }

      /* ===============================================
         SERVICE BOOKING
      =============================================== */

      else if (
        booking.bookingType === "SERVICE"
      ) {

        const serviceIds =
          booking.services.map(
            s => s.service
          );

        const servicesData =
          await Service.find({
            _id: { $in: serviceIds }
          }).select("instantBooking");

        isInstantBooking =
          servicesData.every(
            service =>
              service.instantBooking === true
          );
      }

      /* ===============================================
         PROPERTY + SERVICE BOOKING
      =============================================== */

      else if (
        booking.bookingType ===
        "PROPERTY_SERVICE"
      ) {

        const property =
          await Properties.findById(
            booking.property
          ).select("instantBooking");

        const serviceIds =
          booking.services.map(
            s => s.service
          );

        const servicesData =
          await Service.find({
            _id: { $in: serviceIds }
          }).select("instantBooking");

        const allServicesInstant =
          servicesData.every(
            service =>
              service.instantBooking === true
          );

        isInstantBooking =
          property?.instantBooking &&
          allServicesInstant;
      }

      /* ===============================================
         UPDATE BOOKING
      =============================================== */

      booking.paymentStatus = "paid";

      booking.bookingStatus =
        isInstantBooking
          ? "confirmed"
          : "pending";

      booking.pendingReason =
        isInstantBooking
          ? null
          : "approval_pending";

      if (!isInstantBooking && (!booking.acceptanceDeadline || isNaN(new Date(booking.acceptanceDeadline).getTime()))) {
        let referenceDate = booking.checkIn;
        if (booking.bookingType === "SERVICE" && booking.services && booking.services.length > 0) {
          let earliest = null;
          for (const s of booking.services) {
            if (s.serviceDate) {
              const d = new Date(s.serviceDate);
              if (s.serviceStartTime) {
                const [hours, minutes] = s.serviceStartTime.split(":").map(Number);
                d.setUTCHours(hours || 0, minutes || 0, 0, 0);
              }
              if (!earliest || d < earliest) {
                earliest = d;
              }
            }
          }
          if (earliest) {
            referenceDate = earliest;
          }
        }
        booking.acceptanceDeadline = calculateAcceptanceDeadline(referenceDate, booking.createdAt || new Date());
      }

      booking.tapChargeId = chargeId;

      booking.webhookProcessed = true;

      booking.pendingExpiredAt = null;

      await booking.save();

      if (booking.bookingStatus === "confirmed") {
        const { generateInvoicePDF } = require("../utils/invoiceGenerator");
        await generateInvoicePDF(booking._id);
      }

      /* ===============================================
         🔥 PREPARE BOOKING DATA
      =============================================== */

      const bookingData = {
        bookingId: booking._id.toString(),
        userId: booking.user?.toString(),
        totalAmount: booking.totalAmount,
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
      };

      /* ===============================================
         🔔 USER NOTIFICATION
      =============================================== */

      await sendNotification({
        receiverId: booking.user,
        receiverModel: "User",

        title: isInstantBooking
          ? "Booking Confirmed ✅"
          : "Booking Pending Approval ⏳",

        body: isInstantBooking
          ? "Your booking has been successfully confirmed"
          : "Your booking is waiting for provider approval",

        type: "BOOKING",

        referenceId: booking._id,

        referenceType: "Booking",

        data: bookingData,
      });

      /* ===============================================
         🔔 PROVIDER NOTIFICATION
      =============================================== */

      if (booking.providerBreakdown?.length > 0) {

        for (const provider of booking.providerBreakdown) {

          const providerData = {
            bookingId: booking._id.toString(),
            amount: provider.amount,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            type: "BOOKING",
          };

          await sendNotification({
            receiverId: provider.user,
            receiverModel: "ServiceUser",

            title: isInstantBooking
              ? "New Confirmed Booking 📦"
              : "New Booking Request 📦",

            body: isInstantBooking
              ? "You received a confirmed booking"
              : "You received a new booking request",

            type: "BOOKING",

            referenceId: booking._id,

            referenceType: "Booking",

            data: providerData,
          });
        }
      }

      const dates = getDatesBetween(
        booking.checkIn,
        booking.checkOut
      );

      /* ===============================================
         BLOCK PROPERTY AVAILABILITY
      =============================================== */

      if (
        booking.property &&
        booking.bookingStatus === "confirmed"
      ) {

        const availabilityDocs =
          dates.map((date) => ({
            hotel: booking.property,
            date,
            booking: booking._id,
            isBooked: true,
          }));

        await HotelAvailability.insertMany(
          availabilityDocs
        );
      }

      /* ===============================================
         BLOCK SERVICE AVAILABILITY
      =============================================== */

      if (
        booking.services?.length > 0 &&
        booking.bookingStatus === "confirmed"
      ) {
        await reserveServiceSlots(booking._id, booking.services);
      }

      /* ===============================================
         AUTO-CANCEL CONFLICTING PENDING BOOKINGS
      =============================================== */

      if (booking.bookingStatus === "confirmed") {
        const { autoCancelConflictingBookings } = require("./bookingController");
        await autoCancelConflictingBookings(booking);
      }

      /* ===============================================
         COUPON USAGE
      =============================================== */

      if (booking.couponId) {

        await Coupon.findByIdAndUpdate(
          booking.couponId,
          {
            $inc: {
              usedCount: 1
            },

            $push: {
              usedBy: {
                user: booking.user,
                usedAt: new Date(),
              },
            },
          }
        );
      }

      /* ===============================================
         WALLET HOLD
      =============================================== */

      if (
        booking.providerBreakdown?.length > 0 &&
        booking.bookingStatus === "confirmed"
      ) {

        for (const provider of booking.providerBreakdown) {

          let wallet =
            await Wallet.findOne({
              user: provider.user
            });

          if (!wallet) {

            wallet =
              await Wallet.create({
                user: provider.user,
                balance: 0,
                holdBalance: 0,
              });
          }

          wallet.holdBalance += provider.amount;

          await wallet.save();

          await WalletTransaction.create({

            wallet: wallet._id,

            user: provider.user,

            type: "credit",

            amount: provider.amount,

            bookingId: booking._id,

            referenceId: provider.referenceId,

            description:
              "Booking amount added to hold balance",

            transactionType: "booking_hold",
          });
        }
      }
    }

    /* ===============================================
       PAYMENT FAILED
    =============================================== */

    else {

      // Refund user wallet amount if any portion was paid using wallet
      if (booking.walletAmountApplied > 0 && !booking.walletRefunded) {
        let userWallet = await UserWallet.findOne({ user: booking.user });
        if (userWallet) {
          const newBal = Number((userWallet.balance + booking.walletAmountApplied).toFixed(2));
          userWallet.balance = newBal;
          await userWallet.save();

          await UserWalletTransaction.create({
            wallet: userWallet._id,
            user: booking.user,
            type: "credit",
            transactionType: "refund",
            amount: booking.walletAmountApplied,
            balanceAfter: newBal,
            currency: userWallet.currency || "SAR",
            status: "completed",
            description: `Refund of wallet amount due to failed online payment for booking ${orderId}`
          });

          booking.walletRefunded = true;
        }
      }

      booking.bookingStatus = "pending";
      booking.paymentStatus = "failed";
      booking.pendingReason = "payment_failed";
      booking.webhookProcessed = true;
      await booking.save();

      /* ===============================================
         🔔 USER PAYMENT FAILED
      =============================================== */

      await sendNotification({
        receiverId: booking.user,
        receiverModel: "User",

        title: "Payment Failed ❌",

        body:
          "Your booking payment has failed",

        type: "PAYMENT",

        referenceId: booking._id,

        referenceType: "Booking",
      });
    }

    return res.status(200).json({
      success: true,
      bookingStatus: booking.bookingStatus,
      bookingPaymentStatus: booking.paymentStatus,
      message:
        "Webhook processed successfully",
    });

  } catch (error) {

    console.error(
      "Webhook error:",
      error
    );

    return res.status(500).send({
      message: error.message,
    });
  }
};