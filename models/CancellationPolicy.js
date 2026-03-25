const mongoose = require("mongoose");

const cancellationPolicySchema = new mongoose.Schema({

  name: {
    type: String,
    enum: ["Flexible", "Moderate", "Strict"],
    required: true,
    unique: true
  },

  description: String,

  rules: [
    {
      from: Number, 
      to: Number,
      unit: {
        type: String,
        enum: ["hours", "days"],
        default: "days"
      },
      refundPercentage: Number
    }
  ],

  noRefundAfterCheckIn: {
    type: Boolean,
    default: true
  },

  cancellationFee: {
    type: Number,
    default: 0
  },

  isActive: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });

module.exports = mongoose.model("CancellationPolicy", cancellationPolicySchema);