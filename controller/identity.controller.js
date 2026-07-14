const User = require("../models/User");
const identityService = require("../services/identity.service");
const catchAsyncError = require("../functions/catchAsyncError");
const { checkValidations } = require("../functions/checkValidation");
const { validationResult } = require("express-validator");
const { createLog } = require("../functions/common");
const mongoose = require("mongoose");

const identityLog = createLog("identity_controller_log");

/* =====================================================
   POST /identity/verify — User Verify Identity
====================================================== */

const verifyIdentity = catchAsyncError(async (req, res, next) => {
  const userId = req.user._id;

  // Check if already verified
  const existingUser = await User.findById(userId)
    .select("identityVerificationStatus identityType")
    .lean();

  if (!existingUser) {
    return res.status(404).json({ message: "User not found" });
  }

  if (existingUser.identityVerificationStatus === "VERIFIED") {
    return res.status(400).json({
      message: "Identity already verified",
    });
  }

  if (existingUser.identityVerificationStatus === "PENDING") {
    return res.status(400).json({
      message:
        "Identity verification is already pending. Please wait for admin approval.",
    });
  }

  const identityType = req.body.identityType;
  const identityNumber = req.body.identityNumber;
  const dateOfBirth = req.body.dateOfBirth;

  /* =====================================================
     VISITOR Flow — Document Upload
  ====================================================== */

  if (identityType === "VISITOR") {
    const documentType = req.body.documentType;
    const file = req.file;

    if (!documentType) {
      return res.status(400).json({
        message: "Document type is required for visitor verification",
      });
    }

    const validDocTypes = [
      "PASSPORT",
      "VISA",
      "DRIVING_LICENSE",
      "OTHER",
    ];

    if (!validDocTypes.includes(documentType)) {
      return res.status(400).json({
        message: `Document type must be one of: ${validDocTypes.join(", ")}`,
      });
    }

    if (!file) {
      return res.status(400).json({
        message: "Document file is required for visitor verification",
      });
    }

    if (!identityNumber) {
      return res.status(400).json({
        message: "Identity number is required",
      });
    }

    const user = await identityService.verifyVisitor({
      userId,
      identityNumber,
      dateOfBirth,
      documentType,
      file,
    });

    return res.status(200).json({
      message:
        "Document uploaded successfully. Verification is pending admin approval.",
      data: {
        identityVerificationStatus: user.identityVerificationStatus,
        identityType: user.identityType,
      },
    });
  }

  /* =====================================================
     SAUDI / RESIDENT Flow — YAKEEN Verification
  ====================================================== */

  // Validate fields for YAKEEN flow
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).json({
      message: checkValid.errors.msg,
    });
  }

  if (!["SAUDI", "RESIDENT"].includes(identityType)) {
    return res.status(400).json({
      message: "Identity type must be SAUDI, RESIDENT, or VISITOR",
    });
  }

  try {
    const user = await identityService.verifySaudiOrResident({
      userId,
      identityType,
      identityNumber,
      dateOfBirth,
    });
    console.log("last----------------------------------------")
    return res.status(200).send({
      message: "Identity verified successfully",
      data: {
        identityVerificationStatus: user?.identityVerificationStatus,
        identityType: user?.identityType,
        verifiedAt: user?.verifiedAt,
        verificationMethod: user?.verificationMethod,
        legalFullName: user?.legalFullName,
      },
    });
  } catch (error) {
    identityLog.error(
      `YAKEEN verification failed for userId=${userId}: ${error.message}`
    );

    try {
      // Mark as FAILED in DB
      await User.findByIdAndUpdate(userId, {
        $set: {
          identityType,
          identityNumber,
          dateOfBirth: (() => {
            try {
              if (!dateOfBirth) return null;
              if (dateOfBirth instanceof Date) {
                return isNaN(dateOfBirth.getTime()) ? null : dateOfBirth;
              }
              const str = String(dateOfBirth).trim();
              if (!str || str.toLowerCase() === "null" || str.toLowerCase() === "undefined") {
                return null;
              }
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(str)) return new Date(str + "-01");
              const d = new Date(str);
              return isNaN(d.getTime()) ? null : d;
            } catch (e) {
              return null;
            }
          })(),
          identityVerificationStatus: "FAILED",
          verificationMethod: "YAKEEN",
          verificationService:
            identityType === "SAUDI" ? "SaudiByNin" : "NonSaudiByIqama",
        },
      });
    } catch (dbError) {
      identityLog.error(
        `Failed to mark identity verification as FAILED in DB for userId=${userId}: ${dbError.message}`
      );
    }

    return res.status(400).json({
      message: error.message || "Identity verification failed",
    });
  }
});

/* =====================================================
   GET /identity/status — Get Verification Status
====================================================== */

const getVerificationStatus = catchAsyncError(async (req, res, next) => {
  const userId = req.user._id;

  const user = await identityService.getVerificationStatus(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.status(200).json({
    data: {
      identityVerificationStatus: user?.identityVerificationStatus,
      identityType: user?.identityType,
      verifiedAt: user?.verifiedAt,
      verificationMethod: user?.verificationMethod,
      legalFullName: user?.legalFullName,
    },
  });
});

/* =====================================================
   Admin — GET /admin/identity/pending
====================================================== */

const getPendingVerifications = catchAsyncError(async (req, res, next) => {
  const { page, limit, search, identityType, status } = req.query;

  const result = await identityService.getPendingVerifications({
    page,
    limit,
    search,
    identityType,
    status,
  });

  return res.status(200).json({
    success: true,
    message: "Pending verifications fetched successfully",
    ...result,
  });
});

/* =====================================================
   Admin — GET /admin/identity/:userId
====================================================== */

const getVerificationDetails = catchAsyncError(async (req, res, next) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Please enter valid user Id" });
  }

  const user = await identityService.getVerificationDetails(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.status(200).json({
    message: "Verification details fetched successfully",
    data: user,
  });
});

/* =====================================================
   Admin — PATCH /admin/identity/:userId/approve
====================================================== */

const approveVisitor = catchAsyncError(async (req, res, next) => {
  const { userId } = req.params;
  const adminId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Please enter valid user Id" });
  }

  const targetUser = await User.findById(userId)
    .select("identityVerificationStatus identityType")
    .lean();

  if (!targetUser) {
    return res.status(404).json({ message: "User not found" });
  }

  if (targetUser.identityVerificationStatus === "VERIFIED") {
    return res.status(400).json({
      message: "User is already verified",
    });
  }

  if (targetUser.identityType !== "VISITOR") {
    return res.status(400).json({
      message: "Only visitor verifications can be manually approved",
    });
  }

  identityLog.info(
    `Admin approval: userId=${userId}, adminId=${adminId}`
  );

  const user = await identityService.approveVisitor({
    userId,
    adminId,
  });

  return res.status(200).json({
    message: "Visitor identity approved successfully",
    data: {
      identityVerificationStatus: user?.identityVerificationStatus,
      verificationMethod: user?.verificationMethod,
      adminVerifiedAt: user?.adminVerifiedAt,
    },
  });
});

/* =====================================================
   Admin — PATCH /admin/identity/:userId/reject
====================================================== */

const rejectVisitor = catchAsyncError(async (req, res, next) => {
  const { userId } = req.params;
  const adminId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Please enter valid user Id" });
  }

  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).json({
      message: checkValid.errors.msg,
    });
  }

  const { reason } = req.body;

  const targetUser = await User.findById(userId)
    .select("identityVerificationStatus identityType")
    .lean();

  if (!targetUser) {
    return res.status(404).json({ message: "User not found" });
  }

  if (targetUser.identityType !== "VISITOR") {
    return res.status(400).json({
      message: "Only visitor verifications can be manually rejected",
    });
  }

  identityLog.info(
    `Admin rejection: userId=${userId}, adminId=${adminId}, reason=${reason}`
  );

  const user = await identityService.rejectVisitor({
    userId,
    adminId,
    reason,
  });

  return res.status(200).json({
    message: "Visitor identity rejected",
    data: {
      identityVerificationStatus: user?.identityVerificationStatus,
      adminRejectReason: user?.adminRejectReason,
    },
  });
});

module.exports = {
  verifyIdentity,
  getVerificationStatus,
  getPendingVerifications,
  getVerificationDetails,
  approveVisitor,
  rejectVisitor,
};
