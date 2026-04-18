function normalize(symbol) {
    if (!symbol || typeof symbol !== "string") return "";
    return symbol.trim().toUpperCase();
}

// US stock symbols: 1-5 letters, optionally with a dot (e.g. BRK.B)
function isValid(symbol) {
    if (!symbol) return false;
    return /^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol);
}

module.exports = { normalize, isValid };
