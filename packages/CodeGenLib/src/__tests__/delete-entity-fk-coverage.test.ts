import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Drift guard for spDeleteEntityWithCoreDependencies (#3546).
 *
 * CodeGen calls that proc to remove an entity whose table is gone. Every foreign key that
 * references Entity.ID needs a decision (delete the rows, null the column, or block), and so does
 * every foreign key into a table whose rows the proc deletes. The decisions live in
 * fixtures/entity-delete-fk-policy.json; the proc in the newest migration that defines it must
 * carry them out. This test fails when:
 *   - generated metadata has an FK into Entity, or into a table the proc deletes from, with no
 *     policy entry (a new table was added and nobody decided what happens to its rows);
 *   - a policy entry no longer matches generated metadata (column removed, nullability changed);
 *   - the proc is missing the statement for a delete/null entry, clears a child after its parent,
 *     or its precondition's handled list disagrees with the policy.
 */

type PolicyAction = 'delete' | 'null' | 'block';

interface ReferencePolicy {
    table: string;
    column: string;
    nullable: boolean;
    action: PolicyAction;
    reason: string;
    alsoNull?: string[];
    catalogOnly?: boolean;
}

interface DependentPolicy {
    table: string;
    column: string;
    references: string;
    nullable: boolean;
    action: Exclude<PolicyAction, 'block'>;
    reason: string;
}

interface DeletePolicy {
    references: ReferencePolicy[];
    dependents: DependentPolicy[];
}

interface GeneratedForeignKey {
    table: string;
    column: string;
    nullable: boolean;
    referencedTable: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const CORE_SCHEMA = '__mj';
const PROC_NAME = 'spDeleteEntityWithCoreDependencies';
const SCHEMA_TOKEN = '[${flyway:defaultSchema}]';

function loadPolicy(): DeletePolicy {
    return JSON.parse(readFileSync(path.join(here, 'fixtures', 'entity-delete-fk-policy.json'), 'utf8')) as DeletePolicy;
}

/** Reads every generated entity module and returns the core-schema FK fields with their target tables. */
function loadGeneratedForeignKeys(): GeneratedForeignKey[] {
    const dir = path.join(repoRoot, 'packages/MJCoreEntities/src/generated/entities');
    const source = readdirSync(dir)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => readFileSync(path.join(dir, f), 'utf8'))
        .join('\n');

    const baseTables = new Map<string, string>();
    const classHeader = /\/\*\*\n \* (.+?) - strongly typed entity sub-class\n \* \* Schema: (\S+)\n \* \* Base Table: (\S+)/g;
    for (const m of source.matchAll(classHeader)) {
        if (m[2] === CORE_SCHEMA) baseTables.set(m[1], m[3]);
    }

    const fks: GeneratedForeignKey[] = [];
    for (const block of source.split(/\* zod schema definition for the entity /).slice(1)) {
        const entityName = block.slice(0, block.indexOf('\n')).trim();
        const table = baseTables.get(entityName);
        if (!table) continue;
        const body = block.slice(0, block.indexOf('\n});'));
        for (const f of body.matchAll(/\n {4}(\w+): z\.([^\n]*?)\.describe\(`([\s\S]*?)`\)/g)) {
            const related = /Related Entity\/Foreign Key: (.+?) \(\w+\.ID\)/.exec(f[3]);
            if (!related) continue;
            const referencedTable = baseTables.get(related[1]);
            if (!referencedTable) continue;
            fks.push({ table, column: f[1], nullable: f[2].includes('nullable()'), referencedTable });
        }
    }
    return fks;
}

/** Body of the proc in the newest migration that (re)defines it. */
function loadProcBody(): { file: string; body: string } {
    const migrationsRoot = path.join(repoRoot, 'migrations');
    const header = `CREATE OR ALTER PROC ${SCHEMA_TOKEN}.[${PROC_NAME}]`;
    const candidates: string[] = [];
    for (const era of readdirSync(migrationsRoot).filter((d) => /^v\d+$/.test(d))) {
        const eraDir = path.join(migrationsRoot, era);
        for (const f of readdirSync(eraDir).filter((n) => /^V\d{12}__.*\.sql$/.test(n))) {
            if (readFileSync(path.join(eraDir, f), 'utf8').includes(header)) candidates.push(path.join(eraDir, f));
        }
    }
    candidates.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
    const file = candidates[candidates.length - 1];
    const sql = readFileSync(file, 'utf8');
    const start = sql.indexOf(header);
    const end = sql.indexOf('\nGO', start);
    return { file: path.basename(file), body: sql.slice(start, end) };
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Statements of the proc body, split on semicolons, comments removed. */
function statements(body: string): string[] {
    return body
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n')
        .split(';')
        .map((s) => s.replace(/\s+/g, ' ').trim());
}

const S = escapeRegex(SCHEMA_TOKEN);
const deleteFrom = (table: string) => new RegExp(`^DELETE FROM ${S}\\.\\[${table}\\] WHERE `);
const updateNull = (table: string, column: string) => new RegExp(`^UPDATE ${S}\\.\\[${table}\\] SET \\[${column}\\] = NULL`);
const touchesColumn = (column: string, tail: string) => new RegExp(`\\[${column}\\] ${tail}`);

function findStatement(stmts: string[], head: RegExp, column: string, tail: string): number {
    return stmts.findIndex((s) => head.test(s) && touchesColumn(column, tail).test(s));
}

function firstDeleteOf(stmts: string[], table: string): number {
    return stmts.findIndex((s) => deleteFrom(table).test(s));
}

const key = (table: string, column: string) => `${table}.${column}`;

describe('spDeleteEntityWithCoreDependencies FK coverage', () => {
    const policy = loadPolicy();
    const generated = loadGeneratedForeignKeys();
    const { file, body } = loadProcBody();
    const stmts = statements(body);

    it('finds the generated metadata and the proc', () => {
        expect(existsSync(path.join(repoRoot, 'packages/MJCoreEntities/src/generated/entities'))).toBe(true);
        expect(generated.length).toBeGreaterThan(0);
        expect(body.length).toBeGreaterThan(0);
        expect(file).toMatch(/^V\d{12}__/);
    });

    it('has a policy entry for every generated FK into Entity, with matching nullability', () => {
        const byKey = new Map(policy.references.map((r) => [key(r.table, r.column), r]));
        const intoEntity = generated.filter((fk) => fk.referencedTable === 'Entity');
        const missing = intoEntity.filter((fk) => !byKey.has(key(fk.table, fk.column))).map((fk) => key(fk.table, fk.column));
        expect(missing, `FKs into Entity with no entry in entity-delete-fk-policy.json "references"`).toEqual([]);

        const nullabilityDrift = intoEntity
            .filter((fk) => byKey.get(key(fk.table, fk.column))?.nullable !== fk.nullable)
            .map((fk) => key(fk.table, fk.column));
        expect(nullabilityDrift, 'policy nullability differs from generated metadata').toEqual([]);
    });

    it('has no stale reference entries', () => {
        const live = new Set(generated.filter((fk) => fk.referencedTable === 'Entity').map((fk) => key(fk.table, fk.column)));
        const stale = policy.references.filter((r) => !r.catalogOnly && !live.has(key(r.table, r.column))).map((r) => key(r.table, r.column));
        expect(stale, 'policy references with no matching FK in generated metadata').toEqual([]);
    });

    it('never nulls a NOT NULL column and only blocks first-order references', () => {
        const badNull = [...policy.references, ...policy.dependents].filter((r) => r.action === 'null' && !r.nullable);
        expect(badNull.map((r) => key(r.table, r.column))).toEqual([]);
        for (const r of policy.references) expect(['delete', 'null', 'block']).toContain(r.action);
        for (const d of policy.dependents) expect(['delete', 'null']).toContain(d.action);
    });

    it('has a dependents entry for every generated FK into a table the proc deletes from', () => {
        const deleted = new Set<string>([
            ...policy.references.filter((r) => r.action === 'delete').map((r) => r.table),
            ...policy.dependents.filter((d) => d.action === 'delete').map((d) => d.table),
        ]);
        const depKeys = new Map(policy.dependents.map((d) => [`${key(d.table, d.column)}->${d.references}`, d]));

        const required = generated.filter((fk) => fk.referencedTable !== 'Entity' && deleted.has(fk.referencedTable));
        const missing = required
            .filter((fk) => !depKeys.has(`${key(fk.table, fk.column)}->${fk.referencedTable}`))
            .map((fk) => `${key(fk.table, fk.column)} -> ${fk.referencedTable}`);
        expect(missing, 'FKs into deleted tables with no entry in entity-delete-fk-policy.json "dependents"').toEqual([]);

        const nullabilityDrift = required
            .filter((fk) => {
                const d = depKeys.get(`${key(fk.table, fk.column)}->${fk.referencedTable}`);
                return d !== undefined && d.nullable !== fk.nullable;
            })
            .map((fk) => key(fk.table, fk.column));
        expect(nullabilityDrift).toEqual([]);

        const live = new Set(generated.map((fk) => `${key(fk.table, fk.column)}->${fk.referencedTable}`));
        const stale = policy.dependents.filter((d) => !live.has(`${key(d.table, d.column)}->${d.references}`)).map((d) => key(d.table, d.column));
        expect(stale, 'dependents entries with no matching FK in generated metadata').toEqual([]);
    });

    it(`carries out every delete/null reference in the proc`, () => {
        const missing: string[] = [];
        for (const r of policy.references) {
            if (r.action === 'block') continue;
            const idx = r.action === 'delete'
                ? findStatement(stmts, deleteFrom(r.table), r.column, '= @EntityID')
                : findStatement(stmts, updateNull(r.table, r.column), r.column, '= @EntityID');
            if (idx < 0) {
                missing.push(`${r.action} ${key(r.table, r.column)}`);
                continue;
            }
            for (const also of r.alsoNull ?? []) {
                if (!new RegExp(`\\[${also}\\] = NULL`).test(stmts[idx])) missing.push(`null ${key(r.table, also)} with ${r.column}`);
            }
        }
        expect(missing, `statements missing from ${file}`).toEqual([]);
    });

    it('carries out every dependents entry before deleting the parent rows', () => {
        const missing: string[] = [];
        const misordered: string[] = [];
        for (const d of policy.dependents) {
            const head = d.action === 'delete' ? deleteFrom(d.table) : updateNull(d.table, d.column);
            const idx = findStatement(stmts, head, d.column, 'IN \\(');
            if (idx < 0) {
                missing.push(`${d.action} ${key(d.table, d.column)} -> ${d.references}`);
                continue;
            }
            const parentDelete = firstDeleteOf(stmts, d.references);
            if (parentDelete >= 0 && idx > parentDelete) misordered.push(`${key(d.table, d.column)} after DELETE ${d.references}`);
        }
        expect(missing, `statements missing from ${file}`).toEqual([]);
        expect(misordered).toEqual([]);
    });

    it('clears every reference before deleting the Entity row', () => {
        const entityDelete = stmts.findIndex((s) => new RegExp(`^DELETE FROM ${S}\\.\\[Entity\\] WHERE \\[ID\\] = @EntityID`).test(s));
        expect(entityDelete).toBeGreaterThan(0);
        const late = stmts
            .slice(entityDelete + 1)
            .filter((s) => /^(DELETE|UPDATE) /.test(s));
        expect(late).toEqual([]);
    });

    it('lists exactly the delete/null references in the precondition, so blocked ones still stop the delete', () => {
        const handledBlock = /INSERT INTO @Handled \(Pair\) VALUES([\s\S]*?);/.exec(body);
        expect(handledBlock).not.toBeNull();
        const handled = new Set([...(handledBlock?.[1] ?? '').matchAll(/N'([\w]+\.[\w]+)'/g)].map((m) => m[1]));
        const expected = new Set(policy.references.filter((r) => r.action !== 'block').map((r) => key(r.table, r.column)));
        expect([...handled].sort()).toEqual([...expected].sort());
        for (const r of policy.references.filter((x) => x.action === 'block')) {
            expect(handled.has(key(r.table, r.column))).toBe(false);
        }
    });

    it('runs in its own transaction with XACT_ABORT when the caller has none', () => {
        expect(body).toMatch(/SET XACT_ABORT ON/);
        expect(body).toMatch(/IF @@TRANCOUNT = 0\s+BEGIN\s+BEGIN TRANSACTION;/);
        expect(body).toMatch(/IF @OwnsTransaction = 1 COMMIT TRANSACTION;/);
        expect(body).toMatch(/IF @OwnsTransaction = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;/);
    });
});
