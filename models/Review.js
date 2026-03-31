const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
    {
        /* ========================
           🔥 WHO IS REVIEWING
        ======================== */
        reviewer: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "reviewerModel"
        },
        reviewerModel: {
            type: String,
            required: true,
            enum: ["User", "ServiceUser"]
        },

        /* ========================
           🔥 WHO IS BEING REVIEWED
        ======================== */
        reviewee: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "revieweeModel"
        },
        revieweeModel: {
            type: String,
            required: true,
            enum: ["User", "ServiceUser"]
        },

        /* ========================
           🔥 CONTEXT
        ======================== */
        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true
        },

        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Properties",
            default: null
        },

        service: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Service",
            default: null
        },

        /* ========================
           ⭐ REVIEW DATA
        ======================== */
        rating: {
            type: Number,
            min: 1,
            max: 5,
            required: true
        },
        reviewType: {
            type: String,
            enum: ["property", "service", "user"],
            required: true
        },
        ratingsBreakdown: {
            cleanliness: { type: Number, min: 1, max: 5 },
            service: { type: Number, min: 1, max: 5 },
            location: { type: Number, min: 1, max: 5 },
            value: { type: Number, min: 1, max: 5 }
        },

        comment: {
            type: String,
            trim: true
        },

        photos: [
            {
                url: String,
                caption: String
            }
        ],

        /* ========================
           🔥 CONTROL FLAGS
        ======================== */
        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

/* ========================
   🚀 INDEXES
======================== */

// Prevent duplicate review per booking per user
reviewSchema.index(
    { booking: 1, reviewer: 1, property: 1, service: 1 },
    { unique: true }
);


// Fast queries
reviewSchema.index({ reviewee: 1, revieweeModel: 1 });
reviewSchema.index({ property: 1 });
reviewSchema.index({ service: 1 });

module.exports = mongoose.model("Review", reviewSchema);