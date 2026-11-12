import { createHmac, timingSafeEqual } from "node:crypto";
import { send, methodNotAllowed } from "./lib/http.js";
import { d1Query } from "./lib/d1.js";

const PRICE = 29900;

// Disable automatic body parsing.
// Razorpay signature verification requires the original raw body.
export const config = {
    api: {
        bodyParser: false
    }
};

// Read raw request body
async function readRawBody(req) {
    const chunks = [];

    for await (const chunk of req) {
        chunks.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        );
    }

    return Buffer.concat(chunks).toString("utf8");
}

// Verify Razorpay webhook signature
function verifyWebhookSignature(secret, rawBody, receivedSignature) {
    if (
        typeof receivedSignature !== "string" ||
        !/^[a-f0-9]{64}$/i.test(receivedSignature)
    ) {
        return false;
    }

    const expectedSignature = createHmac("sha256", secret)
        .update(rawBody)
        .digest();

    const received = Buffer.from(receivedSignature, "hex");

    return (
        expectedSignature.length === received.length &&
        timingSafeEqual(expectedSignature, received)
    );
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return methodNotAllowed(res);
    }

    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error("Razorpay webhook secret missing.");

            return send(res, 500, {
                success: false,
                message: "Webhook configuration is incomplete."
            });
        }

        // Read original raw request body
        const rawBody = await readRawBody(req);

        const receivedSignature =
            req.headers["x-razorpay-signature"];

        if (!receivedSignature) {
            return send(res, 400, {
                success: false,
                message: "Missing webhook signature."
            });
        }

        // Verify webhook signature
        const signatureValid = verifyWebhookSignature(
            webhookSecret,
            rawBody,
            receivedSignature
        );

        if (!signatureValid) {
            return send(res, 400, {
                success: false,
                message: "Invalid webhook signature."
            });
        }

        // Parse verified event
        let event;

        try {
            event = JSON.parse(rawBody);
        } catch {
            return send(res, 400, {
                success: false,
                message: "Invalid webhook payload."
            });
        }

        // Handle captured payments
        if (event.event === "payment.captured") {
            const payment = event.payload?.payment?.entity;

            if (
                !payment?.id ||
                !payment?.order_id ||
                payment.status !== "captured" ||
                Number(payment.amount) !== PRICE ||
                payment.currency !== "INR"
            ) {
                return send(res, 400, {
                    success: false,
                    message: "Invalid captured payment."
                });
            }

            // Update only the matching pending registration
            const update = await d1Query(
                `UPDATE registrations
                 SET
                    payment_status = 'PAID',
                    razorpay_payment_id = ?
                 WHERE
                    razorpay_order_id = ?
                    AND amount = ?
                    AND currency = 'INR'
                    AND payment_status = 'PENDING'
                    AND razorpay_payment_id IS NULL`,
                [
                    payment.id,
                    payment.order_id,
                    PRICE
                ]
            );

            if (Number(update.meta.changes) !== 1) {
                console.log(
                    "Webhook did not update a registration. It may already be processed or the order may not match."
                );
            }
        }

        // Other events are acknowledged without changing registration status.
        return send(res, 200, {
            success: true,
            message: "Webhook processed."
        });

    } catch (error) {
        console.error("Razorpay webhook error:", error);

        return send(res, 500, {
            success: false,
            message: "Webhook processing failed."
        });
    }
}