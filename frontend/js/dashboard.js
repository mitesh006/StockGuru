// dashboard.js — StockGuru Dashboard
// POLISHED: Improved chart switching, period guards, loading/error/empty
// states, and duplicate request prevention.

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

// ═══════════════════════════════════════════
// FETCH GUARD — prevents duplicate API calls
// from rapid reloads or re-renders
// ═══════════════════════════════════════════
const fetchInProgress = {
    ticker:   false,
    overview: false,
    trending: false,
};

// ═══════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// TICKER BAR (with fetch guard)
// ═══════════════════════════════════════════
async function loadTicker() {
    if (fetchInProgress.ticker) return; // Prevent duplicate calls
    fetchInProgress.ticker = true;
    try {
        const res  = await fetch(`${API_BASE}/stocks/ticker`);
        const data = await res.json();
        if (!data.success) return;
        renderTicker(data.data);
    } catch (err) {
        document.getElementById("ticker-track").innerHTML =
            `<span class="ticker-item">Market data unavailable</span>`;
    } finally {
        fetchInProgress.ticker = false;
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

    requestAnimationFrame(() => {
        const trackWidth = track.scrollWidth;
        const screenWidth = window.innerWidth;

        if (trackWidth < screenWidth * 2) {
            track.innerHTML += html;
        }
    });

    // Pause on hover
    track.addEventListener("mouseenter", () => track.style.animationPlayState = "paused");
    track.addEventListener("mouseleave", () => track.style.animationPlayState = "running");
}

// ═══════════════════════════════════════════
// MARKET OVERVIEW (with fetch guard)
// ═══════════════════════════════════════════
async function loadMarketOverview() {
    if (fetchInProgress.overview) return;
    fetchInProgress.overview = true;
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
    } finally {
        fetchInProgress.overview = false;
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

// ═══════════════════════════════════════════
// TRENDING STOCKS (with fetch guard)
// ═══════════════════════════════════════════
async function loadTrending() {
    if (fetchInProgress.trending) return;
    fetchInProgress.trending = true;
    try {
        const res  = await fetch(`${API_BASE}/stocks/trending`);
        const data = await res.json();
        if (!data.success) {
            // Handle specific error types from the refactored backend
            if (data.errorType === "RATE_LIMIT") {
                showTrendingError("API limit reached — please wait a moment");
            }
            return;
        }
        renderTrending(data.data);
    } catch {
        showTrendingError("Trending data unavailable");
    } finally {
        fetchInProgress.trending = false;
    }
}

function showTrendingError(msg) {
    document.getElementById("trending-grid").innerHTML =
        Array(6).fill(`<div class="section-error">${msg}</div>`).join("");
}

function renderTrending(stocks) {
    const grid = document.getElementById("trending-grid");
    grid.innerHTML = stocks.map(s => {
        const up  = s.changePercent >= 0;
        const cls = up ? "pos" : "neg";
        const arrow = up ? "▲" : "▼";
        return `
            <div class="trending-card" data-symbol="${s.symbol}" style="cursor:pointer;">
                <div class="trending-symbol">${s.symbol}</div>
                <div class="trending-price">$${s.price.toFixed(2)}</div>
                <div class="trending-change ${cls}">${arrow} ${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%</div>
                <a class="trending-view" href="stock.html?symbol=${s.symbol}">View</a>
            </div>`;
    }).join("");
    initCardClickListeners();
}

// ═══════════════════════════════════════════
// DASHBOARD CHART (with client-side cache)
// Improved: proper abort on new requests,
// same-period skip, cleaner state management
// ═══════════════════════════════════════════
let dashboardChart = null;
let activeSymbol   = null;
let activePeriod   = null;    // Track currently loaded period
let chartAbort     = null;    // AbortController for in-flight chart fetch
const chartCache   = new Map(); // key: "SYMBOL|PERIOD" → { points, stale, ts }
const CHART_CACHE_TTL = 5 * 60 * 1000; // 5 min

function initDashboardChart() {
    const ctx = document.getElementById("priceChart").getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 380);
    gradient.addColorStop(0, "rgba(0, 255, 136, 0.15)");
    gradient.addColorStop(1, "rgba(0, 255, 136, 0)");
    dashboardChart = new Chart(ctx, {
        type: "line",
        data: { labels: [], datasets: [{
            label: "Price", data: [],
            borderColor: "#00ff88", borderWidth: 2,
            pointRadius: 0, pointHoverRadius: 6,
            pointHoverBackgroundColor: "#00ff88",
            pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2,
            fill: true, backgroundColor: gradient, tension: 0.1
        }]},
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: "index" },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#1a1a1a", titleColor: "#00ff88",
                    bodyColor: "#fff", borderColor: "#333", borderWidth: 1,
                    padding: 12, displayColors: false,
                    callbacks: {
                        label: ctx => `Price: $${ctx.parsed.y.toFixed(2)}`,
                        title: items => new Date(items[0].label).toLocaleDateString(undefined, {
                            year: "numeric", month: "short", day: "numeric"
                        })
                    }
                }
            },
            scales: {
                x: { display: false },
                y: {
                    grid: { color: "rgba(255,255,255,0.05)" },
                    ticks: { color: "#888", font: { size: 10 }, callback: v => "$" + v }
                }
            }
        }
    });
}

async function loadDashboardChart(symbol, period) {
    if (!symbol) return;

    if (!period) {
        const activeBtn = document.querySelector(".chart-controls button.active");
        period = activeBtn ? activeBtn.dataset.period : "1M";
    }

    // Skip if exact same symbol+period already loaded and visible
    if (symbol === activeSymbol && period === activePeriod && !chartAbort) return;

    // Check client-side cache first
    const cacheKey = `${symbol}|${period}`;
    const cached   = chartCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CHART_CACHE_TTL) {
        activeSymbol = symbol;
        activePeriod = period;
        applyChartData(cached.points, cached.stale);
        return;
    }

    // Abort any in-flight chart fetch
    if (chartAbort) {
        chartAbort.abort();
        chartAbort = null;
    }

    const loader      = document.getElementById("chart-loader");
    const errorEl     = document.getElementById("chart-error");
    const canvas      = document.getElementById("priceChart");
    const placeholder = document.getElementById("chart-placeholder-inner");

    // Show loading state immediately
    if (placeholder) placeholder.style.display = "none";
    if (loader)      loader.style.display = "flex";
    if (errorEl)     errorEl.style.display = "none";
    if (canvas)      canvas.style.opacity  = "0.3";

    const controller = new AbortController();
    chartAbort = controller;

    try {
        const res  = await fetch(
            `${API_BASE}/stocks/${encodeURIComponent(symbol)}/candles?period=${period}`,
            { signal: controller.signal }
        );
        const data = await res.json();

        // If this request was aborted (a newer one replaced it), bail out
        if (controller.signal.aborted) return;

        if (!data.success || !data.points || data.points.length === 0) {
            throw new Error(data.message || "No chart data available for this period.");
        }

        // Cache the result client-side
        chartCache.set(cacheKey, { points: data.points, stale: data.stale || false, ts: Date.now() });
        activeSymbol = symbol;
        activePeriod = period;
        applyChartData(data.points, data.stale);
    } catch (err) {
        // Ignore abort errors — they're intentional
        if (err.name === "AbortError") return;

        console.error("Dashboard chart error:", err);
        if (errorEl) {
            errorEl.style.display = "flex";
            document.getElementById("chart-error-msg").textContent = err.message || "Failed to load chart.";
        }
        if (canvas) canvas.style.opacity = "0";
    } finally {
        if (loader) loader.style.display = "none";
        // Clear abort reference only if it's still this controller
        if (chartAbort === controller) chartAbort = null;
    }
}

function applyChartData(points, stale = false) {
    const canvas = document.getElementById("priceChart");
    const errorEl = document.getElementById("chart-error");

    // Hide error if previously shown
    if (errorEl) errorEl.style.display = "none";

    dashboardChart.data.labels           = points.map(p => p.date);
    dashboardChart.data.datasets[0].data = points.map(p => p.price);
    dashboardChart.update("none");
    if (canvas) canvas.style.opacity = "1";

    // Show stale-data indicator if serving cached data after API failure
    const titleEl = document.getElementById("chart-stock-title");
    if (titleEl) {
        const baseName = activeSymbol || "Chart";
        titleEl.textContent = stale
            ? `${baseName} Chart (cached)`
            : `${baseName} Chart`;
    }
}

// ═══════════════════════════════════════════
// CARD CLICK LISTENERS
// ═══════════════════════════════════════════
function initCardClickListeners() {
    // Prevent View link from triggering card click
    document.querySelectorAll(".trending-view").forEach(link => {
        link.addEventListener("click", e => e.stopPropagation());
    });

    document.querySelectorAll(".trending-card[data-symbol]").forEach(card => {
        card.addEventListener("click", () => {
            const symbol = card.dataset.symbol;
            if (!symbol) return;

            // Highlight active card
            document.querySelectorAll(".trending-card").forEach(c => c.classList.remove("active"));
            card.classList.add("active");

            // Update title immediately
            document.getElementById("chart-stock-title").textContent = `${symbol} Chart`;

            // Load chart (will skip if same symbol+period)
            activeSymbol = null; // Force reload when clicking same card
            loadDashboardChart(symbol);

            // Smooth scroll to chart
            document.querySelector(".chart-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    });
}

// ═══════════════════════════════════════════
// CHART PERIOD BUTTONS
// ═══════════════════════════════════════════
document.querySelectorAll(".chart-controls button").forEach(btn => {
    btn.addEventListener("click", function () {
        const period = this.dataset.period;

        // Skip if same period already active and loaded for the same symbol
        if (period === activePeriod && activeSymbol && !chartAbort) return;

        // Update active button state
        document.querySelectorAll(".chart-controls button").forEach(b => b.classList.remove("active"));
        this.classList.add("active");

        if (activeSymbol) {
            // Reset title (remove stale indicator)
            document.getElementById("chart-stock-title").textContent = `${activeSymbol} Chart`;
            // Clear activePeriod to force reload
            activePeriod = null;
            loadDashboardChart(activeSymbol, period);
        }
    });
});

// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════
initDashboardChart();
loadTicker();
loadMarketOverview();
loadTrending();
