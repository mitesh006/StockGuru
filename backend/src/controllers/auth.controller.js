const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ─── Generate JWT ───
const signToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// ─── POST /api/auth/register ───
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "Name, email and password are required." });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ success: false, message: "An account with this email already exists." });
        }

        const user = await User.create({ name, email, password });
        const token = signToken(user._id);

        res.status(201).json({
            success: true,
            message: "Account created successfully.",
            token,
            user,
        });
    } catch (error) {
        console.error("Register error:", error.message);
        res.status(500).json({ success: false, message: "Registration failed. Please try again." });
    }
};

// ─── POST /api/auth/login ───
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required." });
        }

        const user = await User.findOne({ email }).select("+password");
        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid email or password." });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid email or password." });
        }

        const token = signToken(user._id);

        res.json({
            success: true,
            message: "Logged in successfully.",
            token,
            user,
        });
    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({ success: false, message: "Login failed. Please try again." });
    }
};

// ─── GET /api/auth/me  (protected) ───
const getMe = async (req, res) => {
    res.json({ success: true, user: req.user });
};

module.exports = { register, login, getMe };
