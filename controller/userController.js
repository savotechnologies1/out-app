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

const userLogin = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const { mobile, mobileCode } = req.body;

  const user = await User.findOne({ phone: `${mobileCode}${mobile}` })
  if (!user.isActive) {
    res.status(403).json({ message: "Your account is suspended please contact the support" })
  }
  if (!user) return res.status(400).send({ message: "User not found" });

  const otp = generateRandomOTP();

  User.updateOne({ _id: user._id }, { $set: { OTP: otp } }).then();

  authenticaOTP(otp, user.email, user.phone);

  return res
    .status(200)
    .send({ data: { id: user._id }, message: "Login successfully" });
});

const userSignUp = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const { salutation, firstName, lastName, email, mobile, mobileCode } =
    req.body;

  const userExist = await User.countDocuments({
    $or: [{ email: email }, { phone: `${mobileCode}${mobile}` }],
  });

  if (userExist) {
    return res
      .status(400)
      .send({ message: "User already exist with this email or mobile" });
  }

  const otp = generateRandomOTP();
  const randomId = generateRandomId();

  const user = await User.create({
    salutation,
    firstName,
    userId: `UID-${randomId}`,
    lastName,
    email,
    phone: `${mobileCode}${mobile}`,
    phoneCode: mobileCode,
    OTP: otp,
  });

  authenticaOTP(otp, user.email, user.phone);

  return res.status(200).send({
    data: { id: user._id, mobile: user.phone },
    message: "Please verify OTP",
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

  if (!user) return res.status(400).send({ message: "User not found" });

  user["phone"] = await codeRem(user.phone);

  return res.status(200).send({ data: user });
});

const resendOTP = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);

  const checkValid = await checkValidations(errors);
  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const { mobile } = req.body;

  const [user, serviceUser] = await Promise.all([
    User.findOne({ phone: mobile }).lean(true),
    ServiceUser.findOne({ phone: mobile }).lean(true),
  ]);

  if (!user && !serviceUser)
    return res.status(400).send({ message: "User not found" });

  const otp = generateRandomOTP();

  await Promise.all([
    User.updateOne({ _id: user?._id }, { $set: { OTP: otp } }),
    ServiceUser.updateOne({ _id: serviceUser?._id }, { $set: { OTP: otp } }),
  ]);

  return res
    .status(200)
    .send({ data: { otp }, message: "Resent OTP successfully" });
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

  const errors = validationResult(req);
  console.log("req.user:", req.user);
  const checkValid = await checkValidations(errors);
  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const obj = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    phone: `${req.body.mobileCode}${req.body.mobile}`,
    phoneCode: req.body.mobileCode,
  };

  if (userProfileFiles && userProfileFiles.length) {
    obj["profile"] = userProfileFiles[0].filename;
  }

  User.updateOne({ _id: req.user._id }, { $set: obj }).then();


  return res.status(200).send({ message: "Profile updated successfully" });
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

const deleteBookmark = catchAsyncError(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Please enter valid Id" });
  }

  Bookmark.deleteOne({ _id: req.params.id }).then();
  return res.status(200).send({ message: "Bookmark deleted successfully" });
});

const test = catchAsyncError(async (req, res, next) => {
  const fs = require("fs");

  const code = fs.readFileSync("./code.js", "utf8");

  console.log(code);

  const data = eval(code);

  return res.status(200).send({ data, message: "ok" });
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

// const getPropertiesByCategory = catchAsyncError(async (req, res) => {
//   const { category } = req.params;
//   let { lastId, limit = 10 } = req.query;

//   limit = Math.min(parseInt(limit) || 10, 20); // max 20

//   if (!category) {
//     return res.status(400).json({
//       success: false,
//       message: "Category is required"
//     });
//   }

//   let categoryDoc;

//   if (mongoose.Types.ObjectId.isValid(category)) {
//     categoryDoc = await Category.findOne({
//       _id: category,
//       isDeleted: false
//     }).lean();
//   } else {
//     categoryDoc = await Category.findOne({
//       category: { $regex: new RegExp(`^${category}$`, "i") },
//       isDeleted: false
//     }).lean();
//   }

//   if (!categoryDoc) {
//     return res.status(404).json({
//       success: false,
//       message: "Category not found"
//     });
//   }

//   const propertyQuery = {
//     category: categoryDoc._id,
//     isDeleted: false,
//     is_completed: true,
//     approvalStatus: "approved"
//   };

//   if (lastId && mongoose.Types.ObjectId.isValid(lastId)) {
//     propertyQuery._id = { $lt: new mongoose.Types.ObjectId(lastId) };
//   }

//   const properties = await Properties.find(propertyQuery)
//     .select("name price media.mainImage address.city maxGuests category createdAt")
//     .populate({
//       path: "category",
//       select: "category image"
//     })
//     .sort({ _id: -1 })
//     .limit(limit + 1)
//     .lean();

//   const hasMore = properties.length > limit;

//   if (hasMore) properties.pop();

//   return res.status(200).json({
//     success: true,
//     sectionTitle: `Top ${categoryDoc.category}`,
//     categoryId: categoryDoc._id,
//     lastId: properties.length ? properties[properties.length - 1]._id : null,
//     hasMore,
//     count: properties.length,
//     data: properties
//   });
// });

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
    // approvalStatus: "approved"
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
    // approvalStatus: "approved"
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

    {
      $lookup: {
        from: "amenities",
        localField: "propertyAmenities",
        foreignField: "_id",
        as: "propertyAmenities"
      }
    },

    {
      $lookup: {
        from: "features",
        localField: "propertyFeatures",
        foreignField: "_id",
        as: "propertyFeatures"
      }
    },

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
                  { $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)] },
                  { $eq: ["$isDeleted", false] }
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
          $cond: {
            if: { $gt: [{ $size: "$bookmarkData" }, 0] },
            then: true,
            else: false
          }
        }
      }
    },

    {
      $project: {
        bookmarkData: 0
      }
    },

    // Group by category
    {
      $group: {
        _id: "$categoryData._id",
        categoryName: { $first: "$categoryData.category" },
        properties: { $push: "$$ROOT" }
      }
    },

    // Limit 5 properties per category
    {
      $project: {
        _id: 0,
        categoryId: "$_id",
        categoryName: 1,
        properties: { $slice: ["$properties", 5] }
      }
    }

  ]).allowDiskUse(true);

  // Pagination cursor
  let nextCursor = null;

  if (data.length > 0) {
    const lastCategory = data[data.length - 1];
    const lastProperty = lastCategory.properties[lastCategory.properties.length - 1];
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

  const data = (await Properties.aggregate([

    {
      $match: {
        isDeleted: false,
        _id: new mongoose.Types.ObjectId(req.params.id)
      }
    },

    // Category lookup
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

    // 🔥 Bookmark lookup
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
                  { $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)] },
                  { $eq: ["$isDeleted", false] }
                ]
              }
            }
          }
        ],
        as: "bookmarkData"
      }
    },

    // Add isFavorite flag
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

    // Clean response
    {
      $project: {
        bookmarkData: 0
      }
    }

  ]))[0];

  return res.status(200).send({
    data,
    message: data ? "Property detail received successfully" : "No property found",
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


// const search = catchAsyncError(async (req, res) => {

//   const {
//     type,
//     searchMode = "NEARBY",
//     lat,
//     lng,
//     totalGuest = 1,
//     checkIn,
//     checkOut,
//   } = req.body;

//   if (!lat || !lng) {
//     return res.status(400).json({
//       success: false,
//       message: "Latitude and longitude required"
//     });
//   }

//   const coordinates = [Number(lng), Number(lat)];

//   // ---------------- Radius Logic ----------------
//   let radius = 50000;

//   if (searchMode === "CITY") radius = 30000;
//   if (searchMode === "ANYWHERE") radius = 200000;

//   // =========================================================
//   // ================= PROPERTY SEARCH =======================
//   // =========================================================

//   if (type === "PROPERTY") {

//     const properties = await Properties.aggregate([

//       {
//         $geoNear: {
//           near: {
//             type: "Point",
//             coordinates
//           },
//           distanceField: "distance",
//           spherical: true,
//           key: "address.location.coordinates", // FIXED
//           maxDistance: radius,
//           distanceMultiplier: 0.001
//         }
//       },

//       {
//         $match: {
//           isDeleted: false,
//           is_completed: true,
//           approvalStatus: "approved",
//           maxGuests: { $gte: Number(totalGuest) } // ADDED
//         }
//       },

//       {
//         $lookup: {
//           from: "hotelavailabilities",
//           let: { propertyId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     { $eq: ["$hotel", "$$propertyId"] },
//                     { $eq: ["$isBooked", true] },

//                     ...(checkIn && checkOut
//                       ? [
//                         { $gte: ["$date", new Date(checkIn)] },
//                         { $lte: ["$date", new Date(checkOut)] }
//                       ]
//                       : [])
//                   ]
//                 }
//               }
//             }
//           ],
//           as: "bookedDates"
//         }
//       },

//       {
//         $match: {
//           bookedDates: { $size: 0 }
//         }
//       },

//       {
//         $project: {
//           name: 1,
//           price: 1,
//           maxGuests: 1,
//           address: 1,
//           media: 1,
//           distance: { $round: ["$distance", 2] }
//         }
//       },

//       { $limit: 20 }

//     ]);

//     return res.json({
//       success: true,
//       type: "PROPERTY",
//       count: properties.length,
//       data: properties
//     });

//   }

//   // =========================================================
//   // ================= SERVICE SEARCH ========================
//   // =========================================================

//   if (type === "SERVICE") {

//     if (!checkIn || !checkOut) {
//       return res.status(400).json({
//         success: false,
//         message: "date is required"
//       });
//     }

//     if (!checkIn || !checkOut) {
//       return res.status(400).json({
//         success: false,
//         message: "checkIn and checkOut are required"
//       });
//     }

//     const coordinates = [Number(lng), Number(lat)];

//     // ---------------- Radius Logic ----------------
//     let radius = 50000;
//     if (searchMode === "CITY") radius = 30000;
//     if (searchMode === "ANYWHERE") radius = 200000;

//     // ✅ DATE RANGE
//     const startDate = new Date(checkIn);
//     startDate.setHours(0, 0, 0, 0);

//     const endDate = new Date(checkOut);
//     endDate.setHours(23, 59, 59, 999);

//     // ✅ OPTIONAL: get all days in range
//     const daysArray = [];
//     let current = new Date(startDate);

//     while (current <= endDate) {
//       daysArray.push(
//         current.toLocaleString("en-US", { weekday: "long" })
//       );
//       current.setDate(current.getDate() + 1);
//     }

//     const services = await Service.aggregate([

//       {
//         $geoNear: {
//           near: {
//             type: "Point",
//             coordinates
//           },
//           distanceField: "distance",
//           spherical: true,
//           key: "location.coordinates",
//           maxDistance: radius,
//           distanceMultiplier: 0.001
//         }
//       },

//       {
//         $match: {
//           isDeleted: false,
//           isActive: true,
//           approvalStatus: "approved",
//           workingDays: { $in: daysArray }
//         }
//       },

//       {
//         $lookup: {
//           from: "serviceavailabilities",
//           let: { serviceId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [

//                     {
//                       $eq: [
//                         { $toString: "$service" },
//                         { $toString: "$$serviceId" }
//                       ]
//                     },

//                     { $eq: ["$isBooked", true] },

//                     // ✅ DATE RANGE CHECK
//                     { $gte: ["$date", startDate] },
//                     { $lte: ["$date", endDate] }

//                   ]
//                 }
//               }
//             }
//           ],
//           as: "bookedSlots"
//         }
//       },

//       {
//         $match: {
//           bookedSlots: { $size: 0 }
//         }
//       },

//       {
//         $project: {
//           name: 1,
//           price: 1,
//           location: 1,
//           media: 1,
//           workingDays: 1,
//           distance: { $round: ["$distance", 2] }
//         }
//       },

//       { $limit: 20 }

//     ]);

//     return res.json({
//       success: true,
//       type: "SERVICE",
//       count: services.length,
//       data: services
//     });

//   }

//   return res.status(400).json({
//     success: false,
//     message: "Invalid type"
//   });

// });


const search = catchAsyncError(async (req, res) => {

  const {
    type,
    searchMode = "NEARBY",
    lat,
    lng,
    totalGuest = 1,
    checkIn,
    checkOut,
  } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({
      success: false,
      message: "Latitude and longitude required"
    });
  }

  const coordinates = [Number(lng), Number(lat)];

  let radius = 50000;
  if (searchMode === "CITY") radius = 30000;
  if (searchMode === "ANYWHERE") radius = 200000;

  // =========================================================
  // ================= PROPERTY SEARCH =======================
  // =========================================================

  if (type === "PROPERTY") {

    const properties = await Properties.aggregate([

      {
        $geoNear: {
          near: { type: "Point", coordinates },
          distanceField: "distance",
          spherical: true,
          key: "address.location.coordinates",
          maxDistance: radius,
          distanceMultiplier: 0.001
        }
      },

      {
        $match: {
          isDeleted: false,
          is_completed: true,
          approvalStatus: "approved",
          maxGuests: { $gte: Number(totalGuest) }
        }
      },

      // Availability check
      {
        $lookup: {
          from: "hotelavailabilities",
          let: { propertyId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$hotel", "$$propertyId"] },
                    { $eq: ["$isBooked", true] },
                    ...(checkIn && checkOut
                      ? [
                          { $gte: ["$date", new Date(checkIn)] },
                          { $lte: ["$date", new Date(checkOut)] }
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
          bookedDates: { $size: 0 }
        }
      },

      // 🔥 FAVORITE LOOKUP
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
                    { $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)] },
                    { $eq: ["$isDeleted", false] }
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
            $gt: [{ $size: "$bookmarkData" }, 0]
          }
        }
      },

      {
        $project: {
          name: 1,
          price: 1,
          maxGuests: 1,
          address: 1,
          media: 1,
          distance: { $round: ["$distance", 2] },
          isFavorite: 1
        }
      },

      { $limit: 20 }

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
        current.toLocaleString("en-US", { weekday: "long" })
      );
      current.setDate(current.getDate() + 1);
    }

    const services = await Service.aggregate([

      {
        $geoNear: {
          near: { type: "Point", coordinates },
          distanceField: "distance",
          spherical: true,
          key: "location.coordinates",
          maxDistance: radius,
          distanceMultiplier: 0.001
        }
      },

      {
        $match: {
          isDeleted: false,
          isActive: true,
          approvalStatus: "approved",
          workingDays: { $in: daysArray }
        }
      },

      {
        $lookup: {
          from: "serviceavailabilities",
          let: { serviceId: "$_id" },
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
                    { $eq: ["$isBooked", true] },
                    { $gte: ["$date", startDate] },
                    { $lte: ["$date", endDate] }
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
          bookedSlots: { $size: 0 }
        }
      },

      // 🔥 FAVORITE LOOKUP
      {
        $lookup: {
          from: "bookmarks",
          let: { serviceId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$service", "$$serviceId"] },
                    { $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)] },
                    { $eq: ["$isDeleted", false] }
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
            $gt: [{ $size: "$bookmarkData" }, 0]
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
          distance: { $round: ["$distance", 2] },
          isFavorite: 1
        }
      },

      { $limit: 20 }

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

  const { limit = 5 } = req.query;

  const services = await Service.aggregate([

    {
      $match: {
        isDeleted: false,
        isActive: true,
        approvalStatus: "approved"
      }
    },

    // Category lookup
    {
      $lookup: {
        from: "servicecategories",
        localField: "category",
        foreignField: "_id",
        as: "category"
      }
    },

    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true
      }
    },

    // 🔥 Bookmark lookup
    {
      $lookup: {
        from: "bookmarks",
        let: { serviceId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$service", "$$serviceId"] },
                  { $eq: ["$user", new mongoose.Types.ObjectId(req.user._id)] },
                  { $eq: ["$isDeleted", false] }
                ]
              }
            }
          }
        ],
        as: "bookmarkData"
      }
    },

    // Add isFavorite flag
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

    // Final projection
    {
      $project: {
        name: 1,
        price: 1,
        duration: 1,
        priceType: 1,
        media: 1,
        "location.city": 1,
        "location.state": 1,
        createdAt: 1,
        isFavorite: 1,
        category: {
          _id: "$category._id",
          name: "$category.name"
        }
      }
    },

    {
      $sort: { createdAt: -1 }
    },

    {
      $limit: Number(limit)
    }

  ]);

  return res.status(200).json({
    success: true,
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
      isActive: true
    })
      .populate({
        path: "user",
        model: "ServiceUser",
        select: "name email phone profile"
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

    // 🔥 Check if bookmarked
    const bookmark = await Bookmark.findOne({
      user: req.user._id,
      service: service._id,
      isDeleted: false
    }).select("_id").lean();

    // Add flag
    service.isFavorite = !!bookmark;

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

const getUserFavorites = async (req, res) => {
  try {
    const userId = req.user._id;

    let { page = 1, limit = 10, type } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    let filter = {
      user: userId
    };
    if (type) {
      filter.type = type;
    }

    const total = await Bookmark.countDocuments(filter);

    const favorites = await Bookmark.find(filter)
      .populate("property", "name price address media.mainImage")
      .populate("service", "name price location media.images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();
    const formatted = favorites.map(fav => ({
      id: fav._id,
      type: fav.type,
      data: fav.property || fav.service
    }));

    const totalPages = Math.ceil(total / limitNumber);

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
  test,
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
  getUserFavorites
};
