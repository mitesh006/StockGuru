const ErrorTypes = {
    RATE_LIMIT:      "RATE_LIMIT",
    INVALID_SYMBOL:  "INVALID_SYMBOL",
    INVALID_API_KEY: "INVALID_API_KEY",
    NETWORK_ERROR:   "NETWORK_ERROR",
    NO_DATA:         "NO_DATA",
    UNKNOWN:         "UNKNOWN",
};

// Classify API errors into structured responses with proper HTTP status codes
function classify(error, source = "unknown") {
    const msg = error.message || "";
    const status = error.response?.status;
    const data = error.response?.data;

    // Rate limit
    if (
        status === 429 ||
        msg.includes("rate limit") ||
        msg.includes("Rate limit") ||
        (data && data["Note"] && data["Note"].includes("call frequency"))
    ) {
        return {
            type: ErrorTypes.RATE_LIMIT,
            status: 429,
            message: "API rate limit reached. Data may be temporarily cached. Please try again shortly.",
        };
    }

    // Invalid API key
    if (
        status === 401 || status === 403 ||
        msg.includes("Invalid API") ||
        msg.includes("invalid api")
    ) {
        return {
            type: ErrorTypes.INVALID_API_KEY,
            status: 500,
            message: "Server configuration error. Please contact the administrator.",
        };
    }

    // Invalid symbol
    if (
        msg.includes("No quote data") ||
        msg.includes("Invalid symbol") ||
        msg.includes("not found") ||
        (data && data["Error Message"])
    ) {
        return {
            type: ErrorTypes.INVALID_SYMBOL,
            status: 404,
            message: msg || "Symbol not found or not supported.",
        };
    }

    // Network errors
    if (
        error.code === "ECONNREFUSED" ||
        error.code === "ENOTFOUND" ||
        error.code === "ETIMEDOUT" ||
        msg.includes("timeout") ||
        msg.includes("Network Error")
    ) {
        return {
            type: ErrorTypes.NETWORK_ERROR,
            status: 503,
            message: "Unable to reach the data provider. Please try again later.",
        };
    }

    // Catch-all
    return {
        type: ErrorTypes.UNKNOWN,
        status: 500,
        message: msg || "An unexpected error occurred while fetching stock data.",
    };
}

module.exports = { classify, ErrorTypes };
