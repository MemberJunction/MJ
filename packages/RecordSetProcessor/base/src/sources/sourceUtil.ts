/**
 * @fileoverview Shared helpers for source adapters: composite-key-safe record-ID serialization,
 * keyset-pagination eligibility, and a generic entity-filter pager that picks keyset (seek) or
 * offset pagination as appropriate.
 * @module @memberjunction/record-set-processor-base
 */

import { CompositeKey, EntityInfo, RunView, UserInfo } from '@memberjunction/core';
import { ProcessCursor, RecordBatch, RecordRef } from '../types';

/** PK column types over which keyset (seek) pagination is safe and stable. */
const KEYSET_ORDERABLE_PK_TYPES = new Set<string>([
    'uniqueidentifier', 'uuid', 'int', 'integer', 'bigint', 'smallint', 'tinyint',
    'decimal', 'numeric', 'money', 'smallmoney', 'float', 'real', 'double precision',
    'char', 'varchar', 'nchar', 'nvarchar', 'character', 'character varying',
    'date', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime', 'time',
    'timestamp', 'timestamp with time zone', 'timestamp without time zone',
    'bit', 'boolean', 'serial', 'bigserial',
]);

/**
 * Serializes a record's primary key to a composite-key-safe string. Single-PK entities return the
 * raw value; composite-PK entities use `CompositeKey.ToConcatenatedString()`.
 */
export function serializeRecordId(entity: EntityInfo, row: Record<string, unknown>): string {
    if (entity.PrimaryKeys.length === 1) {
        return String(row[entity.PrimaryKeys[0].Name]);
    }
    const ck = new CompositeKey();
    ck.KeyValuePairs = entity.PrimaryKeys.map((pk) => ({ FieldName: pk.Name, Value: row[pk.Name] as never }));
    return ck.ToConcatenatedString();
}

/** Returns true when the entity has a single, orderable primary key suitable for keyset pagination. */
export function canUseKeyset(entity: EntityInfo): boolean {
    if (!entity.FirstPrimaryKey || entity.PrimaryKeys.length !== 1) {
        return false;
    }
    const normalizedType = (entity.FirstPrimaryKey.Type || '')
        .replace(/\s*\([^)]*\)\s*$/, '') // strip parameterization like "nvarchar(255)"
        .trim()
        .toLowerCase();
    return KEYSET_ORDERABLE_PK_TYPES.has(normalizedType);
}

/**
 * Pages an entity's rows by filter, returning one batch of {@link RecordRef}. Uses keyset (seek)
 * pagination when `preferKeyset` is set and the entity supports it (single orderable PK), otherwise
 * falls back to offset (StartRow) pagination. Selects only the PK columns and bypasses the cache —
 * these single-use sweep pages should never pollute the local cache.
 */
export async function pageEntityByFilter(opts: {
    entity: EntityInfo;
    filter?: string;
    cursor: ProcessCursor | undefined;
    batchSize: number;
    contextUser: UserInfo;
    preferKeyset: boolean;
}): Promise<RecordBatch> {
    const { entity, filter, cursor, batchSize, contextUser, preferKeyset } = opts;
    const pkName = entity.FirstPrimaryKey?.Name;
    const useKeyset = preferKeyset && canUseKeyset(entity) && !!pkName;

    const rv = new RunView();
    const sharedParams = {
        EntityName: entity.Name,
        Fields: entity.PrimaryKeys.map((pk) => pk.Name),
        ResultType: 'simple' as const,
        MaxRows: batchSize,
        BypassCache: true,
        ExtraFilter: filter,
    };

    const offset = cursor?.Offset ?? 0;
    const result = useKeyset
        ? await rv.RunView({
            ...sharedParams,
            OrderBy: pkName,
            AfterKey: cursor?.Key != null ? CompositeKey.FromKeyValuePair(pkName as string, cursor.Key) : undefined,
        }, contextUser)
        : await rv.RunView({ ...sharedParams, StartRow: offset }, contextUser);

    if (!result.Success) {
        throw new Error(`Record set source failed paging '${entity.Name}': ${result.ErrorMessage}`);
    }

    const rows = (result.Results ?? []) as Record<string, unknown>[];
    const records: RecordRef[] = rows.map((row) => ({
        EntityID: entity.ID,
        RecordID: serializeRecordId(entity, row),
        Record: row,
    }));
    const exhausted = records.length < batchSize;

    let nextCursor: ProcessCursor;
    if (useKeyset) {
        const lastValue = rows.length > 0 ? rows[rows.length - 1][pkName as string] : undefined;
        nextCursor = { Key: lastValue != null ? String(lastValue) : cursor?.Key };
    } else {
        nextCursor = { Offset: offset + records.length };
    }

    return { Records: records, NextCursor: nextCursor, Exhausted: exhausted, TotalRowCount: result.TotalRowCount };
}
