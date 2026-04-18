const express = require("express");
const { protect } = require("../middleware/auth.middleware");
const {
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    checkWatchlist,
} = require("../controllers/watchlist.controller");

const router = express.Router();

router.use(protect);

router.get("/", getWatchlist);
router.post("/", addToWatchlist);
router.get("/check/:symbol", checkWatchlist);
router.delete("/:symbol", removeFromWatchlist);

module.exports = router;
