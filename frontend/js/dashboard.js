// dashboard.js — Dashboard page logic

// Stock Search
const searchInput = document.getElementById('stock-search-input');
const searchBtn   = document.getElementById('search-btn');

searchBtn.addEventListener('click', function () {
    const searchTerm = searchInput.value.trim().toUpperCase();
    if (searchTerm) {
        window.location.href = `stock.html?symbol=${searchTerm}`;
    }
});

searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') searchBtn.click();
});

// Chart Period Buttons
const chartButtons = document.querySelectorAll('.chart-controls button');

chartButtons.forEach(button => {
    button.addEventListener('click', function () {
        chartButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        const period = this.getAttribute('data-period');
        console.log('Loading chart data for period:', period);
        // TODO: fetch chart data from backend for selected period
    });
});

// Card Click Handlers — navigate to stock detail page
const cards = document.querySelectorAll('.card');

cards.forEach((card, index) => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
        const symbol = document.getElementById(`card-symbol-${index + 1}`).textContent;
        window.location.href = `stock.html?symbol=${symbol}`;
    });
});

console.log('StockGuru Dashboard loaded successfully!');
