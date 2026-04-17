"""
predict_stock.py — Dual-Mode Stock Price Prediction
=====================================================
Supports two investment horizons:
  • short  → next-day estimate using recent price action
  • long   → 30-day outlook using broader trend analysis

Techniques used (keep it simple & explainable):
  1. Moving Averages (MA crossover for trend direction)
  2. Linear Regression (sklearn) for price projection
  3. Volatility (standard deviation) for confidence & range

Input  (JSON via stdin):
  { "prices": [float, ...], "mode": "short" | "long" }

Output (JSON via stdout):
  { "success": true, "mode": "...", "trend": "...",
    "predictedPrice": float, "predictedRange": { "low": ..., "high": ... },
    "confidence": int, "explanation": "...",
    "indicators": { "maShort": ..., "maLong": ..., "slope": ..., "volatility": ... } }
"""

import sys
import json
import numpy as np
from sklearn.linear_model import LinearRegression


# ═══════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════

def moving_average(data, window):
    """Calculate simple moving average over the last `window` points."""
    if len(data) < window:
        return sum(data) / len(data)
    return sum(data[-window:]) / window


def compute_volatility(prices, window=None):
    """Standard deviation of the most recent `window` prices."""
    if window and len(prices) >= window:
        return float(np.std(prices[-window:]))
    return float(np.std(prices))


def linear_regression_predict(prices, forward_steps=1):
    """
    Fit a linear regression on the price series and predict
    `forward_steps` into the future.
    Returns: (predicted_price, slope, r_squared)
    """
    x = np.arange(len(prices)).reshape(-1, 1)
    y = np.array(prices).reshape(-1, 1)

    model = LinearRegression()
    model.fit(x, y)

    future_x = np.array([[len(prices) - 1 + forward_steps]])
    predicted = float(model.predict(future_x)[0][0])
    slope = float(model.coef_[0][0])

    # R² score — measures how well the linear fit explains the data
    r_squared = float(model.score(x, y))

    return predicted, slope, r_squared


# ═══════════════════════════════════════════
# MODE CONFIGURATIONS
# ═══════════════════════════════════════════

MODE_CONFIG = {
    "short": {
        "ma_short_window": 5,       # Fast moving average
        "ma_long_window": 10,       # Slow moving average
        "regression_window": 30,    # Use last 30 days for regression
        "forward_steps": 1,         # Predict 1 day ahead
        "volatility_window": 10,    # Recent volatility
        "label": "Short-Term",
        "explanation_template": (
            "Based on {ma_short}/{ma_long}-day moving averages, "
            "recent momentum, and short-term linear trend estimation."
        ),
    },
    "long": {
        "ma_short_window": 20,      # Fast moving average
        "ma_long_window": 50,       # Slow moving average
        "regression_window": None,  # Use all available data
        "forward_steps": 30,        # Predict 30 days ahead
        "volatility_window": 30,    # Broader volatility
        "label": "Long-Term",
        "explanation_template": (
            "Based on {ma_short}/{ma_long}-day moving averages, "
            "broader trend direction, and long-term linear regression."
        ),
    },
}


# ═══════════════════════════════════════════
# MAIN PREDICTION FUNCTION
# ═══════════════════════════════════════════

def predict(prices, mode="short"):
    """
    Run prediction in the given mode.
    Returns a dict with trend, predicted price, range, confidence, etc.
    """
    # ── Validate input ──
    if len(prices) < 5:
        return {
            "success": False,
            "message": "Not enough data for prediction (need at least 5 data points)."
        }

    config = MODE_CONFIG.get(mode, MODE_CONFIG["short"])
    prices = np.array(prices, dtype=float)

    # ── 1. Moving Averages ──
    ma_short = moving_average(prices.tolist(), config["ma_short_window"])
    ma_long = moving_average(prices.tolist(), config["ma_long_window"])

    # ── 2. Select regression window ──
    reg_window = config["regression_window"]
    if reg_window and len(prices) > reg_window:
        reg_prices = prices[-reg_window:]
    else:
        reg_prices = prices

    # ── 3. Linear Regression ──
    forward_steps = config["forward_steps"]
    predicted_price, slope, r_squared = linear_regression_predict(
        reg_prices.tolist(), forward_steps
    )

    # ── 4. Trend determination (MA crossover + slope) ──
    if ma_short > ma_long and slope > 0:
        trend = "Bullish"
    elif ma_short < ma_long and slope < 0:
        trend = "Bearish"
    else:
        trend = "Sideways"

    # ── 5. Volatility & predicted range ──
    vol_window = config["volatility_window"]
    volatility = compute_volatility(prices.tolist(), vol_window)

    # Scale range by forward_steps (longer horizon = wider range)
    range_factor = np.sqrt(forward_steps)  # volatility scales with sqrt of time
    range_spread = volatility * range_factor

    lower_range = round(predicted_price - range_spread, 2)
    upper_range = round(predicted_price + range_spread, 2)

    # ── 6. Confidence score (35–85 range) ──
    confidence = 50

    # Trend agreement bonus
    recent_return = ((prices[-1] - prices[0]) / prices[0]) * 100
    if trend == "Bullish" and recent_return > 0:
        confidence += 10
    elif trend == "Bearish" and recent_return < 0:
        confidence += 10

    # Strong slope bonus
    if abs(slope) > 0.3:
        confidence += 8

    # R² bonus — higher means the trend line fits well
    if r_squared > 0.7:
        confidence += 10
    elif r_squared > 0.4:
        confidence += 5

    # Low volatility bonus
    if volatility < 3:
        confidence += 7
    elif volatility < 6:
        confidence += 3
    elif volatility > 12:
        confidence -= 5

    # Clamp to safe range
    confidence = max(35, min(confidence, 85))

    # ── 7. Build explanation ──
    explanation = config["explanation_template"].format(
        ma_short=config["ma_short_window"],
        ma_long=config["ma_long_window"]
    )

    # ── 8. Return result ──
    return {
        "success": True,
        "mode": mode,
        "trend": trend,
        "predictedPrice": round(predicted_price, 2),
        "predictedRange": {
            "low": lower_range,
            "high": upper_range
        },
        "confidence": confidence,
        "explanation": explanation,
        "indicators": {
            "maShort": round(ma_short, 2),
            "maLong": round(ma_long, 2),
            "recentReturn": round(float(recent_return), 2),
            "slope": round(slope, 4),
            "volatility": round(volatility, 2),
            "rSquared": round(r_squared, 4)
        }
    }


# ═══════════════════════════════════════════
# ENTRY POINT — reads JSON from stdin
# ═══════════════════════════════════════════

if __name__ == "__main__":
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
        prices = data.get("prices", [])
        mode = data.get("mode", "short")  # default to short-term

        result = predict(prices, mode)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": str(e)
        }))