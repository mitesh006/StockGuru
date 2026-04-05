/**
 * requestDeduplicator.js — Prevent duplicate in-flight API requests
 *
 * WHY: When the dashboard loads, it fires requests for 6 stocks across
 * ticker + trending endpoints. If both hit the same symbol at the same
 * time, we'd make 2 external API calls for the same data. This module
 * ensures only 1 call is made — all concurrent callers share the same
 * Promise.
 *
 * HOW: A Map stores in-flight Promises keyed by a unique string
 * (e.g., "quote:AAPL"). When the first request starts, it stores its
 * Promise. Subsequent requests for the same key get the same Promise.
 * Once resolved, the key is removed so future requests can fetch fresh data.
 */

const inFlight = new Map();

/**
 * Execute a function with deduplication. If the same key is already
 * in-flight, returns the existing Promise instead of starting a new one.
 *
 * @param {string}   key - Unique identifier (e.g., "quote:AAPL")
 * @param {Function} fn  - Async function to execute if no in-flight request
 * @returns {Promise<any>}
 */
async function dedupe(key, fn) {
    // If there's already an in-flight request for this key, reuse it
    if (inFlight.has(key)) {
        console.log(`[Dedup] Reusing in-flight request for ${key}`);
        return inFlight.get(key);
    }

    // Start new request and store the Promise
    const promise = fn()
        .finally(() => {
            // Clean up after resolution (success or failure)
            inFlight.delete(key);
        });

    inFlight.set(key, promise);
    return promise;
}

module.exports = { dedupe };
