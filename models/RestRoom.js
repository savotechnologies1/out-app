const mongoose = require("mongoose");

const restRoomSchema = new mongoose.Schema(
  {
    name: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RestRoom", restRoomSchema);
