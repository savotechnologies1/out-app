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
const { getUserById } = require("../controller/adminController");

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
  console.log("🧪 RUNNING getUserById WALLET AMOUNT TEST SUITE");
  console.log("==================================================");

  const mongoUri = process.env.CONNECTION_STRING || "mongodb://localhost:27017/out-app";
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  }

  const testUserId1 = new mongoose.Types.ObjectId();
  const testUserId2 = new mongoose.Types.ObjectId();

  try {
    await User.deleteMany({ _id: { $in: [testUserId1, testUserId2] } });
    await UserWallet.deleteMany({ user: { $in: [testUserId1, testUserId2] } });

    // User 1: Has a wallet with 350 SAR
    await User.create({
      _id: testUserId1,
      firstName: "WalletUser",
      lastName: "Tester",
      email: `wallet_user_${Date.now()}@example.com`,
      phone: "+966511111111",
      role: "User",
    });

    await UserWallet.create({
      user: testUserId1,
      balance: 350,
      currency: "SAR",
      isActive: true,
    });

    // User 2: Has no wallet created yet
    await User.create({
      _id: testUserId2,
      firstName: "NoWalletUser",
      lastName: "Tester",
      email: `nowallet_user_${Date.now()}@example.com`,
      phone: "+966522222222",
      role: "User",
    });

    // -------------------------------------------------------------
    // TEST 1: User with existing wallet
    // -------------------------------------------------------------
    console.log("\n▶ TEST 1: getUserById for user with existing wallet");
    {
      const { req, res } = mockReqRes({
        params: { id: testUserId1.toString() },
      });

      await getUserById(req, res);

      assert.strictEqual(res.getStatusCode(), 200, "Should return HTTP 200");
      const body = res.getResponseData();
      assert.strictEqual(body.success, true);
      assert.ok(body.data, "Should return user data");
      assert.strictEqual(body.data.walletAmount, 350, "walletAmount should be 350");
      assert.strictEqual(body.data.walletBalance, 350, "walletBalance should be 350");
      assert.strictEqual(body.data.wallet.balance, 350, "wallet.balance should be 350");
      assert.strictEqual(body.data.wallet.currency, "SAR", "wallet currency should be SAR");

      console.log("✔ TEST 1 Passed: Successfully returned user with walletAmount = 350 SAR!");
    }

    // -------------------------------------------------------------
    // TEST 2: User without existing wallet (default to 0)
    // -------------------------------------------------------------
    console.log("\n▶ TEST 2: getUserById for user without wallet");
    {
      const { req, res } = mockReqRes({
        params: { id: testUserId2.toString() },
      });

      await getUserById(req, res);

      assert.strictEqual(res.getStatusCode(), 200, "Should return HTTP 200");
      const body = res.getResponseData();
      assert.strictEqual(body.success, true);
      assert.ok(body.data, "Should return user data");
      assert.strictEqual(body.data.walletAmount, 0, "walletAmount should default to 0");
      assert.strictEqual(body.data.walletBalance, 0, "walletBalance should default to 0");
      assert.strictEqual(body.data.wallet.balance, 0, "wallet.balance should default to 0");
      assert.strictEqual(body.data.wallet.currency, "SAR", "wallet currency should default to SAR");

      console.log("✔ TEST 2 Passed: Successfully returned user with default walletAmount = 0 SAR!");
    }

    console.log("\n==================================================");
    console.log("🎉 ALL getUserById WALLET TESTS PASSED!");
    console.log("==================================================");
  } finally {
    await User.deleteMany({ _id: { $in: [testUserId1, testUserId2] } });
    await UserWallet.deleteMany({ user: { $in: [testUserId1, testUserId2] } });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
