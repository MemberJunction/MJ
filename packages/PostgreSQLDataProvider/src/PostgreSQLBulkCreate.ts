/**
 * PostgreSQL set-based implementation behind {@link PostgreSQLDataProvider.BulkCreate}.
 *
 * The base contract is a loop over Save() — one function-call round trip per record. This
 * override collapses a batch into multi-row parameterized INSERTs inside one transaction. No
 * COPY, deliberately: multi-row VALUES with $n placeholders needs no extra dependency, keeps
 * parameter typing with the driver, and at the chunk sizes below the difference against COPY is
 * noise next to the round trips both eliminate.
 *
 * Chunking is parameter-budgeted: PostgreSQL's wire limit is 65,535 bind parameters per
 * statement, so a wide table simply gets fewer rows per statement — never a failure. The pure
 * planning half is shared in spirit with the SQL Server module: which columns ship and how
 * nullability is honoured are decisions mirrored from entity metadata, unit-testable without a
 * database.
 */
import type { BaseEntity, EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import type pg from 'pg';

/** One planned INSERT statement: SQL text plus its bind values. */
export interface PgBulkStatement {
    SQL: string;
    Values: unknown[];
    Rows: number;
}

export type PgBulkIneligibility =
    | { Reason: 'mixed-entities'; Detail: string }
    | { Reason: 'not-new'; Detail: string }
    | { Reason: 'missing-primary-key'; Detail: string };

/** The two MJ audit columns: never shipped — their DB defaults stamp them on insert. */
const AUDIT_COLUMNS = new Set(['__mj_createdat', '__mj_updatedat']);

/** Hard wire limit on bind parameters per statement; kept under with headroom. */
const MAX_PARAMS_PER_STATEMENT = 60_000;

/** Coerces a raw JS value for a PG bind; the driver handles typing, we handle shape. */
export function CoerceForPg(v: unknown, f: EntityFieldInfo): unknown {
    if (v === null || v === undefined) return null;
    const t = (f.Type ?? '').toLowerCase();
    if (t.includes('timestamp') || t === 'date' || t.includes('time')) {
        const dt = v instanceof Date ? v : new Date(v as string | number);
        return isNaN(dt.getTime()) ? null : dt;
    }
    if (t === 'boolean' || t === 'bit') return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    if (typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
    return v;
}

/**
 * Plans the multi-row INSERT statements for a homogeneous set of new entities, or names why the
 * set cannot take the set-based path. Same eligibility contract as the SQL Server module:
 * insert-only, one entity type, every primary key already set client-side.
 */
export function BuildPgBulkStatements(
    entities: BaseEntity[],
    entityInfo: EntityInfo,
    quoteIdent: (name: string) => string,
): PgBulkStatement[] | PgBulkIneligibility {
    for (const e of entities) {
        if (e.EntityInfo.Name !== entityInfo.Name) {
            return { Reason: 'mixed-entities', Detail: `expected '${entityInfo.Name}', found '${e.EntityInfo.Name}'` };
        }
        if (e.IsSaved) {
            return { Reason: 'not-new', Detail: 'an already-saved entity was passed — BulkCreate is insert-only' };
        }
        for (const pk of entityInfo.PrimaryKeys ?? []) {
            const v = e.Get(pk.Name);
            if (v === null || v === undefined || v === '') {
                return { Reason: 'missing-primary-key', Detail: `'${pk.Name}' is unset on at least one entity` };
            }
        }
    }

    const candidates = (entityInfo.Fields ?? []).filter(f =>
        !f.IsVirtual && !f.AutoIncrement && !AUDIT_COLUMNS.has(f.Name.toLowerCase()));
    const shipped = candidates.filter(f =>
        f.AllowsNull === false || entities.some(e => {
            const v = e.Get(f.Name);
            return v !== null && v !== undefined;
        }));

    const table = `${quoteIdent(entityInfo.SchemaName)}.${quoteIdent(entityInfo.BaseTable)}`;
    const columnList = shipped.map(f => quoteIdent(f.Name)).join(', ');
    const rowsPerStatement = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / Math.max(1, shipped.length)));

    const statements: PgBulkStatement[] = [];
    for (let i = 0; i < entities.length; i += rowsPerStatement) {
        const chunk = entities.slice(i, i + rowsPerStatement);
        const values: unknown[] = [];
        const tuples: string[] = [];
        for (const e of chunk) {
            const placeholders: string[] = [];
            for (const f of shipped) {
                values.push(CoerceForPg(e.Get(f.Name), f));
                placeholders.push(`$${values.length}`);
            }
            tuples.push(`(${placeholders.join(', ')})`);
        }
        statements.push({
            SQL: `INSERT INTO ${table} (${columnList}) VALUES ${tuples.join(', ')}`,
            Values: values,
            Rows: chunk.length,
        });
    }
    return statements;
}

/** Type guard: statements came back rather than an ineligibility. */
export function IsPgBulkStatements(p: PgBulkStatement[] | PgBulkIneligibility): p is PgBulkStatement[] {
    return Array.isArray(p);
}

/**
 * Executes the planned statements inside ONE transaction on a dedicated client.
 * All-or-nothing: any failure rolls the whole call back and throws.
 */
export async function ExecutePgBulkStatements(pool: pg.Pool, statements: PgBulkStatement[]): Promise<number> {
    const client = await pool.connect();
    let inserted = 0;
    try {
        await client.query('BEGIN');
        for (const st of statements) {
            await client.query(st.SQL, st.Values as never[]);
            inserted += st.Rows;
        }
        await client.query('COMMIT');
        return inserted;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* aborted transactions still need the client reset */ }
        throw err;
    } finally {
        client.release();
    }
}
