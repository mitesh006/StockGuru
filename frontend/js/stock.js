// stock.js — Stock Detail page logic

// Get symbol from URL params
const params = new URLSearchParams(window.location.search);
const symbol = params.get('symbol') || 'RELIANCE';
document.getElementById('stock-symbol').textContent = symbol;
document.getElementById('modal-symbol').value = symbol;
document.title = `${symbol} - StockGuru`;

// Set today's date in modal
document.getElementById('modal-date').valueAsDate = new Date();

// Chart period buttons
document.querySelectorAll('.chart-controls button').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.chart-controls button').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        console.log('Load chart for period:', this.dataset.period);
        // TODO: fetch chart data from backend for selected period
    });
});

// Watchlist toggle
let inWatchlist = false;

function toggleWatchlist() {
    inWatchlist = !inWatchlist;
    const btn = document.getElementById('watchlist-btn');
    if (inWatchlist) {
        btn.textContent = '★ In Watchlist';
        btn.classList.add('active');
        showToast(`${symbol} added to Watchlist`);
        // TODO: POST /api/watchlist with token
    } else {
        btn.textContent = '☆ Add to Watchlist';
        btn.classList.remove('active');
        showToast(`${symbol} removed from Watchlist`);
        // TODO: DELETE /api/watchlist/:symbol
    }
}


// Toast helper
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Close modal on overlay click
document.getElementById('buy-modal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
});

// TODO: fetch real stock data
// const token = localStorage.getItem('token');
// fetch(`http://localhost:5000/api/stocks/${symbol}`, {
//   headers: { Authorization: `Bearer ${token}` }
// }).then(r => r.json()).then(data => { /* populate page */ });
