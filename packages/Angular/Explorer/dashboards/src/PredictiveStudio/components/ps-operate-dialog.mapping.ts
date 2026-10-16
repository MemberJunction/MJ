/**
 * @module PredictiveStudio/components/ps-operate-dialog.mapping
 *
 * Pure, framework-free mapping from the "Operate this model" dialog's knob state to the
 * {@link PredictiveStudioCreateScoringProcessOperation} input. Extracted from the Angular
 * component so the submit→input contract (scope mode → `scope` object; output mode →
 * `outputField` present/absent) is unit-testable without instantiating Angular.
 *
 * Keep this a state object (`OperateModelState`) so new operate knobs are additive — the
 * mapping reads only the fields it understands and ignores the rest.
 */

import type { PredictiveStudioCreateScoringProcessInput } from '@memberjunction/core-entities';

/** Which records the run scores. Mirrors the dialog's segmented scope control. */
export type OperateScopeMode = 'all' | 'view' | 'list';

/** Where predictions land. Mirrors the dialog's segmented output control. */
export type OperateOutputMode = 'generic' | 'writeback';

/** Which prediction value a write-back lands (classification can choose the class label). */
export type OperateValueKind = 'score' | 'class';

/**
 * The full knob state of the Operate dialog. The component holds exactly this object and
 * mutates it from the UI; {@link mapStateToCreateScoringInput} turns it into the Remote Op
 * input. New knobs append fields here (additive) without breaking existing mapping callers.
 */
export interface OperateModelState {
  /** `MJ: ML Models` id the created scoring process runs. */
  ModelId: string;
  /** Target entity whose rows are scored (resolved registered entity name, e.g. `Memberships`). */
  TargetEntityName: string;
  /** Scope segment selection. */
  ScopeMode: OperateScopeMode;
  /** Selected `User Views` id when {@link ScopeMode} is `'view'`. */
  ViewId: string | null;
  /** Selected `Lists` id when {@link ScopeMode} is `'list'`. */
  ListId: string | null;
  /** Output segment selection. */
  OutputMode: OperateOutputMode;
  /** Target column to write predictions into when {@link OutputMode} is `'writeback'`. */
  OutputField: string;
  /** Which value the write-back lands (only meaningful for classification + write-back). */
  ValueKind: OperateValueKind;
}

/** Why a state can't be turned into a valid scoring-process input. */
export type OperateMappingError =
  | 'missing-model'
  | 'missing-target-entity'
  | 'missing-view'
  | 'missing-list'
  | 'missing-output-field';

/** Discriminated result of {@link mapStateToCreateScoringInput}. */
export type OperateMappingResult =
  | { ok: true; input: PredictiveStudioCreateScoringProcessInput }  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  | { ok: false; error: OperateMappingError };  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

/** Build the `scope` object for the create-scoring input from the scope knobs. */
function buildScope(state: OperateModelState):
  | { ok: true; scope: PredictiveStudioCreateScoringProcessInput['scope'] }
  | { ok: false; error: OperateMappingError } {
  switch (state.ScopeMode) {
    case 'view': {
      const viewId = state.ViewId?.trim();
      if (!viewId) return { ok: false, error: 'missing-view' };
      return { ok: true, scope: { viewId } };
    }
    case 'list': {
      const listId = state.ListId?.trim();
      if (!listId) return { ok: false, error: 'missing-list' };
      return { ok: true, scope: { listId } };
    }
    case 'all':
    default:
      return { ok: true, scope: { all: true } };
  }
}

/**
 * Map the dialog's knob state to a {@link PredictiveStudioCreateScoringProcessInput}.
 *
 * Contract enforced here (the thing the unit tests pin):
 * - **Scope** → exactly one selector on `scope`: `all` (default) / `viewId` / `listId`.
 * - **Output** → `outputField` is present ONLY in write-back mode (and must be non-empty);
 *   generic mode omits it entirely (predictions land in run history only — no binding).
 * - `valueKind` is attached only in write-back mode (the create op ignores it otherwise).
 *
 * Returns a discriminated result so the component can surface a precise, non-throwing error.
 */
export function MapStateToCreateScoringInput(state: OperateModelState): OperateMappingResult {
  const modelId = state.ModelId?.trim();
  if (!modelId) return { ok: false, error: 'missing-model' };

  const targetEntityName = state.TargetEntityName?.trim();
  if (!targetEntityName) return { ok: false, error: 'missing-target-entity' };

  const scopeResult = buildScope(state);
  if (!scopeResult.ok) return scopeResult;

  const input: PredictiveStudioCreateScoringProcessInput = {
    modelId,
    targetEntityName,
    scope: scopeResult.scope,
  };

  if (state.OutputMode === 'writeback') {
    const outputField = state.OutputField?.trim();
    if (!outputField) return { ok: false, error: 'missing-output-field' };
    input.outputField = outputField;
    input.valueKind = state.ValueKind;
  }

  return { ok: true, input };
}

/** @deprecated Use {@link MapStateToCreateScoringInput}. */
export function mapStateToCreateScoringInput(state: OperateModelState): OperateMappingResult {
  return MapStateToCreateScoringInput(state);
}

/** A short, user-facing message for a mapping error (used by the dialog's notifications). */
export function DescribeOperateMappingError(error: OperateMappingError): string {
  switch (error) {
    case 'missing-model':
      return 'No model selected to operate.';
    case 'missing-target-entity':
      return 'Choose a target entity to score.';
    case 'missing-view':
      return 'Choose a saved view to score.';
    case 'missing-list':
      return 'Choose a list to score.';
    case 'missing-output-field':
      return 'Enter the column to write predictions into.';
  }
}

/** @deprecated Use {@link DescribeOperateMappingError}. */
export function describeOperateMappingError(error: OperateMappingError): string {
  return DescribeOperateMappingError(error);
}
