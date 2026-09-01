const { Server } = require("socket.io");

const {
  initNotificationService,
} = require("./utils/notificationService");

module.exports = function (server) {

  const io = new Server(server, {
    path: "/ws",

    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  /* =====================================================
     🟢 ONLINE USERS
  ===================================================== */

  const onlineUsers = new Map();

  /* =====================================================
     🔔 INIT NOTIFICATION SERVICE
  ===================================================== */

  initNotificationService(io, onlineUsers);

  /* =====================================================
     🔌 SOCKET CONNECTION
  ===================================================== */

  io.on("connection", (socket) => {

    console.log("🔌 User connected:", socket.id);

    /* =====================================================
       👤 REGISTER USER
    ===================================================== */

    socket.on("registerUser", (userId) => {

      try {

        if (!userId) {
          console.log("❌ registerUser missing userId");
          return;
        }

        userId = userId.toString();

        if (!onlineUsers.has(userId)) {
          onlineUsers.set(userId, new Set());
        }

        onlineUsers
          .get(userId)
          .add(socket.id);

        socket.userId = userId;

        console.log("✅ User registered:", userId);

        console.log(
          "🟢 Online users:",
          [...onlineUsers.keys()]
        );

        /* ===== USER ONLINE ===== */

        io.emit("userOnline", {
          userId,
        });

      } catch (error) {

        console.log(
          "registerUser error",
          error.message
        );
      }
    });

    /* =====================================================
       💬 JOIN CONVERSATION
    ===================================================== */

    socket.on("joinConversation", (conversationId) => {

      try {

        if (!conversationId) return;

        socket.join(conversationId);

        console.log(
          `📥 ${socket.id} joined ${conversationId}`
        );

      } catch (error) {

        console.log(
          "joinConversation error",
          error.message
        );
      }
    });

    /* =====================================================
       🚪 LEAVE CONVERSATION
    ===================================================== */

    socket.on("leaveConversation", (conversationId) => {

      try {

        if (!conversationId) return;

        socket.leave(conversationId);

        console.log(
          `🚪 ${socket.id} left ${conversationId}`
        );

      } catch (error) {

        console.log(
          "leaveConversation error",
          error.message
        );
      }
    });

    /* =====================================================
       ✍️ TYPING
    ===================================================== */

    socket.on(
      "typing",
      ({ conversationId, senderId }) => {

        try {

          socket
            .to(conversationId)
            .emit("userTyping", {
              conversationId,
              senderId,
            });

        } catch (error) {

          console.log(
            "typing error",
            error.message
          );
        }
      }
    );

    /* =====================================================
       ✋ STOP TYPING
    ===================================================== */

    socket.on(
      "stopTyping",
      ({ conversationId, senderId }) => {

        try {

          socket
            .to(conversationId)
            .emit("userStopTyping", {
              conversationId,
              senderId,
            });

        } catch (error) {

          console.log(
            "stopTyping error",
            error.message
          );
        }
      }
    );

    /* =====================================================
       💬 SEND MESSAGE
    ===================================================== */

    socket.on("sendMessage", async (data) => {
      try {
        const Conversation = require("./models/Conversation");
        const Message = require("./models/Message");
        const Ticket = require("./models/Ticket");
        const { sendNotification } = require("./utils/notificationService");

        const { conversationId, senderId, message, messageType = "TEXT" } = data;

        if (!conversationId || !senderId) return;

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
          socket.emit("errorMessage", "Conversation not found");
          return;
        }

        if (conversation.isClosed) {
          socket.emit("errorMessage", "Chat is closed");
          return;
        }

        /* ===== TICKET CHECK ===== */
        if (
          conversation.chatType === "USER_SUPPORT" ||
          conversation.chatType === "SERVICE_SUPPORT"
        ) {
          const ticket = await Ticket.findOne({ conversationId });

          if (!ticket) return socket.emit("errorMessage", "Ticket not found");
          if (ticket.status === "CLOSED") return socket.emit("errorMessage", "Ticket is closed");

          if (
            conversation.adminId?.toString() === senderId &&
            ticket.status === "OPEN"
          ) {
            ticket.status = "IN_PROGRESS";
            await ticket.save();
          }
        }

        /* ===== SAVE MESSAGE ===== */
        const newMessage = await Message.create({
          conversationId,
          senderId,
          message,
          messageType,
        });

        /* ===== UPDATE CONVERSATION ===== */
        conversation.lastMessage = message;
        conversation.lastMessageAt = new Date();
        conversation.lastMessageSenderId = senderId;

        if (conversation.userId?.toString() === senderId) {
          conversation.serviceUserUnreadCount =
            (conversation.serviceUserUnreadCount || 0) + 1;
        } else if (conversation.serviceUserId?.toString() === senderId) {
          conversation.userUnreadCount =
            (conversation.userUnreadCount || 0) + 1;
        } else if (conversation.adminId?.toString() === senderId) {
          if (conversation.userId) conversation.userUnreadCount = (conversation.userUnreadCount || 0) + 1;
          if (conversation.serviceUserId) conversation.serviceUserUnreadCount = (conversation.serviceUserUnreadCount || 0) + 1;
        }

        await conversation.save();

        /* ===== EMIT TO ROOM ===== */
        io.to(conversationId).emit("receiveMessage", newMessage);

        /* ===== OFFLINE NOTIFICATIONS ===== */
        const participants = [
          conversation.userId?.toString(),
          conversation.serviceUserId?.toString(),
          conversation.adminId?.toString(),
        ].filter(Boolean);

        for (const participantId of participants) {
          if (participantId === senderId) continue;

          const userSockets = onlineUsers.get(participantId);
          const isOnline = userSockets && userSockets.size > 0;

          if (!isOnline) {
            let receiverModel = "User";
            if (participantId === conversation.adminId?.toString()) receiverModel = "Admin";
            else if (participantId === conversation.serviceUserId?.toString()) receiverModel = "ServiceUser";

            await sendNotification({
              receiverId: participantId,
              receiverModel,
              senderId,
              senderModel: senderId === conversation.adminId?.toString() ? "Admin" : "User",
              title: "New Message 💬",
              body: message,
              type: "CHAT",
              referenceId: conversationId,
              referenceType: "Conversation",
            });
          }
        }

        /* ===== CHATBOT CHECK ===== */
        if (conversation.chatType === "USER_SUPPORT" && senderId?.toString() !== conversation.adminId?.toString()) {
          const ticket = await Ticket.findOne({
            conversationId,
            status: { $ne: "CLOSED" }
          });
          if (ticket && ticket.bookingId && ticket.botState && ticket.botState !== "BOT_COMPLETED") {
            const requestedLang = data.lang || data.query?.lang || (data.ar !== undefined ? "ar" : (data.en !== undefined ? "en" : ticket.lang || "en"));
            if (requestedLang && (requestedLang === "en" || requestedLang === "ar") && ticket.lang !== requestedLang) {
              ticket.lang = requestedLang;
              await ticket.save();
            }
            const chatController = require("./controller/chatController");
            setTimeout(async () => {
              try {
                await chatController.handleChatbotMessage(io, conversation, ticket, message, senderId);
              } catch (err) {
                console.error("Chatbot socket logic error:", err);
              }
            }, 500);
          }
        }

      } catch (err) {
        console.log("❌ SendMessage Error:", err.message);
      }
    });

    /* =====================================================
       👀 MESSAGE SEEN
    ===================================================== */

    socket.on(
      "markMessagesSeen",
      ({ conversationId, userId }) => {

        try {

          socket
            .to(conversationId)
            .emit("messagesSeen", {
              conversationId,
              userId,
            });

        } catch (error) {

          console.log(
            "markMessagesSeen error",
            error.message
          );
        }
      }
    );

    /* =====================================================
       🔔 REALTIME NOTIFICATION EVENT
    ===================================================== */

    socket.on("notificationRead", ({ notificationId }) => {

      try {

        socket.broadcast.emit(
          "notificationRead",
          {
            notificationId,
          }
        );

      } catch (error) {

        console.log(
          "notificationRead error",
          error.message
        );
      }
    });

    /* =====================================================
       🔍 CHECK ONLINE STATUS
    ===================================================== */

    socket.on(
      "checkOnlineStatus",
      (userId) => {

        try {

          if (!userId) return;

          userId = userId.toString();

          const isOnline =
            onlineUsers.has(userId) &&
            onlineUsers.get(userId).size > 0;

          socket.emit(
            "onlineStatusResult",
            {
              userId,
              isOnline,
            }
          );

        } catch (error) {

          console.log(
            "checkOnlineStatus error",
            error.message
          );
        }
      }
    );

    /* =====================================================
       ❌ DISCONNECT
    ===================================================== */

    socket.on("disconnect", () => {

      try {

        if (socket.userId) {

          const userSockets =
            onlineUsers.get(socket.userId);

          if (userSockets) {

            userSockets.delete(socket.id);

            if (userSockets.size === 0) {

              onlineUsers.delete(socket.userId);

              /* ===== USER OFFLINE ===== */

              io.emit("userOffline", {
                userId: socket.userId,
              });
            }
          }
        }

        console.log(
          "🔌 User disconnected:",
          socket.id
        );

      } catch (error) {

        console.log(
          "disconnect error",
          error.message
        );
      }
    });

  });

  /* =====================================================
     🌍 GLOBAL ACCESS
  ===================================================== */

  io.onlineUsers = onlineUsers;

  return io;
};