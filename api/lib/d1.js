const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

function getConfig() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !databaseId || !apiToken) {
        throw new Error("Cloudflare D1 environment variables are missing.");
    }

    return { accountId, databaseId, apiToken };
}

export async function d1Query(sql, params = []) {
    const { accountId, databaseId, apiToken } = getConfig();

    const url =
        `${CLOUDFLARE_API}/accounts/${accountId}` +
        `/d1/database/${databaseId}/query`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ sql, params })
    });

    const responseText = await response.text();

    let result;

    try {
        result = JSON.parse(responseText);
    } catch {
        throw new Error(
            `Cloudflare returned an invalid response. HTTP ${response.status}`
        );
    }

    if (!response.ok || !result.success) {
        console.error("D1 query failed:", result.errors);
        throw new Error("Database operation failed.");
    }

    const queryResult = result.result?.[0];

    if (!queryResult) {
        throw new Error("Database returned an empty response.");
    }

    return {
        results: queryResult.results || [],
        meta: queryResult.meta || {}
    };
}