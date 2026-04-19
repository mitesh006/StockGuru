require("dotenv").config();
const axios = require("axios");
const cache = require("../utils/cacheManager");
const { dedupe } = require("../utils/requestDeduplicator");
const { normalize } = require("../utils/symbolNormalizer");

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = "https://www.alphavantage.co/query";
const NODE_ENV = process.env.NODE_ENV

// Generate 365 days of random-walk prices for local development
function generateMockChartData() {
    const points = [];
    const today = new Date();
    let price = 150;
    for (let i = 365; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        if (date.getDay() === 0 || date.getDay() === 6) continue;
        price += (Math.random() - 0.48) * 3;
        price = Math.max(80, Math.min(250, price));
        points.push({
            date: date.toISOString().split("T")[0],
            price: parseFloat(price.toFixed(2)),
        });
    }
    return points;
}

/**
 * Fetch daily chart data. Full dataset is cached per symbol;
 * period slicing happens locally so one API call serves all ranges.
 */
const getChartData = async (symbol, period = "1M") => {
    const sym = normalize(symbol);

    // Alpha Vantage daily data can't provide intraday
    if (period === "1D") {
        return {
            success: false,
            points: [],
            message: "Intraday (1D) data is not available. Please select a longer period.",
        };
    }

    const periodDays = { "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "5Y": 1825 };
    const days = periodDays[period] || 30;

    if (NODE_ENV === "development") {
        const mockPoints = generateMockChartData();
        return { success: true, points: sliceByDays(mockPoints, days) };
    }

    const cached = cache.get("chart", sym);
    if (cached) {
        return { success: true, points: sliceByDays(cached.data, days) };
    }

    return dedupe(`chart:${sym}`, async () => {
        try {
            const { data } = await axios.get(BASE_URL, {
                params: {
                    function: "TIME_SERIES_DAILY",
                    symbol: sym,
                    apikey: API_KEY,
                },
            });

            // Rate limit — try stale cache
            if (data["Note"]) {
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

            // API info/warning — try stale cache
            if (data["Information"]) {
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

            // Sort oldest→newest for chart rendering
            const allPoints = Object.entries(timeSeries)
                .map(([date, values]) => ({
                    date,
                    price: parseFloat(values["4. close"]),
                }))
                .sort((a, b) => a.date.localeCompare(b.date));

            // Cache full dataset — serves all period ranges
            cache.set("chart", sym, allPoints);
            return { success: true, points: sliceByDays(allPoints, days) };
        } catch (error) {
            const stale = cache.getStale("chart", sym);
            if (stale) {
                return { success: true, points: sliceByDays(stale, days), stale: true };
            }
            throw error;
        }
    });
};

function sliceByDays(allPoints, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return allPoints.filter(p => p.date >= cutoffStr);
}

module.exports = { getChartData };