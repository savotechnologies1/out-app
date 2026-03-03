const jwt = require("jsonwebtoken");
const { createLog } = require("../functions/common");
const APIErrorLog = createLog("API_error_log");
const Admin = require("../models/Admin");

const validateAdminToken = async (req, res, next) => {
  try {
    let token = req.headers.authorization;

    if (!token) {
      return res.status(401).send({ message: 'Token not found' });
    }

    if (token.startsWith("Bearer ")) {
      token = token.split(" ")[1];
    }

    if (!token) {
      return res.status(401).send({ message: 'Invalid token format' });
    }

    const decoded = (jwt.verify(token, process.env.JWT_SECRET)).user;


    const query = {
      _id: decoded._id,
      isDeleted: false,
      tokens: { $in: [token] }
    };

    let account = await Admin.findOne(query, { firstName: 1, lastName: 1, email: 1 }).lean();

    if (!account) {
      return res.status(401).send({ message: 'Token revoked. Please login again.' });
    }

    req.user = account;
    next();

  } catch (error) {
    APIErrorLog.error(error);
    return res.status(401).send({ message: 'Invalid or expired token' });
  }
};



module.exports = validateAdminToken;
