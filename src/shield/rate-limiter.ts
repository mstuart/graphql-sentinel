export interface RateLimitConfig {
  /**
  Window length in milliseconds. Must be positive and finite.
  */
  window: number;
  /**
  Maximum cost allowed per window. Must be positive and finite.
  */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

const assertPositiveFinite = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
};

interface ClientRecord {
  entries: { timestamp: number; cost: number }[];
}

export const createRateLimiter = (config: RateLimitConfig) => {
  const { window, max } = config;
  assertPositiveFinite(window, 'window');
  assertPositiveFinite(max, 'max');

  const clients = new Map<string, ClientRecord>();

  // Periodic cleanup
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of clients) {
      record.entries = record.entries.filter((entry) => now - entry.timestamp < window);
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
    check(key: string, cost = 1): RateLimitResult {
      assertPositiveFinite(cost, 'cost');

      const now = Date.now();

      let record = clients.get(key);
      if (!record) {
        record = { entries: [] };
        clients.set(key, record);
      }

      // Remove expired entries
      record.entries = record.entries.filter((entry) => now - entry.timestamp < window);

      // Calculate current total cost
      const currentCost = record.entries.reduce((sum, entry) => sum + entry.cost, 0);

      if (currentCost + cost > max) {
        return {
          allowed: false,
          remaining: Math.max(0, max - currentCost),
        };
      }

      record.entries.push({ cost, timestamp: now });

      return {
        allowed: true,
        remaining: max - currentCost - cost,
      };
    },

    destroy() {
      clearInterval(cleanupInterval);
      clients.clear();
    },

    reset(key?: string) {
      if (key) {
        clients.delete(key);
      } else {
        clients.clear();
      }
    },
  };
};
