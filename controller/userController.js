const User = require("../models/User");
const ServiceUser = require("../models/ServiceUser");
const {
  generateRandomOTP,
  generateRandomId,
  codeRem,
} = require("../functions/common");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Properties = require("../models/Properties");
const Booking = require("../models/Booking");
const Bookmark = require("../models/Bookmark");
const Availability = require("../models/Availability");
const { getDatesBetween, getTimeAgo, getJoinedStatus } = require("../utils/date");
const catchAsyncError = require("../functions/catchAsyncError");
const { checkValidations } = require("../functions/checkValidation");
const { validationResult } = require("express-validator");
const Category = require("../models/Category");
const moment = require("moment");
const { authenticaOTP } = require("../functions/authentica");
const {
  isOtpValid,
  issueOtp,
  sendCooldownResponse,
} = require("../functions/otpCooldown");
const { createTokenAndCharge } = require("../functions/payment");
const Banner = require("../models/Banner");
const { createCharge, createTokenForCard } = require("../functions/payment");
const Coupon = require("../models/Coupon");
const PlatformFee = require("../models/PlatformFee");
const Tax = require("../models/Tax");
const Service = require("../models/Service");
const { OAuth2Client } = require("google-auth-library");
const Review = require("../models/Review");
const path = require("path");
const ServiceCategory = require("../models/ServiceCategory");
const RecentlyViewed = require("../models/RecentlyViewed");
const CancellationPolicy = require("../models/CancellationPolicy");
const {
  getUserWallet,
  getUserWalletTransactions,
  redeemGiftCard,
  getAvailableGiftCards,
} = require("./userWalletController");


const userLogin = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const { mobile, mobileCode, fcmToken } = req.body;

  const user = await User.findOne({
    phone: `${mobileCode}${mobile}`,
  });

  if (!user) {
    return res.status(400).send({ message: "User not found" });
  }

  if (!user.isActive) {
    return res.status(403).json({
      message: "Your account is suspended please contact support",
    });
  }
  if (user.isDeleted) {
    return res.status(403).send({ message: "Your account is permanent deleted." })
  }
  const otp = generateRandomOTP();
  const otpResult = await issueOtp({
    Model: User,
    account: user,
    otp,
    fcmToken,
    sendOtp: (code) => authenticaOTP(code, user.email, user.phone),
  });

  if (otpResult.cooldownActive) {
    return sendCooldownResponse(
      res,
      otpResult.account,
      otpResult.retryAfterSeconds
    );
  }

  return res.status(200).json({
    success: true,
    data: { id: user._id },
    message: "OTP sent successfully",
  });
});


// authenticaOTP("1234", "", "+917049866959")


const userSignUp = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  // ✅ Validation check
  if (checkValid?.type === "error") {
    return res.status(400).send({
      message: checkValid.errors?.msg || "Validation failed",
    });
  }

  const { salutation, firstName, lastName, email, mobile, mobileCode } =
    req.body;

  const phone = `${mobileCode}${mobile}`;

  // ✅ Required mobile check
  if (!mobile || !mobileCode) {
    return res.status(400).send({
      message: "Mobile number is required",
    });
  }

  // ✅ Validate email only if provided
  if (email && email.trim() !== "") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).send({
        message: "Invalid email format",
      });
    }
  }

  // ✅ Check mobile duplicate
  const mobileExist = await User.findOne({ phone });
  if (mobileExist) {
    return res.status(400).send({
      message: "Mobile number already exists",
    });
  }

  // ✅ Check email duplicate (only if provided)
  if (email && email.trim() !== "") {
    const emailExist = await User.findOne({ email });
    if (emailExist) {
      return res.status(400).send({
        message: "Email already exists",
      });
    }
  }
  // Generate ID
  const randomId = generateRandomId();
  const otp = generateRandomOTP();
  // Create user
  await authenticaOTP(otp, email, phone);
  const user = await User.create({
    salutation,
    firstName,
    lastName,
    userId: `UID-${randomId}`,
    email: email && email.trim() !== "" ? email : null, // ✅ optional email
    phone,
    phoneCode: mobileCode,
    OTP: otp,
    otpSentAt: new Date(),
    otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    otpHistory: [],
  });

  return res.status(201).json({
    success: true,
    data: {
      id: user._id,
      mobile: user.phone,
    },
    message: "User registered successfully.",
  });
});

const userVerifyOTP = catchAsyncError(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Please enter valid Id" });
  }

  const errors = validationResult(req);

  const checkValid = await checkValidations(errors);
  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const { otp } = req.body;

  const user = await User.findOne(
    { _id: req.params.id, isDeleted: false },
    {
      phone: 1,
      OTP: 1,
      otpSentAt: 1,
      otpExpiresAt: 1,
      otpHistory: 1,
      isVerified: 1,
      phoneCode: 1,
      role: 1,
      email: 1,
    }
  ).lean(true);

  if (!user) return res.status(400).send({ message: "User not found" });

  if (!isOtpValid(user, otp)) {
    return res.status(400).send({
      message: "Invalid or expired OTP",
    });
  }

  let userData = {
    _id: user._id,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };

  const token = jwt.sign({ user: userData }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });

  let obj = {
    $push: { tokens: token },
    $set: { isVerified: true },
    $unset: { OTP: "", otpSentAt: "", otpExpiresAt: "", otpHistory: "" },
  };

  if (user.isVerified) {
    obj = {
      $push: { tokens: token },
      $unset: { OTP: "", otpSentAt: "", otpExpiresAt: "", otpHistory: "" },
    };
  }

  User.updateOne({ _id: user._id }, obj).then();

  return res.status(200).json({
    success: true,
    data: token,
    role: user.role,
    message: "OTP successfully verified",
  });
});


const client = new OAuth2Client();

const googleLogin = async (req, res) => {

  try {
    const { token, role, fcmToken } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google token required",
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_ANDROID_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload.email) {
      return res.status(400).json({
        success: false,
        message: "Google account email not found",
      });
    }

    const email = payload.email;
    const picture = payload.picture;
    const googleId = payload.sub;

    const Model = role === "service_user" ? ServiceUser : User;

    const user = await Model.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          firstName: payload.given_name || "",
          lastName: payload.family_name || "",
          profile: picture,
          googleId,
          authProvider: "google",
          isVerified: true,
          role: role === "service_user" ? "service_user" : "user",
        },
      },
      {
        new: true,
        upsert: true,
      }
    );

    if (fcmToken) {
      await Model.updateOne(
        { _id: user._id },
        {
          $set: { fcmToken: fcmToken },
        }
      );
    }
    const userData = {
      _id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    const jwtToken = jwt.sign(
      { user: userData },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    await Model.updateOne(
      { _id: user._id },
      {
        $push: { tokens: jwtToken },
      }
    );

    return res.status(200).json({
      success: true,
      token: jwtToken,
      role: user.role,
      user,
      message: "Google login successful",
    });

  } catch (error) {
    console.error("Google Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Google login failed",
      error: error.message,
    });
  }
};


const getUser = catchAsyncError(async (req, res, next) => {
  let user = await User.findOne(
    { _id: req.user._id },
    {
      email: 1,
      role: 1,
      firstName: 1,
      lastName: 1,
      phone: 1,
      phoneCode: 1,
      profile: 1,
      isVerified: 1,
      identityNumber: 1,
      identityType: 1,
      verificationMethod: 1,
      verificationService: 1,
      identityVerificationStatus: 1,
      dateOfBirth: 1,
      verifiedAt: 1,
      legalFullNameAr: 1,
      legalFullNameEn: 1,
      legalFirstNameAr: 1,
      legalFamilyNameAr: 1,
      legalFirstNameEn: 1,
      legalFamilyNameEn: 1,
      legalGrandFatherNameAr: 1,
      legalGrandFatherNameEn: 1,
      identityDocuments: 1,
      verificationReference: 1,
      verificationProvider: 1,
    }
  ).lean(true);

  if (!user) {
    return res.status(400).send({ message: "User not found" });
  }

  // ✅ Find service provider by phone
  const serviceProvider = await ServiceUser.findOne({
    phone: user.phone,
    isDeleted: false,
  }).lean();

  // ✅ Flags
  user.isServiceProvider = !!serviceProvider;

  // ✅ Approval status
  user.serviceProviderApprovalStatus =
    serviceProvider?.isApproved || null;

  // ✅ Mask phone
  user.phone = await codeRem(user.phone);

  return res.status(200).json({
    success: true, data: user,
    yakeen: {
      identityNumber: user.identityNumber,
      identityType: user.identityType,
      verificationMethod: user.verificationMethod,
      verificationService: user.verificationService,
      identityVerificationStatus: user.identityVerificationStatus,
      dateOfBirth: user.dateOfBirth,
      verifiedAt: user.verifiedAt,
      legalFullNameAr: user.legalFullNameAr,
      legalFullNameEn: user.legalFullNameEn,
      legalFirstNameAr: user.legalFirstNameAr,
      legalFamilyNameAr: user.legalFamilyNameAr,
      legalFirstNameEn: user.legalFirstNameEn,
      legalFamilyNameEn: user.legalFamilyNameEn,
      legalGrandFatherNameAr: user.legalGrandFatherNameAr,
      legalGrandFatherNameEn: user.legalGrandFatherNameEn,
      identityDocuments: user.identityDocuments,
      verificationReference: user.verificationReference,
      verificationProvider: user.verificationProvider
    }
  });
});


const resendOTP = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);
  if (checkValid.type === "error") {
    return res.status(400).send({
      success: false,
      data: null,
      message: checkValid.errors.msg,
    });
  }

  const { mobile, mobileCode, accountType } = req.body;
  const formattedMobile = String(mobile).startsWith("+")
    ? mobile
    : `${mobileCode}${mobile}`;
  const [user, serviceUser] = await Promise.all([
    User.findOne({ phone: formattedMobile }).lean(),
    ServiceUser.findOne({ phone: formattedMobile }).lean(),
  ]);

  let Model;
  let account;
  if (accountType === "service") {
    Model = ServiceUser;
    account = serviceUser;
  } else if (accountType === "user") {
    Model = User;
    account = user;
  } else if (user && serviceUser) {
    // Backward compatibility for older clients that don't send accountType.
    account = new Date(user.otpSentAt || 0) >= new Date(serviceUser.otpSentAt || 0)
      ? user
      : serviceUser;
    Model = account === user ? User : ServiceUser;
  } else if (user) {
    Model = User;
    account = user;
  } else {
    Model = ServiceUser;
    account = serviceUser;
  }

  if (!account) {
    return res.status(404).send({
      success: false,
      data: null,
      message: "User not found",
    });
  }

  const otpResult = await issueOtp({
    Model,
    account,
    otp: generateRandomOTP(),
    sendOtp: (code) => authenticaOTP(code, account.email, account.phone),
  });

  if (otpResult.cooldownActive) {
    return sendCooldownResponse(
      res,
      otpResult.account,
      otpResult.retryAfterSeconds
    );
  }

  return res.status(200).send({
    success: true,
    data: { id: account._id },
    message: "Resent OTP successfully",
  });
});

const logout = catchAsyncError(async (req, res, next) => {
  if (req?.headers?.authorization) {
    const { 1: authToken } = req.headers.authorization.split(" ");

    const decodeToken = jwt.decode(authToken);

    User.updateOne(
      { _id: decodeToken.user._id },
      { $pull: { tokens: authToken } }
    ).then();

    return res.status(200).json({
      success: true,
      message: "Logout Successfully",
    });
  }

  return res.status(400).send({
    message: "Token not found",
  });
});

const updateProfile = catchAsyncError(async (req, res, next) => {

  const files = { ...req.files };

  const userProfileFiles = files?.userProfile;

  /* ========================
     VALIDATION
  ======================== */

  const errors = validationResult(req);

  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {

    return res.status(400).send({
      message: checkValid.errors.msg,
    });

  }

  /* ========================
     PREPARE UPDATE OBJECT
  ======================== */

  const obj = {};

  if (req.body.firstName) {
    obj.firstName = req.body.firstName;
  }

  if (req.body.lastName) {
    obj.lastName = req.body.lastName;
  }

  /* ========================
     EMAIL CHECK
  ======================== */

  if (req.body.email) {

    const existingEmail = await User.findOne({
      email: req.body.email,
      _id: { $ne: req.user._id }
    });

    if (existingEmail) {

      return res.status(400).send({
        message: "Email already exists",
      });

    }

    obj.email = req.body.email;

  }

  /* ========================
     PHONE CHECK
  ======================== */

  if (req.body.mobile) {

    const fullPhone = `${req.body.mobileCode || ""}${req.body.mobile}`;

    const existingPhone = await User.findOne({
      phone: fullPhone,
      _id: { $ne: req.user._id }
    });

    if (existingPhone) {

      return res.status(400).send({
        message: "Phone number already exists",
      });

    }

    obj.phone = fullPhone;

  }

  if (req.body.mobileCode) {
    obj.phoneCode = req.body.mobileCode;
  }

  /* ========================
     PROFILE IMAGE
  ======================== */

  if (userProfileFiles && userProfileFiles.length) {

    obj.profile = userProfileFiles[0].filename;

  }

  /* ========================
     UPDATE USER
  ======================== */

  await User.updateOne(
    { _id: req.user._id },
    { $set: obj }
  );

  /* ========================
     RESPONSE
  ======================== */

  return res.status(200).json({
    success: true,
    message: "Profile updated successfully",
  });

});

const getCategory = catchAsyncError(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Please enter valid Id" });
  }

  let properties = await ServiceUser.aggregate([
    {
      $match: {
        isDeleted: false,
        category: new mongoose.Types.ObjectId(req.params.id),
      },
    },
  ]).lean(true);

  return res.status(200).json({
    success: true,
    data: properties,
    message: properties.length
      ? "Properties received successfully"
      : "No properties found",
  });
});

const addBooking = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  await Booking.create({
    bookingDate: new Date(moment().startOf("day")),
    time: req.body.time,
    notes: req?.body?.notes,
    price: req.body.price,
  });

  return res.status(200).json({ success: true, message: "Please verify OTP" });
});

const addBookMark = catchAsyncError(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Please enter valid Id" });
  }

  const data = await Bookmark.countDocuments({
    property: req.params.id,
    createdBy: req.user._id,
  });

  if (data) {
    return res.status(400).send({ message: "Bookmark already exists" });
  }

  await Bookmark.create({
    property: req.params.id,
    createdBy: req.user._id,
  });

  return res.status(200).json({ success: true, message: "Bookmark added successfully" });
});

const listBookMark = catchAsyncError(async (req, res, next) => {
  const data = await Bookmark.find({ createdBy: req.user._id }).lean(true);

  return res.status(200).json({
    success: true,
    data,
    message: data.length
      ? "Bookmarks received successfully"
      : "No bookmark found",
  });
});

const deleteBookmark = catchAsyncError(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).send({
      success: false,
      message: "Please enter valid Id",
    });
  }

  const deletedBookmark = await Bookmark.findByIdAndDelete(id);

  if (!deletedBookmark) {
    return res.status(404).send({
      success: false,
      message: "Bookmark not found",
    });
  }

  return res.status(200).send({
    success: true,
    message: "Bookmark deleted successfully",
  });
});


const testAuthentica = catchAsyncError(async (req, res, next) => {


  await authenticaOTP();

  return res.status(200).json({ success: true, message: "ok" });
});

const createPayment = catchAsyncError(async (req, res, next) => {

  const paymentUrl = await createCharge({
    tokenId: req.body.tokenId,
    amount: req.body.amount,
  });

  return res.status(200).json({ success: true, data: paymentUrl, message: "ok" });
})

const getAllProperties = async (req, res) => {
  try {
    const {
      search,
      city,
      state,
      country,
      category,
      minPrice,
      maxPrice,
      bedRoom,
      amenities,
      lat,
      lng,
      radius = 5,
      sortBy = "latest"
    } = req.query;

    let matchStage = {
      isDeleted: false,
      isActive: { $ne: false }
    };

    //  Search
    if (search) {
      matchStage.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "address.city": { $regex: search, $options: "i" } },
        { "address.state": { $regex: search, $options: "i" } }
      ];
    }

    //  Location filter
    if (city) matchStage["address.city"] = city;
    if (state) matchStage["address.state"] = state;
    if (country) matchStage["address.country"] = country;

    // 🏷 Category
    if (category) matchStage.category = category;

    // Price
    if (minPrice || maxPrice) {
      matchStage.price = {};
      if (minPrice) matchStage.price.$gte = Number(minPrice);
      if (maxPrice) matchStage.price.$lte = Number(maxPrice);
    }

    // 🛏 Bedroom
    if (bedRoom) {
      matchStage["bedRoom.count"] = Number(bedRoom);
    }

    //  Amenities
    if (amenities) {
      matchStage.propertyAmenities = {
        $in: amenities.split(",")
      };
    }

    let pipeline = [];

    // Distance Feature
    if (lat && lng) {
      pipeline.push({
        $addFields: {
          distance: {
            $multiply: [
              {
                $sqrt: {
                  $add: [
                    { $pow: [{ $subtract: ["$address.lat", Number(lat)] }, 2] },
                    { $pow: [{ $subtract: ["$address.lng", Number(lng)] }, 2] }
                  ]
                }
              },
              111
            ]
          }
        }
      });

      pipeline.push({
        $match: {
          ...matchStage,
          distance: { $lte: Number(radius) }
        }
      });
    } else {
      pipeline.push({ $match: matchStage });
    }

    // Sorting (MongoDB level)
    if (sortBy === "lowToHigh") {
      pipeline.push({ $sort: { price: 1 } });
    } else if (sortBy === "highToLow") {
      pipeline.push({ $sort: { price: -1 } });
    } else {
      pipeline.push({ $sort: { createdAt: -1 } });
    }

    const properties = await Properties.aggregate(pipeline);

    res.status(200).json({
      success: true,
      count: properties.length,
      data: properties
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const getPropertiesByCategory = catchAsyncError(async (req, res) => {
  const { category } = req.params;
  let { lastId, limit = 10 } = req.query;

  limit = Math.min(parseInt(limit) || 10, 20); // max 20

  if (!category) {
    return res.status(400).json({
      success: false,
      message: "Category is required"
    });
  }

  let categoryDoc;

  // Find category
  if (mongoose.Types.ObjectId.isValid(category)) {
    categoryDoc = await Category.findOne({
      _id: category,
      isDeleted: false
    }).lean();
  } else {
    categoryDoc = await Category.findOne({
      category: { $regex: new RegExp(`^${category}$`, "i") },
      isDeleted: false
    }).lean();
  }

  if (!categoryDoc) {
    return res.status(404).json({
      success: false,
      message: "Category not found"
    });
  }

  const propertyQuery = {
    category: categoryDoc._id,
    isDeleted: false,
    isActive: { $ne: false },
    is_completed: true,
    approvalStatus: "approved"
  };

  if (lastId && mongoose.Types.ObjectId.isValid(lastId)) {
    propertyQuery._id = { $lt: new mongoose.Types.ObjectId(lastId) };
  }

  let properties = await Properties.find(propertyQuery)
    .select("name price media.mainImage address.city maxGuests category createdAt")
    .populate({
      path: "category",
      select: "category image"
    })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = properties.length > limit;
  if (hasMore) properties.pop();

  const propertyIds = properties.map(p => p._id);

  const bookmarks = await Bookmark.find({
    user: req.user._id,
    property: { $in: propertyIds },
    isDeleted: false
  }).select("property").lean();

  const favoriteSet = new Set(
    bookmarks.map(b => b.property.toString())
  );

  properties = properties.map(property => ({
    ...property,
    isFavorite: favoriteSet.has(property._id.toString())
  }));

  return res.status(200).json({
    success: true,
    sectionTitle: `Top ${categoryDoc.category}`,
    categoryId: categoryDoc._id,
    lastId: properties.length ? properties[properties.length - 1]._id : null,
    hasMore,
    count: properties.length,
    data: properties
  });
});

const getHomeProperties = catchAsyncError(async (req, res) => {
  const { limit = 10 } = req.query;

  const data = await Category.aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: "properties",
        let: { categoryId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$category", "$$categoryId"] },
              isDeleted: false,
              isActive: { $ne: false },
              is_completed: true,
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: Number(limit) },
        ],
        as: "properties",
      },
    },
    { $match: { properties: { $ne: [] } } },
  ]);

  const formatted = {};

  data.forEach((item) => {
    formatted[`Top ${item.category}`] = item.properties;
  });

  res.status(200).json({
    success: true,
    data: formatted,
  });
});


const getDashboard = catchAsyncError(async (req, res) => {
  const { lastId } = req.query;

  const matchStage = {
    is_completed: true,
    isDeleted: false,
    isActive: { $ne: false },
    approvalStatus: "approved"
  };

  if (lastId && mongoose.Types.ObjectId.isValid(lastId)) {
    matchStage._id = { $lt: new mongoose.Types.ObjectId(lastId) };
  }

  const data = await Properties.aggregate([
    {
      $match: matchStage
    },

    {
      $sort: { createdAt: -1 }
    },

    // Category Lookup
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "categoryData"
      }
    },

    {
      $unwind: "$categoryData"
    },

    // Amenities Lookup
    {
      $lookup: {
        from: "amenities",
        localField: "propertyAmenities",
        foreignField: "_id",
        as: "propertyAmenities"
      }
    },

    // Features Lookup
    {
      $lookup: {
        from: "features",
        localField: "propertyFeatures",
        foreignField: "_id",
        as: "propertyFeatures"
      }
    },

    // Restroom Facilities Lookup
    {
      $lookup: {
        from: "restrooms",
        localField: "restRoom.facilities",
        foreignField: "_id",
        as: "facilityData"
      }
    },

    {
      $addFields: {
        "restRoom.facilities": "$facilityData"
      }
    },

    // Service User Lookup
    {
      $lookup: {
        from: "serviceusers",
        let: { userId: "$user" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$userId"]
              }
            }
          },
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              userId: 1,
              role: 1,
              email: 1,
              profile: 1,
              phone: 1
            }
          }
        ],
        as: "serviceUserData"
      }
    },

    {
      $unwind: {
        path: "$serviceUserData",
        preserveNullAndEmptyArrays: true
      }
    },

    // Bookmark Lookup
    {
      $lookup: {
        from: "bookmarks",
        let: { propertyId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$property", "$$propertyId"] },
                  {
                    $eq: [
                      "$user",
                      new mongoose.Types.ObjectId(req.user._id)
                    ]
                  },
                  { $eq: ["$isDeleted", false] }
                ]
              }
            }
          }
        ],
        as: "bookmarkData"
      }
    },

    // Add Favorite Field
    {
      $addFields: {
        isFavorite: {
          $cond: {
            if: { $gt: [{ $size: "$bookmarkData" }, 0] },
            then: true,
            else: false
          }
        }
      }
    },

    // Remove Bookmark Data
    {
      $project: {
        bookmarkData: 0,
        facilityData: 0
      }
    },

    // Group By Category
    {
      $group: {
        _id: "$categoryData._id",
        categoryName: { $first: "$categoryData.category" },
        properties: { $push: "$$ROOT" }
      }
    },

    // Limit 5 Properties Per Category
    {
      $project: {
        _id: 0,
        categoryId: "$_id",
        categoryName: 1,
        properties: { $slice: ["$properties", 5] }
      }
    }

  ]).allowDiskUse(true);

  // Pagination Cursor
  let nextCursor = null;

  if (data.length > 0) {
    const lastCategory = data[data.length - 1];

    const lastProperty =
      lastCategory.properties[lastCategory.properties.length - 1];

    nextCursor = lastProperty?._id || null;
  }

  return res.status(200).json({
    success: true,
    nextCursor,
    data
  });
});


const getUserBanners = async (req, res) => {
  try {
    const { type } = req.query;


    let filter = {};
    const allowedTypes = ["OFFER", "PROMOTION", "ANNOUNCEMENT"];

    if (type && !allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid banner type",
      });
    }
    if (type) {
      filter.bannerType = type;
    }

    const banners = await Banner.find(filter)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


const getPropertyDetail = catchAsyncError(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(200).json({
      success: true,
      data: null,
      message: "No property found",
    });
  }

  const data = (await Properties.aggregate([

    {
      $match: {
        isDeleted: false,
        isActive: { $ne: false },
        approvalStatus: "approved",
        _id: new mongoose.Types.ObjectId(req.params.id)
      }
    },

    // =====================================================
    // CATEGORY LOOKUP
    // =====================================================

    {
      $lookup: {
        from: "categories",
        let: { categoryId: "$category" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$categoryId"] },
                  { $eq: ["$isDeleted", false] }
                ]
              }
            }
          },
          {
            $project: {
              category: 1
            }
          }
        ],
        as: "categoryData"
      }
    },

    {
      $addFields: {
        category: { $arrayElemAt: ["$categoryData.category", 0] }
      }
    },

    {
      $project: {
        categoryData: 0
      }
    },

    // =====================================================
    // SERVICE USER LOOKUP
    // =====================================================

    {
      $lookup: {
        from: "serviceusers",
        let: { userId: "$user" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$userId"]
              }
            }
          },
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              userId: 1,
              role: 1,
              email: 1,
              profile: 1,
              phone: 1
            }
          }
        ],
        as: "serviceUserData"
      }
    },

    {
      $unwind: {
        path: "$serviceUserData",
        preserveNullAndEmptyArrays: true
      }
    },

    // =====================================================
    // CANCELLATION POLICY LOOKUP
    // =====================================================

    {
      $lookup: {
        from: "cancellationpolicies",
        let: { policyId: "$cancellationPolicy" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$policyId"]
              }
            }
          }
        ],
        as: "cancellationPolicyData"
      }
    },

    {
      $unwind: {
        path: "$cancellationPolicyData",
        preserveNullAndEmptyArrays: true
      }
    },

    {
      $addFields: {
        cancellationPolicy: "$cancellationPolicyData"
      }
    },

    {
      $project: {
        cancellationPolicyData: 0
      }
    },

    // =====================================================
    // BOOKMARK LOOKUP
    // =====================================================

    {
      $lookup: {
        from: "bookmarks",
        let: { propertyId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$property", "$$propertyId"] },
                  {
                    $eq: [
                      "$user",
                      new mongoose.Types.ObjectId(req.user._id)
                    ]
                  },
                  { $eq: ["$isDeleted", false] }
                ]
              }
            }
          }
        ],
        as: "bookmarkData"
      }
    },

    // =====================================================
    // ADD FAVORITE FLAG
    // =====================================================

    {
      $addFields: {
        isFavorite: {
          $cond: {
            if: { $gt: [{ $size: "$bookmarkData" }, 0] },
            then: true,
            else: false
          }
        }
      }
    },

    // =====================================================
    // CLEAN RESPONSE
    // =====================================================

    {
      $project: {
        bookmarkData: 0
      }
    }

  ]))[0];

  if (data) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const activeBookings = await Booking.find({
      property: req.params.id,
      isCancelled: { $ne: true },
      bookingStatus: { $in: ["confirmed"] },
      paymentStatus: { $ne: "failed" },
      pendingReason: { $nin: ["payment_failed", "user_abandoned", "system_error", "expired"] },
      checkOut: { $gte: today }
    })
      .select("checkIn checkOut")
      .lean();

    const bookedDatesSet = new Set();

    activeBookings.forEach((b) => {
      if (b.checkIn && b.checkOut) {
        const startStr = moment.utc(b.checkIn).format("YYYY-MM-DD");
        const endStr = moment.utc(b.checkOut).format("YYYY-MM-DD");

        let curr = moment.utc(startStr, "YYYY-MM-DD");
        const end = moment.utc(endStr, "YYYY-MM-DD");

        while (curr.isBefore(end)) {
          bookedDatesSet.add(curr.format("YYYY-MM-DD"));
          curr.add(1, "day");
        }
      }
    });

    data.bookedDates = Array.from(bookedDatesSet).sort();

    await RecentlyViewed.findOneAndUpdate(
      {
        user: req.user._id,
        property: req.params.id
      },
      {
        $inc: {
          viewCount: 1
        },

        $set: {
          lastViewedAt: new Date()
        }
      },
      {
        upsert: true,
        new: true
      }
    );
  }

  return res.status(200).json({
    success: true,
    data,
    message: data
      ? "Property detail received successfully"
      : "No property found",
  });

});

const createToken = catchAsyncError(async (req, res) => {

  const data = await createTokenForCard(req.body);

  return res.status(200).json({
    success: true,
    data,
    message: "Token created successfully",
  });
})
const createBooking = async (req, res) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {

    /* =================================================
       IDENTITY VERIFICATION CHECK
    ================================================= */

    const bookingUser = await User.findById(req.user._id || req.user.id)
      .select("identityVerificationStatus")
      .lean();

    if (
      !bookingUser ||
      bookingUser.identityVerificationStatus !== "VERIFIED"
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).send({
        message: "Identity verification required before booking.",
      });
    }

    const { hotelId, checkIn, checkOut } = req.body;
    const userId = req.user.id;

    const property = await Properties.findOne({
      _id: hotelId,
      isDeleted: false,
      isActive: { $ne: false }
    }).session(session);

    if (!property) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Property not found" });
    }

    const start = new Date(checkIn);
    const end = new Date(checkOut);

    if (start >= end) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    const dates = getDatesBetween(start, end);

    const availabilityDocs = await Availability.find({ hotel: hotelId, date: { $in: dates } }).session(session);

    if (availabilityDocs.length !== dates.length) {
      return res.status(400).json({ message: "Availability not initialized" });
    }


    for (let doc of availabilityDocs) {
      if (doc.isBooked) {
        return res.status(400).json({ message: "Room is already booked" });
      }
    }

    await Availability.updateMany({ hotel: hotelId, date: { $in: dates } }, { $set: { isBooked: true } }, { session });

    const booking = await Booking.create([{
      hotel: hotelId,
      user: userId,
      checkIn: start,
      checkOut: end,
      status: "pending"
    }], { session });

    await session.commitTransaction();

    return res.status(201).json({ success: true, data: booking });

  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({ message: err.message });
  } finally {
    session.endSession();
  }
}

const getAvailableCoupons = async (req, res) => {
  try {

    const userId = req.user._id;

    // Check if user has booked before
    const hasBooking = await Booking.exists({
      user: userId,
      bookingStatus: { $in: ["confirmed", "pending"] }
    });

    const now = new Date();
    const filter = {
      isActive: true,
      isDelete: false,
      startDate: { $lte: now },
      expiryDate: { $gte: now },
      "usedBy.user": { $ne: userId },
      $or: [
        { userRestriction: "ALL" },
        { userRestriction: { $exists: false } },
        { userRestriction: "SPECIFIC", applicableUsers: userId }
      ]
    };

    // If user has bookings → hide first time coupons
    if (hasBooking) {
      filter.firstTimeUserOnly = false;
    }

    const coupons = await Coupon.find(filter)
      .select(
        "code couponType discountType discountValue minAmount maxDiscount firstTimeUserOnly userRestriction startDate expiryDate"
      )
      .sort({ createdAt: -1 });

    return res.status(200).send({
      success: true,
      data: coupons,
      message: coupons.length
        ? "Coupons fetched successfully"
        : "No coupons available"
    });

  } catch (error) {

    return res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const getPlatformCharges = async (req, res) => {
  try {

    const [platformFee, tax] = await Promise.all([
      PlatformFee.findOne({
        isActive: true,
        isDeleted: false
      }).lean(),

      Tax.findOne({
        isActive: true,
        isDeleted: false
      }).lean()
    ]);

    return res.status(200).json({
      success: true,
      data: {
        platformFee,
        tax
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const search = catchAsyncError(async (req, res) => {

  const {
    type,
    shareCode,
    searchMode = "NEARBY",
    lat,
    lng,
    totalGuest = 1,
    checkIn,
    checkOut,
    categoryId,
  } = req.body;

  if (categoryId && !mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid categoryId"
    });
  }

  if (!shareCode && (!lat || !lng)) {
    return res.status(400).json({
      success: false,
      message: "Latitude and longitude required"
    });
  }

  // ✅ IMPORTANT
  // [longitude, latitude]
  const coordinates = [
    Number(lng),
    Number(lat)
  ];

  // ✅ Dynamic radius
  let radius = 100000;

  if (searchMode === "CITY") {
    radius = 30000;
  }

  if (searchMode === "ANYWHERE") {
    radius = 200000;
  }

  const user = await User.findById(req.user._id, { phone: 1 }).lean();
  let serviceUserIds = [];

  if (user && user.phone) {
    const serviceUsers = await ServiceUser.find({ phone: user.phone }, "_id").lean();
    serviceUserIds = serviceUsers.map((su) => su._id);
  }

  // =========================================================
  // ================= PROPERTY SEARCH =======================
  // =========================================================

  if (type === "PROPERTY") {
    if (shareCode) {

      const properties = await Properties.aggregate([

        {
          $match: {
            shareCode: shareCode.toUpperCase(),
            isDeleted: false,
            isActive: { $ne: false },
            is_completed: true,
            approvalStatus: "approved",
            ...(categoryId ? { category: new mongoose.Types.ObjectId(categoryId) } : {}),
            ...(serviceUserIds.length > 0 ? { user: { $nin: serviceUserIds } } : {})
          }
        },

        // ✅ FAVORITE LOOKUP
        {
          $lookup: {

            from: "bookmarks",

            let: {
              propertyId: "$_id"
            },

            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [

                      {
                        $eq: [
                          "$property",
                          "$$propertyId"
                        ]
                      },

                      {
                        $eq: [
                          "$user",
                          new mongoose.Types.ObjectId(req.user._id)
                        ]
                      },

                      {
                        $eq: [
                          "$isDeleted",
                          false
                        ]
                      }

                    ]
                  }
                }
              }
            ],

            as: "bookmarkData"
          }
        },

        {
          $addFields: {
            isFavorite: {
              $gt: [
                {
                  $size: "$bookmarkData"
                },
                0
              ]
            },

            distance: 0
          }
        }

      ]);

      if (!properties.length) {
        return res.status(404).json({
          success: false,
          message: "Property not found"
        });
      }

      return res.status(200).json({
        success: true,
        type: "PROPERTY",
        count: properties.length,
        data: properties
      });

    }
    const propertyPipeline = [
      // ✅ GEO SEARCH INSIDE RADIUS CIRCLE
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates
          },
          distanceField: "distance",
          spherical: true,
          key: "address.location",
          ...(searchMode !== "ANYWHERE" ? { maxDistance: radius } : {}),
          query: {
            isDeleted: false,
            isActive: { $ne: false },
            is_completed: true,
            approvalStatus: "approved",
            ...(categoryId ? { category: new mongoose.Types.ObjectId(categoryId) } : {}),
            maxGuests: {
              $gte: Number(totalGuest)
            },
            "address.location.coordinates": {
              $exists: true,
              $ne: []
            },
            ...(serviceUserIds.length > 0 ? { user: { $nin: serviceUserIds } } : {})
          }
        }
      },

      // ✅ Convert meters to KM
      {
        $addFields: {
          distance: {
            $round: [
              {
                $divide: ["$distance", 1000]
              },
              2
            ]
          }
        }
      }
    ];

    if (checkIn && checkOut) {
      const startHotelDate = new Date(checkIn);
      startHotelDate.setUTCHours(0, 0, 0, 0);
      const endHotelDate = new Date(checkOut);
      endHotelDate.setUTCHours(23, 59, 59, 999);

      propertyPipeline.push(
        {
          $lookup: {
            from: "hotelavailabilities",
            let: {
              propertyId: "$_id"
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $eq: [
                          "$hotel",
                          "$$propertyId"
                        ]
                      },
                      {
                        $eq: [
                          "$isBooked",
                          true
                        ]
                      },
                      {
                        $gte: [
                          "$date",
                          startHotelDate
                        ]
                      },
                      {
                        $lte: [
                          "$date",
                          endHotelDate
                        ]
                      }
                    ]
                  }
                }
              }
            ],
            as: "bookedDates"
          }
        },
        {
          $match: {
            bookedDates: {
              $size: 0
            }
          }
        }
      );
    }

    // Favorite Lookup, Projection, Sorting, Limit
    propertyPipeline.push(
      {
        $lookup: {
          from: "bookmarks",
          let: {
            propertyId: "$_id"
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        "$property",
                        "$$propertyId"
                      ]
                    },
                    {
                      $eq: [
                        "$user",
                        new mongoose.Types.ObjectId(req.user._id)
                      ]
                    },
                    {
                      $eq: [
                        "$isDeleted",
                        false
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: "bookmarkData"
        }
      },
      {
        $addFields: {
          isFavorite: {
            $gt: [
              {
                $size: "$bookmarkData"
              },
              0
            ]
          }
        }
      },
      {
        $project: {
          name: 1,
          price: 1,
          maxGuests: 1,
          address: 1,
          shareCode: 1,
          media: 1,
          distance: 1,
          isFavorite: 1
        }
      },
      {
        $sort: {
          distance: 1
        }
      },
      {
        $limit: 20
      }
    );

    const properties = await Properties.aggregate(propertyPipeline);

    return res.json({
      success: true,
      type: "PROPERTY",
      count: properties.length,
      data: properties
    });

  }

  // =========================================================
  // ================= SERVICE SEARCH ========================
  // =========================================================

  if (type === "SERVICE") {
    if (shareCode) {

      const services = await Service.aggregate([

        {
          $match: {
            shareCode: shareCode.toUpperCase(),
            isDeleted: false,
            isActive: true,
            approvalStatus: "approved",
            ...(categoryId ? { category: new mongoose.Types.ObjectId(categoryId) } : {}),
            ...(serviceUserIds.length > 0 ? { user: { $nin: serviceUserIds } } : {})
          }
        },

        // ✅ BOOKMARK LOOKUP
        {
          $lookup: {

            from: "bookmarks",

            let: {
              serviceId: "$_id"
            },

            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [

                      {
                        $eq: [
                          "$service",
                          "$$serviceId"
                        ]
                      },

                      {
                        $eq: [
                          "$user",
                          new mongoose.Types.ObjectId(req.user._id)
                        ]
                      },

                      {
                        $eq: [
                          "$isDeleted",
                          false
                        ]
                      }

                    ]
                  }
                }
              }
            ],

            as: "bookmarkData"
          }
        },

        // ✅ ADD EXTRA FIELDS
        {
          $addFields: {

            isFavorite: {
              $gt: [
                {
                  $size: "$bookmarkData"
                },
                0
              ]
            },

            distance: 0,

            matchedDaysCount: 0,

            isExactMatch: 1
          }
        }

      ]);

      if (!services.length) {
        return res.status(404).json({
          success: false,
          message: "Service not found"
        });
      }

      return res.status(200).json({
        success: true,
        type: "SERVICE",
        count: services.length,
        data: services
      });

    }
    if (!checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: "checkIn and checkOut are required"
      });
    }

    const startDate = new Date(checkIn);
    startDate.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(checkOut);
    endDate.setUTCHours(23, 59, 59, 999);

    const daysArray = [];

    let current = new Date(startDate);

    while (current <= endDate) {

      daysArray.push(
        current.toLocaleString(
          "en-US",
          { weekday: "long", timeZone: "UTC" }
        )
      );

      current.setDate(
        current.getDate() + 1
      );

    }

    const services = await Service.aggregate([

      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates
          },
          distanceField: "distance",
          spherical: true,
          key: "location.coordinates",
          ...(searchMode !== "ANYWHERE" ? { maxDistance: radius } : {}),
          query: {
            isDeleted: false,
            isActive: true,
            approvalStatus: "approved",
            ...(categoryId ? { category: new mongoose.Types.ObjectId(categoryId) } : {}),
            "location.coordinates.coordinates": {
              $exists: true,
              $ne: []
            },
            ...(serviceUserIds.length > 0 ? { user: { $nin: serviceUserIds } } : {})
          }
        }
      },

      {
        $addFields: {
          activeDays: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ["$schedule", []] },
                  as: "s",
                  cond: { $eq: ["$$s.enabled", true] }
                }
              },
              as: "item",
              in: "$$item.day"
            }
          }
        }
      },

      // ✅ PRIORITY LOGIC
      {
        $addFields: {
          matchedDaysCount: {
            $size: {
              $setIntersection: [
                "$activeDays",
                daysArray
              ]
            }
          },
          isExactMatch: {
            $cond: [
              {
                $eq: [
                  {
                    $size: {
                      $setIntersection: [
                        "$activeDays",
                        daysArray
                      ]
                    }
                  },
                  daysArray.length
                ]
              },
              1,
              0
            ]
          },
          // ✅ Calculate total slots defined in schedule for matching days
          totalSlots: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: { $ifNull: ["$schedule", []] },
                    as: "s",
                    cond: {
                      $and: [
                        { $eq: ["$$s.enabled", true] },
                        { $in: ["$$s.day", daysArray] }
                      ]
                    }
                  }
                },
                as: "item",
                in: { $size: { $ifNull: ["$$item.slots", []] } }
              }
            }
          }
        }
      },

      // ✅ At least one matching day
      {
        $match: {
          matchedDaysCount: {
            $gt: 0
          }
        }
      },

      // ✅ Convert KM
      {
        $addFields: {
          distance: {
            $round: [
              {
                $divide: ["$distance", 1000]
              },
              2
            ]
          }
        }
      },

      {
        $lookup: {
          from: "serviceavailabilities",
          let: {
            serviceId: "$_id"
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        "$service",
                        "$$serviceId"
                      ]
                    },
                    {
                      $eq: [
                        "$isBooked",
                        true
                      ]
                    },
                    {
                      $gte: [
                        "$date",
                        startDate
                      ]
                    },
                    {
                      $lte: [
                        "$date",
                        endDate
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: "bookedSlots"
        }
      },

      // ✅ Keep service if booked slots < total slots (at least 1 free slot)
      {
        $match: {
          $expr: {
            $and: [
              { $gt: ["$totalSlots", 0] },
              { $lt: [{ $size: "$bookedSlots" }, "$totalSlots"] }
            ]
          }
        }
      },

      // Bookmark Lookup for isFavorite
      {
        $lookup: {
          from: "bookmarks",
          let: {
            serviceId: "$_id"
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        "$service",
                        "$$serviceId"
                      ]
                    },
                    {
                      $eq: [
                        "$user",
                        new mongoose.Types.ObjectId(req.user._id)
                      ]
                    },
                    {
                      $eq: [
                        "$isDeleted",
                        false
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: "bookmarkData"
        }
      },

      {
        $addFields: {
          isFavorite: {
            $gt: [
              {
                $size: "$bookmarkData"
              },
              0
            ]
          }
        }
      },

      {
        $project: {
          name: 1,
          price: 1,
          location: 1,
          media: 1,
          schedule: 1,
          distance: 1,
          matchedDaysCount: 1,
          isExactMatch: 1,
          isFavorite: 1
        }
      },

      // ✅ PRIORITY SORT
      {
        $sort: {
          isExactMatch: -1,
          matchedDaysCount: -1,
          distance: 1
        }
      },

      {
        $limit: 20
      }

    ]);

    return res.json({
      success: true,
      type: "SERVICE",
      count: services.length,
      data: services
    });

  }

  return res.status(400).json({
    success: false,
    message: "Invalid type"
  });

});


const getLatestServices = catchAsyncError(async (req, res) => {

  const { lastCategoryId, limit = 5 } = req.query;

  const user = await User.findById(req.user._id, "phone").lean();
  const phone = user?.phone;

  const excludedProviderIds = [new mongoose.Types.ObjectId(req.user._id)];
  if (phone) {
    const serviceUsers = await ServiceUser.find({ phone }, "_id").lean();
    serviceUsers.forEach((su) => {
      excludedProviderIds.push(su._id);
    });
  }

  const categoryMatch = {};

  // Cursor pagination on categories
  if (
    lastCategoryId &&
    mongoose.Types.ObjectId.isValid(lastCategoryId)
  ) {
    categoryMatch._id = {
      $lt: new mongoose.Types.ObjectId(lastCategoryId)
    };
  }

  const data = await ServiceCategory.aggregate([

    {
      $match: categoryMatch
    },

    {
      $sort: {
        createdAt: -1
      }
    },

    // Pagination on categories
    {
      $limit: Number(limit)
    },

    // 🔥 Lookup services of each category
    {
      $lookup: {
        from: "services",
        let: {
          categoryId: "$_id"
        },
        pipeline: [

          {
            $match: {
              user: { $nin: excludedProviderIds },
              $expr: {
                $and: [
                  { $eq: ["$category", "$$categoryId"] },
                  { $eq: ["$isDeleted", false] },
                  { $eq: ["$isActive", true] },
                  { $eq: ["$approvalStatus", "approved"] }
                ]
              }
            }
          },

          {
            $sort: {
              createdAt: -1
            }
          },

          // Only 5 services per category
          {
            $limit: 5
          },

          /* =====================================
             🔥 BOOKMARK LOOKUP
          ===================================== */
          {
            $lookup: {
              from: "bookmarks",
              let: {
                serviceId: "$_id"
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        {
                          $eq: [
                            "$service",
                            "$$serviceId"
                          ]
                        },
                        {
                          $eq: [
                            "$user",
                            new mongoose.Types.ObjectId(req.user._id)
                          ]
                        },
                        {
                          $eq: [
                            "$isDeleted",
                            false
                          ]
                        }
                      ]
                    }
                  }
                }
              ],
              as: "bookmarkData"
            }
          },

          {
            $addFields: {
              isFavorite: {
                $gt: [
                  { $size: "$bookmarkData" },
                  0
                ]
              }
            }
          },

          {
            $project: {
              bookmarkData: 0
            }
          },

          /* =====================================
             ⭐ AVG RATING + TOTAL REVIEWS
          ===================================== */
          {
            $lookup: {
              from: "reviews",
              let: {
                serviceId: "$_id"
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        {
                          $eq: ["$service", "$$serviceId"]
                        },
                        {
                          $eq: ["$isDeleted", false]
                        }
                      ]
                    }
                  }
                },
                {
                  $group: {
                    _id: null,
                    avgRating: {
                      $avg: "$rating"
                    },
                    totalReviews: {
                      $sum: 1
                    }
                  }
                }
              ],
              as: "ratingData"
            }
          },

          {
            $addFields: {
              avgRating: {
                $round: [
                  {
                    $ifNull: [
                      {
                        $arrayElemAt: [
                          "$ratingData.avgRating",
                          0
                        ]
                      },
                      0
                    ]
                  },
                  1
                ]
              },
              totalReviews: {
                $ifNull: [
                  {
                    $arrayElemAt: [
                      "$ratingData.totalReviews",
                      0
                    ]
                  },
                  0
                ]
              }
            }
          },

          /* =====================================
             🔥 LATEST 3 REVIEWS
          ===================================== */
          {
            $lookup: {
              from: "reviews",
              let: {
                serviceId: "$_id"
              },
              pipeline: [

                {
                  $match: {
                    $expr: {
                      $and: [
                        {
                          $eq: ["$service", "$$serviceId"]
                        },
                        {
                          $eq: ["$isDeleted", false]
                        }
                      ]
                    }
                  }
                },

                {
                  $sort: {
                    createdAt: -1
                  }
                },

                {
                  $limit: 3
                },

                // reviewer details
                {
                  $lookup: {
                    from: "users",
                    localField: "reviewer",
                    foreignField: "_id",
                    as: "reviewer"
                  }
                },

                {
                  $unwind: {
                    path: "$reviewer",
                    preserveNullAndEmptyArrays: true
                  }
                },

                {
                  $project: {
                    _id: 1,
                    rating: 1,
                    comment: 1,
                    createdAt: 1,

                    reviewer: {
                      _id: "$reviewer._id",
                      name: "$reviewer.name",
                      image: "$reviewer.image"
                    }
                  }
                }

              ],
              as: "latestReviews"
            }
          },

          {
            $project: {
              ratingData: 0
            }
          }

        ],
        as: "services"
      }
    },

    // Remove empty categories
    {
      $match: {
        services: {
          $ne: []
        }
      }
    },

    // Final response
    {
      $project: {
        _id: 0,
        categoryId: "$_id",
        categoryName: "$name",
        services: 1
      }
    }

  ]);

  // 🔥 Next Cursor
  let nextCursor = null;

  if (data.length > 0) {
    nextCursor = data[data.length - 1].categoryId;
  }

  return res.status(200).json({
    success: true,
    nextCursor,
    data
  });

});


const getServicesByCategory = catchAsyncError(async (req, res) => {

  const { categoryId } = req.params;
  const { lastId, limit = 10 } = req.query;

  if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).json({
      success: false,
      message: "Valid categoryId is required"
    });
  }

  const matchStage = {
    category: new mongoose.Types.ObjectId(categoryId),
    isDeleted: false,
    isActive: true,
    approvalStatus: "approved"
  };

  // 🔥 Cursor Pagination
  if (lastId && mongoose.Types.ObjectId.isValid(lastId)) {
    matchStage._id = {
      $lt: new mongoose.Types.ObjectId(lastId)
    };
  }

  const services = await Service.aggregate([

    {
      $match: matchStage
    },

    {
      $sort: {
        createdAt: -1
      }
    },

    {
      $limit: Number(limit)
    },

    // 🔥 Category Lookup
    {
      $lookup: {
        from: "servicecategories",
        localField: "category",
        foreignField: "_id",
        as: "categoryData"
      }
    },

    {
      $unwind: {
        path: "$categoryData",
        preserveNullAndEmptyArrays: true
      }
    },

    // 🔥 Service User Lookup
    {
      $lookup: {
        from: "serviceusers",
        let: { userId: "$user" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$userId"]
              }
            }
          },
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              email: 1,
              phone: 1,
              profile: 1
            }
          }
        ],
        as: "serviceUserData"
      }
    },

    {
      $unwind: {
        path: "$serviceUserData",
        preserveNullAndEmptyArrays: true
      }
    },

    // 🔥 Bookmark Lookup
    {
      $lookup: {
        from: "bookmarks",
        let: { serviceId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: [
                      "$service",
                      "$$serviceId"
                    ]
                  },
                  {
                    $eq: [
                      "$user",
                      new mongoose.Types.ObjectId(req.user._id)
                    ]
                  },
                  {
                    $eq: [
                      "$isDeleted",
                      false
                    ]
                  }
                ]
              }
            }
          }
        ],
        as: "bookmarkData"
      }
    },

    // ❤️ Favorite Flag
    {
      $addFields: {
        isFavorite: {
          $gt: [
            { $size: "$bookmarkData" },
            0
          ]
        }
      }
    },

    // 🔥 Remove unwanted fields
    {
      $project: {
        bookmarkData: 0
      }
    }

  ]);

  // 🔥 Next Cursor
  let nextCursor = null;

  if (services.length > 0) {
    nextCursor = services[services.length - 1]._id;
  }

  return res.status(200).json({
    success: true,
    nextCursor,
    count: services.length,
    data: services
  });

});


const getServiceDetail = catchAsyncError(async (req, res) => {
  try {

    const { serviceId } = req.params;

    const service = await Service.findOne({
      _id: serviceId,
      isDeleted: false,
      isActive: true,
      approvalStatus: "approved"
    })
      .populate({
        path: "user",
        model: "ServiceUser",
        select: "firstName lastName userId role email phone profile"
      })
      .populate({
        path: "category",
        model: "ServiceCategory",
        select: "name"
      }).populate("cancellationPolicy")
      .lean();

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    /* =====================================
       🔥 CHECK BOOKMARK
    ===================================== */

    const bookmark = await Bookmark.findOne({
      user: req.user._id,
      service: service._id,
      isDeleted: false
    })
      .select("_id")
      .lean();

    service.isFavorite = !!bookmark;

    /* =====================================
       ⭐ AVG RATING + TOTAL REVIEWS
    ===================================== */

    const ratingData = await Review.aggregate([

      {
        $match: {
          service: service._id,
          isDeleted: false
        }
      },

      {
        $group: {
          _id: null,
          avgRating: {
            $avg: "$rating"
          },
          totalReviews: {
            $sum: 1
          }
        }
      }

    ]);

    service.avgRating =
      ratingData.length > 0
        ? Number(ratingData[0].avgRating.toFixed(1))
        : 0;

    service.totalReviews =
      ratingData.length > 0
        ? ratingData[0].totalReviews
        : 0;

    /* =====================================
       🔥 LATEST 3 REVIEWS
    ===================================== */

    const latestReviews = await Review.find({
      service: service._id,
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate({
        path: "reviewer",
        select: "firstName lastName name profile image createdAt"
      })
      .select("rating comment createdAt reviewer")
      .lean();

    const formattedLatestReviews = latestReviews.map(review => {
      if (review.reviewer) {
        review.reviewer.joinedStatus = getJoinedStatus(review.reviewer.createdAt);
        review.reviewer.fullName = `${review.reviewer.firstName || ""} ${review.reviewer.lastName || ""}`.trim();
      }
      review.timeAgo = getTimeAgo(review.createdAt);
      return review;
    });

    service.latestReviews = formattedLatestReviews;

    /* =====================================
       📅 BOOKED DATES
    ===================================== */

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeBookings = await Booking.find({
      "services.service": service._id,
      isCancelled: { $ne: true },
      bookingStatus: { $in: ["confirmed"] },
      paymentStatus: { $ne: "failed" },
      pendingReason: { $nin: ["payment_failed", "user_abandoned", "system_error", "expired"] },
      checkOut: { $gte: today }
    })
      .select("checkIn checkOut")
      .lean();

    const bookedDatesSet = new Set();

    activeBookings.forEach((b) => {
      if (b.checkIn && b.checkOut) {
        const startStr = moment.utc(b.checkIn).format("YYYY-MM-DD");
        const endStr = moment.utc(b.checkOut).format("YYYY-MM-DD");

        if (startStr === endStr) {
          bookedDatesSet.add(startStr);
        } else {
          let curr = moment.utc(startStr, "YYYY-MM-DD");
          const end = moment.utc(endStr, "YYYY-MM-DD");

          while (curr.isBefore(end)) {
            bookedDatesSet.add(curr.format("YYYY-MM-DD"));
            curr.add(1, "day");
          }
        }
      }
    });

    service.bookedDates = Array.from(bookedDatesSet).sort();

    await RecentlyViewed.findOneAndUpdate(
      {
        user: req.user._id,
        service: service._id
      },
      {
        $inc: {
          viewCount: 1
        },
        $set: {
          lastViewedAt: new Date()
        }
      },
      {
        upsert: true,
        new: true
      }
    );

    return res.status(200).json({
      success: true,
      data: service
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
});

const toggleFavorite = async (req, res) => {
  try {
    const { propertyId, serviceId, type } = req.body;
    const userId = req.user._id;

    if (!type || (!propertyId && !serviceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request"
      });
    }

    const filter = {
      user: userId,
      ...(type === "PROPERTY" && { property: propertyId }),
      ...(type === "SERVICE" && { service: serviceId })
    };

    const existing = await Bookmark.findOne(filter);

    if (existing) {
      await Bookmark.deleteOne({ _id: existing._id });

      return res.json({
        success: true,
        message: "Removed from favorites"
      });
    }

    await Bookmark.create({
      user: userId,
      type,
      property: type === "PROPERTY" ? propertyId : null,
      service: type === "SERVICE" ? serviceId : null
    });

    return res.json({
      success: true,
      message: "Added to favorites"
    });

  } catch (error) {

    if (error.code === 11000) {
      return res.json({
        success: true,
        message: "Already in favorites"
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// const getUserFavorites = async (req, res) => {
//   try {
//     const userId = req.user._id;

//     let { page = 1, limit = 10, type } = req.query;

//     const pageNumber = parseInt(page);
//     const limitNumber = parseInt(limit);
//     const skip = (pageNumber - 1) * limitNumber;

//     let filter = {
//       user: userId
//     };
//     if (type) {
//       filter.type = type;
//     }

//     const total = await Bookmark.countDocuments(filter);

//     const favorites = await Bookmark.find(filter)
//       .populate("property", "name price address media.mainImage")
//       .populate("service", "name price location media.images")
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limitNumber)
//       .lean();
//     const formatted = favorites.map(fav => ({
//       id: fav._id,
//       type: fav.type,
//       data: fav.property || fav.service
//     }));

//     const totalPages = Math.ceil(total / limitNumber);

//     return res.json({
//       success: true,
//       data: formatted,
//       page: pageNumber,
//       limit: limitNumber,
//       total,
//       totalPages
//     });

//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };



const getUserFavorites = async (req, res) => {
  try {

    const userId = req.user._id;

    let { page = 1, limit = 10, type } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    const skip = (pageNumber - 1) * limitNumber;

    /* ========================
       🔍 FILTER
    ======================== */

    let filter = {
      user: userId
    };

    if (type) {
      filter.type = type;
    }

    /* ========================
       📊 TOTAL
    ======================== */

    const total = await Bookmark.countDocuments(filter);

    /* ========================
       ❤️ FAVORITES
    ======================== */

    const favorites = await Bookmark.find(filter)

      /* ========================
         🏡 PROPERTY
      ======================== */

      .populate({
        path: "property",
        select: "name price area address media.mainImage bedRoom restRoom isActive isDeleted",
        match: { isDeleted: false, isActive: { $ne: false } }
      })

      /* ========================
         🛠️ SERVICE
      ======================== */

      .populate(
        "service",
        `
        name
        price
        location
        media.images
        `
      )

      .sort({ createdAt: -1 })

      .skip(skip)

      .limit(limitNumber)

      .lean();

    /* ========================
       🎯 FORMAT RESPONSE
    ======================== */

    const formatted = favorites
      .filter(fav => (fav.type === "PROPERTY" && fav.property) || (fav.type === "SERVICE" && fav.service))
      .map(fav => ({

        id: fav._id,

        type: fav.type,

        data: fav.property
          ? {

            _id: fav.property._id,

            name: fav.property.name,

            price: fav.property.price,

            sqft: fav.property.area,

            bedroom: fav.property?.bedRoom?.numBedroom || 0,

            bathroom: fav.property?.restRoom?.numBathroom || 0,

            address: fav.property.address,

            mainImage: fav.property?.media?.mainImage || []

          }

          : {

            _id: fav.service._id,

            name: fav.service.name,

            price: fav.service.price,

            location: fav.service.location,

            images: fav.service?.media?.images || []

          }

      }));

    const totalPages = Math.ceil(total / limitNumber);

    /* ========================
       📤 RESPONSE
    ======================== */

    return res.json({

      success: true,

      data: formatted,

      page: pageNumber,

      limit: limitNumber,

      total,

      totalPages

    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};



const ALLOWED_RATINGS = {
  property: ["cleanliness", "host", "price", "location"],
  service: ["cleanliness", "host", "price", "quality", "serviceQuality"]
};

const createUserReview = async (req, res) => {
  try {
    const { bookingId, reviewType, serviceId, ratingsBreakdown, comment, captions } = req.body;
    let photos = [];
    if ((req.files && req.files.length > 0) || req.file) {
      const files = req.files?.length ? req.files : req.file ? [req.file] : [];
      let captionsArray = [];
      if (captions) {
        try {
          captionsArray = JSON.parse(captions);
          if (!Array.isArray(captionsArray)) captionsArray = [];
        } catch (err) {
          captionsArray = [];
        }
      }
      photos = files.map((file, i) => ({
        url: path.relative(process.cwd(), file.path),
        caption: captionsArray[i] || ""
      }));
    }

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Valid bookingId is required" });
    }

    if (!["property", "service"].includes(reviewType)) {
      return res.status(400).json({ success: false, message: "Invalid reviewType. Must be 'property' or 'service'" });
    }

    if (reviewType === "service" && !serviceId) {
      return res.status(400).json({ success: false, message: "serviceId is required for service reviews" });
    }

    if (reviewType === "service" && !mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({ success: false, message: "Invalid serviceId" });
    }

    const booking = await Booking.findById(bookingId)
      .populate("property")
      .populate("services.service");

    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    let reviewee, revieweeModel, property = null, service = null;
    let checkOutDate;

    if (reviewType === "property") {
      if (!booking.property) return res.status(400).json({ success: false, message: "No property in booking" });
      reviewee = booking.property.user;
      revieweeModel = "ServiceUser";
      property = booking.property._id;

      if (!booking.checkOut) {
        return res.status(400).json({ success: false, message: "No checkout date available for this property booking" });
      }
      checkOutDate = new Date(booking.checkOut);
    }

    if (reviewType === "service") {
      const serviceItem = booking.services.find(s => s.service && s.service._id.toString() === serviceId);
      if (!serviceItem) return res.status(400).json({ success: false, message: "Service not in booking" });
      reviewee = serviceItem.service.user;
      revieweeModel = "ServiceUser";
      service = serviceItem.service._id;

      if (!serviceItem.serviceDate || !serviceItem.serviceEndTime) {
        return res.status(400).json({ success: false, message: "Service date or end time not found in booking" });
      }
      checkOutDate = new Date(serviceItem.serviceDate);
      const [hours, minutes] = serviceItem.serviceEndTime.split(":").map(Number);
      checkOutDate.setUTCHours(hours, minutes, 0, 0);
    }

    const now = new Date();
    if (now < checkOutDate) {
      const isService = reviewType === "service";
      return res.status(400).json({
        success: false,
        message: isService ? "Review allowed only after service completion" : "Review allowed only after checkout"
      });
    }

    const reviewLastDate = new Date(checkOutDate);
    reviewLastDate.setDate(reviewLastDate.getDate() + 7);

    if (now > reviewLastDate) {
      const isService = reviewType === "service";
      return res.status(400).json({
        success: false,
        message: isService
          ? "Review can only be submitted within 7 days after service completion"
          : "Review can only be submitted within 7 days after checkout"
      });
    }

    const exists = await Review.findOne({
      booking: bookingId,
      reviewer: req.user._id,
      reviewType,
      property: property || null,
      service: service || null
    });

    if (exists) return res.status(400).json({ success: false, message: "Already reviewed" });

    let parsedRatings = ratingsBreakdown;
    if (typeof ratingsBreakdown === "string") {
      try {
        parsedRatings = JSON.parse(ratingsBreakdown);
      } catch (err) {
        return res.status(400).json({ success: false, message: "Invalid ratingsBreakdown format" });
      }
    }

    if (!parsedRatings || typeof parsedRatings !== "object" || Object.keys(parsedRatings).length === 0) {
      return res.status(400).json({ success: false, message: "ratingsBreakdown is required" });
    }

    const allowedFields = ALLOWED_RATINGS[reviewType];
    const sanitizedBreakdown = {};
    const ratingValues = [];

    for (const field of allowedFields) {
      let rawVal = parsedRatings[field];
      if (field === "quality" && rawVal === undefined) {
        rawVal = parsedRatings["serviceQuality"];
      }
      if (rawVal !== undefined && rawVal !== null) {
        const val = Number(rawVal);
        if (isNaN(val) || val < 1 || val > 5) {
          return res.status(400).json({
            success: false,
            message: `Invalid rating value for '${field}'. Must be between 1 and 5`
          });
        }
        const storeKey = field === "serviceQuality" ? "quality" : field;
        sanitizedBreakdown[storeKey] = val;
        ratingValues.push(val);
      }
    }

    if (ratingValues.length === 0) {
      const displayFields = allowedFields.filter(f => f !== "serviceQuality");
      return res.status(400).json({
        success: false,
        message: `ratingsBreakdown must contain at least one valid field: ${displayFields.join(", ")}`
      });
    }

    const finalRating = Number((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1));

    const review = await Review.create({
      reviewer: req.user._id,
      reviewerModel: "User",
      reviewee,
      revieweeModel,
      booking: bookingId,
      property,
      service,
      reviewType,
      rating: finalRating,
      ratingsBreakdown: sanitizedBreakdown,
      comment,
      photos
    });

    if (!booking.reviewGiven) {
      await Booking.findByIdAndUpdate(bookingId, { reviewGiven: true });
    }

    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: review
    });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: "Already reviewed" });
    }
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


const getReviews = async (req, res) => {
  try {
    const {
      type, // property | service
      id,
      page = 1,
      limit = 10
    } = req.query;

    if (!type || !id) {
      return res.status(400).json({
        message: "type and id are required"
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    /* ========================
       🔥 BUILD MATCH
    ======================== */
    let match = {
      isDeleted: false
    };

    if (type === "property") {
      match.property = new mongoose.Types.ObjectId(id);
    }

    if (type === "service") {
      match.service = new mongoose.Types.ObjectId(id);
    }

    if (type === "user") {
      match.reviewee = new mongoose.Types.ObjectId(id);
      match.revieweeModel = "User";
      match.reviewType = "user";
    }

    /* ========================
       🔥 FETCH REVIEWS
    ======================== */
    const reviews = await Review.find(match)
      .populate("reviewer", "firstName lastName profile createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    /* ========================
       🔥 TOTAL COUNT
    ======================== */
    const total = await Review.countDocuments(match);

    /* ========================
       ⭐ SUMMARY (AIRBNB STYLE)
    ======================== */
    const summaryAgg = await Review.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },

          cleanliness: { $avg: "$ratingsBreakdown.cleanliness" },
          communication: { $avg: "$ratingsBreakdown.communication" },
          behavior: { $avg: "$ratingsBreakdown.behavior" },
          amenities: { $avg: "$ratingsBreakdown.amenities" },
          host: { $avg: "$ratingsBreakdown.host" },
          information: { $avg: "$ratingsBreakdown.information" },
          price: { $avg: "$ratingsBreakdown.price" },
          location: { $avg: "$ratingsBreakdown.location" },
          quality: { $avg: "$ratingsBreakdown.quality" },
          serviceQuality: { $avg: "$ratingsBreakdown.serviceQuality" },

          ratings: { $push: "$rating" }
        }
      }
    ]);

    let summary = {
      avgRating: 0,
      totalReviews: 0,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      breakdownPercentage: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      categoryAvg: {
        cleanliness: 0,
        communication: 0,
        behavior: 0,
        accuracy: 0,
        amenities: 0,
        host: 0,
        information: 0,
        price: 0,
        location: 0,
        quality: 0,
        serviceQuality: 0
      }
    };

    if (summaryAgg.length) {
      const data = summaryAgg[0];

      // ⭐ rating distribution
      const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      data.ratings.forEach(r => {
        const rounded = Math.round(r);
        if (breakdown[rounded] !== undefined) breakdown[rounded]++;
      });

      const totalReviewsCount = data.totalReviews || 1;
      const breakdownPercentage = {
        1: Number(((breakdown[1] / totalReviewsCount) * 100).toFixed(0)),
        2: Number(((breakdown[2] / totalReviewsCount) * 100).toFixed(0)),
        3: Number(((breakdown[3] / totalReviewsCount) * 100).toFixed(0)),
        4: Number(((breakdown[4] / totalReviewsCount) * 100).toFixed(0)),
        5: Number(((breakdown[5] / totalReviewsCount) * 100).toFixed(0))
      };

      summary = {
        avgRating: Number(data.avgRating.toFixed(1)),
        totalReviews: data.totalReviews,
        breakdown,
        breakdownPercentage,
        categoryAvg: {
          cleanliness: data.cleanliness ? Number(data.cleanliness.toFixed(1)) : 0,
          communication: data.communication ? Number(data.communication.toFixed(1)) : 0,
          behavior: data.behavior ? Number(data.behavior.toFixed(1)) : 0,
          accuracy: data.information ? Number(data.information.toFixed(1)) : 0,
          amenities: data.amenities ? Number(data.amenities.toFixed(1)) : 0,
          host: data.host ? Number(data.host.toFixed(1)) : 0,
          information: data.information ? Number(data.information.toFixed(1)) : 0,
          price: data.price ? Number(data.price.toFixed(1)) : 0,
          location: data.location ? Number(data.location.toFixed(1)) : 0,
          quality: (data.quality || data.serviceQuality) ? Number((data.quality || data.serviceQuality).toFixed(1)) : 0,
          serviceQuality: data.serviceQuality ? Number(data.serviceQuality.toFixed(1)) : 0
        }
      };
    }

    const formattedReviews = reviews.map(review => {
      const reviewObj = review.toObject();
      if (reviewObj.reviewer) {
        reviewObj.reviewer.joinedStatus = getJoinedStatus(reviewObj.reviewer.createdAt);
        reviewObj.reviewer.fullName = `${reviewObj.reviewer.firstName || ""} ${reviewObj.reviewer.lastName || ""}`.trim();
      }
      reviewObj.timeAgo = getTimeAgo(reviewObj.createdAt);
      return reviewObj;
    });

    /* ========================
       🚀 RESPONSE
    ======================== */
    res.json({
      success: true,

      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),

      ...summary,

      data: formattedReviews
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =====================================================
   GET /user/getUserReviews or GET /user/getUserReviews/:userId
   Fetch reviews given to a customer (User) by ServiceUsers
====================================================== */
const getUserReviews = async (req, res) => {
  try {
    const targetUserId = req.query.userId || req.user._id;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNum - 1) * limitNum;

    const match = {
      reviewee: new mongoose.Types.ObjectId(targetUserId),
      revieweeModel: "User",
      reviewType: "user",
      isDeleted: { $ne: true }
    };

    const reviews = await Review.find(match)
      .populate("reviewer", "firstName lastName profile email phone createdAt")
      .populate({
        path: "booking",
        select: "orderId checkIn checkOut bookingType property services",
        populate: [
          { path: "property", select: "name title images" },
          { path: "services.service", select: "name images" }
        ]
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Review.countDocuments(match);

    const summaryAgg = await Review.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$reviewee",
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
          cleanliness: { $avg: "$ratingsBreakdown.cleanliness" },
          communication: { $avg: "$ratingsBreakdown.communication" },
          behavior: { $avg: "$ratingsBreakdown.behavior" },
          amenities: { $avg: "$ratingsBreakdown.amenities" },
          host: { $avg: "$ratingsBreakdown.host" },
          information: { $avg: "$ratingsBreakdown.information" },
          price: { $avg: "$ratingsBreakdown.price" },
          location: { $avg: "$ratingsBreakdown.location" },
          quality: { $avg: "$ratingsBreakdown.quality" },
          serviceQuality: { $avg: "$ratingsBreakdown.serviceQuality" }
        }
      }
    ]);

    const stats = summaryAgg[0] || {};
    const averageRating = stats.averageRating ? Number(stats.averageRating.toFixed(1)) : 0;
    const totalRatings = stats.totalRatings || 0;

    const summary = {
      averageRating,
      totalRatings,
      breakdown: {
        cleanliness: stats.cleanliness ? Number(stats.cleanliness.toFixed(1)) : 0,
        communication: stats.communication ? Number(stats.communication.toFixed(1)) : 0,
        behavior: stats.behavior ? Number(stats.behavior.toFixed(1)) : 0,
        accuracy: stats.information ? Number(stats.information.toFixed(1)) : 0,
        amenities: stats.amenities ? Number(stats.amenities.toFixed(1)) : 0,
        host: stats.host ? Number(stats.host.toFixed(1)) : 0,
        information: stats.information ? Number(stats.information.toFixed(1)) : 0,
        price: stats.price ? Number(stats.price.toFixed(1)) : 0,
        location: stats.location ? Number(stats.location.toFixed(1)) : 0,
        quality: (stats.quality || stats.serviceQuality) ? Number((stats.quality || stats.serviceQuality).toFixed(1)) : 0,
        serviceQuality: stats.serviceQuality ? Number(stats.serviceQuality.toFixed(1)) : 0
      }
    };

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      success: true,
      data: [
        {
          type: "summary",
          data: summary
        },
        {
          type: "pagination",
          data: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages
          }
        },
        ...reviews.map(review => {
          const reviewObj = review.toObject();
          if (reviewObj.reviewer) {
            reviewObj.reviewer.joinedStatus = getJoinedStatus(reviewObj.reviewer.createdAt);
            reviewObj.reviewer.fullName = `${reviewObj.reviewer.firstName || ""} ${reviewObj.reviewer.lastName || ""}`.trim();
          }
          reviewObj.timeAgo = getTimeAgo(reviewObj.createdAt);
          return {
            type: "review",
            data: reviewObj
          };
        })
      ]
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================================
   GET /user/getGivenReviews or GET /user/getGivenReviews/:userId
   Fetch reviews GIVEN/SUBMITTED by a customer (User)
====================================================== */
const getGivenReviews = async (req, res) => {
  try {
    const targetUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    const { page = 1, limit = 10, type } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNum - 1) * limitNum;

    const match = {
      reviewer: new mongoose.Types.ObjectId(targetUserId),
      reviewerModel: "User",
      isDeleted: { $ne: true }
    };

    if (type && ["property", "service", "user"].includes(type)) {
      match.reviewType = type;
    }

    const reviews = await Review.find(match)
      .populate("reviewee", "firstName lastName profile email phone createdAt")
      .populate("property", "name title images address")
      .populate("service", "name images price")
      .populate({
        path: "booking",
        select: "orderId checkIn checkOut bookingType"
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Review.countDocuments(match);

    const summaryAgg = await Review.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$reviewer",
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
          cleanliness: { $avg: "$ratingsBreakdown.cleanliness" },
          communication: { $avg: "$ratingsBreakdown.communication" },
          behavior: { $avg: "$ratingsBreakdown.behavior" },
          amenities: { $avg: "$ratingsBreakdown.amenities" },
          host: { $avg: "$ratingsBreakdown.host" },
          information: { $avg: "$ratingsBreakdown.information" },
          price: { $avg: "$ratingsBreakdown.price" },
          location: { $avg: "$ratingsBreakdown.location" },
          quality: { $avg: "$ratingsBreakdown.quality" },
          serviceQuality: { $avg: "$ratingsBreakdown.serviceQuality" }
        }
      }
    ]);

    const stats = summaryAgg[0] || {};
    const averageRating = stats.averageRating ? Number(stats.averageRating.toFixed(1)) : 0;
    const totalRatings = stats.totalRatings || 0;

    const summary = {
      averageRating,
      totalRatings,
      breakdown: {
        cleanliness: stats.cleanliness ? Number(stats.cleanliness.toFixed(1)) : 0,
        communication: stats.communication ? Number(stats.communication.toFixed(1)) : 0,
        behavior: stats.behavior ? Number(stats.behavior.toFixed(1)) : 0,
        accuracy: stats.information ? Number(stats.information.toFixed(1)) : 0,
        amenities: stats.amenities ? Number(stats.amenities.toFixed(1)) : 0,
        host: stats.host ? Number(stats.host.toFixed(1)) : 0,
        information: stats.information ? Number(stats.information.toFixed(1)) : 0,
        price: stats.price ? Number(stats.price.toFixed(1)) : 0,
        location: stats.location ? Number(stats.location.toFixed(1)) : 0,
        quality: (stats.quality || stats.serviceQuality) ? Number((stats.quality || stats.serviceQuality).toFixed(1)) : 0,
        serviceQuality: stats.serviceQuality ? Number(stats.serviceQuality.toFixed(1)) : 0
      }
    };

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      success: true,
      data: [
        {
          type: "summary",
          data: summary
        },
        {
          type: "pagination",
          data: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages
          }
        },
        ...reviews.map(review => {
          const reviewObj = review.toObject();
          if (reviewObj.reviewee) {
            reviewObj.reviewee.joinedStatus = getJoinedStatus(reviewObj.reviewee.createdAt);
            reviewObj.reviewee.fullName = `${reviewObj.reviewee.firstName || ""} ${reviewObj.reviewee.lastName || ""}`.trim();
          }
          reviewObj.timeAgo = getTimeAgo(reviewObj.createdAt);
          return {
            type: "review",
            data: reviewObj
          };
        })
      ]
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getServiceUser = catchAsyncError(async (req, res, next) => {

  const { userId } = req.params;

  /* ========================
     👤 USER INFO
  ======================== */

  const user = await ServiceUser.findOne(
    { _id: userId },
    {
      email: 1,
      role: 1,
      firstName: 1,
      lastName: 1,
      phone: 1,
      phoneCode: 1,
      profile: 1,
      isVerified: 1,
      createdAt: 1,
      description: 1,
      address: 1
    }
  ).lean();

  if (!user) {
    return res.status(400).send({
      message: "Service user not found"
    });
  }

  user["phone"] = await codeRem(user.phone);

  /* ========================
     📊 TOTAL TRIPS
  ======================== */

  const totalTrips = await Booking.countDocuments({
    "providerBreakdown.user": userId,
    isCancelled: false
  });

  /* ========================
     ⭐ REVIEWS + AVG RATING
  ======================== */

  const reviewStats = await Review.aggregate([
    {
      $match: {
        reviewee: new mongoose.Types.ObjectId(userId),
        revieweeModel: "ServiceUser",
        isDeleted: false
      }
    },

    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        avgRating: { $avg: "$rating" }
      }
    }

  ]);

  const totalReviews = reviewStats[0]?.totalReviews || 0;

  const avgRating = reviewStats[0]?.avgRating || 0;

  /* ========================
     💰 TOTAL EARNINGS
  ======================== */

  const earningsResult = await Booking.aggregate([

    {
      $match: {
        "providerBreakdown.user": userId,
        paymentStatus: "paid",
        isCancelled: false
      }
    },

    {
      $unwind: "$providerBreakdown"
    },

    {
      $match: {
        "providerBreakdown.user": userId
      }
    },

    {
      $group: {
        _id: null,
        totalEarnings: {
          $sum: "$providerBreakdown.amount"
        }
      }
    }

  ]);

  const totalEarnings = earningsResult[0]?.totalEarnings || 0;

  /* ========================
     📅 EXPERIENCE (MONTHS)
  ======================== */

  const createdDate = new Date(user.createdAt);

  const now = new Date();

  const months =
    (now.getFullYear() - createdDate.getFullYear()) * 12 +
    (now.getMonth() - createdDate.getMonth());


  /* ========================
     ⭐ REVIEW LIST (LAST 10)
  ======================== */

  const reviewList = await Review.aggregate([

    {
      $match: {
        reviewee: new mongoose.Types.ObjectId(userId),
        revieweeModel: "ServiceUser",
        isDeleted: false
      }
    },

    {
      $sort: {
        createdAt: -1
      }
    },

    {
      $limit: 10
    },

    {
      $lookup: {
        from: "users",
        localField: "reviewer",
        foreignField: "_id",
        as: "reviewerData"
      }
    },

    {
      $unwind: {
        path: "$reviewerData",
        preserveNullAndEmptyArrays: true
      }
    },

    {
      $lookup: {
        from: "properties",
        localField: "property",
        foreignField: "_id",
        as: "propertyData"
      }
    },

    {
      $unwind: {
        path: "$propertyData",
        preserveNullAndEmptyArrays: true
      }
    },

    {
      $lookup: {
        from: "services",
        localField: "service",
        foreignField: "_id",
        as: "serviceData"
      }
    },

    {
      $unwind: {
        path: "$serviceData",
        preserveNullAndEmptyArrays: true
      }
    },

    {
      $project: {
        rating: 1,
        comment: 1,
        review: "$comment",
        ratingsBreakdown: 1,
        photos: 1,
        reviewType: 1,
        createdAt: 1,

        reviewer: {
          _id: "$reviewerData._id",
          firstName: "$reviewerData.firstName",
          lastName: "$reviewerData.lastName",
          profile: "$reviewerData.profile"
        },

        property: {
          $cond: {
            if: { $ifNull: ["$propertyData", false] },
            then: {
              _id: "$propertyData._id",
              name: "$propertyData.name"
            },
            else: null
          }
        },

        service: {
          $cond: {
            if: { $ifNull: ["$serviceData", false] },
            then: {
              _id: "$serviceData._id",
              name: "$serviceData.name",
              media: "$serviceData.media"
            },
            else: null
          }
        }
      }
    }

  ]);

  /* ========================
     🏡 PROPERTIES & SERVICES
  ======================== */

  const [properties, services] = await Promise.all([
    Properties.find({
      user: userId,
      isDeleted: false,
      isActive: { $ne: false },
      is_completed: true,
      approvalStatus: "approved"
    })
      .populate("category", "category image")
      .select("name price media.mainImage address.city maxGuests category createdAt isActive")
      .lean(),

    Service.find({
      user: userId,
      isDeleted: false,
      isActive: true,
      approvalStatus: "approved"
    })
      .populate("category", "category image")
      .select("name price media.images location.city category createdAt isActive")
      .lean()
  ]);

  /* ========================
     📦 FINAL RESPONSE
  ======================== */

  return res.status(200).json({
    success: true,
    data: {
      ...user,

      stats: {
        trips: totalTrips,
        reviews: totalReviews,
        avgRating: Number(avgRating.toFixed(1)),
        earnings: totalEarnings,
        months: months < 0 ? 0 : months
      },

      reviewList,
      properties,
      services
    }
  });
});

const serviceUserLoginByUserToken = catchAsyncError(
  async (req, res, next) => {
    const { fcmToken } = req.body;
    console.log("working")
    // ✅ Logged in normal user
    const user = await User.findOne(
      {
        _id: req.user._id,
        isDeleted: false,
      },
      {
        phone: 1,
      }
    ).lean();

    if (!user) {
      return res.status(400).send({
        message: "User not found",
      });
    }

    // ✅ Find service provider using same phone
    const serviceUser = await ServiceUser.findOne(
      {
        phone: user.phone,
        isDeleted: false,
      },
      {
        email: 1,
        phone: 1,
        role: 1,
        isVerified: 1,
        isApproved: 1,
        rejectReason: 1,
      }
    );

    if (!serviceUser) {
      return res.status(400).send({
        message: "Service provider account not found",
      });
    }

    // ❌ Pending approval
    if (serviceUser.isApproved === "pending") {
      return res.status(400).send({
        message: "Your application has not been approved by the admin yet. Please try logging in again later.",
      });
    }

    // ❌ Rejected
    if (serviceUser.isApproved === "rejected") {
      return res.status(400).send({
        message:
          serviceUser.rejectReason ||
          "Your account has been rejected",
      });
    }

    // ✅ Create token
    const userData = {
      _id: serviceUser._id,
      email: serviceUser.email,
      phone: serviceUser.phone,
      role: serviceUser.role,
    };

    const token = jwt.sign(
      { user: userData },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    // ✅ Update token + fcmToken
    await ServiceUser.updateOne(
      { _id: serviceUser._id },
      {
        $push: { tokens: token },
        ...(fcmToken && { fcmToken }),
      }
    );

    return res.status(200).json({
      success: true,
      data: token,
      role: serviceUser.role,
      isVerified: serviceUser.isVerified,
      isApproved: serviceUser.isApproved,
      message: "Service provider login successful",
    });
  }
);


// ======================================================
// 1. RECENTLY VIEWED PROPERTIES
// ======================================================

const getRecentlyViewedProperties = catchAsyncError(async (req, res) => {

  const { lastId, limit = 10 } = req.query;

  const user = await User.findById(req.user._id, { phone: 1 }).lean();
  let serviceUserIds = [];

  if (user && user.phone) {
    const serviceUsers = await ServiceUser.find({ phone: user.phone }, "_id").lean();
    serviceUserIds = serviceUsers.map((su) => su._id);
  }

  const matchStage = {
    user: new mongoose.Types.ObjectId(req.user._id)
  };

  if (lastId && mongoose.Types.ObjectId.isValid(lastId)) {
    matchStage._id = {
      $lt: new mongoose.Types.ObjectId(lastId)
    };
  }

  const matchPropertyStage = {
    "propertyData.isDeleted": false,
    "propertyData.isActive": { $ne: false },
    "propertyData.is_completed": true,
    "propertyData.approvalStatus": "approved"
  };

  if (serviceUserIds.length > 0) {
    matchPropertyStage["propertyData.user"] = { $nin: serviceUserIds };
  }

  const data = await RecentlyViewed.aggregate([

    {
      $match: matchStage
    },

    {
      $sort: {
        lastViewedAt: -1
      }
    },

    {
      $limit: Number(limit)
    },

    {
      $lookup: {
        from: "properties",
        localField: "property",
        foreignField: "_id",
        as: "propertyData"
      }
    },

    {
      $unwind: "$propertyData"
    },

    {
      $match: matchPropertyStage
    },

    // Ratings
    {
      $lookup: {
        from: "reviews",
        let: {
          propertyId: "$propertyData._id"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: [
                      "$property",
                      "$$propertyId"
                    ]
                  },
                  {
                    $eq: [
                      "$isDeleted",
                      false
                    ]
                  }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              averageRating: {
                $avg: "$rating"
              },
              totalReviews: {
                $sum: 1
              }
            }
          }
        ],
        as: "ratingData"
      }
    },

    {
      $addFields: {
        "propertyData.averageRating": {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: [
                    "$ratingData.averageRating",
                    0
                  ]
                },
                1
              ]
            },
            0
          ]
        },

        "propertyData.totalReviews": {
          $ifNull: [
            {
              $arrayElemAt: [
                "$ratingData.totalReviews",
                0
              ]
            },
            0
          ]
        }
      }
    },

    {
      $replaceRoot: {
        newRoot: "$propertyData"
      }
    }

  ]);

  let nextCursor = null;

  if (data.length > 0) {
    nextCursor = data[data.length - 1]._id;
  }

  return res.status(200).json({
    success: true,
    nextCursor,
    data
  });

});


// ======================================================
// 2. TOP RATED PROPERTIES
// ======================================================


// const getTopRatedProperties = catchAsyncError(async (req, res) => {

//   const {
//     lat,
//     lng,
//     radius = 50000,
//     limit = 10,
//     lastId
//   } = req.query;

//   if (!lat || !lng) {
//     return res.status(400).json({
//       success: false,
//       message: "Latitude and longitude are required"
//     });
//   }
//   const parsedRadius = Math.min(
//     Number(radius) || 50000,
//     50000
//   );

//   const parsedLimit = Math.min(
//     Number(limit) || 10,
//     50
//   );
//   const pipeline = [

//     // 🔥 Geo Near

//     {
//       $geoNear: {

//         key: "address.location",

//         near: {
//           type: "Point",
//           coordinates: [
//             Number(lng),
//             Number(lat)
//           ]
//         },

//         distanceField: "distance",

//         maxDistance: parsedRadius,

//         spherical: true,

//         includeLocs: "address.location",

//         query: {
//           isDeleted: false,
//           is_completed: true,
//           approvalStatus: "approved",

//           "address.location.coordinates": {
//             $exists: true
//           }
//         }

//       }
//     }

//   ];

//   // 🔥 Cursor Pagination
//   if (
//     lastId &&
//     mongoose.Types.ObjectId.isValid(lastId)
//   ) {
//     pipeline.push({
//       $match: {
//         _id: {
//           $lt: new mongoose.Types.ObjectId(lastId)
//         }
//       }
//     });
//   }

//   // 🔥 Reviews Lookup
//   pipeline.push({

//     $lookup: {
//       from: "reviews",

//       let: {
//         propertyId: "$_id"
//       },

//       pipeline: [

//         {
//           $match: {
//             $expr: {
//               $and: [
//                 {
//                   $eq: [
//                     "$property",
//                     "$$propertyId"
//                   ]
//                 },
//                 {
//                   $eq: [
//                     "$isDeleted",
//                     false
//                   ]
//                 }
//               ]
//             }
//           }
//         },

//         {
//           $group: {
//             _id: null,

//             averageRating: {
//               $avg: "$rating"
//             },

//             totalReviews: {
//               $sum: 1
//             }
//           }
//         }

//       ],

//       as: "ratingData"
//     }

//   });

//   // 🔥 Add Rating Fields
//   pipeline.push({

//     $addFields: {

//       averageRating: {
//         $ifNull: [
//           {
//             $round: [
//               {
//                 $arrayElemAt: [
//                   "$ratingData.averageRating",
//                   0
//                 ]
//               },
//               1
//             ]
//           },
//           0
//         ]
//       },

//       totalReviews: {
//         $ifNull: [
//           {
//             $arrayElemAt: [
//               "$ratingData.totalReviews",
//               0
//             ]
//           },
//           0
//         ]
//       }

//     }

//   });

//   // 🔥 Sort
//   pipeline.push({

//     $sort: {
//       averageRating: -1,
//       totalReviews: -1,
//       distance: 1,
//       createdAt: -1
//     }

//   });

//   // 🔥 Limit
//   pipeline.push({
//     $limit: Number(limit)
//   });

//   // 🔥 Remove unwanted fields
//   pipeline.push({
//     $project: {
//       ratingData: 0
//     }
//   });

//   const data = await Properties.aggregate(pipeline);

//   // 🔥 Next Cursor
//   let nextCursor = null;

//   if (data.length > 0) {
//     nextCursor = data[data.length - 1]._id;
//   }

//   return res.status(200).json({
//     success: true,
//     nextCursor,
//     count: data.length,
//     data
//   });

// });

const getTopRatedProperties = catchAsyncError(async (req, res) => {

  const {
    lat,
    lng,
    limit = 10,
    page = 1
  } = req.query;

  // ✅ VALIDATION
  if (!lat || !lng) {

    return res.status(400).json({
      success: false,
      message: "Latitude and longitude are required"
    });

  }

  // ✅ LIMIT
  const parsedLimit = Math.min(
    Number(limit) || 10,
    50
  );

  // ✅ PAGE
  const parsedPage = Math.max(
    Number(page) || 1,
    1
  );

  const skip = (parsedPage - 1) * parsedLimit;

  const user = await User.findById(req.user._id, { phone: 1 }).lean();
  let serviceUserIds = [];

  if (user && user.phone) {
    const serviceUsers = await ServiceUser.find({ phone: user.phone }, "_id").lean();
    serviceUserIds = serviceUsers.map((su) => su._id);
  }

  const geoNearQuery = {
    isDeleted: false,
    isActive: { $ne: false },
    is_completed: true,
    approvalStatus: "approved",
    "address.location.coordinates": {
      $exists: true,
      $ne: []
    }
  };

  if (serviceUserIds.length > 0) {
    geoNearQuery.user = { $nin: serviceUserIds };
  }

  // ✅ PIPELINE
  const pipeline = [

    // ✅ GEO SEARCH
    // Automatically nearest → farthest
    {
      $geoNear: {

        key: "address.location",

        near: {
          type: "Point",
          coordinates: [
            Number(lng),
            Number(lat)
          ]
        },

        distanceField: "distance",

        spherical: true,

        includeLocs: "address.location",

        query: geoNearQuery

      }
    },

    // ✅ REVIEWS LOOKUP
    {
      $lookup: {

        from: "reviews",

        let: {
          propertyId: "$_id"
        },

        pipeline: [

          {
            $match: {

              $expr: {

                $and: [

                  {
                    $eq: [
                      "$property",
                      "$$propertyId"
                    ]
                  },

                  {
                    $eq: [
                      "$isDeleted",
                      false
                    ]
                  }

                ]

              }

            }
          },

          {
            $group: {

              _id: null,

              averageRating: {
                $avg: "$rating"
              },

              totalReviews: {
                $sum: 1
              }

            }
          }

        ],

        as: "ratingData"

      }
    },

    // ✅ ADD FIELDS
    {
      $addFields: {

        distanceInKm: {

          $round: [

            {
              $divide: [
                "$distance",
                1000
              ]
            },

            2

          ]

        },

        averageRating: {

          $ifNull: [

            {
              $round: [

                {
                  $arrayElemAt: [
                    "$ratingData.averageRating",
                    0
                  ]
                },

                1

              ]
            },

            0

          ]

        },

        totalReviews: {

          $ifNull: [

            {
              $arrayElemAt: [
                "$ratingData.totalReviews",
                0
              ]
            },

            0

          ]

        }

      }
    },

    // ✅ SORT
    // nearest first
    {
      $sort: {
        distance: 1,
        averageRating: -1,
        totalReviews: -1
      }
    },

    // ✅ PAGINATION
    {
      $skip: skip
    },

    {
      $limit: parsedLimit
    },

    // ✅ REMOVE UNWANTED FIELDS
    {
      $project: {
        ratingData: 0
      }
    }

  ];

  // ✅ EXECUTE
  const data = await Properties.aggregate(pipeline);

  // ✅ TOTAL COUNT
  const total = await Properties.countDocuments(geoNearQuery);

  // ✅ RESPONSE
  return res.status(200).json({

    success: true,

    page: parsedPage,

    limit: parsedLimit,

    total,

    totalPages: Math.ceil(total / parsedLimit),

    count: data.length,

    data

  });

});

// ======================================================
// 3. RECOMMENDED PROPERTIES
// ======================================================


// const getRecommendedProperties = catchAsyncError(async (req, res) => {

//   const {
//     lat,
//     lng,
//     radius = 50000,
//     limit = 10,
//     lastId
//   } = req.query;

//   // ✅ Validate coordinates
//   if (!lat || !lng) {
//     return res.status(400).json({
//       success: false,
//       message: "Latitude and longitude are required"
//     });
//   }

//   // ✅ Radius in meters
//   // 5000 = 5KM
//   // 10000 = 10KM
//   // 50000 = 50KM

//   const parsedRadius = Number(radius) || 50000;

//   // ✅ Pagination limit
//   const parsedLimit = Math.min(
//     Number(limit) || 10,
//     50
//   );

//   const pipeline = [

//     // ✅ Create circle around user coordinates
//     {
//       $geoNear: {

//         near: {
//           type: "Point",

//           // IMPORTANT:
//           // [ longitude, latitude ]
//           coordinates: [
//             Number(lng),
//             Number(lat)
//           ]
//         },

//         key: "address.location",

//         distanceField: "distance",

//         // ✅ Circle radius
//         maxDistance: parsedRadius,

//         spherical: true,

//         query: {

//           isRecommended: true,
//           isDeleted: false,
//           is_completed: true,
//           approvalStatus: "approved",

//           // ✅ Only valid geo docs
//           "address.location.coordinates": {
//             $exists: true,
//             $ne: []
//           }
//         }

//       }
//     }

//   ];

//   // ✅ Cursor pagination
//   if (
//     lastId &&
//     mongoose.Types.ObjectId.isValid(lastId)
//   ) {

//     pipeline.push({
//       $match: {
//         _id: {
//           $lt: new mongoose.Types.ObjectId(lastId)
//         }
//       }
//     });

//   }

//   // ✅ Distance in KM
//   pipeline.push({
//     $addFields: {

//       distanceInKm: {
//         $round: [
//           {
//             $divide: [
//               "$distance",
//               1000
//             ]
//           },
//           2
//         ]
//       }

//     }
//   });

//   // ✅ Sort nearest first
//   pipeline.push({
//     $sort: {
//       distance: 1,
//       createdAt: -1
//     }
//   });

//   // ✅ Limit data
//   pipeline.push({
//     $limit: parsedLimit
//   });

//   const data = await Properties.aggregate(pipeline);

//   // ✅ Next cursor
//   let nextCursor = null;

//   if (data.length > 0) {
//     nextCursor = data[data.length - 1]._id;
//   }

//   return res.status(200).json({
//     success: true,
//     radius: parsedRadius,
//     count: data.length,
//     nextCursor,
//     data
//   });
// });

const getRecommendedProperties = catchAsyncError(async (req, res) => {

  const {
    lat,
    lng,
    limit = 10,
    page = 1
  } = req.query;

  // ✅ VALIDATE COORDINATES
  if (!lat || !lng) {

    return res.status(400).json({
      success: false,
      message: "Latitude and longitude are required"
    });

  }

  // ✅ PAGINATION
  const parsedLimit = Math.min(
    Number(limit) || 10,
    50
  );

  const parsedPage = Math.max(
    Number(page) || 1,
    1
  );

  const skip = (parsedPage - 1) * parsedLimit;

  const user = await User.findById(req.user._id, { phone: 1 }).lean();
  let serviceUserIds = [];

  if (user && user.phone) {
    const serviceUsers = await ServiceUser.find({ phone: user.phone }, "_id").lean();
    serviceUserIds = serviceUsers.map((su) => su._id);
  }

  const geoNearQuery = {
    isRecommended: true,
    isDeleted: false,
    isActive: { $ne: false },
    is_completed: true,
    approvalStatus: "approved",
    "address.location.coordinates": {
      $exists: true,
      $ne: []
    }
  };

  if (serviceUserIds.length > 0) {
    geoNearQuery.user = { $nin: serviceUserIds };
  }

  // ✅ PIPELINE
  const pipeline = [

    // ✅ GEO SEARCH
    // Automatically nearest → farthest
    {
      $geoNear: {

        near: {
          type: "Point",

          // IMPORTANT:
          // [ longitude, latitude ]
          coordinates: [
            Number(lng),
            Number(lat)
          ]
        },

        key: "address.location",

        distanceField: "distance",

        spherical: true,

        query: geoNearQuery

      }
    },

    // ✅ DISTANCE IN KM
    {
      $addFields: {

        distanceInKm: {

          $round: [

            {
              $divide: [
                "$distance",
                1000
              ]
            },

            2

          ]

        }

      }
    },

    // ✅ PAGINATION
    {
      $skip: skip
    },

    {
      $limit: parsedLimit
    },

    // ✅ REMOVE RAW DISTANCE
    {
      $project: {
        distance: 0
      }
    }

  ];

  // ✅ GET DATA
  const data = await Properties.aggregate(pipeline);

  // ✅ TOTAL COUNT
  const total = await Properties.countDocuments(geoNearQuery);

  // ✅ RESPONSE
  return res.status(200).json({

    success: true,

    page: parsedPage,

    limit: parsedLimit,

    total,

    totalPages: Math.ceil(total / parsedLimit),

    count: data.length,

    data

  });

});

// ======================================================
// 4. NEAR YOU PROPERTIES
// ======================================================

const getNearYouProperties = catchAsyncError(async (req, res) => {

  const {
    lat,
    lng,
    limit = 10,
    page = 1
  } = req.query;

  // ✅ VALIDATION
  if (!lat || !lng) {

    return res.status(400).json({
      success: false,
      message: "Latitude and longitude are required"
    });

  }

  const parsedLimit = Math.min(
    Number(limit) || 10,
    50
  );

  const parsedPage = Math.max(
    Number(page) || 1,
    1
  );

  const skip = (parsedPage - 1) * parsedLimit;

  const user = await User.findById(req.user._id, { phone: 1 }).lean();
  let serviceUserIds = [];

  if (user && user.phone) {
    const serviceUsers = await ServiceUser.find({ phone: user.phone }, "_id").lean();
    serviceUserIds = serviceUsers.map((su) => su._id);
  }

  const geoNearQuery = {
    isDeleted: false,
    isActive: { $ne: false },
    is_completed: true,
    approvalStatus: "approved",
    "address.location.coordinates": {
      $exists: true,
      $ne: []
    }
  };

  if (serviceUserIds.length > 0) {
    geoNearQuery.user = { $nin: serviceUserIds };
  }

  // ✅ PIPELINE
  const pipeline = [

    // ✅ GEO SEARCH
    // automatically nearest → farthest
    {
      $geoNear: {

        key: "address.location",

        near: {
          type: "Point",
          coordinates: [
            Number(lng),
            Number(lat)
          ]
        },

        distanceField: "distance",

        spherical: true,

        includeLocs: "address.location",

        query: geoNearQuery

      }
    },

    // ✅ BOOKMARK LOOKUP
    {
      $lookup: {

        from: "bookmarks",

        let: {
          propertyId: "$_id"
        },

        pipeline: [

          {
            $match: {

              $expr: {

                $and: [

                  {
                    $eq: [
                      "$property",
                      "$$propertyId"
                    ]
                  },

                  {
                    $eq: [
                      "$user",
                      new mongoose.Types.ObjectId(req.user._id)
                    ]
                  },

                  {
                    $eq: [
                      "$isDeleted",
                      false
                    ]
                  }

                ]

              }

            }
          }

        ],

        as: "bookmarkData"

      }
    },

    // ✅ REVIEW LOOKUP
    {
      $lookup: {

        from: "reviews",

        let: {
          propertyId: "$_id"
        },

        pipeline: [

          {
            $match: {

              $expr: {

                $and: [

                  {
                    $eq: [
                      "$property",
                      "$$propertyId"
                    ]
                  },

                  {
                    $eq: [
                      "$isDeleted",
                      false
                    ]
                  }

                ]

              }

            }
          },

          {
            $group: {

              _id: null,

              averageRating: {
                $avg: "$rating"
              },

              totalReviews: {
                $sum: 1
              }

            }
          }

        ],

        as: "ratingData"

      }
    },

    // ✅ EXTRA FIELDS
    {
      $addFields: {

        distance: {

          $round: [

            {
              $divide: [
                "$distance",
                1000
              ]
            },

            2

          ]

        },

        isFavorite: {

          $gt: [

            {
              $size: "$bookmarkData"
            },

            0

          ]

        },

        averageRating: {

          $ifNull: [

            {
              $round: [

                {
                  $arrayElemAt: [
                    "$ratingData.averageRating",
                    0
                  ]
                },

                1

              ]
            },

            0

          ]

        },

        totalReviews: {

          $ifNull: [

            {
              $arrayElemAt: [
                "$ratingData.totalReviews",
                0
              ]
            },

            0

          ]

        }

      }
    },

    // ✅ PAGINATION
    {
      $skip: skip
    },

    {
      $limit: parsedLimit
    },

    // ✅ REMOVE FIELDS
    {
      $project: {
        ratingData: 0,
        bookmarkData: 0
      }
    }

  ];

  // ✅ EXECUTE
  const data = await Properties.aggregate(pipeline);

  // ✅ TOTAL COUNT
  const total = await Properties.countDocuments(geoNearQuery);

  // ✅ RESPONSE
  return res.status(200).json({

    success: true,

    page: parsedPage,

    limit: parsedLimit,

    total,

    totalPages: Math.ceil(total / parsedLimit),

    count: data.length,

    data

  });

});

// ======================================================
// 1. RECENTLY VIEWED SERVICES
// ======================================================

const getRecentlyViewedServices = catchAsyncError(async (req, res) => {
  const { lastId, limit = 10 } = req.query;

  const user = await User.findById(req.user._id, { phone: 1 }).lean();
  let serviceUserIds = [];

  if (user && user.phone) {
    const serviceUsers = await ServiceUser.find({ phone: user.phone }, "_id").lean();
    serviceUserIds = serviceUsers.map((su) => su._id);
  }

  const matchStage = {
    user: new mongoose.Types.ObjectId(req.user._id),
    service: { $exists: true, $ne: null }
  };

  if (lastId && mongoose.Types.ObjectId.isValid(lastId)) {
    matchStage._id = {
      $lt: new mongoose.Types.ObjectId(lastId)
    };
  }

  const matchServiceStage = {
    "serviceData.isDeleted": false,
    "serviceData.isActive": { $ne: false },
    "serviceData.approvalStatus": "approved"
  };

  if (serviceUserIds.length > 0) {
    matchServiceStage["serviceData.user"] = { $nin: serviceUserIds };
  }

  const data = await RecentlyViewed.aggregate([
    {
      $match: matchStage
    },
    {
      $sort: {
        lastViewedAt: -1
      }
    },
    {
      $limit: Number(limit)
    },
    {
      $lookup: {
        from: "services",
        localField: "service",
        foreignField: "_id",
        as: "serviceData"
      }
    },
    {
      $unwind: "$serviceData"
    },
    {
      $match: matchServiceStage
    },
    // Category Lookup
    {
      $lookup: {
        from: "servicecategories",
        localField: "serviceData.category",
        foreignField: "_id",
        as: "categoryData"
      }
    },
    {
      $unwind: {
        path: "$categoryData",
        preserveNullAndEmptyArrays: true
      }
    },
    // Service User Lookup
    {
      $lookup: {
        from: "serviceusers",
        let: { userId: "$serviceData.user" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$userId"]
              }
            }
          },
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              email: 1,
              phone: 1,
              profile: 1
            }
          }
        ],
        as: "serviceUserData"
      }
    },
    {
      $unwind: {
        path: "$serviceUserData",
        preserveNullAndEmptyArrays: true
      }
    },
    // Bookmark Lookup
    {
      $lookup: {
        from: "bookmarks",
        let: { serviceId: "$serviceData._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$service", "$$serviceId"]
                  },
                  {
                    $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)]
                  },
                  {
                    $eq: ["$isDeleted", false]
                  }
                ]
              }
            }
          }
        ],
        as: "bookmarkData"
      }
    },
    // Ratings Lookup
    {
      $lookup: {
        from: "reviews",
        let: {
          serviceId: "$serviceData._id"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$service", "$$serviceId"]
                  },
                  {
                    $eq: ["$isDeleted", false]
                  }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              averageRating: {
                $avg: "$rating"
              },
              totalReviews: {
                $sum: 1
              }
            }
          }
        ],
        as: "ratingData"
      }
    },
    {
      $addFields: {
        "serviceData.categoryData": "$categoryData",
        "serviceData.serviceUserData": "$serviceUserData",
        "serviceData.isFavorite": {
          $gt: [{ $size: "$bookmarkData" }, 0]
        },
        "serviceData.averageRating": {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: ["$ratingData.averageRating", 0]
                },
                1
              ]
            },
            0
          ]
        },
        "serviceData.totalReviews": {
          $ifNull: [
            {
              $arrayElemAt: ["$ratingData.totalReviews", 0]
            },
            0
          ]
        }
      }
    },
    {
      $replaceRoot: {
        newRoot: "$serviceData"
      }
    }
  ]);

  let nextCursor = null;
  if (data.length > 0) {
    nextCursor = data[data.length - 1]._id;
  }

  return res.status(200).json({
    success: true,
    nextCursor,
    data
  });
});

// ======================================================
// 2. TOP RATED SERVICES
// ======================================================

const getTopRatedServices = catchAsyncError(async (req, res) => {
  const {
    lat,
    lng,
    limit = 10,
    page = 1
  } = req.query;

  // ✅ VALIDATION
  if (!lat || !lng) {
    return res.status(400).json({
      success: false,
      message: "Latitude and longitude are required"
    });
  }

  // ✅ LIMIT
  const parsedLimit = Math.min(Number(limit) || 10, 50);

  // ✅ PAGE
  const parsedPage = Math.max(Number(page) || 1, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const user = await User.findById(req.user._id, { phone: 1 }).lean();
  let serviceUserIds = [];

  if (user && user.phone) {
    const serviceUsers = await ServiceUser.find({ phone: user.phone }, "_id").lean();
    serviceUserIds = serviceUsers.map((su) => su._id);
  }

  const geoNearQuery = {
    isDeleted: false,
    isActive: { $ne: false },
    approvalStatus: "approved",
    "location.coordinates.coordinates": {
      $exists: true,
      $ne: []
    }
  };

  if (serviceUserIds.length > 0) {
    geoNearQuery.user = { $nin: serviceUserIds };
  }

  // ✅ PIPELINE
  const pipeline = [
    // ✅ GEO SEARCH
    {
      $geoNear: {
        key: "location.coordinates",
        near: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)]
        },
        distanceField: "distance",
        spherical: true,
        includeLocs: "location.coordinates",
        query: geoNearQuery
      }
    },
    // Category Lookup
    {
      $lookup: {
        from: "servicecategories",
        localField: "category",
        foreignField: "_id",
        as: "categoryData"
      }
    },
    {
      $unwind: {
        path: "$categoryData",
        preserveNullAndEmptyArrays: true
      }
    },
    // Service User Lookup
    {
      $lookup: {
        from: "serviceusers",
        let: { userId: "$user" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$userId"]
              }
            }
          },
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              email: 1,
              phone: 1,
              profile: 1
            }
          }
        ],
        as: "serviceUserData"
      }
    },
    {
      $unwind: {
        path: "$serviceUserData",
        preserveNullAndEmptyArrays: true
      }
    },
    // Bookmark Lookup
    {
      $lookup: {
        from: "bookmarks",
        let: { serviceId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$service", "$$serviceId"]
                  },
                  {
                    $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)]
                  },
                  {
                    $eq: ["$isDeleted", false]
                  }
                ]
              }
            }
          }
        ],
        as: "bookmarkData"
      }
    },
    // ✅ REVIEWS LOOKUP
    {
      $lookup: {
        from: "reviews",
        let: {
          serviceId: "$_id"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$service", "$$serviceId"]
                  },
                  {
                    $eq: ["$isDeleted", false]
                  }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              averageRating: {
                $avg: "$rating"
              },
              totalReviews: {
                $sum: 1
              }
            }
          }
        ],
        as: "ratingData"
      }
    },
    // ✅ ADD FIELDS
    {
      $addFields: {
        distance: {
          $round: [
            {
              $divide: ["$distance", 1000]
            },
            2
          ]
        },
        distanceInKm: {
          $round: [
            {
              $divide: ["$distance", 1000]
            },
            2
          ]
        },
        isFavorite: {
          $gt: [{ $size: "$bookmarkData" }, 0]
        },
        averageRating: {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: ["$ratingData.averageRating", 0]
                },
                1
              ]
            },
            0
          ]
        },
        totalReviews: {
          $ifNull: [
            {
              $arrayElemAt: ["$ratingData.totalReviews", 0]
            },
            0
          ]
        }
      }
    },
    // ✅ SORT
    {
      $sort: {
        distance: 1,
        averageRating: -1,
        totalReviews: -1
      }
    },
    // ✅ PAGINATION
    {
      $skip: skip
    },
    {
      $limit: parsedLimit
    },
    // ✅ REMOVE UNWANTED FIELDS
    {
      $project: {
        ratingData: 0,
        bookmarkData: 0
      }
    }
  ];

  // ✅ EXECUTE
  const data = await Service.aggregate(pipeline);

  // ✅ TOTAL COUNT
  const total = await Service.countDocuments(geoNearQuery);

  // ✅ RESPONSE
  return res.status(200).json({
    success: true,
    page: parsedPage,
    limit: parsedLimit,
    total,
    totalPages: Math.ceil(total / parsedLimit),
    count: data.length,
    data
  });
});

// ======================================================
// 3. RECOMMENDED SERVICES
// ======================================================

const getRecommendedServices = catchAsyncError(async (req, res) => {
  const {
    lat,
    lng,
    limit = 10,
    page = 1
  } = req.query;

  // ✅ VALIDATE COORDINATES
  if (!lat || !lng) {
    return res.status(400).json({
      success: false,
      message: "Latitude and longitude are required"
    });
  }

  // ✅ PAGINATION
  const parsedLimit = Math.min(Number(limit) || 10, 50);
  const parsedPage = Math.max(Number(page) || 1, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const user = await User.findById(req.user._id, { phone: 1 }).lean();
  let serviceUserIds = [];

  if (user && user.phone) {
    const serviceUsers = await ServiceUser.find({ phone: user.phone }, "_id").lean();
    serviceUserIds = serviceUsers.map((su) => su._id);
  }

  const geoNearQuery = {
    isRecommended: true,
    isDeleted: false,
    isActive: { $ne: false },
    approvalStatus: "approved",
    "location.coordinates.coordinates": {
      $exists: true,
      $ne: []
    }
  };

  if (serviceUserIds.length > 0) {
    geoNearQuery.user = { $nin: serviceUserIds };
  }

  // ✅ PIPELINE
  const pipeline = [
    // ✅ GEO SEARCH
    {
      $geoNear: {
        key: "location.coordinates",
        near: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)]
        },
        distanceField: "distance",
        spherical: true,
        query: geoNearQuery
      }
    },
    // Category Lookup
    {
      $lookup: {
        from: "servicecategories",
        localField: "category",
        foreignField: "_id",
        as: "categoryData"
      }
    },
    {
      $unwind: {
        path: "$categoryData",
        preserveNullAndEmptyArrays: true
      }
    },
    // Service User Lookup
    {
      $lookup: {
        from: "serviceusers",
        let: { userId: "$user" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$userId"]
              }
            }
          },
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              email: 1,
              phone: 1,
              profile: 1
            }
          }
        ],
        as: "serviceUserData"
      }
    },
    {
      $unwind: {
        path: "$serviceUserData",
        preserveNullAndEmptyArrays: true
      }
    },
    // Bookmark Lookup
    {
      $lookup: {
        from: "bookmarks",
        let: { serviceId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$service", "$$serviceId"]
                  },
                  {
                    $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)]
                  },
                  {
                    $eq: ["$isDeleted", false]
                  }
                ]
              }
            }
          }
        ],
        as: "bookmarkData"
      }
    },
    // Review Lookup
    {
      $lookup: {
        from: "reviews",
        let: {
          serviceId: "$_id"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$service", "$$serviceId"]
                  },
                  {
                    $eq: ["$isDeleted", false]
                  }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              averageRating: {
                $avg: "$rating"
              },
              totalReviews: {
                $sum: 1
              }
            }
          }
        ],
        as: "ratingData"
      }
    },
    // ✅ DISTANCE IN KM & FIELDS
    {
      $addFields: {
        distance: {
          $round: [
            {
              $divide: ["$distance", 1000]
            },
            2
          ]
        },
        distanceInKm: {
          $round: [
            {
              $divide: ["$distance", 1000]
            },
            2
          ]
        },
        isFavorite: {
          $gt: [{ $size: "$bookmarkData" }, 0]
        },
        averageRating: {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: ["$ratingData.averageRating", 0]
                },
                1
              ]
            },
            0
          ]
        },
        totalReviews: {
          $ifNull: [
            {
              $arrayElemAt: ["$ratingData.totalReviews", 0]
            },
            0
          ]
        }
      }
    },
    // ✅ PAGINATION
    {
      $skip: skip
    },
    {
      $limit: parsedLimit
    },
    // ✅ REMOVE RAW FIELDS
    {
      $project: {
        ratingData: 0,
        bookmarkData: 0
      }
    }
  ];

  // ✅ GET DATA
  const data = await Service.aggregate(pipeline);

  // ✅ TOTAL COUNT
  const total = await Service.countDocuments(geoNearQuery);

  // ✅ RESPONSE
  return res.status(200).json({
    success: true,
    page: parsedPage,
    limit: parsedLimit,
    total,
    totalPages: Math.ceil(total / parsedLimit),
    count: data.length,
    data
  });
});

// ======================================================
// 4. NEAR YOU SERVICES
// ======================================================

const getNearYouServices = catchAsyncError(async (req, res) => {
  const {
    lat,
    lng,
    limit = 10,
    page = 1
  } = req.query;

  // ✅ VALIDATION
  if (!lat || !lng) {
    return res.status(400).json({
      success: false,
      message: "Latitude and longitude are required"
    });
  }

  const parsedLimit = Math.min(Number(limit) || 10, 50);
  const parsedPage = Math.max(Number(page) || 1, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const user = await User.findById(req.user._id, { phone: 1 }).lean();
  let serviceUserIds = [];

  if (user && user.phone) {
    const serviceUsers = await ServiceUser.find({ phone: user.phone }, "_id").lean();
    serviceUserIds = serviceUsers.map((su) => su._id);
  }

  const geoNearQuery = {
    isDeleted: false,
    isActive: { $ne: false },
    approvalStatus: "approved",
    "location.coordinates.coordinates": {
      $exists: true,
      $ne: []
    }
  };

  if (serviceUserIds.length > 0) {
    geoNearQuery.user = { $nin: serviceUserIds };
  }

  // ✅ PIPELINE
  const pipeline = [
    // ✅ GEO SEARCH
    // automatically nearest → farthest
    {
      $geoNear: {
        key: "location.coordinates",
        near: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)]
        },
        distanceField: "distance",
        spherical: true,
        includeLocs: "location.coordinates",
        query: geoNearQuery
      }
    },
    // Category Lookup
    {
      $lookup: {
        from: "servicecategories",
        localField: "category",
        foreignField: "_id",
        as: "categoryData"
      }
    },
    {
      $unwind: {
        path: "$categoryData",
        preserveNullAndEmptyArrays: true
      }
    },
    // Service User Lookup
    {
      $lookup: {
        from: "serviceusers",
        let: { userId: "$user" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$userId"]
              }
            }
          },
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              email: 1,
              phone: 1,
              profile: 1
            }
          }
        ],
        as: "serviceUserData"
      }
    },
    {
      $unwind: {
        path: "$serviceUserData",
        preserveNullAndEmptyArrays: true
      }
    },
    // ✅ BOOKMARK LOOKUP
    {
      $lookup: {
        from: "bookmarks",
        let: { serviceId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$service", "$$serviceId"]
                  },
                  {
                    $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)]
                  },
                  {
                    $eq: ["$isDeleted", false]
                  }
                ]
              }
            }
          }
        ],
        as: "bookmarkData"
      }
    },
    // ✅ REVIEW LOOKUP
    {
      $lookup: {
        from: "reviews",
        let: {
          serviceId: "$_id"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$service", "$$serviceId"]
                  },
                  {
                    $eq: ["$isDeleted", false]
                  }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              averageRating: {
                $avg: "$rating"
              },
              totalReviews: {
                $sum: 1
              }
            }
          }
        ],
        as: "ratingData"
      }
    },
    // ✅ EXTRA FIELDS
    {
      $addFields: {
        distance: {
          $round: [
            {
              $divide: ["$distance", 1000]
            },
            2
          ]
        },
        distanceInKm: {
          $round: [
            {
              $divide: ["$distance", 1000]
            },
            2
          ]
        },
        isFavorite: {
          $gt: [{ $size: "$bookmarkData" }, 0]
        },
        averageRating: {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: ["$ratingData.averageRating", 0]
                },
                1
              ]
            },
            0
          ]
        },
        totalReviews: {
          $ifNull: [
            {
              $arrayElemAt: ["$ratingData.totalReviews", 0]
            },
            0
          ]
        }
      }
    },
    // ✅ PAGINATION
    {
      $skip: skip
    },
    {
      $limit: parsedLimit
    },
    // ✅ REMOVE FIELDS
    {
      $project: {
        ratingData: 0,
        bookmarkData: 0
      }
    }
  ];

  // ✅ EXECUTE
  const data = await Service.aggregate(pipeline);

  // ✅ TOTAL COUNT
  const total = await Service.countDocuments(geoNearQuery);

  // ✅ RESPONSE
  return res.status(200).json({
    success: true,
    page: parsedPage,
    limit: parsedLimit,
    total,
    totalPages: Math.ceil(total / parsedLimit),
    count: data.length,
    data
  });
});

const deleteAccount = catchAsyncError(async (req, res) => {
  const userId = req.user._id;

  // Soft delete
  await User.findByIdAndUpdate(userId, {
    isDeleted: true,
    deletedAt: new Date(),
    tokens: [],
  });

  return res.status(200).json({
    success: true,
    message: "Account deleted successfully",
  });
});


const shareItem = catchAsyncError(async (req, res) => {

  const { id, type } = req.params;

  let data = null;

  // ✅ SERVICE
  if (type === "service") {

    data = await Service.findOne({
      _id: id,
      isDeleted: false,
      isActive: true,
      approvalStatus: "approved",
    }).select("name shareCode");

  }

  // ✅ PROPERTY
  if (type === "property") {

    data = await Properties.findOne({
      _id: id,
      isDeleted: false,
      isActive: { $ne: false },
      approvalStatus: "approved",
    }).select("name shareCode");

  }

  if (!data) {
    return res.status(404).json({
      success: false,
      message: `${type} not found`,
    });
  }

  // ✅ FRONTEND URL
  const baseUrl = process.env.APP_DEEP_LINK;

  // ✅ SHAREABLE LINK
  const shareLink = `${baseUrl}${type}/${id}?code=${data.shareCode}`;

  return res.status(200).json({
    success: true,
    message: "Share data fetched successfully",
    data: {
      id: data._id,
      name: data.name,
      shareCode: data.shareCode,
      shareLink,
      shareMessage:
        `Check this ${type} on Out App\n\n` +
        `Code: ${data.shareCode}\n\n` +
        `Link: ${shareLink}`
    }
  });
});

const shareServiceUserProfile = catchAsyncError(async (req, res) => {

  const { userId } = req.params;

  const serviceUser = await ServiceUser.findOne({
    _id: userId,
    isDeleted: false,
    isActive: true,
  }).select(
    "firstName lastName userId profileImage"
  );

  if (!serviceUser) {
    return res.status(404).json({
      success: false,
      message: "Service user not found",
    });
  }

  // ✅ FRONTEND URL
  const baseUrl = process.env.APP_DEEP_LINK;

  // ✅ SHAREABLE LINK
  const shareLink =
    `${baseUrl}provider/${serviceUser.userId}`;

  return res.status(200).json({
    success: true,
    message: "Profile share data fetched successfully",
    data: {
      id: serviceUser._id,

      name:
        `${serviceUser.firstName} ${serviceUser.lastName}`,

      userId: serviceUser.userId,

      profileImage: serviceUser.profileImage,

      shareLink,

      shareMessage:
        `Check this provider profile on Out App\n\n` +
        `Provider ID: ${serviceUser.userId}\n\n` +
        `Link: ${shareLink}`
    }
  });
});

const getOtherUserProfile = catchAsyncError(async (req, res, next) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID"
    });
  }

  // 1. Search in User collection
  let user = await User.findById(userId, {
    firstName: 1,
    lastName: 1,
    profile: 1,
    role: 1,
    createdAt: 1
  }).lean();

  let targetModel = "User";

  // 2. If not found in User, search in ServiceUser collection
  if (!user) {
    user = await ServiceUser.findById(userId, {
      firstName: 1,
      lastName: 1,
      profile: 1,
      role: 1,
      createdAt: 1
    }).lean();
    targetModel = "ServiceUser";
  }

  // 3. If still not found, return 404
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }

  // 4. Format user details
  const userObj = {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    profile: user.profile,
    role: user.role || (targetModel === "ServiceUser" ? "service_user" : "user"),
    joinedStatus: getJoinedStatus(user.createdAt),
    createdAt: user.createdAt
  };

  // 5. Query overall reviews stats (where reviewee = userId)
  const reviewStats = await Review.aggregate([
    {
      $match: {
        reviewee: new mongoose.Types.ObjectId(userId),
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        avgRating: { $avg: "$rating" }
      }
    }
  ]);

  const totalReviews = reviewStats[0]?.totalReviews || 0;
  const avgRating = reviewStats[0]?.avgRating ? Number(reviewStats[0].avgRating.toFixed(1)) : 0;

  // 6. Query recent reviews (last 10)
  const reviews = await Review.find({
    reviewee: userId,
    isDeleted: false
  })
    .populate("reviewer", "firstName lastName profile createdAt")
    .sort({ createdAt: -1 })
    .limit(10);

  // 7. Map recent reviews
  const formattedReviews = reviews.map(review => {
    const reviewObj = review.toObject();
    if (reviewObj.reviewer) {
      reviewObj.reviewer.joinedStatus = getJoinedStatus(reviewObj.reviewer.createdAt);
      reviewObj.reviewer.fullName = `${reviewObj.reviewer.firstName || ""} ${reviewObj.reviewer.lastName || ""}`.trim();
    }
    reviewObj.timeAgo = getTimeAgo(reviewObj.createdAt);
    return reviewObj;
  });

  return res.status(200).json({
    success: true,
    data: {
      user: userObj,
      stats: {
        totalReviews,
        avgRating
      },
      recentReviews: formattedReviews
    }
  });
});

module.exports = {
  userLogin,
  userSignUp,
  userVerifyOTP,
  getUser,
  resendOTP,
  logout,
  updateProfile,
  getCategory,
  addBooking,
  addBookMark,
  listBookMark,
  deleteBookmark,
  getAllProperties,
  testAuthentica,
  getPropertiesByCategory,
  getHomeProperties,
  createPayment,
  getDashboard,
  getUserBanners,
  getPropertyDetail,
  createBooking,
  createToken,
  getAvailableCoupons,
  getPlatformCharges,
  search,
  getLatestServices,
  getServiceDetail,
  toggleFavorite,
  getUserFavorites,
  googleLogin,
  createUserReview,
  getReviews,
  getUserReviews,
  getGivenReviews,
  getServiceUser,
  serviceUserLoginByUserToken,
  getServicesByCategory,
  getRecentlyViewedProperties,
  getTopRatedProperties,
  getRecommendedProperties,
  getNearYouProperties,
  getRecentlyViewedServices,
  getTopRatedServices,
  getRecommendedServices,
  getNearYouServices,
  deleteAccount,
  shareItem,
  shareServiceUserProfile,
  getOtherUserProfile,
  getUserWallet,
  getUserWalletTransactions,
  redeemGiftCard,
  getAvailableGiftCards,
};
