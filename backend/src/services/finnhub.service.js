const axios = require("axios");
const cache = require("../utils/cacheManager");
const { dedupe } = require("../utils/requestDeduplicator");
const { normalize } = require("../utils/symbolNormalizer");

const API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = "https://finnhub.io/api/v1";
const DEV_MODE = process.env.DEV_MODE === "true";

// Mock data for local development without API calls
const MOCK_QUOTE = {
    price: 150.25, open: 149.50, high: 152.00,
    low: 148.75, previousClose: 149.00,
};
const MOCK_PROFILE = {
    name: "Mock Company", industry: "Technology",
    marketCap: 2500000000000, logo: null,
};
const MOCK_METRICS = {
    currentMetrics: {
        peRatio: 28.5, eps: 6.42, bookValue: 4.15, beta: 1.2,
        weekHigh52: 180.0, weekLow52: 120.0, roe: 150.0, roa: 28.0,
        currentRatio: 1.1, debtToEquity: 1.8, netMargin: 25.3,
        operatingMargin: 30.1, revenuePerShare: 24.5,
    },
    annualFundamentals: [],
    quarterlyFundamentals: [],
};

const getQuote = async (symbol) => {
    const sym = normalize(symbol);

    if (NODE_ENV === "development") return { ...MOCK_QUOTE };

    const cached = cache.get("quote", sym);
    if (cached) return cached.data;

    return dedupe(`quote:${sym}`, async () => {
        try {
            const { data } = await axios.get(`${BASE_URL}/quote`, {
                params: { symbol: sym, token: API_KEY },
            });

            if (!data || (data.c === 0 && data.h === 0 && data.l === 0)) {
                throw new Error(`No quote data found for "${sym}".`);
            }

            const result = {
                price: data.c,
                open: data.o,
                high: data.h,
                low: data.l,
                previousClose: data.pc,
            };

            cache.set("quote", sym, result);
            return result;
        } catch (error) {
            const stale = cache.getStale("quote", sym);
            if (stale) return stale;
            throw error;
        }
    });
};

const getProfile = async (symbol) => {
    const sym = normalize(symbol);

    if (NODE_ENV === "development") return { ...MOCK_PROFILE, name: sym };

    const cached = cache.get("profile", sym);
    if (cached) return cached.data;

    return dedupe(`profile:${sym}`, async () => {
        try {
            const { data } = await axios.get(`${BASE_URL}/stock/profile2`, {
                params: { symbol: sym, token: API_KEY },
            });

            const result = (!data || !data.name)
                ? { name: sym, industry: "N/A", marketCap: null, logo: null }
                : {
                    name: data.name,
                    industry: data.finnhubIndustry || "N/A",
                    marketCap: data.marketCapitalization ? data.marketCapitalization * 1e6 : null,
                    logo: data.logo || null,
                };

            cache.set("profile", sym, result);
            return result;
        } catch (error) {
            const stale = cache.getStale("profile", sym);
            if (stale) return stale;
            throw error;
        }
    });
};

const getMetrics = async (symbol) => {
    const sym = normalize(symbol);

    if (NODE_ENV === "development") return { ...MOCK_METRICS };

    const cached = cache.get("metrics", sym);
    if (cached) return cached.data;

    return dedupe(`metrics:${sym}`, async () => {
        try {
            const { data } = await axios.get(`${BASE_URL}/stock/metric`, {
                params: { symbol: sym, metric: "all", token: API_KEY },
            });

            const m = data?.metric || {};
            const series = data?.series || {};
            const annual = series.annual || {};
            const quarterly = series.quarterly || {};

            const currentMetrics = {
                peRatio: m.peNormalizedAnnual ?? m.peBasicExclExtraTTM ?? null,
                eps: m.epsNormalizedAnnual ?? m.epsBasicExclExtraItemsTTM ?? null,
                bookValue: m.bookValuePerShareQuarterly ?? null,
                beta: m.beta ?? null,
                weekHigh52: m["52WeekHigh"] ?? null,
                weekLow52: m["52WeekLow"] ?? null,
                roe: m.roeTTM ?? null,
                roa: m.roaTTM ?? null,
                currentRatio: m.currentRatioQuarterly ?? null,
                debtToEquity: m.totalDebtToEquityQuarterly ?? null,
                netMargin: m.netProfitMarginTTM ?? null,
                operatingMargin: m.operatingMarginTTM ?? null,
                revenuePerShare: m.revenuePerShareTTM ?? null,
            };

            // Build a period→{field: value} map from Finnhub time series
            function buildMap(seriesObj, fieldMap) {
                const map = {};
                for (const [finnhubKey, readableName] of Object.entries(fieldMap)) {
                    const arr = seriesObj[finnhubKey];
                    if (!Array.isArray(arr)) continue;
                    for (const entry of arr) {
                        const period = entry.period;
                        if (!period) continue;
                        if (!map[period]) map[period] = { period };
                        map[period][readableName] = entry.v ?? null;
                    }
                }
                return map;
            }

            const annualFieldMap = {
                eps: "eps", pe: "pe", roe: "roe", roa: "roa",
                bookValue: "bookValue", revenuePerShare: "revenuePerShare",
                netMargin: "netMargin", operatingMargin: "operatingMargin",
                currentRatio: "currentRatio", longtermDebtTotalEquity: "debtToEquity",
            };
            const annualMap = buildMap(annual, annualFieldMap);
            const annualFundamentals = Object.values(annualMap)
                .sort((a, b) => b.period.localeCompare(a.period))
                .slice(0, 3)
                .map(item => ({
                    year: item.period.substring(0, 4),
                    period: item.period,
                    eps: item.eps ?? null, pe: item.pe ?? null,
                    roe: item.roe ?? null, roa: item.roa ?? null,
                    bookValue: item.bookValue ?? null,
                    revenuePerShare: item.revenuePerShare ?? null,
                    netMargin: item.netMargin ?? null,
                    operatingMargin: item.operatingMargin ?? null,
                }));

            const quarterlyFieldMap = {
                eps: "eps", pe: "pe", roe: "roe", roa: "roa", bookValue: "bookValue",
            };
            const quarterlyMap = buildMap(quarterly, quarterlyFieldMap);
            const quarterlyFundamentals = Object.values(quarterlyMap)
                .sort((a, b) => b.period.localeCompare(a.period))
                .slice(0, 4)
                .map(item => {
                    const d = new Date(item.period);
                    const q = Math.ceil((d.getMonth() + 1) / 3);
                    return {
                        label: `Q${q} ${d.getFullYear()}`,
                        period: item.period,
                        eps: item.eps ?? null, pe: item.pe ?? null,
                        roe: item.roe ?? null, roa: item.roa ?? null,
                        bookValue: item.bookValue ?? null,
                    };
                });

            const result = { currentMetrics, annualFundamentals, quarterlyFundamentals };
            cache.set("metrics", sym, result);
            return result;
        } catch (error) {
            const stale = cache.getStale("metrics", sym);
            if (stale) return stale;
            throw error;
        }
    });
};

module.exports = { getQuote, getProfile, getMetrics };
