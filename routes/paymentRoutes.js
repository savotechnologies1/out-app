const app = require("express");
const {
    paymentWebHook
} = require("../controller/paymentController");
const validateToken = require("../middleware/validateTokenHandler");

const router = app.Router();

router.post("/webhook", express.raw({ type: 'application/json' }), paymentWebHook);
