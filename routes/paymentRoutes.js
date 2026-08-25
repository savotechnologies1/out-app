const app = require("express");
const paymentController = require('../controller/paymentController');
const bookingController = require('../controller/bookingController');
const validateToken = require("../middleware/validateTokenHandler");
const validateServiceToken = require("../middleware/validateSericeToken");

const router = app.Router();

// router.post("/webhook", express.raw({ type: 'application/json' }), paymentWebHook);

router.post("/booking/check-availability", validateToken, bookingController.checkAvailability)

router.get("/service/:serviceId/availability", validateToken, bookingController.getServiceAvailability);

router.post("/booking/create", validateToken, bookingController.createBooking);

router.get("/booking/status/:orderId", validateToken, bookingController.getBookingStatus);

router.get("/booking/my", validateToken, bookingController.getUserBookings);

router.get("/booking/getDetail/:bookingId", validateToken, bookingController.getBookingDetail);

router.get("/user/getUserUpcomingBookings", validateToken, bookingController.getUserUpcomingBookings);

router.post("/booking/cancel/:bookingId", validateToken, bookingController.cancelBooking);

router.post("/payment/webhook", validateToken, paymentController.paymentWebhook);

router.get("/booking/getPendingBookingRequests", validateServiceToken, bookingController.getPendingBookingRequests)

router.patch("/booking/updateBookingApprovalStatus/:bookingId", validateServiceToken, bookingController.updateBookingApprovalStatus)

module.exports = router;
