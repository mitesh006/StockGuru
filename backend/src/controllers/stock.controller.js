/**
 * stock.controller.js — Stock detail + chart endpoints
 *
 * WHAT CHANGED (Refactor):
 * - Uses symbolNormalizer for consistent symbol handling
 * - Uses apiErrorHandler for structured error responses
 * - Returns proper HTTP status codes (429, 404, 500)
 * - Adds stale-cache fallback with { stale: true } flag
 * - Finnhub calls are now cached/deduped inside finnhub.service.js
 * - Alpha Vantage calls are now cached/deduped inside alphaVantage.service.js
 *
 * UNCHANGED: Response shape is identical — frontend doesn't need changes.
 */

const stocks = require("../data/stocks.json");
const { getQuote, getProfile, getMetrics } = require("../services/finnhub.service");
const { getChartData: fetchChartData } = require("../services/alphaVantage.service");
const { normalize, isValid } = require("../utils/symbolNormalizer");
const { classify } = require("../utils/apiErrorHandler");

/**
 * GET /api/stocks/:symbol
 * Fetch stock quote, company profile, and metrics from Finnhub.
 * All three calls are cached + deduplicated inside the service layer.
 */
const getStockDetails = async (req, res) => {
    try {
        const sym = normalize(req.params.symbol);

        // Basic validation before hitting any API
        if (!isValid(sym)) {
            return res.status(400).json({
                success: false,
                message: `"${req.params.symbol}" is not a valid stock symbol.`,
            });
        }

        // Verify symbol exists in our local list
        const stock = stocks.find(s => s.symbol.toUpperCase() === sym);
        if (!stock) {
            return res.status(404).json({
                success: false,
                message: `"${sym}" not found in stock list.`,
            });
        }

        // Call all three Finnhub APIs in parallel
        // (each is individually cached + deduplicated in the service layer)
        const [quote, profile, metrics] = await Promise.all([
            getQuote(sym),
            getProfile(sym),
            getMetrics(sym),
        ]);

        const result = {
            symbol: sym,
            price: quote.price,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            previousClose: quote.previousClose,
            company: {
                name: profile.name,
                industry: profile.industry,
                marketCap: profile.marketCap,
                logo: profile.logo,
            },
            currentMetrics: metrics.currentMetrics,
            annualFundamentals: metrics.annualFundamentals,
            quarterlyFundamentals: metrics.quarterlyFundamentals,
        };

        res.json({ success: true, data: result });
    } catch (error) {
        console.error("Stock details error:", error.message);
        const err = classify(error, "finnhub");
        res.status(err.status).json({
            success: false,
            message: err.message,
            errorType: err.type,
        });
    }
};

/**
 * GET /api/stocks/:symbol/candles?period=1M
 * Fetch chart data from Alpha Vantage.
 * The service layer caches full datasets and slices by period locally.
 */
const getChartData = async (req, res) => {
    try {
        const sym = normalize(req.params.symbol);
        const { period } = req.query; // 1W, 1M, 6M, 1Y

        if (!isValid(sym)) {
            return res.status(400).json({
                success: false,
                message: `"${req.params.symbol}" is not a valid stock symbol.`,
            });
        }

        const result = await fetchChartData(sym, period || "1M");

        if (!result.success) {
            return res.status(200).json({
                success: true,
                points: [],
                message: result.message,
            });
        }

        res.json({
            success: true,
            points: result.points,
            stale: result.stale || false, // true when serving stale cache after API failure
        });
    } catch (error) {
        console.error("Chart data error:", error.message);
        const err = classify(error, "alphavantage");
        res.status(err.status).json({
            success: false,
            message: err.message,
            errorType: err.type,
        });
    }
};

module.exports = { getStockDetails, getChartData };
