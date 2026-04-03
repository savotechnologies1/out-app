const { Server } = require("socket.io");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");
const Ticket = require("./models/Ticket");

const { sendNotification } = require("./utils/notificationService");

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

        /* ================= REGISTER ================= */
        socket.on("registerUser", (userId) => {
            if (!userId) return;

            userId = userId.toString();

            if (!onlineUsers.has(userId)) {
                onlineUsers.set(userId, new Set());
            }

            onlineUsers.get(userId).add(socket.id);
            socket.userId = userId;

            io.emit("userOnline", userId);
        });

        /* ================= JOIN ROOM ================= */
        socket.on("joinConversation", (conversationId) => {
            if (!conversationId) return;
            socket.join(conversationId);
        });

        /* ================= SEND MESSAGE ================= */
        socket.on("sendMessage", async (data) => {
            try {
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
                }

                await conversation.save();

                /* ================= SEND LOGIC ================= */
                const participants = [
                    conversation.userId?.toString(),
                    conversation.serviceUserId?.toString(),
                    conversation.adminId?.toString(),
                ].filter(Boolean);

                for (const participantId of participants) {

                    if (participantId === senderId) continue;

                    const userSockets = onlineUsers.get(participantId);
                    const isOnline = userSockets && userSockets.size > 0;

                    // ✅ ONLINE → REAL-TIME CHAT
                    if (isOnline) {
                        userSockets.forEach((socketId) => {
                            io.to(socketId).emit("receiveMessage", newMessage);
                        });
                    }

                    // ❌ OFFLINE → PUSH NOTIFICATION
                    else {

                        let model = "User";

                        if (conversation.serviceUserId?.toString() === participantId) {
                            model = "ServiceUser";
                        } else if (conversation.adminId?.toString() === participantId) {
                            model = "Admin";
                        }

                        // ✅ FIXED senderModel
                        let senderModel = "User";

                        if (conversation.serviceUserId?.toString() === senderId) {
                            senderModel = "ServiceUser";
                        } else if (conversation.adminId?.toString() === senderId) {
                            senderModel = "Admin";
                        }

                        await sendNotification({
                            receiverId: participantId,
                            receiverModel: model,
                            senderId,
                            senderModel,
                            title: "New Message 💬",
                            body: message,
                            type: "CHAT",
                            referenceId: conversationId,
                            referenceType: "Conversation",
                        });
                    }
                }

            } catch (err) {
                console.log("SendMessage Error:", err.message);
            }
        });

        /* ================= DISCONNECT ================= */
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

    /* ================= CONNECT NOTIFICATION ================= */
    const { initNotificationService } = require("./utils/notificationService");
    initNotificationService(io, onlineUsers);

    return io;
};