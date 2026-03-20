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
    const nights = dates.length;

    let availableServices = [];
    let basePrice = 0;
    let servicesTotal = 0;
    let finalAmount = 0;

    /* =================================================
       PROPERTY BOOKING
    ================================================= */

    if (bookingType === "PROPERTY") {

      const bookedDates = await HotelAvailability.find({
        hotel: hotelId,
        date: { $in: dates },
        isBooked: true
      });

      if (bookedDates.length > 0) {
        return res.send({
          available: false,
          message: "Property not available for selected dates"
        });
      }

      const hotel = await Properties.findById(hotelId).select("price name");

      basePrice = hotel.price;
      finalAmount = hotel.price * nights;
    }

    /* =================================================
       SERVICE BOOKING
    ================================================= */

    if (bookingType === "SERVICE") {

      const bookedServices = await ServiceAvailability.find({
        service: { $in: serviceIds },
        date: { $in: dates },
        isBooked: true
      }).select("service");

      const bookedServiceIds = bookedServices.map(s =>
        s.service.toString()
      );

      const availableServiceIds = serviceIds.filter(
        id => !bookedServiceIds.includes(id)
      );

      if (availableServiceIds.length === 0) {
        return res.send({
          available: false,
          message: "Selected services not available"
        });
      }

      availableServices = await Service.find({
        _id: { $in: availableServiceIds },
        isDeleted: false,
        isActive: true
      }).select("_id name price priceType");

      servicesTotal = availableServices.reduce(
        (sum, s) => sum + s.price,
        0
      );

      finalAmount = servicesTotal * nights;
    }

    /* =================================================
   PROPERTY + ADDON SERVICES BOOKING
================================================= */

    if (bookingType === "PROPERTY_SERVICE") {

      /* -------- PROPERTY CHECK -------- */

      const bookedDates = await HotelAvailability.find({
        hotel: hotelId,
        date: { $in: dates },
        isBooked: true
      });

      if (bookedDates.length > 0) {
        return res.send({
          available: false,
          message: "Property not available for selected dates"
        });
      }

      const hotel = await Properties.findById(hotelId).select("price name");

      basePrice = hotel.price;

      /* -------- SERVICE CHECK -------- */

      const bookedServices = await ServiceAvailability.find({
        service: { $in: serviceIds },
        date: { $in: dates },
        isBooked: true
      }).select("service");

      const bookedServiceIds = bookedServices.map(s =>
        s.service.toString()
      );

      const availableServiceIds = serviceIds.filter(
        id => !bookedServiceIds.includes(id)
      );

      if (availableServiceIds.length === 0) {
        return res.send({
          available: false,
          message: "Selected services not available"
        });
      }

      availableServices = await Service.find({
        _id: { $in: availableServiceIds },
        isDeleted: false,
        isActive: true
      }).select("_id name price priceType");

      servicesTotal = availableServices.reduce(
        (sum, s) => sum + s.price,
        0
      );

      finalAmount = (basePrice * nights) + (servicesTotal * nights);

    }
    /* =================================================
       PACKAGE BOOKING
    ================================================= */

    if (bookingType === "PACKAGE") {

      const pkg = await Package.findById(packageId)
        .populate("property")
        .populate("services.service", "name");
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
          message: "Package property not available"
        });
      }

      /* -------- SERVICE CHECK -------- */

      const pkgServiceIds = pkg.services.map(s => s.service._id);

      const bookedServices = await ServiceAvailability.find({
        service: { $in: pkgServiceIds },
        date: { $in: dates },
        isBooked: true
      }).select("service");

      const bookedServiceIds = bookedServices.map(s =>
        s.service.toString()
      );

      availableServices = pkg.services
        .filter(s => !bookedServiceIds.includes(s.service._id.toString()))
        .map(s => ({
          serviceId: s.service._id,
          name: s.service.name,
          price: s.price,
          priceType: s.priceType
        }));

      if (availableServices.length === 0) {
        return res.send({
          available: false,
          message: "Package services not available"
        });
      }

      servicesTotal = availableServices.reduce(
        (sum, s) => sum + s.price,
        0
      );

      finalAmount = (basePrice + servicesTotal) * nights;
    }


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

        discountAmount = (finalAmount * coupon.discountValue) / 100;

        if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
          discountAmount = coupon.maxDiscount;
        }

      } else {

        discountAmount = coupon.discountValue;

      }

      finalAmount = finalAmount - discountAmount;
    }

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
        finalAmount
      },

      couponId

    });

  } catch (error) {

    return res.status(500).send({
      message: error.message
    });

  }
};

// exports.createBooking = async (req, res) => {
//   try {

//     const {
//       bookingType,
//       propertyId,
//       packageId,
//       services = [],
//       checkIn,
//       checkOut,
//       adults = 1,
//       children = 0,
//       priceDetails,
//       couponId = null
//     } = req.body;

//     const totalGuests = adults + children;
//     const dates = getDatesBetween(checkIn, checkOut);

//     let property = null;

//     /* =================================================
//        PROPERTY VALIDATION
//     ================================================= */

//     if (["PROPERTY", "PACKAGE", "PROPERTY_SERVICE"].includes(bookingType)) {

//       property = await Properties.findById(propertyId)
//         .select("maxGuests category user");

//       if (!property) {
//         return res.status(404).send({
//           message: "Property not found"
//         });
//       }

//       if (totalGuests > property.maxGuests) {
//         return res.status(400).send({
//           message: `Maximum ${property.maxGuests} guests allowed`
//         });
//       }

//       const bookedDates = await HotelAvailability.find({
//         hotel: propertyId,
//         date: { $in: dates },
//         isBooked: true
//       });

//       if (bookedDates.length > 0) {
//         return res.status(400).send({
//           message: "Selected dates are not available"
//         });
//       }
//     }

//     /* =================================================
//        SERVICE VALIDATION
//     ================================================= */

//     if (services.length > 0) {

//       const serviceIds = services.map(s => s.service);

//       const bookedServices = await ServiceAvailability.find({
//         service: { $in: serviceIds },
//         date: { $in: dates },
//         isBooked: true
//       });

//       if (bookedServices.length > 0) {
//         return res.status(400).send({
//           message: "Some services are not available"
//         });
//       }
//     }

//     /* =================================================
//        PRICE CALCULATION
//     ================================================= */

//     const baseAmount = Number(priceDetails.finalAmount);

//     /* ---------------- PLATFORM FEE ---------------- */

//     const platformFeeRule = await PlatformFee.findOne({
//       isActive: true,
//       isDeleted: false
//     });

//     let platformFee = 0;

//     if (platformFeeRule) {
//       if (platformFeeRule.feeType === "PERCENTAGE") {
//         platformFee = (baseAmount * platformFeeRule.value) / 100;
//       } else {
//         platformFee = platformFeeRule.value;
//       }
//     }

//     /* ---------------- TAX ---------------- */

//     const subTotal = baseAmount + platformFee;

//     const taxRule = await Tax.findOne({
//       isActive: true,
//       isDeleted: false
//     });

//     const tax = taxRule ? (subTotal * taxRule.percentage) / 100 : 0;

//     const totalAmount = subTotal + tax;

//     /* ---------------- COMMISSION ---------------- */

//     let commissionRule = await Commission.findOne({
//       scope: "CATEGORY",
//       categoryId: property?.category,
//       isActive: true,
//       isDeleted: false
//     });

//     if (!commissionRule) {
//       commissionRule = await Commission.findOne({
//         scope: "GLOBAL",
//         isActive: true,
//         isDeleted: false
//       });
//     }

//     let commissionAmount = 0;

//     if (commissionRule) {
//       if (commissionRule.commissionType === "PERCENTAGE") {
//         commissionAmount = (baseAmount * commissionRule.value) / 100;
//       } else {
//         commissionAmount = commissionRule.value;
//       }
//     }

//     const providerAmount = baseAmount - commissionAmount;

//     /* =================================================
//        ORDER ID
//     ================================================= */

//     const orderId = "ORD_" + uuidv4().slice(0, 8).toUpperCase();

//     /* =================================================
//        CREATE BOOKING
//     ================================================= */

//     const booking = await Booking.create({

//       bookingType,

//       user: req.user._id,

//       property: propertyId || null,

//       package: packageId || null,

//       services,

//       couponId,

//       checkIn,
//       checkOut,

//       adults,
//       children,

//       priceBreakdown: {
//         propertyPrice: priceDetails.basePrice,
//         packagePrice: bookingType === "PACKAGE" ? priceDetails.basePrice : 0,
//         servicePrice: priceDetails.servicesTotal
//       },

//       totalAmount,
//       commissionAmount,
//       providerAmount,
//       platformFee,
//       tax,

//       orderId,

//       paymentStatus: "pending",
//       bookingStatus: "pending"
//     });

//     /* =================================================
//        RESPONSE
//     ================================================= */

//     return res.status(201).send({
//       message: "Booking created",
//       bookingId: booking._id,
//       orderId,
//       totalAmount,
//       totalGuests
//     });

//   } catch (error) {

//     return res.status(500).send({
//       message: error.message
//     });
//   }
// };


exports.createBooking = async (req, res) => {
  try {

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

    const totalGuests = Number(adults) + Number(children);
    const dates = getDatesBetween(checkIn, checkOut);

    let property = null;

    /* =================================================
       ✅ FIX 1: BLOCK INVALID SERVICE COMBINATION
    ================================================= */

    if (bookingType === "SERVICE" && propertyId) {
      return res.status(400).send({
        message: "SERVICE booking should not have property"
      });
    }

    /* =================================================
       PROPERTY VALIDATION
    ================================================= */

    if (["PROPERTY", "PACKAGE", "PROPERTY_SERVICE"].includes(bookingType)) {

      property = await Properties.findById(propertyId)
        .select("maxGuests category user");

      if (!property) {
        return res.status(404).send({
          message: "Property not found"
        });
      }

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
          message: "Selected dates are not available"
        });
      }
    }

    /* =================================================
       ✅ FIX 2: SERVICE VALIDATION (STRICT FOR SERVICE TYPE)
    ================================================= */

    if (bookingType === "SERVICE" && services.length === 0) {
      return res.status(400).send({
        message: "At least one service is required"
      });
    }

    if (services.length > 0) {

      const serviceIds = services.map(s => s.service);

      const bookedServices = await ServiceAvailability.find({
        service: { $in: serviceIds },
        date: { $in: dates },
        isBooked: true
      });

      if (bookedServices.length > 0) {
        return res.status(400).send({
          message: "Some services are not available"
        });
      }
    }

    /* =================================================
       PRICE CALCULATION
    ================================================= */

    let baseAmount = Number(priceDetails.finalAmount); // ✅ FIX (changed const → let)

    /* ---------------- PLATFORM FEE ---------------- */

    const platformFeeRule = await PlatformFee.findOne({
      isActive: true,
      isDeleted: false
    });

    let platformFee = 0;

    if (platformFeeRule) {
      if (platformFeeRule.feeType === "PERCENTAGE") {
        platformFee = (baseAmount * platformFeeRule.value) / 100;
      } else {
        platformFee = platformFeeRule.value;
      }
    }

    /* ---------------- TAX ---------------- */

    const subTotal = baseAmount + platformFee;

    const taxRule = await Tax.findOne({
      isActive: true,
      isDeleted: false
    });

    const tax = taxRule ? (subTotal * taxRule.percentage) / 100 : 0;

    const totalAmount = subTotal + tax;

    /* ---------------- COMMISSION ---------------- */

    let commissionRule = await Commission.findOne({
      scope: "CATEGORY",
      categoryId: property?.category,
      isActive: true,
      isDeleted: false
    });

    if (!commissionRule) {
      commissionRule = await Commission.findOne({
        scope: "GLOBAL",
        isActive: true,
        isDeleted: false
      });
    }

    let commissionAmount = 0;

    if (commissionRule) {
      if (commissionRule.commissionType === "PERCENTAGE") {
        commissionAmount = (baseAmount * commissionRule.value) / 100;
      } else {
        commissionAmount = commissionRule.value;
      }
    }

    const providerAmount = baseAmount - commissionAmount;

    /* =================================================
       ORDER ID
    ================================================= */

    const orderId = "ORD_" + uuidv4().slice(0, 8).toUpperCase();

    /* =================================================
       CREATE BOOKING
    ================================================= */

    const booking = await Booking.create({

      bookingType,

      user: req.user._id,

      property: bookingType === "SERVICE" ? null : propertyId, // ✅ FIX

      package: packageId || null,

      services,

      couponId,

      checkIn,
      checkOut,

      adults,
      children,

      priceBreakdown: {
        propertyPrice: priceDetails.basePrice,
        packagePrice: bookingType === "PACKAGE" ? priceDetails.basePrice : 0,
        servicePrice: priceDetails.servicesTotal
      },

      totalAmount,
      commissionAmount,
      providerAmount,
      platformFee,
      tax,

      orderId,

      paymentStatus: "pending",
      bookingStatus: "pending"
    });


    /* =================================================
       RESPONSE
    ================================================= */

    return res.status(201).send({
      message: "Booking created",
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
      .populate("services.service", "name price")
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
            select: "firstName lastName email phone profile"
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
        select: "name price duration"
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

    res.json({
      success: true,
      data: booking
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
    .populate("services.service", "name price media")
    .populate("package", "name price")
    .sort({ checkIn: 1 })
    .lean();

  return res.status(200).send({
    data: bookings,
    message: bookings.length
      ? "User upcoming bookings fetched"
      : "No upcoming bookings found"
  });
});

exports.cancelBooking = async (req, res) => {
  try {

    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    booking.bookingStatus = "cancelled";

    await booking.save();

    return res.send({
      message: "Booking cancelled"
    });

  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
};