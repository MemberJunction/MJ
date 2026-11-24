/**
 * @module governance/semantics-checker
 *
 * The pre-publication semantics check (S9.5, §5.2): a model's `MJ: ML Output Bindings` rows — the rows each surface
 * renders from — against its declared `OutputSemantics`. {@link SemanticsChecker.Run} is the thin adapter from entity
 * rows to Core's pure `SemanticsRules.Check`; {@link StoredSemanticsCheck} is the lifecycle gate's semantics seam, which
 * reads the rows and runs it.
 */
import type { MJMLModelEntity, MJMLOutputBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { OutputBindingRows, RegistrySchemas, SemanticsRules, type SemanticsCheck } from '@memberjunction/predictive-studio-core';

import type { IGateSemanticsCheck } from '../registry/gate-context';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRowReads } from '../registry/stored-row-reads';

/** The binding columns the check reads. */
export type OutputBindingColumns = Pick<MJMLOutputBindingEntity, 'ID' | 'ModelID' | 'Surface' | 'SortsBy' | 'DriverDirectionRelativeTo' | 'Label'>;

/** The semantics check over given rows. */
export class SemanticsChecker {
  /**
   * The check of `bindings` (the model's output-binding rows) against `model.OutputSemantics`. Pure over its inputs and
   * never throws: semantics that are absent or do not parse fail the check as `OutputSemantics: <why>`, with `Semantics`
   * null.
   */
  public static Run(model: Pick<MJMLModelEntity, 'ID' | 'OutputSemantics'>, bindings: readonly OutputBindingColumns[]): SemanticsCheck {
    const uiBindings = bindings.map((b) => OutputBindingRows.FromEntityRow(b));
    const semantics = RegistrySchemas.ParseOutputSemantics(model.OutputSemantics);
    if (semantics.Ok === false) {
      return {
        ModelID: model.ID, Semantics: null, BindingSource: 'MJ: ML Output Bindings', UIBindings: uiBindings,
        Result: { Status: 'failed', Mismatches: [`OutputSemantics: ${semantics.Errors.join('; ')}`] },
      };
    }
    return { ModelID: model.ID, Semantics: semantics.Value, BindingSource: 'MJ: ML Output Bindings', UIBindings: uiBindings, Result: SemanticsRules.Check(semantics.Value, uiBindings) };
  }

  /**
   * The model's stored binding rows, read past the RunView cache on `ctx.Provider` as `ctx.ContextUser`.
   *
   * @throws Error when the read fails (a failed read is never taken as "no rows")
   */
  public static async ReadBindings(modelId: string, ctx: RegistryContext): Promise<OutputBindingColumns[]> {
    const r = await StoredRowReads.Run<OutputBindingColumns>(
      { EntityName: 'MJ: ML Output Bindings', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}'`, Fields: [...OutputBindingRows.Fields], ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the output bindings of ML Model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results;
  }
}

/** The gate's semantics seam: the model's stored output bindings, checked by {@link SemanticsChecker.Run}. */
export class StoredSemanticsCheck implements IGateSemanticsCheck {
  /**
   * @inheritdoc
   * @throws Error when the binding rows cannot be read (inside the publish transaction, so the publish rolls back)
   */
  public async Check(model: MJMLModelEntity, ctx: RegistryContext): Promise<SemanticsCheck> {
    return SemanticsChecker.Run(model, await SemanticsChecker.ReadBindings(model.ID, ctx));
  }
}
