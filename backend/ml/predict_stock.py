"""
predict_stock.py — Dual-mode stock price prediction

Modes:
  short — next-day estimate using recent price action
  long  — 30-day outlook using broader trend analysis

Input  (JSON via stdin): { "prices": [float, ...], "mode": "short" | "long" }
Output (JSON via stdout): { "success": true, "trend": "...", "predictedPrice": float, ... }
"""

import sys
import json
import numpy as np
from sklearn.linear_model import LinearRegression


def moving_average(data, window):
    if len(data) < window:
        return sum(data) / len(data)
    return sum(data[-window:]) / window


def compute_volatility(prices, window=None):
    if window and len(prices) >= window:
        return float(np.std(prices[-window:]))
    return float(np.std(prices))


def linear_regression_predict(prices, forward_steps=1):
    x = np.arange(len(prices)).reshape(-1, 1)
    y = np.array(prices).reshape(-1, 1)

    model = LinearRegression()
    model.fit(x, y)

    future_x = np.array([[len(prices) - 1 + forward_steps]])
    predicted = float(model.predict(future_x)[0][0])
    slope = float(model.coef_[0][0])
    r_squared = float(model.score(x, y))

    return predicted, slope, r_squared


MODE_CONFIG = {
    "short": {
        "ma_short_window": 5,
        "ma_long_window": 10,
        "regression_window": 30,
        "forward_steps": 1,
        "volatility_window": 10,
        "label": "Short-Term",
        "explanation_template": (
            "Based on {ma_short}/{ma_long}-day moving averages, "
            "recent momentum, and short-term linear trend estimation."
        ),
    },
    "long": {
        "ma_short_window": 20,
        "ma_long_window": 50,
        "regression_window": None,  # use all available data
        "forward_steps": 30,
        "volatility_window": 30,
        "label": "Long-Term",
        "explanation_template": (
            "Based on {ma_short}/{ma_long}-day moving averages, "
            "broader trend direction, and long-term linear regression."
        ),
    },
}


def predict(prices, mode="short"):
    if len(prices) < 5:
        return {
            "success": False,
            "message": "Not enough data for prediction (need at least 5 data points)."
        }

    config = MODE_CONFIG.get(mode, MODE_CONFIG["short"])
    prices = np.array(prices, dtype=float)

    ma_short = moving_average(prices.tolist(), config["ma_short_window"])
    ma_long = moving_average(prices.tolist(), config["ma_long_window"])

    reg_window = config["regression_window"]
    reg_prices = prices[-reg_window:] if reg_window and len(prices) > reg_window else prices

    forward_steps = config["forward_steps"]
    predicted_price, slope, r_squared = linear_regression_predict(
        reg_prices.tolist(), forward_steps
    )

    # Trend: MA crossover + slope direction
    if ma_short > ma_long and slope > 0:
        trend = "Bullish"
    elif ma_short < ma_long and slope < 0:
        trend = "Bearish"
    else:
        trend = "Sideways"

    vol_window = config["volatility_window"]
    volatility = compute_volatility(prices.tolist(), vol_window)

    # Wider range for longer horizons (volatility scales with sqrt of time)
    range_factor = np.sqrt(forward_steps)
    range_spread = volatility * range_factor

    lower_range = round(predicted_price - range_spread, 2)
    upper_range = round(predicted_price + range_spread, 2)

    # Confidence score (clamped 35–85)
    confidence = 50

    recent_return = ((prices[-1] - prices[0]) / prices[0]) * 100
    if trend == "Bullish" and recent_return > 0:
        confidence += 10
    elif trend == "Bearish" and recent_return < 0:
        confidence += 10

    if abs(slope) > 0.3:
        confidence += 8

    if r_squared > 0.7:
        confidence += 10
    elif r_squared > 0.4:
        confidence += 5

    if volatility < 3:
        confidence += 7
    elif volatility < 6:
        confidence += 3
    elif volatility > 12:
        confidence -= 5

    confidence = max(35, min(confidence, 85))

    explanation = config["explanation_template"].format(
        ma_short=config["ma_short_window"],
        ma_long=config["ma_long_window"]
    )

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


if __name__ == "__main__":
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
        prices = data.get("prices", [])
        mode = data.get("mode", "short")

        result = predict(prices, mode)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": str(e)
        }))