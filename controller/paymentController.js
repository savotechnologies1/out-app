
const { paymentWebhookFunc } = require('../functions/payment')

const paymentWebHook = async (req, res) => {
    try {


        return res.status(payment.status).send({
            data: payment?.data,
            message: "webhooks ok",
        });
    } catch (error) {
        APIErrorLog.error("Error while webhook request");
        APIErrorLog.error(error);
        return res.status(500).send({ message: error.message });
    }
};

module.exports = {
    paymentWebHook
}