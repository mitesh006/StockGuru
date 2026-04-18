const { getQuote } = require("../services/finnhub.service");
const { classify } = require("../utils/apiErrorHandler");

// Ticker bar and trending cards share the same symbols
const DASHBOARD_SYMBOLS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "META"];
const INDEX_SYMBOLS = [
    { symbol: "SPY", label: "S&P 500" },
    { symbol: "QQQ", label: "NASDAQ" },
    { symbol: "DIA", label: "DOW JONES" },
];

// Batch cache so /ticker and /trending share one set of API calls
let dashboardQuotesCache = { data: null, fetchedAt: 0, promise: null };
const BATCH_TTL = 30 * 1000;

async function fetchDashboardQuotes() {
    const age = Date.now() - dashboardQuotesCache.fetchedAt;

    if (dashboardQuotesCache.data && age < BATCH_TTL) {
        return dashboardQuotesCache.data;
    }

    // Deduplicate: reuse in-flight batch if already running
    if (dashboardQuotesCache.promise) {
        return dashboardQuotesCache.promise;
    }

    dashboardQuotesCache.promise = (async () => {
        try {
            const results = await Promise.allSettled(
                DASHBOARD_SYMBOLS.map(async (sym) => {
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

            dashboardQuotesCache.data = data;
            dashboardQuotesCache.fetchedAt = Date.now();
            return data;
        } finally {
            dashboardQuotesCache.promise = null;
        }
    })();

    return dashboardQuotesCache.promise;
}

const getTickerData = async (req, res) => {
    try {
        const data = await fetchDashboardQuotes();
        res.json({ success: true, data });
    } catch (error) {
        const err = classify(error, "finnhub");
        res.status(err.status).json({ success: false, message: err.message, errorType: err.type });
    }
};

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
        const err = classify(error, "finnhub");
        res.status(err.status).json({ success: false, message: err.message, errorType: err.type });
    }
};

const getTrendingStocks = async (req, res) => {
    try {
        const data = await fetchDashboardQuotes();
        res.json({ success: true, data });
    } catch (error) {
        const err = classify(error, "finnhub");
        res.status(err.status).json({ success: false, message: err.message, errorType: err.type });
    }
};

module.exports = { getTickerData, getMarketOverview, getTrendingStocks };
