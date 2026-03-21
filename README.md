# StockGuru

A modern full-stack stock analysis web application that provides real-time market data, company fundamentals, and an interactive dashboard for exploring stocks.

---

## 🚀 Features

### 🔍 Stock Search

* Search stocks instantly using symbol or name
* Fast autocomplete suggestions
* Smooth navigation to stock details page

---

### 📈 Dashboard

* Live **stock ticker bar**
* **Market overview** (S&P 500, NASDAQ, DOW)
* **Trending stocks** section
* Interactive chart section
* Clean, modern UI with real-time feel

---

### 📄 Stock Details Page

* Real-time stock data (price, open, high, low, volume)
* Key statistics (P/E, EPS, ROE, margins, etc.)
* **Detailed fundamentals**

  * Yearly data (last 3 years)
  * Quarterly data (last 4 quarters)
* Structured and readable financial insights

---

### 🔐 Authentication System

* User **register / login / logout**
* JWT-based authentication
* Secure password handling
* **Guest mode** for browsing stocks

---

### ⭐ Watchlist (Planned)

* Watchlist access restricted to logged-in users
* Currently under development (UI integrated)

---

## 🧠 Key Concepts Implemented

* Backend API aggregation
* In-memory caching (to reduce API calls)
* Clean data transformation from external APIs
* Separation of concerns (routes, controllers, services)
* Responsive and structured UI design
* MVP-focused development approach

---

## 🛠 Tech Stack

### Frontend

* HTML
* CSS
* JavaScript (Vanilla)

### Backend

* Node.js
* Express.js

### Database

* MongoDB (MongoDB Compass)

### Authentication

* JWT (JSON Web Tokens)

### External APIs

* Finnhub (stock data, metrics, fundamentals)

---

## ⚙️ Project Structure

```bash
project-root/
│
├── frontend/
│   ├── dashboard.html
│   ├── stock.html
│   ├── login.html
│   ├── register.html
│   ├── css/
│   └── js/
│
├── backend/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── models/
│   ├── middleware/
│   └── server.js
│
├── data/
│   └── stocks.json
│
├── .env
└── README.md
```

---

## 🔄 Application Flow

1. User lands on dashboard
2. Can browse as **guest** or log in
3. Searches for a stock
4. Opens stock details page
5. Views:

   * live price data
   * financial metrics
   * historical fundamentals
6. Watchlist access requires login

---

## ⚡ Performance Optimizations

* Backend caching for ticker and market data
* Reduced redundant API calls
* Filtered and structured API responses
* Lightweight frontend rendering

---

## 🎯 MVP Scope

This project focuses on:

* Reliable stock data display
* Clean UI/UX
* Efficient API usage
* Scalable backend structure

Deferred features:

* Full watchlist implementation
* Advanced analytics
* Portfolio tracking

---

## 🔮 Future Improvements

* Complete watchlist functionality
* Advanced charting (indicators, overlays)
* Portfolio management system
* News integration
* Improved data insights and trends

---

## 📚 Learnings

* Handling API limitations and rate limits
* Importance of data structuring
* UI hierarchy and user experience design
* Backend optimization with caching
* MVP-based development strategy

---

## 👥 Team

* **Mitesh Patil** — Backend Development, API Integration, System Architecture
* **Neem** — Analysis Logic, Data Structuring, Financial Insights
* **Harshit** — Frontend Development, UI Design, User Experience

---

## 🧪 Setup Instructions

### 1. Clone repository

```bash
git clone <your-repo-link>
cd <project-folder>
```

### 2. Install backend dependencies

```bash
npm install
```

### 3. Create `.env` file

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
FINNHUB_API_KEY=your_api_key
```

### 4. Run backend

```bash
npm start
```

### 5. Open frontend

* Open `dashboard.html` in browser

---

## 📌 Notes

* This is an MVP project built for learning and demonstration
* Some features are intentionally simplified
* Watchlist functionality is currently under development

---

## 👨‍💻 Author

Developed as part of a student project (SGP) focusing on real-world system design and problem-solving.

---

## ⭐ Acknowledgements

* Finnhub API for financial data
* Open-source resources and community support