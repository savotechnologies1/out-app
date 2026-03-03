const mongoose = require("mongoose");

const commissionSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["GLOBAL", "CATEGORY"],
      required: true,
      index: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    commissionType: {
      type: String,
      enum: ["PERCENTAGE", "FLAT"],
      required: true,
    },

    value: {
      type: Number,
      required: true,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

commissionSchema.index(
  { scope: 1, categoryId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      isDeleted: false,
    },
  }
);

module.exports = mongoose.model("Commission", commissionSchema);