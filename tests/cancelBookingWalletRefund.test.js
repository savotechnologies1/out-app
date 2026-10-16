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
const axios = require("axios");
const Booking = require("../models/Booking");
const User = require("../models/User");
const UserWallet = require("../models/UserWallet");
const UserWalletTransaction = require("../models/UserWalletTransaction");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const { cancelBooking } = require("../controller/bookingController");

require("dotenv").config();

// Mock axios methods for TAP calls
const originalPost = axios.post;
const originalGet = axios.get;

axios.get = async function (url, config) {
  if (url.includes("api.tap.company/v2/charges/")) {
    return {
      data: {
        id: url.split("/").pop(),
        amount: 500,
        amount_refunded: 0,
        currency: "SAR",
        status: "CAPTURED",
      },
    };
  }
  return originalGet.apply(this, arguments);
};

axios.post = async function (url, data, config) {
  if (url.includes("api.tap.company/v2/refunds")) {
    return {
      data: {
        id: "re_mock_tap_" + Date.now(),
        charge_id: data.charge_id,
        amount: data.amount,
        currency: data.currency || "SAR",
        status: "CAPTURED",
      },
    };
  }
  return originalPost.apply(this, arguments);
};

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
  console.log("🧪 RUNNING CANCEL BOOKING WALLET REFUND TEST SUITE");
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
    await User.deleteMany({ _id: { $in: [testUserId, testHostId] } });
    await UserWallet.deleteMany({ user: testUserId });
    await UserWalletTransaction.deleteMany({ user: testUserId });
    await Wallet.deleteMany({ user: testHostId });
    await WalletTransaction.deleteMany({ user: testHostId });
    await Booking.deleteMany({ user: testUserId });

    // Create user and host
    await User.create({
      _id: testUserId,
      firstName: "CancelUser",
      lastName: "Tester",
      email: `canceluser_${Date.now()}@example.com`,
      phone: "+966500000099",
      role: "User",
    });

    await User.create({
      _id: testHostId,
      firstName: "HostUser",
      lastName: "Tester",
      email: `hostuser_${Date.now()}@example.com`,
      phone: "+966500000088",
      role: "ServiceUser",
    });

    // Create host provider wallet with holdBalance
    const hostWallet = await Wallet.create({
      user: testHostId,
      balance: 1000,
      holdBalance: 500,
      currency: "SAR",
    });

    // -----------------------------------------------------------------
    // TEST 1: Pending booking cancellation with 100% Wallet payment
    // -----------------------------------------------------------------
    console.log("\n--- TEST 1: Pending Booking Cancelled (100% Wallet Payment) ---");
    {
      const initialWallet = await UserWallet.create({
        user: testUserId,
        balance: 50,
        currency: "SAR",
        isActive: true,
      });

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const booking = await Booking.create({
        orderId: `ORD_PEND_W_${Date.now()}`,
        bookingType: "PROPERTY",
        property: testPropertyId,
        user: testUserId,
        checkIn: futureDate,
        checkOut: new Date(futureDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        totalAmount: 150,
        paymentStatus: "paid",
        paymentMethod: "WALLET",
        walletAmountApplied: 150,
        onlinePayableAmount: 0,
        bookingStatus: "pending",
        pendingReason: "approval_pending",
        providerBreakdown: [{
          user: testHostId,
          amount: 135,
          type: "property",
        }],
      });

      const { req, res } = mockReqRes({
        params: { bookingId: booking._id.toString() },
        body: { reason: "OWNER_TAKING_TOO_LONG" },
      });

      await cancelBooking(req, res);
      const resData = res.getResponseData();

      assert.strictEqual(res.getStatusCode(), 200, "Should return HTTP 200");
      assert.strictEqual(resData.success, true, "Should return success true");
      assert.strictEqual(resData.refundAmount, 150, "Refund amount should be 150");
      assert.strictEqual(resData.walletRefundAmount, 150, "Wallet refund amount should be 150");
      assert.strictEqual(resData.onlineRefundAmount, 0, "Online refund amount should be 0");

      const updatedWallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(updatedWallet.balance, 200, "User wallet should be 50 + 150 = 200");

      const updatedBooking = await Booking.findById(booking._id);
      assert.strictEqual(updatedBooking.isCancelled, true, "Booking should be marked cancelled");
      assert.strictEqual(updatedBooking.walletRefunded, true, "walletRefunded should be true");
      assert.ok(updatedBooking.refundTransactionId.startsWith("WALLET_REFUND_"), "Should have WALLET_REFUND_ ID");

      console.log("✅ Test 1 Passed: 100% wallet pending booking fully refunded to UserWallet");
    }

    // -----------------------------------------------------------------
    // TEST 2: Pending booking cancellation with Mixed payment (Wallet + Online)
    // -----------------------------------------------------------------
    console.log("\n--- TEST 2: Pending Booking Cancelled (Mixed Payment) ---");
    {
      const currentWallet = await UserWallet.findOne({ user: testUserId });
      const balanceBefore = currentWallet.balance; // 200

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const booking = await Booking.create({
        orderId: `ORD_PEND_MIX_${Date.now()}`,
        bookingType: "PROPERTY",
        property: testPropertyId,
        user: testUserId,
        checkIn: futureDate,
        checkOut: new Date(futureDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        totalAmount: 300,
        paymentStatus: "paid",
        paymentMethod: "MIXED",
        walletAmountApplied: 100,
        onlinePayableAmount: 200,
        tapChargeId: "chg_mock_pending_cancel_123",
        bookingStatus: "pending",
        pendingReason: "approval_pending",
        providerBreakdown: [{
          user: testHostId,
          amount: 270,
          type: "property",
        }],
      });

      const { req, res } = mockReqRes({
        params: { bookingId: booking._id.toString() },
        body: { reason: "CHANGED_MY_MIND" },
      });

      await cancelBooking(req, res);
      const resData = res.getResponseData();

      assert.strictEqual(res.getStatusCode(), 200, "Should return HTTP 200");
      assert.strictEqual(resData.success, true, "Should return success true");
      assert.strictEqual(resData.refundAmount, 300, "Total refund should be 300");
      assert.strictEqual(resData.walletRefundAmount, 100, "Wallet portion should be 100");
      assert.strictEqual(resData.onlineRefundAmount, 200, "Online portion should be 200");

      const updatedWallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(updatedWallet.balance, Number((balanceBefore + 100).toFixed(2)), "User wallet should receive 100");

      const updatedBooking = await Booking.findById(booking._id);
      assert.strictEqual(updatedBooking.isCancelled, true, "Booking should be cancelled");
      assert.strictEqual(updatedBooking.walletRefunded, true, "walletRefunded should be true");

      console.log("✅ Test 2 Passed: Mixed pending booking split refund between UserWallet (100) and Tap (200)");
    }

    // -----------------------------------------------------------------
    // TEST 3: Confirmed booking cancellation with Flexible Policy (100% refund, Mixed payment)
    // -----------------------------------------------------------------
    console.log("\n--- TEST 3: Confirmed Booking Cancelled (Policy 100% Refund, Mixed Payment) ---");
    {
      const currentWallet = await UserWallet.findOne({ user: testUserId });
      const balanceBefore = currentWallet.balance;

      const checkInDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days in future
      const booking = await Booking.create({
        orderId: `ORD_CONF_FLEX_${Date.now()}`,
        bookingType: "PROPERTY",
        property: testPropertyId,
        user: testUserId,
        checkIn: checkInDate,
        checkOut: new Date(checkInDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        totalAmount: 200,
        paymentStatus: "paid",
        paymentMethod: "MIXED",
        walletAmountApplied: 80,
        onlinePayableAmount: 120,
        tapChargeId: "chg_mock_policy_flex_123",
        bookingStatus: "confirmed",
        policySnapshot: {
          rules: [
            { from: 1, unit: "days", refundPercentage: 100 },
            { from: 0, unit: "days", refundPercentage: 0 },
          ],
        },
        providerBreakdown: [{
          user: testHostId,
          amount: 180,
          type: "property",
        }],
      });

      const { req, res } = mockReqRes({
        params: { bookingId: booking._id.toString() },
        body: { reason: "CHANGED_MY_MIND" },
      });

      await cancelBooking(req, res);
      const resData = res.getResponseData();

      assert.strictEqual(res.getStatusCode(), 200, "Should return HTTP 200");
      assert.strictEqual(resData.success, true, "Should return success true");
      assert.strictEqual(resData.refundAmount, 200, "Refund amount should be 200 (100%)");
      assert.strictEqual(resData.walletRefundAmount, 80, "Wallet refund should be 80");
      assert.strictEqual(resData.onlineRefundAmount, 120, "Online refund should be 120");

      const updatedWallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(updatedWallet.balance, Number((balanceBefore + 80).toFixed(2)), "User wallet should receive 80");

      const updatedBooking = await Booking.findById(booking._id);
      assert.strictEqual(updatedBooking.isCancelled, true, "Booking is cancelled");
      assert.strictEqual(updatedBooking.walletRefunded, true, "walletRefunded is true");

      console.log("✅ Test 3 Passed: Confirmed booking full policy refund accurately splits wallet (80) and online (120)");
    }

    // -----------------------------------------------------------------
    // TEST 4: Confirmed booking cancellation with Moderate Policy (50% refund, Mixed payment)
    // -----------------------------------------------------------------
    console.log("\n--- TEST 4: Confirmed Booking Cancelled (Policy 50% Refund, Mixed Payment) ---");
    {
      const currentWallet = await UserWallet.findOne({ user: testUserId });
      const balanceBefore = currentWallet.balance;

      const checkInDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days in future
      // Total = 400 SAR: Wallet = 100 SAR (25%), Online = 300 SAR (75%)
      // 50% refund = 200 SAR total:
      // Wallet portion = 200 * 25% = 50 SAR
      // Online portion = 200 - 50 = 150 SAR
      const booking = await Booking.create({
        orderId: `ORD_CONF_MOD_${Date.now()}`,
        bookingType: "PROPERTY",
        property: testPropertyId,
        user: testUserId,
        checkIn: checkInDate,
        checkOut: new Date(checkInDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        totalAmount: 400,
        paymentStatus: "paid",
        paymentMethod: "MIXED",
        walletAmountApplied: 100,
        onlinePayableAmount: 300,
        tapChargeId: "chg_mock_policy_mod_123",
        bookingStatus: "confirmed",
        policySnapshot: {
          rules: [
            { from: 5, unit: "days", refundPercentage: 100 },
            { from: 1, unit: "days", refundPercentage: 50 },
            { from: 0, unit: "days", refundPercentage: 0 },
          ],
        },
        providerBreakdown: [{
          user: testHostId,
          amount: 360,
          type: "property",
        }],
      });

      const { req, res } = mockReqRes({
        params: { bookingId: booking._id.toString() },
        body: { reason: "OTHER", customReason: "Plans changed unexpectedly" },
      });

      await cancelBooking(req, res);
      const resData = res.getResponseData();

      assert.strictEqual(res.getStatusCode(), 200, "Should return HTTP 200");
      assert.strictEqual(resData.success, true, "Should return success true");
      assert.strictEqual(resData.refundAmount, 200, "50% refund of 400 is 200");
      assert.strictEqual(resData.walletRefundAmount, 50, "Wallet portion should be 50 (25% of 200)");
      assert.strictEqual(resData.onlineRefundAmount, 150, "Online portion should be 150 (75% of 200)");

      const updatedWallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(updatedWallet.balance, Number((balanceBefore + 50).toFixed(2)), "User wallet balance should increase by 50");

      const updatedBooking = await Booking.findById(booking._id);
      assert.strictEqual(updatedBooking.isCancelled, true, "Booking is cancelled");
      assert.strictEqual(updatedBooking.walletRefunded, true, "walletRefunded is true");

      console.log("✅ Test 4 Passed: 50% partial policy refund correctly split proportionally (wallet 50, online 150)");
    }

    // -----------------------------------------------------------------
    // TEST 5: Unpaid booking cancellation with wallet amount applied
    // -----------------------------------------------------------------
    console.log("\n--- TEST 5: Unpaid Booking Cancelled with Wallet Applied ---");
    {
      const currentWallet = await UserWallet.findOne({ user: testUserId });
      const balanceBefore = currentWallet.balance;

      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const booking = await Booking.create({
        orderId: `ORD_UNPAID_${Date.now()}`,
        bookingType: "PROPERTY",
        property: testPropertyId,
        user: testUserId,
        checkIn: futureDate,
        checkOut: new Date(futureDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        totalAmount: 250,
        paymentStatus: "pending",
        pendingReason: "payment_pending",
        paymentMethod: "MIXED",
        walletAmountApplied: 75,
        onlinePayableAmount: 175,
        bookingStatus: "pending",
        walletRefunded: false,
      });

      const { req, res } = mockReqRes({
        params: { bookingId: booking._id.toString() },
        body: { reason: "CHANGED_MY_MIND" },
      });

      await cancelBooking(req, res);
      const resData = res.getResponseData();

      assert.strictEqual(res.getStatusCode(), 200, "Should return HTTP 200");
      assert.strictEqual(resData.message, "Booking cancelled (no payment)");

      const updatedWallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(updatedWallet.balance, Number((balanceBefore + 75).toFixed(2)), "User wallet should be refunded 75");

      const updatedBooking = await Booking.findById(booking._id);
      assert.strictEqual(updatedBooking.isCancelled, true, "Booking is cancelled");
      assert.strictEqual(updatedBooking.walletRefunded, true, "walletRefunded is true");

      console.log("✅ Test 5 Passed: Unpaid booking cancellation immediately refunded 75 SAR wallet amount");
    }

    // -----------------------------------------------------------------
    // TEST 6: Cancellation after start date (0 refund)
    // -----------------------------------------------------------------
    console.log("\n--- TEST 6: Cancellation After Booking Start Date ---");
    {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day in past
      const booking = await Booking.create({
        orderId: `ORD_PAST_${Date.now()}`,
        bookingType: "PROPERTY",
        property: testPropertyId,
        user: testUserId,
        checkIn: pastDate,
        checkOut: new Date(pastDate.getTime() + 3 * 24 * 60 * 60 * 1000),
        totalAmount: 200,
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        providerBreakdown: [{
          user: testHostId,
          amount: 180,
          type: "property",
        }],
      });

      const { req, res } = mockReqRes({
        params: { bookingId: booking._id.toString() },
        body: { reason: "OTHER", customReason: "Late cancellation" },
      });

      await cancelBooking(req, res);
      const resData = res.getResponseData();

      assert.strictEqual(res.getStatusCode(), 200, "Should return HTTP 200");
      assert.strictEqual(resData.success, false, "success should be false");
      assert.strictEqual(resData.refundAmount, 0, "refundAmount should be 0");

      const updatedBooking = await Booking.findById(booking._id);
      assert.strictEqual(updatedBooking.isCancelled, true, "Booking should be cancelled");
      assert.strictEqual(updatedBooking.refundAmount, 0, "refundAmount should be 0");
      assert.strictEqual(updatedBooking.providerBreakdown[0].retainedAmount, 180, "Provider should retain full amount");

      console.log("✅ Test 6 Passed: Cancellation after start date results in 0 refund and provider payout scheduled");
    }

    console.log("\n==================================================");
    console.log("🎉 ALL CANCEL BOOKING WALLET REFUND TESTS PASSED!");
    console.log("==================================================");
  } finally {
    // Cleanup
    await User.deleteMany({ _id: { $in: [testUserId, testHostId] } });
    await UserWallet.deleteMany({ user: testUserId });
    await UserWalletTransaction.deleteMany({ user: testUserId });
    await Wallet.deleteMany({ user: testHostId });
    await WalletTransaction.deleteMany({ user: testHostId });
    await Booking.deleteMany({ user: testUserId });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
