const express = require("express");
const { protect } = require("../middleware/auth.middleware");
const {
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    checkWatchlist,
} = require("../controllers/watchlist.controller");

const router = express.Router();

// All watchlist routes require authentication
router.use(protect);

// GET  /api/watchlist              — fetch user's watchlist with live prices
router.get("/", getWatchlist);

// POST /api/watchlist              — add stock { symbol: "AAPL" }
router.post("/", addToWatchlist);

// GET  /api/watchlist/check/:symbol — check if symbol is in watchlist
router.get("/check/:symbol", checkWatchlist);

// DELETE /api/watchlist/:symbol    — remove stock from watchlist
router.delete("/:symbol", removeFromWatchlist);

module.exports = router;
