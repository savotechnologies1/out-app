const mongoose = require("mongoose");

const bankDetailsSchema = new mongoose.Schema(
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceUser",
    required: true,
    index: true
  },

  accountHolderName: {
    type: String,
    required: true
  },

  accountNumber: {
    type: String,
    required: true
  },

  bankName: {
    type: String,
    required: true
  },

  ifscCode: String,
  iban: String,
  swiftCode: String,

  isPrimary: {
    type: Boolean,
    default: false
  },

  isDeleted: {
    type: Boolean,
    default: false
  }

},
{ timestamps: true }
);

module.exports = mongoose.model("BankDetails", bankDetailsSchema);