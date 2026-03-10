// const mongoose = require("mongoose");

// const bookingSchema = new mongoose.Schema({
//     hotel: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Hotel",
//         required: true
//     },
//     user: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "User"
//     },
//     checkIn: Date,
//     checkOut: Date,
//     status: {
//         type: String,
//         enum: ["pending", "confirmed", "cancelled", "expired"],
//         default: "pending"
//     },
//     paymentIntentId: String,
//     webhookProcessed: { type: Boolean, default: false }
// }, { timestamps: true });

// module.exports = mongoose.model("Booking", bookingSchema);

const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({

  hotel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Properties"
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  checkIn: Date,

  checkOut: Date,

  adults: {
    type: Number,
    default: 1
  },

  children: {
    type: Number,
    default: 0
  },

  amount: Number,

  orderId: {
    type: String,
    unique: true
  },

  tapChargeId: String,

  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed"],
    default: "pending"
  },

  bookingStatus: {
    type: String,
    enum: ["pending", "confirmed", "cancelled"],
    default: "pending"
  },

  webhookProcessed: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

module.exports = mongoose.model("Booking", bookingSchema);