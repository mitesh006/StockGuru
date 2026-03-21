require("dotenv").config();

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = "https://www.alphavantage.co/query";

const getStockQuote = async (alphaSymbol) => {
    const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(alphaSymbol)}&apikey=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data["Note"]) throw new Error("API rate limit reached. Try again later.");
    if (data["Error Message"]) throw new Error("Invalid symbol.");

    const quote = data["Global Quote"];
    if (!quote || Object.keys(quote).length === 0) throw new Error("No data found.");

    return {
        symbol: quote["01. symbol"] || alphaSymbol,
        open: parseFloat(quote["02. open"]) || 0,
        high: parseFloat(quote["03. high"]) || 0,
        low: parseFloat(quote["04. low"]) || 0,
        price: parseFloat(quote["05. price"]) || 0,
        volume: parseInt(quote["06. volume"]) || 0,
        latestTradingDay: quote["07. latest trading day"] || "N/A",
        previousClose: parseFloat(quote["08. previous close"]) || 0,
        change: parseFloat(quote["09. change"]) || 0,
        changePercent: quote["10. change percent"] || "0%",
    };
};

module.exports = { getStockQuote };
