const app = require("express");
const {
  adminLogin,
  getAdminProfile,
  checkToken,
  addAmenities,
  addFeature,
  getAllAmenities,
  getAllCategories,
  getAllFeatures,
  getAmenitiById,
  getCategoriesById,
  getFeaturesById,
  getAllUsers,
  getAllServiceUsers,
  getServiceUserById,
  activateServiceUser,
  addServiceUser,
  addUser,
  getUserById,
  addRestRoom,
  getAllRestRooms,
  getRestRoomsById,
  sendForgotPasswordOTP,
  validOtp,
  resetPassword,
  changePassword,
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
  getAllProperties,
  getPropertiesById,
  blockUnblockServiceUser,
  //  getServiceUserProperties,
  getPropertyDetailsForAdmin,
  createCoupon,
  updateCoupon,
  getAllCoupons,
  deleteCoupon,
  getAllCommissions,
  createCommission,
  updateCommission,
  deleteCommission
} = require("../controller/adminController");
const validateAdminToken = require("../middleware/adminValidateToken");
const { uploads } = require("../functions/upload");
const {
  adminLoginValidation,
  forgotPass,
  resetPass,
  verifyOtp,
} = require("../validations/validator");

const router = app.Router();

router.post("/sign-in", adminLoginValidation, adminLogin);
router.post("/forget-password", forgotPass, sendForgotPasswordOTP);
router.post("/validate-otp", verifyOtp, validOtp);
router.post("/reset-password", resetPass, resetPassword);
router.post("/change-password", validateAdminToken, changePassword);
router.get("/dashboard", validateAdminToken, checkToken);
router.get("/get-all-users", validateAdminToken, getAllUsers);
router.get("/get-all-service-users", validateAdminToken, getAllServiceUsers);
router.get("/properties", validateAdminToken, getAllProperties);
router.get("/userAllProperties/:id", validateAdminToken, getPropertiesById);
router.get("/get-service-user/:id", validateAdminToken, getServiceUserById);
router.get("/get-user/:id", validateAdminToken, getUserById);
router.post("/add-category", validateAdminToken, uploads.single("image"), addCategory);
router.put("/edit-category/:id", validateAdminToken, uploads.single("image"), editCategory);
router.get("/get-category/:id", validateAdminToken, getCategoriesById);
router.delete("/delete-category/:id", validateAdminToken, deleteCategory);
router.post("/add-feature", validateAdminToken, addFeature);
router.delete("/deleteFeature/:id", validateAdminToken, deleteFeature);
router.post("/add-restroom", validateAdminToken, addRestRoom);
router.put("/updateRestRoom/:id", validateAdminToken, updateRestRoom);
router.delete("/deleteRestRoom/:id", validateAdminToken, deleteRestRoom);
router.post("/add-amenities", validateAdminToken, addAmenities);
router.get("/get-amenities", validateAdminToken, getAllAmenities);
router.delete("/delete-amenities/:id", validateAdminToken, deleteAmenities);
router.put("/update-amenity/:id", validateAdminToken, updatedAmenity);
router.get("/get-categories", validateAdminToken, categoryList);
router.get("/get-features", validateAdminToken, getAllFeatures);
router.get("/get-restrooms", validateAdminToken, getAllRestRooms);
router.get("/get-amenity/:id", validateAdminToken, getAmenitiById);
router.get("/get-feature/:id", validateAdminToken, getFeaturesById);
router.get("/get-restroom/:id", validateAdminToken, getRestRoomsById);

router.put(
  "/update-profile",
  validateAdminToken,
  uploads.single("profileImage"),
  updateProfile
);
router.patch(
  "/activate-service-user/:id",
  validateAdminToken,
  activateServiceUser
);

router.post(
  "/add-service-user",
  validateAdminToken,
  uploads.fields([{ name: "profile" }, { name: "docs" }]),
  addServiceUser
);

router.post(
  "/add-user",
  validateAdminToken,
  uploads.fields([{ name: "profile" }]),
  addUser
);
router.put("/approved-rejected/:userId", validateAdminToken, updateStatus);

router.put("/block-unblock/:userId/:type", validateAdminToken, blockUnblockServiceUser);

router.get("/getPropertyDetailsForAdmin/:propertyId", validateAdminToken, getPropertyDetailsForAdmin);

router.post("/createCoupon", validateAdminToken, createCoupon)

router.patch("/updateCoupon/:couponId", validateAdminToken, updateCoupon)

router.get("/getAllCoupons", validateAdminToken, getAllCoupons)

router.delete("/deleteCoupon/:couponId", validateAdminToken, deleteCoupon);

router.get("/getAllCommissions", validateAdminToken, getAllCommissions);
router.post("/createCommission", validateAdminToken, createCommission);
router.put("/updateCommission/:id", validateAdminToken, updateCommission);
router.delete("/deleteCommission/:id", validateAdminToken, deleteCommission);

module.exports = router;
