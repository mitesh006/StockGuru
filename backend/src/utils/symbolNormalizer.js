/**
 * symbolNormalizer.js — Consistent stock symbol handling
 *
 * WHY: The codebase had scattered .toUpperCase() and .trim() calls
 * in controllers, services, and routes. This centralizes symbol
 * normalization so cache keys are always consistent and we never
 * accidentally cache "aapl" and "AAPL" separately.
 */

/**
 * Normalize a stock symbol: trim whitespace, convert to uppercase.
 * @param {string} symbol
 * @returns {string}
 */
function normalize(symbol) {
    if (!symbol || typeof symbol !== "string") return "";
    return symbol.trim().toUpperCase();
}

/**
 * Basic validation: symbol must be 1-10 uppercase letters/digits.
 * This catches obviously invalid input without hitting the API.
 * @param {string} symbol - Already-normalized symbol
 * @returns {boolean}
 */
function isValid(symbol) {
    if (!symbol) return false;
    // US stock symbols: 1-5 letters, sometimes with a dot (BRK.B)
    // ETFs can be up to 5 characters
    return /^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol);
}

module.exports = { normalize, isValid };
