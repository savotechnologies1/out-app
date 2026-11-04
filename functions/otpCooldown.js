const OTP_COOLDOWN_MS = 2 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getOtpExpiry(account) {
  return (
    validDate(account.otpExpiresAt) ||
    (validDate(account.otpSentAt)
      ? new Date(validDate(account.otpSentAt).getTime() + OTP_TTL_MS)
      : null)
  );
}

function isOtpValid(account, otp, now = new Date()) {
  const currentExpiry = getOtpExpiry(account);
  if (
    account.OTP === otp &&
    currentExpiry &&
    currentExpiry > now
  ) {
    return true;
  }

  return (account.otpHistory || []).some((entry) => {
    const expiresAt = validDate(entry.expiresAt);
    return entry.code === otp && expiresAt && expiresAt > now;
  });
}

function getRetryAfterSeconds(otpSentAt, now = Date.now()) {
  const sentAt = validDate(otpSentAt);
  if (!sentAt) return 0;
  const remainingMs = OTP_COOLDOWN_MS - (now - sentAt.getTime());
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

async function issueOtp({ Model, account, otp, sendOtp, fcmToken }) {
  const now = new Date();
  const retryAfterSeconds = getRetryAfterSeconds(account.otpSentAt, now.getTime());
  if (retryAfterSeconds > 0) {
    return { cooldownActive: true, retryAfterSeconds, account };
  }

  const oldOtpExpiry = getOtpExpiry(account);
  const otpHistory = (account.otpHistory || []).filter((entry) => {
    const expiresAt = validDate(entry.expiresAt);
    return entry.code && expiresAt && expiresAt > now;
  });

  // Keep an older, unexpired code valid when issuing a later code.
  if (account.OTP && oldOtpExpiry && oldOtpExpiry > now) {
    otpHistory.push({ code: account.OTP, expiresAt: oldOtpExpiry });
  }

  const filter = { _id: account._id };
  const previousSentAt = validDate(account.otpSentAt);
  if (previousSentAt) {
    filter.otpSentAt = account.otpSentAt;
  } else {
    // Matches both legacy documents with no timestamp and explicit null values.
    filter.otpSentAt = { $in: [null] };
  }

  const sentAt = now;
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const set = {
    OTP: otp,
    otpSentAt: sentAt,
    otpExpiresAt: expiresAt,
    otpHistory,
  };
  if (fcmToken) set.fcmToken = fcmToken;

  // Compare-and-set makes cooldown enforcement safe under concurrent requests.
  const result = await Model.updateOne(filter, { $set: set });
  const matchedCount = result.matchedCount ?? result.n ?? 0;
  if (matchedCount === 0) {
    const latestAccount = await Model.findById(account._id).lean();
    return {
      cooldownActive: true,
      retryAfterSeconds: Math.max(
        1,
        getRetryAfterSeconds(latestAccount?.otpSentAt, Date.now())
      ),
      account: latestAccount || account,
    };
  }

  // Persist the OTP before delivery so concurrent login attempts see the
  // cooldown. If delivery reports an ambiguous failure, don't send duplicates.
  await sendOtp(otp);
  return { cooldownActive: false, sentAt, expiresAt, account };
}

function sendCooldownResponse(res, account, retryAfterSeconds) {
  return res.status(429).json({
    success: false,
    cooldownActive: true,
    retryAfterSeconds,
    data: account ? { id: account._id } : null,
    message: `Please wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'} before requesting a new OTP`,
  });
}

module.exports = {
  OTP_COOLDOWN_MS,
  OTP_TTL_MS,
  getOtpExpiry,
  isOtpValid,
  getRetryAfterSeconds,
  issueOtp,
  sendCooldownResponse,
};
