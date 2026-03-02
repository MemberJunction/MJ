import { CodeGenConnection } from '../Database/codeGenDatabaseProvider';
import { logError, logStatus } from "./status_logging";
import { configInfo, dbType, mj_core_schema } from "../Config/config";


export type IntegrityCheckResult = {
    Name: string;
    Success: boolean;
    Message: string;
}

export type RunIntegrityCheck = {
    Name: string;
    Enabled: boolean;
    Run: (pool: CodeGenConnection) => Promise<IntegrityCheckResult>;
}

/**
 * Returns a quoted identifier appropriate for the current database platform.
 * SQL Server uses [brackets], PostgreSQL uses "double quotes".
 */
function qi(name: string): string {
    if (dbType() === 'postgresql') {
        return '"' + name + '"';
    }
    return '[' + name + ']';
}

/**
 * Returns the SQL syntax for limiting results to 1 row.
 * SQL Server: SELECT TOP 1 * FROM ...
 * PostgreSQL: SELECT * FROM ... LIMIT 1
 */
function selectOne(schema: string, viewName: string): string {
    if (dbType() === 'postgresql') {
        return `SELECT * FROM ${qi(schema)}.${qi(viewName)} LIMIT 1`;
    }
    return `SELECT TOP 1 * FROM ${qi(schema)}.${qi(viewName)}`;
}

/**
 * This class has methods that can check various aspects of a MemberJunction installation's integrity. Code Gen will
 * run the various integrity checks based on configuration options that can be set in the master configuration file.
 */
export class SystemIntegrityBase {
    private static _integrityChecks: RunIntegrityCheck[] = [
        {
            Name: 'CheckEntityFieldSequences',
            Enabled: configInfo.integrityChecks?.enabled && configInfo.integrityChecks.entityFieldsSequenceCheck,
            Run: SystemIntegrityBase.CheckEntityFieldSequences
        }
    ];

    /**
     * Runs integrity checks on the system. If onlyEnabled is true, then only checks that are enabled in the configuration
     * will be run. If false, all checks will be run.
     * @param pool
     */
    public static async RunIntegrityChecks(pool: CodeGenConnection, onlyEnabled: boolean, logResults: boolean = true): Promise<IntegrityCheckResult[]> {
        let results: IntegrityCheckResult[] = [];
        try {
            const runPromises = [];
            for (const check of SystemIntegrityBase._integrityChecks) {
                if (!onlyEnabled || check.Enabled) {
                    runPromises.push(check.Run(pool));
                }
            }
            // async parallel run all the checks and then push the results into the results array
            const runResults = await Promise.all(runPromises);
            runResults.forEach(r => results.push(r));

            if (logResults) {
                // log the results to the console
                logStatus("Integrity check results:");
                for (const result of results) {
                    if (result.Success) {
                        logStatus(`   Integrity check successful: ${result.Name}`);
                    }
                    else {
                        logError(`   Integrity check FAILED: ${result.Name} - ${result.Message}`);
                    }
                }
            }
            return results;
        }
        catch (e) {
            const message = `Error running integrity checks: ${e}`;
            logError(message);
            results.push ({ Success: false, Message: message, Name: "_" });
            return results;
        }
    }


    /**
     * For a given entity, fields should be in sequence starting from 1. There should be no duplicate sequences within a given
     * entity. Invalidation of this could cause downstream issues with the system in particular with execution of Create/Update operations.
     *
     * @param pool
     * @returns
     */
    public static async CheckEntityFieldSequences(pool: CodeGenConnection): Promise<IntegrityCheckResult> {
        return SystemIntegrityBase.CheckEntityFieldSequencesInternal(pool, "");
    }

    /**
     * Checks the sequence of fields for a single entity. This is useful when you want to check a single entity at a time.
     * @param pool
     * @param entityName
     * @returns
     */
    public static async CheckSinleEntityFieldSequences(pool: CodeGenConnection, entityName: string): Promise<IntegrityCheckResult> {
        return SystemIntegrityBase.CheckEntityFieldSequencesInternal(pool, `WHERE ${qi('Entity')}='${entityName}'`);
    }

    protected static async CheckEntityFieldSequencesInternal(pool: CodeGenConnection, filter: string): Promise<IntegrityCheckResult> {
        try {
            const schema = mj_core_schema();
            const sSQL = `SELECT ${qi('ID')}, ${qi('Entity')}, ${qi('SchemaName')}, ${qi('BaseView')}, ${qi('EntityID')}, ${qi('Name')}, ${qi('Sequence')} FROM ${qi(schema)}.${qi('vwEntityFields')} ${filter} ORDER BY ${qi('Entity')}, ${qi('Sequence')}`;
            const resultResult = await pool.query(sSQL);
            const result = resultResult.recordset;
            if (!result || result.length === 0) {
                throw new Error("No entity fields found");
            }
            else {
                // getting here means we check one entity at a time and build a message
                let success: boolean = true;
                let message: string = "";
                let lastEntity: string = "";

                // loop through all the fields. Each time the entity changes, check to see if there are any duplicate fields
                // that has the same sequence number and flag that as an error.
                for (const row of result) {
                    if (lastEntity !== row.Entity) {
                        // we have a new entity, check all the fields in this entity
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const fields = result.filter((f: any) => f.Entity === row.Entity);
                        // check for duplicate sequences, and build a list of duplicate sequences to include the field name in the message along with the sequence
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const duplicates = fields.filter((f: any) => fields.filter((f2: any) => f2.Sequence === f.Sequence).length > 1);
                        if (duplicates.length > 0) {
                            success = false;
                            message += `Entity ${row.Entity} has duplicate Entity Field sequences:\n`;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            message += duplicates.map((d: any) => `      * ${d.Name} (${d.Sequence})`).join("\n");
                            message += "\n";
                        }
                        else {
                            // no duplicates, so now check to see if all of the sequences are in order, starting with 1
                            let sequence = 1;
                            for (const field of fields) {
                                if (field.Sequence !== sequence) {
                                    success = false;
                                    message += `Entity ${row.Entity} has a missing sequence number. Expected ${sequence}, but found ${field.Sequence} for field ${field.Name}\n`;
                                }
                                sequence++;
                            }

                            if (success) {
                                // finally, check to see if the metadata sequence numbers match the physical order of the columns in the
                                // underlying base view. This is critical for calling the spUpdate/spCreate procs correctly.
                                // we will do this by selecting one row from the base view
                                const entity = row.Entity;
                                const sampleSQL = selectOne(row.SchemaName, row.BaseView);
                                const sampleResultResult = await pool.query(sampleSQL);
                                const sampleResult = sampleResultResult.recordset;
                                // now check the order of the columns in the result set relative to the
                                // fields array
                                if (sampleResult && sampleResult.length > 0) {
                                    const columns = Object.keys(sampleResult[0]);
                                    let i = 0;
                                    for (const field of fields) {
                                        if (columns[i] !== field.Name) {
                                            success = false;
                                            message += `Entity ${entity} has a mismatch between the metadata sequence and the physical column order in the base view ${qi(row.SchemaName)}.${qi(row.BaseView)} for position ${i+1}. Expected ${field.Name} but found ${columns[i]}\n`;
                                        }
                                        i++;
                                    }
                                }
                            }
                        }

                        lastEntity = row.Entity;
                    }
                }

                return { Success: success, Message: message, Name: 'entityFieldsSequenceCheck' };
            }
        }
        catch (e) {
            const message = `Error checking entity field sequences: ${e}`;
            logError(message);
            return { Success: false, Message: message, Name: 'entityFieldsSequenceCheck' };
        }
    }
}
