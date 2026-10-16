const mongoose = require("mongoose");
const crypto = require("crypto");
const GiftCard = require("../models/GiftCard");
const User = require("../models/User");
const UserWallet = require("../models/UserWallet");
const UserWalletTransaction = require("../models/UserWalletTransaction");
const catchAsyncError = require("../functions/catchAsyncError");

/**
 * Generate a cryptographically secure unique alphanumeric code between 8 and 16 characters
 * @param {number} length - Desired code length between 8 and 16 (default: 12)
 * @returns {Promise<string>}
 */
const generateUniqueGiftCardCode = async (length = 12) => {
  const codeLength = Math.min(16, Math.max(8, parseInt(length, 10) || 12));
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const maxAttempts = 15;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    let result = "";
    const randomBytes = crypto.randomBytes(codeLength);
    for (let i = 0; i < codeLength; i++) {
      result += chars[randomBytes[i] % chars.length];
    }

    const existing = await GiftCard.findOne({
      code: result,
      isDelete: false,
    });

    if (!existing) {
      return result;
    }
  }

  // Fallback collision resolution
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return (rand + ts).slice(0, codeLength);
};

/**
 * @desc Create a new Gift Card (Admin)
 * If `code` is omitted, an 8 to 16 alphanumeric unique code is automatically generated.
 * @route POST /api/admin/createGiftCard
 * @access Private (Admin)
 */
const createGiftCard = catchAsyncError(async (req, res) => {
  const {
    codeLength,
    amount,
    title,
    description,
    currency = "SAR",
    targetType = "ALL",
    applicableUser,
    usageLimit,
    startDate,
    expiryDate,
    isActive = true,
  } = req.body;

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Gift card amount must be a positive number greater than 0",
    });
  }

  const normalizedTargetType = targetType ? targetType.toUpperCase() : "ALL";
  if (!["ALL", "SPECIFIC_USER"].includes(normalizedTargetType)) {
    return res.status(400).json({
      success: false,
      message: "targetType must be either 'ALL' (everyone) or 'SPECIFIC_USER' (particular user)",
    });
  }

  let validApplicableUserId = null;
  if (normalizedTargetType === "SPECIFIC_USER") {
    if (!applicableUser) {
      return res.status(400).json({
        success: false,
        message: "applicableUser is required when targetType is 'SPECIFIC_USER'",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(applicableUser)) {
      return res.status(400).json({
        success: false,
        message: "Invalid applicableUser ID",
      });
    }

    const recipientExists = await User.findById(applicableUser);
    if (!recipientExists) {
      return res.status(404).json({
        success: false,
        message: "Designated user not found",
      });
    }

    validApplicableUserId = recipientExists._id;
  }

  if (startDate && expiryDate && new Date(expiryDate) <= new Date(startDate)) {
    return res.status(400).json({
      success: false,
      message: "Expiry date must be after start date",
    });
  }

  // Admin cannot manually specify code - always randomly generated unique 8 to 16 alphanumeric code
  const targetLength = codeLength
    ? Math.min(16, Math.max(8, parseInt(codeLength, 10) || 12))
    : 12;
  const formattedCode = await generateUniqueGiftCardCode(targetLength);

  const giftCard = await GiftCard.create({
    code: formattedCode,
    amount: numericAmount,
    title: title ? title.trim() : undefined,
    description: description ? description.trim() : undefined,
    currency: currency.trim().toUpperCase(),
    targetType: normalizedTargetType,
    applicableUser: validApplicableUserId,
    usageLimit: usageLimit ? Math.max(1, parseInt(usageLimit, 10)) : undefined,
    startDate: startDate ? new Date(startDate) : undefined,
    expiryDate: expiryDate ? new Date(expiryDate) : undefined,
    isActive: Boolean(isActive),
    createdBy: req.user?._id || null,
  });

  return res.status(201).json({
    success: true,
    message: "Gift card created successfully",
    data: giftCard,
  });
});

/**
 * @desc Get all Gift Cards with pagination and filters (Admin)
 * @route GET /api/admin/getAllGiftCards
 * @access Private (Admin)
 */
const getAllGiftCards = catchAsyncError(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    targetType,
    status,
  } = req.query;

  const pageNumber = Math.max(1, parseInt(page, 10));
  const limitNumber = Math.max(1, parseInt(limit, 10));
  const skip = (pageNumber - 1) * limitNumber;

  const filter = {
    isDelete: false,
  };

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");
    filter.$or = [
      { code: searchRegex },
      { title: searchRegex },
      { description: searchRegex },
    ];
  }

  if (targetType && ["ALL", "SPECIFIC_USER"].includes(targetType.toUpperCase())) {
    filter.targetType = targetType.toUpperCase();
  }

  const now = new Date();
  if (status) {
    const s = status.toUpperCase();
    if (s === "ACTIVE") {
      filter.isActive = true;
      filter.$and = [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }] },
      ];
    } else if (s === "INACTIVE") {
      filter.isActive = false;
    } else if (s === "EXPIRED") {
      filter.expiryDate = { $lt: now };
    }
  }

  const total = await GiftCard.countDocuments(filter);

  const giftCards = await GiftCard.find(filter)
    .populate("applicableUser", "firstName lastName email phone")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNumber)
    .lean();

  return res.status(200).json({
    success: true,
    message: "Gift cards fetched successfully",
    data: giftCards,
    page: pageNumber,
    limit: limitNumber,
    total,
    totalPages: Math.ceil(total / limitNumber),
  });
});

/**
 * @desc Get Gift Card Details by ID (Admin)
 * @route GET /api/admin/getGiftCardById/:id
 * @access Private (Admin)
 */
const getGiftCardById = catchAsyncError(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid gift card ID",
    });
  }

  const giftCard = await GiftCard.findOne({
    _id: id,
    isDelete: false,
  })
    .populate("applicableUser", "firstName lastName email phone")
    .populate("usedBy.user", "firstName lastName email phone")
    .lean();

  if (!giftCard) {
    return res.status(404).json({
      success: false,
      message: "Gift card not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Gift card details fetched successfully",
    data: giftCard,
  });
});

/**
 * @desc Update a Gift Card (Admin)
 * @route PATCH /api/admin/updateGiftCard/:id
 * @access Private (Admin)
 */
const updateGiftCard = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    startDate,
    expiryDate,
    usageLimit,
    isActive,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid gift card ID",
    });
  }

  const giftCard = await GiftCard.findOne({ _id: id, isDelete: false });
  if (!giftCard) {
    return res.status(404).json({
      success: false,
      message: "Gift card not found",
    });
  }

  if (title !== undefined) giftCard.title = title.trim();
  if (description !== undefined) giftCard.description = description.trim();
  if (isActive !== undefined) giftCard.isActive = Boolean(isActive);

  if (usageLimit !== undefined) {
    giftCard.usageLimit = usageLimit ? Math.max(1, parseInt(usageLimit, 10)) : null;
  }

  const newStartDate = startDate !== undefined ? (startDate ? new Date(startDate) : null) : giftCard.startDate;
  const newExpiryDate = expiryDate !== undefined ? (expiryDate ? new Date(expiryDate) : null) : giftCard.expiryDate;

  if (newStartDate && newExpiryDate && newExpiryDate <= newStartDate) {
    return res.status(400).json({
      success: false,
      message: "Expiry date must be after start date",
    });
  }

  if (startDate !== undefined) giftCard.startDate = newStartDate;
  if (expiryDate !== undefined) giftCard.expiryDate = newExpiryDate;

  await giftCard.save();

  return res.status(200).json({
    success: true,
    message: "Gift card updated successfully",
    data: giftCard,
  });
});

/**
 * @desc Soft delete a Gift Card (Admin)
 * @route DELETE /api/admin/deleteGiftCard/:id
 * @access Private (Admin)
 */
const deleteGiftCard = catchAsyncError(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid gift card ID",
    });
  }

  const giftCard = await GiftCard.findOneAndUpdate(
    { _id: id, isDelete: false },
    { isDelete: true, isActive: false },
    { new: true }
  );

  if (!giftCard) {
    return res.status(404).json({
      success: false,
      message: "Gift card not found or already deleted",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Gift card deleted successfully",
  });
});

/**
 * @desc View User Wallet & transactions by Admin
 * @route GET /api/admin/getUserWallet/:userId
 * @access Private (Admin)
 */
const getUserWalletByAdmin = catchAsyncError(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID",
    });
  }

  let wallet = await UserWallet.findOne({ user: userId }).lean();
  if (!wallet) {
    wallet = {
      user: userId,
      balance: 0,
      currency: "SAR",
      isActive: true,
    };
  }

  const transactions = await UserWalletTransaction.find({ user: userId })
    .populate("giftCardId", "code title amount targetType")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return res.status(200).json({
    success: true,
    data: {
      wallet,
      transactions,
    },
  });
});

module.exports = {
  createGiftCard,
  getAllGiftCards,
  getGiftCardById,
  updateGiftCard,
  deleteGiftCard,
  getUserWalletByAdmin,
  generateUniqueGiftCardCode,
};
