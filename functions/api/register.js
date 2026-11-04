// ==========================================
// MILESNATION - REGISTRATION API
// ==========================================

export async function onRequestPost({ request, env }) {
    try {
        if (!env.DB) {
            return Response.json({
                success: false,
                message: "Database is not configured."
            }, { status: 500 });
        }

        // Receive registration details
        const data = await request.json();

        const {
            first_name,
            last_name,
            email,
            phone,
            house_number,
            street,
            city,
            state,
            pincode,
            activity,
            distance
        } = data;

        // Validate required fields
        const requiredFields = [
            first_name,
            last_name,
            email,
            phone,
            house_number,
            street,
            city,
            state,
            pincode,
            activity,
            distance
        ];

        if (requiredFields.some(value =>
            typeof value !== "string" || !value.trim()
        )) {
            return Response.json({
                success: false,
                message: "Please fill all required fields."
            }, { status: 400 });
        }

        // Validate email
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email.trim())) {
            return Response.json({
                success: false,
                message: "Invalid email address."
            }, { status: 400 });
        }

        // Validate Indian phone number
        if (!/^[6-9]\d{9}$/.test(phone.trim())) {
            return Response.json({
                success: false,
                message: "Enter a valid 10-digit phone number."
            }, { status: 400 });
        }

        // Validate PIN code
        if (!/^\d{6}$/.test(pincode.trim())) {
            return Response.json({
                success: false,
                message: "Enter a valid 6-digit pincode."
            }, { status: 400 });
        }

        // Validate activity and distance combination
        const allowedDistances = {
            Running: ["5 KM", "10 KM", "21 KM"],
            Cycling: ["10 KM", "25 KM", "50 KM"],
            Walking: ["2 KM", "3 KM", "5 KM"]
        };

        if (
            !allowedDistances[activity] ||
            !allowedDistances[activity].includes(distance)
        ) {
            return Response.json({
                success: false,
                message: "Invalid activity or distance selected."
            }, { status: 400 });
        }

        // Generate unique registration ID
        const registrationCode =
            "MN" + crypto.randomUUID()
                .replace(/-/g, "")
                .substring(0, 12)
                .toUpperCase();

        // Save registration in Cloudflare D1
        await env.DB.prepare(`
            INSERT INTO registrations (
                registration_code,
                first_name,
                last_name,
                email,
                phone,
                house_number,
                street,
                city,
                state,
                pincode,
                activity,
                distance,
                amount,
                currency,
                payment_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            registrationCode,
            first_name.trim(),
            last_name.trim(),
            email.trim().toLowerCase(),
            phone.trim(),
            house_number.trim(),
            street.trim(),
            city.trim(),
            state.trim(),
            pincode.trim(),
            activity,
            distance,
            29900,
            "INR",
            "PENDING"
        ).run();

        // Return successful registration response
        return Response.json({
            success: true,
            message: "Registration saved successfully.",
            registration_code: registrationCode,
            activity: activity,
            distance: distance
        });

    } catch (error) {
        console.error("Registration error:", error);

        return Response.json({
            success: false,
            message: "Registration failed. Please try again."
        }, { status: 500 });
    }
}