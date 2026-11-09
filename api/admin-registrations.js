import { createHmac, timingSafeEqual } from "node:crypto";
import { send, methodNotAllowed } from "./lib/http.js";
import { d1Query } from "./lib/d1.js";

// Verify admin session cookie
function verifyAdminSession(req, secret) {
    try {
        const cookieHeader = req.headers.cookie || "";

        const sessionCookie = cookieHeader
            .split(";")
            .map(cookie => cookie.trim())
            .find(cookie => cookie.startsWith("mn_admin_session="));

        if (!sessionCookie) return false;

        const token = sessionCookie.substring(
            "mn_admin_session=".length
        );

        const parts = token.split(".");

        if (parts.length !== 2) return false;

        const [payload, signature] = parts;

        if (
            !/^[A-Za-z0-9_-]+$/.test(payload) ||
            !/^[A-Za-z0-9_-]+$/.test(signature)
        ) {
            return false;
        }

        const session = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8")
        );

        if (
            session.role !== "admin" ||
            typeof session.exp !== "number" ||
            session.exp <= Math.floor(Date.now() / 1000)
        ) {
            return false;
        }

        const expectedSignature = createHmac("sha256", secret)
            .update(payload)
            .digest();

        const receivedSignature = Buffer.from(
            signature,
            "base64url"
        );

        if (expectedSignature.length !== receivedSignature.length) {
            return false;
        }

        return timingSafeEqual(
            expectedSignature,
            receivedSignature
        );

    } catch (error) {
        console.error("Admin session verification error:", error);
        return false;
    }
}

// GET admin dashboard data
export default async function handler(req, res) {

    if (req.method !== "GET") {
        return methodNotAllowed(res, "GET");
    }

    try {
        const sessionSecret = process.env.ADMIN_SESSION_SECRET;

        if (!sessionSecret) {
            return send(res, 500, {
                success: false,
                message: "Server configuration error."
            });
        }

        // Verify admin login
        const isAdmin = verifyAdminSession(
            req,
            sessionSecret
        );

        if (!isAdmin) {
            return send(res, 401, {
                success: false,
                message: "Unauthorized. Please log in."
            });
        }

        // Fetch dashboard statistics
        const statisticsResult = await d1Query(`
            SELECT
                COUNT(*) AS total_registrations,

                SUM(
                    CASE WHEN payment_status = 'PAID'
                    THEN 1 ELSE 0 END
                ) AS paid_registrations,

                SUM(
                    CASE WHEN payment_status = 'PENDING'
                    THEN 1 ELSE 0 END
                ) AS pending_registrations,

                COALESCE(
                    SUM(
                        CASE WHEN payment_status = 'PAID'
                        THEN amount ELSE 0 END
                    ),
                    0
                ) AS total_revenue

            FROM registrations
        `);

        const statistics = statisticsResult.results[0] || {};

        // Fetch participant registrations
        const participantsResult = await d1Query(`
            SELECT
                registration_code,
                first_name,
                last_name,
                email,
                phone,
                activity,
                distance,
                amount,
                currency,
                payment_status,
                created_at

            FROM registrations

            ORDER BY created_at DESC

            LIMIT 500
        `);

        return send(res, 200, {
            success: true,

            statistics: {
                total_registrations:
                    statistics.total_registrations || 0,

                paid_registrations:
                    statistics.paid_registrations || 0,

                pending_registrations:
                    statistics.pending_registrations || 0,

                total_revenue:
                    statistics.total_revenue || 0
            },

            participants: participantsResult.results || []
        });

    } catch (error) {
        console.error("Admin dashboard error:", error);

        return send(res, 500, {
            success: false,
            message: "Unable to load dashboard data."
        });
    }
}