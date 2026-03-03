const mongoose = require("mongoose");

const categoriesSchema = new mongoose.Schema(
  {
    category: { type: String },
    image: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categoriesSchema);
