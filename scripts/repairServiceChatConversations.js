require("dotenv").config();
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const ServiceUser = require("../models/ServiceUser");

/**
 * Migration & Repair Utility for SERVICE_CHAT Conversations
 * 
 * Detects SERVICE_CHAT conversations where userId and serviceUserId were swapped
 * due to previous sorting logic, and restores them to proper roles:
 *   - userId       -> User (Customer)
 *   - serviceUserId -> ServiceUser (Service Provider)
 * 
 * Does NOT touch USER_SUPPORT or SERVICE_SUPPORT conversations.
 */
async function repairServiceChatConversations(options = {}) {
  const { disconnectAfter = true, quiet = false } = options;

  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  if (mongoose.connection.readyState === 0) {
    if (!process.env.CONNECTION_STRING) {
      throw new Error("CONNECTION_STRING environment variable is not defined");
    }
    await mongoose.connect(process.env.CONNECTION_STRING);
    log("Connected to MongoDB for repair migration.");
  }

  const serviceChats = await Conversation.find({ chatType: "SERVICE_CHAT" });
  log(`Found ${serviceChats.length} SERVICE_CHAT conversations to inspect.`);

  const stats = {
    total: serviceChats.length,
    correct: 0,
    repaired: 0,
    flagged: 0,
    details: [],
  };

  for (const conv of serviceChats) {
    const userIdStr = conv.userId ? conv.userId.toString() : null;
    const serviceUserIdStr = conv.serviceUserId ? conv.serviceUserId.toString() : null;

    if (!userIdStr || !serviceUserIdStr) {
      stats.flagged++;
      stats.details.push({
        id: conv._id,
        status: "FLAGGED_INCOMPLETE_IDS",
        reason: "Missing userId or serviceUserId",
      });
      log(`⚠️ [FLAGGED] Conversation ${conv._id}: Missing userId or serviceUserId.`);
      continue;
    }

    const [u1, s1, u2, s2] = await Promise.all([
      User.findById(conv.userId).lean(),
      ServiceUser.findById(conv.userId).lean(),
      User.findById(conv.serviceUserId).lean(),
      ServiceUser.findById(conv.serviceUserId).lean(),
    ]);

    const isUser1InUser = Boolean(u1);
    const isUser1InServiceUser = Boolean(s1);
    const isUser2InUser = Boolean(u2);
    const isUser2InServiceUser = Boolean(s2);

    // Case 1: Already correct (userId is User, serviceUserId is ServiceUser)
    if (isUser1InUser && !isUser1InServiceUser && isUser2InServiceUser && !isUser2InUser) {
      stats.correct++;
      log(`✅ [OK] Conversation ${conv._id} is correctly assigned.`);
      continue;
    }

    // Case 2: Swapped (userId is ServiceUser, serviceUserId is User)
    if (isUser1InServiceUser && !isUser1InUser && isUser2InUser && !isUser2InServiceUser) {
      // Check if swapping would conflict with another existing conversation
      const potentialDuplicate = await Conversation.findOne({
        _id: { $ne: conv._id },
        chatType: "SERVICE_CHAT",
        userId: conv.serviceUserId,
        serviceUserId: conv.userId,
        isDeleted: false,
      });

      if (potentialDuplicate) {
        stats.flagged++;
        stats.details.push({
          id: conv._id,
          status: "FLAGGED_DUPLICATE_CONFLICT",
          reason: `Swapping would duplicate existing conversation ${potentialDuplicate._id}`,
        });
        log(`⚠️ [FLAGGED] Conversation ${conv._id}: Swapping conflicts with existing conversation ${potentialDuplicate._id}.`);
        continue;
      }

      // Perform swap
      const originalUserId = conv.userId;
      const originalServiceUserId = conv.serviceUserId;
      const originalUserUnread = conv.userUnreadCount || 0;
      const originalServiceUnread = conv.serviceUserUnreadCount || 0;

      conv.userId = originalServiceUserId;
      conv.serviceUserId = originalUserId;
      conv.userUnreadCount = originalServiceUnread;
      conv.serviceUserUnreadCount = originalUserUnread;

      await conv.save();
      stats.repaired++;
      stats.details.push({
        id: conv._id,
        status: "REPAIRED",
        oldUserId: originalUserId,
        oldServiceUserId: originalServiceUserId,
        newUserId: conv.userId,
        newServiceUserId: conv.serviceUserId,
      });
      log(`🔄 [REPAIRED] Conversation ${conv._id}: Swapped userId <-> serviceUserId.`);
      continue;
    }

    // Case 3: Ambiguous or missing participant records
    stats.flagged++;
    stats.details.push({
      id: conv._id,
      status: "FLAGGED_AMBIGUOUS",
      reason: `Ambiguous user role lookup. userId (${userIdStr}): User=${isUser1InUser}, ServiceUser=${isUser1InServiceUser}. serviceUserId (${serviceUserIdStr}): User=${isUser2InUser}, ServiceUser=${isUser2InServiceUser}.`,
    });
    log(`⚠️ [FLAGGED] Conversation ${conv._id}: Ambiguous participant records. Left unchanged for manual review.`);
  }

  log("\n==========================================");
  log(`MIGRATION SUMMARY:`);
  log(`Total Inspected : ${stats.total}`);
  log(`Already Correct : ${stats.correct}`);
  log(`Repaired        : ${stats.repaired}`);
  log(`Flagged/Manual  : ${stats.flagged}`);
  log("==========================================\n");

  if (disconnectAfter && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    log("MongoDB connection closed.");
  }

  return stats;
}

if (require.main === module) {
  repairServiceChatConversations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}

module.exports = { repairServiceChatConversations };
