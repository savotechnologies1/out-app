const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const Booking = require("../models/Booking");

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
          select: "firstName lastName email phone legalFullNameEn"
        }
      })
      .populate({
        path: "services.service",
        select: "name price user",
        populate: {
          path: "user",
          model: "ServiceUser",
          select: "firstName lastName email phone legalFullNameEn"
        }
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

    const fileName = `invoice_${booking._id}.pdf`;
    const outputPath = path.join(invoicesDir, fileName);
    const invoiceUrl = `/uploads/invoices/${fileName}`;

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Colors
    const primaryColor = "#1F2937"; // Dark slate
    const secondaryColor = "#4B5563"; // Medium gray
    const lightGray = "#F9FAFB";
    const borderGray = "#F3F4F6";
    const accentColor = "#10B981"; // Emerald green
    const textAccentColor = "#065F46";
    const bgAccentColor = "#D1FAE5";

    // --- HEADER ---
    const logoPath = path.join(__dirname, "../uploads/logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 55 });
    } else {
      doc.fillColor(primaryColor).fontSize(22).font("Helvetica-Bold").text("OutApp", 50, 50);
    }

    // Title & Invoice Metadata
    doc.fillColor(primaryColor).fontSize(20).font("Helvetica-Bold").text("INVOICE", 400, 50, { align: "right" });
    doc.fillColor(secondaryColor).fontSize(9).font("Helvetica");
    doc.text(`Invoice No: INV-${booking._id.toString().substring(0, 8).toUpperCase()}`, 400, 75, { align: "right" });
    doc.text(`Date: ${new Date(booking.createdAt || Date.now()).toLocaleDateString()}`, 400, 88, { align: "right" });

    // Paid Badge
    doc.rect(460, 103, 85, 18).fill(bgAccentColor);
    doc.fillColor(textAccentColor).fontSize(8).font("Helvetica-Bold").text("PAID", 460, 108, { align: "center", width: 85 });

    doc.moveTo(50, 135).lineTo(545, 135).strokeColor("#E5E7EB").stroke();

    // --- BILL TO / SERVICE PROVIDER CARDS ---
    // Resolve provider info
    let provider = null;
    if (booking.property && booking.property.user) {
      provider = booking.property.user;
    } else if (booking.services && booking.services.length > 0 && booking.services[0].service && booking.services[0].service.user) {
      provider = booking.services[0].service.user;
    }

    // Client card
    doc.rect(50, 155, 235, 90).fill(lightGray);
    doc.rect(50, 155, 235, 90).strokeColor(borderGray).stroke();
    doc.fillColor(primaryColor).fontSize(10).font("Helvetica-Bold").text("Bill To (Guest)", 62, 167);
    doc.fillColor(secondaryColor).fontSize(9).font("Helvetica");
    if (booking.user) {
      doc.text(`${booking.user.firstName || ""} ${booking.user.lastName || ""}`, 62, 184);
      doc.text(`Email: ${booking.user.email || "N/A"}`, 62, 198);
      doc.text(`Phone: ${booking.user.phone || "N/A"}`, 62, 212);
    } else {
      doc.text("N/A", 62, 184);
    }

    // Provider card
    doc.rect(310, 155, 235, 90).fill(lightGray);
    doc.rect(310, 155, 235, 90).strokeColor(borderGray).stroke();
    doc.fillColor(primaryColor).fontSize(10).font("Helvetica-Bold").text("Service Provider (Host)", 322, 167);
    doc.fillColor(secondaryColor).fontSize(9).font("Helvetica");
    if (provider) {
      const providerName = provider.legalFullNameEn || `${provider.firstName || ""} ${provider.lastName || ""}`.trim() || "N/A";
      doc.text(providerName, 322, 184);
      doc.text(`Email: ${provider.email || "N/A"}`, 322, 198);
      doc.text(`Phone: ${provider.phone || "N/A"}`, 322, 212);
    } else {
      doc.text("N/A", 322, 184);
    }

    // --- BOOKING METADATA BAR ---
    let y = 265;
    doc.rect(50, y, 495, 30).fill(lightGray);
    doc.rect(50, y, 495, 30).strokeColor(borderGray).stroke();
    doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold");
    doc.text(`Booking ID:`, 60, y + 10);
    doc.font("Helvetica").text(`${booking.orderId}`, 120, y + 10);

    doc.font("Helvetica-Bold").text(`Type:`, 305, y + 10);
    doc.font("Helvetica").text(`${booking.bookingType}`, 335, y + 10);

    if (booking.checkIn && booking.checkOut) {
      doc.font("Helvetica-Bold").text(`Stay:`, 405, y + 10);
      doc.font("Helvetica").text(`${new Date(booking.checkIn).toLocaleDateString()} - ${new Date(booking.checkOut).toLocaleDateString()}`, 435, y + 10);
    }

    // --- ITEMS TABLE ---
    y += 45;
    doc.rect(50, y, 495, 22).fill("#1F2937");
    doc.fillColor("#FFFFFF").fontSize(9).font("Helvetica-Bold");
    doc.text("Description", 60, y + 6);
    doc.text("Schedule / Date", 250, y + 6);
    doc.text("Total Price", 450, y + 6, { align: "right", width: 80 });
    y += 22;

    doc.font("Helvetica").fontSize(9).fillColor("#374151");

    if (booking.property) {
      y += 10;
      doc.text(`Property: ${booking.property.name}`, 60, y);
      if (booking.checkIn && booking.checkOut) {
        const nights = Math.ceil(Math.abs(new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24));
        doc.text(`${nights} Night(s)`, 250, y);
      }
      doc.text(`${booking.priceBreakdown?.propertyPrice || booking.property.price || 0} SAR`, 450, y, { align: "right", width: 80 });
      y += 20;
      doc.moveTo(50, y).lineTo(545, y).strokeColor("#F3F4F6").stroke();
      y += 5;
    }

    if (booking.package) {
      y += 10;
      doc.text(`Package: ${booking.package.name}`, 60, y);
      doc.text(`${booking.priceBreakdown?.packagePrice || booking.package.price || 0} SAR`, 450, y, { align: "right", width: 80 });
      y += 20;
      doc.moveTo(50, y).lineTo(545, y).strokeColor("#F3F4F6").stroke();
      y += 5;
    }

    if (booking.services && booking.services.length > 0) {
      for (const serviceItem of booking.services) {
        if (serviceItem.service) {
          y += 10;
          doc.text(`Service: ${serviceItem.service.name}`, 60, y);
          const dateStr = serviceItem.serviceDate ? new Date(serviceItem.serviceDate).toLocaleDateString() : "";
          const timeStr = serviceItem.serviceStartTime ? ` (${serviceItem.serviceStartTime} - ${serviceItem.serviceEndTime})` : "";
          doc.text(`${dateStr}${timeStr}`, 250, y);
          doc.text(`${serviceItem.price} SAR`, 450, y, { align: "right", width: 80 });
          y += 20;
          doc.moveTo(50, y).lineTo(545, y).strokeColor("#F3F4F6").stroke();
          y += 5;
        }
      }
    }

    // --- TOTALS SECTION ---
    y += 10;
    const subtotal = booking.totalAmount - (booking.tax || 0) - (booking.platformFee || 0);

    doc.rect(345, y, 200, 95).fill(lightGray);
    doc.rect(345, y, 200, 95).strokeColor(borderGray).stroke();

    doc.fillColor(secondaryColor).fontSize(9);
    doc.text("Subtotal:", 360, y + 15);
    doc.text(`${subtotal.toFixed(2)} SAR`, 460, y + 15, { align: "right", width: 70 });

    doc.text("Tax:", 360, y + 32);
    doc.text(`${(booking.tax || 0).toFixed(2)} SAR`, 460, y + 32, { align: "right", width: 70 });

    doc.text("Platform Fee:", 360, y + 49);
    doc.text(`${(booking.platformFee || 0).toFixed(2)} SAR`, 460, y + 49, { align: "right", width: 70 });

    doc.moveTo(360, y + 66).lineTo(530, y + 66).strokeColor("#E5E7EB").stroke();

    doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(10);
    doc.text("Total Paid:", 360, y + 74);
    doc.text(`${booking.totalAmount.toFixed(2)} SAR`, 460, y + 74, { align: "right", width: 70 });

    // --- FOOTER ---
    doc.moveTo(50, 720).lineTo(545, 720).strokeColor("#E5E7EB").stroke();
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(secondaryColor)
      .text("Thank you for booking with OutApp! We wish you a safe and wonderful journey.", 50, 740, { align: "center" });

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    console.log(`[Invoice Generator] Generated invoice PDF for booking ${bookingId}`);

    // Update booking model with invoice URL
    await Booking.findByIdAndUpdate(bookingId, { invoiceUrl });
    return invoiceUrl;
  } catch (error) {
    console.error(`[Invoice Generator] Error generating invoice PDF for booking ${bookingId}:`, error);
    return null;
  }
};

module.exports = { generateInvoicePDF };
