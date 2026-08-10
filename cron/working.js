const Booking = require("../models/Booking");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");

const { sendNotification } = require("../utils/notificationService");

exports.releaseOnCheckIn = async () => {
  try {
    const now = new Date();

    const bookings = await Booking.find({
      bookingStatus: "confirmed",
      checkIn: { $lte: now },
      isCancelled: false,
      isAmountReleased: false,
    });

    for (const booking of bookings) {

      /* =============================
         🔥 COMMON DATA
      ============================== */
      const commonData = {
        bookingId: booking._id.toString(),
        totalAmount: booking.totalAmount,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        type: "AMOUNT_RELEASE",
      };

      /* =============================
         🔥 MULTI PROVIDER SUPPORT
      ============================== */
      if (booking.providerBreakdown?.length > 0) {
        for (const provider of booking.providerBreakdown) {

          const wallet = await Wallet.findOne({ user: provider.user });
          if (!wallet) continue;

          const amount = provider.amount;

          // safety check
          if (wallet.holdBalance < amount) continue;

          /* =============================
             MOVE HOLD → AVAILABLE
          ============================== */
          wallet.holdBalance -= amount;
          wallet.availableBalance += amount;

          await wallet.save();

          /* =============================
             TRANSACTION
          ============================== */
          await WalletTransaction.create({
            wallet: wallet._id,
            user: provider.user,
            type: "credit",
            amount,
            bookingId: booking._id,
            referenceId: provider.referenceId,
            description: "Amount released on check-in",
            transactionType: "release_on_checkin",
          });

          /* =============================
             🔔 PROVIDER NOTIFICATION
          ============================== */
          await sendNotification({
            receiverId: provider.user,
            receiverModel: "ServiceUser",
            title: "Payment Released 💰",
            body: `Amount ${amount} has been added to your wallet`,
            type: "PAYMENT",
            referenceId: booking._id,
            referenceType: "Booking",
            data: {
              ...commonData,
              amount,
            },
          });
        }
      }

      /* =============================
         🔔 USER NOTIFICATION (OPTIONAL)
      ============================== */
      await sendNotification({
        receiverId: booking.user,
        receiverModel: "User",
        title: "Booking Started 🏨",
        body: "Your booking has started. Enjoy your stay!",
        type: "BOOKING",
        referenceId: booking._id,
        referenceType: "Booking",
        data: commonData,
      });

      /* =============================
         MARK RELEASED
      ============================== */
      booking.isAmountReleased = true;
      await booking.save();
    }

    console.log("✅ Release cron executed");

  } catch (error) {
    console.error("❌ Release cron error:", error.message);
  }
};