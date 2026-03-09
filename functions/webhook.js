

module.exports.paymentWebhookFunc = (body, signature, endpointSecret) => {
    return new Promise(async function (resolve, reject) {
        try {
            const event = await stripe.webhooks.constructEvent(body, signature, endpointSecret);
            const eventTypeObj = {
                "customer.subscription.paused": event.data.object,
                "customer.subscription.resumed": event.data.object,
                "customer.subscription.updated": event.data.object,
                "customer.subscription.deleted": event.data.object,
                "invoice.paid": event.data.object,
                "invoice.payment_failed": event.data.object,
                "invoice.payment_succeeded": event.data.object,
                "charge.refunded": event.data.object,
                "refund.updated": event.data.object,
                "invoice.created": event.data.object,
                "invoice.updated": event.data.object,
                "subscription_schedule.expiring": event.data.object,
                "charge.refund.updated": event.data.object,
            };

            if (!eventTypeObj.hasOwnProperty(event.type)) {
                return resolve({
                    status: 400,
                    message: `Unhandled event type ${event.type} `,
                });
            }

            const eventData = event?.data?.object;

            if (event.type === "customer.subscription.deleted") {

                const subscribePayment = await Payment.findOne({ subscribeId: eventData.id, isDeleted: false, paymentFor: "artist-subscription" }).lean(true);

                if (subscribePayment && eventData.cancel_at_period_end) {

                    await Promise.all([
                        stripe.subscriptions.cancel(subscribePayment.subscribeId),
                        Payment.updateOne({ _id: subscribePayment._id, isDeleted: false }, { $set: { status: "expired", isDeleted: true } })
                    ]);

                    // Resolve the process
                    return resolve({
                        status: 200,
                        data: eventTypeObj[event.type],
                    });
                }
            }

            if (event.type === "charge.refund.updated") {
                const [refund, payment] = await Promise.all([
                    stripe.refunds.retrieve(eventData.id),
                    Payment.findOne({ refundId: eventData?.id, isDeleted: false }).lean(true)
                ]);

                Payment.updateOne({ _id: payment?._id, isDeleted: false }, { $set: { status: `refund - ${refund.status} ` } }).then();
            } else {

                const payment = await Payment.findOne({ subscribeId: eventData?.subscription, isDeleted: false, paymentFor: "artist-subscription" }).lean(true);

                if (!payment) {
                    return resolve({ status: 200, data: eventTypeObj[event.type] });
                }

                const [artists] = await Promise.all([
                    Artist.findOne({ _id: payment.createdBy, isDeleted: false }, { firstName: 1, lastName: 1, email: 1 }).lean(true),
                    Art.updateMany({ uploadedBy: payment.createdBy, isDeleted: true }, { $set: { isDeleted: false } })
                ]);

                let planTypeObj = {
                    "Quarterly-Member-Artists": "Quarterly Membership",
                    "Semi-Annual-Member-Artists": "Semi Annual Membership",
                    "Annual-Member-Artists": "Annual Membership",
                };

                let tempObj = {
                    paid: "artist-payment-succeeded",
                    failed: "artist-payment-failed",
                };

                let obj = {
                    status: eventData?.status,
                    type: event?.type,
                };

                if (["invoice.payment_succeeded", "invoice.payment_failed"].includes(event.type)) {

                    const mailVariable = {
                        "%fullName%": `${artists.firstName} ${artists.lastName} `,
                        "%amount%": eventData.amount_paid / 100,
                        "%subscription%": planTypeObj[payment.planType],
                    };

                    if (event.type === "invoice.payment_failed") {

                        obj["status"] = "expired";

                        await Promise.all([
                            Payment.updateOne({ _id: payment._id }, { $set: obj }),
                            stripe.subscriptions.cancel(payment.subscribeId),
                            Art.updateMany({ uploadedBy: payment.createdBy }, { $set: { isDeleted: true } }),
                        ])

                        sendMail(tempObj['failed'], mailVariable, artists.email);

                    } else {

                        const allDataOfEvent = eventData.lines?.data[eventData.lines?.data.length - 1];

                        const getPlan = await Plan.findOne({ productId: allDataOfEvent.price.product }, { planType: 1 }).lean(true);

                        obj["charges"] = eventData?.charge;
                        obj['amount'] = eventData?.total / 100;
                        obj['priceId'] = allDataOfEvent.price.id;
                        obj['productId'] = allDataOfEvent.price.product;
                        obj['planId'] = getPlan._id;
                        obj['planType'] = getPlan.planType;
                        obj["startTime"] = moment.unix(allDataOfEvent.period.start).utc().startOf('day').format('YYYY-MM-DD[T00:00:00.000Z]');
                        obj["endTime"] = moment.unix(allDataOfEvent.period.end).utc().startOf('day').format('YYYY-MM-DD[T00:00:00.000Z]');

                        await Promise.all([
                            Artist.updateOne({ _id: payment.createdBy, isDeleted: false }, { $set: { subscriptionPlanId: payment._id, isPauseSubscription: false }, $unset: { createdBy: '' } }),
                            Payment.updateOne({ _id: payment._id }, { $set: obj }),
                        ])

                        await Promise.all([
                            Art.updateMany({ uploadedBy: payment.createdBy, isDeleted: true }, { $set: { isDeleted: false } }),
                            sendMail(tempObj['paid'], mailVariable, artists.email)
                        ])
                    }
                }

            }

            // Resolve the process
            return resolve({
                status: 200,
                data: eventTypeObj[event.type],
            });
        } catch (error) {
            // Reject the process
            return reject(error);
        }
    });
};