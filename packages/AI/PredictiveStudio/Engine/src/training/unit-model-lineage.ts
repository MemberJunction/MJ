/**
 * @module training/unit-model-lineage
 *
 * The part of `MJ: ML Models.Lineage` a model trained on a Prediction Unit adds, and its validating reader. Training
 * writes it; scoring reads it back to assemble the same typed columns, folded the same way. The reader checks every
 * member (each feature column's source, encoding and missing-value policy field by field), so a stored lineage that
 * drifted from this shape fails loudly instead of being read as something it is not. Unit models carry their
 * Training Snapshot's ID and content hash; a lineage without them is not a unit model this engine can score.
 */
import {
  JsonParse,
  type ColumnEncoding,
  type DatedSource,
  type FeatureColumnSpec,
  type FeatureVersionPin,
  type JsonObject,
  type JsonValue,
  type MissingValuePolicy,
  type ParseResult,
  type RowFilter,
  type WindowedAggregateSource,
} from '@memberjunction/predictive-studio-core';

/**
 * The unit version a model was trained on, the typed feature columns its matrix was assembled from, the kept
 * levels of each categorical column and the Training Snapshot its rows came from.
 */
export interface UnitModelLineage {
  predictionUnitId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  predictionUnitVersion: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  labelVersion: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  featureSpecVersion: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The entity whose records the unit rows are (the entity a scoring scope must hold). */
  unitRowEntity: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The typed columns the matrix was assembled from, in order. */
  featureSpec: FeatureColumnSpec[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The kept levels of each categorical column, by column name; scoring folds every other value into the fold level. */
  categoryLevels: Record<string, string[]>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The `MJ: Training Snapshots` row the model was trained from. */
  trainingSnapshotId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** That snapshot's content hash, so the lineage names the exact rows even if the row were ever re-pointed. */
  snapshotContentHash: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** One validation step: the typed value, or the first problem found (a sentence naming the member's path). */
type Checked<T> = { readonly Ok: true; readonly Value: T } | { readonly Ok: false; readonly Error: string };

const IMPUTES: readonly MissingValuePolicy['impute'][] = ['mean', 'median', 'mode', 'constant'];
const AGGREGATES: readonly WindowedAggregateSource['aggregate'][] = ['count', 'sum', 'mean', 'distinct', 'days-since', 'active-at'];
const FILTER_OPS: readonly RowFilter['op'][] = ['eq', 'neq', 'in', 'not-null', 'is-null'];
const CATEGORICAL_METHODS: readonly Extract<ColumnEncoding, { kind: 'categorical' }>['method'][] = ['onehot', 'hashed', 'target-in-fold'];
const DATE_PARTS: readonly Extract<ColumnEncoding, { kind: 'date-parts' }>['parts'][number][] = ['year', 'month', 'dow', 'days-since-decision'];

/** Reads a stored lineage's unit part. Static members on one owner. */
export class UnitModelLineageParser {
  /**
   * The unit part of a stored `Lineage` text: every member present and of its declared shape, or every problem found
   * (the first names the member's path, e.g. `featureSpec[0].encoding`).
   */
  public static ParseUnitModelLineage(text: string | null | undefined): ParseResult<UnitModelLineage> {
    const parsed = JsonParse.ParseJsonText(text, 'Lineage');
    if (parsed.Ok === false) return JsonParse.ParseFail(...parsed.Errors);
    const checked = UnitModelLineageParser.lineage(parsed.Value);
    return checked.Ok === false ? JsonParse.ParseFail(checked.Error) : JsonParse.ParseOk(checked.Value);
  }

  /**
   * True when a stored `Lineage` text names a Prediction Unit (a `predictionUnitId` member, of any value): the model
   * was trained on a unit, and its Lineage must then pass {@link ParseUnitModelLineage}.
   */
  public static NamesUnit(text: string | null | undefined): boolean {
    const parsed = JsonParse.ParseJsonText(text, 'Lineage');
    return parsed.Ok === true && JsonParse.IsJsonObject(parsed.Value) && 'predictionUnitId' in parsed.Value;
  }

  private static lineage(v: JsonValue): Checked<UnitModelLineage> {
    if (!JsonParse.IsJsonObject(v)) return UnitModelLineageParser.fail('Lineage', 'is not a JSON object');
    const unitId = JsonParse.JsonString(v, 'predictionUnitId');
    if (unitId === null) return UnitModelLineageParser.fail('predictionUnitId', 'is missing or not a non-empty string');
    const versions = UnitModelLineageParser.integers(v, ['predictionUnitVersion', 'labelVersion', 'featureSpecVersion']);
    if (versions.Ok === false) return versions;
    const rowEntity = JsonParse.JsonString(v, 'unitRowEntity');
    if (rowEntity === null) return UnitModelLineageParser.fail('unitRowEntity', 'is missing or not a non-empty string');
    const features = UnitModelLineageParser.featureSpec(v.featureSpec);
    if (features.Ok === false) return features;
    const levels = UnitModelLineageParser.categoryLevels(v.categoryLevels);
    if (levels.Ok === false) return levels;
    const snapshotId = JsonParse.JsonString(v, 'trainingSnapshotId');
    if (snapshotId === null) return UnitModelLineageParser.fail('trainingSnapshotId', 'is missing or not a non-empty string');
    const contentHash = JsonParse.JsonString(v, 'snapshotContentHash');
    if (contentHash === null) return UnitModelLineageParser.fail('snapshotContentHash', 'is missing or not a non-empty string');
    const [unitVersion, labelVersion, specVersion] = versions.Value;
    return UnitModelLineageParser.ok({
      predictionUnitId: unitId, predictionUnitVersion: unitVersion, labelVersion, featureSpecVersion: specVersion,
      unitRowEntity: rowEntity, featureSpec: features.Value, categoryLevels: levels.Value,
      trainingSnapshotId: snapshotId, snapshotContentHash: contentHash,
    });
  }

  private static integers(o: JsonObject, keys: readonly string[]): Checked<number[]> {
    const out: number[] = [];
    for (const k of keys) {
      const n = JsonParse.JsonInteger(o, k);
      if (n === null) return UnitModelLineageParser.fail(k, 'is missing or not an integer');
      out.push(n);
    }
    return UnitModelLineageParser.ok(out);
  }

  private static featureSpec(v: JsonValue | undefined): Checked<FeatureColumnSpec[]> {
    if (!Array.isArray(v)) return UnitModelLineageParser.fail('featureSpec', 'is missing or not an array');
    const out: FeatureColumnSpec[] = [];
    for (let i = 0; i < v.length; i++) {
      const column = UnitModelLineageParser.featureColumn(v[i], `featureSpec[${i}]`);
      if (column.Ok === false) return column;
      out.push(column.Value);
    }
    return UnitModelLineageParser.ok(out);
  }

  private static categoryLevels(v: JsonValue | undefined): Checked<Record<string, string[]>> {
    if (!JsonParse.IsJsonObject(v)) return UnitModelLineageParser.fail('categoryLevels', 'is missing or not an object');
    const out: Record<string, string[]> = {};
    for (const column of Object.keys(v)) {
      const levels = JsonParse.JsonStringArray(v, column);
      if (levels === null) return UnitModelLineageParser.fail(`categoryLevels.${column}`, 'is not an array of strings');
      out[column] = levels;
    }
    return UnitModelLineageParser.ok(out);
  }

  private static featureColumn(v: JsonValue, path: string): Checked<FeatureColumnSpec> {
    if (!JsonParse.IsJsonObject(v)) return UnitModelLineageParser.fail(path, 'is not an object');
    const name = JsonParse.JsonString(v, 'name');
    if (name === null) return UnitModelLineageParser.fail(`${path}.name`, 'is missing or not a non-empty string');
    const source = UnitModelLineageParser.source(v.source, `${path}.source`);
    if (source.Ok === false) return source;
    const encoding = UnitModelLineageParser.encoding(v.encoding, `${path}.encoding`);
    if (encoding.Ok === false) return encoding;
    const missing = UnitModelLineageParser.missing(v.missing, `${path}.missing`);
    if (missing.Ok === false) return missing;
    return UnitModelLineageParser.ok({ name, source: source.Value, encoding: encoding.Value, missing: missing.Value });
  }

  private static source(v: JsonValue | undefined, path: string): Checked<DatedSource> {
    if (!JsonParse.IsJsonObject(v)) return UnitModelLineageParser.fail(path, 'is missing or not an object');
    const kind = v.kind;
    switch (kind) {
      case 'record-changes':
      case 'immutable-field': {
        const entity = JsonParse.JsonString(v, 'entity');
        const field = JsonParse.JsonString(v, 'field');
        const keyField = UnitModelLineageParser.nullableString(v, 'keyField');
        if (entity === null || field === null || keyField === undefined) return UnitModelLineageParser.fail(path, `(${kind}) needs entity, field and keyField (a string or null)`);
        return UnitModelLineageParser.ok({ kind, entity, field, keyField });
      }
      case 'feature-value': return UnitModelLineageParser.featureValueSource(v, path);
      case 'windowed-aggregate': return UnitModelLineageParser.windowedSource(v, path);
      case 'series': return UnitModelLineageParser.seriesSource(v, path);
      default: return UnitModelLineageParser.fail(`${path}.kind`, `is not a known source kind (${JSON.stringify(kind)})`);
    }
  }

  private static featureValueSource(v: JsonObject, path: string): Checked<DatedSource> {
    const featureName = JsonParse.JsonString(v, 'featureName');
    if (featureName === null) return UnitModelLineageParser.fail(`${path}.featureName`, 'is missing or not a non-empty string');
    if (v.pin === null) return UnitModelLineageParser.ok({ kind: 'feature-value', featureName, pin: null });
    const pin = UnitModelLineageParser.pin(v.pin, `${path}.pin`);
    return pin.Ok === false ? pin : UnitModelLineageParser.ok({ kind: 'feature-value', featureName, pin: pin.Value });
  }

  private static pin(v: JsonValue | undefined, path: string): Checked<FeatureVersionPin> {
    if (!JsonParse.IsJsonObject(v)) return UnitModelLineageParser.fail(path, 'is not an object or null');
    const processId = JsonParse.JsonString(v, 'featurePipelineRecordProcessId');
    const pipelineVersion = UnitModelLineageParser.nullableNumber(v, 'pipelineVersion');
    const promptVersionHash = UnitModelLineageParser.nullableString(v, 'promptVersionHash');
    const aiModelId = UnitModelLineageParser.nullableString(v, 'aiModelId');
    const parametersHash = UnitModelLineageParser.nullableString(v, 'parametersHash');
    if (processId === null || pipelineVersion === undefined || promptVersionHash === undefined || aiModelId === undefined || parametersHash === undefined) {
      return UnitModelLineageParser.fail(path, 'needs featurePipelineRecordProcessId and pipelineVersion, promptVersionHash, aiModelId, parametersHash (each a value or null)');
    }
    return UnitModelLineageParser.ok({ featurePipelineRecordProcessId: processId, pipelineVersion, promptVersionHash, aiModelId, parametersHash });
  }

  private static windowedSource(v: JsonObject, path: string): Checked<DatedSource> {
    const childEntity = JsonParse.JsonString(v, 'childEntity');
    const foreignKey = JsonParse.JsonString(v, 'foreignKey');
    const dateField = JsonParse.JsonString(v, 'dateField');
    const ownerKeyField = UnitModelLineageParser.nullableString(v, 'ownerKeyField');
    const endDateField = UnitModelLineageParser.nullableString(v, 'endDateField');
    const voidedAtField = UnitModelLineageParser.nullableString(v, 'voidedAtField');
    const valueField = UnitModelLineageParser.nullableString(v, 'valueField');
    const windowDays = UnitModelLineageParser.nullableNumber(v, 'windowDays');
    const aggregate = AGGREGATES.find((a) => a === v.aggregate);
    if (childEntity === null || foreignKey === null || dateField === null || aggregate === undefined
      || ownerKeyField === undefined || endDateField === undefined || voidedAtField === undefined || valueField === undefined || windowDays === undefined) {
      return UnitModelLineageParser.fail(path, '(windowed-aggregate) needs childEntity, foreignKey, dateField, a known aggregate and ownerKeyField, endDateField, voidedAtField, valueField, windowDays (each a value or null)');
    }
    const filter = UnitModelLineageParser.filters(v.filter, `${path}.filter`);
    if (filter.Ok === false) return filter;
    return UnitModelLineageParser.ok({ kind: 'windowed-aggregate', childEntity, foreignKey, ownerKeyField, dateField, endDateField, voidedAtField, aggregate, valueField, windowDays, filter: filter.Value });
  }

  private static filters(v: JsonValue | undefined, path: string): Checked<RowFilter[]> {
    if (!Array.isArray(v)) return UnitModelLineageParser.fail(path, 'is missing or not an array');
    const out: RowFilter[] = [];
    for (let i = 0; i < v.length; i++) {
      const f = v[i];
      const field = JsonParse.IsJsonObject(f) ? JsonParse.JsonString(f, 'field') : null;
      const op = JsonParse.IsJsonObject(f) ? FILTER_OPS.find((x) => x === f.op) : undefined;
      const values = JsonParse.IsJsonObject(f) ? UnitModelLineageParser.filterValues(f.values) : null;
      if (field === null || op === undefined || values === null) return UnitModelLineageParser.fail(`${path}[${i}]`, 'needs field, a known op and values (strings, numbers or booleans)');
      out.push({ field, op, values });
    }
    return UnitModelLineageParser.ok(out);
  }

  private static filterValues(v: JsonValue | undefined): (string | number | boolean)[] | null {
    if (!Array.isArray(v)) return null;
    const out: (string | number | boolean)[] = [];
    for (const x of v) {
      if (typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean') return null;
      out.push(x);
    }
    return out;
  }

  private static seriesSource(v: JsonObject, path: string): Checked<DatedSource> {
    const feature = JsonParse.JsonObjectField(v, 'feature');
    const index = feature === null ? null : JsonParse.JsonInteger(feature, 'index');
    const kind = feature === null ? undefined : feature.kind;
    if (index === null || (kind !== 'lag' && kind !== 'rolling')) return UnitModelLineageParser.fail(`${path}.feature`, "needs kind 'lag' or 'rolling' and an integer index");
    return UnitModelLineageParser.ok({ kind: 'series', feature: kind === 'lag' ? { kind: 'lag', index } : { kind: 'rolling', index } });
  }

  private static encoding(v: JsonValue | undefined, path: string): Checked<ColumnEncoding> {
    if (!JsonParse.IsJsonObject(v)) return UnitModelLineageParser.fail(path, 'is missing or not an object');
    switch (v.kind) {
      case 'numeric':
        return v.nonNumericValue === 'fail' ? UnitModelLineageParser.ok({ kind: 'numeric', nonNumericValue: 'fail' }) : UnitModelLineageParser.fail(`${path}.nonNumericValue`, "is not 'fail'");
      case 'categorical': {
        const cap = JsonParse.JsonInteger(v, 'cardinalityCap');
        const method = CATEGORICAL_METHODS.find((m) => m === v.method);
        if (cap === null || method === undefined) return UnitModelLineageParser.fail(path, '(categorical) needs an integer cardinalityCap and a known method');
        return UnitModelLineageParser.ok({ kind: 'categorical', cardinalityCap: cap, method });
      }
      case 'date-parts': {
        const parts = JsonParse.JsonStringArray(v, 'parts');
        const known = parts === null ? [] : parts.map((p) => DATE_PARTS.find((d) => d === p));
        if (parts === null || known.some((p) => p === undefined)) return UnitModelLineageParser.fail(`${path}.parts`, 'is not an array of known date parts');
        return UnitModelLineageParser.ok({ kind: 'date-parts', parts: known.filter((p): p is (typeof DATE_PARTS)[number] => p !== undefined) });
      }
      case 'boolean': return UnitModelLineageParser.ok({ kind: 'boolean' });
      case 'identifier':
        return v.policy === 'exclude' ? UnitModelLineageParser.ok({ kind: 'identifier', policy: 'exclude' }) : UnitModelLineageParser.fail(`${path}.policy`, "is not 'exclude'");
      default: return UnitModelLineageParser.fail(`${path}.kind`, `is not a known encoding kind (${JSON.stringify(v.kind)})`);
    }
  }

  private static missing(v: JsonValue | undefined, path: string): Checked<MissingValuePolicy> {
    if (!JsonParse.IsJsonObject(v)) return UnitModelLineageParser.fail(path, 'is missing or not an object');
    const impute = IMPUTES.find((m) => m === v.impute);
    const fill = UnitModelLineageParser.fillValue(v.constant);
    if (impute === undefined || v.indicator !== true || fill === undefined) {
      return UnitModelLineageParser.fail(path, 'needs a known impute, indicator true and constant (a string, a number or null)');
    }
    return UnitModelLineageParser.ok({ impute, indicator: true, constant: fill });
  }

  /** A missing-value fill: a string, a number or null; undefined for anything else. */
  private static fillValue(v: JsonValue | undefined): string | number | null | undefined {
    if (v === null) return null;
    if (typeof v === 'string' || typeof v === 'number') return v;
    return undefined;
  }

  /** A string or null; undefined when the member is absent or of another type. */
  private static nullableString(o: JsonObject, key: string): string | null | undefined {
    const v = o[key];
    if (v === null) return null;
    return typeof v === 'string' ? v : undefined;
  }

  /** A finite number or null; undefined when the member is absent or of another type. */
  private static nullableNumber(o: JsonObject, key: string): number | null | undefined {
    const v = o[key];
    if (v === null) return null;
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }

  private static ok<T>(value: T): Checked<T> {
    return { Ok: true, Value: value };
  }

  private static fail<T>(path: string, problem: string): Checked<T> {
    return { Ok: false, Error: `${path} ${problem}` };
  }
}
