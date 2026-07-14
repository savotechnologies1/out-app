const User = require("../models/User");
const yakeenService = require("./yakeen.service");
const { createLog } = require("../functions/common");

const identityLog = createLog("identity_service_log");

/* =====================================================
   Safe Date Parser — handles YYYY-MM and YYYY-MM-DD
====================================================== */

const parseDateOfBirth = (dob) => {
  try {
    if (!dob) return null;
    if (dob instanceof Date) {
      return isNaN(dob.getTime()) ? null : dob;
    }
    const str = String(dob).trim();
    if (!str || str.toLowerCase() === "null" || str.toLowerCase() === "undefined") {
      return null;
    }
    // YYYY-MM format → append -01
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(str)) {
      return new Date(str + "-01");
    }
    // Already a full date or ISO string
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch (e) {
    return null;
  }
};

/* =====================================================
   Verify Saudi or Resident via YAKEEN
====================================================== */

const verifySaudiOrResident = async ({
  userId,
  identityType,
  identityNumber,
  dateOfBirth,
}) => {
  const verificationService =
    identityType === "SAUDI" ? "SaudiByNin" : "NonSaudiByIqama";

  console.log(`[Service START] verifySaudiOrResident for userId=${userId}, type=${identityType}`);
  identityLog.info(
    `Verification request: userId=${userId}, type=${identityType}`
  );

  // Call YAKEEN
  let yakeenResponse;
  try {
    console.log(`[Service YAKEEN Call] Calling YAKEEN verifyIdentity for userId=${userId}`);
    identityLog.info(`[Service YAKEEN Call] Calling YAKEEN verifyIdentity for userId=${userId}`);
    
    yakeenResponse = await yakeenService.verifyIdentity({
      identityType,
      identityNumber,
      dateOfBirth,
    });
    
    console.log(`[Service YAKEEN Response] Success for userId=${userId}`);
    identityLog.info(
      `Verification response received: userId=${userId}, type=${identityType}`
    );
  } catch (error) {
    console.error(`[Service YAKEEN Error] Failed for userId=${userId}:`, error.message);
    identityLog.error(`[Service YAKEEN Error] Failed for userId=${userId}: ${error.message}`);
    throw error;
  }

  // Extract legal name fields from YAKEEN response
  const legalFirstName =
    yakeenResponse?.firstName ||
    yakeenResponse?.englishFirstName ||
    yakeenResponse?.firstNameEn ||
    null;

  const legalMiddleName =
    yakeenResponse?.secondName ||
    yakeenResponse?.englishSecondName ||
    yakeenResponse?.middleNameEn ||
    null;

  const legalLastName =
    yakeenResponse?.lastName ||
    yakeenResponse?.englishLastName ||
    yakeenResponse?.lastNameEn ||
    yakeenResponse?.familyName ||
    null;

  const nameParts = [legalFirstName, legalMiddleName, legalLastName].filter(
    Boolean
  );
  const legalFullName = nameParts.length > 0 ? nameParts.join(" ") : null;

  const verificationReference =
    yakeenResponse?.referenceNumber ||
    yakeenResponse?.requestId ||
    yakeenResponse?.transactionId ||
    null;

  // Update user
  const updateData = {
    identityType,
    identityNumber,
    dateOfBirth: parseDateOfBirth(dateOfBirth),
    identityVerificationStatus: "VERIFIED",
    verificationMethod: "YAKEEN",
    verificationService,
    verificationProvider: "YAKEEN",
    verifiedAt: new Date(),
    legalFirstName,
    legalMiddleName,
    legalLastName,
    legalFullName,
    verificationResponse: yakeenResponse,
    verificationReference: verificationReference
      ? String(verificationReference)
      : null,
  };

  try {
    console.log(`[Service DB Update] Updating user database record to VERIFIED for userId=${userId}`);
    identityLog.info(`[Service DB Update] Updating user database record to VERIFIED for userId=${userId}`);

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    ).select("-verificationResponse -tokens -OTP");

    console.log(`[Service DB Update] Success for userId=${userId}`);
    identityLog.info(`[Service DB Update] Success for userId=${userId}`);

    return user;
  } catch (dbError) {
    console.error(`[Service DB Update Error] Failed for userId=${userId}:`, dbError.message);
    identityLog.error(`[Service DB Update Error] Failed for userId=${userId}: ${dbError.message}`);
    throw dbError;
  }
};

/* =====================================================
   Handle Visitor Upload Verification
====================================================== */

const verifyVisitor = async ({
  userId,
  identityNumber,
  dateOfBirth,
  documentType,
  file,
}) => {
  console.log(`[Service START] verifyVisitor for userId=${userId}, docType=${documentType}`);
  identityLog.info(
    `Visitor verification request: userId=${userId}, docType=${documentType}`
  );

  const documentEntry = {
    documentType,
    documentUrl: file.filename,
    originalFileName: file.originalname,
    mimeType: file.mimetype,
    uploadedAt: new Date(),
    status: "PENDING",
  };

  const updateData = {
    identityType: "VISITOR",
    identityNumber,
    dateOfBirth: parseDateOfBirth(dateOfBirth),
    identityVerificationStatus: "PENDING",
    verificationMethod: "MANUAL",
    verificationService: "MANUAL",
    verificationProvider: "YAKEEN",
  };

  try {
    console.log(`[Service DB Update] Updating user database record to PENDING for userId=${userId}`);
    identityLog.info(`[Service DB Update] Updating user database record to PENDING for userId=${userId}`);

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: updateData,
        $push: { identityDocuments: documentEntry },
      },
      { new: true }
    ).select("-verificationResponse -tokens -OTP");

    console.log(`[Service DB Update] Success for userId=${userId}`);
    identityLog.info(`[Service DB Update] Success for userId=${userId}`);

    return user;
  } catch (dbError) {
    console.error(`[Service DB Update Error] Failed for userId=${userId}:`, dbError.message);
    identityLog.error(`[Service DB Update Error] Failed for userId=${userId}: ${dbError.message}`);
    throw dbError;
  }
};

/* =====================================================
   Get Verification Status
====================================================== */

const getVerificationStatus = async (userId) => {
  try {
    const user = await User.findById(userId)
      .select(
        "identityVerificationStatus identityType verifiedAt verificationMethod legalFullName"
      )
      .lean();

    return user;
  } catch (error) {
    console.error(`[Service getVerificationStatus Error] Failed for userId=${userId}:`, error.message);
    throw error;
  }
};

/* =====================================================
   Admin — Get Pending Verifications
====================================================== */

const getPendingVerifications = async ({
  page = 1,
  limit = 10,
  search,
  identityType,
  status,
}) => {
  const pageNum = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 10;
  const skip = (pageNum - 1) * pageSize;

  const matchStage = {};

  // Default: only PENDING status unless explicitly filtered
  if (status) {
    matchStage.identityVerificationStatus = status;
  } else {
    matchStage.identityVerificationStatus = "PENDING";
  }

  if (identityType) {
    matchStage.identityType = identityType;
  }

  if (search && search !== "undefined") {
    matchStage.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { identityNumber: { $regex: search, $options: "i" } },
    ];
  }

  try {
    const total = await User.countDocuments(matchStage);

    const users = await User.find(matchStage)
      .select(
        "firstName lastName email phone identityType identityNumber identityVerificationStatus identityDocuments createdAt"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    const totalPages = Math.ceil(total / pageSize);

    return {
      data: users,
      page: pageNum,
      limit: pageSize,
      total,
      totalPages,
      previousDisabled: pageNum <= 1,
      nextPage: pageNum + 1,
      previousPage: pageNum - 1,
      nextDisabled: pageNum >= totalPages,
    };
  } catch (error) {
    console.error("[Service getPendingVerifications Error]:", error.message);
    throw error;
  }
};

/* =====================================================
   Admin — Get Verification Details
====================================================== */

const getVerificationDetails = async (userId) => {
  try {
    const user = await User.findById(userId)
      .select("+verificationResponse")
      .select("-tokens -OTP -password")
      .lean();

    return user;
  } catch (error) {
    console.error(`[Service getVerificationDetails Error] Failed for userId=${userId}:`, error.message);
    throw error;
  }
};

/* =====================================================
   Admin — Approve Visitor
====================================================== */

const approveVisitor = async ({ userId, adminId }) => {
  identityLog.info(
    `Admin approval: userId=${userId}, adminId=${adminId}`
  );

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          identityVerificationStatus: "VERIFIED",
          verificationMethod: "MANUAL",
          adminVerifiedBy: adminId,
          adminVerifiedAt: new Date(),
          verifiedAt: new Date(),
          adminRejectReason: null,
        },
      },
      { new: true }
    ).select("-verificationResponse -tokens -OTP");

    return user;
  } catch (error) {
    console.error(`[Service approveVisitor Error] Failed for userId=${userId}:`, error.message);
    throw error;
  }
};

/* =====================================================
   Admin — Reject Visitor
====================================================== */

const rejectVisitor = async ({ userId, adminId, reason }) => {
  identityLog.info(
    `Admin rejection: userId=${userId}, adminId=${adminId}, reason=${reason}`
  );

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          identityVerificationStatus: "REJECTED",
          adminVerifiedBy: adminId,
          adminVerifiedAt: new Date(),
          adminRejectReason: reason,
        },
      },
      { new: true }
    ).select("-verificationResponse -tokens -OTP");

    return user;
  } catch (error) {
    console.error(`[Service rejectVisitor Error] Failed for userId=${userId}:`, error.message);
    throw error;
  }
};

module.exports = {
  verifySaudiOrResident,
  verifyVisitor,
  getVerificationStatus,
  getPendingVerifications,
  getVerificationDetails,
  approveVisitor,
  rejectVisitor,
};
