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
const User = require("../models/User");
const UserWallet = require("../models/UserWallet");
const UserWalletTransaction = require("../models/UserWalletTransaction");
const Properties = require("../models/Properties");
const Availability = require("../models/Availability");
const Booking = require("../models/Booking");
const PlatformFee = require("../models/PlatformFee");
const Tax = require("../models/Tax");
const { checkAvailability, createBooking } = require("../controller/bookingController");
const { paymentWebhook } = require("../controller/paymentController");

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
  console.log("🧪 RUNNING USER WALLET BOOKING & PAYMENT TEST SUITE");
  console.log("==================================================");

  const mongoUri = process.env.CONNECTION_STRING || "mongodb://localhost:27017/out-app";
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  }

  const testUserId = new mongoose.Types.ObjectId();
  const testHostId = new mongoose.Types.ObjectId();
  const testPropertyId = new mongoose.Types.ObjectId();

  // Cleanup before tests
  await User.deleteMany({
    $or: [
      { _id: testUserId },
      { phone: "+966599999991" }
    ]
  });
  await UserWallet.deleteMany({ user: testUserId });
  await UserWalletTransaction.deleteMany({ user: testUserId });
  await Properties.deleteMany({ _id: testPropertyId });
  await Availability.deleteMany({ hotel: testPropertyId });
  await Booking.deleteMany({ user: testUserId });

  // Setup test user (verified for booking)
  await User.create({
    _id: testUserId,
    firstName: "Wallet",
    lastName: "User",
    phone: "+966599999991",
    email: "walletuser@example.com",
    role: "user",
    isActive: true,
    tokens: ["mock_token_wallet"],
    identityVerificationStatus: "VERIFIED",
  });

  const CancellationPolicy = require("../models/CancellationPolicy");
  let policy = await CancellationPolicy.findOne({ name: "Flexible" });
  if (!policy) {
    policy = await CancellationPolicy.create({
      name: "Flexible",
      description: "Test policy",
      rules: [],
      isActive: true,
    });
  }

  // Setup property (price 100/night)
  await Properties.create({
    _id: testPropertyId,
    user: testHostId,
    name: "Wallet Test Resort",
    price: 100,
    document: "https://example.com/doc.pdf",
    cancellationPolicy: policy._id,
    isActive: true,
    isDeleted: false,
    instantBooking: true,
  });

  // Future check-in and check-out dates
  const checkInDate = new Date();
  checkInDate.setDate(checkInDate.getDate() + 10);
  const checkInStr = checkInDate.toISOString().split("T")[0];

  const checkOutDate = new Date();
  checkOutDate.setDate(checkOutDate.getDate() + 12); // 2 nights
  const checkOutStr = checkOutDate.toISOString().split("T")[0];

  try {
    // ----------------------------------------------------
    // TEST 1: checkAvailability when user has NO wallet balance
    // ----------------------------------------------------
    console.log("\n▶ TEST 1: checkAvailability with 0 wallet balance");
    {
      const { req, res } = mockReqRes({
        user: { _id: testUserId },
        body: {
          bookingType: "PROPERTY",
          hotelId: testPropertyId.toString(),
          checkIn: checkInStr,
          checkOut: checkOutStr,
        },
      });

      await checkAvailability(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const data = res.getResponseData();
      assert.strictEqual(data.available, true);
      assert.strictEqual(data.priceDetails.walletBalance, 0);
      assert.strictEqual(data.priceDetails.walletAmountApplied, 0);
      assert.strictEqual(data.priceDetails.remainingAmount, data.priceDetails.grandTotal);
      assert.strictEqual(data.priceDetails.onlinePayableAmount, data.priceDetails.grandTotal);
      console.log(`✔ With 0 wallet balance: Grand Total = ${data.priceDetails.grandTotal}, Remaining = ${data.priceDetails.remainingAmount}`);
    }

    // ----------------------------------------------------
    // TEST 2: checkAvailability when user has PARTIAL wallet balance
    // ----------------------------------------------------
    console.log("\n▶ TEST 2: checkAvailability with partial wallet balance (e.g. 50 SAR)");
    {
      await UserWallet.create({
        user: testUserId,
        balance: 50,
        currency: "SAR",
        isActive: true,
      });

      const { req, res } = mockReqRes({
        user: { _id: testUserId },
        body: {
          bookingType: "PROPERTY",
          hotelId: testPropertyId.toString(),
          checkIn: checkInStr,
          checkOut: checkOutStr,
        },
      });

      await checkAvailability(req, res);
      const data = res.getResponseData();
      assert.strictEqual(data.priceDetails.walletBalance, 50);
      assert.strictEqual(data.priceDetails.walletAmountApplied, 50);
      const expectedRemaining = Number((data.priceDetails.grandTotal - 50).toFixed(2));
      assert.strictEqual(data.priceDetails.remainingAmount, expectedRemaining);
      assert.strictEqual(data.priceDetails.onlinePayableAmount, expectedRemaining);
      console.log(`✔ Partial wallet applied: 50 SAR deducted, Remaining to pay online = ${expectedRemaining} SAR`);
    }

    // ----------------------------------------------------
    // TEST 3: createBooking with partial wallet balance
    // ----------------------------------------------------
    console.log("\n▶ TEST 3: createBooking with partial wallet balance (MIXED payment)");
    let partialBookingOrderId = null;
    let expectedRemainingOnline = 0;
    {
      const { req, res } = mockReqRes({
        user: { _id: testUserId },
        body: {
          bookingType: "PROPERTY",
          propertyId: testPropertyId.toString(),
          checkIn: checkInStr,
          checkOut: checkOutStr,
          priceDetails: { basePrice: 100 },
        },
      });

      await createBooking(req, res);
      if (res.getStatusCode() !== 201) {
        console.error("createBooking returned:", res.getStatusCode(), res.getResponseData());
      }
      assert.strictEqual(res.getStatusCode(), 201);
      const data = res.getResponseData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.walletAmountApplied, 50);
      assert.strictEqual(data.paymentMethod, "MIXED");
      assert.strictEqual(data.paymentStatus, "pending");
      assert.strictEqual(data.bookingStatus, "pending");
      assert.strictEqual(data.remainingAmount, data.onlinePayableAmount);
      partialBookingOrderId = data.orderId;
      expectedRemainingOnline = data.remainingAmount;

      // Check UserWallet was deducted from 50 to 0
      const wallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(wallet.balance, 0, "User wallet balance should be 0 after deduction");

      // Check UserWalletTransaction
      const tx = await UserWalletTransaction.findOne({
        user: testUserId,
        type: "debit",
        transactionType: "wallet_payment",
      });
      assert.ok(tx, "Debit transaction should exist");
      assert.strictEqual(tx.amount, 50);

      console.log(`✔ Booking created: 50 SAR deducted from wallet, remaining ${expectedRemainingOnline} SAR sent to frontend.`);
    }

    // ----------------------------------------------------
    // TEST 4: paymentWebhook when online payment fails (UserWallet MUST BE REFUNDED)
    // ----------------------------------------------------
    console.log("\n▶ TEST 4: paymentWebhook on FAILED payment (Wallet balance must be refunded)");
    {
      const { req, res } = mockReqRes({
        body: {
          id: "chg_failed_123",
          status: "DECLINED",
          reference: { order: partialBookingOrderId },
        },
      });

      await paymentWebhook(req, res);

      // Check booking status
      const booking = await Booking.findOne({ orderId: partialBookingOrderId });
      assert.strictEqual(booking.paymentStatus, "failed");
      assert.strictEqual(booking.walletRefunded, true);

      // Check UserWallet was refunded back to 50 SAR!
      const wallet = await UserWallet.findOne({ user: testUserId });
      assert.strictEqual(wallet.balance, 50, "User wallet must be restored to 50 SAR upon payment failure");

      // Check refund transaction
      const refundTx = await UserWalletTransaction.findOne({
        user: testUserId,
        type: "credit",
        transactionType: "refund",
      });
      assert.ok(refundTx, "Refund transaction must be logged");
      assert.strictEqual(refundTx.amount, 50);

      console.log("✔ Payment failed: 50 SAR safely refunded back to user wallet!");
    }

    // ----------------------------------------------------
    // TEST 5: paymentWebhook when online payment succeeds (CAPTURED)
    // ----------------------------------------------------
    console.log("\n▶ TEST 5: Re-attempt booking and paymentWebhook SUCCESS (CAPTURED)");
    {
      // Create another booking with 50 SAR wallet applied
      const { req: bReq, res: bRes } = mockReqRes({
        user: { _id: testUserId },
        body: {
          bookingType: "PROPERTY",
          propertyId: testPropertyId.toString(),
          checkIn: checkInStr,
          checkOut: checkOutStr,
          priceDetails: { basePrice: 100 },
        },
      });

      await createBooking(bReq, bRes);
      const bData = bRes.getResponseData();
      const successOrderId = bData.orderId;

      // Webhook with CAPTURED
      const { req: wReq, res: wRes } = mockReqRes({
        body: {
          id: "chg_success_456",
          status: "CAPTURED",
          reference: { order: successOrderId },
        },
      });

      await paymentWebhook(wReq, wRes);

      const booking = await Booking.findOne({ orderId: successOrderId });
      assert.strictEqual(booking.paymentStatus, "paid");
      assert.strictEqual(booking.bookingStatus, "confirmed");
      assert.strictEqual(booking.walletRefunded, false, "Wallet should not be refunded on success");
      console.log("✔ Payment succeeded: Booking confirmed, wallet deduction kept.");
    }

    // ----------------------------------------------------
    // TEST 6: createBooking when wallet covers 100% of the total amount (WALLET payment)
    // ----------------------------------------------------
    console.log("\n▶ TEST 6: createBooking when wallet covers 100% of total amount");
    {
      // Top up user wallet with 500 SAR
      await UserWallet.updateOne({ user: testUserId }, { $set: { balance: 500 } });

      const t6CheckIn = new Date();
      t6CheckIn.setDate(t6CheckIn.getDate() + 20);
      const t6CheckInStr = t6CheckIn.toISOString().split("T")[0];

      const t6CheckOut = new Date();
      t6CheckOut.setDate(t6CheckOut.getDate() + 22);
      const t6CheckOutStr = t6CheckOut.toISOString().split("T")[0];

      const { req, res } = mockReqRes({
        user: { _id: testUserId },
        body: {
          bookingType: "PROPERTY",
          propertyId: testPropertyId.toString(),
          checkIn: t6CheckInStr,
          checkOut: t6CheckOutStr,
          priceDetails: { basePrice: 100 },
        },
      });

      await createBooking(req, res);
      if (res.getStatusCode() !== 201) {
        console.error("createBooking returned:", res.getStatusCode(), res.getResponseData());
      }
      assert.strictEqual(res.getStatusCode(), 201);
      const data = res.getResponseData();
      assert.strictEqual(data.paymentMethod, "WALLET");
      assert.strictEqual(data.remainingAmount, 0);
      assert.strictEqual(data.paymentStatus, "paid");
      assert.strictEqual(data.bookingStatus, "confirmed");

      // Verify wallet deduction
      const wallet = await UserWallet.findOne({ user: testUserId });
      const expectedBalance = 500 - data.walletAmountApplied;
      assert.strictEqual(wallet.balance, expectedBalance);

      console.log(`✔ 100% Wallet Payment: Covered full ${data.walletAmountApplied} SAR. Remaining online amount = 0.`);
    }

    console.log("\n==================================================");
    console.log("🎉 ALL USER WALLET BOOKING & PAYMENT TESTS PASSED!");
    console.log("==================================================");
  } finally {
    // Cleanup
    await User.deleteMany({
      $or: [
        { _id: testUserId },
        { phone: "+966599999991" }
      ]
    });
    await UserWallet.deleteMany({ user: testUserId });
    await UserWalletTransaction.deleteMany({ user: testUserId });
    await Properties.deleteMany({ _id: testPropertyId });
    await Availability.deleteMany({ hotel: testPropertyId });
    await Booking.deleteMany({ user: testUserId });
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
