const Admin = require("../models/Admin");
const jwt = require("jsonwebtoken");
const Category = require("../models/Category");
const User = require("../models/User");
const ServiceUser = require("../models/ServiceUser");
const Feature = require("../models/Feature");
const RestRoom = require("../models/RestRoom");
const Amenities = require("../models/Amenities");
const Properties = require("../models/Properties")
const catchAsyncError = require("../functions/catchAsyncError");
const fs = require("fs");
const path = require("path");
const {
  generateRandomOTP,
  paginationQuery,
  pagination,
  humanize,
} = require("../functions/common");
const { sendMail } = require("../functions/mailer");
const mongoose = require("mongoose");
const objectId = require("mongoose").Types.ObjectId;
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const { checkValidations } = require("../functions/checkValidation");
const { validationResult } = require("express-validator");
const Coupon = require("../models/Coupon");
const Commission = require("../models/Commission");
const Banner = require("../models/Banner");
const Booking = require("../models/Booking");
const PaymentTransaction = require("../models/PaymentTransaction");
const PlatformFee = require("../models/PlatformFee");
const Tax = require("../models/Tax");
const HotelAvailability = require("../models/Availability");
const WalletTransaction = require("../models/WalletTransaction");
const WithdrawRequest = require("../models/WithdrawRequest");
const Wallet = require("../models/Wallet");
const ServiceCategory = require("../models/ServiceCategory");
const Service = require("../models/Service");
const Package = require("../models/Package");
const CancellationPolicy = require("../models/CancellationPolicy");
const Review = require("../models/Review");
const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const Notification = require("../models/Notification");
const { sendNotification } = require("../utils/notificationService");


// const adminLogin = catchAsyncError(async (req, res, next) => {
//   const errors = validationResult(req);
//   const checkValid = await checkValidations(errors);
//   if (checkValid.type === "error") {
//     return res.status(400).send({
//       message: checkValid.errors.msg,
//     });
//   }
//   let { email, password } = req.body;
//   email = email.toLowerCase();
//   const admin = await Admin.findOne({
//     email: email,
//     isDeleted: false,
//   });
//   if (!admin) return res.status(400).send({ message: "Invalid Credentials" });
//   const isMatched = await admin.matchPassword(password);
//   if (!isMatched)
//     return res.status(400).send({ message: "Invalid Credentials" });

//   const adminField = {
//     _id: admin._id,
//     firstName: admin.firstName,
//     email: admin.email,
//   };

//   const token = jwt.sign({ user: adminField }, process.env.JWT_SECRET, {
//     expiresIn: "30d",
//   });

//   await Admin.updateOne(
//     { _id: admin._id, isDeleted: false },
//     { $push: { tokens: token } }
//   );

//   return res.status(200).send({
//     token,
//     message: "Logged In Successfully",
//   });
// });


const adminLogin = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);
  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }

  let { email, password, fcmToken } = req.body; // ✅ Accept fcmToken
  email = email.toLowerCase();

  const admin = await Admin.findOne({
    email: email,
    isDeleted: false,
  });

  if (!admin) return res.status(400).send({ message: "Invalid Credentials" });

  const isMatched = await admin.matchPassword(password);
  if (!isMatched)
    return res.status(400).send({ message: "Invalid Credentials" });

  const adminField = {
    _id: admin._id,
    firstName: admin.firstName,
    email: admin.email,
  };

  const token = jwt.sign({ user: adminField }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });

  // ✅ Update admin: push JWT token and save FCM token if provided
  const updateData = { $push: { tokens: token } };
  if (fcmToken) {
    updateData.$set = { fcmToken: fcmToken };
  }

  await Admin.updateOne(
    { _id: admin._id, isDeleted: false },
    updateData
  );

  return res.status(200).send({
    token,
    message: "Logged In Successfully",
  });
});


const sendForgotPasswordOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    const checkValid = await checkValidations(errors);
    if (checkValid.type === "error") {
      return res.status(400).send({
        message: checkValid.errors.msg,
      });
    }
    const { email } = req.body;
    let user = await Admin.findOne({
      email: email.trim(),
    });
    if (!user) {
      user = await Admin.findOne({
        email: email.toLowerCase().trim(),
        isDeleted: false,
      }).lean(true);
    }

    if (!user) {
      return res.status(400).send({ message: "Admin not found" });
    }

    const otp = await generateRandomOTP();

    const mailVariables = {
      "%otp%": otp,
    };
    sendMail("send-forgotpassword-otp", mailVariables, user.email);

    Admin.updateOne(
      { _id: user._id, isDeleted: false },
      { $set: { otp: otp } }
    ).then();

    return res.status(200).json({
      id: user._id,
      email: user.email,
      message: "OTP sent Successfully",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};

const validOtp = async (req, res) => {
  try {
    const errors = validationResult(req);
    const checkValid = await checkValidations(errors);
    if (checkValid.type === "error") {
      return res.status(400).send({
        message: checkValid.errors.msg,
      });
    }
    const { email } = req.query;
    const { otp } = req.body;
    if (!email || !otp) {
      return res.status(400).send({ message: "Email and OTP are required" });
    }
    let user = await Admin.findOne({ email: email }).lean(true);
    const token = uuidv4();
    console.log("))))))))))", user);
    if (!user) {
      user = await Admin.findOne({
        email: email.toLowerCase().trim(),
        isDeleted: false,
      }).lean(true);
    }
    if (!user) {
      return res.status(400).send({ message: "User not found" });
    }
    if (!user.otp) {
      return res.status(400).send({ message: "Invalid OTP" });
    }
    if (user.otp !== otp) {
      return res.status(400).send({ message: "Invalid OTP" });
    }
    await Admin.updateOne(
      { _id: user._id, isDeleted: false },
      { $set: { token: token }, $unset: { otp: null } }
    );

    return res.status(200).json({
      message: "OTP verified successfully",
      id: user._id,
      token: token,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    const checkValid = await checkValidations(errors);
    if (checkValid.type === "error") {
      return res.status(400).send({
        message: checkValid.errors.msg,
      });
    }
    const { token } = req.query;
    const { newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
      return res.status(400).send({
        message: "New password and confirm password do not match.",
      });
    }

    if (!token) {
      return res.status(400).send({ message: "Token is required." });
    }

    const sanitizedToken = token === "null" ? null : token.trim();

    let user = await Admin.findOne({
      token: sanitizedToken,
      isDeleted: false,
    });

    if (!user) {
      return res.status(404).send({
        message: "Admin not found or invalid token.",
      });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await Admin.updateOne(
      { _id: user._id, isDeleted: false },
      {
        $set: {
          password: hashedPassword,
          token: null,
        },
      }
    );

    return res.status(200).json({ message: "Password reset successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    const checkValid = await checkValidations(errors);

    if (checkValid.type === "error") {
      return res.status(400).json({
        message: checkValid.errors.msg,
      });
    }
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirm password do not match.",
      });
    }
    const admin = await Admin.findOne({
      _id: req.user._id,
      isDeleted: false,
    });

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found.",
      });
    }
    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({
        message: "Old password is incorrect.",
      });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await Admin.updateOne(
      { _id: admin._id },
      {
        $set: {
          password: hashedPassword,
        },
      }
    );
    return res.status(200).json({
      message: "Password changed successfully.",
    });

  } catch (error) {
    return res.status(500).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const checkToken = catchAsyncError(async (req, res, next) => {
  const admin = await Admin.findOne({
    _id: req.user._id,
    isDeleted: false,
  }).lean(true); // get full document

  if (!admin) {
    return res.status(404).json({ message: "Admin not found" });
  }

  // remove sensitive fields
  const { password, otp, tokens, ...safeAdmin } = admin;

  return res.status(200).json({
    admin: safeAdmin,
    message: `Welcome ${admin.firstName}`,
  });
});

const updateProfile = catchAsyncError(async (req, res, next) => {
  const adminId = req.user._id;
  const { firstName, lastName, email, phone } = req.body;
  const profileImage = req.file?.filename;
  const admin = await Admin.findOne({ _id: adminId, isDeleted: false });
  if (!admin) return res.status(404).send({ message: "Admin not found" });

  if (firstName) admin.firstName = firstName;
  if (lastName) admin.lastName = lastName;
  if (email) admin.email = email.toLowerCase();
  if (phone) admin.phone = phone;
  if (profileImage) admin.profileImage = profileImage;

  await admin.save();

  const { password, tokens, otp, ...safeAdmin } = admin.toObject();

  return res.status(200).send({
    admin: safeAdmin,
    message: "Profile updated successfully",
  });
});


const getAllUsers = catchAsyncError(async (req, res, next) => {

  let { search = "", sortBy = "latest", status } = req.query;

  const { page = 1, pageSize = 5, skip = 0 } = paginationQuery(req.query);

  sortBy = sortBy?.toLowerCase();
  status = status?.toLowerCase();

  const matchStage = {
    isDeleted: false,
  };

  // ✅ Search
  if (search && search !== "undefined") {
    matchStage.$or = [
      { phone: { $regex: search, $options: "i" } },
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // ✅ Status filter
  if (status === "active") {
    matchStage.isActive = true;
  } else if (status === "inactive") {
    matchStage.isActive = false;
  }

  // ✅ Sorting
  let sort = { createdAt: -1 };

  if (sortBy === "asc") {
    sort = { firstName: 1 };
  } else if (sortBy === "desc") {
    sort = { firstName: -1 };
  } else if (sortBy === "oldest") {
    sort = { createdAt: 1 };
  }

  // ✅ Total count
  const total = await User.countDocuments(matchStage);

  const users = await User.aggregate([
    { $match: matchStage },
    { $sort: sort },
    { $skip: skip },
    { $limit: pageSize },
    {
      $project: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        phone: 1,
        role: 1,
        isActive: 1,
        createdAt: 1,
      },
    },
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return res.status(200).json({
    success: true,
    data: users,
    page,
    limit: pageSize,
    total,
    totalPages,
    previousDisabled: page <= 1,
    nextPage: page + 1,
    previousPage: page - 1,
    nextDisabled: page >= totalPages,
  });

});

const getAllServiceUsers = catchAsyncError(async (req, res, next) => {

  let { search, status, sortBy = "latest" } = req.query;

  const { page = 1, pageSize = 5, skip = 0 } = paginationQuery(req.query);

  sortBy = sortBy?.toLowerCase();
  status = status?.toLowerCase();

  if (!search || search === "undefined") search = "";

  const matchStage = {
    isDeleted: false,
  };

  // ✅ Search Filter
  if (search) {
    matchStage.$or = [
      { phone: { $regex: search, $options: "i" } },
      { userId: { $regex: search, $options: "i" } },
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // ✅ Status Filter
  if (status && ["approved", "rejected", "pending"].includes(status)) {
    matchStage.isApproved = status;
  }

  // ✅ Sorting
  let sort = { createdAt: -1 };

  if (sortBy === "asc") {
    sort = { firstName: 1 };
  } else if (sortBy === "desc") {
    sort = { firstName: -1 };
  } else if (sortBy === "oldest") {
    sort = { createdAt: 1 };
  }

  // ✅ Total count
  const total = await ServiceUser.countDocuments(matchStage);

  const users = await ServiceUser.aggregate([
    { $match: matchStage },
    { $sort: sort },
    { $skip: skip },
    { $limit: pageSize },
    {
      $project: {
        _id: 1,
        salutation: 1,
        userId: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        phone: 1,
        phoneCode: 1,
        profile: 1,
        isActive: 1,
        role: 1,
        isApproved: 1,
        createdAt: 1,
      },
    },
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return res.status(200).json({
    success: true,
    data: users,
    page,
    limit: pageSize,
    total,
    totalPages,
    previousDisabled: page <= 1,
    nextPage: page + 1,
    previousPage: page - 1,
    nextDisabled: page >= totalPages,
  });

});


const getServiceUserById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const user = await ServiceUser.findOne(
    { _id: id },
    {
      salutation: 1,
      email: 1,
      role: 1,
      userId: 1,
      address: 1,
      city: 1,
      state: 1,
      zipCode: 1,
      country: 1,
      firstName: 1,
      lastName: 1,
      phone: 1,
      phoneCode: 1,
      docs: 1,
      profile: 1,
      isVerified: 1,
      isActive: 1,
      isDeleted: 1,
      isApproved: 1
    }
  ).lean();
  if (!user) {
    return res.status(400).json({ message: "Service User not found" });
  }

  return res.status(200).json({
    message: "Service User fetched successfully",
    data: user
  });
});


const getAllProperties = catchAsyncError(async (req, res, next) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const matchStage = { isDeleted: false };

  /* ========================
     📦 MAIN AGGREGATION
  ======================== */
  const users = await ServiceUser.aggregate([
    { $match: matchStage },

    /* ========================
       🏨 GET PROPERTIES
    ======================== */
    {
      $lookup: {
        from: "properties",
        localField: "_id",
        foreignField: "user",
        pipeline: [
          {
            $match: {
              isDeleted: false,
              approvalStatus: "approved"
            }
          },

          /* ⭐ PROPERTY RATING */
          {
            $lookup: {
              from: "reviews",
              let: { propertyId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$property", "$$propertyId"] },
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
              as: "ratingData"
            }
          },

          {
            $addFields: {
              avgRating: {
                $ifNull: [
                  { $round: [{ $arrayElemAt: ["$ratingData.avgRating", 0] }, 1] },
                  0
                ]
              },
              totalReviews: {
                $ifNull: [
                  { $arrayElemAt: ["$ratingData.totalReviews", 0] },
                  0
                ]
              }
            }
          },

          { $project: { ratingData: 0 } },

          { $sort: { createdAt: -1 } }
        ],
        as: "properties"
      }
    },

    /* ========================
       🔥 ONLY USERS WITH PROPERTIES
    ======================== */
    {
      $match: {
        "properties.0": { $exists: true }
      }
    },

    /* ========================
       👤 USER FORMAT
    ======================== */
    {
      $project: {
        _id: 1,
        name: { $concat: ["$firstName", " ", "$lastName"] },
        email: 1,
        properties: 1,
        totalProperties: { $size: "$properties" }
      }
    },

    { $skip: skip },
    { $limit: limit }
  ]);

  /* ========================
     📊 TOTAL COUNT (FIXED)
  ======================== */
  const totalResult = await ServiceUser.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "properties",
        localField: "_id",
        foreignField: "user",
        pipeline: [
          {
            $match: {
              isDeleted: false,
              approvalStatus: "approved"
            }
          }
        ],
        as: "properties"
      }
    },
    {
      $match: {
        "properties.0": { $exists: true }
      }
    },
    { $count: "total" }
  ]);

  const total = totalResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  /* ========================
     📤 RESPONSE
  ======================== */
  return res.status(200).json({
    message: "Service users with properties fetched successfully",
    data: users,
    page,
    limit,
    total,
    totalPages,
    previousDisabled: page <= 1,
    nextPage: page < totalPages ? page + 1 : null,
    previousPage: page > 1 ? page - 1 : null,
    nextDisabled: page >= totalPages
  });

});

const getPropertiesById = catchAsyncError(async (req, res, next) => {

  const { id } = req.params;

  const user = await ServiceUser.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(id),
        isDeleted: false
      }
    },

    {
      $lookup: {
        from: "properties",
        localField: "_id",
        foreignField: "user",
        pipeline: [
          {
            $match: {
              isDeleted: false
            }
          },
          { $sort: { createdAt: -1 } }
        ],
        as: "properties"
      }
    },

    {
      $project: {
        _id: 1,
        name: { $concat: ["$firstName", " ", "$lastName"] },
        email: 1,
        properties: 1,
        totalProperties: { $size: "$properties" }
      }
    }
  ]);

  if (!user.length) {
    return res.status(404).json({
      message: "Service user not found"
    });
  }

  return res.status(200).json({
    message: "Service user properties fetched successfully",
    data: user[0]
  });

});


const getUserById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findOne(
    { _id: id },
    {
      salutation: 1,
      email: 1,
      role: 1,
      userId: 1,
      address: 1,
      city: 1,
      state: 1,
      zipCode: 1,
      country: 1,
      firstName: 1,
      lastName: 1,
      phone: 1,
      phoneCode: 1,
      profile: 1,
      isVerified: 1,
      isDeleted: 1,
    }
  ).lean();
  if (!user) return res.status(400).send({ message: "Service User not found" });

  return res.status(200).send({ data: user });
});

const addAmenities = catchAsyncError(async (req, res, next) => {
  const amenitiesArray = req.body.amenities;

  if (!Array.isArray(amenitiesArray) || amenitiesArray.length === 0) {
    return res.status(400).send({ message: "Amenity not found" });
  }

  const amenityMap = new Map();

  amenitiesArray.forEach(item => {
    if (item?.name) {
      const name = humanize(item.name);
      const icon = item?.icon?.trim() || null;

      amenityMap.set(name, icon);
    }
  });

  const namesArray = Array.from(amenityMap.keys());

  const alreadyExists = await Amenities.find({ name: { $in: namesArray } }).lean();

  if (alreadyExists.length) {
    const existsNames = alreadyExists.map(a => a.name);
    return res.status(409).send({
      message: "Amenity already added",
      alreadyExists: existsNames
    });
  }

  const insertData = namesArray.map(name => ({
    name,
    icon: amenityMap.get(name)
  }));


  await Amenities.insertMany(insertData);

  return res.status(200).send({
    message: "Amenities added successfully",
    addedAmenities: insertData
  });
});
const updatedAmenity = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { name, icon } = req.body;

  if (!id) {
    return res.status(400).send({ message: "Amenity id is required" });
  }

  if (!name) {
    return res.status(400).send({ message: "Amenity name is required" });
  }

  const formattedName = humanize(name);


  const alreadyExists = await Amenities.findOne({
    name: formattedName,
    _id: { $ne: id },
  }).collation({ locale: "en", strength: 2 });

  if (alreadyExists) {
    return res.status(409).send({
      message: "Amenity already exists with this name",
    });
  }

  const updatedData = await Amenities.findByIdAndUpdate(
    id,
    {
      name: formattedName,
      icon: icon?.trim() || null,
    },
    { new: true }
  );

  if (!updatedData) {
    return res.status(404).send({ message: "Amenity not found" });
  }

  return res.status(200).send({
    message: "Amenity updated successfully",
    data: updatedData,
  });
});

const addCategory = catchAsyncError(async (req, res, next) => {

  const file = req.file;
  const { categoryName } = req.body;

  // Duplicate check
  const exists = await Category.countDocuments({
    category: categoryName,
    isDeleted: false,
  });

  if (exists) {
    return res.status(400).send({ message: "Category already exists" });
  }

  // Build data
  const categoryData = { category: categoryName };

  if (file) {
    categoryData.image = file.filename;
  }

  await Category.create(categoryData);

  return res.status(201).send({
    message: "Category created successfully",
  });
});


const editCategory = catchAsyncError(async (req, res, next) => {

  const categoryId = req.params.categoryId;

  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).send({ message: "Invalid Category Id" });
  }
  const categoryName = humanize(req.body.categoryName);

  const category = await Category.findById(categoryId);

  if (!category || category.isDeleted) {
    return res.status(404).send({ message: "Category not found" });
  }

  // Check duplicate category
  const categoryExists = await Category.countDocuments({
    _id: { $ne: categoryId },
    category: categoryName,
    isDeleted: false
  });

  if (categoryExists) {
    return res.status(400).send({ message: "Category already exists" });
  }

  let updateObj = {
    category: categoryName
  };

  // If new image uploaded
  if (req.file) {

    updateObj.image = req.file.filename;

    // Delete old image
    if (category.image) {

      const oldImagePath = path.join(
        process.cwd(),
        "uploads/categories",
        category.image
      );
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

    }
  }

  await Category.updateOne(
    { _id: categoryId },
    { $set: updateObj }
  );

  return res.status(200).send({
    message: "Category updated successfully"
  });

});

const deleteCategory = catchAsyncError(async (req, res, next) => {

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: 'Invalid Category Id' });
  }

  const category = await Category.countDocuments({
    _id: req.params.id,
    isDeleted: false
  });

  if (!category) {
    return res.status(400).send({ message: 'Category not found' });
  }

  await Category.updateOne({ _id: req.params.id }, { $set: { isDeleted: true } });

  return res.status(200).send({ message: "Category deleted successfully" });

});

const addFeature = catchAsyncError(async (req, res, next) => {
  const { id, feature } = req.body;

  if (!feature || !feature.trim()) {
    return res.status(400).json({
      success: false,
      message: "Feature name is required",
    });
  }

  const formattedFeature = feature.trim().toUpperCase();

  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid feature ID",
      });
    }

    const isExist = await Feature.findOne({
      _id: { $ne: id },
      feature: formattedFeature,
      isDeleted: false,
    });

    if (isExist) {
      return res.status(400).json({
        success: false,
        message: "Feature already exists",
      });
    }

    const updatedFeature = await Feature.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { feature: formattedFeature } },
      { new: true }
    );

    if (!updatedFeature) {
      return res.status(404).json({
        success: false,
        message: "Feature not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Feature updated successfully",
      data: updatedFeature,
    });
  }

  const isExist = await Feature.findOne({
    feature: formattedFeature,
    isDeleted: false,
  });

  if (isExist) {
    return res.status(400).json({
      success: false,
      message: "Feature already exists",
    });
  }

  const newFeature = await Feature.create({
    feature: formattedFeature,
  });

  return res.status(201).json({
    success: true,
    message: "Feature added successfully",
    data: newFeature,
  });
});

const deleteFeature = catchAsyncError(async (req, res, next) => {
  let { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Feature ID" });
  }

  const feature = await Feature.findOne({ _id: id, isDeleted: false });

  if (!feature) {
    return res.status(404).json({ message: "Feature not found or already deleted" });
  }

  feature.isDeleted = true;
  await feature.save();

  return res.status(200).json({
    message: "Feature deleted successfully",
  });
});

const addRestRoom = catchAsyncError(async (req, res, next) => {
  const { id } = req.query;
  const { name } = req.body;

  if (!name) {
    return res.status(400).send({ message: "Name is required" });
  }

  if (id) {
    const isExist = await RestRoom.findOne({
      _id: { $ne: id },
      name: name,
      isDeleted: false,
    });

    if (isExist) {
      return res
        .status(400)
        .send({ message: "RestRoom Feature already exists" });
    }

    const updated = await RestRoom.findByIdAndUpdate(
      id,
      { $set: { name } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).send({ message: "RestRoom Feature not found" });
    }

    return res.status(200).send({
      message: "RestRoom Feature updated successfully",
      data: updated,
    });

  } else {
    const isExist = await RestRoom.findOne({
      name: name,
      isDeleted: false,
    });

    if (isExist) {
      return res
        .status(400)
        .send({ message: "RestRoom Feature already exists" });
    }

    const newRestRoom = await RestRoom.create({ name });

    return res.status(200).send({
      message: "RestRoom Feature added successfully",
      data: newRestRoom,
    });
  }
});

const updateRestRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const restRoom = await RestRoom.findById(id);
    if (!restRoom) {
      return res.status(404).json({
        success: false,
        message: "RestRoom not found",
      });
    }

    const isExist = await RestRoom.findOne({
      _id: { $ne: id },
      name: name,
      isDeleted: true,
    });

    if (isExist) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot update. A deleted record with the same name already exists.",
      });
    }

    restRoom.name = name ?? restRoom.name;

    await restRoom.save();

    return res.status(200).json({
      success: true,
      message: "RestRoom updated successfully",
      data: restRoom,
    });
  } catch (error) {
    console.error("Update RestRoom Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const deleteRestRoom = async (req, res) => {
  try {
    const { id } = req.params;

    const restRoom = await RestRoom.findById(id);

    if (!restRoom) {
      return res.status(404).json({
        success: false,
        message: "RestRoom not found",
      });
    }

    if (restRoom.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "RestRoom already deleted",
      });
    }

    restRoom.isDeleted = true;
    await restRoom.save();

    return res.status(200).json({
      success: true,
      message: "RestRoom deleted successfully",
    });

  } catch (error) {
    console.error("Delete RestRoom Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getAllAmenities = catchAsyncError(async (req, res, next) => {

  const pagination = await paginationQuery(req.query);

  const [amenities, total] = await Promise.all([
    Amenities.find({ isDeleted: false })
      .sort({ _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.pageSize)
      .lean(),
    Amenities.countDocuments({ isDeleted: false }),
  ]);


  return res.status(200).send({
    data: amenities,
    page: pagination.page,
    limit: pagination.pageSize,
    total,
    totalPages: Math.ceil(total / pagination.pageSize),
    previousDisabled: pagination.page <= 1,
    nextPage: pagination.page + 1,
    previousPage: pagination.page - 1,
    nextDisabled: pagination.page >= Math.ceil(total / pagination.pageSize),
    message: amenities.length ? 'Amenities received successfully' : "No amenities found"
  });
});

const getAllCategories = catchAsyncError(async (req, res, next) => {
  let {
    search,
    isDeleted,
    page = 1,
    limit = 10,
  } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);
  const skip = (page - 1) * limit;
  const filter = {};
  if (isDeleted !== undefined) {
    filter.isDeleted = isDeleted === "true";
  } else {
    filter.isDeleted = false;
  }
  if (search) {
    filter.category = { $regex: search, $options: "i" };
  }
  const total = await Category.countDocuments(filter);
  const categories = await Category.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(true);
  return res.status(200).json({
    data: categories,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    message: categories.length
      ? "Categories received successfully"
      : "No categories found",
  });
});


const getAllFeatures = catchAsyncError(async (req, res, next) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const condition = { isDeleted: false };

  // total count
  const total = await Feature.countDocuments(condition);

  const features = await Feature.find(condition)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalPages = Math.ceil(total / limit);

  return res.status(200).send({
    data: features,
    page,
    limit,
    total,
    totalPages,
    previousDisabled: page <= 1,
    nextPage: page + 1,
    previousPage: page - 1,
    nextDisabled: page >= totalPages,
    message: features.length
      ? "Features received successfully"
      : "No features found",
  });

});

const getAllRestRooms = catchAsyncError(async (req, res, next) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const condition = { isDeleted: false };

  const total = await RestRoom.countDocuments(condition);

  const rest_features = await RestRoom.find(condition)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalPages = Math.ceil(total / limit);

  return res.status(200).send({
    data: rest_features,
    page,
    limit,
    total,
    totalPages,
    previousDisabled: page <= 1,
    nextPage: page + 1,
    previousPage: page - 1,
    nextDisabled: page >= totalPages
  });

});

const getAmenitiById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  if (!id) return res.status(400).send({ message: "Amenity Id not found" });

  const amenities = await Amenities.findById(id).lean();
  return res.status(200).send({ data: amenities });
});

const getCategoriesById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  if (!id) return res.status(400).send({ message: "Category Id not found" });

  const categories = await Category.findById(id).lean();
  return res.status(200).send({ data: categories });
});

const getFeaturesById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  if (!id) return res.status(400).send({ message: "Feature Id not found" });

  const features = await Feature.findById(id).lean();
  return res.status(200).send({ data: features });
});

const getRestRoomsById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  if (!id)
    return res.status(400).send({ message: "RestRoom Feature Id not found" });

  const restrooms = await RestRoom.findById(id).lean();
  return res.status(200).send({ data: restrooms });
});

const activateServiceUser = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  if (!id) return res.status(400).send({ message: "Provide valid User Id" });

  const user = await ServiceUser.updateOne(
    { _id: id },
    { $set: { isActive: true } }
  );

  if (user.modifiedCount === 0) {
    return res.status(400).send({ message: "User not found" });
  }

  return res
    .status(200)
    .send({ message: "Service User activated successfully" });
});

const addServiceUser = catchAsyncError(async (req, res, next) => {
  const { id } = req.query;

  let user;
  if (id) {
    user = await ServiceUser.findOne({ _id: id }, { _id: 1 }).lean();
    if (!user)
      return res.status(400).send({ message: "Service User not found" });
  }

  let obj = {
    salutation: req.body.salutation,
    email: req.body.email,
    address: req.body.address,
    city: req.body.city,
    state: req.body.state,
    zipCode: req.body.zipCode,
    country: req.body.country,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    phone: req.body.phone,
    phoneCode: req.body.phoneCode,
  };

  let new_profile = req.files?.profile
    ? req.files.profile.map((file) => file.filename)
    : [];
  let new_docs = req.files?.docs
    ? req.files.docs.map((file) => file.filename)
    : [];

  if (new_profile.length > 0) {
    obj["profile"] = new_profile[0];
  }
  if (new_docs.length > 0) {
    obj["docs"] = new_docs;
  }

  if (id) {
    const updateResult = await ServiceUser.updateOne(
      { _id: id },
      { $set: obj }
    );
    if (updateResult.modifiedCount === 0) {
      return res.status(400).send({ message: "Service User not found" });
    }
    return res
      .status(200)
      .send({ message: "Service User updated successfully" });
  } else {
    await ServiceUser.create(obj);
    return res.status(200).send({ message: "Service User added successfully" });
  }
});

const addUser = catchAsyncError(async (req, res, next) => {
  const { id } = req.query;

  let user;
  if (id) {
    user = await User.findOne({ _id: id }, { _id: 1 }).lean();
    if (!user) return res.status(400).send({ message: "User not found" });
  }

  let obj = {
    salutation: req.body.salutation,
    email: req.body.email,
    address: req.body.address,
    city: req.body.city,
    state: req.body.state,
    zipCode: req.body.zipCode,
    country: req.body.country,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    phone: req.body.phone,
    phoneCode: req.body.phoneCode,
  };

  let new_profile = req.files?.profile
    ? req.files.profile.map((file) => file.filename)
    : [];

  if (new_profile.length > 0) {
    obj["profile"] = new_profile[0];
  }

  if (id) {
    const updateResult = await User.updateOne({ _id: id }, { $set: obj });
    if (updateResult.modifiedCount === 0) {
      return res.status(400).send({ message: "User not found" });
    }
    return res.status(200).send({ message: "User updated successfully" });
  } else {
    await User.create(obj);
    return res.status(200).send({ message: "User added successfully" });
  }
});

const categoryList = catchAsyncError(async (req, res, next) => {

  let condition = { isDeleted: false };
  let sort = { createdAt: -1 };

  const { search, sortBy, page = 1, limit = 5 } = req.query;

  const pageNumber = Number(page);
  const pageSize = Number(limit);
  const skip = (pageNumber - 1) * pageSize;

  if (search) {
    condition.category = { $regex: search, $options: "i" };
  }

  const sortValue = sortBy?.toLowerCase();

  if (sortValue === "asc") {
    sort = { category: 1 };
  } else if (sortValue === "desc") {
    sort = { category: -1 };
  } else if (sortValue === "latest") {
    sort = { createdAt: -1 };
  }

  const [data, total] = await Promise.all([
    Category.find(condition)
      .collation({ locale: "en", strength: 2 })
      .sort(sort)
      .skip(skip)
      .limit(pageSize)
      .lean(),

    Category.countDocuments(condition),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return res.status(200).send({
    data,
    page: pageNumber,
    limit: pageSize,
    total,
    totalPages,
    previousDisabled: pageNumber <= 1,
    nextPage: pageNumber + 1,
    previousPage: pageNumber - 1,
    nextDisabled: pageNumber >= totalPages,
    message: data.length
      ? "Categories received successfully"
      : "No categories found"
  });

});

const deleteAmenities = catchAsyncError(async (req, res, next) => {

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: 'Invalid Amenity Id' });
  }

  const amenities = await Amenities.countDocuments({
    _id: req.params.id,
    isDeleted: false
  });

  if (!amenities) {
    return res.status(400).send({ message: 'Amenity not found' });
  }

  await Amenities.updateOne({ _id: req.params.id }, { $set: { isDeleted: true } });

  return res.status(200).send({ message: "Amenity deleted successfully" });

})

const updateStatus = async (req, res) => {
  try {
    const { userId } = req.params;  // ServiceUser _id
    const { status, rejectReason } = req.body;

    // Check valid status
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be either approved or rejected",
      });
    }

    const user = await ServiceUser.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isApproved = status;

    if (status === "rejected") {
      if (!rejectReason) {
        return res.status(400).json({
          message: "Reject reason is required when rejecting user",
        });
      }
      user.rejectReason = rejectReason;
    } else {
      user.rejectReason = null;
      user.isVerified = true;  // optional (if you want)
    }

    await user.save();

    await sendNotification({
      receiverId: user._id,
      receiverModel: "ServiceUser",
      senderId: req.user._id,
      senderModel: "Admin",
      title:
        status === "approved"
          ? "Account Approved ✅"
          : "Account Rejected ❌",
      body:
        status === "approved"
          ? "Your account has been approved by admin."
          : `Your account has been rejected. Reason: ${rejectReason}`,
      type: "SYSTEM",
      data: {
        status,
        rejectReason: rejectReason || null,
      },
    });


    res.status(200).json({
      message: `User ${status} successfully`,
      data: user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const blockUnblockServiceUser = catchAsyncError(async (req, res, next) => {
  const { userId, type } = req.params;
  const { isActive } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({
      message: "Invalid userId",
    });
  }

  if (typeof isActive !== "boolean") {
    return res.status(400).json({
      message: "isActive must be true or false",
    });
  }

  if (!["service", "user"].includes(type)) {
    return res.status(400).json({
      message: "Type must be either 'service' or 'user'",
    });
  }

  const Model = type === "service" ? ServiceUser : User;

  const user = await Model.findOne({
    _id: userId,
    isDeleted: false,
  });

  if (!user) {
    return res.status(404).json({
      message: `${type === "service" ? "Service user" : "User"} not found`,
    });
  }

  user.isActive = isActive;
  await user.save();

  await sendNotification({
    receiverId: user._id,
    receiverModel: type === "service" ? "ServiceUser" : "User",
    senderId: req.user._id,
    senderModel: "Admin",
    title: isActive
      ? "Account Activated ✅"
      : "Account Blocked ❌",
    body: isActive
      ? "Your account has been activated by admin."
      : "Your account has been blocked by admin.",
    type: "SYSTEM",
  });

  // Template naming logic (block/unblock)
  const templateName = isActive ? "user-unblock" : "user-block";

  await sendMail(
    templateName,
    {
      "%name%": `${user.firstName || ""} ${user.lastName || ""}`,
    },
    user.email
  );

  return res.status(200).json({
    success: true,
    message: `${type === "service" ? "Service user" : "User"} ${isActive ? "unblocked" : "blocked"
      } successfully`,
  });
});


const softDeleteServiceUser = catchAsyncError(async (req, res, next) => {
  const { userId, type } = req.params;
  const { isDeleted } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({
      message: "Invalid userId",
    });
  }

  if (typeof isDeleted !== "boolean") {
    return res.status(400).json({
      message: "isDeleted must be true or false",
    });
  }

  if (!["service", "user"].includes(type)) {
    return res.status(400).json({
      message: "Type must be either 'service' or 'user'",
    });
  }

  const Model = type === "service" ? ServiceUser : User;

  // 🔥 IMPORTANT: remove isDeleted filter to allow restore
  const user = await Model.findById(userId);

  if (!user) {
    return res.status(404).json({
      message: `${type === "service" ? "Service user" : "User"} not found`,
    });
  }

  user.isDeleted = isDeleted;
  await user.save();

  // 🔔 Notification
  await sendNotification({
    receiverId: user._id,
    receiverModel: type === "service" ? "ServiceUser" : "User",
    senderId: req.user._id,
    senderModel: "Admin",
    title: isDeleted ? "Account Deleted ❌" : "Account Restored ✅",
    body: isDeleted
      ? "Your account has been removed by admin."
      : "Your account has been restored by admin.",
    type: "SYSTEM",
  });

  // 📧 Email Template
  // const templateName = isDeleted ? "user-delete" : "user-restore";

  // await sendMail(
  //   templateName,
  //   {
  //     "%name%": `${user.firstName || ""} ${user.lastName || ""}`,
  //   },
  //   user.email
  // );

  return res.status(200).json({
    success: true,
    message: `${type === "service" ? "Service user" : "User"} ${isDeleted ? "deleted" : "restored"
      } successfully`,
  });
});

const getPropertyDetailsForAdmin = catchAsyncError(async (req, res) => {
  const { propertyId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid property ID",
    });
  }

  const property = await Properties.findById(propertyId).lean();

  if (!property) {
    return res.status(404).json({
      success: false,
      message: "Property not found",
    });
  }

  const category = await Category.findById(property.category).lean();

  const user = await ServiceUser.findById(property.user)
    .select("firstName lastName email phone isActive")
    .lean();

  const amenities = await Amenities.find({
    _id: { $in: property.propertyAmenities },
    isDeleted: false,
  }).lean();

  const features = await Feature.find({
    _id: { $in: property.propertyFeatures },
    isDeleted: false,
  }).lean();

  const facilities = await Amenities.find({
    _id: { $in: property?.restRoom?.facilities || [] },
    isDeleted: false,
  }).lean();

  const finalResponse = {
    ...property,
    category,
    user,
    propertyAmenities: amenities,
    propertyFeatures: features,
    restRoom: {
      ...property.restRoom,
      facilities,
    },
  };

  return res.status(200).json({
    success: true,
    message: "Property full details fetched successfully",
    data: finalResponse,
  });
});

const createCoupon = catchAsyncError(async (req, res) => {
  let {
    code,
    discountType,
    discountValue,
    minAmount = 0,
    maxDiscount,
    usageLimit,
    firstTimeUserOnly = false,
    applicableCategories = [],
    applicableProperties = [],
    startDate,
    expiryDate,
    isActive = true,
  } = req.body;

  if (!code || !discountType || !discountValue) {
    return res.status(400).json({
      success: false,
      message: "Code, discountType and discountValue are required",
    });
  }

  if (startDate && expiryDate && new Date(expiryDate) <= new Date(startDate)) {
    return res.status(400).json({
      success: false,
      message: "Expiry date must be after start date",
    });
  }

  if (discountType === "PERCENTAGE") {
    if (discountValue > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100",
      });
    }
  } else if (discountType === "FLAT") {
    maxDiscount = undefined;
  } else {
    return res.status(400).json({
      success: false,
      message: "Invalid discount type",
    });
  }

  const mongoose = require("mongoose");

  const isValidIds = (arr) =>
    arr.every((id) => mongoose.Types.ObjectId.isValid(id));

  if (
    !isValidIds(applicableCategories) ||
    !isValidIds(applicableProperties)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid category or property IDs",
    });
  }

  const existing = await Coupon.findOne({
    code: code.toUpperCase(),
    isDelete: false
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Coupon already exists",
    });
  }

  const coupon = await Coupon.create({
    code: code.toUpperCase(),
    discountType,
    discountValue,
    minAmount,
    maxDiscount,
    usageLimit,
    firstTimeUserOnly,
    applicableCategories,
    applicableProperties,
    startDate,
    expiryDate,
    isActive,
  });

  res.status(201).json({
    success: true,
    message: "Coupon created successfully",
    data: coupon,
  });
});


const updateCoupon = catchAsyncError(async (req, res) => {
  const { couponId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(couponId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid coupon ID",
    });
  }

  const coupon = await Coupon.findById(couponId);

  if (!coupon) {
    return res.status(404).json({
      success: false,
      message: "Coupon not found",
    });
  }
  // if (coupon.expiryDate < new Date()) {
  //   return res.status(400).json({
  //     message: "Expired coupons cannot be edited",
  //   });
  // }
  const updates = req.body;

  if (updates.code) {
    updates.code = updates.code.toUpperCase();

    const existing = await Coupon.findOne({
      code: updates.code,
      _id: { $ne: couponId },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Coupon code already exists",
      });
    }
  }

  if (updates.discountType === "PERCENTAGE") {
    if (updates.discountValue && updates.discountValue > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100",
      });
    }
  }

  if (updates.discountType === "FLAT") {
    updates.maxDiscount = undefined;
  }

  if (updates.startDate && updates.expiryDate) {
    if (new Date(updates.expiryDate) <= new Date(updates.startDate)) {
      return res.status(400).json({
        success: false,
        message: "Expiry date must be after start date",
      });
    }
  }

  const isValidIds = (arr) =>
    arr.every((id) => mongoose.Types.ObjectId.isValid(id));

  if (
    updates.applicableCategories &&
    !isValidIds(updates.applicableCategories)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid category IDs",
    });
  }

  if (
    updates.applicableProperties &&
    !isValidIds(updates.applicableProperties)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid property IDs",
    });
  }

  const updatedCoupon = await Coupon.findByIdAndUpdate(
    couponId,
    { $set: updates },
    { new: true, runValidators: true }
  );

  res.status(200).json({
    success: true,
    message: "Coupon updated successfully",
    data: updatedCoupon,
  });
});


const getAllCoupons = catchAsyncError(async (req, res) => {

  const {
    page = 1,
    limit = 10,
    search,
    isActive,
    firstTimeUserOnly,
    status
  } = req.query;

  const pageNumber = Number(page);
  const pageSize = Number(limit);
  const skip = (pageNumber - 1) * pageSize;

  const query = { isDelete: false };

  // 🔍 Search
  if (search) {
    query.code = { $regex: search, $options: "i" };
  }

  // ✅ Active filter
  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  }

  // ✅ First time user filter
  if (firstTimeUserOnly !== undefined) {
    query.firstTimeUserOnly = firstTimeUserOnly === "true";
  }

  const now = new Date();

  // 📅 Status filters
  if (status === "active") {
    query.startDate = { $lte: now };
    query.expiryDate = { $gte: now };
  }

  if (status === "expired") {
    query.expiryDate = { $lt: now };
  }

  if (status === "upcoming") {
    query.startDate = { $gt: now };
  }

  const [coupons, total] = await Promise.all([
    Coupon.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),

    Coupon.countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return res.status(200).json({
    success: true,
    data: coupons,
    page: pageNumber,
    limit: pageSize,
    total,
    totalPages,
    previousDisabled: pageNumber <= 1,
    nextPage: pageNumber + 1,
    previousPage: pageNumber - 1,
    nextDisabled: pageNumber >= totalPages
  });

});

const deleteCoupon = catchAsyncError(async (req, res) => {
  const { couponId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(couponId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid coupon ID",
    });
  }

  const coupon = await Coupon.findOneAndUpdate(
    { _id: couponId, isDelete: false },
    { $set: { isDelete: true, isActive: false } },
    { new: true }
  );

  if (!coupon) {
    return res.status(404).json({
      success: false,
      message: "Coupon not found or already deleted",
    });
  }

  res.status(200).json({
    success: true,
    message: "Coupon deleted successfully",
    data: coupon,
  });
});

const createCommission = catchAsyncError(async (req, res, next) => {
  const { scope, categoryId, commissionType, value } = req.body;

  if (!scope || !commissionType || value === undefined) {
    return res.status(400).json({
      success: false,
      message: "All required fields must be provided",
    });
  }

  if (scope === "CATEGORY" && !categoryId) {
    return res.status(400).json({
      success: false,
      message: "CategoryId is required for CATEGORY commission",
    });
  }

  if (scope === "GLOBAL") {
    req.body.categoryId = null;
  }

  await Commission.updateMany(
    {
      scope,
      categoryId: scope === "CATEGORY" ? categoryId : null,
      isActive: true,
      isDeleted: false,
    },
    { isActive: false }
  );

  const commission = await Commission.create({
    scope,
    categoryId: scope === "CATEGORY" ? categoryId : null,
    commissionType,
    value,
  });

  res.status(201).json({
    success: true,
    message: "Commission created successfully",
    data: commission,
  });
});

const updateCommission = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { commissionType, value, isActive } = req.body;

  const commission = await Commission.findById(id);

  if (!commission || commission.isDeleted) {
    return res.status(404).json({
      success: false,
      message: "Commission not found",
    });
  }

  if (commissionType) commission.commissionType = commissionType;
  if (value !== undefined) commission.value = value;
  if (isActive !== undefined) commission.isActive = isActive;

  await commission.save();

  res.status(200).json({
    success: true,
    message: "Commission updated successfully",
    data: commission,
  });
});


const deleteCommission = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const commission = await Commission.findById(id);

  if (!commission || commission.isDeleted) {
    return res.status(404).json({
      success: false,
      message: "Commission not found",
    });
  }

  commission.isDeleted = true;
  commission.isActive = false;

  await commission.save();

  res.status(200).json({
    success: true,
    message: "Commission deleted successfully",
  });
});

const getAllCommissions = catchAsyncError(async (req, res, next) => {

  const { page = 1, limit = 10, scope, isActive } = req.query;

  const pageNumber = Number(page);
  const pageSize = Number(limit);
  const skip = (pageNumber - 1) * pageSize;

  const query = { isDeleted: false };

  if (scope) {
    query.scope = scope;
  }

  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  }

  const [commissions, total] = await Promise.all([
    Commission.find(query)
      .populate("categoryId", "category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),

    Commission.countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / pageSize);

  res.status(200).json({
    success: true,
    data: commissions,
    page: pageNumber,
    limit: pageSize,
    total,
    totalPages,
    previousDisabled: pageNumber <= 1,
    nextPage: pageNumber + 1,
    previousPage: pageNumber - 1,
    nextDisabled: pageNumber >= totalPages
  });

});

const createBanner = async (req, res) => {
  try {
    const { bannerType, title } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }
    const newBanner = await Banner.create({
      bannerType,
      title,
      image: req.file.filename,
    });

    res.status(201).json({
      success: true,
      message: "Banner created successfully",
      data: newBanner,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ✅ Update Banner
const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { bannerType, title } = req.body;

    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    banner.bannerType = bannerType || banner.bannerType;
    banner.title = title || banner.title;

    if (req.file) {
      if (banner.image) {
        const oldImagePath = path.join(
          __dirname,
          "../uploads/bannerImg",
          banner.image
        );
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      banner.image = req.file.filename;
    }

    await banner.save();

    res.status(200).json({
      success: true,
      message: "Banner updated successfully",
      data: banner,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ✅ Delete Banner
const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    if (banner.image) {
      const imagePath = path.join(
        __dirname,
        "../uploads/bannerImg",
        banner.image
      );

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await Banner.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Banner deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ✅ Get All Banners
const getAllBanners = async (req, res) => {
  try {

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};

    const [banners, total] = await Promise.all([
      Banner.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Banner.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: banners,
      page,
      limit,
      total,
      totalPages,
      previousDisabled: page <= 1,
      nextPage: page + 1,
      previousPage: page - 1,
      nextDisabled: page >= totalPages
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};


// const getAllBookingsAdmin = catchAsyncError(async (req, res, next) => {

//   let { page = 1, limit = 10, type, paymentStatus, search } = req.query;
//   const { status } = req.params;

//   page = parseInt(page);
//   limit = parseInt(limit);
//   const skip = (page - 1) * limit;

//   /* ========================
//      📅 TODAY RANGE
//   ======================== */
//   const today = new Date();
//   const endOfToday = new Date();
//   endOfToday.setHours(23, 59, 59, 999);

//   /* ========================
//      🔍 FILTER
//   ======================== */
//   const filter = {};

//   /* ✅ STATUS FILTER */
//   if (status === "all") {
//     filter.bookingStatus = { $in: ["confirmed", "cancelled"] };

//   } else if (status === "completed") {
//     // ✅ COMPLETED BOOKINGS
//     filter.bookingStatus = "confirmed";
//     filter.checkOut = { $lte: endOfToday };

//   } else if (["confirmed", "cancelled", "pending"].includes(status)) {
//     filter.bookingStatus = status;

//   } else {
//     return res.status(400).json({
//       success: false,
//       message: "Invalid booking status"
//     });
//   }

//   /* ✅ PAYMENT STATUS */
//   if (paymentStatus) {
//     filter.paymentStatus = paymentStatus;
//   } else {
//     filter.paymentStatus = "paid";
//   }

//   /* ✅ BOOKING TYPE */
//   if (type) {
//     filter.bookingType = type;
//   }

//   /* ✅ SEARCH */
//   if (search) {
//     filter.orderId = { $regex: search, $options: "i" };
//   }

//   /* ========================
//      📦 FETCH DATA
//   ======================== */
//   const [bookings, total] = await Promise.all([
//     Booking.find(filter)
//       .populate({
//         path: "property",
//         select: "name price address"
//       })
//       .populate({
//         path: "services.service",
//         select: "name price"
//       })
//       .populate({
//         path: "user",
//         select: "firstName lastName email phone"
//       })
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .lean(),

//     Booking.countDocuments(filter)
//   ]);

//   const totalPages = Math.ceil(total / limit);

//   return res.status(200).json({
//     success: true,
//     data: bookings,
//     page,
//     limit,
//     total,
//     totalPages,
//     previousDisabled: page <= 1,
//     nextPage: page < totalPages ? page + 1 : null,
//     previousPage: page > 1 ? page - 1 : null,
//     nextDisabled: page >= totalPages,
//     message: bookings.length
//       ? "Bookings fetched successfully"
//       : "No bookings found"
//   });

// });


const getAllBookingsAdmin = catchAsyncError(async (req, res, next) => {

  let {
    page = 1,
    limit = 10,
    type,
    paymentStatus,
    search
  } = req.query;

  const { status } = req.params;

  page = parseInt(page);
  limit = parseInt(limit);

  const skip = (page - 1) * limit;

  /* ========================
     📅 TODAY RANGE
  ======================== */

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  /* ========================
     🔍 FILTER
  ======================== */

  const filter = {
    isDeleted: false
  };

  /* ========================
     ✅ STATUS FILTER
  ======================== */

  if (status === "all") {

    filter.bookingStatus = {
      $in: ["confirmed", "cancelled", "pending"]
    };

  }

  else if (status === "completed") {

    filter.bookingStatus = "confirmed";

    filter.checkOut = {
      $lte: endOfToday
    };

  }

  else if (
    ["confirmed", "cancelled", "pending"].includes(status)
  ) {

    filter.bookingStatus = status;

  }

  else {

    return res.status(400).json({
      success: false,
      message: "Invalid booking status"
    });

  }

  /* ========================
     ✅ PAYMENT STATUS
  ======================== */

  if (paymentStatus) {

    filter.paymentStatus = paymentStatus;

  }

  /* ========================
     ✅ BOOKING TYPE
  ======================== */

  if (type) {

    filter.bookingType = type;

  }

  /* ========================
     ✅ SEARCH
  ======================== */

  if (search) {

    filter.$or = [
      {
        orderId: {
          $regex: search,
          $options: "i"
        }
      }
    ];

  }

  /* ========================
     📦 FETCH DATA
  ======================== */

  const [bookings, total] = await Promise.all([

    Booking.find(filter)

      .populate({
        path: "property",
        select: "name price address"
      })

      .populate({
        path: "services.service",
        select: "name price"
      })

      .populate({
        path: "user",
        select: "firstName lastName email phone"
      })

      .sort({ createdAt: -1 })

      .skip(skip)

      .limit(limit)

      .lean(),

    Booking.countDocuments(filter)

  ]);

  /* ========================
     📄 PAGINATION
  ======================== */

  const totalPages = Math.ceil(total / limit);

  /* ========================
     ✅ RESPONSE
  ======================== */

  return res.status(200).json({

    success: true,

    data: bookings,

    page,

    limit,

    total,

    totalPages,

    previousDisabled: page <= 1,

    nextPage: page < totalPages
      ? page + 1
      : null,

    previousPage: page > 1
      ? page - 1
      : null,

    nextDisabled: page >= totalPages,

    message: bookings.length
      ? "Bookings fetched successfully"
      : "No bookings found"

  });

});

const getBookingsByPropertyId = catchAsyncError(async (req, res, next) => {

  const { propertyId } = req.params;

  if (!propertyId) {
    return res.status(400).send({
      message: "Property Id is required"
    });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const skip = (page - 1) * limit;

  const filter = {
    property: propertyId,
    paymentStatus: "paid",
    bookingStatus: { $in: ["confirmed", "cancelled"] }
  };

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate({
        path: "property",
        select: "name price address"
      })
      .populate("services.service", "name price")
      .populate({
        path: "user",
        select: "name email phone"
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Booking.countDocuments(filter)
  ]);

  return res.status(200).send({
    data: bookings,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    message: bookings.length
      ? "Property bookings fetched successfully"
      : "No bookings found for this property"
  });

});


const getBookingDetails = catchAsyncError(async (req, res, next) => {

  const { bookingId } = req.params;

  if (!bookingId) {
    return res.status(400).send({
      message: "Booking Id is required"
    });
  }

  const booking = await Booking.findById(bookingId)
    .populate({
      path: "property",
      select: "name price address maxGuests media description policies"
    })
    .populate("services.service", "name price")
    .populate({
      path: "user",
      select: "name email phone"
    })
    .lean();

  if (!booking) {
    return res.status(404).send({
      message: "Booking not found"
    });
  }

  // get payment transaction
  const payment = await PaymentTransaction.findOne({
    booking: bookingId
  }).lean();

  return res.status(200).send({
    data: {
      ...booking,
      paymentTransaction: payment
    },
    message: "Booking details fetched successfully"
  });

});


const upsertPlatformFee = async (req, res) => {
  try {
    const { feeType, value } = req.body;

    const fee = await PlatformFee.findOneAndUpdate(
      { isDeleted: false }, // condition
      { feeType, value, isActive: true },
      {
        new: true,
        upsert: true, // create if not exists
        setDefaultsOnInsert: true
      }
    );

    res.status(200).json({
      success: true,
      message: "Platform fee saved successfully",
      data: fee
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const upsertTax = async (req, res) => {
  try {

    const { percentage } = req.body;

    const tax = await Tax.findOneAndUpdate(
      { isDeleted: false },
      { percentage, isActive: true },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    res.status(200).json({
      success: true,
      message: "Tax saved successfully",
      data: tax
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getPlatformConfig = async (req, res) => {
  try {

    const platformFee = await PlatformFee.findOne({
      isActive: true,
      isDeleted: false
    }).lean();

    const tax = await Tax.findOne({
      isActive: true,
      isDeleted: false
    }).lean();

    res.status(200).json({
      success: true,
      data: {
        platformFee,
        tax
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getAllPaymentTransactions = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", type } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const skip = (page - 1) * limit;

    /* ========================
       🔧 HELPER (ROUNDING)
    ======================== */
    const formatAmount = (num) =>
      typeof num === "number" ? Number(num.toFixed(2)) : num;

    /* ========================
       🔍 SEARCH FILTER
    ======================== */
    const filter = {};

    if (search) {
      filter.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { tapChargeId: { $regex: search, $options: "i" } },
      ];
    }

    /* ========================
       📦 FETCH DATA
    ======================== */
    const transactions = await PaymentTransaction.find(filter)
      .populate({
        path: "booking",
        match: type ? { bookingType: type } : {},
        select: "orderId user property services bookingStatus bookingType",
        populate: [
          {
            path: "user",
            select: "firstName lastName email",
          },
          {
            path: "property",
            select: "title",
          },
          {
            path: "services.service",
            select: "title price",
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    /* ========================
       ⚠️ REMOVE NULL BOOKINGS
    ======================== */
    const filteredTransactions = transactions.filter((t) => t.booking);

    /* ========================
       💰 FORMAT AMOUNTS
    ======================== */
    const formattedTransactions = filteredTransactions.map((t) => ({
      ...t,
      totalAmount: formatAmount(t.totalAmount),
      commissionAmount: formatAmount(t.commissionAmount),
      providerAmount: formatAmount(t.providerAmount),
      platformFee: formatAmount(t.platformFee),
      tax: formatAmount(t.tax),
    }));

    /* ========================
       📊 TOTAL COUNT (AFTER FILTER)
    ======================== */
    const total = await PaymentTransaction.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    /* ========================
       📤 RESPONSE
    ======================== */
    return res.status(200).json({
      success: true,
      data: formattedTransactions,
      page,
      limit,
      total: formattedTransactions.length, // filtered count
      totalPages,
      previousDisabled: page === 1,
      nextPage: page < totalPages ? page + 1 : null,
      previousPage: page > 1 ? page - 1 : null,
      nextDisabled: page >= totalPages,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getTransactionDetails = async (req, res) => {
  try {
    const { id } = req.params;

    /* ========================
       ✅ VALIDATE ID
    ======================== */
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID"
      });
    }

    /* ========================
       📦 FETCH TRANSACTION
    ======================== */
    const transaction = await PaymentTransaction.findById(id)
      .populate({
        path: "booking",
        select: `
          orderId user property services bookingType bookingStatus
          checkIn checkOut totalAmount
        `,
        populate: [
          /* 👤 CUSTOMER */
          {
            path: "user",
            model: "User",
            select: "firstName lastName email phone"
          },

          /* 🏨 PROPERTY (FIXED) */
          {
            path: "property",
            model: "Properties",
            select: "title address user",
            populate: {
              path: "user", // property owner
              model: "ServiceUser",
              select: "firstName lastName email phone"
            }
          },

          /* 🛠 SERVICES (NEW) */
          {
            path: "services.service",
            model: "Service",
            select: "title price category"
          },

          {
            path: "couponId",
            model: "Coupon",
            select: "code discountType discountValue"
          }, +
          {
            path: "providerBreakdown.user",
            model: "ServiceUser",
            select: "firstName lastName email"
          }
        ]
      })
      .lean();

    /* ========================
       ❌ NOT FOUND
    ======================== */
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    /* ========================
       📤 RESPONSE
    ======================== */
    return res.status(200).json({
      success: true,
      data: transaction
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getAdminUpcomingBookings = catchAsyncError(async (req, res) => {

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // const filter = {
  //   checkIn: { $gte: today },
  //   bookingStatus: { $in: ["confirmed", "pending"] },
  //   paymentStatus: "paid"
  // };


  const filter = {
    checkIn: { $gte: today },
    bookingStatus: { $in: ["confirmed", "pending"] },
    paymentStatus: "paid",
    webhookProcessed: true,
    isCancelled: false
  };
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate("user", "firstName lastName phone profile")
      .populate("property", "name address")
      .populate("services.service", "name price")
      .sort({ checkIn: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Booking.countDocuments(filter)
  ]);

  const formattedBookings = bookings.map(b => ({
    ...b,
    propertyName: b.hotel?.name || null
  }));

  const totalPages = Math.ceil(total / limit);

  return res.status(200).send({
    data: formattedBookings,
    page,
    limit,
    total,
    totalPages,
    previousDisabled: page <= 1,
    nextPage: page + 1,
    previousPage: page - 1,
    nextDisabled: page >= totalPages,
    message: bookings.length
      ? "Upcoming bookings fetched"
      : "No upcoming bookings"
  });

});

const getAdminBookingCalendar = catchAsyncError(async (req, res) => {

  const { propertyId } = req.query;

  if (!propertyId) {
    return res.status(400).send({
      message: "propertyId is required"
    });
  }

  const dates = await HotelAvailability.find({
    hotel: propertyId,
    isBooked: true
  })
    .select("date booking hotel")
    .populate({
      path: "booking",
      select: "bookingStatus checkIn checkOut"
    })
    .populate({
      path: "hotel",
      select: "name address"
    })
    .sort({ date: 1 })
    .lean();

  return res.status(200).send({
    data: dates,
    message: dates.length
      ? "Calendar data fetched"
      : "No bookings found for this property"
  });

});

const getAllWalletTransactions = async (req, res) => {
  try {

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([

      WalletTransaction.find()
        .populate("user", "firstName lastName email")
        .populate("bookingId", "orderId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      WalletTransaction.countDocuments()

    ]);

    const totalPages = Math.ceil(total / limit);

    res.send({
      success: true,
      data: transactions,
      page,
      limit,
      total,
      totalPages,
      previousDisabled: page <= 1,
      nextPage: page + 1,
      previousPage: page - 1,
      nextDisabled: page >= totalPages
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

const getWithdrawRequests = async (req, res) => {
  try {

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([

      WithdrawRequest.find()
        .populate("user", "firstName lastName email phone")
        .populate(
          "bankDetails",
          "accountHolderName accountNumber bankName ifscCode iban swiftCode"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      WithdrawRequest.countDocuments()

    ]);

    const totalPages = Math.ceil(total / limit);

    res.send({
      success: true,
      data: requests,
      page,
      limit,
      total,
      totalPages,
      previousDisabled: page <= 1,
      nextPage: page + 1,
      previousPage: page - 1,
      nextDisabled: page >= totalPages
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};


const updateWithdrawStatus = async (req, res) => {
  try {

    const { id } = req.params;
    const { status, rejectReason } = req.body;

    const request = await WithdrawRequest.findById(id);

    if (!request) {
      return res.status(404).send({
        message: "Withdraw request not found"
      });
    }

    request.status = status;

    if (status === "rejected") {
      request.rejectReason = rejectReason;
    }

    await request.save();

    if (status === "approved") {

      const wallet = await Wallet.findOne({
        user: request.user
      });

      wallet.balance -= request.amount;

      await wallet.save();

      await WalletTransaction.create({
        wallet: wallet._id,
        user: request.user,
        type: "debit",
        amount: request.amount,
        status: "completed",
        description: "Withdraw approved"
      });

    }

    await sendNotification({
      receiverId: request.user,
      receiverModel: "ServiceUser", // ⚠️ change if needed (User/ServiceUser)
      senderId: req.user._id,
      senderModel: "Admin",
      title:
        status === "approved"
          ? "Withdraw Approved ✅"
          : "Withdraw Rejected ❌",
      body:
        status === "approved"
          ? `Your withdraw request of ₹${request.amount} has been approved.`
          : `Your withdraw request was rejected.`,
      type: "WITHDRAW",
      referenceId: request._id,
      referenceType: "Withdraw",
      data: {
        status,
        amount: request.amount,
        rejectReason: rejectReason || null,
      },
    });

    res.send({
      success: true,
      data: request
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message
    });

  }
};


const getAllUserBookingsAdmin = async (req, res) => {
  try {

    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

    if (userId) {
      filter.user = userId;
    }

    const total = await Booking.countDocuments(filter);

    const bookings = await Booking.find(filter)
      .populate({
        path: "property",
        select: "name address price"
      })
      .populate({
        path: "user",
        select: "firstName lastName email phone profile"
      })
      .populate({
        path: "couponId",
        select: "code discountType"
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    const totalPages = Math.ceil(total / limitNumber);

    res.send({
      success: true,
      data: bookings,
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
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const createServiceCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const icon = req.file ? req.file.filename : null;

    const category = await ServiceCategory.create({
      name,
      icon,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: "Category created",
      data: category,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSerivceCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const category = await ServiceCategory.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    let icon = category.icon;

    if (req.file) {
      icon = req.file.filename;

      if (category.icon) {
        const oldPath = path.join(__dirname, "../uploads/serviceIcon", category.icon);

        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    }

    category.name = name || category.name;
    category.icon = icon;

    await category.save();

    res.json({
      success: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const toggleServiceCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await ServiceCategory.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    category.isActive = !category.isActive;
    await category.save();

    res.json({
      success: true,
      message: "Category status toggled",
      data: category,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllServiceCategories = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "" } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const total = await ServiceCategory.countDocuments(filter);

    const categories = await ServiceCategory.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const totalPages = Math.ceil(total / limitNumber);

    res.send({
      success: true,
      data: categories,
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

// const getAllServicesAdmin = async (req, res) => {
//   try {
//     let { page = 1, limit = 10 } = req.query;

//     const pageNumber = parseInt(page);
//     const limitNumber = parseInt(limit);
//     const skip = (pageNumber - 1) * limitNumber;

//     // ✅ Filter
//     const filter = {
//       isDeleted: false,
//       approvalStatus: "approved"
//     };;

//     // ✅ Total count
//     const total = await Service.countDocuments(filter);

//     // ✅ Fetch paginated data
//     const services = await Service.find(filter)
//       .populate("user", "firstName lastName profile email")
//       .populate("category", "name")
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limitNumber);

//     const totalPages = Math.ceil(total / limitNumber);

//     res.send({
//       success: true,
//       data: services,
//       page: pageNumber,
//       limit: limitNumber,
//       total,
//       totalPages,
//       previousDisabled: pageNumber <= 1,
//       nextPage: pageNumber + 1,
//       previousPage: pageNumber - 1,
//       nextDisabled: pageNumber >= totalPages
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };

// const getAllServicesAdmin = catchAsyncError(async (req, res, next) => {

//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 10;
//   const skip = (page - 1) * limit;

//   /* ========================
//      🔍 MATCH
//   ======================== */
//   const matchStage = {
//     isDeleted: false
//   };

//   /* ========================
//      📊 TOTAL COUNT
//   ======================== */
//   const total = await Service.countDocuments(matchStage);

//   /* ========================
//      📦 AGGREGATION
//   ======================== */
//   const services = await Service.aggregate([
//     { $match: matchStage },

//     /* ========================
//        👤 PROVIDER INFO
//     ======================== */
//     {
//       $lookup: {
//         from: "serviceusers",
//         localField: "user",
//         foreignField: "_id",
//         as: "provider"
//       }
//     },
//     {
//       $unwind: {
//         path: "$provider",
//         preserveNullAndEmptyArrays: true
//       }
//     },

//     /* ========================
//        ⭐ SERVICE REVIEWS
//     ======================== */
//     {
//       $lookup: {
//         from: "reviews",
//         let: { serviceId: "$_id" },
//         pipeline: [
//           {
//             $match: {
//               $expr: { $eq: ["$service", "$$serviceId"] },
//               isDeleted: false,
//               reviewType: "service"
//             }
//           },
//           {
//             $group: {
//               _id: null,
//               avgRating: { $avg: "$rating" },
//               totalReviews: { $sum: 1 }
//             }
//           }
//         ],
//         as: "ratingData"
//       }
//     },

//     /* ========================
//        🎯 FORMAT RATING
//     ======================== */
//     {
//       $addFields: {
//         avgRating: {
//           $ifNull: [
//             { $round: [{ $arrayElemAt: ["$ratingData.avgRating", 0] }, 1] },
//             0
//           ]
//         },
//         totalReviews: {
//           $ifNull: [
//             { $arrayElemAt: ["$ratingData.totalReviews", 0] },
//             0
//           ]
//         }
//       }
//     },

//     {
//       $project: {
//         ratingData: 0
//       }
//     },

//     /* ========================
//        📤 RESPONSE FORMAT
//     ======================== */
//     {
//       $project: {
//         _id: 1,
//         title: 1,
//         price: 1,
//         category: 1,
//         avgRating: 1,
//         totalReviews: 1,
//         provider: {
//           _id: "$provider._id",
//           name: {
//             $concat: ["$provider.firstName", " ", "$provider.lastName"]
//           },
//           email: "$provider.email"
//         }
//       }
//     },

//     { $sort: { createdAt: -1 } },
//     { $skip: skip },
//     { $limit: limit }
//   ]);

//   const totalPages = Math.ceil(total / limit);

//   /* ========================
//      📤 FINAL RESPONSE
//   ======================== */
//   return res.status(200).json({
//     message: "Services fetched successfully",
//     data: services,
//     page,
//     limit,
//     total,
//     totalPages,
//     previousDisabled: page <= 1,
//     nextPage: page < totalPages ? page + 1 : null,
//     previousPage: page > 1 ? page - 1 : null,
//     nextDisabled: page >= totalPages
//   });

// });


const getAllServicesAdmin = catchAsyncError(async (req, res, next) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  /* ========================
     🔍 MATCH
  ======================== */

  const matchStage = {
    isDeleted: false,
    approvalStatus: "approved",
  };

  /* ========================
     📊 TOTAL COUNT
  ======================== */

  const total = await Service.countDocuments(matchStage);

  /* ========================
     📦 AGGREGATION
  ======================== */

  const services = await Service.aggregate([

    { $match: matchStage },

    /* ========================
       👤 PROVIDER INFO
    ======================== */

    {
      $lookup: {
        from: "serviceusers",
        localField: "user",
        foreignField: "_id",
        as: "provider"
      }
    },

    {
      $unwind: {
        path: "$provider",
        preserveNullAndEmptyArrays: true
      }
    },

    /* ========================
       📂 CATEGORY INFO
    ======================== */

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
       ⭐ SERVICE REVIEWS
    ======================== */

    {
      $lookup: {
        from: "reviews",
        let: { serviceId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$service", "$$serviceId"] },
              isDeleted: false,
              reviewType: "service"
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
        as: "ratingData"
      }
    },

    /* ========================
       🎯 FORMAT RATING
    ======================== */

    {
      $addFields: {
        avgRating: {
          $ifNull: [
            { $round: [{ $arrayElemAt: ["$ratingData.avgRating", 0] }, 1] },
            0
          ]
        },

        totalReviews: {
          $ifNull: [
            { $arrayElemAt: ["$ratingData.totalReviews", 0] },
            0
          ]
        }
      }
    },

    {
      $project: {
        ratingData: 0
      }
    },

    /* ========================
       📤 RESPONSE FORMAT
    ======================== */

    {
      $project: {
        _id: 1,
        name: 1,
        description: 1,
        price: 1,
        duration: 1,
        priceType: 1,
        document: 1,
        approvalStatus: 1,
        approvedAt: 1,
        rejectionReason: 1,
        workingDays: 1,
        workingHours: 1,
        media: 1,
        location: 1,
        isActive: 1,
        createdAt: 1,

        avgRating: 1,
        totalReviews: 1,

        category: {
          _id: "$categoryData._id",
          name: "$categoryData.name"
        },

        cancellationPolicy: {
          _id: "$cancellationPolicyData._id",
          title: "$cancellationPolicyData.title"
        },

        provider: {
          _id: "$provider._id",

          name: {
            $concat: [
              { $ifNull: ["$provider.firstName", ""] },
              " ",
              { $ifNull: ["$provider.lastName", ""] }
            ]
          },

          email: "$provider.email",
          phone: "$provider.phone",
          profile: "$provider.profile",
          isVerified: "$provider.isVerified"
        }
      }
    },

    { $sort: { createdAt: -1 } },

    { $skip: skip },

    { $limit: limit }

  ]);

  const totalPages = Math.ceil(total / limit);

  /* ========================
     📤 FINAL RESPONSE
  ======================== */

  return res.status(200).json({
    message: "Services fetched successfully",

    data: services,

    page,
    limit,
    total,
    totalPages,

    previousDisabled: page <= 1,

    nextPage: page < totalPages ? page + 1 : null,

    previousPage: page > 1 ? page - 1 : null,

    nextDisabled: page >= totalPages
  });

});

const getSingleServiceAdmin = async (req, res) => {
  try {

    const { id } = req.params;

    const service = await Service.findOne({
      _id: id,
      isDeleted: false
    })
      .populate("user", "firstName lastName profile email")
      .populate("category", "name");

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    res.status(200).json({
      success: true,
      data: service
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getServicesByUserAdmin = async (req, res) => {

  try {

    const { userId } = req.params;
    let {
      page = 1,
      limit = 10
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const skip = (page - 1) * limit;

    /* ========================
       VALIDATE USER ID
    ======================== */

    if (!mongoose.Types.ObjectId.isValid(userId)) {

      return res.status(400).json({
        success: false,
        message: "Invalid user id"
      });

    }

    /* ========================
       FILTER
    ======================== */

    const filter = {
      user: userId,
      isDeleted: false,
      // approvalStatus: "approved"
    };
    /* ========================
       FETCH DATA
    ======================== */

    const [services, total] = await Promise.all([

      Service.find(filter)

        .populate({
          path: "category",
          select: "name"
        })

        .sort({ createdAt: -1 })

        .skip(skip)

        .limit(limit)

        .lean(),

      Service.countDocuments(filter)

    ]);

    /* ========================
       PAGINATION
    ======================== */

    const totalPages = Math.ceil(total / limit);

    /* ========================
       RESPONSE
    ======================== */

    return res.status(200).json({

      success: true,

      data: services,

      page,

      limit,

      total,

      totalPages,

      previousDisabled: page <= 1,

      nextPage: page < totalPages
        ? page + 1
        : null,

      previousPage: page > 1
        ? page - 1
        : null,

      nextDisabled: page >= totalPages,

      message: services.length
        ? "Services fetched successfully"
        : "No services found"

    });

  }

  catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

};

const getAllPackagesAdmin = async (req, res) => {
  try {
    let { page = 1, limit = 10, search, isActive } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const total = await Package.countDocuments(filter);

    const packages = await Package.find(filter)
      .populate("user", "firstName lastName email")
      .populate("services", "name price")
      .populate("property", "name")
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

const getSinglePackageAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await Package.findById(id)
      .populate("user", "firstName lastName email")
      .populate("services", "name price description")
      .populate("property", "name");

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

const getPackagesByUserAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    let { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = { user: userId };

    const total = await Package.countDocuments(filter);

    const packages = await Package.find(filter)
      .populate("services", "name price")
      .populate("property", "name")
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

const getPendingProperties = async (req, res) => {
  try {
    const properties = await Properties.find({
      approvalStatus: "pending",
      isDeleted: false,
      is_completed: true
    })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

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

const updatePropertyApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;
    const adminId = req.user._id;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use 'approve' or 'reject'"
      });
    }

    const property = await Properties.findById(id);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    // Prevent duplicate action
    if (property.approvalStatus !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Property already ${property.approvalStatus}`
      });
    }

    // If rejecting, reason is required
    if (action === "reject" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required"
      });
    }

    // Update based on action
    property.approvalStatus = action === "approve" ? "approved" : "rejected";
    property.approvedBy = adminId;
    property.approvedAt = new Date();
    property.rejectionReason = action === "reject" ? reason : undefined;

    await property.save();

    await sendNotification({
      receiverId: property.user, // 👈 VERY IMPORTANT
      receiverModel: "ServiceUser",
      senderId: adminId,
      senderModel: "Admin",
      title:
        action === "approve"
          ? "Property Approved ✅"
          : "Property Rejected ❌",
      body:
        action === "approve"
          ? "Your property has been approved."
          : "Your property has been rejected.",
      type: "PROPERTY",
      referenceId: property._id,
      referenceType: "Property",
      data: {
        status: property.approvalStatus,
        rejectionReason: reason || null,
      },
    });

    res.status(200).json({
      success: true,
      message: `Property ${property.approvalStatus} successfully`,
      data: property
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// const getPendingServices = async (req, res) => {
//   try {
//     const services = await Service.find({
//       approvalStatus: "pending",
//       isDeleted: false
//     })
//       .populate("user", "name email")
//       .populate("category", "name")
//       .sort({ createdAt: -1 });

//     res.status(200).json({
//       success: true,
//       count: services.length,
//       data: services
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };

const getPendingServices = catchAsyncError(async (req, res, next) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  /* ========================
     🔍 MATCH
  ======================== */

  const matchStage = {
    isDeleted: false,
    approvalStatus: { $in: ["pending", "rejected"] },
  };

  /* ========================
     📊 TOTAL COUNT
  ======================== */

  const total = await Service.countDocuments(matchStage);

  /* ========================
     📦 AGGREGATION
  ======================== */

  const services = await Service.aggregate([

    { $match: matchStage },

    /* ========================
       👤 PROVIDER INFO
    ======================== */

    {
      $lookup: {
        from: "serviceusers",
        localField: "user",
        foreignField: "_id",
        as: "provider"
      }
    },

    {
      $unwind: {
        path: "$provider",
        preserveNullAndEmptyArrays: true
      }
    },

    /* ========================
       📂 CATEGORY INFO
    ======================== */

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
       ⭐ SERVICE REVIEWS
    ======================== */

    {
      $lookup: {
        from: "reviews",
        let: { serviceId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$service", "$$serviceId"] },
              isDeleted: false,
              reviewType: "service"
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
        as: "ratingData"
      }
    },

    /* ========================
       🎯 FORMAT RATING
    ======================== */

    {
      $addFields: {
        avgRating: {
          $ifNull: [
            { $round: [{ $arrayElemAt: ["$ratingData.avgRating", 0] }, 1] },
            0
          ]
        },

        totalReviews: {
          $ifNull: [
            { $arrayElemAt: ["$ratingData.totalReviews", 0] },
            0
          ]
        }
      }
    },

    {
      $project: {
        ratingData: 0
      }
    },

    /* ========================
       📤 RESPONSE FORMAT
    ======================== */

    {
      $project: {
        _id: 1,
        name: 1,
        description: 1,
        price: 1,
        duration: 1,
        priceType: 1,
        document: 1,
        approvalStatus: 1,
        approvedAt: 1,
        rejectionReason: 1,
        workingDays: 1,
        workingHours: 1,
        media: 1,
        location: 1,
        isActive: 1,
        createdAt: 1,

        avgRating: 1,
        totalReviews: 1,

        category: {
          _id: "$categoryData._id",
          name: "$categoryData.name"
        },

        cancellationPolicy: {
          _id: "$cancellationPolicyData._id",
          title: "$cancellationPolicyData.title"
        },

        provider: {
          _id: "$provider._id",

          name: {
            $concat: [
              { $ifNull: ["$provider.firstName", ""] },
              " ",
              { $ifNull: ["$provider.lastName", ""] }
            ]
          },

          email: "$provider.email",
          phone: "$provider.phone",
          profile: "$provider.profile",
          isVerified: "$provider.isVerified"
        }
      }
    },

    { $sort: { createdAt: -1 } },

    { $skip: skip },

    { $limit: limit }

  ]);

  const totalPages = Math.ceil(total / limit);

  /* ========================
     📤 FINAL RESPONSE
  ======================== */

  return res.status(200).json({
    message: "Services fetched successfully",

    data: services,

    page,
    limit,
    total,
    totalPages,

    previousDisabled: page <= 1,

    nextPage: page < totalPages ? page + 1 : null,

    previousPage: page > 1 ? page - 1 : null,

    nextDisabled: page >= totalPages
  });

});
const updateServiceApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;
    const adminId = req.user._id;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use 'approve' or 'reject'"
      });
    }

    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    // Prevent duplicate action
    if (service.approvalStatus !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Service already ${service.approvalStatus}`
      });
    }

    // Reject → reason required
    if (action === "reject" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required"
      });
    }

    // Update
    service.approvalStatus = action === "approve" ? "approved" : "rejected";
    service.approvedBy = adminId;
    service.approvedAt = new Date();
    service.rejectionReason = action === "reject" ? reason : undefined;

    await service.save();

    await sendNotification({
      receiverId: service.user,
      receiverModel: "ServiceUser",
      senderId: adminId,
      senderModel: "Admin",
      title:
        action === "approve"
          ? "Service Approved ✅"
          : "Service Rejected ❌",
      body:
        action === "approve"
          ? "Your service has been approved."
          : "Your service has been rejected.",
      type: "SERVICE",
      referenceId: service._id,
      referenceType: "Service",
      data: {
        status: service.approvalStatus,
        rejectionReason: reason || null,
      },
    });

    res.status(200).json({
      success: true,
      message: `Service ${service.approvalStatus} successfully`,
      data: service
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const upsertCancellationPolicies = async (req, res) => {
  try {

    const policiesInput = req.body.policies;

    if (!Array.isArray(policiesInput) || policiesInput.length !== 3) {
      return res.status(400).send({
        message: "You must provide exactly 3 policies"
      });
    }

    const allowedPolicies = ["Flexible", "Moderate", "Strict"];

    const results = [];

    for (const policyData of policiesInput) {

      if (!allowedPolicies.includes(policyData.name)) {
        return res.status(400).send({
          message: `Invalid policy name: ${policyData.name}`
        });
      }

      const existing = await CancellationPolicy.findOne({
        name: policyData.name
      });

      if (existing) {
        const updated = await CancellationPolicy.findByIdAndUpdate(
          existing._id,
          policyData,
          { new: true }
        );

        results.push(updated);

      } else {
        const created = await CancellationPolicy.create(policyData);
        results.push(created);
      }
    }

    return res.send({
      message: "Policies upserted successfully",
      data: results
    });

  } catch (err) {
    return res.status(500).send({
      message: err.message
    });
  }
};

const getCancellationPolicies = async (req, res) => {
  try {

    const policies = await CancellationPolicy.find({
      isActive: true
    });

    const order = ["Flexible", "Moderate", "Strict"];

    const sortedPolicies = order.map(name =>
      policies.find(p => p.name === name)
    ).filter(Boolean);

    return res.send({
      message: "Policies fetched successfully",
      data: sortedPolicies
    });

  } catch (err) {
    return res.status(500).send({
      message: err.message
    });
  }
};

const getCancelledBookings = async (req, res) => {
  try {

    let {
      page = 1,
      limit = 10,
      isOverridden,   // true / false
      search          // optional (orderId)
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    const skip = (page - 1) * limit;

    /* =============================
       FILTER
    ============================== */

    const filter = {
      bookingStatus: "cancelled"
    };

    // ✅ Admin override filter
    if (isOverridden !== undefined) {
      filter["adminOverride.isOverridden"] =
        isOverridden === "true";
    }

    // ✅ Optional search (orderId)
    if (search) {
      filter.orderId = { $regex: search, $options: "i" };
    }

    /* =============================
       QUERY
    ============================== */

    const [bookings, total] = await Promise.all([

      Booking.find(filter)
        .populate("user", "firstName lastName email")
        .populate("property", "name location")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      Booking.countDocuments(filter)
    ]);

    /* =============================
       RESPONSE
    ============================== */

    return res.send({
      message: "Cancelled bookings fetched successfully",
      data: bookings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    return res.status(500).send({
      message: error.message
    });
  }
};

const softDeleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    /* ========================
       🔍 FIND REVIEW
    ======================== */
    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    /* ========================
       ❌ ALREADY DELETED
    ======================== */
    if (review.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Review already deleted"
      });
    }

    /* ========================
       🧹 SOFT DELETE
    ======================== */
    review.isDeleted = true;
    await review.save();

    res.json({
      success: true,
      message: "Review soft deleted successfully"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

const getAdminDashboard = async (req, res) => {
  try {

    /* ========================
       📅 TODAY RANGE
    ======================== */
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    /* ========================
       📊 TOTAL BOOKINGS (ALL TYPES)
    ======================== */

    const totalBookings = await Booking.countDocuments({
      isCancelled: false
    });

    /* ========================
       💰 REVENUE (ALL BOOKINGS)
    ======================== */

    const revenueResult = await Booking.aggregate([
      {
        $match: {
          paymentStatus: "paid",
          isCancelled: false
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" }
        }
      }
    ]);

    const netRevenue = Math.round(revenueResult[0]?.totalRevenue || 0);

    /* ========================
       📊 BOOKING STATUS
    ======================== */

    const bookingStatusAgg = await Booking.aggregate([
      {
        $match: { isCancelled: false }
      },
      {
        $group: {
          _id: "$bookingStatus",
          count: { $sum: 1 }
        }
      }
    ]);

    let bookingStatus = {
      confirmed: 0,
      pending: 0,
      cancelled: 0
    };

    bookingStatusAgg.forEach(item => {
      bookingStatus[item._id] = item.count;
    });

    /* ========================
       📈 REVENUE GRAPH
    ======================== */

    /* ========================
   📈 REVENUE GRAPH (FIXED)
======================== */

    const revenueGraphAgg = await Booking.aggregate([
      {
        $match: {
          paymentStatus: "paid",
          isCancelled: false
        }
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: "$totalAmount" }
        }
      }
    ]);

    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const revenueGraph = months.map((month, index) => {
      const found = revenueGraphAgg.find(m => m._id === index + 1);

      return {
        month,
        revenue: found ? Math.round(found.total) : 0
      };
    });

    /* ========================
       📊 OCCUPANCY (REAL LOGIC)
    ======================== */

    const activeStays = await Booking.countDocuments({
      checkIn: { $lte: new Date() },
      checkOut: { $gte: new Date() },
      isCancelled: false
    });

    const occupancyRate = totalBookings
      ? Math.round((activeStays / totalBookings) * 100)
      : 0;

    /* ========================
       📋 RECENT BOOKINGS (ALL)
    ======================== */

    const recentBookings = await Booking.find({
      isCancelled: false
    })
      .populate("user", "firstName email")
      .populate("property", "name")
      .sort({ createdAt: -1 })
      .limit(5);

    /* ========================
       📋 RECENT SERVICES (ONLY SERVICE BASED)
    ======================== */

    const recentServices = await Booking.find({
      bookingType: { $in: ["SERVICE", "PROPERTY_SERVICE"] },
      isCancelled: false
    })
      .populate("user", "firstName phone")
      .sort({ createdAt: -1 })
      .limit(5);

    /* ========================
       🏆 TOP PROPERTIES
    ======================== */

    const topProperties = await Booking.aggregate([
      {
        $match: {
          property: { $ne: null },
          isCancelled: false
        }
      },
      {
        $group: {
          _id: "$property",
          totalBookings: { $sum: 1 }
        }
      },
      { $sort: { totalBookings: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "properties",
          localField: "_id",
          foreignField: "_id",
          as: "property"
        }
      },
      { $unwind: "$property" },
      {
        $project: {
          name: "$property.name",
          totalBookings: 1
        }
      }
    ]);

    /* ========================
       📅 TODAY MOVEMENT
    ======================== */

    const arrivals = await Booking.find({
      checkIn: { $gte: todayStart, $lte: todayEnd },
      isCancelled: false
    })
      .populate("user", "firstName")
      .populate("property", "name")
      .limit(5);

    const departures = await Booking.find({
      checkOut: { $gte: todayStart, $lte: todayEnd },
      isCancelled: false
    })
      .populate("user", "firstName")
      .populate("property", "name")
      .limit(5);

    /* ========================
       📦 FINAL RESPONSE
    ======================== */

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalBookings,
          netRevenue,
          occupancyRate
        },
        bookingStatus,
        revenueGraph,
        recentBookings,
        recentServices,
        topProperties,
        todayMovement: {
          arrivals,
          departures
        }
      }
    });

  } catch (error) {
    console.error("Admin Dashboard Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  }
};


const getAdminReportsData = async (req) => {
  const { filterType, startDate, endDate } = req.query;

  let dateFilter = {};
  let previousFilter = {};
  let isFiltered = false;

  const now = new Date();

  /* ========================
     📅 DATE FILTER
  ======================== */

  // ✅ NO FILTER → ALL DATA
  if (!filterType) {
    dateFilter = {};
    previousFilter = {};
    isFiltered = false;
  }

  // ✅ MONTH
  else if (filterType === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date();

    dateFilter = { createdAt: { $gte: start, $lte: end } };

    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    previousFilter = { createdAt: { $gte: prevStart, $lte: prevEnd } };
    isFiltered = true;
  }

  // ✅ TODAY
  else if (filterType === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    dateFilter = { createdAt: { $gte: start, $lte: end } };

    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 1);

    const prevEnd = new Date(end);
    prevEnd.setDate(prevEnd.getDate() - 1);

    previousFilter = { createdAt: { $gte: prevStart, $lte: prevEnd } };
    isFiltered = true;
  }

  // ✅ CUSTOM
  else if (filterType === "custom" && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    dateFilter = { createdAt: { $gte: start, $lte: end } };

    const diff = end.getTime() - start.getTime();

    const prevStart = new Date(start.getTime() - diff);
    const prevEnd = new Date(start.getTime());

    previousFilter = { createdAt: { $gte: prevStart, $lte: prevEnd } };
    isFiltered = true;
  }

  /* ========================
     📊 BOOKINGS
  ======================== */

  const totalBookings = await Booking.countDocuments({
    ...dateFilter,
    isCancelled: false
  });

  const previousBookings = isFiltered
    ? await Booking.countDocuments({
      ...previousFilter,
      isCancelled: false
    })
    : 0;

  /* ========================
     💰 REVENUE
  ======================== */

  const revenueAgg = await Booking.aggregate([
    {
      $match: {
        ...dateFilter,
        paymentStatus: "paid",
        isCancelled: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$totalAmount" }
      }
    }
  ]);

  const totalRevenue = Math.round(revenueAgg[0]?.total || 0);

  const prevRevenueAgg = isFiltered
    ? await Booking.aggregate([
      {
        $match: {
          ...previousFilter,
          paymentStatus: "paid",
          isCancelled: false
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" }
        }
      }
    ])
    : [];

  const previousRevenue = Math.round(prevRevenueAgg[0]?.total || 0);

  /* ========================
     📈 GROWTH
  ======================== */

  const revenueGrowthPercent = isFiltered
    ? previousRevenue > 0
      ? Number((((totalRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1))
      : totalRevenue > 0
        ? 100
        : 0
    : 0;

  const bookingGrowthPercent = isFiltered
    ? previousBookings > 0
      ? Number((((totalBookings - previousBookings) / previousBookings) * 100).toFixed(1))
      : totalBookings > 0
        ? 100
        : 0
    : 0;

  /* ========================
     👥 USERS
  ======================== */

  const totalUsers = await ServiceUser.countDocuments({
    isDeleted: false
  });

  /* ========================
     📊 AVG BOOKING (FIXED)
  ======================== */

  const avgBooking = totalBookings
    ? Math.round(totalRevenue / totalBookings)
    : 0;

  /* ========================
     📈 REVENUE GRAPH
  ======================== */

  const revenueGraphAgg = await Booking.aggregate([
    {
      $match: {
        paymentStatus: "paid",
        isCancelled: false
      }
    },
    {
      $group: {
        _id: { $month: "$createdAt" },
        total: { $sum: "$totalAmount" }
      }
    }
  ]);

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const revenueGraph = months.map((month, index) => {
    const found = revenueGraphAgg.find(m => m._id === index + 1);
    return {
      month,
      revenue: found ? Math.round(found.total) : 0
    };
  });

  /* ========================
     📊 BOOKING STATUS
  ======================== */

  const bookingStatusAgg = await Booking.aggregate([
    { $match: { isCancelled: false } },
    {
      $group: {
        _id: "$bookingStatus",
        count: { $sum: 1 }
      }
    }
  ]);

  const bookingStatusChart = bookingStatusAgg.map(i => ({
    name: i._id,
    value: i.count
  }));

  /* ========================
     🏷 PROPERTY CATEGORY (FIXED)
  ======================== */

  const categoryAgg = await Booking.aggregate([
    {
      $match: {
        isCancelled: false,
        property: { $ne: null }
      }
    },
    {
      $lookup: {
        from: "properties",
        localField: "property",
        foreignField: "_id",
        as: "property"
      }
    },
    { $unwind: "$property" },
    {
      $lookup: {
        from: "categories",
        localField: "property.category",
        foreignField: "_id",
        as: "category"
      }
    },
    { $unwind: "$category" },
    {
      $group: {
        _id: "$category.category",
        count: { $sum: 1 }
      }
    }
  ]);

  const bookingsByCategory = categoryAgg.map(i => ({
    name: i._id,
    value: i.count
  }));

  /* ========================
     📍 LOCATION
  ======================== */

  const locationAnalytics = await Booking.aggregate([
    { $match: { isCancelled: false } },
    {
      $lookup: {
        from: "properties",
        localField: "property",
        foreignField: "_id",
        as: "property"
      }
    },
    { $unwind: "$property" },
    {
      $group: {
        _id: "$property.address.city",
        totalBookings: { $sum: 1 }
      }
    }
  ]);

  /* ========================
     🔁 RETENTION
  ======================== */

  const usersAgg = await Booking.aggregate([
    { $match: { ...dateFilter, isCancelled: false } },
    {
      $group: {
        _id: "$user",
        bookings: { $sum: 1 }
      }
    }
  ]);

  const repeatUsers = usersAgg.filter(u => u.bookings > 1).length;

  const retentionRate = usersAgg.length
    ? Math.round((repeatUsers / usersAgg.length) * 100)
    : 0;

  return {
    stats: {
      totalRevenue,
      revenueGrowthPercent,
      totalBookings,
      bookingGrowthPercent,
      totalUsers,
      avgBooking
    },
    revenueGraph,
    bookingStatusChart,
    bookingsByCategory,
    locationAnalytics,
    retentionRate
  };
};

const getAdminReports = async (req, res) => {
  try {
    const data = await getAdminReportsData(req);

    res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};



const width = 800;
const height = 400;

const chartCanvas = new ChartJSNodeCanvas({
  width,
  height,
  backgroundColour: "white"
});

const exportReportPDF = async (req, res) => {
  try {
    const data = await getAdminReportsData(req);

    const {
      stats,
      revenueGraph,
      bookingStatusChart,
      bookingsByCategory,
      locationAnalytics,
      retentionRate
    } = data;

    /* ========================
       📈 REVENUE LINE CHART
    ======================== */

    const revenueChart = await chartCanvas.renderToBuffer({
      type: "line",
      data: {
        labels: revenueGraph.map(i => i.month),
        datasets: [
          {
            label: "Revenue",
            data: revenueGraph.map(i => i.revenue)
          }
        ]
      }
    });

    /* ========================
       📊 STATUS PIE CHART
    ======================== */

    const statusChart = await chartCanvas.renderToBuffer({
      type: "pie",
      data: {
        labels: bookingStatusChart.map(i => i.name),
        datasets: [
          {
            data: bookingStatusChart.map(i => i.value)
          }
        ]
      }
    });

    /* ========================
       🏷 CATEGORY PIE CHART
    ======================== */

    const categoryChart = await chartCanvas.renderToBuffer({
      type: "pie",
      data: {
        labels: bookingsByCategory.map(i => i.name),
        datasets: [
          {
            data: bookingsByCategory.map(i => i.value)
          }
        ]
      }
    });

    /* ========================
       📄 CREATE PDF
    ======================== */

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=report.pdf");

    doc.pipe(res);

    /* ========================
       🏷 HEADER
    ======================== */

    doc.fontSize(22).text("Admin Analytics Report", { align: "center" });
    doc.moveDown();

    /* ========================
       📊 STATS
    ======================== */

    doc.fontSize(12);

    doc.text(`Total Revenue: ₹${stats.totalRevenue}`);
    doc.text(`Revenue Growth: ${stats.revenueGrowthPercent}%`);
    doc.text(`Total Bookings: ${stats.totalBookings}`);
    doc.text(`Booking Growth: ${stats.bookingGrowthPercent}%`);
    doc.text(`Total Users: ${stats.totalUsers}`);
    doc.text(`Average Booking: ₹${stats.avgBooking}`);
    doc.text(`Retention Rate: ${retentionRate}%`);

    doc.moveDown();

    /* ========================
       📈 REVENUE GRAPH
    ======================== */

    doc.fontSize(14).text("Revenue Trend");
    doc.image(revenueChart, { fit: [500, 250] });

    doc.addPage();

    /* ========================
       📊 STATUS CHART
    ======================== */

    doc.fontSize(14).text("Booking Status Distribution");
    doc.image(statusChart, { fit: [300, 300], align: "center" });

    doc.moveDown();

    /* ========================
       🏷 CATEGORY CHART
    ======================== */

    doc.text("Property Category Distribution");
    doc.image(categoryChart, { fit: [300, 300], align: "center" });

    doc.moveDown();

    /* ========================
       📍 LOCATION LIST
    ======================== */

    doc.text("Top Locations:");
    locationAnalytics.forEach(loc => {
      doc.text(`${loc._id}: ${loc.totalBookings}`);
    });

    doc.moveDown();

    /* ========================
       📄 FOOTER
    ======================== */

    doc.fontSize(10).text(
      "Generated on: " + new Date().toLocaleString(),
      { align: "right" }
    );

    doc.end();

  } catch (error) {
    console.error("PDF Error:", error);
    res.status(500).json({ success: false });
  }
};



const getAdminFinanceDashboardData = async (req) => {
  const { view = "monthly", page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const now = new Date();

  /* ========================
     📊 MAIN STATS
  ======================== */

  const payments = await PaymentTransaction.find({
    status: "success"
  });

  let grossRevenue = 0;
  let providerPayouts = 0;
  let adminCommission = 0;
  let platformFees = 0;
  let taxExpenses = 0;

  payments.forEach(p => {
    grossRevenue += p.totalAmount || 0;
    providerPayouts += p.providerAmount || 0;
    adminCommission += p.commissionAmount || 0;
    platformFees += p.platformFee || 0;
    taxExpenses += p.tax || 0;
  });

  /* ========================
     🔁 REFUND
  ======================== */

  const refundAgg = await Booking.aggregate([
    { $match: { isCancelled: true } },
    { $group: { _id: null, total: { $sum: "$refundAmount" } } }
  ]);

  const refundAmount = Math.round(refundAgg[0]?.total || 0);

  /* ========================
     📈 GRAPH
  ======================== */

  let graph = [];

  if (view === "monthly") {
    const graphAgg = await PaymentTransaction.aggregate([
      {
        $match: {
          status: "success",
          createdAt: {
            $gte: new Date(now.getFullYear(), 0, 1),
            $lte: new Date(now.getFullYear(), 11, 31)
          }
        }
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          revenue: { $sum: "$totalAmount" },
          payout: { $sum: "$providerAmount" },
          commission: { $sum: "$commissionAmount" },
          platformFee: { $sum: "$platformFee" }
        }
      }
    ]);

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    graph = months.map((month, i) => {
      const found = graphAgg.find(g => g._id === i + 1);
      return {
        label: month,
        revenue: found ? Math.round(found.revenue) : 0,
        payouts: found ? Math.round(found.payout) : 0,
        netEarnings: found
          ? Math.round((found.commission || 0) + (found.platformFee || 0))
          : 0
      };
    });
  }

  else {
    const graphAgg = await PaymentTransaction.aggregate([
      { $match: { status: "success" } },
      {
        $group: {
          _id: { $year: "$createdAt" },
          revenue: { $sum: "$totalAmount" },
          payout: { $sum: "$providerAmount" },
          commission: { $sum: "$commissionAmount" },
          platformFee: { $sum: "$platformFee" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    graph = graphAgg.map(g => ({
      label: g._id.toString(),
      revenue: Math.round(g.revenue),
      payouts: Math.round(g.payout),
      netEarnings: Math.round((g.commission || 0) + (g.platformFee || 0))
    }));
  }

  /* ========================
     📋 TRANSACTIONS
  ======================== */

  const transactionsRaw = await PaymentTransaction.find({
    status: "success"
  })
    .populate({
      path: "booking",
      select: "orderId isCancelled refundAmount"
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const transactions = transactionsRaw.map(p => ({
    date: p.createdAt,
    orderId: p.orderId || p.booking?.orderId,
    gross: Math.round(p.totalAmount || 0),
    refund: p.booking?.isCancelled ? Math.round(p.booking?.refundAmount || 0) : 0,
    adminCommission: Math.round(p.commissionAmount || 0),
    platformFee: Math.round(p.platformFee || 0),
    tax: Math.round(p.tax || 0),
    payout: Math.round(p.providerAmount || 0),
    status: p.booking?.isCancelled ? "refunded" : "completed"
  }));

  const totalTransactions = await PaymentTransaction.countDocuments({
    status: "success"
  });

  return {
    stats: {
      grossRevenue: Math.round(grossRevenue),
      providerPayouts: Math.round(providerPayouts),
      adminCommission: Math.round(adminCommission),
      platformFees: Math.round(platformFees),
      taxExpenses: Math.round(taxExpenses),
      refundAmount
    },
    graph,
    transactions,
    pagination: {
      total: totalTransactions,
      page: Number(page),
      limit: Number(limit)
    }
  };
};


const getAdminEarningsDashboard = async (req, res) => {
  try {
    const data = await getAdminFinanceDashboardData(req);

    res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};

const exportEarningsCSV = async (req, res) => {
  try {
    const data = await getAdminFinanceDashboardData(req);

    const parser = new Parser();
    const csv = parser.parse(data.transactions);

    res.header("Content-Type", "text/csv");
    res.attachment("earnings.csv");

    return res.send(csv);

  } catch (error) {
    res.status(500).json({ success: false });
  }
};


const exportEarningsPDF = async (req, res) => {
  try {
    const data = await getAdminFinanceDashboardData(req);

    const chartImage = await chartCanvas.renderToBuffer({
      type: "bar",
      data: {
        labels: data.graph.map(g => g.label),
        datasets: [
          { label: "Revenue", data: data.graph.map(g => g.revenue) },
          { label: "Payouts", data: data.graph.map(g => g.payouts) },
          { label: "Net Earnings", data: data.graph.map(g => g.netEarnings) }
        ]
      }
    });

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=earnings.pdf");

    doc.pipe(res);

    /* HEADER */
    doc.fontSize(20).text("Earnings Report", { align: "center" });
    doc.moveDown();

    /* STATS */
    const s = data.stats;
    doc.fontSize(12);
    doc.text(`Gross Revenue: ₹${s.grossRevenue}`);
    doc.text(`Provider Payouts: ₹${s.providerPayouts}`);
    doc.text(`Admin Commission: ₹${s.adminCommission}`);
    doc.text(`Platform Fees: ₹${s.platformFees}`);
    doc.text(`Tax: ₹${s.taxExpenses}`);
    doc.text(`Refund: ₹${s.refundAmount}`);

    doc.moveDown();

    /* CHART */
    doc.text("Revenue vs Payouts Trend");
    doc.image(chartImage, { fit: [500, 250] });

    doc.addPage();

    /* TABLE */
    doc.fontSize(14).text("Transactions");
    doc.moveDown();

    data.transactions.forEach(t => {
      doc.fontSize(10).text(
        `${t.orderId} | ₹${t.gross} | ₹${t.payout} | ${t.status}`
      );
    });

    doc.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};

const getAdminNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const receiverId = req.user._id;

    const receiverModel = "Admin"; // ✅ FIXED (no dependency on role)

    const skip = (page - 1) * limit;

    const notifications = await Notification.find({
      receiverId,
      receiverModel,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments({
      receiverId,
      receiverModel,
      isDeleted: false,
    });

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllNotificationsAdmin = async (req, res) => {
  try {
    let { page = 1, limit = 10, type, isDeleted } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const skip = (page - 1) * limit;

    /* =========================
       FILTER
    ========================= */
    let filter = {};

    // Optional filter by type
    if (type) {
      filter.referenceType = type;
    }

    // ✅ Include deleted or not
    if (isDeleted !== undefined) {
      filter.isDeleted = isDeleted === "true";
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments(filter);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getNotificationDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);

    if (!notification || notification.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminDeleteNotifications = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide ids array",
      });
    }

    const notifications = await Notification.find({
      _id: { $in: ids },
    });

    if (!notifications.length) {
      return res.status(404).json({
        success: false,
        message: "No notifications found",
      });
    }

    const deletable = [];
    const skipped = [];

    notifications.forEach((n) => {
      if (n.receiverModel === "Admin") {
        deletable.push(n._id);
      } else if (n.isDeleted === true) {
        deletable.push(n._id);
      } else {
        skipped.push({
          id: n._id,
          reason: "Not soft deleted",
        });
      }
    });

    let deletedCount = 0;

    if (deletable.length) {
      const result = await Notification.deleteMany({
        _id: { $in: deletable },
      });
      deletedCount = result.deletedCount;
    }

    /* =========================
       FRONTEND FRIENDLY RESPONSE
    ========================= */
    res.status(200).json({
      success: true,
      summary: {
        totalRequested: ids.length,
        deleted: deletedCount,
        skipped: skipped.length,
      },
      data: {
        deletedIds: deletable,
        skipped,
      },
      message:
        deletedCount > 0
          ? `${deletedCount} deleted, ${skipped.length} skipped`
          : "No notifications deleted",
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const logout = catchAsyncError(async (req, res, next) => {
  if (!req?.headers?.authorization) {
    return res.status(400).send({
      message: "Token not found",
    });
  }

  const { 1: authToken } = req.headers.authorization.split(" ");

  try {
    const decoded = jwt.verify(authToken, process.env.JWT_SECRET);

    await Admin.updateOne(
      { _id: decoded.user._id },
      { $pull: { tokens: authToken } }
    );

    return res.status(200).send({
      message: "Logout Successfully",
    });
  } catch (error) {
    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
});


const softDeleteProperty = catchAsyncError(async (req, res, next) => {
  const { propertyId } = req.params;
  const { isDeleted } = req.body;

  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    return res.status(400).json({
      message: "Invalid propertyId",
    });
  }

  if (typeof isDeleted !== "boolean") {
    return res.status(400).json({
      message: "isDeleted must be true or false",
    });
  }

  const property = await Properties.findById(propertyId);

  if (!property) {
    return res.status(404).json({
      message: "Property not found",
    });
  }

  property.isDeleted = isDeleted;
  await property.save();

  return res.status(200).json({
    success: true,
    message: `Property ${isDeleted ? "deleted" : "restored"} successfully`,
  });
});

const softDeleteService = catchAsyncError(async (req, res, next) => {
  const { serviceId } = req.params;
  const { isDeleted } = req.body;

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    return res.status(400).json({
      message: "Invalid serviceId",
    });
  }

  if (typeof isDeleted !== "boolean") {
    return res.status(400).json({
      message: "isDeleted must be true or false",
    });
  }

  const service = await Service.findById(serviceId);

  if (!service) {
    return res.status(404).json({
      message: "Service not found",
    });
  }

  service.isDeleted = isDeleted;

  // 🔥 Important: also disable service if deleted
  if (isDeleted) {
    service.isActive = false;
  }

  await service.save();

  return res.status(200).json({
    success: true,
    message: `Service ${isDeleted ? "deleted" : "restored"} successfully`,
  });
});

module.exports = {
  adminLogin,
  sendForgotPasswordOTP,
  validOtp,
  resetPassword,
  changePassword,
  checkToken,
  getAllUsers,
  getAllServiceUsers,
  getServiceUserById,
  getUserById,
  addAmenities,
  addFeature,
  addRestRoom,
  getAllAmenities,
  getAllCategories,
  getAllFeatures,
  getAllRestRooms,
  getAmenitiById,
  getCategoriesById,
  getFeaturesById,
  getRestRoomsById,
  activateServiceUser,
  addServiceUser,
  addUser,
  addCategory,
  editCategory,
  categoryList,
  deleteCategory,
  deleteAmenities,
  updatedAmenity,
  updateProfile,
  updateRestRoom,
  deleteRestRoom,
  deleteFeature,
  updateStatus,
  // getServiceUserProperties,
  getAllProperties,
  getPropertiesById,
  blockUnblockServiceUser,
  getPropertyDetailsForAdmin,
  createCoupon,
  updateCoupon,
  getAllCoupons,
  deleteCoupon,
  getAllCommissions,
  createCommission,
  updateCommission,
  deleteCommission,
  createBanner,
  updateBanner,
  deleteBanner,
  getAllBanners,
  getAllBookingsAdmin,
  getBookingsByPropertyId,
  getBookingDetails,
  upsertPlatformFee,
  upsertTax,
  getPlatformConfig,
  getAllPaymentTransactions,
  getTransactionDetails,
  getAdminUpcomingBookings,
  getAdminBookingCalendar,
  getAllWalletTransactions,
  getWithdrawRequests,
  updateWithdrawStatus,
  getAllUserBookingsAdmin,
  createServiceCategory,
  updateSerivceCategory,
  toggleServiceCategoryStatus,
  getAllServiceCategories,
  getAllServicesAdmin,
  getSingleServiceAdmin,
  getServicesByUserAdmin,
  getAllPackagesAdmin,
  getSinglePackageAdmin,
  getPackagesByUserAdmin,
  getPendingProperties,
  updatePropertyApproval,
  getPendingServices,
  updateServiceApproval,
  upsertCancellationPolicies,
  getCancellationPolicies,
  getCancelledBookings,
  softDeleteReview,
  getAdminDashboard,
  getAdminReports,
  exportReportPDF,
  getAdminEarningsDashboard,
  exportEarningsCSV,
  exportEarningsPDF,
  getAdminNotifications,
  getAllNotificationsAdmin,
  getNotificationDetails,
  adminDeleteNotifications,
  logout,
  softDeleteServiceUser,
  softDeleteService,
  softDeleteProperty
};

