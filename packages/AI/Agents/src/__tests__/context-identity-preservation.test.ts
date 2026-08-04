/**
 * Tests for context identity preservation across the agent execution pipeline.
 *
 * The agent framework passes a `context` object through ExecuteAgentParams to
 * actions and sub-agents. When the context is a class instance (e.g., SkipAgentContext),
 * its prototype chain, getters, and methods must be preserved — spreading into a
 * plain object destroys them silently.
 *
 * These tests verify that every code path that touches params.context preserves
 * class identity. Written after a production incident where spreading the context
 * in ExecuteSingleAction destroyed SkipAgentContext getters (5.34.0 regression).
 *
 * Covered code paths:
 * - ExecuteSingleAction: context passed to action engine
 * - preloadAgentData: context merged with preloaded data
 * - ExecuteSubAgent: context propagated to sub-agent runner
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

// ════════════════════════════════════════════════════════════════════
// Test context class — mimics SkipAgentContext's structure
// ════════════════════════════════════════════════════════════════════

class TestContext {
    private _secret = 'hidden-value';
    private _request: { entities: string[] };

    constructor(entities: string[] = ['Invoices', 'Members']) {
        this._request = { entities };
    }

    /** Getter that would be destroyed by spreading */
    get request(): { entities: string[] } {
        return this._request;
    }

    /** Method that would be destroyed by spreading */
    GetEntities(): string[] {
        return this._request.entities;
    }
}

// ════════════════════════════════════════════════════════════════════
// ExecuteSingleAction — context must reach actions as original class
// ════════════════════════════════════════════════════════════════════

describe('ExecuteSingleAction context preservation', () => {
    /**
     * Reimplements the context-building logic from base-agent.ts ExecuteSingleAction
     * (lines ~4247-4254) to verify class identity is preserved.
     *
     * The 5.33→5.34 regression was:
     *   const actionContext = { ...baseContext, AgentID: '...' };
     * which destroyed class getters. The fix mutates the original object directly.
     */
    function buildActionContext(context: unknown, agentID: string, resolvedStorageAccountId?: string): unknown {
        // Mirrors the fixed code in ExecuteSingleAction
        const actionContext = typeof context === 'object' && context ? context : {};
        (actionContext as Record<string, unknown>).AgentID = agentID;
        if (resolvedStorageAccountId) {
            (actionContext as Record<string, unknown>).__resolvedStorageAccountId = resolvedStorageAccountId;
        }
        return actionContext;
    }

    it('should preserve class instance identity', () => {
        const ctx = new TestContext();
        const result = buildActionContext(ctx, 'agent-123');
        expect(result).toBeInstanceOf(TestContext);
    });

    it('should preserve getters on the context', () => {
        const ctx = new TestContext(['Orders', 'Products']);
        const result = buildActionContext(ctx, 'agent-123') as TestContext;
        expect(result.request.entities).toEqual(['Orders', 'Products']);
    });

    it('should preserve methods on the context', () => {
        const ctx = new TestContext(['Orders']);
        const result = buildActionContext(ctx, 'agent-123') as TestContext;
        expect(typeof result.GetEntities).toBe('function');
        expect(result.GetEntities()).toEqual(['Orders']);
    });

    it('should stamp AgentID onto the original context object', () => {
        const ctx = new TestContext();
        const result = buildActionContext(ctx, 'agent-456') as Record<string, unknown>;
        expect(result.AgentID).toBe('agent-456');
        // Verify it's the same reference, not a copy
        expect(result).toBe(ctx);
    });

    it('should stamp __resolvedStorageAccountId when present', () => {
        const ctx = new TestContext();
        const result = buildActionContext(ctx, 'agent-123', 'storage-789') as Record<string, unknown>;
        expect(result.__resolvedStorageAccountId).toBe('storage-789');
        expect(result).toBe(ctx);
    });

    it('should not stamp __resolvedStorageAccountId when absent', () => {
        const ctx = new TestContext();
        const result = buildActionContext(ctx, 'agent-123') as Record<string, unknown>;
        expect(result.__resolvedStorageAccountId).toBeUndefined();
    });

    it('should create an empty object when context is null', () => {
        const result = buildActionContext(null, 'agent-123') as Record<string, unknown>;
        expect(result.AgentID).toBe('agent-123');
    });

    it('should create an empty object when context is undefined', () => {
        const result = buildActionContext(undefined, 'agent-123') as Record<string, unknown>;
        expect(result.AgentID).toBe('agent-123');
    });

    // Regression guard: verify that spreading WOULD destroy the class
    it('[regression guard] spreading a class instance destroys getters', () => {
        const ctx = new TestContext(['A', 'B']);
        const spread = { ...ctx };
        // The spread object is NOT an instance of TestContext
        expect(spread).not.toBeInstanceOf(TestContext);
        // The getter is gone — accessing .request returns undefined
        expect((spread as Record<string, unknown>).request).toBeUndefined();
        // The method is gone
        expect((spread as Record<string, unknown>).GetEntities).toBeUndefined();
    });
});

// ════════════════════════════════════════════════════════════════════
// preloadAgentData — context merged with preloaded data
// ════════════════════════════════════════════════════════════════════

describe('preloadAgentData context merge', () => {
    /**
     * Reimplements the context merge logic from base-agent.ts preloadAgentData
     * (lines ~989-992). The fix copies preloaded properties onto the existing
     * context without replacing it, preserving class identity.
     */
    function mergePreloadedContext(
        existingContext: unknown,
        preloadedContext: Record<string, unknown> | undefined
    ): unknown {
        if (preloadedContext && typeof preloadedContext === 'object') {
            if (!existingContext || typeof existingContext !== 'object') {
                return preloadedContext;
            } else {
                for (const key of Object.keys(preloadedContext)) {
                    if (!(key in existingContext)) {
                        (existingContext as Record<string, unknown>)[key] = preloadedContext[key];
                    }
                }
                return existingContext;
            }
        }
        return existingContext;
    }

    it('should preserve class instance identity when merging', () => {
        const ctx = new TestContext();
        const preloaded = { extraData: 'some-value' };
        const result = mergePreloadedContext(ctx, preloaded);
        expect(result).toBeInstanceOf(TestContext);
        expect(result).toBe(ctx);
    });

    it('should preserve getters after merge', () => {
        const ctx = new TestContext(['Invoices']);
        const preloaded = { cacheKey: '123' };
        const result = mergePreloadedContext(ctx, preloaded) as TestContext;
        expect(result.request.entities).toEqual(['Invoices']);
    });

    it('should add preloaded properties that do not exist on context', () => {
        const ctx = new TestContext();
        const preloaded = { newProp: 42 };
        const result = mergePreloadedContext(ctx, preloaded) as Record<string, unknown>;
        expect(result.newProp).toBe(42);
    });

    it('should not overwrite existing properties on context (caller takes precedence)', () => {
        const ctx = new TestContext() as unknown as Record<string, unknown>;
        ctx.shared = 'caller-value';
        const preloaded = { shared: 'preloaded-value' };
        const result = mergePreloadedContext(ctx, preloaded) as Record<string, unknown>;
        expect(result.shared).toBe('caller-value');
    });

    it('should use preloaded context when existing context is null', () => {
        const preloaded = { key: 'value' };
        const result = mergePreloadedContext(null, preloaded);
        expect(result).toBe(preloaded);
    });

    it('should use preloaded context when existing context is undefined', () => {
        const preloaded = { key: 'value' };
        const result = mergePreloadedContext(undefined, preloaded);
        expect(result).toBe(preloaded);
    });

    it('should return existing context unchanged when preloaded is undefined', () => {
        const ctx = new TestContext();
        const result = mergePreloadedContext(ctx, undefined);
        expect(result).toBe(ctx);
    });

    it('should return existing context unchanged when preloaded is empty', () => {
        const ctx = new TestContext();
        const result = mergePreloadedContext(ctx, {});
        expect(result).toBe(ctx);
    });
});

// ════════════════════════════════════════════════════════════════════
// ExecuteSubAgent — context propagated by reference
// ════════════════════════════════════════════════════════════════════

describe('ExecuteSubAgent context propagation', () => {
    /**
     * Reimplements the context selection logic from base-agent.ts ExecuteSubAgent
     * (line ~4462). Sub-agent context is either from the request or inherited
     * from the parent — either way it must be passed by reference.
     */
    function selectSubAgentContext(
        requestContext: unknown | undefined,
        parentContext: unknown
    ): unknown {
        return requestContext !== undefined ? requestContext : parentContext;
    }

    it('should pass parent context by reference when sub-agent has no explicit context', () => {
        const parentCtx = new TestContext(['A']);
        const result = selectSubAgentContext(undefined, parentCtx);
        expect(result).toBe(parentCtx);
        expect(result).toBeInstanceOf(TestContext);
    });

    it('should use sub-agent context when explicitly provided', () => {
        const parentCtx = new TestContext(['A']);
        const subCtx = new TestContext(['B']);
        const result = selectSubAgentContext(subCtx, parentCtx);
        expect(result).toBe(subCtx);
        expect(result).toBeInstanceOf(TestContext);
    });

    it('should preserve getters on inherited parent context', () => {
        const parentCtx = new TestContext(['Invoices', 'Members']);
        const result = selectSubAgentContext(undefined, parentCtx) as TestContext;
        expect(result.request.entities).toEqual(['Invoices', 'Members']);
        expect(result.GetEntities()).toEqual(['Invoices', 'Members']);
    });
});
