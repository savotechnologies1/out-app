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
const Wallet = require("../models/Wallet");
const { adminOverrideRefund } = require("../controller/bookingController");

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
  console.log("🧪 RUNNING ADMIN OVERRIDE REFUND TEST SUITE");
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
      firstName: "AdminRefund",
      lastName: "User",
      phone: "+966577777773",
      email: "adminrefund@example.com",
      role: "user",
      isActive: true,
      identityVerificationStatus: "VERIFIED",
    });

    // -------------------------------------------------------------------------
    // TEST 1: adminOverrideRefund on 100% WALLET payment booking
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 1: adminOverrideRefund on 100% WALLET payment booking");
    {
      const wallet = await UserWallet.create({
        user: testUserId,
        balance: 10,
        currency: "SAR",
        isActive: true,
      });

      const fullWalletBooking = await Booking.create({
        bookingType: "PROPERTY",
        user: testUserId,
        property: testPropertyId,
        orderId: "ADMIN_REF_WALLET_1",
        totalAmount: 200,
        walletAmountApplied: 200,
        onlinePayableAmount: 0,
        paymentMethod: "WALLET",
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        isCancelled: false,
        walletRefunded: false,
        checkIn: new Date(Date.now() + 86400000),
        checkOut: new Date(Date.now() + 172800000),
        providerBreakdown: [
          { user: testHostId, amount: 200, type: "property" }
        ],
      });

      const { req, res } = mockReqRes({
        params: { bookingId: fullWalletBooking._id.toString() },
        body: {
          refundAmount: 200,
          reason: "Customer dissatisfaction approved by admin",
        },
      });

      await adminOverrideRefund(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const data = res.getResponseData();
      assert.strictEqual(data.refundAmount, 200);
      assert.strictEqual(data.walletRefundAmount, 200);
      assert.strictEqual(data.onlineRefundAmount, 0);

      // Verify booking status
      const updatedBooking = await Booking.findById(fullWalletBooking._id);
      assert.strictEqual(updatedBooking.bookingStatus, "cancelled");
      assert.strictEqual(updatedBooking.isCancelled, true);
      assert.strictEqual(updatedBooking.walletRefunded, true);
      assert.strictEqual(updatedBooking.refundAmount, 200);
      assert.ok(updatedBooking.refundTransactionId.startsWith("WALLET_REFUND_"));

      // Verify wallet was refunded 200 SAR (10 + 200 = 210)
      const updatedWallet = await UserWallet.findById(wallet._id);
      assert.strictEqual(updatedWallet.balance, 210);

      // Verify UserWalletTransaction
      const tx = await UserWalletTransaction.findOne({
        user: testUserId,
        type: "credit",
        transactionType: "refund",
      });
      assert.ok(tx);
      assert.strictEqual(tx.amount, 200);

      console.log("✔ TEST 1: Full 200 SAR wallet payment successfully refunded to UserWallet!");
    }

    // -------------------------------------------------------------------------
    // TEST 2: adminOverrideRefund on MIXED booking (Full refund)
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 2: adminOverrideRefund on MIXED payment (Full refund: 100 SAR wallet + online)");
    {
      const mixedBooking = await Booking.create({
        bookingType: "PROPERTY",
        user: testUserId,
        property: testPropertyId,
        orderId: "ADMIN_REF_MIXED_2",
        totalAmount: 300,
        walletAmountApplied: 100,
        onlinePayableAmount: 200,
        paymentMethod: "MIXED",
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        isCancelled: false,
        walletRefunded: false,
        checkIn: new Date(Date.now() + 86400000),
        checkOut: new Date(Date.now() + 172800000),
        providerBreakdown: [
          { user: testHostId, amount: 300, type: "property" }
        ],
      });

      const { req, res } = mockReqRes({
        params: { bookingId: mixedBooking._id.toString() },
        body: {
          refundAmount: 300,
          reason: "Emergency cancellation approved",
        },
      });

      await adminOverrideRefund(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const data = res.getResponseData();
      assert.strictEqual(data.refundAmount, 300);
      assert.strictEqual(data.walletRefundAmount, 100);
      assert.strictEqual(data.onlineRefundAmount, 200);

      // Verify wallet was refunded 100 SAR (210 + 100 = 310)
      const updatedWallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(updatedWallet.balance, 310);

      const tx = await UserWalletTransaction.findOne({
        user: testUserId,
        amount: 100,
        type: "credit",
      });
      assert.ok(tx);

      console.log("✔ TEST 2: Mixed payment correctly split: 100 SAR to wallet, 200 SAR to online gateway!");
    }

    // -------------------------------------------------------------------------
    // TEST 3: adminOverrideRefund on MIXED booking (Partial refund: 150 SAR of 300 SAR)
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 3: adminOverrideRefund on MIXED payment (Partial 50% refund: 150 SAR of 300 SAR)");
    {
      const mixedBookingPartial = await Booking.create({
        bookingType: "PROPERTY",
        user: testUserId,
        property: testPropertyId,
        orderId: "ADMIN_REF_PARTIAL_3",
        totalAmount: 300,
        walletAmountApplied: 100,
        onlinePayableAmount: 200,
        paymentMethod: "MIXED",
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        isCancelled: false,
        walletRefunded: false,
        checkIn: new Date(Date.now() + 86400000),
        checkOut: new Date(Date.now() + 172800000),
        providerBreakdown: [
          { user: testHostId, amount: 300, type: "property" }
        ],
      });

      const { req, res } = mockReqRes({
        params: { bookingId: mixedBookingPartial._id.toString() },
        body: {
          refundAmount: 150,
          reason: "Partial refund agreed",
        },
      });

      await adminOverrideRefund(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const data = res.getResponseData();
      assert.strictEqual(data.refundAmount, 150);
      // Proportional: wallet (100/300)*150 = 50 SAR, online (200/300)*150 = 100 SAR
      assert.strictEqual(data.walletRefundAmount, 50);
      assert.strictEqual(data.onlineRefundAmount, 100);

      // Verify wallet was refunded 50 SAR (310 + 50 = 360)
      const updatedWallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(updatedWallet.balance, 360);

      const tx = await UserWalletTransaction.findOne({
        user: testUserId,
        amount: 50,
        type: "credit",
      });
      assert.ok(tx);

      console.log("✔ TEST 3: Partial refund proportionally split: 50 SAR to wallet, 100 SAR to online gateway!");
    }

    console.log("\n==================================================");
    console.log("🎉 ALL ADMIN OVERRIDE REFUND TESTS PASSED!");
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
