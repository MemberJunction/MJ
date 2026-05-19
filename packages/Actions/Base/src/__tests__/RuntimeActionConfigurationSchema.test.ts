import { describe, it, expect } from 'vitest';
import type { MJActionEntity_IRuntimeActionConfiguration } from '@memberjunction/core-entities';
import {
    RuntimeActionConfigurationSchema,
    type RuntimeActionConfiguration
} from '../RuntimeActionConfigurationSchema';

/**
 * Drift detection + validation tests for RuntimeActionConfigurationSchema.
 *
 * The canonical shape lives in the JSONType interface generated into
 * `@memberjunction/core-entities` as `MJActionEntity_IRuntimeActionConfiguration`.
 * The Zod schema in the package must stay structurally aligned with that
 * interface. Because the project builds without `strictNullChecks`, a pure
 * compile-time type-equivalence assertion is unreliable — instead we use
 * runtime round-trips against canonical fixtures plus a pair of `satisfies`
 * clauses below to catch drift.
 *
 * When adding / removing / changing fields in the JSONType interface,
 * update the `fullInstance` fixture here. If the types drift structurally,
 * the `satisfies` clauses will fail to compile.
 */

describe('RuntimeActionConfigurationSchema', () => {
    // Canonical fully-populated instance typed against the JSONType interface.
    // The `satisfies` clause below also checks it against the Zod-inferred
    // type — any drift between the two surfaces here at compile time.
    const fullInstance: MJActionEntity_IRuntimeActionConfiguration = {
        permissions: {
            allowedActions: [
                { id: '11111111-1111-1111-1111-111111111111', name: 'Send Email' }
            ],
            allowedAgents: [
                { id: '22222222-2222-2222-2222-222222222222', name: 'Risk Assessment Agent' }
            ],
            allowedEntities: [
                { id: '33333333-3333-3333-3333-333333333333', name: 'Customers' }
            ],
            // Wildcard escape hatches — exercising the "framework-authored
            // utility action" path so the drift check covers these too.
            allowAnyEntity: true,
            allowAnyAction: false,
            allowAnyAgent: false
        },
        limits: {
            maxMemoryMB: 256,
            maxBridgeCalls: 50
        },
        sandbox: {
            additionalLibraries: [{ name: 'papaparse' }, { name: 'cheerio', version: '^1.0.0' }],
            debugMode: false
        },
        version: '1.0.0',
        previousVersionId: '44444444-4444-4444-4444-444444444444'
    };

    // Drift check: fullInstance must also be a valid Zod-inferred value.
    // If this line fails to compile, the JSONType interface has a field
    // that the Zod schema is missing (or has a field with an incompatible type).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _driftCheckA = fullInstance satisfies RuntimeActionConfiguration;

    // Drift check reverse direction: a Zod-inferred-shape literal must also
    // satisfy the JSONType interface. If this fails to compile, the Zod
    // schema has a required field that the JSONType interface is missing.
    const zodShape: RuntimeActionConfiguration = {
        permissions: {
            allowedActions: [],
            allowedAgents: [],
            allowedEntities: []
        }
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _driftCheckB = zodShape satisfies MJActionEntity_IRuntimeActionConfiguration;

    // Minimal valid instance — only the required `permissions` branch.
    const minimalInstance: MJActionEntity_IRuntimeActionConfiguration = {
        permissions: {
            allowedActions: [],
            allowedAgents: [],
            allowedEntities: []
        }
    };

    describe('valid inputs', () => {
        it('accepts a fully-populated configuration', () => {
            const result = RuntimeActionConfigurationSchema.safeParse(fullInstance);
            expect(result.success).toBe(true);
        });

        it('accepts the minimal configuration (only permissions)', () => {
            const result = RuntimeActionConfigurationSchema.safeParse(minimalInstance);
            expect(result.success).toBe(true);
        });

        it('accepts permissions with empty arrays', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                permissions: { allowedActions: [], allowedAgents: [], allowedEntities: [] }
            });
            expect(result.success).toBe(true);
        });

        it('accepts limits without memory (only bridge calls)', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                ...minimalInstance,
                limits: { maxBridgeCalls: 25 }
            });
            expect(result.success).toBe(true);
        });

        it('accepts sandbox with a library reference lacking a version', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                ...minimalInstance,
                sandbox: { additionalLibraries: [{ name: 'uuid' }] }
            });
            expect(result.success).toBe(true);
        });

        it('accepts wildcard permission flags (framework-authored escape hatch)', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                permissions: {
                    allowedActions: [],
                    allowedAgents: [],
                    allowedEntities: [],
                    allowAnyEntity: true,
                    allowAnyAction: true,
                    allowAnyAgent: true
                }
            });
            expect(result.success).toBe(true);
        });

        it('round-trips with only some wildcards set', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                permissions: {
                    allowedActions: [],
                    allowedAgents: [],
                    allowedEntities: [],
                    allowAnyEntity: true
                }
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.permissions.allowAnyEntity).toBe(true);
                expect(result.data.permissions.allowAnyAction).toBeUndefined();
            }
        });
    });

    describe('invalid inputs', () => {
        it('rejects a configuration missing the top-level permissions key', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({ limits: { maxMemoryMB: 128 } });
            expect(result.success).toBe(false);
        });

        it('rejects permissions missing allowedActions', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                permissions: { allowedAgents: [], allowedEntities: [] }
            });
            expect(result.success).toBe(false);
        });

        it('rejects a reference without an id', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                permissions: {
                    allowedActions: [{ name: 'Send Email' }],
                    allowedAgents: [],
                    allowedEntities: []
                }
            });
            expect(result.success).toBe(false);
        });

        it('rejects a reference with a non-UUID id', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                permissions: {
                    allowedActions: [{ id: 'not-a-uuid', name: 'X' }],
                    allowedAgents: [],
                    allowedEntities: []
                }
            });
            expect(result.success).toBe(false);
        });

        it('rejects a reference with an empty name', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                permissions: {
                    allowedActions: [{ id: '11111111-1111-1111-1111-111111111111', name: '' }],
                    allowedAgents: [],
                    allowedEntities: []
                }
            });
            expect(result.success).toBe(false);
        });

        it('rejects unknown top-level keys (strict mode)', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                ...minimalInstance,
                somethingMade: 'up'
            });
            expect(result.success).toBe(false);
        });

        it('rejects unknown keys nested inside permissions (strict mode)', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                permissions: {
                    allowedActions: [],
                    allowedAgents: [],
                    allowedEntities: [],
                    rogueKey: true
                }
            });
            expect(result.success).toBe(false);
        });

        it('rejects negative or zero memory limits', () => {
            const zeroResult = RuntimeActionConfigurationSchema.safeParse({
                ...minimalInstance,
                limits: { maxMemoryMB: 0 }
            });
            const negativeResult = RuntimeActionConfigurationSchema.safeParse({
                ...minimalInstance,
                limits: { maxMemoryMB: -1 }
            });
            expect(zeroResult.success).toBe(false);
            expect(negativeResult.success).toBe(false);
        });

        it('accepts maxBridgeCalls=0 (pure-compute action)', () => {
            // 0 means "no bridge calls allowed". Pure-compute Runtime actions
            // (e.g. data transforms, numeric utilities) legitimately set this.
            const result = RuntimeActionConfigurationSchema.safeParse({
                ...minimalInstance,
                limits: { maxBridgeCalls: 0 }
            });
            expect(result.success).toBe(true);
        });

        it('rejects negative maxBridgeCalls', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                ...minimalInstance,
                limits: { maxBridgeCalls: -1 }
            });
            expect(result.success).toBe(false);
        });

        it('rejects non-integer memory limits', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                ...minimalInstance,
                limits: { maxMemoryMB: 128.5 }
            });
            expect(result.success).toBe(false);
        });

        it('rejects a non-UUID previousVersionId', () => {
            const result = RuntimeActionConfigurationSchema.safeParse({
                ...minimalInstance,
                previousVersionId: 'nope'
            });
            expect(result.success).toBe(false);
        });
    });

    describe('round-trip', () => {
        it('parses the full instance into a structurally identical object', () => {
            const parsed = RuntimeActionConfigurationSchema.parse(fullInstance);
            expect(parsed).toEqual(fullInstance);
        });
    });
});
