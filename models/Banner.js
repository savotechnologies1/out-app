const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    bannerType: {
      type: String,
      enum: ["OFFER", "PROMOTION", "ANNOUNCEMENT"],
      default: "OFFER",
    },
    title: {
      type: String, 
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Banner", bannerSchema);