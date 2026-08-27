const ServiceAvailability = require("../models/ServiceAvailability");

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(mins) {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  const hStr = String(hours).padStart(2, "0");
  const mStr = String(minutes).padStart(2, "0");
  return `${hStr}:${mStr}`;
}

function generateServiceSlots(service, dateString) {
  const dateObj = new Date(dateString);
  const requestedDay = dateObj.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });

  const duration = service.duration || 60; // default 60 minutes
  const slots = [];

  let dayConfig = null;
  if (service.schedule && Array.isArray(service.schedule)) {
    dayConfig = service.schedule.find(s => s.day === requestedDay && s.enabled);
  }

  if (dayConfig && dayConfig.slots && dayConfig.slots.length > 0) {
    for (const win of dayConfig.slots) {
      const startMins = timeToMinutes(win.start);
      const endMins = timeToMinutes(win.end);

      let current = startMins;
      let generatedCount = 0;
      while (current + duration <= endMins) {
        slots.push({
          startTime: minutesToTime(current),
          endTime: minutesToTime(current + duration)
        });
        current += duration;
        generatedCount++;
      }

      if (generatedCount === 0 && startMins < endMins) {
        slots.push({
          startTime: win.start,
          endTime: win.end
        });
      }
    }
  }

  return slots;
}

async function getAvailableSlots(service, dateString) {
  const allSlots = generateServiceSlots(service, dateString);
  if (allSlots.length === 0) return [];

  const now = new Date();

  // Format today's date in local server timezone (YYYY-MM-DD)
  const localYear = now.getFullYear();
  const localMonth = String(now.getMonth() + 1).padStart(2, "0");
  const localDay = String(now.getDate()).padStart(2, "0");
  const localToday = `${localYear}-${localMonth}-${localDay}`;

  const queryDateObj = new Date(dateString);
  const queryYear = queryDateObj.getUTCFullYear();
  const queryMonth = String(queryDateObj.getUTCMonth() + 1).padStart(2, "0");
  const queryDay = String(queryDateObj.getUTCDate()).padStart(2, "0");
  const queryDateStr = `${queryYear}-${queryMonth}-${queryDay}`;

  // If the query date is in the past, return empty slots
  if (queryDateStr < localToday) {
    return [];
  }

  const isToday = queryDateStr === localToday;
  let currentMinsSinceMidnight = 0;

  if (isToday) {
    currentMinsSinceMidnight = now.getHours() * 60 + now.getMinutes();
  }

  const startOfDay = new Date(dateString);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const bookedAvailability = await ServiceAvailability.find({
    service: service._id,
    date: { $gte: startOfDay, $lte: endOfDay },
    isBooked: true
  });

  const availableSlots = allSlots.filter(slot => {
    const slotStart = timeToMinutes(slot.startTime);
    const slotEnd = timeToMinutes(slot.endTime);

    // Filter out slots that have already passed today
    if (isToday && slotStart <= currentMinsSinceMidnight) {
      return false;
    }

    const isBooked = bookedAvailability.some(booked => {
      const bookedStart = timeToMinutes(booked.startTime);
      const bookedEnd = timeToMinutes(booked.endTime);

      return (slotStart < bookedEnd) && (slotEnd > bookedStart);
    });

    return !isBooked;
  });

  return availableSlots;
}

async function validateServiceSlot(service, dateString, startTime, endTime) {
  const requestedStart = timeToMinutes(startTime);
  const requestedEnd = timeToMinutes(endTime);

  if (requestedStart >= requestedEnd) {
    return { valid: false, message: "Start time must be before end time" };
  }

  const now = new Date();

  // Format today's date in local server timezone (YYYY-MM-DD)
  const localYear = now.getFullYear();
  const localMonth = String(now.getMonth() + 1).padStart(2, "0");
  const localDay = String(now.getDate()).padStart(2, "0");
  const localToday = `${localYear}-${localMonth}-${localDay}`;

  const queryDateObj = new Date(dateString);
  const queryYear = queryDateObj.getUTCFullYear();
  const queryMonth = String(queryDateObj.getUTCMonth() + 1).padStart(2, "0");
  const queryDay = String(queryDateObj.getUTCDate()).padStart(2, "0");
  const queryDateStr = `${queryYear}-${queryMonth}-${queryDay}`;

  // Check if date is in the past
  if (queryDateStr < localToday) {
    return { valid: false, message: "Cannot book a date in the past" };
  }

  // Check if requested time is in the past today
  if (queryDateStr === localToday) {
    const currentMinsSinceMidnight = now.getHours() * 60 + now.getMinutes();

    if (requestedStart <= currentMinsSinceMidnight) {
      return { valid: false, message: "Requested time slot has already passed" };
    }
  }

  const dateObj = new Date(dateString);
  const requestedDay = dateObj.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });


  let dayConfig = null;
  if (service.schedule && Array.isArray(service.schedule)) {
    dayConfig = service.schedule.find(s => s.day === requestedDay && s.enabled);
  }

  if (!dayConfig) {
    return { valid: false, message: `${service.name} is not working on ${requestedDay}` };
  }

  let fitsInWindow = false;
  if (dayConfig.slots && dayConfig.slots.length > 0) {
    for (const win of dayConfig.slots) {
      const winStart = timeToMinutes(win.start);
      const winEnd = timeToMinutes(win.end);
      if (requestedStart >= winStart && requestedEnd <= winEnd) {
        fitsInWindow = true;
        break;
      }
    }
  }

  if (!fitsInWindow) {
    return { valid: false, message: "Requested time is outside service working hours" };
  }

  const startOfDay = new Date(dateString);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const bookedAvailability = await ServiceAvailability.find({
    service: service._id,
    date: { $gte: startOfDay, $lte: endOfDay },
    isBooked: true
  });

  const isOverlapping = bookedAvailability.some(booked => {
    const bookedStart = timeToMinutes(booked.startTime);
    const bookedEnd = timeToMinutes(booked.endTime);
    return (requestedStart < bookedEnd) && (requestedEnd > bookedStart);
  });

  if (isOverlapping) {
    return { valid: false, message: "Requested slot is already booked" };
  }

  return { valid: true };
}

async function reserveServiceSlots(bookingId, servicesWithSchedule) {
  const serviceAvailabilityDocs = [];

  for (const item of servicesWithSchedule) {
    const serviceId = item.service._id || item.service;
    const date = new Date(item.serviceDate);
    date.setUTCHours(0, 0, 0, 0);

    serviceAvailabilityDocs.push({
      service: serviceId,
      date,
      startTime: item.serviceStartTime,
      endTime: item.serviceEndTime,
      booking: bookingId,
      isBooked: true
    });
  }

  if (serviceAvailabilityDocs.length > 0) {
    try {
      await ServiceAvailability.insertMany(serviceAvailabilityDocs);
    } catch (err) {
      if (err.code === 11000) {
        throw new Error("Requested slot is already booked");
      }
      throw err;
    }
  }
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  generateServiceSlots,
  getAvailableSlots,
  validateServiceSlot,
  reserveServiceSlots
};
