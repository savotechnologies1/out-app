const axios = require("axios");
const { createLog } = require("../functions/common");

const yakeenLog = createLog("yakeen_service_log");

/* =====================================================
   In-Memory Token Store
====================================================== */

let cachedToken = null;
let tokenExpiresAt = null;

/* =====================================================
   Safe Axios Error Logger — never log full response
====================================================== */

const safeLogAxiosError = (label, error) => {
  const info = {
    label,
    message: error.message || "Unknown error",
    code: error.code || null,
    status: error.response?.status || null,
    statusText: error.response?.statusText || null,
    responseData: error.response?.data || null,
    url: error.config?.url || null,
    method: error.config?.method || null,
  };
  console.error(`[YAKEEN] ${label}:`, JSON.stringify(info, null, 2));
  yakeenLog.error(`${label}: ${JSON.stringify(info)}`);
};

/* =====================================================
   YAKEEN Login — Authenticate & Cache Token
====================================================== */

const login = async () => {
  const loginUrl =
    process.env.YAKEEN_LOGIN_URL ||
    `${process.env.YAKEEN_BASE_URL}/api/v3/yakeen/login`;

  console.log("[YAKEEN] Login attempt:", loginUrl);

  try {
    const response = await axios.post(
      loginUrl,
      {
        username: process.env.YAKEEN_USERNAME,
        password: process.env.YAKEEN_PASSWORD,
      },
      {
        headers: {
          "app-id": process.env.YAKEEN_APP_ID,
          "app-key": process.env.YAKEEN_APP_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    console.log("[YAKEEN] Login response status:", response.status);
    console.log("[YAKEEN] Login response data keys:", Object.keys(response.data || {}));

    const data = response.data;

    if (!data || !data.accessToken) {
      console.error("[YAKEEN] Login response missing accessToken. Keys received:", Object.keys(data || {}));
      throw new Error("YAKEEN login response missing accessToken");
    }

    cachedToken = data.accessToken;

    // Default 55 minutes if no expiry returned (tokens typically last 1h)
    const expiresInMs = (data.expiresIn || 3300) * 1000;
    tokenExpiresAt = Date.now() + expiresInMs;

    console.log("[YAKEEN] Login success, token cached");
    yakeenLog.info("YAKEEN login success");

    return cachedToken;
  } catch (error) {
    safeLogAxiosError("Login failure", error);
    throw new Error("YAKEEN authentication failed");
  }
};

/* =====================================================
   Get Valid Token — Reuse or Re-login
====================================================== */

const getToken = async () => {
  try {
    // Reuse cached token if still valid (with 60s buffer)
    if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 60000) {
      console.log("[YAKEEN] Using cached token");
      return cachedToken;
    }

    console.log("[YAKEEN] Token expired or not cached, logging in...");
    const token = await login();
    return token;
  } catch (error) {
    console.error("[YAKEEN] getToken error during login:", error.message);
    throw error;
  }
};

/* =====================================================
   Build verification request config
====================================================== */

const buildVerificationConfig = (identityType, identityNumber, dateOfBirth, token) => {
  const serviceIdentifier =
    identityType === "SAUDI"
      ? process.env.YAKEEN_SAUDI_SERVICE_IDENTIFIER
      : process.env.YAKEEN_RESIDENT_SERVICE_IDENTIFIER;

  const query =
    identityType === "SAUDI"
      ? { nin: identityNumber, dateOfBirth }
      : { iqama: identityNumber, dateOfBirth };

  const url = `${process.env.YAKEEN_BASE_URL}/api/v1/yakeen/data`;

  const headers = {
    Authorization: `Bearer ${token}`,
    "service-identifier": serviceIdentifier,
    "usage-code": process.env.YAKEEN_USAGE_CODE,
    "operator-id": process.env.YAKEEN_OPERATOR_ID,
    "app-id": process.env.YAKEEN_APP_ID,
    "app-key": process.env.YAKEEN_APP_KEY,
  };

  return { url, params: query, headers, timeout: 30000 };
};

/* =====================================================
   YAKEEN Verification — Fetch Identity Data
====================================================== */

const verifyIdentity = async ({ identityType, identityNumber, dateOfBirth }) => {

  console.log("========== YAKEEN VERIFY IDENTITY ==========");
  console.log("[YAKEEN] Type:", identityType);
  console.log("[YAKEEN] ID:", identityNumber);
  console.log("[YAKEEN] DOB:", dateOfBirth);
  console.log("=============================================");

  let token;

  try {
    token = await getToken();
  } catch (loginError) {
    console.error("[YAKEEN] Token acquisition failed:", loginError.message);
    throw new Error("YAKEEN authentication failed. Please try again later.");
  }

  const config = buildVerificationConfig(identityType, identityNumber, dateOfBirth, token);

  console.log("[YAKEEN] Verification URL:", config.url);
  console.log("[YAKEEN] Verification params:", JSON.stringify(config.params));

  yakeenLog.info(
    `YAKEEN verification request: type=${identityType}, id=${identityNumber}`
  );

  // First attempt
  try {
    const response = await axios.get(config.url, {
      params: config.params,
      headers: config.headers,
      timeout: config.timeout,
    });

    console.log("[YAKEEN] Verification response status:", response.status);
    console.log("[YAKEEN] Verification response data:", JSON.stringify(response.data));

    yakeenLog.info(
      `YAKEEN verification response: type=${identityType}, status=${response.status}`
    );

    return response.data;

  } catch (error) {

    // If 401 => token expired, retry once with fresh token
    if (error.response && error.response.status === 401) {
      console.log("[YAKEEN] Got 401, re-authenticating for retry...");
      yakeenLog.info("YAKEEN token expired, re-authenticating...");

      cachedToken = null;
      tokenExpiresAt = null;

      try {
        const newToken = await getToken();
        const retryConfig = buildVerificationConfig(identityType, identityNumber, dateOfBirth, newToken);

        const retryResponse = await axios.get(retryConfig.url, {
          params: retryConfig.params,
          headers: retryConfig.headers,
          timeout: retryConfig.timeout,
        });

        console.log("[YAKEEN] Retry response status:", retryResponse.status);
        console.log("[YAKEEN] Retry response data:", JSON.stringify(retryResponse.data));

        yakeenLog.info(
          `YAKEEN verification retry response: type=${identityType}, status=${retryResponse.status}`
        );

        return retryResponse.data;

      } catch (retryError) {
        safeLogAxiosError("Retry verification failure", retryError);

        if (retryError.response && retryError.response.data) {
          const msg =
            retryError.response.data.message ||
            retryError.response.data.error ||
            "YAKEEN verification failed after retry";
          throw new Error(msg);
        }

        throw new Error("YAKEEN service unavailable after retry. Please try again later.");
      }
    }

    // Non-401 errors
    safeLogAxiosError("Verification failure", error);

    if (error.response && error.response.data) {
      const msg =
        error.response.data.message ||
        error.response.data.error ||
        "YAKEEN verification failed";
      throw new Error(msg);
    }

    if (error.code === "ECONNABORTED") {
      throw new Error("YAKEEN service timed out. Please try again later.");
    }

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error("YAKEEN service is unreachable. Please try again later.");
    }

    throw new Error("YAKEEN service unavailable. Please try again later.");
  }
};

module.exports = {
  login,
  getToken,
  verifyIdentity,
};
