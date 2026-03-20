const { truncatechars } = require("humanize");
const mongoose = require("mongoose");

const serviceCategorySchema = new mongoose.Schema({
    name: String,
    icon: String,
    isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model("ServiceCategory", serviceCategorySchema);