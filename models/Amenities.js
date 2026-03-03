const mongoose = require("mongoose");

const amenitiesSchema = new mongoose.Schema(
  {
    name: { type: String },
    icon: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Amenities", amenitiesSchema);
