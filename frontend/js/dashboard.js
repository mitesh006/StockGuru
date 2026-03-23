// dashboard.js — StockGuru Dashboard

const API_BASE = "http://localhost:3000/api";

// ─── DOM refs ───
const searchInput = document.getElementById("stock-search-input");
const searchBtn   = document.getElementById("search-btn");

// Search dropdown
const dropdownEl = document.createElement("div");
dropdownEl.className = "search-dropdown";
dropdownEl.id = "search-dropdown";
document.getElementById("search-wrapper").style.position = "relative";
document.getElementById("search-wrapper").appendChild(dropdownEl);

let debounceTimer = null;

// ═══════════════════════════════
// SEARCH
// ═══════════════════════════════
searchInput.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    const query = this.value.trim();
    if (query.length < 1) { hideDropdown(); return; }
    debounceTimer = setTimeout(() => fetchSearchResults(query), 300);
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-container")) hideDropdown();
});

searchBtn.addEventListener("click", () => {
    const q = searchInput.value.trim();
    if (q) fetchSearchResults(q);
});

searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        const q = searchInput.value.trim();
        if (q) fetchSearchResults(q);
    }
});

async function fetchSearchResults(query) {
    try {
        dropdownEl.innerHTML = `<div class="dropdown-loading">Searching…</div>`;
        dropdownEl.classList.add("visible");
        const res  = await fetch(`${API_BASE}/stocks/search?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (!data.success || !data.data?.length) {
            dropdownEl.innerHTML = `<div class="dropdown-empty">No results for "${query}"</div>`;
            return;
        }
        renderDropdown(data.data);
    } catch {
        dropdownEl.innerHTML = `<div class="dropdown-empty">Search failed — is the server running?</div>`;
    }
}

function renderDropdown(stocks) {
    dropdownEl.innerHTML = stocks.map(s => `
        <div class="dropdown-item" data-symbol="${s.symbol}">
            <span class="dropdown-symbol">${s.symbol}</span>
            <span class="dropdown-name">${s.name}</span>
        </div>`).join("");
    dropdownEl.classList.add("visible");
    dropdownEl.querySelectorAll(".dropdown-item").forEach(item => {
        item.addEventListener("click", () => {
            window.location.href = `stock.html?symbol=${item.dataset.symbol}`;
        });
    });
}

function hideDropdown() {
    dropdownEl.classList.remove("visible");
    dropdownEl.innerHTML = "";
}

// ═══════════════════════════════
// TICKER BAR
// ═══════════════════════════════
async function loadTicker() {
    try {
        const res  = await fetch(`${API_BASE}/stocks/ticker`);
        const data = await res.json();
        if (!data.success) return;
        renderTicker(data.data);
    } catch (err) {
        document.getElementById("ticker-track").innerHTML =
            `<span class="ticker-item">Market data unavailable</span>`;
    }
}

function renderTicker(stocks) {
    const track = document.getElementById("ticker-track");
    const html = stocks.map(s => {
        const up  = s.changePercent >= 0;
        const cls = up ? "pos" : "neg";
        const arrow = up ? "▲" : "▼";
        return `
            <a class="ticker-item" href="stock.html?symbol=${s.symbol}">
                <span class="ticker-symbol">${s.symbol}</span>
                <span class="ticker-price">$${s.price.toFixed(2)}</span>
                <span class="ticker-change ${cls}">${arrow} ${up ? "+" : ""}${s.changePercent.toFixed(2)}%</span>
            </a>`;
    }).join('<span class="ticker-sep">·</span>');

    // Duplicate for infinite scroll
    track.innerHTML = html + html;

    // Pause on hover
    track.addEventListener("mouseenter", () => track.style.animationPlayState = "paused");
    track.addEventListener("mouseleave", () => track.style.animationPlayState = "running");
}

// ═══════════════════════════════
// MARKET OVERVIEW
// ═══════════════════════════════
async function loadMarketOverview() {
    try {
        const res  = await fetch(`${API_BASE}/stocks/overview`);
        const data = await res.json();
        if (!data.success) return;
        renderOverview(data.data);
    } catch {
        document.getElementById("overview-grid").innerHTML =
            `<div class="section-error">Market overview unavailable</div>
            <div class="section-error">Market overview unavailable</div>
            <div class="section-error">Market overview unavailable</div>`;
    }
}

function renderOverview(indices) {
    const grid = document.getElementById("overview-grid");
    grid.innerHTML = indices.map(idx => {
        const up  = idx.changePercent >= 0;
        const cls = up ? "pos" : "neg";
        const arrow = up ? "▲" : "▼";
        return `
            <div class="overview-card">
                <div class="overview-label">${idx.label}</div>
                <div class="overview-symbol">${idx.symbol}</div>
                <div class="overview-price">$${idx.price.toFixed(2)}</div>
                <div class="overview-change ${cls}">${arrow} ${idx.changePercent >= 0 ? "+" : ""}${idx.changePercent.toFixed(2)}%</div>
            </div>`;
    }).join("");
}

// ═══════════════════════════════
// TRENDING STOCKS
// ═══════════════════════════════
async function loadTrending() {
    try {
        const res  = await fetch(`${API_BASE}/stocks/trending`);
        const data = await res.json();
        if (!data.success) return;
        renderTrending(data.data);
    } catch {
        document.getElementById("trending-grid").innerHTML =
            `<div class="section-error">Trending data unavailable</div>
            <div class="section-error">Trending data unavailable</div>
            <div class="section-error">Trending data unavailable</div>
            <div class="section-error">Trending data unavailable</div>
            <div class="section-error">Trending data unavailable</div>
            <div class="section-error">Trending data unavailable</div>`;
    }
}

function renderTrending(stocks) {
    const grid = document.getElementById("trending-grid");
    grid.innerHTML = stocks.map(s => {
        const up  = s.changePercent >= 0;
        const cls = up ? "pos" : "neg";
        const arrow = up ? "▲" : "▼";
        return `
            <div class="trending-card">
                <div class="trending-symbol">${s.symbol}</div>
                <div class="trending-price">$${s.price.toFixed(2)}</div>
                <div class="trending-change ${cls}">${arrow} ${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%</div>
                <a class="trending-view" href="stock.html?symbol=${s.symbol}">View</a>
            </div>`;
    }).join("");
}

// ═══════════════════════════════
// CHART PERIOD BUTTONS
// ═══════════════════════════════
document.querySelectorAll(".chart-controls button").forEach(btn => {
    btn.addEventListener("click", function () {
        document.querySelectorAll(".chart-controls button").forEach(b => b.classList.remove("active"));
        this.classList.add("active");
        console.log("Chart period:", this.dataset.period);
    });
});

// ═══════════════════════════════
// BOOT
// ═══════════════════════════════
// loadTicker();
// loadMarketOverview();
// loadTrending();
