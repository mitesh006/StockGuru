const { getQuote } = require("../services/finnhub.service");

const TICKER_SYMBOLS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "META"];
const INDEX_SYMBOLS  = [
    { symbol: "SPY",  label: "S&P 500" },
    { symbol: "QQQ",  label: "NASDAQ" },
    { symbol: "DIA",  label: "DOW JONES" },
];
const TRENDING_SYMBOLS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "META"];

/**
 * GET /api/stocks/ticker
 * Returns quotes for ticker bar stocks.
 */
const getTickerData = async (req, res) => {
    try {
        const results = await Promise.allSettled(
            TICKER_SYMBOLS.map(async (sym) => {
                const q = await getQuote(sym);
                const change = q.price - q.previousClose;
                const pct = q.previousClose ? (change / q.previousClose) * 100 : 0;
                return {
                    symbol: sym,
                    price: q.price,
                    change: parseFloat(change.toFixed(2)),
                    changePercent: parseFloat(pct.toFixed(2)),
                };
            })
        );

        const data = results
            .filter(r => r.status === "fulfilled")
            .map(r => r.value);

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/stocks/overview
 * Returns quotes for market overview indices (SPY, QQQ, DIA).
 */
const getMarketOverview = async (req, res) => {
    try {
        const results = await Promise.allSettled(
            INDEX_SYMBOLS.map(async ({ symbol, label }) => {
                const q = await getQuote(symbol);
                const change = q.price - q.previousClose;
                const pct = q.previousClose ? (change / q.previousClose) * 100 : 0;
                return {
                    symbol,
                    label,
                    price: q.price,
                    change: parseFloat(change.toFixed(2)),
                    changePercent: parseFloat(pct.toFixed(2)),
                };
            })
        );

        const data = results
            .filter(r => r.status === "fulfilled")
            .map(r => r.value);

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/stocks/trending
 * Returns quotes for trending stock cards.
 */
const getTrendingStocks = async (req, res) => {
    try {
        const results = await Promise.allSettled(
            TRENDING_SYMBOLS.map(async (sym) => {
                const q = await getQuote(sym);
                const change = q.price - q.previousClose;
                const pct = q.previousClose ? (change / q.previousClose) * 100 : 0;
                return {
                    symbol: sym,
                    price: q.price,
                    change: parseFloat(change.toFixed(2)),
                    changePercent: parseFloat(pct.toFixed(2)),
                };
            })
        );

        const data = results
            .filter(r => r.status === "fulfilled")
            .map(r => r.value);

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getTickerData, getMarketOverview, getTrendingStocks };
