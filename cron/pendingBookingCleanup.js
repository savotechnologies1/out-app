const cron = require("node-cron");

cron.schedule("0 0 * * *", async () => {

  try {

    console.log("Running pending booking cleanup cron...");

    const now = new Date();

    /* ========================
       GET EXPIRED PENDING BOOKINGS
    ======================== */

    const expiredBookings = await Booking.find({
      bookingStatus: "pending",
      pendingExpiredAt: { $lte: now }
    });

    for (const booking of expiredBookings) {

      /* ========================
         DELETE PAYMENT TRANSACTIONS
      ======================== */

      await PaymentTransaction.deleteMany({
        booking: booking._id
      });

      /* ========================
         DELETE HOTEL AVAILABILITY
      ======================== */

      await HotelAvailability.deleteMany({
        booking: booking._id
      });

      /* ========================
         DELETE SERVICE AVAILABILITY
      ======================== */

      await ServiceAvailability.deleteMany({
        booking: booking._id
      });

      /* ========================
         DELETE WALLET TRANSACTIONS
      ======================== */

      await WalletTransaction.deleteMany({
        bookingId: booking._id
      });

      /* ========================
         DELETE NOTIFICATIONS
      ======================== */

      await Notification.deleteMany({
        referenceId: booking._id
      });

      /* ========================
         DELETE BOOKING
      ======================== */

      await booking.deleteOne();

    }

    console.log(
      `${expiredBookings.length} expired pending bookings removed`
    );

  } catch (error) {

    console.error(
      "Pending booking cleanup cron error:",
      error
    );

  }

});