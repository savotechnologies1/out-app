
require("dotenv").config()
const axios = require("axios");

module.exports.createTokenAndCharge = async () => {
    try {

        const response = await axios.post(
            "https://api.tap.company/v2/charges",
            {
                amount: 1,
                currency: "SAR",
                customer_initiated: true,
                threeDSecure: true,
                save_card: false,
                description: "Test Description",
                metadata: { udf1: "Metadata 1" },
                receipt: { email: false, sms: false },
                reference: { transaction: "txn_01", order: "ord_01" },
                customer: {
                    first_name: "test",
                    middle_name: "test",
                    last_name: "test",
                    email: "test@test.com",
                    phone: { country_code: 965, number: 51234567 }
                },
                merchant: { id: process.env.PAYMENT_MERCHANT_ID },
                source: { id: "src_all" },
                post: {
                    url: 'http://your_website.com/post_url'
                },
                redirect: {
                    url: `myapp://payment-success?orderId=1234`
                }

            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYMENT_SECRET_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return response.data.transaction.url;

    } catch (error) {
        console.error(error.response?.data || error.message);
        throw error;
    }
};