import { Request, Response, NextFunction } from 'express';
import { RateLimitConfig } from './types.js';

/**
 * In-memory store for rate limiting
 * Maps IP addresses to request timestamps
 */
const requestStore = new Map<string, number[]>();

/**
 * Default rate limit configuration
 */
const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
};

/**
 * Clean up old entries from the request store
 * Called periodically to prevent memory leaks
 */
function cleanupStore(windowMs: number): void {
  const now = Date.now();
  const cutoff = now - windowMs;

  for (const [ip, timestamps] of requestStore.entries()) {
    const validTimestamps = timestamps.filter((ts) => ts > cutoff);
    if (validTimestamps.length === 0) {
      requestStore.delete(ip);
    } else {
      requestStore.set(ip, validTimestamps);
    }
  }
}

/**
 * Get the client IP address from the request
 * Handles proxied requests with X-Forwarded-For header
 */
function getClientIP(req: Request): string {
  // Check for forwarded IP (when behind proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can be a comma-separated list; take the first one
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return forwardedIp.trim();
  }

  // Fall back to direct connection IP
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Create an Express middleware for rate limiting
 * @param config - Rate limit configuration
 * @returns Express middleware function
 */
export function createRateLimiter(config?: Partial<RateLimitConfig>) {
  const { windowMs, maxRequests } = { ...defaultConfig, ...config };

  // Set up periodic cleanup (every 5 minutes)
  const cleanupInterval = setInterval(() => cleanupStore(windowMs), 5 * 60 * 1000);

  // Ensure cleanup interval doesn't prevent process from exiting
  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);
    const now = Date.now();
    const cutoff = now - windowMs;

    // Get existing timestamps for this IP
    let timestamps = requestStore.get(clientIP) || [];

    // Filter to only include timestamps within the current window
    timestamps = timestamps.filter((ts) => ts > cutoff);

    // Check if limit exceeded
    if (timestamps.length >= maxRequests) {
      const oldestTimestamp = timestamps[0];
      const resetTime = new Date(oldestTimestamp + windowMs);

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', resetTime.toISOString());
      res.setHeader('Retry-After', Math.ceil((oldestTimestamp + windowMs - now) / 1000).toString());

      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: resetTime.toISOString(),
      });
      return;
    }

    // Add current request timestamp
    timestamps.push(now);
    requestStore.set(clientIP, timestamps);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - timestamps.length).toString());

    next();
  };
}

/**
 * Clear all rate limit data (useful for testing)
 */
export function clearRateLimitStore(): void {
  requestStore.clear();
}

/**
 * Get the current count for an IP (useful for testing/debugging)
 */
export function getRateLimitCount(ip: string, windowMs: number = defaultConfig.windowMs): number {
  const timestamps = requestStore.get(ip) || [];
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((ts) => ts > cutoff).length;
}
