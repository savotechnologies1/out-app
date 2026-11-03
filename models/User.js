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
    otpSentAt: { type: Date },
    fcmToken: {
      type: String
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    tokens: { type: [String] },
    googleId: {
      type: String,
      sparse: true
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },

    /* =====================================================
       Identity Verification (YAKEEN)
    ====================================================== */

    identityType: {
      type: String,
      enum: ["SAUDI", "RESIDENT", "VISITOR"],
      default: null,
    },

    identityNumber: {
      type: String,
      default: null,
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    identityVerificationStatus: {
      type: String,
      enum: [
        "NOT_VERIFIED",
        "PENDING",
        "VERIFIED",
        "FAILED",
        "REJECTED",
      ],
      default: "NOT_VERIFIED",
    },

    verificationMethod: {
      type: String,
      enum: ["YAKEEN", "MANUAL"],
      default: null,
    },

    verificationService: {
      type: String,
      enum: [
        "SaudiByNin",
        "NonSaudiByIqama",
        "MANUAL",
      ],
      default: null,
    },

    verificationProvider: {
      type: String,
      default: "YAKEEN",
    },

    verificationReference: {
      type: String,
      default: null,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    /* =====================================================
       Legal Name Returned By YAKEEN (personBasicInfo)
    ====================================================== */

    // Arabic names
    legalFirstNameAr: {
      type: String,
      default: null,
    },

    legalFatherNameAr: {
      type: String,
      default: null,
    },

    legalGrandFatherNameAr: {
      type: String,
      default: null,
    },

    legalFamilyNameAr: {
      type: String,
      default: null,
    },

    legalFullNameAr: {
      type: String,
      default: null,
    },

    // English transliterated names
    legalFirstNameEn: {
      type: String,
      default: null,
    },

    legalFatherNameEn: {
      type: String,
      default: null,
    },

    legalGrandFatherNameEn: {
      type: String,
      default: null,
    },

    legalFamilyNameEn: {
      type: String,
      default: null,
    },

    legalFullNameEn: {
      type: String,
      default: null,
    },

    // Backward-compatible combined fields
    legalFirstName: {
      type: String,
      default: null,
    },

    legalMiddleName: {
      type: String,
      default: null,
    },

    legalLastName: {
      type: String,
      default: null,
    },

    legalFullName: {
      type: String,
      default: null,
    },

    verificationResponse: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
    },

    /* =====================================================
       Visitor Manual Verification Documents
    ====================================================== */

    identityDocuments: [
      {
        documentType: {
          type: String,
          enum: [
            "PASSPORT",
            "VISA",
            "NATIONAL_ID",
            "DRIVING_LICENSE",
            "OTHER",
          ],
        },

        documentNumber: {
          type: String,
          default: null,
        },

        documentUrl: {
          type: String,
          required: true,
        },

        originalFileName: {
          type: String,
          default: null,
        },

        mimeType: {
          type: String,
          default: null,
        },

        uploadedAt: {
          type: Date,
          default: Date.now,
        },

        status: {
          type: String,
          enum: [
            "PENDING",
            "APPROVED",
            "REJECTED",
          ],
          default: "PENDING",
        },

        reviewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Admin",
          default: null,
        },

        reviewedAt: {
          type: Date,
          default: null,
        },

        rejectReason: {
          type: String,
          default: null,
        },
      },
    ],

    /* =====================================================
       Manual Verification Audit
    ====================================================== */

    adminVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    adminVerifiedAt: {
      type: Date,
      default: null,
    },

    adminRejectReason: {
      type: String,
      default: null,
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

module.exports = mongoose.model("User", userSchema);
