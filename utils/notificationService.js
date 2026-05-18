const admin = require("../config/firebase");
const Notification = require("../models/Notification");

const User = require("../models/User");
const ServiceUser = require("../models/ServiceUser");
const Admin = require("../models/Admin");

let io;
let onlineUsers;

const initNotificationService = (_io, _onlineUsers) => {
  io = _io;
  onlineUsers = _onlineUsers;
};

const getModel = (model) => {
  if (model === "User") return User;
  if (model === "ServiceUser") return ServiceUser;
  if (model === "Admin") return Admin;
};

const sendNotification = async ({
  receiverId,
  receiverModel,
  senderId,
  senderModel,
  title,
  body,
  type,
  referenceId,
  referenceType,
  data = {},
}) => {
  try {

    /* ===== SAVE IN DB ===== */
    const notification = await Notification.create({
      receiverId,
      receiverModel,
      senderId,
      senderModel,
      title,
      body,
      type,
      referenceId,
      referenceType,
      data,
    });

    const sockets = onlineUsers?.get(receiverId.toString());
    const isOnline = sockets && sockets.size > 0;

    /* =========================
       💬 CHAT → ONLY OFFLINE
    ========================= */
    if (type === "CHAT") {

      if (!isOnline) {
        const Model = getModel(receiverModel);
        const user = await Model.findById(receiverId);
        if (user?.fcmToken) {
          await admin.messaging().send({
            token: user.fcmToken,
            notification: { title, body },
          });
        }
      }

      return notification;
    }

    /* =========================
       📦 OTHER → SOCKET + FCM
    ========================= */

    // ✅ ONLINE → SOCKET
    if (isOnline) {
      sockets.forEach((socketId) => {
        io.to(socketId).emit("notification", notification);
      });
    }

    // ❌ OFFLINE → FCM
    else {
      const Model = getModel(receiverModel);
      const user = await Model.findById(receiverId);
      console.log("user", user.fcmToken)

      if (user?.fcmToken) {
        await admin.messaging().send({
          token: user.fcmToken,
          notification: { title, body },
        });
      }
    }

    return notification;

  } catch (err) {
    console.log("Notification Error:", err.message);
  }
};

module.exports = {
  initNotificationService,
  sendNotification,
};