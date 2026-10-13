/**
 * Rig: runs the real CodeGen (`mj codegen --skipfiles --no-ai`) against a throwaway copy of an MJ
 * database and checks what its first-pass delete of entity fields whose column is gone from the base table does
 * across a sequence of schema changes:
 *
 *   setup      a schema with Parent(ID, Name) and Child(ID, ParentID → Parent, Notes, Extra); CodeGen registers both
 *              entities, their fields, the Child.ParentID relationship and the virtual name field
 *   no-op      CodeGen again: field and relationship counts unchanged, the first-pass delete never runs
 *   no view    Child's base view dropped, CodeGen again: the first-pass delete never runs, the view and every field are back
 *   rename     ParentID → OwnerID: the run succeeds; the ParentID field is gone and OwnerID exists; the relationship
 *              keeps its ID and now joins on OwnerID; the first-pass delete names only the ParentID field (the virtual
 *              name field is left to the view-aware second pass)
 *   drop       OwnerID dropped: its field and the relationship joined on it are gone
 *
 * The rig creates the throwaway SQL Server database itself from --from (BACKUP … COPY_ONLY / RESTORE under a fresh
 * name) and drops it at the end unless --keep. It refuses to copy into a name that already exists; the source is only
 * read.
 *
 * Usage, from the MJ repo root, with DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD set:
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/codegen-dropped-column.ts \
 *       --from <migrated MJ database> [--keep]
 * Exit: 0 = every expectation held, 1 = an expectation failed, 2 = bootstrap or usage error.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sql from 'mssql';
import { UUIDsEqual } from '@memberjunction/global';
import { RigCLI, RigUsageError } from '../lib/rig-cli';


function env(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new RigUsageError(`${name} is not set`);
    }
    return value;
}

/** One SQL Server database: run statements, read rows as text. */
class SqlServerRigDatabase {
    private constructor(public readonly Name: string, private readonly pool: sql.ConnectionPool) {}
    public static async Open(database: string): Promise<SqlServerRigDatabase> {
        const pool = await new sql.ConnectionPool({
            server: env('DB_HOST'), port: Number(env('DB_PORT')), user: env('DB_USERNAME'), password: env('DB_PASSWORD'),
            database, options: { trustServerCertificate: true, encrypt: true }, requestTimeout: 300000,
        }).connect();
        return new SqlServerRigDatabase(database, pool);
    }
    public async Exec(statement: string): Promise<void> {
        await this.pool.request().batch(statement);
    }
    public async Rows(query: string): Promise<string[][]> {
        const result = await this.pool.request().query(query);
        return (result.recordset || []).map((row: Record<string, unknown>) => Object.values(row).map((v) => (v === null ? '' : String(v))));
    }
    public async Close(): Promise<void> {
        await this.pool.close();
    }
}

/** SQL Server identifier quoting. */
const q = (name: string): string => `[${name}]`;

/** The rig's two tables: Parent(ID, Name) and Child(ID, ParentID → Parent, Notes, Extra). */
function createSchema(s: string): string[] {
    return [
        `CREATE SCHEMA [${s}]`,
        `CREATE TABLE [${s}].[Parent] ([ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [PK_Parent] PRIMARY KEY DEFAULT NEWSEQUENTIALID(), [Name] NVARCHAR(100) NOT NULL)`,
        `CREATE TABLE [${s}].[Child] ([ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [PK_Child] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
            [ParentID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [FK_Child_Parent] REFERENCES [${s}].[Parent]([ID]),
            [Notes] NVARCHAR(200) NULL, [Extra] INT NULL)`,
    ];
}

/** Drops a column with the indexes CodeGen created on it (its foreign-key index), which SQL Server requires first. */
function dropColumn(s: string, t: string, c: string): string {
    return `DECLARE @drop NVARCHAR(MAX) = N'';
SELECT @drop += N'DROP INDEX ' + QUOTENAME(i.name) + N' ON [${s}].[${t}];'
  FROM sys.indexes i
  JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
  JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
 WHERE i.object_id = OBJECT_ID(N'[${s}].[${t}]') AND col.name = N'${c}' AND i.is_primary_key = 0;
EXEC sp_executesql @drop;
ALTER TABLE [${s}].[${t}] DROP COLUMN [${c}];`;
}

const RIG_SCHEMA = 'cgrig_dropcol';

interface Options {
    From: string;
    Keep: boolean;
}

function parseArgs(argv: string[]): Options {
    const value = (flag: string): string | undefined => {
        const at = argv.indexOf(flag);
        return at >= 0 ? argv[at + 1] : undefined;
    };
    const from = value('--from');
    if (!from) {
        throw new RigUsageError('usage: codegen-dropped-column.ts --from <migrated MJ database> [--keep]');
    }
    return { From: from, Keep: argv.includes('--keep') };
}

/**
 * Restores a copy of the `from` database under `name` (BACKUP … COPY_ONLY, then RESTORE). The backup file is deleted
 * whether or not the restore succeeds, so a failed run leaves nothing in the server's data directory.
 */
async function createScratch(from: string, name: string): Promise<void> {
    const master = await SqlServerRigDatabase.Open('master');
    try {
        if ((await master.Rows(`SELECT 1 FROM sys.databases WHERE name = '${name}'`)).length > 0) {
            throw new RigUsageError(`${name} already exists`);
        }
        const backup = `/var/opt/mssql/data/${name}.bak`;
        try {
            await master.Exec(`BACKUP DATABASE [${from}] TO DISK = '${backup}' WITH COPY_ONLY, INIT`);
            const files = await master.Rows(`SELECT name, type_desc FROM sys.master_files WHERE database_id = DB_ID('${from}')`);
            const moves = files.map(([logical, kind]) => `MOVE '${logical}' TO '/var/opt/mssql/data/${name}${kind === 'LOG' ? '_log.ldf' : '.mdf'}'`).join(', ');
            await master.Exec(`RESTORE DATABASE [${name}] FROM DISK = '${backup}' WITH ${moves}`);
        } finally {
            // only when the BACKUP wrote it, so a failed BACKUP still reports its own error
            await master.Exec(`DECLARE @exists INT; EXEC master.dbo.xp_fileexist N'${backup}', @exists OUTPUT;
IF @exists = 1 EXECUTE master.dbo.xp_delete_file 0, N'${backup}';`);
        }
    } finally {
        await master.Close();
    }
}

async function dropScratch(name: string): Promise<void> {
    const master = await SqlServerRigDatabase.Open('master');
    try {
        await master.Exec(`IF DB_ID('${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END`);
    } finally {
        await master.Close();
    }
}

/** The outcome of one CodeGen run: its reported success, its error contexts, and the SQL it logged. */
interface CodeGenRun {
    Success: boolean;
    ErrorContexts: string[];
    LoggedSQL: string;
}

function runCodeGen(database: string, label: string): CodeGenRun {
    const outDir = mkdtempSync(join(tmpdir(), `cgrig-${label}-`));
    const platformEnv: Record<string, string> = {
        DB_PLATFORM: 'sqlserver', DB_DATABASE: database,
        CODEGEN_DB_USERNAME: env('DB_USERNAME'), CODEGEN_DB_PASSWORD: env('DB_PASSWORD'),
    };
    const result = spawnSync('node', ['packages/MJCLI/bin/run.js', 'codegen', '--skipfiles', '--no-ai', '--sql-output-dir', outDir], {
        env: { ...process.env, ...platformEnv }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    });
    const stdout = result.stdout || '';
    const summaryLine = stdout.split('\n').reverse().find((line) => line.startsWith('{"version"'));
    let success = false;
    let errorContexts: string[] = [];
    if (summaryLine) {
        const summary = JSON.parse(summaryLine) as { success: boolean; errors: Array<{ context: string }> };
        success = summary.success;
        errorContexts = summary.errors.map((e) => e.context);
    }
    const loggedSQL = readdirSync(outDir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(outDir, f), 'utf8')).join('\n');
    rmSync(outDir, { recursive: true, force: true });
    console.log(`  codegen[${label}]: exit=${result.status} success=${success}${errorContexts.length ? ` errors=${errorContexts.join(',')}` : ''}`);
    return { Success: success, ErrorContexts: errorContexts, LoggedSQL: loggedSQL };
}

const FIRST_PASS_MARKER = 'Delete the entity fields whose column was dropped from the base table';

async function main(): Promise<number> {
    const options = parseArgs(process.argv.slice(2));
    // a fresh name every run: the rig only ever writes to the copy it creates (the source is only read, by the copy)
    const scratch = `MJ_cgrig_${Date.now().toString(36)}`;
    const mj = (table: string): string => `${q(process.env.MJ_CORE_SCHEMA || '__mj')}.${q(table)}`;
    let failures = 0;
    const check = (label: string, ok: boolean, detail: string): void => {
        console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${detail}`);
        if (!ok) failures++;
    };

    console.log(`creating ${scratch} from ${options.From}`);
    await createScratch(options.From, scratch);
    const db = await SqlServerRigDatabase.Open(scratch);
    try {
        const counts = async (): Promise<{ Fields: number; Relationships: number }> => {
            const [[fields, relationships]] = await db.Rows(`SELECT (SELECT COUNT(*) FROM ${mj('EntityField')}) AS ${q('F')}, (SELECT COUNT(*) FROM ${mj('EntityRelationship')}) AS ${q('R')}`);
            return { Fields: Number(fields), Relationships: Number(relationships) };
        };
        const entity = async (table: string): Promise<{ ID: string; BaseView: string } | null> => {
            const rows = await db.Rows(`SELECT ${q('ID')}, ${q('BaseView')} FROM ${mj('Entity')} WHERE ${q('SchemaName')} = '${RIG_SCHEMA}' AND ${q('BaseTable')} = '${table}'`);
            return rows.length === 1 ? { ID: rows[0][0].toUpperCase(), BaseView: rows[0][1] } : null;
        };
        const fieldsOf = async (entityID: string): Promise<Map<string, { ID: string; IsVirtual: boolean }>> => {
            const rows = await db.Rows(`SELECT ${q('Name')}, ${q('ID')}, ${q('IsVirtual')} FROM ${mj('EntityField')} WHERE ${q('EntityID')} = '${entityID}'`);
            return new Map(rows.map(([name, id, isVirtual]) => [name, { ID: id.toUpperCase(), IsVirtual: isVirtual === 'true' || isVirtual === '1' }]));
        };
        const relationshipsBetween = async (parentID: string, childID: string): Promise<Array<{ ID: string; JoinField: string }>> =>
            (await db.Rows(`SELECT ${q('ID')}, ${q('RelatedEntityJoinField')} FROM ${mj('EntityRelationship')} WHERE ${q('EntityID')} = '${parentID}' AND ${q('RelatedEntityID')} = '${childID}'`))
                .map(([id, joinField]) => ({ ID: id.toUpperCase(), JoinField: joinField }));
        // each first-pass batch: the statements between its marker comment and the next comment
        const firstPassDeletes = (run: CodeGenRun): string[] => run.LoggedSQL.split(FIRST_PASS_MARKER).slice(1).map((s) => {
            const next = s.indexOf('/*');
            return next >= 0 ? s.slice(0, next) : s;
        });

        // ── setup ────────────────────────────────────────────────────────────────────────────────────────────────
        for (const statement of createSchema(RIG_SCHEMA)) {
            await db.Exec(statement);
        }
        const baseline = runCodeGen(scratch, 'setup');
        const parent = await entity('Parent');
        const child = await entity('Child');
        if (!parent || !child) {
            throw new RigUsageError('setup: CodeGen did not register both rig tables as entities');
        }
        const baselineErrors = new Set(baseline.ErrorContexts);
        const setupFields = await fieldsOf(child.ID);
        const virtualName = [...setupFields.entries()].find(([, f]) => f.IsVirtual)?.[0] || '';
        const [relationship] = await relationshipsBetween(parent.ID, child.ID);
        check('setup registers Child.ParentID, its virtual name field and the relationship',
            setupFields.has('ParentID') && virtualName.length > 0 && relationship?.JoinField === 'ParentID',
            `fields=${[...setupFields.keys()].sort().join(',')} relationship=${relationship ? `${relationship.ID} on ${relationship.JoinField}` : 'none'}`);
        const newErrors = (run: CodeGenRun): string[] => run.ErrorContexts.filter((c) => !baselineErrors.has(c));

        // ── no-op ────────────────────────────────────────────────────────────────────────────────────────────────
        const before = await counts();
        const noop = runCodeGen(scratch, 'no-op');
        const after = await counts();
        check('no-op: field and relationship counts unchanged', before.Fields === after.Fields && before.Relationships === after.Relationships,
            `fields ${before.Fields}→${after.Fields}, relationships ${before.Relationships}→${after.Relationships}`);
        check('no-op: the first-pass delete never runs', firstPassDeletes(noop).length === 0, `${firstPassDeletes(noop).length} first-pass delete batch(es)`);
        check('no-op: no new CodeGen errors', newErrors(noop).length === 0, newErrors(noop).join(',') || 'none');

        // ── missing base view ────────────────────────────────────────────────────────────────────────────────────
        await db.Exec(`DROP VIEW IF EXISTS ${q(RIG_SCHEMA)}.${q(child.BaseView)}`);
        const noView = runCodeGen(scratch, 'no-view');
        const afterNoView = await fieldsOf(child.ID);
        const viewBack = (await db.Rows(`SELECT 1 FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = '${RIG_SCHEMA}' AND TABLE_NAME = '${child.BaseView}'`)).length === 1;
        check('missing base view: the first-pass delete never runs', firstPassDeletes(noView).length === 0, `${firstPassDeletes(noView).length} first-pass delete batch(es)`);
        check('missing base view: the view is regenerated and every field keeps its ID',
            viewBack && [...setupFields.entries()].every(([name, f]) => UUIDsEqual(afterNoView.get(name)?.ID, f.ID)),
            `view ${viewBack ? 'back' : 'missing'}, fields=${[...afterNoView.keys()].sort().join(',')}`);
        check('missing base view: no new CodeGen errors', newErrors(noView).length === 0, newErrors(noView).join(',') || 'none');

        // ── rename ───────────────────────────────────────────────────────────────────────────────────────────────
        await db.Exec(`EXEC sp_rename '${RIG_SCHEMA}.Child.ParentID', 'OwnerID', 'COLUMN'`);
        const rename = runCodeGen(scratch, 'rename');
        const afterRename = await fieldsOf(child.ID);
        const renamedRelationships = await relationshipsBetween(parent.ID, child.ID);
        const renameDeletes = firstPassDeletes(rename).join('\n');
        check('rename: no new CodeGen errors (no UQ_EntityField_EntityID_Sequence collision)', newErrors(rename).length === 0, newErrors(rename).join(',') || 'none');
        check('rename: ParentID field gone, OwnerID field present', !afterRename.has('ParentID') && afterRename.has('OwnerID'), `fields=${[...afterRename.keys()].sort().join(',')}`);
        check('rename: the relationship keeps its ID and now joins on OwnerID',
            renamedRelationships.length === 1 && UUIDsEqual(renamedRelationships[0].ID, relationship?.ID) && renamedRelationships[0].JoinField === 'OwnerID',
            renamedRelationships.map((r) => `${r.ID} on ${r.JoinField}`).join('; ') || 'none');
        const parentIDField = setupFields.get('ParentID')?.ID || '';
        const virtualField = setupFields.get(virtualName)?.ID || '';
        check('rename: the first-pass delete names the ParentID field and not the virtual name field',
            renameDeletes.toUpperCase().includes(parentIDField) && !renameDeletes.toUpperCase().includes(virtualField),
            `${firstPassDeletes(rename).length} batch(es)`);

        // ── drop ─────────────────────────────────────────────────────────────────────────────────────────────────
        await db.Exec(`ALTER TABLE ${q(RIG_SCHEMA)}.${q('Child')} DROP CONSTRAINT ${q('FK_Child_Parent')}`);
        await db.Exec(dropColumn(RIG_SCHEMA, 'Child', 'OwnerID'));
        const drop = runCodeGen(scratch, 'drop');
        const afterDrop = await fieldsOf(child.ID);
        const droppedRelationships = await relationshipsBetween(parent.ID, child.ID);
        check('drop: no new CodeGen errors', newErrors(drop).length === 0, newErrors(drop).join(',') || 'none');
        check('drop: the OwnerID field is gone', !afterDrop.has('OwnerID'), `fields=${[...afterDrop.keys()].sort().join(',')}`);
        check('drop: the relationship joined on it is gone', droppedRelationships.length === 0, droppedRelationships.map((r) => `${r.ID} on ${r.JoinField}`).join('; ') || 'none');
        console.log(`  baseline CodeGen errors on this database (ignored by the checks above): ${[...baselineErrors].join(',') || 'none'}`);
    } finally {
        await db.Close();
        // CodeGen also writes each object's SQL under the host's SQL output directory (gitignored); the rig's schema
        // exists only in the throwaway copy, so its folder there is removed with the copy
        rmSync(join('SQL Scripts', 'generated', RIG_SCHEMA), { recursive: true, force: true });
        if (options.Keep) {
            console.log(`kept ${scratch}`);
        } else {
            await dropScratch(scratch);
            console.log(`dropped ${scratch}`);
        }
    }
    console.log(`RESULT: ${failures === 0 ? 'PASS' : 'FAIL'}`);
    return failures === 0 ? 0 : 1;
}

void RigCLI.Main(main);
