import { send, readJson, methodNotAllowed } from "./lib/http.js";
import { d1Query } from "./lib/d1.js";

const RAZORPAY_API = "https://api.razorpay.com/v1";
const PRICE = 29900;

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return methodNotAllowed(res);
    }

    try {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            console.error("Razorpay credentials missing.");

            return send(res, 500, {
                success: false,
                message: "Payment gateway is not configured."
            });
        }

        const data = await readJson(req);
        const registrationCode = data.registration_code;

        if (
            typeof registrationCode !== "string" ||
            !/^MN[A-F0-9]{12}$/i.test(registrationCode)
        ) {
            return send(res, 400, {
                success: false,
                message: "Invalid registration code."
            });
        }

        const registration = await d1Query(
            `SELECT
                registration_code,
                first_name,
                last_name,
                email,
                phone,
                payment_status
             FROM registrations
             WHERE registration_code = ?
             LIMIT 1`,
            [registrationCode]
        );

        const customer = registration.results[0];

        if (!customer) {
            return send(res, 404, {
                success: false,
                message: "Registration not found."
            });
        }

        if (customer.payment_status === "PAID") {
            return send(res, 409, {
                success: false,
                message: "This registration is already paid."
            });
        }

        const razorpayResponse = await fetch(
            `${RAZORPAY_API}/orders`,
            {
                method: "POST",
                headers: {
                    Authorization:
                        "Basic " +
                        Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    amount: PRICE,
                    currency: "INR",
                    receipt: registrationCode,
                    notes: {
                        registration_code: registrationCode,
                        customer_name:
                            `${customer.first_name} ${customer.last_name}`,
                        activity: "MilesNation"
                    }
                })
            }
        );

        const order = await razorpayResponse.json();

        if (!razorpayResponse.ok || !order.id) {
            console.error("Razorpay order creation failed:", order);

            return send(res, 502, {
                success: false,
                message: "Unable to create payment order. Please try again."
            });
        }

        await d1Query(
            `UPDATE registrations
             SET razorpay_order_id = ?
             WHERE registration_code = ?
             AND payment_status = 'PENDING'`,
            [order.id, registrationCode]
        );

        return send(res, 200, {
            success: true,
            message: "Payment order created successfully.",
            key_id: keyId,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            registration_code: registrationCode,
            customer: {
                name: `${customer.first_name} ${customer.last_name}`,
                email: customer.email,
                contact: customer.phone
            }
        });

    } catch (error) {
        console.error("Create order API error:", error);

        return send(res, 500, {
            success: false,
            message: "Unable to process payment. Please try again."
        });
    }
}