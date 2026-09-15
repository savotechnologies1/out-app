const mongoose = require("mongoose");

const recentlyViewedSchema = new mongoose.Schema(

  {
    /* =========================
       USER
    ========================= */

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /* =========================
       PROPERTY
    ========================= */

    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Properties",
      default: null,
      index: true
    },

    /* =========================
       SERVICE
    ========================= */

    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
      index: true
    },

    /* =========================
       OPTIONAL TRACKING
    ========================= */

    viewCount: {
      type: Number,
      default: 1
    },

    lastViewedAt: {
      type: Date,
      default: Date.now,
      index: true
    }

  },

  {
    timestamps: true
  }

);

/* =========================
   INDEXES
========================= */

// One property per user
recentlyViewedSchema.index(
  { user: 1, property: 1 },
  { unique: true, partialFilterExpression: { property: { $exists: true, $ne: null } } }
);

// One service per user
recentlyViewedSchema.index(
  { user: 1, service: 1 },
  { unique: true, partialFilterExpression: { service: { $exists: true, $ne: null } } }
);

// Fast recent fetch
recentlyViewedSchema.index({
  user: 1,
  lastViewedAt: -1
});

// Optional cleanup queries
recentlyViewedSchema.index({
  createdAt: -1
});

module.exports = mongoose.model(
  "RecentlyViewed",
  recentlyViewedSchema
);