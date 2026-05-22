const mongoose = require("mongoose");

const commissionSchema = new mongoose.Schema(
  {
    // GLOBAL or CATEGORY based commission
    scope: {
      type: String,
      enum: ["GLOBAL", "CATEGORY"],
      required: true,
      index: true,
    },

    // Commission apply type
    type: {
      type: String,
      enum: ["SERVICE", "PROPERTY"],
      required: true,
      index: true,
    },

    // Main category
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    // Service category
    serviceCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceCategory",
      default: null,
      index: true,
    },

    // Specific service
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
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
  {
    scope: 1,
    type: 1,
    categoryId: 1,
    serviceCategoryId: 1,
    serviceId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      isDeleted: false,
    },
  }
);

module.exports = mongoose.model("Commission", commissionSchema);