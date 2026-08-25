const jwt = require("jsonwebtoken");
const { createLog } = require("../functions/common");
const APIErrorLog = createLog("API_error_log");
const ServiceUser = require("../models/ServiceUser");

const validateServiceToken = async (req, res, next) => {
  try {
    if (!req.headers.authorization) {
      return res
        .status(401)
        .json({ message: "Token not found. Please log in to your account" });
    }

    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET, async (err, verifiedJwt) => {
      if (err) {
        return res
          .status(401)
          .send({ message: "Invalid token please do re-login" });
      }

      if (verifiedJwt) {
        const user = await ServiceUser.findOne(
          { _id: verifiedJwt.user._id },
          { tokens: 1, email: 1, role: 1, isActive: 1 }
        ).lean();
        if (!user) return res.status(400).send({ message: "User not found" });

        if (!user.tokens.includes(token)) {
          return res
            .status(401)
            .send({ message: "Invalid token please do re-login" });
        }

        if (user.role !== "service_user") {
          return res
            .status(400)
            .send({ message: "You are not a service provider" });
        }

        if (!user.isActive) {
          return res.status(403).send({ message: "Your account is suspended contact support" })
        }

        if (user.isDeleted) {
          return res.status(403).send({ message: "Your account is permanent deleted." })
        }

        let newUser = {
          _id: user._id,
          role: user.role,
          email: user.email,
        };
        req.user = newUser;
        next();
      }
    });
  } catch (error) {
    APIErrorLog.error(error);

    return res.status(500).send({ message: "Something went wrong" });
  }
};

module.exports = validateServiceToken;
