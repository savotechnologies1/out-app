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

const userLogin = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const { mobile, mobileCode } = req.body;

  const user = await User.findOne({ phone: `${mobileCode}${mobile}` }).lean(
    true
  );
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

const getPropertiesByCategory = catchAsyncError(async (req, res) => {
  const { category } = req.params;
  const { lastId, limit = 10 } = req.query;

  if (!category) {
    return res.status(400).json({
      success: false,
      message: "Category is required",
    });
  }

  let categoryDoc;

  // 🔥 If valid ObjectId → search by ID
  if (mongoose.Types.ObjectId.isValid(category)) {
    categoryDoc = await Category.findOne({
      _id: category,
      isDeleted: false,
    }).lean();
  } else {
    // 🔥 Otherwise search by name (case-insensitive)
    categoryDoc = await Category.findOne({
      category: { $regex: new RegExp(`^${category}$`, "i") },
      isDeleted: false,
    }).lean();
  }

  if (!categoryDoc) {
    return res.status(404).json({
      success: false,
      message: "Category not found",
    });
  }

  // 🔥 Build property query
  const propertyQuery = {
    category: categoryDoc._id,
    isDeleted: false,
    is_completed: true,
  };

  // Cursor pagination
  if (lastId && mongoose.Types.ObjectId.isValid(lastId)) {
    propertyQuery._id = { $lt: new mongoose.Types.ObjectId(lastId) };
  }

  const properties = await Properties.find(propertyQuery)
    .populate({
      path: "category",
      select: "category image",
    })
    .sort({ _id: -1 })
    .limit(Number(limit))
    .lean();

  return res.status(200).json({
    success: true,
    sectionTitle: `Top ${categoryDoc.category}`,
    categoryId: categoryDoc._id,
    lastId:
      properties.length > 0
        ? properties[properties.length - 1]._id
        : null,
    data: properties,
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

const getNewlyDashboard = catchAsyncError(async (req, res) => {

  const data = await Properties.aggregate([
    {
      $match: {
        is_completed: true,
        isDeleted: false
      }
    },
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
                  { $eq: ["$category", "APARTMENT"] }
                ]
              }
            }
          },
          {
            $project: { category: 1 }
          }
        ],
        as: "categoryData"
      }
    },
    {
      $match: {
        categoryData: { $ne: [] }
      }
    },
    {
      $lookup: {
        from: "amenities",
        let: { amenityIds: { $ifNull: ["$propertyAmenities", []] } },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$amenityIds"] }
            }
          }
        ],
        as: "propertyAmenities"
      }
    },
    {
      $lookup: {
        from: "features",
        let: { featureIds: { $ifNull: ["$propertyFeatures", []] } },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$featureIds"] }
            }
          }
        ],
        as: "propertyFeatures"
      }
    },
    {
      $lookup: {
        from: "restrooms",
        let: { facilityIds: { $ifNull: ["$restRoom.facilities", []] } },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$facilityIds"] }
            }
          }
        ],
        as: "facilityData"
      }
    },
    {
      $addFields: {
        categoryName: { $arrayElemAt: ["$categoryData.category", 0] },
        "restRoom.facilities": "$facilityData"
      }
    },
    {
      $project: {
        categoryData: 0,
        facilityData: 0
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $limit: 10
    }
  ]).allowDiskUse(true);

  return res.status(200).send({
    data,
    message: data.length
      ? "Apartment received successfully"
      : "No apartments found",
  });

});

const getNewlyVilla = catchAsyncError(async (req, res) => {

  const data = await Properties.aggregate([
    {
      $match: {
        is_completed: true,
        isDeleted: false
      }
    },
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
                  { $eq: ["$category", "VILLA"] }
                ]
              }
            }
          },
          {
            $project: { category: 1 }
          }
        ],
        as: "categoryData"
      }
    },
    {
      $match: {
        categoryData: { $ne: [] }
      }
    },
    {
      $lookup: {
        from: "amenities",
        let: { amenityIds: { $ifNull: ["$propertyAmenities", []] } },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$amenityIds"] }
            }
          }
        ],
        as: "propertyAmenities"
      }
    },
    {
      $lookup: {
        from: "features",
        let: { featureIds: { $ifNull: ["$propertyFeatures", []] } },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$featureIds"] }
            }
          }
        ],
        as: "propertyFeatures"
      }
    },
    {
      $lookup: {
        from: "restrooms",
        let: { facilityIds: { $ifNull: ["$restRoom.facilities", []] } },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$facilityIds"] }
            }
          }
        ],
        as: "facilityData"
      }
    },
    {
      $addFields: {
        categoryName: { $arrayElemAt: ["$categoryData.category", 0] },
        "restRoom.facilities": "$facilityData"
      }
    },
    {
      $project: {
        categoryData: 0,
        facilityData: 0
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $limit: 10
    }
  ]).allowDiskUse(true);

  return res.status(200).send({
    data,
    message: data.length ? "Villa received successfully" : "No villa found"
  });

});

const getNewlyResorts = catchAsyncError(async (req, res) => {

  const data = await Properties.aggregate([
    {
      $match: {
        is_completed: true,
        isDeleted: false
      }
    },
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
                  { $eq: ["$category", "RESORT"] }
                ]
              }
            }
          },
          {
            $project: { category: 1 }
          }
        ],
        as: "categoryData"
      }
    },
    {
      $match: {
        categoryData: { $ne: [] }
      }
    },
    {
      $lookup: {
        from: "amenities",
        let: { amenityIds: { $ifNull: ["$propertyAmenities", []] } },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$amenityIds"] }
            }
          }
        ],
        as: "propertyAmenities"
      }
    },
    {
      $lookup: {
        from: "features",
        let: { featureIds: { $ifNull: ["$propertyFeatures", []] } },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$featureIds"] }
            }
          }
        ],
        as: "propertyFeatures"
      }
    },
    {
      $lookup: {
        from: "restrooms",
        let: { facilityIds: { $ifNull: ["$restRoom.facilities", []] } },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$facilityIds"] }
            }
          }
        ],
        as: "facilityData"
      }
    },
    {
      $addFields: {
        categoryName: { $arrayElemAt: ["$categoryData.category", 0] },
        "restRoom.facilities": "$facilityData"
      }
    },
    {
      $project: {
        categoryData: 0,
        facilityData: 0
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $limit: 10
    }
  ]).allowDiskUse(true);

  return res.status(200).send({
    data,
    message: data.length ? "Resorts received successfully" : "No Resorts found",
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
  getNewlyDashboard,
  getNewlyVilla,
  getNewlyResorts,
  getUserBanners,
  getPropertyDetail,
  createBooking,
  createToken
};

//   await Coupon.findByIdAndUpdate(couponId, {
//     $inc: { usedCount: 1 },
//     $push: { usedBy: { user: userId } },
//   });
// };

// const applyCoupon = catchAsyncError(async (req, res) => {

//   const { code, amount } = req.body;

//   const coupon = await Coupon.findOne({
//     code: code.toUpperCase(),
//     isActive: true,
//   });

//   if (!coupon) {
//     return res.status(400).json({
//       success: false,
//       message: "Invalid coupon code",
//     });
//   }

//   if (coupon.expiryDate && coupon.expiryDate < new Date()) {
//     return res.status(400).json({
//       success: false,
//       message: "Coupon expired",
//     });
//   }

//   if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
//     return res.status(400).json({
//       success: false,
//       message: "Coupon usage limit exceeded",
//     });
//   }

//   if (amount < coupon.minAmount) {
//     return res.status(400).json({
//       success: false,
//       message: `Minimum order amount is ${coupon.minAmount}`,
//     });
//   }

//   // Prevent same user reuse
//   const alreadyUsed = coupon.usedBy.find(
//     (u) => u.user.toString() === req.user._id.toString()
//   );

//   if (alreadyUsed) {
//     return res.status(400).json({
//       success: false,
//       message: "You have already used this coupon",
//     });
//   }

//   let discount = 0;

//   if (coupon.discountType === "PERCENTAGE") {
//     discount = (amount * coupon.discountValue) / 100;

//     if (coupon.maxDiscount) {
//       discount = Math.min(discount, coupon.maxDiscount);
//     }
//   } else {
//     discount = coupon.discountValue;
//   }

//   const finalAmount = amount - discount;

//   res.status(200).json({
//     success: true,
//     message: "Coupon applied successfully",
//     discount,
//     finalAmount,
//   });
// });


// const applyCoupon = catchAsyncError(async (req, res) => {
//   const { code, amount, propertyId } = req.body;

//   const coupon = await Coupon.findOne({
//     code: code.toUpperCase(),
//     isActive: true,
//   });

//   if (!coupon) {
//     return res.status(400).json({ message: "Invalid coupon code" });
//   }

//   const now = new Date();

//   // 🔥 Check Start Date
//   if (coupon.startDate && coupon.startDate > now) {
//     return res.status(400).json({ message: "Coupon not started yet" });
//   }

//   // 🔥 Check Expiry
//   if (coupon.expiryDate && coupon.expiryDate < now) {
//     return res.status(400).json({ message: "Coupon expired" });
//   }

//   // 🔥 First Time User
//   if (coupon.firstTimeUserOnly) {
//     const previousBooking = await Booking.findOne({ user: req.user._id });

//     if (previousBooking) {
//       return res.status(400).json({
//         message: "This coupon is valid for first-time users only",
//       });
//     }
//   }

//   // 🔥 Property-Based Check
//   if (
//     coupon.applicableProperties?.length &&
//     !coupon.applicableProperties.includes(propertyId)
//   ) {
//     return res.status(400).json({
//       message: "Coupon not valid for this property",
//     });
//   }

//   // 🔥 Category-Based Check
//   if (coupon.applicableCategories?.length) {
//     const property = await Properties.findById(propertyId);

//     if (
//       !coupon.applicableCategories.includes(property.category.toString())
//     ) {
//       return res.status(400).json({
//         message: "Coupon not valid for this category",
//       });
//     }
//   }

//   if (amount < coupon.minAmount) {
//     return res.status(400).json({
//       message: `Minimum amount is ${coupon.minAmount}`,
//     });
//   }

//   if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
//     return res.status(400).json({
//       message: "Coupon usage limit exceeded",
//     });
//   }

//   const alreadyUsed = coupon.usedBy.find(
//     (u) => u.user.toString() === req.user._id.toString()
//   );

//   if (alreadyUsed) {
//     return res.status(400).json({
//       message: "You already used this coupon",
//     });
//   }

//   let discount = 0;

//   if (coupon.discountType === "PERCENTAGE") {
//     discount = (amount * coupon.discountValue) / 100;

//     if (coupon.maxDiscount) {
//       discount = Math.min(discount, coupon.maxDiscount);
//     }
//   } else {
//     discount = coupon.discountValue;
//   }

//   return res.status(200).json({
//     success: true,
//     discount,
//     finalAmount: amount - discount,
//     couponId: coupon._id,
//   });
// });

// const autoApplyBestCoupon = async (userId, propertyId, amount) => {
//   const now = new Date();

//   const coupons = await Coupon.find({
//     isActive: true,
//     startDate: { $lte: now },
//     expiryDate: { $gte: now },
//   });

//   let bestCoupon = null;
//   let maxDiscount = 0;

//   for (let coupon of coupons) {
//     let discount = 0;

//     if (coupon.discountType === "PERCENTAGE") {
//       discount = (amount * coupon.discountValue) / 100;

//       if (coupon.maxDiscount) {
//         discount = Math.min(discount, coupon.maxDiscount);
//       }
//     } else {
//       discount = coupon.discountValue;
//     }

//     if (discount > maxDiscount) {
//       maxDiscount = discount;
//       bestCoupon = coupon;
//     }
//   }

//   return {
//     bestCoupon,
//     discount: maxDiscount,
//     finalAmount: amount - maxDiscount,
//   };
// };