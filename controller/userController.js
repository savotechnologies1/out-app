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
const { getDatesBetween } = require("../utils/date");
const catchAsyncError = require("../functions/catchAsyncError");
const { checkValidations } = require("../functions/checkValidation");
const { validationResult } = require("express-validator");
const Category = require("../models/Category");
const moment = require("moment");
const { authenticaOTP } = require("../functions/authentica");
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

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        OTP: otp,
        ...(fcmToken && { fcmToken: fcmToken })
      },
    }
  );

  await authenticaOTP(otp, user.email, user.phone);

  return res.status(200).send({
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
  const user = await User.create({
    salutation,
    firstName,
    lastName,
    userId: `UID-${randomId}`,
    email: email && email.trim() !== "" ? email : null, // ✅ optional email
    phone,
    phoneCode: mobileCode,
    OTP: otp,
  });
  await authenticaOTP(otp, user.email, user.phone);
  return res.status(201).send({
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
    { phone: 1, OTP: 1, isVerified: 1, phoneCode: 1, role: 1 }
  ).lean(true);

  if (!user) return res.status(400).send({ message: "User not found" });

  if (user?.OTP !== otp)
    return res.status(400).send({ message: "Invalid OTP" });

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
    $unset: { OTP: "" },
  };

  if (user.isVerified) {
    obj = { $push: { tokens: token }, $unset: { OTP: "" } };
  }

  User.updateOne({ _id: user._id }, obj).then();

  return res.status(200).send({
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

  return res.status(200).send({ data: user });
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
  const { mobile, mobileCode } = req.body;

  // ✅ normalize number
  let formattedMobile = mobile;
  if (!String(mobile).startsWith("+")) {
    formattedMobile = `${mobileCode}${mobile}`;
  }

  const [user, serviceUser] = await Promise.all([
    User.findOne({ phone: formattedMobile }).lean(),
    ServiceUser.findOne({ phone: formattedMobile }).lean(),
  ]);

  if (!user && !serviceUser) {
    return res.status(400).send({
      success: false,
      data: null,
      message: "User not found",
    });
  }

  const otp = generateRandomOTP();

  if (user) {
    await User.updateOne({ _id: user._id }, { $set: { OTP: otp } });
  }

  if (serviceUser) {
    await ServiceUser.updateOne(
      { _id: serviceUser._id },
      { $set: { OTP: otp } }
    );
  }

  return res.status(200).send({
    success: true,
    data: { otp },
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

    return res.status(200).send({
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

  return res.status(200).send({
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

  return res.status(200).send({
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

  return res.status(200).send({ message: "Please verify OTP" });
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

  return res.status(200).send({ message: "Bookmark added successfully" });
});

const listBookMark = catchAsyncError(async (req, res, next) => {
  const data = await Bookmark.find({ createdBy: req.user._id }).lean(true);

  return res.status(200).send({
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

  return res.status(200).send({ message: "ok" });
});

const createPayment = catchAsyncError(async (req, res, next) => {

  const paymentUrl = await createCharge({
    tokenId: req.body.tokenId,
    amount: req.body.amount,
  });

  return res.status(200).send({ data: paymentUrl, message: "ok" });
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
      isDeleted: false
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


// const getPropertyDetail = catchAsyncError(async (req, res) => {

//   const data = (await Properties.aggregate([

//     {
//       $match: {
//         isDeleted: false,
//         _id: new mongoose.Types.ObjectId(req.params.id)
//       }
//     },

//     // Category lookup
//     {
//       $lookup: {
//         from: "categories",
//         let: { categoryId: "$category" },
//         pipeline: [
//           {
//             $match: {
//               $expr: {
//                 $and: [
//                   { $eq: ["$_id", "$$categoryId"] },
//                   { $eq: ["$isDeleted", false] }
//                 ]
//               }
//             }
//           },
//           {
//             $project: {
//               category: 1
//             }
//           }
//         ],
//         as: "categoryData"
//       }
//     },

//     {
//       $addFields: {
//         category: { $arrayElemAt: ["$categoryData.category", 0] }
//       }
//     },

//     {
//       $project: {
//         categoryData: 0
//       }
//     },

//     // 🔥 Bookmark lookup
//     {
//       $lookup: {
//         from: "bookmarks",
//         let: { propertyId: "$_id" },
//         pipeline: [
//           {
//             $match: {
//               $expr: {
//                 $and: [
//                   { $eq: ["$property", "$$propertyId"] },
//                   { $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)] },
//                   { $eq: ["$isDeleted", false] }
//                 ]
//               }
//             }
//           }
//         ],
//         as: "bookmarkData"
//       }
//     },

//     // Add isFavorite flag
//     {
//       $addFields: {
//         isFavorite: {
//           $cond: {
//             if: { $gt: [{ $size: "$bookmarkData" }, 0] },
//             then: true,
//             else: false
//           }
//         }
//       }
//     },

//     // Clean response
//     {
//       $project: {
//         bookmarkData: 0
//       }
//     }

//   ]))[0];

//   return res.status(200).send({
//     data,
//     message: data ? "Property detail received successfully" : "No property found",
//   });
// });


const getPropertyDetail = catchAsyncError(async (req, res) => {

  const data = (await Properties.aggregate([

    {
      $match: {
        isDeleted: false,
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
  return res.status(200).send({
    data,
    message: data
      ? "Property detail received successfully"
      : "No property found",
  });

});


const createToken = catchAsyncError(async (req, res) => {

  const data = await createTokenForCard(req.body);

  return res.status(200).send({
    data,
    message: "Token created successfully",
  });
})
const createBooking = async (req, res) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { hotelId, checkIn, checkOut } = req.body;
    const userId = req.user.id;

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

    return res.status(201).json(booking);

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

    const filter = {
      isActive: true,
      isDelete: false,
      startDate: { $lte: new Date() },
      expiryDate: { $gte: new Date() },
      "usedBy.user": { $ne: userId }
    };

    // If user has bookings → hide first time coupons
    if (hasBooking) {
      filter.firstTimeUserOnly = false;
    }

    const coupons = await Coupon.find(filter)
      .select(
        "code discountType discountValue minAmount maxDiscount firstTimeUserOnly startDate expiryDate"
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
  } = req.body;

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
            is_completed: true,
            approvalStatus: "approved"
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
    const properties = await Properties.aggregate([

      // ✅ GEO SEARCH INSIDE RADIUS CIRCLE
      {
        $geoNear: {

          near: {
            type: "Point",
            coordinates
          },

          distanceField: "distance",

          spherical: true,

          // ✅ CORRECT KEY
          key: "address.location",

          maxDistance: radius,

          query: {
            isDeleted: false,
            is_completed: true,
            approvalStatus: "approved",
            maxGuests: {
              $gte: Number(totalGuest)
            },

            "address.location.coordinates": {
              $exists: true,
              $ne: []
            }
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
      },

      // =====================================================
      // Availability check
      // =====================================================

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

                    ...(checkIn && checkOut
                      ? [
                        {
                          $gte: [
                            "$date",
                            new Date(checkIn)
                          ]
                        },
                        {
                          $lte: [
                            "$date",
                            new Date(checkOut)
                          ]
                        }
                      ]
                      : [])

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
      },

      // =====================================================
      // FAVORITE LOOKUP
      // =====================================================

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

      // =====================================================
      // FINAL RESPONSE
      // =====================================================

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

    ]);

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
            approvalStatus: "approved"
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
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(checkOut);
    endDate.setHours(23, 59, 59, 999);

    const daysArray = [];

    let current = new Date(startDate);

    while (current <= endDate) {

      daysArray.push(
        current.toLocaleString(
          "en-US",
          { weekday: "long" }
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

          // ✅ MUST MATCH INDEX FIELD
          key: "location.coordinates",

          maxDistance: radius,

          query: {
            isDeleted: false,
            isActive: true,
            approvalStatus: "approved",

            "location.coordinates.coordinates": {
              $exists: true,
              $ne: []
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
                "$workingDays",
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
                        "$workingDays",
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
                        { $toString: "$service" },
                        { $toString: "$$serviceId" }
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

      {
        $match: {
          bookedSlots: {
            $size: 0
          }
        }
      },

      {
        $project: {
          name: 1,
          price: 1,
          location: 1,
          media: 1,
          workingDays: 1,
          distance: 1,
          matchedDaysCount: 1,
          isExactMatch: 1
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
      })
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
        select: "firstName lastName name profile image"
      })
      .select("rating comment createdAt reviewer")
      .lean();

    service.latestReviews = latestReviews;

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

      .populate(
        "property",
        `
        name
        price
        area
        address
        media.mainImage
        bedRoom
        restRoom
        `
      )

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

    const formatted = favorites.map(fav => ({

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

    if (!["property", "service"].includes(reviewType)) {
      return res.status(400).json({ message: "Invalid reviewType" });
    }

    const booking = await Booking.findById(bookingId)
      .populate("property")
      .populate("services.service");

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (new Date() < new Date(booking.checkOut)) {
      return res.status(400).json({ message: "Review allowed only after checkout" });
    }

    let reviewee, revieweeModel, property = null, service = null;

    if (reviewType === "property") {
      if (!booking.property) return res.status(400).json({ message: "No property in booking" });
      reviewee = booking.property.user;
      revieweeModel = "ServiceUser";
      property = booking.property._id;
    }

    if (reviewType === "service") {
      if (!serviceId) return res.status(400).json({ message: "serviceId required" });
      const serviceItem = booking.services.find(s => s.service && s.service._id.toString() === serviceId);
      if (!serviceItem) return res.status(400).json({ message: "Service not in booking" });
      reviewee = serviceItem.service.user;
      revieweeModel = "ServiceUser";
      service = serviceId;
    }

    const exists = await Review.findOne({
      booking: bookingId,
      reviewer: req.user._id,
      property: property || null,
      service: service || null
    });

    if (exists) return res.status(400).json({ message: "Already reviewed" });

    if (!ratingsBreakdown || Object.keys(ratingsBreakdown).length === 0) {
      return res.status(400).json({ message: "ratingsBreakdown is required" });
    }

    const values = Object.values(ratingsBreakdown)
      .map(v => Number(v))
      .filter(v => !isNaN(v));

    if (values.length === 0) return res.status(400).json({ message: "ratingsBreakdown must contain numbers" });

    const finalRating = values.reduce((a, b) => a + b, 0) / values.length;

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
      ratingsBreakdown,
      comment,
      photos
    });
    await Booking.findByIdAndUpdate(bookingId, { reviewGiven: true });
    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: review
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
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

    /* ========================
       🔥 FETCH REVIEWS
    ======================== */
    const reviews = await Review.find(match)
      .populate("reviewer", "firstName lastName profile")
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
          service: { $avg: "$ratingsBreakdown.service" },
          location: { $avg: "$ratingsBreakdown.location" },
          value: { $avg: "$ratingsBreakdown.value" },

          ratings: { $push: "$rating" }
        }
      }
    ]);

    let summary = {
      avgRating: 0,
      totalReviews: 0,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      categoryAvg: {}
    };

    if (summaryAgg.length) {
      const data = summaryAgg[0];

      // ⭐ rating distribution
      const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      data.ratings.forEach(r => {
        const rounded = Math.round(r);
        breakdown[rounded]++;
      });

      summary = {
        avgRating: Number(data.avgRating.toFixed(1)),
        totalReviews: data.totalReviews,
        breakdown,
        categoryAvg: {
          cleanliness: data.cleanliness || 0,
          service: data.service || 0,
          location: data.location || 0,
          value: data.value || 0
        }
      };
    }

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

      data: reviews
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
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
      $project: {
        rating: 1,
        review: 1,
        createdAt: 1,

        reviewer: {
          _id: "$reviewerData._id",
          firstName: "$reviewerData.firstName",
          lastName: "$reviewerData.lastName",
          profile: "$reviewerData.profile"
        }
      }
    }

  ]);

  /* ========================
     📦 FINAL RESPONSE
  ======================== */

  return res.status(200).send({
    data: {
      ...user,

      stats: {
        trips: totalTrips,
        reviews: totalReviews,
        avgRating: Number(avgRating.toFixed(1)),
        earnings: totalEarnings,
        months: months < 0 ? 0 : months
      },

      reviewList
    }
  });
});

const serviceUserLoginByUserToken = catchAsyncError(
  async (req, res, next) => {

    const { fcmToken } = req.body;

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

    return res.status(200).send({
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

  const matchStage = {
    user: new mongoose.Types.ObjectId(req.user._id)
  };

  if (lastId && mongoose.Types.ObjectId.isValid(lastId)) {
    matchStage._id = {
      $lt: new mongoose.Types.ObjectId(lastId)
    };
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
      $match: {
        "propertyData.isDeleted": false,
        "propertyData.is_completed": true,
        "propertyData.approvalStatus": "approved"
      }
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

        query: {

          isDeleted: false,

          is_completed: true,

          approvalStatus: "approved",

          "address.location.coordinates": {
            $exists: true,
            $ne: []
          }

        }

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
  const total = await Properties.countDocuments({

    isDeleted: false,

    is_completed: true,

    approvalStatus: "approved",

    "address.location.coordinates": {
      $exists: true,
      $ne: []
    }

  });

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

        query: {

          isRecommended: true,

          isDeleted: false,

          is_completed: true,

          approvalStatus: "approved",

          // ✅ VALID GEO DOCS
          "address.location.coordinates": {
            $exists: true,
            $ne: []
          }

        }

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
  const total = await Properties.countDocuments({

    isRecommended: true,

    isDeleted: false,

    is_completed: true,

    approvalStatus: "approved",

    "address.location.coordinates": {
      $exists: true,
      $ne: []
    }

  });

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

        query: {

          isDeleted: false,

          is_completed: true,

          approvalStatus: "approved",

          "address.location.coordinates": {
            $exists: true,
            $ne: []
          }

        }

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
  const total = await Properties.countDocuments({

    isDeleted: false,

    is_completed: true,

    approvalStatus: "approved",

    "address.location.coordinates": {
      $exists: true,
      $ne: []
    }

  });

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
  getServiceUser,
  serviceUserLoginByUserToken,
  getServicesByCategory,
  getRecentlyViewedProperties,
  getTopRatedProperties,
  getRecommendedProperties,
  getNearYouProperties,
  deleteAccount,
  shareItem
};
