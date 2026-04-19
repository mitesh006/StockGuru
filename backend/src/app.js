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
    "stock-guru-self.vercel.app"
  ],
  credentials: true
}));
app.use(express.json());

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("MongoDB connected successfully.");
    } catch (err) {
        console.error("MongoDB connection failed:", err.message);
        process.exit(1);
    }
};
connectDB();

app.get("/", (req, res) => res.send("StockGuru API is running..."));
app.use("/api/auth",      authRoutes);
app.use("/api/stocks",    predictionRoutes);  // before stockRoutes (/:symbol catch-all)
app.use("/api/stocks",    stockRoutes);
app.use("/api/watchlist", watchlistRoutes);

module.exports = app;