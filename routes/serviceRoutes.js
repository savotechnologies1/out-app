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
  getBookingCalendar
} = require("../controller/serviceController");
const { uploads } = require("../functions/upload");
const validateServiceToken = require("../middleware/validateSericeToken");
const {
  loginBody,
  userSignUpBody,
  verifyOtp,
} = require("../validations/validator");

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
  ]),
  editProperties
);

router.get("/getIncompleteProperty", validateServiceToken, getIncompleteProperty)

router.get("/bookings/upcoming", validateServiceToken, getUpcomingBookings);

router.get("/bookings/history", validateServiceToken, getBookingHistory);

router.get("/bookings/calendar", validateServiceToken, getBookingCalendar);

module.exports = router;
