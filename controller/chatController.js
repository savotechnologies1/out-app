const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Admin = require("../models/Admin");
const User = require("../models/User");
const ServiceUser = require("../models/ServiceUser");
const Ticket = require("../models/Ticket");
const { sendNotification } = require("../utils/notificationService");

exports.createConversation = async (req, res) => {
  try {
    const { chatType, userId, serviceUserId, subject, description } = req.body;
    console.log("req.file", req.file)
    console.log("safasfsa", req.body);
    let conversation;

    /* =====================================================
       SERVICE CHAT (User ↔ ServiceUser) ✅ NO CHANGE
    ===================================================== */
    if (chatType === "SERVICE_CHAT") {

      if (!serviceUserId) {
        return res.status(400).json({
          success: false,
          message: "serviceUserId is required",
        });
      }

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
       USER SUPPORT (User ↔ Admin) ✅ TICKET BASED
    ===================================================== */
    if (chatType === "USER_SUPPORT") {

      if (!subject) {
        return res.status(400).json({
          success: false,
          message: "Subject is required",
        });
      }

      // 🔍 Check existing OPEN ticket
      const existingTicket = await Ticket.findOne({
        userId,
        status: { $ne: "CLOSED" },
      });

      const ticketImage = req.file?.filename
        ? `uploads/ticketImage/${req.file.filename}`
        : null;
      if (existingTicket) {
        // ✅ Update only if new image comes
        if (ticketImage) {
          existingTicket.Image = ticketImage;
        }

        // Optional updates
        if (subject) existingTicket.subject = subject;
        if (description) existingTicket.description = description;

        await existingTicket.save();

        const existingConversation = await Conversation.findById(
          existingTicket.conversationId
        );

        return res.json({
          success: true,
          data: {
            ticket: existingTicket,
            conversation: existingConversation,
          },
        });
      }

      // ✅ Create new ticket if none exists
      const admin = await Admin.findOne();

      const ticket = await Ticket.create({
        userId,
        adminId: admin?._id,
        subject,
        Image: ticketImage,
        description,
      });

      // 💬 Create Conversation
      conversation = await Conversation.create({
        chatType: "USER_SUPPORT",
        userId,
        adminId: admin?._id,
      });
      // 🔗 Link both
      ticket.conversationId = conversation._id;
      await ticket.save();

      const newMessage = await Message.create({
        conversationId: conversation._id,

        senderId: userId, // or serviceUserId

        messageType: ticketImage
          ? "IMAGE"
          : "TEXT",

        message: description || subject,

        attachments: ticketImage
          ? [
            {
              url: ticketImage,

              publicId: req.file?.filename || null,

              fileName: req.file?.filename || null,

              originalName:
                req.file?.originalname || null,

              mimeType:
                req.file?.mimetype || null,

              fileSize:
                req.file?.size || null,
            },
          ]
          : [],
      });
      conversation.lastMessage =
        description;

      conversation.lastMessageAt =
        new Date();

      conversation.lastMessageSenderId =
        userId; // or serviceUserId

      await conversation.save();
      const io = req.app.get("io");
      io.to(conversation._id).emit(
        "receiveMessage",
        newMessage
      );
      return res.status(201).json({
        success: true,
        data: {
          ticket,
          conversation,
        },
      });
    }

    /* =====================================================
       SERVICE SUPPORT (ServiceUser ↔ Admin) ✅ TICKET BASED
    ===================================================== */
    if (chatType === "SERVICE_SUPPORT") {

      if (!subject) {
        return res.status(400).json({
          success: false,
          message: "Subject is required",
        });
      }

      // 🔍 Check existing OPEN ticket
      const existingTicket = await Ticket.findOne({
        serviceUserId,
        status: { $ne: "CLOSED" },
      });

      const ticketImage = req.file?.filename
        ? `uploads/ticketImage/${req.file.filename}`
        : null;

      if (existingTicket) {
        // ✅ Update only if new image comes
        if (ticketImage) {
          existingTicket.Image = ticketImage;
        }

        // Optional updates
        if (subject) existingTicket.subject = subject;
        if (description) existingTicket.description = description;

        await existingTicket.save();

        const existingConversation = await Conversation.findById(
          existingTicket.conversationId
        );

        return res.json({
          success: true,
          data: {
            ticket: existingTicket,
            conversation: existingConversation,
          },
        });
      }

      // ✅ Create new ticket if none exists
      const admin = await Admin.findOne();

      const ticket = await Ticket.create({
        serviceUserId,
        adminId: admin?._id,
        subject,
        Image: ticketImage,
        description,
      });

      // 💬 Create Conversation
      conversation = await Conversation.create({
        chatType: "SERVICE_SUPPORT",
        serviceUserId,
        adminId: admin?._id,
      });

      // 🔗 Link
      ticket.conversationId = conversation._id;
      await ticket.save();

      const newMessage = await Message.create({
        conversationId: conversation._id,

        senderId: serviceUserId, // or serviceUserId

        messageType: ticketImage
          ? "IMAGE"
          : "TEXT",

        message: description || subject,

        attachments: ticketImage
          ? [
            {
              url: ticketImage,

              publicId: req.file?.filename || null,

              fileName: req.file?.filename || null,

              originalName:
                req.file?.originalname || null,

              mimeType:
                req.file?.mimetype || null,

              fileSize:
                req.file?.size || null,
            },
          ]
          : [],
      });
      conversation.lastMessage =
        description;

      conversation.lastMessageAt =
        new Date();

      conversation.lastMessageSenderId =
        serviceUserId; // or serviceUserId

      await conversation.save();

      const io = req.app.get("io");

      io.to(conversation._id).emit(
        "receiveMessage",
        newMessage
      );
      return res.status(201).json({
        success: true,
        data: {
          ticket,
          conversation,
        },
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


// exports.sendMessage = async (req, res) => {
//   try {
//     const { conversationId, senderId, message, messageType } = req.body;

//     const conversation = await Conversation.findById(conversationId);
//     if (!conversation)
//       return res.status(404).json({ success: false });

//     // 🚫 Block if conversation closed
//     if (conversation.isClosed)
//       return res.status(400).json({ success: false, message: "Chat closed" });

//     /* =====================================================
//        ✅ TICKET VALIDATION (NEW)
//     ===================================================== */
//     if (
//       conversation.chatType === "USER_SUPPORT" ||
//       conversation.chatType === "SERVICE_SUPPORT"
//     ) {
//       const ticket = await Ticket.findOne({ conversationId });

//       if (!ticket) {
//         return res.status(400).json({
//           success: false,
//           message: "Ticket not found",
//         });
//       }

//       // 🚫 Block if ticket closed
//       if (ticket.status === "CLOSED") {
//         return res.status(400).json({
//           success: false,
//           message: "Ticket is closed",
//         });
//       }

//       // 🔄 Auto move to IN_PROGRESS when admin replies
//       if (
//         conversation.adminId?.toString() === senderId &&
//         ticket.status === "OPEN"
//       ) {
//         ticket.status = "IN_PROGRESS";
//         await ticket.save();
//       }
//     }

//     /* =====================================================
//        💬 CREATE MESSAGE
//     ===================================================== */
//     const newMessage = await Message.create({
//       conversationId,
//       senderId,
//       message,
//       messageType,
//     });

//     /* =====================================================
//        🧠 UPDATE CONVERSATION META
//     ===================================================== */
//     conversation.lastMessage = message;
//     conversation.lastMessageAt = new Date();
//     conversation.lastMessageSenderId = senderId;

//     // 🔔 Unread Logic
//     if (conversation.userId?.toString() === senderId)
//       conversation.serviceUserUnreadCount++;

//     else if (conversation.serviceUserId?.toString() === senderId)
//       conversation.userUnreadCount++;

//     else if (conversation.adminId?.toString() === senderId) {
//       if (conversation.userId) conversation.userUnreadCount++;
//       if (conversation.serviceUserId)
//         conversation.serviceUserUnreadCount++;
//     }

//     await conversation.save();

//     res.status(201).json({ success: true, data: newMessage });

//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

exports.sendMessage = async (req, res) => {
  try {

    const {
      conversationId,
      senderId,
      message,
    } = req.body;

    /* =====================================================
       🔍 FIND CONVERSATION
    ===================================================== */

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    /* =====================================================
       🚫 CHAT CLOSED
    ===================================================== */

    if (conversation.isClosed) {
      return res.status(400).json({
        success: false,
        message: "Chat closed",
      });
    }

    /* =====================================================
       🎫 TICKET VALIDATION
    ===================================================== */

    if (
      conversation.chatType === "USER_SUPPORT" ||
      conversation.chatType === "SERVICE_SUPPORT"
    ) {

      const ticket = await Ticket.findOne({
        conversationId,
      });

      if (!ticket) {
        return res.status(400).json({
          success: false,
          message: "Ticket not found",
        });
      }

      if (ticket.status === "CLOSED") {
        return res.status(400).json({
          success: false,
          message: "Ticket is closed",
        });
      }

      /* ===== AUTO MOVE TO IN_PROGRESS ===== */

      if (
        conversation.adminId?.toString() === senderId &&
        ticket.status === "OPEN"
      ) {

        ticket.status = "IN_PROGRESS";

        await ticket.save();
      }
    }

    /* =====================================================
       📎 ATTACHMENTS
    ===================================================== */

    const attachments = [];

    let messageType = "TEXT";

    const processFiles = (files, type, folderName) => {

      if (!files || !files.length) return;

      messageType = type;

      files.forEach((file) => {

        attachments.push({

          url: `uploads/${folderName}/${file.filename}`,

          publicId: file.filename,

          fileName: file.filename,

          originalName: file.originalname,

          mimeType: file.mimetype,

          fileSize: file.size,

          duration: null,

          thumbnail: null,

          width: null,

          height: null,
        });
      });
    };

    processFiles(
      req.files?.chatImage,
      "IMAGE",
      "chatImage"
    );

    processFiles(
      req.files?.chatAudio,
      "AUDIO",
      "chatAudio"
    );

    processFiles(
      req.files?.chatDocument,
      "DOCUMENT",
      "chatDocument"
    );

    processFiles(
      req.files?.chatVideo,
      "VIDEO",
      "chatVideo"
    );

    /* =====================================================
       🚫 EMPTY MESSAGE VALIDATION
    ===================================================== */

    if (
      !message &&
      attachments.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Message or attachment is required",
      });
    }

    /* =====================================================
       💬 CREATE MESSAGE
    ===================================================== */

    const newMessage = await Message.create({

      conversationId,

      senderId,

      message,

      messageType,

      attachments,
    });

    /* =====================================================
       🧠 LAST MESSAGE PREVIEW
    ===================================================== */

    if (messageType === "TEXT") {

      conversation.lastMessage = message;
    }

    else if (messageType === "IMAGE") {

      conversation.lastMessage = "📷 Image";
    }

    else if (messageType === "AUDIO") {

      conversation.lastMessage = "🎤 Voice message";
    }

    else if (messageType === "VIDEO") {

      conversation.lastMessage = "🎥 Video";
    }

    else if (messageType === "DOCUMENT") {

      conversation.lastMessage = "📄 Document";
    }

    conversation.lastMessageAt = new Date();

    conversation.lastMessageSenderId = senderId;

    /* =====================================================
       🔔 UNREAD COUNT
    ===================================================== */

    if (
      conversation.userId?.toString() === senderId
    ) {

      conversation.serviceUserUnreadCount++;
    }

    else if (
      conversation.serviceUserId?.toString() === senderId
    ) {

      conversation.userUnreadCount++;
    }

    else if (
      conversation.adminId?.toString() === senderId
    ) {

      if (conversation.userId) {

        conversation.userUnreadCount++;
      }

      if (conversation.serviceUserId) {

        conversation.serviceUserUnreadCount++;
      }
    }

    await conversation.save();

    /* =====================================================
       ⚡ SOCKET EVENT
    ===================================================== */

    const io = req.app.get("io");

    io.to(conversationId).emit(
      "receiveMessage",
      newMessage
    );

    /* =====================================================
       🔔 PUSH NOTIFICATIONS
    ===================================================== */

    const participants = [

      {
        id: conversation.userId,
        model: "User",
      },

      {
        id: conversation.serviceUserId,
        model: "ServiceUser",
      },

      {
        id: conversation.adminId,
        model: "Admin",
      },

    ].filter((p) => p.id);

    /* ===== DETERMINE SENDER MODEL ===== */

    let senderModel = "User";

    if (
      conversation.adminId?.toString() === senderId
    ) {

      senderModel = "Admin";
    }

    else if (
      conversation.serviceUserId?.toString() === senderId
    ) {

      senderModel = "ServiceUser";
    }

    /* ===== NOTIFICATION BODY ===== */

    let notificationBody = message;

    if (messageType === "IMAGE") {

      notificationBody = "📷 Image";
    }

    else if (messageType === "AUDIO") {

      notificationBody = "🎤 Voice message";
    }

    else if (messageType === "VIDEO") {

      notificationBody = "🎥 Video";
    }

    else if (messageType === "DOCUMENT") {

      notificationBody = "📄 Document";
    }

    /* ===== SEND TO OTHER PARTICIPANTS ===== */

    for (const participant of participants) {

      if (
        participant.id.toString() === senderId.toString()
      ) {
        continue;
      }

      await sendNotification({

        receiverId: participant.id,

        receiverModel: participant.model,

        senderId,

        senderModel,

        title: "New Message 💬",

        body: notificationBody,

        type: "CHAT",

        referenceId: conversationId,

        referenceType: "Conversation",

        data: {
          conversationId,
          messageId: newMessage._id,
        },
      });
    }

    /* =====================================================
       ✅ RESPONSE
    ===================================================== */

    return res.status(201).json({
      success: true,
      data: newMessage,
    });

  } catch (error) {

    console.log(
      "sendMessage error",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


/* =====================================================
   GET CONVERSATION LIST
===================================================== */
// exports.getConversations = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     const conversations = await Conversation.find({
//       $or: [
//         { userId },
//         { serviceUserId: userId },
//         { adminId: userId },
//       ],
//       isDeleted: false,
//     }).sort({ lastMessageAt: -1 });

//     res.json({ success: true, data: conversations });

//   } catch (error) {
//     res.status(500).json({ success: false });
//   }
// };


exports.getConversations = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1️⃣ Get conversations
    const conversations = await Conversation.find({
      $or: [
        { userId },
        { serviceUserId: userId },
        { adminId: userId },
      ],
      isDeleted: false,
    }).sort({ lastMessageAt: -1 });

    // 2️⃣ Extract conversationIds for support chats
    const supportConversationIds = conversations
      .filter(
        (c) =>
          c.chatType === "USER_SUPPORT" ||
          c.chatType === "SERVICE_SUPPORT"
      )
      .map((c) => c._id);

    // 3️⃣ Fetch all tickets in one query (IMPORTANT for performance)
    const tickets = await Ticket.find({
      conversationId: { $in: supportConversationIds },
    });

    // 4️⃣ Map tickets by conversationId
    const ticketMap = {};
    tickets.forEach((t) => {
      ticketMap[t.conversationId.toString()] = t;
    });

    // 5️⃣ Attach ticket to each conversation
    const finalData = conversations.map((conv) => {
      const obj = conv.toObject();

      if (
        conv.chatType === "USER_SUPPORT" ||
        conv.chatType === "SERVICE_SUPPORT"
      ) {
        obj.ticket = ticketMap[conv._id.toString()] || null;
      }

      return obj;
    });

    res.json({
      success: true,
      data: finalData,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
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

// exports.getAdminConversations = async (req, res) => {
//   try {

//     const adminId = req.user._id;

//     const page = Number(req.query.page) || 1;
//     const limit = Number(req.query.limit) || 10;
//     const skip = (page - 1) * limit;

//     const { chatType } = req.query;

//     const query = {
//       adminId,
//       isDeleted: false
//     };

//     // ✅ chatType filter
//     if (chatType && ["USER_SUPPORT", "SERVICE_SUPPORT"].includes(chatType)) {
//       query.chatType = chatType;
//     }

//     const [conversations, total] = await Promise.all([

//       Conversation.find(query)
//         .populate({
//           path: "userId",
//           select: "firstName lastName email profile",
//         })
//         .populate({
//           path: "serviceUserId",
//           select: "firstName lastName email profile",
//         })
//         .sort({ updatedAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .lean(),

//       Conversation.countDocuments(query)

//     ]);

//     const totalPages = Math.ceil(total / limit);

//     res.json({
//       success: true,
//       data: conversations,
//       page,
//       limit,
//       total,
//       totalPages,
//       previousDisabled: page <= 1,
//       nextPage: page + 1,
//       previousPage: page - 1,
//       nextDisabled: page >= totalPages
//     });

//   } catch (error) {

//     res.status(500).json({
//       success: false,
//       message: error.message,
//     });

//   }
// };

exports.getAdminConversations = async (req, res) => {
  try {
    const adminId = req.user._id;
    // const { adminId } = req.params

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { chatType, status } = req.query;

    const query = {
      adminId,
      isDeleted: false,
    };

    // ✅ chatType filter
    if (chatType && ["USER_SUPPORT", "SERVICE_SUPPORT"].includes(chatType)) {
      query.chatType = chatType;
    }

    /* =====================================================
       1️⃣ FETCH CONVERSATIONS
    ===================================================== */
    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .populate({
          path: "userId",
          select: "firstName lastName email profile",
        })
        .populate({
          path: "serviceUserId",
          select: "firstName lastName email profile",
        })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Conversation.countDocuments(query),
    ]);

    /* =====================================================
       2️⃣ GET TICKETS (ONLY FOR SUPPORT CHATS)
    ===================================================== */
    const conversationIds = conversations.map((c) => c._id);

    const tickets = await Ticket.find({
      conversationId: { $in: conversationIds },
    }).lean();

    const ticketMap = {};
    tickets.forEach((t) => {
      ticketMap[t.conversationId.toString()] = t;
    });

    /* =====================================================
       3️⃣ MERGE TICKETS
    ===================================================== */
    let finalData = conversations.map((conv) => {
      if (
        conv.chatType === "USER_SUPPORT" ||
        conv.chatType === "SERVICE_SUPPORT"
      ) {
        conv.ticket = ticketMap[conv._id.toString()] || null;
      }
      return conv;
    });

    /* =====================================================
       4️⃣ FILTER BY TICKET STATUS (OPTIONAL)
    ===================================================== */
    if (status) {
      finalData = finalData.filter(
        (c) => c.ticket && c.ticket.status === status
      );
    }

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: finalData,
      page,
      limit,
      total,
      totalPages,
      previousDisabled: page <= 1,
      nextPage: page + 1,
      previousPage: page - 1,
      nextDisabled: page >= totalPages,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// exports.getMessages = async (req, res) => {
//   try {
//     const { conversationId } = req.params;

//     const page = Number(req.query.page) || 1;
//     const limit = Number(req.query.limit) || 20;
//     const skip = (page - 1) * limit;

//     /* =====================================================
//        1️⃣ VALIDATE CONVERSATION
//     ===================================================== */
//     const conversation = await Conversation.findById(conversationId).lean();

//     if (!conversation) {
//       return res.status(404).json({
//         success: false,
//         message: "Conversation not found",
//       });
//     }

//     /* =====================================================
//        2️⃣ FETCH MESSAGES (PAGINATED)
//     ===================================================== */
//     const messages = await Message.find({ conversationId })
//       .sort({ createdAt: -1 }) // latest first (better for pagination)
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     // reverse for UI (old → new)
//     const orderedMessages = messages.reverse();

//     /* =====================================================
//        3️⃣ FETCH SENDERS
//     ===================================================== */
//     const senderIds = [
//       ...new Set(orderedMessages.map((m) => m.senderId.toString())),
//     ];

//     const [users, serviceUsers, admins] = await Promise.all([
//       User.find({ _id: { $in: senderIds } })
//         .select("firstName lastName email profile")
//         .lean(),

//       ServiceUser.find({ _id: { $in: senderIds } })
//         .select("firstName lastName  email profile")
//         .lean(),

//       Admin.find({ _id: { $in: senderIds } })
//         .select("firstName lastName email profileImage")
//         .lean(),
//     ]);

//     const senderMap = {};

//     users.forEach((u) => {
//       senderMap[u._id.toString()] = {
//         ...u,
//         senderType: "User",
//       };
//     });

//     serviceUsers.forEach((s) => {
//       senderMap[s._id.toString()] = {
//         ...s,
//         senderType: "ServiceUser",
//       };
//     });

//     admins.forEach((a) => {
//       senderMap[a._id.toString()] = {
//         ...a,
//         senderType: "Admin",
//       };
//     });

//     /* =====================================================
//        4️⃣ ATTACH SENDERS
//     ===================================================== */
//     const enrichedMessages = orderedMessages.map((msg) => ({
//       ...msg,
//       sender: senderMap[msg.senderId.toString()] || null,
//     }));

//     /* =====================================================
//        5️⃣ MARK AS READ (IMPORTANT)
//     ===================================================== */
//     await Message.updateMany(
//       {
//         conversationId,
//         isRead: false,
//       },
//       { $set: { isRead: true } }
//     );

//     /* =====================================================
//        6️⃣ ATTACH TICKET (ONLY SUPPORT CHATS)
//     ===================================================== */
//     let ticket = null;

//     if (
//       conversation.chatType === "USER_SUPPORT" ||
//       conversation.chatType === "SERVICE_SUPPORT"
//     ) {
//       ticket = await Ticket.findOne({ conversationId }).lean();
//     }

//     /* =====================================================
//        7️⃣ RESPONSE
//     ===================================================== */
//     res.json({
//       success: true,
//       data: enrichedMessages,
//       meta: {
//         page,
//         limit,
//         hasMore: messages.length === limit,
//       },
//       ticket, // 🔥 important for frontend
//       conversationStatus: conversation.isClosed,
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };



exports.getMessages = async (req, res) => {
  try {

    const { conversationId } = req.params;

    const limit = Number(req.query.limit) || 20;

    const before = req.query.before;

    /* =====================================================
       🔍 VALIDATE CONVERSATION
    ===================================================== */

    const conversation =
      await Conversation
        .findById(conversationId)
        .lean();

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    /* =====================================================
       🧠 QUERY
    ===================================================== */

    const query = {
      conversationId,
      isDeleted: false,
    };

    // Load older messages
    if (before) {
      query._id = {
        $lt: before,
      };
    }

    /* =====================================================
       💬 FETCH MESSAGES
    ===================================================== */

    const messages = await Message.find(query)

      .sort({ _id: -1 })

      .limit(limit)

      .lean();

    // oldest → newest
    const orderedMessages =
      messages.reverse();

    /* =====================================================
       👤 FETCH SENDERS
    ===================================================== */

    const senderIds = [

      ...new Set(
        orderedMessages.map(
          (m) => m.senderId.toString()
        )
      ),

    ];

    const [
      users,
      serviceUsers,
      admins,
    ] = await Promise.all([

      User.find({
        _id: { $in: senderIds },
      })
        .select(
          "firstName lastName email profile"
        )
        .lean(),

      ServiceUser.find({
        _id: { $in: senderIds },
      })
        .select(
          "firstName lastName email profile"
        )
        .lean(),

      Admin.find({
        _id: { $in: senderIds },
      })
        .select(
          "firstName lastName email profileImage"
        )
        .lean(),
    ]);

    /* =====================================================
       🗺 SENDER MAP
    ===================================================== */

    const senderMap = {};

    users.forEach((u) => {

      senderMap[u._id.toString()] = {
        ...u,
        senderType: "User",
      };
    });

    serviceUsers.forEach((s) => {

      senderMap[s._id.toString()] = {
        ...s,
        senderType: "ServiceUser",
      };
    });

    admins.forEach((a) => {

      senderMap[a._id.toString()] = {
        ...a,
        senderType: "Admin",
      };
    });

    /* =====================================================
       ✨ ENRICH MESSAGES
    ===================================================== */

    const enrichedMessages =
      orderedMessages.map((msg) => ({
        ...msg,
        sender:
          senderMap[
          msg.senderId.toString()
          ] || null,
      }));

    /* =====================================================
       👀 MARK READ
    ===================================================== */

    await Message.updateMany(
      {
        conversationId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
        },
      }
    );

    /* =====================================================
       🎫 TICKET
    ===================================================== */

    let ticket = null;

    if (
      conversation.chatType ===
      "USER_SUPPORT" ||

      conversation.chatType ===
      "SERVICE_SUPPORT"
    ) {

      ticket =
        await Ticket.findOne({
          conversationId,
        }).lean();
    }

    /* =====================================================
       📌 PAGINATION META
    ===================================================== */

    const nextCursor =

      orderedMessages.length > 0

        ? orderedMessages[0]._id

        : null;

    /* =====================================================
       ✅ RESPONSE
    ===================================================== */

    return res.json({

      success: true,

      data: enrichedMessages,

      pagination: {

        limit,

        nextCursor,

        hasMore:
          messages.length === limit,
      },

      ticket,

      conversationStatus:
        conversation.isClosed,
    });

  } catch (error) {

    return res.status(500).json({
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
      userId,
      isDeleted: false,
    })
      .populate("adminId", "name email")
      .sort({ lastMessageAt: -1 })
      .lean();

    // 🔥 Get tickets
    const conversationIds = conversations.map((c) => c._id);

    const tickets = await Ticket.find({
      conversationId: { $in: conversationIds },
    }).lean();

    const ticketMap = {};
    tickets.forEach((t) => {
      ticketMap[t.conversationId.toString()] = t;
    });

    // 🔗 Attach ticket
    const finalData = conversations.map((conv) => ({
      ...conv,
      ticket: ticketMap[conv._id.toString()] || null,
    }));

    return res.status(200).json({
      success: true,
      total: finalData.length,
      data: finalData,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getServiceSupportConversations = async (req, res) => {
  try {
    const serviceUserId = req.user._id;

    const conversations = await Conversation.find({
      chatType: "SERVICE_SUPPORT",
      serviceUserId,
      isDeleted: false,
    })
      .populate("adminId", "name email")
      .sort({ lastMessageAt: -1 })
      .lean();

    // 🔥 Get tickets
    const conversationIds = conversations.map((c) => c._id);

    const tickets = await Ticket.find({
      conversationId: { $in: conversationIds },
    }).lean();

    const ticketMap = {};
    tickets.forEach((t) => {
      ticketMap[t.conversationId.toString()] = t;
    });

    // 🔗 Attach ticket
    const finalData = conversations.map((conv) => ({
      ...conv,
      ticket: ticketMap[conv._id.toString()] || null,
    }));

    return res.status(200).json({
      success: true,
      total: finalData.length,
      data: finalData,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
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


exports.closeTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log("ticketId", ticketId)
    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    ticket.status = "CLOSED";
    ticket.closedAt = new Date();
    await ticket.save();

    await Conversation.findByIdAndUpdate(ticket.conversationId, {
      isClosed: true,
      closedAt: new Date(),
    });

    res.json({
      success: true,
      message: "Ticket closed successfully",
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.reopenTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false });
    }

    ticket.status = "IN_PROGRESS";
    ticket.closedAt = null;
    await ticket.save();

    await Conversation.findByIdAndUpdate(ticket.conversationId, {
      isClosed: false,
      closedAt: null,
    });

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};