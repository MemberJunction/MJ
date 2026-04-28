/**
 * Tests for DefaultRuntimeActionBridgeBuilder — the architectural contract
 * that breaks the actions ↔ ai-agents cycle:
 *
 *   1. The default builder registers itself via `@RegisterClass(RuntimeActionBridgeBuilder)`
 *      so `@memberjunction/actions` (which does NOT statically depend on
 *      ai-agents / ai-prompts / aiengine) can resolve a concrete bridge at
 *      runtime through `MJGlobal.ClassFactory.CreateInstance`.
 *   2. `BuildHandlers` produces a handler map keyed by the documented
 *      `utilities.*` namespace names.
 *   3. `GetPreamble` returns the JavaScript preamble that exposes those
 *      same names to sandboxed user code.
 *
 * Mock strategy: same pattern as `action-runtime`'s own tests — we stub the
 * external packages that the bridge touches so unit tests never spin up
 * isolated-vm, hit a database, or initialize AIEngine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Static-import mocks. The whole point of the refactor is that these imports
// are now static — so tests need to stub them at the module level rather than
// mock a dynamic `await import`.
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: { Instance: { Actions: [], Config: vi.fn(), RunAction: vi.fn() } }
}));
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class { RunAgent = vi.fn(); }
}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Agents: [], Prompts: [], Config: vi.fn() } }
}));
vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class { ExecutePrompt = vi.fn(); }
}));
vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {}
}));
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    return { ...actual, LogError: vi.fn(), Metadata: class {}, RunQuery: class {}, RunView: class {} };
});
vi.mock('@memberjunction/actions-base', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/actions-base');
    class ActionParam {
        public Name: string = '';
        public Value: unknown = undefined;
        public Type: 'Input' | 'Output' | 'Both' = 'Input';
    }
    return { ...actual, ActionParam };
});

import { MJGlobal } from '@memberjunction/global';
import { RuntimeActionBridgeBuilder } from '@memberjunction/actions-base';
import { DefaultRuntimeActionBridgeBuilder } from '../DefaultRuntimeActionBridgeBuilder';
import { getRuntimeActionBridgePreamble } from '../RuntimeActionBridge';

// The minimum-viable config shape required by BuildHandlers. Permissions are
// deliberately empty — none of the handlers run here, we just need the
// builder to produce a map.
function makeContext() {
    return {
        action: { Name: 'Test Runtime', ID: 'action-id' } as never,
        config: {
            permissions: {
                allowAnyEntity: false,
                allowAnyAction: false,
                allowAnyAgent: false,
                allowedEntities: [],
                allowedActions: [],
                allowedAgents: []
            },
            limits: { maxBridgeCalls: 0 }
        } as never,
        contextUser: { ID: 'user-id', Email: 'test@example.com' } as never
    };
}

describe('DefaultRuntimeActionBridgeBuilder', () => {
    beforeEach(() => {
        // Ensure the @RegisterClass decorator has fired (module-load side effect).
        // Accessing `.Instance` forces the class to be evaluated in this test file.
        void DefaultRuntimeActionBridgeBuilder.Instance;
    });

    describe('ClassFactory registration', () => {
        it('is discoverable through MJGlobal.ClassFactory.CreateInstance(RuntimeActionBridgeBuilder)', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<RuntimeActionBridgeBuilder>(
                RuntimeActionBridgeBuilder
            );
            expect(instance).toBeInstanceOf(DefaultRuntimeActionBridgeBuilder);
        });

        it('returns the same singleton instance on repeated resolution', () => {
            const a = DefaultRuntimeActionBridgeBuilder.Instance;
            const b = DefaultRuntimeActionBridgeBuilder.Instance;
            expect(a).toBe(b);
        });
    });

    describe('BuildHandlers', () => {
        it('returns a non-empty handler map', () => {
            const handlers = DefaultRuntimeActionBridgeBuilder.Instance.BuildHandlers(makeContext());
            expect(Object.keys(handlers).length).toBeGreaterThan(0);
        });

        it('exposes every documented utilities.* namespace', () => {
            const handlers = DefaultRuntimeActionBridgeBuilder.Instance.BuildHandlers(makeContext());
            const keys = Object.keys(handlers);
            // md / rv / rq / entity / actions / agents / ai — the public surface
            // sandboxed Runtime actions rely on. Drift here breaks every
            // Runtime action that calls utilities.<ns>.*.
            const requiredPrefixes = ['md.', 'rv.', 'rq.', 'entity.', 'actions.', 'agents.', 'ai.'];
            for (const prefix of requiredPrefixes) {
                const hit = keys.find((k) => k.startsWith(prefix));
                expect(hit, `missing handler under namespace '${prefix}*'`).toBeDefined();
            }
        });

        it('registers the well-known names the preamble calls', () => {
            const handlers = DefaultRuntimeActionBridgeBuilder.Instance.BuildHandlers(makeContext());
            // Sanity-check a cross-section of critical names — if any of these
            // disappear the sandbox's `utilities.*` helpers throw
            // "handler not registered" errors at runtime.
            const criticalNames = [
                'md.GetEntity',
                'rv.RunView',
                'rv.RunViews',
                'rq.RunQuery',
                'entity.Load',
                'entity.Save',
                'actions.Invoke',
                'agents.Run',
                'ai.ExecutePrompt'
            ];
            for (const name of criticalNames) {
                expect(handlers[name], `missing handler '${name}'`).toBeTypeOf('function');
            }
        });

        it('returns a fresh handler map per call (closures captured per context)', () => {
            const a = DefaultRuntimeActionBridgeBuilder.Instance.BuildHandlers(makeContext());
            const b = DefaultRuntimeActionBridgeBuilder.Instance.BuildHandlers(makeContext());
            expect(a).not.toBe(b);
            // But the shapes match.
            expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
        });
    });

    describe('GetPreamble', () => {
        it('returns a non-empty JavaScript string', () => {
            const preamble = DefaultRuntimeActionBridgeBuilder.Instance.GetPreamble();
            expect(preamble).toBeTypeOf('string');
            expect(preamble.length).toBeGreaterThan(0);
        });

        it('matches the standalone getRuntimeActionBridgePreamble()', () => {
            // The default builder delegates to the module-level factory — lock
            // that in so someone can't accidentally divergently override the
            // preamble in only one of the two call sites.
            expect(DefaultRuntimeActionBridgeBuilder.Instance.GetPreamble()).toBe(
                getRuntimeActionBridgePreamble()
            );
        });

        it('defines the `utilities` object on globalThis', () => {
            const preamble = DefaultRuntimeActionBridgeBuilder.Instance.GetPreamble();
            expect(preamble).toContain('utilities');
        });
    });
});
