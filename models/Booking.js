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
        return ["SERVICE", "PROPERTY_SERVICE", "PACKAGE"].includes(this.bookingType);
      }
    },
    price: {
      type: Number,
      required: function () {
        return ["SERVICE", "PROPERTY_SERVICE", "PACKAGE"].includes(this.bookingType);
      }
    },
    serviceDate: {
      type: Date,
      required: function () {
        return ["SERVICE", "PROPERTY_SERVICE", "PACKAGE"].includes(this.bookingType);
      }
    },
    serviceStartTime: {
      type: String,
      required: function () {
        return ["SERVICE", "PROPERTY_SERVICE", "PACKAGE"].includes(this.bookingType);
      }
    },
    serviceEndTime: {
      type: String,
      required: function () {
        return ["SERVICE", "PROPERTY_SERVICE", "PACKAGE"].includes(this.bookingType);
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
    required: function () {
      return ["PROPERTY", "PROPERTY_SERVICE", "PACKAGE"].includes(this.bookingType);
    },
    index: true
  },
  reviewGiven: {
    type: Boolean,
    default: false,
    index: true
  },

  checkOut: {
    type: Date,
    required: function () {
      return ["PROPERTY", "PROPERTY_SERVICE", "PACKAGE"].includes(this.bookingType);
    },
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

  walletAmountApplied: {
    type: Number,
    default: 0
  },

  onlinePayableAmount: {
    type: Number,
    default: 0
  },

  paymentMethod: {
    type: String,
    enum: ["ONLINE", "WALLET", "MIXED"],
    default: "ONLINE"
  },

  walletRefunded: {
    type: Boolean,
    default: false
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
      referenceId: mongoose.Schema.Types.ObjectId, // propertyId or serviceId
      refundAmount: {
        type: Number,
        default: 0
      },
      retainedAmount: {
        type: Number,
        default: 0
      },
      payoutReleaseStatus: {
        type: String,
        enum: ["PENDING", "RELEASED"],
        default: "PENDING"
      },
      payoutReleaseDate: Date,
      payoutReleasedAt: Date
    }
  ],

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
  pendingReason: {
    type: String,
    enum: [
      "payment_pending",
      "payment_failed",
      "approval_pending",
      "user_abandoned",
      "verification_pending",
      "system_error",
      "expired"
    ],
    default: "payment_pending"
  },

  pendingExpiredAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
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

  cancellationReason: {
    type: String,
    enum: ["OWNER_TAKING_TOO_LONG", "CHANGED_MY_MIND", "PROVIDER_ACCEPTANCE_TIMEOUT", "OTHER"]
  },

  acceptanceDeadline: {
    type: Date,
    index: true
  },

  autoCancelledAt: Date,

  customCancellationReason: {
    type: String
  },

  refundAmount: {
    type: Number,
    default: 0
  },

  refundPercentage: Number,

  refundStatus: {
    type: String,
    enum: ["pending", "processed", "failed"],
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
  },

  isCheckInNotified: {
    type: Boolean,
    default: false
  },

  invoiceUrl: {
    type: String
  },
  invoiceUrlAr: {
    type: String
  }

}, { timestamps: true });

/* ========================
   INDEXES
======================== */

bookingSchema.index({ property: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ bookingStatus: 1 });

module.exports = mongoose.model("Booking", bookingSchema);