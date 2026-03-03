const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
    {
        bookingDate: { type: Date },
        time: { type: String },
        notes: { type: String },
        status: { type: String, default: 'pending' },
        price: { type: Number },
        charges: { type: Number },
        discount: { type: Number },
        address: { type: Object },
        isDeleted: { type: Boolean, default: false },
        property: { type: mongoose.Schema.Types.ObjectId },
        bookingBy: { type: mongoose.Schema.Types.ObjectId },
        propertyOwner: { type: mongoose.Schema.Types.ObjectId }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
