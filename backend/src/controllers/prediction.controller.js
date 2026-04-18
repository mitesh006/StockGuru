const path = require("path");
const { spawn } = require("child_process");
const { getChartData } = require("../services/alphaVantage.service");

const PYTHON_SCRIPT = path.resolve(__dirname, "../../ml/predict_stock.py");

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

            try {
                resolve(JSON.parse(stdout));
            } catch {
                reject(
                    new Error(
                        `Python returned invalid JSON. ` +
                        `stdout: ${stdout.trim().slice(0, 200)}`
                    )
                );
            }
        });

        py.stdin.write(JSON.stringify({ prices, mode }));
        py.stdin.end();
    });
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

        const prediction = await runPythonPredict(prices, mode);

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
