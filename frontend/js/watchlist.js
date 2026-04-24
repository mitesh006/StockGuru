// watchlist.js

const API_BASE = "https://stockguru.ap-south-1.elasticbeanstalk.com/api";

const gate = document.getElementById("auth-gate");
const content = document.getElementById("watchlist-content");

let watchlistInitialized = false;
let loadingWatchlist = false;
let addStockInProgress = false;



function getToken() {
    return localStorage.getItem("token");
}

function getAuthHeaders() {
    const token = getToken();
    return {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
    };
}

function showAuthenticatedView() {
    if (gate) gate.style.display = "none";
    if (content) content.style.display = "block";
}

function showUnauthenticatedView() {
    if (gate) gate.style.display = "flex";
    if (content) content.style.display = "none";
}

function handleUnauthorized() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    showWatchlistToast("Session expired. Please log in again.");
    showUnauthenticatedView();

    setTimeout(() => {
        window.location.href = "login.html";
    }, 1500);
}


function checkAuthAndInit() {
    const token = getToken();

    if (!token) {
        showUnauthenticatedView();
        return;
    }

    showAuthenticatedView();
    initWatchlist();
}

async function initWatchlist() {
    const addBtn = document.getElementById("add-stock-btn");
    const addInput = document.getElementById("add-stock-input");

    if (!watchlistInitialized) {
        if (addBtn) {
            addBtn.addEventListener("click", handleAddStock);
        }

        if (addInput) {
            addInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    handleAddStock();
                }
            });
        }

        watchlistInitialized = true;
    }

    await loadWatchlist();
}

// Reload fresh data when shown again after login/navigation
window.addEventListener("pageshow", () => {
    const token = getToken();

    if (!token) {
        showUnauthenticatedView();
        return;
    }

    showAuthenticatedView();
    loadWatchlist();
});

checkAuthAndInit();


async function loadWatchlist() {
    if (loadingWatchlist) return;

    const token = getToken();
    if (!token) {
        showUnauthenticatedView();
        return;
    }

    loadingWatchlist = true;

    const tableContainer = document.getElementById("watchlist-table-container");
    const emptyState = document.getElementById("empty-state");
    const tbody = document.getElementById("watchlist-tbody");

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;color:var(--text-dim);padding:2rem;">
                    Loading watchlist...
                </td>
            </tr>
        `;
    }

    if (tableContainer) tableContainer.style.display = "block";
    if (emptyState) emptyState.style.display = "none";

    try {
        const res = await fetch(`${API_BASE}/watchlist`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        if (res.status === 401) {
            handleUnauthorized();
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

        const stocks = Array.isArray(data.data) ? data.data : [];

        if (stocks.length === 0) {
            if (tbody) tbody.innerHTML = "";
            if (tableContainer) tableContainer.style.display = "none";
            if (emptyState) emptyState.style.display = "block";
            return;
        }

        renderWatchlistTable(stocks);

        if (tableContainer) tableContainer.style.display = "block";
        if (emptyState) emptyState.style.display = "none";
    } catch {

        showWatchlistToast("Could not connect to server.");

        if (tbody) tbody.innerHTML = "";
        if (tableContainer) tableContainer.style.display = "none";
        if (emptyState) emptyState.style.display = "block";
    } finally {
        loadingWatchlist = false;
    }
}


function renderWatchlistTable(stocks) {
    const tbody = document.getElementById("watchlist-tbody");
    if (!tbody) return;

    tbody.innerHTML = stocks.map((s) => {
        const hasPrice = s.price != null;
        const changePercent = Number(s.changePercent ?? 0);
        const change = Number(s.change ?? 0);
        const up = changePercent >= 0;
        const changeCls = up ? "price-positive" : "price-negative";
        const arrow = up ? "▲" : "▼";

        return `
            <tr data-symbol="${s.symbol}">
                <td>
                    <a href="stock.html?symbol=${encodeURIComponent(s.symbol)}" class="stock-symbol">${s.symbol}</a>
                </td>
                <td class="stock-name">${s.name || "N/A"}</td>
                <td>${hasPrice ? `$${Number(s.price).toFixed(2)}` : '<span style="color:var(--text-dim)">N/A</span>'}</td>
                <td class="${changeCls}">
                    ${hasPrice ? `${arrow} ${up ? "+" : ""}${change.toFixed(2)}` : "—"}
                </td>
                <td class="${changeCls}">
                    ${hasPrice ? `${up ? "+" : ""}${changePercent.toFixed(2)}%` : "—"}
                </td>
                <td>
                    <div class="action-buttons">
                        <a href="stock.html?symbol=${encodeURIComponent(s.symbol)}" class="btn btn-small">View</a>
                        <button
                            class="btn btn-small btn-danger"
                            type="button"
                            onclick="handleRemoveStock('${s.symbol}')"
                        >
                            Remove
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}


async function handleAddStock() {
    if (addStockInProgress) return;

    const token = getToken();
    if (!token) {
        showWatchlistToast("Please log in to manage your watchlist.");
        showUnauthenticatedView();
        return;
    }

    const addInput = document.getElementById("add-stock-input");
    const addBtn = document.getElementById("add-stock-btn");

    if (!addInput) return;

    const sym = addInput.value.trim().toUpperCase();

    if (!sym) {
        showWatchlistToast("Please enter a stock symbol.");
        return;
    }

    if (!/^[A-Z]{1,5}(\.[A-Z]+)?$/.test(sym)) {
        showWatchlistToast(`"${sym}" is not a valid stock symbol.`);
        return;
    }

    addStockInProgress = true;

    if (addBtn) {
        addBtn.disabled = true;
        addBtn.textContent = "Adding...";
    }

    try {
        const res = await fetch(`${API_BASE}/watchlist`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ symbol: sym }),
        });

        if (res.status === 401) {
            handleUnauthorized();
            return;
        }

        const data = await res.json();

        if (data.success) {
            showWatchlistToast(`✓ ${sym} added to watchlist!`);
            addInput.value = "";
            await loadWatchlist();
        } else {
            showWatchlistToast(data.message || "Failed to add stock.");
        }
    } catch {

        showWatchlistToast("Could not connect to server.");
    } finally {
        addStockInProgress = false;

        if (addBtn) {
            addBtn.disabled = false;
            addBtn.textContent = "Add to Watchlist";
        }
    }
}


async function handleRemoveStock(sym) {
    const token = getToken();
    if (!token) {
        showWatchlistToast("Please log in to manage your watchlist.");
        showUnauthenticatedView();
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(sym)}`, {
            method: "DELETE",
            headers: getAuthHeaders(),
        });

        if (res.status === 401) {
            handleUnauthorized();
            return;
        }

        const data = await res.json();

        if (data.success) {
            showWatchlistToast(`✓ ${sym} removed from watchlist.`);

            const row = document.querySelector(`tr[data-symbol="${sym}"]`);
            if (row) {
                row.style.transition = "opacity 0.3s ease";
                row.style.opacity = "0";

                setTimeout(() => {
                    row.remove();

                    const tbody = document.getElementById("watchlist-tbody");
                    const tableContainer = document.getElementById("watchlist-table-container");
                    const emptyState = document.getElementById("empty-state");

                    if (tbody && tbody.children.length === 0) {
                        if (tableContainer) tableContainer.style.display = "none";
                        if (emptyState) emptyState.style.display = "block";
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

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}