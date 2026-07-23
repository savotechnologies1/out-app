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