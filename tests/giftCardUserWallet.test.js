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
const GiftCard = require("../models/GiftCard");
const Wallet = require("../models/Wallet"); // Provider wallet
const {
  createGiftCard,
  getAllGiftCards,
  getGiftCardById,
  updateGiftCard,
  deleteGiftCard,
} = require("../controller/giftCardController");
const {
  getUserWallet,
  getUserWalletTransactions,
  redeemGiftCard,
  getAvailableGiftCards,
} = require("../controller/userWalletController");

require("dotenv").config();

// Helper to mock express req/res
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

async function runTestSuite() {
  console.log("==================================================");
  console.log("🧪 RUNNING GIFTCARD & USER WALLET TEST SUITE");
  console.log("==================================================");

  const mongoUri = process.env.CONNECTION_STRING || "mongodb://localhost:27017/out-app";
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  }

  // Create test users
  const testUserAId = new mongoose.Types.ObjectId();
  const testUserBId = new mongoose.Types.ObjectId();
  const testAdminId = new mongoose.Types.ObjectId();

  await User.deleteMany({
    $or: [
      { _id: { $in: [testUserAId, testUserBId] } },
      { phone: { $in: ["+966500000001", "+966500000002"] } }
    ]
  });
  await UserWallet.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
  await UserWalletTransaction.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
  await GiftCard.deleteMany({ code: { $in: ["TEST_ALL_100", "TEST_SPECIFIC_50", "TEST_EXPIRED_20", "TEST_INACTIVE_30", "TEST_MISMATCH_80"] } });

  await User.create([
    {
      _id: testUserAId,
      firstName: "Test",
      lastName: "UserA",
      phone: "+966500000001",
      email: "usera@example.com",
      role: "user",
      isActive: true,
      tokens: ["mock_token_a"],
    },
    {
      _id: testUserBId,
      firstName: "Test",
      lastName: "UserB",
      phone: "+966500000002",
      email: "userb@example.com",
      role: "user",
      isActive: true,
      tokens: ["mock_token_b"],
    },
  ]);

  try {
    let universalCardCode = null;
    let specificCardCode = null;

    // ----------------------------------------------------
    // TEST 1: Admin creates a gift card for EVERYONE (code automatically randomly generated)
    // ----------------------------------------------------
    console.log("\n▶ TEST 1: Admin creates a gift card for EVERYONE (code randomly generated)");
    {
      const { req, res } = mockReqRes({
        user: { _id: testAdminId },
        body: {
          amount: 100,
          title: "100 SAR Universal Voucher",
          targetType: "ALL",
        },
      });

      await createGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 201, "Should return 201 Created");
      const data = res.getResponseData();
      assert.strictEqual(data.success, true);
      assert.ok(data.data.code, "Code must be automatically generated");
      assert.strictEqual(data.data.code.length, 12, "Default generated code length must be 12");
      assert.ok(/^[A-Z0-9]+$/.test(data.data.code), "Code must be uppercase alphanumeric");
      assert.strictEqual(data.data.amount, 100);
      assert.strictEqual(data.data.targetType, "ALL");
      universalCardCode = data.data.code;
      console.log(`✔ Universal gift card randomly generated code: ${universalCardCode}`);
    }

    // ----------------------------------------------------
    // TEST 2: Admin creates a gift card for PARTICULAR USER (User B) (randomly generated)
    // ----------------------------------------------------
    console.log("\n▶ TEST 2: Admin creates a gift card for PARTICULAR USER (User B) (code randomly generated)");
    {
      const { req, res } = mockReqRes({
        user: { _id: testAdminId },
        body: {
          code: "MANUAL_CODE_IGNORED", // Attempting manual code must be ignored, strictly random code generated
          amount: 50,
          title: "50 SAR Exclusive Voucher",
          targetType: "SPECIFIC_USER",
          applicableUser: testUserBId.toString(),
        },
      });

      await createGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 201);
      const data = res.getResponseData();
      assert.strictEqual(data.success, true);
      assert.notStrictEqual(data.data.code, "MANUAL_CODE_IGNORED", "Admin cannot specify manual code!");
      assert.ok(/^[A-Z0-9]+$/.test(data.data.code), "Code must be uppercase alphanumeric");
      assert.strictEqual(data.data.amount, 50);
      assert.strictEqual(data.data.targetType, "SPECIFIC_USER");
      assert.strictEqual(data.data.applicableUser.toString(), testUserBId.toString());
      specificCardCode = data.data.code;
      console.log(`✔ Specific user gift card randomly generated code: ${specificCardCode}`);
    }

    // ----------------------------------------------------
    // TEST 3: User A checks initial wallet (should be auto-initialized to 0)
    // ----------------------------------------------------
    console.log("\n▶ TEST 3: User A retrieves wallet initially");
    {
      const { req, res } = mockReqRes({ user: { _id: testUserAId } });
      await getUserWallet(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const data = res.getResponseData();
      assert.strictEqual(data.data.balance, 0, "Initial balance should be 0");
      assert.strictEqual(data.data.currency, "SAR");
      console.log("✔ User A initial wallet is 0 SAR.");
    }

    // ----------------------------------------------------
    // TEST 4: User A redeems universal gift card (adds 100 SAR)
    // ----------------------------------------------------
    console.log(`\n▶ TEST 4: User A redeems randomly generated universal card ${universalCardCode}`);
    {
      const { req, res } = mockReqRes({
        user: { _id: testUserAId },
        body: { code: universalCardCode, amount: 100 },
      });

      await redeemGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const data = res.getResponseData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.wallet.balance, 100, "Wallet balance should be 100");
      assert.strictEqual(data.data.transaction.amount, 100);
      assert.strictEqual(data.data.transaction.balanceAfter, 100);
      assert.strictEqual(data.data.transaction.transactionType, "gift_card_redeem");

      // Verify DB record
      const walletDb = await UserWallet.findOne({ user: testUserAId });
      assert.strictEqual(walletDb.balance, 100);

      const txDb = await UserWalletTransaction.findOne({ user: testUserAId });
      assert.strictEqual(txDb.amount, 100);
      assert.strictEqual(txDb.giftCardCode, universalCardCode);

      console.log("✔ User A successfully redeemed gift card and wallet credited 100 SAR.");
    }

    // ----------------------------------------------------
    // TEST 5: User A attempts to redeem SAME universal gift card again (MUST FAIL)
    // ----------------------------------------------------
    console.log(`\n▶ TEST 5: User A attempts to redeem ${universalCardCode} second time`);
    {
      const { req, res } = mockReqRes({
        user: { _id: testUserAId },
        body: { code: universalCardCode },
      });

      await redeemGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 400, "Should reject duplicate claim");
      const data = res.getResponseData();
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes("already redeemed"), "Message should mention already redeemed");

      const walletDb = await UserWallet.findOne({ user: testUserAId });
      assert.strictEqual(walletDb.balance, 100, "Wallet balance should remain 100 SAR");
      console.log("✔ User A blocked from redeeming again. One-time claim rule enforced!");
    }

    // ----------------------------------------------------
    // TEST 6: User B redeems the SAME universal gift card (SHOULD SUCCEED ONCE)
    // ----------------------------------------------------
    console.log(`\n▶ TEST 6: User B redeems ${universalCardCode} (Universal gift card for everyone)`);
    {
      const { req, res } = mockReqRes({
        user: { _id: testUserBId },
        body: { code: universalCardCode },
      });

      await redeemGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const data = res.getResponseData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.wallet.balance, 100);

      console.log("✔ User B successfully redeemed universal gift card once.");
    }

    // ----------------------------------------------------
    // TEST 7: User A tries to redeem User B's SPECIFIC_USER gift card (MUST FAIL)
    // ----------------------------------------------------
    console.log(`\n▶ TEST 7: User A attempts to redeem User B's specific gift card ${specificCardCode}`);
    {
      const { req, res } = mockReqRes({
        user: { _id: testUserAId },
        body: { code: specificCardCode },
      });

      await redeemGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 403, "Should return 403 Forbidden");
      const data = res.getResponseData();
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes("reserved for a specific user"));

      console.log("✔ Unauthorized user blocked from redeeming targeted gift card.");
    }

    // ----------------------------------------------------
    // TEST 8: User B redeems their SPECIFIC_USER gift card (SHOULD SUCCEED)
    // ----------------------------------------------------
    console.log(`\n▶ TEST 8: User B redeems their assigned gift card ${specificCardCode}`);
    {
      const { req, res } = mockReqRes({
        user: { _id: testUserBId },
        body: { code: specificCardCode, amount: 50 },
      });

      await redeemGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const data = res.getResponseData();
      assert.strictEqual(data.data.wallet.balance, 150, "User B balance: 100 previous + 50 = 150");

      console.log("✔ User B successfully redeemed specific gift card. Balance now 150 SAR.");
    }

    // ----------------------------------------------------
    // TEST 9: User B attempts to redeem their SPECIFIC_USER gift card again (MUST FAIL)
    // ----------------------------------------------------
    console.log(`\n▶ TEST 9: User B attempts second claim of ${specificCardCode}`);
    {
      const { req, res } = mockReqRes({
        user: { _id: testUserBId },
        body: { code: specificCardCode },
      });

      await redeemGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 400);
      const walletDb = await UserWallet.findOne({ user: testUserBId });
      assert.strictEqual(walletDb.balance, 150, "Balance must not increase");

      console.log("✔ Specific user gift card blocked from second claim.");
    }

    // ----------------------------------------------------
    // TEST 10: User enters mismatched amount (MUST FAIL)
    // ----------------------------------------------------
    console.log("\n▶ TEST 10: User enters mismatched amount validation");
    {
      // Create a card via controller (which auto-generates the code)
      const { req: createReq, res: createRes } = mockReqRes({
        user: { _id: testAdminId },
        body: { amount: 80, targetType: "ALL" },
      });
      await createGiftCard(createReq, createRes);
      const mismatchCardCode = createRes.getResponseData().data.code;

      const { req, res } = mockReqRes({
        user: { _id: testUserAId },
        body: { code: mismatchCardCode, amount: 50 }, // Mismatched 50 vs 80
      });

      await redeemGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 400);
      const data = res.getResponseData();
      assert.ok(data.message.includes("does not match"), "Error must mention amount mismatch");
      console.log("✔ Amount validation works properly when user enters amount.");
    }

    // ----------------------------------------------------
    // TEST 11: Transaction history is properly tracked
    // ----------------------------------------------------
    console.log("\n▶ TEST 11: User B queries wallet transaction history");
    {
      const { req, res } = mockReqRes({
        user: { _id: testUserBId },
        query: { page: 1, limit: 10 },
      });

      await getUserWalletTransactions(req, res);
      assert.strictEqual(res.getStatusCode(), 200);
      const data = res.getResponseData();
      assert.strictEqual(data.total, 2, "User B should have 2 transactions");
      assert.strictEqual(data.data[0].balanceAfter, 150);
      assert.strictEqual(data.data[1].balanceAfter, 100);
      console.log("✔ Transaction history returned correctly with pagination.");
    }

    // ----------------------------------------------------
    // TEST 12: Ensure existing Provider Wallet model is completely unpolluted
    // ----------------------------------------------------
    console.log("\n▶ TEST 12: Verify provider Wallet collection is completely separate");
    {
      const providerWallets = await Wallet.find({ user: { $in: [testUserAId, testUserBId] } });
      assert.strictEqual(providerWallets.length, 0, "No records should exist in provider Wallet model");
      console.log("✔ Confirmed: UserWallet is cleanly separated and existing Wallet is completely untouched.");
    }

    // ----------------------------------------------------
    // TEST 13: Auto-generate unique 8 to 16 alphanumeric gift card code
    // ----------------------------------------------------
    console.log("\n▶ TEST 13: Auto-generate unique 8 to 16 alphanumeric gift card code");
    let autoGeneratedCode = null;
    {
      // 13a: Without specifying code (default length 12)
      const { req, res } = mockReqRes({
        user: { _id: testAdminId },
        body: {
          amount: 75,
          title: "Auto Generated Voucher",
          targetType: "ALL",
        },
      });

      await createGiftCard(req, res);
      assert.strictEqual(res.getStatusCode(), 201);
      const data = res.getResponseData();
      assert.strictEqual(data.success, true);
      assert.ok(data.data.code, "Code must be automatically generated");
      assert.strictEqual(data.data.code.length, 12, "Default generated code length must be 12");
      assert.ok(/^[A-Z0-9]+$/.test(data.data.code), "Code must be uppercase alphanumeric");
      autoGeneratedCode = data.data.code;
      console.log(`✔ Auto-generated unique 12-char code: ${autoGeneratedCode}`);

      // 13b: Custom code length (16 characters)
      const { req: req16, res: res16 } = mockReqRes({
        user: { _id: testAdminId },
        body: {
          amount: 25,
          codeLength: 16,
          title: "16-Char Auto Voucher",
          targetType: "ALL",
        },
      });

      await createGiftCard(req16, res16);
      assert.strictEqual(res16.getStatusCode(), 201);
      const data16 = res16.getResponseData();
      assert.strictEqual(data16.data.code.length, 16, "Generated code length must be 16");
      assert.ok(/^[A-Z0-9]+$/.test(data16.data.code), "16-char code must be uppercase alphanumeric");
      console.log(`✔ Auto-generated unique 16-char code: ${data16.data.code}`);

      // 13c: User A redeems the auto-generated code
      const { req: redeemReq, res: redeemRes } = mockReqRes({
        user: { _id: testUserAId },
        body: { code: autoGeneratedCode },
      });

      await redeemGiftCard(redeemReq, redeemRes);
      assert.strictEqual(redeemRes.getStatusCode(), 200);
      const redeemData = redeemRes.getResponseData();
      assert.strictEqual(redeemData.data.wallet.balance, 175, "User A balance: 100 previous + 75 = 175");
      console.log(`✔ User A successfully redeemed auto-generated code ${autoGeneratedCode}.`);
    }

    // ----------------------------------------------------
    // TEST 14: User queries available gift cards (Universal + Assigned cards to redeem)
    // ----------------------------------------------------
    console.log("\n▶ TEST 14: User queries available gift cards (Universal + Assigned cards)");
    {
      // Create a fresh card assigned specifically to User A
      const { req: reqAssignA, res: resAssignA } = mockReqRes({
        user: { _id: testAdminId },
        body: {
          amount: 60,
          title: "Special Bonus for User A",
          targetType: "SPECIFIC_USER",
          applicableUser: testUserAId.toString(),
        },
      });
      await createGiftCard(reqAssignA, resAssignA);
      const cardForUserA = resAssignA.getResponseData().data;

      // Create a fresh universal card for everyone
      const { req: reqUniv, res: resUniv } = mockReqRes({
        user: { _id: testAdminId },
        body: {
          amount: 40,
          title: "Fresh Universal Promo",
          targetType: "ALL",
        },
      });
      await createGiftCard(reqUniv, resUniv);
      const freshUnivCard = resUniv.getResponseData().data;

      // 14a: User A queries available gift cards (default status="available")
      const { req: userAReq, res: userARes } = mockReqRes({
        user: { _id: testUserAId },
      });
      await getAvailableGiftCards(userAReq, userARes);
      assert.strictEqual(userARes.getStatusCode(), 200);
      const userACards = userARes.getResponseData().data;

      // User A should see:
      // 1. Their specifically assigned card (cardForUserA)
      // 2. The fresh universal promo (freshUnivCard)
      // 3. But NOT see the card assigned to User B (specificCardCode)
      // 4. And NOT see cards they already redeemed!
      const userACardCodes = userACards.map((c) => c.code);
      assert.ok(userACardCodes.includes(cardForUserA.code), "User A should see card specifically assigned to them");
      assert.ok(userACardCodes.includes(freshUnivCard.code), "User A should see universal card");
      assert.ok(!userACardCodes.includes(specificCardCode), "User A must NOT see card assigned to User B");
      assert.ok(!userACardCodes.includes(universalCardCode), "User A must NOT see already redeemed card in available list");

      const assignedCardObj = userACards.find((c) => c.code === cardForUserA.code);
      assert.strictEqual(assignedCardObj.isAssignedToYou, true, "isAssignedToYou should be true for specific card");
      assert.strictEqual(assignedCardObj.isRedeemed, false, "isRedeemed should be false");

      const univCardObj = userACards.find((c) => c.code === freshUnivCard.code);
      assert.strictEqual(univCardObj.isAssignedToYou, false, "isAssignedToYou should be false for universal card");
      console.log(`✔ User A sees assigned card (${cardForUserA.code}) & universal card (${freshUnivCard.code}) to redeem.`);

      // 14b: User A queries status="all" to see both available and redeemed cards with status flags
      const { req: userAAllReq, res: userAAllRes } = mockReqRes({
        user: { _id: testUserAId },
        query: { status: "all" },
      });
      await getAvailableGiftCards(userAAllReq, userAAllRes);
      assert.strictEqual(userAAllRes.getStatusCode(), 200);
      const allCards = userAAllRes.getResponseData().data;
      const redeemedCardObj = allCards.find((c) => c.code === universalCardCode);
      assert.ok(redeemedCardObj, "Redeemed card should appear in status=all list");
      assert.strictEqual(redeemedCardObj.isRedeemed, true, "isRedeemed should be true");
      assert.ok(redeemedCardObj.redeemedAt, "redeemedAt timestamp must be present");
      console.log("✔ Querying status='all' returns available and redeemed cards with flags.");

      // 14c: User A redeems the assigned card directly using code from the list
      const { req: redeemAssignedReq, res: redeemAssignedRes } = mockReqRes({
        user: { _id: testUserAId },
        body: { code: cardForUserA.code },
      });
      await redeemGiftCard(redeemAssignedReq, redeemAssignedRes);
      assert.strictEqual(redeemAssignedRes.getStatusCode(), 200);
      assert.strictEqual(redeemAssignedRes.getResponseData().data.wallet.balance, 235, "Balance: 175 + 60 = 235");
      console.log("✔ User A successfully redeemed their assigned card directly.");
    }

    console.log("\n==================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");
  } finally {
    // Cleanup
    await User.deleteMany({
      $or: [
        { _id: { $in: [testUserAId, testUserBId] } },
        { phone: { $in: ["+966500000001", "+966500000002"] } }
      ]
    });
    await UserWallet.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
    await UserWalletTransaction.deleteMany({ user: { $in: [testUserAId, testUserBId] } });
    await GiftCard.deleteMany({ code: { $in: ["TEST_ALL_100", "TEST_SPECIFIC_50", "TEST_MISMATCH_80"] } });
    await mongoose.connection.close();
  }
}

runTestSuite().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
