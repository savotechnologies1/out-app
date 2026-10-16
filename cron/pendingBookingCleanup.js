const cron = require("node-cron");
const Booking = require("../models/Booking");
const PaymentTransaction = require("../models/PaymentTransaction");
const HotelAvailability = require("../models/Availability");
const ServiceAvailability = require("../models/ServiceAvailability");
const WalletTransaction = require("../models/WalletTransaction");
const Notification = require("../models/Notification");
const UserWallet = require("../models/UserWallet");
const UserWalletTransaction = require("../models/UserWalletTransaction");


cron.schedule("0 0 * * *", async () => {

  try {

    // console.log("=================================");
    // console.log("Running pending booking cleanup cron...");
    // console.log("Current Time:", new Date());
    // console.log("=================================");

    const now = new Date();

    /* ========================
       GET EXPIRED PENDING BOOKINGS
    ======================== */

    const expiredBookings = await Booking.find({
      bookingStatus: "pending",
      paymentStatus: { $ne: "paid" },
      webhookProcessed: false,
      isCancelled: false,
      pendingExpiredAt: {
        $exists: true,
        $lte: now
      }
    });

    // console.log(
    //   `Found ${expiredBookings.length} expired pending bookings`
    // );

    /* ========================
       LOOP ALL BOOKINGS
    ======================== */

    for (const booking of expiredBookings) {

      try {

        console.log(
          `Processing booking: ${booking._id}`
        );

        /* ========================
           REFUND USER WALLET IF APPLIED
        ======================== */
        if (booking.walletAmountApplied > 0 && !booking.walletRefunded) {
          const userWallet = await UserWallet.findOne({ user: booking.user });
          if (userWallet) {
            const newBal = Number((userWallet.balance + booking.walletAmountApplied).toFixed(2));
            userWallet.balance = newBal;
            await userWallet.save();

            await UserWalletTransaction.create({
              wallet: userWallet._id,
              user: booking.user,
              type: "credit",
              transactionType: "refund",
              amount: booking.walletAmountApplied,
              balanceAfter: newBal,
              currency: userWallet.currency || "SAR",
              status: "completed",
              description: `Refund of wallet amount due to expired pending booking ${booking.orderId}`
            });
            booking.walletRefunded = true;
          }
        }

        /* ========================
           DELETE PAYMENT TRANSACTIONS
        ======================== */

        const deletedPayments =
          await PaymentTransaction.deleteMany({
            booking: booking._id
          });

        // console.log(
        //   `Deleted payment transactions: ${deletedPayments.deletedCount}`
        // );

        /* ========================
           DELETE HOTEL AVAILABILITY
        ======================== */

        const deletedHotelAvailability =
          await HotelAvailability.deleteMany({
            booking: booking._id
          });

        // console.log(
        //   `Deleted hotel availability: ${deletedHotelAvailability.deletedCount}`
        // );

        /* ========================
           DELETE SERVICE AVAILABILITY
        ======================== */

        const deletedServiceAvailability =
          await ServiceAvailability.deleteMany({
            booking: booking._id
          });

        // console.log(
        //   `Deleted service availability: ${deletedServiceAvailability.deletedCount}`
        // );

        /* ========================
           DELETE WALLET TRANSACTIONS
        ======================== */

        const deletedWalletTransactions =
          await WalletTransaction.deleteMany({
            bookingId: booking._id
          });

        // console.log(
        //   `Deleted wallet transactions: ${deletedWalletTransactions.deletedCount}`
        // );

        /* ========================
           DELETE NOTIFICATIONS
        ======================== */

        const deletedNotifications =
          await Notification.deleteMany({
            referenceId: booking._id
          });

        console.log(
          `Deleted notifications: ${deletedNotifications.deletedCount}`
        );

        /* ========================
           DELETE BOOKING
        ======================== */

        await Booking.deleteOne({
          _id: booking._id
        });

        console.log(
          `Booking deleted successfully: ${booking._id}`
        );

      } catch (innerError) {

        console.error(
          `Error deleting booking ${booking._id}:`,
          innerError
        );

      }

    }

    console.log(
      `${expiredBookings.length} expired pending bookings removed`
    );

    console.log("=================================");
    console.log("Pending booking cleanup cron completed");
    console.log("=================================");

  } catch (error) {

    console.error(
      "Pending booking cleanup cron error:",
      error
    );

  }

});