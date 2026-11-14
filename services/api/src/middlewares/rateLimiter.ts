import rateLimit from 'express-rate-limit';

// Tests send many requests from the same IP, so the limiters are off under NODE_ENV=test
const skip = () => process.env.NODE_ENV === 'test';

// Sign-in requests allowed per minute from one address. AUTH_RATE_LIMIT_MAX raises it for the
// end-to-end tests, which sign in many times from the same machine (#337); unset, it stays 10.
export function authRateLimitMax(value = process.env.AUTH_RATE_LIMIT_MAX): number {
  const max = Number(value);
  return Number.isInteger(max) && max > 0 ? max : 10;
}

// Strict limiter for auth endpoints (nonce, verify)
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: authRateLimitMax(),
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
