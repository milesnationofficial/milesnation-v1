import { createHmac, timingSafeEqual } from "node:crypto";
import { send, readJson, methodNotAllowed } from "./lib/http.js";
import { d1Query } from "./lib/d1.js";

const RAZORPAY_API = "https://api.razorpay.com/v1";
const PRICE = 29900;

function verifySignature(secret, orderId, paymentId, signature) {
    if (
        typeof signature !== "string" ||
        !/^[a-f0-9]{64}$/i.test(signature)
    ) {
        return false;
    }

    const generatedSignature = createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest();

    const receivedSignature = Buffer.from(signature, "hex");

    return (
        generatedSignature.length === receivedSignature.length &&
        timingSafeEqual(generatedSignature, receivedSignature)
    );
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return methodNotAllowed(res);
    }

    try {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            return send(res, 500, {
                success: false,
                message: "Payment verification is not configured."
            });
        }

        const data = await readJson(req);

        const {
            registration_code,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = data;

        if (
            typeof registration_code !== "string" ||
            !/^MN[A-F0-9]{12}$/i.test(registration_code) ||
            typeof razorpay_order_id !== "string" ||
            typeof razorpay_payment_id !== "string" ||
            typeof razorpay_signature !== "string"
        ) {
            return send(res, 400, {
                success: false,
                message: "Missing or invalid payment information."
            });
        }

        // Find registration in Cloudflare D1
        const result = await d1Query(
            `SELECT
                registration_code,
                amount,
                currency,
                payment_status,
                razorpay_order_id,
                razorpay_payment_id
             FROM registrations
             WHERE registration_code = ?
             LIMIT 1`,
            [registration_code]
        );

        const registration = result.results[0];

        if (!registration) {
            return send(res, 404, {
                success: false,
                message: "Registration not found."
            });
        }

        // Confirm order belongs to this registration
        if (registration.razorpay_order_id !== razorpay_order_id) {
            return send(res, 400, {
                success: false,
                message: "Invalid payment order."
            });
        }

        // Verify Razorpay signature
        const signatureValid = verifySignature(
            keySecret,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!signatureValid) {
            return send(res, 400, {
                success: false,
                message: "Payment signature verification failed."
            });
        }

        // Handle an already verified payment
        if (registration.payment_status === "PAID") {
            if (registration.razorpay_payment_id === razorpay_payment_id) {
                return send(res, 200, {
                    success: true,
                    message: "Payment already verified.",
                    registration_code
                });
            }

            return send(res, 409, {
                success: false,
                message: "This registration has already been paid."
            });
        }

        // Verify payment directly with Razorpay
        const credentials = Buffer
            .from(`${keyId}:${keySecret}`)
            .toString("base64");

        const paymentResponse = await fetch(
            `${RAZORPAY_API}/payments/${encodeURIComponent(razorpay_payment_id)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Basic ${credentials}`
                }
            }
        );

        const payment = await paymentResponse.json();

        if (!paymentResponse.ok) {
            console.error("Razorpay payment lookup failed:", payment);

            return send(res, 502, {
                success: false,
                message: "Unable to verify payment with Razorpay."
            });
        }

        // Confirm payment details
        if (
            payment.order_id !== razorpay_order_id ||
            payment.status !== "captured" ||
            Number(payment.amount) !== PRICE ||
            Number(registration.amount) !== PRICE ||
            payment.currency !== "INR" ||
            registration.currency !== "INR"
        ) {
            return send(res, 400, {
                success: false,
                message: "Payment is not confirmed as captured."
            });
        }

        // Update registration in D1
        const update = await d1Query(
            `UPDATE registrations
             SET
                payment_status = 'PAID',
                razorpay_payment_id = ?
             WHERE
                registration_code = ?
                AND razorpay_order_id = ?
                AND payment_status = 'PENDING'`,
            [
                razorpay_payment_id,
                registration_code,
                razorpay_order_id
            ]
        );

        if (Number(update.meta.changes) !== 1) {
            return send(res, 409, {
                success: false,
                message: "Payment status could not be updated. Please contact support."
            });
        }

        return send(res, 200, {
            success: true,
            message: "Payment verified successfully.",
            registration_code
        });

    } catch (error) {
        console.error("Payment verification error:", error);

        return send(res, 500, {
            success: false,
            message: "Payment verification failed."
        });
    }
}