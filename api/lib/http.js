export function send(res, status, payload, headers = {}) {
    res.status(status);

    res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
    );

    for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
    }

    return res.end(JSON.stringify(payload));
}


export async function readJson(req) {
    if (req.body && typeof req.body === "object") {
        return req.body;
    }

    let raw = "";

    for await (const chunk of req) {
        raw += chunk;
    }

    if (!raw) {
        return {};
    }

    try {
        return JSON.parse(raw);
    } catch {
        const error = new Error(
            "Invalid JSON request body."
        );

        error.status = 400;
        throw error;
    }
}


export function methodNotAllowed(res, allowed = "POST") {
    res.setHeader("Allow", allowed);

    return send(res, 405, {
        success: false,
        message: `Method not allowed. Use ${allowed}.`
    });
}