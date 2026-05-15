const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const stockRoutes      = require("./routes/stock.routes");
const authRoutes       = require("./routes/auth.routes");
const watchlistRoutes  = require("./routes/watchlist.routes");
const predictionRoutes = require("./routes/prediction.routes");

const app = express();

app.use(cors({
    origin: [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://stock-guru-rust.vercel.app"
  ],
  credentials: true
}));
app.use(express.json());

// Lazy cached connection — safe for serverless (Vercel) and traditional servers.
// Reuses an existing connection across warm invocations; reconnects only on cold start.
let _dbPromise = null;
const connectDB = () => {
    if (mongoose.connection.readyState >= 1) return Promise.resolve();
    if (_dbPromise) return _dbPromise;
    _dbPromise = mongoose
        .connect(process.env.MONGODB_URI)
        .then(() => console.log("MongoDB connected successfully."))
        .catch((err) => {
            console.error("MongoDB connection failed:", err.message);
            _dbPromise = null;   // allow retry on next request
            throw err;
        });
    return _dbPromise;
};

// Middleware: ensure DB is connected before handling any request
app.use(async (_req, _res, next) => {
    try {
        await connectDB();
        next();
    } catch {
        next(); // allow the request to proceed; controllers will fail gracefully
    }
});

app.get("/", (req, res) => {
    return res.send("StockGuru API is running...")
});
app.use("/api/auth",      authRoutes);
app.use("/api/stocks",    predictionRoutes);  // before stockRoutes (/:symbol catch-all)
app.use("/api/stocks",    stockRoutes);
app.use("/api/watchlist", watchlistRoutes);

module.exports = app;