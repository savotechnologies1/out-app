const assert = require("assert");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Properties = require("../models/Properties");
const Service = require("../models/Service");
const ServiceAvailability = require("../models/ServiceAvailability");
const HotelAvailability = require("../models/Availability");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const { paymentWebhook } = require("../controller/paymentController");
const { updateBookingApprovalStatus } = require("../controller/bookingController");
const { generateServiceSlots, validateServiceSlot } = require("../utils/serviceAvailabilityUtils");

require("dotenv").config();

async function runTests() {
  console.log("==================================================");
  console.log("🧪 RUNNING SERVICE TIME-SLOT BOOKING TEST SUITE");
  console.log("==================================================");

  // Connect to database
  const mongoUri = process.env.CONNECTION_STRING || "mongodb://localhost:27017/out-app";
  let isDbConnected = false;
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    }
    isDbConnected = true;
  } catch (dbErr) {
    console.log("❌ Failed to connect to MongoDB. Make sure MongoDB is running.");
    process.exit(1);
  }

  const mockUserId = new mongoose.Types.ObjectId();
  const mockProviderId = new mongoose.Types.ObjectId();
  let propertyId, service1Id, service2Id;

  // Clean DB before starting
  const cleanDb = async () => {
    const testBookings = await Booking.find({ 
      $or: [{ user: mockUserId }, { orderId: "ORD_TEST_WEBHOOK" }] 
    }).select("_id");
    const testBookingIds = testBookings.map(b => b._id);

    await Booking.deleteMany({ 
      $or: [{ user: mockUserId }, { orderId: "ORD_TEST_WEBHOOK" }] 
    });
    await Properties.deleteMany({ name: { $in: ["Luxury Villa", "Villa"] } });
    await Service.deleteMany({ name: { $in: ["Spa Massage", "Haircut", "Massage"] } });
    await ServiceAvailability.deleteMany({ booking: { $in: testBookingIds } });
    await HotelAvailability.deleteMany({ booking: { $in: testBookingIds } });
    await Wallet.deleteMany({ user: mockProviderId });
    await WalletTransaction.deleteMany({ user: mockProviderId });
  };

  try {
    await cleanDb();

    // Create test property
    const property = await Properties.create({
      user: mockProviderId,
      name: "Luxury Villa",
      price: 500,
      maxGuests: 4,
      instantBooking: false,
      document: "dummy.pdf",
      cancellationPolicy: new mongoose.Types.ObjectId()
    });
    propertyId = property._id;

    // Create test service 1 (e.g. Spa)
    const service1 = await Service.create({
      user: mockProviderId,
      name: "Spa Massage",
      price: 150,
      duration: 60, // 60 mins
      schedule: [
        { day: "Monday", enabled: true, slots: [{ start: "09:00", end: "12:00" }] },
        { day: "Tuesday", enabled: true, slots: [{ start: "09:00", end: "12:00" }] },
        { day: "Wednesday", enabled: true, slots: [{ start: "09:00", end: "12:00" }] },
        { day: "Thursday", enabled: true, slots: [{ start: "09:00", end: "12:00" }] },
        { day: "Friday", enabled: true, slots: [{ start: "09:00", end: "12:00" }] },
        { day: "Saturday", enabled: true, slots: [{ start: "09:00", end: "12:00" }] },
        { day: "Sunday", enabled: true, slots: [{ start: "09:00", end: "12:00" }] }
      ],
      document: "dummy.pdf",
      cancellationPolicy: new mongoose.Types.ObjectId(),
      location: { coordinates: { coordinates: [46.6753, 24.7136] } }
    });
    service1Id = service1._id;

    // Create test service 2 (e.g. Haircut)
    const service2 = await Service.create({
      user: mockProviderId,
      name: "Haircut",
      price: 80,
      duration: 30, // 30 mins
      schedule: [
        { day: "Sunday", enabled: true, slots: [{ start: "14:00", end: "15:00" }] },
        { day: "Monday", enabled: true, slots: [{ start: "14:00", end: "15:00" }] }
      ],
      document: "dummy.pdf",
      cancellationPolicy: new mongoose.Types.ObjectId(),
      location: { coordinates: { coordinates: [46.6753, 24.7136] } }
    });
    service2Id = service2._id;

    // ---------------------------------------------------
    // TEST 1: Slot Generation Utility
    // ---------------------------------------------------
    {
      const slotsS1 = generateServiceSlots(service1, "2026-08-24"); // Monday
      assert.strictEqual(slotsS1.length, 3, "Service 1 should generate 3 slots of 60 mins each");
      assert.deepStrictEqual(slotsS1[0], { startTime: "09:00", endTime: "10:00" });

      const slotsS2 = generateServiceSlots(service2, "2026-08-25"); // Tuesday - Not working day
      assert.strictEqual(slotsS2.length, 0, "Service 2 should generate 0 slots on a non-working day");

      const slotsS2_sunday = generateServiceSlots(service2, "2026-08-23"); // Sunday
      assert.strictEqual(slotsS2_sunday.length, 2, "Service 2 should generate 2 slots of 30 mins each on Sunday");
      assert.deepStrictEqual(slotsS2_sunday[0], { startTime: "14:00", endTime: "14:30" });

      console.log("✅ Test 1 Passed: Slot Generation Utility correctly processes duration, days, and working hours.");
    }

    // ---------------------------------------------------
    // TEST 2: Validate Service Slot Validation logic
    // ---------------------------------------------------
    {
      // Valid slot
      const check1 = await validateServiceSlot(service1, "2026-08-24", "09:00", "10:00");
      assert.strictEqual(check1.valid, true);

      // Outside working hours
      const check2 = await validateServiceSlot(service1, "2026-08-24", "08:00", "09:00");
      assert.strictEqual(check2.valid, false);

      // Wrong day
      const check3 = await validateServiceSlot(service2, "2026-08-25", "14:00", "14:30");
      assert.strictEqual(check3.valid, false);

      console.log("✅ Test 2 Passed: validateServiceSlot correctly asserts working hours and working days.");
    }

    // ---------------------------------------------------
    // TEST 3: Standalone SERVICE booking slot reservation & double-booking prevention
    // ---------------------------------------------------
    {
      // Create first booking for Service 1 on 2026-08-24 from 09:00 to 10:00
      const booking1 = await Booking.create({
        orderId: "ORD_TEST3_" + Math.random().toString(36).substring(7).toUpperCase(),
        bookingType: "SERVICE",
        user: mockUserId,
        services: [{
          service: service1Id,
          price: 150,
          serviceDate: new Date("2026-08-24"),
          serviceStartTime: "09:00",
          serviceEndTime: "10:00"
        }],
        totalAmount: 150,
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        providerBreakdown: [{ user: mockProviderId, amount: 135, type: "service", referenceId: service1Id }]
      });

      // Simulate reservation
      await ServiceAvailability.create({
        service: service1Id,
        date: new Date("2026-08-24"),
        startTime: "09:00",
        endTime: "10:00",
        booking: booking1._id,
        isBooked: true
      });

      // Verify validation rejects double-booking overlapping slot
      const checkOverlap = await validateServiceSlot(service1, "2026-08-24", "09:00", "10:00");
      assert.strictEqual(checkOverlap.valid, false, "Overlapping slot must be invalid");

      // Verify validation allows non-overlapping slot on same day
      const checkNonOverlap = await validateServiceSlot(service1, "2026-08-24", "10:00", "11:00");
      assert.strictEqual(checkNonOverlap.valid, true, "Non-overlapping slot must be valid");

      console.log("✅ Test 3 Passed: Standalone SERVICE booking correctly prevents double-booking.");
    }


    // ---------------------------------------------------
    // TEST 4: Payment Webhook reserves the correct service slot (and NOT full day)
    // ---------------------------------------------------
    {
      await cleanDb();
      // Re-create villa and services
      const p = await Properties.create({ user: mockProviderId, name: "Villa", price: 500, maxGuests: 4, instantBooking: true, document: "dummy.pdf", cancellationPolicy: new mongoose.Types.ObjectId() });
      const s = await Service.create({
        user: mockProviderId,
        name: "Massage",
        price: 100,
        duration: 60,
        schedule: [
          { day: "Monday", enabled: true, slots: [{ start: "09:00", end: "12:00" }] }
        ],
        document: "dummy.pdf",
        cancellationPolicy: new mongoose.Types.ObjectId(),
        location: { coordinates: { coordinates: [46.6753, 24.7136] } },
        instantBooking: true
      });

      const booking = await Booking.create({
        orderId: "ORD_TEST4_" + Math.random().toString(36).substring(7).toUpperCase(),
        bookingType: "PROPERTY_SERVICE",
        user: mockUserId,
        property: p._id,
        checkIn: new Date("2026-08-24"),
        checkOut: new Date("2026-08-27"),
        services: [{
          service: s._id,
          price: 100,
          serviceDate: new Date("2026-08-24"),
          serviceStartTime: "10:00",
          serviceEndTime: "11:00"
        }],
        totalAmount: 1600, // 3 nights @ 500 + 100 service
        paymentStatus: "pending",
        bookingStatus: "pending",
        orderId: "ORD_TEST_WEBHOOK",
        providerBreakdown: [
          { user: mockProviderId, amount: 1350, type: "property", referenceId: p._id },
          { user: mockProviderId, amount: 90, type: "service", referenceId: s._id }
        ]
      });

      // Invoke paymentWebhook mock payload
      const mockReq = {
        body: {
          id: "ch_test_charge",
          status: "CAPTURED",
          reference: { order: "ORD_TEST_WEBHOOK" },
          currency: "SAR"
        }
      };

      const mockRes = {
        status: (code) => {
          assert.strictEqual(code, 200);
          return mockRes;
        },
        json: (data) => {
          assert.strictEqual(data.success, true);
          return mockRes;
        }
      };

      await paymentWebhook(mockReq, mockRes);

      // Verify database state: ServiceAvailability should have exactly ONE slot reserved from 10:00 to 11:00
      const serviceAvails = await ServiceAvailability.find({ booking: booking._id });
      assert.strictEqual(serviceAvails.length, 1, "Exactly one ServiceAvailability should be created");
      assert.strictEqual(serviceAvails[0].startTime, "10:00");
      assert.strictEqual(serviceAvails[0].endTime, "11:00");
      assert.strictEqual(serviceAvails[0].isBooked, true);

      // Verify HotelAvailability has been blocked for property stay nights (17, 18, 19)
      const hotelAvails = await HotelAvailability.find({ booking: booking._id });
      assert.strictEqual(hotelAvails.length, 3, "Three nights of Property stay should be blocked");

      console.log("✅ Test 4 Passed: paymentWebhook reserves only the exact selected service slot and blocks property dates correctly.");
    }

    // ---------------------------------------------------
    // TEST 5: Booking Cancellation releases the correct slots
    // ---------------------------------------------------
    {
      const { cancelBooking } = require("../controller/bookingController");
      // Find the booking from Test 4
      const booking = await Booking.findOne({ orderId: "ORD_TEST_WEBHOOK" });

      const mockReq = {
        params: { bookingId: booking._id.toString() },
        body: { reason: "CHANGED_MY_MIND" },
        user: { _id: mockUserId }
      };

      const mockRes = {
        statusCode: 200,
        status: (code) => {
          mockRes.statusCode = code;
          return mockRes;
        },
        send: (data) => {
          if (mockRes.statusCode !== 200) {
            console.error("❌ Controller error response in Test 5:", data);
            assert.fail(`Controller returned status ${mockRes.statusCode}: ${data.message || JSON.stringify(data)}`);
          }
          assert.strictEqual(data.success, true, "Cancellation should return success true");
        }
      };

      await cancelBooking(mockReq, mockRes);

      // Verify availability release
      const serviceAvails = await ServiceAvailability.find({ booking: booking._id });
      assert.strictEqual(serviceAvails.length, 0, "ServiceAvailability slots must be deleted on cancellation");

      const hotelAvails = await HotelAvailability.find({ booking: booking._id });
      assert.strictEqual(hotelAvails.length, 0, "HotelAvailability dates must be deleted on cancellation");

      console.log("✅ Test 5 Passed: Booking Cancellation releases service slots and property stay availability clean.");
    }

    // ---------------------------------------------------
    // TEST 6: Multiple Availability Windows & Update Conflict Validation
    // ---------------------------------------------------
    {
      await cleanDb();

      const schedule = [
        {
          day: "Monday",
          enabled: true,
          slots: [
            { start: "09:00", end: "11:00" },
            { start: "13:00", end: "15:00" }
          ]
        }
      ];

      const service = await Service.create({
        user: mockProviderId,
        name: "Multi Window Service",
        price: 120,
        duration: 60,
        schedule,
        document: "dummy.pdf",
        cancellationPolicy: new mongoose.Types.ObjectId(),
        location: { coordinates: { coordinates: [46.6753, 24.7136] } }
      });

      const slots = generateServiceSlots(service, "2026-08-24");
      assert.strictEqual(slots.length, 4, "Should generate exactly 4 slots");
      assert.deepStrictEqual(slots, [
        { startTime: "09:00", endTime: "10:00" },
        { startTime: "10:00", endTime: "11:00" },
        { startTime: "13:00", endTime: "14:00" },
        { startTime: "14:00", endTime: "15:00" }
      ]);

      const booking = await Booking.create({
        orderId: "ORD_TEST6_" + Math.random().toString(36).substring(7).toUpperCase(),
        bookingType: "SERVICE",
        user: mockUserId,
        services: [{
          service: service._id,
          price: 120,
          serviceDate: new Date("2026-08-24"),
          serviceStartTime: "13:00",
          serviceEndTime: "14:00"
        }],
        totalAmount: 120,
        paymentStatus: "paid",
        bookingStatus: "confirmed"
      });

      const newSchedule = [
        {
          day: "Monday",
          enabled: true,
          slots: [
            { start: "09:00", end: "11:00" }
          ]
        }
      ];

      const { updateService } = require("../controller/serviceController");

      const mockReq = {
        params: { id: service._id.toString() },
        body: { schedule: newSchedule },
        user: { _id: mockProviderId }
      };

      const mockRes = {
        statusCode: 200,
        status: (code) => {
          mockRes.statusCode = code;
          return mockRes;
        },
        json: (data) => {
          if (mockRes.statusCode !== 400) {
            console.error("ACTUAL ERROR IN CONTROLLER:", data);
          }
          assert.strictEqual(mockRes.statusCode, 400, "Should return 400 Bad Request on conflict");
          assert.strictEqual(data.success, false);
          assert.ok(data.message.includes("Conflict with active booking"), "Error message should mention conflict");
        }
      };

      await updateService(mockReq, mockRes);
      console.log("✅ Test 6 Passed: Service creation, multiple windows, and update conflict detection are verified.");
    }

    // Clean up & Disconnect
    await cleanDb();
    await mongoose.disconnect();

    console.log("==================================================");
    console.log("🎉 ALL SERVICE TIME-SLOT BOOKING TESTS PASSED!");
    console.log("==================================================");

  } catch (err) {
    console.error("❌ Test Suite Error:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
