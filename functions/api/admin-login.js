// ==========================================
// MILESNATION - SECURE ADMIN LOGIN API
// ==========================================

async function createSignature(payload, secret) {
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
        encoder.encode(payload)
    );

    return btoa(
        String.fromCharCode(...new Uint8Array(signature))
    )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function onRequestPost({ request, env }) {
    try {
        if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
            return Response.json({
                success: false,
                message: "Admin login is not configured."
            }, { status: 500 });
        }

        const data = await request.json();
        const password = data.password;

        if (
            typeof password !== "string" ||
            password.length > 256 ||
            password !== env.ADMIN_PASSWORD
        ) {
            return Response.json({
                success: false,
                message: "Invalid admin password."
            }, { status: 401 });
        }

        // Session expires after 8 hours
        const expiresAt = Math.floor(Date.now() / 1000) + (8 * 60 * 60);

        const payload = btoa(JSON.stringify({
            role: "admin",
            exp: expiresAt
        }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

        const signature = await createSignature(
            payload,
            env.ADMIN_SESSION_SECRET
        );

        const token = `${payload}.${signature}`;

        return new Response(JSON.stringify({
            success: true,
            message: "Admin login successful."
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Set-Cookie":
                    `mn_admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=28800`
            }
        });

    } catch (error) {
        console.error("Admin login error:", error);

        return Response.json({
            success: false,
            message: "Unable to process admin login."
        }, { status: 500 });
    }
}