import { randomUUID } from "node:crypto";
import { send, readJson, methodNotAllowed } from "./lib/http.js";
import { d1Query } from "./lib/d1.js";

const PRICE = 29900;

const ALLOWED_DISTANCES = {
    Running: ["5 KM", "10 KM", "21 KM"],
    Cycling: ["10 KM", "25 KM", "50 KM"],
    Walking: ["2 KM", "3 KM", "5 KM"]
};

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return methodNotAllowed(res);
    }

    try {
        const data = await readJson(req);

        const fields = [
            "first_name",
            "last_name",
            "email",
            "phone",
            "house_number",
            "street",
            "city",
            "state",
            "pincode",
            "activity",
            "distance"
        ];

        for (const field of fields) {
            if (
                typeof data[field] !== "string" ||
                !data[field].trim()
            ) {
                return send(res, 400, {
                    success: false,
                    message: `Please provide a valid ${field.replaceAll("_", " ")}.`
                });
            }
        }

        const firstName = data.first_name.trim();
        const lastName = data.last_name.trim();
        const email = data.email.trim().toLowerCase();
        const phone = data.phone.trim();
        const houseNumber = data.house_number.trim();
        const street = data.street.trim();
        const city = data.city.trim();
        const state = data.state.trim();
        const pincode = data.pincode.trim();
        const activity = data.activity;
        const distance = data.distance;

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            return send(res, 400, {
                success: false,
                message: "Invalid email address."
            });
        }

        if (!/^[6-9]\d{9}$/.test(phone)) {
            return send(res, 400, {
                success: false,
                message: "Enter a valid 10-digit phone number."
            });
        }

        if (!/^\d{6}$/.test(pincode)) {
            return send(res, 400, {
                success: false,
                message: "Enter a valid 6-digit pincode."
            });
        }

        if (
            !ALLOWED_DISTANCES[activity] ||
            !ALLOWED_DISTANCES[activity].includes(distance)
        ) {
            return send(res, 400, {
                success: false,
                message: "Invalid activity or distance selected."
            });
        }

        const registrationCode =
            "MN" + randomUUID().replace(/-/g, "").substring(0, 12).toUpperCase();

        await d1Query(
            `INSERT INTO registrations (
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                registrationCode,
                firstName,
                lastName,
                email,
                phone,
                houseNumber,
                street,
                city,
                state,
                pincode,
                activity,
                distance,
                PRICE,
                "INR",
                "PENDING"
            ]
        );

        return send(res, 201, {
            success: true,
            message: "Registration saved successfully.",
            registration_code: registrationCode,
            activity,
            distance,
            amount: PRICE
        });

    } catch (error) {
        console.error("Registration API error:", error);

        return send(res, 500, {
            success: false,
            message: "Registration failed. Please try again."
        });
    }
}