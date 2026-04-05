// watchlist.js — Watchlist page with backend integration
// Fetches user's watchlist from API, displays live prices,
// supports adding and removing stocks.

const API_BASE = "http://localhost:3000/api";

const token   = localStorage.getItem("token");
const gate    = document.getElementById("auth-gate");
const content = document.getElementById("watchlist-content");

// ─── Auth Guard ───
if (!token) {
    gate.style.display    = "flex";
    content.style.display = "none";
} else {
    gate.style.display    = "none";
    content.style.display = "block";
    initWatchlist();
}

// ─── Auth helpers ───
function getAuthHeaders() {
    return {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
    };
}

// ─── Watchlist Init ───
async function initWatchlist() {
    const addBtn   = document.getElementById("add-stock-btn");
    const addInput = document.getElementById("add-stock-input");

    if (addBtn) {
        addBtn.addEventListener("click", () => handleAddStock());
    }
    if (addInput) {
        addInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") handleAddStock();
        });
    }

    // Fetch and display watchlist
    await loadWatchlist();
}

// ═══════════════════════════════════════════
// LOAD WATCHLIST FROM BACKEND
// ═══════════════════════════════════════════
let loadingWatchlist = false;

async function loadWatchlist() {
    if (loadingWatchlist) return;
    loadingWatchlist = true;

    const tableContainer = document.getElementById("watchlist-table-container");
    const emptyState     = document.getElementById("empty-state");
    const tbody          = document.getElementById("watchlist-tbody");

    // Show a loading state
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:2rem;">Loading watchlist…</td></tr>`;
    if (tableContainer) tableContainer.style.display = "block";
    if (emptyState) emptyState.style.display = "none";

    try {
        const res = await fetch(`${API_BASE}/watchlist`, {
            headers: getAuthHeaders(),
        });

        // Handle 401 — token expired or invalid
        if (res.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            showWatchlistToast("Session expired. Please log in again.");
            setTimeout(() => { window.location.href = "login.html"; }, 1500);
            return;
        }

        const data = await res.json();

        if (!data.success) {
            showWatchlistToast(data.message || "Failed to load watchlist.");
            if (tbody) tbody.innerHTML = "";
            if (tableContainer) tableContainer.style.display = "none";
            if (emptyState) emptyState.style.display = "block";
            return;
        }

        if (!data.data || data.data.length === 0) {
            // Empty watchlist
            if (tableContainer) tableContainer.style.display = "none";
            if (emptyState) emptyState.style.display = "block";
            return;
        }

        // Render table
        renderWatchlistTable(data.data);
        if (tableContainer) tableContainer.style.display = "block";
        if (emptyState) emptyState.style.display = "none";

    } catch (err) {
        console.error("Watchlist load error:", err);
        showWatchlistToast("Could not connect to server.");
        if (tbody) tbody.innerHTML = "";
        if (tableContainer) tableContainer.style.display = "none";
        if (emptyState) emptyState.style.display = "block";
    } finally {
        loadingWatchlist = false;
    }
}

// ═══════════════════════════════════════════
// RENDER WATCHLIST TABLE
// ═══════════════════════════════════════════
function renderWatchlistTable(stocks) {
    const tbody = document.getElementById("watchlist-tbody");
    if (!tbody) return;

    tbody.innerHTML = stocks.map(s => {
        const hasPrice = s.price != null;
        const up = s.changePercent >= 0;
        const changeCls = up ? "price-positive" : "price-negative";
        const arrow = up ? "▲" : "▼";

        return `
            <tr data-symbol="${s.symbol}">
                <td>
                    <a href="stock.html?symbol=${s.symbol}" class="stock-symbol">${s.symbol}</a>
                </td>
                <td class="stock-name">${s.name}</td>
                <td>${hasPrice ? `$${s.price.toFixed(2)}` : '<span style="color:var(--text-dim)">N/A</span>'}</td>
                <td class="${changeCls}">
                    ${hasPrice ? `${arrow} ${up ? "+" : ""}${s.change.toFixed(2)}` : '—'}
                </td>
                <td class="${changeCls}">
                    ${hasPrice ? `${up ? "+" : ""}${s.changePercent.toFixed(2)}%` : '—'}
                </td>
                <td>
                    <div class="action-buttons">
                        <a href="stock.html?symbol=${s.symbol}" class="btn btn-small">View</a>
                        <button class="btn btn-small btn-danger" onclick="handleRemoveStock('${s.symbol}')">Remove</button>
                    </div>
                </td>
            </tr>`;
    }).join("");
}

// ═══════════════════════════════════════════
// ADD STOCK TO WATCHLIST
// ═══════════════════════════════════════════
async function handleAddStock() {
    const addInput = document.getElementById("add-stock-input");
    const addBtn   = document.getElementById("add-stock-btn");
    if (!addInput) return;

    const sym = addInput.value.trim().toUpperCase();
    if (!sym) {
        showWatchlistToast("Please enter a stock symbol.");
        return;
    }

    // Basic validation
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(sym)) {
        showWatchlistToast(`"${sym}" is not a valid stock symbol.`);
        return;
    }

    // Disable button during request
    if (addBtn) { addBtn.disabled = true; addBtn.textContent = "Adding…"; }

    try {
        const res = await fetch(`${API_BASE}/watchlist`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ symbol: sym }),
        });

        const data = await res.json();

        if (data.success) {
            showWatchlistToast(`✓ ${sym} added to watchlist!`);
            addInput.value = "";
            await loadWatchlist(); // Refresh the list with live data
        } else {
            showWatchlistToast(data.message || "Failed to add stock.");
        }
    } catch {
        showWatchlistToast("Could not connect to server.");
    } finally {
        if (addBtn) { addBtn.disabled = false; addBtn.textContent = "Add to Watchlist"; }
    }
}

// ═══════════════════════════════════════════
// REMOVE STOCK FROM WATCHLIST
// ═══════════════════════════════════════════
async function handleRemoveStock(sym) {
    try {
        const res = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(sym)}`, {
            method: "DELETE",
            headers: getAuthHeaders(),
        });

        const data = await res.json();

        if (data.success) {
            showWatchlistToast(`✓ ${sym} removed from watchlist.`);
            // Optimistic UI: remove the row immediately
            const row = document.querySelector(`tr[data-symbol="${sym}"]`);
            if (row) {
                row.style.transition = "opacity 0.3s ease";
                row.style.opacity = "0";
                setTimeout(() => {
                    row.remove();
                    // Check if table is now empty
                    const tbody = document.getElementById("watchlist-tbody");
                    if (tbody && tbody.children.length === 0) {
                        document.getElementById("watchlist-table-container").style.display = "none";
                        document.getElementById("empty-state").style.display = "block";
                    }
                }, 300);
            }
        } else {
            showWatchlistToast(data.message || "Failed to remove stock.");
        }
    } catch {
        showWatchlistToast("Could not connect to server.");
    }
}

// ═══════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════
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
