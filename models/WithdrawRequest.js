const mongoose = require("mongoose");

const withdrawSchema = new mongoose.Schema({

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceUser"
  },

  amount: Number,

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  rejectReason: {
    type: String
  },
  bankDetails: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BankDetails"
  }

}, { timestamps: true })

module.exports = mongoose.model("WithdrawRequest", withdrawSchema)