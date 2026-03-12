const mongoose = require("mongoose");

const propertiesSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String },
    category: { type: mongoose.Schema.Types.ObjectId },
    address: {
      fullAddress: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
      lat: Number,
      lng: Number,
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
    status: { type: String },
    isDeleted: { type: Boolean, default: false },
    is_completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Properties", propertiesSchema);
