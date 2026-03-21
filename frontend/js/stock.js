// stock.js — Stock Detail page logic (Finnhub-powered)

const API_BASE = "http://localhost:3000/api";

const params = new URLSearchParams(window.location.search);
const symbol = params.get("symbol") || "AAPL";
document.getElementById("stock-symbol").textContent = symbol;
document.title = `${symbol} - StockGuru`;

// ─── Fetch stock details on page load ───
async function loadStockDetails() {
    try {
        setLoadingState(true);
        const response = await fetch(`${API_BASE}/stocks/${encodeURIComponent(symbol)}`);
        const result = await response.json();

        if (!result.success) {
            showError(result.message || "Failed to load stock data");
            return;
        }
        displayStockData(result.data);
    } catch (error) {
        console.error("Failed to fetch stock details:", error);
        showError("Could not connect to server. Make sure backend is running.");
    } finally {
        setLoadingState(false);
    }
}

// ─── Formatting ───
function fmt(v, d = 2) { return v == null ? "N/A" : `$${Number(v).toFixed(d)}`; }
function fmtNum(v, d = 2) { return v == null ? "N/A" : Number(v).toFixed(d); }
function fmtPct(v) { return v == null ? "N/A" : `${Number(v).toFixed(2)}%`; }
function fmtDecPct(v) { return v == null ? "N/A" : `${(Number(v) * 100).toFixed(2)}%`; }
function fmtLargeVal(v) {
    if (v == null) return "N/A";
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}T`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}B`;
    return `$${Number(v).toFixed(2)}M`;
}
function fmtMarketCap(v) {
    if (!v) return "N/A";
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return `$${v.toLocaleString()}`;
}
function fmtVol(v) {
    if (v == null) return "N/A";
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toLocaleString();
}
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ─── Render all sections ───
function displayStockData(data) {
    // ── Hero: logo, name, sector ──
    const logoEl = document.getElementById("company-logo");
    if (data.company?.logo) {
        logoEl.src = data.company.logo;
        logoEl.alt = `${data.company.name} logo`;
        logoEl.style.display = "block";
        logoEl.onerror = () => { logoEl.style.display = "none"; };
    }

    setText("company-name", data.company?.name || symbol);
    setText("tag-sector", data.company?.industry || "N/A");

    // ── Hero: price + change ──
    const priceEl = document.getElementById("current-price");
    if (priceEl) priceEl.textContent = fmt(data.price);

    const changeEl = document.getElementById("price-change");
    if (changeEl && data.price != null && data.previousClose != null) {
        const change = data.price - data.previousClose;
        const pct = (change / data.previousClose) * 100;
        const up = change >= 0;
        changeEl.textContent = `${up ? "▲" : "▼"} ${up ? "+" : ""}${change.toFixed(2)} (${up ? "+" : ""}${pct.toFixed(2)}%)`;
        changeEl.className = `price-change ${up ? "pos" : "neg"}`;
        if (!up) priceEl.classList.add("down");
    }

    // Trend badge
    const trendEl = document.getElementById("trend-badge");
    if (trendEl && data.price != null && data.previousClose != null) {
        const up = data.price >= data.previousClose;
        trendEl.textContent = up ? "▲ Trending Up" : "▼ Trending Down";
        trendEl.className = `trend-badge ${up ? "trend-up" : "trend-down"}`;
        trendEl.style.display = "inline-block";
    }

    // Update chart title
    setText("chart-title", `📈 ${data.company?.name || symbol}`);

    // ── Compact stats row ──
    setText("stat-open", fmt(data.open));
    setText("stat-high", fmt(data.high));
    setText("stat-low", fmt(data.low));
    setText("stat-close", fmt(data.previousClose));
    setText("stat-volume", fmtVol(data.volume));

    // ── Key Statistics ──
    const cm = data.currentMetrics || {};
    setText("ks-pe", fmtNum(cm.peRatio));
    setText("ks-eps", fmt(cm.eps));
    setText("ks-roe", fmtPct(cm.roe));
    setText("ks-roa", fmtPct(cm.roa));
    setText("ks-nm", fmtPct(cm.netMargin));
    setText("ks-om", fmtPct(cm.operatingMargin));
    setText("ks-bv", fmt(cm.bookValue));
    setText("ks-mcap", fmtMarketCap(data.company?.marketCap));
    setText("ks-beta", fmtNum(cm.beta));
    setText("ks-52h", fmt(cm.weekHigh52));
    setText("ks-52l", fmt(cm.weekLow52));
    setText("ks-cr", fmtNum(cm.currentRatio));
    setText("ks-de", fmtNum(cm.debtToEquity));

    // ── Detailed Fundamentals ──
    renderFundamentals(data.annualFundamentals, data.quarterlyFundamentals);
}

// ─── Detailed Fundamentals (Tabs) ───
function renderFundamentals(annual, quarterly) {
    const hasAnnual = annual && annual.length > 0;
    const hasQuarterly = quarterly && quarterly.length > 0;

    if (!hasAnnual && !hasQuarterly) {
        document.getElementById("fund-empty").style.display = "flex";
        document.getElementById("fund-tabs").style.display = "none";
        return;
    }

    if (hasAnnual) renderAnnualCards(annual);
    if (hasQuarterly) renderQuarterlyCards(quarterly);

    document.querySelectorAll(".fund-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".fund-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".fund-panel").forEach(p => p.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
        });
    });
}

function renderAnnualCards(items) {
    const container = document.getElementById("annual-cards");
    container.innerHTML = items.map(item => `
        <div class="fund-card">
            <div class="fund-card-header">${item.year}</div>
            <div class="fund-card-body">
                ${metricRow("EPS", fmt(item.eps), true)}
                ${metricRow("P/E", fmtNum(item.pe), true)}
                ${metricRow("ROE", fmtDecPct(item.roe), true)}
                ${metricRow("ROA", fmtDecPct(item.roa))}
                ${metricRow("Book Value", fmtLargeVal(item.bookValue))}
                ${metricRow("Net Margin", fmtDecPct(item.netMargin))}
                ${metricRow("Rev/Share", fmt(item.revenuePerShare))}
                ${metricRow("Op. Margin", fmtDecPct(item.operatingMargin))}
            </div>
        </div>
    `).join("");
}

function renderQuarterlyCards(items) {
    const container = document.getElementById("quarterly-cards");
    container.innerHTML = items.map(item => `
        <div class="fund-card">
            <div class="fund-card-header">${item.label}</div>
            <div class="fund-card-body">
                ${metricRow("EPS", fmt(item.eps), true)}
                ${metricRow("P/E", fmtNum(item.pe), true)}
                ${metricRow("ROE", fmtDecPct(item.roe), true)}
                ${metricRow("ROA", fmtDecPct(item.roa))}
                ${metricRow("Book Value", fmtLargeVal(item.bookValue))}
            </div>
        </div>
    `).join("");
}

function metricRow(label, value, highlight = false) {
    const cls = highlight ? "fund-metric highlight" : "fund-metric";
    return `<div class="${cls}"><span class="fund-metric-label">${label}</span><span class="fund-metric-value">${value}</span></div>`;
}

// ─── Chart controls ───
document.querySelectorAll(".chart-controls button").forEach(btn => {
    btn.addEventListener("click", function () {
        document.querySelectorAll(".chart-controls button").forEach(b => b.classList.remove("active"));
        this.classList.add("active");
        console.log("Chart period:", this.dataset.period);
    });
});

// ─── Loading / Error / Watchlist ───
function setLoadingState(loading) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.classList.toggle("active", loading);
}

function showError(message) {
    setText("current-price", "—");
    const changeEl = document.getElementById("price-change");
    if (changeEl) { changeEl.textContent = message; changeEl.className = "price-change"; }
}

let inWatchlist = false;
function toggleWatchlist() {
    // Watchlist feature is under development — no persistence yet
    showToast("🔧 Watchlist coming soon — this feature is under development.");
}


function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

// Boot
loadStockDetails();
