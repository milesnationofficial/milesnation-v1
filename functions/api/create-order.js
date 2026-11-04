// ==========================================
// MILESNATION - RAZORPAY ORDER CREATION
// ==========================================

export async function onRequestPost({ request, env }) {

    try {

        // Check Razorpay credentials
        if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
            return Response.json({
                success: false,
                message: "Payment gateway is not configured."
            }, { status: 500 });
        }

        const { registration_code } = await request.json();

        if (!registration_code) {
            return Response.json({
                success: false,
                message: "Registration ID is required."
            }, { status: 400 });
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

        if (registration.payment_status !== "PENDING") {
            return Response.json({
                success: false,
                message: "Registration is not awaiting payment."
            }, { status: 409 });
        }

        // Reuse an existing pending order
        if (registration.razorpay_order_id) {

            return Response.json({
                success: true,
                order_id: registration.razorpay_order_id,
                amount: registration.amount,
                currency: "INR",
                key_id: env.RAZORPAY_KEY_ID
            });
        }

        // Create Razorpay order
        const credentials = btoa(
            `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
        );

        const razorpayResponse = await fetch(
            "https://api.razorpay.com/v1/orders",
            {
                method: "POST",

                headers: {
                    "Authorization": `Basic ${credentials}`,
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    amount: registration.amount,
                    currency: "INR",
                    receipt: registration.registration_code
                })
            }
        );

        const order = await razorpayResponse.json();

        if (!razorpayResponse.ok) {
    console.error("Razorpay error:", order);

    return Response.json({
        success: false,
        message: order.error?.description ||
                 order.error?.reason ||
                 "Razorpay rejected the order request.",
        error_code: order.error?.code || "UNKNOWN"
    }, { status: 502 });
}

        // Store Razorpay order ID
        await env.DB.prepare(`
            UPDATE registrations
            SET razorpay_order_id = ?
            WHERE registration_code = ?
        `).bind(
            order.id,
            registration_code
        ).run();

        return Response.json({
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: env.RAZORPAY_KEY_ID
        });

    } catch (error) {

        console.error("Order creation error:", error);

        return Response.json({
            success: false,
            message: "Payment order creation failed."
        }, { status: 500 });

    }
}