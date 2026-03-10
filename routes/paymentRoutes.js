const app = require("express");
const paymentController = require('../controller/paymentController');
const bookingController = require('../controller/bookingController');
const validateToken = require("../middleware/validateTokenHandler");

const router = app.Router();

// router.post("/webhook", express.raw({ type: 'application/json' }), paymentWebHook);

router.post("/booking/check-availability", validateToken, bookingController.checkAvailability)

router.post("/booking/create", validateToken, bookingController.createBooking);

router.get("/booking/status/:orderId", validateToken, bookingController.getBookingStatus);

router.get("/booking/my", validateToken, bookingController.getUserBookings);

router.post("/booking/cancel/:bookingId", validateToken, bookingController.cancelBooking);

router.post("/payment/webhook", validateToken, paymentController.paymentWebhook);

module.exports = router;
