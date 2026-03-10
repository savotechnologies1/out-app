// const mongoose = require("mongoose");

// const availabilitySchema = new mongoose.Schema({
//     hotel: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Hotel",
//         required: true
//     },
//     date: {
//         type: Date,
//         required: true
//     },
//     isBooked: {
//         type: Boolean,
//         default: false
//     }
// });

// availabilitySchema.index({ hotel: 1, date: 1 }, { unique: true });

// module.exports = mongoose.model("HotelAvailability", availabilitySchema);


const mongoose = require("mongoose");
const availabilitySchema = new mongoose.Schema({

  hotel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Properties",
    required: true
  },

  date: {
    type: Date,
    required: true
  },

  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking"
  },

  isBooked: {
    type: Boolean,
    default: false
  }

});

availabilitySchema.index({ hotel: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("HotelAvailability", availabilitySchema);