const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // 🔔 Who receives notification
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "receiverModel",
    },

    receiverModel: {
      type: String,
      required: true,
      enum: ["User", "ServiceUser", "Admin"],
    },

    // 👤 Who triggered it (optional)
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "senderModel",
    },

    senderModel: {
      type: String,
      enum: ["User", "ServiceUser", "Admin"],
    },

    // 🧾 Content
    title: {
      type: String,
      required: true,
    },

    body: {
      type: String,
      required: true,
    },

    // 📂 Type (VERY IMPORTANT)
    type: {
      type: String,
      enum: [
        "CHAT",
        "BOOKING",
        "PAYMENT",
        "REFUND",
        "REVIEW",
        "SYSTEM",
      ],
      required: true,
    },

    // 🔗 Reference (for deep linking)
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    referenceType: {
      type: String,
      enum: ["Conversation", "Booking", "Payment", "Refund"],
    },

    // 📦 Extra data
    data: {
      type: Object,
      default: {},
    },

    // ✅ Status
    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
    },

    // ❌ Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================
   INDEXES (IMPORTANT)
========================= */
notificationSchema.index({ receiverId: 1, receiverModel: 1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);