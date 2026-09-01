const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const Booking = require("../models/Booking");

// Brand color from 0xFF7A0404
const BRAND_COLOR = "#7A0404";

const translations = {
  en: {
    invoice: "INVOICE",
    invoiceNo: "Invoice No",
    date: "Date",
    paid: "PAID",
    billTo: "Bill To (Guest)",
    serviceProvider: "Service Provider (Host)",
    bookingId: "Booking ID",
    type: "Type",
    stay: "Stay",
    description: "Description",
    schedule: "Schedule / Date",
    totalPrice: "Total Price",
    property: "Property",
    package: "Package",
    service: "Service",
    nights: "Night(s)",
    subtotal: "Subtotal",
    tax: "Tax",
    platformFee: "Platform Fee",
    totalPaid: "Total Paid",
    thankYou: "Thank you for booking with OutApp! We wish you a safe and wonderful journey.",
    email: "Email",
    phone: "Phone",
  },
  ar: {
    invoice: "فاتورة",
    invoiceNo: "رقم الفاتورة",
    date: "التاريخ",
    paid: "مدفوع",
    billTo: "فاتورة إلى الضيف",
    serviceProvider: "مقدم الخدمة",
    bookingId: "رقم الحجز",
    type: "النوع",
    stay: "الإقامة",
    description: "الوصف",
    schedule: "الجدول / التاريخ",
    totalPrice: "السعر الإجمالي",
    property: "العقار",
    package: "الباقة",
    service: "الخدمة",
    nights: "ليلة/ليالي",
    subtotal: "المجموع الفرعي",
    tax: "الضريبة",
    platformFee: "رسوم المنصة",
    totalPaid: "إجمالي المدفوع",
    thankYou: "شكرًا لحجزك معنا! نتمنى لك رحلة آمنة وممتعة.",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
  },
};

/**
 * Generate both English and Arabic invoices
 * Returns: { en: "/uploads/invoices/invoice_xxx_en.pdf", ar: "/uploads/invoices/invoice_xxx_ar.pdf" }
 */
const generateInvoicePDF = async (bookingId) => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate("user", "firstName lastName email phone")
      .populate({
        path: "property",
        select: "name address price user",
        populate: {
          path: "user",
          model: "ServiceUser",
          select: "firstName lastName email phone legalFullNameEn",
        },
      })
      .populate({
        path: "services.service",
        select: "name price user",
        populate: {
          path: "user",
          model: "ServiceUser",
          select: "firstName lastName email phone legalFullNameEn",
        },
      })
      .populate("package", "name price")
      .populate("couponId");

    if (!booking) {
      console.error(`[Invoice Generator] Booking ${bookingId} not found`);
      return null;
    }

    const invoicesDir = path.join(__dirname, "../uploads/invoices");
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    // Generate both languages
    const enUrl = await createSingleInvoice(booking, "en", invoicesDir);
    const arUrl = await createSingleInvoice(booking, "ar", invoicesDir);

    // Store both URLs on the booking
    await Booking.findByIdAndUpdate(bookingId, {
      invoiceUrl: enUrl,
      invoiceUrlAr: arUrl,
    });

    console.log(`[Invoice Generator] Generated EN + AR invoices for booking ${bookingId}`);
    return { en: enUrl, ar: arUrl };
  } catch (error) {
    console.error(`[Invoice Generator] Error generating invoice PDF for booking ${bookingId}:`, error);
    return null;
  }
};

async function createSingleInvoice(booking, lang, invoicesDir) {
  const isRTL = lang === "ar";
  const t = translations[lang];

  const fileName = `invoice_${booking._id}_${lang}.pdf`;
  const outputPath = path.join(invoicesDir, fileName);
  const invoiceUrl = `/uploads/invoices/${fileName}`;

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  // ========== COLORS ==========
  const primaryColor = "#1F2937";
  const secondaryColor = "#4B5563";
  const lightGray = "#F9FAFB";
  const borderGray = "#E5E7EB";
  const brandColor = BRAND_COLOR; // #7A0404
  const brandLight = "#FDF2F2";
  const white = "#FFFFFF";

  // ========== FONT SETUP ==========
  const arabicFontPath = path.join(__dirname, "../fonts/Amiri-Regular.ttf");
  const arabicBoldPath = path.join(__dirname, "../fonts/Amiri-Bold.ttf");

  let hasArabicFont = false;
  if (isRTL && fs.existsSync(arabicFontPath)) {
    doc.registerFont("Arabic", arabicFontPath);
    if (fs.existsSync(arabicBoldPath)) {
      doc.registerFont("Arabic-Bold", arabicBoldPath);
    }
    hasArabicFont = true;
  }

  const regularFont = isRTL && hasArabicFont ? "Arabic" : "Helvetica";
  const boldFont = isRTL && hasArabicFont ? (fs.existsSync(arabicBoldPath) ? "Arabic-Bold" : "Arabic") : "Helvetica-Bold";

  // ========== HEADER ==========
  const logoPath = path.join(__dirname, "../uploads/logo.png");

  if (!isRTL) {
    // LTR Layout
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 55 });
    } else {
      doc.fillColor(primaryColor).fontSize(22).font(boldFont).text("OutApp", 50, 50);
    }

    doc.fillColor(brandColor).fontSize(22).font(boldFont).text(t.invoice, 350, 50, { align: "right", width: 195 });
    doc.fillColor(secondaryColor).fontSize(9).font(regularFont);
    doc.text(`${t.invoiceNo}: INV-${booking._id.toString().substring(0, 8).toUpperCase()}`, 350, 78, { align: "right", width: 195 });
    doc.text(`${t.date}: ${new Date(booking.createdAt || Date.now()).toLocaleDateString("en-GB")}`, 350, 92, { align: "right", width: 195 });

    // Paid badge
    doc.rect(460, 110, 85, 20).fill(brandLight);
    doc.fillColor(brandColor).fontSize(9).font(boldFont).text(t.paid, 460, 115, { align: "center", width: 85 });
  } else {
    // RTL Layout
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 440, 45, { width: 55 });
    } else {
      doc.fillColor(primaryColor).fontSize(22).font(boldFont).text("OutApp", 440, 50);
    }

    doc.fillColor(brandColor).fontSize(22).font(boldFont).text(t.invoice, 50, 50, { align: "left", width: 250, features: ["arab"] });
    
    // Invoice No & Date in RTL
    doc.fillColor(secondaryColor).fontSize(9);

    doc.font(boldFont).text(`${t.invoiceNo}: `, 50, 78, { width: 65, align: "left", features: ["arab"] });
    doc.font("Helvetica").text(`INV-${booking._id.toString().substring(0, 8).toUpperCase()}`, 115, 78, { width: 120, align: "left" });

    const dateStr = new Date(booking.createdAt || Date.now()).toLocaleDateString("en-GB");
    doc.font(boldFont).text(`${t.date}: `, 50, 92, { width: 45, align: "left", features: ["arab"] });
    doc.font("Helvetica").text(dateStr, 95, 92, { width: 120, align: "left" });

    // Paid badge
    doc.rect(50, 110, 85, 20).fill(brandLight);
    doc.fillColor(brandColor).fontSize(9).font(boldFont).text(t.paid, 50, 115, { align: "center", width: 85, features: ["arab"] });
  }

  doc.moveTo(50, 145).lineTo(545, 145).strokeColor(borderGray).stroke();

  // ========== BILL TO / PROVIDER CARDS ==========
  let provider = null;
  if (booking.property?.user) {
    provider = booking.property.user;
  } else if (booking.services?.length > 0 && booking.services[0].service?.user) {
    provider = booking.services[0].service.user;
  }

  const leftCardX = !isRTL ? 50 : 310;
  const rightCardX = !isRTL ? 310 : 50;

  // Bill To card
  doc.rect(leftCardX, 165, 235, 95).fill(lightGray);
  doc.rect(leftCardX, 165, 235, 95).strokeColor(borderGray).stroke();

  if (!isRTL) {
    doc.fillColor(primaryColor).fontSize(10).font(boldFont).text(t.billTo, leftCardX + 12, 177, { width: 210, align: "left" });
    doc.fillColor(secondaryColor).fontSize(9).font(regularFont);
    if (booking.user) {
      doc.text(`${booking.user.firstName || ""} ${booking.user.lastName || ""}`.trim() || "N/A", leftCardX + 12, 195, { width: 210 });
      doc.text(`${t.email}: ${booking.user.email || "N/A"}`, leftCardX + 12, 210, { width: 210 });
      doc.text(`${t.phone}: ${booking.user.phone || "N/A"}`, leftCardX + 12, 225, { width: 210 });
    } else {
      doc.text("N/A", leftCardX + 12, 195);
    }
  } else {
    doc.fillColor(primaryColor).fontSize(10).font(boldFont).text(t.billTo, leftCardX + 12, 177, { width: 210, align: "right", features: ["arab"] });
    doc.fillColor(secondaryColor).fontSize(9);
    if (booking.user) {
      const userName = `${booking.user.firstName || ""} ${booking.user.lastName || ""}`.trim() || "N/A";
      doc.font(boldFont).text(userName, leftCardX + 12, 195, { width: 210, align: "right", features: ["arab"] });

      // Email
      doc.font(regularFont).text(`${t.email}:`, leftCardX + 130, 210, { width: 92, align: "right", features: ["arab"] });
      doc.font("Helvetica").text(booking.user.email || "N/A", leftCardX + 12, 210, { width: 115, align: "left" });

      // Phone
      doc.font(regularFont).text(`${t.phone}:`, leftCardX + 130, 225, { width: 92, align: "right", features: ["arab"] });
      doc.font("Helvetica").text(booking.user.phone || "N/A", leftCardX + 12, 225, { width: 115, align: "left" });
    } else {
      doc.font(regularFont).text("N/A", leftCardX + 12, 195, { width: 210, align: "right" });
    }
  }

  // Provider card
  doc.rect(rightCardX, 165, 235, 95).fill(lightGray);
  doc.rect(rightCardX, 165, 235, 95).strokeColor(borderGray).stroke();

  if (!isRTL) {
    doc.fillColor(primaryColor).fontSize(10).font(boldFont).text(t.serviceProvider, rightCardX + 12, 177, { width: 210, align: "left" });
    doc.fillColor(secondaryColor).fontSize(9).font(regularFont);
    if (provider) {
      const providerName = provider.legalFullNameEn || `${provider.firstName || ""} ${provider.lastName || ""}`.trim() || "N/A";
      doc.text(providerName, rightCardX + 12, 195, { width: 210 });
      doc.text(`${t.email}: ${provider.email || "N/A"}`, rightCardX + 12, 210, { width: 210 });
      doc.text(`${t.phone}: ${provider.phone || "N/A"}`, rightCardX + 12, 225, { width: 210 });
    } else {
      doc.text("N/A", rightCardX + 12, 195);
    }
  } else {
    doc.fillColor(primaryColor).fontSize(10).font(boldFont).text(t.serviceProvider, rightCardX + 12, 177, { width: 210, align: "right", features: ["arab"] });
    doc.fillColor(secondaryColor).fontSize(9);
    if (provider) {
      const providerName = provider.legalFullNameEn || `${provider.firstName || ""} ${provider.lastName || ""}`.trim() || "N/A";
      doc.font(boldFont).text(providerName, rightCardX + 12, 195, { width: 210, align: "right", features: ["arab"] });

      // Email
      doc.font(regularFont).text(`${t.email}:`, rightCardX + 130, 210, { width: 92, align: "right", features: ["arab"] });
      doc.font("Helvetica").text(provider.email || "N/A", rightCardX + 12, 210, { width: 115, align: "left" });

      // Phone
      doc.font(regularFont).text(`${t.phone}:`, rightCardX + 130, 225, { width: 92, align: "right", features: ["arab"] });
      doc.font("Helvetica").text(provider.phone || "N/A", rightCardX + 12, 225, { width: 115, align: "left" });
    } else {
      doc.font(regularFont).text("N/A", rightCardX + 12, 195, { width: 210, align: "right" });
    }
  }

  // ========== BOOKING METADATA BAR ==========
  let y = 280;
  doc.rect(50, y, 495, 32).fill(lightGray);
  doc.rect(50, y, 495, 32).strokeColor(borderGray).stroke();

  if (!isRTL) {
    doc.fillColor(primaryColor).fontSize(9).font(boldFont);
    doc.text(`${t.bookingId}:`, 60, y + 11);
    doc.font(regularFont).text(`${booking.orderId || booking._id}`, 130, y + 11);

    doc.font(boldFont).text(`${t.type}:`, 280, y + 11);
    doc.font(regularFont).text(`${booking.bookingType || "-"}`, 320, y + 11);

    if (booking.checkIn && booking.checkOut) {
      doc.font(boldFont).text(`${t.stay}:`, 400, y + 11);
      const stayText = `${new Date(booking.checkIn).toLocaleDateString("en-GB")} - ${new Date(booking.checkOut).toLocaleDateString("en-GB")}`;
      doc.font(regularFont).text(stayText, 435, y + 11);
    }
  } else {
    // RTL Metadata bar
    doc.fillColor(primaryColor).fontSize(9);

    // Booking ID
    doc.font(boldFont).text(`${t.bookingId}:`, 460, y + 11, { width: 75, align: "right", features: ["arab"] });
    doc.font("Helvetica").text(`${booking.orderId || booking._id}`, 360, y + 11, { width: 95, align: "right" });

    // Type
    doc.font(boldFont).text(`${t.type}:`, 305, y + 11, { width: 45, align: "right", features: ["arab"] });
    doc.font("Helvetica").text(`${booking.bookingType || "-"}`, 235, y + 11, { width: 65, align: "right" });

    // Stay Date
    if (booking.checkIn && booking.checkOut) {
      doc.font(boldFont).text(`${t.stay}:`, 175, y + 11, { width: 50, align: "right", features: ["arab"] });
      const stayText = `${new Date(booking.checkIn).toLocaleDateString("en-GB")} - ${new Date(booking.checkOut).toLocaleDateString("en-GB")}`;
      doc.font("Helvetica").text(stayText, 55, y + 11, { width: 115, align: "right" });
    }
  }

  // ========== ITEMS TABLE ==========
  y += 50;

  // Header row
  doc.rect(50, y, 495, 24).fill(brandColor);
  doc.fillColor(white).fontSize(9).font(boldFont);

  if (!isRTL) {
    doc.text(t.description, 60, y + 7);
    doc.text(t.schedule, 250, y + 7);
    doc.text(t.totalPrice, 450, y + 7, { align: "right", width: 80 });
  } else {
    doc.text(t.description, 345, y + 7, { width: 190, align: "right", features: ["arab"] });
    doc.text(t.schedule, 175, y + 7, { width: 160, align: "right", features: ["arab"] });
    doc.text(t.totalPrice, 60, y + 7, { width: 105, align: "left", features: ["arab"] });
  }

  y += 24;
  doc.font(regularFont).fontSize(9).fillColor("#374151");

  // Helper to draw a row
  const drawRow = (desc, scheduleStr, priceVal) => {
    y += 12;
    const priceText = `${priceVal.toFixed(2)} SAR`;

    if (!isRTL) {
      doc.font("Helvetica").text(desc, 60, y, { width: 180 });
      doc.font("Helvetica").text(scheduleStr || "", 250, y, { width: 180 });
      doc.font("Helvetica").text(priceText, 450, y, { align: "right", width: 80 });
    } else {
      // Description (Arabic)
      doc.font(regularFont).text(desc, 345, y, { width: 190, align: "right", features: ["arab"] });
      // Schedule (Dates/Times in Helvetica)
      doc.font("Helvetica").text(scheduleStr || "", 175, y, { width: 160, align: "right" });
      // Price (ASCII)
      doc.font("Helvetica").text(priceText, 60, y, { width: 105, align: "left" });
    }
    y += 18;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#F3F4F6").stroke();
  };

  if (booking.property) {
    let nightsText = "";
    if (booking.checkIn && booking.checkOut) {
      const nights = Math.ceil(
        Math.abs(new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24)
      );
      nightsText = `${nights} ${t.nights}`;
    }
    drawRow(
      `${t.property}: ${booking.property.name || ""}`,
      nightsText,
      (booking.priceBreakdown?.propertyPrice || booking.property.price || 0)
    );
  }

  if (booking.package) {
    drawRow(
      `${t.package}: ${booking.package.name || ""}`,
      "",
      (booking.priceBreakdown?.packagePrice || booking.package.price || 0)
    );
  }

  if (booking.services?.length > 0) {
    for (const serviceItem of booking.services) {
      if (serviceItem.service) {
        const dateStr = serviceItem.serviceDate
          ? new Date(serviceItem.serviceDate).toLocaleDateString("en-GB")
          : "";
        const timeStr = serviceItem.serviceStartTime
          ? ` (${serviceItem.serviceStartTime} - ${serviceItem.serviceEndTime})`
          : "";
        drawRow(
          `${t.service}: ${serviceItem.service.name || ""}`,
          `${dateStr}${timeStr}`,
          (serviceItem.price || 0)
        );
      }
    }
  }

  // ========== TOTALS ==========
  y += 15;
  const subtotal = booking.totalAmount - (booking.tax || 0) - (booking.platformFee || 0);

  const totalsBoxX = !isRTL ? 345 : 50;
  doc.rect(totalsBoxX, y, 200, 100).fill(lightGray);
  doc.rect(totalsBoxX, y, 200, 100).strokeColor(borderGray).stroke();

  if (!isRTL) {
    const labelX = totalsBoxX + 15;
    const valueX = totalsBoxX + 115;

    doc.fillColor(secondaryColor).fontSize(9).font(regularFont);
    doc.text(t.subtotal + ":", labelX, y + 15);
    doc.text(`${subtotal.toFixed(2)} SAR`, valueX, y + 15, { align: "right", width: 70 });

    doc.text(t.tax + ":", labelX, y + 33);
    doc.text(`${(booking.tax || 0).toFixed(2)} SAR`, valueX, y + 33, { align: "right", width: 70 });

    doc.text(t.platformFee + ":", labelX, y + 51);
    doc.text(`${(booking.platformFee || 0).toFixed(2)} SAR`, valueX, y + 51, { align: "right", width: 70 });

    doc.moveTo(totalsBoxX + 15, y + 70).lineTo(totalsBoxX + 185, y + 70).strokeColor(borderGray).stroke();

    doc.fillColor(brandColor).font(boldFont).fontSize(11);
    doc.text(t.totalPaid + ":", labelX, y + 80);
    doc.text(`${booking.totalAmount.toFixed(2)} SAR`, valueX, y + 80, { align: "right", width: 70 });
  } else {
    // RTL Totals Box
    const labelX = totalsBoxX + 80;
    const valueX = totalsBoxX + 15;

    doc.fillColor(secondaryColor).fontSize(9);
    doc.font(regularFont).text(t.subtotal + ":", labelX, y + 15, { width: 105, align: "right", features: ["arab"] });
    doc.font("Helvetica").text(`${subtotal.toFixed(2)} SAR`, valueX, y + 15, { width: 60, align: "left" });

    doc.font(regularFont).text(t.tax + ":", labelX, y + 33, { width: 105, align: "right", features: ["arab"] });
    doc.font("Helvetica").text(`${(booking.tax || 0).toFixed(2)} SAR`, valueX, y + 33, { width: 60, align: "left" });

    doc.font(regularFont).text(t.platformFee + ":", labelX, y + 51, { width: 105, align: "right", features: ["arab"] });
    doc.font("Helvetica").text(`${(booking.platformFee || 0).toFixed(2)} SAR`, valueX, y + 51, { width: 60, align: "left" });

    doc.moveTo(totalsBoxX + 15, y + 70).lineTo(totalsBoxX + 185, y + 70).strokeColor(borderGray).stroke();

    doc.fillColor(brandColor).fontSize(11);
    doc.font(boldFont).text(t.totalPaid + ":", labelX, y + 80, { width: 105, align: "right", features: ["arab"] });
    doc.font("Helvetica-Bold").text(`${booking.totalAmount.toFixed(2)} SAR`, valueX, y + 80, { width: 60, align: "left" });
  }

  // ========== FOOTER ==========
  doc.moveTo(50, 740).lineTo(545, 740).strokeColor(borderGray).stroke();

  if (!isRTL) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(secondaryColor)
      .text(t.thankYou, 50, 755, { align: "center", width: 495 });
  } else {
    doc.font(regularFont).fontSize(9).fillColor(secondaryColor)
      .text(t.thankYou, 50, 755, { align: "center", width: 495, features: ["arab"] });
  }

  doc.end();

  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  return invoiceUrl;
}

module.exports = { generateInvoicePDF };
