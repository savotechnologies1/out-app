const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
    hotel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hotel",
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    checkIn: Date,
    checkOut: Date,
    status: {
        type: String,
        enum: ["pending", "confirmed", "cancelled", "expired"],
        default: "pending"
    },
    paymentIntentId: String,
    webhookProcessed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Booking", bookingSchema);