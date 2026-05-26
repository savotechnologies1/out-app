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

const serviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceUser" },

    name: { type: String, required: true },
    shareCode: {
      type: String,
      unique: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceCategory",
    },
    oldPrice: {
      type: Number,
      required: true
    },
    discountPercent: {
      type: Number,
      default: 0
    },
    instantBooking: {
      type: Boolean,
      default: false
    },
    price: {
      type: Number,
      required: true
    },
    duration: Number,

    priceType: {
      type: String,
      enum: ["per_person", "flat"]
    },
    // NEW
    maxPersons: {
      type: Number,
      default: 1,
    },

    // NEW
    policies: [
      {
        type: String,
      },
    ],
    document: {
      type: String,
      required: true
    },
    description: {
      type: String
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    approvedAt: Date,
    rejectionReason: String,
    workingDays: [{
      type: String,
      enum: [
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
      ]
    }],

    workingHours: {
      start: String,
      end: String
    },

    media: {
      images: [String]
    },

    location: {
      city: String,
      state: String,
      country: String,

      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point"
        },
        coordinates: {
          type: [Number],
          required: true
        }
      }
    },
    cancellationPolicy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CancellationPolicy",
      required: true
    },
    isActive: { type: Boolean, default: true },

    isDeleted: {
      type: Boolean,
      default: false
    }

  },
  { timestamps: true }
);

serviceSchema.index({ "location.coordinates": "2dsphere" });

serviceSchema.index({ workingDays: 1 });
serviceSchema.index({ isActive: 1, isDeleted: 1 });

serviceSchema.pre("save", async function () {

  if (!this.shareCode) {
    this.shareCode = await generateUniqueShareCode(this.constructor);
  }

});

module.exports = mongoose.model("Service", serviceSchema);