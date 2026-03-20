const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
{
  name: {
    type: String,
    required: true,
    trim: true
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceUser",
    required: true,
    index: true
  },

  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Properties",
    required: true,
    index: true
  },

  services: [{
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true
    },
    price: {
      type: Number,
      required: true
    }
  }],

  basePrice: {
    type: Number,
    default: 0
  },

  description: {
    type: String,
    trim: true
  },
 
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: {
      type: [Number]
    }
  },
approvalStatus: {
  type: String,
  enum: ["pending", "approved", "rejected"],
  default: "pending"
},
approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
approvedAt: Date,
rejectionReason: String,
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  }

},
{ timestamps: true }
);

packageSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Package", packageSchema);