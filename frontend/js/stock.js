// stock.js — Stock Detail page logic
// POLISHED: AbortController-based chart requests, proper loading/error/empty
// states, same-period guard, watchlist add/remove with JWT auth.

const API_BASE = "http://localhost:3000/api";
const params = new URLSearchParams(window.location.search);
const symbol = (params.get("symbol") || "AAPL").toUpperCase().trim();
document.getElementById("stock-symbol").textContent = symbol;
document.title = `${symbol} - StockGuru`;

// ═══════════════════════════════════════════
// CLIENT-SIDE CACHES
// ═══════════════════════════════════════════
let stockDetailsCache = null;          // Cache for current stock's detail data
let chartDataCache    = new Map();     // key: period → { points, stale, ts }
const CHART_CLIENT_TTL = 5 * 60 * 1000; // 5 min
let fetchingDetails = false;           // Guard against duplicate detail fetches
let chartAbort      = null;            // AbortController for chart requests
let activePeriod    = null;            // Currently loaded chart period

// ─── Auth helper ───
function getAuthToken() {
    return localStorage.getItem("token");
}

function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

// ─── Fetch stock details on page load ───
async function loadStockDetails() {
    if (fetchingDetails) return;
    fetchingDetails = true;
    try {
        setLoadingState(true);
        const response = await fetch(`${API_BASE}/stocks/${encodeURIComponent(symbol)}`);
        const result = await response.json();
        if (!result.success) {
            const msg = result.errorType === "RATE_LIMIT"
                ? "API rate limit reached. Please wait a moment and refresh."
                : result.errorType === "INVALID_SYMBOL"
                ? `"${symbol}" is not a valid or supported stock symbol.`
                : result.message || "Failed to load stock data";
            showError(msg);
            return;
        }
        stockDetailsCache = result.data;
        displayStockData(result.data);
    } catch (error) {
        console.error("Failed to fetch stock details:", error);
        showError("Could not connect to server. Make sure backend is running.");
    } finally {
        setLoadingState(false);
        fetchingDetails = false;
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

    // ── Smart Insights ──
    generateInsights(data);
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

// ═══════════════════════════════════════════
// SMART INSIGHTS ENGINE
// ═══════════════════════════════════════════
function generateInsights(data) {
    const cm = data.currentMetrics || {};
    const price = data.price;
    const insights = [];

    // 1. 52-Week Range Position
    if (price != null && cm.weekHigh52 != null && cm.weekLow52 != null && cm.weekHigh52 !== cm.weekLow52) {
        const range = cm.weekHigh52 - cm.weekLow52;
        const position = ((price - cm.weekLow52) / range) * 100;
        if (position >= 90) {
            insights.push({
                icon: '⬆', iconColor: 'green', accent: 'green',
                title: 'Near 52-Week High',
                desc: `Trading at <strong>${position.toFixed(0)}%</strong> of its 52-week range — within striking distance of <strong>${fmt(cm.weekHigh52)}</strong>.`,
                signal: 'Bullish Zone', sigColor: 'green'
            });
        } else if (position <= 15) {
            insights.push({
                icon: '⬇', iconColor: 'red', accent: 'red',
                title: 'Near 52-Week Low',
                desc: `Trading at just <strong>${position.toFixed(0)}%</strong> of its 52-week range — close to the yearly low of <strong>${fmt(cm.weekLow52)}</strong>.`,
                signal: 'Watch Closely', sigColor: 'red'
            });
        } else if (position >= 50) {
            insights.push({
                icon: '◈', iconColor: 'blue', accent: 'blue',
                title: '52-Week Range Position',
                desc: `Price sits at <strong>${position.toFixed(0)}%</strong> of its yearly range — leaning toward the upper half between <strong>${fmt(cm.weekLow52)}</strong> and <strong>${fmt(cm.weekHigh52)}</strong>.`,
                signal: 'Above Mid-Range', sigColor: 'blue'
            });
        } else {
            insights.push({
                icon: '◈', iconColor: 'yellow', accent: 'yellow',
                title: '52-Week Range Position',
                desc: `Price sits at <strong>${position.toFixed(0)}%</strong> of its yearly range — in the lower half between <strong>${fmt(cm.weekLow52)}</strong> and <strong>${fmt(cm.weekHigh52)}</strong>.`,
                signal: 'Below Mid-Range', sigColor: 'yellow'
            });
        }
    }

    // 2. P/E Ratio Valuation
    if (cm.peRatio != null) {
        const pe = Number(cm.peRatio);
        if (pe > 0 && pe < 15) {
            insights.push({
                icon: '◎', iconColor: 'green', accent: 'green',
                title: 'Valuation Looks Attractive',
                desc: `P/E ratio of <strong>${pe.toFixed(1)}</strong> is below the market average — may indicate undervalued or a value opportunity.`,
                signal: 'Low P/E', sigColor: 'green'
            });
        } else if (pe >= 15 && pe <= 25) {
            insights.push({
                icon: '◎', iconColor: 'blue', accent: 'blue',
                title: 'Fair Valuation',
                desc: `P/E ratio of <strong>${pe.toFixed(1)}</strong> is within the typical market range — suggests reasonable pricing.`,
                signal: 'Moderate P/E', sigColor: 'blue'
            });
        } else if (pe > 25) {
            insights.push({
                icon: '◎', iconColor: 'yellow', accent: 'yellow',
                title: 'Valuation Appears High',
                desc: `P/E ratio of <strong>${pe.toFixed(1)}</strong> exceeds market average — could signal high growth expectations or overvaluation.`,
                signal: 'High P/E', sigColor: 'yellow'
            });
        } else if (pe < 0) {
            insights.push({
                icon: '◎', iconColor: 'red', accent: 'red',
                title: 'Negative Earnings',
                desc: `P/E ratio is <strong>negative</strong> — the company is currently not profitable. Proceed with caution.`,
                signal: 'Negative P/E', sigColor: 'red'
            });
        }
    }

    // 3. Return on Equity
    if (cm.roe != null) {
        const roe = Number(cm.roe);
        if (roe >= 20) {
            insights.push({
                icon: '★', iconColor: 'green', accent: 'green',
                title: 'Strong Profitability',
                desc: `ROE of <strong>${roe.toFixed(1)}%</strong> shows the company generates excellent returns on shareholder equity.`,
                signal: 'High ROE', sigColor: 'green'
            });
        } else if (roe >= 10 && roe < 20) {
            insights.push({
                icon: '★', iconColor: 'blue', accent: 'blue',
                title: 'Solid Profitability',
                desc: `ROE of <strong>${roe.toFixed(1)}%</strong> indicates decent returns on equity — within a healthy range.`,
                signal: 'Good ROE', sigColor: 'blue'
            });
        } else if (roe >= 0 && roe < 10) {
            insights.push({
                icon: '★', iconColor: 'yellow', accent: 'yellow',
                title: 'Modest Profitability',
                desc: `ROE of <strong>${roe.toFixed(1)}%</strong> is below average — the company may be underutilizing equity.`,
                signal: 'Low ROE', sigColor: 'yellow'
            });
        }
    }

    // 4. Beta / Volatility
    if (cm.beta != null) {
        const beta = Number(cm.beta);
        if (beta > 1.5) {
            insights.push({
                icon: '⚡', iconColor: 'red', accent: 'red',
                title: 'High Volatility',
                desc: `Beta of <strong>${beta.toFixed(2)}</strong> means this stock is significantly more volatile than the market — higher risk/reward.`,
                signal: 'High Beta', sigColor: 'red'
            });
        } else if (beta >= 1.0 && beta <= 1.5) {
            insights.push({
                icon: '⚡', iconColor: 'yellow', accent: 'yellow',
                title: 'Above-Average Volatility',
                desc: `Beta of <strong>${beta.toFixed(2)}</strong> indicates slightly higher volatility than the broader market.`,
                signal: 'Moderate Beta', sigColor: 'yellow'
            });
        } else if (beta >= 0 && beta < 1.0) {
            insights.push({
                icon: '⚡', iconColor: 'green', accent: 'green',
                title: 'Lower Volatility',
                desc: `Beta of <strong>${beta.toFixed(2)}</strong> suggests this stock is less volatile than the market — more stability.`,
                signal: 'Low Beta', sigColor: 'green'
            });
        }
    }

    // 5. Net Margin — Business Health
    if (cm.netMargin != null) {
        const nm = Number(cm.netMargin);
        if (nm >= 20) {
            insights.push({
                icon: '▣', iconColor: 'green', accent: 'green',
                title: 'Excellent Margins',
                desc: `Net margin of <strong>${nm.toFixed(1)}%</strong> indicates a highly profitable business model with strong pricing power.`,
                signal: 'Premium Margin', sigColor: 'green'
            });
        } else if (nm >= 10 && nm < 20) {
            insights.push({
                icon: '▣', iconColor: 'blue', accent: 'blue',
                title: 'Healthy Margins',
                desc: `Net margin of <strong>${nm.toFixed(1)}%</strong> shows a solid bottom line — typical of a well-run company.`,
                signal: 'Good Margin', sigColor: 'blue'
            });
        } else if (nm >= 0 && nm < 10) {
            insights.push({
                icon: '▣', iconColor: 'yellow', accent: 'yellow',
                title: 'Thin Margins',
                desc: `Net margin of <strong>${nm.toFixed(1)}%</strong> is on the thinner side — may face pressure in downturns.`,
                signal: 'Low Margin', sigColor: 'yellow'
            });
        } else if (nm < 0) {
            insights.push({
                icon: '▣', iconColor: 'red', accent: 'red',
                title: 'Negative Margins',
                desc: `Net margin is <strong>${nm.toFixed(1)}%</strong> — the company is losing money on revenue.`,
                signal: 'Losing Money', sigColor: 'red'
            });
        }
    }

    // 6. Debt-to-Equity
    if (cm.debtToEquity != null) {
        const de = Number(cm.debtToEquity);
        if (de > 2.0) {
            insights.push({
                icon: '⬥', iconColor: 'red', accent: 'red',
                title: 'Heavy Debt Load',
                desc: `Debt/Equity of <strong>${de.toFixed(2)}</strong> is high — the company relies heavily on debt financing.`,
                signal: 'High Leverage', sigColor: 'red'
            });
        } else if (de >= 0.5 && de <= 2.0) {
            insights.push({
                icon: '⬥', iconColor: 'blue', accent: 'blue',
                title: 'Moderate Leverage',
                desc: `Debt/Equity of <strong>${de.toFixed(2)}</strong> is within a reasonable range — balanced capital structure.`,
                signal: 'Balanced Debt', sigColor: 'blue'
            });
        } else if (de >= 0 && de < 0.5) {
            insights.push({
                icon: '⬥', iconColor: 'green', accent: 'green',
                title: 'Low Debt',
                desc: `Debt/Equity of <strong>${de.toFixed(2)}</strong> signals a conservatively financed company with low risk.`,
                signal: 'Low Leverage', sigColor: 'green'
            });
        }
    }

    // Render insights (cap at 6)
    const section = document.getElementById('insights-section');
    const grid = document.getElementById('insights-grid');
    const badge = document.getElementById('insights-badge');

    if (insights.length === 0 || !section || !grid) return;

    const capped = insights.slice(0, 6);
    badge.textContent = `${capped.length} Signals`;
    grid.innerHTML = capped.map(renderInsightCard).join('');
    section.style.display = 'block';
}

function renderInsightCard(ins) {
    return `
        <div class="insight-card accent-${ins.accent}">
            <div class="insight-header">
                <div class="insight-icon icon-${ins.iconColor}">${ins.icon}</div>
                <div class="insight-title">${ins.title}</div>
            </div>
            <div class="insight-desc">${ins.desc}</div>
            <div class="insight-signal">
                <span class="signal-dot dot-${ins.sigColor}"></span>
                <span class="signal-label sig-${ins.sigColor}">${ins.signal}</span>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════
// CHART.JS — AbortController-based requests
// ═══════════════════════════════════════════
let priceChart;
function initChart() {
    const ctx = document.getElementById('priceChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Price', data: [],
                borderColor: '#00ff88', borderWidth: 2,
                pointRadius: 0, pointHoverRadius: 6,
                pointHoverBackgroundColor: '#00ff88',
                pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
                fill: true, backgroundColor: gradient, tension: 0.1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a1a1a', titleColor: '#00ff88',
                    bodyColor: '#fff', borderColor: '#333', borderWidth: 1,
                    padding: 12, displayColors: false,
                    callbacks: {
                        label: (context) => `Price: $${context.parsed.y.toFixed(2)}`,
                        title: (items) => {
                            return new Date(items[0].label).toLocaleDateString(undefined, {
                                year: 'numeric', month: 'short', day: 'numeric'
                            });
                        }
                    }
                }
            },
            scales: {
                x: { display: false },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#888', font: { size: 10 },
                        callback: (value) => '$' + value
                    }
                }
            }
        }
    });
}

async function fetchAndRenderChart(period = '1M') {
    // Skip if same period already loaded
    if (period === activePeriod && !chartAbort) return;

    // Check client-side cache first
    const cached = chartDataCache.get(period);
    if (cached && (Date.now() - cached.ts) < CHART_CLIENT_TTL) {
        activePeriod = period;
        applyChartData(cached.points, cached.stale);
        return;
    }

    // Abort any in-flight chart request
    if (chartAbort) {
        chartAbort.abort();
        chartAbort = null;
    }

    const loader  = document.getElementById("chart-loader");
    const errorEl = document.getElementById("chart-error");
    const canvas  = document.getElementById("priceChart");

    // Show loading state
    if (loader)  loader.style.display = "flex";
    if (errorEl) errorEl.style.display = "none";
    if (canvas)  canvas.style.opacity = "0.3";

    const controller = new AbortController();
    chartAbort = controller;

    try {
        const response = await fetch(
            `${API_BASE}/stocks/${encodeURIComponent(symbol)}/candles?period=${period}`,
            { signal: controller.signal }
        );
        const result = await response.json();

        // If aborted, bail silently
        if (controller.signal.aborted) return;

        if (!result.success || !result.points || result.points.length === 0) {
            throw new Error(result.message || "No chart data available for this period.");
        }

        // Cache client-side
        chartDataCache.set(period, {
            points: result.points,
            stale: result.stale || false,
            ts: Date.now()
        });

        activePeriod = period;
        applyChartData(result.points, result.stale);
    } catch (err) {
        if (err.name === "AbortError") return;

        console.error("Chart error:", err);
        if (errorEl) {
            errorEl.style.display = "flex";
            document.getElementById("chart-error-msg").textContent = err.message || "Failed to load chart.";
        }
        if (canvas) canvas.style.opacity = "0";
    } finally {
        if (loader) loader.style.display = "none";
        if (chartAbort === controller) chartAbort = null;
    }
}

function applyChartData(points, stale = false) {
    const canvas  = document.getElementById("priceChart");
    const errorEl = document.getElementById("chart-error");

    // Hide error if previously shown
    if (errorEl) errorEl.style.display = "none";

    priceChart.data.labels = points.map(p => p.date);
    priceChart.data.datasets[0].data = points.map(p => p.price);
    priceChart.update('none');
    if (canvas) canvas.style.opacity = "1";

    // Show stale-data indicator if serving cached fallback
    const titleEl = document.getElementById("chart-title");
    if (titleEl) {
        const baseName = stockDetailsCache?.company?.name || symbol;
        titleEl.textContent = stale
            ? `📈 ${baseName} (cached)`
            : `📈 ${baseName}`;
    }
}

// ─── Chart controls ───
document.querySelectorAll(".chart-controls button").forEach(btn => {
    btn.addEventListener("click", function () {
        const period = this.dataset.period;

        // Skip if same period already active
        if (period === activePeriod && !chartAbort) return;

        // Update active button
        document.querySelectorAll(".chart-controls button").forEach(b => b.classList.remove("active"));
        this.classList.add("active");

        // Clear activePeriod to force reload
        activePeriod = null;
        fetchAndRenderChart(period);
    });
});

// ═══════════════════════════════════════════
// WATCHLIST TOGGLE (with JWT auth)
// ═══════════════════════════════════════════
let inWatchlist = false;
let watchlistBusy = false; // Prevent rapid double-clicks

async function initWatchlistButton() {
    const btn = document.getElementById("watchlist-btn");
    if (!btn) return;

    const token = getAuthToken();
    if (!token) {
        // Guest: show default state, clicking prompts login
        btn.textContent = "☆ Add to Watchlist";
        return;
    }

    // Check if this stock is already in watchlist
    try {
        const res = await fetch(`${API_BASE}/watchlist/check/${encodeURIComponent(symbol)}`, {
            headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (data.success) {
            inWatchlist = data.inWatchlist;
            updateWatchlistButton();
        }
    } catch {
        // Silently fail — button will show default state
    }
}

function updateWatchlistButton() {
    const btn = document.getElementById("watchlist-btn");
    if (!btn) return;

    if (inWatchlist) {
        btn.textContent = "★ In Watchlist";
        btn.classList.add("active");
    } else {
        btn.textContent = "☆ Add to Watchlist";
        btn.classList.remove("active");
    }
}

// Called from the onclick handler on the button
async function toggleWatchlist() {
    const token = getAuthToken();

    // Not logged in — prompt login
    if (!token) {
        showToast("🔒 Please log in to use the watchlist.");
        setTimeout(() => {
            window.location.href = "login.html";
        }, 1500);
        return;
    }

    // Prevent double-clicks
    if (watchlistBusy) return;
    watchlistBusy = true;

    try {
        if (inWatchlist) {
            // Remove from watchlist
            const res = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(symbol)}`, {
                method: "DELETE",
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                inWatchlist = false;
                updateWatchlistButton();
                showToast(`✓ ${symbol} removed from watchlist.`);
            } else {
                showToast(`✗ ${data.message || "Failed to remove."}`);
            }
        } else {
            // Add to watchlist
            const res = await fetch(`${API_BASE}/watchlist`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeaders(),
                },
                body: JSON.stringify({ symbol }),
            });
            const data = await res.json();
            if (data.success) {
                inWatchlist = true;
                updateWatchlistButton();
                showToast(`✓ ${symbol} added to watchlist!`);
            } else {
                showToast(`✗ ${data.message || "Failed to add."}`);
            }
        }
    } catch {
        showToast("✗ Could not connect to server.");
    } finally {
        watchlistBusy = false;
    }
}

// ─── Loading / Error / Toast ───
function setLoadingState(loading) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.classList.toggle("active", loading);
}
function showError(message) {
    setText("current-price", "—");
    const changeEl = document.getElementById("price-change");
    if (changeEl) { changeEl.textContent = message; changeEl.className = "price-change"; }
}
function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════
(async () => {
    initChart();
    await loadStockDetails();
    fetchAndRenderChart('1M');
    initWatchlistButton();
})();
