import rateLimit from 'express-rate-limit';

// Tests send many requests from the same IP, so the limiters are off under NODE_ENV=test
const skip = () => process.env.NODE_ENV === 'test';

// Strict limiter for auth endpoints (nonce, verify)
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many requests, please try again later.' },
});

// Standard limiter for public read endpoints
export const publicRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many requests, please try again later.' },
});
