import { RunMaybeSerial } from "@memberjunction/core";
import type { BaseEntity, IMetadataProvider, IRunViewProvider, UserInfo } from "@memberjunction/core";
import type {
    MJQueryDependencyEntity,
    MJQueryEntityEntity,
    MJQueryFieldEntity,
    MJQueryParameterEntity,
} from "@memberjunction/core-entities";
import { EscapeSQLString, NormalizeUUID, UUIDsEqual } from "@memberjunction/global";
import type {
    QueryDependencyFact,
    QueryEntityFact,
    QueryExtractionResult,
    QueryFieldFact,
    QueryParameterFact,
} from "./extractionTypes";

/** Where the child rows are written, and as whom. */
export interface ChildRowWriteContext {
    readonly QueryID: string;
    /** The caller's provider, so the writes join the caller's transaction. */
    readonly Provider: IMetadataProvider & IRunViewProvider;
    /** The user the rows are read and written as: the system user for save-triggered extraction. */
    readonly User: UserInfo;
    /** Work out and report the changes without writing anything. */
    readonly DryRun?: boolean;
    /** The name a Query Entities change is reported under, for an entity ID; the ID when omitted. */
    readonly EntityName?: (entityID: string) => string;
}

/** The child collection of a query a row belongs to. */
export type QueryChildCollection = 'Fields' | 'Parameters' | 'Entities' | 'Dependencies';

/** One child row the writes add, update or remove. */
export interface ChildRowChange {
    readonly Collection: QueryChildCollection;
    readonly Action: 'Added' | 'Updated' | 'Removed';
    /** The field or parameter name, the entity name, or the dependency's reference path. */
    readonly Name: string;
    /** For an update, the columns that change. */
    readonly ChangedColumns: readonly string[];
    /** For a field row, the entity field its output column comes from, when it maps to one. */
    readonly SourceEntityFieldID: string | null;
}

/** What the writes changed, and which rows still have no description. */
export interface ChildRowWriteSummary {
    Added: number;
    Updated: number;
    Removed: number;
    /** Every row added, updated or removed, in write order. */
    readonly Changes: ChildRowChange[];
    /** Authored parameters the SQL no longer uses: kept, and flagged on the query. */
    readonly FlaggedParameters: string[];
    /** Field rows with an empty description, for the description pass. */
    readonly FieldsWithoutDescription: string[];
    /** Parameter rows with an empty description, for the description pass. */
    readonly ParametersWithoutDescription: string[];
}

/** The rows stored for a query, read from the database. */
interface StoredChildRows {
    readonly Fields: MJQueryFieldEntity[];
    readonly Parameters: MJQueryParameterEntity[];
    readonly Entities: MJQueryEntityEntity[];
    readonly Dependencies: MJQueryDependencyEntity[];
}

type Write = () => Promise<boolean>;

/**
 * Brings a query's child rows in line with its extracted facts, keeping what people authored.
 *
 * **Facts** are corrected on every row, including declared and `Manual` ones: a field's name
 * casing, sequence, types, nullability, source and computed flag; whether a parameter exists
 * (and its name casing); which entities and dependencies the query has.
 *
 * **Annotations** are never overwritten when authored (`DetectionMethod` `Manual`, or a
 * non-empty value): descriptions, `ComputationDescription`, `IsSummary` / `SummaryDescription`,
 * and a `Manual` parameter's type, required flag, default, sample, validation filters and
 * server-set flag. A doc-comment description is authored too: it fills an empty description and
 * replaces one extraction or an LLM wrote.
 *
 * An authored parameter the SQL no longer uses is kept (extraction flags it on the query); an
 * auto-detected one is deleted. Rows keep their IDs. A `null` fact collection leaves its rows as
 * they are. Existing rows are read from the database on the caller's provider, never a cache, so
 * rows written earlier in the same transaction are seen.
 *
 * With `DryRun` the same changes are worked out and reported, and nothing is written.
 */
export async function WriteExtractedChildRows(context: ChildRowWriteContext, result: QueryExtractionResult): Promise<ChildRowWriteSummary> {
    const stored = await loadStoredChildRows(context);
    const summary: ChildRowWriteSummary = { Added: 0, Updated: 0, Removed: 0, Changes: [], FlaggedParameters: [], FieldsWithoutDescription: [], ParametersWithoutDescription: [] };
    const writes: Write[] = [];
    if (result.Fields) writes.push(...await fieldWrites(context, stored.Fields, result.Fields, summary));
    writes.push(...await parameterWrites(context, stored.Parameters, result.Parameters, summary));
    if (result.Entities) writes.push(...await entityWrites(context, stored.Entities, result.Entities, summary));
    if (result.Dependencies) writes.push(...await dependencyWrites(context, stored.Dependencies, result.Dependencies, summary));
    if (context.DryRun) return summary;
    const outcomes = await RunMaybeSerial(context.Provider, writes);
    if (outcomes.some(ok => !ok)) throw new Error(`Query ${context.QueryID}: ${outcomes.filter(ok => !ok).length} of ${writes.length} child-row writes failed.`);
    return summary;
}

async function loadStoredChildRows(context: ChildRowWriteContext): Promise<StoredChildRows> {
    const filter = `QueryID='${EscapeSQLString(context.QueryID)}'`;
    const load = async <T extends BaseEntity>(entityName: string): Promise<T[]> => {
        const result = await context.Provider.RunView<T>({ EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true, IgnoreMaxRows: true }, context.User);
        if (!result.Success) throw new Error(`Could not read the stored ${entityName} of query ${context.QueryID}: ${result.ErrorMessage}`);
        return result.Results ?? [];
    };
    const [fields, parameters, entities, dependencies] = await Promise.all([
        load<MJQueryFieldEntity>('MJ: Query Fields'),
        load<MJQueryParameterEntity>('MJ: Query Parameters'),
        load<MJQueryEntityEntity>('MJ: Query Entities'),
        load<MJQueryDependencyEntity>('MJ: Query Dependencies'),
    ]);
    return { Fields: fields, Parameters: parameters, Entities: entities, Dependencies: dependencies };
}

/** How a change to a row is reported. */
interface RowLabel {
    readonly Collection: QueryChildCollection;
    readonly Name: string;
    readonly SourceEntityFieldID?: string | null;
}

/**
 * A write for `row` when it has unsaved changes; counts and records it as added or updated.
 *
 * `alsoChanged` names columns that changed although the entity's dirty check does not see it: a
 * nullable bit column going between `null` and `false` reads as unchanged there. Such a row is
 * still written (ignoring the dirty state) and the column is reported.
 */
function saveIfDirty(row: BaseEntity, summary: ChildRowWriteSummary, label: RowLabel, alsoChanged: readonly string[] = []): Write[] {
    if (row.IsSaved && !row.Dirty && alsoChanged.length === 0) return [];
    const action = row.IsSaved ? 'Updated' : 'Added';
    if (row.IsSaved) summary.Updated++;
    else summary.Added++;
    const dirtyColumns = row.IsSaved ? row.Fields.filter(f => f.Dirty).map(f => f.Name) : [];
    const changedColumns = row.IsSaved ? [...dirtyColumns, ...alsoChanged.filter(c => !dirtyColumns.includes(c))] : [];
    summary.Changes.push({ ...changeOf(label, action), ChangedColumns: changedColumns });
    const ignoreDirtyState = row.IsSaved && !row.Dirty;
    return [() => row.Save(ignoreDirtyState ? { IgnoreDirtyState: true } : undefined)];
}

function deleteRows<T extends BaseEntity>(rows: readonly T[], summary: ChildRowWriteSummary, labelOf: (row: T) => RowLabel): Write[] {
    summary.Removed += rows.length;
    for (const row of rows) summary.Changes.push(changeOf(labelOf(row), 'Removed'));
    return rows.map(row => () => row.Delete());
}

function changeOf(label: RowLabel, action: ChildRowChange['Action']): ChildRowChange {
    return { Collection: label.Collection, Action: action, Name: label.Name, ChangedColumns: [], SourceEntityFieldID: label.SourceEntityFieldID ?? null };
}

function fieldLabel(row: MJQueryFieldEntity): RowLabel {
    return { Collection: 'Fields', Name: row.Name, SourceEntityFieldID: row.SourceEntityFieldID };
}

function parameterLabel(row: MJQueryParameterEntity): RowLabel {
    return { Collection: 'Parameters', Name: row.Name };
}

function byLowerName<T extends { Name: string }>(rows: readonly T[]): Map<string, T> {
    return new Map(rows.map(r => [r.Name.toLowerCase(), r]));
}

function isEmpty(value: string | null | undefined): boolean {
    return !value || value.trim().length === 0;
}

// ─── Fields ─────────────────────────────────────────────────────────────────

async function fieldWrites(context: ChildRowWriteContext, stored: MJQueryFieldEntity[], facts: readonly QueryFieldFact[], summary: ChildRowWriteSummary): Promise<Write[]> {
    const existing = byLowerName(stored);
    const writes: Write[] = [];
    for (const fact of facts) {
        let row = existing.get(fact.Name.toLowerCase());
        existing.delete(fact.Name.toLowerCase());
        if (!row) row = await newRow<MJQueryFieldEntity>(context, 'MJ: Query Fields', r => newField(r, context.QueryID, fact));
        else applyFieldAnnotations(row, fact);
        const nullabilityChanged = row.IsSaved && (row.IsNullable ?? null) !== (fact.IsNullable ?? null);
        ApplyFieldFacts(row, fact);
        writes.push(...saveIfDirty(row, summary, fieldLabel(row), nullabilityChanged ? ['IsNullable'] : []));
        if (isEmpty(row.Description)) summary.FieldsWithoutDescription.push(row.Name);
    }
    return [...writes, ...deleteRows([...existing.values()], summary, fieldLabel)];
}

function newField(row: MJQueryFieldEntity, queryID: string, fact: QueryFieldFact): void {
    row.QueryID = queryID;
    row.Description = fact.DocDescription ?? fact.SourceDescription;
    row.IsSummary = false;
    row.DetectionMethod = 'Database';
}

/**
 * Sets a field row's facts (name casing, sequence, types, nullability, computed flag, source) from
 * the extracted fact, leaving its annotations alone.
 */
export function ApplyFieldFacts(row: MJQueryFieldEntity, fact: QueryFieldFact): void {
    row.Name = fact.Name;
    row.Sequence = fact.Sequence;
    row.SQLBaseType = fact.SQLBaseType;
    row.SQLFullType = fact.SQLFullType;
    row.IsNullable = fact.IsNullable;
    row.IsComputed = fact.IsComputed;
    row.SourceEntityID = fact.SourceEntityID;
    row.SourceEntityFieldID = fact.SourceEntityFieldID;
    row.SourceFieldName = fact.SourceFieldName;
    row.SourceObjectName = fact.SourceObjectName;
}

/** A stored field's description and detection method: authored ones kept, a doc comment applied. */
function applyFieldAnnotations(row: MJQueryFieldEntity, fact: QueryFieldFact): void {
    const authored = row.DetectionMethod === 'Manual';
    if (fact.DocDescription !== null && (!authored || isEmpty(row.Description))) row.Description = fact.DocDescription;
    if (!authored && row.DetectionMethod !== 'AI') row.DetectionMethod = 'Database';
    if (row.DetectionMethod === 'AI' && fact.DocDescription !== null) row.DetectionMethod = 'Database';
}

// ─── Parameters ─────────────────────────────────────────────────────────────

async function parameterWrites(context: ChildRowWriteContext, stored: MJQueryParameterEntity[], facts: readonly QueryParameterFact[], summary: ChildRowWriteSummary): Promise<Write[]> {
    const existing = byLowerName(stored);
    const writes: Write[] = [];
    for (const fact of facts) {
        let row = existing.get(fact.Name.toLowerCase());
        existing.delete(fact.Name.toLowerCase());
        if (!row) row = await newRow<MJQueryParameterEntity>(context, 'MJ: Query Parameters', r => newParameter(r, context.QueryID, fact));
        else applyParameterAnnotations(row, fact);
        row.Name = fact.Name;
        writes.push(...saveIfDirty(row, summary, parameterLabel(row)));
        if (isEmpty(row.Description)) summary.ParametersWithoutDescription.push(row.Name);
    }
    const leftover = [...existing.values()];
    summary.FlaggedParameters.push(...leftover.filter(row => row.DetectionMethod === 'Manual').map(row => row.Name));
    const unused = leftover.filter(row => row.DetectionMethod !== 'Manual');
    return [...writes, ...deleteRows(unused, summary, parameterLabel)];
}

function newParameter(row: MJQueryParameterEntity, queryID: string, fact: QueryParameterFact): void {
    row.QueryID = queryID;
    row.Type = fact.Type ?? 'string';
    row.IsRequired = fact.IsRequired;
    row.DefaultValue = fact.DefaultValue;
    row.SampleValue = fact.SampleValue;
    row.Description = fact.DocDescription ?? fact.InheritedDescription;
    row.IsServerSet = false;
    row.DetectionMethod = 'Parser';
}

/**
 * A stored parameter: a `Manual` row keeps every annotation (only an empty description is filled);
 * an auto-detected row takes the template's type, required flag and default, keeps a non-empty
 * sample and description, and takes a doc comment's description.
 */
function applyParameterAnnotations(row: MJQueryParameterEntity, fact: QueryParameterFact): void {
    if (row.DetectionMethod === 'Manual') {
        if (isEmpty(row.Description)) row.Description = fact.DocDescription ?? fact.InheritedDescription ?? row.Description;
        return;
    }
    if (fact.Type !== null) row.Type = fact.Type;
    row.IsRequired = fact.IsRequired;
    row.DefaultValue = fact.DefaultValue;
    if (isEmpty(row.SampleValue)) row.SampleValue = fact.SampleValue;
    if (fact.DocDescription !== null) row.Description = fact.DocDescription;
    else if (isEmpty(row.Description)) row.Description = fact.InheritedDescription;
    row.DetectionMethod = 'Parser';
}

// ─── Entities ───────────────────────────────────────────────────────────────

async function entityWrites(context: ChildRowWriteContext, stored: MJQueryEntityEntity[], facts: readonly QueryEntityFact[], summary: ChildRowWriteSummary): Promise<Write[]> {
    const remaining = [...stored];
    const writes: Write[] = [];
    const unmatched = facts.filter(fact => !takeRow(remaining, r => sameEntityLink(r, fact)));
    for (const fact of unmatched) {
        const row = takeRow(remaining, r => UUIDsEqual(r.EntityID, fact.EntityID))
            ?? await newRow<MJQueryEntityEntity>(context, 'MJ: Query Entities', r => newEntityLink(r, context.QueryID, fact));
        row.AlternateBaseViewID = fact.AlternateBaseViewID;
        writes.push(...saveIfDirty(row, summary, entityLabel(context, row)));
    }
    return [...writes, ...deleteRows(remaining, summary, row => entityLabel(context, row))];
}

function entityLabel(context: ChildRowWriteContext, row: MJQueryEntityEntity): RowLabel {
    return { Collection: 'Entities', Name: context.EntityName ? context.EntityName(row.EntityID) : (row.Entity || row.EntityID) };
}

function sameEntityLink(row: MJQueryEntityEntity, fact: QueryEntityFact): boolean {
    const abv = (id: string | null) => (id ? NormalizeUUID(id) : '');
    return UUIDsEqual(row.EntityID, fact.EntityID) && abv(row.AlternateBaseViewID) === abv(fact.AlternateBaseViewID);
}

function newEntityLink(row: MJQueryEntityEntity, queryID: string, fact: QueryEntityFact): void {
    row.QueryID = queryID;
    row.EntityID = fact.EntityID;
    row.DetectionMethod = 'Parser';
    row.AutoDetectConfidenceScore = 1;
}

/** Removes and returns the first row matching `test`. */
function takeRow<T>(rows: T[], test: (row: T) => boolean): T | undefined {
    const index = rows.findIndex(test);
    return index < 0 ? undefined : rows.splice(index, 1)[0];
}

// ─── Dependencies ───────────────────────────────────────────────────────────

async function dependencyWrites(context: ChildRowWriteContext, stored: MJQueryDependencyEntity[], facts: readonly QueryDependencyFact[], summary: ChildRowWriteSummary): Promise<Write[]> {
    const remaining = [...stored];
    const writes: Write[] = [];
    const seen = new Set<string>();
    for (const fact of facts) {
        const key = `${NormalizeUUID(fact.DependsOnQueryID)}|${fact.ReferencePath.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const row = takeRow(remaining, r => UUIDsEqual(r.DependsOnQueryID, fact.DependsOnQueryID) && r.ReferencePath.toLowerCase() === fact.ReferencePath.toLowerCase())
            ?? await newRow<MJQueryDependencyEntity>(context, 'MJ: Query Dependencies', r => newDependency(r, context.QueryID, fact));
        row.ReferencePath = fact.ReferencePath;
        row.Alias = fact.Alias;
        row.ParameterMapping = fact.ParameterMapping;
        writes.push(...saveIfDirty(row, summary, dependencyLabel(row)));
    }
    return [...writes, ...deleteRows(remaining, summary, dependencyLabel)];
}

function dependencyLabel(row: MJQueryDependencyEntity): RowLabel {
    return { Collection: 'Dependencies', Name: row.ReferencePath };
}

function newDependency(row: MJQueryDependencyEntity, queryID: string, fact: QueryDependencyFact): void {
    row.QueryID = queryID;
    row.DependsOnQueryID = fact.DependsOnQueryID;
    row.DetectionMethod = 'Auto';
}

async function newRow<T extends BaseEntity>(context: ChildRowWriteContext, entityName: string, init: (row: T) => void): Promise<T> {
    const row = await context.Provider.GetEntityObject<T>(entityName, context.User);
    init(row);
    return row;
}
