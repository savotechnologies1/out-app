const mongoose = require("mongoose");

const serviceAvailabilitySchema = new mongoose.Schema({

  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Service",
    required: true,
    index: true
  },

  date: {
    type: Date,
    required: true,
    index: true
  },

  startTime: {
    type: String,
    required: true
  },

  endTime: {
    type: String,
    required: true
  },

  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking"
  },

  isBooked: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

serviceAvailabilitySchema.index(
  { service: 1, date: 1, startTime: 1, endTime: 1 },
  { unique: true }
);

module.exports = mongoose.model("ServiceAvailability", serviceAvailabilitySchema);