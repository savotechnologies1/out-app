const assert = require("assert");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const Properties = require("../models/Properties");
const { cancelBooking } = require("../controller/bookingController");
const { releaseOnCheckIn } = require("../cron/working");

require("dotenv").config();

const nextOrderId = () => "TEST_PAYOUT_" + Math.random().toString(36).substring(2, 9).toUpperCase();

async function runTests() {
  console.log("==================================================");
  console.log("🧪 RUNNING PROVIDER PAYOUT RELEASE TEST SUITE");
  console.log("==================================================");

  const mongoUri = process.env.CONNECTION_STRING || "mongodb://localhost:27017/out-app";
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    }
  } catch (dbErr) {
    console.error("❌ Failed to connect to MongoDB:", dbErr.message);
    process.exit(1);
  }

  const mockUserId = new mongoose.Types.ObjectId();
  const mockProviderAId = new mongoose.Types.ObjectId();
  const mockProviderBId = new mongoose.Types.ObjectId();
  const mockPropertyId = new mongoose.Types.ObjectId();

  const cleanDb = async () => {
    await Booking.deleteMany({ user: mockUserId });
    await Wallet.deleteMany({ user: { $in: [mockProviderAId, mockProviderBId] } });
    await WalletTransaction.deleteMany({ user: { $in: [mockProviderAId, mockProviderBId] } });
  };

  const setupWallet = async (userId, holdAmount) => {
    await Wallet.deleteMany({ user: userId });
    return await Wallet.create({
      user: userId,
      balance: 0,
      holdBalance: holdAmount,
      isActive: true
    });
  };

  try {
    // ---------------------------------------------------
    // TEST 1: Case 1 - 100% customer refund (Provider retained = 0)
    // ---------------------------------------------------
    {
      await cleanDb();
      await setupWallet(mockProviderAId, 1000);

      const booking = await Booking.create({
        bookingType: "PROPERTY",
        property: mockPropertyId,
        user: mockUserId,
        checkIn: new Date(Date.now() + 48 * 60 * 60 * 1000),
        checkOut: new Date(Date.now() + 72 * 60 * 60 * 1000),
        totalAmount: 1000,
        orderId: nextOrderId(),
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        providerBreakdown: [{ user: mockProviderAId, amount: 1000, type: "property", referenceId: mockPropertyId }]
      });

      // Cancellation policy snapshot for 100% refund
      booking.policySnapshot = {
        rules: [{ from: 0, to: 100, unit: "hours", refundPercentage: 100 }]
      };
      await booking.save();

      // Cancel booking
      const req = { params: { bookingId: booking._id.toString() }, body: { reason: "CHANGED_MY_MIND" }, user: { _id: mockUserId } };
      const res = { status: () => res, send: (data) => assert.strictEqual(data.success, true) };
      await cancelBooking(req, res);

      // Verify immediate wallet state
      const wallet = await Wallet.findOne({ user: mockProviderAId });
      assert.strictEqual(wallet.balance, 0, "Provider A balance must not change immediately");
      assert.strictEqual(wallet.holdBalance, 0, "Provider A hold balance must be reduced by refund amount (1000)");

      // Check tracking fields
      const updatedBooking = await Booking.findById(booking._id);
      assert.strictEqual(updatedBooking.refundAmount, 1000);
      assert.strictEqual(updatedBooking.providerBreakdown[0].refundAmount, 1000);
      assert.strictEqual(updatedBooking.providerBreakdown[0].retainedAmount, 0);
      assert.strictEqual(updatedBooking.providerBreakdown[0].payoutReleaseStatus, "RELEASED");

      // Fast forward cancellation date (simulate 48 hours passed)
      updatedBooking.cancellationDate = new Date(Date.now() - 49 * 60 * 60 * 1000);
      await updatedBooking.save();

      // Run release cron
      await releaseOnCheckIn();

      const finalWallet = await Wallet.findOne({ user: mockProviderAId });
      assert.strictEqual(finalWallet.balance, 0, "Provider A balance should remain 0 after cron");
      console.log("✅ Test 1 Passed: 100% refund scenario behaves correctly.");
    }

    // ---------------------------------------------------
    // TEST 2: Case 2 - 50% customer refund (Provider retained = 500)
    // ---------------------------------------------------
    {
      await cleanDb();
      await setupWallet(mockProviderAId, 1000);

      const booking = await Booking.create({
        bookingType: "PROPERTY",
        property: mockPropertyId,
        user: mockUserId,
        checkIn: new Date(Date.now() + 48 * 60 * 60 * 1000),
        checkOut: new Date(Date.now() + 72 * 60 * 60 * 1000),
        totalAmount: 1000,
        orderId: nextOrderId(),
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        providerBreakdown: [{ user: mockProviderAId, amount: 1000, type: "property", referenceId: mockPropertyId }]
      });

      // Cancellation policy snapshot for 50% refund
      booking.policySnapshot = {
        rules: [{ from: 0, to: 100, unit: "hours", refundPercentage: 50 }]
      };
      await booking.save();

      // Cancel booking
      const req = { params: { bookingId: booking._id.toString() }, body: { reason: "CHANGED_MY_MIND" }, user: { _id: mockUserId } };
      const res = { status: () => res, send: (data) => assert.strictEqual(data.success, true) };
      await cancelBooking(req, res);

      // Verify immediate wallet state
      let wallet = await Wallet.findOne({ user: mockProviderAId });
      assert.strictEqual(wallet.balance, 0, "Provider A balance must not change immediately");
      assert.strictEqual(wallet.holdBalance, 500, "Provider A hold balance must keep the retained 500");

      const updatedBooking = await Booking.findById(booking._id);
      assert.strictEqual(updatedBooking.refundAmount, 500);
      assert.strictEqual(updatedBooking.providerBreakdown[0].refundAmount, 500);
      assert.strictEqual(updatedBooking.providerBreakdown[0].retainedAmount, 500);
      assert.strictEqual(updatedBooking.providerBreakdown[0].payoutReleaseStatus, "PENDING");

      // Fast forward cancellation date (simulate 48 hours passed)
      updatedBooking.cancellationDate = new Date(Date.now() - 49 * 60 * 60 * 1000);
      await updatedBooking.save();

      // Run release cron
      await releaseOnCheckIn();

      const finalWallet = await Wallet.findOne({ user: mockProviderAId });
      assert.strictEqual(finalWallet.balance, 500, "Provider A balance must be credited with 500");
      assert.strictEqual(finalWallet.holdBalance, 0, "Provider A hold balance must be 0 after release");

      const creditTx = await WalletTransaction.findOne({ user: mockProviderAId, type: "credit", bookingId: booking._id });
      assert.ok(creditTx, "Credit transaction should be created");
      assert.strictEqual(creditTx.amount, 500);
      assert.strictEqual(creditTx.transactionType, "release_on_cancellation");

      console.log("✅ Test 2 Passed: 50% refund scenario behaves correctly.");
    }

    // ---------------------------------------------------
    // TEST 3: Case 3 - 0% customer refund (Provider retained = 1000)
    // ---------------------------------------------------
    {
      await cleanDb();
      await setupWallet(mockProviderAId, 1000);

      const booking = await Booking.create({
        bookingType: "PROPERTY",
        property: mockPropertyId,
        user: mockUserId,
        checkIn: new Date(Date.now() + 48 * 60 * 60 * 1000),
        checkOut: new Date(Date.now() + 72 * 60 * 60 * 1000),
        totalAmount: 1000,
        orderId: nextOrderId(),
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        providerBreakdown: [{ user: mockProviderAId, amount: 1000, type: "property", referenceId: mockPropertyId }]
      });

      // Cancellation policy snapshot for 0% refund
      booking.policySnapshot = {
        rules: [{ from: 0, to: 100, unit: "hours", refundPercentage: 0 }]
      };
      await booking.save();

      // Cancel booking
      const req = { params: { bookingId: booking._id.toString() }, body: { reason: "CHANGED_MY_MIND" }, user: { _id: mockUserId } };
      const res = { status: () => res, send: (data) => assert.strictEqual(data.success, true) };
      await cancelBooking(req, res);

      // Verify immediate wallet state
      let wallet = await Wallet.findOne({ user: mockProviderAId });
      assert.strictEqual(wallet.balance, 0, "Provider A balance must not change immediately");
      assert.strictEqual(wallet.holdBalance, 1000, "Provider A hold balance must keep the retained 1000");

      const updatedBooking = await Booking.findById(booking._id);
      assert.strictEqual(updatedBooking.refundAmount, 0);
      assert.strictEqual(updatedBooking.providerBreakdown[0].refundAmount, 0);
      assert.strictEqual(updatedBooking.providerBreakdown[0].retainedAmount, 1000);
      assert.strictEqual(updatedBooking.providerBreakdown[0].payoutReleaseStatus, "PENDING");

      // Fast forward cancellation date (simulate 48 hours passed)
      updatedBooking.cancellationDate = new Date(Date.now() - 49 * 60 * 60 * 1000);
      await updatedBooking.save();

      // Run release cron
      await releaseOnCheckIn();

      const finalWallet = await Wallet.findOne({ user: mockProviderAId });
      assert.strictEqual(finalWallet.balance, 1000, "Provider A balance must be credited with 1000");
      assert.strictEqual(finalWallet.holdBalance, 0, "Provider A hold balance must be 0 after release");

      console.log("✅ Test 3 Passed: 0% refund scenario behaves correctly.");
    }

    // ---------------------------------------------------
    // TEST 4: Cron Idempotency (Prevent duplicate release)
    // ---------------------------------------------------
    {
      await cleanDb();
      await setupWallet(mockProviderAId, 1000);

      const booking = await Booking.create({
        bookingType: "PROPERTY",
        property: mockPropertyId,
        user: mockUserId,
        checkIn: new Date(Date.now() + 48 * 60 * 60 * 1000),
        checkOut: new Date(Date.now() + 72 * 60 * 60 * 1000),
        totalAmount: 1000,
        orderId: nextOrderId(),
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        providerBreakdown: [{ user: mockProviderAId, amount: 1000, type: "property", referenceId: mockPropertyId }]
      });

      booking.policySnapshot = {
        rules: [{ from: 0, to: 100, unit: "hours", refundPercentage: 0 }]
      };
      await booking.save();

      // Cancel
      const req = { params: { bookingId: booking._id.toString() }, body: { reason: "CHANGED_MY_MIND" }, user: { _id: mockUserId } };
      const res = { status: () => res, send: (data) => {} };
      await cancelBooking(req, res);

      const updatedBooking = await Booking.findById(booking._id);
      updatedBooking.cancellationDate = new Date(Date.now() - 49 * 60 * 60 * 1000);
      await updatedBooking.save();

      // Run cron twice
      await releaseOnCheckIn();
      const firstRunWallet = await Wallet.findOne({ user: mockProviderAId });

      await releaseOnCheckIn();
      const secondRunWallet = await Wallet.findOne({ user: mockProviderAId });

      assert.strictEqual(firstRunWallet.balance, 1000, "Wallet balance should be credited once");
      assert.strictEqual(secondRunWallet.balance, 1000, "Wallet balance must not increase twice");

      const creditTxCount = await WalletTransaction.countDocuments({ user: mockProviderAId, type: "credit", bookingId: booking._id });
      assert.strictEqual(creditTxCount, 1, "Only one credit WalletTransaction must exist");

      console.log("✅ Test 4 Passed: Cron idempotency behaves correctly.");
    }

    // ---------------------------------------------------
    // TEST 5: Multiple Providers
    // ---------------------------------------------------
    {
      await cleanDb();
      await setupWallet(mockProviderAId, 600);
      await setupWallet(mockProviderBId, 400);

      const booking = await Booking.create({
        bookingType: "PROPERTY_SERVICE",
        property: mockPropertyId,
        user: mockUserId,
        checkIn: new Date(Date.now() + 48 * 60 * 60 * 1000),
        checkOut: new Date(Date.now() + 72 * 60 * 60 * 1000),
        totalAmount: 1000,
        orderId: nextOrderId(),
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        providerBreakdown: [
          { user: mockProviderAId, amount: 600, type: "property", referenceId: mockPropertyId },
          { user: mockProviderBId, amount: 400, type: "service", referenceId: mockPropertyId }
        ]
      });

      booking.policySnapshot = {
        rules: [{ from: 0, to: 100, unit: "hours", refundPercentage: 50 }]
      };
      await booking.save();

      // Cancel
      const req = { params: { bookingId: booking._id.toString() }, body: { reason: "CHANGED_MY_MIND" }, user: { _id: mockUserId } };
      const res = { status: () => res, send: (data) => {} };
      await cancelBooking(req, res);

      // Provider A: amount 600, refund 300, retained 300
      // Provider B: amount 400, refund 200, retained 200
      const afterCancelA = await Wallet.findOne({ user: mockProviderAId });
      const afterCancelB = await Wallet.findOne({ user: mockProviderBId });

      assert.strictEqual(afterCancelA.holdBalance, 300, "Provider A hold balance should be 300");
      assert.strictEqual(afterCancelB.holdBalance, 200, "Provider B hold balance should be 200");

      const updatedBooking = await Booking.findById(booking._id);
      updatedBooking.cancellationDate = new Date(Date.now() - 49 * 60 * 60 * 1000);
      await updatedBooking.save();

      // Run release cron
      await releaseOnCheckIn();

      const finalA = await Wallet.findOne({ user: mockProviderAId });
      const finalB = await Wallet.findOne({ user: mockProviderBId });

      assert.strictEqual(finalA.balance, 300, "Provider A wallet balance must be credited 300");
      assert.strictEqual(finalB.balance, 200, "Provider B wallet balance must be credited 200");
      assert.strictEqual(finalA.holdBalance, 0, "Provider A hold balance must be 0");
      assert.strictEqual(finalB.holdBalance, 0, "Provider B hold balance must be 0");

      console.log("✅ Test 5 Passed: Multiple provider payouts released correctly.");
    }

    await cleanDb();
    await mongoose.disconnect();
    console.log("==================================================");
    console.log("🎉 ALL PROVIDER PAYOUT RELEASE TESTS PASSED!");
    console.log("==================================================");
    process.exit(0);

  } catch (err) {
    console.error("❌ Test Suite Error:", err);
    process.exit(1);
  }
}

runTests();
