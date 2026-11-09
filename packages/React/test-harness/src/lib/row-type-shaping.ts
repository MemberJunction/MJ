/**
 * Explorer-shaped RunView rows for components under test.
 *
 * In MJ Explorer, `ProviderBase.NormalizeSimpleRowTypes` turns the date and number fields of
 * `'simple'` rows into `Date` and `number`, and `'entity_object'` rows are `BaseEntity` objects
 * whose fields are prototype getters. Rows cross the Playwright boundary as JSON, so without
 * this a component passed in the harness against ISO strings and plain objects
 * (`String(row.SentDate).startsWith('2026-09')`, entity rows spread into a grid) and then broke
 * in Explorer.
 *
 * The work is split across the boundary:
 * - Node side, {@link WithRowTypeHints} names the date and number fields of the view's entity
 *   (from entity metadata, which the page does not have in full) on a copy of the result.
 * - Page side, the normalizer built by {@link CreateRunViewResultNormalizer} converts the cells
 *   and, for `'entity_object'`, wraps each row in a getter-only object.
 *
 * RunQuery results are left alone: MJ does not normalize query rows either.
 */
import { TypeScriptTypeFromSQLType } from '@memberjunction/core';

/** Result property the hints travel under. The page-side normalizer removes it. */
export const ROW_TYPE_HINTS_KEY = '__mjRowTypeHints';

/** Which row keys hold dates and numbers, and the CodeName → Name map for entity rows. */
export interface RowTypeHints {
  /** Keys of date fields: each field's Name, plus its CodeName when that differs. */
  DateKeys: string[];
  /** Keys of numeric fields, keyed as {@link DateKeys}. */
  NumberKeys: string[];
  /** CodeName → Name for fields whose CodeName differs, so `row.CodeName` reads the Name key. */
  CodeNames: Record<string, string>;
}

/**
 * The field properties the hints read. Structural so it accepts both `EntityFieldInfo`
 * instances and the plain-object metadata a remote utilities implementation may supply.
 */
export interface RowTypeHintField {
  Name: string;
  CodeName?: string;
  Type?: string;
  /** `EntityFieldInfo.TSType`; derived from {@link Type} when absent. */
  TSType?: string;
}

/** The entity properties the hints read. */
export interface RowTypeHintEntity {
  Name: string;
  Fields: RowTypeHintField[];
}

/** The RunView params the hints read. */
export interface RowTypeHintParams {
  EntityName?: string;
  ResultType?: string;
}

/** The page-side functions the harness exposes for RunView / RunViews (see `exposeMJUtilities`). */
export interface RunViewBridge {
  __mjRunView: (params: RowTypeHintParams) => Promise<HintedRunViewResult>;  // case-violation-ok-legacy-back-compat: the window global the page script calls by this name
  __mjRunViews: (params: RowTypeHintParams[]) => Promise<HintedRunViewResult[]>;  // case-violation-ok-legacy-back-compat: the window global the page script calls by this name
}

/** A RunView result as it crosses to the page, possibly carrying hints. */
export interface HintedRunViewResult {
  Success?: boolean;
  Results?: Array<Record<string, unknown>>;
  [ROW_TYPE_HINTS_KEY]?: RowTypeHints;
}

/** The field's TS type: `TSType` when present, else derived from the SQL type as MJ does. */
function fieldTSType(field: RowTypeHintField): string | undefined {
  if (typeof field.TSType === 'string' && field.TSType.length > 0) return field.TSType;
  return typeof field.Type === 'string' && field.Type.length > 0 ? TypeScriptTypeFromSQLType(field.Type) : undefined;
}

function findEntity(entities: RowTypeHintEntity[], entityName: string): RowTypeHintEntity | undefined {
  const wanted = entityName.trim().toLowerCase();
  return entities.find(e => typeof e?.Name === 'string' && e.Name.trim().toLowerCase() === wanted);
}

/**
 * The date and number keys of the view's entity, or null when the params name no entity
 * (a view run by ViewID/ViewName) or the entity is not in the metadata.
 */
export function BuildRowTypeHints(
  entities: RowTypeHintEntity[] | undefined,
  params: RowTypeHintParams | undefined
): RowTypeHints | null {
  const entityName = typeof params?.EntityName === 'string' ? params.EntityName : '';
  if (!entityName.trim() || !Array.isArray(entities)) return null;
  const entity = findEntity(entities, entityName);
  if (!entity || !Array.isArray(entity.Fields)) return null;

  const hints: RowTypeHints = { DateKeys: [], NumberKeys: [], CodeNames: {} };
  for (const field of entity.Fields) {
    if (typeof field?.Name !== 'string') continue;
    const hasDistinctCodeName = !!field.CodeName && field.CodeName !== field.Name;
    const keys = hasDistinctCodeName ? [field.Name, field.CodeName as string] : [field.Name];
    if (hasDistinctCodeName) hints.CodeNames[field.CodeName as string] = field.Name;
    const tsType = fieldTSType(field);
    if (tsType === 'Date') hints.DateKeys.push(...keys);
    else if (tsType === 'number') hints.NumberKeys.push(...keys);
  }
  return hints;
}

/**
 * A copy of a successful view result carrying the hints. The original, which the data-access
 * record was built from, is not modified. Failed and count-only results are returned as-is.
 */
export function WithRowTypeHints<T extends { Success?: boolean; Results?: unknown[] }>(
  result: T,
  entities: RowTypeHintEntity[] | undefined,
  params: RowTypeHintParams | undefined
): T | (T & HintedRunViewResult) {
  if (!result || result.Success !== true || !Array.isArray(result.Results) || params?.ResultType === 'count_only') {
    return result;
  }
  const hints = BuildRowTypeHints(entities, params);
  return hints ? { ...result, [ROW_TYPE_HINTS_KEY]: hints } : result;
}

/** The page-side normalizer: shapes one RunView result in place and returns it. */
export type RunViewResultNormalizer = (
  params: RowTypeHintParams | undefined,
  result: HintedRunViewResult | null | undefined
) => HintedRunViewResult | null | undefined;

/**
 * Builds the page-side normalizer. It runs in the browser, so it is injected by source
 * (`(${CreateRunViewResultNormalizer})(key)`) and must stay self-contained: it may not reference
 * anything outside its own body, which is why the hints key is a parameter.
 *
 * - Date fields become `Date` and numeric strings become numbers, with the per-cell rules of
 *   `ProviderBase.NormalizeSimpleRowTypes`: NULLs and unparseable values are left as they are,
 *   and unsafe-range integer strings (PostgreSQL BIGINTs) stay strings.
 * - `'entity_object'` rows become objects whose fields are prototype getters with no own
 *   properties, so `{...row}`, `Object.keys(row)` and `JSON.stringify(row)` lose them exactly as
 *   with a `BaseEntity`, while `row.Field`, `Get()`, `Set()` and `GetAll()` work.
 */
export function CreateRunViewResultNormalizer(hintsKey: string): RunViewResultNormalizer {
  type Row = Record<string, unknown>;

  const parseDateCell = (value: unknown): Date | null => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const parseNumberCell = (value: unknown): number | null => {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Number.isInteger(num) && !Number.isSafeInteger(num) ? null : num;
  };
  const normalizeRowTypes = (row: Row, hints: RowTypeHints): void => {
    for (const key of hints.DateKeys ?? []) {
      const date = parseDateCell(row[key]);
      if (date) row[key] = date;
    }
    for (const key of hints.NumberKeys ?? []) {
      const num = parseNumberCell(row[key]);
      if (num !== null) row[key] = num;
    }
  };

  // Field values live here, keyed by the entity row, so the row itself has no own properties.
  const entityRowValues = new WeakMap<object, Row>();
  const findFieldKey = (values: Row, fieldName: string): string | undefined => {
    if (typeof fieldName !== 'string') return undefined;
    if (Object.prototype.hasOwnProperty.call(values, fieldName)) return fieldName;
    const lower = fieldName.trim().toLowerCase();
    return Object.keys(values).find(k => k.toLowerCase() === lower);
  };
  const entityRowBase = {
    Get(this: object, fieldName: string): unknown {
      const values = entityRowValues.get(this);
      const key = values ? findFieldKey(values, fieldName) : undefined;
      return values && key !== undefined ? values[key] : null;
    },
    Set(this: object, fieldName: string, value: unknown): void {
      const values = entityRowValues.get(this);
      if (values) values[findFieldKey(values, fieldName) ?? fieldName] = value;
    },
    GetAll(this: object): Row {
      return { ...(entityRowValues.get(this) ?? {}) };
    },
  };
  const defineFieldGetter = (proto: object, propertyName: string, valueKey: string): void => {
    if (propertyName in proto) return;
    Object.defineProperty(proto, propertyName, {
      get(this: object) { return entityRowValues.get(this)?.[valueKey]; },
      set(this: object, value: unknown) {
        const values = entityRowValues.get(this);
        if (values) values[valueKey] = value;
      },
      enumerable: false,
      configurable: true,
    });
  };
  const toEntityRows = (rows: Row[], hints: RowTypeHints | undefined): Row[] => {
    // One prototype per result set, as there is one BaseEntity subclass per entity.
    const proto: object = Object.create(entityRowBase);
    for (const row of rows) {
      if (row && typeof row === 'object') Object.keys(row).forEach(key => defineFieldGetter(proto, key, key));
    }
    for (const [codeName, fieldName] of Object.entries(hints?.CodeNames ?? {})) {
      defineFieldGetter(proto, codeName, fieldName);
    }
    return rows.map(row => {
      if (!row || typeof row !== 'object') return row;
      const entity: Row = Object.create(proto);
      entityRowValues.set(entity, row);
      return entity;
    });
  };

  return (params, result) => {
    if (!result || typeof result !== 'object') return result;
    const record = result as HintedRunViewResult & Record<string, unknown>;
    const hints = record[hintsKey] as RowTypeHints | undefined;
    delete record[hintsKey];
    if (result.Success !== true || !Array.isArray(result.Results)) return result;
    if (hints) result.Results.forEach(row => { if (row && typeof row === 'object') normalizeRowTypes(row, hints); });
    if (params?.ResultType === 'entity_object') result.Results = toEntityRows(result.Results, hints);
    return result;
  };
}
