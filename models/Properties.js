const mongoose = require("mongoose");

const generateCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let code = "";

  for (let i = 0; i < 8; i++) {
    code += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }

  return code;
};

const generateUniqueShareCode = async (Model) => {
  let code;
  let exists = true;

  while (exists) {
    code = generateCode();

    exists = await Model.findOne({
      shareCode: code,
    });
  }

  return code;
};

const propertiesSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String },
     shareCode: {
      type: String,
      unique: true,
      index: true,
    },
    category: { type: mongoose.Schema.Types.ObjectId },
    address: {
      fullAddress: String,
      city: String,
      state: String,
      country: String,
      pincode: String,

      location: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point"
        },
        coordinates: {
          type: [Number]
        }
      }
    },
    area: { type: Number },
    mainAmenities: [{ type: String }],
    bedRoom: { type: Object },
    pool: {
      gradient: { type: Object },
      dimension: { type: Object },
      additional: [{ type: String }],
    },
    restRoom: { type: Object },
    propertyAmenities: { type: [mongoose.Schema.Types.ObjectId] },
    propertyFeatures: { type: [mongoose.Schema.Types.ObjectId] },
    description: { type: String },
    media: {
      mainImage: [{ type: String }],
      bedroom: [{ type: String }],
      pool: [{ type: String }],
      bathroom: [{ type: String }],
    },

    count: { type: Number },
    price: { type: Number },
    maxGuests: {
      type: Number,
      default: 2
    },
    document: { type: String, required: true },
    experienceCount: Number,
    isRecommended: {
      type: Boolean,
      default: false,
      index: true
    },
    policies: {
      checkInTime: { type: String },
      checkOutTime: { type: String },

      additionalPolicies: [{ type: String }],

      houseRules: {
        petsAllowed: { type: Boolean, default: false },
        smokingAllowed: { type: Boolean, default: false },
        partiesAllowed: { type: Boolean, default: false }
      }
    },
    cancellationPolicy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CancellationPolicy",
      required: true
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    approvedAt: Date,
    rejectionReason: String,
    status: { type: String },
    isDeleted: { type: Boolean, default: false },
    is_completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);
propertiesSchema.index(
  { "address.location": "2dsphere" },
  {
    partialFilterExpression: {
      "address.location.coordinates": { $exists: true }
    }
  }
);
propertiesSchema.pre("save", async function () {

  if (!this.shareCode) {
    this.shareCode = await generateUniqueShareCode(this.constructor);
  }

});
propertiesSchema.index({ maxGuests: 1 });
propertiesSchema.index({ is_completed: 1, isDeleted: 1 });
module.exports = mongoose.model("Properties", propertiesSchema);
