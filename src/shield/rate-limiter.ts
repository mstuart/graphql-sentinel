export interface RateLimitConfig {
  window: number; // window in milliseconds
  max: number; // max cost allowed per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

interface ClientRecord {
  entries: { timestamp: number; cost: number }[];
}

export function createRateLimiter(config: RateLimitConfig) {
  const { window, max } = config;
  const clients = new Map<string, ClientRecord>();

  // Periodic cleanup
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of clients.entries()) {
      record.entries = record.entries.filter((e) => now - e.timestamp < window);
      if (record.entries.length === 0) {
        clients.delete(key);
      }
    }
  }, window);

  // Allow cleanup timer to not prevent process exit
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return {
    check(key: string, cost: number = 1): RateLimitResult {
      const now = Date.now();

      if (!clients.has(key)) {
        clients.set(key, { entries: [] });
      }

      const record = clients.get(key)!;

      // Remove expired entries
      record.entries = record.entries.filter((e) => now - e.timestamp < window);

      // Calculate current total cost
      const currentCost = record.entries.reduce((sum, e) => sum + e.cost, 0);

      if (currentCost + cost > max) {
        return {
          allowed: false,
          remaining: Math.max(0, max - currentCost),
        };
      }

      record.entries.push({ timestamp: now, cost });

      return {
        allowed: true,
        remaining: max - currentCost - cost,
      };
    },

    reset(key?: string) {
      if (key) {
        clients.delete(key);
      } else {
        clients.clear();
      }
    },

    destroy() {
      clearInterval(cleanupInterval);
      clients.clear();
    },
  };
}
