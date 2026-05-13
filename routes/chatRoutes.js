const express = require("express");
const router = express.Router();
const chat = require("../controller/chatController");
const validateAdminToken = require("../middleware/adminValidateToken");
const validateToken = require("../middleware/validateTokenHandler");
const validateServiceToken = require("../middleware/validateSericeToken");
const { uploads } = require("../functions/upload");

router.post("/create",uploads.single("ticketImage"), chat.createConversation);
router.post(
  "/send",
  uploads.fields([
    { name: "chatImage", maxCount: 5 },
    { name: "chatAudio", maxCount: 5 },
    { name: "chatDocument", maxCount: 5 },
    { name: "chatVideo", maxCount: 5 },
  ]),
  chat.sendMessage
);
router.get("/list/:userId", chat.getConversations);
router.get("/messages/:conversationId", chat.getMessages);
// router.put("/close/:conversationId", chat.closeChat);
router.put("/read/:conversationId", chat.markAsRead);
router.get("/admin-conversations", validateAdminToken, chat.getAdminConversations);
router.get("/messages/:conversationId", validateAdminToken, chat.getMessages);

router.put("/closeTicket/:ticketId", chat.closeTicket)

router.put("/reopenTicket/:ticketId", chat.reopenTicket)

router.get("/user-support-chats", validateToken, chat.getUserSupportConversations);

router.get("/service-support-chats", validateServiceToken, chat.getServiceSupportConversations);

router.get("/user-service-chats", validateToken, chat.getUserServiceChats);

router.get("/serviceUser-service-chats", validateServiceToken, chat.getServiceUserChats);

module.exports = router;