const app = require("express");
const router = app.Router();

const validateToken = require("../middleware/validateTokenHandler");
const { visitorUpload } = require("../middleware/visitorUpload");
const {
  verifyIdentityValidation,
} = require("../validations/identity.validator");

const {
  verifyIdentity,
  getVerificationStatus,
} = require("../controller/identity.controller");

/* =====================================================
   User Identity Routes
====================================================== */

router.post(
  "/verify",
  validateToken,
  visitorUpload.single("document"),
  verifyIdentityValidation,
  verifyIdentity
);

router.get("/status", validateToken, getVerificationStatus);

module.exports = router;
