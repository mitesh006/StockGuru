// Prevents duplicate in-flight API requests for the same resource
const inFlight = new Map();

async function dedupe(key, fn) {
    if (inFlight.has(key)) {
        return inFlight.get(key);
    }

    const promise = fn().finally(() => {
        inFlight.delete(key);
    });

    inFlight.set(key, promise);
    return promise;
}

module.exports = { dedupe };
