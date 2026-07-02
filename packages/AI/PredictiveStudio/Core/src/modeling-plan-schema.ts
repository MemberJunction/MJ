/**
 * @module modeling-plan-schema
 *
 * Runtime (zod) validators for the {@link ModelingPlanSpec} + {@link Budget}
 * contracts defined in `modeling-plan-spec.ts`. The TypeScript interfaces give
 * compile-time safety; these schemas give RUNTIME safety at trust boundaries —
 * where an untrusted JSON payload (an Action param, an agent-produced plan)
 * crosses into the deterministic engine and must be proven well-formed before it
 * is executed. Kept in Core (push-to-generic) so every consumer validates the
 * SAME shape rather than each re-deriving an ad-hoc check.
 */

import { z } from 'zod';
import type { Budget, ModelingPlanSpec } from './modeling-plan-spec';

/** zod schema for {@link Budget} — every bound optional, each a non-negative number. */
export const BudgetSchema = z
  .object({
    MaxComputeCost: z.number().nonnegative().optional(),
    MaxRuns: z.number().int().nonnegative().optional(),
    MaxWallclockMinutes: z.number().nonnegative().optional(),
  })
  .strip();

/**
 * zod schema for the parts of {@link ModelingPlanSpec} the engine REQUIRES to run.
 * Deliberately permissive on the descriptive arrays (CandidateSources/Features,
 * LeakageNotes) — the orchestrator only hard-depends on `Goal`, a well-formed
 * `TargetDefinition`, and at least one `ProposedExperiments` entry. Unknown keys
 * are stripped, not rejected, so additive plan evolution doesn't break execution.
 */
export const ModelingPlanSpecSchema = z
  .object({
    Goal: z.string().min(1, 'Goal is required'),
    TargetDefinition: z
      .object({
        EntityName: z.string().min(1, 'TargetDefinition.EntityName is required'),
        TargetVariable: z.string().min(1, 'TargetDefinition.TargetVariable is required'),
        ProblemType: z.enum(['classification', 'regression']),
        SuccessMetric: z.string().min(1, 'TargetDefinition.SuccessMetric is required'),
      })
      .passthrough(),
    ProposedExperiments: z
      .array(
        z
          .object({
            Label: z.string().min(1),
            AlgorithmName: z.string().min(1),
            FeatureSet: z.array(z.string()),
            Priority: z.number(),
          })
          .passthrough(),
      )
      .min(1, 'ProposedExperiments must contain at least one experiment'),
    Approved: z.boolean().optional(),
    ProposedBudget: BudgetSchema.optional(),
  })
  .passthrough();

/** Discriminated result of a validation attempt. */
export type PlanValidationResult =
  | { ok: true; value: ModelingPlanSpec }
  | { ok: false; error: string };

/**
 * Validate an untrusted value as a {@link ModelingPlanSpec}. Returns a typed
 * `value` on success or a single flattened, human-readable `error` string on
 * failure (suitable for an Action's VALIDATION_ERROR message).
 */
export function validateModelingPlanSpec(raw: unknown): PlanValidationResult {
  const parsed = ModelingPlanSpecSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, value: parsed.data as unknown as ModelingPlanSpec };
  }
  return { ok: false, error: formatZodError(parsed.error) };
}

/**
 * Validate an untrusted value as a {@link Budget}. Returns the typed budget or a
 * flattened error string.
 */
export function validateBudget(raw: unknown): { ok: true; value: Budget } | { ok: false; error: string } {
  const parsed = BudgetSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, value: parsed.data as Budget };
  }
  return { ok: false, error: formatZodError(parsed.error) };
}

/** Flatten a ZodError into a single `path: message; …` string. */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
