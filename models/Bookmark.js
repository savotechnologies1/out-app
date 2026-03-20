const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
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

    type: {
      type: String,
      enum: ["PROPERTY", "SERVICE"],
      required: true
    },

    isDeleted: {
      type: Boolean,
      default: false
    }

  },
  { timestamps: true }
);

bookmarkSchema.index(
  { user: 1, property: 1 },
  { unique: true, partialFilterExpression: { property: { $exists: true, $ne: null } } }
);

bookmarkSchema.index(
  { user: 1, service: 1 },
  { unique: true, partialFilterExpression: { service: { $exists: true, $ne: null } } }
);

module.exports = mongoose.model("Bookmark", bookmarkSchema);