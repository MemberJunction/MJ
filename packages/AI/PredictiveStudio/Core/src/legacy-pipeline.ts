/**
 * @module legacy-pipeline
 *
 * Maps a pipeline that predates Prediction Units (TargetEntity / TargetVariable / ProblemType / AsOfStrategy,
 * ValidationStrategy / LeakageGuard, OutcomeConfig) onto a version-1 Prediction Unit and the inputs of a version-1
 * Evaluation Protocol. Every case ends in a recorded automated outcome: a unit, an archive or a hold, each with its
 * reason. Pure and browser-safe: the caller supplies the observed classes, the rows' dates and the newest model's
 * lineage.
 */
import { JsonParse, type JsonObject } from './json-value';
import type { HoldoutSplit, InnerValidation, ProtocolExclusions } from './evaluation-protocol';
import { EvaluationProtocolRules, type EvaluationProtocolDraft } from './evaluation-protocol-rules';
import { ResolveOutcomeConfig } from './outcome-config';
import type { TaskType } from './task-type';
import type { UnitDraft } from './protocol-rows';
import type { CensoringRule, DecisionDateRule, PredictionUnitSpec } from './prediction-unit';
import { UtcDay, type CellValue } from './utc-day';

/** Why a binary pipeline is held; also the report reason. */
export const ADVERSE_CLASS_HOLD_REASON =
  'adverse class undetermined: no OutcomeConfig polarity or red/green class style on the pipeline, its newest model or the target name; set FeatureSteps.OutcomeConfig.Polarity (or OutcomeStyles) and run this Action again';

/** Why a pipeline that declares a time index is held: a random holdout over time-ordered rows would clear it unevaluated. */
export const TIME_INDEX_HOLD_REASON = 'a time-indexed pipeline needs a forecast unit with a rolling-origin protocol';

/** The holdout share used when a pipeline's ValidationStrategy names none. */
export const LEGACY_DEFAULT_HOLDOUT_SHARE = 0.25;
/** The smallest and largest holdout share a migrated protocol takes (the legacy fraction is clamped to them). */
export const LEGACY_HOLDOUT_SHARE_RANGE: readonly [number, number] = [0.05, 0.5];

/** The seed of every protocol a migrated or wizard-created pipeline is bound to. */
export const LEGACY_PROTOCOL_SEED = 42;

/** The legacy pipeline columns the mapping reads (the generated entity satisfies this structurally). */
export interface LegacyPipelineFields {
  readonly Name: string;
  readonly TargetEntity: string;
  readonly TargetVariable: string;
  /** `string`, not the two-valued union: an older database also holds `sequence`. */
  readonly ProblemType: string;
  readonly AsOfStrategy: string | null;
  /** Read for its `TimeIndexColumn`: a pipeline that declares one is held. */
  readonly ValidationStrategy: string | null;
}

/** Where a migrated unit's adverse class came from, in the legacy engine's order of precedence. */
export type AdverseClassSource = 'pipeline-outcome-config' | 'model-lineage-outcome-config' | 'target-name-polarity';

/** The outcome semantics one source declares: the score polarity and the badge colour per class name. */
export interface LegacyOutcomeSemantics {
  readonly Source: AdverseClassSource;
  readonly Polarity: 'positive' | 'adverse' | null;
  readonly Styles: ReadonlyMap<string, string>;
}

/** What the migration reads to find the declared outcome semantics. */
export interface LegacyOutcomeInputs {
  readonly FeatureSteps: string | null;
  readonly Hyperparameters: string | null;
  /** `Lineage` JSON of the pipeline's newest Published model, else its newest model; null when it has none. */
  readonly ModelLineage: string | null;
  readonly TargetVariable: string;
  readonly ProblemType: string;
}

/** The adverse class one source decided, or why none did. */
export type LegacyAdverseClassResult =
  | { readonly Kind: 'decided'; readonly AdverseIndex: 0 | 1; readonly Source: AdverseClassSource; readonly Evidence: string }
  | { readonly Kind: 'undetermined'; readonly Reason: string };

/** An outcome that ends the migration of a pipeline: no Prediction Unit form exists, or a required fact is not declared. */
export type LegacyStop = { readonly Kind: 'archive'; readonly Reason: string } | { readonly Kind: 'hold'; readonly Reason: string };

/** The version-1 unit draft of a pipeline, or why it gets none. */
export type LegacyUnitOutcome =
  | { readonly Kind: 'unit'; readonly Draft: UnitDraft; readonly DateColumn: string | null; readonly Notes: readonly string[] }
  | LegacyStop;

/** The holdout kinds a migrated protocol uses (a module-private selector: its member is the contract's wire name). */
type LegacyHoldoutKinds = { readonly kind: 'date-carved' | 'seeded-random' };

/** The holdouts a migrated protocol uses: a date carve on the unit's date column, or a seeded row hash for one fixed date. */
export type LegacyHoldout = Extract<HoldoutSplit, LegacyHoldoutKinds>;

/** The inputs of a pipeline's version-1 protocol, or why it gets none. */
export type LegacyProtocolOutcome =
  | {
      readonly Kind: 'protocol';
      readonly Holdout: LegacyHoldout;
      /** null = the default inner validation of `DefaultEvaluationProtocolDraft`. */
      readonly InnerValidation: InnerValidation | null;
      readonly Exclusions: ProtocolExclusions;
      readonly Notes: readonly string[];
    }
  | { readonly Kind: 'archive'; readonly Reason: string };

/** The task a pipeline's outcome maps to, the semantics recorded on the unit, and the report note. */
interface LegacyTaskChoice {
  readonly Kind: 'task';
  readonly Task: TaskType;
  /** The adverse-class sentence for the unit's description; empty when the task has no adverse class. */
  readonly Semantics: string;
  readonly Note: string;
}

/** How a pipeline's AsOfStrategy maps onto a decision date: the date column, or none (one fixed date per run). */
type LegacyDecisionColumn = { readonly Kind: 'column'; readonly Column: string | null } | LegacyStop;

const SOURCE_LABEL: Readonly<Record<AdverseClassSource, string>> = {
  'pipeline-outcome-config': 'pipeline OutcomeConfig',
  'model-lineage-outcome-config': 'newest model OutcomeConfig',
  'target-name-polarity': 'target-name polarity',
};

/** Legacy-pipeline mapping rules for the pipeline migration. */
export class LegacyPipelines {
  private static readObject(json: string | null): JsonObject | null {
    const r = JsonParse.ParseJsonText(json, 'legacy JSON');
    return r.Ok && JsonParse.IsJsonObject(r.Value) ? r.Value : null;
  }

  private static stringList(o: JsonObject | null, key: string): string[] {
    const v = o === null ? null : JsonParse.JsonArrayField(o, key);
    return v === null ? [] : v.filter((x): x is string => typeof x === 'string');
  }

  /** `day` (yyyy-mm-dd) plus `days` whole UTC days. */
  private static addDays(day: string, days: number): string {
    const parsed = UtcDay.ToUtcDay(day);
    if (parsed === null) throw new Error(`"${day}" is not a yyyy-mm-dd day`);
    return UtcDay.UtcDayIso(UtcDay.AddUtcDays(parsed, days));
  }

  private static semanticsFromJson(source: AdverseClassSource, o: JsonObject): LegacyOutcomeSemantics {
    const polarity = JsonParse.JsonString(o, 'Polarity');
    const styles = new Map<string, string>();
    const styleObject = JsonParse.JsonObjectField(o, 'OutcomeStyles');
    for (const key of styleObject === null ? [] : Object.keys(styleObject)) {
      const style = styleObject === null ? null : JsonParse.JsonObjectField(styleObject, key);
      const colour = style === null ? null : JsonParse.JsonString(style, 'BadgeColor');
      if (colour !== null) styles.set(key, colour);
    }
    return { Source: source, Polarity: polarity === 'positive' || polarity === 'adverse' ? polarity : null, Styles: styles };
  }

  /** The pipeline's explicit outcome config, read from the keys the training engine reads, in its order. */
  private static explicitOutcomeConfig(featureSteps: string | null, hyperparameters: string | null): JsonObject | null {
    const steps = LegacyPipelines.readObject(featureSteps);
    const hyper = LegacyPipelines.readObject(hyperparameters);
    for (const [o, key] of [[steps, 'OutcomeConfig'], [steps, 'outcomeConfig'], [hyper, 'OutcomeConfig'], [hyper, 'outcomeConfig']] as const) {
      const found = o === null ? null : JsonParse.JsonObjectField(o, key);
      if (found !== null) return found;
    }
    return null;
  }

  /** The outcome config stored in a model's lineage (`outcomeConfig`, else `OutcomeConfig`). */
  private static lineageOutcomeConfig(lineageJson: string | null): JsonObject | null {
    const lineage = LegacyPipelines.readObject(lineageJson);
    if (lineage === null) return null;
    return JsonParse.JsonObjectField(lineage, 'outcomeConfig') || JsonParse.JsonObjectField(lineage, 'OutcomeConfig');
  }

  /** The declaring sources in precedence order: the pipeline's explicit config, the newest model's lineage, the target name. */
  public static LegacyOutcomeCandidates(i: LegacyOutcomeInputs): readonly LegacyOutcomeSemantics[] {
    const out: LegacyOutcomeSemantics[] = [];
    const explicit = LegacyPipelines.explicitOutcomeConfig(i.FeatureSteps, i.Hyperparameters);
    if (explicit !== null) out.push(LegacyPipelines.semanticsFromJson('pipeline-outcome-config', explicit));
    const fromModel = LegacyPipelines.lineageOutcomeConfig(i.ModelLineage);
    if (fromModel !== null) out.push(LegacyPipelines.semanticsFromJson('model-lineage-outcome-config', fromModel));
    const inferred = ResolveOutcomeConfig({ TargetVariable: i.TargetVariable, ProblemType: i.ProblemType });
    const styles = new Map<string, string>(Object.entries(inferred.OutcomeStyles || {}).map(([name, style]) => [name, style.BadgeColor]));
    out.push({ Source: 'target-name-polarity', Polarity: inferred.Polarity || null, Styles: styles });
    return out;
  }

  /** What one source decides about a binary class order, or null when it does not decide. */
  private static decideFromSource(classOrder: readonly [string, string], c: LegacyOutcomeSemantics): LegacyAdverseClassResult | null {
    const index = (name: string): 0 | 1 => (name === classOrder[0] ? 0 : 1);
    const red = classOrder.filter((k) => c.Styles.get(k) === 'red');
    const [onlyRed] = red;
    if (red.length === 1 && onlyRed !== undefined) return { Kind: 'decided', AdverseIndex: index(onlyRed), Source: c.Source, Evidence: `OutcomeStyles ${onlyRed} red` };
    const green = classOrder.filter((k) => c.Styles.get(k) === 'green');
    const [onlyGreen] = green;
    if (green.length === 1 && onlyGreen !== undefined) {
      return { Kind: 'decided', AdverseIndex: index(onlyGreen) === 0 ? 1 : 0, Source: c.Source, Evidence: `OutcomeStyles ${onlyGreen} green` };
    }
    if (c.Polarity === 'adverse') return { Kind: 'decided', AdverseIndex: 1, Source: c.Source, Evidence: 'Polarity adverse' };
    if (c.Polarity === 'positive') return { Kind: 'decided', AdverseIndex: 0, Source: c.Source, Evidence: 'Polarity positive' };
    return null;
  }

  /**
   * The adverse class of a binary unit from the first source that decides. The legacy score was P(classOrder[1]), so
   * `Polarity: 'adverse'` (higher is worse) makes classOrder[1] adverse and `'positive'` classOrder[0]. Within one
   * source a single red class wins, then a single green class (the other is adverse), then the polarity.
   */
  public static LegacyAdverseClass(classOrder: readonly [string, string], candidates: readonly LegacyOutcomeSemantics[]): LegacyAdverseClassResult {
    for (const c of candidates) {
      const decided = LegacyPipelines.decideFromSource(classOrder, c);
      if (decided !== null) return decided;
    }
    return { Kind: 'undetermined', Reason: ADVERSE_CLASS_HOLD_REASON };
  }

  /** The decision-date column a pipeline's AsOfStrategy names (null for none), or why it gets no unit (no form, or a declared time index). */
  private static decisionColumn(p: LegacyPipelineFields): LegacyDecisionColumn {
    if (p.ProblemType === 'sequence') return { Kind: 'archive', Reason: 'an HMM latent state has no outcome window' };
    const asOf = LegacyPipelines.readObject(p.AsOfStrategy);
    const mode = asOf === null ? 'none' : JsonParse.JsonString(asOf, 'Mode') || 'none';
    if (mode === 'offset') return { Kind: 'archive', Reason: 'offset as-of cannot be expressed as a Prediction Unit' };
    const validation = LegacyPipelines.readObject(p.ValidationStrategy);
    if (validation !== null && JsonParse.JsonString(validation, 'TimeIndexColumn') !== null) return { Kind: 'hold', Reason: TIME_INDEX_HOLD_REASON };
    if (mode !== 'column' || asOf === null) return { Kind: 'column', Column: null };
    const column = JsonParse.JsonString(asOf, 'Column');
    return column === null ? { Kind: 'archive', Reason: 'AsOfStrategy column mode names no column' } : { Kind: 'column', Column: column };
  }

  /** The task of a pipeline's outcome: its observed classes for a classification, else continuous. */
  private static outcomeTask(p: LegacyPipelineFields, distinctLabels: readonly string[], outcome: readonly LegacyOutcomeSemantics[]): LegacyTaskChoice | LegacyStop {
    if (p.ProblemType === 'classification') return LegacyPipelines.classificationTask(distinctLabels, outcome);
    const continuous: TaskType = { kind: 'continuous' };
    return { Kind: 'task', Task: continuous, Semantics: '', Note: 'declared continuous; a count or a non-negative amount is a different task and is declared in a new unit version' };
  }

  /**
   * Version 1 of a pipeline's Prediction Unit: a grain unit on its target entity, decided on its as-of column or on the
   * migration day (advancing each run), labelled by its target column, with the task its outcome maps to.
   */
  public static LegacyUnitInputs(
    p: LegacyPipelineFields,
    distinctLabels: readonly string[],
    migrationDay: string,
    outcome: readonly LegacyOutcomeSemantics[],
  ): LegacyUnitOutcome {
    const decision = LegacyPipelines.decisionColumn(p);
    if (decision.Kind !== 'column') return decision;
    const task = LegacyPipelines.outcomeTask(p, distinctLabels, outcome);
    if (task.Kind !== 'task') return task;
    const column = decision.Column;
    const dateNote = column === null
      ? `decision date = the day of each run, starting ${migrationDay} (advances automatically); features are read as they stand on that day, as the legacy pipeline read them`
      : `decision date = ${column}; the outcome is the row's ${p.TargetVariable} as stored`;
    return {
      Kind: 'unit',
      DateColumn: column,
      Notes: [task.Note, dateNote, 'uncovered history rows are excluded and counted, not refused'],
      Draft: LegacyPipelines.unitDraft(p, column, migrationDay, task),
    };
  }

  /** The unit draft of a pipeline whose decision column and task are known. */
  private static unitDraft(p: LegacyPipelineFields, column: string | null, migrationDay: string, task: LegacyTaskChoice): UnitDraft {
    const decisionDate: DecisionDateRule = column === null ? { kind: 'fixed', date: migrationDay, advance: 'each-run' } : { kind: 'column', column };
    const censoring: CensoringRule = column === null
      ? { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: LegacyPipelines.addDays(migrationDay, 1) } }
      : { rule: 'exclude-unresolved', cutoff: { kind: 'now' } };
    return {
      Name: `${p.Name} — migrated unit`,
      Description: `Created by the Prediction Unit pipeline migration on ${migrationDay} from the pipeline's TargetEntity, TargetVariable, ProblemType and AsOfStrategy${task.Semantics ? `; ${task.Semantics}` : ''}.`,
      UnitRows: { kind: 'grain', grainEntity: p.TargetEntity, decisionDate, filter: [] },
      LabelRule: { kind: 'column', column: p.TargetVariable },
      LabelWindowDays: 1,
      LabelGapDays: 0,
      TaskType: task.Task,
      Censoring: censoring,
      ChangeHistoryPolicy: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' },
      GroupKey: null,
      TemporalSpec: null,
      DecisionSpec: { action: 'review', actorRole: 'analyst', capacityPerPeriod: null, period: 'month' },
      IncumbentHeuristic: { kind: 'none' },
    };
  }

  /**
   * The task of a classification pipeline from its observed labels in ordinal string order — the legacy sidecar's
   * label-encoder order over the labels as text — so P(classOrder[1]) keeps its meaning; binary needs a deciding source.
   */
  private static classificationTask(distinctLabels: readonly string[], outcome: readonly LegacyOutcomeSemantics[]): LegacyTaskChoice | LegacyStop {
    const classes = [...new Set(distinctLabels.map((l) => l.trim()).filter((l) => l.length > 0))].sort();
    const [first, second] = classes;
    if (classes.length < 2 || first === undefined || second === undefined) {
      return { Kind: 'archive', Reason: `single-valued target (${classes.length} class observed)` };
    }
    if (classes.length > 2) return LegacyPipelines.multiclassTask(classes, outcome);
    const adverse = LegacyPipelines.LegacyAdverseClass([first, second], outcome);
    if (adverse.Kind === 'undetermined') return { Kind: 'hold', Reason: adverse.Reason };
    const semantics = `adverse class ${adverse.AdverseIndex === 0 ? first : second} (${SOURCE_LABEL[adverse.Source]}: ${adverse.Evidence})`;
    const task: TaskType = { kind: 'binary', classOrder: [first, second], adverseIndex: adverse.AdverseIndex };
    return { Kind: 'task', Task: task, Semantics: semantics, Note: `class order ${first}, ${second}; ${semantics}` };
  }

  /** Three or more classes: the adverse classes are the ones the first source styling any of them red styles red. */
  private static multiclassTask(classes: readonly string[], outcome: readonly LegacyOutcomeSemantics[]): LegacyTaskChoice {
    const declaring = outcome.find((c) => classes.some((k) => c.Styles.get(k) === 'red'));
    const adverseIndices = declaring === undefined ? [] : classes.flatMap((k, i) => (declaring.Styles.get(k) === 'red' ? [i] : []));
    const semantics = declaring === undefined
      ? 'no adverse classes declared'
      : `adverse classes ${adverseIndices.map((i) => classes[i] || '').join(', ')} (${SOURCE_LABEL[declaring.Source]}: red OutcomeStyles)`;
    const task: TaskType = { kind: 'multiclass', classOrder: classes, adverseIndices };
    return { Kind: 'task', Task: task, Semantics: semantics, Note: `class order ${classes.join(', ')}; ${semantics}` };
  }

  /**
   * The earliest day d whose trailing block (dates on or after d) holds at most `share` of the rows; null when only the
   * first day qualifies (no cutoff would leave development rows).
   */
  public static TrailingShareCutoff(dates: readonly string[], share: number): string | null {
    const days = dates.map((d) => d.slice(0, 10)).sort();
    let best: string | null = null;
    let trailing = 0;
    for (let i = days.length - 1; i >= 1; i--) {
      const d = days[i];
      trailing++;
      if (d === undefined || days[i - 1] === d) continue;   // count the whole day before judging it
      if (trailing / days.length > share) break;
      best = d;
    }
    return best;
  }

  /** The legacy holdout share: LockedHoldoutFraction (0 is a value, so only an absent one takes the default), clamped. */
  private static holdoutShare(v: JsonObject | null): number {
    const fraction = v === null ? null : JsonParse.JsonNumber(v, 'LockedHoldoutFraction');
    const [low, high] = LEGACY_HOLDOUT_SHARE_RANGE;
    return Math.min(high, Math.max(low, fraction === null ? LEGACY_DEFAULT_HOLDOUT_SHARE : fraction));
  }

  /** The holdout over the unit's date column (a cutoff on the rows' dates), or a seeded row hash for a fixed-date unit. */
  private static legacyHoldout(share: number, dateColumn: string | null, dates: readonly string[]): { readonly Holdout: LegacyHoldout; readonly Note: string } | LegacyStop {
    if (dateColumn === null) {
      const note = `test set = a seeded random ${Math.round(share * 100)}% of rows (one decision date per run); the legacy trailing slice in key order is gone`;
      return { Holdout: { kind: 'seeded-random', fraction: share }, Note: note };
    }
    const cutoff = LegacyPipelines.TrailingShareCutoff(dates, share);
    if (cutoff === null) {
      const only = dates[0]?.slice(0, 10) || 'none';
      return { Kind: 'archive', Reason: `every row has the same ${dateColumn} (${only}): no date cutoff leaves development rows` };
    }
    const rows = dates.filter((d) => d.slice(0, 10) >= cutoff).length;
    const note = `test set = rows with ${dateColumn} on or after ${cutoff} (${rows} rows); the legacy trailing slice in key order is gone`;
    return { Holdout: { kind: 'date-carved', dateColumn, cutoff, holdoutEnd: null, newEntityReport: null }, Note: note };
  }

  /** k-fold becomes repeated stratified folds (at least 2); any other strategy takes the protocol default (null). */
  private static innerValidation(v: JsonObject | null): InnerValidation | null {
    if (v === null || JsonParse.JsonString(v, 'Strategy') !== 'kfold') return null;
    const k = JsonParse.JsonNumber(v, 'K');
    return { kind: 'repeated-stratified-kfold', folds: Math.max(2, Math.round(k === null ? 5 : k)), repeats: 3 };
  }

  /**
   * A target cell as a class label, the way the unit row reader labels rows for a classification task: a bit reads
   * `'1'`/`'0'`, a number its text, a date its UTC day, text trimmed; null for an empty cell. (The Engine's
   * `PredictionUnitRowReader.CanonicalLabel` is the reader's own rule; a parity test pins the two together.)
   */
  public static ClassLabel(value: CellValue): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
    if (value instanceof Date) return UtcDay.UtcDayIso(value);
    const t = value.trim();
    return t.length === 0 ? null : t;
  }

  /**
   * Version 1 of a migrated pipeline's protocol: the unit's default protocol for one candidate with the legacy holdout,
   * the legacy k-fold (when it had one) and the legacy deny lists as exclusions.
   */
  public static LegacyProtocolDraft(unit: PredictionUnitSpec, inputs: Extract<LegacyProtocolOutcome, { readonly Kind: 'protocol' }>, name: string): EvaluationProtocolDraft {
    const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: unit, Holdout: inputs.Holdout, Candidates: 1, Seed: LEGACY_PROTOCOL_SEED, Name: name });
    return { ...draft, exclusions: inputs.Exclusions, innerValidation: inputs.InnerValidation === null ? draft.innerValidation : inputs.InnerValidation };
  }

  /**
   * The inputs of a pipeline's version-1 protocol from its ValidationStrategy and LeakageGuard. `dateColumn` null = a
   * fixed-date unit: a seeded-random holdout of the legacy share.
   */
  public static LegacyProtocolInputs(validationJson: string | null, leakageJson: string | null, dateColumn: string | null, dates: readonly string[]): LegacyProtocolOutcome {
    const v = LegacyPipelines.readObject(validationJson);
    const holdout = LegacyPipelines.legacyHoldout(LegacyPipelines.holdoutShare(v), dateColumn, dates);
    if ('Kind' in holdout) return { Kind: 'archive', Reason: holdout.Reason };
    const notes: string[] = v === null ? ['ValidationStrategy missing or unreadable: defaults used.', holdout.Note] : [holdout.Note];
    const guard = LegacyPipelines.readObject(leakageJson);
    const threshold = guard === null ? null : JsonParse.JsonNumber(guard, 'SingleFeatureDominanceThreshold');
    if (threshold !== null) notes.push(`SingleFeatureDominanceThreshold ${threshold} not carried: the held-out single-feature AUC audit replaces it.`);
    return {
      Kind: 'protocol',
      Holdout: holdout.Holdout,
      InnerValidation: LegacyPipelines.innerValidation(v),
      Exclusions: { denyFields: LegacyPipelines.stringList(guard, 'DenyFields'), denySources: LegacyPipelines.stringList(guard, 'DenySources') },
      Notes: notes,
    };
  }
}
