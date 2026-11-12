// ==========================================
// MILESNATION - PAYMENT VERIFICATION
// ==========================================

async function generateSignature(secret, message) {

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


// Compare signatures safely
function safeCompare(a, b) {

    if (typeof a !== "string" || typeof b !== "string") {
        return false;
    }

    if (a.length !== b.length) {
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

        const {
            registration_code,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = await request.json();

        // Validate information
        if (
            !registration_code ||
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return Response.json({
                success: false,
                message: "Missing payment information."
            }, { status: 400 });
        }

        if (!env.RAZORPAY_KEY_SECRET) {
            return Response.json({
                success: false,
                message: "Payment verification is not configured."
            }, { status: 500 });
        }

        // Find registration
        const registration = await env.DB.prepare(`
            SELECT *
            FROM registrations
            WHERE registration_code = ?
        `).bind(registration_code).first();

        if (!registration) {
            return Response.json({
                success: false,
                message: "Registration not found."
            }, { status: 404 });
        }

        // Confirm order belongs to this registration
        if (registration.razorpay_order_id !== razorpay_order_id) {
            return Response.json({
                success: false,
                message: "Invalid payment order."
            }, { status: 400 });
        }

        // Verify Razorpay signature
        const generatedSignature = await generateSignature(
            env.RAZORPAY_KEY_SECRET,
            `${razorpay_order_id}|${razorpay_payment_id}`
        );

        if (!safeCompare(generatedSignature, razorpay_signature)) {
            return Response.json({
                success: false,
                message: "Payment signature verification failed."
            }, { status: 400 });
        }

        // Prevent duplicate payment processing
        if (registration.payment_status === "PAID") {
            return Response.json({
                success: true,
                message: "Payment already verified.",
                registration_code
            });
        }

        // Verify payment with Razorpay API
        const credentials = btoa(
            `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
        );

        const paymentResponse = await fetch(
            `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`,
            {
                headers: {
                    "Authorization": `Basic ${credentials}`
                }
            }
        );

        const payment = await paymentResponse.json();

        if (
            !paymentResponse.ok ||
            payment.order_id !== razorpay_order_id ||
            payment.status !== "captured" ||
            payment.amount !== registration.amount ||
            payment.currency !== "INR"
        ) {
            return Response.json({
                success: false,
                message: "Payment is not confirmed as captured."
            }, { status: 400 });
        }

        // Update payment status
        const update = await env.DB.prepare(`
            UPDATE registrations
            SET
                payment_status = 'PAID',
                razorpay_payment_id = ?
            WHERE
                registration_code = ?
                AND razorpay_order_id = ?
                AND payment_status = 'PENDING'
        `).bind(
            razorpay_payment_id,
            registration_code,
            razorpay_order_id
        ).run();

        if (update.meta.changes !== 1) {
            return Response.json({
                success: false,
                message: "Payment status could not be updated."
            }, { status: 409 });
        }

        return Response.json({
            success: true,
            message: "Payment verified successfully.",
            registration_code
        });

    } catch (error) {

        console.error("Payment verification error:", error);

        return Response.json({
            success: false,
            message: "Payment verification failed."
        }, { status: 500 });

    }
}