const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    salutation: { type: String },
    firstName: { type: String },
    userId: { type: String },
    lastName: { type: String },
    role: { type: String, default: "service_user" },
    email: { type: String },
    profile: { type: String },
    phone: { type: String },
    fcmToken: {
      type: String
    },
    // ✅ Correct address object
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
      country: { type: String },
      latitude: { type: String },
      longitude: { type: String },
    },
    description: {
      type: String
    },
    phoneCode: { type: String },
    OTP: { type: String },
    docs: { type: String },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    tokens: { type: [String] },
    isApproved: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    rejectReason: { type: String, default: null },
    googleId: { type: String, default: null },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },
  },
  { timestamps: true }
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string", $ne: "" },
    },
  }
);
userSchema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model("ServiceUser", userSchema);
