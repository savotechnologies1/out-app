const { body } = require("express-validator");

/* =====================================================
   Verify Identity Validation (JSON body — Saudi/Resident)
====================================================== */

const verifyIdentityValidation = [
  body("identityType")
    .exists({ checkFalsy: true })
    .withMessage("Identity type is required")
    .isIn(["SAUDI", "RESIDENT", "VISITOR"])
    .withMessage("Identity type must be SAUDI, RESIDENT, or VISITOR"),

  body("identityNumber")
    .exists({ checkFalsy: true })
    .withMessage("Identity number is required")
    .isString()
    .withMessage("Identity number must be a string")
    .isLength({ min: 10, max: 10 })
    .withMessage("Identity number must be exactly 10 digits")
    .matches(/^\d{10}$/)
    .withMessage("Identity number must contain only digits"),

  body("dateOfBirth")
    .exists({ checkFalsy: true })
    .withMessage("Date of birth is required")
    .matches(/^\d{4}-(0[1-9]|1[0-2])(-([0-2]\d|3[01]))?$/)
    .withMessage("Date of birth must be in YYYY-MM or YYYY-MM-DD format"),
];

/* =====================================================
   Reject Visitor Validation
====================================================== */

const rejectVisitorValidation = [
  body("reason")
    .exists({ checkFalsy: true })
    .withMessage("Rejection reason is required")
    .isString()
    .withMessage("Rejection reason must be a string")
    .isLength({ min: 5, max: 500 })
    .withMessage("Rejection reason must be between 5 and 500 characters"),
];

module.exports = {
  verifyIdentityValidation,
  rejectVisitorValidation,
};
