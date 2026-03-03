const mongoose = require("mongoose");

const featureSchema = new mongoose.Schema(
  {
    feature: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feature", featureSchema);
