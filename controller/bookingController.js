const Booking = require("../models/Booking");
const { v4: uuidv4 } = require("uuid");
const HotelAvailability = require("../models/Availability");



function getDatesBetween(startDate, endDate) {

  const dates = [];

  let currentDate = new Date(startDate);

  while (currentDate < new Date(endDate)) {

    dates.push(new Date(currentDate));

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}
exports.checkAvailability = async (req, res) => {

  try {

    const { hotelId, checkIn, checkOut } = req.body;

    const dates = getDatesBetween(checkIn, checkOut);

    const bookedDates = await HotelAvailability.find({
      hotel: hotelId,
      date: { $in: dates },
      isBooked: true
    });

    if (bookedDates.length > 0) {

      return res.send({
        available: false,
        message: "Some dates already booked"
      });

    }

    return res.send({
      available: true,
      message: "Dates available"
    });

  } catch (error) {

    return res.status(500).send({ message: error.message });

  }

};
exports.createBooking = async (req, res) => {
  try {

    const { hotelId, checkIn, checkOut, adults, children, amount } = req.body;

    const dates = getDatesBetween(checkIn, checkOut);

    // Check if dates already booked
    const bookedDates = await HotelAvailability.find({
      hotel: hotelId,
      date: { $in: dates },
      isBooked: true
    });

    if (bookedDates.length > 0) {
      return res.status(400).send({
        message: "Selected dates are not available"
      });
    }

    const orderId = "ORD_" + uuidv4();

    const booking = await Booking.create({
      hotel: hotelId,
      user: req.user._id,
      checkIn,
      checkOut,
      adults,
      children,
      amount,
      orderId,
      paymentStatus: "pending",
      bookingStatus: "pending"
    });

    return res.status(201).send({
      message: "Booking created",
      bookingId: booking._id,
      orderId,
      amount
    });

  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
};

exports.getBookingStatus = async (req, res) => {
  try {

    const { orderId } = req.params;

    const booking = await Booking.findOne({ orderId });

    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    return res.send({
      paymentStatus: booking.paymentStatus,
      bookingStatus: booking.bookingStatus
    });

  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
};

exports.getUserBookings = async (req, res) => {
  try {

    const bookings = await Booking.find({
      user: req.user._id
    }).populate("hotel");

    return res.send(bookings);

  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
};

exports.cancelBooking = async (req, res) => {
  try {

    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    booking.bookingStatus = "cancelled";

    await booking.save();

    return res.send({
      message: "Booking cancelled"
    });

  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
};