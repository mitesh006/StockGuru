const express = require("express");
const { getPrediction } = require("../controllers/prediction.controller");

const router = express.Router();

// GET /api/stocks/:symbol/prediction?period=6M
router.get("/:symbol/prediction", getPrediction);

module.exports = router;
