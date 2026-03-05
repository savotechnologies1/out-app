const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    chatType: {
      type: String,
      enum: ["SERVICE_CHAT", "USER_SUPPORT", "SERVICE_SUPPORT"],
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    serviceUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceUser",
      default: null,
      index: true,
    },

    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true,
    },

    lastMessage: {
      type: String,
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },

    lastMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    userUnreadCount: {
      type: Number,
      default: 0,
    },

    serviceUserUnreadCount: {
      type: Number,
      default: 0,
    },

    adminUnreadCount: {
      type: Number,
      default: 0,
    },

    isClosed: {
      type: Boolean,
      default: false,
      index: true,
    },

    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

/*  Prevent duplicate conversations */
conversationSchema.index(
  { chatType: 1, userId: 1, serviceUserId: 1, adminId: 1 },
  { unique: true }
);

/*  Fast query by participants */
conversationSchema.index({ userId: 1, serviceUserId: 1 });
conversationSchema.index({ userId: 1, adminId: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);