const express = require("express");
const router = express.Router();
const chat = require("../controller/chatController");
const validateAdminToken = require("../middleware/adminValidateToken");
const validateToken = require("../middleware/validateTokenHandler");
const validateServiceToken = require("../middleware/validateSericeToken");

router.post("/create", chat.createConversation);
router.post("/send", chat.sendMessage);
router.get("/list/:userId", chat.getConversations);
router.get("/messages/:conversationId", chat.getMessages);
router.put("/close/:conversationId", chat.closeChat);
router.put("/read/:conversationId", chat.markAsRead);
router.get("/admin-conversations", validateAdminToken, chat.getAdminConversations);
router.get("/messages/:conversationId", validateAdminToken, chat.getMessages);

module.exports = router;