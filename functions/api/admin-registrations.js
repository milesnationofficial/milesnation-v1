// ==========================================
// MILESNATION - PROTECTED ADMIN API
// ==========================================

// Verify the admin session cookie
async function verifyAdminSession(request, secret) {
    try {
        const cookieHeader = request.headers.get("Cookie") || "";

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

        const base64 = payload
            .replace(/-/g, "+")
            .replace(/_/g, "/");

        const padded = base64 + "=".repeat(
            (4 - base64.length % 4) % 4
        );

        const session = JSON.parse(atob(padded));

        if (
            session.role !== "admin" ||
            typeof session.exp !== "number" ||
            session.exp <= Math.floor(Date.now() / 1000)
        ) {
            return false;
        }

        const encoder = new TextEncoder();

        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(secret),
            {
                name: "HMAC",
                hash: "SHA-256"
            },
            false,
            ["verify"]
        );

        const signatureBytes = Uint8Array.from(
            atob(
                signature.replace(/-/g, "+").replace(/_/g, "/")
                + "=".repeat((4 - signature.length % 4) % 4)
            ),
            char => char.charCodeAt(0)
        );

        return await crypto.subtle.verify(
            "HMAC",
            key,
            signatureBytes,
            encoder.encode(payload)
        );

    } catch {
        return false;
    }
}


// ==========================================
// GET ADMIN DASHBOARD DATA
// ==========================================

export async function onRequestGet({ request, env }) {
    try {

        if (!env.DB || !env.ADMIN_SESSION_SECRET) {
            return Response.json({
                success: false,
                message: "Server configuration error."
            }, { status: 500 });
        }

        // Verify admin login
        const isAdmin = await verifyAdminSession(
            request,
            env.ADMIN_SESSION_SECRET
        );

        if (!isAdmin) {
            return Response.json({
                success: false,
                message: "Unauthorized. Please log in."
            }, { status: 401 });
        }

        // Fetch dashboard statistics
        const statistics = await env.DB.prepare(`
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
        `).first();

        // Fetch participant registrations
        const result = await env.DB.prepare(`
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
        `).all();

        return Response.json({
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

            participants: result.results || []

        });

    } catch (error) {

        console.error("Admin dashboard error:", error);

        return Response.json({
            success: false,
            message: "Unable to load dashboard data."
        }, { status: 500 });

    }
}