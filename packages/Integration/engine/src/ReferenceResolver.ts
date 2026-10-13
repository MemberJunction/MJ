/**
 * Resolves a mapped foreign key from the parent's EXTERNAL id to the parent's MJ id.
 *
 * A child source record names its parent the way the source system does: a Business Central
 * dimension value carries `dimensionId`, the dimension's BC GUID. The MJ target column holds the
 * parent's MJ primary key (`DimensionValue.DimensionID`), and no transform can bridge the two — the
 * transform pipeline is synchronous and never touches the database. Mapped straight across, the
 * external id lands in an MJ foreign key and every child row fails the constraint.
 *
 * The bridge already exists: when the parent's entity map synced, it wrote one
 * `MJ: Company Integration Record Maps` row per parent (external id → MJ record id) for this company
 * integration. The engine syncs a parent map before its children (the dependency layers), and flushes
 * record maps after every batch, so those rows are in place by the time the child map runs.
 *
 * Declared on the CHILD entity map's `Configuration` JSON as the destination fields to resolve:
 *
 * ```json
 * { "resolveReferences": ["DimensionID"] }
 * ```
 *
 * The parent entity is the field's `RelatedEntity` in MJ metadata, so nothing else is configured. A
 * value with no record map is an error on that record (written nowhere), not a silent null.
 */
import { DatabaseProviderBase, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { QuoteTextLiteral, type SqlQuoter } from './prefetchFilter.js';
import type { MappedRecord } from './types.js';

/** The entity map `Configuration` key that lists the destination fields to resolve. */
export const RESOLVE_REFERENCES_CONFIG_KEY = 'resolveReferences';

/** Values per record-map read; one `IN (…)` list, the same ceiling `RecordMapBatch` keeps to. */
const LOOKUP_CHUNK_SIZE = 500;

/** One destination field to resolve, and the MJ entity its value points at. */
export interface ReferenceField {
    /** Destination (MJ) field name on the child entity. */
    Field: string;
    /** The parent entity's ID — whose record maps hold the external → MJ id pairs. */
    RelatedEntityID: string;
}

/** Per destination field: external id (lower-cased) → parent's MJ record id. */
export type ReferenceLookups = Map<string, Map<string, string>>;

/** A record whose reference had no record map. */
export interface UnresolvedReference {
    Record: MappedRecord;
    Field: string;
    ExternalValue: string;
}

/** Records split by whether every configured reference resolved. */
export interface ReferenceResolution {
    Resolved: MappedRecord[];
    Unresolved: UnresolvedReference[];
}

/**
 * Reads `resolveReferences` from an entity map's parsed Configuration. Absent means none. Present
 * but malformed throws: writing external ids into MJ foreign keys is the failure this exists to stop.
 */
export function ParseReferenceFields(config: Record<string, unknown> | null | undefined): string[] {
    const raw = config?.[RESOLVE_REFERENCES_CONFIG_KEY];
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || raw.some(f => typeof f !== 'string' || f.trim() === '')) {
        throw new Error(`${RESOLVE_REFERENCES_CONFIG_KEY} must be an array of destination field names.`);
    }
    return raw as string[];
}

/** The text of a mapped value, or null when there is nothing to resolve. */
function referenceText(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text === '' ? null : text;
}

/** Distinct non-empty values of one field across a batch, skipping deletes. */
export function CollectReferenceValues(records: readonly MappedRecord[], field: string): string[] {
    const seen = new Map<string, string>();
    for (const r of records) {
        if (r.ChangeType === 'Delete') continue;
        const text = referenceText(r.MappedFields[field]);
        if (text !== null && !seen.has(text.toLowerCase())) seen.set(text.toLowerCase(), text);
    }
    return Array.from(seen.values());
}

/**
 * Replaces each configured field's external id with the parent's MJ id. A record any of whose
 * references has no match is returned as unresolved, once, naming the first field that missed. An
 * empty value is left as it is: a nullable reference may be empty, and a required one fails on save
 * with the column named. Deletes pass through untouched — they are matched by the child's own id.
 */
export function ApplyResolvedReferences(
    records: readonly MappedRecord[],
    fields: readonly string[],
    lookups: ReferenceLookups,
): ReferenceResolution {
    const resolved: MappedRecord[] = [];
    const unresolved: UnresolvedReference[] = [];
    for (const record of records) {
        if (record.ChangeType === 'Delete') { resolved.push(record); continue; }
        const miss = resolveRecord(record, fields, lookups);
        if (miss) unresolved.push(miss);
        else resolved.push(record);
    }
    return { Resolved: resolved, Unresolved: unresolved };
}

/** Resolves one record in place; returns the first miss, or null when every reference resolved. */
function resolveRecord(record: MappedRecord, fields: readonly string[], lookups: ReferenceLookups): UnresolvedReference | null {
    const replacements: Record<string, string> = {};
    for (const field of fields) {
        const text = referenceText(record.MappedFields[field]);
        if (text === null) continue;
        const mjID = lookups.get(field)?.get(text.toLowerCase());
        if (mjID === undefined) return { Record: record, Field: field, ExternalValue: text };
        replacements[field] = mjID;
    }
    Object.assign(record.MappedFields, replacements);
    return null;
}

/** Explains an unresolved reference in terms the integration's owner can act on. */
export function DescribeUnresolvedReference(miss: UnresolvedReference, parentEntityName: string): string {
    return `${miss.Record.MJEntityName}.${miss.Field}: no ${parentEntityName} record is mapped to external id ` +
        `'${miss.ExternalValue}' for this company integration. Sync the ${parentEntityName} entity map first, ` +
        `or check that this record's parent exists in the source system.`;
}

/**
 * Reads the record maps that resolve every configured field's values in this batch. Throws when a
 * read fails, so the batch fails rather than writing records whose references were never checked.
 */
export async function LoadReferenceLookups(
    provider: IMetadataProvider,
    companyIntegrationID: string,
    references: readonly ReferenceField[],
    records: readonly MappedRecord[],
    contextUser: UserInfo,
): Promise<ReferenceLookups> {
    const quoter: SqlQuoter | null = provider instanceof DatabaseProviderBase ? provider.Dialect : null;
    if (!quoter) throw new Error('Reference resolution needs a database provider to read record maps.');
    const lookups: ReferenceLookups = new Map();
    for (const ref of references) {
        const values = CollectReferenceValues(records, ref.Field);
        lookups.set(ref.Field, await readRecordMaps(quoter, companyIntegrationID, ref.RelatedEntityID, values, contextUser));
    }
    return lookups;
}

/** One entity's record maps for a set of external ids, keyed by lower-cased external id. */
async function readRecordMaps(
    q: SqlQuoter,
    companyIntegrationID: string,
    entityID: string,
    externalIDs: readonly string[],
    contextUser: UserInfo,
): Promise<Map<string, string>> {
    const byExternalID = new Map<string, string>();
    for (let i = 0; i < externalIDs.length; i += LOOKUP_CHUNK_SIZE) {
        const chunk = externalIDs.slice(i, i + LOOKUP_CHUNK_SIZE);
        const result = await new RunView().RunView<{ ExternalSystemRecordID: string; EntityRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `${q.QuoteIdentifier('CompanyIntegrationID')}=${q.QuoteStringLiteral(companyIntegrationID)} ` +
                `AND ${q.QuoteIdentifier('EntityID')}=${q.QuoteStringLiteral(entityID)} ` +
                `AND ${q.QuoteIdentifier('ExternalSystemRecordID')} IN (${chunk.map(v => QuoteTextLiteral(v, q)).join(',')})`,
            Fields: ['ExternalSystemRecordID', 'EntityRecordID'],
            IgnoreMaxRows: true,
            ResultType: 'simple',
            BypassCache: true, // the parent's map rows were written moments ago, in this run
        }, contextUser);
        if (!result.Success) throw new Error(`Record map read for reference resolution failed: ${result.ErrorMessage ?? 'unknown error'}`);
        for (const row of result.Results) {
            const key = row.ExternalSystemRecordID.toLowerCase();
            if (!byExternalID.has(key)) byExternalID.set(key, row.EntityRecordID);
        }
    }
    return byExternalID;
}
