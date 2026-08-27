const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const { createLog } = require("../functions/common");
const APIErrorLog = createLog("API_error_log");
const User = require("../models/User");

const verifyJwt = promisify(jwt.verify);

const validateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Token not found. Please log in to your account" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = await verifyJwt(token, process.env.JWT_SECRET);
      
    } catch (err) {
      return res
        .status(401)
        .json({ message: "Invalid token. Please re-login." });
    }

    const user = await User.findOne(
      { _id: decoded.user._id },
      { tokens: 1, email: 1, role: 1, isActive: 1 }
    ).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.tokens.includes(token)) {
      return res.status(401).json({ message: "Invalid token. Please re-login." });
    }

    if (user.role !== "user") {
      return res.status(403).json({ message: "Access denied. Not a user." });
    }

    if (!user.isActive) {
      return res.status(403).send({ message: "Your account is suspended contact support" })
    }
    if (user.isDeleted) {
      return res.status(403).send({ message: "Your account is permanent deleted." })
    }

    req.user = {
      _id: user._id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    APIErrorLog.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

module.exports = validateToken;
