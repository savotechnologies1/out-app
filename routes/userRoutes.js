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
  getNewlyDashboard,
  getNewlyVilla,
  getNewlyResorts,
  getUserBanners
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

router.get('/get-newly-apartments', validateToken, getNewlyDashboard);

router.get('/get-newly-villa', validateToken, getNewlyVilla);

router.get('/get-newly-resorts', validateToken, getNewlyResorts);

router.get('/getBanner', validateToken, getUserBanners);

module.exports = router;
