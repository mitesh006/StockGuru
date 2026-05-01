const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
    sendVerificationEmail,
    sendWelcomeEmail
} = require("../services/email.service");

// ─── Generate JWT ───
const signToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// ─── POST /api/auth/register ───
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        const verificationToken = crypto.randomBytes(32).toString("hex");

        const user = await User.create({
            name,
            email,
            password,
            isVerified: false,
            emailVerificationToken: verificationToken,
            emailVerificationExpires: Date.now() + 60 * 60 * 1000
        });

        const verificationLink = `${process.env.BACKEND_URL}/api/auth/verify-email/${verificationToken}`;

        await sendVerificationEmail(user.email, user.name, verificationLink);

        res.status(201).json({
            success: true,
            message: "Account created successfully. Please check your email to verify your account."
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({
            success: false,
            message: "Registration failed. Please try again."
        });
    }
};

// ─── GET /api/auth/verify-email/:token ───
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).send(`
                <h2>Invalid or expired verification link</h2>
                <p>Please register again or request a new verification email.</p>
            `);
        }

        user.isVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;

        await user.save();

        await sendWelcomeEmail(user.email, user.name);

        return res.redirect(`${process.env.FRONTEND_URL}/login.html?verified=true`);
    } catch (error) {
        console.error("Email verification error:", error);
        return res.status(500).send("Email verification failed.");
    }
};

// ─── POST /api/auth/login ───
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (!user.isVerified) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email before logging in."
            });
        }

        const token = signToken(user._id);

        res.json({
            success: true,
            message: "Logged in successfully.",
            token,
            user
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Login failed. Please try again."
        });
    }
};

// ─── GET /api/auth/me  (protected) ───
const getMe = async (req, res) => {
    res.json({ success: true, user: req.user });
};

module.exports = {
    register,
    verifyEmail,
    login,
    getMe
};