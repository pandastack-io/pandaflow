/**
 * Circuit Breaker — Redis-backed
 *
 * Prevents cascading failures in multi-agent workflows.
 * When an agent fails repeatedly, the circuit "opens" and all subsequent
 * calls to that agent immediately fail fast instead of waiting for a timeout.
 *
 * States:
 *   CLOSED  → normal operation, failures counted
 *   OPEN    → all calls rejected immediately, reset timer running
 *   HALF_OPEN → one trial call allowed after reset window
 *
 * Redis keys (TTL = 10 minutes to auto-clean):
 *   cb:failures:{agentId}   → failure count (integer)
 *   cb:state:{agentId}      → 'open' | 'half_open' (absent = closed)
 *   cb:opened_at:{agentId}  → timestamp when circuit was opened
 */

import { redis } from '@/lib/redis';

export interface CircuitBreakerOptions {
  /** Number of failures before opening. Default: 3 */
  failureThreshold?: number;
  /** Seconds before a OPEN circuit transitions to HALF_OPEN. Default: 60 */
  resetWindowSec?: number;
  /** TTL for Redis keys in seconds. Default: 600 */
  ttlSec?: number;
}

type CircuitState = 'closed' | 'open' | 'half_open';

function keysFor(agentId: string) {
  return {
    failures: `cb:failures:${agentId}`,
    state: `cb:state:${agentId}`,
    openedAt: `cb:opened_at:${agentId}`,
  };
}

export class CircuitBreaker {
  private failureThreshold: number;
  private resetWindowSec: number;
  private ttlSec: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetWindowSec = options.resetWindowSec ?? 60;
    this.ttlSec = options.ttlSec ?? 600;
  }

  async getState(agentId: string): Promise<CircuitState> {
    const keys = keysFor(agentId);
    const state = await redis.get(keys.state);

    if (!state) return 'closed';
    if (state === 'half_open') return 'half_open';

    // state === 'open' — check if reset window has elapsed
    const openedAt = await redis.get(keys.openedAt);
    if (!openedAt) return 'closed';

    const elapsedSec = (Date.now() - Number(openedAt)) / 1000;
    if (elapsedSec >= this.resetWindowSec) {
      // Transition to HALF_OPEN — allow one trial call
      await redis.set(keys.state, 'half_open', 'EX', this.ttlSec);
      return 'half_open';
    }

    return 'open';
  }

  /**
   * Record a successful call. Resets failure count and closes the circuit.
   */
  async recordSuccess(agentId: string): Promise<void> {
    const keys = keysFor(agentId);
    await Promise.all([
      redis.del(keys.failures),
      redis.del(keys.state),
      redis.del(keys.openedAt),
    ]);
  }

  /**
   * Record a failed call. If failures exceed threshold, opens the circuit.
   */
  async recordFailure(agentId: string): Promise<void> {
    const keys = keysFor(agentId);
    const failures = await redis.incr(keys.failures);
    await redis.expire(keys.failures, this.ttlSec);

    if (failures >= this.failureThreshold) {
      await redis.set(keys.state, 'open', 'EX', this.ttlSec);
      await redis.set(keys.openedAt, String(Date.now()), 'EX', this.ttlSec);
    }
  }

  /**
   * Execute fn() with circuit breaker protection.
   * Throws CircuitOpenError immediately if the circuit is OPEN.
   * On success: records success.
   * On failure: records failure (may open circuit).
   */
  async execute<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
    const state = await this.getState(agentId);

    if (state === 'open') {
      throw new CircuitOpenError(agentId, this.resetWindowSec);
    }

    try {
      const result = await fn();
      await this.recordSuccess(agentId);
      return result;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      await this.recordFailure(agentId);
      throw error;
    }
  }

  /**
   * Get the current failure count for an agent (for monitoring/UI).
   */
  async getFailureCount(agentId: string): Promise<number> {
    const count = await redis.get(keysFor(agentId).failures);
    return count ? Number(count) : 0;
  }

  /**
   * Manually reset the circuit breaker for an agent (e.g. after fixing the issue).
   */
  async reset(agentId: string): Promise<void> {
    await this.recordSuccess(agentId);
  }
}

export class CircuitOpenError extends Error {
  constructor(agentId: string, resetWindowSec: number) {
    super(
      `Circuit breaker OPEN for agent ${agentId}. ` +
      `Too many recent failures. Will retry automatically in ${resetWindowSec}s.`
    );
    this.name = 'CircuitOpenError';
  }
}

// Singleton instance with default settings, shared across all multi-agent executions.
export const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetWindowSec: 60,
  ttlSec: 600,
});
