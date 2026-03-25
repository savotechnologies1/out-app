const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({

  /* ========================
     USER INFO
  ======================== */

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  /* ========================
     BOOKING TYPE
  ======================== */

  bookingType: {
    type: String,
    enum: ["PROPERTY", "SERVICE", "PACKAGE", "PROPERTY_SERVICE"],
    required: true
  },

  /* ========================
     RELATIONS
  ======================== */

  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Properties",
    index: true,
    required: function () {
      return ["PROPERTY", "PROPERTY_SERVICE"].includes(this.bookingType);
    }
  },

  package: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Package"
  },

  services: [{
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: function () {
        return this.bookingType === "SERVICE" || this.bookingType === "PROPERTY_SERVICE";
      }
    },
    price: {
      type: Number,
      required: function () {
        return this.bookingType === "SERVICE" || this.bookingType === "PROPERTY_SERVICE";
      }
    }
  }],

  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Coupon"
  },

  /* ========================
     DATE & GUESTS
  ======================== */

  checkIn: {
    type: Date,
    required: true,
    index: true
  },

  checkOut: {
    type: Date,
    required: true,
    index: true
  },

  adults: {
    type: Number,
    default: 1
  },

  children: {
    type: Number,
    default: 0
  },

  /* ========================
     PRICE BREAKDOWN
  ======================== */

  priceBreakdown: {
    propertyPrice: { type: Number, default: 0 },
    packagePrice: { type: Number, default: 0 },
    servicePrice: { type: Number, default: 0 }
  },

  totalAmount: {
    type: Number,
    required: true
  },

  commissionAmount: Number,
  providerAmount: Number,
  platformFee: Number,
  tax: Number,

  /* ========================
     🔥 PROVIDER BREAKDOWN (IMPORTANT)
  ======================== */

  providerBreakdown: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ServiceUser"
      },
      amount: Number,
      type: {
        type: String,
        enum: ["property", "service"]
      },
      referenceId: mongoose.Schema.Types.ObjectId // propertyId or serviceId
    }
  ],

  /* ========================
     PAYMENT
  ======================== */

  orderId: {
    type: String,
    unique: true,
    index: true
  },

  tapChargeId: String,

  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed"],
    default: "pending"
  },

  bookingStatus: {
    type: String,
    enum: ["pending", "confirmed", "cancelled"],
    default: "pending"
  },

  webhookProcessed: {
    type: Boolean,
    default: false
  },

  /* ========================
     🔥 CANCELLATION POLICY
  ======================== */

  cancellationPolicy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CancellationPolicy"
  },

  policySnapshot: {
    name: String,
    rules: [
      {
        from: Number,
        to: Number,
        unit: String,
        refundPercentage: Number
      }
    ],
    cancellationFee: Number
  },

  /* ========================
     REFUND INFO
  ======================== */

  cancellationDate: Date,

  refundAmount: {
    type: Number,
    default: 0
  },

  refundPercentage: Number,

  refundStatus: {
    type: String,
    enum: ["pending", "processed"],
    default: "pending"
  },

  isCancelled: {
    type: Boolean,
    default: false
  },

  adminOverride: {
    isOverridden: { type: Boolean, default: false },
    refundAmount: Number,
    reason: String
  },
  refundTransactionId: String,

  /* ========================
     🔥 WALLET RELEASE TRACKING
  ======================== */

  isAmountReleased: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

/* ========================
   INDEXES
======================== */

bookingSchema.index({ property: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ bookingStatus: 1 });

module.exports = mongoose.model("Booking", bookingSchema);