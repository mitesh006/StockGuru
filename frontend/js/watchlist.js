// watchlist.js — Watchlist page logic

const addStockInput = document.getElementById('add-stock-input');
const addStockBtn   = document.getElementById('add-stock-btn');
const watchlistTbody = document.getElementById('watchlist-tbody');
const emptyState    = document.getElementById('empty-state');

// Add Stock to Watchlist
addStockBtn.addEventListener('click', function () {
    const symbol = addStockInput.value.trim().toUpperCase();
    if (!symbol) { alert('Please enter a stock symbol'); return; }

    const existingStock = document.querySelector(`tr[data-symbol="${symbol}"]`);
    if (existingStock) {
        alert(`${symbol} is already in your watchlist!`);
        addStockInput.value = '';
        return;
    }

    // TODO: fetch stock data from API, then add to table
    console.log('Adding stock to watchlist:', symbol);
    alert(`Adding ${symbol} to watchlist...\n\nConnect to NSE/stock API to fetch real-time data.`);
    addStockInput.value = '';
    updateEmptyState();
});

addStockInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') addStockBtn.click();
});

// View Stock Details
function viewStock(symbol) {
    window.location.href = `stock.html?symbol=${symbol}`;
}

// Remove Stock from Watchlist
function removeStock(row, symbol) {
    if (confirm(`Remove ${symbol} from your watchlist?`)) {
        row.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            row.remove();
            updateEmptyState();
            // TODO: DELETE /api/watchlist/:symbol with token
        }, 300);
    }
}

// Update Empty State Visibility
function updateEmptyState() {
    const rows = watchlistTbody.querySelectorAll('tr');
    if (rows.length === 0) {
        document.querySelector('.table-container').style.display = 'none';
        emptyState.style.display = 'block';
    } else {
        document.querySelector('.table-container').style.display = 'block';
        emptyState.style.display = 'none';
    }
}

// Event Delegation for Buttons
watchlistTbody.addEventListener('click', function (e) {
    if (e.target.classList.contains('view-btn')) {
        const row = e.target.closest('tr');
        viewStock(row.getAttribute('data-symbol'));
    }
    if (e.target.classList.contains('remove-btn')) {
        const row = e.target.closest('tr');
        removeStock(row, row.getAttribute('data-symbol'));
    }
});

// FadeOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(-20px); }
    }
`;
document.head.appendChild(style);

// Initialize
updateEmptyState();
console.log('StockGuru Watchlist loaded!');
