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
const path = require("path");
const { checkValidations } = require("../functions/checkValidation");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const HotelAvailability = require("../models/Availability");
const Wallet = require("../models/Wallet");
const BankDetails = require("../models/BankDetails");
const WalletTransaction = require("../models/WalletTransaction");
const WithdrawRequest = require("../models/WithdrawRequest");
const ServiceCategory = require("../models/ServiceCategory");
const Service = require("../models/Service");
const Package = require("../models/Package");
const CancellationPolicy = require("../models/CancellationPolicy");
const Review = require("../models/Review");
const Conversation = require("../models/Conversation");
const Admin = require("../models/Admin");
const { sendNotification } = require("../utils/notificationService");
const Commission = require("../models/Commission");
const { authenticaOTP } = require("../functions/authentica");
const User = require("../models/User");


const serviceLogin = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const { mobile, mobileCode, fcmToken } = req.body;

  const user = await ServiceUser.findOne({
    phone: `${mobileCode}${mobile}`,
  });

  if (!user) {
    return res.status(400).send({
      message: "Service user not found",
    });
  }

  // Account suspended
  if (!user.isActive) {
    return res.status(403).json({
      message: "Your account is suspended please contact support",
    });
  }

  // Account deleted
  if (user.isDeleted) {
    return res.status(403).send({
      message: "Your account is permanently deleted.",
    });
  }

  // Approval status check
  if (user.isApproved === "pending") {
    return res.status(403).send({
      message: "Your application has not been approved by the admin yet. Please try logging in again later.",
    });
  }

  if (user.isApproved === "rejected") {
    return res.status(403).send({
      message:
        user.rejectReason && user.rejectReason.trim() !== ""
          ? user.rejectReason
          : "Admin has rejected your request.",
    });
  }

  // Only approved users can login
  if (user.isApproved !== "approved") {
    return res.status(403).send({
      message: "You are not allowed to login.",
    });
  }

  const otp = generateRandomOTP();

  await authenticaOTP(otp, user.email, user.phone);

  await ServiceUser.updateOne(
    { _id: user._id },
    {
      $set: {
        OTP: otp,
        ...(fcmToken && { fcmToken }),
      },
    }
  );

  const existingWallet = await Wallet.findOne({
    user: user._id,
  });

  if (!existingWallet) {
    await Wallet.create({
      user: user._id,
    });
  }

  return res.status(200).json({
    success: true,
    data: { id: user._id },
    message: "Login successfully",
  });
});


const serviceSignUp = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);

  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  const {
    salutation,
    firstName,
    lastName,
    email,
    description,
    serviceDetails,
    mobile,
    mobileCode,
  } = req.body;

  const phone = `${mobileCode}${mobile}`;

  // ✅ Validate email only if provided
  if (email && email.trim() !== "") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).send({
        message: "Invalid email format",
      });
    }
  }

  // ✅ Separate duplicate checks
  const mobileExist = await ServiceUser.findOne({ phone });
  if (mobileExist) {
    return res.status(400).send({
      message: "Mobile number already exists",
    });
  }

  if (email && email.trim() !== "") {
    const emailExist = await ServiceUser.findOne({ email });
    if (emailExist) {
      return res.status(400).send({
        message: "Email already exists",
      });
    }
  }

  const files = { ...req.files };

  const userProfileFiles = files?.userProfile;

  // ✅ Validate offering details for admin review (replaces identity proof document requirement)
  const offeringInfo = serviceDetails
  if (!offeringInfo || offeringInfo.trim() === "") {
    return res.status(400).send({
      message: "Please describe what you want to offer on the platform (e.g. photography services, chalet listing, or property/service details). Note: This information is only used by the admin team for the approval process.",
    });
  }

  // ✅ Profile image validation
  if (!userProfileFiles || !userProfileFiles?.length) {
    return res.status(400).send({
      message: "Please upload profile image",
    });
  }

  // const otp = generateRandomOTP();
  const randomId = generateRandomId();

  // await authenticaOTP(
  //   otp,
  //   email && email.trim() !== "" ? email : null,
  //   phone
  // );

  let obj = {
    salutation,
    firstName,
    lastName,
    userId: `SID-${randomId}`,
    email: email && email.trim() !== "" ? email : null, // ✅ optional email
    description: description || null,
    offeringDetails: offeringInfo,
    phone,
    phoneCode: mobileCode,
    OTP: null,
    profile: userProfileFiles?.[0]?.filename,
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

  return res.status(200).json({
    success: true,
    data: { id: data._id },
    message: "Account has been successfully created please login.",
  });
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

  return res.status(200).json({
    success: true,
    data: token,
    role: user.role,
    message: "OTP successfully verified",
  });
});


const getServiceUser = catchAsyncError(async (req, res, next) => {
  const userId = new mongoose.Types.ObjectId(req.user._id);

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
      description: 1,
      profile: 1,
      isVerified: 1,
      createdAt: 1
    }
  ).lean();

  if (!user) {
    return res.status(400).send({ message: "Service user not found" });
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
        reviewee: userId,
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
    { $unwind: "$providerBreakdown" },
    {
      $match: {
        "providerBreakdown.user": userId
      }
    },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: "$providerBreakdown.amount" }
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
     📦 FINAL RESPONSE
  ======================== */
  return res.status(200).json({
    success: true,
    data: {
      ...user,
      stats: {
        trips: totalTrips,
        reviews: totalReviews,
        avgRating: Number(avgRating.toFixed(1)), // ⭐ like 4.5
        earnings: totalEarnings,
        months: months < 0 ? 0 : months
      }
    }
  });
});

const editServiceUser = catchAsyncError(async (req, res, next) => {
  const userProfileFiles = req?.files?.userProfile;
  const userId = req?.user?._id;
  const { firstName, lastName, email, description, mobile, mobileCode } = req.body;
  const updateData = {};
  if (firstName) updateData.firstName = firstName;
  if (lastName) updateData.lastName = lastName;
  if (email) updateData.email = email;
  if (description) updateData.description = description;
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
    success: true,
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


const getPropertyById = catchAsyncError(async (req, res) => {

  const data = (await Properties.aggregate([

    /* ========================
       🔍 MATCH PROPERTY
    ======================== */

    {
      $match: {
        isDeleted: false,
        _id: new mongoose.Types.ObjectId(req.params.id)
      }
    },

    /* ========================
       👤 PROPERTY OWNER
    ======================== */

    {
      $lookup: {
        from: "serviceusers",
        localField: "user",
        foreignField: "_id",
        as: "owner"
      }
    },

    {
      $unwind: {
        path: "$owner",
        preserveNullAndEmptyArrays: true
      }
    },

    /* ========================
       📂 CATEGORY
    ======================== */

    {
      $lookup: {
        from: "categories",
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

    /* ========================
       🏡 PROPERTY AMENITIES
    ======================== */

    {
      $lookup: {
        from: "amenities",
        localField: "propertyAmenities",
        foreignField: "_id",
        as: "amenitiesData"
      }
    },

    /* ========================
       ✨ PROPERTY FEATURES
    ======================== */

    {
      $lookup: {
        from: "features",
        localField: "propertyFeatures",
        foreignField: "_id",
        as: "featuresData"
      }
    },

    /* ========================
       📜 CANCELLATION POLICY
    ======================== */

    {
      $lookup: {
        from: "cancellationpolicies",
        localField: "cancellationPolicy",
        foreignField: "_id",
        as: "cancellationPolicyData"
      }
    },

    {
      $unwind: {
        path: "$cancellationPolicyData",
        preserveNullAndEmptyArrays: true
      }
    },

    /* ========================
       ⭐ PROPERTY REVIEWS
    ======================== */

    {
      $lookup: {
        from: "reviews",
        let: { propertyId: "$_id" },
        pipeline: [

          {
            $match: {
              $expr: {
                $eq: ["$property", "$$propertyId"]
              },
              isDeleted: false,
              reviewType: "property"
            }
          },

          {
            $group: {
              _id: null,
              avgRating: { $avg: "$rating" },
              totalReviews: { $sum: 1 }
            }
          }

        ],
        as: "reviewData"
      }
    },

    /* ========================
       🎯 FORMAT RATING
    ======================== */

    {
      $addFields: {

        avgRating: {
          $ifNull: [
            {
              $round: [
                { $arrayElemAt: ["$reviewData.avgRating", 0] },
                1
              ]
            },
            0
          ]
        },

        totalReviews: {
          $ifNull: [
            { $arrayElemAt: ["$reviewData.totalReviews", 0] },
            0
          ]
        }

      }
    },

    /* ========================
       ❌ REMOVE TEMP DATA
    ======================== */

    {
      $unset: "reviewData"
    },

    /* ========================
       📤 FINAL RESPONSE
    ======================== */

    {
      $project: {

        _id: 1,
        name: 1,
        area: 1,
        description: 1,
        price: 1,
        count: 1,
        maxGuests: 1,
        document: 1,
        experienceCount: 1,

        approvalStatus: 1,
        approvedAt: 1,
        rejectionReason: 1,

        status: 1,
        is_completed: 1,
        isDeleted: 1,

        createdAt: 1,
        updatedAt: 1,

        avgRating: 1,
        totalReviews: 1,

        address: {
          fullAddress: "$address.fullAddress",
          city: "$address.city",
          state: "$address.state",
          country: "$address.country",
          pincode: "$address.pincode",

          location: {
            type: "$address.location.type",
            coordinates: "$address.location.coordinates"
          }
        },

        mainAmenities: 1,

        bedRoom: 1,

        pool: 1,

        restRoom: 1,

        instantBooking: 1,

        media: 1,

        policies: 1,

        category: {
          _id: "$categoryData._id",
          category: "$categoryData.category"
        },

        cancellationPolicy: {
          _id: "$cancellationPolicyData._id",
          title: "$cancellationPolicyData.title"
        },

        propertyAmenities: {
          $map: {
            input: "$amenitiesData",
            as: "amenity",
            in: {
              _id: "$$amenity._id",
              name: "$$amenity.name",
              icon: "$$amenity.icon"
            }
          }
        },

        propertyFeatures: {
          $map: {
            input: "$featuresData",
            as: "feature",
            in: {
              _id: "$$feature._id",
              name: "$$feature.feature"
            }
          }
        },

        owner: {
          _id: "$owner._id",
          firstName: "$owner.firstName",
          lastName: "$owner.lastName",
          userId: "$owner.userId",
          role: "$owner.role",
          email: "$owner.email",
          phone: "$owner.phone",
          profile: "$owner.profile"
        }

      }
    }

  ]))[0];

  return res.status(200).json({
    success: true,
    data,
    message: data
      ? "Property detail received successfully"
      : "No property found",
  });

});


const getAllCategories = catchAsyncError(async (req, res, next) => {
  // 1. Get all categories
  const categories = await Category.find(
    { isDeleted: false },
    {
      createdAt: 0,
      updatedAt: 0,
      __v: 0,
    }
  ).lean();

  // 2. Get all active commissions
  const commissions = await Commission.find({
    isActive: true,
    isDeleted: false,
  }).lean();

  // 3. Separate global & category commissions
  const globalCommission = commissions.find(c => c.scope === "GLOBAL");

  const categoryCommissionMap = {};
  commissions.forEach(c => {
    if (c.scope === "CATEGORY" && c.categoryId) {
      categoryCommissionMap[c.categoryId.toString()] = c;
    }
  });

  // 4. Attach commission to each category
  const updatedCategories = categories.map(cat => {
    const categoryCommission =
      categoryCommissionMap[cat._id.toString()] || null;

    return {
      ...cat,
      commission: categoryCommission || globalCommission || null,
    };
  });

  return res.status(200).json({
    success: true,
    data: updatedCategories,
    message: categories.length
      ? "Categories with commission fetched successfully"
      : "No categories found",
  });
});

const getAllAmenties = catchAsyncError(async (req, res, next) => {
  const amenities = await Amenities.find({ isDeleted: false }).lean(true);
  return res.status(200).json({
    success: true,
    data: amenities,
    message: amenities.length
      ? "Amenities received successfully"
      : "No amenities found",
  });
});

const getAllFeatures = catchAsyncError(async (req, res, next) => {
  const features = await Feature.find({ isDeleted: false }).lean(true);
  return res.status(200).json({
    success: true,
    data: features,
    message: features.length
      ? "Features received successfully"
      : "No features found",
  });
});

const getAllRestRoomFeatures = catchAsyncError(async (req, res, next) => {
  const restRooms = await RestRoom.find({ isDeleted: false }).lean(true);
  return res.status(200).json({
    success: true,
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

    return res.status(200).json({
      success: true,
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

  return res.status(200).json({
    success: true,
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
  return res.status(200).json({ success: true, message: "Service deleted successfully" });
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
    success: true,
    message: "Property detail retrived successfully !",
    data: data,
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

  // FILES
  const files = req.files || {};
  const mainImage = files?.mainImage;
  const bedroom = files?.bedroom;
  const pool = files?.pool;
  const bathroom = files?.bathroom;
  const document = files?.document;

  let obj = {};

  switch (incomingCount) {
    case 1: {
      const policy = await CancellationPolicy.findOne({
        _id: req.body.cancellationPolicy,
        isActive: true,
      });

      if (!policy) {
        return res.status(400).json({
          success: false,
          message: "Invalid or inactive cancellation policy",
        });
      }

      obj = {
        user: req.user._id,
        name: req.body.name,
        category: req.body.category,
        status: "draft",
        price: req.body.price,
        maxGuests: req.body.maxGuests,
        policies: {
          checkInTime: req.body.checkInTime,
          checkOutTime: req.body.checkOutTime,
          additionalPolicies: req.body.additionalPolicies || [],
          houseRules: {
            petsAllowed: req.body.petsAllowed || false,
            smokingAllowed: req.body.smokingAllowed || false,
            partiesAllowed: req.body.partiesAllowed || false,
          },
        },
        cancellationPolicy: policy._id,
      };

      if (document?.length) {
        obj.document = document[0].filename;
      } else {
        return res.status(400).json({
          success: false,
          message: "Document is required in step 1",
        });
      }
      break;
    }

    case 2: {
      const lat = parseFloat(req.body.lat);
      const lng = parseFloat(req.body.lng);

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({
          success: false,
          message:
            "Latitude and Longitude are required and must be valid numbers",
        });
      }

      obj.address = {
        fullAddress: req.body.fullAddress,
        country: req.body.country,
        state: req.body.state,
        city: req.body.city,
        pincode: req.body.pincode,
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
      };
      break;
    }

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
            .map((id) => new mongoose.Types.ObjectId(id.trim()))
          : [],
      };
      break;

    case 7:
      if (req.body.propertyAmenities) {
        obj.propertyAmenities = req.body.propertyAmenities
          .split(",")
          .map((id) => new mongoose.Types.ObjectId(id.trim()));
      }
      break;

    case 8:
      if (req.body.propertyFeatures) {
        obj.propertyFeatures = req.body.propertyFeatures
          .split(",")
          .map((id) => new mongoose.Types.ObjectId(id.trim()));
      }
      break;

    case 9:
      obj.description = req.body.propertyDescription;
      break;

    case 10:
      obj.media = {};

      if (mainImage?.length) {
        obj.media.mainImage = mainImage.map((f) => f.filename);
      }
      if (pool?.length) {
        obj.media.pool = pool.map((f) => f.filename);
      }
      if (bathroom?.length) {
        obj.media.bathroom = bathroom.map((f) => f.filename);
      }
      if (bedroom?.length) {
        obj.media.bedroom = bedroom.map((f) => f.filename);
      }
      break;

    default:
      return res.status(400).json({ message: "Invalid count step" });
  }

  let hotelId = id || null;

  // CREATE NEW PROPERTY
  if (!id) {
    const newProperty = await Properties.create({
      ...obj,
      count: 1,
      user: req.user._id,
      status: "draft",
    });

    return res.status(200).json({
      success: true,
      message: "Property added successfully",
      data: newProperty,
    });
  }

  // UPDATE FLOW
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

  // ✅ FIRST update DB
  const [updatedProperty, _] = await Promise.all([
    Properties.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      { new: true }
    ),
    generateAvailability(hotelId),
  ]);

  // ✅ THEN send notifications
  if (finalCount === 10) {
    const admins = await Admin.find({}, "_id");

    for (let admin of admins) {
      await sendNotification({
        receiverId: admin._id,
        receiverModel: "Admin",
        senderId: req.user._id,
        senderModel: "ServiceUser",
        title: "New Property Submitted 🏠",
        body: "A new property has been submitted for approval.",
        type: "PROPERTY",
        referenceId: updatedProperty._id,
        referenceType: "Property",
        data: {
          propertyId: updatedProperty._id,
        },
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: "Property updated successfully",
    data: updatedProperty,
  });
});


const editProperties = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).send({ message: "Property ID is required" });
  }

  let property = await Properties.findOne(
    { _id: id, isDeleted: false },
    { count: 1, media: 1, approvalStatus: 1, document: 1, policies: 1, address: 1, bedRoom: 1, pool: 1, restRoom: 1 }
  );

  if (!property) {
    return res.status(404).send({ message: "Property not found" });
  }

  const files = req.files || {};
  const mainImage = files?.mainImage;
  const poolImage = files?.pool;
  const bathroomImage = files?.bathroom;
  const bedroomImage = files?.bedroom;
  const document = files?.document;

  let obj = {};

  // Basic info fields
  if (req.body.name) obj.name = req.body.name;
  if (req.body.category) obj.category = req.body.category;
  if (req.body.price !== undefined) obj.price = Number(req.body.price);
  if (req.body.maxGuests !== undefined) obj.maxGuests = Number(req.body.maxGuests);
  if (req.body.area !== undefined) obj.area = Number(req.body.area);
  if (req.body.propertyDescription || req.body.description) {
    obj.description = req.body.propertyDescription || req.body.description;
  }

  // Cancellation Policy
  if (req.body.cancellationPolicy) {
    const policy = await CancellationPolicy.findOne({
      _id: req.body.cancellationPolicy,
      isActive: true,
    });

    if (!policy) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive cancellation policy",
      });
    }
    obj.cancellationPolicy = policy._id;
  }

  // Policies & House Rules
  if (
    req.body.checkInTime ||
    req.body.checkOutTime ||
    req.body.additionalPolicies ||
    req.body.petsAllowed !== undefined ||
    req.body.smokingAllowed !== undefined ||
    req.body.partiesAllowed !== undefined
  ) {
    obj.policies = {
      checkInTime: req.body.checkInTime || property.policies?.checkInTime,
      checkOutTime: req.body.checkOutTime || property.policies?.checkOutTime,
      additionalPolicies: req.body.additionalPolicies || property.policies?.additionalPolicies || [],
      houseRules: {
        petsAllowed: req.body.petsAllowed !== undefined ? (req.body.petsAllowed === "true" || req.body.petsAllowed === true) : (property.policies?.houseRules?.petsAllowed || false),
        smokingAllowed: req.body.smokingAllowed !== undefined ? (req.body.smokingAllowed === "true" || req.body.smokingAllowed === true) : (property.policies?.houseRules?.smokingAllowed || false),
        partiesAllowed: req.body.partiesAllowed !== undefined ? (req.body.partiesAllowed === "true" || req.body.partiesAllowed === true) : (property.policies?.houseRules?.partiesAllowed || false),
      },
    };
  }

  // Address & Location
  if (
    req.body.fullAddress ||
    req.body.city ||
    req.body.state ||
    req.body.country ||
    req.body.pincode ||
    req.body.neighborhood ||
    req.body.trends ||
    (req.body.lat && req.body.lng)
  ) {
    obj.address = {
      fullAddress: req.body.fullAddress || property.address?.fullAddress,
      country: req.body.country || property.address?.country,
      state: req.body.state || property.address?.state,
      city: req.body.city || property.address?.city,
      pincode: req.body.pincode || property.address?.pincode,
      neighborhood: req.body.neighborhood || property.address?.neighborhood,
      trends: req.body.trends || property.address?.trends,
      location: (req.body.lat && req.body.lng) ? {
        type: "Point",
        coordinates: [parseFloat(req.body.lng), parseFloat(req.body.lat)],
      } : property.address?.location,
    };
  }

  // Main Amenities
  if (req.body.mainAmenities) {
    obj.mainAmenities = typeof req.body.mainAmenities === "string"
      ? req.body.mainAmenities.split(",")
      : req.body.mainAmenities;
  }

  // Bedroom details
  if (
    req.body.numBedroom !== undefined ||
    req.body.numSingleBed !== undefined ||
    req.body.numMasterBed !== undefined
  ) {
    obj.bedRoom = {
      numBedroom: req.body.numBedroom !== undefined ? Number(req.body.numBedroom) : property.bedRoom?.numBedroom,
      numSingleBed: req.body.numSingleBed !== undefined ? Number(req.body.numSingleBed) : property.bedRoom?.numSingleBed,
      numMasterBed: req.body.numMasterBed !== undefined ? Number(req.body.numMasterBed) : property.bedRoom?.numMasterBed,
    };
  }

  // Pool details
  if (
    req.body.height !== undefined ||
    req.body.width !== undefined ||
    req.body.gradientType ||
    req.body.additional
  ) {
    obj.pool = {
      dimension: {
        height: req.body.height !== undefined ? Number(req.body.height) : property.pool?.dimension?.height,
        width: req.body.width !== undefined ? Number(req.body.width) : property.pool?.dimension?.width,
      },
      gradient: {
        type: req.body.gradientType || property.pool?.gradient?.type,
        feet1: req.body.feet1 !== undefined ? Number(req.body.feet1) : property.pool?.gradient?.feet1,
        feet2: req.body.feet2 !== undefined ? Number(req.body.feet2) : property.pool?.gradient?.feet2,
      },
      additional: req.body.additional
        ? (typeof req.body.additional === "string" ? req.body.additional.split(",") : req.body.additional)
        : (property.pool?.additional || []),
    };
  }

  // Restroom details
  if (req.body.numBathroom !== undefined || req.body.facilities) {
    obj.restRoom = {
      numBathroom: req.body.numBathroom !== undefined ? Number(req.body.numBathroom) : property.restRoom?.numBathroom,
      facilities: req.body.facilities
        ? (typeof req.body.facilities === "string"
          ? req.body.facilities.split(",").map(id => new mongoose.Types.ObjectId(id.trim()))
          : req.body.facilities.map(id => new mongoose.Types.ObjectId(id)))
        : (property.restRoom?.facilities || []),
    };
  }

  // Property Amenities & Features
  if (req.body.propertyAmenities) {
    obj.propertyAmenities = typeof req.body.propertyAmenities === "string"
      ? req.body.propertyAmenities.split(",").map(id => new mongoose.Types.ObjectId(id.trim()))
      : req.body.propertyAmenities.map(id => new mongoose.Types.ObjectId(id));
  }

  if (req.body.propertyFeatures) {
    obj.propertyFeatures = typeof req.body.propertyFeatures === "string"
      ? req.body.propertyFeatures.split(",").map(id => new mongoose.Types.ObjectId(id.trim()))
      : req.body.propertyFeatures.map(id => new mongoose.Types.ObjectId(id));
  }

  // Media files (mainImage, pool, bathroom, bedroom)
  let mediaObj = { ...property.media };
  let mediaUpdated = false;

  if (mainImage && mainImage.length) {
    mediaObj.mainImage = [
      ...(property.media?.mainImage || []),
      ...mainImage.map((f) => f.filename),
    ];
    mediaUpdated = true;
  }

  if (poolImage && poolImage.length) {
    mediaObj.pool = [
      ...(property.media?.pool || []),
      ...poolImage.map((f) => f.filename),
    ];
    mediaUpdated = true;
  }

  if (bathroomImage && bathroomImage.length) {
    mediaObj.bathroom = [
      ...(property.media?.bathroom || []),
      ...bathroomImage.map((f) => f.filename),
    ];
    mediaUpdated = true;
  }

  if (bedroomImage && bedroomImage.length) {
    mediaObj.bedroom = [
      ...(property.media?.bedroom || []),
      ...bedroomImage.map((f) => f.filename),
    ];
    mediaUpdated = true;
  }

  if (mediaUpdated) {
    obj.media = mediaObj;
  }

  // Document update logic
  if (document?.length) {
    if (property.approvalStatus === "rejected") {
      if (property.document) {
        const oldDocPath = path.join(
          process.cwd(),
          "uploads",
          "propertyDocument",
          property.document
        );
        if (fs.existsSync(oldDocPath)) {
          try {
            fs.unlinkSync(oldDocPath);
          } catch (err) {
            console.error("Error deleting old property document:", err);
          }
        }
      }
      obj.document = document[0].filename;
      obj.approvalStatus = "pending";
      obj.approvedBy = null;
      obj.approvedAt = null;
      obj.rejectionReason = null;
    } else {
      // Clean up unallowed uploaded file
      const newDocPath = path.join(
        process.cwd(),
        "uploads",
        "propertyDocument",
        document[0].filename
      );
      if (fs.existsSync(newDocPath)) {
        try {
          fs.unlinkSync(newDocPath);
        } catch (err) {
          console.error("Error deleting unallowed new document:", err);
        }
      }
    }
  }

  if (req.body.count) {
    obj.count = Number(req.body.count);
  }

  await Properties.updateOne({ _id: id }, { $set: obj });

  if (obj.approvalStatus === "pending") {
    const admins = await Admin.find({}, "_id");

    for (let admin of admins) {
      await sendNotification({
        receiverId: admin._id,
        receiverModel: "Admin",
        senderId: req.user._id,
        senderModel: "ServiceUser",
        title: "Property Updated for Review 🔄",
        body: "A property has been updated and needs approval again.",
        type: "PROPERTY",
        referenceId: id,
        referenceType: "Property",
        data: {
          propertyId: id,
        },
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: "Property updated successfully",
    _id: id,
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
  return res.status(200).json({ success: true, message: "Properties deleted successfully" });
});

const getUpcomingBookings = catchAsyncError(async (req, res) => {

  const userId = req.user._id;

  // ✅ Get properties of this service user
  const properties = await Properties.find({ user: userId })
    .select("_id")
    .lean();

  const propertyIds = properties.map(p => p._id);

  // ✅ Get services of this service user
  const services = await Service.find({ user: userId })
    .select("_id")
    .lean();

  const serviceIds = services.map(s => s._id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookings = await Booking.find({

    $or: [
      { property: { $in: propertyIds } },
      { "services.service": { $in: serviceIds } }
    ],

    checkOut: { $gte: today },
    bookingStatus: { $in: ["confirmed", "pending"] },
    paymentStatus: "paid"
  })
    .populate("user", "firstName lastName phone profile")
    .populate("property", "name address")
    .populate("services.service", "name price duration")
    .sort({ checkIn: 1 })
    .lean();

  return res.status(200).json({
    success: true,
    data: bookings,
    message: bookings.length
      ? "Upcoming bookings fetched"
      : "No upcoming bookings"
  });
});

const getBookingHistory = catchAsyncError(async (req, res) => {

  const userId = req.user._id;

  const properties = await Properties.find({ user: userId })
    .select("_id")
    .lean();

  const propertyIds = properties.map(p => p._id);

  const services = await Service.find({ user: userId })
    .select("_id")
    .lean();

  const serviceIds = services.map(s => s._id);

  const bookings = await Booking.find({

    $or: [
      { property: { $in: propertyIds } },
      { "services.service": { $in: serviceIds } }
    ],

    bookingStatus: { $in: ["confirmed", "cancelled"] }

  })
    .populate("user", "firstName lastName phone profile identityNumber identityDocuments dateOfBirth verificationService legalFullNameEn legalFullNameEr")
    .populate("property", "name address price")
    .populate("services.service", "name price duration")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({
    success: true,
    data: bookings,
    message: bookings.length
      ? "Booking history fetched successfully"
      : "No booking history found"
  });

});

const getBookingCalendar = catchAsyncError(async (req, res) => {

  const userId = req.user._id;

  const properties = await Properties.find({ user: userId })
    .select("_id")
    .lean();

  const propertyIds = properties.map(p => p._id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = await HotelAvailability.find({
    hotel: { $in: propertyIds },
    isBooked: true,
    date: { $gte: today }
  })
    .select("date booking hotel")
    .populate({
      path: "booking",
      select: "bookingStatus"
    })
    .lean();

  return res.status(200).json({
    success: true,
    data: dates,
    message: "Calendar data fetched"
  });

});


const addBankDetails = async (req, res) => {
  try {

    const { accountHolderName, accountNumber, bankName, ifscCode, iban, swiftCode, isPrimary } = req.body;

    if (isPrimary) {
      await BankDetails.updateMany(
        { user: req.user._id },
        { isPrimary: false }
      );
    }

    const bank = await BankDetails.create({
      user: req.user._id,
      accountHolderName,
      accountNumber,
      bankName,
      ifscCode,
      iban,
      swiftCode,
      isPrimary
    });

    res.status(201).send({
      success: true,
      data: bank
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const getAllBanks = async (req, res) => {
  try {

    const banks = await BankDetails.find({
      user: req.user._id,
      isDeleted: false
    }).sort({ createdAt: -1 });

    res.send({
      success: true,
      data: banks
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const getBankById = async (req, res) => {
  try {

    const bank = await BankDetails.findOne({
      _id: req.params.id,
      user: req.user._id,
      isDeleted: false
    });

    if (!bank) {
      return res.status(404).send({
        message: "Bank not found"
      });
    }

    res.send({
      success: true,
      data: bank
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const updateBankDetails = async (req, res) => {
  try {

    const { isPrimary } = req.body;

    if (isPrimary) {
      await BankDetails.updateMany(
        { user: req.user._id },
        { isPrimary: false }
      );
    }

    const bank = await BankDetails.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        isDeleted: false
      },
      req.body,
      { new: true }
    );

    res.send({
      success: true,
      data: bank
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const deleteBankDetails = async (req, res) => {
  try {

    await BankDetails.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id
      },
      {
        isDeleted: true,
        isPrimary: false
      }
    );

    res.send({
      success: true,
      message: "Bank deleted successfully"
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const setPrimaryBank = async (req, res) => {
  try {

    await BankDetails.updateMany(
      { user: req.user._id },
      { isPrimary: false }
    );

    const bank = await BankDetails.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        isDeleted: false
      },
      { isPrimary: true },
      { new: true }
    );

    res.send({
      success: true,
      data: bank
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const getWallet = async (req, res) => {
  try {

    const wallet = await Wallet.findOne({
      user: req.user._id
    });

    if (!wallet) {
      return res.status(404).send({
        success: false,
        message: "Wallet not found"
      });
    }

    res.send({
      success: true,
      data: wallet
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const getWalletTransactions = async (req, res) => {
  try {

    const { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    const skip = (pageNumber - 1) * limitNumber;

    const filter = {
      user: req.user._id
    };

    const total = await WalletTransaction.countDocuments(filter);

    const transactions = await WalletTransaction.find(filter)
      .populate("bookingId", "orderId checkIn checkOut")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    const totalPages = Math.ceil(total / limitNumber);

    res.send({
      success: true,
      data: transactions,
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages,
      previousDisabled: pageNumber <= 1,
      nextPage: pageNumber + 1,
      previousPage: pageNumber - 1,
      nextDisabled: pageNumber >= totalPages
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const createWithdrawRequest = async (req, res) => {
  try {

    const { amount } = req.body;

    const wallet = await Wallet.findOne({
      user: req.user._id
    });

    if (!wallet) {
      return res.status(404).send({
        message: "Wallet not found"
      });
    }

    if (wallet.balance < amount) {
      return res.status(400).send({
        message: "Insufficient balance"
      });
    }

    // get primary bank
    const bank = await BankDetails.findOne({
      user: req.user._id,
      isPrimary: true,
      isDeleted: false
    });

    if (!bank) {
      return res.status(400).send({
        message: "Primary bank account not found"
      });
    }
    const pending = await WithdrawRequest.findOne({
      user: req.user._id,
      status: "pending"
    });

    if (pending) {
      return res.status(400).send({
        message: "You already have a pending withdraw request"
      });
    }
    const withdraw = await WithdrawRequest.create({
      user: req.user._id,
      amount,
      bankDetails: bank._id
    });

    const admins = await Admin.find({}, "_id");

    for (let admin of admins) {
      await sendNotification({
        receiverId: admin._id,
        receiverModel: "Admin",
        senderId: req.user._id,
        senderModel: "ServiceUser",
        title: "New Withdraw Request 💰",
        body: `A new withdraw request of ₹${amount} has been submitted.`,
        type: "PAYMENT",
        referenceId: withdraw._id,
        referenceType: "Payment",
        data: {
          withdrawId: withdraw._id,
          amount,
        },
      });
    }

    res.status(201).send({
      success: true,
      data: withdraw
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};


const getWithdrawHistory = async (req, res) => {
  try {

    let { page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const skip = (page - 1) * limit;

    const filter = {
      user: req.user._id
    };

    const total = await WithdrawRequest.countDocuments(filter);

    const withdraws = await WithdrawRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data: withdraws,
      page,
      limit,
      total,
      message: withdraws.length
        ? "Withdraw history fetched successfully"
        : "No withdraw history found"
    });

  } catch (error) {

    return res.status(500).send({
      success: false,
      message: error.message
    });
  }
};


const getServiceUserBookingDetail = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID"
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId
    })
      .populate({
        path: "property",
        populate: [
          {
            path: "propertyAmenities",
            model: "Amenities",
            select: "name icon"
          },
          {
            path: "propertyFeatures",
            model: "Feature",
            select: "feature"
          },
          {
            path: "user",
            select: "_id"
          }
        ]
      })
      .populate({
        path: "services.service"
      })
      .populate({
        path: "providerBreakdown.user",
        select: "_id"
      })
      .populate({
        path: "user",
        select: "firstName lastName email phone profile identityNumber identityDocuments dateOfBirth verificationService legalFullNameEn legalFullNameEr"
      })
      .populate("couponId");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    // Authorization check for PROPERTY vs SERVICE bookings
    const loggedInUserId = req.user._id.toString();
    let isAuthorized = false;

    if (booking.bookingType === "SERVICE") {
      isAuthorized = Array.isArray(booking.providerBreakdown) && booking.providerBreakdown.some(pb => {
        if (pb.type !== "service" || !pb.user) return false;
        const providerId = pb.user._id ? pb.user._id.toString() : pb.user.toString();
        return providerId === loggedInUserId;
      });
    } else if (booking.bookingType === "PROPERTY") {
      if (booking.property && booking.property.user) {
        const propertyOwnerId = booking.property.user._id ? booking.property.user._id.toString() : booking.property.user.toString();
        isAuthorized = propertyOwnerId === loggedInUserId;
      }
    } else {
      // Fallback for combined or other types e.g. PROPERTY_SERVICE
      const isPropertyOwner = booking.property && booking.property.user && (
        (booking.property.user._id ? booking.property.user._id.toString() : booking.property.user.toString()) === loggedInUserId
      );
      const isServiceProvider = Array.isArray(booking.providerBreakdown) && booking.providerBreakdown.some(pb => {
        if (!pb.user) return false;
        const providerId = pb.user._id ? pb.user._id.toString() : pb.user.toString();
        return providerId === loggedInUserId;
      });
      isAuthorized = isPropertyOwner || isServiceProvider;
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this booking"
      });
    }

    // Build customer information
    const user = booking.user;
    let customer = null;

    if (user) {
      const fullName = user.legalFullName || user.legalFullNameEn || user.legalFullNameAr || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "";

      let averageRating = 0;
      let totalRatings = 0;

      if (user._id) {
        const reviewStats = await Review.aggregate([
          {
            $match: {
              reviewee: new mongoose.Types.ObjectId(user._id),
              revieweeModel: "User",
              isDeleted: { $ne: true }
            }
          },
          {
            $group: {
              _id: "$reviewee",
              averageRating: { $avg: "$rating" },
              totalRatings: { $sum: 1 }
            }
          }
        ]);

        if (reviewStats && reviewStats.length > 0) {
          averageRating = Number(reviewStats[0].averageRating.toFixed(1));
          totalRatings = reviewStats[0].totalRatings;
        }
      }

      customer = {
        id: user._id,
        fullName,
        profile: user.profile || null,
        identityNumber: user.identityNumber || null,
        dateOfBirth: user.dateOfBirth || null,
        verificationStatus: user.identityVerificationStatus || "UNVERIFIED",
        email: user.email || null,
        phone: user.phone || null,
        averageRating,
        totalRatings
      };
    }

    // Check if logged-in service user has already submitted a review for this booking
    const existingServiceUserReview = await Review.findOne({
      booking: bookingId,
      reviewer: req.user._id,
      reviewType: "user",
      isDeleted: { $ne: true }
    }).select("_id").lean();

    const isServiceUserReview = !!existingServiceUserReview;

    // Check if customer (user) has submitted a review for this booking
    const existingCustomerReview = await Review.findOne({
      booking: bookingId,
      reviewerModel: "User",
      isDeleted: { $ne: true }
    }).select("_id").lean();

    const isCustomerReview = !!existingCustomerReview || !!booking.reviewGiven;

    if (customer) {
      customer.isServiceUserReview = isServiceUserReview;
      customer.isCustomerReview = isCustomerReview;
    }

    res.json({
      success: true,
      booking,
      customer,
      isServiceUserReview,
      isCustomerReview,
      isUserReview: isCustomerReview
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const getActiveServiceCategories = async (req, res) => {
  try {
    const categories = await ServiceCategory.find({ isActive: true })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


function convertToMinutes(time) {
  if (!time || typeof time !== "string") return null;

  const str = time.trim().toUpperCase();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3];

  if (hours < 0 || minutes < 0 || minutes > 59) return null;

  if (modifier) {
    if (hours < 1 || hours > 12) return null;
    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
}


const createService = async (req, res) => {
  console.log("req.body", req.body);
  try {
    const {
      name,
      category,
      oldPrice,
      price,
      priceType,
      maxPersons,
      policies,
      description,
      workingDays,
      start,
      end,
      city,
      state,
      country,
      lat,
      lng,
      cancellationPolicy
    } = req.body;

    if (!name || !category || !price || !lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "name, category, price, lat, lng, are required"
      });
    }

    if (
      oldPrice &&
      (isNaN(oldPrice) || Number(oldPrice) <= Number(price))
    ) {
      return res.status(400).json({
        success: false,
        message: "oldPrice must be greater than price"
      });
    }

    let discountPercent = 0;

    if (oldPrice && Number(oldPrice) > Number(price)) {
      discountPercent = Math.round(
        ((Number(oldPrice) - Number(price)) / Number(oldPrice)) * 100
      );
    }
    // ✅ FILES FIX
    const files = req.files || {};

    const serviceMedia = files.serviceMedia || [];
    const documentFile = files.document || [];

    const images = serviceMedia.map(file => file.filename);

    const document = documentFile.length ? documentFile[0].filename : null;

    // ❗ Since schema requires document
    if (!document) {
      return res.status(400).json({
        success: false,
        message: "Document is required"
      });
    }

    // ----------- VALIDATIONS -----------

    if (isNaN(price) || Number(price) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid positive number"
      });
    }

    const validPriceTypes = ["per_person", "flat"];

    if (priceType && !validPriceTypes.includes(priceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priceType"
      });
    }

    // ✅ maxPersons validation
    if (
      maxPersons &&
      (isNaN(maxPersons) || Number(maxPersons) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "maxPersons must be greater than 0"
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (
      isNaN(latitude) || latitude < -90 || latitude > 90 ||
      isNaN(longitude) || longitude < -180 || longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude"
      });
    }

    let duration = null;

    if (start && end) {
      const startMinutes = convertToMinutes(start);
      const endMinutes = convertToMinutes(end);

      if (startMinutes === null || endMinutes === null) {
        return res.status(400).json({
          success: false,
          message: "Invalid start or end time format"
        });
      }

      duration = endMinutes - startMinutes;
      if (duration <= 0) {
        duration += 24 * 60; // Handle overnight times (e.g., 12:05PM to 12:05AM)
      }
    }

    const policy = await CancellationPolicy.findOne({
      _id: cancellationPolicy,
      isActive: true
    });

    if (!policy) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive cancellation policy"
      });
    }

    // ✅ policies handling
    let parsedPolicies = [];

    if (policies) {
      if (Array.isArray(policies)) {
        parsedPolicies = policies;
      } else if (typeof policies === "string") {
        try {
          const parsed = JSON.parse(policies);

          parsedPolicies = Array.isArray(parsed)
            ? parsed
            : [policies];
        } catch (err) {
          parsedPolicies = [policies];
        }
      }
    }
    // ----------- CREATE SERVICE -----------

    const service = await Service.create({

      user: req.user._id,

      name,

      category,
      oldPrice: oldPrice ? Number(oldPrice) : null,
      price: Number(price),
      discountPercent,
      priceType: priceType || "flat",

      // ✅ NEW
      maxPersons: Number(maxPersons) || 1,

      // ✅ NEW
      policies: parsedPolicies,

      duration,

      description,

      workingDays,

      document,

      cancellationPolicy: policy._id,

      workingHours: {
        start,
        end
      },

      media: {
        images
      },

      location: {
        city,
        state,
        country,
        coordinates: {
          type: "Point",
          coordinates: [longitude, latitude]
        }
      }

    });

    const admins = await Admin.find({}, "_id");

    for (let admin of admins) {
      await sendNotification({
        receiverId: admin._id,
        receiverModel: "Admin",
        senderId: req.user._id,
        senderModel: "ServiceUser",
        title: "New Service Added 🛠️",
        body: "A new service has been submitted for approval.",
        type: "SERVICE",
        referenceId: service._id,
        referenceType: "Service",
        data: {
          serviceId: service._id,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: service
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const getMyServices = async (req, res) => {
  try {
    const services = await Service.find({
      user: req.user._id,
      isDeleted: false
    })
      .populate("category", "name icon")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: services
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSingleService = async (req, res) => {
  try {

    const service = await Service.findOne({
      _id: req.params.id,
      isDeleted: false
    }).populate("category", "name icon")

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.status(200).json({
      success: true,
      data: service
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const updateService = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findOne({
      _id: id,
      user: req.user._id,
      isDeleted: false
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    const {
      name,
      category,
      oldPrice,
      price,
      priceType,
      maxPersons,
      policies,
      description,
      workingDays,
      start,
      end,
      city,
      state,
      country,
      lat,
      lng,
      cancellationPolicy
    } = req.body;

    // ✅ FILE HANDLING FIX
    const files = req.files || {};
    const serviceMedia = files.serviceMedia || [];
    const documentFile = files.document || [];

    // ---------------- VALIDATIONS ----------------

    if (price && (isNaN(price) || Number(price) <= 0)) {
      return res.status(400).json({
        success: false,
        message: "Invalid price"
      });
    }

    const effectivePrice = price ? Number(price) : service.price;

    if (oldPrice !== undefined) {
      if (
        oldPrice &&
        (isNaN(oldPrice) || Number(oldPrice) <= effectivePrice)
      ) {
        return res.status(400).json({
          success: false,
          message: "oldPrice must be greater than price"
        });
      }
    } else if (service.oldPrice && effectivePrice >= service.oldPrice) {
      return res.status(400).json({
        success: false,
        message: "oldPrice must be greater than price"
      });
    }

    const validPriceTypes = ["per_person", "flat"];

    if (priceType && !validPriceTypes.includes(priceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priceType"
      });
    }

    // ✅ maxPersons validation
    if (
      maxPersons &&
      (isNaN(maxPersons) || Number(maxPersons) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "maxPersons must be greater than 0"
      });
    }

    if ((start && !end) || (!start && end)) {
      return res.status(400).json({
        success: false,
        message: "Start and end time must be together"
      });
    }

    if ((lat && !lng) || (!lat && lng)) {
      return res.status(400).json({
        success: false,
        message: "Both lat and lng are required"
      });
    }

    // ---------------- LOCATION UPDATE ----------------

    if (lat && lng) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);

      if (
        isNaN(latitude) || latitude < -90 || latitude > 90 ||
        isNaN(longitude) || longitude < -180 || longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid coordinates"
        });
      }

      service.location.coordinates = {
        type: "Point",
        coordinates: [longitude, latitude]
      };
    }

    // ---------------- IMAGE UPDATE ----------------

    if (serviceMedia.length > 0) {
      try {
        if (service.media?.images?.length) {
          service.media.images.forEach(img => {
            const filePath = path.join(
              __dirname,
              "../uploads/serviceMedia",
              img
            );

            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
        }
      } catch (err) {
        console.log("Image delete error:", err.message);
      }

      service.media.images = serviceMedia.map(file => file.filename);
    }

    // ---------------- DOCUMENT UPDATE + RESET APPROVAL ----------------

    if (documentFile.length > 0) {
      if (service.approvalStatus === "rejected") {
        try {
          if (service.document) {
            const oldPath = path.join(
              __dirname,
              "../uploads/propertyDocument",
              service.document
            );

            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          }
        } catch (err) {
          console.log("Document delete error:", err.message);
        }

        service.document = documentFile[0].filename;

        // 🔥 RESET APPROVAL
        service.approvalStatus = "pending";
        service.approvedBy = null;
        service.approvedAt = null;
        service.rejectionReason = null;
      } else {
        // Document update is not allowed when status is not rejected
        // Clean up newly uploaded file to avoid orphaned files
        try {
          const newPath = path.join(
            __dirname,
            "../uploads/propertyDocument",
            documentFile[0].filename
          );
          if (fs.existsSync(newPath)) {
            fs.unlinkSync(newPath);
          }
        } catch (err) {
          console.log("Unallowed document delete error:", err.message);
        }
      }
    }

    // ---------------- BASIC FIELD UPDATES ----------------

    if (name) service.name = name.trim();

    if (category) service.category = category;

    if (price) service.price = Number(price);

    if (oldPrice !== undefined) {
      service.oldPrice = oldPrice ? Number(oldPrice) : null;
    }

    if (service.oldPrice && Number(service.oldPrice) > Number(service.price)) {
      service.discountPercent = Math.round(
        ((Number(service.oldPrice) - Number(service.price)) / Number(service.oldPrice)) * 100
      );
    } else {
      service.discountPercent = 0;
    }

    if (priceType) service.priceType = priceType;

    // ✅ NEW
    if (maxPersons) {
      service.maxPersons = Number(maxPersons);
    }

    // ✅ NEW
    if (policies) {
      if (Array.isArray(policies)) {
        service.policies = policies;
      } else {
        service.policies = [policies];
      }
    }

    if (description) {
      service.description = description.trim();
    }

    // ---------------- WORKING DAYS ----------------

    if (workingDays) {
      const validDays = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ];

      const invalid = workingDays.filter(
        day => !validDays.includes(day)
      );

      if (invalid.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid workingDays: ${invalid.join(", ")}`
        });
      }

      service.workingDays = workingDays;
    }

    // ---------------- TIME + DURATION ----------------

    if (start || end) {
      const newStart = start || service.workingHours.start;
      const newEnd = end || service.workingHours.end;

      const startMinutes = convertToMinutes(newStart);
      const endMinutes = convertToMinutes(newEnd);

      if (startMinutes === null || endMinutes === null) {
        return res.status(400).json({
          success: false,
          message: "Invalid start or end time format"
        });
      }

      let duration = endMinutes - startMinutes;
      if (duration <= 0) {
        duration += 24 * 60; // Handle overnight times (e.g., 12:05PM to 12:05AM)
      }

      service.workingHours.start = newStart;
      service.workingHours.end = newEnd;
      service.duration = duration;
    }

    // ---------------- LOCATION TEXT ----------------

    if (city) service.location.city = city;

    if (state) service.location.state = state;

    if (country) service.location.country = country;

    // ---------------- CANCELLATION POLICY ----------------

    if (cancellationPolicy) {
      const policy = await CancellationPolicy.findOne({
        _id: cancellationPolicy,
        isActive: true
      });

      if (!policy) {
        return res.status(400).json({
          success: false,
          message: "Invalid or inactive cancellation policy"
        });
      }

      service.cancellationPolicy = policy._id;
    }

    // ---------------- SAVE ----------------

    await service.save();

    if (service.approvalStatus === "pending") {
      const admins = await Admin.find({}, "_id");

      for (let admin of admins) {
        await sendNotification({
          receiverId: admin._id,
          receiverModel: "Admin",
          senderId: req.user._id,
          senderModel: "ServiceUser",
          title: "Service Updated for Review 🔄",
          body: "A service has been updated and needs approval again.",
          type: "SERVICE",
          referenceId: service._id,
          referenceType: "Service",
          data: {
            serviceId: service._id,
          },
        });
      }
    }

    res.json({
      success: true,
      message: "Service updated successfully",
      data: service
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findOneAndUpdate(
      { _id: id, user: req.user._id, isDeleted: false, },
      {
        isDeleted: true,
        isActive: false
      },
      { new: true }
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    res.json({
      success: true,
      message: "Service deleted successfully"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const toggleServiceStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findOne({
      _id: id,
      user: req.user._id,
      isDeleted: false
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    service.isActive = !service.isActive;
    await service.save();

    res.json({
      success: true,
      message: "Service status updated",
      data: service
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createPackage = async (req, res) => {
  try {

    const {
      name,
      property,
      services,
      basePrice,
      description
    } = req.body;

    if (!name || !property) {
      return res.status(400).json({
        success: false,
        message: "Name and property are required"
      });
    }

    const propertyData = await Properties.findById(property);

    if (!propertyData) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    let serviceDocs = [];

    if (services && Array.isArray(services) && services.length > 0) {

      const serviceIds = services.map(s => s.serviceId);

      const existingServices = await Service.find({
        _id: { $in: serviceIds },
        isDeleted: false,
        isActive: true
      }).select("_id");

      const validServiceIds = existingServices.map(s => s._id.toString());

      serviceDocs = services
        .filter(s => validServiceIds.includes(s.serviceId))
        .map(s => ({
          service: s.serviceId,
          price: s.price
        }));

    }

    const pkg = await Package.create({
      name,
      user: req.user._id,
      property,
      services: serviceDocs,
      basePrice: basePrice || 0,
      description,
      location: propertyData.address?.location
    });

    await Properties.findByIdAndUpdate(
      property,
      { $inc: { experienceCount: 1 } }
    );

    res.status(201).json({
      success: true,
      message: "Package created successfully",
      data: pkg
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

const updatePackage = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      name,
      property,
      services,
      basePrice,
      description
    } = req.body;

    const existingPackage = await Package.findOne({
      _id: id,
      user: req.user._id,
      isDeleted: false
    });

    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      });
    }

    let updateData = {};

    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (basePrice !== undefined) updateData.basePrice = basePrice;

    /* -------- PROPERTY UPDATE -------- */

    if (property) {

      const propertyData = await Properties.findById(property);

      if (!propertyData) {
        return res.status(404).json({
          success: false,
          message: "Property not found"
        });
      }

      updateData.property = property;
      updateData.location = propertyData.address?.location;

    }

    /* -------- SERVICES UPDATE -------- */

    if (services && Array.isArray(services)) {

      const serviceIds = services.map(s => s.serviceId);

      const existingServices = await Service.find({
        _id: { $in: serviceIds },
        isDeleted: false,
        isActive: true
      }).select("_id");

      const validServiceIds = existingServices.map(s => s._id.toString());

      const serviceDocs = services
        .filter(s => validServiceIds.includes(s.serviceId))
        .map(s => ({
          service: s.serviceId,
          price: s.price
        }));

      updateData.services = serviceDocs;

    }

    const updatedPackage = await Package.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      message: "Package updated successfully",
      data: updatedPackage
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

const getAllPackages = async (req, res) => {
  try {

    let { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {
      user: req.user._id,
      isDeleted: false
    };

    const total = await Package.countDocuments(filter);

    const packages = await Package.find(filter)
      .populate({
        path: "services.service",
        select: "name"
      })
      .populate({
        path: "property",
        select: "name"
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const totalPages = Math.ceil(total / limitNumber);

    res.send({
      success: true,
      data: packages,
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages,
      previousDisabled: pageNumber <= 1,
      nextPage: pageNumber + 1,
      previousPage: pageNumber - 1,
      nextDisabled: pageNumber >= totalPages
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

const getSinglePackage = async (req, res) => {
  try {

    const { id } = req.params;

    const pkg = await Package.findOne({
      _id: id,
      user: req.user._id,
      isDeleted: false
    })
      .populate({
        path: "services.service",
        select: "name description"
      })
      .populate({
        path: "property",
        select: "name"
      });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      });
    }

    res.json({
      success: true,
      data: pkg
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

const togglePackageStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await Package.findOne({
      _id: id,
      user: req.user._id,
      isDeleted: false
    });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      });
    }

    pkg.isActive = !pkg.isActive;
    await pkg.save();

    res.json({
      success: true,
      message: "Package status updated",
      data: pkg
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deletePackage = async (req, res) => {
  try {

    const { id } = req.params;

    const pkg = await Package.findOneAndUpdate(
      {
        _id: id,
        user: req.user._id,
        isDeleted: false
      },
      {
        isDeleted: true,
        isActive: false
      },
      { new: true }
    );

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      });
    }

    await Properties.findByIdAndUpdate(
      pkg.property,
      { $inc: { experienceCount: -1 } }
    );

    res.json({
      success: true,
      message: "Package deleted successfully"
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

const getAllservicesForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const filter = {
      user: userId,
      isDeleted: false,
      approvalStatus: "approved"
    };

    const services = await Service.find(filter)
      .populate("category", "name")
      .sort({ createdAt: -1 });

    return res.send({
      success: true,
      total: services.length,
      data: services
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const createServiceUserReview = async (req, res) => {
  try {
    const { bookingId, ratingsBreakdown, comment, captions } = req.body;

    // Fetch booking and populate property owner & user
    const booking = await Booking.findById(bookingId).populate("user property");
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Ensure reviewer is the property owner
    if (!booking.property || booking.property.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not the owner of this property" });
    }

    // Ensure review is after checkout
    if (new Date() < new Date(booking.checkOut)) {
      return res.status(400).json({ message: "Review allowed only after checkout" });
    }

    // Check for duplicate review
    const exists = await Review.findOne({
      booking: bookingId,
      reviewer: req.user._id,
      reviewType: "user",
    });
    if (exists) return res.status(400).json({ message: "Already reviewed this user" });

    // Handle photos + captions
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
        caption: captionsArray[i] || "",
      }));
    }

    // Calculate average rating from ratingsBreakdown
    if (!ratingsBreakdown || Object.keys(ratingsBreakdown).length === 0) {
      return res.status(400).json({ message: "ratingsBreakdown is required" });
    }

    const values = Object.values(ratingsBreakdown)
      .map(v => Number(v))
      .filter(v => !isNaN(v));

    if (values.length === 0) {
      return res.status(400).json({ message: "ratingsBreakdown must contain numbers" });
    }

    const finalRating = values.reduce((a, b) => a + b, 0) / values.length;

    // Create review
    const review = await Review.create({
      reviewer: req.user._id,
      reviewerModel: "ServiceUser",
      reviewee: booking.user._id,
      revieweeModel: "User",
      booking: bookingId,
      reviewType: "user",
      rating: finalRating,
      ratingsBreakdown,
      comment,
      photos,
    });

    return res.status(201).json({
      success: true,
      message: "Guest reviewed successfully",
      data: review,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};


const getMyReviews = async (req, res) => {
  try {
    const userId = req.user._id;

    const { type, page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;


    const services = await Service.find({ user: userId }).select("_id");
    const serviceIds = services.map(s => s._id);

    const properties = await Properties.find({ user: userId }).select("_id");
    const propertyIds = properties.map(p => p._id);

    let match = {
      isDeleted: false,
      $or: [
        { reviewee: userId }, // reviews about user
        { service: { $in: serviceIds } }, // service reviews
        { property: { $in: propertyIds } } // property reviews
      ]
    };

    // ✅ filter by type (property | service | user)
    if (type) {
      match.reviewType = type;
    }

    const reviews = await Review.find(match)
      .populate("reviewer", "firstName lastName profile")
      .populate("service", "name")
      .populate("property", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    /* ========================
       🔥 TOTAL COUNT
    ======================== */
    const total = await Review.countDocuments(match);

    /* ========================
       🔥 SUMMARY (OPTIONAL)
    ======================== */
    const summaryAgg = await Review.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    const summary = summaryAgg[0] || {
      avgRating: 0,
      totalReviews: 0
    };

    /* ========================
       🚀 RESPONSE
    ======================== */
    res.json({
      success: true,

      // pagination
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),

      // summary
      avgRating: Number(summary.avgRating?.toFixed(1)) || 0,
      totalReviews: summary.totalReviews,

      // data
      data: reviews
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};


const getServiceProviderDashboard = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);

    /* ========================
       📅 DATE RANGE
    ======================== */
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    /* ========================
       📊 BOOKINGS
    ======================== */
    const totalBookings = await Booking.countDocuments({
      "providerBreakdown.user": userId,
      paymentStatus: "paid",
      bookingStatus: "confirmed",
      isCancelled: false
    });

    const todayBookings = await Booking.countDocuments({
      "providerBreakdown.user": userId,
      checkIn: { $gte: todayStart, $lte: todayEnd },
      paymentStatus: "paid",
      bookingStatus: "confirmed",
      isCancelled: false
    });

    const pendingBookings = await Booking.countDocuments({
      "providerBreakdown.user": userId,
      paymentStatus: "paid",
      bookingStatus: "pending",
      isCancelled: false
    });
    /* ========================
       💬 CHATS
    ======================== */
    const activeChats = await Conversation.countDocuments({
      serviceUserId: userId,
      isDeleted: false,
      isClosed: false
    });

    /* ========================
       💰 EARNINGS
    ======================== */
    const earningsResult = await Booking.aggregate([
      {
        $match: {
          "providerBreakdown.user": userId,
          paymentStatus: "paid",
          bookingStatus: "confirmed",
          isCancelled: false
        }
      },
      { $unwind: "$providerBreakdown" },
      {
        $match: {
          "providerBreakdown.user": userId
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: "$providerBreakdown.amount" }
        }
      }
    ]);

    const totalEarnings = earningsResult[0]?.totalEarnings || 0;

    /* ========================
       🛠 SERVICES
    ======================== */
    const totalServices = await Service.countDocuments({
      user: userId,
      isDeleted: false
    });

    /* ========================
       📦 SERVICE BOOKINGS
    ======================== */
    const totalServiceBookings = await Booking.countDocuments({
      "providerBreakdown.user": userId,
      "providerBreakdown.type": "service",
      paymentStatus: "paid",
      bookingStatus: "confirmed",
      isCancelled: false
    });

    const todayServiceBookings = await Booking.countDocuments({
      "providerBreakdown.user": userId,
      "providerBreakdown.type": "service",
      checkIn: { $gte: todayStart, $lte: todayEnd },
      paymentStatus: "paid",
      bookingStatus: "confirmed",
      isCancelled: false
    });

    const pendingServiceBookings = await Booking.countDocuments({
      "providerBreakdown.user": userId,
      "providerBreakdown.type": "service",
      paymentStatus: "paid",
      bookingStatus: "pending",
      isCancelled: false
    });

    /* ========================
       💳 TRANSACTIONS
    ======================== */
    const transactions = await WalletTransaction.find({
      user: userId
    })
      .sort({ createdAt: -1 })
      .limit(5);

    /* ========================
       ⭐ REVIEWS
    ======================== */
    const reviews = await Review.find({
      reviewee: userId,
      revieweeModel: "ServiceUser",
      isDeleted: false
    })
      .populate("reviewer", "firstName lastName profile")
      .sort({ createdAt: -1 })
      .limit(5);

    /* ========================
       👤 EXPERIENCE (FIXED)
    ======================== */
    const provider = await ServiceUser.findById(userId).select("createdAt");

    let experienceMonths = 0;
    let experienceText = "0 Months";

    if (provider?.createdAt) {
      const created = new Date(provider.createdAt);
      const now = new Date();

      experienceMonths =
        (now.getFullYear() - created.getFullYear()) * 12 +
        (now.getMonth() - created.getMonth());

      if (experienceMonths < 0) experienceMonths = 0;

      // format text
      if (experienceMonths < 1) {
        experienceText = "New";
      } else if (experienceMonths < 12) {
        experienceText = `${experienceMonths} Month${experienceMonths > 1 ? "s" : ""}`;
      } else {
        const years = Math.floor(experienceMonths / 12);
        const months = experienceMonths % 12;

        experienceText =
          months === 0
            ? `${years} Year${years > 1 ? "s" : ""}`
            : `${years} Year${years > 1 ? "s" : ""} ${months} Month${months > 1 ? "s" : ""}`;
      }
    }

    /* ========================
       📦 RESPONSE
    ======================== */
    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalBookings,
          todayBookings,
          pendingBookings,
          activeChats,
          totalEarnings,

          experienceMonths, // 🔢 raw
          experienceText,   // 🧾 UI ready

          totalServices,
          totalServiceBookings,
          todayServiceBookings,
          pendingServiceBookings
        },
        transactions,
        reviews
      }
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const getAllCommissionsForServiceUser = catchAsyncError(async (req, res, next) => {
  try {

    const { type } = req.query;

    const query = {
      isActive: true,
      isDeleted: false,
    };

    // Filter by type if provided
    if (type) {
      query.type = type;
    }

    // Get global commission
    const globalCommission = await Commission.findOne({
      ...query,
      scope: "GLOBAL",
    }).lean();

    // Get category commissions
    const categoryCommissions = await Commission.find({
      ...query,
      scope: "CATEGORY",
    })
      .populate("categoryId", "category")
      .populate("serviceCategoryId", "name")
      .populate("serviceId", "title")
      .lean();

    res.status(200).json({
      success: true,
      message: "Commissions fetched successfully",
      data: {
        global: globalCommission || null,
        categories: categoryCommissions || [],
      },
    });

  } catch (error) {
    return next(error);
  }
});


const userLoginByServiceProviderToken = catchAsyncError(
  async (req, res, next) => {

    const { fcmToken } = req.body;

    // ✅ Logged in service provider
    const serviceUser = await ServiceUser.findOne(
      {
        _id: req.user._id,
        isDeleted: false,
      },
      {
        phone: 1,
      }
    ).lean();

    if (!serviceUser) {
      return res.status(400).send({
        message: "Service provider not found",
      });
    }

    // ✅ Find normal user using same phone
    const user = await User.findOne(
      {
        phone: serviceUser.phone,
        isDeleted: false,
      },
      {
        email: 1,
        phone: 1,
        role: 1,
        isVerified: 1,
      }
    );

    if (!user) {
      return res.status(400).send({
        message: "User account not found",
      });
    }

    // ✅ Create user token
    const userData = {
      _id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    const token = jwt.sign(
      { user: userData },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    // ✅ Save token + update fcmToken
    await User.updateOne(
      { _id: user._id },
      {
        $push: { tokens: token },
        ...(fcmToken && { fcmToken }),
      }
    );

    return res.status(200).json({
      success: true,
      data: token,
      role: user.role,
      isVerified: user.isVerified,
      message: "User login successful",
    });
  }
);


const deleteServiceUserAccount = catchAsyncError(async (req, res) => {
  const serviceUserId = req.user._id;

  const serviceUser = await ServiceUser.findOne({
    _id: serviceUserId,
    isDeleted: false,
  });

  if (!serviceUser) {
    return res.status(404).json({
      success: false,
      message: "Service provider not found",
    });
  }

  // ✅ Soft delete service provider
  await ServiceUser.findByIdAndUpdate(serviceUserId, {
    isDeleted: true,
    deletedAt: new Date(),
    tokens: [],
    email: null,
    phone: null,
  });

  // ✅ Soft delete related properties
  await Properties.updateMany(
    {
      user: serviceUserId,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
      },
    }
  );

  // ✅ Soft delete related services
  await Service.updateMany(
    {
      user: serviceUserId,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
        isActive: false,
      },
    }
  );

  return res.status(200).json({
    success: true,
    message: "Service provider account and related data deleted successfully",
  });
});

const toggleInstantBooking = async (req, res) => {
  try {
    const { type, id } = req.body;

    const providerId = req.user._id;

    let item;

    if (type === "PROPERTY") {

      item = await Properties.findOne({
        _id: id,
        user: providerId
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          message: "Property not found"
        });
      }

    } else if (type === "SERVICE") {

      item = await Service.findOne({
        _id: id,
        user: providerId
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          message: "Service not found"
        });
      }

    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid type"
      });
    }

    item.instantBooking = !item.instantBooking;

    await item.save();

    return res.status(200).json({
      success: true,
      message: `Instant booking ${item.instantBooking ? "enabled" : "disabled"
        } successfully`,
      instantBooking: item.instantBooking,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


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
  getBookingCalendar,
  addBankDetails,
  getAllBanks,
  getBankById,
  updateBankDetails,
  deleteBankDetails,
  setPrimaryBank,
  getWallet,
  getWalletTransactions,
  createWithdrawRequest,
  getWithdrawHistory,
  getServiceUserBookingDetail,
  getActiveServiceCategories,
  createService,
  getMyServices,
  getSingleService,
  updateService,
  deleteService,
  toggleServiceStatus,
  createPackage,
  getAllPackages,
  getSinglePackage,
  togglePackageStatus,
  deletePackage,
  updatePackage,
  getAllservicesForUser,
  createServiceUserReview,
  getMyReviews,
  getServiceProviderDashboard,
  getAllCommissionsForServiceUser,
  userLoginByServiceProviderToken,
  deleteServiceUserAccount,
  toggleInstantBooking
};
