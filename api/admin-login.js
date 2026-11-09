import { createHmac, timingSafeEqual } from "node:crypto";

function createToken(secret) {
    const payload = Buffer.from(
        JSON.stringify({
            role: "admin",
            exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
        })
    ).toString("base64url");

    const signature = createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");

    return `${payload}.${signature}`;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({
            success: false,
            message: "Method not allowed."
        });
    }

    try {
        const { ADMIN_PASSWORD, ADMIN_SESSION_SECRET } = process.env;

        if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) {
            return res.status(500).json({
                success: false,
                message: "Admin login is not configured."
            });
        }

        const password = req.body?.password;

        if (typeof password !== "string" || password.length > 256) {
            return res.status(400).json({
                success: false,
                message: "Invalid password."
            });
        }

        const supplied = Buffer.from(password);
        const expected = Buffer.from(ADMIN_PASSWORD);

        if (
            supplied.length !== expected.length ||
            !timingSafeEqual(supplied, expected)
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid admin password."
            });
        }

        const token = createToken(ADMIN_SESSION_SECRET);

        res.setHeader(
            "Set-Cookie",
            `mn_admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=28800`
        );

        return res.status(200).json({
            success: true,
            message: "Admin login successful."
        });

    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to process admin login."
        });
    }
}