// stock.js — Stock Detail page logic
// POLISHED: AbortController-based chart requests, proper loading/error/empty
// states, same-period guard, watchlist add/remove with JWT auth.
// UPGRADED: Chart Intelligence, Overall Signal, Quick Decision panels.

const API_BASE = "http://localhost:3000/api";
const params = new URLSearchParams(window.location.search);
const symbol = (params.get("symbol") || "AAPL").toUpperCase().trim();
document.getElementById("stock-symbol").textContent = symbol;
document.title = `${symbol} - StockGuru`;

// ═══════════════════════════════════════════
// CLIENT-SIDE CACHES
// ═══════════════════════════════════════════
let stockDetailsCache = null;          // Cache for current stock's detail data
let chartDataCache = new Map();     // key: period → { points, stale, ts }
const CHART_CLIENT_TTL = 5 * 60 * 1000; // 5 min
let fetchingDetails = false;           // Guard against duplicate detail fetches
let chartAbort = null;            // AbortController for chart requests
let activePeriod = null;            // Currently loaded chart period
let currentHorizon = 'short';         // Investment horizon: 'short' | 'long'

// ─── Auth helper ───
function getAuthToken() {
    return localStorage.getItem("token");
}

function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

// ═══════════════════════════════════════════
// INVESTMENT HORIZON MANAGER
// ═══════════════════════════════════════════

// Chart period defaults per mode
const HORIZON_CHART_PERIOD = { short: '1M', long: '1Y' };

// Insight category priorities per mode (lower index = higher priority)
const HORIZON_INSIGHT_PRIORITY = {
    short: ['momentum', 'range', 'volatility', 'valuation', 'profitability', 'leverage'],
    long: ['valuation', 'profitability', 'leverage', 'margin', 'range', 'momentum', 'volatility']
};

/** Read the saved horizon from localStorage. */
function getCurrentHorizon() {
    return localStorage.getItem('stockguru_horizon') || 'short';
}

/** Persist and apply a new horizon mode. */
function setHorizon(mode) {
    if (mode !== 'short' && mode !== 'long') mode = 'short';
    currentHorizon = mode;
    localStorage.setItem('stockguru_horizon', mode);
    updateHorizonUI(mode);
    onHorizonChange(mode);
}

/** Update the toggle button states and slider position. */
function updateHorizonUI(mode) {
    const btnShort = document.getElementById('horizon-btn-short');
    const btnLong = document.getElementById('horizon-btn-long');
    const slider = document.getElementById('horizon-slider');
    if (!btnShort || !btnLong || !slider) return;

    btnShort.classList.toggle('active', mode === 'short');
    btnLong.classList.toggle('active', mode === 'long');
    slider.classList.toggle('slide-long', mode === 'long');
}

/** Initialize the horizon toggle — restore state and bind click events. */
function initHorizonToggle() {
    currentHorizon = getCurrentHorizon();
    updateHorizonUI(currentHorizon);

    document.querySelectorAll('.horizon-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const mode = this.dataset.mode;
            if (mode === currentHorizon) return; // already active
            setHorizon(mode);
        });
    });
}

/**
 * Called whenever the horizon mode changes.
 * Orchestrates all downstream updates:
 *   1. Switch chart to the mode's default period
 *   2. Reload prediction with the new mode
 *   3. Re-sort insights by mode relevance
 *   4. Update signal headline
 */
function onHorizonChange(mode) {
    // 1. Switch chart period
    const targetPeriod = HORIZON_CHART_PERIOD[mode];
    // Update the active button visually
    document.querySelectorAll('.chart-controls button').forEach(b => {
        b.classList.toggle('active', b.dataset.period === targetPeriod);
    });
    activePeriod = null; // force reload
    fetchAndRenderChart(targetPeriod);

    // 2. Reload prediction with mode
    loadPrediction(symbol);

    // 3. Re-sort insights if data is cached
    if (stockDetailsCache) {
        generateInsights(stockDetailsCache);
    }

    // 4. Update signal headline
    const headlineEl = document.getElementById('signal-headline');
    if (headlineEl) {
        headlineEl.textContent = mode === 'long' ? 'Long-Term Signal' : 'Short-Term Signal';
    }

    showToast(`Switched to ${mode === 'long' ? 'Long-Term' : 'Short-Term'} mode`);
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

    // ── Analysis Panels ──
    generateInsights(data);
    renderOverallSignal(data);
    renderDecisionPanel(data);
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

    // 1. 52-Week Range Position  [category: range]
    if (price != null && cm.weekHigh52 != null && cm.weekLow52 != null && cm.weekHigh52 !== cm.weekLow52) {
        const range = cm.weekHigh52 - cm.weekLow52;
        const position = ((price - cm.weekLow52) / range) * 100;
        if (position >= 90) {
            insights.push({
                icon: '⬆', iconColor: 'green', accent: 'green',
                title: 'Near 52-Week High',
                desc: `Trading at <strong>${position.toFixed(0)}%</strong> of its 52-week range — within striking distance of <strong>${fmt(cm.weekHigh52)}</strong>.`,
                signal: 'Bullish Zone', sigColor: 'green',
                category: 'range'
            });
        } else if (position <= 15) {
            insights.push({
                icon: '⬇', iconColor: 'red', accent: 'red',
                title: 'Near 52-Week Low',
                desc: `Trading at just <strong>${position.toFixed(0)}%</strong> of its 52-week range — close to the yearly low of <strong>${fmt(cm.weekLow52)}</strong>.`,
                signal: 'Watch Closely', sigColor: 'red',
                category: 'range'
            });
        } else if (position >= 50) {
            insights.push({
                icon: '◈', iconColor: 'blue', accent: 'blue',
                title: '52-Week Range Position',
                desc: `Price sits at <strong>${position.toFixed(0)}%</strong> of its yearly range — leaning toward the upper half between <strong>${fmt(cm.weekLow52)}</strong> and <strong>${fmt(cm.weekHigh52)}</strong>.`,
                signal: 'Above Mid-Range', sigColor: 'blue',
                category: 'range'
            });
        } else {
            insights.push({
                icon: '◈', iconColor: 'yellow', accent: 'yellow',
                title: '52-Week Range Position',
                desc: `Price sits at <strong>${position.toFixed(0)}%</strong> of its yearly range — in the lower half between <strong>${fmt(cm.weekLow52)}</strong> and <strong>${fmt(cm.weekHigh52)}</strong>.`,
                signal: 'Below Mid-Range', sigColor: 'yellow',
                category: 'range'
            });
        }
    }

    // 2. P/E Ratio Valuation  [category: valuation]
    if (cm.peRatio != null) {
        const pe = Number(cm.peRatio);
        if (pe > 0 && pe < 15) {
            insights.push({
                icon: '◎', iconColor: 'green', accent: 'green',
                title: 'Valuation Looks Attractive',
                desc: `P/E ratio of <strong>${pe.toFixed(1)}</strong> is below the market average — may indicate undervalued or a value opportunity.`,
                signal: 'Low P/E', sigColor: 'green',
                category: 'valuation'
            });
        } else if (pe >= 15 && pe <= 25) {
            insights.push({
                icon: '◎', iconColor: 'blue', accent: 'blue',
                title: 'Fair Valuation',
                desc: `P/E ratio of <strong>${pe.toFixed(1)}</strong> is within the typical market range — suggests reasonable pricing.`,
                signal: 'Moderate P/E', sigColor: 'blue',
                category: 'valuation'
            });
        } else if (pe > 25) {
            insights.push({
                icon: '◎', iconColor: 'yellow', accent: 'yellow',
                title: 'Valuation Appears High',
                desc: `P/E ratio of <strong>${pe.toFixed(1)}</strong> exceeds market average — could signal high growth expectations or overvaluation.`,
                signal: 'High P/E', sigColor: 'yellow',
                category: 'valuation'
            });
        } else if (pe < 0) {
            insights.push({
                icon: '◎', iconColor: 'red', accent: 'red',
                title: 'Negative Earnings',
                desc: `P/E ratio is <strong>negative</strong> — the company is currently not profitable. Proceed with caution.`,
                signal: 'Negative P/E', sigColor: 'red',
                category: 'valuation'
            });
        }
    }

    // 3. Return on Equity  [category: profitability]
    if (cm.roe != null) {
        const roe = Number(cm.roe);
        if (roe >= 20) {
            insights.push({
                icon: '★', iconColor: 'green', accent: 'green',
                title: 'Strong Profitability',
                desc: `ROE of <strong>${roe.toFixed(1)}%</strong> shows the company generates excellent returns on shareholder equity.`,
                signal: 'High ROE', sigColor: 'green',
                category: 'profitability'
            });
        } else if (roe >= 10 && roe < 20) {
            insights.push({
                icon: '★', iconColor: 'blue', accent: 'blue',
                title: 'Solid Profitability',
                desc: `ROE of <strong>${roe.toFixed(1)}%</strong> indicates decent returns on equity — within a healthy range.`,
                signal: 'Good ROE', sigColor: 'blue',
                category: 'profitability'
            });
        } else if (roe >= 0 && roe < 10) {
            insights.push({
                icon: '★', iconColor: 'yellow', accent: 'yellow',
                title: 'Modest Profitability',
                desc: `ROE of <strong>${roe.toFixed(1)}%</strong> is below average — the company may be underutilizing equity.`,
                signal: 'Low ROE', sigColor: 'yellow',
                category: 'profitability'
            });
        }
    }

    // 4. Beta / Volatility  [category: volatility]
    if (cm.beta != null) {
        const beta = Number(cm.beta);
        if (beta > 1.5) {
            insights.push({
                icon: '⚡︎', iconColor: 'red', accent: 'red',
                title: 'High Volatility',
                desc: `Beta of <strong>${beta.toFixed(2)}</strong> means this stock is significantly more volatile than the market — higher risk/reward.`,
                signal: 'High Beta', sigColor: 'red',
                category: 'volatility'
            });
        } else if (beta >= 1.0 && beta <= 1.5) {
            insights.push({
                icon: '⚡︎', iconColor: 'yellow', accent: 'yellow',
                title: 'Above-Average Volatility',
                desc: `Beta of <strong>${beta.toFixed(2)}</strong> indicates slightly higher volatility than the broader market.`,
                signal: 'Moderate Beta', sigColor: 'yellow',
                category: 'volatility'
            });
        } else if (beta >= 0 && beta < 1.0) {
            insights.push({
                icon: '⚡︎', iconColor: 'green', accent: 'green',
                title: 'Lower Volatility',
                desc: `Beta of <strong>${beta.toFixed(2)}</strong> suggests this stock is less volatile than the market — more stability.`,
                signal: 'Low Beta', sigColor: 'green',
                category: 'volatility'
            });
        }
    }

    // 5. Net Margin — Business Health  [category: margin]
    if (cm.netMargin != null) {
        const nm = Number(cm.netMargin);
        if (nm >= 20) {
            insights.push({
                icon: '▣', iconColor: 'green', accent: 'green',
                title: 'Excellent Margins',
                desc: `Net margin of <strong>${nm.toFixed(1)}%</strong> indicates a highly profitable business model with strong pricing power.`,
                signal: 'Premium Margin', sigColor: 'green',
                category: 'margin'
            });
        } else if (nm >= 10 && nm < 20) {
            insights.push({
                icon: '▣', iconColor: 'blue', accent: 'blue',
                title: 'Healthy Margins',
                desc: `Net margin of <strong>${nm.toFixed(1)}%</strong> shows a solid bottom line — typical of a well-run company.`,
                signal: 'Good Margin', sigColor: 'blue',
                category: 'margin'
            });
        } else if (nm >= 0 && nm < 10) {
            insights.push({
                icon: '▣', iconColor: 'yellow', accent: 'yellow',
                title: 'Thin Margins',
                desc: `Net margin of <strong>${nm.toFixed(1)}%</strong> is on the thinner side — may face pressure in downturns.`,
                signal: 'Low Margin', sigColor: 'yellow',
                category: 'margin'
            });
        } else if (nm < 0) {
            insights.push({
                icon: '▣', iconColor: 'red', accent: 'red',
                title: 'Negative Margins',
                desc: `Net margin is <strong>${nm.toFixed(1)}%</strong> — the company is losing money on revenue.`,
                signal: 'Losing Money', sigColor: 'red',
                category: 'margin'
            });
        }
    }

    // 6. Debt-to-Equity  [category: leverage]
    if (cm.debtToEquity != null) {
        const de = Number(cm.debtToEquity);
        if (de > 2.0) {
            insights.push({
                icon: '⬥', iconColor: 'red', accent: 'red',
                title: 'Heavy Debt Load',
                desc: `Debt/Equity of <strong>${de.toFixed(2)}</strong> is high — the company relies heavily on debt financing.`,
                signal: 'High Leverage', sigColor: 'red',
                category: 'leverage'
            });
        } else if (de >= 0.5 && de <= 2.0) {
            insights.push({
                icon: '⬥', iconColor: 'blue', accent: 'blue',
                title: 'Moderate Leverage',
                desc: `Debt/Equity of <strong>${de.toFixed(2)}</strong> is within a reasonable range — balanced capital structure.`,
                signal: 'Balanced Debt', sigColor: 'blue',
                category: 'leverage'
            });
        } else if (de >= 0 && de < 0.5) {
            insights.push({
                icon: '⬥', iconColor: 'green', accent: 'green',
                title: 'Low Debt',
                desc: `Debt/Equity of <strong>${de.toFixed(2)}</strong> signals a conservatively financed company with low risk.`,
                signal: 'Low Leverage', sigColor: 'green',
                category: 'leverage'
            });
        }
    }

    // ── Sort insights by current horizon mode priority ──
    const priorities = HORIZON_INSIGHT_PRIORITY[currentHorizon] || HORIZON_INSIGHT_PRIORITY.short;
    insights.sort((a, b) => {
        const idxA = priorities.indexOf(a.category);
        const idxB = priorities.indexOf(b.category);
        // Categories not in the priority list go to the end
        return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    // Render insights (cap at 6)
    const section = document.getElementById('insights-section');
    const grid = document.getElementById('insights-grid');
    const badge = document.getElementById('insights-badge');

    if (insights.length === 0 || !section || !grid) return;

    const modeLabel = currentHorizon === 'long' ? 'Long-Term' : 'Short-Term';
    const capped = insights.slice(0, 6);
    badge.textContent = `${capped.length} Signals · ${modeLabel}`;
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
// OVERALL SIGNAL ENGINE
// ═══════════════════════════════════════════
function renderOverallSignal(data) {
    const cm = data.currentMetrics || {};
    const section = document.getElementById('overall-signal');
    if (!section) return;

    // Scoring system: each factor contributes +1 (bullish), 0 (neutral), or -1 (bearish)
    let score = 0;
    let factors = 0;

    // Price vs previous close
    if (data.price != null && data.previousClose != null) {
        const changePct = ((data.price - data.previousClose) / data.previousClose) * 100;
        if (changePct > 1) { score += 1; } else if (changePct < -1) { score -= 1; }
        factors++;
    }

    // 52-week range position
    if (data.price != null && cm.weekHigh52 != null && cm.weekLow52 != null && cm.weekHigh52 !== cm.weekLow52) {
        const pos = ((data.price - cm.weekLow52) / (cm.weekHigh52 - cm.weekLow52)) * 100;
        if (pos >= 70) { score += 1; } else if (pos <= 30) { score -= 1; }
        factors++;
    }

    // P/E Ratio
    if (cm.peRatio != null) {
        const pe = Number(cm.peRatio);
        if (pe > 0 && pe < 20) { score += 1; } else if (pe > 35 || pe < 0) { score -= 1; }
        factors++;
    }

    // ROE
    if (cm.roe != null) {
        const roe = Number(cm.roe);
        if (roe >= 15) { score += 1; } else if (roe < 5) { score -= 1; }
        factors++;
    }

    // Net Margin
    if (cm.netMargin != null) {
        const nm = Number(cm.netMargin);
        if (nm >= 15) { score += 1; } else if (nm < 0) { score -= 1; }
        factors++;
    }

    // Beta
    if (cm.beta != null) {
        const beta = Number(cm.beta);
        if (beta >= 0.5 && beta <= 1.2) { score += 1; } else if (beta > 2.0) { score -= 1; }
        factors++;
    }

    // Debt/Equity
    if (cm.debtToEquity != null) {
        const de = Number(cm.debtToEquity);
        if (de < 1.0) { score += 1; } else if (de > 2.5) { score -= 1; }
        factors++;
    }

    if (factors === 0) return;

    // Normalize score to -1...+1 range
    const normalized = score / factors;
    const confidence = Math.min(Math.round(Math.abs(normalized) * 100), 95);

    let verdict, sigClass, icon;
    if (normalized > 0.15) {
        verdict = 'Bullish';
        sigClass = 'sig-bullish';
        icon = '▲';
    } else if (normalized < -0.15) {
        verdict = 'Bearish';
        sigClass = 'sig-bearish';
        icon = '▼';
    } else {
        verdict = 'Neutral';
        sigClass = 'sig-neutral';
        icon = '◆';
    }

    section.className = `overall-signal ${sigClass}`;
    document.getElementById('signal-icon-lg').textContent = icon;
    const modeLabel = currentHorizon === 'long' ? 'Long-Term Signal' : 'Short-Term Signal';
    document.getElementById('signal-headline').textContent = modeLabel;
    document.getElementById('signal-verdict').textContent = verdict;
    document.getElementById('confidence-fill').style.width = `${confidence}%`;
    document.getElementById('confidence-pct').textContent = `${confidence}%`;
    section.style.display = 'block';
}

// ═══════════════════════════════════════════
// QUICK DECISION PANEL
// ═══════════════════════════════════════════
function renderDecisionPanel(data) {
    const cm = data.currentMetrics || {};
    const section = document.getElementById('decision-panel');
    if (!section) return;

    const strengths = [];
    const risks = [];

    // ── Strengths ──
    if (cm.roe != null && Number(cm.roe) >= 15) {
        strengths.push(`Strong return on equity at <strong>${Number(cm.roe).toFixed(1)}%</strong> — efficient use of capital`);
    }
    if (cm.netMargin != null && Number(cm.netMargin) >= 15) {
        strengths.push(`Healthy net margin of <strong>${Number(cm.netMargin).toFixed(1)}%</strong> — solid profitability`);
    }
    if (cm.peRatio != null && Number(cm.peRatio) > 0 && Number(cm.peRatio) < 20) {
        strengths.push(`Reasonable P/E of <strong>${Number(cm.peRatio).toFixed(1)}</strong> — not overpriced relative to earnings`);
    }
    if (cm.debtToEquity != null && Number(cm.debtToEquity) < 1.0) {
        strengths.push(`Low debt-to-equity of <strong>${Number(cm.debtToEquity).toFixed(2)}</strong> — conservative financing`);
    }
    if (cm.beta != null && Number(cm.beta) >= 0.5 && Number(cm.beta) <= 1.2) {
        strengths.push(`Stable beta of <strong>${Number(cm.beta).toFixed(2)}</strong> — manageable volatility`);
    }
    if (cm.currentRatio != null && Number(cm.currentRatio) >= 1.5) {
        strengths.push(`Strong current ratio of <strong>${Number(cm.currentRatio).toFixed(2)}</strong> — good short-term liquidity`);
    }
    if (cm.operatingMargin != null && Number(cm.operatingMargin) >= 20) {
        strengths.push(`High operating margin of <strong>${Number(cm.operatingMargin).toFixed(1)}%</strong> — strong core business`);
    }
    if (data.price != null && cm.weekHigh52 != null && cm.weekLow52 != null) {
        const pos = ((data.price - cm.weekLow52) / (cm.weekHigh52 - cm.weekLow52)) * 100;
        if (pos >= 75) {
            strengths.push(`Trading near 52-week high — strong momentum and investor confidence`);
        }
    }

    // ── Risks ──
    if (cm.peRatio != null && Number(cm.peRatio) > 35) {
        risks.push(`High P/E ratio of <strong>${Number(cm.peRatio).toFixed(1)}</strong> — may be overvalued or priced for perfection`);
    }
    if (cm.peRatio != null && Number(cm.peRatio) < 0) {
        risks.push(`Negative P/E — the company is currently <strong>unprofitable</strong>`);
    }
    if (cm.debtToEquity != null && Number(cm.debtToEquity) > 2.0) {
        risks.push(`Heavy debt load with D/E of <strong>${Number(cm.debtToEquity).toFixed(2)}</strong> — financial risk`);
    }
    if (cm.beta != null && Number(cm.beta) > 1.5) {
        risks.push(`High beta of <strong>${Number(cm.beta).toFixed(2)}</strong> — significantly more volatile than market`);
    }
    if (cm.netMargin != null && Number(cm.netMargin) < 0) {
        risks.push(`Negative net margin of <strong>${Number(cm.netMargin).toFixed(1)}%</strong> — company is losing money`);
    }
    if (cm.netMargin != null && Number(cm.netMargin) >= 0 && Number(cm.netMargin) < 5) {
        risks.push(`Thin net margin of <strong>${Number(cm.netMargin).toFixed(1)}%</strong> — vulnerable to cost increases`);
    }
    if (cm.currentRatio != null && Number(cm.currentRatio) < 1.0) {
        risks.push(`Current ratio below 1.0 (<strong>${Number(cm.currentRatio).toFixed(2)}</strong>) — potential liquidity concern`);
    }
    if (cm.roe != null && Number(cm.roe) < 5) {
        risks.push(`Low ROE of <strong>${Number(cm.roe).toFixed(1)}%</strong> — poor capital efficiency`);
    }
    if (data.price != null && cm.weekHigh52 != null && cm.weekLow52 != null) {
        const pos = ((data.price - cm.weekLow52) / (cm.weekHigh52 - cm.weekLow52)) * 100;
        if (pos <= 20) {
            risks.push(`Trading near 52-week low — possible downtrend or underlying issues`);
        }
    }

    // If we have neither strengths nor risks, hide the panel
    if (strengths.length === 0 && risks.length === 0) return;

    // Render
    const strengthsList = document.getElementById('strengths-list');
    const risksList = document.getElementById('risks-list');

    strengthsList.innerHTML = strengths.length > 0
        ? strengths.map(s => `<li>${s}</li>`).join('')
        : '<li>No standout strengths identified from available data.</li>';

    risksList.innerHTML = risks.length > 0
        ? risks.map(r => `<li>${r}</li>`).join('')
        : '<li>No major risks identified from available data.</li>';

    // Conclusion
    const conclusionEl = document.getElementById('decision-conclusion');
    const totalFactors = strengths.length + risks.length;
    const ratio = totalFactors > 0 ? strengths.length / totalFactors : 0.5;

    let conclusionText, conclusionClass;
    if (ratio >= 0.65) {
        conclusionText = `<strong>Summary:</strong> ${data.company?.name || symbol} shows predominantly positive fundamentals with <strong>${strengths.length} strengths</strong> vs <strong>${risks.length} risks</strong>. The data suggests a relatively favorable outlook, though investors should always conduct thorough due diligence.`;
        conclusionClass = 'conclusion-bullish';
    } else if (ratio <= 0.35) {
        conclusionText = `<strong>Summary:</strong> ${data.company?.name || symbol} presents several risk factors with <strong>${risks.length} risks</strong> vs <strong>${strengths.length} strengths</strong>. Caution is warranted — consider reviewing the full financial picture before making investment decisions.`;
        conclusionClass = 'conclusion-bearish';
    } else {
        conclusionText = `<strong>Summary:</strong> ${data.company?.name || symbol} shows a mixed profile with <strong>${strengths.length} strengths</strong> and <strong>${risks.length} risks</strong>. The picture is balanced — further analysis of industry context and growth trajectory is recommended.`;
        conclusionClass = 'conclusion-neutral';
    }

    conclusionEl.innerHTML = conclusionText;
    conclusionEl.className = `decision-conclusion ${conclusionClass}`;
    section.style.display = 'block';
}

// ═══════════════════════════════════════════
// CHART INTELLIGENCE PANEL
// ═══════════════════════════════════════════
function updateChartIntelligence(points) {
    const section = document.getElementById('chart-intel');
    if (!section || !points || points.length < 2) {
        if (section) section.style.display = 'none';
        return;
    }

    const prices = points.map(p => p.price);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);

    // 1. Trend Direction
    const trendVal = document.getElementById('intel-trend-val');
    const trendSub = document.getElementById('intel-trend-sub');
    const changePct = ((last - first) / first) * 100;
    if (last > first) {
        trendVal.textContent = '▲ Bullish';
        trendVal.className = 'intel-value val-green';
        trendSub.textContent = 'Upward movement';
    } else if (last < first) {
        trendVal.textContent = '▼ Bearish';
        trendVal.className = 'intel-value val-red';
        trendSub.textContent = 'Downward movement';
    } else {
        trendVal.textContent = '◆ Flat';
        trendVal.className = 'intel-value val-yellow';
        trendSub.textContent = 'No clear direction';
    }

    // 2. Period Return
    const returnVal = document.getElementById('intel-return-val');
    const returnSub = document.getElementById('intel-return-sub');
    const sign = changePct >= 0 ? '+' : '';
    returnVal.textContent = `${sign}${changePct.toFixed(2)}%`;
    returnVal.className = `intel-value ${changePct >= 0 ? 'val-green' : 'val-red'}`;
    returnSub.textContent = `${fmt(first)} → ${fmt(last)}`;

    // 3. Price Range
    const rangeVal = document.getElementById('intel-range-val');
    const rangeSub = document.getElementById('intel-range-sub');
    rangeVal.textContent = `${fmt(low)} — ${fmt(high)}`;
    rangeVal.className = 'intel-value';
    const rangeSpread = ((high - low) / low * 100).toFixed(1);
    rangeSub.textContent = `${rangeSpread}% spread`;

    // 4. Momentum (simple: compare last 20% of points average vs first 20%)
    const momVal = document.getElementById('intel-momentum-val');
    const momSub = document.getElementById('intel-momentum-sub');
    const chunk = Math.max(Math.floor(prices.length * 0.2), 1);
    const earlyAvg = prices.slice(0, chunk).reduce((a, b) => a + b, 0) / chunk;
    const lateAvg = prices.slice(-chunk).reduce((a, b) => a + b, 0) / chunk;
    const momPct = ((lateAvg - earlyAvg) / earlyAvg) * 100;

    if (momPct > 3) {
        momVal.textContent = '▲ Strong';
        momVal.className = 'intel-value val-green';
        momSub.textContent = `+${momPct.toFixed(1)}% acceleration`;
    } else if (momPct > 0.5) {
        momVal.textContent = '↗ Moderate';
        momVal.className = 'intel-value val-blue';
        momSub.textContent = `+${momPct.toFixed(1)}% gaining`;
    } else if (momPct < -3) {
        momVal.textContent = '▼ Weak';
        momVal.className = 'intel-value val-red';
        momSub.textContent = `${momPct.toFixed(1)}% deceleration`;
    } else if (momPct < -0.5) {
        momVal.textContent = '↘ Fading';
        momVal.className = 'intel-value val-yellow';
        momSub.textContent = `${momPct.toFixed(1)}% slowing`;
    } else {
        momVal.textContent = '◆ Neutral';
        momVal.className = 'intel-value val-blue';
        momSub.textContent = 'Sideways momentum';
    }

    section.style.display = 'grid';
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

    const loader = document.getElementById("chart-loader");
    const errorEl = document.getElementById("chart-error");
    const canvas = document.getElementById("priceChart");

    // Show loading state
    if (loader) loader.style.display = "flex";
    if (errorEl) errorEl.style.display = "none";
    if (canvas) canvas.style.opacity = "0.3";

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
        // Hide intelligence panel on error
        const intel = document.getElementById('chart-intel');
        if (intel) intel.style.display = 'none';
    } finally {
        if (loader) loader.style.display = "none";
        if (chartAbort === controller) chartAbort = null;
    }
}

function applyChartData(points, stale = false) {
    const canvas = document.getElementById("priceChart");
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

    // Update Chart Intelligence panel
    updateChartIntelligence(points);
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
// ML PREDICTION
// ═══════════════════════════════════════════

/**
 * Fetch prediction data from backend and render the prediction section.
 * @param {string} sym - Stock ticker symbol
 */
async function loadPrediction(sym) {
    const section = document.getElementById('prediction-section');
    const loader = document.getElementById('prediction-loader');
    const grid = document.getElementById('prediction-grid');
    const errorEl = document.getElementById('prediction-error');
    const noteEl = document.getElementById('prediction-note');
    if (!section) return;

    // Show section with loading shimmer
    section.style.display = 'block';
    loader.style.display = 'block';
    grid.style.display = 'none';
    errorEl.style.display = 'none';
    noteEl.style.display = 'none';

    try {
        const mode = currentHorizon || 'short';
        const res = await fetch(`${API_BASE}/stocks/${encodeURIComponent(sym)}/prediction?mode=${mode}`);
        const data = await res.json();

        loader.style.display = 'none';

        if (!data.success) {
            showPredictionError(data.message || 'Prediction unavailable for this stock.');
            return;
        }

        renderPrediction(data);
    } catch (err) {
        console.error('[Prediction] Fetch error:', err);
        loader.style.display = 'none';
        showPredictionError('Could not load prediction. Please try again later.');
    }
}

/**
 * Render prediction data into the prediction tiles.
 * @param {Object} data - Prediction response from API
 */
function renderPrediction(data) {
    const grid = document.getElementById('prediction-grid');
    const noteEl = document.getElementById('prediction-note');
    if (!grid) return;

    // ── Trend ──
    const trendEl = document.getElementById('pred-trend');
    const trendSub = document.getElementById('pred-trend-sub');
    const trendTile = document.getElementById('pred-tile-trend');
    const trend = (data.trend || 'Sideways').toLowerCase();

    // Clear old trend classes
    trendTile.classList.remove('trend-bullish', 'trend-bearish', 'trend-sideways');

    if (trend === 'bullish') {
        trendEl.textContent = '▲ Bullish';
        trendEl.className = 'pred-tile-value val-green';
        trendSub.textContent = 'Upward signal';
        trendTile.classList.add('trend-bullish');
    } else if (trend === 'bearish') {
        trendEl.textContent = '▼ Bearish';
        trendEl.className = 'pred-tile-value val-red';
        trendSub.textContent = 'Downward signal';
        trendTile.classList.add('trend-bearish');
    } else {
        trendEl.textContent = '◆ Sideways';
        trendEl.className = 'pred-tile-value val-yellow';
        trendSub.textContent = 'No clear direction';
        trendTile.classList.add('trend-sideways');
    }

    // ── Predicted Price ──
    const priceEl = document.getElementById('pred-price');
    const priceSub = document.getElementById('pred-price-sub');
    priceEl.textContent = fmt(data.predictedPrice);
    priceEl.className = 'pred-tile-value';

    // Compare with current price if available
    if (stockDetailsCache && stockDetailsCache.price != null) {
        const curr = stockDetailsCache.price;
        const diff = data.predictedPrice - curr;
        const pct = ((diff / curr) * 100).toFixed(2);
        const sign = diff >= 0 ? '+' : '';
        priceSub.textContent = `${sign}${pct}% from current`;
        priceEl.className = `pred-tile-value ${diff >= 0 ? 'val-green' : 'val-red'}`;
    } else {
        const isLong = data.mode === 'long';
        priceSub.textContent = isLong ? '30-day outlook' : 'Next-day estimate';
    }

    // ── Expected Range ──
    const rangeEl = document.getElementById('pred-range');
    const rangeSub = document.getElementById('pred-range-sub');
    if (data.predictedRange) {
        rangeEl.textContent = `${fmt(data.predictedRange.low)} — ${fmt(data.predictedRange.high)}`;
        const spread = ((data.predictedRange.high - data.predictedRange.low) / data.predictedRange.low * 100).toFixed(1);
        rangeSub.textContent = `${spread}% spread`;
    } else {
        rangeEl.textContent = 'N/A';
        rangeSub.textContent = '';
    }

    // ── Confidence ──
    const confEl = document.getElementById('pred-confidence');
    const confFill = document.getElementById('pred-confidence-fill');
    const conf = data.confidence || 0;
    confEl.textContent = `${conf}%`;

    // Color-code confidence
    let confClass;
    if (conf >= 65) {
        confEl.className = 'pred-tile-value val-green';
        confClass = 'conf-high';
    } else if (conf >= 45) {
        confEl.className = 'pred-tile-value val-yellow';
        confClass = 'conf-medium';
    } else {
        confEl.className = 'pred-tile-value val-red';
        confClass = 'conf-low';
    }

    confFill.className = `pred-confidence-fill ${confClass}`;
    // Animate the bar after a short delay for visual effect
    requestAnimationFrame(() => {
        confFill.style.width = `${conf}%`;
    });

    // Show grid and note
    grid.style.display = 'grid';
    noteEl.style.display = 'block';

    // Update note text based on mode
    if (data.explanation) {
        noteEl.textContent = `${data.explanation} This is not financial advice.`;
    } else {
        const isLong = data.mode === 'long';
        noteEl.textContent = isLong
            ? 'Based on long-term moving averages, broader trend, and linear regression. This is not financial advice.'
            : 'Based on short-term moving averages, momentum, and trend estimation. This is not financial advice.';
    }

    // Update prediction badge to show mode
    const badgeEl = document.getElementById('prediction-badge');
    if (badgeEl) {
        badgeEl.textContent = data.mode === 'long' ? 'AI · LONG' : 'AI · SHORT';
    }
}

/**
 * Show prediction error message.
 * @param {string} message
 */
function showPredictionError(message) {
    const errorEl = document.getElementById('prediction-error');
    const msgEl = document.getElementById('prediction-error-msg');
    const grid = document.getElementById('prediction-grid');
    const noteEl = document.getElementById('prediction-note');

    if (grid) grid.style.display = 'none';
    if (noteEl) noteEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'flex';
    if (msgEl) msgEl.textContent = message;
}

// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════
(async () => {
    // Initialize horizon toggle first (restores from localStorage)
    initHorizonToggle();
    initChart();
    await loadStockDetails();

    // Use stored horizon mode for initial chart period and prediction
    const initialPeriod = HORIZON_CHART_PERIOD[currentHorizon] || '1M';
    // Set the correct chart button as active
    document.querySelectorAll('.chart-controls button').forEach(b => {
        b.classList.toggle('active', b.dataset.period === initialPeriod);
    });
    fetchAndRenderChart(initialPeriod);
    loadPrediction(symbol);
    initWatchlistButton();
})();
