// TTL per data category (ms)
const TTL_CONFIG = {
    quote:   30 * 1000,            // 30s — prices update frequently
    profile: 24 * 60 * 60 * 1000,  // 24h — company info rarely changes
    metrics: 60 * 60 * 1000,       // 1h  — financial ratios update infrequently
    chart:   15 * 60 * 1000,       // 15m — daily chart doesn't change intraday
};

const store = {
    quote:   new Map(),
    profile: new Map(),
    metrics: new Map(),
    chart:   new Map(),
};

function get(category, key) {
    const entry = store[category]?.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.fetchedAt;
    const ttl = TTL_CONFIG[category] || 60000;

    if (age < ttl) {
        return { data: entry.data, stale: false };
    }

    return null;
}

// Return expired data as fallback when API is down
function getStale(category, key) {
    const entry = store[category]?.get(key);
    return entry ? entry.data : null;
}

function set(category, key, data) {
    if (!store[category]) return;
    store[category].set(key, { data, fetchedAt: Date.now() });
}

function stats() {
    const result = {};
    for (const [category, map] of Object.entries(store)) {
        result[category] = {
            entries: map.size,
            ttl: `${TTL_CONFIG[category] / 1000}s`,
        };
    }
    return result;
}

function clear() {
    for (const map of Object.values(store)) {
        map.clear();
    }
}

module.exports = { get, getStale, set, stats, clear };
