const { getChartData } = require("../services/alphaVantage.service");

const MODE_PERIODS = {
    short: "3M",
    long:  "1Y",
};

function extractClose(candle) {
    const raw = candle.price ?? candle.close ?? candle.c ?? null;
    if (raw === null || raw === undefined) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
}

// Pure-JS statistical prediction — replaces the Python ML script.
// Uses linear regression + RSI momentum for a lightweight but meaningful signal.
function runJsPredict(prices, mode) {
    const n = prices.length;

    // ── Linear Regression ──────────────────────────────────────────────────
    const xs = Array.from({ length: n }, (_, i) => i);
    const meanX = xs.reduce((s, x) => s + x, 0) / n;
    const meanY = prices.reduce((s, y) => s + y, 0) / n;
    const ssXX  = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
    const ssXY  = xs.reduce((s, x, i) => s + (x - meanX) * (prices[i] - meanY), 0);
    const slope = ssXX !== 0 ? ssXY / ssXX : 0;

    const horizon = mode === "long" ? Math.round(n * 0.25) : Math.round(n * 0.1);
    const predictedPrice = +(meanY + slope * (n - 1 - meanX + horizon)).toFixed(2);

    // ── RSI (14-period) ────────────────────────────────────────────────────
    const period = 14;
    let gains = 0, losses = 0;
    const slice = prices.slice(-Math.min(period + 1, n));
    for (let i = 1; i < slice.length; i++) {
        const diff = slice[i] - slice[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    // ── Trend & confidence ─────────────────────────────────────────────────
    const last = prices[n - 1];
    const changePct = ((predictedPrice - last) / last) * 100;

    let trend;
    if      (changePct >  2) trend = "Bullish";
    else if (changePct < -2) trend = "Bearish";
    else                     trend = "Neutral";

    // Confidence: higher when regression R² is strong and RSI isn't extreme
    const ssRes = prices.reduce((s, y, i) => s + (y - (meanY + slope * (i - meanX))) ** 2, 0);
    const ssTot = prices.reduce((s, y) => s + (y - meanY) ** 2, 0);
    const r2    = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
    const rsiFactor = rsi > 70 || rsi < 30 ? 0.85 : 1.0;
    const confidence = +(Math.min(95, Math.max(40, r2 * 100 * rsiFactor))).toFixed(1);

    // ── Predicted range ────────────────────────────────────────────────────
    const stdDev = Math.sqrt(prices.reduce((s, y) => s + (y - meanY) ** 2, 0) / n);
    const spread = stdDev * (mode === "long" ? 1.5 : 0.75);
    const predictedRange = {
        low:  +(predictedPrice - spread).toFixed(2),
        high: +(predictedPrice + spread).toFixed(2),
    };

    // ── Explanation ────────────────────────────────────────────────────────
    const direction = changePct >= 0 ? "upward" : "downward";
    const explanation =
        `Linear regression over ${n} data points projects an ${direction} move of ` +
        `${Math.abs(changePct).toFixed(1)}%. RSI of ${rsi.toFixed(0)} indicates ` +
        `${rsi > 70 ? "overbought" : rsi < 30 ? "oversold" : "neutral momentum"} conditions.`;

    return {
        success: true,
        mode,
        trend,
        predictedPrice,
        predictedRange,
        confidence,
        explanation,
        indicators: {
            rsi:   +rsi.toFixed(2),
            slope: +slope.toFixed(4),
            r2:    +r2.toFixed(4),
        },
    };
}


async function getPrediction(req, res) {
    const { symbol } = req.params;

    const rawMode = (req.query.mode || "short").toLowerCase();
    const mode = rawMode === "long" ? "long" : "short";
    const period = req.query.period || MODE_PERIODS[mode];

    try {
        const chartResult = await getChartData(symbol, period);

        if (!chartResult.success || !chartResult.points || chartResult.points.length === 0) {
            return res.status(404).json({
                success: false,
                message: chartResult.message || `No historical data found for symbol: ${symbol}`,
            });
        }

        const prices = chartResult.points
            .map(extractClose)
            .filter((p) => p !== null);

        if (prices.length < 5) {
            return res.status(400).json({
                success: false,
                message: `Insufficient price data for prediction. Need at least 5 data points, got ${prices.length}.`,
            });
        }

        const prediction = runJsPredict(prices, mode);

        if (!prediction.success) {
            return res.status(422).json({
                success: false,
                message: prediction.message || "Prediction model returned an error.",
            });
        }

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
        return res.status(500).json({
            success: false,
            message: "Prediction failed. Please try again later.",
            ...(process.env.NODE_ENV !== "production" && { error: error.message }),
        });
    }
}

module.exports = { getPrediction };
