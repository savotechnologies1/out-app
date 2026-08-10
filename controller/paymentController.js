const Booking = require("../models/Booking");
const HotelAvailability = require("../models/Availability");
const PaymentTransaction = require("../models/PaymentTransaction");
const Coupon = require("../models/Coupon");
const Wallet = require("../models/Wallet");
const Properties = require("../models/Properties");
const WalletTransaction = require("../models/WalletTransaction");
const ServiceAvailability = require("../models/ServiceAvailability");
const Service = require("../models/Service");
const { sendNotification } = require("../utils/notificationService")


function getDatesBetween(startDate, endDate) {

  const dates = [];

  let currentDate = new Date(startDate);

  while (currentDate < new Date(endDate)) {

    dates.push(new Date(currentDate));

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}


// exports.paymentWebhook = async (req, res) => {
//   try {
//     const payload = req.body;

//     const chargeId = payload.id;
//     const status = payload.status;
//     const orderId = payload.reference?.order;

//     if (!orderId) {
//       return res.status(400).send({ message: "Order id missing" });
//     }

//     const booking = await Booking.findOne({ orderId });

//     if (!booking) {
//       return res.status(404).send({ message: "Booking not found" });
//     }

//     if (booking.webhookProcessed) {
//       return res.status(200).send({ message: "Webhook already processed" });
//     }

//     /* ===============================================
//        SAVE PAYMENT TRANSACTION
//     =============================================== */
//     await PaymentTransaction.create({
//       booking: booking._id,
//       orderId,
//       tapChargeId: chargeId,
//       totalAmount: booking.totalAmount,
//       commissionAmount: booking.commissionAmount,
//       providerAmount: booking.providerAmount,
//       platformFee: booking.platformFee,
//       tax: booking.tax,
//       currency: payload.currency || "SAR",
//       status: status === "CAPTURED" ? "success" : "failed",
//       rawResponse: payload,
//     });

//     /* ===============================================
//        PAYMENT SUCCESS
//     =============================================== */
//     if (status === "CAPTURED") {
//       booking.paymentStatus = "paid";
//       booking.bookingStatus = "confirmed";
//       booking.tapChargeId = chargeId;
//       booking.webhookProcessed = true;
//       booking.pendingReason = null;
//       booking.pendingExpiredAt = null;
//       await booking.save();

//       /* ===============================================
//          🔥 PREPARE BOOKING DATA FOR NOTIFICATION
//       =============================================== */
//       const bookingData = {
//         bookingId: booking._id.toString(),
//         userId: booking.user?.toString(),
//         totalAmount: booking.totalAmount,
//         bookingStatus: booking.bookingStatus,
//         paymentStatus: booking.paymentStatus,
//         checkIn: booking.checkIn,
//         checkOut: booking.checkOut,
//       };

//       /* ===============================================
//          🔔 USER NOTIFICATION
//       =============================================== */
//       await sendNotification({
//         receiverId: booking.user,
//         receiverModel: "User",
//         title: "Booking Confirmed ✅",
//         body: "Your booking has been successfully confirmed",
//         type: "BOOKING",
//         referenceId: booking._id,
//         referenceType: "Booking",
//         data: bookingData,
//       });

//       /* ===============================================
//          🔔 SERVICE USER NOTIFICATION
//       =============================================== */
//       if (booking.providerBreakdown?.length > 0) {
//         for (const provider of booking.providerBreakdown) {
//           const providerData = {
//             bookingId: booking._id.toString(),
//             amount: provider.amount,
//             checkIn: booking.checkIn,
//             checkOut: booking.checkOut,
//             type: "BOOKING",
//           };

//           await sendNotification({
//             receiverId: provider.user,
//             receiverModel: "ServiceUser",
//             title: "New Booking 📦",
//             body: "You received a new booking",
//             type: "BOOKING",
//             referenceId: booking._id,
//             referenceType: "Booking",
//             data: providerData,
//           });
//         }
//       }

//       const dates = getDatesBetween(booking.checkIn, booking.checkOut);

//       /* ===============================================
//          BLOCK PROPERTY AVAILABILITY
//       =============================================== */
//       if (booking.property) {
//         const availabilityDocs = dates.map((date) => ({
//           hotel: booking.property,
//           date,
//           booking: booking._id,
//           isBooked: true,
//         }));

//         await HotelAvailability.insertMany(availabilityDocs);
//       }

//       /* ===============================================
//          BLOCK SERVICE AVAILABILITY
//       =============================================== */
//       if (booking.services?.length > 0) {
//         const serviceIds = booking.services.map((s) => s.service);

//         const servicesData = await Service.find({
//           _id: { $in: serviceIds },
//         }).select("_id workingHours");

//         const serviceAvailabilityDocs = [];

//         servicesData.forEach((service) => {
//           dates.forEach((date) => {
//             serviceAvailabilityDocs.push({
//               service: service._id,
//               date,
//               startTime: service.workingHours.start,
//               endTime: service.workingHours.end,
//               booking: booking._id,
//               isBooked: true,
//             });
//           });
//         });

//         await ServiceAvailability.insertMany(serviceAvailabilityDocs);
//       }

//       /* ===============================================
//          COUPON USAGE
//       =============================================== */
//       if (booking.couponId) {
//         await Coupon.findByIdAndUpdate(booking.couponId, {
//           $inc: { usedCount: 1 },
//           $push: {
//             usedBy: {
//               user: booking.user,
//               usedAt: new Date(),
//             },
//           },
//         });
//       }

//       /* ===============================================
//          WALLET HOLD
//       =============================================== */
//       if (booking.providerBreakdown?.length > 0) {
//         for (const provider of booking.providerBreakdown) {
//           let wallet = await Wallet.findOne({ user: provider.user });

//           if (!wallet) {
//             wallet = await Wallet.create({
//               user: provider.user,
//               availableBalance: 0,
//               holdBalance: 0,
//             });
//           }

//           wallet.holdBalance += provider.amount;
//           await wallet.save();

//           await WalletTransaction.create({
//             wallet: wallet._id,
//             user: provider.user,
//             type: "credit",
//             amount: provider.amount,
//             bookingId: booking._id,
//             referenceId: provider.referenceId,
//             description: "Booking amount added to hold balance",
//             transactionType: "booking_hold",
//           });
//         }
//       }
//     }

//     /* ===============================================
//        PAYMENT FAILED
//     =============================================== */
//     else {
//       booking.bookingStatus = "pending";
//       booking.paymentStatus = "failed";
//       booking.pendingReason = "payment_failed";
//       booking.webhookProcessed = true;

//       await booking.save();

//       /* 🔔 USER PAYMENT FAILED */
//       await sendNotification({
//         receiverId: booking.user,
//         receiverModel: "User",
//         title: "Payment Failed ❌",
//         body: "Your booking payment has failed",
//         type: "PAYMENT",
//         referenceId: booking._id,
//         referenceType: "Booking",
//       });
//     }

//     return res.status(200).send({
//       message: "Webhook processed successfully",
//     });
//   } catch (error) {
//     console.error("Webhook error:", error);

//     return res.status(500).send({
//       message: error.message,
//     });
//   }
// };


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
      totalAmount: booking.totalAmount,
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

      booking.tapChargeId = chargeId;

      booking.webhookProcessed = true;

      booking.pendingExpiredAt = null;

      await booking.save();

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

        const serviceIds =
          booking.services.map(
            (s) => s.service
          );

        const servicesData =
          await Service.find({
            _id: { $in: serviceIds },
          }).select("_id workingHours");

        const serviceAvailabilityDocs = [];

        servicesData.forEach((service) => {

          dates.forEach((date) => {

            serviceAvailabilityDocs.push({
              service: service._id,
              date,
              startTime:
                service.workingHours.start,
              endTime:
                service.workingHours.end,
              booking: booking._id,
              isBooked: true,
            });

          });

        });

        await ServiceAvailability.insertMany(
          serviceAvailabilityDocs
        );
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
                availableBalance: 0,
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

      booking.bookingStatus = "pending";

      booking.paymentStatus = "failed";

      booking.pendingReason =
        "payment_failed";

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