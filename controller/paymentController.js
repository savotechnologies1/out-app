const Booking = require("../models/Booking");
const HotelAvailability = require("../models/Availability");
const PaymentTransaction = require("../models/PaymentTransaction");
const Coupon = require("../models/Coupon");
const Wallet = require("../models/Wallet");
const Properties = require("../models/Properties");
const WalletTransaction = require("../models/WalletTransaction");
const ServiceAvailability = require("../models/ServiceAvailability");
const Service = require("../models/Service");


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
      return res.status(400).send({ message: "Order id missing" });
    }

    const booking = await Booking.findOne({ orderId });

    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    if (booking.webhookProcessed) {
      return res.status(200).send({ message: "Webhook already processed" });
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
      status: status === "CAPTURED" ? "success" : "failed",
      rawResponse: payload
    });

    /* ===============================================
       PAYMENT SUCCESS
    =============================================== */

    if (status === "CAPTURED") {

      booking.paymentStatus = "paid";
      booking.bookingStatus = "confirmed";
      booking.tapChargeId = chargeId;
      booking.webhookProcessed = true;

      await booking.save();

      const dates = getDatesBetween(booking.checkIn, booking.checkOut);

      /* ===============================================
         BLOCK PROPERTY AVAILABILITY
      =============================================== */

      if (booking.property) {

        const availabilityDocs = dates.map(date => ({
          hotel: booking.property,
          date,
          booking: booking._id,
          isBooked: true
        }));

        await HotelAvailability.insertMany(availabilityDocs);
      }

      /* ===============================================
         BLOCK SERVICE AVAILABILITY
      =============================================== */

      if (booking.services && booking.services.length > 0) {

        const serviceIds = booking.services.map(s => s.service);

        const servicesData = await Service.find({
          _id: { $in: serviceIds }
        }).select("_id workingHours");

        const serviceMap = {};
        servicesData.forEach(s => {
          serviceMap[s._id] = s.workingHours;
        });

        const serviceAvailabilityDocs = [];

        booking.services.forEach(service => {

          const hours = serviceMap[service.service];

          dates.forEach(date => {

            serviceAvailabilityDocs.push({
              service: service.service,
              date,
              startTime: hours.start,
              endTime: hours.end,
              booking: booking._id,
              isBooked: true
            });

          });

        });

        await ServiceAvailability.insertMany(serviceAvailabilityDocs);
      }

      /* ===============================================
         COUPON USAGE
      =============================================== */

      if (booking.couponId) {

        await Coupon.findByIdAndUpdate(
          booking.couponId,
          {
            $inc: { usedCount: 1 },
            $push: {
              usedBy: {
                user: booking.user,
                usedAt: new Date()
              }
            }
          }
        );

      }

      /* ===============================================
         WALLET CREDIT (PROPERTY OWNER)
      =============================================== */

      if (booking.bookingType === "PROPERTY" || booking.bookingType === "PROPERTY_SERVICE") {

        const property = await Properties.findById(booking.property).select("user");

        if (property) {

          let wallet = await Wallet.findOne({ user: property.user });

          if (!wallet) {
            wallet = await Wallet.create({
              user: property.user,
              balance: 0
            });
          }

          wallet.balance += booking.providerAmount;

          await wallet.save();

          await WalletTransaction.create({
            wallet: wallet._id,
            user: property.user,
            type: "credit",
            amount: booking.providerAmount,
            bookingId: booking._id,
            referenceId: booking.property,
            description: "Property booking payment received"
          });

        }
      }

      /* =================================================
         ✅ SERVICE WALLET CREDIT
      ================================================= */

      if (booking.bookingType === "SERVICE") {

        const serviceIds = booking.services.map(s => s.service);

        const servicesData = await Service.find({
          _id: { $in: serviceIds }
        }).select("_id user");

        for (const service of servicesData) {

          let wallet = await Wallet.findOne({ user: service.user });

          if (!wallet) {
            wallet = await Wallet.create({
              user: service.user,
              balance: 0
            });
          }

          // 👉 OPTIONAL: split amount per service
          const serviceAmount =
            booking.providerAmount / servicesData.length;

          wallet.balance += serviceAmount;

          await wallet.save();

          await WalletTransaction.create({
            wallet: wallet._id,
            user: service.user,
            type: "credit",
            amount: serviceAmount,
            bookingId: booking._id,
            referenceId: service._id,
            description: "Service booking payment received"
          });

        }
      }

    }

    /* ===============================================
       PAYMENT FAILED
    =============================================== */

    else {

      booking.bookingStatus = "cancelled";
      booking.paymentStatus = "failed";
      booking.webhookProcessed = true;

      await booking.save();

    }

    return res.status(200).send({
      message: "Webhook processed successfully"
    });

  } catch (error) {

    console.error("Webhook error:", error);

    return res.status(500).send({
      message: error.message
    });

  }
};