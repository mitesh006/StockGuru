// watchlist.js — Watchlist page with auth guard

const token = localStorage.getItem("token");
const gate    = document.getElementById("auth-gate");
const content = document.getElementById("watchlist-content");

// ─── Auth Guard ───
// Guest → show login gate, Logged-in → show content
if (!token) {
    gate.style.display    = "flex";
    content.style.display = "none";
} else {
    gate.style.display    = "none";
    content.style.display = "block";
    initWatchlist();
}

// ─── Watchlist Init (logged-in only) ───
function initWatchlist() {
    // This is where watchlist data would be fetched.
    // Persistence is under development — no backend calls yet.
    const addBtn   = document.getElementById("add-stock-btn");
    const addInput = document.getElementById("add-stock-input");

    if (addBtn) {
        addBtn.addEventListener("click", function () {
            showWatchlistToast("🔧 Watchlist saving is coming soon — under development.");
            if (addInput) addInput.value = "";
        });
    }

    // Pressing Enter in the input
    if (addInput) {
        addInput.addEventListener("keypress", function (e) {
            if (e.key === "Enter") addBtn.click();
        });
    }
}

function showWatchlistToast(msg) {
    let toast = document.getElementById("wl-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "wl-toast";
        toast.className = "wl-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3500);
}
