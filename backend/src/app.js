const express = require("express");
const cors = require("cors");
const stockRoutes = require('./routes/stock.routes');
const app = express();


app.get("/", (req, res) => {
    res.send("API is running...");
}); 

module.exports = app;