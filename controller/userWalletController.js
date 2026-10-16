const mongoose = require("mongoose");
const GiftCard = require("../models/GiftCard");
const UserWallet = require("../models/UserWallet");
const UserWalletTransaction = require("../models/UserWalletTransaction");
const catchAsyncError = require("../functions/catchAsyncError");

/**
 * @desc Get authenticated user's wallet
 * @route GET /api/user/getWallet
 * @access Private (User)
 */
const getUserWallet = catchAsyncError(async (req, res) => {
  const userId = req.user._id;

  let wallet = await UserWallet.findOne({ user: userId });

  // Automatically initialize user wallet with 0 balance if it doesn't exist yet
  if (!wallet) {
    wallet = await UserWallet.create({
      user: userId,
      balance: 0,
      currency: "SAR",
      isActive: true,
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      _id: wallet._id,
      user: wallet.user,
      balance: wallet.balance,
      currency: wallet.currency,
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    },
  });
});

/**
 * @desc Get user wallet transaction history
 * @route GET /api/user/getWalletTransactions
 * @access Private (User)
 */
const getUserWalletTransactions = catchAsyncError(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10 } = req.query;

  const pageNumber = Math.max(1, parseInt(page, 10));
  const limitNumber = Math.max(1, parseInt(limit, 10));
  const skip = (pageNumber - 1) * limitNumber;

  const filter = { user: userId };

  const total = await UserWalletTransaction.countDocuments(filter);

  const transactions = await UserWalletTransaction.find(filter)
    .populate("giftCardId", "code title amount targetType")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNumber)
    .lean();

  return res.status(200).json({
    success: true,
    data: transactions,
    page: pageNumber,
    limit: limitNumber,
    total,
    totalPages: Math.ceil(total / limitNumber),
  });
});

/**
 * @desc Redeem a Gift Card and add money into UserWallet
 * @route POST /api/user/redeemGiftCard
 * @access Private (User)
 */
const redeemGiftCard = catchAsyncError(async (req, res) => {
  const userId = req.user._id;
  const { code, amount } = req.body;

  if (!code || typeof code !== "string" || !code.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid gift card code",
    });
  }

  const formattedCode = code.trim().toUpperCase();

  // Find active, non-deleted gift card
  const giftCard = await GiftCard.findOne({
    code: formattedCode,
    isDelete: false,
  });

  if (!giftCard) {
    return res.status(404).json({
      success: false,
      message: "Gift card not found or invalid",
    });
  }

  if (!giftCard.isActive) {
    return res.status(400).json({
      success: false,
      message: "This gift card is currently inactive",
    });
  }

  const now = new Date();

  // Check start date if scheduled for future
  if (giftCard.startDate && now < new Date(giftCard.startDate)) {
    return res.status(400).json({
      success: false,
      message: "This gift card is not active yet",
    });
  }

  // Check expiry date
  if (giftCard.expiryDate && now > new Date(giftCard.expiryDate)) {
    return res.status(400).json({
      success: false,
      message: "This gift card has expired",
    });
  }

  // Check target audience: ALL vs SPECIFIC_USER
  if (giftCard.targetType === "SPECIFIC_USER") {
    if (
      !giftCard.applicableUser ||
      giftCard.applicableUser.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "This gift card is reserved for a specific user and cannot be redeemed by your account",
      });
    }
  }

  // Check if user has entered an amount: if entered, ensure it matches the gift card amount
  if (amount !== undefined && amount !== null && amount !== "") {
    const inputAmount = Number(amount);
    if (isNaN(inputAmount) || inputAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount entered",
      });
    }
    if (inputAmount !== giftCard.amount) {
      return res.status(400).json({
        success: false,
        message: `Entered amount (${inputAmount}) does not match the gift card value (${giftCard.amount})`,
      });
    }
  }

  // Check if user has already redeemed this gift card (One-time claim rule)
  const alreadyRedeemed = giftCard.usedBy.some(
    (redemption) => redemption.user.toString() === userId.toString()
  );

  if (alreadyRedeemed) {
    return res.status(400).json({
      success: false,
      message: "You have already redeemed this gift card. Each user can add money only once per gift card.",
    });
  }

  // Check usage limit if configured
  if (giftCard.usageLimit && giftCard.usedCount >= giftCard.usageLimit) {
    return res.status(400).json({
      success: false,
      message: "Gift card redemption limit has been reached",
    });
  }

  // Atomic reservation to prevent race conditions & double-claims
  const atomicUpdateCondition = {
    _id: giftCard._id,
    isActive: true,
    isDelete: false,
    "usedBy.user": { $ne: userId },
  };

  if (giftCard.usageLimit) {
    atomicUpdateCondition.usedCount = { $lt: giftCard.usageLimit };
  }

  const updatedGiftCard = await GiftCard.findOneAndUpdate(
    atomicUpdateCondition,
    {
      $inc: { usedCount: 1 },
      $push: {
        usedBy: {
          user: userId,
          amount: giftCard.amount,
          redeemedAt: new Date(),
        },
      },
    },
    { new: true }
  );

  if (!updatedGiftCard) {
    return res.status(400).json({
      success: false,
      message: "You have already redeemed this gift card or it is no longer available",
    });
  }

  // Ensure UserWallet exists
  let wallet = await UserWallet.findOne({ user: userId });
  if (!wallet) {
    wallet = await UserWallet.create({
      user: userId,
      balance: 0,
      currency: giftCard.currency || "SAR",
      isActive: true,
    });
  }

  // Credit user wallet balance
  const previousBalance = wallet.balance || 0;
  const newBalance = Number((previousBalance + giftCard.amount).toFixed(2));
  wallet.balance = newBalance;
  await wallet.save();

  // Record transaction in UserWalletTransaction
  const transaction = await UserWalletTransaction.create({
    wallet: wallet._id,
    user: userId,
    type: "credit",
    transactionType: "gift_card_redeem",
    amount: giftCard.amount,
    balanceAfter: newBalance,
    currency: wallet.currency,
    giftCardId: giftCard._id,
    giftCardCode: giftCard.code,
    status: "completed",
    description: `Redeemed gift card: ${giftCard.code}`,
  });

  // Attach transaction reference to gift card redemption entry for auditability
  await GiftCard.updateOne(
    { _id: giftCard._id, "usedBy.user": userId },
    { $set: { "usedBy.$.walletTransactionId": transaction._id } }
  );

  return res.status(200).json({
    success: true,
    message: `Gift card redeemed successfully! ${giftCard.amount} ${wallet.currency} has been added to your wallet.`,
    data: {
      amountAdded: giftCard.amount,
      wallet: {
        _id: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
      },
      transaction: {
        _id: transaction._id,
        type: transaction.type,
        transactionType: transaction.transactionType,
        amount: transaction.amount,
        balanceAfter: transaction.balanceAfter,
        currency: transaction.currency,
        giftCardCode: transaction.giftCardCode,
        createdAt: transaction.createdAt,
      },
    },
  });
});

/**
 * @desc Get all gift cards available to the user (universal + assigned to them)
 * @route GET /api/user/getAvailableGiftCards
 * @access Private (User)
 */
const getAvailableGiftCards = catchAsyncError(async (req, res) => {
  const userId = req.user._id;
  const { status = "available", page, limit } = req.query;
  const now = new Date();

  // Base filter: active, non-deleted, and valid date window
  const baseFilter = {
    isActive: true,
    isDelete: false,
    $and: [
      {
        $or: [
          { targetType: "ALL" },
          { targetType: "SPECIFIC_USER", applicableUser: userId },
        ],
      },
      {
        $or: [
          { startDate: null },
          { startDate: { $exists: false } },
          { startDate: { $lte: now } },
        ],
      },
      {
        $or: [
          { expiryDate: null },
          { expiryDate: { $exists: false } },
          { expiryDate: { $gte: now } },
        ],
      },
    ],
  };

  const statusLower = (status || "").toLowerCase();

  if (statusLower === "available") {
    // Only cards not yet redeemed by this user
    baseFilter["usedBy.user"] = { $ne: userId };
    // And if usageLimit is set, usedCount must be less than usageLimit
    baseFilter.$expr = {
      $or: [
        { $eq: [{ $ifNull: ["$usageLimit", null] }, null] },
        { $lt: ["$usedCount", "$usageLimit"] },
      ],
    };
  } else if (statusLower === "redeemed") {
    // Only cards redeemed by this user
    baseFilter["usedBy.user"] = userId;
  }
  // If status === 'all', return all eligible cards (both available & redeemed)

  let query = GiftCard.find(baseFilter).sort({ createdAt: -1 });

  if (page && limit) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;
    query = query.skip(skip).limit(limitNum);
  }

  const giftCards = await query.lean();

  // Format cards to include user-friendly flags
  const formattedCards = giftCards.map((card) => {
    const userRedemption = (card.usedBy || []).find(
      (r) => r.user.toString() === userId.toString()
    );
    const isRedeemed = Boolean(userRedemption);

    return {
      _id: card._id,
      code: card.code,
      title: card.title || "Gift Card",
      description: card.description || "",
      amount: card.amount,
      currency: card.currency || "SAR",
      targetType: card.targetType,
      isAssignedToYou: card.targetType === "SPECIFIC_USER",
      isRedeemed,
      redeemedAt: userRedemption ? userRedemption.redeemedAt : null,
      startDate: card.startDate || null,
      expiryDate: card.expiryDate || null,
      createdAt: card.createdAt,
    };
  });

  const total = await GiftCard.countDocuments(baseFilter);

  return res.status(200).json({
    success: true,
    message: formattedCards.length
      ? "Gift cards fetched successfully"
      : "No gift cards available",
    total,
    data: formattedCards,
  });
});

module.exports = {
  getUserWallet,
  getUserWalletTransactions,
  redeemGiftCard,
  getAvailableGiftCards,
  getUserGiftCards: getAvailableGiftCards,
};
