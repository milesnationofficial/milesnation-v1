// ==========================================
// MILESNATION - RAZORPAY WEBHOOK
// ==========================================

async function createHmac(secret, message) {
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(message)
    );

    return Array.from(new Uint8Array(signature))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function compareSignatures(a, b) {
    if (
        typeof a !== "string" ||
        typeof b !== "string" ||
        a.length !== b.length
    ) {
        return false;
    }

    let result = 0;

    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
}

export async function onRequestPost({ request, env }) {
    try {
        if (!env.RAZORPAY_WEBHOOK_SECRET || !env.DB) {
            return Response.json({
                success: false,
                message: "Webhook configuration is incomplete."
            }, { status: 500 });
        }

        // Read original request body
        const rawBody = await request.text();

        const receivedSignature =
            request.headers.get("x-razorpay-signature");

        if (!receivedSignature) {
            return Response.json({
                success: false,
                message: "Missing webhook signature."
            }, { status: 400 });
        }

        // Verify webhook signature
        const expectedSignature = await createHmac(
            env.RAZORPAY_WEBHOOK_SECRET,
            rawBody
        );

        if (!compareSignatures(
            expectedSignature,
            receivedSignature
        )) {
            return Response.json({
                success: false,
                message: "Invalid webhook signature."
            }, { status: 400 });
        }

        const event = JSON.parse(rawBody);

        // Handle successful captured payments
        if (event.event === "payment.captured") {
            const payment = event.payload?.payment?.entity;

            if (
                !payment?.id ||
                !payment?.order_id ||
                payment.status !== "captured"
            ) {
                return Response.json({
                    success: false,
                    message: "Invalid captured payment."
                }, { status: 400 });
            }

            // Match order, amount and currency before updating
            await env.DB.prepare(`
                UPDATE registrations
                SET
                    payment_status = 'PAID',
                    razorpay_payment_id = ?
                WHERE
                    razorpay_order_id = ?
                    AND amount = ?
                    AND currency = 'INR'
                    AND payment_status = 'PENDING'
                    AND razorpay_payment_id IS NULL
            `).bind(
                payment.id,
                payment.order_id,
                payment.amount
            ).run();
        }

        // Failed attempts remain PENDING.
        // Customers can retry their payment.

        return Response.json({
            success: true,
            message: "Webhook processed."
        });

    } catch (error) {
        console.error("Webhook error:", error);

        return Response.json({
            success: false,
            message: "Webhook processing failed."
        }, { status: 500 });
    }
}