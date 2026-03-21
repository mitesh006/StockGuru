const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const stockRoutes = require("./routes/stock.routes");
const authRoutes  = require("./routes/auth.routes");

const app = express();

app.use(cors());
app.use(express.json());

// ─── MongoDB Connection ───
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

// ─── Routes ───
app.get("/", (req, res) => res.send("StockGuru API is running..."));
app.use("/api/auth",   authRoutes);
app.use("/api/stocks", stockRoutes);

module.exports = app;