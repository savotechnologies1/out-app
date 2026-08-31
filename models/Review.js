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
            amenities: { type: Number, min: 1, max: 5 },
            host: { type: Number, min: 1, max: 5 },
            information: { type: Number, min: 1, max: 5 },
            price: { type: Number, min: 1, max: 5 },
            serviceQuality: { type: Number, min: 1, max: 5 }
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

// Prevent duplicate reviews — includes reviewType so property/service/user
// reviews are correctly distinguished in the uniqueness constraint
reviewSchema.index(
    { booking: 1, reviewer: 1, reviewType: 1, property: 1, service: 1 },
    { unique: true }
);


// Fast queries
reviewSchema.index({ reviewee: 1, revieweeModel: 1 });
reviewSchema.index({ property: 1 });
reviewSchema.index({ service: 1 });

module.exports = mongoose.model("Review", reviewSchema);