/**
 * Gate G3.10 "C3 → S9.5" (owner PR 4, phase 3): on C3 (W9-multiclass s42) the semantics check passes for 3 of 3
 * classes, and a binding that swaps the adverse class is refused, 1 of 1. The fixture trains the C3 multiclass unit
 * (`Attended`, `Cancelled`, `NoShow`; `NoShow` adverse) with logistic regression and evaluates it through the lifecycle
 * gate, which creates the model's four `MJ: ML Output Bindings` rows. Then:
 *
 * - `SemanticsRules.Check(OutputSemantics, rows)` passes, and for each declared class: it sits at the same position in
 *   the semantics' class list as in the stored artifact's class order (the trainer result's artifact whose SHA-256 is
 *   the model's), the At-Risk list sorts by adverse probability, and the At-Risk label names every adverse class and
 *   no other — 3 of 3;
 * - the At-Risk row, loaded as an entity through MJAPI, has its label swapped to a non-adverse class: `Save()` is
 *   refused with a validation error on `Label`, and the row read back is unchanged — 1 of 1.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLOutputBindingEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual, ValidationErrorInfo } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { RegistrySchemas, SemanticsRules, TrainingRunResultsParser, type OutputSemantics, type SemanticsBindingSpec } from '@memberjunction/predictive-studio-core';
import { RunFixtures, UnitFixtures, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';

/** The model columns G3.10 reads. */
type C3ModelRow = Pick<MJMLModelEntity, 'ID' | 'OutputSemantics' | 'ArtifactSha256' | 'TrainingRunID'>;
/** A binding row as read back. */
type BindingRow = Pick<MJMLOutputBindingEntity, 'ID' | 'ModelID' | 'Surface' | 'SortsBy' | 'DriverDirectionRelativeTo' | 'Label'>;

/** One declared class and whether every surface agrees with it. */
interface ClassMatch {
  readonly Class: string;
  readonly Matched: boolean;
  readonly Detail: string;
}

/** The swap's outcome. */
interface SwapOutcome {
  readonly Refused: boolean;
  readonly Label: string;
  readonly Message: string;
  readonly NamesLabel: boolean;
  readonly Unchanged: boolean;
}

/** G3.10's reads and checks. */
class PsGateC3S95Steps {
  /** The evaluated model's row; throws when it is missing. */
  public static async Model(h: TruthHarness, modelId: string): Promise<C3ModelRow> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<C3ModelRow>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'OutputSemantics', 'ArtifactSha256', 'TrainingRunID'], ResultType: 'simple', BypassCache: true }, h.User);
    const row = r.Results[0];
    if (!r.Success || !row) throw new Error(`G3.10: reading ML Model ${modelId}: ${r.ErrorMessage || 'no row'}`);
    return row;
  }

  /** The model's parsed semantics; throws when they do not parse. */
  public static Semantics(model: C3ModelRow): OutputSemantics {
    const parsed = RegistrySchemas.ParseOutputSemantics(model.OutputSemantics);
    if (parsed.Ok === false) throw new Error(`G3.10: ML Model ${model.ID}'s OutputSemantics do not parse: ${parsed.Errors.join('; ')}`);
    return parsed.Value;
  }

  /** The model's binding rows, read fresh. */
  public static async Bindings(h: TruthHarness, modelId: string): Promise<BindingRow[]> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<BindingRow>({
      EntityName: 'MJ: ML Output Bindings', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}'`,
      Fields: ['ID', 'ModelID', 'Surface', 'SortsBy', 'DriverDirectionRelativeTo', 'Label'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    if (!r.Success) throw new Error(`G3.10: reading the output bindings of ML Model ${modelId}: ${r.ErrorMessage}`);
    return r.Results;
  }

  /** The class order of the stored artifact the model serves (the trainer result's artifact with the model's SHA-256). */
  public static async ArtifactClassOrder(h: TruthHarness, model: C3ModelRow): Promise<readonly string[] | null> {
    if (!model.TrainingRunID) return null;
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'ValidationResults'>>(
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(model.TrainingRunID)}'`, Fields: ['ID', 'ValidationResults'], ResultType: 'simple', BypassCache: true }, h.User);
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(r.Results[0]?.ValidationResults || null);
    if (parsed.Ok === false || parsed.Value.status !== 'completed' || parsed.Value.trainer === null) return null;
    const sha = (model.ArtifactSha256 || '').toLowerCase();
    const artifact = parsed.Value.trainer.artifacts.find((a) => a.sha256.toLowerCase() === sha);
    return artifact === undefined ? null : artifact.classOrder;
  }

  /**
   * Each declared class: same position in the artifact's class order (the semantics' own order when the run stores no
   * artifact class order), the At-Risk list sorts by adverse probability, its label is exact.
   */
  public static Classes(semantics: OutputSemantics, artifactOrder: readonly string[] | null, atRisk: SemanticsBindingSpec): ClassMatch[] {
    const task = semantics.task;
    const declared = task.kind === 'binary' || task.kind === 'multiclass' ? task.classOrder : [];
    const adverse = SemanticsRules.AdverseClasses(task);
    const sortOk = atRisk.SortsBy === 'adverse-probability-desc';
    const labelOk = !SemanticsRules.CheckRow(semantics, atRisk).some((m) => m.Field === 'Label');
    return declared.map((c, i) => {
      const orderOk = (artifactOrder === null ? declared : artifactOrder)[i] === c;
      return {
        Class: c, Matched: orderOk && sortOk && labelOk,
        Detail: `${c}: position ${i} ${orderOk ? 'matches' : 'does not match'} ${artifactOrder === null ? 'the semantics (no stored artifact class order)' : 'the artifact'}, ${adverse.includes(c) ? 'adverse' : 'not adverse'}, sort ${atRisk.SortsBy}, label "${atRisk.Label}" ${labelOk ? 'exact' : 'wrong'}`,
      };
    });
  }

  /** The At-Risk row loaded as an entity through MJAPI, its label swapped to name `swapTo` only, saved; then read back. */
  public static async Swap(h: TruthHarness, atRisk: BindingRow, swapTo: string): Promise<SwapOutcome> {
    const row = await h.Provider.GetEntityObject<MJMLOutputBindingEntity>('MJ: ML Output Bindings', h.User);
    if (!(await row.Load(atRisk.ID))) throw new Error(`G3.10: loading output binding ${atRisk.ID}: ${row.LatestResult?.CompleteMessage || 'not found'}`);
    const label = `${swapTo} risk`;
    row.Label = label;
    const saved = await row.Save();
    const errors = (row.LatestResult?.Errors || []).filter((e): e is ValidationErrorInfo => e instanceof ValidationErrorInfo);
    const after = (await PsGateC3S95Steps.Bindings(h, atRisk.ModelID)).find((b) => UUIDsEqual(b.ID, atRisk.ID));
    return {
      Refused: !saved, Label: label, Message: row.LatestResult?.CompleteMessage || '', NamesLabel: errors.some((e) => e.Source === 'Label'),
      Unchanged: after !== undefined && after.Label === atRisk.Label && after.SortsBy === atRisk.SortsBy && after.DriverDirectionRelativeTo === atRisk.DriverDirectionRelativeTo,
    };
  }
}

export const PsGateC3S95Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c3-s9-5.G3.10', Name: 'G3.10 C3 → S9.5: the semantics check passes for 3 of 3 C3 classes, and a binding that swaps the adverse class is refused, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      await h.EnsureLoaded({ Kind: 'world', ID: 'W9-multiclass', Seed: 42 });
      const { Pipeline: pipeline } = await UnitFixtures.ProvisionW9MulticlassPipeline(h);
      const t = await h.Train(pipeline);
      if (!t.ModelID) throw new Error(`G3.10: training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage || 'no model id'}`);
      const status = await RunFixtures.EvaluateModel(h, t.ModelID, 'G3.10 C3');
      const model = await PsGateC3S95Steps.Model(h, t.ModelID);
      const semantics = PsGateC3S95Steps.Semantics(model);
      const rows = await PsGateC3S95Steps.Bindings(h, model.ID);
      const check = SemanticsRules.Check(semantics, rows);
      const atRisk = rows.find((r) => r.Surface === 'at-risk-list');
      if (atRisk === undefined) throw new Error(`G3.10: ML Model ${model.ID} has no at-risk-list binding (${rows.length} rows)`);
      const artifactOrder = await PsGateC3S95Steps.ArtifactClassOrder(h, model);
      const classes = PsGateC3S95Steps.Classes(semantics, artifactOrder, atRisk);
      const matched = classes.filter((c) => c.Matched).length;
      const swapTo = classes.map((c) => c.Class).find((c) => !SemanticsRules.AdverseClasses(semantics.task).includes(c)) || '';
      const swap = await PsGateC3S95Steps.Swap(h, atRisk, swapTo);
      const refused = swap.Refused && swap.NamesLabel && swap.Unchanged ? 1 : 0;
      PsGate.Assert({
        Passed: check.Status === 'passed' && classes.length === 3 && matched === 3 && refused === 1,
        Measured: {
          check: check.Status === 'passed' ? 'passed' : `failed: ${check.Mismatches.join(' | ')}`, bindingRows: rows.length, classesMatched: matched, classes: classes.length,
          classOrderSource: artifactOrder === null ? 'OutputSemantics (the run stores no artifact class order)' : `artifact ${artifactOrder.join(',')}`, swappedRefused: refused, of: 1, swappedLabel: swap.Label, refusalNamesLabel: swap.NamesLabel, rowUnchanged: swap.Unchanged, modelStatus: status, modelId: model.ID,
          refusal: swap.Message.slice(0, 240), classDetail: classes.map((c) => c.Detail).join(' | '),
        },
        Detail: `semantics check ${check.Status} for ${matched} of ${classes.length} C3 classes against ${artifactOrder === null ? "the semantics' own class order (the run stores no artifact class order)" : "the stored artifact's class order"}; a binding labelled "${swap.Label}" (the adverse class swapped) `
          + `${swap.Refused ? 'was refused' : 'was saved'}${swap.NamesLabel ? ' on Label' : ''}, row ${swap.Unchanged ? 'unchanged' : 'changed'}: ${refused} of 1`,
      });
    },
  },
];

for (const c of PsGateC3S95Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c3-s9-5', PsGate.Lifecycle);
