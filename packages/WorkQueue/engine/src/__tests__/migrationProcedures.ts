import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SqlStatement } from '../sql/WorkQueueSqlExecutor';

/** The migration that defines every spWorkQueue* procedure (plan 12 / CD9). */
export const PROCEDURES_MIGRATION = fileURLToPath(
    new URL('../../../../../migrations/v6/V202609241637__v6.2.x__Work_Queue_Guarded_Write_Sprocs.sql', import.meta.url),
);

export interface MigrationProcedure {
    Name: string;
    /** Parameter names without the leading `@`, in declared order. */
    Params: string[];
    /** Roles granted EXECUTE. */
    Grants: string[];
}

const CREATE = /CREATE PROCEDURE \[\$\{flyway:defaultSchema\}\]\.\[(\w+)\]\s*([\s\S]*?)\bAS\b/g;
const GRANT = /GRANT EXECUTE ON \[\$\{flyway:defaultSchema\}\]\.\[(\w+)\] TO ([^;]+);/g;

/** Parses the procedures the migration creates: name, declared parameter order and EXECUTE grants. */
export function ReadMigrationProcedures(path: string = PROCEDURES_MIGRATION): Map<string, MigrationProcedure> {
    const text = readFileSync(path, 'utf8');
    const procedures = new Map<string, MigrationProcedure>();
    for (const match of text.matchAll(CREATE)) {
        const params = [...match[2].matchAll(/@(\w+)\s+[A-Z]/g)].map(param => param[1]);
        procedures.set(match[1], { Name: match[1], Params: params, Grants: [] });
    }
    for (const match of text.matchAll(GRANT)) {
        const procedure = procedures.get(match[1]);
        if (procedure) {
            procedure.Grants = match[2].split(',').map(role => role.trim().replace(/^\[|\]$/g, ''));
        }
    }
    return procedures;
}

/** Splits a SQL Server call (`EXEC [s].[p] @A=@p0, @B=@p1`) into the procedure name and the argument names in order. */
export function ParseSqlServerCall(statement: SqlStatement): { Procedure: string; Params: string[] } {
    const match = /^EXEC \[[^\]]+\]\.\[(\w+)\]\s*(.*)$/s.exec(statement.SQL);
    if (!match) {
        throw new Error(`Not a SQL Server procedure call: ${statement.SQL}`);
    }
    const params = match[2].trim() === '' ? [] : match[2].split(',').map(part => {
        const arg = /^\s*@(\w+)=@p(\d+)\s*$/.exec(part);
        if (!arg) {
            throw new Error(`Not a named argument: '${part}' in ${statement.SQL}`);
        }
        return arg[1];
    });
    return { Procedure: match[1], Params: params };
}
