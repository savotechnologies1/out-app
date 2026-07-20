const axios = require("axios");
const { createLog } = require("../functions/common");

const proxyLog = createLog("yakeen_proxy_log");

/* =====================================================
   YAKEEN Proxy Service Client
   ─────────────────────────────────────────────────────
   Calls the standalone YAKEEN Proxy Service deployed
   on a Saudi VPS instead of contacting YAKEEN directly.

   This file contains NO business logic — it only
   forwards the request and returns the raw response.
====================================================== */

/**
 * Verify identity through the YAKEEN Proxy Service.
 *
 * @param {{ identityType: string, identityNumber: string, dateOfBirth: string }} params
 * @returns {Promise<object>} — Raw JSON response from the proxy (same as YAKEEN)
 */
const verifyIdentity = async ({ identityType, identityNumber, dateOfBirth }) => {
  const proxyUrl = process.env.YAKEEN_PROXY_URL;
  const proxySecret = process.env.YAKEEN_PROXY_SECRET;
  const proxyTimeout = parseInt(process.env.YAKEEN_PROXY_TIMEOUT, 10) || 30000;

  if (!proxyUrl || !proxySecret) {
    const msg = "YAKEEN Proxy configuration missing (YAKEEN_PROXY_URL or YAKEEN_PROXY_SECRET)";
    console.error(`[YAKEEN PROXY] ${msg}`);
    proxyLog.error(msg);
    throw new Error(msg);
  }

  console.log(`[YAKEEN PROXY] Calling YAKEEN Proxy Service: ${proxyUrl}`);
  console.log(`[YAKEEN PROXY] Type: ${identityType}, ID: ${identityNumber}, DOB: ${dateOfBirth}`);
  proxyLog.info(
    `Calling YAKEEN Proxy Service: url=${proxyUrl}, type=${identityType}, id=${identityNumber}`
  );

  try {
    const response = await axios.post(
      proxyUrl,
      {
        identityType,
        identityNumber,
        dateOfBirth,
      },
      {
        headers: {
          Authorization: `Bearer ${proxySecret}`,
          "Content-Type": "application/json",
        },
        timeout: proxyTimeout,
      }
    );

    console.log(`[YAKEEN PROXY] Proxy Response Received — status: ${response.status}`);
    proxyLog.info(`Proxy Response Received: status=${response.status}`);

    // The proxy wraps YAKEEN data inside { success, message, data }
    // Return the inner data to match what yakeenService.verifyIdentity() used to return
    if (response.data && response.data.data !== undefined) {
      return response.data.data;
    }

    // Fallback: return the whole response body if no .data wrapper
    return response.data;
  } catch (error) {
    /* ── Build a clean error log (never log secrets) ── */
    const info = {
      message: error.message || "Unknown error",
      code: error.code || null,
      status: error.response?.status || null,
      statusText: error.response?.statusText || null,
      responseData: error.response?.data || null,
      url: proxyUrl,
    };

    console.error(`[YAKEEN PROXY] Proxy Error:`, JSON.stringify(info, null, 2));
    proxyLog.error(`Proxy Error: ${JSON.stringify(info)}`);

    /* ── Map proxy errors to meaningful messages ────── */

    // Timeout
    if (error.code === "ECONNABORTED") {
      throw new Error("YAKEEN service timed out. Please try again later.");
    }

    // Network failure
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error("YAKEEN service is unreachable. Please try again later.");
    }

    // Proxy returned an HTTP error
    if (error.response) {
      const proxyMsg =
        error.response.data?.message ||
        error.response.data?.error ||
        null;

      if (error.response.status === 401) {
        throw new Error("YAKEEN proxy authentication failed. Check YAKEEN_PROXY_SECRET.");
      }

      if (error.response.status === 422) {
        throw new Error(proxyMsg || "Validation failed at YAKEEN proxy.");
      }

      if (error.response.status === 503 || error.response.status === 504) {
        throw new Error(proxyMsg || "YAKEEN service unavailable. Please try again later.");
      }

      if (proxyMsg) {
        throw new Error(proxyMsg);
      }
    }

    throw new Error("YAKEEN service unavailable. Please try again later.");
  }
};

module.exports = {
  verifyIdentity,
};
