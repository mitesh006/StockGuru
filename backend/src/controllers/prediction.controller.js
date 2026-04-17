/**
 * prediction.controller.js — ML Prediction Controller
 *
 * Connects the Node.js backend with the Python prediction script.
 * Supports dual investment-horizon modes: "short" and "long".
 *
 * Flow:
 *   1. Read ?mode=short|long from query params
 *   2. Fetch historical chart data (3M for short, 1Y for long)
 *   3. Extract closing prices from candle objects
 *   4. Pipe { prices, mode } into `backend/ml/predict_stock.py` via child_process.spawn
 *   5. Parse Python's JSON stdout and return it as the API response
 */

const path = require("path");
const { spawn } = require("child_process");
const { getChartData } = require("../services/alphaVantage.service");

// Absolute path to the Python prediction script
const PYTHON_SCRIPT = path.resolve(__dirname, "../../ml/predict_stock.py");

// Period to fetch based on horizon mode
const MODE_PERIODS = {
    short: "3M",   // ~90 days of daily prices for short-term analysis
    long:  "1Y",   // ~365 days for long-term trend analysis
};

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
 * @param {string} mode - "short" or "long"
 * @returns {Promise<Object>}
 */
function runPythonPredict(prices, mode) {
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

        // Write the prices + mode payload to stdin and close the stream
        py.stdin.write(JSON.stringify({ prices, mode }));
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
 *   ?mode=short  — short-term prediction (default)
 *   ?mode=long   — long-term prediction
 *   ?period=6M   — override chart period (rarely needed)
 *
 * Response (200):
 * {
 *   success: true,
 *   symbol: "AAPL",
 *   mode: "short",
 *   trend: "Bullish",
 *   predictedPrice: 189.42,
 *   predictedRange: { low: 185.10, high: 193.74 },
 *   confidence: 72,
 *   explanation: "Based on 5/10-day moving averages...",
 *   indicators: { maShort, maLong, recentReturn, slope, volatility, rSquared },
 *   dataPoints: 90
 * }
 */
async function getPrediction(req, res) {
    const { symbol } = req.params;

    // ── Validate mode ──
    const rawMode = (req.query.mode || "short").toLowerCase();
    const mode = rawMode === "long" ? "long" : "short";

    // Use explicit period if provided, otherwise derive from mode
    const period = req.query.period || MODE_PERIODS[mode];

    try {
        // ── 1. Fetch historical chart data ──
        console.log(`[Prediction] Fetching chart data for ${symbol} (${period}, mode=${mode})...`);
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

        // ── 3. Run Python prediction with mode ──
        console.log(`[Prediction] Running ${mode}-term prediction on ${prices.length} data points...`);
        const prediction = await runPythonPredict(prices, mode);

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
            mode: prediction.mode || mode,
            trend: prediction.trend,
            predictedPrice: prediction.predictedPrice,
            predictedRange: prediction.predictedRange,
            confidence: prediction.confidence,
            explanation: prediction.explanation,
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
