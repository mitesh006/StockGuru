// portfolio.js — Portfolio page logic

let portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]');

// Demo data if empty
if (portfolio.length === 0) {
    portfolio = [
        { symbol: 'RELIANCE', qty: 10, avgPrice: 2750.00, buyDate: '2025-01-15' },
        { symbol: 'TCS',      qty: 5,  avgPrice: 3800.00, buyDate: '2025-03-10' },
        { symbol: 'INFY',     qty: 20, avgPrice: 1420.00, buyDate: '2024-11-20' },
    ];
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
}

// Mock current prices (TODO: replace with real API)
const mockPrices = {
    RELIANCE: 2843.50, TCS: 3920.00, INFY: 1482.75,
    HDFC: 1658.30, SBIN: 756.20, WIPRO: 462.80,
    BAJFINANCE: 6832.50, HCLTECH: 1344.00,
};

function getCurrentPrice(sym) { return mockPrices[sym] || null; }

function formatINR(num) {
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderPortfolio() {
    const tbody      = document.getElementById('holdings-tbody');
    const emptyState = document.getElementById('empty-state');
    tbody.innerHTML = '';

    let totalInvested = 0, totalCurrent = 0;

    if (portfolio.length === 0) {
        emptyState.style.display = 'block';
        document.getElementById('holdings-count').textContent = '0 stocks';
        updateSummary(0, 0);
        return;
    }

    emptyState.style.display = 'none';
    document.getElementById('holdings-count').textContent =
        portfolio.length + ' stock' + (portfolio.length > 1 ? 's' : '');

    portfolio.forEach((holding, idx) => {
        const invested    = holding.qty * holding.avgPrice;
        const currentPrice = getCurrentPrice(holding.symbol);
        const currentVal  = currentPrice ? holding.qty * currentPrice : invested;
        const pnl         = currentVal - invested;
        const pnlPct      = ((pnl / invested) * 100).toFixed(2);
        const pnlClass    = pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
        const pnlSign     = pnl >= 0 ? '+' : '';

        totalInvested += invested;
        totalCurrent  += currentVal;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="sym-cell">${holding.symbol}</div>
                <div class="company-cell">${holding.buyDate || '—'}</div>
            </td>
            <td class="num-cell">${holding.qty}</td>
            <td class="num-cell">${formatINR(holding.avgPrice)}</td>
            <td class="num-cell">${currentPrice ? formatINR(currentPrice) : '—'}</td>
            <td class="num-cell">${formatINR(invested)}</td>
            <td class="${pnl >= 0 ? 'green-cell' : 'red-cell'}">${formatINR(currentVal)}</td>
            <td>
                <span class="pnl-badge ${pnlClass}">
                    ${pnlSign}${formatINR(Math.abs(pnl))} (${pnlSign}${pnlPct}%)
                </span>
            </td>
            <td>
                <div class="action-cell">
                    <button class="btn-sm btn-view" onclick="window.location.href='stock.html?symbol=${holding.symbol}'">View</button>
                    <button class="btn-sm btn-sell" onclick="removeHolding(${idx})">Remove</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    updateSummary(totalInvested, totalCurrent);
}

function updateSummary(invested, current) {
    const pnl     = current - invested;
    const pnlPct  = invested > 0 ? ((pnl / invested) * 100).toFixed(2) : 0;
    const pnlSign = pnl >= 0 ? '+' : '';

    document.getElementById('total-invested').textContent = formatINR(invested);
    document.getElementById('current-value').textContent  = formatINR(current);
    document.getElementById('total-pnl').textContent      = pnlSign + formatINR(Math.abs(pnl));
    document.getElementById('total-pnl').style.color      = pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    document.getElementById('pnl-pct').textContent        = pnlSign + pnlPct + '% overall';
    document.getElementById('pnl-pct').className          = 'summary-sub ' + (pnl >= 0 ? 'green' : 'red');
    document.getElementById('total-holdings').textContent = portfolio.length;
    document.getElementById('value-sub').textContent      = 'Live or estimated';
}

function addHolding() {
    const symbol = document.getElementById('add-symbol').value.trim().toUpperCase();
    const qty    = parseInt(document.getElementById('add-qty').value);
    const price  = parseFloat(document.getElementById('add-price').value);
    const date   = document.getElementById('add-date').value;

    if (!symbol)           { showToast('⚠ Please enter a stock symbol'); return; }
    if (!qty || qty < 1)   { showToast('⚠ Please enter a valid quantity'); return; }
    if (!price || price <= 0) { showToast('⚠ Please enter a valid buy price'); return; }

    const existing = portfolio.find(p => p.symbol === symbol);
    if (existing) {
        const totalShares = existing.qty + qty;
        existing.avgPrice = ((existing.avgPrice * existing.qty) + (price * qty)) / totalShares;
        existing.qty = totalShares;
        showToast(`Updated ${symbol} — averaged position`);
    } else {
        portfolio.push({ symbol, qty, avgPrice: price, buyDate: date || new Date().toISOString().split('T')[0] });
        showToast(`${symbol} added to Portfolio ✓`);
    }

    localStorage.setItem('portfolio', JSON.stringify(portfolio));
    document.getElementById('add-symbol').value = '';
    document.getElementById('add-qty').value    = '';
    document.getElementById('add-price').value  = '';
    renderPortfolio();
    // TODO: POST /api/portfolio with token
}

function removeHolding(idx) {
    const sym = portfolio[idx].symbol;
    if (confirm(`Remove ${sym} from your portfolio?`)) {
        portfolio.splice(idx, 1);
        localStorage.setItem('portfolio', JSON.stringify(portfolio));
        renderPortfolio();
        showToast(`${sym} removed from Portfolio`);
        // TODO: DELETE /api/portfolio/:symbol with token
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Uppercase symbol input
document.getElementById('add-symbol').addEventListener('input', function () {
    this.value = this.value.toUpperCase();
});

// Set today's date
document.getElementById('add-date').valueAsDate = new Date();

// Initial render
renderPortfolio();
