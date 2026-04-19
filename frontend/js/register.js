// register.js — Connects register form to StockGuru backend auth API

const API_BASE = "https://saint-cardiac-night-ski.trycloudflare.comapi";

const form = document.getElementById("register-form");
const errorEl = document.getElementById("error-msg");
const successEl = document.getElementById("success-msg");
const registerBtn = document.getElementById("register-btn");

// If already logged in, skip to dashboard
if (localStorage.getItem("token")) {
    window.location.href = "dashboard.html";
}

// Toggle password visibility
document.getElementById("toggle-pwd").addEventListener("click", function () {
    const pwd = document.getElementById("password");
    const icon = document.getElementById("eye-icon");
    pwd.type = pwd.type === "password" ? "text" : "password";
    if (icon) icon.classList.toggle("hidden", pwd.type === "text");
});
document.getElementById("toggle-pwd2").addEventListener("click", function () {
    const pwd = document.getElementById("confirm-password");
    const icon = document.getElementById("eye-icon2");
    pwd.type = pwd.type === "password" ? "text" : "password";
    if (icon) icon.classList.toggle("hidden", pwd.type === "text");
});

// Helpers
function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = "block";
    successEl.style.display = "none";
}
function hideMessages() {
    errorEl.style.display = "none";
    successEl.style.display = "none";
}

// Password strength indicator
document.getElementById("password").addEventListener("input", function () {
    const val = this.value;
    const bar = document.getElementById("strength-bar");
    const txt = document.getElementById("strength-text");
    let strength = 0;
    if (val.length >= 6) strength++;
    if (val.length >= 10) strength++;
    if (/[A-Z]/.test(val)) strength++;
    if (/[0-9]/.test(val)) strength++;
    if (/[^A-Za-z0-9]/.test(val)) strength++;

    const labels = ["", "Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
    const colors = ["", "#ff3366", "#ff9900", "#ffd700", "#00cc6a", "#00ff88"];
    bar.style.width = `${strength * 20}%`;
    bar.style.background = colors[strength];
    txt.textContent = val ? labels[strength] : "";
    txt.style.color = colors[strength];
});

form.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideMessages();

    const name = document.getElementById("fullname").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirm = document.getElementById("confirm-password").value;

    // Frontend validation
    if (!name) return showError("Full name is required.");
    if (password.length < 6) return showError("Password must be at least 6 characters.");
    if (password !== confirm) return showError("Passwords do not match.");

    registerBtn.textContent = "Creating account…";
    registerBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();

        if (!data.success) {
            showError(data.message || "Registration failed.");
            return;
        }

        successEl.textContent = "Account created successfully. Redirecting to login...";
        successEl.style.display = "block";

        setTimeout(() => { window.location.href = "login.html"; }, 2000);

    } catch (err) {
        showError("Cannot connect to server. Make sure the backend is running.");
    } finally {
        registerBtn.textContent = "Create Account";
        registerBtn.disabled = false;
    }
});
