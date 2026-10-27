/**
 * @module prediction-unit
 *
 * The Prediction Unit: what one training row is, its decision date, the outcome rule and window, censoring,
 * task type, Temporal Spec, decision and incumbent heuristic. These are the persisted JSON shapes of the
 * `MJ: Prediction Units` columns and their browser-safe parser. A unit version is immutable; the Temporal
 * Spec is part of the row and versioned with it.
 */
import { UUIDsEqual } from '@memberjunction/global';
import {
  JsonParse,
  type JsonObject, type JsonValue, type ParseResult,
} from './json-value';
import { TaskTypeRules, type TaskKind, type TaskType } from './task-type';

export type DecisionDateRule =
  | { readonly kind: 'column'; readonly column: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'column-offset'; readonly column: string; readonly offsetDays: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** One decision date for every row (cross-sectional data). `advance: 'each-run'` = before each run the engine saves the
   *  next unit version with the run's UTC day as the date; absent = the date never moves. */
  | { readonly kind: 'fixed'; readonly date: string; readonly advance?: 'each-run' };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export interface RowFilter {
  readonly field: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly op: 'eq' | 'neq' | 'in' | 'not-null' | 'is-null';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly values: readonly (string | number | boolean)[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export type UnitRows =
  | { readonly kind: 'grain'; readonly grainEntity: string; readonly decisionDate: DecisionDateRule; readonly filter: readonly RowFilter[] }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | {
      readonly kind: 'grain-x-periods';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly grainEntity: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly childEntity: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly foreignKey: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly periodDate: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly filter: readonly RowFilter[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    };

export type LabelRule =
  | { readonly kind: 'column'; readonly column: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'next-period'; readonly periodIndexField: string; readonly offset: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | {
      readonly kind: 'child-event';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly childEntity: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly foreignKey: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      /** Field on the unit row whose value the child's foreign key matches; null = the row's entity key. */
      readonly ownerKeyField: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly dateField: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly aggregate: 'exists' | 'count' | 'sum';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly valueField: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly filter: readonly RowFilter[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    };

export type CensoringCutoff =
  | { readonly kind: 'corpus-end'; readonly entity: string; readonly field: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'now' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'fixed'; readonly at: string };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export interface CensoringRule {
  readonly rule: 'exclude-unresolved';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly cutoff: CensoringCutoff;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface ChangeHistoryPolicy {
  readonly onUncoveredRow: 'refuse' | 'exclude-and-count';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly externalSourceRows: 'as-of-detection-time' | 'ineligible';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface TemporalSpec {
  readonly timeColumn: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly horizonPeriods: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly lags: readonly number[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly rollingWindows: readonly { readonly endLag: number; readonly periods: number; readonly aggregate: 'mean' | 'sum' | 'min' | 'max' }[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly period: 'day' | 'week' | 'month' | 'year';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly seasonality: number | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface DecisionSpec {
  readonly action: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly actorRole: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly capacityPerPeriod: number | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly period: 'day' | 'week' | 'month' | 'quarter' | 'year';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export type IncumbentHeuristic = { readonly kind: 'none' } | { readonly kind: 'rule'; readonly name: string; readonly scoreExpression: string };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

/**
 * Who authored a version or started an action — data, never a permission by itself. `human` is a user; `agent`,
 * `scheduled-job` and `system` are the automated authors, and every rule in this PR accepts them unless a protocol
 * opts into `GuardFieldsEditableBy: 'human-only'`. The publish record adds the `automated-gate` approver
 * (an automatic publish).
 */
export type Actor =
  | { readonly kind: 'human'; readonly userId: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'agent'; readonly agentRunId: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'scheduled-job'; readonly scheduledJobRunId: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'system'; readonly component: string };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

/** The `MJ: Prediction Units` columns the parser reads (the generated entity satisfies this structurally). */
export interface PredictionUnitColumns {
  ID: string;
  LineageRootID: string;
  Version: number;
  Name: string;
  UnitRows: string;
  LabelRule: string;
  LabelWindowDays: number;
  LabelGapDays: number;
  TaskType: string;
  LabelVersion: number;
  Censoring: string;
  ChangeHistoryPolicy: string;
  GroupKey: string | null;
  TemporalSpec: string | null;
  DecisionSpec: string;
  IncumbentHeuristic: string;
  AuthoredBy: string;
}

export interface PredictionUnitSpec {
  readonly id: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly lineageRootId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly version: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly name: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly rows: UnitRows;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly label: { readonly rule: LabelRule; readonly windowDays: number; readonly gapDays: number; readonly outcome: TaskType; readonly labelVersion: number };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly censoring: CensoringRule;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly history: ChangeHistoryPolicy;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly groupKey: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly temporal: TemporalSpec | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly decision: DecisionSpec;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly incumbent: IncumbentHeuristic;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly authoredBy: Actor;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export type UnitRefusal =
  | { readonly kind: 'single-valued-target'; readonly value: string; readonly rows: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'task-type-mismatch'; readonly declared: TaskKind; readonly observed: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'unresolved-reference'; readonly entity: string; readonly field: string | null }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'lag-inside-horizon'; readonly lag: number; readonly horizonPeriods: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'rolling-window-inside-horizon'; readonly endLag: number; readonly horizonPeriods: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'missing-decision-date'; readonly entity: string; readonly rows: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'no-resolved-rows'; readonly censored: number; readonly labelKnown: number; readonly emptyLabel: number };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export type UnitValidation =
  | { readonly status: 'valid'; readonly observedLevels: number; readonly eligibleRows: number; readonly censoredRows: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly status: 'refused'; readonly reason: UnitRefusal };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Prediction Unit's parser and derivations: parse a unit row, name its row entity, describe its label rule,
 * detect an outcome-definition change and list the fields it references (static members on one owner class).
 */
export class PredictionUnit {
  /** Parse every JSON column of a unit row and check the cross-field rules; all problems are reported. */
  public static ParsePredictionUnitRow(row: PredictionUnitColumns): ParseResult<PredictionUnitSpec> {
    const errors: string[] = [];
    const json = (text: string | null, column: string): JsonValue | null => {
      const r = JsonParse.ParseJsonText(text, column);
      if (r.Ok === false) {
        errors.push(...r.Errors);
        return null;
      }
      return r.Value;
    };
    const rows = PredictionUnit.parseUnitRows(json(row.UnitRows, 'UnitRows'), errors);
    const rule = PredictionUnit.parseLabelRule(json(row.LabelRule, 'LabelRule'), errors);
    const taskJson = json(row.TaskType, 'TaskType');
    const task = taskJson === null ? null : PredictionUnit.collect(TaskTypeRules.ParseTaskType(taskJson), errors);
    const censoring = PredictionUnit.parseCensoring(json(row.Censoring, 'Censoring'), errors);
    const history = PredictionUnit.parseHistoryPolicy(json(row.ChangeHistoryPolicy, 'ChangeHistoryPolicy'), errors);
    const temporal = row.TemporalSpec === null || row.TemporalSpec.trim().length === 0 ? null : PredictionUnit.parseTemporalSpec(json(row.TemporalSpec, 'TemporalSpec'), errors);
    const decision = PredictionUnit.parseDecisionSpec(json(row.DecisionSpec, 'DecisionSpec'), errors);
    const incumbent = PredictionUnit.parseIncumbent(json(row.IncumbentHeuristic, 'IncumbentHeuristic'), errors);
    const authoredBy = PredictionUnit.parseActor(json(row.AuthoredBy, 'AuthoredBy'), errors);
    PredictionUnit.checkScalarColumns(row, errors);
    if (rule?.kind === 'next-period' && rows !== null && rows.kind !== 'grain-x-periods') errors.push('LabelRule next-period requires UnitRows kind grain-x-periods');
    if (task?.kind === 'forecast' && temporal === null) errors.push('A forecast task requires a TemporalSpec');

    if (errors.length > 0 || rows === null || rule === null || task === null || censoring === null || history === null || decision === null || incumbent === null || authoredBy === null) {
      return { Ok: false, Errors: errors.length > 0 ? errors : ['Prediction Unit row is incomplete'] };
    }
    return {
      Ok: true,
      Value: {
        id: row.ID,
        lineageRootId: row.LineageRootID,
        version: row.Version,
        name: row.Name,
        rows,
        label: { rule, windowDays: row.LabelWindowDays, gapDays: row.LabelGapDays, outcome: task, labelVersion: row.LabelVersion },
        censoring,
        history,
        groupKey: row.GroupKey,
        temporal,
        decision,
        incumbent,
        authoredBy,
      },
    };
  }

  /** The entity whose rows are the unit's rows. */
  public static UnitRowEntityName(rows: UnitRows): string {
    return rows.kind === 'grain' ? rows.grainEntity : rows.childEntity;
  }

  /** The text written to the legacy `TargetVariable` column. */
  public static DescribeLabelRule(spec: PredictionUnitSpec): string {
    const rule = spec.label.rule;
    const window = `within ${spec.label.windowDays} days${spec.label.gapDays > 0 ? ` after a ${spec.label.gapDays}-day gap` : ''}`;
    switch (rule.kind) {
      case 'column':
        return `${rule.column} ${window}`;
      case 'next-period':
        return `next period (${rule.periodIndexField} + ${rule.offset}) ${window}`;
      case 'child-event':
        return `${rule.aggregate} of ${rule.childEntity}.${rule.valueField || rule.dateField} ${window}`;
    }
  }

  /** True when the outcome definition (rule, window, gap or task type) differs — the LabelVersion must then be bumped. */
  public static LabelDefinitionChanged(previous: PredictionUnitSpec, next: PredictionUnitSpec): boolean {
    const key = (s: PredictionUnitSpec): string => JSON.stringify([s.label.rule, s.label.windowDays, s.label.gapDays, s.label.outcome]);
    return key(previous) !== key(next);
  }

  /** Every entity (and field, where one is named) the unit refers to — checked against metadata at save. */
  public static UnitReferencedFields(spec: PredictionUnitSpec): readonly { readonly entity: string; readonly field: string | null }[] {
    const out: { entity: string; field: string | null }[] = [];
    const rowEntity = PredictionUnit.UnitRowEntityName(spec.rows);
    out.push({ entity: spec.rows.grainEntity, field: null });
    if (spec.rows.kind === 'grain') {
      if (spec.rows.decisionDate.kind !== 'fixed') out.push({ entity: rowEntity, field: spec.rows.decisionDate.column });
    } else {
      out.push({ entity: rowEntity, field: spec.rows.foreignKey }, { entity: rowEntity, field: spec.rows.periodDate });
    }
    for (const f of spec.rows.filter) out.push({ entity: rowEntity, field: f.field });
    const rule = spec.label.rule;
    if (rule.kind === 'column') out.push({ entity: rowEntity, field: rule.column });
    if (rule.kind === 'next-period') out.push({ entity: rowEntity, field: rule.periodIndexField });
    if (rule.kind === 'child-event') {
      out.push({ entity: rule.childEntity, field: rule.foreignKey }, { entity: rule.childEntity, field: rule.dateField });
      if (rule.valueField) out.push({ entity: rule.childEntity, field: rule.valueField });
      if (rule.ownerKeyField) out.push({ entity: rowEntity, field: rule.ownerKeyField });
    }
    if (spec.censoring.cutoff.kind === 'corpus-end') out.push({ entity: spec.censoring.cutoff.entity, field: spec.censoring.cutoff.field });
    if (spec.groupKey) out.push({ entity: rowEntity, field: spec.groupKey });
    if (spec.temporal) out.push({ entity: rowEntity, field: spec.temporal.timeColumn });
    return out;
  }

  /** The non-JSON column rules: version and lineage root, label version, window, gap and group key. */
  private static checkScalarColumns(row: PredictionUnitColumns, errors: string[]): void {
    // Case-insensitive: SQL Server returns upper-case UUIDs, PostgreSQL lower-case.
    const isOwnRoot = UUIDsEqual(row.LineageRootID, row.ID);
    if (!Number.isInteger(row.Version) || row.Version < 1) errors.push(`Version must be an integer >= 1 (${row.Version})`);
    if (row.Version === 1 && !isOwnRoot) errors.push('Version 1 must be its own lineage root (LineageRootID = ID)');
    if (row.Version > 1 && isOwnRoot) errors.push('A version above 1 must point at version 1 of its lineage, not at itself');
    if (row.LabelVersion < 1 || row.LabelVersion > row.Version) errors.push(`LabelVersion must be between 1 and Version (${row.LabelVersion} > ${row.Version})`);
    if (!Number.isInteger(row.LabelWindowDays) || row.LabelWindowDays <= 0) errors.push('LabelWindowDays must be a positive integer');
    if (!Number.isInteger(row.LabelGapDays) || row.LabelGapDays < 0) errors.push('LabelGapDays must be an integer >= 0');
    if (row.GroupKey !== null && row.GroupKey.trim().length === 0) errors.push('GroupKey must be NULL or a field name');
  }

  private static collect<T>(r: ParseResult<T>, errors: string[]): T | null {
    if (r.Ok === true) return r.Value;
    errors.push(...r.Errors);
    return null;
  }

  private static parseDecisionDate(v: JsonObject | null, errors: string[]): DecisionDateRule | null {
    if (v === null) {
      errors.push('UnitRows.decisionDate must be an object');
      return null;
    }
    const kind = JsonParse.JsonString(v, 'kind');
    if (kind === 'column') {
      const column = JsonParse.JsonString(v, 'column');
      if (column) return { kind, column };
    } else if (kind === 'column-offset') {
      const column = JsonParse.JsonString(v, 'column');
      const offsetDays = JsonParse.JsonInteger(v, 'offsetDays');
      if (column && offsetDays !== null) return { kind, column, offsetDays };
    } else if (kind === 'fixed') {
      const date = JsonParse.JsonString(v, 'date');
      const advance = v['advance'];
      if (date && ISO_DATE.test(date) && advance === undefined) return { kind, date };
      if (date && ISO_DATE.test(date) && advance === 'each-run') return { kind, date, advance };
    }
    errors.push('UnitRows.decisionDate must be {kind:"column",column}, {kind:"column-offset",column,offsetDays} or {kind:"fixed",date:"yyyy-mm-dd",advance?:"each-run"}');
    return null;
  }

  private static parseFilters(v: JsonValue[] | null, where: string, errors: string[]): RowFilter[] {
    if (v === null) return [];
    const out: RowFilter[] = [];
    for (const item of v) {
      if (!JsonParse.IsJsonObject(item)) {
        errors.push(`${where} filter entries must be objects`);
        continue;
      }
      const field = JsonParse.JsonString(item, 'field');
      const op = JsonParse.JsonString(item, 'op');
      const rawValues = JsonParse.JsonArrayField(item, 'values') || [];
      const values: (string | number | boolean)[] = [];
      for (const x of rawValues) {
        if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') values.push(x);
      }
      if (!field || (op !== 'eq' && op !== 'neq' && op !== 'in' && op !== 'not-null' && op !== 'is-null')) {
        errors.push(`${where} filter needs a field and an op of eq, neq, in, not-null or is-null`);
        continue;
      }
      if ((op === 'eq' || op === 'neq') && values.length !== 1) errors.push(`${where} filter ${field} ${op} needs exactly one value`);
      if (op === 'in' && values.length === 0) errors.push(`${where} filter ${field} in needs at least one value`);
      out.push({ field, op, values });
    }
    return out;
  }

  private static parseUnitRows(v: JsonValue | null, errors: string[]): UnitRows | null {
    if (v === null) return null;
    if (!JsonParse.IsJsonObject(v)) {
      errors.push('UnitRows must be a JSON object');
      return null;
    }
    const kind = JsonParse.JsonString(v, 'kind');
    const grainEntity = JsonParse.JsonString(v, 'grainEntity');
    const filter = PredictionUnit.parseFilters(JsonParse.JsonArrayField(v, 'filter'), 'UnitRows', errors);
    if (kind === 'grain' && grainEntity) {
      const decisionDate = PredictionUnit.parseDecisionDate(JsonParse.JsonObjectField(v, 'decisionDate'), errors);
      return decisionDate ? { kind, grainEntity, decisionDate, filter } : null;
    }
    if (kind === 'grain-x-periods' && grainEntity) {
      const childEntity = JsonParse.JsonString(v, 'childEntity');
      const foreignKey = JsonParse.JsonString(v, 'foreignKey');
      const periodDate = JsonParse.JsonString(v, 'periodDate');
      if (childEntity && foreignKey && periodDate) return { kind, grainEntity, childEntity, foreignKey, periodDate, filter };
    }
    errors.push('UnitRows must be {kind:"grain", grainEntity, decisionDate, filter} or {kind:"grain-x-periods", grainEntity, childEntity, foreignKey, periodDate, filter}');
    return null;
  }

  private static parseLabelRule(v: JsonValue | null, errors: string[]): LabelRule | null {
    if (v === null) return null;
    if (!JsonParse.IsJsonObject(v)) {
      errors.push('LabelRule must be a JSON object');
      return null;
    }
    const kind = JsonParse.JsonString(v, 'kind');
    if (kind === 'column') {
      const column = JsonParse.JsonString(v, 'column');
      if (column) return { kind, column };
    } else if (kind === 'next-period') {
      const periodIndexField = JsonParse.JsonString(v, 'periodIndexField');
      const offset = JsonParse.JsonInteger(v, 'offset');
      if (periodIndexField && offset !== null && offset >= 1) return { kind, periodIndexField, offset };
    } else if (kind === 'child-event') {
      const childEntity = JsonParse.JsonString(v, 'childEntity');
      const foreignKey = JsonParse.JsonString(v, 'foreignKey');
      const dateField = JsonParse.JsonString(v, 'dateField');
      const aggregate = JsonParse.JsonString(v, 'aggregate');
      const valueField = JsonParse.JsonString(v, 'valueField');
      if (childEntity && foreignKey && dateField && (aggregate === 'exists' || aggregate === 'count' || aggregate === 'sum')) {
        if (aggregate === 'sum' && !valueField) {
          errors.push('LabelRule child-event sum needs a valueField');
          return null;
        }
        return {
          kind, childEntity, foreignKey, dateField, aggregate, valueField,
          ownerKeyField: JsonParse.JsonString(v, 'ownerKeyField'),
          filter: PredictionUnit.parseFilters(JsonParse.JsonArrayField(v, 'filter'), 'LabelRule', errors),
        };
      }
    }
    errors.push('LabelRule must be {kind:"column",column}, {kind:"next-period",periodIndexField,offset>=1} or {kind:"child-event",childEntity,foreignKey,dateField,aggregate,valueField,ownerKeyField,filter}');
    return null;
  }

  private static parseCensoring(v: JsonValue | null, errors: string[]): CensoringRule | null {
    if (v === null) return null;
    const cutoff = JsonParse.IsJsonObject(v) && JsonParse.JsonString(v, 'rule') === 'exclude-unresolved' ? JsonParse.JsonObjectField(v, 'cutoff') : null;
    if (cutoff !== null) {
      const kind = JsonParse.JsonString(cutoff, 'kind');
      if (kind === 'now') return { rule: 'exclude-unresolved', cutoff: { kind } };
      if (kind === 'fixed') {
        const at = JsonParse.JsonString(cutoff, 'at');
        if (at && ISO_DATE.test(at)) return { rule: 'exclude-unresolved', cutoff: { kind, at } };
      }
      if (kind === 'corpus-end') {
        const entity = JsonParse.JsonString(cutoff, 'entity');
        const field = JsonParse.JsonString(cutoff, 'field');
        if (entity && field) return { rule: 'exclude-unresolved', cutoff: { kind, entity, field } };
      }
    }
    errors.push('Censoring must be {rule:"exclude-unresolved", cutoff} with cutoff {kind:"corpus-end",entity,field}, {kind:"now"} or {kind:"fixed",at:"yyyy-mm-dd"}');
    return null;
  }

  private static parseHistoryPolicy(v: JsonValue | null, errors: string[]): ChangeHistoryPolicy | null {
    if (v === null) return null;
    if (JsonParse.IsJsonObject(v)) {
      const onUncoveredRow = JsonParse.JsonString(v, 'onUncoveredRow');
      const externalSourceRows = JsonParse.JsonString(v, 'externalSourceRows');
      if ((onUncoveredRow === 'refuse' || onUncoveredRow === 'exclude-and-count') && (externalSourceRows === 'as-of-detection-time' || externalSourceRows === 'ineligible')) {
        return { onUncoveredRow, externalSourceRows };
      }
    }
    errors.push('ChangeHistoryPolicy must be {onUncoveredRow:"refuse"|"exclude-and-count", externalSourceRows:"as-of-detection-time"|"ineligible"}');
    return null;
  }

  private static parseTemporalSpec(v: JsonValue | null, errors: string[]): TemporalSpec | null {
    if (v === null) return null;
    if (!JsonParse.IsJsonObject(v)) {
      errors.push('TemporalSpec must be a JSON object');
      return null;
    }
    const timeColumn = JsonParse.JsonString(v, 'timeColumn');
    const horizon = JsonParse.JsonInteger(v, 'horizonPeriods');
    const lags = JsonParse.JsonIntegerArray(v, 'lags');
    const period = JsonParse.JsonString(v, 'period');
    const seasonality = v['seasonality'] === null ? null : JsonParse.JsonInteger(v, 'seasonality');
    const windowsRaw = JsonParse.JsonArrayField(v, 'rollingWindows') || [];
    const before = errors.length;
    if (!timeColumn) errors.push('TemporalSpec.timeColumn is required');
    if (horizon === null || horizon < 1) errors.push('TemporalSpec.horizonPeriods must be an integer >= 1');
    if (lags === null) errors.push('TemporalSpec.lags must be an array of integers');
    if (period !== 'day' && period !== 'week' && period !== 'month' && period !== 'year') errors.push('TemporalSpec.period must be day, week, month or year');
    const rollingWindows: { endLag: number; periods: number; aggregate: 'mean' | 'sum' | 'min' | 'max' }[] = [];
    for (const w of windowsRaw) {
      const endLag = JsonParse.IsJsonObject(w) ? JsonParse.JsonInteger(w, 'endLag') : null;
      const periods = JsonParse.IsJsonObject(w) ? JsonParse.JsonInteger(w, 'periods') : null;
      const aggregate = JsonParse.IsJsonObject(w) ? JsonParse.JsonString(w, 'aggregate') : null;
      if (endLag === null || periods === null || periods < 1 || (aggregate !== 'mean' && aggregate !== 'sum' && aggregate !== 'min' && aggregate !== 'max')) {
        errors.push('TemporalSpec.rollingWindows entries need endLag, periods >= 1 and aggregate mean|sum|min|max');
        continue;
      }
      rollingWindows.push({ endLag, periods, aggregate });
    }
    if (horizon !== null && lags !== null) {
      for (const lag of lags) if (lag < horizon) errors.push(`TemporalSpec lag ${lag} is inside the horizon of ${horizon} periods (lag-inside-horizon)`);
      for (const w of rollingWindows) if (w.endLag < horizon) errors.push(`TemporalSpec rolling window endLag ${w.endLag} is inside the horizon of ${horizon} periods (rolling-window-inside-horizon)`);
    }
    if (errors.length > before || !timeColumn || horizon === null || lags === null || (period !== 'day' && period !== 'week' && period !== 'month' && period !== 'year')) return null;
    return { timeColumn, horizonPeriods: horizon, lags, rollingWindows, period, seasonality };
  }

  private static parseDecisionSpec(v: JsonValue | null, errors: string[]): DecisionSpec | null {
    if (v === null) return null;
    if (JsonParse.IsJsonObject(v)) {
      const action = JsonParse.JsonString(v, 'action');
      const actorRole = JsonParse.JsonString(v, 'actorRole');
      const capacity = v['capacityPerPeriod'] === null ? null : JsonParse.JsonInteger(v, 'capacityPerPeriod');
      const period = JsonParse.JsonString(v, 'period');
      if (action && actorRole && (period === 'day' || period === 'week' || period === 'month' || period === 'quarter' || period === 'year') && (capacity === null || capacity > 0)) {
        return { action, actorRole, capacityPerPeriod: capacity, period };
      }
    }
    errors.push('DecisionSpec must be {action, actorRole, capacityPerPeriod (null or > 0), period day|week|month|quarter|year}');
    return null;
  }

  private static parseIncumbent(v: JsonValue | null, errors: string[]): IncumbentHeuristic | null {
    if (v === null) return null;
    if (JsonParse.IsJsonObject(v)) {
      const kind = JsonParse.JsonString(v, 'kind');
      if (kind === 'none') return { kind };
      const name = JsonParse.JsonString(v, 'name');
      const scoreExpression = JsonParse.JsonString(v, 'scoreExpression');
      if (kind === 'rule' && name && scoreExpression) return { kind, name, scoreExpression };
    }
    errors.push('IncumbentHeuristic must be {kind:"none"} or {kind:"rule", name, scoreExpression}');
    return null;
  }

  private static parseActor(v: JsonValue | null, errors: string[]): Actor | null {
    if (v === null) return null;
    if (JsonParse.IsJsonObject(v)) {
      const kind = JsonParse.JsonString(v, 'kind');
      const userId = JsonParse.JsonString(v, 'userId');
      const agentRunId = JsonParse.JsonString(v, 'agentRunId');
      const scheduledJobRunId = JsonParse.JsonString(v, 'scheduledJobRunId');
      const component = JsonParse.JsonString(v, 'component');
      if (kind === 'human' && userId) return { kind, userId };
      if (kind === 'agent' && agentRunId) return { kind, agentRunId };
      if (kind === 'scheduled-job' && scheduledJobRunId) return { kind, scheduledJobRunId };
      if (kind === 'system' && component) return { kind, component };
    }
    errors.push('AuthoredBy must be an Actor: {kind:"human",userId}, {kind:"agent",agentRunId}, {kind:"scheduled-job",scheduledJobRunId} or {kind:"system",component}');
    return null;
  }
}