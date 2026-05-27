import { IMetadataProvider, IRunViewProvider, LogError, RunMaybeSerial, UserInfo } from "@memberjunction/core";
import {
    MJQueryParameterEntity,
    MJQueryFieldEntity,
    MJQueryEntityEntity,
    MJQueryDependencyEntity,
    QueryEngine,
} from "@memberjunction/core-entities";
import { UUIDsEqual } from "@memberjunction/global";
import type {
    ExtractedField,
    ExtractedParameter,
    EntityMetadataEntry,
    ResolvedCompositionReference,
} from "./types";

// =============================================================================
// Database sync engine for the query extraction pipeline.
//
// Each function loads existing records via RunView, computes the add/update/remove
// delta, and executes all mutations in parallel via Promise.all.
// =============================================================================

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Finds an entity by name, checking both Name (which may have "MJ: " prefix) and DisplayName.
 * The AI often returns entity names without the "MJ: " prefix, so we need to match both.
 */
function findEntityByName(
    md: IMetadataProvider,
    name: string
): ReturnType<typeof md.Entities.find> {
    const lower = name.toLowerCase();
    return md.Entities.find(
        e => e.Name.toLowerCase() === lower || (e.DisplayName && e.DisplayName.toLowerCase() === lower)
    );
}

/**
 * Normalizes an extracted parameter type to the set of values the database schema supports.
 * Returns the normalized type and a boolean indicating whether a warning should be logged.
 */
function normalizeParamType(
    rawType: string | undefined
): { type: 'array' | 'boolean' | 'string' | 'date' | 'number'; isObject: boolean; isUnknown: boolean } {
    const normalized = rawType?.toLowerCase();
    const validTypes = new Set<'array' | 'boolean' | 'string' | 'date' | 'number'>([
        'array', 'boolean', 'string', 'date', 'number',
    ]);

    if (normalized && validTypes.has(normalized as 'array' | 'boolean' | 'string' | 'date' | 'number')) {
        return { type: normalized as 'array' | 'boolean' | 'string' | 'date' | 'number', isObject: false, isUnknown: false };
    }
    if (normalized === 'object') {
        return { type: 'string', isObject: true, isUnknown: false };
    }
    return { type: 'string', isObject: false, isUnknown: true };
}

/**
 * Maps a generic field type to a SQL base/full type pair.
 */
function defaultSQLTypesForField(fieldType: string): { baseType: string; fullType: string } {
    switch (fieldType) {
        case 'number':
            return { baseType: 'decimal', fullType: 'decimal(18,2)' };
        case 'date':
            return { baseType: 'datetime', fullType: 'datetime' };
        case 'boolean':
            return { baseType: 'bit', fullType: 'bit' };
        default:
            return { baseType: 'nvarchar', fullType: 'nvarchar(MAX)' };
    }
}

// ---------------------------------------------------------------------------
// SyncParameters
// ---------------------------------------------------------------------------

/**
 * Synchronizes extracted query parameters with the database.
 * Filters out "query" params (composition token safety net), handles add/update/remove,
 * and maps types to database-supported types.
 */
export async function SyncParameters(
    queryID: string,
    extractedParams: ExtractedParameter[],
    contextUser: UserInfo,
    metadataProvider: IMetadataProvider,
    runViewProvider: IRunViewProvider,
    isSaved: boolean
): Promise<void> {
    // Filter out any parameter named "query" that came from {{query:"..."}} composition tokens.
    const filteredParams = extractedParams.filter(p => p.name !== 'query');

    try {
        const existingParams = loadExistingRecords<MJQueryParameterEntity>(
            'MJ: Query Parameters', queryID, runViewProvider, contextUser, isSaved
        );

        const extractedParamNames = filteredParams.map(p => p.name.toLowerCase());

        const paramsToAdd = filteredParams.filter(
            p => !existingParams.some(ep => ep.Name.toLowerCase() === p.name.toLowerCase())
        );
        const paramsToUpdate = existingParams.filter(
            ep => filteredParams.some(p => p.name.toLowerCase() === ep.Name.toLowerCase())
        );
        const paramsToRemove = existingParams.filter(
            ep => !extractedParamNames.includes(ep.Name.toLowerCase())
        );

        const factories: (() => Promise<boolean>)[] = [];

        // Add new parameters
        for (const param of paramsToAdd) {
            const newParam = await metadataProvider.GetEntityObject<MJQueryParameterEntity>(
                'MJ: Query Parameters', contextUser
            );
            applyParameterValues(newParam, queryID, param);
            factories.push(() => newParam.Save());
        }

        // Update existing parameters if properties changed
        for (const existingParam of paramsToUpdate) {
            const extractedParam = filteredParams.find(
                p => p.name.toLowerCase() === existingParam.Name.toLowerCase()
            );
            if (extractedParam && updateParameterIfChanged(existingParam, extractedParam)) {
                factories.push(() => existingParam.Save());
            }
        }

        // Remove stale parameters
        for (const paramToRemove of paramsToRemove) {
            factories.push(() => paramToRemove.Delete());
        }

        await RunMaybeSerial(metadataProvider, factories);
    } catch (e) {
        LogError(`Failed to sync parameters for query ${queryID}:`, e);
        throw e;
    }
}

/**
 * Applies extracted parameter values to a new MJQueryParameterEntity.
 */
function applyParameterValues(
    entity: MJQueryParameterEntity,
    queryID: string,
    param: ExtractedParameter
): void {
    entity.QueryID = queryID;
    entity.Name = param.name;

    const { type, isObject, isUnknown } = normalizeParamType(param.type);
    if (isObject) {
        console.log(`Parameter "${param.name}" is type "object", storing as "string" (runtime will handle object validation)`);
    } else if (isUnknown) {
        console.warn(`Unknown parameter type "${param.type}" for parameter "${param.name}", defaulting to "string"`);
    }
    entity.Type = type;

    entity.IsRequired = param.isRequired;
    entity.DefaultValue = param.defaultValue;
    entity.Description = param.description;
    entity.SampleValue = param.sampleValue;
    entity.DetectionMethod = 'AI';
}

/**
 * Updates an existing parameter entity from extracted data if any property changed.
 * Returns true if changes were detected (and the entity was mutated).
 */
function updateParameterIfChanged(
    existing: MJQueryParameterEntity,
    extracted: ExtractedParameter
): boolean {
    let hasChanges = false;

    const { type: targetType } = normalizeParamType(extracted.type);
    if (existing.Type !== targetType) {
        existing.Type = targetType;
        hasChanges = true;
    }
    if (existing.IsRequired !== extracted.isRequired) {
        existing.IsRequired = extracted.isRequired;
        hasChanges = true;
    }
    if (existing.DefaultValue !== extracted.defaultValue) {
        existing.DefaultValue = extracted.defaultValue;
        hasChanges = true;
    }
    if (existing.Description !== extracted.description) {
        existing.Description = extracted.description;
        hasChanges = true;
    }
    if (existing.SampleValue !== extracted.sampleValue) {
        existing.SampleValue = extracted.sampleValue;
        hasChanges = true;
    }
    if (existing.DetectionMethod !== 'AI') {
        existing.DetectionMethod = 'AI';
        hasChanges = true;
    }

    return hasChanges;
}

// ---------------------------------------------------------------------------
// SyncFields
// ---------------------------------------------------------------------------

/**
 * Synchronizes extracted query fields with the database.
 * Expands wildcards, maps ExtractedField to MJQueryFieldEntity with sqlBaseType/sqlFullType override,
 * handles add/update/remove.
 */
export async function SyncFields(
    queryID: string,
    extractedFields: ExtractedField[],
    contextUser: UserInfo,
    metadataProvider: IMetadataProvider,
    runViewProvider: IRunViewProvider,
    isSaved: boolean
): Promise<void> {
    try {
        const existingFields = loadExistingRecords<MJQueryFieldEntity>(
            'MJ: Query Fields', queryID, runViewProvider, contextUser, isSaved
        );

        const fieldNamesToSync = extractedFields.map(f => f.name.toLowerCase());

        const fieldsToAdd = extractedFields.filter(
            f => !existingFields.some(ef => ef.Name.toLowerCase() === f.name.toLowerCase())
        );
        const fieldsToUpdate = existingFields.filter(
            ef => extractedFields.some(f => f.name.toLowerCase() === ef.Name.toLowerCase())
        );
        const fieldsToRemove = existingFields.filter(
            ef => !fieldNamesToSync.includes(ef.Name.toLowerCase())
        );

        const factories: (() => Promise<boolean>)[] = [];

        // Add new fields
        for (let i = 0; i < fieldsToAdd.length; i++) {
            const field = fieldsToAdd[i];
            const newField = await metadataProvider.GetEntityObject<MJQueryFieldEntity>(
                'MJ: Query Fields', contextUser
            );
            applyFieldValues(newField, queryID, field, i + 1, metadataProvider);
            factories.push(() => newField.Save());
        }

        // Update existing fields if properties changed
        for (const existingField of fieldsToUpdate) {
            const extractedField = extractedFields.find(
                f => f.name.toLowerCase() === existingField.Name.toLowerCase()
            );
            if (extractedField) {
                const globalIndex = extractedFields.indexOf(extractedField);
                if (updateFieldIfChanged(existingField, extractedField, globalIndex + 1, metadataProvider)) {
                    factories.push(() => existingField.Save());
                }
            }
        }

        // Remove stale fields
        for (const fieldToRemove of fieldsToRemove) {
            factories.push(() => fieldToRemove.Delete());
        }

        await RunMaybeSerial(metadataProvider, factories);
    } catch (e) {
        LogError(`Failed to sync fields for query ${queryID}:`, e);
        throw e;
    }
}

/**
 * Applies extracted field values to a new MJQueryFieldEntity.
 */
function applyFieldValues(
    entity: MJQueryFieldEntity,
    queryID: string,
    field: ExtractedField,
    sequence: number,
    md: IMetadataProvider
): void {
    entity.QueryID = queryID;
    entity.Name = field.name;
    entity.Description = field.description;
    entity.Sequence = sequence;

    // Use deterministic SQL types when available, otherwise fall back to generic type mapping.
    if (field.sqlBaseType && field.sqlFullType) {
        entity.SQLBaseType = field.sqlBaseType;
        entity.SQLFullType = field.sqlFullType;
    } else {
        const { baseType, fullType } = defaultSQLTypesForField(field.type);
        entity.SQLBaseType = baseType;
        entity.SQLFullType = fullType;
    }

    entity.IsComputed = field.isComputed || field.dynamicName || false;
    entity.IsSummary = field.isSummary || false;
    if (field.computationDescription) {
        entity.ComputationDescription = field.computationDescription;
    }

    // Set source entity tracking
    if (field.sourceEntity) {
        const sourceEntityInfo = findEntityByName(md, field.sourceEntity);
        if (sourceEntityInfo) {
            entity.SourceEntityID = sourceEntityInfo.ID;
        }
    }
    entity.SourceFieldName = field.sourceFieldName || (field.dynamicName ? field.name : null);
}

/**
 * Updates an existing field entity from extracted data if any property changed.
 * Returns true if changes were detected (and the entity was mutated).
 */
function updateFieldIfChanged(
    existing: MJQueryFieldEntity,
    extracted: ExtractedField,
    sequence: number,
    md: IMetadataProvider
): boolean {
    let hasChanges = false;

    if (existing.Description !== extracted.description) {
        existing.Description = extracted.description;
        hasChanges = true;
    }

    const newIsComputed = extracted.isComputed || extracted.dynamicName || false;
    if (existing.IsComputed !== newIsComputed) {
        existing.IsComputed = newIsComputed;
        hasChanges = true;
    }

    const newIsSummary = extracted.isSummary || false;
    if (existing.IsSummary !== newIsSummary) {
        existing.IsSummary = newIsSummary;
        hasChanges = true;
    }

    if (extracted.computationDescription && existing.ComputationDescription !== extracted.computationDescription) {
        existing.ComputationDescription = extracted.computationDescription;
        hasChanges = true;
    }

    // Update source entity tracking
    if (extracted.sourceEntity) {
        const sourceEntityInfo = findEntityByName(md, extracted.sourceEntity);
        if (sourceEntityInfo && !UUIDsEqual(existing.SourceEntityID, sourceEntityInfo.ID)) {
            existing.SourceEntityID = sourceEntityInfo.ID;
            hasChanges = true;
        }
    } else if (existing.SourceEntityID != null) {
        existing.SourceEntityID = null;
        hasChanges = true;
    }

    const newSourceFieldName = extracted.sourceFieldName || (extracted.dynamicName ? extracted.name : null);
    if (existing.SourceFieldName !== newSourceFieldName) {
        existing.SourceFieldName = newSourceFieldName;
        hasChanges = true;
    }

    if (existing.Sequence !== sequence) {
        existing.Sequence = sequence;
        hasChanges = true;
    }

    // Update SQL types if deterministic types are available
    if (extracted.sqlBaseType && extracted.sqlFullType) {
        if (existing.SQLBaseType !== extracted.sqlBaseType) {
            existing.SQLBaseType = extracted.sqlBaseType;
            hasChanges = true;
        }
        if (existing.SQLFullType !== extracted.sqlFullType) {
            existing.SQLFullType = extracted.sqlFullType;
            hasChanges = true;
        }
    }

    return hasChanges;
}

// ---------------------------------------------------------------------------
// SyncEntities
// ---------------------------------------------------------------------------

/**
 * Synchronizes extracted entity metadata entries with QueryEntity records in the database.
 * Matches by entity ID, handles add/remove.
 */
export async function SyncEntities(
    queryID: string,
    entityMetadata: EntityMetadataEntry[],
    contextUser: UserInfo,
    metadataProvider: IMetadataProvider,
    runViewProvider: IRunViewProvider,
    isSaved: boolean
): Promise<void> {
    try {
        const existingEntities = loadExistingRecords<MJQueryEntityEntity>(
            'MJ: Query Entities', queryID, runViewProvider, contextUser, isSaved
        );

        // Map extracted entries to MJ entity IDs
        const entityMappings = entityMetadata
            .map(extracted => {
                const matchingEntity = metadataProvider.Entities.find(
                    e => e.Name === extracted.name &&
                         e.SchemaName.toLowerCase() === extracted.schemaName.toLowerCase()
                );
                if (matchingEntity) {
                    return { extracted, entityID: matchingEntity.ID, entityName: matchingEntity.Name };
                }
                return null;
            })
            .filter((m): m is NonNullable<typeof m> => m !== null);

        const entitiesToAdd = entityMappings.filter(
            mapping => !existingEntities.some(ee => UUIDsEqual(ee.EntityID, mapping.entityID))
        );
        const entitiesToRemove = existingEntities.filter(
            ee => !entityMappings.some(mapping => UUIDsEqual(mapping.entityID, ee.EntityID))
        );

        const factories: (() => Promise<boolean>)[] = [];

        for (const mapping of entitiesToAdd) {
            const newEntity = await metadataProvider.GetEntityObject<MJQueryEntityEntity>(
                'MJ: Query Entities', contextUser
            );
            newEntity.QueryID = queryID;
            newEntity.EntityID = mapping.entityID;
            newEntity.DetectionMethod = 'AI';
            newEntity.AutoDetectConfidenceScore = 1.0;
            factories.push(() => newEntity.Save());
        }

        for (const entityToRemove of entitiesToRemove) {
            factories.push(() => entityToRemove.Delete());
        }

        await RunMaybeSerial(metadataProvider, factories);
    } catch (e) {
        LogError(`Failed to sync entities for query ${queryID}:`, e);
        throw e;
    }
}

// ---------------------------------------------------------------------------
// SyncDependencies
// ---------------------------------------------------------------------------

/**
 * Converts ResolvedCompositionReference[] to dependency records, checks for cycles, and syncs.
 * Matches by DependsOnQueryID + ReferencePath for uniqueness.
 */
export async function SyncDependencies(
    queryID: string,
    resolvedRefs: ResolvedCompositionReference[],
    contextUser: UserInfo,
    metadataProvider: IMetadataProvider,
    runViewProvider: IRunViewProvider,
    isSaved: boolean
): Promise<void> {
    if (resolvedRefs.length === 0) {
        await RemoveAllRecords(queryID, 'MJ: Query Dependencies', contextUser, runViewProvider, isSaved, metadataProvider);
        return;
    }

    // Map resolved refs to the shape needed for sync
    const extractedDeps = resolvedRefs.map(ref => ({
        dependsOnQueryID: ref.depQuery.ID,
        referencePath: ref.referencePath,
        alias: ref.alias,
        parameterMapping: ref.parameterMapping,
    }));

    try {
        const existingDeps = loadExistingRecords<MJQueryDependencyEntity>(
            'MJ: Query Dependencies', queryID, runViewProvider, contextUser, isSaved
        );

        const depsToAdd = extractedDeps.filter(
            d => !existingDeps.some(
                ed => UUIDsEqual(ed.DependsOnQueryID, d.dependsOnQueryID) &&
                      ed.ReferencePath === d.referencePath
            )
        );
        const depsToUpdate = existingDeps.filter(
            ed => extractedDeps.some(
                d => UUIDsEqual(ed.DependsOnQueryID, d.dependsOnQueryID) &&
                     ed.ReferencePath === d.referencePath
            )
        );
        const depsToRemove = existingDeps.filter(
            ed => !extractedDeps.some(
                d => UUIDsEqual(ed.DependsOnQueryID, d.dependsOnQueryID) &&
                     ed.ReferencePath === d.referencePath
            )
        );

        const factories: (() => Promise<boolean>)[] = [];

        // Add new dependencies
        for (const dep of depsToAdd) {
            const newDep = await metadataProvider.GetEntityObject<MJQueryDependencyEntity>(
                'MJ: Query Dependencies', contextUser
            );
            newDep.QueryID = queryID;
            newDep.DependsOnQueryID = dep.dependsOnQueryID;
            newDep.ReferencePath = dep.referencePath;
            newDep.Alias = dep.alias;
            newDep.ParameterMapping = dep.parameterMapping ? JSON.stringify(dep.parameterMapping) : null;
            newDep.DetectionMethod = 'Auto';
            factories.push(() => newDep.Save());
        }

        // Update existing dependencies if properties changed
        for (const existingDep of depsToUpdate) {
            const extractedDep = extractedDeps.find(
                d => UUIDsEqual(existingDep.DependsOnQueryID, d.dependsOnQueryID) &&
                     existingDep.ReferencePath === d.referencePath
            );
            if (extractedDep && updateDependencyIfChanged(existingDep, extractedDep)) {
                factories.push(() => existingDep.Save());
            }
        }

        // Remove stale dependencies
        for (const depToRemove of depsToRemove) {
            factories.push(() => depToRemove.Delete());
        }

        await RunMaybeSerial(metadataProvider, factories);
    } catch (e) {
        LogError(`Failed to sync dependencies for query ${queryID}:`, e);
        throw e;
    }
}

/**
 * Updates an existing dependency entity from extracted data if any property changed.
 * Returns true if changes were detected (and the entity was mutated).
 */
function updateDependencyIfChanged(
    existing: MJQueryDependencyEntity,
    extracted: { alias: string | null; parameterMapping: Record<string, string> | null }
): boolean {
    let hasChanges = false;

    if (existing.Alias !== extracted.alias) {
        existing.Alias = extracted.alias;
        hasChanges = true;
    }

    const newMapping = extracted.parameterMapping ? JSON.stringify(extracted.parameterMapping) : null;
    if (existing.ParameterMapping !== newMapping) {
        existing.ParameterMapping = newMapping;
        hasChanges = true;
    }

    return hasChanges;
}

// ---------------------------------------------------------------------------
// RemoveAllRecords
// ---------------------------------------------------------------------------

/**
 * Generic removal: deletes all records of a given entity type that belong to a query.
 * Used for cleanup when SQL is empty or when no items of a type remain.
 */
export async function RemoveAllRecords(
    queryID: string,
    entityName: string,
    contextUser: UserInfo,
    runViewProvider: IRunViewProvider,
    isSaved: boolean,
    metadataProvider?: IMetadataProvider
): Promise<void> {
    try {
        if (!isSaved) return;

        const existingResult = await runViewProvider.RunView({
            EntityName: entityName,
            ExtraFilter: `QueryID='${queryID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!existingResult.Success) {
            throw new Error(`Failed to load existing ${entityName}: ${existingResult.ErrorMessage}`);
        }

        const records = (existingResult.Results || []) as Array<{ Delete: () => Promise<boolean> }>;
        const deleteFactories = records.map(record => () => record.Delete());

        await RunMaybeSerial(metadataProvider, deleteFactories);
    } catch (e) {
        LogError(`Failed to remove ${entityName} for query ${queryID}:`, e);
        throw e;
    }
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/**
 * Loads all existing records of a given entity type for a query.
 * Returns an empty array if the query has not been saved yet.
 */
/**
 * Loads existing child records for a query from QueryEngine's in-memory cache.
 * This avoids redundant RunView calls — QueryEngine already has all query child
 * data loaded and auto-refreshes via BaseEntity events.
 */
function loadExistingRecords<T extends { QueryID: string }>(
    entityName: string,
    queryID: string,
    _runViewProvider: IRunViewProvider,
    _contextUser: UserInfo,
    isSaved: boolean
): T[] {
    if (!isSaved) return [];

    const qe = QueryEngine.Instance;
    switch (entityName) {
        case 'MJ: Query Parameters':
            return qe.GetQueryParameters(queryID) as unknown as T[];
        case 'MJ: Query Fields':
            return qe.GetQueryFields(queryID) as unknown as T[];
        case 'MJ: Query Entities':
            return qe.QueryEntities.filter(e => UUIDsEqual(e.QueryID, queryID)) as unknown as T[];
        case 'MJ: Query Dependencies':
            return qe.Dependencies.filter(d => UUIDsEqual(d.QueryID, queryID)) as unknown as T[];
        default:
            return [];
    }
}
