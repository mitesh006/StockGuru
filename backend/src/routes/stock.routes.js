const express = require("express");
const { searchStocks } = require("../controllers/search.controller");
const { getStockDetails } = require("../controllers/stock.controller");
const { getTickerData, getMarketOverview, getTrendingStocks } = require("../controllers/dashboard.controller");

const router = express.Router();

// GET /api/stocks/search?query=...  — search from local JSON
router.get("/search", searchStocks);

// Dashboard data endpoints (must be before /:symbol)
router.get("/ticker",   getTickerData);
router.get("/overview", getMarketOverview);
router.get("/trending", getTrendingStocks);

// GET /api/stocks/:symbol  — fetch stock details via Finnhub
router.get("/:symbol", getStockDetails);

module.exports = router;
