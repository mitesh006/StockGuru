const Watchlist = require("../models/Watchlist");
const stocks = require("../data/stocks.json");
const { getQuote } = require("../services/finnhub.service");
const { normalize, isValid } = require("../utils/symbolNormalizer");

const getWatchlist = async (req, res) => {
    try {
        const entries = await Watchlist.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .lean();

        if (entries.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const enriched = await Promise.allSettled(
            entries.map(async (entry) => {
                try {
                    const q = await getQuote(entry.symbol);
                    const stockInfo = stocks.find(
                        (s) => s.symbol.toUpperCase() === entry.symbol
                    );
                    const change = q.price - q.previousClose;
                    const pct = q.previousClose
                        ? (change / q.previousClose) * 100
                        : 0;

                    return {
                        symbol: entry.symbol,
                        name: stockInfo?.name || entry.symbol,
                        price: q.price,
                        change: parseFloat(change.toFixed(2)),
                        changePercent: parseFloat(pct.toFixed(2)),
                        addedAt: entry.createdAt,
                    };
                } catch {
                    // Return symbol with null prices if quote fetch fails
                    const stockInfo = stocks.find(
                        (s) => s.symbol.toUpperCase() === entry.symbol
                    );
                    return {
                        symbol: entry.symbol,
                        name: stockInfo?.name || entry.symbol,
                        price: null,
                        change: null,
                        changePercent: null,
                        addedAt: entry.createdAt,
                    };
                }
            })
        );

        const data = enriched
            .filter((r) => r.status === "fulfilled")
            .map((r) => r.value);

        res.json({ success: true, data });
    } catch {
        res.status(500).json({
            success: false,
            message: "Failed to load watchlist.",
        });
    }
};

const addToWatchlist = async (req, res) => {
    try {
        const sym = normalize(req.body.symbol);

        if (!isValid(sym)) {
            return res.status(400).json({
                success: false,
                message: `"${req.body.symbol}" is not a valid stock symbol.`,
            });
        }

        const stockInfo = stocks.find(
            (s) => s.symbol.toUpperCase() === sym
        );
        if (!stockInfo) {
            return res.status(404).json({
                success: false,
                message: `"${sym}" not found in our stock database.`,
            });
        }

        await Watchlist.create({ user: req.user._id, symbol: sym });

        res.status(201).json({
            success: true,
            message: `${sym} added to watchlist.`,
            symbol: sym,
        });
    } catch (error) {
        // MongoDB duplicate key error
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: `${normalize(req.body.symbol)} is already in your watchlist.`,
            });
        }
        res.status(500).json({
            success: false,
            message: "Failed to add stock to watchlist.",
        });
    }
};

const removeFromWatchlist = async (req, res) => {
    try {
        const sym = normalize(req.params.symbol);

        const result = await Watchlist.deleteOne({
            user: req.user._id,
            symbol: sym,
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: `${sym} was not in your watchlist.`,
            });
        }

        res.json({
            success: true,
            message: `${sym} removed from watchlist.`,
            symbol: sym,
        });
    } catch {
        res.status(500).json({
            success: false,
            message: "Failed to remove stock from watchlist.",
        });
    }
};

const checkWatchlist = async (req, res) => {
    try {
        const sym = normalize(req.params.symbol);

        const exists = await Watchlist.findOne({
            user: req.user._id,
            symbol: sym,
        });

        res.json({
            success: true,
            inWatchlist: !!exists,
            symbol: sym,
        });
    } catch {
        res.status(500).json({
            success: false,
            message: "Failed to check watchlist status.",
        });
    }
};

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist, checkWatchlist };
