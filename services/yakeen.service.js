const axios = require("axios");
const { createLog } = require("../functions/common");

const yakeenLog = createLog("yakeen_service_log");

/* =====================================================
   In-Memory Token Store
====================================================== */

let cachedToken = null;
let tokenExpiresAt = null;

/* =====================================================
   YAKEEN Login — Authenticate & Cache Token
====================================================== */

const login = async () => {
  try {
    const loginUrl =
      process.env.YAKEEN_LOGIN_URL ||
      `${process.env.YAKEEN_BASE_URL}/api/v3/yakeen/login`;

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
   console.log("loginresponse", response)
    const data = response.data;

    if (!data || !data.accessToken) {
      throw new Error("YAKEEN login response missing accessToken");
    }

    cachedToken = data.accessToken;

    // Default 55 minutes if no expiry returned (tokens typically last 1h)
    const expiresInMs = (data.expiresIn || 3300) * 1000;
    tokenExpiresAt = Date.now() + expiresInMs;

    yakeenLog.info("YAKEEN login success");

    return cachedToken;
  } catch (error) {
    yakeenLog.error(
      `YAKEEN login failure: ${error.message}`
    );
    throw new Error("YAKEEN authentication failed");
  }
};

/* =====================================================
   Get Valid Token — Reuse or Re-login
====================================================== */

const getToken = async () => {
  // Reuse cached token if still valid (with 60s buffer)
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  return await login();
};

/* =====================================================
   YAKEEN Verification — Fetch Identity Data
====================================================== */

const verifyIdentity = async ({ identityType, identityNumber, dateOfBirth }) => {
  try {
    const token = await getToken();

    const serviceIdentifier =
      identityType === "SAUDI"
        ? process.env.YAKEEN_SAUDI_SERVICE_IDENTIFIER
        : process.env.YAKEEN_RESIDENT_SERVICE_IDENTIFIER;

    const query =
      identityType === "SAUDI"
        ? { nin: identityNumber, dateOfBirth }
        : { iqama: identityNumber, dateOfBirth };

    const verificationUrl =
      `${process.env.YAKEEN_BASE_URL}/api/v1/yakeen/data`;

    yakeenLog.info(
      `YAKEEN verification request: type=${identityType}, id=${identityNumber}`
    );

    const response = await axios.get(verificationUrl, {
      params: query,
      headers: {
        Authorization: `Bearer ${token}`,
        "service-identifier": serviceIdentifier,
        "usage-code": process.env.YAKEEN_USAGE_CODE,
        "operator-id": process.env.YAKEEN_OPERATOR_ID,
        "app-id": process.env.YAKEEN_APP_ID,
        "app-key": process.env.YAKEEN_APP_KEY,
      },
      timeout: 30000,
    });

    yakeenLog.info(
      `YAKEEN verification response: type=${identityType}, status=${response.status}`
    );
      
    console.log("service response", response)
    return response.data;
  } catch (error) {
    // If 401 => token expired, retry once
    if (error.response && error.response.status === 401) {
      yakeenLog.info("YAKEEN token expired, re-authenticating...");

      cachedToken = null;
      tokenExpiresAt = null;

      const newToken = await getToken();

      const serviceIdentifier =
        identityType === "SAUDI"
          ? process.env.YAKEEN_SAUDI_SERVICE_IDENTIFIER
          : process.env.YAKEEN_RESIDENT_SERVICE_IDENTIFIER;

      const query =
        identityType === "SAUDI"
          ? { nin: identityNumber, dateOfBirth }
          : { iqama: identityNumber, dateOfBirth };

      const retryResponse = await axios.get(
        `${process.env.YAKEEN_BASE_URL}/api/v1/yakeen/data`,
        {
          params: query,
          headers: {
            Authorization: `Bearer ${newToken}`,
            "service-identifier": serviceIdentifier,
            "usage-code": process.env.YAKEEN_USAGE_CODE,
            "operator-id": process.env.YAKEEN_OPERATOR_ID,
            "app-id": process.env.YAKEEN_APP_ID,
            "app-key": process.env.YAKEEN_APP_KEY,
          },
          timeout: 30000,
        }
      );

      yakeenLog.info(
        `YAKEEN verification retry response: type=${identityType}, status=${retryResponse.status}`
      );
      console.log("service response", retryResponse)
      return retryResponse.data;
    }

    yakeenLog.error(
      `YAKEEN verification error: ${error.message}`
    );

    if (error.response && error.response.data) {
      const msg =
        error.response.data.message ||
        error.response.data.error ||
        "YAKEEN verification failed";
      throw new Error(msg);
    }

    throw new Error("YAKEEN service unavailable. Please try again later.");
  }
};

module.exports = {
  login,
  getToken,
  verifyIdentity,
};
