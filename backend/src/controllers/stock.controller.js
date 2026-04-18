const stocks = require("../data/stocks.json");
const { getQuote, getProfile, getMetrics } = require("../services/finnhub.service");
const { getChartData: fetchChartData } = require("../services/alphaVantage.service");
const { normalize, isValid } = require("../utils/symbolNormalizer");
const { classify } = require("../utils/apiErrorHandler");

const getStockDetails = async (req, res) => {
    try {
        const sym = normalize(req.params.symbol);

        if (!isValid(sym)) {
            return res.status(400).json({
                success: false,
                message: `"${req.params.symbol}" is not a valid stock symbol.`,
            });
        }

        const stock = stocks.find(s => s.symbol.toUpperCase() === sym);
        if (!stock) {
            return res.status(404).json({
                success: false,
                message: `"${sym}" not found in stock list.`,
            });
        }

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
        const err = classify(error, "finnhub");
        res.status(err.status).json({
            success: false,
            message: err.message,
            errorType: err.type,
        });
    }
};

const getChartData = async (req, res) => {
    try {
        const sym = normalize(req.params.symbol);
        const { period } = req.query;

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
            stale: result.stale || false,
        });
    } catch (error) {
        const err = classify(error, "alphavantage");
        res.status(err.status).json({
            success: false,
            message: err.message,
            errorType: err.type,
        });
    }
};

module.exports = { getStockDetails, getChartData };
