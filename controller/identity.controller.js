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

  console.log("=== START IDENTITY VERIFICATION ===");
  console.log("Headers:", JSON.stringify(req.headers));
  console.log("Body:", JSON.stringify(req.body));
  console.log("User:", JSON.stringify(req.user));
  console.log("File:", req.file ? JSON.stringify({
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  }) : "No file");

  identityLog.info("=== START IDENTITY VERIFICATION ===");
  identityLog.info(`Headers: ${JSON.stringify(req.headers)}`);
  identityLog.info(`Body: ${JSON.stringify(req.body)}`);
  identityLog.info(`User: ${JSON.stringify(req.user)}`);
  identityLog.info(`File: ${req.file ? JSON.stringify({
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  }) : "No file"}`);

  // Check if already verified
  let existingUser;
  try {
    existingUser = await User.findById(userId)
      .select("identityVerificationStatus identityType")
      .lean();
  } catch (error) {
    return res.status(500).json({
      message: "Database query failed",
      error: error.message,
    });
  }

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

  console.log(`Identity Type check: ${identityType}`);
  identityLog.info(`Identity Type check: ${identityType}`);

  /* =====================================================
     VISITOR Flow — Document Upload
  ====================================================== */

  if (identityType === "VISITOR") {
    console.log("Entering VISITOR verification flow");
    identityLog.info("Entering VISITOR verification flow");

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

    try {
      console.log(`Calling verifyVisitor service for userId=${userId}`);
      identityLog.info(`Calling verifyVisitor service for userId=${userId}`);

      const user = await identityService.verifyVisitor({
        userId,
        identityNumber,
        dateOfBirth,
        documentType,
        file,
      });

      console.log(`Visitor verification success for userId=${userId}`);
      identityLog.info(`Visitor verification success for userId=${userId}`);

      return res.status(200).json({
        message:
          "Document uploaded successfully. Verification is pending admin approval.",
        data: {
          identityVerificationStatus: user?.identityVerificationStatus,
          identityType: user?.identityType,
        },
      });
    } catch (error) {
      console.error(`Visitor verification error for userId=${userId}:`, error);
      identityLog.error(`Visitor verification error for userId=${userId}: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: error.message || "Visitor verification failed",
      });
    }
  }

  /* =====================================================
     SAUDI / RESIDENT Flow — YAKEEN Verification
  ====================================================== */

  // Validate fields for YAKEEN flow
  const errors = validationResult(req);
  let checkValid;
  try {
    checkValid = await checkValidations(errors);
  } catch (err) {
    return res.status(400).json({ message: "Validation check failed" });
  }

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
    return res.status(200).json({
      success: true,
      message: "Identity verified successfully",
      data: {
        identityVerificationStatus: user?.identityVerificationStatus,
        identityType: user?.identityType,
        verifiedAt: user?.verifiedAt,
        verificationMethod: user?.verificationMethod,
        legalFullName: user?.legalFullName,
        legalFirstNameAr: user?.legalFirstNameAr,
        legalFirstNameEn: user?.legalFirstNameEn,
        legalMiddleNameAr: user?.legalMiddleNameAr,
        legalMiddleNameEn: user?.legalMiddleNameEn,
        legalLastNameAr: user?.legalLastNameAr,
        legalLastNameEn: user?.legalLastNameEn,
        legalGrandFatherNameEn: user?.legalGrandFatherNameEn,
        legalFamilyNameAr: user?.legalFamilyNameAr,
        legalGrandFatherNameAr: user?.legalGrandFatherNameAr,
        verificationProvider: user?.verificationProvider,
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

  let user;
  try {
    user = await identityService.getVerificationStatus(userId);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch verification status",
      error: error.message,
    });
  }

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

  let result;
  try {
    result = await identityService.getPendingVerifications({
      page,
      limit,
      search,
      identityType,
      status,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch pending verifications",
      error: error.message,
    });
  }

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

  let user;
  try {
    user = await identityService.getVerificationDetails(userId);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch verification details",
      error: error.message,
    });
  }

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

  let targetUser;
  try {
    targetUser = await User.findById(userId)
      .select("identityVerificationStatus identityType")
      .lean();
  } catch (error) {
    return res.status(500).json({
      message: "Database query failed",
      error: error.message,
    });
  }

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

  let user;
  try {
    user = await identityService.approveVisitor({
      userId,
      adminId,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to approve visitor verification",
      error: error.message,
    });
  }

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
  let checkValid;
  try {
    checkValid = await checkValidations(errors);
  } catch (err) {
    return res.status(400).json({ message: "Validation check failed" });
  }

  if (checkValid.type === "error") {
    return res.status(400).json({
      message: checkValid.errors.msg,
    });
  }

  const { reason } = req.body;

  let targetUser;
  try {
    targetUser = await User.findById(userId)
      .select("identityVerificationStatus identityType")
      .lean();
  } catch (error) {
    return res.status(500).json({
      message: "Database query failed",
      error: error.message,
    });
  }

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

  let user;
  try {
    user = await identityService.rejectVisitor({
      userId,
      adminId,
      reason,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to reject visitor verification",
      error: error.message,
    });
  }

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
