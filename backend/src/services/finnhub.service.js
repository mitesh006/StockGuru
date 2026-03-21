const axios = require("axios");

const API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = "https://finnhub.io/api/v1";

/**
 * Fetch live quote data for a stock symbol.
 * Finnhub GET /quote?symbol=SYMBOL
 */
const getQuote = async (symbol) => {
    const { data } = await axios.get(`${BASE_URL}/quote`, {
        params: { symbol, token: API_KEY },
    });

    if (!data || (data.c === 0 && data.h === 0 && data.l === 0)) {
        throw new Error(`No quote data found for "${symbol}".`);
    }

    return {
        price: data.c,
        open: data.o,
        high: data.h,
        low: data.l,
        previousClose: data.pc,
    };
};

/**
 * Fetch company profile.
 * Finnhub GET /stock/profile2?symbol=SYMBOL
 */
const getProfile = async (symbol) => {
    const { data } = await axios.get(`${BASE_URL}/stock/profile2`, {
        params: { symbol, token: API_KEY },
    });

    if (!data || !data.name) {
        return { name: symbol, industry: "N/A", marketCap: null, logo: null };
    }

    return {
        name: data.name,
        industry: data.finnhubIndustry || "N/A",
        marketCap: data.marketCapitalization ? data.marketCapitalization * 1e6 : null,
        logo: data.logo || null,
    };
};

/**
 * Fetch fundamental metrics (current + annual + quarterly series).
 * Finnhub GET /stock/metric?symbol=SYMBOL&metric=all
 *
 * Returns:
 *   currentMetrics       – snapshot of current key ratios
 *   annualFundamentals   – latest 3 years
 *   quarterlyFundamentals – latest 4 quarters
 */
const getMetrics = async (symbol) => {
    const { data } = await axios.get(`${BASE_URL}/stock/metric`, {
        params: { symbol, metric: "all", token: API_KEY },
    });

    const m = data?.metric || {};
    const series = data?.series || {};
    const annual = series.annual || {};
    const quarterly = series.quarterly || {};

    // ── Current snapshot metrics ──
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

    // ── Helper: build a year→{field: value} map from Finnhub series arrays ──
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

    // ── Annual fundamentals (latest 3 years) ──
    const annualFieldMap = {
        eps:                    "eps",
        pe:                     "pe",
        roe:                    "roe",
        roa:                    "roa",
        bookValue:              "bookValue",
        revenuePerShare:        "revenuePerShare",
        netMargin:              "netMargin",
        operatingMargin:        "operatingMargin",
        currentRatio:           "currentRatio",
        longtermDebtTotalEquity:"debtToEquity",
    };
    const annualMap = buildMap(annual, annualFieldMap);
    const annualFundamentals = Object.values(annualMap)
        .sort((a, b) => b.period.localeCompare(a.period))
        .slice(0, 3)
        .map(item => ({
            year: item.period.substring(0, 4),
            period: item.period,
            eps: item.eps ?? null,
            pe: item.pe ?? null,
            roe: item.roe ?? null,
            roa: item.roa ?? null,
            bookValue: item.bookValue ?? null,
            revenuePerShare: item.revenuePerShare ?? null,
            netMargin: item.netMargin ?? null,
            operatingMargin: item.operatingMargin ?? null,
        }));

    // ── Quarterly fundamentals (latest 4 quarters) ──
    const quarterlyFieldMap = {
        eps:        "eps",
        pe:         "pe",
        roe:        "roe",
        roa:        "roa",
        bookValue:  "bookValue",
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
                eps: item.eps ?? null,
                pe: item.pe ?? null,
                roe: item.roe ?? null,
                roa: item.roa ?? null,
                bookValue: item.bookValue ?? null,
            };
        });

    return { currentMetrics, annualFundamentals, quarterlyFundamentals };
};

module.exports = { getQuote, getProfile, getMetrics };
