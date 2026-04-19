// login.js — Connects login form to StockGuru backend auth API

const API_BASE = "https://saint-cardiac-night-ski.trycloudflare.comapi";

const form = document.getElementById("login-form");
const errorEl = document.getElementById("error-msg");
const loginBtn = document.getElementById("login-btn");

// Toggle password visibility
document.getElementById("toggle-pwd").addEventListener("click", function () {
    const pwd = document.getElementById("password");
    const icon = document.getElementById("eye-icon");
    pwd.type = pwd.type === "password" ? "text" : "password";
    if (icon) icon.classList.toggle("hidden", pwd.type === "text");
});

// If already logged in, skip to dashboard
if (localStorage.getItem("token")) {
    window.location.href = "dashboard.html";
}

// Helper to show/hide error
function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = "block";
}
function hideError() {
    errorEl.style.display = "none";
}

form.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideError();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginBtn.textContent = "Signing In...";
    loginBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!data.success) {
            showError(data.message || "Login failed.");
            return;
        }

        // Store token and user in localStorage
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        // Redirect to dashboard
        window.location.href = "dashboard.html";

    } catch (err) {
        showError("Cannot connect to server. Make sure the backend is running.");
    } finally {
        loginBtn.textContent = "Sign In";
        loginBtn.disabled = false;
    }
});
