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


function getDatesBetween(startDate, endDate) {

  const dates = [];

  let currentDate = new Date(startDate);

  while (currentDate < new Date(endDate)) {

    dates.push(new Date(currentDate));

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

// exports.checkAvailability = async (req, res) => {
//   try {
//     const {
//       bookingType,
//       hotelId,
//       serviceIds = [],
//       packageId,
//       checkIn,
//       checkOut,
//       couponCode
//     } = req.body;

//     const userId = req.user?._id;

//     const dates = getDatesBetween(checkIn, checkOut);
//     const nights = dates.length;

//     let availableServices = [];
//     let basePrice = 0;
//     let servicesTotal = 0;
//     let finalAmount = 0;

//     /* =================================================
//        PROPERTY BOOKING
//     ================================================= */

//     if (bookingType === "PROPERTY") {

//       const bookedDates = await HotelAvailability.find({
//         hotel: hotelId,
//         date: { $in: dates },
//         isBooked: true
//       });

//       if (bookedDates.length > 0) {
//         return res.send({
//           available: false,
//           message: "Property not available for selected dates"
//         });
//       }

//       const hotel = await Properties.findById(hotelId).select("price name");

//       basePrice = hotel.price;
//       finalAmount = hotel.price * nights;
//     }

//     /* =================================================
//        SERVICE BOOKING
//     ================================================= */

//     if (bookingType === "SERVICE") {

//       const bookedServices = await ServiceAvailability.find({
//         service: { $in: serviceIds },
//         date: { $in: dates },
//         isBooked: true
//       }).select("service");

//       const bookedServiceIds = bookedServices.map(s =>
//         s.service.toString()
//       );

//       const availableServiceIds = serviceIds.filter(
//         id => !bookedServiceIds.includes(id)
//       );

//       if (availableServiceIds.length === 0) {
//         return res.send({
//           available: false,
//           message: "Selected services not available"
//         });
//       }

//       availableServices = await Service.find({
//         _id: { $in: availableServiceIds },
//         isDeleted: false,
//         isActive: true
//       }).select("_id name price priceType");

//       servicesTotal = availableServices.reduce(
//         (sum, s) => sum + s.price,
//         0
//       );

//       finalAmount = servicesTotal * nights;
//     }

//     /* =================================================
//    PROPERTY + ADDON SERVICES BOOKING
// ================================================= */

//     if (bookingType === "PROPERTY_SERVICE") {

//       /* -------- PROPERTY CHECK -------- */

//       const bookedDates = await HotelAvailability.find({
//         hotel: hotelId,
//         date: { $in: dates },
//         isBooked: true
//       });

//       if (bookedDates.length > 0) {
//         return res.send({
//           available: false,
//           message: "Property not available for selected dates"
//         });
//       }

//       const hotel = await Properties.findById(hotelId).select("price name");

//       basePrice = hotel.price;

//       /* -------- SERVICE CHECK -------- */

//       const bookedServices = await ServiceAvailability.find({
//         service: { $in: serviceIds },
//         date: { $in: dates },
//         isBooked: true
//       }).select("service");

//       const bookedServiceIds = bookedServices.map(s =>
//         s.service.toString()
//       );

//       const availableServiceIds = serviceIds.filter(
//         id => !bookedServiceIds.includes(id)
//       );

//       if (availableServiceIds.length === 0) {
//         return res.send({
//           available: false,
//           message: "Selected services not available"
//         });
//       }

//       availableServices = await Service.find({
//         _id: { $in: availableServiceIds },
//         isDeleted: false,
//         isActive: true
//       }).select("_id name price priceType");

//       servicesTotal = availableServices.reduce(
//         (sum, s) => sum + s.price,
//         0
//       );

//       finalAmount = (basePrice * nights) + (servicesTotal * nights);

//     }
//     /* =================================================
//        PACKAGE BOOKING
//     ================================================= */

//     if (bookingType === "PACKAGE") {

//       const pkg = await Package.findById(packageId)
//         .populate("property")
//         .populate("services.service", "name");
//       if (!pkg) {
//         return res.status(404).send({
//           available: false,
//           message: "Package not found"
//         });
//       }

//       basePrice = pkg.basePrice || 0;

//       const bookedProperty = await HotelAvailability.find({
//         hotel: pkg.property._id,
//         date: { $in: dates },
//         isBooked: true
//       });

//       if (bookedProperty.length > 0) {
//         return res.send({
//           available: false,
//           message: "Package property not available"
//         });
//       }

//       /* -------- SERVICE CHECK -------- */

//       const pkgServiceIds = pkg.services.map(s => s.service._id);

//       const bookedServices = await ServiceAvailability.find({
//         service: { $in: pkgServiceIds },
//         date: { $in: dates },
//         isBooked: true
//       }).select("service");

//       const bookedServiceIds = bookedServices.map(s =>
//         s.service.toString()
//       );

//       availableServices = pkg.services
//         .filter(s => !bookedServiceIds.includes(s.service._id.toString()))
//         .map(s => ({
//           serviceId: s.service._id,
//           name: s.service.name,
//           price: s.price,
//           priceType: s.priceType
//         }));

//       if (availableServices.length === 0) {
//         return res.send({
//           available: false,
//           message: "Package services not available"
//         });
//       }

//       servicesTotal = availableServices.reduce(
//         (sum, s) => sum + s.price,
//         0
//       );

//       finalAmount = (basePrice + servicesTotal) * nights;
//     }


//     let discountAmount = 0;
//     let couponId = null;

//     if (couponCode) {

//       const coupon = await Coupon.findOne({
//         code: couponCode.toUpperCase(),
//         isActive: true,
//         isDelete: false
//       });

//       if (!coupon) {
//         return res.status(400).send({
//           message: "Invalid coupon code"
//         });
//       }

//       couponId = coupon._id;

//       const alreadyUsed = coupon.usedBy.find(
//         u => u.user.toString() === userId.toString()
//       );

//       if (alreadyUsed) {
//         return res.status(400).send({
//           message: "Coupon already used"
//         });
//       }

//       if (coupon.discountType === "PERCENTAGE") {

//         discountAmount = (finalAmount * coupon.discountValue) / 100;

//         if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
//           discountAmount = coupon.maxDiscount;
//         }

//       } else {

//         discountAmount = coupon.discountValue;

//       }

//       finalAmount = finalAmount - discountAmount;
//     }

//     /* =================================================
//        RESPONSE
//     ================================================= */

//     return res.send({

//       available: true,

//       bookingType,

//       availableServices,

//       priceDetails: {
//         basePrice,
//         servicesTotal,
//         nights,
//         discountAmount,
//         finalAmount
//       },

//       couponId

//     });

//   } catch (error) {

//     return res.status(500).send({
//       message: error.message
//     });

//   }
// };


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

      const hotel = await Properties.findById(hotelId)
        .select("price name");

      if (!hotel) {
        return res.status(404).send({
          available: false,
          message: "Property not found"
        });
      }

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

      const bookedServiceIds = bookedServices.map(
        s => s.service.toString()
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
      }).select(
        "_id name price priceType maxPersons policies"
      );

      servicesTotal = availableServices.reduce(
        (sum, s) => sum + s.price,
        0
      );

      // ✅ service is one-time charge
      finalAmount = servicesTotal;
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

      const hotel = await Properties.findById(hotelId)
        .select("price name");

      if (!hotel) {
        return res.status(404).send({
          available: false,
          message: "Property not found"
        });
      }

      basePrice = hotel.price;

      /* -------- SERVICE CHECK -------- */

      const bookedServices = await ServiceAvailability.find({
        service: { $in: serviceIds },
        date: { $in: dates },
        isBooked: true
      }).select("service");

      const bookedServiceIds = bookedServices.map(
        s => s.service.toString()
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
      }).select(
        "_id name price priceType maxPersons policies"
      );

      servicesTotal = availableServices.reduce(
        (sum, s) => sum + s.price,
        0
      );

      // ✅ property nightly + service one-time
      finalAmount = (basePrice * nights) + servicesTotal;
    }

    /* =================================================
       PACKAGE BOOKING
    ================================================= */

    if (bookingType === "PACKAGE") {

      const pkg = await Package.findById(packageId)
        .populate("property")
        .populate(
          "services.service",
          "name maxPersons policies"
        );

      if (!pkg) {
        return res.status(404).send({
          available: false,
          message: "Package not found"
        });
      }

      basePrice = pkg.basePrice || 0;

      /* -------- PROPERTY CHECK -------- */

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

      const pkgServiceIds = pkg.services.map(
        s => s.service._id
      );

      const bookedServices = await ServiceAvailability.find({
        service: { $in: pkgServiceIds },
        date: { $in: dates },
        isBooked: true
      }).select("service");

      const bookedServiceIds = bookedServices.map(
        s => s.service.toString()
      );

      availableServices = pkg.services
        .filter(
          s => !bookedServiceIds.includes(
            s.service._id.toString()
          )
        )
        .map(s => ({
          serviceId: s.service._id,
          name: s.service.name,
          price: s.price,
          priceType: s.priceType,
          maxPersons: s.service.maxPersons || 1,
          policies: s.service.policies || []
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

      // ✅ property nightly + services one-time
      finalAmount = (basePrice * nights) + servicesTotal;
    }

    /* =================================================
       COUPON LOGIC
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

//     const totalGuests = Number(children) + Number(adults);
//     const dates = getDatesBetween(checkIn, checkOut);

//     let property = null;
//     let selectedPolicy = null;
//     let policySnapshot = null;
//     let providerBreakdown = [];

//     /* =================================================
//        ❌ BLOCK INVALID SERVICE COMBINATION
//     ================================================= */

//     if (bookingType === "SERVICE" && propertyId) {
//       return res.status(400).send({
//         message: "SERVICE booking should not have property"
//       });
//     }

//     /* =================================================
//        PROPERTY VALIDATION + POLICY
//     ================================================= */

//     if (["PROPERTY", "PACKAGE", "PROPERTY_SERVICE"].includes(bookingType)) {

//       property = await Properties.findById(propertyId)
//         .populate("cancellationPolicy")
//         .select("maxGuests category user cancellationPolicy");

//       if (!property) {
//         return res.status(404).send({ message: "Property not found" });
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
//        SERVICE VALIDATION + POLICY
//     ================================================= */

//     let servicesData = [];

//     if (services.length > 0) {

//       const serviceIds = services.map(s => s.service);

//       servicesData = await Service.find({
//         _id: { $in: serviceIds }
//       }).populate("cancellationPolicy");

//       if (servicesData.length !== services.length) {
//         return res.status(400).send({
//           message: "Some services not found"
//         });
//       }

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
//        🔥 SELECT POLICY (IMPORTANT)
//     ================================================= */

//     let policies = [];

//     if (property?.cancellationPolicy) {
//       policies.push(property.cancellationPolicy);
//     }

//     servicesData.forEach(s => {
//       if (s.cancellationPolicy) {
//         policies.push(s.cancellationPolicy);
//       }
//     });

//     if (policies.length > 0) {
//       // 👉 choose STRICTEST (lowest refund rule)
//       selectedPolicy = policies[0]; // simple for now (can improve later)

//       policySnapshot = {
//         name: selectedPolicy.name,
//         rules: selectedPolicy.rules,
//         cancellationFee: selectedPolicy.cancellationFee || 0
//       };
//     }

//     /* =================================================
//        PRICE CALCULATION
//     ================================================= */

//     let baseAmount = Number(priceDetails.finalAmount);

//     const platformFeeRule = await PlatformFee.findOne({
//       isActive: true,
//       isDeleted: false
//     });

//     let platformFee = 0;

//     if (platformFeeRule) {
//       platformFee = platformFeeRule.feeType === "PERCENTAGE"
//         ? (baseAmount * platformFeeRule.value) / 100
//         : platformFeeRule.value;
//     }

//     const subTotal = baseAmount + platformFee;

//     const taxRule = await Tax.findOne({
//       isActive: true,
//       isDeleted: false
//     });

//     const tax = taxRule ? (subTotal * taxRule.percentage) / 100 : 0;

//     const totalAmount = subTotal + tax;

//     /* =================================================
//        COMMISSION
//     ================================================= */

//     let commissionRule = await Commission.findOne({
//       scope: "CATEGORY",
//       categoryId: property?.category,
//       isActive: true,
//       isDeleted: false
//     }) || await Commission.findOne({
//       scope: "GLOBAL",
//       isActive: true,
//       isDeleted: false
//     });

//     let commissionAmount = 0;

//     if (commissionRule) {
//       commissionAmount = commissionRule.commissionType === "PERCENTAGE"
//         ? (baseAmount * commissionRule.value) / 100
//         : commissionRule.value;
//     }

//     const providerAmount = baseAmount - commissionAmount;

//     /* =================================================
//        🔥 PROVIDER BREAKDOWN
//     ================================================= */

//     let serviceTotal = 0;

//     for (const s of servicesData) {
//       const item = services.find(x => x.service.toString() === s._id.toString());
//       serviceTotal += item.price;
//     }

//     const propertyAmount = baseAmount - serviceTotal;

//     if (property && propertyAmount > 0) {
//       providerBreakdown.push({
//         user: property.user,
//         amount: propertyAmount,
//         type: "property",
//         referenceId: property._id
//       });
//     }

//     servicesData.forEach(s => {
//       const item = services.find(x => x.service.toString() === s._id.toString());

//       providerBreakdown.push({
//         user: s.user,
//         amount: item.price,
//         type: "service",
//         referenceId: s._id
//       });
//     });

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

//       property: bookingType === "SERVICE" ? null : propertyId,
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

//       /* 🔥 POLICY */
//       cancellationPolicy: selectedPolicy?._id || null,
//       policySnapshot,

//       /* 🔥 PROVIDERS */
//       providerBreakdown,

//       orderId,

//       paymentStatus: "pending",
//       bookingStatus: "pending",
//       pendingReason: "payment_pending"
//     });

//     return res.status(201).send({
//       message: "Booking created successfully",
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

    const totalGuests = Number(children) + Number(adults);

    const dates = getDatesBetween(checkIn, checkOut);

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
       PROPERTY VALIDATION + POLICY
    ================================================= */

    if (
      ["PROPERTY", "PACKAGE", "PROPERTY_SERVICE"]
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
          message: "Selected dates are not available"
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
        _id: { $in: serviceIds }
      }).populate("cancellationPolicy");

      if (servicesData.length !== services.length) {
        return res.status(400).send({
          message: "Some services not found"
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
          message: "Some services are not available"
        });
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

      // 👉 choose strictest later if needed
      selectedPolicy = policies[0];

      policySnapshot = {
        name: selectedPolicy.name,
        rules: selectedPolicy.rules,
        cancellationFee:
          selectedPolicy.cancellationFee || 0,

        // ✅ NEW SERVICE POLICIES
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

    // ⚠️ currently frontend controlled
    // recommended later: calculate on backend
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

    const subTotal = baseAmount + platformFee;

    const taxRule = await Tax.findOne({
      isActive: true,
      isDeleted: false
    });

    const tax = taxRule
      ? (subTotal * taxRule.percentage) / 100
      : 0;

    const totalAmount = subTotal + tax;

    /* =================================================
       COMMISSION
    ================================================= */

    let commissionRule =
      await Commission.findOne({
        scope: "CATEGORY",
        categoryId: property?.category,
        isActive: true,
        isDeleted: false
      }) ||

      await Commission.findOne({
        scope: "GLOBAL",
        isActive: true,
        isDeleted: false
      });

    let commissionAmount = 0;

    if (commissionRule) {

      commissionAmount =
        commissionRule.commissionType === "PERCENTAGE"
          ? (baseAmount * commissionRule.value) / 100
          : commissionRule.value;
    }

    const providerAmount =
      baseAmount - commissionAmount;

    /* =================================================
       🔥 PROVIDER BREAKDOWN
    ================================================= */

    let serviceTotal = 0;

    for (const s of servicesData) {

      const item = services.find(
        x => x.service.toString() === s._id.toString()
      );

      serviceTotal += item.price;
    }

    const propertyAmount =
      baseAmount - serviceTotal;

    if (property && propertyAmount > 0) {

      providerBreakdown.push({
        user: property.user,
        amount: propertyAmount,
        type: "property",
        referenceId: property._id
      });
    }

    servicesData.forEach(s => {

      const item = services.find(
        x => x.service.toString() === s._id.toString()
      );

      providerBreakdown.push({
        user: s.user,
        amount: item.price,
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
          priceDetails.basePrice,

        packagePrice:
          bookingType === "PACKAGE"
            ? priceDetails.basePrice
            : 0,

        servicePrice:
          priceDetails.servicesTotal
      },

      totalAmount,

      commissionAmount,

      providerAmount,

      platformFee,

      tax,

      /* 🔥 POLICY */

      cancellationPolicy:
        selectedPolicy?._id || null,

      policySnapshot,

      /* 🔥 PROVIDERS */

      providerBreakdown,

      orderId,

      paymentStatus: "pending",

      bookingStatus: "pending",

      pendingReason: "payment_pending"
    });

    return res.status(201).send({
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
    .populate("services.service", "name price media policies maxPersons")
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

      for (const provider of booking.providerBreakdown) {

        const ratio =
          provider.amount /
          booking.totalAmount;

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
            "Admin override refund deducted",

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
            "Booking cancelled with admin refund",

          type: "BOOKING",

          referenceId: booking._id,

          referenceType: "Booking",

          data: {
            bookingId:
              booking._id.toString(),

            refundAmount:
              Number(refundAmount),

            reason,
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

    if (booking.refundTransactionId) {
      return res.status(400).send({
        message: "Refund already processed",
      });
    }

    const now = new Date();

    // ✅ service booking should use current date
    // property booking uses checkIn

    const bookingStartDate =
      booking.bookingType === "SERVICE"
        ? new Date(booking.createdAt)
        : new Date(booking.checkIn);

    /* =============================
       ❌ NO PAYMENT CASE
    ============================== */

    if (booking.paymentStatus !== "paid") {

      booking.bookingStatus = "cancelled";
      booking.isCancelled = true;

      await booking.save();

      // 🔔 USER
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
        message: "Booking cancelled (no payment)",
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

      await booking.save();

      // 🔔 USER
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
        message: "Cancelled (no refund available)",
        refundAmount: 0,
      });
    }

    /* =============================
       🔥 CALCULATE REFUND
    ============================== */

    let refundPercentage = 0;

    let refundAmount = 0;

    const isOverride =
      booking.adminOverride?.isOverridden;

    if (isOverride) {

      refundAmount =
        booking.adminOverride.refundAmount;

    } else {

      const rules =
        booking.policySnapshot?.rules || [];

      // ✅ service booking uses hours from creation
      // property booking uses checkIn

      const diffHours =
        (bookingStartDate - now) /
        (1000 * 60 * 60);

      for (const rule of rules) {

        const value =
          rule.unit === "days"
            ? diffHours / 24
            : diffHours;

        if (value >= rule.from) {
          refundPercentage =
            rule.refundPercentage;
          break;
        }
      }

      refundAmount =
        (booking.totalAmount *
          refundPercentage) / 100;

      const cancellationFee =
        booking.policySnapshot
          ?.cancellationFee || 0;

      refundAmount = Math.max(
        refundAmount - cancellationFee,
        0
      );
    }

    /* =============================
       💰 WALLET HOLD DEDUCTION
    ============================== */

    if (
      booking.providerBreakdown?.length > 0
    ) {

      for (const provider of booking.providerBreakdown) {

        let providerRefund = 0;

        if (isOverride) {

          const ratio =
            provider.amount /
            booking.totalAmount;

          providerRefund =
            refundAmount * ratio;

        } else {

          providerRefund =
            provider.amount *
            (refundPercentage / 100);
        }

        const wallet = await Wallet.findOne({
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
            "Refund deducted from hold",

          transactionType: "refund",
        });
      }
    }

    /* =============================
       💳 TAP REFUND
    ============================== */

    try {

      if (
        refundAmount > 0 &&
        booking.tapChargeId
      ) {

        const response = await axios.post(
          "https://api.tap.company/v2/refunds",
          {
            charge_id: booking.tapChargeId,
            amount: refundAmount,
            currency: "SAR",
            reason:
              "Booking cancellation refund",
            reference: {
              merchant: booking.orderId,
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
       RELEASE AVAILABILITY
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

    booking.bookingStatus = "cancelled";

    booking.isCancelled = true;

    booking.cancellationDate =
      new Date();

    booking.refundAmount =
      refundAmount;

    booking.refundPercentage =
      isOverride
        ? null
        : refundPercentage;

    booking.refundStatus =
      "processed";

    await booking.save();

    /* =============================
       🔔 NOTIFICATIONS
    ============================== */

    const cancelData = {

      bookingId:
        booking._id.toString(),

      totalAmount:
        booking.totalAmount,

      refundAmount,

      refundPercentage,

      bookingStatus:
        booking.bookingStatus,

      checkIn:
        booking.checkIn,

      checkOut:
        booking.checkOut,
    };

    // 👤 USER

    await sendNotification({

      receiverId: booking.user,

      receiverModel: "User",

      title: "Booking Cancelled ❌",

      body:
        `Refund Amount: ${refundAmount}`,

      type: "REFUND",

      referenceId: booking._id,

      referenceType: "Booking",

      data: cancelData,
    });

    // 🧑‍🔧 PROVIDERS

    if (
      booking.providerBreakdown?.length > 0
    ) {

      for (const provider of booking.providerBreakdown) {

        await sendNotification({

          receiverId: provider.user,

          receiverModel: "ServiceUser",

          title: "Booking Cancelled ❌",

          body:
            "A booking has been cancelled",

          type: "BOOKING",

          referenceId: booking._id,

          referenceType: "Booking",

          data: {
            bookingId:
              booking._id.toString(),
            refundAmount,
          },
        });
      }
    }

    return res.send({
      message:
        "Booking cancelled successfully",
      refundAmount,
      refundPercentage:
        isOverride
          ? null
          : refundPercentage,
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