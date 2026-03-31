const { Server } = require("socket.io");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");
const Ticket = require("./models/Ticket");

module.exports = function (server) {

    const io = new Server(server, {
        path: "/ws",
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });

    const onlineUsers = new Map();

    io.on("connection", (socket) => {

        console.log("User connected:", socket.id);

        /* =====================================================
           REGISTER USER
        ===================================================== */
        socket.on("registerUser", (userId) => {

            if (!userId) return;

            userId = userId.toString();

            if (!onlineUsers.has(userId)) {
                onlineUsers.set(userId, new Set());
            }

            onlineUsers.get(userId).add(socket.id);

            socket.userId = userId;

            // Notify others
            io.emit("userOnline", userId);
        });


        /* =====================================================
           CHECK ONLINE STATUS (🔥 IMPORTANT FIX)
        ===================================================== */
        socket.on("checkOnlineStatus", (userId) => {

            if (!userId) return;

            const isOnline = onlineUsers.has(userId.toString());

            socket.emit("onlineStatusResult", {
                userId,
                isOnline
            });
        });


        /* =====================================================
           JOIN ROOM
        ===================================================== */
        socket.on("joinConversation", (conversationId) => {
            if (!conversationId) return;
            socket.join(conversationId);
        });


        /* =====================================================
           TYPING
        ===================================================== */
        socket.on("typing", ({ conversationId, senderId }) => {
            socket.to(conversationId).emit("userTyping", { senderId });
        });

        socket.on("stopTyping", ({ conversationId, senderId }) => {
            socket.to(conversationId).emit("userStopTyping", { senderId });
        });


        /* =====================================================
           SEND MESSAGE
        ===================================================== */
        // socket.on("sendMessage", async (data) => {

        //     try {

        //         const {
        //             conversationId,
        //             senderId,
        //             message,
        //             messageType = "TEXT",
        //         } = data;

        //         if (!conversationId || !senderId) return;

        //         const conversation = await Conversation.findById(conversationId);

        //         if (!conversation) {
        //             socket.emit("errorMessage", "Conversation not found");
        //             return;
        //         }

        //         if (conversation.isClosed) {
        //             socket.emit("errorMessage", "Chat is closed");
        //             return;
        //         }

        //         // Save message
        //         const newMessage = await Message.create({
        //             conversationId,
        //             senderId,
        //             message,
        //             messageType,
        //         });

        //         // Update last message
        //         conversation.lastMessage = message;
        //         conversation.lastMessageAt = new Date();

        //         // Unread logic
        //         if (conversation.userId?.toString() === senderId) {
        //             conversation.serviceUserUnreadCount =
        //                 (conversation.serviceUserUnreadCount || 0) + 1;
        //         }
        //         else if (conversation.serviceUserId?.toString() === senderId) {
        //             conversation.userUnreadCount =
        //                 (conversation.userUnreadCount || 0) + 1;
        //         }

        //         await conversation.save();

        //         // Emit to room
        //         io.to(conversationId).emit("receiveMessage", newMessage);

        //         /* =====================================================
        //            DIRECT NOTIFICATION FIX
        //         ===================================================== */

        //         const participants = [
        //             conversation.userId?.toString(),
        //             conversation.serviceUserId?.toString(),
        //             conversation.adminId?.toString(),
        //         ].filter(Boolean);

        //         participants.forEach((participantId) => {

        //             if (participantId !== senderId) {

        //                 const userSockets = onlineUsers.get(participantId);

        //                 if (userSockets) {
        //                     userSockets.forEach((socketId) => {
        //                         io.to(socketId).emit("newMessageNotification", {
        //                             conversationId,
        //                         });
        //                     });
        //                 }
        //             }
        //         });

        //     } catch (err) {
        //         console.log("SendMessage Error:", err.message);
        //     }
        // });


        socket.on("sendMessage", async (data) => {
            try {
                const {
                    conversationId,
                    senderId,
                    message,
                    messageType = "TEXT",
                } = data;

                if (!conversationId || !senderId) return;

                const conversation = await Conversation.findById(conversationId);

                if (!conversation) {
                    socket.emit("errorMessage", "Conversation not found");
                    return;
                }

                // 🚫 Conversation closed
                if (conversation.isClosed) {
                    socket.emit("errorMessage", "Chat is closed");
                    return;
                }

                /* =====================================================
                   ✅ TICKET VALIDATION (NEW)
                ===================================================== */
                if (
                    conversation.chatType === "USER_SUPPORT" ||
                    conversation.chatType === "SERVICE_SUPPORT"
                ) {
                    const ticket = await Ticket.findOne({ conversationId });

                    if (!ticket) {
                        socket.emit("errorMessage", "Ticket not found");
                        return;
                    }

                    // 🚫 Ticket closed
                    if (ticket.status === "CLOSED") {
                        socket.emit("errorMessage", "Ticket is closed");
                        return;
                    }

                    // 🔄 Auto move to IN_PROGRESS when admin replies
                    if (
                        conversation.adminId?.toString() === senderId &&
                        ticket.status === "OPEN"
                    ) {
                        ticket.status = "IN_PROGRESS";
                        await ticket.save();
                    }
                }

                /* =====================================================
                   💬 SAVE MESSAGE
                ===================================================== */
                const newMessage = await Message.create({
                    conversationId,
                    senderId,
                    message,
                    messageType,
                });

                /* =====================================================
                   🧠 UPDATE CONVERSATION
                ===================================================== */
                conversation.lastMessage = message;
                conversation.lastMessageAt = new Date();
                conversation.lastMessageSenderId = senderId;

                // 🔔 Unread logic
                if (conversation.userId?.toString() === senderId) {
                    conversation.serviceUserUnreadCount =
                        (conversation.serviceUserUnreadCount || 0) + 1;
                } else if (conversation.serviceUserId?.toString() === senderId) {
                    conversation.userUnreadCount =
                        (conversation.userUnreadCount || 0) + 1;
                } else if (conversation.adminId?.toString() === senderId) {
                    if (conversation.userId)
                        conversation.userUnreadCount =
                            (conversation.userUnreadCount || 0) + 1;

                    if (conversation.serviceUserId)
                        conversation.serviceUserUnreadCount =
                            (conversation.serviceUserUnreadCount || 0) + 1;
                }

                await conversation.save();

                /* =====================================================
                   📡 EMIT MESSAGE
                ===================================================== */
                io.to(conversationId).emit("receiveMessage", newMessage);

                /* =====================================================
                   🔔 DIRECT NOTIFICATION
                ===================================================== */
                const participants = [
                    conversation.userId?.toString(),
                    conversation.serviceUserId?.toString(),
                    conversation.adminId?.toString(),
                ].filter(Boolean);

                participants.forEach((participantId) => {
                    if (participantId !== senderId) {
                        const userSockets = onlineUsers.get(participantId);

                        if (userSockets) {
                            userSockets.forEach((socketId) => {
                                io.to(socketId).emit("newMessageNotification", {
                                    conversationId,
                                });
                            });
                        }
                    }
                });

            } catch (err) {
                console.log("SendMessage Error:", err.message);
            }
        });

        /* =====================================================
           MARK AS READ
        ===================================================== */
        socket.on("markAsRead", async ({ conversationId, userId }) => {

            try {

                const conversation = await Conversation.findById(conversationId);
                if (!conversation) return;

                if (conversation.userId?.toString() === userId)
                    conversation.userUnreadCount = 0;

                if (conversation.serviceUserId?.toString() === userId)
                    conversation.serviceUserUnreadCount = 0;

                await conversation.save();

            } catch (err) {
                console.log("MarkAsRead Error:", err.message);
            }
        });


        /* =====================================================
           DISCONNECT
        ===================================================== */
        socket.on("disconnect", () => {

            if (socket.userId) {

                const userSockets = onlineUsers.get(socket.userId);

                if (userSockets) {

                    userSockets.delete(socket.id);

                    if (userSockets.size === 0) {
                        onlineUsers.delete(socket.userId);
                        io.emit("userOffline", socket.userId);
                    }
                }
            }

            console.log("User disconnected:", socket.id);
        });

    });

    return io;
};