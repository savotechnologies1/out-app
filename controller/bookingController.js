const Booking = require("../models/Booking");
const { v4: uuidv4 } = require("uuid");
const HotelAvailability = require("../models/Availability");
const Properties = require("../models/Properties");
const Coupon = require("../models/Coupon");
const PlatformFee = require("../models/PlatformFee");
const Tax = require("../models/Tax");
const Commission = require("../models/Commission");
const Package = require("../models/Package");
const ServiceAvailability = require("../models/ServiceAvailability");
const Service = require("../models/Service");
const catchAsyncError = require("../functions/catchAsyncError");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const axios = require("axios");
const { sendNotification } = require("../utils/notificationService");
const PaymentTransaction = require("../models/PaymentTransaction");
const Notification = require("../models/Notification");
const Review = require("../models/Review");
const { calculateAcceptanceDeadline } = require("../services/bookingExpiryService");
const { validateServiceSlot, getAvailableSlots, reserveServiceSlots, timeToMinutes } = require("../utils/serviceAvailabilityUtils");


function getDatesBetween(startDate, endDate) {

  const dates = [];

  let currentDate = new Date(startDate);

  while (currentDate < new Date(endDate)) {

    dates.push(new Date(currentDate));

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

const getZeroTimeDate = (d) => {
  const nd = new Date(d);
  nd.setUTCHours(0, 0, 0, 0);
  return nd;
};

const checkBookingsConflict = (bookingA, bookingB) => {
  if (
    bookingA.property &&
    bookingB.property &&
    bookingA.property.toString() === bookingB.property.toString() &&
    bookingA.checkIn &&
    bookingA.checkOut &&
    bookingB.checkIn &&
    bookingB.checkOut
  ) {
    const datesA = getDatesBetween(bookingA.checkIn, bookingA.checkOut).map(d => getZeroTimeDate(d).getTime());
    const datesB = getDatesBetween(bookingB.checkIn, bookingB.checkOut).map(d => getZeroTimeDate(d).getTime());
    const propertyOverlap = datesA.some(time => datesB.includes(time));
    if (propertyOverlap) {
      return true;
    }
  }

  if (bookingA.services?.length > 0 && bookingB.services?.length > 0) {
    for (const sA of bookingA.services) {
      for (const sB of bookingB.services) {
        const sA_id = sA.service?._id || sA.service;
        const sB_id = sB.service?._id || sB.service;

        if (sA_id && sB_id && sA_id.toString() === sB_id.toString()) {
          const dateA = getZeroTimeDate(sA.serviceDate).getTime();
          const dateB = getZeroTimeDate(sB.serviceDate).getTime();

          if (dateA === dateB) {
            const startA = timeToMinutes(sA.serviceStartTime);
            const endA = timeToMinutes(sA.serviceEndTime);
            const startB = timeToMinutes(sB.serviceStartTime);
            const endB = timeToMinutes(sB.serviceEndTime);

            if (startA < endB && endA > startB) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
};

const autoCancelConflictingBookings = async (confirmedBooking) => {
  try {
    const pendingBookings = await Booking.find({
      _id: { $ne: confirmedBooking._id },
      paymentStatus: "paid",
      bookingStatus: "pending",
      pendingReason: "approval_pending"
    });

    const conflictingBookings = [];
    for (const pending of pendingBookings) {
      if (checkBookingsConflict(confirmedBooking, pending)) {
        conflictingBookings.push(pending);
      }
    }

    for (const confBooking of conflictingBookings) {
      confBooking.bookingStatus = "cancelled";
      confBooking.rejectReason = "Booking auto-rejected due to too many bookings at a time, sorry for the inconvience";
      confBooking.pendingReason = null;
      await confBooking.save();

      if (confBooking.tapChargeId && confBooking.totalAmount > 0) {
        try {
          const response = await axios.post(
            "https://api.tap.company/v2/refunds",
            {
              charge_id: confBooking.tapChargeId,
              amount: Number(confBooking.totalAmount),
              currency: "SAR",
              reason: "Booking auto-rejected due to schedule conflict",
              reference: {
                merchant: confBooking.orderId,
              },
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );

          confBooking.refundTransactionId = response.data?.id;
          confBooking.refundAmount = confBooking.totalAmount;
          confBooking.refundStatus = "processed";
          confBooking.isCancelled = true;
          confBooking.cancellationDate = new Date();
          await confBooking.save();
        } catch (err) {
          console.error(
            `Conflict auto-refund failed for booking ${confBooking._id}:`,
            err.response?.data || err.message
          );
          confBooking.refundStatus = "failed";
          await confBooking.save();
        }
      }

      try {
        await sendNotification({
          receiverId: confBooking.user,
          receiverModel: "User",
          title: "Booking Rejected ❌",
          body: "Your booking has been rejected because the requested slot is no longer available, and a full refund has been initiated.",
          type: "BOOKING",
          referenceId: confBooking._id,
          referenceType: "Booking",
        });
      } catch (notifErr) {
        console.error(`Failed to send notification for auto-cancelled booking ${confBooking._id}:`, notifErr);
      }
    }
  } catch (conflictErr) {
    console.error("Error auto-cancelling conflicting bookings:", conflictErr);
  }
};

exports.autoCancelConflictingBookings = autoCancelConflictingBookings;

exports.checkAvailability = async (req, res) => {
  try {
    const {
      bookingType,
      hotelId,
      services = [],
      packageId,
      checkIn,
      checkOut,
      couponCode
    } = req.body;
    const userId = req.user?._id;

    const normalizedServices = (services || []).map(item => {
      let sDate = item.serviceDate;
      if (!sDate && checkIn) {
        sDate = checkIn;
      }

      let startTime = item.serviceStartTime;
      let endTime = item.serviceEndTime;

      const slot = item.timeSlot || req.body.timeSlot;
      if (slot && slot.includes(" - ")) {
        const parts = slot.split(" - ");
        if (!startTime) startTime = parts[0]?.trim();
        if (!endTime) endTime = parts[1]?.trim();
      }

      return {
        ...item,
        price: Number(item.price || 0),
        serviceDate: sDate,
        serviceStartTime: startTime,
        serviceEndTime: endTime
      };
    });

    let dates = [];
    let nights = 0;

    if (["PROPERTY", "PROPERTY_SERVICE", "PACKAGE"].includes(bookingType)) {
      dates = getDatesBetween(checkIn, checkOut);

      if (!dates || dates.length === 0) {
        return res.send({
          available: false,
          message: "Invalid check-in or check-out dates"
        });
      }
      nights = dates.length;
    }

    let availableServices = [];
    let basePrice = 0;
    let servicesTotal = 0;
    let finalAmount = 0;

    /* =================================================
       PROPERTY BOOKING
    ================================================= */

    if (bookingType === "PROPERTY") {

      const hotel = await Properties.findOne({
        _id: hotelId,
        isDeleted: false,
        isActive: { $ne: false }
      }).select("price name");

      if (!hotel) {
        return res.send({
          available: false,
          message: "Property not found"
        });
      }

      const bookedDates = await HotelAvailability.find({
        hotel: hotelId,
        date: { $in: dates },
        isBooked: true
      });

      if (bookedDates.length > 0) {
        return res.send({
          available: false,
          message: "Property is not available on selected date(s)"
        });
      }

      basePrice = hotel.price;

      finalAmount = hotel.price * nights;
    }

    /* =================================================
       SERVICE BOOKING
    ================================================= */

    if (bookingType === "SERVICE") {
      let serviceList = normalizedServices;

      if (serviceList.length === 0) {
        return res.send({
          available: false,
          message: "Please select at least one service"
        });
      }

      const hasServicesWithSlots = serviceList.every(item => item && item.service && item.serviceDate && item.serviceStartTime && item.serviceEndTime);

      if (!hasServicesWithSlots) {
        const serviceIds = serviceList.map(item => item.service).filter(Boolean);
        const servicesData = await Service.find({
          _id: { $in: serviceIds },
          isDeleted: false,
          isActive: true
        });

        if (servicesData.length === 0) {
          return res.send({
            available: false,
            message: "Service not found or inactive"
          });
        }

        for (const service of servicesData) {
          availableServices.push({
            ...service.toObject(),
            originalPrice: service.price,
            price: service.price,
          });
        }

        servicesTotal = availableServices.reduce(
          (sum, s) => sum + s.price,
          0
        );

        finalAmount = servicesTotal;
      } else {
        for (const item of serviceList) {
          const service = await Service.findOne({
            _id: item.service,
            isDeleted: false,
            isActive: true
          });

          if (!service) {
            return res.send({
              available: false,
              message: "Service not found or inactive"
            });
          }

          const slotCheck = await validateServiceSlot(
            service,
            item.serviceDate,
            item.serviceStartTime,
            item.serviceEndTime
          );

          if (!slotCheck.valid) {
            return res.send({
              available: false,
              message: `${service.name}: ${slotCheck.message}`
            });
          }

          availableServices.push({
            ...service.toObject(),
            originalPrice: service.price,
            price: service.price, // price per slot
            serviceDate: item.serviceDate,
            serviceStartTime: item.serviceStartTime,
            serviceEndTime: item.serviceEndTime
          });
        }

        servicesTotal = availableServices.reduce(
          (sum, s) => sum + s.price,
          0
        );

        finalAmount = servicesTotal;
      }
    }

    /* =================================================
       PROPERTY + ADDON SERVICES BOOKING
    ================================================= */

    if (bookingType === "PROPERTY_SERVICE") {

      /* -------- PROPERTY CHECK -------- */

      const hotel = await Properties.findOne({
        _id: hotelId,
        isDeleted: false,
        isActive: { $ne: false }
      }).select("price name");

      if (!hotel) {
        return res.send({
          available: false,
          message: "Property not found"
        });
      }

      const bookedDates = await HotelAvailability.find({
        hotel: hotelId,
        date: { $in: dates },
        isBooked: true
      });

      if (bookedDates.length > 0) {
        return res.send({
          available: false,
          message: "Property is not available on selected date(s)"
        });
      }

      basePrice = hotel.price;

      /* -------- SERVICE CHECK -------- */

      if (normalizedServices && normalizedServices.length > 0) {
        const checkInDate = getZeroTimeDate(checkIn);
        const checkOutDate = getZeroTimeDate(checkOut);

        for (const item of normalizedServices) {
          if (!item.service || !item.serviceDate || !item.serviceStartTime || !item.serviceEndTime) {
            return res.send({
              available: false,
              message: "All services must have a scheduled date, start time, and end time"
            });
          }

          const service = await Service.findOne({
            _id: item.service,
            isDeleted: false,
            isActive: true
          });

          if (!service) {
            return res.send({
              available: false,
              message: "Service not found or inactive"
            });
          }

          // Enforce date constraint
          const sDate = getZeroTimeDate(item.serviceDate);
          if (sDate < checkInDate || sDate > checkOutDate) {
            return res.send({
              available: false,
              message: `${service.name} date must fall within the property stay dates (${checkIn} to ${checkOut})`
            });
          }

          const slotCheck = await validateServiceSlot(
            service,
            item.serviceDate,
            item.serviceStartTime,
            item.serviceEndTime
          );

          if (!slotCheck.valid) {
            return res.send({
              available: false,
              message: `${service.name}: ${slotCheck.message}`
            });
          }

          availableServices.push({
            ...service.toObject(),
            originalPrice: service.price,
            price: service.price, // price per slot
            serviceDate: item.serviceDate,
            serviceStartTime: item.serviceStartTime,
            serviceEndTime: item.serviceEndTime
          });
        }

        servicesTotal = availableServices.reduce(
          (sum, s) => sum + s.price,
          0
        );

      }

      finalAmount =
        (basePrice * nights) + servicesTotal;
    }

    /* =================================================
       PACKAGE BOOKING
    ================================================= */

    if (bookingType === "PACKAGE") {

      const pkg = await Package.findById(packageId)
        .populate("property")
        .populate("services.service", "name priceType duration price");

      if (!pkg) {
        return res.status(404).send({
          available: false,
          message: "Package not found"
        });
      }

      basePrice = pkg.basePrice || 0;

      const bookedProperty = await HotelAvailability.find({
        hotel: pkg.property._id,
        date: { $in: dates },
        isBooked: true
      });

      if (bookedProperty.length > 0) {
        return res.send({
          available: false,
          message: "Package property is not available on selected date(s)"
        });
      }

      /* -------- SERVICE CHECK -------- */

      if (pkg.services && pkg.services.length > 0) {
        const checkInDate = getZeroTimeDate(checkIn);
        const checkOutDate = getZeroTimeDate(checkOut);

        for (const pkgService of pkg.services) {
          const serviceObj = pkgService.service;
          if (!serviceObj) continue;

          const scheduled = normalizedServices.find(
            s => s.service.toString() === serviceObj._id.toString()
          );

          if (!scheduled || !scheduled.serviceDate || !scheduled.serviceStartTime || !scheduled.serviceEndTime) {
            return res.send({
              available: false,
              message: `Please schedule a date and time slot for service: ${serviceObj.name}`
            });
          }

          // Enforce date constraint
          const sDate = getZeroTimeDate(scheduled.serviceDate);
          if (sDate < checkInDate || sDate > checkOutDate) {
            return res.send({
              available: false,
              message: `${serviceObj.name} date must fall within the property stay dates (${checkIn} to ${checkOut})`
            });
          }

          const slotCheck = await validateServiceSlot(
            serviceObj,
            scheduled.serviceDate,
            scheduled.serviceStartTime,
            scheduled.serviceEndTime
          );

          if (!slotCheck.valid) {
            return res.send({
              available: false,
              message: `${serviceObj.name}: ${slotCheck.message}`
            });
          }

          availableServices.push({
            serviceId: serviceObj._id,
            name: serviceObj.name,
            originalPrice: pkgService.price,
            price: pkgService.price, // price per slot
            priceType: serviceObj.priceType,
            serviceDate: scheduled.serviceDate,
            serviceStartTime: scheduled.serviceStartTime,
            serviceEndTime: scheduled.serviceEndTime
          });
        }

        servicesTotal = availableServices.reduce(
          (sum, s) => sum + s.price,
          0
        );
      }

      finalAmount =
        (basePrice * nights) + servicesTotal;
    }

    /* =================================================
       COUPON
    ================================================= */

    let discountAmount = 0;

    let couponId = null;

    if (couponCode) {

      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        isActive: true,
        isDelete: false
      });

      if (!coupon) {
        return res.status(400).send({
          message: "Invalid coupon code"
        });
      }

      couponId = coupon._id;

      const alreadyUsed = coupon.usedBy.find(
        u => u.user.toString() === userId.toString()
      );

      if (alreadyUsed) {
        return res.status(400).send({
          message: "Coupon already used"
        });
      }

      if (coupon.discountType === "PERCENTAGE") {

        discountAmount =
          (finalAmount * coupon.discountValue) / 100;

        if (
          coupon.maxDiscount &&
          discountAmount > coupon.maxDiscount
        ) {
          discountAmount = coupon.maxDiscount;
        }

      } else {

        discountAmount = coupon.discountValue;
      }

      finalAmount =
        finalAmount - discountAmount;
    }

    /* =================================================
     PLATFORM FEE + TAX
  ================================================= */

    const platformFeeRule =
      await PlatformFee.findOne({
        isActive: true,
        isDeleted: false
      });

    let platformFee = 0;

    if (platformFeeRule) {

      platformFee =
        platformFeeRule.feeType === "PERCENTAGE"
          ? (finalAmount * platformFeeRule.value) / 100
          : platformFeeRule.value;
    }

    const taxRule = await Tax.findOne({
      isActive: true,
      isDeleted: false
    });

    const tax = taxRule
      ? ((finalAmount) * taxRule.percentage) / 100
      : 0;

    const grandTotal =
      finalAmount + platformFee + tax;

    /* =================================================
       RESPONSE
    ================================================= */

    return res.send({

      available: true,

      bookingType,

      availableServices,

      priceDetails: {

        basePrice,

        servicesTotal,

        nights,

        discountAmount,

        finalAmount,

        platformFee,

        tax,

        grandTotal
      },

      couponId

    });

  } catch (error) {

    return res.status(500).send({
      message: error.message
    });

  }
};


exports.createBooking = async (req, res) => {
  try {

    /* =================================================
       IDENTITY VERIFICATION CHECK
    ================================================= */

    const bookingUser = await require("../models/User")
      .findById(req.user._id)
      .select("identityVerificationStatus")
      .lean();

    if (
      !bookingUser ||
      bookingUser.identityVerificationStatus !== "VERIFIED"
    ) {
      return res.status(403).send({
        message: "Identity verification required before booking.",
      });
    }

    const {
      bookingType,
      propertyId,
      packageId,
      services = [],
      checkIn,
      checkOut,
      adults = 1,
      children = 0,
      priceDetails,
      couponId = null
    } = req.body;

    const normalizedServices = (services || []).map(item => {
      let sDate = item.serviceDate;
      if (!sDate && checkIn) {
        sDate = checkIn;
      }

      let startTime = item.serviceStartTime;
      let endTime = item.serviceEndTime;

      const slot = item.timeSlot || req.body.timeSlot;
      if (slot && slot.includes(" - ")) {
        const parts = slot.split(" - ");
        if (!startTime) startTime = parts[0]?.trim();
        if (!endTime) endTime = parts[1]?.trim();
      }

      return {
        ...item,
        price: Number(item.price || 0),
        serviceDate: sDate,
        serviceStartTime: startTime,
        serviceEndTime: endTime
      };
    });

    const totalGuests = Number(children) + Number(adults);

    let dates = [];
    let requestedDays = [];

    if (["PROPERTY", "PROPERTY_SERVICE", "PACKAGE"].includes(bookingType)) {
      dates = getDatesBetween(checkIn, checkOut);

      if (!dates || dates.length === 0) {
        return res.status(400).send({
          message: "Invalid check-in or check-out dates"
        });
      }

      requestedDays = dates.map(d =>
        d.toLocaleString("en-US", { weekday: "long" })
      );
    }

    let property = null;

    let selectedPolicy = null;

    let policySnapshot = null;

    let providerBreakdown = [];

    /* =================================================
       ❌ BLOCK INVALID SERVICE COMBINATION
    ================================================= */

    if (bookingType === "SERVICE" && propertyId) {
      return res.status(400).send({
        message: "SERVICE booking should not have property"
      });
    }

    /* =================================================
       PACKAGE VALIDATION (PROPERTY + SERVICES)
    ================================================= */

    if (bookingType === "PACKAGE" && packageId) {
      const pkg = await Package.findById(packageId)
        .populate("property")
        .populate("services.service");

      if (!pkg) {
        return res.status(404).send({
          message: "Package not found"
        });
      }

      if (pkg.property) {
        const bookedPkgProperty = await HotelAvailability.find({
          hotel: pkg.property._id,
          date: { $in: dates },
          isBooked: true
        });

        if (bookedPkgProperty.length > 0) {
          return res.status(400).send({
            message: "Package property is not available on selected date(s)"
          });
        }
      }

      if (pkg.services && pkg.services.length > 0) {
        const checkInDate = getZeroTimeDate(checkIn);
        const checkOutDate = getZeroTimeDate(checkOut);

        for (const pkgService of pkg.services) {
          const serviceObj = pkgService.service;
          if (!serviceObj) continue;

          const scheduled = normalizedServices.find(
            s => s.service.toString() === serviceObj._id.toString()
          );

          if (!scheduled || !scheduled.serviceDate || !scheduled.serviceStartTime || !scheduled.serviceEndTime) {
            return res.status(400).send({
              message: `Please schedule a date and time slot for service: ${serviceObj.name}`
            });
          }

          // Enforce date constraint
          const sDate = getZeroTimeDate(scheduled.serviceDate);
          if (sDate < checkInDate || sDate > checkOutDate) {
            return res.status(400).send({
              message: `${serviceObj.name} date must fall within the property stay dates (${checkIn} to ${checkOut})`
            });
          }

          const slotCheck = await validateServiceSlot(
            serviceObj,
            scheduled.serviceDate,
            scheduled.serviceStartTime,
            scheduled.serviceEndTime
          );

          if (!slotCheck.valid) {
            return res.status(400).send({
              message: `${serviceObj.name}: ${slotCheck.message}`
            });
          }
        }
      }
    }

    /* =================================================
       PROPERTY VALIDATION + POLICY
    ================================================= */

    if (
      ["PROPERTY", "PROPERTY_SERVICE"]
        .includes(bookingType)
    ) {

      property = await Properties.findOne({
        _id: propertyId,
        isDeleted: false,
        isActive: { $ne: false }
      })
        .populate("cancellationPolicy")
        .select(
          "maxGuests category user cancellationPolicy"
        );

      if (!property) {
        return res.status(404).send({
          message: "Property not found"
        });
      }

      // ✅ only property bookings validate guests
      if (totalGuests > property.maxGuests) {
        return res.status(400).send({
          message: `Maximum ${property.maxGuests} guests allowed`
        });
      }

      const bookedDates = await HotelAvailability.find({
        hotel: propertyId,
        date: { $in: dates },
        isBooked: true
      });

      if (bookedDates.length > 0) {
        return res.status(400).send({
          message: "Selected property dates are not available"
        });
      }
    }

    /* =================================================
       SERVICE VALIDATION + POLICY
    ================================================= */

    let servicesData = [];

    if (normalizedServices.length > 0) {

      const serviceIds = normalizedServices.map(
        s => s.service
      );

      servicesData = await Service.find({
        _id: { $in: serviceIds },
        isDeleted: false,
        isActive: true
      })
        .populate("cancellationPolicy")
        .select(
          "user category name policies cancellationPolicy priceType maxPersons duration price schedule"
        );

      if (servicesData.length !== normalizedServices.length) {
        return res.status(400).send({
          message: "Some services not found or inactive"
        });
      }

      const checkInDate = checkIn ? getZeroTimeDate(checkIn) : null;
      const checkOutDate = checkOut ? getZeroTimeDate(checkOut) : null;

      for (const item of normalizedServices) {
        if (!item.service || !item.serviceDate || !item.serviceStartTime || !item.serviceEndTime) {
          return res.status(400).send({
            message: "All services must have a scheduled date, start time, and end time"
          });
        }

        const service = servicesData.find(s => s._id.toString() === item.service.toString());
        if (!service) {
          return res.status(400).send({
            message: "Service not found in retrieved services"
          });
        }

        // Enforce date constraint for PROPERTY_SERVICE
        if (bookingType === "PROPERTY_SERVICE" && checkInDate && checkOutDate) {
          const sDate = getZeroTimeDate(item.serviceDate);
          if (sDate < checkInDate || sDate > checkOutDate) {
            return res.status(400).send({
              message: `${service.name} date must fall within the property stay dates (${checkIn} to ${checkOut})`
            });
          }
        }

        const slotCheck = await validateServiceSlot(
          service,
          item.serviceDate,
          item.serviceStartTime,
          item.serviceEndTime
        );

        if (!slotCheck.valid) {
          return res.status(400).send({
            message: `${service.name}: ${slotCheck.message}`
          });
        }

        // Validate service maxPersons
        if (service.priceType === "flat" && totalGuests > (service.maxPersons || 1)) {
          return res.status(400).send({
            message: `${service.name} allows maximum ${service.maxPersons} persons`
          });
        }
      }
    }

    /* =================================================
       🔥 SELECT POLICY
    ================================================= */

    let policies = [];

    if (property?.cancellationPolicy) {
      policies.push(property.cancellationPolicy);
    }

    servicesData.forEach(s => {
      if (s.cancellationPolicy) {
        policies.push(s.cancellationPolicy);
      }
    });

    if (policies.length > 0) {

      selectedPolicy = policies[0];

      policySnapshot = {
        name: selectedPolicy.name,
        rules: selectedPolicy.rules,
        cancellationFee:
          selectedPolicy.cancellationFee || 0,

        servicePolicies: servicesData.map(s => ({
          serviceId: s._id,
          serviceName: s.name,
          policies: s.policies || []
        }))
      };
    }

    /* =================================================
       PRICE CALCULATION
    ================================================= */

    let baseAmount = Number(
      priceDetails.finalAmount
    );

    const platformFeeRule =
      await PlatformFee.findOne({
        isActive: true,
        isDeleted: false
      });

    let platformFee = 0;

    if (platformFeeRule) {

      platformFee =
        platformFeeRule.feeType === "PERCENTAGE"
          ? (baseAmount * platformFeeRule.value) / 100
          : platformFeeRule.value;
    }

    const subTotal = baseAmount;

    const taxRule = await Tax.findOne({
      isActive: true,
      isDeleted: false
    });

    const tax = taxRule
      ? (subTotal * taxRule.percentage) / 100
      : 0;

    const totalAmount = subTotal + platformFee + tax;

    /* =================================================
       SERVICE TOTAL
    ================================================= */

    let serviceTotal = 0;

    for (const s of servicesData) {

      const item = normalizedServices.find(
        x => x.service.toString() === s._id.toString()
      );

      if (item) {
        serviceTotal += item.price;
      }
    }

    const propertyAmount =
      baseAmount - serviceTotal;

    /* =================================================
       COMMISSION
    ================================================= */

    let commissionAmount = 0;

    let propertyCommissionAmount = 0;

    const serviceCommissionMap = {};

    /* ---------------- PROPERTY COMMISSION ---------------- */

    if (property && propertyAmount > 0) {

      const propertyCommissionRule =

        await Commission.findOne({
          scope: "CATEGORY",
          type: "PROPERTY",
          categoryId: property.category,
          isActive: true,
          isDeleted: false
        }) ||

        await Commission.findOne({
          scope: "GLOBAL",
          type: "PROPERTY",
          isActive: true,
          isDeleted: false
        });

      if (propertyCommissionRule) {

        propertyCommissionAmount =

          propertyCommissionRule.commissionType === "PERCENTAGE"
            ? (propertyAmount * propertyCommissionRule.value) / 100
            : propertyCommissionRule.value;

        commissionAmount += propertyCommissionAmount;
      }
    }

    /* ---------------- SERVICE COMMISSION ---------------- */

    for (const s of servicesData) {

      const item = normalizedServices.find(
        x => x.service.toString() === s._id.toString()
      );

      if (!item) continue;

      const serviceAmount = item.price;

      let serviceCommissionRule =

        // Specific service commission
        await Commission.findOne({
          scope: "CATEGORY",
          type: "SERVICE",
          serviceId: s._id,
          isActive: true,
          isDeleted: false
        }) ||

        // Service category commission
        await Commission.findOne({
          scope: "CATEGORY",
          type: "SERVICE",
          serviceCategoryId: s.category,
          isActive: true,
          isDeleted: false
        }) ||

        // Global service commission
        await Commission.findOne({
          scope: "GLOBAL",
          type: "SERVICE",
          isActive: true,
          isDeleted: false
        });

      let serviceCommission = 0;

      if (serviceCommissionRule) {

        serviceCommission =

          serviceCommissionRule.commissionType === "PERCENTAGE"
            ? (serviceAmount * serviceCommissionRule.value) / 100
            : serviceCommissionRule.value;

        commissionAmount += serviceCommission;
      }

      serviceCommissionMap[s._id.toString()] =
        serviceCommission;
    }

    /* =================================================
       PROVIDER AMOUNT
    ================================================= */

    const providerAmount =
      baseAmount - commissionAmount;

    /* =================================================
       🔥 PROVIDER BREAKDOWN
    ================================================= */

    if (property && propertyAmount > 0) {

      providerBreakdown.push({
        user: property.user,
        amount:
          propertyAmount -
          propertyCommissionAmount,
        type: "property",
        referenceId: property._id
      });
    }

    servicesData.forEach(s => {

      const item = normalizedServices.find(
        x => x.service.toString() === s._id.toString()
      );

      if (!item) return;

      const serviceCommission =
        serviceCommissionMap[
        s._id.toString()
        ] || 0;

      providerBreakdown.push({
        user: s.user,
        amount:
          item.price - serviceCommission,
        type: "service",
        referenceId: s._id
      });
    });

    /* =================================================
       ORDER ID
    ================================================= */

    const orderId =
      "ORD_" +
      uuidv4().slice(0, 8).toUpperCase();

    let referenceCheckIn = checkIn;
    if (bookingType === "SERVICE" && normalizedServices.length > 0) {
      let earliest = null;
      for (const s of normalizedServices) {
        if (s.serviceDate) {
          const d = new Date(s.serviceDate);
          if (s.serviceStartTime) {
            const [hours, minutes] = s.serviceStartTime.split(":").map(Number);
            d.setUTCHours(hours || 0, minutes || 0, 0, 0);
          }
          if (!earliest || d < earliest) {
            earliest = d;
          }
        }
      }
      if (earliest) {
        referenceCheckIn = earliest;
      }
    }

    const booking = await Booking.create({

      bookingType,

      user: req.user._id,

      property:
        bookingType === "SERVICE"
          ? null
          : propertyId,

      package: packageId || null,

      services: normalizedServices,

      couponId,

      checkIn,

      checkOut,

      adults,

      children,

      priceBreakdown: {

        propertyPrice:
          propertyAmount,

        packagePrice:
          bookingType === "PACKAGE"
            ? priceDetails.basePrice
            : 0,

        servicePrice:
          serviceTotal
      },

      totalAmount,

      commissionAmount,

      providerAmount,

      platformFee,

      tax,

      cancellationPolicy:
        selectedPolicy?._id || null,

      policySnapshot,

      providerBreakdown,

      acceptanceDeadline: calculateAcceptanceDeadline(referenceCheckIn),

      orderId,

      paymentStatus: "pending",

      bookingStatus: "pending",

      pendingReason: "payment_pending"
    });

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      bookingId: booking._id,
      orderId,
      totalAmount,
      totalGuests
    });

  } catch (error) {

    return res.status(500).send({
      message: error.message
    });

  }
};

exports.getBookingStatus = async (req, res) => {
  try {

    const { orderId } = req.params;

    const booking = await Booking.findOne({ orderId });

    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    return res.send({
      paymentStatus: booking.paymentStatus,
      bookingStatus: booking.bookingStatus
    });

  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
};

exports.getUserBookings = async (req, res) => {
  try {

    let { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {
      user: req.user._id
    };

    const total = await Booking.countDocuments(filter);

    const bookings = await Booking.find(filter)
      .populate({
        path: "property",
        select: "name media.mainImage address.city"
      })
      .populate("services.service", "name price policies maxPersons media")
      .populate({
        path: "package",
        select: "name"
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    for (let i = 0; i < bookings.length; i++) {
      if (bookings[i].bookingStatus === "confirmed" && !bookings[i].invoiceUrl) {
        const { generateInvoicePDF } = require("../utils/invoiceGenerator");
        const invoiceUrl = await generateInvoicePDF(bookings[i]._id);
        if (invoiceUrl) {
          if (bookings[i].toObject) {
            bookings[i] = bookings[i].toObject();
          }
          bookings[i].invoiceUrl = invoiceUrl;
        }
      }
    }

    const totalPages = Math.ceil(total / limitNumber);

    return res.send({
      success: true,
      data: bookings,
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages
    });

  } catch (error) {

    return res.status(500).send({
      message: error.message
    });

  }
};

exports.getBookingDetail = async (req, res) => {
  try {

    const { bookingId } = req.params;

    const booking = await Booking.findOne({
      _id: bookingId,
      user: req.user._id
    })
      .populate("user", "firstName lastName email phone profile")
      .populate({
        path: "property",
        populate: [
          {
            path: "user",
            model: "ServiceUser",
            select: "firstName lastName email phone profile identityNumber identityDocuments dateOfBirth verificationService legalFullNameEn legalFullNameEr"
          },
          {
            path: "propertyAmenities",
            model: "Amenities",
            select: "name icon"
          },
          {
            path: "propertyFeatures",
            model: "Feature",
            select: "feature"
          }
        ]
      })
      .populate({
        path: "services.service",
        select: "name price duration policies maxPersons user cancellationPolicy media",
        populate: [
          {
            path: "user",
            model: "ServiceUser",
            select: "firstName lastName email phone profile identityNumber identityDocuments dateOfBirth verificationService legalFullNameEn legalFullNameEr"
          },
          {
            path: "cancellationPolicy",
            model: "CancellationPolicy"
          },
          {
            path: "instructions",
            model: "Instructions"
          }
        ]
      })
      .populate({
        path: "package",
        select: "name description"
      })
      .populate("couponId");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const existingCustomerReview = await Review.findOne({
      booking: bookingId,
      reviewerModel: "User",
      isDeleted: { $ne: true }
    }).select("_id").lean();

    const existingServiceUserReview = await Review.findOne({
      booking: bookingId,
      reviewerModel: "ServiceUser",
      isDeleted: { $ne: true }
    }).select("_id").lean();

    const isCustomerReview = !!existingCustomerReview || !!booking.reviewGiven;
    const isServiceUserReview = !!existingServiceUserReview;

    if (booking.bookingStatus === "confirmed" && !booking.invoiceUrl) {
      const { generateInvoicePDF } = require("../utils/invoiceGenerator");
      const invoiceUrl = await generateInvoicePDF(booking._id);
      if (invoiceUrl) {
        booking.invoiceUrl = invoiceUrl;
      }
    }

    res.json({
      success: true,
      data: booking,
      isCustomerReview,
      isUserReview: isCustomerReview,
      isServiceUserReview
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};


exports.getUserUpcomingBookings = catchAsyncError(async (req, res) => {

  const userId = req.user._id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookings = await Booking.find({
    user: userId,
    checkOut: { $gte: today },
    bookingStatus: { $in: ["confirmed", "pending"] },
    paymentStatus: "paid"
  })
    .populate("property", "name address price media")
    .populate("services.service", "name price media policies maxPersons")
    .populate("package", "name price")
    .sort({ checkIn: 1 })
    .lean();

  for (let i = 0; i < bookings.length; i++) {
    if (bookings[i].bookingStatus === "confirmed" && !bookings[i].invoiceUrl) {
      const { generateInvoicePDF } = require("../utils/invoiceGenerator");
      const invoiceUrl = await generateInvoicePDF(bookings[i]._id);
      if (invoiceUrl) {
        bookings[i].invoiceUrl = invoiceUrl;
      }
    }
  }

  return res.status(200).json({
    success: true,
    data: bookings,
    message: bookings.length
      ? "User upcoming bookings fetched"
      : "No upcoming bookings found"
  });
});


exports.adminOverrideRefund = async (req, res) => {
  try {

    const { bookingId } = req.params;

    const { refundAmount, reason } = req.body;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).send({
        message: "Booking not found"
      });
    }

    /* =============================
       VALIDATIONS
    ============================== */

    if (booking.isCancelled) {
      return res.status(400).send({
        message: "Booking already cancelled",
      });
    }

    if (booking.paymentStatus !== "paid") {
      return res.status(400).send({
        message: "Cannot refund unpaid booking",
      });
    }

    if (booking.refundTransactionId) {
      return res.status(400).send({
        message: "Refund already processed",
      });
    }

    if (
      !refundAmount ||
      isNaN(refundAmount) ||
      Number(refundAmount) <= 0
    ) {
      return res.status(400).send({
        message: "Valid refundAmount is required",
      });
    }

    if (
      Number(refundAmount) >
      booking.totalAmount
    ) {
      return res.status(400).send({
        message: "Refund exceeds total amount",
      });
    }

    /* =============================
       SAVE ADMIN OVERRIDE
    ============================== */

    booking.adminOverride = {
      isOverridden: true,
      refundAmount: Number(refundAmount),
      reason,
    };

    /* =============================
       💰 WALLET HOLD DEDUCTION
    ============================== */

    /* =============================
       🔥 RELEASE AVAILABILITY (Freed immediately on cancellation)
    ============================== */
    if (booking.property) {
      await HotelAvailability.deleteMany({
        hotel: booking.property,
        booking: booking._id,
      });
    }

    if (booking.services?.length > 0) {
      const serviceIds = booking.services.map((s) => s.service);
      await ServiceAvailability.deleteMany({
        service: { $in: serviceIds },
        booking: booking._id,
      });
    }

    /* =============================
       💰 WALLET HOLD DEDUCTION (Cleared on cancellation, earnings deferred to cron)
    ============================== */
    if (booking.providerBreakdown?.length > 0) {
      const totalProviderAmount = booking.providerBreakdown.reduce((sum, p) => sum + p.amount, 0);

      for (const provider of booking.providerBreakdown) {
        const ratio = totalProviderAmount > 0 ? provider.amount / totalProviderAmount : 0;
        const providerRefund = Number((Number(refundAmount) * ratio).toFixed(2));
        const providerKeptAmount = Number((provider.amount - providerRefund).toFixed(2));

        const wallet = await Wallet.findOne({ user: provider.user });
        if (!wallet) continue;

        // Deduct only the refundable portion from hold balance immediately
        const holdDeduction = Math.min(wallet.holdBalance, providerRefund);
        wallet.holdBalance = Number((wallet.holdBalance - holdDeduction).toFixed(2));
        await wallet.save();

        // Update tracking fields
        provider.refundAmount = providerRefund;
        provider.retainedAmount = providerKeptAmount;
        if (providerKeptAmount > 0) {
          provider.payoutReleaseStatus = "PENDING";
          provider.payoutReleaseDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
        } else {
          provider.payoutReleaseStatus = "RELEASED";
          provider.payoutReleasedAt = new Date();
        }

        if (providerRefund > 0) {
          await WalletTransaction.create({
            wallet: wallet._id,
            user: provider.user,
            type: "debit",
            amount: providerRefund,
            bookingId: booking._id,
            referenceId: provider.referenceId,
            description: `Admin override refund deducted for ${provider.type}`,
            transactionType: "refund",
          });
        }
      }
    }

    /* =============================
       💳 TAP REFUND
    ============================== */
    try {
      if (Number(refundAmount) > 0 && booking.tapChargeId) {
        const response = await axios.post(
          "https://api.tap.company/v2/refunds",
          {
            charge_id: booking.tapChargeId,
            amount: Number(refundAmount),
            currency: "SAR",
            reason: "Admin override refund",
            reference: {
              merchant: booking.orderId,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        booking.refundTransactionId = response.data?.id;
      }
    } catch (err) {
      console.error(
        "Refund failed:",
        err.response?.data || err.message
      );

      booking.refundStatus = "failed";
      await booking.save();

      return res.status(500).send({
        message: "Refund failed",
        error: err.response?.data || err.message,
      });
    }

    /* =============================
       UPDATE BOOKING
    ============================== */

    booking.bookingStatus =
      "cancelled";

    booking.isCancelled = true;

    booking.cancellationDate =
      new Date();

    booking.refundAmount =
      Number(refundAmount);

    booking.refundPercentage =
      null;

    booking.refundStatus =
      "processed";

    await booking.save();

    /* =============================
       🔔 NOTIFICATIONS
    ============================== */

    const refundData = {

      bookingId:
        booking._id.toString(),

      totalAmount:
        booking.totalAmount,

      refundAmount:
        Number(refundAmount),

      reason,

      bookingStatus:
        booking.bookingStatus,

      checkIn:
        booking.checkIn,

      checkOut:
        booking.checkOut,

      bookingType:
        booking.bookingType,

      type: "ADMIN_REFUND",
    };

    /* 👤 USER */

    await sendNotification({

      receiverId: booking.user,

      receiverModel: "User",

      title: "Refund Processed 💸",

      body:
        `Admin approved refund of ${refundAmount}`,

      type: "REFUND",

      referenceId: booking._id,

      referenceType: "Booking",

      data: refundData,
    });

    /* 🧑‍🔧 PROVIDERS */

    if (
      booking.providerBreakdown?.length > 0
    ) {

      for (const provider of booking.providerBreakdown) {

        await sendNotification({

          receiverId: provider.user,

          receiverModel: "ServiceUser",

          title: "Booking Cancelled ❌",

          body: provider.retainedAmount > 0
            ? `Booking cancelled. Your payout of ${provider.retainedAmount} SAR will be released to your available wallet balance after 48 hours.`
            : `Booking cancelled with refund for ${provider.type}`,

          type: "BOOKING",

          referenceId: booking._id,

          referenceType: "Booking",

          data: {
            bookingId:
              booking._id.toString(),

            refundAmount:
              Number(refundAmount),

            reason,

            providerType:
              provider.type,
          },
        });
      }
    }

    return res.send({

      message:
        "Admin override refund processed successfully",

      refundAmount:
        Number(refundAmount),

      refundTransactionId:
        booking.refundTransactionId,
    });

  } catch (err) {

    return res.status(500).send({
      message: err.message
    });
  }
};


exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const reason = req.body.reason || req.body.cancellationReason;
    const customReason = req.body.customReason || req.body.customCancellationReason;

    /* =============================
       REASON VALIDATION
    ============================== */
    const validReasons = ["OWNER_TAKING_TOO_LONG", "CHANGED_MY_MIND", "OTHER"];

    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).send({
        message: "Cancellation reason is required and must be valid (OWNER_TAKING_TOO_LONG, CHANGED_MY_MIND, OTHER)",
      });
    }

    if (reason === "OTHER" && (!customReason || !customReason.trim())) {
      return res.status(400).send({
        message: "Custom cancellation reason is required when reason is OTHER",
      });
    }

    const booking = await Booking.findById(bookingId).populate("cancellationPolicy");

    if (!booking) {
      return res.status(404).send({
        message: "Booking not found"
      });
    }

    /* =============================
       VALIDATIONS
    ============================== */
    if (booking.isCancelled) {
      return res.status(400).send({
        message: "Booking already cancelled",
      });
    }

    if (booking.refundTransactionId) {
      return res.status(400).send({
        message: "Refund already processed",
      });
    }

    const now = new Date();

    let bookingStartDate;
    if (booking.checkIn) {
      bookingStartDate = new Date(booking.checkIn);
    } else if (booking.services && booking.services.length > 0) {
      let earliest = null;
      for (const s of booking.services) {
        if (s.serviceDate) {
          const d = new Date(s.serviceDate);
          if (s.serviceStartTime) {
            const [hours, minutes] = s.serviceStartTime.split(":").map(Number);
            d.setUTCHours(hours, minutes, 0, 0);
          }
          if (!earliest || d < earliest) {
            earliest = d;
          }
        }
      }
      bookingStartDate = earliest;
    }

    if (!bookingStartDate) {
      bookingStartDate = new Date();
    }

    /* =============================
       ❌ NO PAYMENT CASE
    ============================== */
    if (booking.paymentStatus !== "paid") {
      booking.bookingStatus = "cancelled";
      booking.isCancelled = true;
      booking.cancellationReason = reason;

      if (reason === "OTHER") {
        booking.customCancellationReason = customReason;
      }

      await booking.save();

      await sendNotification({
        receiverId: booking.user,
        receiverModel: "User",
        title: "Booking Cancelled ❌",
        body: "Your booking has been cancelled",
        type: "BOOKING",
        referenceId: booking._id,
        referenceType: "Booking",
      });

      return res.send({
        success: false,
        message: "Booking cancelled (no payment)",
      });
    }

    /* =================================================
       🔥 PENDING BOOKING CANCELLATION (100% REFUND)
    ================================================= */
    if ((booking.bookingStatus === "pending") && (booking.paymentStatus === "paid") && (booking.pendingReason === "approval_pending")) {
      const refundAmount = booking.totalAmount;
      const refundPercentage = 100;
      let tapRefundId = null;

      /* 🔓 RELEASE AVAILABILITY (Freed immediately on cancellation) */
      if (booking.property) {
        await HotelAvailability.deleteMany({
          hotel: booking.property,
          booking: booking._id,
        });
      }

      if (booking.services?.length > 0) {
        const serviceIds = booking.services.map((s) => s.service);
        await ServiceAvailability.deleteMany({
          service: { $in: serviceIds },
          booking: booking._id,
        });
      }

      /* 💰 WALLET HOLD DEDUCTION FOR PROVIDERS */
      if (booking.providerBreakdown?.length > 0) {
        for (const provider of booking.providerBreakdown) {
          const wallet = await Wallet.findOne({ user: provider.user });
          if (!wallet) continue;

          const providerRefund = provider.amount;
          const holdDeduction = Math.min(wallet.holdBalance, providerRefund);

          if (holdDeduction > 0) {
            wallet.holdBalance = Number((wallet.holdBalance - holdDeduction).toFixed(2));
            await wallet.save();

            await WalletTransaction.create({
              wallet: wallet._id,
              user: provider.user,
              type: "debit",
              amount: holdDeduction,
              bookingId: booking._id,
              referenceId: provider.referenceId,
              description: "Pending booking cancellation refund deducted from hold balance",
              transactionType: "refund",
            });
          }

          provider.refundAmount = provider.amount;
          provider.retainedAmount = 0;
          provider.payoutReleaseStatus = "RELEASED";
          provider.payoutReleasedAt = new Date();
        }
      }

      /* 💳 PROCESS TAP REFUND */
      try {
        if (refundAmount > 0 && booking.tapChargeId) {
          let actualRefundAmount = Number(refundAmount.toFixed(2));
          let refundCurrency = "SAR";

          try {
            const chargeRes = await axios.get(
              `https://api.tap.company/v2/charges/${booking.tapChargeId}`,
              {
                headers: {
                  Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
                },
              }
            );

            if (chargeRes.data) {
              refundCurrency = chargeRes.data.currency || "SAR";
              const captured = Number(chargeRes.data.amount || 0);
              const alreadyRefunded = Number(chargeRes.data.amount_refunded || 0);
              const availableToRefund = Math.max(captured - alreadyRefunded, 0);

              if (actualRefundAmount > availableToRefund) {
                actualRefundAmount = Number(availableToRefund.toFixed(2));
              }
            }
          } catch (fetchErr) {
            console.warn(
              "Could not fetch charge details from TAP, proceeding with default amount:",
              fetchErr.message
            );
          }

          if (actualRefundAmount > 0) {
            const response = await axios.post(
              "https://api.tap.company/v2/refunds",
              {
                charge_id: booking.tapChargeId,
                amount: actualRefundAmount,
                currency: refundCurrency,
                reason: "Pending booking cancellation refund",
                reference: {
                  merchant: booking.orderId,
                },
              },
              {
                headers: {
                  Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
                  "Content-Type": "application/json",
                },
              }
            );

            tapRefundId = response.data?.id;
          } else {
            tapRefundId = "REFUNDED_ON_TAP";
          }
        }
      } catch (err) {
        console.error(
          "Refund failed:",
          err.response?.data || err.message
        );

        booking.refundStatus = "failed";
        await booking.save();

        return res.status(500).send({
          success: false,
          message: "Refund failed",
          error: err.response?.data || err.message,
        });
      }

      /* 📝 UPDATE BOOKING */
      booking.bookingStatus = "cancelled";
      booking.isCancelled = true;
      booking.cancellationDate = new Date();
      booking.refundAmount = refundAmount;
      booking.refundPercentage = refundPercentage;
      booking.refundStatus = "processed";
      booking.refundTransactionId = tapRefundId;
      booking.cancellationReason = reason;
      booking.customCancellationReason =
        reason === "OTHER" ? customReason : null;

      await booking.save();

      /* 🔔 NOTIFICATIONS */
      const cancelData = {
        bookingId: booking._id.toString(),
        totalAmount: booking.totalAmount,
        refundAmount,
        refundPercentage,
        cancellationReason: reason,
        customCancellationReason:
          reason === "OTHER" ? customReason : undefined,
        bookingStatus: booking.bookingStatus,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        bookingType: booking.bookingType,
      };

      /* Customer Notification */
      await sendNotification({
        receiverId: booking.user,
        receiverModel: "User",
        title: "Booking Cancelled",
        body: "Your booking was cancelled successfully. Since it had not yet been accepted, a full refund has been processed.",
        type: "REFUND",
        referenceId: booking._id,
        referenceType: "Booking",
        data: cancelData,
      });

      /* Provider Notification */
      if (booking.providerBreakdown?.length > 0) {
        for (const provider of booking.providerBreakdown) {
          await sendNotification({
            receiverId: provider.user,
            receiverModel: "ServiceUser",
            title: "Pending Booking Cancelled",
            body: "The customer cancelled the booking before it was accepted.",
            type: "BOOKING",
            referenceId: booking._id,
            referenceType: "Booking",
            data: {
              bookingId: booking._id.toString(),
              cancellationReason: reason,
              customCancellationReason:
                reason === "OTHER" ? customReason : undefined,
              providerType: provider.type,
            },
          });
        }
      }

      return res.send({
        success: true,
        message: "Booking cancelled successfully",
        refundAmount,
        refundPercentage,
        cancellationReason: reason,
      });
    }

    /* =============================
       ❌ NO REFUND AFTER START
    ============================== */
    if (now >= bookingStartDate) {
      booking.bookingStatus = "cancelled";
      booking.isCancelled = true;
      booking.cancellationDate = new Date();
      booking.refundAmount = 0;
      booking.refundPercentage = 0;
      booking.cancellationReason = reason;

      if (reason === "OTHER") {
        booking.customCancellationReason = customReason;
      }

      if (booking.providerBreakdown?.length > 0) {
        for (const provider of booking.providerBreakdown) {
          provider.refundAmount = 0;
          provider.retainedAmount = provider.amount;
          provider.payoutReleaseStatus = "PENDING";
          provider.payoutReleaseDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
        }
      }

      await booking.save();

      /* Notify provider of upcoming non-refundable payment release */
      if (booking.providerBreakdown?.length > 0) {
        for (const provider of booking.providerBreakdown) {
          await sendNotification({
            receiverId: provider.user,
            receiverModel: "ServiceUser",
            title: "Booking Cancelled ❌",
            body: `Booking cancelled. Your payout of ${provider.amount} SAR will be released to your available wallet balance after 48 hours.`,
            type: "BOOKING",
            referenceId: booking._id,
            referenceType: "Booking",
            data: {
              bookingId: booking._id.toString(),
              cancellationReason: reason,
              amount: provider.amount
            }
          });
        }
      }

      await sendNotification({
        receiverId: booking.user,
        receiverModel: "User",
        title: "Booking Cancelled ❌",
        body: "No refund available after booking start",
        type: "REFUND",
        referenceId: booking._id,
        referenceType: "Booking",
      });

      return res.send({
        success: false,
        message: "Cancelled (no refund available)",
        refundAmount: 0,
      });
    }

    /* =============================
       🔥 CALCULATE REFUND
    ============================== */
    let refundPercentage = 0;
    let refundAmount = 0;

    const isOverride = booking.adminOverride?.isOverridden;

    /* -----------------------------
       ADMIN OVERRIDE REFUND
    ----------------------------- */
    if (isOverride) {
      refundAmount = booking.adminOverride.refundAmount;
      refundPercentage = null;
    } else {
      let totalRefund = 0;

      const policyObj = booking.cancellationPolicy || {};
      const snapshot = booking.policySnapshot || {};

      /* Check if explicit sub-policies exist (e.g. propertyPolicy or servicePolicies) */
      if (snapshot.propertyPolicy || (snapshot.servicePolicies && snapshot.servicePolicies.length > 0)) {
        if (booking.priceBreakdown?.propertyPrice > 0 && snapshot.propertyPolicy) {
          const propertyPolicy = snapshot.propertyPolicy;
          const rules = propertyPolicy.rules || [];
          const diffHours = (new Date(booking.checkIn) - now) / (1000 * 60 * 60);

          let propertyRefundPercentage = 0;
          const sortedRules = [...rules].sort((a, b) => b.from - a.from);

          for (const rule of sortedRules) {
            const value = rule.unit === "days" ? diffHours / 24 : diffHours;
            if (value >= rule.from) {
              propertyRefundPercentage = rule.refundPercentage;
              break;
            }
          }

          let propertyRefund = (booking.priceBreakdown.propertyPrice * propertyRefundPercentage) / 100;
          totalRefund += propertyRefund;
          refundPercentage = propertyRefundPercentage;
        }

        if (booking.priceBreakdown?.servicePrice > 0 && snapshot.servicePolicies?.length > 0) {
          const diffHours = (bookingStartDate - now) / (1000 * 60 * 60);

          for (const servicePolicy of snapshot.servicePolicies) {
            const bookingService = booking.services?.find(
              s => s.service.toString() === servicePolicy.serviceId?.toString()
            );

            if (!bookingService) continue;

            let serviceRefundPercentage = 0;
            const sortedRules = [...(servicePolicy.rules || [])].sort((a, b) => b.from - a.from);

            for (const rule of sortedRules) {
              const value = rule.unit === "days" ? diffHours / 24 : diffHours;
              if (value >= rule.from) {
                serviceRefundPercentage = rule.refundPercentage;
                break;
              }
            }

            let serviceRefund = (bookingService.price * serviceRefundPercentage) / 100;
            totalRefund += serviceRefund;
            if (!refundPercentage) refundPercentage = serviceRefundPercentage;
          }
        }
      } else {
        /* Primary Top-Level Policy (Flexible, Moderate, Strict, etc.) */
        const rules = snapshot.rules || policyObj.rules || [];
        const diffHours = (bookingStartDate - now) / (1000 * 60 * 60);

        let topRefundPercentage = 0;
        const sortedRules = [...rules].sort((a, b) => b.from - a.from);

        for (const rule of sortedRules) {
          const value = rule.unit === "days" ? diffHours / 24 : diffHours;
          if (value >= rule.from) {
            topRefundPercentage = rule.refundPercentage;
            break;
          }
        }

        let calculatedRefund = (booking.totalAmount * topRefundPercentage) / 100;
        totalRefund = calculatedRefund;
        refundPercentage = topRefundPercentage;
      }

      refundAmount = Math.min(totalRefund, booking.totalAmount);
      refundAmount = Number(refundAmount.toFixed(2));
    }

    /* =============================
       RELEASE AVAILABILITY (Freed immediately on cancellation)
    ============================== */
    if (booking.property) {
      await HotelAvailability.deleteMany({
        hotel: booking.property,
        booking: booking._id,
      });
    }

    if (booking.services?.length > 0) {
      const serviceIds = booking.services.map((s) => s.service);

      await ServiceAvailability.deleteMany({
        service: { $in: serviceIds },
        booking: booking._id,
      });
    }

    /* =============================
       💰 WALLET HOLD DEDUCTION (Cleared on cancellation, earnings deferred to cron)
    ============================== */
    if (booking.providerBreakdown?.length > 0) {
      const refundRatio = booking.totalAmount > 0 ? Math.min(refundAmount / booking.totalAmount, 1) : 0;

      for (const provider of booking.providerBreakdown) {
        const providerRefund = Number(Math.min(provider.amount * refundRatio, provider.amount).toFixed(2));
        const providerKeptAmount = Number((provider.amount - providerRefund).toFixed(2));

        const wallet = await Wallet.findOne({ user: provider.user });
        if (!wallet) continue;

        // Deduct only the refundable portion from hold balance immediately
        const holdDeduction = Math.min(wallet.holdBalance, providerRefund);
        wallet.holdBalance = Number((wallet.holdBalance - holdDeduction).toFixed(2));

        await wallet.save();

        // Update tracking fields
        provider.refundAmount = providerRefund;
        provider.retainedAmount = providerKeptAmount;
        if (providerKeptAmount > 0) {
          provider.payoutReleaseStatus = "PENDING";
          provider.payoutReleaseDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
        } else {
          provider.payoutReleaseStatus = "RELEASED";
          provider.payoutReleasedAt = new Date();
        }

        if (providerRefund > 0) {
          await WalletTransaction.create({
            wallet: wallet._id,
            user: provider.user,
            type: "debit",
            amount: providerRefund,
            bookingId: booking._id,
            referenceId: provider.referenceId,
            description: `Refund deducted from ${provider.type} hold balance`,
            transactionType: "refund",
          });
        }
      }
    }

    /* =============================
       💳 TAP REFUND
    ============================== */
    try {
      if (refundAmount > 0 && booking.tapChargeId) {
        let actualRefundAmount = Number(refundAmount.toFixed(2));
        let refundCurrency = "SAR";

        try {
          const chargeRes = await axios.get(
            `https://api.tap.company/v2/charges/${booking.tapChargeId}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
              },
            }
          );

          if (chargeRes.data) {
            refundCurrency = chargeRes.data.currency || "SAR";
            const captured = Number(chargeRes.data.amount || 0);
            const alreadyRefunded = Number(chargeRes.data.amount_refunded || 0);
            const availableToRefund = Math.max(captured - alreadyRefunded, 0);

            if (actualRefundAmount > availableToRefund) {
              actualRefundAmount = Number(availableToRefund.toFixed(2));
            }
          }
        } catch (fetchErr) {
          console.warn(
            "Could not fetch charge details from TAP, proceeding with default amount:",
            fetchErr.message
          );
        }

        if (actualRefundAmount > 0) {
          const response = await axios.post(
            "https://api.tap.company/v2/refunds",
            {
              charge_id: booking.tapChargeId,
              amount: actualRefundAmount,
              currency: refundCurrency,
              reason: "Booking cancellation refund",
              reference: {
                merchant: booking.orderId,
              },
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );

          booking.refundTransactionId = response.data?.id;
        } else {
          booking.refundTransactionId = "REFUNDED_ON_TAP";
        }
      }
    } catch (err) {
      console.error(
        "Refund failed:",
        err.response?.data || err.message
      );

      booking.refundStatus = "failed";
      await booking.save();

      return res.status(500).send({
        success: false,
        message: "Refund failed",
        error: err.response?.data || err.message,
      });
    }

    /* =============================
       UPDATE BOOKING
    ============================== */
    booking.bookingStatus = "cancelled";
    booking.isCancelled = true;
    booking.cancellationDate = new Date();
    booking.refundAmount = refundAmount;
    booking.refundPercentage = refundPercentage;
    booking.refundStatus = "processed";
    booking.cancellationReason = reason;
    booking.isAmountReleased = false;

    if (reason === "OTHER") {
      booking.customCancellationReason = customReason;
    }

    await booking.save();

    /* =============================
       🔔 NOTIFICATIONS
    ============================== */
    const cancelData = {
      bookingId: booking._id.toString(),
      totalAmount: booking.totalAmount,
      refundAmount,
      refundPercentage,
      bookingStatus: booking.bookingStatus,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      bookingType: booking.bookingType,
    };

    /* 👤 USER */
    await sendNotification({
      receiverId: booking.user,
      receiverModel: "User",
      title: "Booking Cancelled ❌",
      body: `Refund Amount: ${refundAmount}`,
      type: "REFUND",
      referenceId: booking._id,
      referenceType: "Booking",
      data: cancelData,
    });

    /* 🧑‍🔧 PROVIDERS */
    if (booking.providerBreakdown?.length > 0) {
      const refundRatio = booking.totalAmount > 0 ? Math.min(refundAmount / booking.totalAmount, 1) : 0;
      for (const provider of booking.providerBreakdown) {
        const providerRefund = Number(Math.min(provider.amount * refundRatio, provider.amount).toFixed(2));
        const providerKeptAmount = Number((provider.amount - providerRefund).toFixed(2));

        await sendNotification({
          receiverId: provider.user,
          receiverModel: "ServiceUser",
          title: "Booking Cancelled ❌",
          body: providerKeptAmount > 0
            ? `Booking cancelled. Your payout of ${providerKeptAmount} SAR will be released to your available wallet balance after 48 hours.`
            : `Booking cancelled for ${provider.type}`,
          type: "BOOKING",
          referenceId: provider.referenceId || booking._id,
          referenceType: "Booking",
          data: {
            bookingId: booking._id.toString(),
            refundAmount,
            providerType: provider.type,
            keptAmount: providerKeptAmount
          },
        });
      }
    }

    return res.send({
      success: true,
      message: "Booking cancelled successfully",
      refundAmount,
      refundPercentage,
    });

  } catch (error) {
    return res.status(500).send({
      message: error.message,
    });
  }
};


exports.deletePendingBooking = async (req, res) => {

  const { bookingId } = req.params;

  /* ========================
     FIND BOOKING
  ======================== */

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found"
    });
  }

  /* ========================
     ALLOW ONLY PENDING
  ======================== */

  if (booking.bookingStatus !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Only pending bookings can be permanently deleted"
    });
  }

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

  /* ========================
     RESPONSE
  ======================== */

  return res.status(200).json({
    success: true,
    message: "Pending booking deleted permanently"
  });
};


exports.getPendingBookingRequests = async (req, res) => {
  try {

    const providerId = req.user._id;

    const bookings = await Booking.find({

      bookingStatus: "pending",

      pendingReason: "approval_pending",

      paymentStatus: "paid",

      webhookProcessed: true,

      "providerBreakdown.user": providerId

    })

      .select(
        "bookingType bookingStatus pendingReason paymentStatus totalAmount checkIn checkOut createdAt providerBreakdown property services user"
      )

      .populate(
        "user",
        "firstName lastName profile phone identityNumber identityDocuments dateOfBirth verificationService legalFullNameEn legalFullNameEr"
      )

      .populate(
        "property",
        "name media address"
      )

      .populate(
        "services.service",
        "name media"
      )

      .sort({ createdAt: -1 });

    return res.status(200).json({

      success: true,

      count: bookings.length,

      bookings
    });
  } catch (error) {

    return res.status(500).send({
      success: false,
      message: error.message
    });

  }
};


exports.updateBookingApprovalStatus = async (req, res) => {
  try {

    const { bookingId } = req.params;

    const { status } = req.body;

    const providerId = req.user._id;

    if (
      !["confirmed", "cancelled"].includes(status)
    ) {
      return res.status(400).send({
        message: "Invalid status"
      });
    }

    const booking = await Booking.findById(
      bookingId
    );

    if (!booking) {
      return res.status(404).send({
        message: "Booking not found"
      });
    }

    /* =========================================
       ONLY PENDING APPROVAL BOOKINGS
    ========================================= */

    if (
      booking.bookingStatus !== "pending" ||
      booking.pendingReason !== "approval_pending"
    ) {
      return res.status(400).send({
        message:
          "Booking is not waiting for approval"
      });
    }

    /* =========================================
       CHECK ACCEPTANCE DEADLINE
    ========================================= */

    if (
      booking.acceptanceDeadline &&
      booking.acceptanceDeadline <= new Date()
    ) {
      return res.status(400).send({
        message: "Booking acceptance deadline has expired"
      });
    }

    /* =========================================
       CHECK PROVIDER ACCESS
    ========================================= */

    const isProviderIncluded =
      booking.providerBreakdown.some(
        provider =>
          provider.user.toString() ===
          providerId.toString()
      );

    if (!isProviderIncluded) {
      return res.status(403).send({
        message:
          "You are not allowed to update this booking"
      });
    }

    /* =========================================
       CHECK IF ALREADY BOOKED (PREVENT 500)
    ========================================= */

    if (status === "confirmed") {
      if (booking.property) {
        const dates = getDatesBetween(booking.checkIn, booking.checkOut);
        const conflictingAvail = await HotelAvailability.findOne({
          hotel: booking.property,
          date: { $in: dates }
        });
        if (conflictingAvail) {
          return res.status(400).send({
            message: "Property is already booked for these dates"
          });
        }
      }

      if (booking.services?.length > 0) {
        for (const item of booking.services) {
          const serviceId = item.service._id || item.service;
          const date = new Date(item.serviceDate);
          date.setUTCHours(0, 0, 0, 0);

          const conflictingAvail = await ServiceAvailability.findOne({
            service: serviceId,
            date,
            startTime: item.serviceStartTime,
            endTime: item.serviceEndTime,
            isBooked: true
          });

          if (conflictingAvail) {
            return res.status(400).send({
              message: "Requested slot is already booked"
            });
          }
        }
      }
    }

    /* =========================================
       UPDATE BOOKING STATUS
    ========================================= */

    booking.bookingStatus = status;

    booking.pendingReason = null;

    await booking.save();

    if (status === "confirmed") {
      const { generateInvoicePDF } = require("../utils/invoiceGenerator");
      await generateInvoicePDF(booking._id);
    }

    /* =========================================
       IF APPROVED → BLOCK AVAILABILITY
    ========================================= */

    if (status === "confirmed") {

      /* PROPERTY AVAILABILITY */

      if (booking.property) {
        const dates = getDatesBetween(
          booking.checkIn,
          booking.checkOut
        );

        const availabilityDocs =
          dates.map((date) => ({
            hotel: booking.property,
            date,
            booking: booking._id,
            isBooked: true,
          }));

        await HotelAvailability.insertMany(
          availabilityDocs
        );
      }

      /* SERVICE AVAILABILITY */

      if (booking.services?.length > 0) {
        await reserveServiceSlots(booking._id, booking.services);
      }

      /* =========================================
         WALLET HOLD
      ========================================= */

      if (booking.providerBreakdown?.length > 0) {

        for (const provider of booking.providerBreakdown) {

          let wallet =
            await Wallet.findOne({
              user: provider.user
            });

          if (!wallet) {

            wallet =
              await Wallet.create({
                user: provider.user,
                balance: 0,
                holdBalance: 0,
              });
          }

          wallet.holdBalance += provider.amount;

          await wallet.save();

          await WalletTransaction.create({

            wallet: wallet._id,

            user: provider.user,

            type: "credit",

            amount: provider.amount,

            bookingId: booking._id,

            referenceId: provider.referenceId,

            description:
              "Booking amount added to hold balance",

            transactionType: "booking_hold",
          });
        }
      }

      /* =========================================
         AUTO-CANCEL CONFLICTING PENDING BOOKINGS
      ========================================= */
      await autoCancelConflictingBookings(booking);
    }

    /* =========================================
       IF REJECTED → PROCESS REFUND
    ========================================= */

    if (
      status === "cancelled" &&
      booking.tapChargeId &&
      booking.totalAmount > 0
    ) {

      try {
        const response =
          await axios.post(
            "https://api.tap.company/v2/refunds",
            {
              charge_id:
                booking.tapChargeId,

              amount:
                Number(booking.totalAmount),

              currency: "SAR",

              reason:
                "Booking rejected by provider",

              reference: {
                merchant:
                  booking.orderId,
              },
            },
            {
              headers: {
                Authorization:
                  `Bearer ${process.env.TAP_SECRET_KEY}`,

                "Content-Type":
                  "application/json",
              },
            }
          );

        booking.refundTransactionId =
          response.data?.id;

        booking.refundAmount =
          booking.totalAmount;

        booking.refundStatus =
          "processed";

        booking.isCancelled = true;

        booking.cancellationDate =
          new Date();

        await booking.save();

      } catch (err) {

        console.error(
          "Refund failed:",
          err.response?.data || err.message
        );

        booking.refundStatus =
          "failed";

        await booking.save();
      }
    }

    /* =========================================
       USER NOTIFICATION
    ========================================= */

    await sendNotification({
      receiverId: booking.user,
      receiverModel: "User",

      title:
        status === "confirmed"
          ? "Booking Approved ✅"
          : "Booking Rejected ❌",

      body:
        status === "confirmed"
          ? "Your booking has been approved"
          : "Your booking has been rejected and refund has been initiated",

      type: "BOOKING",

      referenceId: booking._id,

      referenceType: "Booking",
    });

    return res.status(200).json({

      success: true,

      message:
        status === "confirmed"
          ? "Booking approved successfully"
          : "Booking rejected successfully",

      booking

    });

  } catch (error) {

    return res.status(500).send({
      success: false,
      message: error.message
    });

  }
};

exports.getServiceAvailability = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { date } = req.query;

    if (!serviceId) {
      return res.status(400).json({ success: false, message: "serviceId is required" });
    }

    if (!date) {
      return res.status(400).json({ success: false, message: "date is required" });
    }

    const service = await Service.findOne({ _id: serviceId, isDeleted: false, isActive: true });
    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found or inactive" });
    }

    const availableSlots = await getAvailableSlots(service, date);

    return res.status(200).json({
      success: true,
      serviceId,
      date,
      slots: availableSlots
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};