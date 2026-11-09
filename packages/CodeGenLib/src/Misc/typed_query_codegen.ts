import fs from 'fs';
import path from 'path';
import {
    ComputeTypedQuerySignature,
    DatabasePlatform,
    EntityInfo,
    QueryInfo,
    TypedQuerySignatureFieldInput,
    TypedQuerySignatureParamInput,
} from '@memberjunction/core';
import { UUIDsEqual, ordinalCompare } from '@memberjunction/global';
import { GetQueryDialect } from '@memberjunction/sql-dialect';
import { QueryTemplate } from '@memberjunction/sql-parser';
import { WriteFileIfChanged } from './file-write';
import { SanitizeSchemaFileName, SchemaKey } from './schema-emit';
import { LogWarning, logError, logStatus } from './status_logging';

/**
 * Minimal parameter metadata shape consumed by {@link TypedQueryGeneratorBase}.
 * Compatible with `QueryParameterInfo` and lightweight unit-test fixtures.
 */
export interface TypedQueryCodeGenParameter {
    Name: string;
    Type?: string | null;
    IsRequired?: boolean;
    DefaultValue?: string | null;
    Description?: string | null;
    IsServerSet?: boolean;
    DetectionMethod?: string | null;
}

/**
 * Minimal output field metadata shape consumed by {@link TypedQueryGeneratorBase}.
 * Compatible with `QueryFieldInfo` and lightweight unit-test fixtures.
 */
export interface TypedQueryCodeGenField {
    Name: string;
    Sequence?: number;
    SQLBaseType: string;
    SQLFullType?: string | null;
    Description?: string | null;
    IsNullable?: boolean | null;
    IsComputed?: boolean;
    SourceEntityID?: string | null;
    SourceEntity?: string | null;
    SourceFieldName?: string | null;
    InAllBranchVariants?: boolean;
}

/**
 * Minimal entity-reference metadata shape on a query.
 */
export interface TypedQueryCodeGenEntityRef {
    EntityID?: string | null;
    Entity?: string | null;
}

/**
 * Minimal entity metadata shape used for resolving source-column nullability and owning schemas.
 * Compatible with `EntityInfo`.
 */
export interface TypedQueryCodeGenEntity {
    ID: string;
    Name: string;
    SchemaName: string;
    BaseTable?: string;
    CodeName?: string;
    Fields: ReadonlyArray<{
        Name: string;
        AllowsNull: boolean;
        Type?: string;
    }>;
}

/**
 * Minimal query metadata shape consumed by {@link TypedQueryGeneratorBase}.
 * Compatible with `QueryInfo` and `MJQueryEntityExtended`.
 */
export interface TypedQueryCodeGenQuery {
    ID: string;
    Name: string;
    Description?: string | null;
    SQL?: string | null;
    Status?: string | null;
    Reusable?: boolean;
    CategoryPath?: string | null;
    Category?: string | null;
    SchemaName?: string | null;
    Parameters?: ReadonlyArray<TypedQueryCodeGenParameter>;
    Fields?: ReadonlyArray<TypedQueryCodeGenField>;
    Entities?: ReadonlyArray<TypedQueryCodeGenEntityRef>;
}

/**
 * Options controlling typed query code generation.
 */
export interface GenerateTypedQueriesOptions {
    /** Database platform used when parsing MJQ SQL templates (defaults to `'sqlserver'`). */
    platform?: DatabasePlatform;
    /** Callback invoked whenever CodeGen emits a warning (e.g. an `'unknown'` parameter type). */
    onWarning?: (message: string) => void;
    /** Whether to emit Zod row schemas alongside row interfaces (defaults to `true`). */
    emitZodSchemas?: boolean;
}

interface ResolvedParameterSpec {
    Name: string;
    TSType: string;
    EffectiveType: string;
    SignatureType: string;
    SignatureIsRequired: boolean;
    IsRequired: boolean;
    DefaultValue: string | null;
    Description: string | null;
}

interface ResolvedFieldSpec {
    Name: string;
    Sequence: number;
    SQLBaseType: string;
    TSType: 'string' | 'number' | 'boolean' | 'Date';
    IsNullable: boolean;
    IsOptional: boolean;
    Description: string | null;
}

interface ResolvedQuerySpec {
    Query: TypedQueryCodeGenQuery;
    Identifier: string;
    LeafName: string;
    CategorySegments: string[];
    FullPath: string;
    Summary: string | null;
    Parameters: ResolvedParameterSpec[];
    Fields: ResolvedFieldSpec[];
    Signature: string;
}

const VALID_DECLARED_PARAM_TYPES = new Set(['string', 'number', 'date', 'boolean', 'array']);

const NUMBER_SQL_TYPES = new Set([
    'int',
    'integer',
    'bigint',
    'smallint',
    'tinyint',
    'decimal',
    'numeric',
    'float',
    'real',
    'double precision',
    'money',
    'smallmoney',
    'serial',
    'bigserial',
]);

const BOOLEAN_SQL_TYPES = new Set(['bit', 'boolean', 'bool']);

const DATE_SQL_TYPES = new Set([
    'date',
    'datetime',
    'datetime2',
    'datetimeoffset',
    'smalldatetime',
    'time',
    'timestamp',
    'timestamptz',
    'timestamp without time zone',
    'timestamp with time zone',
]);

const TS_RESERVED_WORDS = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
    'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw',
    'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements',
    'interface', 'package', 'private', 'protected', 'public', 'await', 'abstract', 'boolean',
    'byte', 'char', 'double', 'final', 'float', 'goto', 'int', 'long', 'native', 'short',
    'synchronized', 'throws', 'transient', 'volatile', 'Queries',
]);

/**
 * Maps a SQL base type name (e.g. `'nvarchar'`, `'int'`, `'datetimeoffset'`, `'bit'`) to its
 * corresponding TypeScript row property type (`'string' | 'number' | 'boolean' | 'Date'`).
 */
export function MapSQLBaseTypeToTSType(sqlBaseType: string | null | undefined): 'string' | 'number' | 'boolean' | 'Date' {
    const raw = (sqlBaseType ?? '').trim();
    const parenIndex = raw.indexOf('(');
    const cleaned = (parenIndex >= 0 ? raw.slice(0, parenIndex) : raw).trim().toLowerCase();
    if (NUMBER_SQL_TYPES.has(cleaned)) {
        return 'number';
    }
    if (BOOLEAN_SQL_TYPES.has(cleaned)) {
        return 'boolean';
    }
    if (DATE_SQL_TYPES.has(cleaned)) {
        return 'Date';
    }
    return 'string';
}

/**
 * Converts a query or category name into a valid PascalCase TypeScript identifier.
 */
export function ToQueryIdentifier(rawName: string): string {
    const trimmed = (rawName ?? '').trim();
    if (!trimmed) {
        return 'UnnamedQuery';
    }
    const words = trimmed
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter((w) => w.length > 0);
    if (words.length === 0) {
        return 'UnnamedQuery';
    }
    let identifier = words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
    if (/^[0-9]/.test(identifier)) {
        identifier = `Q_${identifier}`;
    }
    if (TS_RESERVED_WORDS.has(identifier)) {
        identifier = `${identifier}Query`;
    }
    return identifier;
}

/**
 * Extracts ordered category path segments from a query's `CategoryPath` or fallback `Category`.
 */
export function ExtractQueryCategorySegments(query: Pick<TypedQueryCodeGenQuery, 'CategoryPath' | 'Category'>): string[] {
    if (query.CategoryPath && query.CategoryPath.trim().length > 0) {
        return query.CategoryPath
            .split('/')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }
    if (query.Category && query.Category.trim().length > 0) {
        return query.Category
            .split('/')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }
    return [];
}

/**
 * Builds the canonical `/` separated query path (`Category1/Category2/Query Name`).
 */
export function BuildTypedQueryFullPath(query: Pick<TypedQueryCodeGenQuery, 'Name' | 'CategoryPath' | 'Category'>): string {
    const segments = ExtractQueryCategorySegments(query);
    const name = query.Name.trim();
    return segments.length > 0 ? `${segments.join('/')}/${name}` : name;
}

/**
 * Filters a query catalog down to queries eligible for typed wrapper generation:
 * `Reusable === true` AND `Status === 'Approved'`.
 */
export function FilterEligibleTypedQueries<T extends TypedQueryCodeGenQuery>(queries: ReadonlyArray<T>): T[] {
    return queries.filter((q) => Boolean(q.Reusable) && q.Status === 'Approved');
}

/**
 * Resolves the logical database schema that owns a query.
 *
 * Precedence:
 * 1. Explicit `query.SchemaName` when present.
 * 2. Referenced entities in `query.Entities` or `query.Fields` (`SourceEntityID` / `SourceEntity`):
 *    if any referenced entity belongs to a non-core schema, the most frequent non-core schema
 *    (ties broken alphabetically) wins.
 * 3. Top-level category segment matching a known non-core schema.
 * 4. Fallback to `mjCoreSchema` (`'__mj'`).
 */
export function ResolveTypedQuerySchema(
    query: TypedQueryCodeGenQuery,
    entities: ReadonlyArray<TypedQueryCodeGenEntity>,
    allSchemas: ReadonlyArray<string>,
    mjCoreSchema: string = '__mj',
): string {
    if (query.SchemaName && query.SchemaName.trim().length > 0) {
        return query.SchemaName.trim();
    }

    const coreLower = mjCoreSchema.trim().toLowerCase();
    const nonCoreCounts = new Map<string, number>();
    let sawCoreEntity = false;

    const recordEntityMatch = (entity: TypedQueryCodeGenEntity | undefined): void => {
        if (!entity || !entity.SchemaName) return;
        const schema = entity.SchemaName.trim();
        if (!schema) return;
        if (schema.toLowerCase() === coreLower) {
            sawCoreEntity = true;
        } else {
            nonCoreCounts.set(schema, (nonCoreCounts.get(schema) ?? 0) + 1);
        }
    };

    for (const ref of query.Entities ?? []) {
        const match = findEntity(entities, ref.EntityID, ref.Entity);
        recordEntityMatch(match);
    }
    for (const field of query.Fields ?? []) {
        const match = findEntity(entities, field.SourceEntityID, field.SourceEntity);
        recordEntityMatch(match);
    }

    if (nonCoreCounts.size > 0) {
        const sorted = [...nonCoreCounts.entries()].sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return ordinalCompare(a[0], b[0]);
        });
        return sorted[0][0];
    }
    if (sawCoreEntity) {
        return mjCoreSchema;
    }

    const segments = ExtractQueryCategorySegments(query);
    if (segments.length > 0) {
        const firstSeg = segments[0].toLowerCase();
        const schemaMatch = allSchemas.find((s) => {
            const sLower = s.trim().toLowerCase();
            return (
                sLower !== coreLower &&
                (sLower === firstSeg ||
                    sLower === `__mj_bizapps${firstSeg}` ||
                    sLower.endsWith(`_${firstSeg}`))
            );
        });
        if (schemaMatch) {
            return schemaMatch.trim();
        }
    }

    return mjCoreSchema;
}

function findEntity(
    entities: ReadonlyArray<TypedQueryCodeGenEntity>,
    entityId?: string | null,
    entityName?: string | null,
): TypedQueryCodeGenEntity | undefined {
    if (entityId && entityId.trim().length > 0) {
        const byId = entities.find((e) => UUIDsEqual(e.ID, entityId));
        if (byId) return byId;
    }
    if (entityName && entityName.trim().length > 0) {
        const lower = entityName.trim().toLowerCase();
        return entities.find((e) => e.Name.trim().toLowerCase() === lower);
    }
    return undefined;
}

/**
 * Generates the TypeScript source code for a single schema's approved, reusable queries.
 * Pure function suitable for deterministic golden-file unit tests as well as CodeGen file emission.
 */
export function GenerateTypedQueriesFileContent(
    queries: ReadonlyArray<TypedQueryCodeGenQuery>,
    entities: ReadonlyArray<TypedQueryCodeGenEntity> = [],
    options: GenerateTypedQueriesOptions = {},
): string {
    const eligible = FilterEligibleTypedQueries(queries);
    const resolved = resolveQuerySpecs(eligible, entities, options);
    const emitZod = options.emitZodSchemas !== false;

    const lines: string[] = [
        '// AUTO-GENERATED FILE - DO NOT EDIT',
        '// Generated by MemberJunction CodeGen (typed_query_codegen)',
        '',
    ];

    if (resolved.length === 0) {
        lines.push('export const Queries = {} as const;');
        lines.push('');
        return lines.join('\n');
    }

    lines.push("import { DefineTypedQuery } from '@memberjunction/core';");
    if (emitZod) {
        lines.push("import { z } from 'zod';");
    }
    lines.push('');

    for (const spec of resolved) {
        lines.push(renderQueryDeclarationBlock(spec, emitZod));
        lines.push('');
    }

    lines.push(renderQueriesNamespaceTree(resolved));
    lines.push('');

    return lines.join('\n');
}

function resolveQuerySpecs(
    queries: ReadonlyArray<TypedQueryCodeGenQuery>,
    entities: ReadonlyArray<TypedQueryCodeGenEntity>,
    options: GenerateTypedQueriesOptions,
): ResolvedQuerySpec[] {
    const platform = options.platform ?? 'sqlserver';
    const dialect = GetQueryDialect(platform);
    const warn = options.onWarning ?? ((msg: string) => LogWarning(msg));

    const preliminary = queries
        .map((query) => {
            const categorySegments = ExtractQueryCategorySegments(query);
            const fullPath = BuildTypedQueryFullPath(query);
            const leafName = ToQueryIdentifier(query.Name);

            const sqlText = (query.SQL ?? '').trim();
            const template = sqlText.length > 0 ? QueryTemplate.Parse(sqlText, dialect) : null;
            const docs = template ? template.DocComments().Value : null;
            const templateParams = template ? template.Parameters().Value : [];

            const summary = docs?.Summary ?? (query.Description?.trim() || null);
            const parameters = resolveParametersForQuery(query, fullPath, templateParams, docs?.Parameters ?? [], warn);
            const fields = resolveFieldsForQuery(query, entities, docs?.Fields ?? []);

            const sigParams: TypedQuerySignatureParamInput[] =
                query.Parameters && query.Parameters.length > 0
                    ? query.Parameters.map((p) => ({
                          Name: p.Name,
                          Type: p.Type,
                          IsRequired: p.IsRequired,
                          DefaultValue: p.DefaultValue,
                          IsServerSet: p.IsServerSet,
                      }))
                    : parameters.map((p) => ({
                          Name: p.Name,
                          Type: p.SignatureType,
                          IsRequired: p.SignatureIsRequired,
                          DefaultValue: p.DefaultValue,
                          IsServerSet: false,
                      }));
            const sigFields: TypedQuerySignatureFieldInput[] =
                query.Fields && query.Fields.length > 0
                    ? query.Fields.map((f) => ({
                          Name: f.Name,
                          SQLBaseType: f.SQLBaseType,
                          InAllBranchVariants: f.InAllBranchVariants,
                      }))
                    : fields.map((f) => ({
                          Name: f.Name,
                          SQLBaseType: f.SQLBaseType,
                          InAllBranchVariants: !f.IsOptional,
                      }));
            const signature = ComputeTypedQuerySignature({
                Parameters: sigParams,
                Fields: sigFields,
            });

            return {
                Query: query,
                Identifier: leafName,
                LeafName: leafName,
                CategorySegments: categorySegments,
                FullPath: fullPath,
                Summary: summary,
                Parameters: parameters,
                Fields: fields,
                Signature: signature,
            };
        })
        .sort((a, b) => ordinalCompare(a.FullPath, b.FullPath));

    disambiguateCollisions(preliminary);
    return preliminary;
}

function resolveParametersForQuery(
    query: TypedQueryCodeGenQuery,
    fullPath: string,
    templateParams: ReadonlyArray<{
        Name: string;
        InferredType: string;
        IsRequired: boolean;
        DefaultValue: string | number | boolean | null;
    }>,
    docParams: ReadonlyArray<{
        Name: string;
        Description: string;
        DeclaredType: string | null;
    }>,
    warn: (message: string) => void,
): ResolvedParameterSpec[] {
    const storedByLower = new Map<string, TypedQueryCodeGenParameter>();
    for (const p of query.Parameters ?? []) {
        storedByLower.set(p.Name.trim().toLowerCase(), p);
    }

    const templateByLower = new Map<string, (typeof templateParams)[number]>();
    for (const tp of templateParams) {
        templateByLower.set(tp.Name.trim().toLowerCase(), tp);
    }

    const docByLower = new Map<string, (typeof docParams)[number]>();
    for (const dp of docParams) {
        docByLower.set(dp.Name.trim().toLowerCase(), dp);
    }

    // Union parameter keys in deterministic order: stored parameters first, then any template parameters.
    const orderedKeys: string[] = [];
    const seen = new Set<string>();
    for (const p of query.Parameters ?? []) {
        const key = p.Name.trim().toLowerCase();
        if (key && !seen.has(key)) {
            seen.add(key);
            orderedKeys.push(key);
        }
    }
    for (const tp of templateParams) {
        const key = tp.Name.trim().toLowerCase();
        if (key && !seen.has(key)) {
            seen.add(key);
            orderedKeys.push(key);
        }
    }

    const results: ResolvedParameterSpec[] = [];
    for (const key of orderedKeys) {
        const stored = storedByLower.get(key);
        const tpl = templateByLower.get(key);
        const doc = docByLower.get(key);

        if (stored?.IsServerSet) {
            continue;
        }

        const name = stored?.Name?.trim() || tpl?.Name?.trim() || doc?.Name?.trim() || key;

        // Precedence:
        // 1. MJQ declared type (@param {type})
        // 2. Manual parameter row type
        // 3. Template InferredType (when not 'unknown')
        // 4. Stored non-Manual parameter row type (when no template or when explicitly provided)
        // 5. 'unknown' -> union type + warning
        const declaredType = doc?.DeclaredType?.trim().toLowerCase() ?? null;
        const storedType = stored?.Type?.trim().toLowerCase() ?? null;
        const isManualRow = stored?.DetectionMethod === 'Manual';
        const inferredType = tpl?.InferredType?.trim().toLowerCase() ?? null;

        let effectiveType: string;
        if (declaredType && VALID_DECLARED_PARAM_TYPES.has(declaredType)) {
            effectiveType = declaredType;
        } else if (isManualRow && storedType && VALID_DECLARED_PARAM_TYPES.has(storedType)) {
            effectiveType = storedType;
        } else if (inferredType && inferredType !== 'unknown' && VALID_DECLARED_PARAM_TYPES.has(inferredType)) {
            effectiveType = inferredType;
        } else if (!tpl && storedType && VALID_DECLARED_PARAM_TYPES.has(storedType)) {
            effectiveType = storedType;
        } else if (storedType && storedType !== 'string' && VALID_DECLARED_PARAM_TYPES.has(storedType)) {
            effectiveType = storedType;
        } else {
            effectiveType = 'unknown';
            warn(
                `[TypedQueryCodeGen] Query '${fullPath}' parameter '${name}' has type 'unknown'; ` +
                    `emitting 'string | number | boolean | Date | null'. Declare '@param {type} ${name}' or set the parameter type in metadata.`,
            );
        }

        const defaultValue =
            stored?.DefaultValue != null && String(stored.DefaultValue).trim().length > 0
                ? String(stored.DefaultValue)
                : tpl?.DefaultValue != null && String(tpl.DefaultValue).trim().length > 0
                  ? String(tpl.DefaultValue)
                  : null;

        const rawRequired =
            isManualRow && stored?.IsRequired !== undefined
                ? Boolean(stored.IsRequired)
                : tpl !== undefined
                  ? Boolean(tpl.IsRequired)
                  : Boolean(stored?.IsRequired);

        const isRequired = rawRequired && defaultValue === null;
        const signatureIsRequired =
            stored?.IsRequired !== undefined
                ? Boolean(stored.IsRequired) && defaultValue === null
                : isRequired;
        const description = doc?.Description?.trim() || stored?.Description?.trim() || null;
        const signatureType =
            storedType && VALID_DECLARED_PARAM_TYPES.has(storedType) ? storedType : effectiveType;

        results.push({
            Name: name,
            TSType: mapParamTypeToTSType(effectiveType),
            EffectiveType: effectiveType,
            SignatureType: signatureType,
            SignatureIsRequired: signatureIsRequired,
            IsRequired: isRequired,
            DefaultValue: defaultValue,
            Description: description,
        });
    }

    return results;
}

function mapParamTypeToTSType(paramType: string): string {
    switch (paramType) {
        case 'string':
            return 'string';
        case 'number':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'date':
            return 'Date | string';
        case 'array':
            return 'ReadonlyArray<string | number | boolean>';
        default:
            return 'string | number | boolean | Date | null';
    }
}

function resolveFieldsForQuery(
    query: TypedQueryCodeGenQuery,
    entities: ReadonlyArray<TypedQueryCodeGenEntity>,
    docFields: ReadonlyArray<{
        Name: string;
        Description: string;
        DeclaredType: string | null;
    }>,
): ResolvedFieldSpec[] {
    const docByLower = new Map<string, (typeof docFields)[number]>();
    for (const df of docFields) {
        docByLower.set(df.Name.trim().toLowerCase(), df);
    }

    const sortedFields = [...(query.Fields ?? [])].sort((a, b) => {
        const seqA = a.Sequence ?? Number.MAX_SAFE_INTEGER;
        const seqB = b.Sequence ?? Number.MAX_SAFE_INTEGER;
        if (seqA !== seqB) return seqA - seqB;
        return ordinalCompare(a.Name, b.Name);
    });

    return sortedFields.map((field, index) => {
        const tsType = MapSQLBaseTypeToTSType(field.SQLBaseType);
        const doc = docByLower.get(field.Name.trim().toLowerCase());
        const description = doc?.Description?.trim() || field.Description?.trim() || null;

        let isNullable = true;
        if (!field.IsComputed && field.SourceFieldName && (field.SourceEntityID || field.SourceEntity)) {
            const sourceEntity = findEntity(entities, field.SourceEntityID, field.SourceEntity);
            const sourceFieldNameLower = field.SourceFieldName.trim().toLowerCase();
            const sourceField = sourceEntity?.Fields.find(
                (f) => f.Name.trim().toLowerCase() === sourceFieldNameLower,
            );
            if (sourceField) {
                isNullable = Boolean(sourceField.AllowsNull);
            }
        }

        const isOptional = field.InAllBranchVariants === false;

        return {
            Name: field.Name.trim(),
            Sequence: field.Sequence ?? index + 1,
            SQLBaseType: field.SQLBaseType,
            TSType: tsType,
            IsNullable: isNullable,
            IsOptional: isOptional,
            Description: description,
        };
    });
}

function disambiguateCollisions(specs: ResolvedQuerySpec[]): void {
    const byIdentifier = new Map<string, ResolvedQuerySpec[]>();
    for (const spec of specs) {
        const list = byIdentifier.get(spec.Identifier);
        if (list) {
            list.push(spec);
        } else {
            byIdentifier.set(spec.Identifier, [spec]);
        }
    }

    const usedIdentifiers = new Set<string>();
    for (const [id, group] of byIdentifier.entries()) {
        if (group.length === 1) {
            usedIdentifiers.add(id);
        }
    }

    for (const group of byIdentifier.values()) {
        if (group.length <= 1) continue;

        for (const spec of group) {
            let candidate = spec.LeafName;
            // Walk category segments from leaf-most to root-most until unique
            for (let depth = 1; depth <= spec.CategorySegments.length; depth++) {
                const prefixSegments = spec.CategorySegments.slice(spec.CategorySegments.length - depth);
                const prefix = prefixSegments.map((s) => ToQueryIdentifier(s)).join('');
                const attempt = `${prefix}${spec.LeafName}`;
                const collidesInGroup = group.some((other) => {
                    if (other === spec) return false;
                    const otherPrefixSegments = other.CategorySegments.slice(
                        Math.max(0, other.CategorySegments.length - depth),
                    );
                    const otherPrefix = otherPrefixSegments.map((s) => ToQueryIdentifier(s)).join('');
                    return `${otherPrefix}${other.LeafName}` === attempt;
                });
                if (!collidesInGroup && !usedIdentifiers.has(attempt)) {
                    candidate = attempt;
                    break;
                }
                candidate = attempt;
            }

            let finalId = candidate;
            let suffix = 2;
            while (usedIdentifiers.has(finalId)) {
                finalId = `${candidate}${suffix}`;
                suffix++;
            }
            spec.Identifier = finalId;
            usedIdentifiers.add(finalId);
        }
    }
}

function renderQueryDeclarationBlock(spec: ResolvedQuerySpec, emitZod: boolean): string {
    const lines: string[] = [];
    const paramsInterfaceName = `${spec.Identifier}Params`;
    const rowInterfaceName = `${spec.Identifier}Row`;
    const rowSchemaName = `${spec.Identifier}RowSchema`;

    // JSDoc header
    lines.push('/**');
    if (spec.Summary) {
        for (const summaryLine of spec.Summary.split('\n')) {
            lines.push(` * ${escapeJsDoc(summaryLine.trim())}`);
        }
    }
    lines.push(` * Query: ${escapeJsDoc(spec.FullPath)} (ID ${spec.Query.ID})`);
    lines.push(' */');

    // Params interface
    if (spec.Parameters.length === 0) {
        lines.push(`export type ${paramsInterfaceName} = Record<string, never>;`);
    } else {
        lines.push(`export interface ${paramsInterfaceName} {`);
        for (const param of spec.Parameters) {
            if (param.Description) {
                lines.push(`    /** ${escapeJsDoc(param.Description)} */`);
            }
            const propKey = formatPropertyKey(param.Name);
            const opt = param.IsRequired ? '' : '?';
            lines.push(`    ${propKey}${opt}: ${param.TSType};`);
        }
        lines.push('}');
    }

    // Row interface
    lines.push(`export interface ${rowInterfaceName} {`);
    for (const field of spec.Fields) {
        if (field.Description) {
            lines.push(`    /** ${escapeJsDoc(field.Description)} */`);
        }
        const propKey = formatPropertyKey(field.Name);
        const opt = field.IsOptional ? '?' : '';
        const nullUnion = field.IsNullable ? ' | null' : '';
        lines.push(`    ${propKey}${opt}: ${field.TSType}${nullUnion};`);
    }
    lines.push('}');

    // Zod schema
    if (emitZod) {
        lines.push(`export const ${rowSchemaName} = z.object({`);
        for (const field of spec.Fields) {
            const propKey = formatPropertyKey(field.Name);
            const zodExpr = buildZodFieldExpression(field);
            lines.push(`    ${propKey}: ${zodExpr},`);
        }
        lines.push('});');
    }

    // DefineTypedQuery constant
    lines.push(`export const ${spec.Identifier} = DefineTypedQuery<${paramsInterfaceName}, ${rowInterfaceName}>({`);
    lines.push(`    QueryID: ${JSON.stringify(spec.Query.ID)},`);
    lines.push(`    Path: ${JSON.stringify(spec.FullPath)},`);
    lines.push(`    Signature: ${JSON.stringify(spec.Signature)},`);
    if (emitZod) {
        lines.push(`    RowSchema: ${rowSchemaName},`);
    }
    lines.push('});');

    return lines.join('\n');
}

function buildZodFieldExpression(field: ResolvedFieldSpec): string {
    let base: string;
    switch (field.TSType) {
        case 'number':
            base = 'z.number()';
            break;
        case 'boolean':
            base = 'z.boolean()';
            break;
        case 'Date':
            base = 'z.coerce.date()';
            break;
        default:
            base = 'z.string()';
            break;
    }
    if (field.IsNullable) {
        base = `${base}.nullable()`;
    }
    if (field.IsOptional) {
        base = `${base}.optional()`;
    }
    return base;
}

interface NamespaceTreeNode {
    children: Map<string, NamespaceTreeNode>;
    queries: Map<string, string>;
}

function renderQueriesNamespaceTree(specs: ReadonlyArray<ResolvedQuerySpec>): string {
    const root: NamespaceTreeNode = {
        children: new Map<string, NamespaceTreeNode>(),
        queries: new Map<string, string>(),
    };

    for (const spec of specs) {
        let current = root;
        for (const rawSegment of spec.CategorySegments) {
            const segKey = ToQueryIdentifier(rawSegment);
            let child = current.children.get(segKey);
            if (!child) {
                child = {
                    children: new Map<string, NamespaceTreeNode>(),
                    queries: new Map<string, string>(),
                };
                current.children.set(segKey, child);
            }
            current = child;
        }
        let leafKey = spec.LeafName;
        if (current.queries.has(leafKey) && current.queries.get(leafKey) !== spec.Identifier) {
            leafKey = spec.Identifier;
        }
        current.queries.set(leafKey, spec.Identifier);
    }

    const bodyLines = renderNamespaceNode(root, 1);
    return ['export const Queries = {', ...bodyLines, '} as const;'].join('\n');
}

function renderNamespaceNode(node: NamespaceTreeNode, indentLevel: number): string[] {
    const indent = '    '.repeat(indentLevel);
    const lines: string[] = [];

    const childKeys = [...node.children.keys()].sort(ordinalCompare);
    for (const key of childKeys) {
        const child = node.children.get(key)!;
        const propKey = formatPropertyKey(key);
        lines.push(`${indent}${propKey}: {`);
        lines.push(...renderNamespaceNode(child, indentLevel + 1));
        lines.push(`${indent}},`);
    }

    const queryKeys = [...node.queries.keys()].sort(ordinalCompare);
    for (const key of queryKeys) {
        const targetIdentifier = node.queries.get(key)!;
        let effectiveKey = key;
        if (node.children.has(effectiveKey)) {
            effectiveKey =
                targetIdentifier !== effectiveKey && !node.children.has(targetIdentifier) && !node.queries.has(targetIdentifier)
                    ? targetIdentifier
                    : `${effectiveKey}Query`;
            let suffix = 2;
            while (node.children.has(effectiveKey) || (effectiveKey !== key && node.queries.has(effectiveKey))) {
                effectiveKey = `${key}Query_${suffix}`;
                suffix++;
            }
        }
        const propKey = formatPropertyKey(effectiveKey);
        if (propKey === targetIdentifier) {
            lines.push(`${indent}${propKey},`);
        } else {
            lines.push(`${indent}${propKey}: ${targetIdentifier},`);
        }
    }

    return lines;
}

function formatPropertyKey(name: string): string {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
        return name;
    }
    return JSON.stringify(name);
}

function escapeJsDoc(text: string): string {
    return text.replace(/\*\//g, '*\\/');
}

/**
 * CodeGen generator class that emits `queries/<schema>.ts` and `queries/index.ts`
 * for approved, reusable MemberJunction queries.
 */
export class TypedQueryGeneratorBase {
    public GenerateTypedQueriesForDirectory(
        queries: ReadonlyArray<TypedQueryCodeGenQuery>,
        entities: ReadonlyArray<TypedQueryCodeGenEntity>,
        queriesOutputDir: string,
        schemaNames: ReadonlyArray<string>,
        options: GenerateTypedQueriesOptions = {},
    ): boolean {
        try {
            const eligible = FilterEligibleTypedQueries(queries);
            const allSchemas = Array.from(
                new Set([
                    ...schemaNames,
                    ...entities.map((e) => e.SchemaName),
                ]),
            ).filter(Boolean);

            const bySchema = new Map<string, TypedQueryCodeGenQuery[]>();
            for (const schema of schemaNames) {
                bySchema.set(schema, []);
            }

            for (const q of eligible) {
                const resolvedSchema = ResolveTypedQuerySchema(q, entities, allSchemas);
                const matchingKey = [...bySchema.keys()].find(
                    (k) => SchemaKey(k) === SchemaKey(resolvedSchema),
                );
                if (matchingKey) {
                    bySchema.get(matchingKey)!.push(q);
                }
            }

            const filesToEmit: Array<{ stem: string; content: string }> = [];
            let matchedCount = 0;
            for (const [schema, schemaQueries] of bySchema.entries()) {
                if (schemaQueries.length === 0 && SchemaKey(schema) !== '__mj') {
                    continue;
                }
                matchedCount += schemaQueries.length;
                const stem = SanitizeSchemaFileName(schema);
                const content = GenerateTypedQueriesFileContent(schemaQueries, entities, options);
                filesToEmit.push({ stem, content });
            }

            if (filesToEmit.length === 0) {
                return true;
            }

            fs.mkdirSync(queriesOutputDir, { recursive: true });
            const barrelStems: string[] = [];
            for (const { stem, content } of filesToEmit) {
                barrelStems.push(stem);
                const filePath = path.join(queriesOutputDir, `${stem}.ts`);
                WriteFileIfChanged(filePath, content);
            }

            barrelStems.sort(ordinalCompare);
            const barrelLines = [
                '// AUTO-GENERATED FILE - DO NOT EDIT',
                '// Generated by MemberJunction CodeGen (typed_query_codegen)',
                '',
                ...barrelStems.map((stem) => `export * from './${stem}.js';`),
                '',
            ];
            const barrelPath = path.join(queriesOutputDir, 'index.ts');
            WriteFileIfChanged(barrelPath, barrelLines.join('\n'));

            logStatus(
                `Typed queries generated in ${queriesOutputDir} (${matchedCount} reusable approved quer${matchedCount === 1 ? 'y' : 'ies'})`,
            );
            return true;
        } catch (err) {
            logError('Error generating typed queries', err);
            return false;
        }
    }
}
