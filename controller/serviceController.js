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
      message: "Admin has not approved your request yet.",
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

  return res.status(200).send({
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

  const { salutation, firstName, lastName, email, description, mobile, mobileCode } =
    req.body;

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
  const userDocuments = files?.docs;

  // ✅ File validation
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
    description,
    phone,
    phoneCode: mobileCode,
    OTP: null,
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

  return res.status(200).send({
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

  return res.status(200).send({
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
  return res.status(200).send({
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
        from: "propertyamenities",
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
        from: "propertyfeatures",
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

  return res.status(200).send({
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

  return res.status(200).send({
    data: updatedCategories,
    message: categories.length
      ? "Categories with commission fetched successfully"
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
      obj.description = req.body.description;
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
  const document = files.document;

  let obj = { media: { ...property.media } };

  switch (incomingCount) {
    case 1:
      const policy = await CancellationPolicy.findOne({
        _id: req.body.cancellationPolicy,
        isActive: true
      });

      if (!policy) {
        return res.status(400).json({
          success: false,
          message: "Invalid or inactive cancellation policy"
        });
      }
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
      obj.cancellationPolicy = policy._id;
      if (document?.length) {
        obj.document = document[0].filename;
        obj.approvalStatus = "pending";
        obj.approvedBy = null;
        obj.approvedAt = null;
        obj.rejectionReason = null;
      } else {
        return res.status(400).json({
          success: false,
          message: "Document is required in step 1"
        });
      }
      break;

    case 2:
      obj.address = {
        fullAddress: req.body.fullAddress,
        country: req.body.country,
        state: req.body.state,
        city: req.body.city,
        pincode: req.body.pincode,
        neighborhood: req.body.neighborhood,
        trends: req.body.trends,

        location: {
          type: "Point",
          coordinates: [
            parseFloat(req.body.lng),
            parseFloat(req.body.lat)
          ]
        }
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

    default:
      return res.status(400).send({ message: "Invalid count step" });
  }

  if (incomingCount > (property.count || 0)) {
    obj.count = incomingCount;
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

  return res.status(200).send({
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
    .populate("user", "firstName lastName phone profile")
    .populate("property", "name address price")
    .populate("services.service", "name price duration")
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

  return res.status(200).send({
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

    return res.status(200).send({
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
        path: "user",
        select: "firstName lastName email phone profile"
      })
      .populate("couponId");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    if (
      !booking.property ||
      !booking.property.user ||
      booking.property.user._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this booking"
      });
    }

    res.json({
      success: true,
      booking,
      customer: booking.user
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

  const [timePart, modifier] = time.split(" ");
  let [hours, minutes] = timePart.split(":").map(Number);

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

const createService = async (req, res) => {
  try {

    const {
      name,
      category,
      price,
      priceType,
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
        message: "name, category, price, lat, lng are required"
      });
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

    // ----------- VALIDATIONS (same as yours) -----------

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

      if (endMinutes <= startMinutes) {
        return res.status(400).json({
          success: false,
          message: "End time must be greater than start time"
        });
      }

      duration = endMinutes - startMinutes;
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
    // ----------- CREATE SERVICE -----------

    const service = await Service.create({

      user: req.user._id,
      name,
      category,
      price: Number(price),
      priceType: priceType || "flat",
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
      price,
      priceType,
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

    const validPriceTypes = ["per_person", "flat"];
    if (priceType && !validPriceTypes.includes(priceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priceType"
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
    }

    // ---------------- BASIC FIELD UPDATES ----------------

    if (name) service.name = name.trim();
    if (category) service.category = category;
    if (price) service.price = Number(price);
    if (priceType) service.priceType = priceType;
    if (description) service.description = description.trim();

    // ---------------- WORKING DAYS ----------------

    if (workingDays) {
      const validDays = [
        "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday", "Sunday"
      ];

      const invalid = workingDays.filter(day => !validDays.includes(day));

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

      if (endMinutes <= startMinutes) {
        return res.status(400).json({
          success: false,
          message: "End time must be greater than start time"
        });
      }

      service.workingHours.start = newStart;
      service.workingHours.end = newEnd;
      service.duration = endMinutes - startMinutes;
    }

    // ---------------- LOCATION TEXT ----------------

    if (city) service.location.city = city;
    if (state) service.location.state = state;
    if (country) service.location.country = country;
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
      isCancelled: false
    });

    const todayBookings = await Booking.countDocuments({
      "providerBreakdown.user": userId,
      checkIn: { $gte: todayStart, $lte: todayEnd },
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
      isCancelled: false
    });

    const todayServiceBookings = await Booking.countDocuments({
      "providerBreakdown.user": userId,
      "providerBreakdown.type": "service",
      checkIn: { $gte: todayStart, $lte: todayEnd },
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
          activeChats,
          totalEarnings,

          experienceMonths, // 🔢 raw
          experienceText,   // 🧾 UI ready

          totalServices,
          totalServiceBookings,
          todayServiceBookings
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
    // Get global commission
    const globalCommission = await Commission.findOne({
      scope: "GLOBAL",
      isActive: true,
      isDeleted: false,
    }).lean();

    // Get category commissions
    const categoryCommissions = await Commission.find({
      scope: "CATEGORY",
      isActive: true,
      isDeleted: false,
    })
      .populate("categoryId", "category") // optional (if you have category collection)
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

    // ✅ Save token
    await User.updateOne(
      { _id: user._id },
      {
        $push: { tokens: token },
      }
    );

    return res.status(200).send({
      data: token,
      role: user.role,
      isVerified: user.isVerified,
      message: "User login successful",
    });
  }
);

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
  userLoginByServiceProviderToken
};
