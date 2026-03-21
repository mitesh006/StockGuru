const stocks = require("../data/stocks.json");

const searchStocks = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || !query.trim()) {
            return res.status(400).json({ success: false, message: "Search query is required" });
        }

        const term = query.trim().toLowerCase();
        const results = stocks
            .filter(s => s.symbol.toLowerCase().includes(term) || s.name.toLowerCase().includes(term))
            .slice(0, 5)
            .map(({ symbol, name, sector }) => ({ symbol, name, sector }));

        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        res.status(500).json({ success: false, message: "Search failed" });
    }
};

module.exports = { searchStocks };
