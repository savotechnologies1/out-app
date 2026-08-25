const Booking = require("../models/Booking");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");

const { sendNotification } = require("../utils/notificationService");
const { autoCancelExpiredBookings } = require("../services/bookingExpiryService");

exports.autoCancelExpiredBookings = autoCancelExpiredBookings;

/* ============================================================
   🔔 USER NOTIFICATION ON CHECK-IN
   Triggers as soon as checkIn date/time arrives (checkIn <= now)
============================================================ */
exports.notifyOnCheckIn = async () => {
  try {
    const now = new Date();

    const bookings = await Booking.find({
      bookingStatus: "confirmed",
      isCancelled: false,
      isCheckInNotified: { $ne: true },
      $or: [
        { checkIn: { $lte: now } },
        {
          bookingType: "SERVICE",
          "services.serviceDate": { $lte: now }
        }
      ]
    });

    for (const booking of bookings) {
      const firstService = booking.services?.[0] || {};
      const commonData = {
        bookingId: booking._id.toString(),
        totalAmount: booking.totalAmount,
        checkIn: booking.checkIn || firstService.serviceDate,
        checkOut: booking.checkOut || firstService.serviceDate,
        type: "BOOKING_STARTED",
      };

      /* =============================
         🔔 USER NOTIFICATION
      ============================== */
      await sendNotification({
        receiverId: booking.user,
        receiverModel: "User",
        title: "Booking Started 🏨",
        body: booking.bookingType === "SERVICE"
          ? "Your service booking has started."
          : "Your booking has started. Enjoy your stay!",
        type: "BOOKING",
        referenceId: booking._id,
        referenceType: "Booking",
        data: commonData,
      });

      /* =============================
         🔔 PROVIDER NOTIFICATION
      ============================== */
      if (booking.providerBreakdown?.length > 0) {
        for (const provider of booking.providerBreakdown) {
          await sendNotification({
            receiverId: provider.user,
            receiverModel: "ServiceUser",
            title: "Booking Started 🚀",
            body: booking.bookingType === "SERVICE"
              ? "Your service booking has started."
              : "Your guest check-in date has arrived. The booking has started.",
            type: "BOOKING",
            referenceId: booking._id,
            referenceType: "Booking",
            data: commonData,
          });
        }
      }

      booking.isCheckInNotified = true;
      await booking.save();
    }

    console.log("✅ Check-in notification cron executed");
  } catch (error) {
    console.error("❌ Check-in notification cron error:", error.message);
  }
};

/* ============================================================
   💰 PROVIDER WALLET RELEASE ON CHECKOUT + 2 DAYS
   Triggers 2 days after checkOut (e.g. 10-11 Aug booking -> 13 Aug)
============================================================ */
exports.releaseOnCheckIn = async () => {
  try {
    const now = new Date();

    // Calculate release threshold (2 days after checkout/cancellation, e.g., releases after 2 days)
    const releaseThreshold = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const bookings = await Booking.find({
      isAmountReleased: false,
      $or: [
        {
          bookingStatus: "confirmed",
          isCancelled: false,
          $or: [
            { checkOut: { $lte: releaseThreshold } },
            {
              bookingType: "SERVICE",
              "services.serviceDate": { $lte: releaseThreshold }
            }
          ]
        },
        {
          bookingStatus: "cancelled",
          isCancelled: true,
          cancellationDate: { $lte: releaseThreshold }
        }
      ]
    });

    for (const booking of bookings) {

      /* =============================
         🔥 COMMON DATA
      ============================== */
      const firstService = booking.services?.[0] || {};
      const commonData = {
        bookingId: booking._id.toString(),
        totalAmount: booking.totalAmount,
        checkIn: booking.checkIn || firstService.serviceDate,
        checkOut: booking.checkOut || firstService.serviceDate,
        type: "AMOUNT_RELEASE",
      };

      /* =============================
         🔥 MULTI PROVIDER SUPPORT
      ============================== */
      if (booking.providerBreakdown?.length > 0) {
        let allProvidersReleased = true;
        const refundRatio = booking.totalAmount > 0 ? Math.min(booking.refundAmount / booking.totalAmount, 1) : 0;

        for (const provider of booking.providerBreakdown) {
          if (provider.payoutReleaseStatus === "RELEASED") {
            continue;
          }

          const wallet = await Wallet.findOne({ user: provider.user });
          if (!wallet) {
            allProvidersReleased = false;
            continue;
          }

          let amount = provider.amount;

          if (booking.isCancelled) {
            if (provider.retainedAmount !== undefined && provider.retainedAmount !== null) {
              amount = provider.retainedAmount;
            } else {
              const providerRefund = Number((provider.amount * refundRatio).toFixed(2));
              amount = Number((provider.amount - providerRefund).toFixed(2));
            }

            // Deduct only the retained amount from holdBalance
            const holdDeduction = Math.min(wallet.holdBalance, amount);
            if (holdDeduction > 0) {
              wallet.holdBalance = Number((wallet.holdBalance - holdDeduction).toFixed(2));
              await wallet.save();
            }
          } else {
            // For confirmed bookings, release the full amount and deduct from holdBalance
            if (wallet.holdBalance < amount) {
              allProvidersReleased = false;
              continue;
            }
            wallet.holdBalance = Number((wallet.holdBalance - amount).toFixed(2));
            await wallet.save();
          }

          if (amount > 0) {
            wallet.balance = Number(((wallet.balance || 0) + amount).toFixed(2));
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
              description: booking.isCancelled
                ? "Retained non-refundable earnings from cancelled booking released"
                : "Amount released on check-in",
              transactionType: booking.isCancelled
                ? "release_on_cancellation"
                : "release_on_checkin",
            });

            /* =============================
               🔔 PROVIDER NOTIFICATION
            ============================= */
            await sendNotification({
              receiverId: provider.user,
              receiverModel: "ServiceUser",
              title: "Payment Released 💰",
              body: booking.isCancelled
                ? `Your payout of ${amount} SAR has been released to your wallet.`
                : `Amount ${amount} has been added to your wallet`,
              type: "PAYMENT",
              referenceId: booking._id,
              referenceType: "Booking",
              data: {
                ...commonData,
                amount,
              },
            });
          }

          // Mark provider as released
          provider.payoutReleaseStatus = "RELEASED";
          provider.payoutReleasedAt = new Date();
          if (booking.isCancelled) {
            if (provider.refundAmount === undefined || provider.refundAmount === null) {
              const providerRefund = Number((provider.amount * refundRatio).toFixed(2));
              provider.refundAmount = providerRefund;
            }
            if (provider.retainedAmount === undefined || provider.retainedAmount === null) {
              provider.retainedAmount = amount;
            }
          } else {
            provider.refundAmount = 0;
            provider.retainedAmount = provider.amount;
          }
        }

        // Save progress for the providers
        await booking.save();

        // Check if all providers are released
        for (const provider of booking.providerBreakdown) {
          if (provider.payoutReleaseStatus !== "RELEASED") {
            allProvidersReleased = false;
          }
        }

        if (allProvidersReleased) {
          booking.isAmountReleased = true;
          await booking.save();
        }
      } else {
        booking.isAmountReleased = true;
        await booking.save();
      }
    }

    console.log("✅ Release cron executed");

  } catch (error) {
    console.error("❌ Release cron error:", error.message);
  }
};