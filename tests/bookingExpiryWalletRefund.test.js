// Polyfill deprecated/removed util methods for Node 24+
const util = require("util");
if (typeof util.isDate !== "function") {
  util.isDate = (object) => Object.prototype.toString.call(object) === "[object Date]";
}
if (typeof util.isArray !== "function") {
  util.isArray = Array.isArray;
}
if (typeof util.isRegExp !== "function") {
  util.isRegExp = (object) => Object.prototype.toString.call(object) === "[object RegExp]";
}
if (typeof util.isError !== "function") {
  util.isError = (object) => Object.prototype.toString.call(object) === "[object Error]" || object instanceof Error;
}

const assert = require("assert");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");
const UserWallet = require("../models/UserWallet");
const UserWalletTransaction = require("../models/UserWalletTransaction");
const { autoCancelExpiredBookings } = require("../services/bookingExpiryService");
const { updateBookingApprovalStatus } = require("../controller/bookingController");

require("dotenv").config();

function mockReqRes(reqData = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ...reqData,
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    send(data) {
      responseData = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getResponseData() {
      return responseData;
    },
  };

  return { req, res };
}

async function runTests() {
  console.log("==================================================");
  console.log("🧪 RUNNING BOOKING EXPIRY & REJECTION WALLET REFUND TESTS");
  console.log("==================================================");

  const mongoUri = process.env.CONNECTION_STRING || "mongodb://localhost:27017/out-app";
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  }

  const testUserId = new mongoose.Types.ObjectId();
  const testHostId = new mongoose.Types.ObjectId();
  const testPropertyId = new mongoose.Types.ObjectId();

  try {
    // Cleanup prior data
    await User.deleteMany({ _id: testUserId });
    await UserWallet.deleteMany({ user: testUserId });
    await UserWalletTransaction.deleteMany({ user: testUserId });
    await Booking.deleteMany({ user: testUserId });

    await User.create({
      _id: testUserId,
      firstName: "Expiry",
      lastName: "Tester",
      phone: "+966588888882",
      email: "expirytester@example.com",
      role: "user",
      isActive: true,
      identityVerificationStatus: "VERIFIED",
    });

    // -------------------------------------------------------------------------
    // TEST 1: autoCancelExpiredBookings refunds MIXED payment (Wallet + Online)
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 1: autoCancelExpiredBookings with MIXED payment (Wallet + Online)");
    {
      // User wallet starts at 0 balance
      const wallet = await UserWallet.create({
        user: testUserId,
        balance: 0,
        currency: "SAR",
        isActive: true,
      });

      // Expired pending booking: 100 SAR total, 40 SAR wallet, 60 SAR online
      const pastDeadline = new Date(Date.now() - 3600000); // 1 hour ago
      const expiredBooking = await Booking.create({
        bookingType: "PROPERTY",
        user: testUserId,
        property: testPropertyId,
        orderId: "EXP_ORD_MIXED_1",
        totalAmount: 100,
        walletAmountApplied: 40,
        onlinePayableAmount: 60,
        paymentMethod: "MIXED",
        paymentStatus: "paid",
        bookingStatus: "pending",
        pendingReason: "approval_pending",
        isCancelled: false,
        walletRefunded: false,
        acceptanceDeadline: pastDeadline,
        checkIn: new Date(Date.now() + 86400000),
        checkOut: new Date(Date.now() + 172800000),
      });

      // Run autoCancelExpiredBookings
      await autoCancelExpiredBookings();

      // Verify booking status
      const updatedBooking = await Booking.findById(expiredBooking._id);
      assert.strictEqual(updatedBooking.bookingStatus, "cancelled");
      assert.strictEqual(updatedBooking.isCancelled, true);
      assert.strictEqual(updatedBooking.pendingReason, "expired");
      assert.strictEqual(updatedBooking.cancellationReason, "PROVIDER_ACCEPTANCE_TIMEOUT");
      assert.strictEqual(updatedBooking.walletRefunded, true, "Booking walletRefunded must be true");

      // Verify UserWallet was credited back 40 SAR
      const updatedWallet = await UserWallet.findById(wallet._id);
      assert.strictEqual(updatedWallet.balance, 40, "Wallet balance should be refunded 40 SAR");

      // Verify UserWalletTransaction was created
      const refundTx = await UserWalletTransaction.findOne({
        user: testUserId,
        type: "credit",
        transactionType: "refund",
      });
      assert.ok(refundTx, "UserWalletTransaction credit/refund must exist");
      assert.strictEqual(refundTx.amount, 40);
      assert.strictEqual(refundTx.balanceAfter, 40);

      console.log("✔ autoCancelExpiredBookings: 40 SAR wallet amount successfully refunded!");
    }

    // -------------------------------------------------------------------------
    // TEST 2: autoCancelExpiredBookings refunds 100% WALLET payment
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 2: autoCancelExpiredBookings with 100% WALLET payment");
    {
      const pastDeadline = new Date(Date.now() - 7200000); // 2 hours ago
      const fullWalletBooking = await Booking.create({
        bookingType: "PROPERTY",
        user: testUserId,
        property: testPropertyId,
        orderId: "EXP_ORD_WALLET_2",
        totalAmount: 150,
        walletAmountApplied: 150,
        onlinePayableAmount: 0,
        paymentMethod: "WALLET",
        paymentStatus: "paid",
        bookingStatus: "pending",
        pendingReason: "approval_pending",
        isCancelled: false,
        walletRefunded: false,
        acceptanceDeadline: pastDeadline,
        checkIn: new Date(Date.now() + 86400000),
        checkOut: new Date(Date.now() + 172800000),
      });

      // Run autoCancelExpiredBookings
      await autoCancelExpiredBookings();

      const updatedBooking = await Booking.findById(fullWalletBooking._id);
      assert.strictEqual(updatedBooking.bookingStatus, "cancelled");
      assert.strictEqual(updatedBooking.walletRefunded, true);

      // Previous balance was 40 SAR, now should be 40 + 150 = 190 SAR
      const updatedWallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(updatedWallet.balance, 190, "Wallet balance should now be 190 SAR");

      const refundTx = await UserWalletTransaction.findOne({
        user: testUserId,
        amount: 150,
        type: "credit",
      });
      assert.ok(refundTx, "150 SAR refund transaction must exist");

      console.log("✔ autoCancelExpiredBookings: 150 SAR full wallet payment successfully refunded!");
    }

    // -------------------------------------------------------------------------
    // TEST 3: updateBookingApprovalStatus rejects booking -> UserWallet refunded
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 3: updateBookingApprovalStatus (provider manual reject) -> UserWallet refunded");
    {
      const rejectBooking = await Booking.create({
        bookingType: "PROPERTY",
        user: testUserId,
        property: testPropertyId,
        orderId: "REJ_ORD_3",
        totalAmount: 200,
        walletAmountApplied: 75,
        onlinePayableAmount: 125,
        paymentMethod: "MIXED",
        paymentStatus: "paid",
        bookingStatus: "pending",
        pendingReason: "approval_pending",
        isCancelled: false,
        walletRefunded: false,
        acceptanceDeadline: new Date(Date.now() + 86400000), // future deadline
        providerBreakdown: [
          { user: testHostId, amount: 200, type: "property" }
        ],
        checkIn: new Date(Date.now() + 86400000),
        checkOut: new Date(Date.now() + 172800000),
      });

      const { req, res } = mockReqRes({
        user: { _id: testHostId },
        params: {
          bookingId: rejectBooking._id.toString(),
        },
        body: {
          status: "cancelled",
          reason: "Host unavailable",
        },
      });

      await updateBookingApprovalStatus(req, res);
      assert.strictEqual(res.getStatusCode(), 200);

      const updatedBooking = await Booking.findById(rejectBooking._id);
      assert.strictEqual(updatedBooking.bookingStatus, "cancelled");
      assert.strictEqual(updatedBooking.walletRefunded, true);

      // Previous balance was 190 SAR, now should be 190 + 75 = 265 SAR
      const updatedWallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(updatedWallet.balance, 265, "Wallet balance should be 265 SAR");

      const refundTx = await UserWalletTransaction.findOne({
        user: testUserId,
        amount: 75,
        type: "credit",
      });
      assert.ok(refundTx, "75 SAR refund transaction must exist for rejected booking");

      console.log("✔ updateBookingApprovalStatus: 75 SAR wallet amount refunded upon provider rejection!");
    }

    console.log("\n==================================================");
    console.log("🎉 ALL EXPIRY & REJECTION WALLET REFUND TESTS PASSED!");
    console.log("==================================================");
  } finally {
    // Cleanup
    await User.deleteMany({ _id: testUserId });
    await UserWallet.deleteMany({ user: testUserId });
    await UserWalletTransaction.deleteMany({ user: testUserId });
    await Booking.deleteMany({ user: testUserId });
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
