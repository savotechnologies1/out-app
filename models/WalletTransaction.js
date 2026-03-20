const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
    {
        wallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Wallet",
            required: true
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceUser",
            required: true
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking"
        },
        type: {
            type: String,
            enum: ["credit", "debit"],
            required: true
        },

        amount: {
            type: Number,
            required: true
        },

        status: {
            type: String,
            enum: ["pending", "completed", "failed"],
            default: "completed"
        },

        referenceId: {
            type: String
        },

        description: {
            type: String
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);