const mongoose = require("mongoose");
const attachmentSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },

    publicId: {
      type: String,
      default: null,
    },

    fileName: String,

    originalName: String,

    mimeType: String,

    fileSize: Number,

    duration: {
      type: Number,
      default: null,
    },

    thumbnail: {
      type: String,
      default: null,
    },

    width: {
      type: Number,
      default: null,
    },

    height: {
      type: Number,
      default: null,
    },
  },
  { _id: false }
);
const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    messageType: {
      type: String,
      enum: [
        "TEXT",
        "IMAGE",
        "AUDIO",
        "VIDEO",
        "MIXED",
        "DOCUMENT"
      ],
      default: "TEXT",
    },

    message: {
      type: String,
      default: null,
    },

    attachments: [attachmentSchema],

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/*  Very Important for pagination performance */
messageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);