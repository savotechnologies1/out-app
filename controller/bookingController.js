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


function getDatesBetween(startDate, endDate) {

  const dates = [];

  let currentDate = new Date(startDate);

  while (currentDate < new Date(endDate)) {

    dates.push(new Date(currentDate));

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

exports.checkAvailability = async (req, res) => {
  try {

    const {
      bookingType,
      hotelId,
      serviceIds = [],
      packageId,
      checkIn,
      checkOut,
      couponCode
    } = req.body;

    const userId = req.user?._id;

    const dates = getDatesBetween(checkIn, checkOut);

    if (!dates || dates.length === 0) {
      return res.send({
        available: false,
        message: "Invalid check-in or check-out dates"
      });
    }

    const requestedDays = dates.map(d =>
      d.toLocaleString("en-US", { weekday: "long" })
    );

    const nights = dates.length;

    let availableServices = [];

    let basePrice = 0;

    let servicesTotal = 0;

    let finalAmount = 0;

    /* =================================================
       PROPERTY BOOKING
    ================================================= */

    if (bookingType === "PROPERTY") {

      const hotel = await Properties.findById(hotelId)
        .select("price name");

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

      if (serviceIds.length === 0) {
        return res.send({
          available: false,
          message: "Please select at least one service"
        });
      }

      const bookedServices = await ServiceAvailability.find({
        service: { $in: serviceIds },
        date: { $in: dates },
        isBooked: true
      }).select("service");

      if (bookedServices.length > 0) {
        return res.send({
          available: false,
          message: "Selected service is not available on selected date(s)"
        });
      }

      availableServices = await Service.find({
        _id: { $in: serviceIds },
        isDeleted: false,
        isActive: true
      }).select("_id name price priceType workingDays");

      if (availableServices.length !== serviceIds.length) {
        return res.send({
          available: false,
          message: "Some selected services not found or inactive"
        });
      }

      // ✅ Check workingDays for each service
      for (const service of availableServices) {
        if (service.workingDays && service.workingDays.length > 0) {
          const isAvailableOnDays = requestedDays.every(day => service.workingDays.includes(day));
          if (!isAvailableOnDays) {
            return res.send({
              available: false,
              message: `${service.name} is not available on selected day(s)`
            });
          }
        }
      }

      /* -------- SERVICE PRICE * NIGHTS -------- */

      availableServices = availableServices.map(service => ({
        ...service.toObject(),
        originalPrice: service.price,
        price: service.price * nights
      }));

      servicesTotal = availableServices.reduce(
        (sum, s) => sum + s.price,
        0
      );

      finalAmount = servicesTotal;
    }

    /* =================================================
       PROPERTY + ADDON SERVICES BOOKING
    ================================================= */

    if (bookingType === "PROPERTY_SERVICE") {

      /* -------- PROPERTY CHECK -------- */

      const hotel = await Properties.findById(hotelId)
        .select("price name");

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

      if (serviceIds.length > 0) {

        const bookedServices = await ServiceAvailability.find({
          service: { $in: serviceIds },
          date: { $in: dates },
          isBooked: true
        }).select("service");

        if (bookedServices.length > 0) {
          return res.send({
            available: false,
            message: "Selected service is not available on selected date(s)"
          });
        }

        availableServices = await Service.find({
          _id: { $in: serviceIds },
          isDeleted: false,
          isActive: true
        }).select("_id name price priceType workingDays");

        if (availableServices.length !== serviceIds.length) {
          return res.send({
            available: false,
            message: "Some selected services not found or inactive"
          });
        }

        // ✅ Check workingDays for each service
        for (const service of availableServices) {
          if (service.workingDays && service.workingDays.length > 0) {
            const isAvailableOnDays = requestedDays.every(day => service.workingDays.includes(day));
            if (!isAvailableOnDays) {
              return res.send({
                available: false,
                message: `${service.name} is not available on selected day(s)`
              });
            }
          }
        }

        /* -------- SERVICE PRICE * NIGHTS -------- */

        availableServices = availableServices.map(service => ({
          ...service.toObject(),
          originalPrice: service.price,
          price: service.price * nights
        }));

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
        .populate("services.service", "name workingDays priceType");

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

      const pkgServiceIds = pkg.services.map(
        s => s.service._id
      );

      const bookedServices = await ServiceAvailability.find({
        service: { $in: pkgServiceIds },
        date: { $in: dates },
        isBooked: true
      }).select("service");

      if (bookedServices.length > 0) {
        return res.send({
          available: false,
          message: "Package service is not available on selected date(s)"
        });
      }

      for (const s of pkg.services) {
        const serviceObj = s.service;
        if (serviceObj && serviceObj.workingDays && serviceObj.workingDays.length > 0) {
          const isAvailableOnDays = requestedDays.every(day => serviceObj.workingDays.includes(day));
          if (!isAvailableOnDays) {
            return res.send({
              available: false,
              message: `${serviceObj.name || "Package service"} is not available on selected day(s)`
            });
          }
        }
      }

      availableServices = pkg.services.map(s => ({
        serviceId: s.service._id,
        name: s.service.name,
        originalPrice: s.price,
        price: s.price * nights,
        priceType: s.priceType
      }));

      servicesTotal = availableServices.reduce(
        (sum, s) => sum + s.price,
        0
      );

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

    const totalGuests = Number(children) + Number(adults);

    const dates = getDatesBetween(checkIn, checkOut);

    if (!dates || dates.length === 0) {
      return res.status(400).send({
        message: "Invalid check-in or check-out dates"
      });
    }

    const requestedDays = dates.map(d =>
      d.toLocaleString("en-US", { weekday: "long" })
    );

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
        const pkgServiceIds = pkg.services.map(s => s.service._id);

        const bookedPkgServices = await ServiceAvailability.find({
          service: { $in: pkgServiceIds },
          date: { $in: dates },
          isBooked: true
        });

        if (bookedPkgServices.length > 0) {
          return res.status(400).send({
            message: "Package services are not available on selected date(s)"
          });
        }

        for (const item of pkg.services) {
          const s = item.service;
          if (s && s.workingDays && s.workingDays.length > 0) {
            const isAvailableOnDays = requestedDays.every(day => s.workingDays.includes(day));
            if (!isAvailableOnDays) {
              return res.status(400).send({
                message: `${s.name || "Package service"} is not available on selected day(s)`
              });
            }
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

      property = await Properties.findById(propertyId)
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

    if (services.length > 0) {

      const serviceIds = services.map(
        s => s.service
      );

      servicesData = await Service.find({
        _id: { $in: serviceIds },
        isDeleted: false,
        isActive: true
      })
        .populate("cancellationPolicy")
        .select(
          "user category name policies cancellationPolicy priceType maxPersons workingDays"
        );

      if (servicesData.length !== services.length) {
        return res.status(400).send({
          message: "Some services not found or inactive"
        });
      }

      const bookedServices =
        await ServiceAvailability.find({
          service: { $in: serviceIds },
          date: { $in: dates },
          isBooked: true
        });

      if (bookedServices.length > 0) {
        return res.status(400).send({
          message: "Some services are not available on selected date(s)"
        });
      }

      // ✅ Check workingDays for each service
      for (const service of servicesData) {
        if (service.workingDays && service.workingDays.length > 0) {
          const isAvailableOnDays = requestedDays.every(day => service.workingDays.includes(day));
          if (!isAvailableOnDays) {
            return res.status(400).send({
              message: `${service.name} is not available on selected day(s)`
            });
          }
        }
      }

      // ✅ validate service maxPersons

      for (const service of servicesData) {

        if (
          service.priceType === "flat" &&
          totalGuests > (service.maxPersons || 1)
        ) {
          return res.status(400).send({
            message:
              `${service.name} allows maximum ` +
              `${service.maxPersons} persons`
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

      const item = services.find(
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

      const item = services.find(
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

      const item = services.find(
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

    /* =================================================
       CREATE BOOKING
    ================================================= */

    const booking = await Booking.create({

      bookingType,

      user: req.user._id,

      property:
        bookingType === "SERVICE"
          ? null
          : propertyId,

      package: packageId || null,

      services,

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

      acceptanceDeadline: calculateAcceptanceDeadline(checkIn),

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
      .populate("services.service", "name price policies maxPersons")
      .populate({
        path: "package",
        select: "name"
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

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
        select: "name price duration policies maxPersons"
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

  return res.status(200).json({
    success: true,
    data: bookings,
    message: bookings.length
      ? "User upcoming bookings fetched"
      : "No upcoming bookings found"
  });
});


// exports.adminOverrideRefund = async (req, res) => {
//   try {
//     const { bookingId } = req.params;
//     const { refundAmount, reason } = req.body;

//     const booking = await Booking.findById(bookingId);

//     if (!booking) {
//       return res.status(404).send({ message: "Booking not found" });
//     }

//     /* =============================
//        VALIDATIONS
//     ============================== */
//     if (booking.isCancelled) {
//       return res.status(400).send({
//         message: "Booking already cancelled",
//       });
//     }

//     if (booking.paymentStatus !== "paid") {
//       return res.status(400).send({
//         message: "Cannot refund unpaid booking",
//       });
//     }

//     if (booking.refundTransactionId) {
//       return res.status(400).send({
//         message: "Refund already processed",
//       });
//     }

//     if (refundAmount > booking.totalAmount) {
//       return res.status(400).send({
//         message: "Refund exceeds total amount",
//       });
//     }

//     /* =============================
//        SAVE ADMIN OVERRIDE
//     ============================== */
//     booking.adminOverride = {
//       isOverridden: true,
//       refundAmount,
//       reason,
//     };

//     /* =============================
//        💰 WALLET HOLD DEDUCTION
//     ============================== */
//     if (booking.providerBreakdown?.length > 0) {
//       for (const provider of booking.providerBreakdown) {
//         const ratio = provider.amount / booking.totalAmount;
//         const providerRefund = refundAmount * ratio;

//         const wallet = await Wallet.findOne({ user: provider.user });

//         if (!wallet) continue;
//         if (wallet.holdBalance < providerRefund) continue;

//         wallet.holdBalance -= providerRefund;
//         await wallet.save();

//         await WalletTransaction.create({
//           wallet: wallet._id,
//           user: provider.user,
//           type: "debit",
//           amount: providerRefund,
//           bookingId: booking._id,
//           referenceId: provider.referenceId,
//           description: "Admin override refund deducted",
//           transactionType: "refund",
//         });
//       }
//     }

//     /* =============================
//        💳 TAP REFUND
//     ============================== */
//     try {
//       if (refundAmount > 0 && booking.tapChargeId) {
//         const response = await axios.post(
//           "https://api.tap.company/v2/refunds",
//           {
//             charge_id: booking.tapChargeId,
//             amount: refundAmount,
//             currency: "SAR",
//             reason: "Admin override refund",
//             reference: {
//               merchant: booking.orderId,
//             },
//           },
//           {
//             headers: {
//               Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
//               "Content-Type": "application/json",
//             },
//           }
//         );

//         booking.refundTransactionId = response.data?.id;
//       }
//     } catch (err) {
//       console.error("Refund failed:", err.response?.data || err.message);

//       booking.refundStatus = "failed";
//       await booking.save();

//       return res.status(500).send({
//         message: "Refund failed",
//         error: err.response?.data || err.message,
//       });
//     }

//     /* =============================
//        🔥 RELEASE AVAILABILITY
//     ============================== */
//     if (booking.property) {
//       await HotelAvailability.deleteMany({
//         hotel: booking.property,
//         booking: booking._id,
//       });
//     }

//     if (booking.services?.length > 0) {
//       const serviceIds = booking.services.map((s) => s.service);

//       await ServiceAvailability.deleteMany({
//         service: { $in: serviceIds },
//         booking: booking._id,
//       });
//     }

//     /* =============================
//        UPDATE BOOKING
//     ============================== */
//     booking.bookingStatus = "cancelled";
//     booking.isCancelled = true;
//     booking.cancellationDate = new Date();

//     booking.refundAmount = refundAmount;
//     booking.refundPercentage = null;
//     booking.refundStatus = "processed";

//     await booking.save();

//     /* =============================
//        🔔 NOTIFICATIONS (NEW)
//     ============================== */

//     const refundData = {
//       bookingId: booking._id.toString(),
//       totalAmount: booking.totalAmount,
//       refundAmount,
//       reason,
//       bookingStatus: booking.bookingStatus,
//       checkIn: booking.checkIn,
//       checkOut: booking.checkOut,
//       type: "ADMIN_REFUND",
//     };

//     /* 👤 USER */
//     await sendNotification({
//       receiverId: booking.user,
//       receiverModel: "User",
//       title: "Refund Processed 💸",
//       body: `Admin approved refund of ${refundAmount}`,
//       type: "REFUND",
//       referenceId: booking._id,
//       referenceType: "Booking",
//       data: refundData,
//     });

//     /* 🧑‍🔧 PROVIDERS */
//     if (booking.providerBreakdown?.length > 0) {
//       for (const provider of booking.providerBreakdown) {
//         await sendNotification({
//           receiverId: provider.user,
//           receiverModel: "ServiceUser",
//           title: "Booking Cancelled ❌",
//           body: "Booking cancelled with admin refund",
//           type: "BOOKING",
//           referenceId: booking._id,
//           referenceType: "Booking",
//           data: {
//             bookingId: booking._id.toString(),
//             refundAmount,
//             reason,
//           },
//         });
//       }
//     }

//     return res.send({
//       message: "Admin override refund processed successfully",
//       refundAmount,
//       refundTransactionId: booking.refundTransactionId,
//     });

//   } catch (err) {
//     return res.status(500).send({ message: err.message });
//   }
// };


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

    if (
      booking.providerBreakdown?.length > 0
    ) {

      const totalProviderAmount =
        booking.providerBreakdown.reduce(
          (sum, provider) =>
            sum + provider.amount,
          0
        );

      for (const provider of booking.providerBreakdown) {

        const ratio =
          provider.amount /
          totalProviderAmount;

        const providerRefund =
          Number(refundAmount) * ratio;

        const wallet =
          await Wallet.findOne({
            user: provider.user
          });

        if (!wallet) continue;

        if (
          wallet.holdBalance <
          providerRefund
        ) {
          continue;
        }

        wallet.holdBalance -= providerRefund;

        await wallet.save();

        await WalletTransaction.create({

          wallet: wallet._id,

          user: provider.user,

          type: "debit",

          amount: providerRefund,

          bookingId: booking._id,

          referenceId:
            provider.referenceId,

          description:
            `Admin refund deducted for ${provider.type}`,

          transactionType: "refund",
        });
      }
    }

    /* =============================
       💳 TAP REFUND
    ============================== */

    try {

      if (
        Number(refundAmount) > 0 &&
        booking.tapChargeId
      ) {

        const response =
          await axios.post(
            "https://api.tap.company/v2/refunds",
            {
              charge_id:
                booking.tapChargeId,

              amount:
                Number(refundAmount),

              currency: "SAR",

              reason:
                "Admin override refund",

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
        error:
          err.response?.data || err.message,
      });
    }

    /* =============================
       🔥 RELEASE AVAILABILITY
    ============================== */

    if (booking.property) {

      await HotelAvailability.deleteMany({
        hotel: booking.property,
        booking: booking._id,
      });
    }

    if (
      booking.services?.length > 0
    ) {

      const serviceIds =
        booking.services.map(
          (s) => s.service
        );

      await ServiceAvailability.deleteMany({
        service: { $in: serviceIds },
        booking: booking._id,
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

          body:
            `Booking cancelled with refund for ${provider.type}`,

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


// exports.cancelBooking = async (req, res) => {
//   try {
//     const { bookingId } = req.params;

//     const booking = await Booking.findById(bookingId);
//     if (!booking) {
//       return res.status(404).send({ message: "Booking not found" });
//     }

//     /* =============================
//        VALIDATIONS
//     ============================== */
//     if (booking.isCancelled) {
//       return res.status(400).send({
//         message: "Booking already cancelled",
//       });
//     }

//     if (booking.refundTransactionId) {
//       return res.status(400).send({
//         message: "Refund already processed",
//       });
//     }

//     /* =============================
//        ❌ NO PAYMENT CASE
//     ============================== */
//     if (booking.paymentStatus !== "paid") {
//       booking.bookingStatus = "cancelled";
//       booking.isCancelled = true;

//       await booking.save();

//       // 🔔 USER
//       await sendNotification({
//         receiverId: booking.user,
//         receiverModel: "User",
//         title: "Booking Cancelled ❌",
//         body: "Your booking has been cancelled",
//         type: "BOOKING",
//         referenceId: booking._id,
//         referenceType: "Booking",
//       });

//       return res.send({
//         message: "Booking cancelled (no payment)",
//       });
//     }

//     const now = new Date();

//     /* =============================
//        ❌ NO REFUND AFTER CHECK-IN
//     ============================== */
//     if (now >= booking.checkIn) {
//       booking.bookingStatus = "cancelled";
//       booking.isCancelled = true;
//       booking.refundAmount = 0;
//       booking.refundPercentage = 0;

//       await booking.save();

//       // 🔔 USER
//       await sendNotification({
//         receiverId: booking.user,
//         receiverModel: "User",
//         title: "Booking Cancelled ❌",
//         body: "No refund available after check-in",
//         type: "REFUND",
//         referenceId: booking._id,
//         referenceType: "Booking",
//       });

//       return res.send({
//         message: "Cancelled (no refund after check-in)",
//         refundAmount: 0,
//       });
//     }

//     /* =============================
//        🔥 CALCULATE REFUND
//     ============================== */
//     let refundPercentage = 0;
//     let refundAmount = 0;

//     const isOverride = booking.adminOverride?.isOverridden;

//     if (isOverride) {
//       refundAmount = booking.adminOverride.refundAmount;
//     } else {
//       const rules = booking.policySnapshot?.rules || [];

//       const diffHours = (booking.checkIn - now) / (1000 * 60 * 60);

//       for (const rule of rules) {
//         const value = rule.unit === "days" ? diffHours / 24 : diffHours;

//         if (value >= rule.from) {
//           refundPercentage = rule.refundPercentage;
//           break;
//         }
//       }

//       refundAmount = (booking.totalAmount * refundPercentage) / 100;

//       const cancellationFee =
//         booking.policySnapshot?.cancellationFee || 0;

//       refundAmount = Math.max(refundAmount - cancellationFee, 0);
//     }

//     /* =============================
//        💰 WALLET HOLD DEDUCTION
//     ============================== */
//     if (booking.providerBreakdown?.length > 0) {
//       for (const provider of booking.providerBreakdown) {
//         let providerRefund = 0;

//         if (isOverride) {
//           const ratio = provider.amount / booking.totalAmount;
//           providerRefund = refundAmount * ratio;
//         } else {
//           providerRefund =
//             provider.amount * (refundPercentage / 100);
//         }

//         const wallet = await Wallet.findOne({ user: provider.user });

//         if (!wallet) continue;
//         if (wallet.holdBalance < providerRefund) continue;

//         wallet.holdBalance -= providerRefund;

//         await wallet.save();

//         await WalletTransaction.create({
//           wallet: wallet._id,
//           user: provider.user,
//           type: "debit",
//           amount: providerRefund,
//           bookingId: booking._id,
//           referenceId: provider.referenceId,
//           description: "Refund deducted from hold",
//           transactionType: "refund",
//         });
//       }
//     }

//     /* =============================
//        💳 TAP REFUND
//     ============================== */
//     try {
//       if (refundAmount > 0 && booking.tapChargeId) {
//         const response = await axios.post(
//           "https://api.tap.company/v2/refunds",
//           {
//             charge_id: booking.tapChargeId,
//             amount: refundAmount,
//             currency: "SAR",
//             reason: "Booking cancellation refund",
//             reference: {
//               merchant: booking.orderId,
//             },
//           },
//           {
//             headers: {
//               Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
//               "Content-Type": "application/json",
//             },
//           }
//         );

//         booking.refundTransactionId = response.data?.id;
//       }
//     } catch (err) {
//       console.error("Refund failed:", err.response?.data || err.message);

//       booking.refundStatus = "failed";
//       await booking.save();

//       return res.status(500).send({
//         message: "Refund failed",
//         error: err.response?.data || err.message,
//       });
//     }

//     /* =============================
//        RELEASE AVAILABILITY
//     ============================== */
//     if (booking.property) {
//       await HotelAvailability.deleteMany({
//         hotel: booking.property,
//         booking: booking._id,
//       });
//     }

//     if (booking.services?.length > 0) {
//       const serviceIds = booking.services.map((s) => s.service);

//       await ServiceAvailability.deleteMany({
//         service: { $in: serviceIds },
//         booking: booking._id,
//       });
//     }

//     /* =============================
//        UPDATE BOOKING
//     ============================== */
//     booking.bookingStatus = "cancelled";
//     booking.isCancelled = true;
//     booking.cancellationDate = new Date();
//     booking.refundAmount = refundAmount;
//     booking.refundPercentage = isOverride ? null : refundPercentage;
//     booking.refundStatus = "processed";

//     await booking.save();

//     /* =============================
//        🔔 NOTIFICATIONS
//     ============================== */

//     const cancelData = {
//       bookingId: booking._id.toString(),
//       totalAmount: booking.totalAmount,
//       refundAmount,
//       refundPercentage,
//       bookingStatus: booking.bookingStatus,
//       checkIn: booking.checkIn,
//       checkOut: booking.checkOut,
//     };

//     // 👤 USER
//     await sendNotification({
//       receiverId: booking.user,
//       receiverModel: "User",
//       title: "Booking Cancelled ❌",
//       body: `Refund Amount: ${refundAmount}`,
//       type: "REFUND",
//       referenceId: booking._id,
//       referenceType: "Booking",
//       data: cancelData,
//     });

//     // 🧑‍🔧 PROVIDERS
//     if (booking.providerBreakdown?.length > 0) {
//       for (const provider of booking.providerBreakdown) {
//         await sendNotification({
//           receiverId: provider.user,
//           receiverModel: "ServiceUser",
//           title: "Booking Cancelled ❌",
//           body: "A booking has been cancelled",
//           type: "BOOKING",
//           referenceId: booking._id,
//           referenceType: "Booking",
//           data: {
//             bookingId: booking._id.toString(),
//             refundAmount,
//           },
//         });
//       }
//     }

//     return res.send({
//       message: "Booking cancelled successfully",
//       refundAmount,
//       refundPercentage: isOverride ? null : refundPercentage,
//     });

//   } catch (error) {
//     return res.status(500).send({
//       message: error.message,
//     });
//   }
// };


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

    const bookingStartDate = new Date(booking.checkIn);

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
        }
      }

      /* 🔓 RELEASE AVAILABILITY */
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
      booking.refundAmount = 0;
      booking.refundPercentage = 0;
      booking.cancellationReason = reason;

      if (reason === "OTHER") {
        booking.customCancellationReason = customReason;
      }

      await booking.save();

      /* Clear provider hold balance and release non-refundable earnings */
      if (booking.providerBreakdown?.length > 0) {
        for (const provider of booking.providerBreakdown) {
          const wallet = await Wallet.findOne({ user: provider.user });
          if (!wallet) continue;

          const holdDeduction = Math.min(wallet.holdBalance, provider.amount);
          if (holdDeduction > 0) {
            wallet.holdBalance = Number((wallet.holdBalance - holdDeduction).toFixed(2));
            wallet.balance = Number(((wallet.balance || 0) + holdDeduction).toFixed(2));
            await wallet.save();

            await WalletTransaction.create({
              wallet: wallet._id,
              user: provider.user,
              type: "credit",
              amount: holdDeduction,
              bookingId: booking._id,
              referenceId: provider.referenceId,
              description: "Non-refundable amount released to available balance on cancellation after start",
              transactionType: "release_on_checkin",
            });
          }
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
        const diffHours = (new Date(booking.checkIn || bookingStartDate) - now) / (1000 * 60 * 60);

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
       💰 WALLET HOLD DEDUCTION & PROVIDER EARNINGS
    ============================== */
    if (booking.providerBreakdown?.length > 0) {
      const refundRatio = booking.totalAmount > 0 ? Math.min(refundAmount / booking.totalAmount, 1) : 0;

      for (const provider of booking.providerBreakdown) {
        const providerRefund = Number(Math.min(provider.amount * refundRatio, provider.amount).toFixed(2));

        const wallet = await Wallet.findOne({ user: provider.user });
        if (!wallet) continue;

        // Clear provider hold balance allocated for this booking
        const holdDeduction = Math.min(wallet.holdBalance, provider.amount);
        wallet.holdBalance = Number((wallet.holdBalance - holdDeduction).toFixed(2));

        // Transfer any retained non-refundable amount (e.g. cancellation policy retained share) to provider's available balance
        const providerEarned = Number(Math.max(provider.amount - providerRefund, 0).toFixed(2));
        if (providerEarned > 0) {
          wallet.balance = Number(((wallet.balance || 0) + providerEarned).toFixed(2));
        }

        await wallet.save();

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

        if (providerEarned > 0) {
          await WalletTransaction.create({
            wallet: wallet._id,
            user: provider.user,
            type: "credit",
            amount: providerEarned,
            bookingId: booking._id,
            referenceId: provider.referenceId,
            description: `Retained non-refundable earnings from cancelled booking (${provider.type})`,
            transactionType: "release_on_checkin",
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
       RELEASE AVAILABILITY
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
       UPDATE BOOKING
    ============================== */
    booking.bookingStatus = "cancelled";
    booking.isCancelled = true;
    booking.cancellationDate = new Date();
    booking.refundAmount = refundAmount;
    booking.refundPercentage = refundPercentage;
    booking.refundStatus = "processed";
    booking.cancellationReason = reason;

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
      for (const provider of booking.providerBreakdown) {
        await sendNotification({
          receiverId: provider.user,
          receiverModel: "ServiceUser",
          title: "Booking Cancelled ❌",
          body: `Booking cancelled for ${provider.type}`,
          type: "BOOKING",
          referenceId: provider.referenceId || booking._id,
          referenceType: "Booking",
          data: {
            bookingId: booking._id.toString(),
            refundAmount,
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
       UPDATE BOOKING STATUS
    ========================================= */

    booking.bookingStatus = status;

    booking.pendingReason = null;

    await booking.save();

    /* =========================================
       IF APPROVED → BLOCK AVAILABILITY
    ========================================= */

    if (status === "confirmed") {

      const dates = getDatesBetween(
        booking.checkIn,
        booking.checkOut
      );

      /* PROPERTY AVAILABILITY */

      if (booking.property) {

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

        const serviceIds =
          booking.services.map(
            s => s.service
          );

        const servicesData =
          await Service.find({
            _id: { $in: serviceIds }
          }).select("_id workingHours");

        const serviceAvailabilityDocs = [];

        servicesData.forEach((service) => {

          dates.forEach((date) => {

            serviceAvailabilityDocs.push({
              service: service._id,
              date,
              startTime:
                service.workingHours.start,
              endTime:
                service.workingHours.end,
              booking: booking._id,
              isBooked: true,
            });
          });
        });

        await ServiceAvailability.insertMany(
          serviceAvailabilityDocs
        );
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