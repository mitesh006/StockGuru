const stocks = require("../data/stocks.json");
const { getQuote, getProfile, getMetrics } = require("../services/finnhub.service");

const getStockDetails = async (req, res) => {
    try {
        const { symbol } = req.params;
        const upperSymbol = symbol.toUpperCase();

        // Verify symbol exists in our local list
        const stock = stocks.find(s => s.symbol.toUpperCase() === upperSymbol);
        if (!stock) {
            return res.status(404).json({ success: false, message: `"${symbol}" not found in stock list.` });
        }

        // Call all three Finnhub APIs in parallel
        const [quote, profile, metrics] = await Promise.all([
            getQuote(upperSymbol),
            getProfile(upperSymbol),
            getMetrics(upperSymbol),
        ]);

        // Merge into a clean response
        const result = {
            symbol: upperSymbol,
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

        if (error.response && error.response.status === 429) {
            return res.status(429).json({ success: false, message: "API rate limit reached. Please try again later." });
        }

        res.status(500).json({ success: false, message: error.message || "Failed to fetch stock details." });
    }
};

module.exports = { getStockDetails };
