const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const adminSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    email: {
      type: String,
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "inactive"],
    },
    roles: {
      type: String,
    },
    gender: {
      type: String,
    },
    dob: {
      type: Date,
    },
    password: {
      type: String,
    },
    otp: {
      type: String,
    },
    tokens: {
      type: [String],
    },
    token: {
      type: String,
    },
    isDeleted: { type: Boolean, default: false },
    fcmToken: {
      type: String
    },
    phone: {
      type: String,
    },
    profileImage: {
      type: String,
      default: null
    },
  },
  {
    timestamps: true,
  }
);

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

adminSchema.methods.matchPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);
