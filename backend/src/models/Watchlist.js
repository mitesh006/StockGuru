const mongoose = require("mongoose");

const watchlistSchema = new mongoose.Schema(
    {
        user:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
    },
    { timestamps: true }
);

// Prevent same user from adding the same symbol twice
watchlistSchema.index({ user: 1, symbol: 1 }, { unique: true });

module.exports = mongoose.model("Watchlist", watchlistSchema);
