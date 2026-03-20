const mongoose = require("mongoose");

const platformFeeSchema = new mongoose.Schema(
{
 
  feeType: {
    type: String,
    enum: ["PERCENTAGE", "FLAT"],
    required: true
  },

  value: {
    type: Number,
    required: true,
    min: 0
  },

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

platformFeeSchema.index(
  { isActive: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      isDeleted: false
    }
  }
);

module.exports = mongoose.model("PlatformFee", platformFeeSchema);