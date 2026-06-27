/**
 * Runtime validation for Action.RuntimeActionConfiguration (Action.Type='Runtime').
 *
 * The canonical TypeScript shape is declared via the JSONType metadata system
 * and lives at `metadata/entities/JSONType-interfaces/IRuntimeActionConfiguration.ts`.
 * CodeGen inlines it into `@memberjunction/core-entities` as
 * `MJActionEntity_IRuntimeActionConfiguration`. This file adds runtime Zod
 * validation because JSONType itself does not enforce shape at Save() time,
 * and the Runtime Action config drives sandbox security scopes — a malformed
 * blob is a security concern, not just a DX one.
 *
 * The schemas use `.strict()` so unknown top-level or nested keys are rejected
 * at parse time — this prevents silent drift when the config is authored by
 * hand or by an older client that doesn't know about a new required field.
 *
 * ## Drift detection
 *
 * This repo currently builds without `strictNullChecks`, which collapses the
 * required/optional distinction in Zod's inferred types enough that a pure
 * compile-time type-equivalence assertion against
 * `MJActionEntity_IRuntimeActionConfiguration` is unreliable (false
 * positives that don't reflect real semantic mismatch).
 *
 * Drift is therefore caught by the Vitest suite in
 * `__tests__/RuntimeActionConfigurationSchema.test.ts`, which:
 *   1. Parses a canonical fully-populated instance typed as
 *      `MJActionEntity_IRuntimeActionConfiguration` — this asserts that every
 *      interface field is accepted by the Zod schema.
 *   2. Rejects known bad shapes (missing required fields, unknown keys,
 *      wrong types) — this asserts that the strictness is preserved.
 *   3. Treats the Zod-inferred type and the JSONType interface as mutual
 *      assignment targets in a dedicated pair of `satisfies` clauses, so any
 *      structural drift is surfaced as a test-level TS error.
 *
 * When adding or removing fields here, mirror the change in the JSONType
 * source file and update the canonical test fixture — the tests will tell
 * you if you miss a spot.
 */
import { z } from 'zod';
import type { MJActionEntity_IRuntimeActionConfiguration } from '@memberjunction/core-entities';

/** id + human-readable name pair for permission scope entries. */
const RuntimeActionReferenceSchema = z
    .object({
        id: z.string().uuid(),
        name: z.string().min(1)
    })
    .strict();

/** Reference to an approved sandbox library. */
const RuntimeLibraryReferenceSchema = z
    .object({
        name: z.string().min(1),
        version: z.string().optional()
    })
    .strict();

const RuntimeActionPermissionsSchema = z
    .object({
        allowedActions: z.array(RuntimeActionReferenceSchema),
        allowedAgents: z.array(RuntimeActionReferenceSchema),
        allowedEntities: z.array(RuntimeActionReferenceSchema),
        // Escape hatches for framework-authored utility actions. See the
        // JSONType interface file for full docs + warnings. Approval UI
        // flags any of these when set.
        allowAnyEntity: z.boolean().optional(),
        allowAnyAction: z.boolean().optional(),
        allowAnyAgent: z.boolean().optional()
    })
    .strict();

const RuntimeActionLimitsSchema = z
    .object({
        // maxMemoryMB must be positive — zero memory means nothing can execute.
        maxMemoryMB: z.number().int().positive().optional(),
        // maxBridgeCalls=0 is legitimate ("pure compute, no bridge access
        // allowed") so we use .nonnegative() rather than .positive().
        maxBridgeCalls: z.number().int().nonnegative().optional()
    })
    .strict();

const RuntimeActionSandboxOptionsSchema = z
    .object({
        additionalLibraries: z.array(RuntimeLibraryReferenceSchema).optional(),
        debugMode: z.boolean().optional()
    })
    .strict();

/**
 * Strict validator for the full RuntimeActionConfiguration blob. Use
 * `safeParse()` at Runtime-action authoring time (inside ActionSmith) and
 * again in `ActionEngine.runRuntimeAction()` before sandbox dispatch.
 */
export const RuntimeActionConfigurationSchema = z
    .object({
        permissions: RuntimeActionPermissionsSchema,
        limits: RuntimeActionLimitsSchema.optional(),
        sandbox: RuntimeActionSandboxOptionsSchema.optional(),
        version: z.string().optional(),
        previousVersionId: z.string().uuid().optional()
    })
    .strict();

/**
 * The canonical RuntimeActionConfiguration type. Sourced from the JSONType
 * interface in `@memberjunction/core-entities` so there is exactly one
 * source of truth for the shape. Re-exported here so consumers can pull
 * both the validator and the type from a single import.
 */
export type RuntimeActionConfiguration = MJActionEntity_IRuntimeActionConfiguration;
