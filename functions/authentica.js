const axios = require("axios");
require("dotenv").config();

module.exports.authenticaOTP = async (OTP, email, phone) => {
    try {

        const response = await axios.post(
            "https://api.authentica.sa/api/v2/send-otp",
            {
                method: "whatsapp",
                phone: phone,
                template_id: 1,
                fallback_email: email,
                otp: OTP,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "X-Authorization": process.env.API_AUTHENTICA,
                },
            }
        );

        if (response.status !== 200) {
            throw new Error("Failed to send OTP");
        }

        return OTP;

    } catch (error) {
        console.log("Error:", error.response?.data || error.message);
        throw error;
    }
};