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
const Coupon = require("../models/Coupon");
const PlatformFee = require("../models/PlatformFee");
const Tax = require("../models/Tax");

const { createCoupon, updateCoupon, getCouponById, getAllCoupons } = require("../controller/adminController");
const { getAvailableCoupons } = require("../controller/userController");
const { checkAvailability, createBooking, cancelBooking, handleCouponAndCashbackOnCancellation } = require("../controller/bookingController");
const { processCompletedBookingCashback } = require("../cron/working");

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
  console.log("🧪 RUNNING COUPON ENHANCEMENT TEST SUITE");
  console.log("==================================================");

  const mongoUri = process.env.CONNECTION_STRING || "mongodb://localhost:27017/out-app";
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  }

  const testUserAId = new mongoose.Types.ObjectId();
  const testUserBId = new mongoose.Types.ObjectId();
  const testHostId = new mongoose.Types.ObjectId();
  const testPropertyId = new mongoose.Types.ObjectId();

  const cleanupCodes = ["TESTDISC10", "TESTCASH15", "TESTCASHFLAT", "TESTSPECIFIC", "TESTALLUSERS"];

  // Cleanup
  await User.deleteMany({ _id: { $in: [testUserAId, testUserBId, testHostId] } });
  await UserWallet.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
  await UserWalletTransaction.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
  await Coupon.deleteMany({ code: { $in: cleanupCodes } });
  await Properties.deleteMany({ _id: testPropertyId });
  await Booking.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
  await PlatformFee.deleteMany({});
  await Tax.deleteMany({});

  try {
    // 0. Seed Users & Configurations
    const userA = await User.create({
      _id: testUserAId,
      phone: "+966580000001",
      phoneCode: "+966",
      role: "user",
      firstName: "Ahmad",
      lastName: "Customer",
      isVerified: true,
      identityVerificationStatus: "VERIFIED"
    });

    const userB = await User.create({
      _id: testUserBId,
      phone: "+966580000002",
      phoneCode: "+966",
      role: "user",
      firstName: "Sarah",
      lastName: "Customer",
      isVerified: true,
      identityVerificationStatus: "VERIFIED"
    });

    await PlatformFee.create({
      feeType: "PERCENTAGE",
      value: 5,
      isActive: true,
      isDeleted: false
    });

    await Tax.create({
      percentage: 15,
      isActive: true,
      isDeleted: false
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

    const property = await Properties.create({
      _id: testPropertyId,
      user: testHostId,
      name: "Luxury Beach Villa",
      price: 1000,
      document: "https://example.com/doc.pdf",
      cancellationPolicy: policy._id,
      instantBooking: true,
      isActive: true,
      isDeleted: false,
    });

    // ================================================================
    // TEST 1: Admin Create Coupon Validations
    // ================================================================
    console.log("\n▶ TEST 1: Admin Coupon Creation (DISCOUNT vs CASHBACK, ALL vs SPECIFIC)");

    // 1a. Invalid coupon type
    {
      const { req, res } = mockReqRes({
        body: {
          code: "TESTBADTYPE",
          couponType: "INVALID_TYPE",
          discountType: "PERCENTAGE",
          discountValue: 10,
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 7 * 86400000)
        }
      });
      await createCoupon(req, res);
      assert.strictEqual(res.getStatusCode(), 400);
      assert.strictEqual(res.getResponseData().message, "couponType must be either DISCOUNT or CASHBACK");
    }

    // 1b. SPECIFIC without valid applicableUsers
    {
      const { req, res } = mockReqRes({
        body: {
          code: "TESTBADSPECIFIC",
          couponType: "CASHBACK",
          discountType: "PERCENTAGE",
          discountValue: 10,
          userRestriction: "SPECIFIC",
          applicableUsers: [],
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 7 * 86400000)
        }
      });
      await createCoupon(req, res);
      assert.strictEqual(res.getStatusCode(), 400);
      assert.strictEqual(res.getResponseData().message, "At least one user must be selected when userRestriction is SPECIFIC");
    }

    // 1c. SPECIFIC with non-existent user
    {
      const fakeId = new mongoose.Types.ObjectId();
      const { req, res } = mockReqRes({
        body: {
          code: "TESTFAKESPECIFIC",
          couponType: "CASHBACK",
          discountType: "PERCENTAGE",
          discountValue: 10,
          userRestriction: "SPECIFIC",
          applicableUsers: [fakeId],
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 7 * 86400000)
        }
      });
      await createCoupon(req, res);
      assert.strictEqual(res.getStatusCode(), 400);
      assert.strictEqual(res.getResponseData().message, "One or more selected users do not exist or are deleted");
    }

    // 1d. Create valid DISCOUNT Percentage Coupon for ALL users
    let discountCouponId = null;
    {
      const { req, res } = mockReqRes({
        body: {
          code: "TESTDISC10",
          couponType: "DISCOUNT",
          discountType: "PERCENTAGE",
          discountValue: 10,
          maxDiscount: 200,
          userRestriction: "ALL",
          startDate: new Date(Date.now() - 86400000),
          expiryDate: new Date(Date.now() + 7 * 86400000)
        }
      });
      await createCoupon(req, res);
      assert.strictEqual(res.getStatusCode(), 201);
      assert.strictEqual(res.getResponseData().data.couponType, "DISCOUNT");
      assert.strictEqual(res.getResponseData().data.userRestriction, "ALL");
      discountCouponId = res.getResponseData().data._id;
    }

    // 1e. Create valid CASHBACK Percentage Coupon for SPECIFIC user A
    let cashbackCouponId = null;
    {
      const { req, res } = mockReqRes({
        body: {
          code: "TESTCASH15",
          couponType: "CASHBACK",
          discountType: "PERCENTAGE",
          discountValue: 15,
          maxDiscount: 150,
          userRestriction: "SPECIFIC",
          applicableUsers: [userA._id],
          startDate: new Date(Date.now() - 86400000),
          expiryDate: new Date(Date.now() + 7 * 86400000)
        }
      });
      await createCoupon(req, res);
      assert.strictEqual(res.getStatusCode(), 201);
      assert.strictEqual(res.getResponseData().data.couponType, "CASHBACK");
      assert.strictEqual(res.getResponseData().data.userRestriction, "SPECIFIC");
      assert.strictEqual(res.getResponseData().data.applicableUsers.length, 1);
      cashbackCouponId = res.getResponseData().data._id;
    }

    // 1f. Create valid CASHBACK Flat Coupon
    let flatCashbackCouponId = null;
    {
      const { req, res } = mockReqRes({
        body: {
          code: "TESTCASHFLAT",
          couponType: "CASHBACK",
          discountType: "FLAT",
          discountValue: 50,
          userRestriction: "ALL",
          startDate: new Date(Date.now() - 86400000),
          expiryDate: new Date(Date.now() + 7 * 86400000)
        }
      });
      await createCoupon(req, res);
      assert.strictEqual(res.getStatusCode(), 201);
      assert.strictEqual(res.getResponseData().data.couponType, "CASHBACK");
      flatCashbackCouponId = res.getResponseData().data._id;
    }

    console.log("✅ Passed: Admin creation and schema validations");

    // ================================================================
    // TEST 2: Admin getCouponById & getAllCoupons Filtering
    // ================================================================
    console.log("\n▶ TEST 2: Admin getCouponById and getAllCoupons filters");
    {
      const { req, res } = mockReqRes({
        params: { couponId: cashbackCouponId }
      });
      await getCouponById(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      assert.strictEqual(res.getResponseData().data.code, "TESTCASH15");
      assert.strictEqual(res.getResponseData().data.applicableUsers[0].firstName, "Ahmad");
    }

    {
      const { req, res } = mockReqRes({
        query: { couponType: "CASHBACK" }
      });
      await getAllCoupons(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const allCashback = res.getResponseData().data;
      assert.ok(allCashback.every(c => c.couponType === "CASHBACK"));
    }
    console.log("✅ Passed: Admin getCouponById & getAllCoupons with populated users");

    // ================================================================
    // TEST 3: User getAvailableCoupons Eligibility
    // ================================================================
    console.log("\n▶ TEST 3: User getAvailableCoupons eligibility (User A vs User B)");
    {
      // User A (whitelisted for TESTCASH15)
      const { req, res } = mockReqRes({
        user: { _id: userA._id }
      });
      await getAvailableCoupons(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const coupons = res.getResponseData().data;
      const codes = coupons.map(c => c.code);
      assert.ok(codes.includes("TESTDISC10"), "User A should see ALL coupon TESTDISC10");
      assert.ok(codes.includes("TESTCASH15"), "User A should see SPECIFIC coupon TESTCASH15");
    }

    {
      // User B (NOT whitelisted for TESTCASH15)
      const { req, res } = mockReqRes({
        user: { _id: userB._id }
      });
      await getAvailableCoupons(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const coupons = res.getResponseData().data;
      const codes = coupons.map(c => c.code);
      assert.ok(codes.includes("TESTDISC10"), "User B should see ALL coupon TESTDISC10");
      assert.ok(!codes.includes("TESTCASH15"), "User B should NOT see SPECIFIC coupon TESTCASH15");
    }
    console.log("✅ Passed: User-specific coupon visibility isolated properly");

    // ================================================================
    // TEST 4: checkAvailability Calculation (DISCOUNT vs CASHBACK)
    // ================================================================
    console.log("\n▶ TEST 4: checkAvailability Calculations");

    const checkIn = new Date(Date.now() + 86400000);
    const checkOut = new Date(Date.now() + 2 * 86400000);

    // 4a. User B attempts to use TESTCASH15 (restricted to User A) -> REJECTED
    {
      const { req, res } = mockReqRes({
        user: { _id: userB._id },
        body: {
          bookingType: "PROPERTY",
          hotelId: property._id,
          checkIn,
          checkOut,
          adults: 2,
          couponCode: "TESTCASH15"
        }
      });
      await checkAvailability(req, res);
      assert.strictEqual(res.getStatusCode(), 400);
      assert.strictEqual(res.getResponseData().message, "This coupon is only available to selected users");
    }

    // 4b. DISCOUNT Coupon (TESTDISC10: 10% discount on 1000 = 100 discount)
    {
      const { req, res } = mockReqRes({
        user: { _id: userA._id },
        body: {
          bookingType: "PROPERTY",
          hotelId: property._id,
          checkIn,
          checkOut,
          adults: 2,
          couponCode: "TESTDISC10"
        }
      });
      await checkAvailability(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const pd = res.getResponseData().priceDetails;
      assert.strictEqual(pd.discountAmount, 100);
      assert.strictEqual(pd.finalAmount, 900); // 1000 - 100
      assert.strictEqual(pd.couponType, "DISCOUNT");
      assert.strictEqual(pd.cashbackAmount, 0);
    }

    // 4c. CASHBACK Coupon (TESTCASH15: 15% cashback on 1000 = 150 cashback)
    // IMPORTANT: Final amount remains 1000, discountAmount = 0
    let cashbackPriceDetails = null;
    {
      const { req, res } = mockReqRes({
        user: { _id: userA._id },
        body: {
          bookingType: "PROPERTY",
          hotelId: property._id,
          checkIn,
          checkOut,
          adults: 2,
          couponCode: "TESTCASH15"
        }
      });
      await checkAvailability(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      cashbackPriceDetails = res.getResponseData().priceDetails;
      assert.strictEqual(cashbackPriceDetails.discountAmount, 0, "Cashback coupon MUST NOT reduce booking discountAmount");
      assert.strictEqual(cashbackPriceDetails.finalAmount, 1000, "Cashback coupon MUST keep booking finalAmount unchanged");
      assert.strictEqual(cashbackPriceDetails.cashbackAmount, 150, "15% cashback on 1000 should be 150 SAR");
      assert.strictEqual(cashbackPriceDetails.couponType, "CASHBACK");
    }
    console.log("✅ Passed: checkAvailability calculations correctly separate DISCOUNT from CASHBACK");

    // ================================================================
    // TEST 5: Booking Creation with CASHBACK Coupon (Pending Cashback)
    // ================================================================
    console.log("\n▶ TEST 5: Booking Creation with CASHBACK Coupon");

    // Seed 100% wallet balance for User A so we can complete booking payment immediately
    let userAWallet = await UserWallet.create({
      user: userA._id,
      balance: 1500,
      currency: "SAR",
      isActive: true
    });

    let bookingId = null;
    {
      const { req, res } = mockReqRes({
        user: { _id: userA._id },
        body: {
          bookingType: "PROPERTY",
          propertyId: property._id,
          checkIn,
          checkOut,
          adults: 2,
          couponId: cashbackCouponId,
          priceDetails: cashbackPriceDetails,
          useWallet: true // Pay with wallet balance
        }
      });
      await createBooking(req, res);
      assert.strictEqual(res.getStatusCode(), 201);
      bookingId = res.getResponseData().bookingId;

      const savedBooking = await Booking.findById(bookingId);
      assert.strictEqual(savedBooking.couponType, "CASHBACK");
      assert.strictEqual(savedBooking.cashbackAmount, 150);
      assert.strictEqual(savedBooking.cashbackStatus, "PENDING");
      assert.strictEqual(savedBooking.discountAmount, 0);
    }
    console.log("✅ Passed: Booking created with couponType: CASHBACK and cashbackStatus: PENDING");

    // ================================================================
    // TEST 6: Cashback Fulfillment via Cron (Stay Completion)
    // ================================================================
    console.log("\n▶ TEST 6: Cashback Credited on Stay Completion (processCompletedBookingCashback)");

    // Simulate stay completion: checkIn and checkOut set to past dates
    const pastCheckIn = new Date(Date.now() - 2 * 86400000);
    const pastCheckOut = new Date(Date.now() - 1 * 86400000);
    await Booking.findByIdAndUpdate(bookingId, {
      checkIn: pastCheckIn,
      checkOut: pastCheckOut,
      bookingStatus: "confirmed",
      paymentStatus: "paid"
    });

    const preBalance = (await UserWallet.findOne({ user: userA._id })).balance;

    // Run cron worker
    await processCompletedBookingCashback();

    // Verify wallet updated
    const postWallet = await UserWallet.findOne({ user: userA._id });
    const expectedBalance = Number((preBalance + 150).toFixed(2));
    assert.strictEqual(postWallet.balance, expectedBalance, `Wallet balance should increase by 150 SAR cashback from ${preBalance} to ${expectedBalance}`);

    // Verify audit transaction created
    const tx = await UserWalletTransaction.findOne({
      bookingId,
      transactionType: "cashback"
    });
    assert.ok(tx, "Cashback audit transaction must be created");
    assert.strictEqual(tx.amount, 150);
    assert.strictEqual(tx.type, "credit");
    assert.strictEqual(tx.couponCode, "TESTCASH15");

    // Verify booking status changed to CREDITED
    const updatedBooking = await Booking.findById(bookingId);
    assert.strictEqual(updatedBooking.cashbackStatus, "CREDITED");
    assert.ok(updatedBooking.cashbackCreditedAt instanceof Date);
    assert.strictEqual(updatedBooking.cashbackTransactionId.toString(), tx._id.toString());

    // Run cron again to verify idempotency (zero double credits)
    await processCompletedBookingCashback();
    const idempotentWallet = await UserWallet.findOne({ user: userA._id });
    assert.strictEqual(idempotentWallet.balance, expectedBalance, "Subsequent cron runs must not duplicate cashback credit");

    console.log("✅ Passed: Cashback credited to UserWallet on completion with audit ledger & idempotency");

    // ================================================================
    // TEST 7: Cashback Reversal on Cancellation
    // ================================================================
    console.log("\n▶ TEST 7: Cashback Reversal on Booking Cancellation");

    const preCancelBalance = postWallet.balance;
    await handleCouponAndCashbackOnCancellation(updatedBooking);

    const reversedWallet = await UserWallet.findOne({ user: userA._id });
    const expectedReversedBalance = Number((preCancelBalance - 150).toFixed(2));
    assert.strictEqual(reversedWallet.balance, expectedReversedBalance, "Wallet balance should decrease by 150 SAR upon cashback reversal");

    const reversalTx = await UserWalletTransaction.findOne({
      bookingId,
      transactionType: "cashback_reversal"
    });
    assert.ok(reversalTx, "Cashback reversal audit transaction must exist");
    assert.strictEqual(reversalTx.amount, 150);
    assert.strictEqual(reversalTx.type, "debit");

    assert.strictEqual(updatedBooking.cashbackStatus, "REVERSED");

    // Verify coupon usage restored
    const couponAfterReversal = await Coupon.findById(cashbackCouponId);
    assert.strictEqual(couponAfterReversal.usedCount, 0, "Coupon usedCount must be decremented on cancellation");
    assert.strictEqual(couponAfterReversal.usedBy.length, 0, "Coupon usedBy user record must be pulled on cancellation");

    console.log("✅ Passed: Cashback reversed from UserWallet and coupon usage restored");

    // ================================================================
    // TEST 8: Reversal of PENDING Cashback (Pre-Stay Cancellation)
    // ================================================================
    console.log("\n▶ TEST 8: Cancellation when Cashback is PENDING (No Wallet Deduction, Marked CANCELLED)");

    const futureBooking = await Booking.create({
      orderId: "OUT-TEST-PENDING-CASH",
      user: userA._id,
      property: property._id,
      bookingType: "PROPERTY",
      totalAmount: 1000,
      couponId: cashbackCouponId,
      couponType: "CASHBACK",
      couponCode: "TESTCASH15",
      cashbackAmount: 150,
      cashbackStatus: "PENDING",
      bookingStatus: "pending",
      paymentStatus: "paid",
      checkIn: new Date(Date.now() + 86400000),
      checkOut: new Date(Date.now() + 2 * 86400000)
    });

    const balBeforePendingCancel = (await UserWallet.findOne({ user: userA._id })).balance;
    await handleCouponAndCashbackOnCancellation(futureBooking);

    const balAfterPendingCancel = (await UserWallet.findOne({ user: userA._id })).balance;
    assert.strictEqual(balAfterPendingCancel, balBeforePendingCancel, "No deduction should happen when reversing pending cashback");
    assert.strictEqual(futureBooking.cashbackStatus, "CANCELLED");

    console.log("✅ Passed: Pending cashback safely marked CANCELLED without debiting wallet");

    console.log("\n==================================================");
    console.log("🎉 ALL COUPON ENHANCEMENT TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");

  } finally {
    // Cleanup
    await User.deleteMany({ _id: { $in: [testUserAId, testUserBId, testHostId] } });
    await UserWallet.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
    await UserWalletTransaction.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
    await Coupon.deleteMany({ code: { $in: cleanupCodes } });
    await Properties.deleteMany({ _id: testPropertyId });
    await Booking.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
    await PlatformFee.deleteMany({ type: "customer" });
    await Tax.deleteMany({});
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error("❌ TEST SUITE FAILED:", err);
    process.exit(1);
  });
}

module.exports = { runTests };
