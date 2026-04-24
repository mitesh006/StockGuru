// profile.js — User profile page logic

const API_BASE = "/api";

async function loadProfile() {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!data.success) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "login.html";
            return;
        }

        renderProfile(data.user);
    } catch {

        document.getElementById("profile-loading").textContent =
            "Failed to load profile. Make sure the server is running.";
    }
}

function renderProfile(user) {

    document.getElementById("profile-loading").style.display = "none";
    document.getElementById("profile-card").style.display = "block";


    document.getElementById("profile-avatar").textContent =
        (user.name || "U").charAt(0).toUpperCase();


    document.getElementById("profile-name").textContent = user.name;
    document.getElementById("profile-email").textContent = user.email;


    document.getElementById("pd-name").textContent = user.name;
    document.getElementById("pd-email").textContent = user.email;
    document.getElementById("pd-since").textContent = formatDate(user.createdAt);


    document.getElementById("logout-profile-btn").addEventListener("click", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "login.html";
    });
}

function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

loadProfile();
