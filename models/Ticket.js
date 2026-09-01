const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },
        serviceUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceUser",
            default: null,
            index: true,
        },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            default: null,
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null,
            index: true,
        },
        botState: {
            type: String,
            enum: ["AWAITING_INITIAL_OPTION", "AWAITING_CANCEL_REASON", "AWAITING_CANCEL_CUSTOM_REASON", "BOT_COMPLETED"],
            default: null,
        },
        lang: {
            type: String,
            enum: ["en", "ar"],
            default: "en",
        },

        subject: {
            type: String,
            required: true,
        },
        Image: { type: String },
        description: {
            type: String,
            default: null,
        },

        status: {
            type: String,
            enum: ["OPEN", "IN_PROGRESS", "CLOSED"],
            default: "OPEN",
            index: true,
        },

        priority: {
            type: String,
            enum: ["LOW", "MEDIUM", "HIGH"],
            default: "MEDIUM",
        },

        closedAt: Date,
    },
    { timestamps: true }
);

module.exports = mongoose.model("Ticket", ticketSchema);