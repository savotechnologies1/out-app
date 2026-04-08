const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    salutation: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    userId: { type: String },
    email: { type: String },
    role: { type: String, default: "user" },
    profile: { type: String },
    phone: { type: String },
    phoneCode: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    zipCode: { type: String },
    country: { type: String },
    OTP: { type: String },
    fcmToken: {
      type: String
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    tokens: { type: [String] },
    googleId: {
      type: String,
      sparse: true   // 🔥 important
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model("User", userSchema);
