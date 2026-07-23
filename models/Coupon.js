const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    discountType: {
      type: String,
      enum: ["PERCENTAGE", "FLAT"],
      required: true,
    },

    discountValue: { type: Number, required: true },

    minAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number },

    firstTimeUserOnly: { type: Boolean, default: false },

    applicableCategories: [
      { type: mongoose.Schema.Types.ObjectId }
    ],

    applicableProperties: [
      { type: mongoose.Schema.Types.ObjectId }
    ],

    usageLimit: Number,
    usedCount: { type: Number, default: 0 },

    usedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId },
        usedAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "INACTIVE", "DELETED"],
      default: "ACTIVE",
    },
    startDate: { type: Date },
    expiryDate: { type: Date },
    isDelete: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDelete: false,
    },
  }
);

module.exports = mongoose.model("Coupon", couponSchema);