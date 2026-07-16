/**
 * @module tasks
 *
 * The **10-value Task union** — the single TypeScript source of truth for the
 * task/problem families the Model Component Framework spans. Mirrors, and is held
 * in three-way lockstep with (contract-tested):
 *   1. the SQL CHECK constraints in the ML_Component_Framework migration
 *      (`CK_MLComponent_Task`, `CK_MLModel_Task`, the widened ProblemType CHECKs), and
 *   2. the sidecar's Pydantic `Task` Literal (`app/schemas.py`).
 *
 * The legacy binary {@link ProblemType} (`'classification' | 'regression'`, defined
 * in `sidecar-contract.ts`) remains the narrow alias used by today's train/predict
 * path — every ProblemType is a Task, not vice versa. New task families activate
 * per driver tranche; `Task` is the catalog-level vocabulary from day one.
 */

import { z } from 'zod';

/**
 * Single source of truth for the task-family union. Order matches the migration's
 * CHECK constraint for easy visual diffing.
 */
export const ALL_TASKS = [
  'classification',
  'regression',
  'clustering',
  'dim-reduction',
  'anomaly',
  'survival',
  'forecasting',
  'sequence-state',
  'recommendation',
  'pattern-mining',
] as const;

/** A member of the task-family union. */
export type Task = (typeof ALL_TASKS)[number];

/** zod enum for {@link Task} — runtime validation at trust boundaries. */
export const TaskSchema = z.enum(ALL_TASKS);

/** Type guard: is this string one of the 10 task families? */
export function isTask(value: string): value is Task {
  return (ALL_TASKS as readonly string[]).includes(value);
}
