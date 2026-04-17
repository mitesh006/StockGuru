/**
 * prediction.controller.js — ML Prediction Controller
 *
 * Connects the Node.js backend with the Python prediction script.
 * Flow:
 *   1. Fetch historical chart data via AlphaVantage service
 *   2. Extract closing prices from candle objects (supports { price }, { close }, { c })
 *   3. Pipe prices into `backend/ml/predict_stock.py` via child_process.spawn
 *   4. Parse Python's JSON stdout and return it as the API response
 */

const path = require("path");
const { spawn } = require("child_process");
const { getChartData } = require("../services/alphaVantage.service");

// Absolute path to the Python prediction script
const PYTHON_SCRIPT = path.resolve(__dirname, "../../ml/predict_stock.py");

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Extract the closing price from a single candle object.
 * Supports multiple field conventions:
 *   { price }  — used by AlphaVantage service
 *   { close }  — common candle format
 *   { c }      — compact / Finnhub-style
 *
 * @param {Object} candle
 * @returns {number|null}
 */
function extractClose(candle) {
    const raw = candle.price ?? candle.close ?? candle.c ?? null;
    if (raw === null || raw === undefined) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
}

/**
 * Spawn the Python prediction script, write JSON to stdin, and collect stdout/stderr.
 * Returns a Promise that resolves with the parsed JSON output.
 *
 * @param {number[]} prices - Array of closing prices
 * @returns {Promise<Object>}
 */
function runPythonPredict(prices) {
    return new Promise((resolve, reject) => {
        const py = spawn("python", [PYTHON_SCRIPT], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        py.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        py.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

        py.on("error", (err) => {
            reject(new Error(`Failed to start Python process: ${err.message}`));
        });

        py.on("close", (code) => {
            if (code !== 0) {
                return reject(
                    new Error(
                        `Python script exited with code ${code}. ` +
                        `stderr: ${stderr.trim() || "(empty)"}`
                    )
                );
            }

            // Parse JSON output from Python
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch {
                reject(
                    new Error(
                        `Python returned invalid JSON. ` +
                        `stdout: ${stdout.trim().slice(0, 200)}`
                    )
                );
            }
        });

        // Write the prices payload to stdin and close the stream
        py.stdin.write(JSON.stringify({ prices }));
        py.stdin.end();
    });
}

// ═══════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════

/**
 * GET /api/stocks/:symbol/prediction
 *
 * Query params (optional):
 *   ?period=1M  — chart period to use for historical data (default "6M")
 *
 * Response (200):
 * {
 *   success: true,
 *   symbol: "AAPL",
 *   trend: "Bullish",
 *   predictedPrice: 189.42,
 *   predictedRange: { low: 185.10, high: 193.74 },
 *   confidence: 72,
 *   indicators: { ma5, ma20, recentReturn, slope, volatility },
 *   dataPoints: 120
 * }
 */
async function getPrediction(req, res) {
    const { symbol } = req.params;
    const period = req.query.period || "6M";

    try {
        // ── 1. Fetch historical chart data ──
        console.log(`[Prediction] Fetching chart data for ${symbol} (${period})...`);
        const chartResult = await getChartData(symbol, period);

        if (!chartResult.success || !chartResult.points || chartResult.points.length === 0) {
            return res.status(404).json({
                success: false,
                message: chartResult.message || `No historical data found for symbol: ${symbol}`,
            });
        }

        // ── 2. Extract closing prices ──
        const prices = chartResult.points
            .map(extractClose)
            .filter((p) => p !== null);

        if (prices.length < 5) {
            return res.status(400).json({
                success: false,
                message: `Insufficient price data for prediction. Need at least 5 data points, got ${prices.length}.`,
            });
        }

        // ── 3. Run Python prediction ──
        console.log(`[Prediction] Running ML prediction on ${prices.length} data points...`);
        const prediction = await runPythonPredict(prices);

        if (!prediction.success) {
            return res.status(422).json({
                success: false,
                message: prediction.message || "Prediction model returned an error.",
            });
        }

        // ── 4. Return combined response ──
        return res.json({
            success: true,
            symbol: symbol.toUpperCase(),
            trend: prediction.trend,
            predictedPrice: prediction.predictedPrice,
            predictedRange: prediction.predictedRange,
            confidence: prediction.confidence,
            indicators: prediction.indicators,
            dataPoints: prices.length,
        });
    } catch (error) {
        console.error(`[Prediction] Error for ${symbol}:`, error.message);
        return res.status(500).json({
            success: false,
            message: "Prediction failed. Please try again later.",
            ...(process.env.NODE_ENV !== "production" && { error: error.message }),
        });
    }
}

module.exports = { getPrediction };
