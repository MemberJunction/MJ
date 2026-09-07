import { CodeGenConnection } from '../Database/codeGenDatabaseProvider';
import { configInfo, mj_core_schema, SQLOutputConfig, dbPlatform, currentWorkingDirectory } from "../Config/config";
import { logError, logStatus } from "./status_logging";
import * as fs from 'fs';
import path from 'path';

const MJ_DEFAULT_SQL_OUTPUT_RE = /(^|\/|\\)migrations[/\\]v\d+[/\\]?$/i;

/**
 * True when `folderPath` is the CodeGenLib / MJ-host default (`./migrations/v5` etc.),
 * not an Open App `migrations/codegen` tree.
 */
export function isMjDefaultSqlOutputPath(folderPath: string): boolean {
    const n = folderPath.replace(/\\/g, '/').replace(/\/+$/, '');
    return MJ_DEFAULT_SQL_OUTPUT_RE.test(n) || n === './migrations/v5' || n === '../../migrations/v5';
}

export type ResolveSQLOutputFolderArgs = {
    cwd: string;
    configuredFolderPath?: string;
    includeSchemas?: string[];
    coreSchema: string;
    /** CLI `--sql-output-dir`. Wins over config when set. */
    sqlOutputDirFlag?: string;
    hasMjAppJson: boolean;
    isMjMonorepo: boolean;
};

/**
 * Where CodeGen writes `CodeGen_Run_*.sql` (EntityField INSERTs and other metadata SQL).
 *
 * Open App (`mj-app.json` in cwd): always `{cwd}/migrations/codegen` unless
 * `--sql-output-dir` or an explicit non-MJ `SQLOutput.folderPath` is set.
 * Never fall back to `MJ/migrations/v*` — that silently dropped Open App
 * EntityField SQL into the host tree.
 *
 * MJ monorepo cwd + `includeSchemas` listing a non-core schema: throw. Run
 * CodeGen from the app directory.
 */
export function resolveSQLOutputFolder(args: ResolveSQLOutputFolderArgs): string {
    const cwd = path.resolve(args.cwd);
    const core = (args.coreSchema || '__mj').toLowerCase();
    const include = (args.includeSchemas ?? []).map(s => s.toLowerCase());
    const generatingAppSchemas = include.some(s => s !== core);

    if (args.sqlOutputDirFlag) {
        const resolved = path.resolve(cwd, args.sqlOutputDirFlag);
        if (args.hasMjAppJson && isMjDefaultSqlOutputPath(resolved)) {
            throw new Error(
                `CodeGen --sql-output-dir resolves to an MJ host migrations tree (${resolved}). ` +
                `Open App metadata SQL must go to the app's migrations/codegen. ` +
                `Run from the app cwd (mj-app.json) without this flag, or pass the app codegen folder.`
            );
        }
        return resolved;
    }

    if (args.hasMjAppJson) {
        const configured = args.configuredFolderPath;
        if (configured && !isMjDefaultSqlOutputPath(configured)) {
            return path.resolve(cwd, configured);
        }
        return path.join(cwd, 'migrations', 'codegen');
    }

    if (args.isMjMonorepo && generatingAppSchemas) {
        throw new Error(
            `CodeGen SQLOutput would write Open App metadata SQL into the MJ repo (${cwd}). ` +
            `Run \`mj codegen\` from the Open App directory (a cwd that contains mj-app.json), not from MJ. ` +
            `includeSchemas=${(args.includeSchemas ?? []).join(',') || '(empty)'}`
        );
    }

    const folder = args.configuredFolderPath ?? './migrations/v5/';
    return path.resolve(cwd, folder);
}

/**
 * Utility class for logging SQL to a run file that can be fresh for each run or appended to depending on the settings in the configuration
 */
export class SQLLogging {
    private static _SQLLoggingFilePath: string = '';
    private static _OmitRecurringScriptsFromLog: boolean = false;
    /** CLI `--sql-output-dir`. Set before {@link initSQLLogging}. */
    public static sqlOutputDirFlag: string | undefined;

    public static get SQLLoggingFilePath(): string {
        return SQLLogging._SQLLoggingFilePath;
    }
    public static get OmitRecurringScriptsFromLog(): boolean {
        return SQLLogging._OmitRecurringScriptsFromLog
    }

    /**
     * Rewrites the migrations-root segment of a path to `migrations-pg`.
     *
     * Matching on a path SEGMENT rather than a prefix is what makes this reliable. The original
     * code exact-matched the single string `'./migrations/v5/'`, so once the repo moved to v6 an
     * ordinary `'./migrations/v6/'` stopped matching and PostgreSQL CodeGen wrote its audit SQL
     * into the SQL Server tree — silently. Anchoring at the start of the string fixes that case
     * but still misses an absolute path (`/repo/migrations/v6/`, which is what `path.resolve` on
     * a config value produces) and a Windows separator (`.\migrations\v6\`).
     *
     * Only the LAST such segment is rewritten, and the match is not global. Rewriting every
     * occurrence is wrong twice over: a checkout that itself lives under a directory named
     * `migrations` (`/Users/x/migrations/mj/migrations/v6/`) would have its ANCESTOR rewritten
     * too, and `initSQLLogging` then `mkdirSync`s the result — silently fabricating a tree
     * outside the repo and writing the audit SQL into it, which is precisely the misroute this
     * helper exists to prevent. It also made the function non-idempotent for adjacent segments,
     * because a shared separator stops two neighbours matching in one pass.
     *
     * Paths with no `migrations` segment are returned untouched — an explicit override elsewhere
     * on disk is honored as-is, which is the documented behaviour. `migrations-pg` is already the
     * destination and is left alone, so the function is idempotent.
     *
     * Public so the routing can be unit-tested without a CodeGen run.
     */
    public static redirectToPGMigrations(folderPath: string): string {
        // Split on either separator so a Windows-style path is handled without normalizing the
        // whole string (which would rewrite the caller's separators as a side effect).
        const segments = folderPath.split(/([\\/])/);

        // Already inside the PostgreSQL tree — nothing to do. This check is what makes the
        // function idempotent, and it is not redundant with the loop below: after one rewrite the
        // path may STILL contain an earlier `migrations` segment (an ancestor directory that
        // happens to be named that), and a second application would walk left and rewrite the
        // ancestor too.
        if (segments.includes('migrations-pg')) return folderPath;

        // Rewrite only the LAST `migrations` segment — the migrations root, not an ancestor that
        // shares its name. Rewriting an ancestor sends the audit SQL to a path that does not
        // exist, and `initSQLLogging` mkdirSync's it, silently fabricating a tree outside the
        // repo: exactly the misroute this helper exists to prevent.
        for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i] === 'migrations') {
                segments[i] = 'migrations-pg';
                return segments.join('');
            }
        }
        return folderPath;
    }
    public static initSQLLogging() {
        SQLLogging._OmitRecurringScriptsFromLog = configInfo.SQLOutput.omitRecurringScriptsFromLog;
        if (!SQLLogging.SQLLoggingFilePath) {
            const config = configInfo.SQLOutput;
            if(!config){
                throw new Error("SQLOutput config is required to enable metadata logging");
            }

            if (!config.enabled)
                return;

            const cwd = currentWorkingDirectory || process.cwd();
            const coreSchema = mj_core_schema();
            let folderPath = resolveSQLOutputFolder({
                cwd,
                configuredFolderPath: config.folderPath,
                includeSchemas: configInfo.includeSchemas,
                coreSchema,
                sqlOutputDirFlag: SQLLogging.sqlOutputDirFlag,
                hasMjAppJson: fs.existsSync(path.join(cwd, 'mj-app.json')),
                isMjMonorepo:
                    fs.existsSync(path.join(cwd, 'packages', 'CodeGenLib')) ||
                    fs.existsSync(path.join(cwd, 'packages', 'MJCLI')),
            });

            if (dbPlatform() === 'postgresql') {
                folderPath = SQLLogging.redirectToPGMigrations(folderPath);
            }

            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, {recursive: true });
            }

            const fileName: string = config.fileName || this.createFileName();
            SQLLogging._SQLLoggingFilePath = path.join(folderPath, fileName);

            if (!config.appendToFile || !fs.existsSync(SQLLogging.SQLLoggingFilePath)) {
                fs.writeFileSync(SQLLogging.SQLLoggingFilePath, '');
            }

            logStatus(`Metadata logging enabled. File path: ${SQLLogging.SQLLoggingFilePath}`);
        }
     }

    /** Test hook — SQLLogging is a process-wide singleton. */
    public static resetForTests(): void {
        SQLLogging._SQLLoggingFilePath = '';
        SQLLogging.sqlOutputDirFlag = undefined;
    }

     public static finishSQLLogging() {
        if (SQLLogging.SQLLoggingFilePath) {
            if (SQLLogging.getFileLength(SQLLogging.SQLLoggingFilePath) === 0) {
                // no content in the file, so delete it
                fs.unlinkSync(SQLLogging.SQLLoggingFilePath);
                logStatus(" >>> SQL logging file was empty and has been deleted");
            }
            else if(configInfo.SQLOutput.convertCoreSchemaToFlywayMigrationFile){
                SQLLogging.convertSQLLogToFlywaySchema();
            }
        }
     }

     protected static createFileName(): string {
        const date = new Date();

        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-based
        const day = String(date.getUTCDate()).padStart(2, '0');

        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        const second = String(date.getUTCSeconds()).padStart(2, '0');

        const fileName = `CodeGen_Run_${year}-${month}-${day}_${hour}-${minute}-${second}.sql`;
        return fileName;
    }

    /**
     * Adds the provided SQL to the log file for the run
     * @param contents - the executable SQL to log
     * @param description - a description of what is being logged that will be emitted and wrapped in comments
     * @param isRecurringScript - if set to true tells the logger that the provided SQL represents a recurring script meaning it is something that is executed, generally, for all CodeGen runs. In these cases, the Config settings can result in omitting these recurring scripts from being logged because the configuration environment may have those recurring scripts already set to run after all run-specific migrations get run.
     * @returns
     */
    /**
     * Adds the provided SQL to the log file for the run
     * @param contents - the executable SQL to log
     * @param description - a description of what is being logged that will be emitted and wrapped in comments
     * @param isRecurringScript - if set to true tells the logger that the provided SQL represents a recurring script meaning it is something that is executed, generally, for all CodeGen runs. In these cases, the Config settings can result in omitting these recurring scripts from being logged because the configuration environment may have those recurring scripts already set to run after all run-specific migrations get run.
     * @param includeBatchSeparator - if true, appends a batch separator (e.g., GO for SQL Server) after the SQL. Use this when the next statement in the migration needs to reference schema changes made by this statement (e.g., ALTER TABLE ADD column followed by UPDATE referencing that column). Defaults to false.
     * @param batchSeparator - the batch separator string to use (e.g., 'GO' for SQL Server). Only used when includeBatchSeparator is true.
     * @returns
     */
    public static async appendToSQLLogFile(contents: string, description?: string, isRecurringScript: boolean = false, includeBatchSeparator: boolean = false, batchSeparator: string = 'GO'): Promise<void> {
        try{
            if (isRecurringScript && SQLLogging.OmitRecurringScriptsFromLog) {
                return; // is a recurring script and the flag to omit recurring scripts is set
            }
            if(!contents || !SQLLogging.SQLLoggingFilePath){
                return;
            }

            // A logged unit that declares a T-SQL local variable (`DECLARE @x ...`) must end its batch
            // in the replayable file. Every unit is executed as its own query, so no later unit can
            // depend on the variable — but without a separator, two such units concatenated into one
            // migration batch fail replay with "The variable name '@x' has already been declared".
            // Callers own the choice in the normal case; this guard covers any unit that declares a
            // batch-scoped variable, whether or not the caller asked for a separator. It does not see
            // a declaration hidden inside a string or a mid-line statement, so emitters should still
            // pass includeBatchSeparator explicitly. PostgreSQL never declares `@` variables.
            if (!includeBatchSeparator && batchSeparator && SQLLogging.declaresTSQLVariable(contents)) {
                includeBatchSeparator = true;
            }

            if(description){
                const comment = `/* ${description} */\n`;
                contents = `${comment}${contents}`;
            }

            // Many call sites pass SQL without a trailing semicolon because they execute
            // it via the PG client / mssql driver where the protocol treats each query as
            // standalone. When that SQL is concatenated into a replayable log file (a
            // CodeGen_Run_*.sql migration), the missing ; turns each subsequent statement
            // into a syntax error during raw `psql -f` / `mj migrate` replay
            // ("syntax error at or near INSERT" on the next statement).
            //
            // Normalize: strip any trailing whitespace and ensure the content ends with `;`
            // before adding spacing. Multiple `;`s are harmless in both T-SQL and PG, so
            // call sites that already include a terminator pay nothing.
            //
            // EXCEPTION: T-SQL `GO` is a batch separator, not a statement — emitters like
            // generateBaseView / generateCRUDCreate / generateRootIDFunction return strings
            // ending in `GO`. Appending `;` produces `GO;`, which SSMS and sqlcmd reject
            // ("Incorrect syntax near ';'"). Detect and skip the `;` append in that case.
            const trimmed = contents.replace(/[\s;]+$/g, '');
            let endsWithBatchSeparator = false;
            if (trimmed.length > 0) {
                endsWithBatchSeparator = /(^|\n)\s*GO\s*$/i.test(trimmed);
                contents = endsWithBatchSeparator ? trimmed : `${trimmed};`;
            }

            // An empty separator (PostgreSQL) means "no batch separator"; don't emit a blank line for it.
            // A unit that already closes its own batch (ends in GO) gets no second separator.
            contents = includeBatchSeparator && batchSeparator && !endsWithBatchSeparator
                ? `${contents}\n${batchSeparator}\n\n`
                : `${contents}\n\n`;

            fs.appendFileSync(SQLLogging.SQLLoggingFilePath, contents);
        }
        catch(ex){
           logError("Unable to log metadata SQL text to file", ex);
        }
    }

    /**
    * Executes the given SQL query using the given DataSource object.
    * If the appendToLogFile parameter is true, the query will also be appended to the log file.
    * Note that in order to append to the log file, ManageMetadataBase.manageMetaDataLogging must be called first.
    * @param ds - The DataSource object to use to execute the query.
    * @param query - The SQL query to execute.
    * @param description - A description of the query to append to the log file.
    * @param isRecurringScript - if set to true tells the logger that the provided SQL represents a recurring script meaning it is something that is executed, generally, for all CodeGen runs. In these cases, the Config settings can result in omitting these recurring scripts from being logged because the configuration environment may have those recurring scripts already set to run after all run-specific migrations get run.
    * @returns - The result of the query execution.
    */
    public static async LogSQLAndExecute(ds: CodeGenConnection, query: string, description?: string, isRecurringScript: boolean = false, includeBatchSeparator: boolean = false, batchSeparator: string = 'GO'): Promise<any> {
        if (configInfo.SQLOutput?.enabled && !SQLLogging.SQLLoggingFilePath) {
            throw new Error(
                'SQLOutput.enabled but no CodeGen_Run log file is open. Refusing to apply metadata SQL with no artifact. ' +
                'Run `mj codegen` from the Open App directory (mj-app.json) or pass --sql-output-dir.'
            );
        }
        SQLLogging.appendToSQLLogFile(query, description, isRecurringScript, includeBatchSeparator, batchSeparator);
        const result = await ds.query(query);
        return result.recordset;
    }

    /**
     * True when the SQL text declares a batch-scoped T-SQL local variable (`DECLARE @name ...`) at the
     * start of any line, and no routine header (`CREATE [OR ALTER] PROCEDURE|FUNCTION|TRIGGER`) precedes
     * it. T-SQL variables are scoped to the batch wherever they are declared — after `SET NOCOUNT ON`,
     * inside `IF ... BEGIN ... END` — so the match is not limited to the first statement. A declaration
     * inside a routine body is routine-scoped and cannot collide across units, so it is not matched.
     */
    public static declaresTSQLVariable(sql: string): boolean {
        if (!sql) {
            return false;
        }
        const routineHeader = /^\s*CREATE\s+(OR\s+ALTER\s+)?(PROC|PROCEDURE|FUNCTION|TRIGGER)\b/i;
        const declaration = /^\s*DECLARE\s+@/i;
        for (const line of sql.split('\n')) {
            if (routineHeader.test(line)) {
                return false;
            }
            if (declaration.test(line)) {
                return true;
            }
        }
        return false;
    }

    protected static getFileLength(filePath: string): number {
        try {
            const stats = fs.statSync(filePath);
            return stats.size;
        }
        catch (err) {
            return 0;
        }
    }

    protected static convertSQLLogToFlywaySchema(): void {
        if(!this.SQLLoggingFilePath || !configInfo.SQLOutput.convertCoreSchemaToFlywayMigrationFile){
           return;
        }

        let data: string = fs.readFileSync(this.SQLLoggingFilePath, 'utf-8');

        // Get schema placeholder mappings, defaulting to legacy behavior if not specified
        const schemaPlaceholders = configInfo.SQLOutput.schemaPlaceholders || [
            { schema: mj_core_schema(), placeholder: '${flyway:defaultSchema}' }
        ];

        // Apply each schema-to-placeholder mapping in order
        for (const mapping of schemaPlaceholders) {
            // Negative lookahead to avoid matching schema_CreatedAt, schema_UpdatedAt, etc.
            const regex: RegExp = new RegExp(`${this.escapeRegex(mapping.schema)}(?!(_(\\w+)At))`, 'g');
            const beforeCount = (data.match(regex) || []).length;
            data = data.replace(regex, mapping.placeholder);
            logStatus(`   >>> Replaced ${beforeCount} instances of ${mapping.schema} with ${mapping.placeholder}`);
        }

        fs.writeFileSync(`${this.SQLLoggingFilePath}`, data);
        logStatus(`   >>> Flyway Migration File Completed`);
     }

     /**
      * Escapes special regex characters in a string
      * @param str The string to escape
      * @returns The escaped string safe for use in regex
      */
     private static escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
     }
}
