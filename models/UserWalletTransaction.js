const mongoose = require("mongoose");

const userWalletTransactionSchema = new mongoose.Schema(
  {
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserWallet",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },

    transactionType: {
      type: String,
      enum: ["gift_card_redeem", "wallet_payment", "refund", "admin_adjustment"],
      default: "gift_card_redeem",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than 0"],
    },

    balanceAfter: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "SAR",
    },

    giftCardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftCard",
      default: null,
    },

    giftCardCode: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed",
    },

    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "UserWalletTransaction",
  userWalletTransactionSchema
);
