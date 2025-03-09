import { DataSource } from "typeorm";
import { logError } from "./status_logging";
import { configInfo, mj_core_schema } from "../Config/config";


export class IntegrityCheckResult {
    public Success: boolean = false;
    public Message: string | null = null;
}

export type RunIntegrityCheck = {
    Name: string;
    Enabled: boolean;
    Run: (ds: DataSource) => Promise<IntegrityCheckResult>;
}   

/**
 * This class has methods that can check various aspects of a MemberJunction installation's integrity. Code Gen will
 * run the various integrity checks based on configuration options that can be set in the master configuration file.
 */
export class SystemIntegrityBase {
    private static _integrityChecks: RunIntegrityCheck[] = [
        {
            Name: 'CheckEntityFieldSequences',
            Enabled: configInfo.integrityChecks.enabled && configInfo.integrityChecks.entityFieldsSequenceCheck,
            Run: SystemIntegrityBase.CheckEntityFieldSequences
        }
    ];

    /**
     * Runs integrity checks on the system. If onlyEnabled is true, then only checks that are enabled in the configuration
     * will be run. If false, all checks will be run.
     * @param ds 
     */
    public static async RunIntegrityChecks(ds: DataSource, onlyEnabled: boolean): Promise<IntegrityCheckResult[]> {
        let results: IntegrityCheckResult[] = [];
        try {
            const runPromises = [];
            for (const check of SystemIntegrityBase._integrityChecks) {
                if (!onlyEnabled || check.Enabled) {
                    runPromises.push(check.Run(ds));
                }
            }
            // async parallel run all the checks and then push the results into the results array
            const runResults = await Promise.all(runPromises);
            runResults.forEach(r => results.push(r));
 
            return results;
        }
        catch (e) {
            const message = `Error running integrity checks: ${e}`;
            logError(message);
            results.push ({ Success: false, Message: message });
            return results;
        }
    }

    
    /**
     * For a given entity, fields should be in sequence starting from 1. There should be no duplicate sequences within a given
     * entity. Invalidation of this could cause downstream issues with the system in particular with execution of Create/Update operations.
     * 
     * @param ds 
     * @returns 
     */
    public static async CheckEntityFieldSequences(ds: DataSource): Promise<IntegrityCheckResult> {
        return this.CheckEntityFieldSequencesInternal(ds, "");
    }

    /**
     * Checks the sequence of fields for a single entity. This is useful when you want to check a single entity at a time.
     * @param ds 
     * @param entityName 
     * @returns 
     */
    public static async CheckSinleEntityFieldSequences(ds: DataSource, entityName: string): Promise<IntegrityCheckResult> {
        return this.CheckEntityFieldSequencesInternal(ds, `WHERE Entity='${entityName}'`);
    }

    protected static async CheckEntityFieldSequencesInternal(ds: DataSource, filter: string): Promise<IntegrityCheckResult> {
        try {
            const sSQL = `SELECT ID, Entity, EntityID, Name, Sequence FROM [${mj_core_schema()}].[vwEntityFields] ${filter} ORDER BY Entity, Sequence`;
            const result = await ds.query(sSQL);
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
                        const fields = result.filter((f: any) => f.Entity === row.Entity);
                        // check for duplicate sequences, and build a list of duplicate sequences to include the field name in the message along with the sequence
                        const duplicates = fields.filter((f: any) => fields.filter((f2: any) => f2.Sequence === f.Sequence).length > 1);
                        if (duplicates.length > 0) {
                            success = false;
                            message += `Entity ${row.Entity} has duplicate Entity Field sequences:\n`;
                            message += duplicates.map((d: any) => `   ${d.Name} (${d.Sequence})`).join("\n");
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
                        }
                        
                        lastEntity = row.Entity;
                    }                    
                }

                return { Success: success, Message: message };
            }
        }
        catch (e) {
            const message = `Error checking entity field sequences: ${e}`;
            logError(message);
            return { Success: false, Message: message };
        }
    }
}