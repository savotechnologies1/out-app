const mongoose = require("mongoose");

const giftCardSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Gift card code is required"],
      uppercase: true,
      trim: true,
    },

    title: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    amount: {
      type: Number,
      required: [true, "Gift card amount is required"],
      min: [0.01, "Gift card amount must be greater than 0"],
    },

    currency: {
      type: String,
      default: "SAR",
      trim: true,
    },

    targetType: {
      type: String,
      enum: ["ALL", "SPECIFIC_USER"],
      default: "ALL",
      required: true,
    },

    // When targetType is "SPECIFIC_USER", this specifies the designated recipient
    applicableUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Total redemption limit across all users (optional for universal gift cards)
    usageLimit: {
      type: Number,
      default: null,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Tracks every redemption: guarantees each user can only add the money once
    usedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        redeemedAt: {
          type: Date,
          default: Date.now,
        },
        walletTransactionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "UserWalletTransaction",
        },
      },
    ],

    startDate: {
      type: Date,
      default: null,
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isDelete: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

// Unique partial index on active codes
giftCardSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDelete: false,
    },
  }
);

// Index for checking user redemptions quickly
giftCardSchema.index({ "usedBy.user": 1 });
giftCardSchema.index({ applicableUser: 1 });

module.exports = mongoose.model("GiftCard", giftCardSchema);
