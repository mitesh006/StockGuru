const express = require("express");
const { searchStocks } = require("../controllers/search.controller");
const { getStockDetails, getChartData } = require("../controllers/stock.controller");
const { getTickerData, getMarketOverview, getTrendingStocks } = require("../controllers/dashboard.controller");

const router = express.Router();

router.get("/search", searchStocks);

// Dashboard endpoints (must be before /:symbol catch-all)
router.get("/ticker",   getTickerData);
router.get("/overview", getMarketOverview);
router.get("/trending", getTrendingStocks);

router.get("/:symbol/candles", getChartData);
router.get("/:symbol", getStockDetails);

module.exports = router;
