const app = require("express");
const {
  serviceLogin,
  serviceSignUp,
  serviceVerifyOTP,
  getServiceUser,
  addProperties,
  getAllCategories,
  getAllAmenties,
  getAllFeatures,
  getPropertyById,
  getAllRestRoomFeatures,
  getProperties,
  logout,
  deleteServices,
  deleteProperties,
  editProperties,
  propertyDetail,
  editServiceUser,
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
} = require("../controller/serviceController");
const { uploads } = require("../functions/upload");
const validateServiceToken = require("../middleware/validateSericeToken");
const {
  loginBody,
  userSignUpBody,
  verifyOtp,
} = require("../validations/validator");
const { getCancellationPolicies } = require("../controller/adminController");
const { cancelBooking } = require("../controller/bookingController");
const { getNotifications, getSingleNotification, markAsRead, deleteNotification, markAllAsRead, deleteAllNotifications } = require("../controller/notificationController");

const router = app.Router();

router.post("/login", loginBody, serviceLogin);
router.post(
  "/sign-up",
  uploads.fields([{ name: "userProfile" }, { name: "docs" }]),
  userSignUpBody,
  serviceSignUp
);
router.patch("/verify-otp/:id", verifyOtp, serviceVerifyOTP);
router.get("/get-user", validateServiceToken, getServiceUser);
router.post(
  "/edit-user",
  validateServiceToken,
  uploads.fields([{ name: "userProfile" }]),
  editServiceUser
);
router.post("/logout", logout);
router.post(
  "/add-properties",
  validateServiceToken,
  uploads.fields([
    { name: "mainImage" },
    { name: "bedroom" },
    { name: "pool" },
    { name: "bathroom" },
    { name: "document" },
  ]),
  addProperties
);

router.get("/get-properties", validateServiceToken, getProperties);
router.get("/get-property/:id", validateServiceToken, getPropertyById);
router.get("/get-categories", validateServiceToken, getAllCategories);
router.get("/get-amenities", validateServiceToken, getAllAmenties);
router.get("/get-features", validateServiceToken, getAllFeatures);
router.get(
  "/get-restroom-features",
  validateServiceToken,
  getAllRestRoomFeatures
);

router.put("/delete-service-user/:id", validateServiceToken, deleteServices);
router.patch("/delete-property/:id", validateServiceToken, deleteProperties);
router.get("/get-property-detail/:id", validateServiceToken, propertyDetail);
router.put(
  "/edit-property/:id",
  uploads.fields([
    { name: "mainImage" },
    { name: "bedroom" },
    { name: "pool" },
    { name: "bathroom" },
    { name: "document" },
  ]),
  editProperties
);

router.get("/getIncompleteProperty", validateServiceToken, getIncompleteProperty)

router.get("/bookings/upcoming", validateServiceToken, getUpcomingBookings);

router.get("/bookings/history", validateServiceToken, getBookingHistory);

router.get("/bookings/calendar", validateServiceToken, getBookingCalendar);

router.post("/bank-details", validateServiceToken, addBankDetails);

router.get("/bank-details", validateServiceToken, getAllBanks);

router.get("/bank-details/:id", validateServiceToken, getBankById);

router.patch("/bank-details/:id", validateServiceToken, updateBankDetails);

router.delete("/bank-details/:id", validateServiceToken, deleteBankDetails);

router.patch("/bank-details/:id/set-primary", validateServiceToken, setPrimaryBank);

router.get("/getWallet", validateServiceToken, getWallet);

router.get("/getWalletTransactions", validateServiceToken, getWalletTransactions)

router.post("/createWithdrawRequest", validateServiceToken, createWithdrawRequest)

router.get("/getWithdrawHistory", validateServiceToken, getWithdrawHistory)

router.get("/getServiceUserBookingDetail/:bookingId", validateServiceToken, getServiceUserBookingDetail)

router.get("/getActiveServiceCategories", validateServiceToken, getActiveServiceCategories)

router.post(
  "/createService",
  validateServiceToken,
  uploads.fields([
    { name: "serviceMedia", maxCount:5 },
    { name: "document" },
  ]),
  createService
);

router.get("/getMyServices", validateServiceToken, getMyServices);

router.get("/getSingleService/:id", validateServiceToken, getSingleService)

router.put(
  "/updateService/:id",
  validateServiceToken,
   uploads.fields([
    { name: "serviceMedia", maxCount:5 },
    { name: "document" },
  ]),
  updateService
);

router.delete("/deleteService/:id", validateServiceToken, deleteService);

router.patch("/toggleServiceStatus/:id", validateServiceToken, toggleServiceStatus);

router.post("/createPackage", validateServiceToken, createPackage)

router.get("/getAllPackages", validateServiceToken, getAllPackages)

router.get("/getSinglePackage/:id", validateServiceToken, getSinglePackage)

router.patch("/togglePackageStatus/:id", validateServiceToken, togglePackageStatus)

router.put("/updatePackage/:id", validateServiceToken, updatePackage);

router.delete("/deletePackage/:id", validateServiceToken, deletePackage);

router.get("/getCancellationPolicies", validateServiceToken, getCancellationPolicies);

router.get("/getAllservicesForUser/:userId", validateServiceToken, getAllservicesForUser);


router.post(
  "/createServiceUserReview",
  validateServiceToken,
  uploads.array("reviewImg", 5),
  createServiceUserReview
);

router.get("/getMyReviews",validateServiceToken, getMyReviews);

router.get("/getServiceProviderDashboard",validateServiceToken, getServiceProviderDashboard);

router.get("/getAllNotifications", validateServiceToken, getNotifications);

router.get("/getSingleNotification/:id",validateServiceToken, getSingleNotification);

router.patch("/markAsRead/:id", validateServiceToken, markAsRead);

router.delete("/deleteNotification/:id", validateServiceToken, deleteNotification);

router.patch("/markAllAsRead", validateServiceToken, markAllAsRead);

router.delete("/deleteAllNotifications", validateServiceToken, deleteAllNotifications);

router.get("/getAllCommissionsForServiceUser",  getAllCommissionsForServiceUser);

router.post("/userLoginByServiceProviderToken", validateServiceToken, userLoginByServiceProviderToken)
module.exports = router;
