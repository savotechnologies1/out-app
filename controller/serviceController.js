const ServiceUser = require("../models/ServiceUser");
const {
  generateRandomOTP,
  generateRandomId,
  codeRem,
  generateAvailability,
} = require("../functions/common");
const jwt = require("jsonwebtoken");
const Category = require("../models/Category");
const Amenities = require("../models/Amenities");
const Feature = require("../models/Feature");
const RestRoom = require("../models/RestRoom");
const Properties = require("../models/Properties");
const catchAsyncError = require("../functions/catchAsyncError");
const fs = require("fs");
const { checkValidations } = require("../functions/checkValidation");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const HotelAvailability = require("../models/Availability");

const serviceLogin = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const { mobile, mobileCode } = req.body;

  const user = await ServiceUser.findOne({
    phone: `${mobileCode}${mobile}`,
  }).lean(true);

  if (!user) return res.status(400).send({ message: "Service user not found" });
  if (!user.isActive) {
    res.status(403).json({ message: "Your account is suspended please contact the support" })
  }
  const otp = generateRandomOTP();

  ServiceUser.updateOne({ _id: user._id }, { $set: { OTP: otp } }).then();

  return res
    .status(200)
    .send({ data: { otp, id: user._id }, message: "Login successfully" });
});

const serviceSignUp = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);
  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const { salutation, firstName, lastName, email, mobile, mobileCode } =
    req.body;

  const userExist = await ServiceUser.countDocuments({
    $or: [{ email: email }, { phone: `${mobileCode}${mobile}` }],
  });

  if (userExist) {
    return res.status(400).send({
      message: "Service user already exist with this email or mobile",
    });
  }

  const files = { ...req.files };

  const userProfileFiles = files?.userProfile;
  const userDocuments = files?.docs;

  if (
    (!userProfileFiles && !userProfileFiles?.length) ||
    (!userDocuments && !userDocuments?.length)
  ) {
    return res.status(400).send({
      message:
        !userProfileFiles && !userProfileFiles?.length
          ? "Please upload profile image"
          : "Please upload identity proof",
    });
  }

  const otp = generateRandomOTP();
  const randomId = generateRandomId();

  let obj = {
    salutation,
    firstName,
    lastName,
    userId: `SID-${randomId}`,
    email,
    phone: `${mobileCode}${mobile}`,
    phoneCode: mobileCode,
    OTP: otp,
    profile: userProfileFiles?.[0]?.filename,
    docs: userDocuments?.[0]?.filename,
    address: {
      street: req.body.street,
      city: req.body.city,
      state: req.body.state,
      zipCode: req.body.zipCode,
      country: req.body.country,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    },
  };

  const data = await ServiceUser.create(obj);

  return res
    .status(200)
    .send({ data: { otp, id: data._id }, message: "Please verify Email" });
});

const serviceVerifyOTP = catchAsyncError(async (req, res, next) => {
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

  const user = await ServiceUser.findOne(
    { _id: req.params.id, isDeleted: false },
    { phone: 1, OTP: 1, isVerified: 1, phoneCode: 1, role: 1 }
  ).lean(true);

  if (!user) return res.status(400).send({ message: "Service User not found" });

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

  ServiceUser.updateOne({ _id: user._id }, obj).then();

  return res.status(200).send({
    data: token,
    role: user.role,
    message: "OTP successfully verified",
  });
});

const getServiceUser = catchAsyncError(async (req, res, next) => {
  const user = await ServiceUser.findOne(
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
  ).lean();
  if (!user) return res.status(400).send({ message: "Service user not found" });

  user["phone"] = await codeRem(user.phone);

  return res.status(200).send({ data: user });
});

const editServiceUser = catchAsyncError(async (req, res, next) => {
  const userProfileFiles = req?.files?.userProfile;
  const userId = req?.user?._id;
  const { firstName, lastName, email, mobile, mobileCode } = req.body;
  const updateData = {};
  if (firstName) updateData.firstName = firstName;
  if (lastName) updateData.lastName = lastName;
  if (email) updateData.email = email;
  if (mobile) updateData.mobile = mobile;
  if (mobileCode) updateData.mobileCode = mobileCode;

  if (email) {
    const emailExist = await ServiceUser.findOne({
      email,
      _id: { $ne: userId },
    }).lean();

    if (emailExist) {
      return res.status(400).json({ message: "Email already taken" });
    }
  }

  if (mobile) {
    const mobileExist = await ServiceUser.findOne({
      mobile,
      _id: { $ne: userId },
    }).lean();

    if (mobileExist) {
      return res.status(400).json({ message: "Mobile number already taken" });
    }
  }

  await ServiceUser.updateOne(
    { _id: userId },
    { $set: { ...updateData, profile: userProfileFiles?.[0]?.filename } }
  );

  return res.status(200).json({
    message: "Profile updated successfully",
    updatedFields: updateData,
  });
});


const getIncompleteProperty = catchAsyncError(async (req, res) => {
  const property = await Properties.findOne({
    user: req.user._id,
    is_completed: false,
    isDeleted: false,
  }).sort({ count: -1 }); // highest step first

  if (!property) {
    return res.status(200).json({
      success: true,
      message: "No incomplete property found",
      data: null,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Incomplete property fetched successfully",
    data: property,
  });
});

const addProperties = catchAsyncError(async (req, res, next) => {
  const { id } = req.body;
  const incomingCount = Number(req.body?.count) || 1;

  const serviceUser = await ServiceUser.findById(req.user._id, {
    isApproved: 1,
  });

  if (!serviceUser) {
    return res.status(400).json({ message: "Service User not found" });
  }

  if (serviceUser.isApproved !== "approved") {
    return res.status(403).json({
      message: `Your account is ${serviceUser.isApproved}. You cannot add properties.`,
    });
  }

  const existingIncomplete = await Properties.findOne({
    user: req.user._id,
    is_completed: false,
    isDeleted: false,
  }).select("_id count name");

  if (!id && existingIncomplete) {
    return res.status(400).json({
      success: false,
      message:
        "You must complete your existing property before creating a new one.",
      propertyId: existingIncomplete._id,
      currentStep: existingIncomplete.count,
      data: existingIncomplete,
    });
  }

  let property = null;
  let existingCount = 0;

  if (id) {
    property = await Properties.findOne(
      { _id: id, isDeleted: false },
      { count: 1 }
    );

    if (!property) {
      return res.status(400).json({ message: "Property not found" });
    }

    existingCount = property.count || 0;
  }

  const files = req.files || {};
  const mainImage = files?.mainImage;
  const bedroom = files?.bedroom;
  const pool = files?.pool;
  const bathroom = files?.bathroom;

  let obj = {};

  switch (incomingCount) {
    case 1:
      obj.user = req.user._id;
      obj.name = req.body.name;
      obj.category = req.body.category;
      obj.status = "draft";
      obj.price = req.body.price;
      obj.maxGuests = req.body.maxGuests;
      obj.policies = {
        checkInTime: req.body.checkInTime,
        checkOutTime: req.body.checkOutTime,
        additionalPolicies: req.body.additionalPolicies || [],
        houseRules: {
          petsAllowed: req.body.petsAllowed || false,
          smokingAllowed: req.body.smokingAllowed || false,
          partiesAllowed: req.body.partiesAllowed || false
        }
      };
      break;

    case 2:
      obj.address = {
        fullAddress: req.body.fullAddress,
        country: req.body.country,
        state: req.body.state,
        city: req.body.city,
        pincode: req.body.pincode,
        lat: req.body.lat,
        lng: req.body.lng,
      };
      break;

    case 3:
      obj.area = req.body.area;
      if (req.body.mainAmenities) {
        obj.mainAmenities = req.body.mainAmenities.split(",");
      }
      break;

    case 4:
      obj.bedRoom = {
        numBedroom: req.body.numBedroom,
        numSingleBed: req.body.numSingleBed,
        numMasterBed: req.body.numMasterBed,
      };
      break;

    case 5:
      obj.pool = {
        dimension: {
          height: req.body.height,
          width: req.body.width,
        },
        gradient: {
          type: req.body.gradient?.type,
        },
      };

      if (req.body.additional) {
        obj.pool.additional = req.body.additional.split(",");
      }

      if (req.body.gradient?.type === "tiered") {
        obj.pool.gradient.feet1 = req.body.gradient.feet1;
        obj.pool.gradient.feet2 = req.body.gradient.feet2;
      }
      break;

    case 6:
      obj.restRoom = {
        numBathroom: req.body.numBathroom,
        facilities: req.body.facilities
          ? req.body.facilities
            .split(",")
            .map(id => new mongoose.Types.ObjectId(id.trim()))
          : [],
      };
      break;

    case 7:
      if (req.body.propertyAmenities) {
        obj.propertyAmenities = req.body.propertyAmenities
          .split(",")
          .map(id => new mongoose.Types.ObjectId(id.trim()));
      }
      break;

    case 8:
      if (req.body.propertyFeatures) {
        obj.propertyFeatures = req.body.propertyFeatures
          .split(",")
          .map(id => new mongoose.Types.ObjectId(id.trim()));
      }
      break;

    case 9:
      obj.description = req.body.description;
      break;

    case 10:
      obj.media = {};

      if (mainImage?.length) {
        obj.media.mainImage = mainImage.map((file) => file.filename);
      }

      if (pool?.length) {
        obj.media.pool = pool.map((file) => file.filename);
      }

      if (bathroom?.length) {
        obj.media.bathroom = bathroom.map((file) => file.filename);
      }

      if (bedroom?.length) {
        obj.media.bedroom = bedroom.map((file) => file.filename);
      }
      break;

    default:
      return res.status(400).json({ message: "Invalid count step" });
  }

  let hotelId = id ? id : null

  if (!id) {
    const newProperty = await Properties.create({
      ...obj,
      count: 1,
      user: req.user._id,
      status: "draft",
    });

    hotelId = newProperty._id

    return res.status(200).json({
      success: true,
      message: "Property added successfully",
      data: newProperty,
    });
  }

  const finalCount =
    incomingCount > existingCount ? incomingCount : existingCount;

  const updateData = {
    ...obj,
    count: finalCount,
  };

  if (finalCount === 10) {
    updateData.is_completed = true;
    updateData.status = "completed";
  }

  const [updatedProperty, _] = await Promise.all([
    Properties.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      { new: true }
    ),
    generateAvailability(hotelId)
  ])

  return res.status(200).json({
    success: true,
    message: "Property updated successfully",
    data: updatedProperty
  });
});


const getPropertyById = catchAsyncError(async (req, res) => {

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

const getAllCategories = catchAsyncError(async (req, res, next) => {
  const categories = await Category.find(
    { isDeleted: false },
    {
      createdAt: 0,
      updatedAt: 0,
      __v: 0,
    }
  ).lean(true);
  return res.status(200).send({
    data: categories,
    message: categories.length
      ? "Categories received successfully"
      : "No categories found",
  });
});

const getAllAmenties = catchAsyncError(async (req, res, next) => {
  const amenities = await Amenities.find({ isDeleted: false }).lean(true);
  return res.status(200).send({
    data: amenities,
    message: amenities.length
      ? "Amenities received successfully"
      : "No amenities found",
  });
});

const getAllFeatures = catchAsyncError(async (req, res, next) => {
  const features = await Feature.find({ isDeleted: false }).lean(true);
  return res.status(200).send({
    data: features,
    message: features.length
      ? "Features received successfully"
      : "No features found",
  });
});

const getAllRestRoomFeatures = catchAsyncError(async (req, res, next) => {
  const restRooms = await RestRoom.find({ isDeleted: false }).lean(true);
  return res.status(200).send({
    data: restRooms,
    message: restRooms.length
      ? "RestRooms received successfully"
      : "No restRooms found",
  });
});

const logout = catchAsyncError(async (req, res, next) => {
  if (req?.headers?.authorization) {
    const { 1: authToken } = req.headers.authorization.split(" ");

    const decodeToken = jwt.decode(authToken);

    ServiceUser.updateOne(
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

const getProperties = catchAsyncError(async (req, res, next) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const skip = (page - 1) * limit;

  const filter = {
    isDeleted: false,
    user: req.user._id
  };

  const [properties, total] = await Promise.all([
    Properties.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Properties.countDocuments(filter)
  ]);

  return res.status(200).send({
    data: properties,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    message: properties.length
      ? "Properties received successfully"
      : "No properties found"
  });

});

const deleteProperties = catchAsyncError(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Please enter valid Id" });
  }

  Properties.updateOne(
    { _id: req.params.id },
    { $set: { isDeleted: true } }
  ).then();
  return res.status(200).send({ message: "Service deleted successfully" });
});

const propertyDetail = catchAsyncError(async (req, res) => {
  const id = req.params?.id;
  const data = await Properties.findOne(
    {
      _id: id,
      isDeleted: false,
    },
    {
      createdAt: 0,
      updatedAt: 0,
      __v: 0,
    }
  ).lean(true);
  return res.status(200).json({
    message: "Property detail retrived successfully !",
    data: data,
  });
});

const editProperties = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).send({ message: "Property ID is required" });
  }

  let property = await Properties.findOne(
    { _id: id, isDeleted: false },
    { count: 1, media: 1 }
  );

  if (!property) {
    return res.status(404).send({ message: "Property not found" });
  }

  const incomingCount = Number(req.body.count) || property.count || 1;
  const files = req.files || {};

  const mainImage = files?.mainImage;
  const poolImage = files?.pool;
  const bathroomImage = files?.bathroom;
  const bedroomImage = files?.bedroom;

  let obj = { media: { ...property.media } };

  switch (incomingCount) {
    case 1:
      obj.name = req.body.name;
      obj.category = req.body.category;
      break;

    case 2:
      obj.address = {
        fullAddress: req.body.fullAddress,
        country: req.body.country,
        state: req.body.state,
        city: req.body.city,
        pincode: req.body.pincode,
        lat: req.body.lat,
        lng: req.body.lng,
        neighborhood: req.body.neighborhood,
        trends: req.body.trends,
      };
      break;

    case 3:
      obj.area = req.body.area;
      obj.mainAmenities = req.body.mainAmenities?.split(",") || [];
      break;

    case 4:
      obj.bedRoom = {
        numBedroom: req.body.numBedroom,
        numSingleBed: req.body.numSingleBed,
        numMasterBed: req.body.numMasterBed,
      };
      break;

    case 5:
      obj.pool = {
        dimension: {
          height: req.body.height,
          width: req.body.width,
        },
        gradient: {
          type: req.body.gradientType,
          feet1: req.body.feet1,
          feet2: req.body.feet2,
        },
        additional:
          req.body.additional?.length > 0 ? req.body.additional.split(",") : [],
      };
      break;

    case 6:
      obj.restRoom = {
        numBathroom: req.body.numBathroom,
        facilities: req.body.facilities?.split(",").map(id => new mongoose.Types.ObjectId(id.trim())) || [],
      };
      break;

    case 7:
      if (req.body.propertyAmenities) {
        obj.propertyAmenities = req.body.propertyAmenities
          .split(",")
          .map(id => new mongoose.Types.ObjectId(id.trim()));
      }
      break;

    case 8:
      if (req.body.propertyFeatures) {
        obj.propertyFeatures = req.body.propertyFeatures
          .split(",")
          .map(id => new mongoose.Types.ObjectId(id.trim()));
      }
      break;

    case 9:
      obj.description = req.body.description;
      break;

    case 10:
      if (mainImage && mainImage.length) {
        obj.media.mainImage = mainImage[0].filename;
      }
      break;
    case 11:
      obj.media = { ...property.media };

      if (mainImage && mainImage.length) {
        obj.media.mainImage = [
          ...(property.media.mainImage || []),
          ...mainImage.map((f) => f.filename),
        ];
      }

      if (poolImage && poolImage.length) {
        obj.media.pool = [
          ...(property.media.pool || []),
          ...poolImage.map((f) => f.filename),
        ];
      }

      if (bathroomImage && bathroomImage.length) {
        obj.media.bathroom = [
          ...(property.media.bathroom || []),
          ...bathroomImage.map((f) => f.filename),
        ];
      }

      if (bedroomImage && bedroomImage.length) {
        obj.media.bedroom = [
          ...(property.media.bedroom || []),
          ...bedroomImage.map((f) => f.filename),
        ];
      }

      break;

      break;

    default:
      return res.status(400).send({ message: "Invalid count step" });
  }

  if (incomingCount > (property.count || 0)) {
    obj.count = incomingCount;
  }

  await Properties.updateOne({ _id: id }, { $set: obj });

  return res.status(200).send({
    message: "Property updated successfully",
    id,
  });
});

const deleteServices = catchAsyncError(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Please enter valid Id" });
  }

  ServiceUser.updateOne(
    { _id: req.params.id },
    { $set: { isDeleted: true } }
  ).then();
  return res.status(200).send({ message: "Properties deleted successfully" });
});

const getUpcomingBookings = catchAsyncError(async (req, res) => {

  const userId = req.user._id;

  // get all properties of service user
  const properties = await Properties.find({ user: userId }).select("_id").lean();
  const propertyIds = properties.map(p => p._id);
  const today = new Date();
  today.setHours(0,0,0,0);

  const bookings = await Booking.find({
    hotel: { $in: propertyIds },
    checkIn: { $gte: today },
    bookingStatus: { $in: ["confirmed", "pending"] },
    paymentStatus: "paid"
  })
  .populate("user", "firstName lastName phone profile")
  .sort({ checkIn: 1 })
  .lean();

  return res.status(200).send({
    data: bookings,
    message: bookings.length
      ? "Upcoming bookings fetched"
      : "No upcoming bookings"
  });

});

const getBookingHistory = catchAsyncError(async (req, res) => {

  const userId = req.user._id;

  // get all properties of this service user
  const properties = await Properties.find({ user: userId }).select("_id").lean();
  const propertyIds = properties.map(p => p._id);

  const bookings = await Booking.find({
    hotel: { $in: propertyIds },
    bookingStatus: { $in: ["confirmed", "cancelled"] }
  })
  .populate("user", "firstName lastName phone profile")
  .populate("hotel", "name address price")
  .sort({ createdAt: -1 })
  .lean();

  return res.status(200).send({
    data: bookings,
    message: bookings.length
      ? "Booking history fetched successfully"
      : "No booking history found"
  });

});

const getBookingCalendar = catchAsyncError(async (req, res) => {

  const userId = req.user._id;

  const properties = await Properties.find({ user: userId }).select("_id").lean();

  const propertyIds = properties.map(p => p._id);
console.log("propertyIds", propertyIds)
  const dates = await HotelAvailability.find({
    hotel: { $in: propertyIds },
    isBooked: true
  })
  .select("date booking hotel")
  .populate({
    path: "booking",
    select: "bookingStatus"
  })
  .lean();

  return res.status(200).send({
    data: dates,
    message: "Calendar data fetched"
  });

});

module.exports = {
  serviceLogin,
  serviceSignUp,
  addProperties,
  editProperties,
  propertyDetail,
  getServiceUser,
  editServiceUser,
  deleteProperties,
  serviceVerifyOTP,
  getPropertyById,
  getAllCategories,
  getAllAmenties,
  getAllFeatures,
  getAllRestRoomFeatures,
  logout,
  getProperties,
  deleteServices,
  getIncompleteProperty,
  getUpcomingBookings,
  getBookingHistory,
  getBookingCalendar
};
