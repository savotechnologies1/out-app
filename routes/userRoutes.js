const app = require("express");
const {
  userLogin,
  userSignUp,
  userVerifyOTP,
  getUser,
  resendOTP,
  updateProfile,
  logout,
  getCategory,
  addBooking,
  addBookMark,
  listBookMark,
  deleteBookmark,
  testAuthentica,
  getPropertiesByCategory,
  getHomeProperties,
  getAllProperties,
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
  getUserFavorites,
  googleLogin,
  createUserReview,
  getReviews,
  getServiceUser,
  serviceUserLoginByUserToken,
  getServicesByCategory,
  getRecentlyViewedProperties,
  getTopRatedProperties,
  getRecommendedProperties,
  getNearYouProperties,
  deleteAccount
} = require("../controller/userController");
const validateToken = require("../middleware/validateTokenHandler");
const {
  loginBody,
  userSignUpBody,
  verifyOtp,
  otpValidation,
} = require("../validations/validator");
const { uploads } = require("../functions/upload");
const { getAllCategories } = require("../controller/serviceController");
const { cancelBooking } = require("../controller/bookingController");
const { getNotifications, getSingleNotification, markAsRead, deleteNotification, markAllAsRead, deleteAllNotifications } = require("../controller/notificationController");

const router = app.Router();

router.post("/login", loginBody, userLogin);
router.post("/signup", userSignUpBody, userSignUp);
router.patch("/verify-otp/:id", verifyOtp, userVerifyOTP);
router.get("/get-user", validateToken, getUser);
router.post("/resend-otp", otpValidation, resendOTP);
router.get("/get-category/:id", validateToken, getCategory);
router.post(
  "/update-profile",
  validateToken,
  uploads.fields([{ name: "userProfile" }]),
  updateProfile
);
router.post("/logout", logout);
router.post("/add-booking", validateToken, addBooking);
router.post("/add-bookmark/:id", validateToken, addBookMark);
router.get("/list-bookmark", validateToken, listBookMark);
router.put("/delete-bookmark/:id", validateToken, deleteBookmark);
router.get("/get-categories", validateToken, getAllCategories);
router.get("/get-properties", validateToken, getAllProperties);

router.post('/test-authentica', testAuthentica);

router.get("/getPropertiesByCategory/:category", validateToken, getPropertiesByCategory);

router.get("/getHomeProperties", validateToken, getHomeProperties)

router.post('/create-payment', validateToken, createPayment);

router.get('/getDashboard', validateToken, getDashboard);

router.get('/getBanner', validateToken, getUserBanners);

router.get('/get-properties-detail/:id', validateToken, getPropertyDetail);

router.post('/create-token', validateToken, createToken);

router.post('/create-payment', createPayment);

router.post('/create-booking', validateToken, createBooking);

router.get("/getAvailableCoupons", validateToken, getAvailableCoupons)

router.get("/getPlatformCharges", validateToken, getPlatformCharges)

router.post("/search", validateToken, search)

router.get("/getLatestServices", validateToken, getLatestServices)

router.get("/getServicesByCategory/:categoryId", validateToken, getServicesByCategory)

router.get("/getServiceDetail/:serviceId", validateToken, getServiceDetail)

router.post("/toggleFavorite", validateToken, toggleFavorite);

router.get("/getUserFavorites", validateToken, getUserFavorites);

router.post("/cancelBooking/:bookingId", validateToken, cancelBooking);

router.post("/googleLogin", googleLogin);

router.post(
  "/createUserReview",
  validateToken,
  uploads.array("reviewImg", 5),
  createUserReview
);

router.get("/getReviews", validateToken, getReviews);

router.get("/getAllNotifications", validateToken, getNotifications);

router.get("/getSingleNotification/:id", validateToken, getSingleNotification);

router.patch("/markAsRead/:id", validateToken, markAsRead);

router.delete("/deleteNotification/:id", validateToken, deleteNotification);

router.patch("/markAllAsRead", validateToken, markAllAsRead);

router.delete("/deleteAllNotifications", validateToken, deleteAllNotifications);

router.get("/getServiceUser/:userId", validateToken, getServiceUser);

router.post("/serviceUserLoginByUserToken", validateToken, serviceUserLoginByUserToken);

router.get("/getRecentlyViewedProperties", validateToken, getRecentlyViewedProperties);

router.get("/getTopRatedProperties", validateToken, getTopRatedProperties);

router.get("/getRecommendedProperties", validateToken, getRecommendedProperties);

router.get("/getNearYouProperties", validateToken, getNearYouProperties);

router.delete("/deleteAccount", validateToken, deleteAccount)

module.exports = router;
