import { CodeGenConnection } from '../Database/codeGenDatabaseProvider';
import { configInfo, mj_core_schema, SQLOutputConfig, dbPlatform } from "../Config/config";
import { logError, logStatus } from "./status_logging";
import { endsWithBatchSeparatorLine, trimTrailingStatementTerminators } from './sql_text';
import * as fs from 'fs';
import path from 'path';

const DEFAULT_SS_SQL_OUTPUT_FOLDER = './migrations/v5/';
const DEFAULT_PG_SQL_OUTPUT_FOLDER = './migrations-pg/v5/';

/**
 * Utility class for logging SQL to a run file that can be fresh for each run or appended to depending on the settings in the configuration
 */
export class SQLLogging {
    private static _SQLLoggingFilePath: string = '';
    private static _OmitRecurringScriptsFromLog: boolean = false;

    public static get SQLLoggingFilePath(): string {
        return SQLLogging._SQLLoggingFilePath;
    }
    public static get OmitRecurringScriptsFromLog(): boolean {
        return SQLLogging._OmitRecurringScriptsFromLog
    }
    public static initSQLLogging() {
        SQLLogging._OmitRecurringScriptsFromLog = configInfo.SQLOutput.omitRecurringScriptsFromLog;
        if (!SQLLogging.SQLLoggingFilePath) {
            // not already set up, so proceed, otherwise we do nothing as we're already good to go
            const config = configInfo.SQLOutput;
            if(!config){
                logError("MetadataLoggingConfig is required to enable metadata logging");
                return;
            }

            if (!config.enabled)
                return; // we are not doing anything here....

            if (config.folderPath) {
                // On PostgreSQL, swap the default SQL Server output folder for the
                // PG-equivalent so CodeGen audit SQL lands in migrations-pg/v5/ alongside
                // the rest of the PG tooling. Users who explicitly override folderPath are
                // honored as-is.
                let folderPath = config.folderPath;
                if (dbPlatform() === 'postgresql' && folderPath === DEFAULT_SS_SQL_OUTPUT_FOLDER) {
                    folderPath = DEFAULT_PG_SQL_OUTPUT_FOLDER;
                }

                const dirExists: boolean = fs.existsSync(folderPath);
                if (!dirExists) {
                    fs.mkdirSync(folderPath, {recursive: true });
                }

                const fileName: string = config.fileName || this.createFileName();
                SQLLogging._SQLLoggingFilePath = path.join(folderPath, fileName);

                if (!config.appendToFile || !fs.existsSync(SQLLogging.SQLLoggingFilePath)) {
                    //create an empty file
                    fs.writeFileSync(SQLLogging.SQLLoggingFilePath, '');
                }

                logStatus(`Metadata logging enabled. File path: ${SQLLogging.SQLLoggingFilePath}`);
            }
            else {
                logError("folderPath is required to enable metadata logging");
                return;
            }
        }
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
     * @param requiresOwnBatch - the unit must be the ONLY statement in its batch — e.g. `CREATE OR ALTER VIEW`,
     *   which T-SQL requires to be first in its batch as well as last. Emits a separator BEFORE the unit
     *   unless the log already ends at a batch boundary, and one after it. Implies `includeBatchSeparator`.
     * @returns
     */
    public static async appendToSQLLogFile(contents: string, description?: string, isRecurringScript: boolean = false, includeBatchSeparator: boolean = false, batchSeparator: string = 'GO', requiresOwnBatch: boolean = false): Promise<void> {
        try{
            if (isRecurringScript && SQLLogging.OmitRecurringScriptsFromLog) {
                return; // is a recurring script and the flag to omit recurring scripts is set
            }
            if(!contents || !SQLLogging.SQLLoggingFilePath){
                return;
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
            // Linear scans, not `/[\s;]+$/` or `/(^|\n)\s*GO\s*$/`: a unit can carry caller-supplied SQL
            // (a TransitiveView body), and those patterns backtrack quadratically on a long interior
            // whitespace run (see ./sql_text).
            const trimmed = trimTrailingStatementTerminators(contents);
            let endsWithBatchSeparator = false;
            if (trimmed.length > 0) {
                endsWithBatchSeparator = endsWithBatchSeparatorLine(trimmed, 'GO');
                contents = endsWithBatchSeparator ? trimmed : `${trimmed};`;
            }

            // A unit that must be alone in its batch also needs a separator BEFORE it: the log only ever
            // appends, so whatever was logged last would otherwise share its batch.
            const leadingSeparator = requiresOwnBatch && !!batchSeparator && !SQLLogging.logEndsAtBatchBoundary(batchSeparator)
                ? `${batchSeparator}\n\n`
                : '';

            // Emit a separator after the unit when the caller asked for one or the unit must be alone in
            // its batch.
            contents = includeBatchSeparator || requiresOwnBatch
                ? `${contents}\n${batchSeparator}\n\n`
                : `${contents}\n\n`;

            fs.appendFileSync(SQLLogging.SQLLoggingFilePath, `${leadingSeparator}${contents}`);
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
    * @param requiresOwnBatch - see {@link appendToSQLLogFile}: the unit must be alone in its batch.
    * @returns - The result of the query execution.
    */
    public static async LogSQLAndExecute(ds: CodeGenConnection, query: string, description?: string, isRecurringScript: boolean = false, includeBatchSeparator: boolean = false, batchSeparator: string = 'GO', requiresOwnBatch: boolean = false): Promise<any> {
        SQLLogging.appendToSQLLogFile(query, description, isRecurringScript, includeBatchSeparator, batchSeparator, requiresOwnBatch);
        const result = await ds.query(query);
        return result.recordset;
    }

    /** Bytes read from the end of the log to decide whether it ends at a batch boundary. */
    private static readonly BOUNDARY_TAIL_BYTES = 512;

    /**
     * True when the log is empty or its last non-blank line is `separator` — i.e. the next unit starts
     * a new batch. Reads only the tail of the file, so it holds whoever wrote the previous unit.
     */
    protected static logEndsAtBatchBoundary(separator: string): boolean {
        const filePath = SQLLogging.SQLLoggingFilePath;
        const size = SQLLogging.getFileLength(filePath);
        if (size === 0) {
            return true;
        }
        const length = Math.min(size, SQLLogging.BOUNDARY_TAIL_BYTES);
        const bytes = new Uint8Array(length);
        const fd = fs.openSync(filePath, 'r');
        try {
            fs.readSync(fd, bytes, 0, length, size - length);
        } finally {
            fs.closeSync(fd);
        }
        const tail = new TextDecoder('utf-8').decode(bytes);
        return tail.trim().length === 0 || endsWithBatchSeparatorLine(tail, separator);
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
