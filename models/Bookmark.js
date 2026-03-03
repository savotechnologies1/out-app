const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema(
    {
        property: { type: mongoose.Schema.Types.ObjectId },
        createdBy: { type: mongoose.Schema.Types.ObjectId },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Bookmark", bookmarkSchema);
