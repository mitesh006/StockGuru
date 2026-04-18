const express = require("express");
const { getPrediction } = require("../controllers/prediction.controller");

const router = express.Router();

router.get("/:symbol/prediction", getPrediction);

module.exports = router;
