/**
 * @module scoring/scoring-binding
 *
 * Helper to create or update a `MJ: ML Model Scoring Binding` (plan §4.6) so a
 * model's scoring is **lineage-tracked**. A binding ties an `MJ: ML Models` row to
 * the `MJ: Record Processes` row that scores it, the target entity/column where
 * scores land, the {@link ScoringBindingMode}, and monitoring fields
 * (`LastScoredAt` / `LastRowCount`). Used by both the on-demand and scheduled
 * scoring paths (the Remote-Op + scheduled-trigger wiring is a later phase — this
 * helper builds the binding now).
 *
 * The entity-creation seam is injected ({@link IEntityFactory}, shared with the
 * training engine) so this helper is unit-testable with no live database.
 */

import { LogError, type UserInfo } from '@memberjunction/core';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import type { IEntityFactory } from '../training';

/**
 * How a binding scores. Mirrors `MJ: ML Model Scoring Bindings.Mode`. `Materialized`
 * is reserved for the post-#2770 path (plan §10.2) — `OnDemand` + `Scheduled` ship
 * now.
 */
export type ScoringBindingMode = 'OnDemand' | 'Scheduled' | 'Materialized';

/**
 * Input to {@link upsertScoringBinding}. When `bindingId` is supplied the existing
 * binding is updated (e.g. to refresh `LastScoredAt` / `LastRowCount` after a
 * run); otherwise a new binding is created.
 */
export interface ScoringBindingInput {
  /** Existing binding id to update; omit to create a new binding. */
  bindingId?: string;
  /** The `MJ: ML Models` id this binding scores with. */
  mlModelId: string;
  /** The `MJ: Record Processes` id that runs the scoring. */
  recordProcessId: string;
  /** Target entity id where scores are written (when write-back/materialized). */
  targetEntityId?: string;
  /** Target column where the score lands (when write-back/materialized). */
  targetColumn?: string;
  /** Scoring mode (defaults to `OnDemand`). */
  mode?: ScoringBindingMode;
  /** Monitoring: when the binding last scored. */
  lastScoredAt?: Date;
  /** Monitoring: how many rows the last scoring run covered. */
  lastRowCount?: number;
}

/**
 * Create or update a `MJ: ML Model Scoring Binding`. Returns the saved entity.
 *
 * @param input the binding fields (create when `bindingId` is omitted, else update)
 * @param entityFactory the entity-creation seam (production: `MetadataEntityFactory`)
 * @param contextUser request user — required server-side for isolation/audit
 * @throws when the underlying `Save()` fails (surfaces `LatestResult.CompleteMessage`)
 */
export async function upsertScoringBinding(
  input: ScoringBindingInput,
  entityFactory: IEntityFactory,
  contextUser?: UserInfo,
): Promise<MJMLModelScoringBindingEntity> {
  const binding = await entityFactory.getEntityObject<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', contextUser);
  if (input.bindingId) {
    const loaded = await binding.Load(input.bindingId);
    if (!loaded) {
      throw new Error(`upsertScoringBinding: scoring binding '${input.bindingId}' not found`);
    }
  }

  binding.MLModelID = input.mlModelId;
  binding.RecordProcessID = input.recordProcessId;
  if (input.targetEntityId !== undefined) {
    binding.TargetEntityID = input.targetEntityId;
  }
  if (input.targetColumn !== undefined) {
    binding.TargetColumn = input.targetColumn;
  }
  binding.Mode = input.mode ?? 'OnDemand';
  if (input.lastScoredAt !== undefined) {
    binding.LastScoredAt = input.lastScoredAt;
  }
  if (input.lastRowCount !== undefined) {
    binding.LastRowCount = input.lastRowCount;
  }

  const saved = await binding.Save();
  if (!saved) {
    const message = binding.LatestResult?.CompleteMessage ?? 'unknown error';
    LogError(`upsertScoringBinding: failed to save scoring binding for model '${input.mlModelId}': ${message}`);
    throw new Error(`Failed to save ML Model Scoring Binding: ${message}`);
  }
  return binding;
}

/**
 * Convenience wrapper to stamp a binding's monitoring fields after a scoring run
 * — `LastScoredAt = now` and `LastRowCount = rowCount`. Creates the binding if it
 * does not yet exist.
 *
 * @param bindingId existing binding id (omit to create)
 * @param details the model + record-process ids the binding ties together
 * @param rowCount the number of rows the run scored
 * @param entityFactory the entity-creation seam
 * @param contextUser request user
 */
export async function recordScoringRun(
  bindingId: string | undefined,
  details: { mlModelId: string; recordProcessId: string; mode?: ScoringBindingMode },
  rowCount: number,
  entityFactory: IEntityFactory,
  contextUser?: UserInfo,
): Promise<MJMLModelScoringBindingEntity> {
  return upsertScoringBinding(
    {
      bindingId,
      mlModelId: details.mlModelId,
      recordProcessId: details.recordProcessId,
      mode: details.mode,
      lastScoredAt: new Date(),
      lastRowCount: rowCount,
    },
    entityFactory,
    contextUser,
  );
}
