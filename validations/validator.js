const { body } = require("express-validator");

const adminLoginValidation = [
  body("email")
    .exists({ checkFalsy: true })
    .withMessage("Please enter the email")
    .matches(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
    .withMessage("Please enter valid email Id"),
  body("password")
    .exists({ checkFalsy: true })
    .withMessage("Please enter the password")
    .matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[\W_])(?!.*\s).{8,}$/)
    .withMessage(
      "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character."
    ),
];

const loginBody = [
  body("mobile")
    .exists({ checkFalsy: true })
    .withMessage("Mobile number is required"),
  body("mobileCode")
    .exists({ checkFalsy: true })
    .withMessage("Mobile code is required"),
];

const verifyOtp = [
  body("otp").exists({ checkFalsy: true }).withMessage("OTP is required"),
];

const forgotPass = [
  body("email")
    .exists({ checkFalsy: true })
    .withMessage("Please enter the email")
    .matches(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
    .withMessage("Please enter valid email Id"),
];

const resetPass = [
  body("newPassword")
    .exists({ checkFalsy: true })
    .withMessage("Please enter the new Password"),
  body("confirmPassword")
    .exists({ checkFalsy: true })
    .withMessage("Please enter the confirm Password"),
];

const userSignUpBody = [
  body("salutation")
    .exists({ checkFalsy: true })
    .withMessage("Salutation is required"),
  body("firstName")
    .exists({ checkFalsy: true })
    .withMessage("Please enter the first name")
    .matches(/^[a-zA-Z ]{2,30}$/)
    .withMessage("Please enter valid first name"),
  body("lastName")
    .exists({ checkFalsy: true })
    .withMessage("Please enter the last name")
    .matches(/^[a-zA-Z ]{2,30}$/)
    .withMessage("Please enter valid last name"),
  body("mobile")
    .exists({ checkFalsy: true })
    .withMessage("Mobile number is required"),
  body("mobileCode")
    .exists({ checkFalsy: true })
    .withMessage("Mobile code is required"),
];

const otpValidation = [
  body("mobile")
    .exists({ checkFalsy: true })
    .withMessage("Mobile number is required"),
];

module.exports = {
  adminLoginValidation,
  loginBody,
  verifyOtp,
  userSignUpBody,
  otpValidation,
  forgotPass,
  resetPass,
};
