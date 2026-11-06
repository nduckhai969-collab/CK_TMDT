const attempts = new Map();

function rateLimit({ windowMs, max, keyPrefix, keyFn, message = 'Too many requests. Please try again later.' }) {
  return (req, res, next) => {
    const now = Date.now();
    if (attempts.size > 5000) {
      for (const [key, state] of attempts) {
        if (state.resetAt <= now) attempts.delete(key);
      }
    }
    while (attempts.size > 10000) attempts.delete(attempts.keys().next().value);

    const value = String(keyFn(req) || 'unknown');
    const key = `${keyPrefix}:${value}`;
    let state = attempts.get(key);
    if (!state || state.resetAt <= now) {
      state = { count: 0, resetAt: now + windowMs };
      attempts.set(key, state);
    }
    if (state.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, code: 'RATE_LIMITED', message });
    }
    state.count += 1;
    next();
  };
}

module.exports = rateLimit;
