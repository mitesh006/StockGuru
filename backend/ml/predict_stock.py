import sys
import json
import numpy as np
from sklearn.linear_model import LinearRegression


def moving_average(data, window):
    if len(data) < window:
        return sum(data) / len(data)
    return sum(data[-window:]) / window


def predict(prices):
    if len(prices) < 5:
        return {
            "success": False,
            "message": "Not enough data for prediction"
        }

    prices = np.array(prices, dtype=float)

    ma5 = moving_average(prices.tolist(), 5)
    ma20 = moving_average(prices.tolist(), 20 if len(prices) >= 20 else len(prices))

    recent_return = ((prices[-1] - prices[0]) / prices[0]) * 100

    x = np.arange(len(prices)).reshape(-1, 1)
    y = prices.reshape(-1, 1)

    model = LinearRegression()
    model.fit(x, y)

    next_day_index = np.array([[len(prices)]])
    next_price = float(model.predict(next_day_index)[0][0])

    slope = float(model.coef_[0][0])

    if ma5 > ma20 and slope > 0:
        trend = "Bullish"
    elif ma5 < ma20 and slope < 0:
        trend = "Bearish"
    else:
        trend = "Sideways"

    volatility = float(np.std(prices[-10:])) if len(prices) >= 10 else float(np.std(prices))
    lower_range = round(next_price - volatility, 2)
    upper_range = round(next_price + volatility, 2)

    confidence = 50

    if trend == "Bullish" and recent_return > 0:
        confidence += 15
    elif trend == "Bearish" and recent_return < 0:
        confidence += 15

    if abs(slope) > 0.3:
        confidence += 10

    if volatility < 5:
        confidence += 10
    else:
        confidence -= 5

    confidence = max(35, min(confidence, 85))

    return {
        "success": True,
        "trend": trend,
        "predictedPrice": round(next_price, 2),
        "predictedRange": {
            "low": lower_range,
            "high": upper_range
        },
        "confidence": confidence,
        "indicators": {
            "ma5": round(ma5, 2),
            "ma20": round(ma20, 2),
            "recentReturn": round(recent_return, 2),
            "slope": round(slope, 4),
            "volatility": round(volatility, 2)
        }
    }


if __name__ == "__main__":
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
        prices = data.get("prices", [])
        result = predict(prices)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": str(e)
        }))