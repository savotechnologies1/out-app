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
  getAdminServiceBookingCalendar,
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
  getAdminPendingCounts,
  markPendingCountsSeen,
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
  softDeleteProperty,
  softDeleteService,
  getBookingsByServiceId,
  toggleRecommendedProperty,
  getAllServiceCategoriesForCommission,
  getAllServicesForCommission
} = require("../controller/adminController");
const validateAdminToken = require("../middleware/adminValidateToken");
const { uploads } = require("../functions/upload");
const {
  adminLoginValidation,
  forgotPass,
  resetPass,
  verifyOtp,
} = require("../validations/validator");
const { adminOverrideRefund, deletePendingBooking } = require("../controller/bookingController");
const { getReviews } = require("../controller/userController");
const {
  getPendingVerifications,
  getVerificationDetails,
  approveVisitor,
  rejectVisitor,
} = require("../controller/identity.controller");
const {
  rejectVisitorValidation,
} = require("../validations/identity.validator");

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
router.put("/edit-category/:categoryId", validateAdminToken, uploads.single("image"), editCategory);
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

router.delete("/softDelete/:userId/:type", validateAdminToken, softDeleteServiceUser)

router.get("/getPropertyDetailsForAdmin/:propertyId", validateAdminToken, getPropertyDetailsForAdmin);

router.post("/createCoupon", validateAdminToken, createCoupon)

router.patch("/updateCoupon/:couponId", validateAdminToken, updateCoupon)

router.get("/getAllCoupons", validateAdminToken, getAllCoupons)

router.delete("/deleteCoupon/:couponId", validateAdminToken, deleteCoupon);

router.get("/getAllCommissions", validateAdminToken, getAllCommissions);
router.post("/createCommission", validateAdminToken, createCommission);
router.put("/updateCommission/:id", validateAdminToken, updateCommission);
router.delete("/deleteCommission/:id", validateAdminToken, deleteCommission);
router.get("/getAllServiceCategoriesForCommission", validateAdminToken, getAllServiceCategoriesForCommission)
router.get("/getAllServicesForCommission", validateAdminToken, getAllServicesForCommission);

router.post(
  "/create",
  validateAdminToken,
  uploads.single("bannerImg"),
  createBanner
);

router.put(
  "/updateBanner/:id",
  validateAdminToken,
  uploads.single("bannerImg"),
  updateBanner
);

router.delete(
  "/deleteBanner/:id",
  validateAdminToken,
  deleteBanner
);

router.get(
  "/bannerList",
  validateAdminToken,
  getAllBanners
);

router.get("/bookings/:status", getAllBookingsAdmin);

router.get("/property-bookings/:propertyId", validateAdminToken, getBookingsByPropertyId);

router.get("/service-bookings/:serviceId", validateAdminToken, getBookingsByServiceId);

router.get("/bookingDetail/:bookingId", validateAdminToken, getBookingDetails);

router.post("/platform-fee", validateAdminToken, upsertPlatformFee);

router.post("/tax", validateAdminToken, upsertTax);

router.get("/platform-config", validateAdminToken, getPlatformConfig);

router.get("/getAllPaymentTransactions", validateAdminToken, getAllPaymentTransactions)

router.get("/getTransactionDetails/:id", validateAdminToken, getTransactionDetails)

router.get("/getAdminUpcomingBookings", validateAdminToken, getAdminUpcomingBookings)

router.get("/getAdminBookingCalendar", validateAdminToken, getAdminBookingCalendar)

router.get("/getAdminServiceBookingCalendar", validateAdminToken, getAdminServiceBookingCalendar)

router.get("/getAllWalletTransactions", validateAdminToken, getAllWalletTransactions)

router.get("/getWithdrawRequests", validateAdminToken, getWithdrawRequests)

router.put("/updateWithdrawStatus/:id", validateAdminToken, updateWithdrawStatus)

router.get("/getAllUserBookingsAdmin/:userId", validateAdminToken, getAllUserBookingsAdmin)

router.post("/createServiceCategory", validateAdminToken, uploads.single("serviceIcon"), createServiceCategory)

router.put("/updateServiceCategory/:id", validateAdminToken, uploads.single("serviceIcon"), updateSerivceCategory)

router.patch("/toggleServiceCategoryStatus/:id", validateAdminToken, toggleServiceCategoryStatus)

router.get("/getAllServiceCategories", validateAdminToken, getAllServiceCategories)

router.get("/getAllServicesAdmin", validateAdminToken, getAllServicesAdmin);

router.get("/getSingleServiceAdmin/:id", validateAdminToken, getSingleServiceAdmin);

router.get("/getServicesByUserAdmin/:userId", validateAdminToken, getServicesByUserAdmin);

router.get("/getAllPackagesAdmin", validateAdminToken, getAllPackagesAdmin);

router.get("/getSinglePackageAdmin/:id", validateAdminToken, getSinglePackageAdmin);

router.get("/getPackagesByUserAdmin/:userId", validateAdminToken, getPackagesByUserAdmin);

router.get("/getPendingProperties", validateAdminToken, getPendingProperties);

router.put("/updatePropertyApproval/:id", validateAdminToken, updatePropertyApproval)

router.get("/getPendingServices", validateAdminToken, getPendingServices);

router.put("/updateServiceApproval/:id", validateAdminToken, updateServiceApproval);

router.post("/upsertCancellationPolicies", validateAdminToken, upsertCancellationPolicies);

router.get("/getCancellationPolicies", validateAdminToken, getCancellationPolicies);

router.post("/adminOverrideRefund/:bookingId", validateAdminToken, adminOverrideRefund);

router.get("/getCancelledBookings", validateAdminToken, getCancelledBookings)

router.get("/getReviews", validateAdminToken, getReviews);

router.patch("/softDeleteReview/:reviewId", validateAdminToken, softDeleteReview);

router.get("/getAdminDashboard", validateAdminToken, getAdminDashboard);

router.get("/getAdminPendingCounts", validateAdminToken, getAdminPendingCounts);
router.post("/markPendingCountsSeen", validateAdminToken, markPendingCountsSeen);

router.get("/getAdminReports", validateAdminToken, getAdminReports);

router.get("/exportReportPDF", validateAdminToken, exportReportPDF);

router.get("/getAdminEarningsDashboard", validateAdminToken, getAdminEarningsDashboard)

router.get("/exportEarningsCSV", validateAdminToken, exportEarningsCSV)
router.get("/exportEarningsPDF", validateAdminToken, exportEarningsPDF)

router.get("/getAdminNotifications", validateAdminToken, getAdminNotifications);

router.get("/getAllNotificationsAdmin", validateAdminToken, getAllNotificationsAdmin)

router.get("/getNotificationDetails/:id", validateAdminToken, getNotificationDetails);

router.delete("/adminDeleteNotifications", validateAdminToken, adminDeleteNotifications)

router.post("/logout", logout);

router.delete("/deleteProperty/:propertyId", validateAdminToken, softDeleteProperty);

router.delete("/deleteService/:serviceId", validateAdminToken, softDeleteService);

router.delete("/deletePendingBooking/:bookingId", validateAdminToken, deletePendingBooking)

router.patch("/toggleRecommendedProperty/:propertyId", validateAdminToken, toggleRecommendedProperty)

/* =====================================================
   Identity Verification — Admin Routes
====================================================== */

router.get("/identity/pending", validateAdminToken, getPendingVerifications);

router.get("/identity/:userId", validateAdminToken, getVerificationDetails);

router.patch("/identity/:userId/approve", validateAdminToken, approveVisitor);

router.patch("/identity/:userId/reject", validateAdminToken, rejectVisitorValidation, rejectVisitor);


module.exports = router;
