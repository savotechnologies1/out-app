const Booking = require("../models/Booking");
const HotelAvailability = require("../models/Availability");
const PaymentTransaction = require("../models/PaymentTransaction");


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

    // Save payment transaction
    await PaymentTransaction.create({
      booking: booking._id,
      orderId: orderId,
      tapChargeId: chargeId,
      amount: booking.amount,
      currency: payload.currency || "SAR",
      status: status === "CAPTURED" ? "success" : "failed",
      rawResponse: payload
    });

    if (status === "CAPTURED") {

      booking.paymentStatus = "paid";
      booking.bookingStatus = "confirmed";
      booking.tapChargeId = chargeId;
      booking.webhookProcessed = true;

      await booking.save();

      // Generate booking dates
      const dates = getDatesBetween(booking.checkIn, booking.checkOut);

      const availabilityDocs = dates.map(date => ({
        hotel: booking.hotel,
        date,
        booking: booking._id,
        isBooked: true
      }));

      await HotelAvailability.insertMany(availabilityDocs);

      console.log("Dates reserved for booking:", booking._id);

    } else {
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
