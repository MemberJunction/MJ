import { GetDialect, type DatabasePlatform, type SQLDialect } from '@memberjunction/sql-dialect';
import { EntityFieldInfo, EntityFieldTSType, EntityInfo, FieldSecurityError } from '../entityInfo';
import { DEFAULT_DATABASE_PLATFORM } from '../platformSQL';
import { UserInfo } from '../securityInfo';
import type { RunViewParameters, RunViewParameterScalar } from '../../views/runView';
import { CompositeFilter } from './compositeFilter';
import {
    IsCompositeFilter,
    IsSimpleFilter,
    ParseFilterField,
    type CompositeFilterDescriptor,
    type FilterDescriptor,
    type FilterLogic,
    type FilterOperator,
} from './filter.types';

/**
 * Options for compiling a {@link CompositeFilterDescriptor} or {@link CompositeFilter} into SQL.
 */
export interface CompositeFilterSQLCompileOptions {
    /**
     * Target database platform (`'sqlserver'` or `'postgresql'`).
     * Defaults to {@link DEFAULT_DATABASE_PLATFORM} (`'sqlserver'`).
     */
    platform?: DatabasePlatform;
    /**
     * Acting user for field-level security enforcement. When supplied and the entity has
     * field-level security enabled, referencing a field the user is denied read access to
     * throws a {@link FieldSecurityError}.
     */
    user?: UserInfo;
    /**
     * Prefix for generated parameter names (without leading `@`).
     * Defaults to `'f'` (producing `@f0`, `@f1`, …).
     */
    parameterPrefix?: string;
    /**
     * Starting index for generated parameter names. Defaults to `0`.
     */
    startingParameterIndex?: number;
    /**
     * Maximum number of items allowed in an `in` or `notin` array filter.
     * Defaults to {@link CompositeFilterSQLCompiler.DefaultMaxInValues} (500).
     */
    maxInValues?: number;
    /**
     * When true, strips any `Source.` prefix from dotted field names (`Organizations.Type` → `Type`)
     * for single-table User Views. When false (default), dotted field names are only permitted if
     * the source matches the target entity's Name, ClassName, or CodeName.
     */
    allowSourcePrefix?: boolean;
    /**
     * When true, `eq` / `neq` with `null` on a boolean field coerces `null` to `false` (`0` / `FALSE`)
     * for legacy Kendo User View `FilterState` compatibility. Defaults to `false` so `eq: null` emits
     * `IS NULL` and `neq: null` emits `IS NOT NULL` in parity with `CompositeFilter.Evaluate()`.
     */
    coerceNullBooleanToFalse?: boolean;
}

/**
 * Result of compiling a structured filter into parameterized SQL.
 */
export interface CompositeFilterCompiledSQL {
    /**
     * Compiled SQL `WHERE` fragment (without leading `WHERE`), or `''` if the filter has no rules.
     */
    whereClause: string;
    /**
     * Bound parameter dictionary keyed by parameter name (without leading `@`).
     */
    parameters: RunViewParameters;
    /**
     * Next available parameter index after compilation.
     */
    nextParameterIndex: number;
}

const VALID_OPERATORS: ReadonlySet<FilterOperator> = new Set<FilterOperator>([
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'contains',
    'doesnotcontain',
    'startswith',
    'endswith',
    'isnull',
    'isnotnull',
    'isempty',
    'isnotempty',
    'in',
    'notin',
    'between',
]);

/**
 * Compiles portable {@link CompositeFilterDescriptor} / {@link CompositeFilter} trees into
 * dialect-aware SQL fragments.
 *
 * - {@link Compile} emits parameterized SQL (`@f0`, `@f1`, …) + a `RunViewParameters` bag so
 *   caller values are never interpolated into SQL text.
 * - {@link CompileLiteral} emits literal SQL with dialect-specific quoting, `LIKE` wildcard
 *   escaping, and strict `TSType` validation for stored User View `WhereClause` generation.
 */
export class CompositeFilterSQLCompiler {
    /**
     * Default maximum number of values permitted in a single `in` or `notin` operator rule.
     */
    public static readonly DefaultMaxInValues = 500;

    /**
     * Compiles `filter` into a parameterized SQL `WHERE` clause and parameter bag.
     */
    public static Compile(
        filter: CompositeFilterDescriptor | CompositeFilter | FilterDescriptor | null | undefined,
        entityInfo: EntityInfo,
        options?: CompositeFilterSQLCompileOptions,
    ): CompositeFilterCompiledSQL {
        const prefix = options?.parameterPrefix ?? 'f';
        const state: CompileState = {
            entityInfo,
            dialect: GetDialect(options?.platform ?? DEFAULT_DATABASE_PLATFORM),
            user: options?.user,
            deniedFields: CompositeFilterSQLCompiler.resolveDeniedFields(entityInfo, options?.user),
            parameterPrefix: prefix,
            nextIndex: options?.startingParameterIndex ?? 0,
            maxInValues: options?.maxInValues ?? CompositeFilterSQLCompiler.DefaultMaxInValues,
            allowSourcePrefix: options?.allowSourcePrefix ?? false,
            coerceNullBooleanToFalse: options?.coerceNullBooleanToFalse ?? false,
            parameters: {},
            literalMode: false,
        };

        const descriptor = CompositeFilterSQLCompiler.unwrapDescriptor(filter);
        if (!descriptor) {
            return { whereClause: '', parameters: {}, nextParameterIndex: state.nextIndex };
        }

        const whereClause = CompositeFilterSQLCompiler.compileNode(descriptor, state);
        return {
            whereClause,
            parameters: state.parameters,
            nextParameterIndex: state.nextIndex,
        };
    }

    /**
     * Compiles `filter` into a literal SQL `WHERE` clause with strict type validation,
     * quote doubling, and `LIKE` wildcard escaping. Used by User Views that persist a
     * compiled `WhereClause` string.
     */
    public static CompileLiteral(
        filter: CompositeFilterDescriptor | CompositeFilter | FilterDescriptor | null | undefined,
        entityInfo: EntityInfo,
        options?: Omit<CompositeFilterSQLCompileOptions, 'parameterPrefix' | 'startingParameterIndex'>,
    ): string {
        const state: CompileState = {
            entityInfo,
            dialect: GetDialect(options?.platform ?? DEFAULT_DATABASE_PLATFORM),
            user: options?.user,
            deniedFields: CompositeFilterSQLCompiler.resolveDeniedFields(entityInfo, options?.user),
            parameterPrefix: 'f',
            nextIndex: 0,
            maxInValues: options?.maxInValues ?? CompositeFilterSQLCompiler.DefaultMaxInValues,
            allowSourcePrefix: options?.allowSourcePrefix ?? true,
            coerceNullBooleanToFalse: options?.coerceNullBooleanToFalse ?? false,
            parameters: {},
            literalMode: true,
        };

        const descriptor = CompositeFilterSQLCompiler.unwrapDescriptor(filter);
        if (!descriptor) {
            return '';
        }

        return CompositeFilterSQLCompiler.compileNode(descriptor, state);
    }

    /**
     * Validates that every field referenced in `filter` exists on `entityInfo` and is readable
     * by `user` under field-level security. Throws {@link FieldSecurityError} on a denied field.
     */
    public static AssertFieldsAllowed(
        filter: CompositeFilterDescriptor | CompositeFilter | FilterDescriptor | null | undefined,
        entityInfo: EntityInfo,
        user?: UserInfo,
        allowSourcePrefix = false,
    ): void {
        const descriptor = CompositeFilterSQLCompiler.unwrapDescriptor(filter);
        if (!descriptor) return;
        const deniedFields = CompositeFilterSQLCompiler.resolveDeniedFields(entityInfo, user);
        CompositeFilterSQLCompiler.validateNodeFields(descriptor, entityInfo, deniedFields, allowSourcePrefix);
    }

    private static resolveDeniedFields(entityInfo: EntityInfo, user?: UserInfo): ReadonlySet<string> {
        if (!user || !entityInfo?.FieldLevelSecurityApplies || typeof entityInfo.GetDeniedReadFields !== 'function') {
            return new Set<string>();
        }
        return entityInfo.GetDeniedReadFields(user);
    }

    private static unwrapDescriptor(
        filter: CompositeFilterDescriptor | CompositeFilter | FilterDescriptor | null | undefined,
    ): CompositeFilterDescriptor | null {
        if (filter == null) return null;
        if (filter instanceof CompositeFilter) {
            return filter.ToDescriptor();
        }
        if (IsCompositeFilter(filter)) {
            return filter;
        }
        if (IsSimpleFilter(filter)) {
            return { logic: 'and', filters: [filter] };
        }
        throw new Error('Invalid filter descriptor: expected a CompositeFilterDescriptor or FilterDescriptor.');
    }

    private static validateNodeFields(
        node: CompositeFilterDescriptor | FilterDescriptor,
        entityInfo: EntityInfo,
        deniedFields: ReadonlySet<string>,
        allowSourcePrefix: boolean,
    ): void {
        if (IsCompositeFilter(node)) {
            for (const child of node.filters ?? []) {
                if (child != null) {
                    CompositeFilterSQLCompiler.validateNodeFields(child, entityInfo, deniedFields, allowSourcePrefix);
                }
            }
            return;
        }
        if (IsSimpleFilter(node)) {
            CompositeFilterSQLCompiler.resolveField(node.field, entityInfo, deniedFields, allowSourcePrefix);
        }
    }

    private static compileNode(
        node: CompositeFilterDescriptor | FilterDescriptor,
        state: CompileState,
    ): string {
        if (IsCompositeFilter(node)) {
            return CompositeFilterSQLCompiler.compileGroup(node, state);
        }
        if (IsSimpleFilter(node)) {
            return `(${CompositeFilterSQLCompiler.compileRule(node, state)})`;
        }
        throw new Error('Invalid filter entry: expected a FilterDescriptor or nested CompositeFilterDescriptor.');
    }

    private static compileGroup(group: CompositeFilterDescriptor, state: CompileState): string {
        const rawLogic = typeof group.logic === 'string' ? group.logic.trim().toLowerCase() : 'and';
        if (rawLogic !== 'and' && rawLogic !== 'or') {
            throw new Error(`Invalid filter logic '${String(group.logic)}': expected 'and' or 'or'.`);
        }
        const sqlLogic = rawLogic === 'or' ? 'OR' : 'AND';
        const parts: string[] = [];

        for (const item of group.filters ?? []) {
            if (item == null) continue;
            if (IsCompositeFilter(item)) {
                const inner = CompositeFilterSQLCompiler.compileGroup(item, state);
                if (inner.length > 0) {
                    parts.push(`(${inner})`);
                }
            } else if (IsSimpleFilter(item)) {
                const ruleSQL = CompositeFilterSQLCompiler.compileRule(item, state);
                if (ruleSQL.length > 0) {
                    parts.push(`(${ruleSQL})`);
                }
            } else {
                throw new Error('Invalid filter entry inside group: expected a FilterDescriptor or CompositeFilterDescriptor.');
            }
        }

        return parts.join(` ${sqlLogic} `);
    }

    private static compileRule(rule: FilterDescriptor, state: CompileState): string {
        const fieldInfo = CompositeFilterSQLCompiler.resolveField(
            rule.field,
            state.entityInfo,
            state.deniedFields,
            state.allowSourcePrefix,
        );
        const rawOperator = typeof rule.operator === 'string' ? (rule.operator.trim().toLowerCase() as FilterOperator) : ('' as FilterOperator);
        if (!VALID_OPERATORS.has(rawOperator)) {
            throw new Error(`Unsupported filter operator '${String(rule.operator)}' on field '${fieldInfo.Name}'.`);
        }

        const col = state.dialect.QuoteIdentifier(fieldInfo.Name);
        const tsTypeLower = CompositeFilterSQLCompiler.normalizedTSType(fieldInfo);
        const isStringField = tsTypeLower === 'string';
        const isBooleanField = tsTypeLower === 'boolean';

        switch (rawOperator) {
            case 'isnull':
                return `${col} IS NULL`;
            case 'isnotnull':
                return `${col} IS NOT NULL`;
            case 'isempty':
                return isStringField
                    ? `${col} IS NULL OR ${col} = ${state.dialect.QuoteStringLiteral('')}`
                    : `${col} IS NULL`;
            case 'isnotempty':
                return isStringField
                    ? `${col} IS NOT NULL AND ${col} <> ${state.dialect.QuoteStringLiteral('')}`
                    : `${col} IS NOT NULL`;
            case 'eq': {
                if (rule.value == null && !(isBooleanField && state.coerceNullBooleanToFalse)) {
                    return `${col} IS NULL`;
                }
                const operand = CompositeFilterSQLCompiler.renderScalarOperand(rule.value, fieldInfo, state);
                return `${col} = ${operand}`;
            }
            case 'neq': {
                if (rule.value == null && !(isBooleanField && state.coerceNullBooleanToFalse)) {
                    return `${col} IS NOT NULL`;
                }
                const operand = CompositeFilterSQLCompiler.renderScalarOperand(rule.value, fieldInfo, state);
                return `${col} <> ${operand}`;
            }
            case 'gt':
                return `${col} > ${CompositeFilterSQLCompiler.renderScalarOperand(rule.value, fieldInfo, state)}`;
            case 'gte':
                return `${col} >= ${CompositeFilterSQLCompiler.renderScalarOperand(rule.value, fieldInfo, state)}`;
            case 'lt':
                return `${col} < ${CompositeFilterSQLCompiler.renderScalarOperand(rule.value, fieldInfo, state)}`;
            case 'lte':
                return `${col} <= ${CompositeFilterSQLCompiler.renderScalarOperand(rule.value, fieldInfo, state)}`;
            case 'startswith':
                return `${col} LIKE ${CompositeFilterSQLCompiler.renderLikeOperand(rule.value, 'startswith', state)}`;
            case 'endswith':
                return `${col} LIKE ${CompositeFilterSQLCompiler.renderLikeOperand(rule.value, 'endswith', state)}`;
            case 'contains':
                return `${col} LIKE ${CompositeFilterSQLCompiler.renderLikeOperand(rule.value, 'contains', state)}`;
            case 'doesnotcontain':
                return `${col} NOT LIKE ${CompositeFilterSQLCompiler.renderLikeOperand(rule.value, 'contains', state)}`;
            case 'in':
            case 'notin':
                return CompositeFilterSQLCompiler.compileInRule(col, rawOperator, rule.value, fieldInfo, state);
            case 'between':
                return CompositeFilterSQLCompiler.compileBetweenRule(col, rule.value, fieldInfo, state);
            default:
                throw new Error(`Unsupported filter operator '${String(rawOperator)}' on field '${fieldInfo.Name}'.`);
        }
    }

    private static compileInRule(
        col: string,
        operator: 'in' | 'notin',
        rawValue: unknown,
        fieldInfo: EntityFieldInfo,
        state: CompileState,
    ): string {
        if (!Array.isArray(rawValue)) {
            throw new Error(`Filter operator '${operator}' on field '${fieldInfo.Name}' requires an array value.`);
        }
        if (rawValue.length === 0) {
            throw new Error(`Filter operator '${operator}' on field '${fieldInfo.Name}' requires a non-empty array.`);
        }
        if (rawValue.length > state.maxInValues) {
            throw new Error(
                `Filter operator '${operator}' on field '${fieldInfo.Name}' has ${rawValue.length} values, exceeding the maximum of ${state.maxInValues}.`,
            );
        }
        const operands = rawValue.map((item) => {
            if (item == null) {
                throw new Error(`Filter operator '${operator}' on field '${fieldInfo.Name}' cannot contain null or undefined elements.`);
            }
            return CompositeFilterSQLCompiler.renderScalarOperand(item, fieldInfo, state);
        });
        const keyword = operator === 'in' ? 'IN' : 'NOT IN';
        return `${col} ${keyword} (${operands.join(', ')})`;
    }

    private static compileBetweenRule(
        col: string,
        rawValue: unknown,
        fieldInfo: EntityFieldInfo,
        state: CompileState,
    ): string {
        if (!Array.isArray(rawValue) || rawValue.length !== 2) {
            throw new Error(`Filter operator 'between' on field '${fieldInfo.Name}' requires a two-element [low, high] array.`);
        }
        const [lowRaw, highRaw] = rawValue;
        if (lowRaw == null || highRaw == null) {
            throw new Error(`Filter operator 'between' on field '${fieldInfo.Name}' requires non-null low and high bounds.`);
        }
        const lowOperand = CompositeFilterSQLCompiler.renderScalarOperand(lowRaw, fieldInfo, state);
        const highOperand = CompositeFilterSQLCompiler.renderScalarOperand(highRaw, fieldInfo, state);
        return `${col} BETWEEN ${lowOperand} AND ${highOperand}`;
    }

    private static resolveField(
        rawField: string,
        entityInfo: EntityInfo,
        deniedFields: ReadonlySet<string>,
        allowSourcePrefix: boolean,
    ): EntityFieldInfo {
        if (typeof rawField !== 'string' || rawField.trim().length === 0) {
            throw new Error(`Filter field name must be a non-empty string on entity '${entityInfo?.Name ?? 'unknown'}'.`);
        }
        const { Source, Name } = ParseFilterField(rawField);
        if (Source != null && !allowSourcePrefix) {
            const normalizedSource = Source.trim().toLowerCase();
            const matchesEntity =
                normalizedSource === (entityInfo.Name ?? '').trim().toLowerCase() ||
                normalizedSource === (entityInfo.ClassName ?? '').trim().toLowerCase() ||
                normalizedSource === (entityInfo.CodeName ?? '').trim().toLowerCase();
            if (!matchesEntity) {
                throw new Error(
                    `Multi-source filter field '${rawField}' (source '${Source}') cannot be compiled against entity '${entityInfo.Name}'. Related-entity Source.Field filters are only supported for in-memory evaluation.`,
                );
            }
        }

        const lookupName = Name.trim().toLowerCase();
        const fieldInfo = entityInfo?.Fields?.find((f) => f.Name.trim().toLowerCase() === lookupName);
        if (!fieldInfo) {
            if (deniedFields.size > 0) {
                throw new FieldSecurityError(Name.trim(), entityInfo.Name);
            }
            throw new Error(`Unable to find field ${Name.trim()} in entity ${entityInfo?.Name ?? 'unknown'}`);
        }

        if (deniedFields.has(fieldInfo.Name.trim().toLowerCase())) {
            throw new FieldSecurityError(fieldInfo.Name, entityInfo.Name);
        }

        return fieldInfo;
    }

    private static renderScalarOperand(
        rawValue: unknown,
        fieldInfo: EntityFieldInfo,
        state: CompileState,
    ): string {
        const coerced = CompositeFilterSQLCompiler.coerceScalarValue(rawValue, fieldInfo, state.literalMode);
        if (!state.literalMode) {
            return CompositeFilterSQLCompiler.allocateParameter(coerced, state);
        }
        return CompositeFilterSQLCompiler.formatLiteralScalar(coerced, fieldInfo, state.dialect);
    }

    private static renderLikeOperand(
        rawValue: unknown,
        kind: 'startswith' | 'endswith' | 'contains',
        state: CompileState,
    ): string {
        if (rawValue == null) {
            throw new Error(`Filter operator '${kind}' requires a non-null string value.`);
        }
        const escaped = state.dialect.EscapeLikePattern(String(rawValue));
        const pattern =
            kind === 'startswith'
                ? `${escaped}%`
                : kind === 'endswith'
                  ? `%${escaped}`
                  : `%${escaped}%`;
        if (!state.literalMode) {
            return CompositeFilterSQLCompiler.allocateParameter(pattern, state);
        }
        const prefix = state.dialect.StringLiteralPrefix(pattern);
        return `${prefix}${state.dialect.QuoteStringLiteral(pattern)}`;
    }

    private static normalizedTSType(fieldInfo: EntityFieldInfo): string {
        return String(fieldInfo?.TSType ?? '').trim().toLowerCase();
    }

    private static coerceScalarValue(
        rawValue: unknown,
        fieldInfo: EntityFieldInfo,
        literalMode: boolean,
    ): RunViewParameterScalar {
        switch (CompositeFilterSQLCompiler.normalizedTSType(fieldInfo)) {
            case 'boolean': {
                if (typeof rawValue === 'boolean') return rawValue;
                if (typeof rawValue === 'string') {
                    const lower = rawValue.trim().toLowerCase();
                    return lower === 'true' || lower === '1';
                }
                if (typeof rawValue === 'number') return rawValue !== 0;
                return Boolean(rawValue);
            }
            case 'number': {
                if (rawValue == null || rawValue === '' || typeof rawValue === 'boolean') {
                    throw new Error(`Invalid numeric filter value for field '${fieldInfo.Name}'.`);
                }
                const n = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim());
                if (!Number.isFinite(n)) {
                    throw new Error(`Invalid numeric filter value '${String(rawValue)}' for field '${fieldInfo.Name}'.`);
                }
                return n;
            }
            case 'date': {
                if (rawValue instanceof Date) {
                    if (Number.isNaN(rawValue.getTime())) {
                        throw new Error(`Invalid Date filter value for field '${fieldInfo.Name}'.`);
                    }
                    return literalMode ? rawValue.toISOString() : rawValue;
                }
                if (typeof rawValue === 'string') {
                    const trimmed = rawValue.trim();
                    if (trimmed.length === 0 || Number.isNaN(Date.parse(trimmed))) {
                        throw new Error(`Invalid date string filter value '${rawValue}' for field '${fieldInfo.Name}'.`);
                    }
                    return trimmed;
                }
                if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
                    const d = new Date(rawValue);
                    if (Number.isNaN(d.getTime())) {
                        throw new Error(`Invalid date timestamp filter value for field '${fieldInfo.Name}'.`);
                    }
                    return literalMode ? d.toISOString() : d;
                }
                throw new Error(`Invalid date filter value for field '${fieldInfo.Name}'.`);
            }
            default: {
                if (rawValue == null) {
                    throw new Error(`Filter value for field '${fieldInfo.Name}' cannot be null or undefined.`);
                }
                if (rawValue instanceof Date) {
                    if (Number.isNaN(rawValue.getTime())) {
                        throw new Error(`Invalid Date filter value for field '${fieldInfo.Name}'.`);
                    }
                    return rawValue.toISOString();
                }
                return String(rawValue);
            }
        }
    }

    private static formatLiteralScalar(
        coerced: RunViewParameterScalar,
        fieldInfo: EntityFieldInfo,
        dialect: SQLDialect,
    ): string {
        if (coerced === null) {
            return dialect.NullLiteral;
        }
        const tsTypeLower = CompositeFilterSQLCompiler.normalizedTSType(fieldInfo);
        if (tsTypeLower === 'boolean' || typeof coerced === 'boolean') {
            return dialect.BooleanLiteral(Boolean(coerced));
        }
        if (tsTypeLower === 'number' || typeof coerced === 'number') {
            const num = typeof coerced === 'number' ? coerced : Number(coerced);
            if (!Number.isFinite(num)) {
                throw new Error(`Invalid numeric filter literal for field '${fieldInfo.Name}'.`);
            }
            return String(num);
        }
        const text = coerced instanceof Date ? coerced.toISOString() : String(coerced);
        if (fieldInfo.NeedsQuotes === false) {
            const num = Number(text);
            if (!Number.isFinite(num)) {
                throw new Error(`Invalid unquoted filter literal for field '${fieldInfo.Name}'.`);
            }
            return String(num);
        }
        const prefix = dialect.StringLiteralPrefix(text);
        return `${prefix}${dialect.QuoteStringLiteral(text)}`;
    }

    private static allocateParameter(value: RunViewParameterScalar, state: CompileState): string {
        const paramName = `${state.parameterPrefix}${state.nextIndex++}`;
        state.parameters[paramName] = value;
        return `@${paramName}`;
    }
}

interface CompileState {
    entityInfo: EntityInfo;
    dialect: SQLDialect;
    user?: UserInfo;
    deniedFields: ReadonlySet<string>;
    parameterPrefix: string;
    nextIndex: number;
    maxInValues: number;
    allowSourcePrefix: boolean;
    coerceNullBooleanToFalse: boolean;
    parameters: RunViewParameters;
    literalMode: boolean;
}

/**
 * Produces a deterministic, canonical JSON string for a {@link CompositeFilterDescriptor} or
 * {@link CompositeFilter} (normalized logic/operator casing, trimmed field names, ISO-serialized
 * dates, and empty groups pruned). Returns `''` when the filter is null, undefined, or has no
 * leaf rules.
 *
 * Used by `RunViewParams.Equals`, `LocalCacheManager.GenerateRunViewFingerprint`, and `BaseEngine`
 * to fingerprint structured filters consistently across browser and server.
 */
export function CanonicalCompositeFilterKey(
    filter: CompositeFilterDescriptor | CompositeFilter | FilterDescriptor | null | undefined,
): string {
    if (filter == null) return '';
    const descriptor =
        filter instanceof CompositeFilter
            ? filter.ToDescriptor()
            : IsCompositeFilter(filter)
              ? filter
              : IsSimpleFilter(filter)
                ? { logic: 'and' as FilterLogic, filters: [filter] }
                : null;
    if (!descriptor) return '';
    const normalized = canonicalizeGroup(descriptor);
    if (!normalized) return '';
    return JSON.stringify(normalized);
}

function canonicalizeGroup(group: CompositeFilterDescriptor): CompositeFilterDescriptor | null {
    if (!group || !Array.isArray(group.filters) || group.filters.length === 0) {
        return null;
    }
    const logic: FilterLogic = typeof group.logic === 'string' && group.logic.trim().toLowerCase() === 'or' ? 'or' : 'and';
    const children: (FilterDescriptor | CompositeFilterDescriptor)[] = [];
    for (const item of group.filters) {
        if (item == null) continue;
        if (IsCompositeFilter(item)) {
            const sub = canonicalizeGroup(item);
            if (sub) children.push(sub);
        } else if (IsSimpleFilter(item)) {
            const field = typeof item.field === 'string' ? item.field.trim() : '';
            if (!field) continue;
            const operator = (typeof item.operator === 'string' ? item.operator.trim().toLowerCase() : 'eq') as FilterOperator;
            const isNullOp = operator === 'isnull' || operator === 'isnotnull' || operator === 'isempty' || operator === 'isnotempty';
            children.push({
                field,
                operator,
                value: isNullOp ? null : canonicalizeValue(item.value),
            });
        }
    }
    if (children.length === 0) return null;
    return { logic, filters: children };
}

function canonicalizeValue(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map(canonicalizeValue);
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const sortedKeys = Object.keys(record).sort();
        const out: Record<string, unknown> = {};
        for (const k of sortedKeys) {
            out[k] = canonicalizeValue(record[k]);
        }
        return out;
    }
    return value;
}
