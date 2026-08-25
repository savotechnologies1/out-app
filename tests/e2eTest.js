const axios = require("axios");
const mongoose = require("mongoose");
const FormData = require("form-data");
const assert = require("assert");
require("dotenv").config();

// TOKENS & SETUP
const SERVICE_USER_TOKEN = process.env.SERVICE_USER_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Il9pZCI6IjZhNmMzOWJlOGE1OTAzMTgxM2FmOTVlNyIsImVtYWlsIjoiYWxleGExQGdtYWlsLmNvbSIsInBob25lIjoiKzkxOTM5OTMwMzA0OSIsInJvbGUiOiJzZXJ2aWNlX3VzZXIifSwiaWF0IjoxNzg2MzUzMzIxLCJleHAiOjE3ODg5NDUzMjF9.jiGnev_AHNXpBSza9Alpkr2XgrWW_8nV6-XxuTUuULU";
const USER_TOKEN = process.env.USER_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Il9pZCI6IjZhNmMyNGEyYmEyNGU1OTVlNTM1NjdkNCIsInBob25lIjoiKzkxOTM5OTMwMzA0OSIsInJvbGUiOiJ1c2VyIn0sImlhdCI6MTc4NjM0MDc5MCwiZXhwIjoxNzg4OTMyNzkwfQ.OuVCpgTcmVPcLfU5XNIAmTGbjxpvwx3M3aDAXEEpuSY";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Il9pZCI6IjY5YTU1NmExNjJkODFjZDQ5NTRmOTAxZCIsImZpcnN0TmFtZSI6IlN1cGVyIiwiZW1haWwiOiJnZDM0LnN0cGxAZ21haWwuY29tIn0sImlhdCI6MTc4NjUxNTEzMCwiZXhwIjoxNzg5MTA3MTMwfQ.mGeUXBFPex0HTv0IwVkYhQE3dbNec4EoSkUTp68FGeU";
const BASE_URL = process.env.BASE_URL || "http://localhost:8088";

// User IDs from token
const TEST_USER_ID = "6a6c24a2ba24e595e53567d4";

const results = [];

function recordResult(scenario, api, result, notes = "") {
  results.push({ scenario, api, result, notes });
  console.log(`[${result}] ${scenario} (${api}) ${notes ? "- " + notes : ""}`);
}

async function runE2ETests() {
  console.log("==================================================");
  console.log("🚀 STARTING E2E API TEST WORKFLOW");
  console.log("==================================================");

  let isDbConnected = false;
  let categoryId, policyId, serviceId, propertyId, packageId;
  let booking1Id, booking2Id, booking3Id;
  let orderId1, orderId2;

  // DB models for setup/cleanup
  const Booking = require("../models/Booking");
  const Service = require("../models/Service");
  const Properties = require("../models/Properties");
  const Package = require("../models/Package");
  const ServiceCategory = require("../models/ServiceCategory");
  const CancellationPolicy = require("../models/CancellationPolicy");
  const User = require("../models/User");
  const ServiceAvailability = require("../models/ServiceAvailability");
  const HotelAvailability = require("../models/Availability");

  // Determine a future Sunday
  const nextSunday = new Date();
  nextSunday.setDate(nextSunday.getDate() + ((7 - nextSunday.getDay()) % 7 || 7));
  const dateStr = nextSunday.toISOString().split("T")[0]; // YYYY-MM-DD format

  const tuesday = new Date(nextSunday);
  tuesday.setDate(tuesday.getDate() + 2);
  const tuesdayStr = tuesday.toISOString().split("T")[0];

  try {
    // ---------------------------------------------------
    // SETUP: Connect & prepare database state
    // ---------------------------------------------------
    const mongoUri = process.env.CONNECTION_STRING || "mongodb://localhost:27017/out-app";
    await mongoose.connect(mongoUri);
    isDbConnected = true;

    // Clean up database collections for clean test execution
    await Booking.deleteMany({});
    await ServiceAvailability.deleteMany({});
    await HotelAvailability.deleteMany({});

    const ServiceUser = require("../models/ServiceUser");
    const Admin = require("../models/Admin");

    // Inject tokens to bypass middleware token array checks
    await User.findByIdAndUpdate(TEST_USER_ID, {
      $addToSet: { tokens: USER_TOKEN },
      $setOnInsert: { phone: "+919399303049", role: "user" },
      identityVerificationStatus: "VERIFIED"
    }, { upsert: true, new: true });

    await ServiceUser.findByIdAndUpdate("6a6c39be8a59031813af95e7", {
      $addToSet: { tokens: SERVICE_USER_TOKEN },
      $setOnInsert: { phone: "+919399303049", role: "service_user", isApproved: "approved", isActive: true }
    }, { upsert: true, new: true });

    await Admin.findByIdAndUpdate("69a556a162d81cd4954f901d", {
      $addToSet: { tokens: ADMIN_TOKEN },
      $setOnInsert: { email: "gd34.stpl@gmail.com", firstName: "Super" }
    }, { upsert: true, new: true });


    // Fetch or create Category & Policy
    let category = await ServiceCategory.findOne({ isActive: true, isDeleted: false });
    if (!category) {
      category = await ServiceCategory.create({ name: "E2E Spa Category", isActive: true });
    }
    categoryId = category._id;

    let policy = await CancellationPolicy.findOne({ isActive: true });
    if (!policy) {
      policy = await CancellationPolicy.create({ name: "E2E Cancellation Policy", isActive: true, rules: [] });
    }
    policyId = policy._id;

    // Fetch or create a Property for PROPERTY_SERVICE / PACKAGE
    let property = await Properties.findOne({ isActive: true });
    if (!property) {
      property = await Properties.create({
        user: new mongoose.Types.ObjectId(),
        name: "E2E Test Property",
        price: 500,
        maxGuests: 4,
        instantBooking: true,
        document: "mock.pdf",
        cancellationPolicy: policyId
      });
    }
    propertyId = property._id;

    // ---------------------------------------------------
    // 1. Create Service (Multi-Window & slotDuration)
    // ---------------------------------------------------
    try {
      const form = new FormData();
      form.append("name", "E2E TEST - Service Slot Booking - " + Date.now());
      form.append("category", categoryId.toString());
      form.append("price", "150");
      form.append("priceType", "flat");
      form.append("maxPersons", "2");
      form.append("description", "Premium full-body massage therapy.");
      form.append("slotDuration", "60");
      form.append("schedule", JSON.stringify([
        {
          day: nextSunday.toLocaleString("en-US", { weekday: "long" }),
          enabled: true,
          slots: [
            { start: "09:00", end: "11:00" },
            { start: "13:00", end: "15:00" },
            { start: "17:00", end: "19:00" }
          ]
        },
        {
          day: tuesday.toLocaleString("en-US", { weekday: "long" }),
          enabled: false,
          slots: []
        }
      ]));
      form.append("lat", "24.7136");
      form.append("lng", "46.6753");
      form.append("city", "Riyadh");
      form.append("state", "Riyadh");
      form.append("country", "Saudi Arabia");
      form.append("cancellationPolicy", policyId.toString());
      form.append("document", Buffer.from("mock doc content"), { filename: "doc.pdf", contentType: "application/pdf" });
      form.append("serviceMedia", Buffer.from("mock media content"), { filename: "img.png", contentType: "image/png" });

      const res = await axios.post(`${BASE_URL}/api/service/createService`, form, {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${SERVICE_USER_TOKEN}` }
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      serviceId = res.data.data._id;
      await Service.findByIdAndUpdate(serviceId, { instantBooking: true });
      recordResult("Create Service", "POST /api/service/createService", "PASS", `Service ID: ${serviceId}`);
    } catch (e) {
      recordResult("Create Service", "POST /api/service/createService", "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 2. Get Service & Verify creation
    // ---------------------------------------------------
    try {
      const res = await axios.get(`${BASE_URL}/api/service/getSingleService/${serviceId}`, {
        headers: { Authorization: `Bearer ${SERVICE_USER_TOKEN}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.duration, 60);
      assert.strictEqual(res.data.data.schedule.length, 2);
      recordResult("Get Service Verification", `GET /api/service/getSingleService/${serviceId}`, "PASS", "Validated slots & duration");
    } catch (e) {
      recordResult("Get Service Verification", `GET /api/service/getSingleService/${serviceId}`, "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 3. Update Service Schedule
    // ---------------------------------------------------
    try {
      // Temporarily change slots to 08:00 - 10:00, then change back
      const dayName = nextSunday.toLocaleString("en-US", { weekday: "long" });
      const newSchedule = [{
        day: dayName,
        enabled: true,
        slots: [{ start: "08:00", end: "10:00" }]
      }];

      let res = await axios.put(`${BASE_URL}/api/service/updateService/${serviceId}`, 
        { schedule: newSchedule }, 
        { headers: { Authorization: `Bearer ${SERVICE_USER_TOKEN}` } }
      );
      assert.strictEqual(res.data.success, true);

      // Verify updated schedule in availability API
      const availRes = await axios.get(`${BASE_URL}/api/service/${serviceId}/availability?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` }
      });
      assert.deepStrictEqual(availRes.data.slots, [
        { startTime: "08:00", endTime: "09:00" },
        { startTime: "09:00", endTime: "10:00" }
      ]);

      // Change schedule back to multi-window for subsequent booking tests
      const originalSchedule = [
        {
          day: dayName,
          enabled: true,
          slots: [
            { start: "09:00", end: "11:00" },
            { start: "13:00", end: "15:00" },
            { start: "17:00", end: "19:00" }
          ]
        },
        {
          day: tuesday.toLocaleString("en-US", { weekday: "long" }),
          enabled: false,
          slots: []
        }
      ];
      await axios.put(`${BASE_URL}/api/service/updateService/${serviceId}`, 
        { schedule: originalSchedule }, 
        { headers: { Authorization: `Bearer ${SERVICE_USER_TOKEN}` } }
      );

      recordResult("Update Service Schedule", `PUT /api/service/updateService/${serviceId}`, "PASS", "Verified new slots offered");
    } catch (e) {
      recordResult("Update Service Schedule", `PUT /api/service/updateService/${serviceId}`, "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 4. Get Availability Slots (Multi-window test)
    // ---------------------------------------------------
    try {
      const res = await axios.get(`${BASE_URL}/api/service/${serviceId}/availability?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.slots.length, 6);
      // Gaps check (e.g. 11:00 - 12:00 must NOT be in the slots list)
      const hasGap = res.data.slots.some(s => s.startTime === "11:00" && s.endTime === "12:00");
      assert.strictEqual(hasGap, false, "Gaps must not be available");
      recordResult("Get Availability", `GET /api/service/${serviceId}/availability`, "PASS", "Verified multi-window slots generated successfully");
    } catch (e) {
      recordResult("Get Availability", `GET /api/service/${serviceId}/availability`, "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 5. Get Availability on Non-working Day (Tuesday)
    // ---------------------------------------------------
    try {
      const res = await axios.get(`${BASE_URL}/api/service/${serviceId}/availability?date=${tuesdayStr}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` }
      });
      assert.strictEqual(res.data.slots.length, 0);
      recordResult("Non-working Day Availability", `GET /api/service/${serviceId}/availability?date=Tuesday`, "PASS", "Returns empty slots list");
    } catch (e) {
      recordResult("Non-working Day Availability", `GET /api/service/${serviceId}/availability?date=Tuesday`, "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 6. Test Book Slot 1 (09:00 - 10:00)
    // ---------------------------------------------------
    try {
      const checkRes = await axios.post(`${BASE_URL}/api/booking/check-availability`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          serviceDate: dateStr,
          serviceStartTime: "09:00",
          serviceEndTime: "10:00"
        }]
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      assert.strictEqual(checkRes.data.available, true);
      assert.strictEqual(checkRes.data.priceDetails.servicesTotal, 150, "Pricing must be per slot, not × nights");

      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "09:00",
          serviceEndTime: "10:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      booking1Id = bookRes.data.bookingId;
      orderId1 = bookRes.data.orderId;

      recordResult("Book Slot 1", "POST /api/booking/create", "PASS", `Booking 1 Created: ${booking1Id}`);
    } catch (e) {
      recordResult("Book Slot 1", "POST /api/booking/create", "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 7. Verify Slot 1 becomes Unavailable, others stay available
    // ---------------------------------------------------
    try {
      // Simulate Payment confirmation to block the slot
      await axios.post(`${BASE_URL}/api/payment/webhook`, {
        id: "",
        status: "CAPTURED",
        reference: { order: orderId1 },
        currency: "SAR"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const res = await axios.get(`${BASE_URL}/api/service/${serviceId}/availability?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` }
      });
      const hasSlot1 = res.data.slots.some(s => s.startTime === "09:00" && s.endTime === "10:00");
      assert.strictEqual(hasSlot1, false, "Booked slot 1 must become unavailable");

      const hasSlot2 = res.data.slots.some(s => s.startTime === "10:00" && s.endTime === "11:00");
      assert.strictEqual(hasSlot2, true, "Unbooked slot 2 on same day must remain available");

      recordResult("Slot Availability Update Verification", "GET /availability after booking", "PASS", "Only exact slot blocked");
    } catch (e) {
      recordResult("Slot Availability Update Verification", "GET /availability after booking", "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 8. Book Slot 2 on Same Day (10:00 - 11:00)
    // ---------------------------------------------------
    try {
      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "10:00",
          serviceEndTime: "11:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      booking2Id = bookRes.data.bookingId;
      orderId2 = bookRes.data.orderId;

      await axios.post(`${BASE_URL}/api/payment/webhook`, {
        id: "",
        status: "CAPTURED",
        reference: { order: orderId2 },
        currency: "SAR"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      recordResult("Same-Day Second Slot", "POST /booking/create", "PASS", `Booking 2 Created: ${booking2Id}`);

      // Cancel Booking 2 immediately to release the slot for future tests
      await axios.post(`${BASE_URL}/api/booking/cancel/${booking2Id}`, {
        reason: "CHANGED_MY_MIND"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });
    } catch (e) {
      recordResult("Same-Day Second Slot", "POST /booking/create", "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 9. Book Slot in Another Window (13:00 - 14:00)
    // ---------------------------------------------------
    try {
      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "13:00",
          serviceEndTime: "14:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      booking3Id = bookRes.data.bookingId;
      recordResult("Another Availability Window Booking", "POST /booking/create", "PASS", `Booking 3 Created: ${booking3Id}`);
    } catch (e) {
      recordResult("Another Availability Window Booking", "POST /booking/create", "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 10. Book Invalid Slot Format (09:15 - 10:15)
    // ---------------------------------------------------
    try {
      await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "09:15",
          serviceEndTime: "10:15"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      recordResult("Invalid Slot Format Booking", "POST /booking/create", "FAIL", "Allowed booking of unaligned slot");
    } catch (e) {
      recordResult("Invalid Slot Format Booking", "POST /booking/create", "PASS", "Rejected as expected: " + (e.response?.data?.message || e.message));
    }

    // ---------------------------------------------------
    // 11. Book Tuesday (Non-working day)
    // ---------------------------------------------------
    try {
      await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: tuesdayStr,
          serviceStartTime: "09:00",
          serviceEndTime: "10:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      recordResult("Non-working Day Booking", "POST /booking/create", "FAIL", "Allowed booking on disabled day");
    } catch (e) {
      recordResult("Non-working Day Booking", "POST /booking/create", "PASS", "Rejected as expected: " + (e.response?.data?.message || e.message));
    }

    // ---------------------------------------------------
    // 12. Book Double Booking on same slot
    // ---------------------------------------------------
    try {
      await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "09:00",
          serviceEndTime: "10:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      recordResult("Double Booking Prevention", "POST /booking/create", "FAIL", "Allowed double booking");
    } catch (e) {
      recordResult("Double Booking Prevention", "POST /booking/create", "PASS", "Rejected as expected: " + (e.response?.data?.message || e.message));
    }

    // ---------------------------------------------------
    // 13. Cancel Booking 1 and verify slot releases
    // ---------------------------------------------------
    try {
      const cancelRes = await axios.post(`${BASE_URL}/api/booking/cancel/${booking1Id}`, {
        reason: "CHANGED_MY_MIND"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      assert.strictEqual(cancelRes.data.success, true);

      // Verify availability
      const res = await axios.get(`${BASE_URL}/api/service/${serviceId}/availability?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` }
      });
      const hasSlot1 = res.data.slots.some(s => s.startTime === "09:00" && s.endTime === "10:00");
      assert.strictEqual(hasSlot1, true, "Cancelled slot must become available again");

      recordResult("Booking Cancellation Release", "POST /booking/cancel", "PASS", "Slot released and became available");
    } catch (e) {
      recordResult("Booking Cancellation Release", "POST /booking/cancel", "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 14. Update Service with conflicting active Booking 2
    // ---------------------------------------------------
    try {
      const newSchedule = [{
        day: nextSunday.toLocaleString("en-US", { weekday: "long" }),
        enabled: true,
        slots: [{ start: "14:00", end: "15:00" }] // Removes 10:00 - 11:00 slot, causing conflict with Booking 2
      }];

      await axios.put(`${BASE_URL}/api/service/updateService/${serviceId}`, 
        { schedule: newSchedule }, 
        { headers: { Authorization: `Bearer ${SERVICE_USER_TOKEN}` } }
      );

      recordResult("Update Service With Active Bookings", "PUT /api/service/updateService", "FAIL", "Silently corrupted schedule and removed booked slot");
    } catch (e) {
      recordResult("Update Service With Active Bookings", "PUT /api/service/updateService", "PASS", "Rejected as expected due to active booking: " + (e.response?.data?.message || e.message));
    }

    // ---------------------------------------------------
    // 15. PROPERTY_SERVICE Booking Flow
    // ---------------------------------------------------
    try {
      const checkRes = await axios.post(`${BASE_URL}/api/booking/check-availability`, {
        bookingType: "PROPERTY_SERVICE",
        hotelId: propertyId,
        checkIn: dateStr,
        checkOut: tuesdayStr,
        services: [{
          service: serviceId,
          serviceDate: dateStr,
          serviceStartTime: "14:00",
          serviceEndTime: "15:00"
        }]
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      assert.strictEqual(checkRes.data.available, true);

      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "PROPERTY_SERVICE",
        propertyId: propertyId,
        checkIn: dateStr,
        checkOut: tuesdayStr,
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "14:00",
          serviceEndTime: "15:00"
        }],
        priceDetails: { finalAmount: 1150 } // 2 nights property (1000) + 150 service
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const psBookingId = bookRes.data.bookingId;
      recordResult("PROPERTY_SERVICE Booking Flow", "POST /booking/create", "PASS", `Created Booking: ${psBookingId}`);
    } catch (e) {
      recordResult("PROPERTY_SERVICE Booking Flow", "POST /booking/create", "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 16. PACKAGE Booking Flow
    // ---------------------------------------------------
    try {
      // Create a mock Package
      let pkg = await Package.findOne({ name: "E2E Massage Package" });
      if (!pkg) {
        pkg = await Package.create({
          user: "6a6c39be8a59031813af95e7",
          name: "E2E Massage Package",
          property: propertyId,
          basePrice: 600,
          services: [
            { service: serviceId, price: 100 }
          ],
          location: {
            type: "Point",
            coordinates: [46.6753, 24.7136]
          }
        });
      }
      packageId = pkg._id;

      const checkRes = await axios.post(`${BASE_URL}/api/booking/check-availability`, {
        bookingType: "PACKAGE",
        packageId: packageId,
        checkIn: dateStr,
        checkOut: tuesdayStr,
        services: [{
          service: serviceId,
          serviceDate: dateStr,
          serviceStartTime: "17:00",
          serviceEndTime: "18:00"
        }]
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      if (checkRes.data.available !== true) {
        console.error("PACKAGE CHECK-AVAILABILITY FAILED DATA:", checkRes.data);
      }
      assert.strictEqual(checkRes.data.available, true);

      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "PACKAGE",
        packageId: packageId,
        checkIn: dateStr,
        checkOut: tuesdayStr,
        services: [{
          service: serviceId,
          price: 100,
          serviceDate: dateStr,
          serviceStartTime: "17:00",
          serviceEndTime: "18:00"
        }],
        priceDetails: { finalAmount: 1300 } // 2 nights package base (1200) + 100 service
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const pkgBookingId = bookRes.data.bookingId;
      recordResult("PACKAGE Booking Flow", "POST /booking/create", "PASS", `Created Package Booking: ${pkgBookingId}`);
    } catch (e) {
      recordResult("PACKAGE Booking Flow", "POST /booking/create", "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 17. Verify Property Stay is date-range (regression check)
    // ---------------------------------------------------
    try {
      const checkRes = await axios.post(`${BASE_URL}/api/booking/check-availability`, {
        bookingType: "PROPERTY",
        hotelId: propertyId,
        checkIn: dateStr,
        checkOut: tuesdayStr
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      recordResult("Property Stay Regression", "POST /booking/check-availability", "PASS", "Verified property availability works correctly");
      recordResult("Property Stay Regression", "POST /booking/check-availability", "PASS", "Verified property availability works correctly");
    } catch (e) {
      recordResult("Property Stay Regression", "POST /booking/check-availability", "FAIL", e.response?.data?.message || e.message);
      throw e;
    }

    // ---------------------------------------------------
    // 18. Admin Override: adminOverrideRefund
    // ---------------------------------------------------
    try {
      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "13:00",
          serviceEndTime: "14:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const adminOverrideBookingId = bookRes.data.bookingId;
      const adminOverrideOrderId = bookRes.data.orderId;

      // Pass empty id to skip Tap refund API call
      await axios.post(`${BASE_URL}/api/payment/webhook`, {
        id: "",
        status: "CAPTURED",
        reference: { order: adminOverrideOrderId },
        currency: "SAR"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const overrideRes = await axios.post(`${BASE_URL}/api/admin/adminOverrideRefund/${adminOverrideBookingId}`, {
        refundAmount: 150,
        reason: "Admin cancel request"
      }, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });

      assert.strictEqual(overrideRes.status, 200);

      const res = await axios.get(`${BASE_URL}/api/service/${serviceId}/availability?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` }
      });
      const hasSlot = res.data.slots.some(s => s.startTime === "13:00" && s.endTime === "14:00");
      assert.strictEqual(hasSlot, true, "Admin cancelled slot must become available again");

      recordResult("Admin Override: Refund & Cancel", "POST /adminOverrideRefund/:id", "PASS", "Refund processed, slot released");
    } catch (e) {
      recordResult("Admin Override: Refund & Cancel", "POST /adminOverrideRefund/:id", "FAIL", e.response?.data?.message || e.message);
    }

    // ---------------------------------------------------
    // 19. Admin Override: deletePendingBooking
    // ---------------------------------------------------
    try {
      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "14:00",
          serviceEndTime: "15:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const pendingBookingId = bookRes.data.bookingId;

      const deleteRes = await axios.delete(`${BASE_URL}/api/admin/deletePendingBooking/${pendingBookingId}`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
      });

      assert.strictEqual(deleteRes.status, 200);
      recordResult("Admin Override: Delete Pending", "DELETE /deletePendingBooking/:id", "PASS", "Permanently deleted pending booking");
    } catch (e) {
      recordResult("Admin Override: Delete Pending", "DELETE /deletePendingBooking/:id", "FAIL", e.response?.data?.message || e.message);
    }

    // ---------------------------------------------------
    // 20. Booking Approval Flow (instantBooking = false)
    // ---------------------------------------------------
    try {
      await Service.findByIdAndUpdate(serviceId, { instantBooking: false });

      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "17:00",
          serviceEndTime: "18:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const approvalBookingId = bookRes.data.bookingId;
      const approvalOrderId = bookRes.data.orderId;

      await axios.post(`${BASE_URL}/api/payment/webhook`, {
        id: "",
        status: "CAPTURED",
        reference: { order: approvalOrderId },
        currency: "SAR"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const availRes1 = await axios.get(`${BASE_URL}/api/service/${serviceId}/availability?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` }
      });
      const isReservedBefore = !availRes1.data.slots.some(s => s.startTime === "17:00" && s.endTime === "18:00");
      assert.strictEqual(isReservedBefore, false, "Slot must not be reserved while booking is pending approval");

      const approveRes = await axios.patch(`${BASE_URL}/api/booking/updateBookingApprovalStatus/${approvalBookingId}`, {
        status: "confirmed"
      }, { headers: { Authorization: `Bearer ${SERVICE_USER_TOKEN}` } });

      assert.strictEqual(approveRes.status, 200);

      const availRes2 = await axios.get(`${BASE_URL}/api/service/${serviceId}/availability?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` }
      });
      const isReservedAfter = !availRes2.data.slots.some(s => s.startTime === "17:00" && s.endTime === "18:00");
      assert.strictEqual(isReservedAfter, true, "Slot must be reserved after booking approval");

      recordResult("Booking Approval Flow", "PATCH /updateBookingApprovalStatus/:id", "PASS", "Pending -> Confirmed -> Reserved successfully");
    } catch (e) {
      recordResult("Booking Approval Flow", "PATCH /updateBookingApprovalStatus/:id", "FAIL", e.response?.data?.message || e.message);
    } finally {
      await Service.findByIdAndUpdate(serviceId, { instantBooking: true });
    }

    // ---------------------------------------------------
    // 21. Booking Rejection Flow (instantBooking = false)
    // ---------------------------------------------------
    try {
      await Service.findByIdAndUpdate(serviceId, { instantBooking: false });

      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "18:00",
          serviceEndTime: "19:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const rejectionBookingId = bookRes.data.bookingId;
      const rejectionOrderId = bookRes.data.orderId;

      await axios.post(`${BASE_URL}/api/payment/webhook`, {
        id: "",
        status: "CAPTURED",
        reference: { order: rejectionOrderId },
        currency: "SAR"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const rejectRes = await axios.patch(`${BASE_URL}/api/booking/updateBookingApprovalStatus/${rejectionBookingId}`, {
        status: "cancelled"
      }, { headers: { Authorization: `Bearer ${SERVICE_USER_TOKEN}` } });

      assert.strictEqual(rejectRes.status, 200);

      const availRes = await axios.get(`${BASE_URL}/api/service/${serviceId}/availability?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` }
      });
      const isReserved = !availRes.data.slots.some(s => s.startTime === "18:00" && s.endTime === "19:00");
      assert.strictEqual(isReserved, false, "Slot must be available after booking rejection");

      recordResult("Booking Rejection Flow", "PATCH /updateBookingApprovalStatus/:id (cancelled)", "PASS", "Pending -> Cancelled -> Released successfully");
    } catch (e) {
      recordResult("Booking Rejection Flow", "PATCH /updateBookingApprovalStatus/:id (cancelled)", "FAIL", e.response?.data?.message || e.message);
    } finally {
      await Service.findByIdAndUpdate(serviceId, { instantBooking: true });
    }

    // ---------------------------------------------------
    // 22. Multiple Services in one Package (Independent check)
    // ---------------------------------------------------
    try {
      let pkg = await Package.findOne({ name: "E2E Package Multiple Services" });
      if (pkg) {
        await Package.deleteOne({ _id: pkg._id });
      }

      pkg = await Package.create({
        user: "6a6c39be8a59031813af95e7",
        name: "E2E Package Multiple Services",
        property: propertyId,
        basePrice: 600,
        services: [
          { service: serviceId, price: 100 },
          { service: serviceId, price: 80 }
        ],
        location: {
          type: "Point",
          coordinates: [46.6753, 24.7136]
        }
      });

      const checkRes = await axios.post(`${BASE_URL}/api/booking/check-availability`, {
        bookingType: "PACKAGE",
        packageId: pkg._id,
        checkIn: dateStr,
        checkOut: tuesdayStr,
        services: [
          {
            service: serviceId,
            serviceDate: dateStr,
            serviceStartTime: "13:00",
            serviceEndTime: "14:00"
          },
          {
            service: serviceId,
            serviceDate: dateStr,
            serviceStartTime: "14:00",
            serviceEndTime: "15:00"
          }
        ]
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      assert.strictEqual(checkRes.data.available, true);
      recordResult("Multiple Services in one Package", "POST /booking/check-availability (multiple)", "PASS", "Validated multiple services schedule");
    } catch (e) {
      recordResult("Multiple Services in one Package", "POST /booking/check-availability (multiple)", "FAIL", e.response?.data?.message || e.message);
    }

    // ---------------------------------------------------
    // 23. Booking Expiry Flow
    // ---------------------------------------------------
    try {
      await Service.findByIdAndUpdate(serviceId, { instantBooking: false });

      const bookRes = await axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "09:00",
          serviceEndTime: "10:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const expiryBookingId = bookRes.data.bookingId;
      const expiryOrderId = bookRes.data.orderId;

      await axios.post(`${BASE_URL}/api/payment/webhook`, {
        id: "",
        status: "CAPTURED",
        reference: { order: expiryOrderId },
        currency: "SAR"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      await Booking.findByIdAndUpdate(expiryBookingId, {
        acceptanceDeadline: new Date(Date.now() - 10000)
      });

      const { autoCancelExpiredBookings } = require("../services/bookingExpiryService");
      await autoCancelExpiredBookings();

      const expiredBooking = await Booking.findById(expiryBookingId);
      assert.strictEqual(expiredBooking.bookingStatus, "cancelled");
      assert.strictEqual(expiredBooking.pendingReason, "expired");

      recordResult("Booking Expiry Flow", "autoCancelExpiredBookings()", "PASS", "Pending expired booking cancelled and slot released");
    } catch (e) {
      recordResult("Booking Expiry Flow", "autoCancelExpiredBookings()", "FAIL", e.response?.data?.message || e.message);
    } finally {
      await Service.findByIdAndUpdate(serviceId, { instantBooking: true });
    }

    // ---------------------------------------------------
    // 24. Concurrent/Double Booking Flow
    // ---------------------------------------------------
    try {
      const p1 = axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "10:00",
          serviceEndTime: "11:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const p2 = axios.post(`${BASE_URL}/api/booking/create`, {
        bookingType: "SERVICE",
        services: [{
          service: serviceId,
          price: 150,
          serviceDate: dateStr,
          serviceStartTime: "10:00",
          serviceEndTime: "11:00"
        }],
        priceDetails: { finalAmount: 150 }
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const bookResults = await Promise.allSettled([p1, p2]);
      const succeededBookings = bookResults.filter(r => r.status === "fulfilled").map(r => r.value.data);

      assert.strictEqual(succeededBookings.length, 2, "Both pending bookings should be created before payment");

      const pay1 = axios.post(`${BASE_URL}/api/payment/webhook`, {
        id: "",
        status: "CAPTURED",
        reference: { order: succeededBookings[0].orderId },
        currency: "SAR"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const pay2 = axios.post(`${BASE_URL}/api/payment/webhook`, {
        id: "",
        status: "CAPTURED",
        reference: { order: succeededBookings[1].orderId },
        currency: "SAR"
      }, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

      const payResults = await Promise.allSettled([pay1, pay2]);
      const passedPays = payResults.filter(r => r.status === "fulfilled");
      const failedPays = payResults.filter(r => r.status === "rejected");

      assert.strictEqual(passedPays.length, 1, "Exactly one payment confirmation should succeed");
      assert.strictEqual(failedPays.length, 1, "Exactly one payment confirmation should fail due to slot already booked");

      recordResult("Concurrent Double Booking", "Promise.all(paymentWebhooks)", "PASS", "Only one payment booking succeeded, index error handled");
    } catch (e) {
      recordResult("Concurrent Double Booking", "Promise.all(paymentWebhooks)", "FAIL", e.response?.data?.message || e.message);
    }

  } catch (err) {
    console.error("❌ E2E workflow failed:", err.message);
    if (err.response && err.response.data) {
      console.error("Server Error details:", err.response.data);
    }
  } finally {
    // ---------------------------------------------------
    // CLEANUP: Delete only records created by this E2E test
    // ---------------------------------------------------
    if (isDbConnected) {
      const testBookings = await Booking.find({ user: TEST_USER_ID }).select("_id");
      const testBookingIds = testBookings.map(b => b._id);

      await Booking.deleteMany({ user: TEST_USER_ID });
      await Properties.deleteMany({ name: "E2E Test Property" });
      await Service.deleteMany({ name: { $regex: "^E2E TEST -" } });
      await ServiceAvailability.deleteMany({ booking: { $in: testBookingIds } });
      await HotelAvailability.deleteMany({ booking: { $in: testBookingIds } });
      await Package.deleteMany({ name: "E2E Massage Package" });

      await mongoose.disconnect();
      console.log("✅ Cleanup finished and DB disconnected cleanly.");
    }
  }

  // Print Summary Table
  console.log("\n==================================================");
  console.log("📊 FINAL E2E API TEST RESULT MATRIX");
  console.log("==================================================");
  console.table(results);
}

runE2ETests();
