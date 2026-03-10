const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({

  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking"
  },

  orderId: String,

  tapChargeId: String,

  amount: Number,

  currency: String,

  status: {
    type: String,
    enum: ["pending", "success", "failed"],
    default: "pending"
  },

  rawResponse: Object

}, { timestamps: true });

module.exports = mongoose.model("PaymentTransaction", paymentSchema);