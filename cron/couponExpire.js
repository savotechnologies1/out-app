const cron = require("node-cron");
const Coupon = require("../models/Coupon");

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const result = await Coupon.updateMany(
      {
        expiryDate: { $lte: now },
        status: "ACTIVE",
      },
      {
        $set: {
          status: "EXPIRED",
          isActive: false,
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`${result.modifiedCount} coupon(s) expired`);
    }
  } catch (error) {
    console.log(error.message);
  }
});