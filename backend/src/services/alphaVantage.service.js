/**
 * alphaVantage.service.js — Alpha Vantage API wrapper with centralized caching
 *
 * WHAT CHANGED (Refactor):
 * - Moved chart cache from local Map to central cacheManager (15min TTL)
 * - Added request deduplication for concurrent chart requests
 * - Added stale-cache fallback when rate-limited
 * - Added DEV_MODE support with mock chart data
 * - Removed unused getStockQuote function (was not used anywhere)
 * - Improved error classification using apiErrorHandler
 * - Added [AlphaVantage] prefixed logging
 *
 * WHY: Alpha Vantage free tier = 25 calls/day or 5 calls/min (standard free key).
 * Caching full daily data per symbol means one call serves all period ranges
 * (1W, 1M, 6M, 1Y) without additional API requests.
 */

require("dotenv").config();
const axios = require("axios");
const cache = require("../utils/cacheManager");
const { dedupe } = require("../utils/requestDeduplicator");
const { normalize } = require("../utils/symbolNormalizer");

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = "https://www.alphavantage.co/query";
const DEV_MODE = process.env.DEV_MODE === "true";

// ═══════════════════════════════════════════
// MOCK DATA (used when DEV_MODE=true)
// Generates 365 days of fake price data
// ═══════════════════════════════════════════
function generateMockChartData() {
    const points = [];
    const today = new Date();
    let price = 150;
    for (let i = 365; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;
        // Random walk
        price += (Math.random() - 0.48) * 3;
        price = Math.max(80, Math.min(250, price));
        points.push({
            date: date.toISOString().split("T")[0],
            price: parseFloat(price.toFixed(2)),
        });
    }
    return points;
}

// ═══════════════════════════════════════════
// GET CHART DATA — cached 15min, deduplicated
// ═══════════════════════════════════════════

/**
 * Fetch daily historical chart data from Alpha Vantage.
 * Results are cached per-symbol for 15 minutes.
 * The full dataset is cached once — period slicing happens locally.
 *
 * @param {string} symbol - Stock ticker (e.g. "AAPL")
 * @param {string} period - One of "1W", "1M", "6M", "1Y"
 * @returns {{ success: boolean, points: Array<{date: string, price: number}>, stale?: boolean, message?: string }}
 */
const getChartData = async (symbol, period = "1M") => {
    const sym = normalize(symbol);
    // ── Handle 1D specially — Alpha Vantage daily data can't provide intraday ──
    if (period === "1D") {
        return {
            success: false,
            points: [],
            message: "Intraday (1D) data is not available. Please select a longer period.",
        };
    }

    const periodDays = { "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "5Y": 1825 };
    const days = periodDays[period] || 30;

    // ── DEV_MODE: return mock data ──
    if (DEV_MODE) {
        console.log(`[AlphaVantage] DEV_MODE — returning mock chart for ${sym}`);
        const mockPoints = generateMockChartData();
        return { success: true, points: sliceByDays(mockPoints, days) };
    }

    // ── Check cache first (full dataset stored per symbol) ──
    const cached = cache.get("chart", sym);
    if (cached) {
        return { success: true, points: sliceByDays(cached.data, days) };
    }

    // ── Deduplicate concurrent requests for same symbol ──
    return dedupe(`chart:${sym}`, async () => {
        try {
            console.log(`[AlphaVantage] Fetching daily data for ${sym}...`);
            const { data } = await axios.get(BASE_URL, {
                params: {
                    function: "TIME_SERIES_DAILY",
                    symbol: sym,
                    apikey: API_KEY,
                },
            });

            // ── Handle API-specific errors ──
            if (data["Note"]) {
                console.log(`[AlphaVantage] Rate limit hit for ${sym}`);
                // Fallback: try stale cache
                const stale = cache.getStale("chart", sym);
                if (stale) {
                    return { success: true, points: sliceByDays(stale, days), stale: true };
                }
                return {
                    success: false,
                    points: [],
                    message: "API rate limit reached. Please try again in a minute.",
                };
            }

            if (data["Error Message"]) {
                return { success: false, points: [], message: `Invalid symbol: ${sym}` };
            }

            // ── Handle "Information" key (wrong endpoint, empty key, etc.) ──
            if (data["Information"]) {
                console.log(`[AlphaVantage] API info message: ${data["Information"]}`);
                const stale = cache.getStale("chart", sym);
                if (stale) {
                    return { success: true, points: sliceByDays(stale, days), stale: true };
                }
                return {
                    success: false,
                    points: [],
                    message: "API limit reached or invalid API key. Please check configuration.",
                };
            }

            const timeSeries = data["Time Series (Daily)"];
            if (!timeSeries || Object.keys(timeSeries).length === 0) {
                return { success: false, points: [], message: "No historical data available." };
            }

            // ── Convert to array sorted oldest→newest ──
            const allPoints = Object.entries(timeSeries)
                .map(([date, values]) => ({
                    date,
                    price: parseFloat(values["4. close"]),
                }))
                .sort((a, b) => a.date.localeCompare(b.date));

            // ── Store full dataset in cache (serves all period ranges) ──
            cache.set("chart", sym, allPoints);
            return { success: true, points: sliceByDays(allPoints, days) };
        } catch (error) {
            console.error(`[AlphaVantage] Error fetching ${sym}:`, error.message);
            // Fallback: try stale cache
            const stale = cache.getStale("chart", sym);
            if (stale) {
                return { success: true, points: sliceByDays(stale, days), stale: true };
            }
            throw error;
        }
    });
};

/**
 * Slice the full data array to only include points within the last N calendar days.
 */
function sliceByDays(allPoints, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return allPoints.filter(p => p.date >= cutoffStr);
}

module.exports = { getChartData };