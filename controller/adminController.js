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

const adminLogin = catchAsyncError(async (req, res, next) => {
  const errors = validationResult(req);
  const checkValid = await checkValidations(errors);
  if (checkValid.type === "error") {
    return res.status(400).send({
      message: checkValid.errors.msg,
    });
  }
  let { email, password } = req.body;
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

  await Admin.updateOne(
    { _id: admin._id, isDeleted: false },
    { $push: { tokens: token } }
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

// const getAllUsers = catchAsyncError(async (req, res, next) => {
//   let { s, limit, cursor, direction, currPage } = req.query;
//   if (s == "undefined" || typeof s === "undefined") s = "";

//   console.log(req.query);

//   limit = parseInt(limit) || 10;
//   cursor = cursor || null;

//   const matchStage = {
//     isDeleted: false,
//     $or: [
//       { phone: { $regex: s, $options: "i" } },
//       { firstName: { $regex: s, $options: "i" } },
//       { lastName: { $regex: s, $options: "i" } },
//       { email: { $regex: s, $options: "i" } },
//     ],
//   };

//   const totalCount = await User.countDocuments(matchStage);

//   if (cursor) {
//     if (direction === "next") {
//       matchStage._id = { $lt: new objectId(cursor) };
//     } else if (direction === "prev") {
//       matchStage._id = { $gt: new objectId(cursor) };
//     }
//   }

//   let users = await User.aggregate([
//     { $match: matchStage },
//     {
//       $project: {
//         _id: 1,
//         userId: 1,
//         salutataion: 1,
//         firstName: 1,
//         lastName: 1,
//         email: 1,
//         phone: 1,
//         phoneCode: 1,
//         city: 1,
//         state: 1,
//         profile: 1,
//         createdAt: 1,
//         role: 1,
//       },
//     },
//     { $sort: { _id: direction === "prev" ? 1 : -1 } },
//     { $limit: limit + 1 },
//   ]);

//   const hasNextPage =
//     (currPage == 1 && users.length > limit) ||
//     users.length > limit ||
//     (direction === "prev" && users.length === limit);

//   if (hasNextPage && direction) {
//     if (direction === "next") users.pop();
//   } else if (hasNextPage) {
//     users.pop();
//   }
//   const hasPrevPage = currPage == 1 ? false : true;

//   if (direction === "prev" && currPage != 1) {
//     users.reverse().shift();
//   } else if (direction === "prev") {
//     users.reverse();
//   }

//   const nextCursor = hasNextPage ? users[users.length - 1]._id : null;
//   const prevCursor = hasPrevPage ? users[0]._id : null;

//   return res.status(200).send({
//     data: users,
//     nextCursor,
//     prevCursor,
//     hasNextPage,
//     hasPrevPage,
//     totalCount,
//   });
// });

const getAllUsers = catchAsyncError(async (req, res, next) => {
  let {
    search = "",
    sortBy = "latest",
    status
  } = req.query;

  const { page, pageSize, skip } = paginationQuery(req.query);
  sortBy = sortBy?.toLowerCase();   // make case-insensitive
  status = status?.toLowerCase();   // make case-insensitive

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

  // ✅ Status filter (active / inactive)
  if (status === "active") {
    matchStage.isActive = true;
  } else if (status === "inactive") {
    matchStage.isActive = false;
  }

  // ✅ Sorting logic
  let sort = { _id: -1 }; // default latest

  if (sortBy === "asc") {
    sort = { category: 1 };
  } else if (sortBy === "desc") {
    sort = { category: -1 };
  } else if (sortBy === "latest") {
    sort = { createdAt: -1 };
  } else if (sortBy === "oldest") {
    sort = { createdAt: 1 };
  }

  // ✅ Total count (without cursor filter)
  
  const total = await User.countDocuments(matchStage);


    const users = await User.aggregate([
    { $match: matchStage },
    { $sort: sort },
    { $skip: skip },       // 👈 from paginationQuery
    { $limit: pageSize },  // 👈 from paginationQuery
    {
      $project: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        phone: 1,
        isActive: 1,
        createdAt: 1,
      },
    },
  ]);
 
const pageInfo = pagination({
    total,
    page,
    pageSize,
  });

  return res.status(200).json({
    success: true,
    data: users,
    total,
    ...pageInfo,   // 👈 adds page info
  });
});

// const getAllServiceUsers = catchAsyncError(async (req, res, next) => {
//   let { s, limit, cursor, direction, currPage } = req.query;
//   if (s == "undefined" || typeof s === "undefined") s = "";

//   limit = parseInt(limit) || 10;
//   cursor = cursor || null;

//   const matchStage = {
//     isDeleted: false,
//     $or: [
//       { phone: { $regex: s, $options: "i" } },
//       { userId: { $regex: s, $options: "i" } },
//       { firstName: { $regex: s, $options: "i" } },
//       { lastName: { $regex: s, $options: "i" } },
//       { email: { $regex: s, $options: "i" } },
//     ],
//   };

//   const totalCount = await ServiceUser.countDocuments(matchStage);

//   if (cursor) {
//     if (direction === "next") {
//       matchStage._id = { $lt: new objectId(cursor) };
//     } else if (direction === "prev") {
//       matchStage._id = { $gt: new objectId(cursor) };
//     }
//   }

//   let users = await ServiceUser.aggregate([
//     { $match: matchStage },
//     {
//       $project: {
//         _id: 1,
//         salutataion: 1,
//         userId: 1,
//         firstName: 1,
//         lastName: 1,
//         email: 1,
//         phoneCode: 1,
//         isActive: 1,
//         phone: 1,
//         profile: 1,
//         createdAt: 1,
//         role: 1,
//       },
//     },
//     { $sort: { _id: direction === "prev" ? 1 : -1 } },
//     { $limit: limit + 1 },
//   ]);

//   const hasNextPage =
//     (currPage == 1 && users.length > limit) ||
//     users.length > limit ||
//     (direction === "prev" && users.length === limit);

//   if (hasNextPage && direction) {
//     if (direction === "next") users.pop();
//   } else if (hasNextPage) {
//     users.pop();
//   }
//   const hasPrevPage = currPage == 1 ? false : true;

//   if (direction === "prev" && currPage != 1) {
//     users.reverse().shift();
//   } else if (direction === "prev") {
//     users.reverse();
//   }

//   const nextCursor = hasNextPage ? users[users.length - 1]._id : null;
//   const prevCursor = hasPrevPage ? users[0]._id : null;

//   return res.status(200).send({
//     data: users,
//     nextCursor,
//     prevCursor,
//     hasNextPage,
//     hasPrevPage,
//     totalCount,
//   });
// });

const getAllServiceUsers = catchAsyncError(async (req, res, next) => {
  let { search, status, sortBy = "latest"  } = req.query;

   const { page, pageSize, skip } = paginationQuery(req.query);
   
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

  // ✅ Status Filter Only
  if (status && ["approved", "rejected", "pending"].includes(status)) {
    matchStage.isApproved = status;
  }

  // ✅ Sorting
  let sort = { createdAt: -1 }; // default latest

  if (sortBy === "asc") {
    sort = { firstName: 1 };
  } else if (sortBy === "desc") {
    sort = { firstName: -1 };
  } else if (sortBy === "oldest") {
    sort = { createdAt: 1 };
  }


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
        isApproved: 1,   // still returning status
        createdAt: 1,
      },
    },
    ]);

  // ✅ Pagination meta
  const pageInfo = pagination({
    total,
    page,
    pageSize,
  });

  return res.status(200).json({
    success: true,
    data: users,
    total,
    ...pageInfo,
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

// const getServiceUserProperties = catchAsyncError(async (req, res, next) => {
//   const { id } = req.params;

//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 10;
//   const skip = (page - 1) * limit;

//   // Get only required service user fields
//   const serviceUser = await ServiceUser.findOne(
//     { _id: id, isDeleted: false },
//     { _id: 1, firstName: 1, lastName: 1 }
//   ).lean();

//   if (!serviceUser) {
//     return res.status(400).json({ message: "Service User not found" });
//   }

//   const filter = {
//     user: id,
//     isDeleted: false,
//     isApproved: "approved"
//   };

//   const total = await Properties.countDocuments(filter);

//   const properties = await Properties.find(filter)
//     .skip(skip)
//     .limit(limit)
//     .sort({ createdAt: -1 })
//     .lean();

//   return res.status(200).json({
//     message: "Properties fetched successfully",
//     serviceUser: {
//       id: serviceUser._id,
//       name: `${serviceUser.firstName} ${serviceUser.lastName}`
//     },
//     data: properties,
//     pagination: {
//       total,
//       page,
//       limit,
//       totalPages: Math.ceil(total / limit)
//     }
//   });
// });

const getAllProperties = catchAsyncError(async (req, res, next) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Total service users
  const total = await ServiceUser.countDocuments({ isDeleted: false });

  const users = await ServiceUser.aggregate([
    { $match: { isDeleted: false } },

    {
      $lookup: {
        from: "properties", // must match MongoDB collection name
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
    },

    { $skip: skip },
    { $limit: limit }
  ]);

  return res.status(200).json({
    message: "Service users with properties fetched successfully",
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    data: users
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
        from: "properties", // must match MongoDB collection name
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

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: 'Invalid Category Id' });
  }

  const categoryName = humanize(req.body.category);

  const categoryExists = await Category.countDocuments({
    _id: { $ne: req.params.id },
    category: categoryName,
    isDeleted: false
  });

  if (categoryExists) {
    return res.status(400).send({ message: 'Category already exists' });
  }

  let obj = {
    category: categoryName
  }

  if (req.file) {
    obj['image'] = req.file.filename
  }

  await Category.updateOne({ _id: req.params.id }, { $set: obj });

  return res.status(200).send({ message: 'Category updated successfully' });
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
  const features = await Feature.find({ isDeleted: false }).lean(true);
  return res.status(200).send({
    data: features,
    message: features.length
      ? "Features received successfully"
      : "No features found",
  });
});

const getAllRestRooms = catchAsyncError(async (req, res, next) => {
  const rest_features = await RestRoom.find({ isDeleted: false }).lean();
  return res.status(200).send({ data: rest_features });
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
  let condition = {};
  let sort = {};
  const { search, sortBy } = req.query;
  if (search) {
    condition = {
      $or: [{ category: { $regex: search, $options: "i" } }],
    };
  }
  const sortValue = sortBy?.toLowerCase();

  if (sortValue === "asc") {
    sort = { category: 1 };
  } else if (sortValue === "desc") {
    sort = { category: -1 };
  } else if (sortValue === "latest") {
    sort = { createdAt: -1 };
  } else {
    sort = { createdAt: -1 };
  }
  const pagination = await paginationQuery(req.query);

  const [manualData, total] = await Promise.all([
    Category.find(condition)
      .collation({ locale: "en", strength: 2 })
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.pageSize)
      .lean(true),
    Category.countDocuments(condition),
  ]);
  return res.status(200).send({
    data: manualData,
    page: pagination.page,
    limit: pagination.pageSize,
    total,
    totalPages: Math.ceil(total / pagination.pageSize),
    previousDisabled: pagination.page <= 1,
    nextPage: pagination.page + 1,
    previousPage: pagination.page - 1,
    nextDisabled:
      pagination.page >= Math.ceil(total / pagination.pageSize),
    message: manualData.length
      ? "Categories received successfully"
      : "No categories found",
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
    isDelete:false
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
    status, // active | expired | upcoming
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const query = {isDelete:false};

  if (search) {
    query.code = { $regex: search, $options: "i" };
  }

  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  }

  if (firstTimeUserOnly !== undefined) {
    query.firstTimeUserOnly = firstTimeUserOnly === "true";
  }

  const now = new Date();

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

  const coupons = await Coupon.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const total = await Coupon.countDocuments(query);

  res.status(200).json({
    success: true,
    totalRecords: total,
    totalPages: Math.ceil(total / limit),
    currentPage: Number(page),
    data: coupons,
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

  const query = {
    isDeleted: false,
  };

  if (scope) {
    query.scope = scope; 
  }

  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  }

  const skip = (Number(page) - 1) * Number(limit);

  const total = await Commission.countDocuments(query);

  const commissions = await Commission.find(query)
    .populate("categoryId", "category") 
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  res.status(200).json({
    success: true,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / limit),
    data: commissions,
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
    const banners = await Banner.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: banners,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

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
  getAllBanners
};

