const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OTP_COOLDOWN_MS,
  OTP_TTL_MS,
  getOtpExpiry,
  isOtpValid,
  getRetryAfterSeconds,
  issueOtp,
} = require("../functions/otpCooldown");

function fakeModel(initialAccount) {
  let account = { ...initialAccount, otpHistory: initialAccount.otpHistory || [] };
  return {
    get account() {
      return account;
    },
    async updateOne(filter, update) {
      const timestampMatches = filter.otpSentAt?.$in
        ? account.otpSentAt == null
        : account.otpSentAt?.getTime() === filter.otpSentAt?.getTime();
      if (account._id !== filter._id || !timestampMatches) {
        return { matchedCount: 0 };
      }
      account = { ...account, ...update.$set };
      return { matchedCount: 1 };
    },
    findById() {
      return { lean: async () => ({ ...account }) };
    },
  };
}

test("cooldown returns remaining seconds and rounds up", () => {
  const now = Date.now();
  assert.equal(getRetryAfterSeconds(new Date(now - 119_100), now), 1);
  assert.equal(getRetryAfterSeconds(new Date(now - OTP_COOLDOWN_MS), now), 0);
});

test("blocked request neither changes nor sends a new OTP", async () => {
  const sentAt = new Date(Date.now() - 30_000);
  const account = { _id: "user-1", OTP: "1234", otpSentAt: sentAt };
  const Model = fakeModel(account);
  let sendCount = 0;

  const result = await issueOtp({
    Model,
    account,
    otp: "5678",
    sendOtp: async () => sendCount++,
  });

  assert.equal(result.cooldownActive, true);
  assert.equal(sendCount, 0);
  assert.equal(Model.account.OTP, "1234");
  assert.equal(Model.account.otpSentAt, sentAt);
});

test("current and superseded OTPs remain valid only until expiry", () => {
  const now = new Date();
  const account = {
    OTP: "5678",
    otpExpiresAt: new Date(now.getTime() + 60_000),
    otpHistory: [
      { code: "1234", expiresAt: new Date(now.getTime() + 30_000) },
      { code: "9999", expiresAt: new Date(now.getTime() - 1_000) },
    ],
  };

  assert.equal(isOtpValid(account, "5678", now), true);
  assert.equal(isOtpValid(account, "1234", now), true);
  assert.equal(isOtpValid(account, "9999", now), false);
  assert.equal(isOtpValid(account, "0000", now), false);
});

test("new request after cooldown preserves an older unexpired code", async () => {
  const sentAt = new Date(Date.now() - OTP_COOLDOWN_MS - 1_000);
  const expiresAt = new Date(sentAt.getTime() + OTP_TTL_MS);
  const account = {
    _id: "user-1",
    OTP: "1234",
    otpSentAt: sentAt,
    otpExpiresAt: expiresAt,
  };
  const Model = fakeModel(account);
  let sentCode;

  const result = await issueOtp({
    Model,
    account,
    otp: "5678",
    sendOtp: async (code) => {
      sentCode = code;
    },
  });

  assert.equal(result.cooldownActive, false);
  assert.equal(sentCode, "5678");
  assert.equal(Model.account.OTP, "5678");
  assert.deepEqual(Model.account.otpHistory, [
    { code: "1234", expiresAt },
  ]);
  assert.equal(getOtpExpiry(Model.account).getTime(), Model.account.otpExpiresAt.getTime());
});

test("concurrent requests can only claim one OTP send", async () => {
  const sentAt = new Date(Date.now() - OTP_COOLDOWN_MS - 1_000);
  const account = {
    _id: "user-1",
    OTP: "1234",
    otpSentAt: sentAt,
    otpExpiresAt: new Date(Date.now() + 60_000),
  };
  const Model = fakeModel(account);
  let sendCount = 0;
  const request = (otp) =>
    issueOtp({
      Model,
      account: { ...account },
      otp,
      sendOtp: async () => {
        sendCount++;
      },
    });

  const results = await Promise.all([request("5678"), request("9012")]);

  assert.equal(sendCount, 1);
  assert.equal(results.filter((result) => result.cooldownActive).length, 1);
});
