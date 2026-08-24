/**
 * SQL Server set-based implementation behind {@link SQLServerDataProvider.BulkCreate}.
 *
 * The base contract (DatabaseProviderBase.BulkCreate) is a loop over Save() — one stored-procedure
 * round trip per record. On a high-latency link that round trip IS the write ceiling: the SQL work
 * per row measures in single-digit milliseconds while the trip costs tens. This override collapses
 * a batch into one TDS bulk insert inside one transaction — the difference between hundreds and
 * hundreds of thousands of rows per minute — at the documented cost the caller opted into: no
 * stored-procedure side effects, no Record Changes rows, no per-entity save events.
 *
 * The pure planning half (`BuildBulkTablePlan`) is separated from the transport half so the
 * column/row decisions — which columns ship, how nullability is mirrored, how values are coerced —
 * are unit-testable without a database. Nullability MUST mirror entity metadata exactly: the TDS
 * bulk layer rejects a nullable value aimed at a NOT NULL column, and vice versa produces silent
 * schema drift between what the entity believes and what the wire declares.
 */
import type { BaseEntity, EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import sql from 'mssql';

/** One column of the bulk plan: name, resolved mssql type, and metadata-mirrored nullability. */
export interface BulkColumnPlan {
    Name: string;
    Field: EntityFieldInfo;
    Nullable: boolean;
}

/** The full plan for one entity type: target table, columns, and coerced row tuples. */
export interface BulkTablePlan {
    SchemaName: string;
    TableName: string;
    Columns: BulkColumnPlan[];
    Rows: unknown[][];
}

/** Why a set of entities cannot take the set-based path (the caller falls back to the base loop). */
export type BulkIneligibility =
    | { Reason: 'mixed-entities'; Detail: string }
    | { Reason: 'not-new'; Detail: string }
    | { Reason: 'missing-primary-key'; Detail: string };

/**
 * Maps an MJ EntityFieldInfo to the mssql column type for a bulk Table.
 * MJ's `Length` is BYTES for nvarchar (nvarchar(100) => Length 200); -1/MAX stays MAX.
 */
export function SqlTypeForField(f: EntityFieldInfo): sql.ISqlTypeFactoryWithNoParams | sql.ISqlType {
    const t = (f.Type ?? '').toLowerCase();
    const len = f.Length;
    const nch = () => (len == null || len < 0 || len > 8000) ? sql.NVarChar(sql.MAX) : sql.NVarChar(Math.max(1, Math.floor(len / 2)));
    const ch = () => (len == null || len < 0 || len > 8000) ? sql.VarChar(sql.MAX) : sql.VarChar(Math.max(1, len));
    switch (t) {
        case 'nvarchar': case 'nchar': case 'sysname': return nch();
        case 'varchar': case 'char': return ch();
        case 'text': return sql.Text;
        case 'ntext': return sql.NText;
        case 'int': return sql.Int;
        case 'bigint': return sql.BigInt;
        case 'smallint': return sql.SmallInt;
        case 'tinyint': return sql.TinyInt;
        case 'bit': return sql.Bit;
        case 'decimal': case 'numeric': return sql.Decimal(f.Precision ?? 18, f.Scale ?? 4);
        case 'money': return sql.Money;
        case 'smallmoney': return sql.SmallMoney;
        case 'float': return sql.Float;
        case 'real': return sql.Real;
        case 'datetime': return sql.DateTime;
        case 'datetime2': return sql.DateTime2(7);
        case 'datetimeoffset': return sql.DateTimeOffset(7);
        case 'smalldatetime': return sql.SmallDateTime;
        case 'date': return sql.Date;
        case 'time': return sql.Time(7);
        case 'uniqueidentifier': return sql.UniqueIdentifier;
        case 'varbinary': case 'binary': case 'image': return sql.VarBinary(sql.MAX);
        default: return sql.NVarChar(sql.MAX);
    }
}

/** Coerces a raw JS value to what the TDS layer expects for the column's SQL type; null stays null. */
export function CoerceForBulk(v: unknown, f: EntityFieldInfo): unknown {
    if (v === null || v === undefined) return null;
    const t = (f.Type ?? '').toLowerCase();
    if (t === 'datetime' || t === 'datetime2' || t === 'datetimeoffset' || t === 'smalldatetime' || t === 'date' || t === 'time') {
        const dt = v instanceof Date ? v : new Date(v as string | number);
        return isNaN(dt.getTime()) ? null : dt;
    }
    if (t === 'int' || t === 'bigint' || t === 'smallint' || t === 'tinyint'
        || t === 'decimal' || t === 'numeric' || t === 'money' || t === 'smallmoney'
        || t === 'float' || t === 'real') {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : null;
    }
    if (t === 'bit') return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    if (typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
    return String(v);
}

/** The two MJ audit columns: never shipped — their DB defaults stamp them on insert. */
const AUDIT_COLUMNS = new Set(['__mj_createdat', '__mj_updatedat']);

/**
 * Plans the bulk insert for a homogeneous set of new entities, or names why it cannot.
 *
 * Column selection: physical (non-virtual), non-auto-increment fields, excluding the audit
 * columns. A column ships when it is NOT nullable (the wire must supply it) or when ANY entity
 * in the set carries a non-null value for it; a nullable column nobody set stays out of the
 * plan entirely so its DB default (if any) applies.
 */
export function BuildBulkTablePlan(entities: BaseEntity[], entityInfo: EntityInfo): BulkTablePlan | BulkIneligibility {
    for (const e of entities) {
        if (e.EntityInfo.Name !== entityInfo.Name) {
            return { Reason: 'mixed-entities', Detail: `expected '${entityInfo.Name}', found '${e.EntityInfo.Name}'` };
        }
        if (e.IsSaved) {
            return { Reason: 'not-new', Detail: `entity ${e.PrimaryKey?.ToConcatenatedString?.() ?? ''} is already saved — BulkCreate is insert-only` };
        }
        for (const pk of entityInfo.PrimaryKeys ?? []) {
            const v = e.Get(pk.Name);
            if (v === null || v === undefined || v === '') {
                return { Reason: 'missing-primary-key', Detail: `'${pk.Name}' is unset on at least one entity — a set-based insert cannot report server-assigned keys back` };
            }
        }
    }

    const candidates = (entityInfo.Fields ?? []).filter(f =>
        !f.IsVirtual && !f.AutoIncrement && !AUDIT_COLUMNS.has(f.Name.toLowerCase()));

    const shipped: BulkColumnPlan[] = [];
    for (const f of candidates) {
        const mustShip = f.AllowsNull === false;
        const anyValue = mustShip || entities.some(e => {
            const v = e.Get(f.Name);
            return v !== null && v !== undefined;
        });
        if (anyValue) shipped.push({ Name: f.Name, Field: f, Nullable: f.AllowsNull !== false });
    }

    const rows = entities.map(e => shipped.map(c => CoerceForBulk(e.Get(c.Name), c.Field)));
    return { SchemaName: entityInfo.SchemaName, TableName: entityInfo.BaseTable, Columns: shipped, Rows: rows };
}

/** Type guard: a plan came back rather than an ineligibility. */
export function IsBulkPlan(p: BulkTablePlan | BulkIneligibility): p is BulkTablePlan {
    return (p as BulkTablePlan).Rows !== undefined;
}

/**
 * Executes one plan as a single TDS bulk insert inside one transaction.
 * All-or-nothing: a failure rolls back and throws — the caller decides how to retry.
 */
export async function ExecuteBulkPlan(pool: sql.ConnectionPool, plan: BulkTablePlan): Promise<number> {
    const table = new sql.Table(`[${plan.SchemaName}].[${plan.TableName}]`);
    table.create = false;
    for (const c of plan.Columns) {
        table.columns.add(c.Name, SqlTypeForField(c.Field) as sql.ISqlType, { nullable: c.Nullable });
    }
    for (const r of plan.Rows) table.rows.add(...(r as never[]));

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        await new sql.Request(tx).bulk(table, { keepNulls: true });
        await tx.commit();
        return plan.Rows.length;
    } catch (err) {
        try { await tx.rollback(); } catch { /* connection-level failures leave nothing to roll back */ }
        throw err;
    }
}
