/**
 * Resolve stage of the query extraction pipeline.
 *
 * Contains all deterministic resolution logic — no LLM calls, no database writes.
 * Every function is stateless: context is passed in as parameters rather than via `this`.
 */

import { EntityInfo, IMetadataProvider, TypeScriptTypeFromSQLType } from "@memberjunction/core";
import { MJQueryEntityExtended, MJQueryFieldEntity, MJQueryDependencyEntity, QueryEngine } from "@memberjunction/core-entities";
import { QueryCompositionEngine } from "@memberjunction/generic-database-provider";
import { UUIDsEqual } from "@memberjunction/global";
import { SQLParser } from "@memberjunction/sql-parser";
import { SQLServerDialect } from "@memberjunction/sql-dialect";
import type { MJParameterInfo, SQLSelectColumn, SQLTableReference } from "@memberjunction/sql-parser";

import type {
    EntityMetadataEntry,
    ExtractedField,
    PassthroughParamContext,
    ResolvedCompositionReference,
} from "./types";


// ═══════════════════════════════════════════════════
// Composition Reference Resolution
// ═══════════════════════════════════════════════════

/**
 * Resolves all {{query:"..."}} composition references in SQL to their MJQueryEntityExtended targets.
 *
 * This is the single entry point for composition resolution. Both dependency syncing
 * and passthrough parameter extraction consume the results.
 *
 * @throws If a referenced query does not exist in the metadata cache
 * @throws If a referenced query is not marked Reusable
 */
export function ResolveCompositionReferences(
    sql: string,
    queryName: string,
    allQueries: MJQueryEntityExtended[]
): ResolvedCompositionReference[] {
    const compositionEngine = new QueryCompositionEngine();
    if (!compositionEngine.HasCompositionTokens(sql)) return [];

    const tokens = compositionEngine.ParseCompositionTokens(sql);
    if (tokens.length === 0) return [];

    const resolved: ResolvedCompositionReference[] = [];

    for (const token of tokens) {
        const depQuery = ResolveQueryByNameAndCategory(token.QueryName, token.CategorySegments, allQueries);

        if (!depQuery) {
            throw new Error(
                `Query "${queryName}" references "${token.FullPath}" via {{query:"..."}} syntax, ` +
                `but no matching query was found in the metadata. ` +
                `Ensure the referenced query exists and has been saved before using it in composition.`
            );
        }

        if (!depQuery.Reusable) {
            throw new Error(
                `Query "${queryName}" references "${token.FullPath}" via composition syntax, ` +
                `but "${depQuery.Name}" is not marked as Reusable. ` +
                `Set Reusable=true on "${depQuery.Name}" before using it in {{query:"..."}} references.`
            );
        }

        const alias = ExtractAliasFromSQL(sql, token.FullToken);
        const { parameterMapping, passthroughMappings } = BuildParameterMappings(token.Parameters);

        resolved.push({
            depQuery,
            referencePath: token.FullPath,
            alias,
            parameterMapping,
            passthroughMappings,
        });
    }

    return resolved;
}

/**
 * Resolves a query by name and optional category path segments from the metadata cache.
 * Tries category-qualified lookup first, then falls back to name-only (if unambiguous).
 */
export function ResolveQueryByNameAndCategory(
    queryName: string,
    categorySegments: string[],
    allQueries: MJQueryEntityExtended[]
): MJQueryEntityExtended | undefined {
    const queryNameLower = queryName.toLowerCase();

    if (categorySegments.length > 0) {
        const expectedPath = `/${categorySegments.join('/')}/`;
        const match = allQueries.find(q =>
            q.Name.toLowerCase() === queryNameLower &&
            q.CategoryPath.toLowerCase() === expectedPath.toLowerCase()
        );
        if (match) return match;
    }

    const nameMatches = allQueries.filter(q => q.Name.toLowerCase() === queryNameLower);
    return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

/**
 * Builds the parameter mapping and extracts passthrough mappings from parsed composition parameters.
 */
export function BuildParameterMappings(
    params: Array<{ Name: string; StaticValue: string | null; PassThroughName: string | null }>
): {
    parameterMapping: Record<string, string> | null;
    passthroughMappings: Array<{ parentParamName: string; depParamName: string }>;
} {
    if (params.length === 0) return { parameterMapping: null, passthroughMappings: [] };

    const parameterMapping: Record<string, string> = {};
    const passthroughMappings: Array<{ parentParamName: string; depParamName: string }> = [];

    for (const param of params) {
        if (param.StaticValue !== null) {
            parameterMapping[param.Name] = param.StaticValue;
        } else if (param.PassThroughName !== null) {
            parameterMapping[param.Name] = `@${param.PassThroughName}`;
            passthroughMappings.push({
                parentParamName: param.PassThroughName,
                depParamName: param.Name,
            });
        }
    }

    return {
        parameterMapping: Object.keys(parameterMapping).length > 0 ? parameterMapping : null,
        passthroughMappings,
    };
}

/**
 * Extracts the SQL alias following a {{query:"..."}} token.
 * Returns null if no alias is found or the text following the token is a SQL keyword.
 */
export function ExtractAliasFromSQL(sql: string, fullToken: string): string | null {
    const tokenIndex = sql.indexOf(fullToken);
    if (tokenIndex < 0) return null;

    const afterToken = sql.substring(tokenIndex + fullToken.length);
    const aliasMatch = /^\s+(\w+)/i.exec(afterToken);

    if (aliasMatch) {
        const keywords = new Set([
            'ON', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
            'CROSS', 'FULL', 'GROUP', 'ORDER', 'HAVING', 'UNION', 'EXCEPT',
            'INTERSECT', 'LIMIT', 'OFFSET', 'FETCH',
        ]);
        if (!keywords.has(aliasMatch[1].toUpperCase())) {
            return aliasMatch[1];
        }
    }

    return null;
}


// ═══════════════════════════════════════════════════
// Passthrough Parameter Resolution
// ═══════════════════════════════════════════════════

/**
 * Extracts passthrough MJParameterInfo entries and PassthroughParamContext from resolved refs.
 * Inherits type, isRequired, defaultValue, description, and sampleValue from the dependency
 * query's parameter metadata when available.
 */
export function BuildPassthroughParams(
    resolvedRefs: ResolvedCompositionReference[]
): {
    params: MJParameterInfo[];
    contextMap: Map<string, PassthroughParamContext>;
} {
    const passthroughParams: MJParameterInfo[] = [];
    const contextMap = new Map<string, PassthroughParamContext>();
    const seenParamNames = new Set<string>();

    for (const ref of resolvedRefs) {
        for (const mapping of ref.passthroughMappings) {
            const nameLower = mapping.parentParamName.toLowerCase();
            if (seenParamNames.has(nameLower)) continue;
            seenParamNames.add(nameLower);

            const depParam = ref.depQuery.QueryParameters.find(
                p => p.Name.toLowerCase() === mapping.depParamName.toLowerCase()
            );

            passthroughParams.push({
                name: mapping.parentParamName,
                type: depParam ? MapQueryParamTypeToParserType(depParam.Type) : 'string',
                isRequired: depParam ? depParam.IsRequired : true,
                defaultValue: depParam?.DefaultValue ?? null,
                filters: [],
                usageLocations: [ref.referencePath],
            });

            contextMap.set(nameLower, {
                description: depParam?.Description ?? null,
                sampleValue: depParam?.SampleValue ?? null,
                depQueryName: ref.depQuery.Name,
                depParamName: mapping.depParamName,
            });
        }
    }

    return { params: passthroughParams, contextMap };
}

/**
 * Merges passthrough parameters into the deterministic parameter list,
 * skipping any that are already detected as direct template expressions.
 */
export function MergePassthroughParams(
    deterministicParams: MJParameterInfo[],
    passthroughParams: MJParameterInfo[]
): MJParameterInfo[] {
    if (passthroughParams.length === 0) return deterministicParams;

    const existingNames = new Set(deterministicParams.map(p => p.name.toLowerCase()));
    const merged = [...deterministicParams];

    for (const pt of passthroughParams) {
        if (!existingNames.has(pt.name.toLowerCase())) {
            merged.push(pt);
            existingNames.add(pt.name.toLowerCase());
        }
    }

    return merged;
}

/**
 * Maps a QueryParameterInfo.Type value to the MJParameterInfo type union.
 */
export function MapQueryParamTypeToParserType(
    type: 'string' | 'number' | 'date' | 'boolean' | 'array'
): MJParameterInfo['type'] {
    const validTypes = new Set<MJParameterInfo['type']>(['string', 'number', 'date', 'boolean', 'array']);
    return validTypes.has(type as MJParameterInfo['type']) ? (type as MJParameterInfo['type']) : 'string';
}


// ═══════════════════════════════════════════════════
// Field Resolution
// ═══════════════════════════════════════════════════

/**
 * Builds ExtractedField[] deterministically from the parsed SELECT columns.
 *
 * This is the PRIMARY deterministic field extraction path, handling explicit
 * column lists like `SELECT col1, col2 AS Alias, COUNT(*) AS Total`.
 * For each parsed column, it creates an ExtractedField with:
 *   - name: the output name (alias if present, otherwise source column)
 *   - isComputed: true for expression columns (aggregates, calculations)
 *   - sourceFieldName: the original column name (before AS alias)
 *
 * Returns null only if selectColumns is empty (e.g., a stored procedure call
 * or non-SELECT statement).
 */
export function BuildFieldsFromSelectColumns(
    selectColumns: SQLSelectColumn[]
): ExtractedField[] | null {
    if (selectColumns.length === 0) return null;

    // Skip if ALL columns are wildcards — BuildFieldsForSelectStar handles that
    if (selectColumns.every(col => col.SourceColumn === '*')) return null;

    return selectColumns
        .filter(col => col.SourceColumn !== '*')
        .map(col => buildFieldFromSelectColumn(col));
}

/**
 * Converts a single parsed SELECT column into an ExtractedField.
 */
function buildFieldFromSelectColumn(col: SQLSelectColumn): ExtractedField {
    return {
        name: col.OutputName,
        description: col.IsExpression
            ? `Computed column: ${col.SourceColumn}`
            : col.OutputName !== col.SourceColumn
                ? `${col.SourceColumn} (aliased as ${col.OutputName})`
                : col.OutputName,
        type: 'string', // default; enrichment stages refine this from entity/composition metadata
        optional: false,
        sourceFieldName: col.IsExpression ? null : col.SourceColumn,
        isComputed: col.IsExpression,
        isSummary: false,
    };
}

/**
 * Detects SELECT * and builds the complete field list deterministically
 * from entity metadata and/or composition ref fields.
 * Returns null if the SQL doesn't use SELECT * or if entities can't be resolved.
 */
export function BuildFieldsForSelectStar(
    sql: string,
    tableRefs: SQLTableReference[],
    selectColumns: SQLSelectColumn[],
    md: IMetadataProvider
): ExtractedField[] | null {
    const selectStarRegex = /\bSELECT\s+(?:(?:TOP\s+\d+|DISTINCT)\s+)?(\*|[\w.]+\.\*)\s+FROM\b/i;
    if (!selectStarRegex.test(sql)) return null;

    const expandedFields = expandFieldsFromEntities(tableRefs, md);

    if (expandedFields.length === 0) {
        expandFieldsFromCompositionRefs(sql, expandedFields, md);
    }

    return expandedFields.length > 0 ? expandedFields : null;
}

/**
 * Expands fields from entity metadata for table references in the SQL.
 */
function expandFieldsFromEntities(
    tableRefs: SQLTableReference[],
    md: IMetadataProvider
): ExtractedField[] {
    const expandedFields: ExtractedField[] = [];

    for (const tableRef of tableRefs) {
        const matchingEntity = findEntityByTableRef(md, tableRef);

        if (matchingEntity) {
            for (const entityField of matchingEntity.Fields) {
                if (!expandedFields.some(f => f.name === entityField.Name)) {
                    expandedFields.push(buildFieldFromEntityField(entityField, matchingEntity.Name));
                }
            }
        }
    }

    return expandedFields;
}

/**
 * Expands fields from composition references when no entity fields were found.
 */
function expandFieldsFromCompositionRefs(
    sql: string,
    expandedFields: ExtractedField[],
    md: IMetadataProvider
): void {
    const compositionRefs = SQLParser.ExtractCompositionRefs(sql);

    for (const ref of compositionRefs) {
        const referencedQuery = QueryEngine.Instance.Queries.find(q =>
            q.Name.toLowerCase() === ref.queryName.toLowerCase()
        );

        if (referencedQuery && referencedQuery.QueryFields.length > 0) {
            for (const qField of referencedQuery.QueryFields) {
                if (!expandedFields.some(f => f.name === qField.Name)) {
                    expandedFields.push(buildFieldFromQueryField(qField, md));
                }
            }
        }
    }
}

/**
 * Builds an ExtractedField from an entity field definition.
 */
function buildFieldFromEntityField(
    entityField: EntityInfo['Fields'][number],
    entityName: string
): ExtractedField {
    return {
        name: entityField.Name,
        description: entityField.Description || `${entityField.Name} field from ${entityName}`,
        type: TypeScriptTypeFromSQLType(entityField.Type).toLowerCase() as ExtractedField['type'],
        optional: false,
        sourceEntity: entityName,
        sourceFieldName: entityField.Name,
        isComputed: false,
        isSummary: false,
    };
}

/**
 * Builds an ExtractedField from a dependency query's field definition.
 */
function buildFieldFromQueryField(
    qField: MJQueryFieldEntity,
    md: IMetadataProvider
): ExtractedField {
    const sourceEntityName = qField.SourceEntityID
        ? findEntityNameByID(md, qField.SourceEntityID)
        : null;

    return {
        name: qField.Name,
        description: qField.Description || `${qField.Name} from query`,
        type: TypeScriptTypeFromSQLType(qField.SQLBaseType).toLowerCase() as ExtractedField['type'],
        optional: false,
        sourceEntity: sourceEntityName,
        sourceFieldName: qField.SourceFieldName || null,
        isComputed: qField.IsComputed || false,
        isSummary: qField.IsSummary || false,
    };
}

/**
 * Enriches extracted fields with deterministic SQL types from composed query field metadata.
 *
 * For queries that reference other queries via {{query:"..."}}, resolves field types
 * by matching field names against the dependency query's MJQueryFieldEntity.
 *
 * Uses the pre-parsed selectColumns for deterministic SELECT clause resolution,
 * which handles direct columns and AS aliases via AST parsing.
 */
export function EnrichFieldTypesFromCompositions(
    fields: ExtractedField[],
    resolvedRefs: ResolvedCompositionReference[],
    selectColumns: SQLSelectColumn[],
    md: IMetadataProvider
): ExtractedField[] {
    if (resolvedRefs.length === 0 || fields.length === 0) return fields;

    const aliasToRef = buildAliasToRefMap(resolvedRefs);
    const selectColumnMap = buildSelectColumnMap(selectColumns);
    const allDepFields = buildDependencyFieldLookup(resolvedRefs);

    return fields.map(field => {
        if (field.sqlBaseType && field.sqlFullType) return field;

        const matchedField = resolveFieldFromSelectColumns(field.name, selectColumnMap, aliasToRef)
            ?? allDepFields.get(field.name.toLowerCase());

        if (matchedField) {
            return applyQueryFieldMetadata(field, matchedField, md);
        }

        return field;
    });
}

/**
 * Enriches extracted fields with deterministic SQL types from entity view/table metadata.
 *
 * For queries that directly reference entity views (e.g., `FROM __mj.vwUsers u`),
 * resolves field types by matching field names against the entity's field metadata.
 *
 * Uses the pre-parsed selectColumns for deterministic SELECT clause resolution
 * and tableRefs for entity view resolution.
 */
export function EnrichFieldTypesFromEntityMetadata(
    fields: ExtractedField[],
    selectColumns: SQLSelectColumn[],
    tableRefs: SQLTableReference[],
    md: IMetadataProvider
): ExtractedField[] {
    if (fields.length === 0 || tableRefs.length === 0) return fields;

    const aliasToEntity = buildAliasToEntityMap(tableRefs, md);
    if (aliasToEntity.size === 0) return fields;

    const selectColumnMap = buildSelectColumnMap(selectColumns);
    const flatLookup = buildFlatEntityFieldLookup(aliasToEntity);

    return fields.map(field => {
        if (field.sqlBaseType && field.sqlFullType) return field;

        const matched = matchFieldToEntityMetadata(field.name, selectColumnMap, aliasToEntity, flatLookup);
        if (matched) {
            return {
                ...field,
                sqlBaseType: matched.field.Type,
                sqlFullType: matched.field.SQLFullType,
                sourceEntity: field.sourceEntity ?? matched.entityName,
                sourceFieldName: field.sourceFieldName ?? matched.field.Name,
            };
        }

        return field;
    });
}

/**
 * Expands wildcard (*) entries in the extracted fields list.
 * When a field has name="*" or sourceFieldName="*", expands it into
 * individual field entries by looking up the source from metadata.
 */
export function ExpandWildcardFields(
    fields: ExtractedField[],
    md: IMetadataProvider
): ExtractedField[] {
    const hasWildcard = fields.some(f => f.name === '*' || f.sourceFieldName === '*');
    if (!hasWildcard) return fields;

    const expandedFields: ExtractedField[] = [];

    for (const field of fields) {
        const isWildcard = field.name === '*' || field.sourceFieldName === '*';
        if (!isWildcard) {
            expandedFields.push(field);
            continue;
        }

        if (field.sourceEntity) {
            const expanded = expandWildcardFromSource(field, md);
            expandedFields.push(...expanded);
        } else {
            expandedFields.push(field);
        }
    }

    return expandedFields;
}


// ═══════════════════════════════════════════════════
// Entity Metadata Extraction
// ═══════════════════════════════════════════════════

/**
 * Extracts entity metadata from the SQL to provide context for parameter type inference.
 * Uses SQLParser for robust SQL parsing with MJ template support.
 */
export function ExtractEntityMetadataFromSQL(
    sql: string,
    tableRefs: SQLTableReference[],
    md: IMetadataProvider
): EntityMetadataEntry[] {
    const results: EntityMetadataEntry[] = [];

    try {
        const columnRefs = SQLParser.ExtractColumnRefs(sql, new SQLServerDialect());

        for (const tableRef of tableRefs) {
            const matchingEntity = findEntityByTableRef(md, tableRef);

            if (matchingEntity) {
                const relevantFields = extractRelevantFields(matchingEntity, tableRef, columnRefs);

                if (relevantFields.length > 0) {
                    results.push({
                        name: matchingEntity.Name,
                        schemaName: matchingEntity.SchemaName,
                        baseView: matchingEntity.BaseView,
                        fields: relevantFields,
                    });
                }
            }
        }

        return results;
    } catch (error) {
        console.warn(`Error in ExtractEntityMetadataFromSQL: ${error}`);
        return results;
    }
}


// ═══════════════════════════════════════════════════
// Dependency Validation
// ═══════════════════════════════════════════════════

/**
 * Detects circular dependencies by walking the dependency graph.
 * Returns a descriptive error string if a cycle is found, or null if clean.
 */
export function DetectDependencyCycles(
    queryID: string,
    queryName: string,
    proposedDeps: Array<{ dependsOnQueryID: string }>,
    allDependencies: MJQueryDependencyEntity[],
    allQueries: MJQueryEntityExtended[]
): string | null {
    for (const dep of proposedDeps) {
        const result = checkCycleFromDep(
            dep.dependsOnQueryID,
            queryID,
            queryName,
            [queryName],
            new Set<string>(),
            allDependencies,
            allQueries
        );
        if (result) return result;
    }

    return null;
}

/**
 * Recursively walks from a dependency node to detect if it leads back to the source query.
 */
function checkCycleFromDep(
    currentID: string,
    sourceID: string,
    sourceName: string,
    path: string[],
    visited: Set<string>,
    allDependencies: MJQueryDependencyEntity[],
    allQueries: MJQueryEntityExtended[]
): string | null {
    if (UUIDsEqual(currentID, sourceID)) {
        return [...path, sourceName].join(' \u2192 ');
    }
    if (visited.has(currentID)) return null;
    visited.add(currentID);

    const queryName = allQueries.find(q => UUIDsEqual(q.ID, currentID))?.Name || currentID;
    const updatedPath = [...path, queryName];

    const deps = allDependencies.filter(d => d.QueryID === currentID);
    for (const d of deps) {
        const result = checkCycleFromDep(
            d.DependsOnQueryID,
            sourceID,
            sourceName,
            updatedPath,
            visited,
            allDependencies,
            allQueries
        );
        if (result) return result;
    }

    return null;
}


// ═══════════════════════════════════════════════════
// Private Helpers — Composition Field Resolution
// ═══════════════════════════════════════════════════

/**
 * Resolves a field's output name to a MJQueryFieldEntity by using the parsed SELECT columns.
 *
 * Uses the SQLParser-extracted SELECT column map to find the source column and table qualifier,
 * then matches against the composition ref's dependency query fields.
 *
 * Handles:
 *   - Direct: `u.Name` -> OutputName="Name", SourceColumn="Name", TableQualifier="u"
 *   - AS alias: `e.Name AS EntityName` -> OutputName="EntityName", SourceColumn="Name", TableQualifier="e"
 */
function resolveFieldFromSelectColumns(
    fieldName: string,
    selectColumnMap: Map<string, SQLSelectColumn>,
    aliasToRef: Map<string, ResolvedCompositionReference>
): MJQueryFieldEntity | undefined {
    const selectCol = selectColumnMap.get(fieldName.toLowerCase());
    if (!selectCol || selectCol.IsExpression) return undefined;

    if (selectCol.TableQualifier) {
        const ref = aliasToRef.get(selectCol.TableQualifier.toLowerCase());
        if (ref) {
            const match = ref.depQuery.QueryFields.find(
                f => f.Name.toLowerCase() === selectCol.SourceColumn.toLowerCase()
            );
            if (match) return match;
        }
    }

    // No table qualifier — try all composition refs
    for (const ref of Array.from(aliasToRef.values())) {
        const match = ref.depQuery.QueryFields.find(
            f => f.Name.toLowerCase() === selectCol.SourceColumn.toLowerCase()
        );
        if (match) return match;
    }

    return undefined;
}

/**
 * Builds a flat field name -> MJQueryFieldEntity lookup across all dependency queries.
 * If the same field name exists in multiple dependencies, the first match wins.
 */
function buildDependencyFieldLookup(
    resolvedRefs: ResolvedCompositionReference[]
): Map<string, MJQueryFieldEntity> {
    const lookup = new Map<string, MJQueryFieldEntity>();

    for (const ref of resolvedRefs) {
        for (const field of ref.depQuery.QueryFields) {
            const nameLower = field.Name.toLowerCase();
            if (!lookup.has(nameLower)) {
                lookup.set(nameLower, field);
            }
        }
    }

    return lookup;
}

/**
 * Applies matched MJQueryFieldEntity metadata onto an ExtractedField.
 */
function applyQueryFieldMetadata(
    field: ExtractedField,
    matchedField: MJQueryFieldEntity,
    md: IMetadataProvider
): ExtractedField {
    return {
        ...field,
        sqlBaseType: matchedField.SQLBaseType,
        sqlFullType: matchedField.SQLFullType,
        sourceEntity: field.sourceEntity ?? (matchedField.SourceEntityID
            ? findEntityNameByID(md, matchedField.SourceEntityID)
            : null),
        sourceFieldName: field.sourceFieldName ?? matchedField.SourceFieldName,
        isComputed: field.isComputed ?? matchedField.IsComputed ?? false,
        isSummary: field.isSummary ?? matchedField.IsSummary ?? false,
    };
}


// ═══════════════════════════════════════════════════
// Private Helpers — Entity Metadata Field Resolution
// ═══════════════════════════════════════════════════

/** Shape for entity field + entity name pairs used in flat lookups */
interface EntityFieldMatch {
    field: EntityInfo['Fields'][number];
    entityName: string;
}

/**
 * Builds alias -> entity map from table refs by matching against metadata entities.
 */
function buildAliasToEntityMap(
    tableRefs: SQLTableReference[],
    md: IMetadataProvider
): Map<string, { entity: EntityInfo }> {
    const aliasToEntity = new Map<string, { entity: EntityInfo }>();

    for (const tableRef of tableRefs) {
        const matchingEntity = findEntityByTableRef(md, tableRef);
        if (matchingEntity) {
            aliasToEntity.set(tableRef.Alias.toLowerCase(), { entity: matchingEntity });
        }
    }

    return aliasToEntity;
}

/**
 * Builds a flat unqualified field lookup from all entities in the alias map.
 * First entity wins for ambiguous field names.
 */
function buildFlatEntityFieldLookup(
    aliasToEntity: Map<string, { entity: EntityInfo }>
): Map<string, EntityFieldMatch> {
    const flatLookup = new Map<string, EntityFieldMatch>();

    for (const { entity } of Array.from(aliasToEntity.values())) {
        for (const f of entity.Fields) {
            const nameLower = f.Name.toLowerCase();
            if (!flatLookup.has(nameLower)) {
                flatLookup.set(nameLower, { field: f, entityName: entity.Name });
            }
        }
    }

    return flatLookup;
}

/**
 * Matches a field name to entity metadata via the parsed SELECT columns.
 * Tries alias-qualified match first, then unqualified by source column, then by output name.
 */
function matchFieldToEntityMetadata(
    fieldName: string,
    selectColumnMap: Map<string, SQLSelectColumn>,
    aliasToEntity: Map<string, { entity: EntityInfo }>,
    flatLookup: Map<string, EntityFieldMatch>
): EntityFieldMatch | undefined {
    const selectCol = selectColumnMap.get(fieldName.toLowerCase());
    let matched: EntityFieldMatch | undefined;

    if (selectCol && !selectCol.IsExpression) {
        matched = matchViaTableQualifier(selectCol, aliasToEntity);
        if (!matched) {
            matched = flatLookup.get(selectCol.SourceColumn.toLowerCase());
        }
    }

    if (!matched) {
        matched = flatLookup.get(fieldName.toLowerCase());
    }

    return matched;
}

/**
 * Tries to match a select column to an entity field via its table qualifier.
 */
function matchViaTableQualifier(
    selectCol: SQLSelectColumn,
    aliasToEntity: Map<string, { entity: EntityInfo }>
): EntityFieldMatch | undefined {
    if (!selectCol.TableQualifier) return undefined;

    const entityEntry = aliasToEntity.get(selectCol.TableQualifier.toLowerCase());
    if (!entityEntry) return undefined;

    const entityField = entityEntry.entity.Fields.find(
        f => f.Name.toLowerCase() === selectCol.SourceColumn.toLowerCase()
    );

    if (entityField) {
        return { field: entityField, entityName: entityEntry.entity.Name };
    }

    return undefined;
}


// ═══════════════════════════════════════════════════
// Private Helpers — Wildcard Expansion
// ═══════════════════════════════════════════════════

/**
 * Expands a wildcard field from its source entity or composed query.
 * Returns the original field in an array if no expansion is possible.
 */
function expandWildcardFromSource(
    field: ExtractedField,
    md: IMetadataProvider
): ExtractedField[] {
    const sourceEntityInfo = FindEntityByName(md, field.sourceEntity!);
    if (sourceEntityInfo) {
        return expandFromEntityInfo(sourceEntityInfo, field.optional);
    }

    const composedQuery = QueryEngine.Instance.Queries.find(q =>
        q.Name.toLowerCase() === field.sourceEntity!.toLowerCase()
    );
    if (composedQuery && composedQuery.QueryFields.length > 0) {
        return expandFromComposedQuery(composedQuery, field.optional, md);
    }

    return [field];
}

/**
 * Expands all fields from an entity into ExtractedField entries.
 */
function expandFromEntityInfo(
    entity: EntityInfo,
    optional: boolean
): ExtractedField[] {
    return entity.Fields.map(entityField => ({
        name: entityField.Name,
        description: entityField.Description || `${entityField.Name} field from ${entity.Name}`,
        type: TypeScriptTypeFromSQLType(entityField.Type).toLowerCase() as ExtractedField['type'],
        optional,
        sourceEntity: entity.Name,
        sourceFieldName: entityField.Name,
        isComputed: false,
        isSummary: false,
    }));
}

/**
 * Expands all fields from a composed query into ExtractedField entries.
 */
function expandFromComposedQuery(
    query: MJQueryEntityExtended,
    optional: boolean,
    md: IMetadataProvider
): ExtractedField[] {
    return query.QueryFields.map(qField => ({
        name: qField.Name,
        description: qField.Description || `${qField.Name} from query "${query.Name}"`,
        type: TypeScriptTypeFromSQLType(qField.SQLBaseType).toLowerCase() as ExtractedField['type'],
        optional,
        sourceEntity: qField.SourceEntityID
            ? findEntityNameByID(md, qField.SourceEntityID)
            : null,
        sourceFieldName: qField.SourceFieldName || null,
        isComputed: qField.IsComputed || false,
        isSummary: qField.IsSummary || false,
    }));
}


// ═══════════════════════════════════════════════════
// Private Helpers — Entity Metadata Extraction
// ═══════════════════════════════════════════════════

/**
 * Extracts the relevant fields from an entity for a given table reference,
 * filtering to columns actually referenced in the SQL plus primary keys.
 * Caps at 20 fields to avoid excessive metadata.
 */
function extractRelevantFields(
    entity: EntityInfo,
    tableRef: SQLTableReference,
    columnRefs: Array<{ ColumnName: string; TableQualifier: string | null }>
): Array<{ name: string; type: string; isPrimaryKey: boolean }> {
    return entity.Fields
        .filter(f => isFieldReferencedInSQL(f, tableRef, columnRefs))
        .slice(0, 20)
        .map(f => ({
            name: f.Name,
            type: f.Type,
            isPrimaryKey: f.IsPrimaryKey,
        }));
}

/**
 * Checks whether a field is referenced in the SQL (by column refs) or is a primary key.
 */
function isFieldReferencedInSQL(
    field: EntityInfo['Fields'][number],
    tableRef: SQLTableReference,
    columnRefs: Array<{ ColumnName: string; TableQualifier: string | null }>
): boolean {
    const fieldLower = field.Name.toLowerCase();

    for (const colRef of columnRefs) {
        const colLower = colRef.ColumnName.toLowerCase();
        if (colLower === fieldLower) return true;
        if (colRef.TableQualifier) {
            const qualLower = colRef.TableQualifier.toLowerCase();
            if ((qualLower === tableRef.Alias.toLowerCase() ||
                 qualLower === tableRef.TableName.toLowerCase()) &&
                colLower === fieldLower) {
                return true;
            }
        }
    }

    return field.IsPrimaryKey;
}


// ═══════════════════════════════════════════════════
// Private Helpers — Shared Utilities
// ═══════════════════════════════════════════════════

/**
 * Finds an entity by name, checking both Name (which may have "MJ: " prefix) and DisplayName.
 */
export function FindEntityByName(md: IMetadataProvider, name: string): EntityInfo | undefined {
    const lower = name.toLowerCase();
    return md.Entities.find(e =>
        e.Name.toLowerCase() === lower || (e.DisplayName && e.DisplayName.toLowerCase() === lower)
    );
}

/**
 * Finds an entity name by its ID from the metadata provider.
 */
function findEntityNameByID(md: IMetadataProvider, entityID: string): string | null {
    const entity = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
    return entity?.Name ?? null;
}

/**
 * Finds an entity by matching a SQL table reference against BaseView/BaseTable + SchemaName.
 */
function findEntityByTableRef(md: IMetadataProvider, tableRef: SQLTableReference): EntityInfo | undefined {
    return md.Entities.find(e =>
        (e.BaseView.toLowerCase() === tableRef.TableName.toLowerCase() ||
         e.BaseTable.toLowerCase() === tableRef.TableName.toLowerCase()) &&
        e.SchemaName.toLowerCase() === tableRef.SchemaName.toLowerCase()
    );
}

/**
 * Builds an output name -> SQLSelectColumn map for quick lookup.
 */
function buildSelectColumnMap(selectColumns: SQLSelectColumn[]): Map<string, SQLSelectColumn> {
    const map = new Map<string, SQLSelectColumn>();
    for (const col of selectColumns) {
        map.set(col.OutputName.toLowerCase(), col);
    }
    return map;
}

/**
 * Builds an alias -> resolved composition ref map.
 */
function buildAliasToRefMap(
    resolvedRefs: ResolvedCompositionReference[]
): Map<string, ResolvedCompositionReference> {
    const aliasToRef = new Map<string, ResolvedCompositionReference>();
    for (const ref of resolvedRefs) {
        if (ref.alias) {
            aliasToRef.set(ref.alias.toLowerCase(), ref);
        }
    }
    return aliasToRef;
}
