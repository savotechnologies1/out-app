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
  test,
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
  getUserFavorites
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
router.get("/test", test);
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

router.get("/getServiceDetail/:serviceId", validateToken, getServiceDetail)

router.post("/toggleFavorite",validateToken, toggleFavorite);

router.get("/getUserFavorites", validateToken, getUserFavorites);

router.post("/cancelBooking/:bookingId",validateToken, cancelBooking)

module.exports = router;
