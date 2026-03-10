const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Admin = require("../models/Admin");
const User = require("../models/User");
const ServiceUser = require("../models/ServiceUser");

/* =====================================================
   CREATE OR FIND CONVERSATION
===================================================== */
exports.createConversation = async (req, res) => {
  try {
    const { chatType, userId, serviceUserId } = req.body;

    // const userId = req.user._id; // 🔐 from token

    let conversation;

    /* =====================================================
       SERVICE CHAT (User ↔ ServiceUser)
       Prevent reversed duplicate
    ===================================================== */
    if (chatType === "SERVICE_CHAT") {

      if (!serviceUserId)
        return res.status(400).json({
          success: false,
          message: "serviceUserId is required",
        });

      // 🔥 Sort IDs to prevent reversed duplication
      const ids = [userId.toString(), serviceUserId.toString()].sort();

      const firstId = ids[0];
      const secondId = ids[1];

      conversation = await Conversation.findOne({
        chatType: "SERVICE_CHAT",
        userId: firstId,
        serviceUserId: secondId,
        isDeleted: false,
      });

      if (conversation)
        return res.json({ success: true, data: conversation });

      conversation = await Conversation.create({
        chatType: "SERVICE_CHAT",
        userId: firstId,
        serviceUserId: secondId,
      });

      return res.status(201).json({
        success: true,
        data: conversation,
      });
    }

    /* =====================================================
       USER SUPPORT (User ↔ Admin)
       Only one OPEN support allowed
    ===================================================== */
    if (chatType === "USER_SUPPORT") {

      conversation = await Conversation.findOne({
        chatType: "USER_SUPPORT",
        userId,
        isClosed: false,
        isDeleted: false,
      });

      if (conversation)
        return res.json({ success: true, data: conversation });

      const admin = await Admin.findOne(); // You can improve with round robin

      conversation = await Conversation.create({
        chatType: "USER_SUPPORT",
        userId,
        adminId: admin?._id,
      });

      return res.status(201).json({
        success: true,
        data: conversation,
      });
    }

    /* =====================================================
       SERVICE SUPPORT (ServiceUser ↔ Admin)
    ===================================================== */
    if (chatType === "SERVICE_SUPPORT") {

      conversation = await Conversation.findOne({
        chatType: "SERVICE_SUPPORT",
        serviceUserId: userId,
        isClosed: false,
        isDeleted: false,
      });

      if (conversation)
        return res.json({ success: true, data: conversation });

      const admin = await Admin.findOne();

      conversation = await Conversation.create({
        chatType: "SERVICE_SUPPORT",
        serviceUserId: userId,
        adminId: admin?._id,
      });

      return res.status(201).json({
        success: true,
        data: conversation,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid chatType",
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



/* =====================================================
   SEND MESSAGE
===================================================== */
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, senderId, message, messageType } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation)
      return res.status(404).json({ success: false });

    if (conversation.isClosed)
      return res.status(400).json({ success: false, message: "Chat closed" });

    const newMessage = await Message.create({
      conversationId,
      senderId,
      message,
      messageType,
    });

    conversation.lastMessage = message;
    conversation.lastMessageAt = new Date();
    conversation.lastMessageSenderId = senderId;

    // Unread Logic
    if (conversation.userId?.toString() === senderId)
      conversation.serviceUserUnreadCount++;

    else if (conversation.serviceUserId?.toString() === senderId)
      conversation.userUnreadCount++;

    else if (conversation.adminId?.toString() === senderId) {
      if (conversation.userId) conversation.userUnreadCount++;
      if (conversation.serviceUserId)
        conversation.serviceUserUnreadCount++;
    }

    await conversation.save();

    res.status(201).json({ success: true, data: newMessage });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   GET CONVERSATION LIST
===================================================== */
exports.getConversations = async (req, res) => {
  try {
    const { userId } = req.params;

    const conversations = await Conversation.find({
      $or: [
        { userId },
        { serviceUserId: userId },
        { adminId: userId },
      ],
      isDeleted: false,
    }).sort({ lastMessageAt: -1 });

    res.json({ success: true, data: conversations });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   GET MESSAGES (Pagination)
===================================================== */
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 20;

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      data: messages.reverse(),
    });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   CLOSE SUPPORT CHAT
===================================================== */
exports.closeChat = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { closedBy } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation)
      return res.status(404).json({ success: false });

    conversation.isClosed = true;
    conversation.closedBy = closedBy;
    conversation.closedAt = new Date();

    await conversation.save();

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   MARK AS READ
===================================================== */
exports.markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation)
      return res.status(404).json({ success: false });

    if (conversation.userId?.toString() === userId)
      conversation.userUnreadCount = 0;

    if (conversation.serviceUserId?.toString() === userId)
      conversation.serviceUserUnreadCount = 0;

    if (conversation.adminId?.toString() === userId)
      conversation.adminUnreadCount = 0;

    await conversation.save();

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

exports.getAdminConversations = async (req, res) => {
  try {

    const adminId = req.user._id;

    const conversations = await Conversation.find({
      adminId,
      isDeleted: false,
    })
      .populate({
        path: "userId",
        select: "firstName lastName email profile", 
      })
      .populate({
        path: "serviceUserId",
        select: "firstName lastName email profile",  
      })
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      count: conversations.length,
      data: conversations,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .lean(); 

    const senderIds = [
      ...new Set(messages.map(m => m.senderId.toString()))
    ];

    const users = await User.find({ _id: { $in: senderIds } })
      .select("name email profile")
      .lean();

    const serviceUsers = await ServiceUser.find({ _id: { $in: senderIds } })
      .select("name email profile")
      .lean();

    const admins = await Admin.find({ _id: { $in: senderIds } })
      .select("name email profileImage")
      .lean();

    const senderMap = {};

    users.forEach(u => {
      senderMap[u._id.toString()] = {
        ...u,
        senderType: "User"
      };
    });

    serviceUsers.forEach(s => {
      senderMap[s._id.toString()] = {
        ...s,
        senderType: "ServiceUser"
      };
    });

    admins.forEach(a => {
      senderMap[a._id.toString()] = {
        ...a,
        senderType: "Admin"
      };
    });

    const enrichedMessages = messages.map(msg => ({
      ...msg,
      sender: senderMap[msg.senderId.toString()] || null
    }));

    res.json({
      success: true,
      data: enrichedMessages,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getUserSupportConversations = async (req, res) => {
  try {

    const userId = req.user._id;

    const conversations = await Conversation.find({
      chatType: "USER_SUPPORT",
      userId: userId,
      isDeleted: false
    })
      .populate("adminId", "name email")
      .sort({ lastMessageAt: -1 });

    return res.status(200).json({
      success: true,
      total: conversations.length,
      data: conversations
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

exports.getServiceSupportConversations = async (req, res) => {
  try {

    const serviceUserId = req.user._id;

    const conversations = await Conversation.find({
      chatType: "SERVICE_SUPPORT",
      serviceUserId: serviceUserId,
      isDeleted: false
    })
      .populate("adminId", "name email")
      .sort({ lastMessageAt: -1 });

    return res.status(200).json({
      success: true,
      total: conversations.length,
      data: conversations
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

exports.getUserServiceChats = async (req, res) => {
  try {

    const userId = req.user._id;

    const conversations = await Conversation.find({
      chatType: "SERVICE_CHAT",
      userId,
      isDeleted: false
    })
    .populate({
      path: "serviceUserId",
      select: "firstName lastName profile"
    })
    .sort({ lastMessageAt: -1 });

    return res.status(200).json({
      success: true,
      total: conversations.length,
      data: conversations
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

exports.getServiceUserChats = async (req, res) => {
  try {

    const serviceUserId = req.user._id;

    const conversations = await Conversation.find({
      chatType: "SERVICE_CHAT",
      serviceUserId: serviceUserId,
      isDeleted: false
    })
      .populate("userId", "firstName lastName profile")
      .sort({ lastMessageAt: -1 });

    return res.status(200).json({
      success: true,
      total: conversations.length,
      data: conversations
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};
