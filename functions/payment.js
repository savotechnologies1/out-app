
require("dotenv").config()
const axios = require("axios");

module.exports.createCharge = async (data) => {
    try {

        const response = await axios.post(
            `${process.env.PAYMENT_URL}/charges`,
            {
                amount: Number(data.amount),
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
                source: { id: data.tokenId },
                post: {
                    url: 'https://webhook.site/182ba6ca-b40b-4a36-868d-00a07ad899f2'
                },
                redirect: {
                    url: `myapp://payment-success?orderId=1234`
                }

            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.SECRET_KEY}`,
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

module.exports.createTokenForCard = async (data) => {
    try {
        const response = await axios.post(
            `${process.env.PAYMENT_URL}/tokens`,
            {
                card: {
                    number: data.cardNumber,
                    exp_month: data.expMonth,
                    exp_year: data.expYear,
                    cvc: data.cvc,
                },
                client_ip: '192.168.1.20'
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.SECRET_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log(response.data);

        return response.data.token.id;

    } catch (error) {
        console.error(error.response?.data || error.message);
        throw error;
    }
}