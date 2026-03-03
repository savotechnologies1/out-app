const mongoose = require("mongoose");

const Schema = new mongoose.Schema(
  {
    templateEvent: {
      type: String,
      unique: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    subject: {
      type: String,
    },
    mailVariables: {
      type: String,
    },
    htmlBody: {
      type: String,
    },
    textBody: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("mailTemplates", Schema);
