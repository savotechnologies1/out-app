const mongoose = require("mongoose");

const taxSchema = new mongoose.Schema(
{
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },

  isActive: {
    type: Boolean,
    default: true
  },

  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  }

},
{ timestamps: true }
);

taxSchema.index(
  { isActive: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      isDeleted: false
    }
  }
);

module.exports = mongoose.model("Tax", taxSchema);