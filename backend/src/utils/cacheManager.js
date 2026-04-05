/**
 * cacheManager.js — Central in-memory cache for all stock data
 *
 * WHY: Finnhub free tier = 60 calls/min. Without caching, a single
 * dashboard load uses 15 calls. This cache prevents repeat external
 * API calls within TTL windows, reducing usage by 80%+.
 *
 * CATEGORIES: Each data type gets its own TTL because price data
 * changes every second (short TTL) but company profiles rarely
 * change (long TTL).
 */

// ── TTL configuration (milliseconds) ──
const TTL_CONFIG = {
    quote:   30 * 1000,         // 30 seconds — prices change often but 30s is fine for MVP
    profile: 24 * 60 * 60 * 1000, // 24 hours — company name/logo/industry almost never change
    metrics: 60 * 60 * 1000,    // 1 hour — financial ratios update infrequently
    chart:   15 * 60 * 1000,    // 15 minutes — daily chart data doesn't change intraday
};

// ── Internal store: Map<string, { data, fetchedAt }> per category ──
const store = {
    quote:   new Map(),
    profile: new Map(),
    metrics: new Map(),
    chart:   new Map(),
};

/**
 * Get cached data if it exists and hasn't expired.
 * @param {string} category - One of: quote, profile, metrics, chart
 * @param {string} key      - Cache key (usually the stock symbol)
 * @returns {{ data: any, stale: boolean } | null}
 */
function get(category, key) {
    const entry = store[category]?.get(key);
    if (!entry) {
        console.log(`[Cache] MISS  ${category}:${key}`);
        return null;
    }

    const age = Date.now() - entry.fetchedAt;
    const ttl = TTL_CONFIG[category] || 60000;

    if (age < ttl) {
        console.log(`[Cache] HIT   ${category}:${key} (age: ${Math.round(age / 1000)}s)`);
        return { data: entry.data, stale: false };
    }

    // Expired — return null so caller fetches fresh data
    // (stale data is still available via getStale for fallback)
    console.log(`[Cache] MISS  ${category}:${key} (expired, age: ${Math.round(age / 1000)}s)`);
    return null;
}

/**
 * Get stale (expired) cached data for fallback when API is down/rate-limited.
 * This is the last resort — better to show old data than break the UI.
 * @param {string} category
 * @param {string} key
 * @returns {any | null}
 */
function getStale(category, key) {
    const entry = store[category]?.get(key);
    if (entry) {
        console.log(`[Cache] STALE fallback used for ${category}:${key} (age: ${Math.round((Date.now() - entry.fetchedAt) / 1000)}s)`);
        return entry.data;
    }
    return null;
}

/**
 * Store data in cache.
 * @param {string} category
 * @param {string} key
 * @param {any}    data
 */
function set(category, key, data) {
    if (!store[category]) {
        console.warn(`[Cache] Unknown category: ${category}`);
        return;
    }
    store[category].set(key, { data, fetchedAt: Date.now() });
}

/**
 * Print cache statistics (useful for debugging API overuse).
 */
function stats() {
    const result = {};
    for (const [category, map] of Object.entries(store)) {
        result[category] = {
            entries: map.size,
            ttl: `${TTL_CONFIG[category] / 1000}s`,
        };
    }
    console.log("[Cache] Stats:", JSON.stringify(result));
    return result;
}

/**
 * Clear all cache entries (useful for testing).
 */
function clear() {
    for (const map of Object.values(store)) {
        map.clear();
    }
    console.log("[Cache] All entries cleared");
}

module.exports = { get, getStale, set, stats, clear };
