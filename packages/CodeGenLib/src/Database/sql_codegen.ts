import { EntityInfo, EntityFieldInfo, EntityPermissionInfo, Metadata, UserInfo } from '@memberjunction/core';
import { logError, logStatus, logWarning, startSpinner, updateSpinner, succeedSpinner, failSpinner } from '../Misc/status_logging';
import * as fs from 'fs';
import path from 'path';

import { SQLUtilityBase } from './sql';
import { CodeGenDatabaseProvider, BaseViewGenerationContext, CascadeDeleteContext, CodeGenConnection } from './codeGenDatabaseProvider';
import { SQLServerCodeGenProvider } from './SQLServerCodeGenProvider';

import { autoIndexForeignKeys, configInfo, customSqlScripts, dbDatabase, mjCoreSchema, MAX_INDEX_NAME_LENGTH } from '../Config/config';
import { ManageMetadataBase } from './manage-metadata';

import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { combineFiles, logIf, sortBySequenceAndCreatedAt } from '../Misc/util';
import { MJEntityEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { SQLLogging } from '../Misc/sql_logging';
import { TempBatchFile } from '../Misc/temp_batch_file';


export const SPType = {
    Create: 'Create',
    Update: 'Update',
    Delete: 'Delete',
  } as const;

export type SPType = typeof SPType[keyof typeof SPType];


/**
 * This class is responsible for generating database level objects like views, stored procedures, permissions, etc. You can sub-class this class to create your own SQL generation logic or implement support for other
 * databases. The base class implements support for SQL Server. In future versions of MJ, we will break out an abstract base class that has the skeleton of the logic and then the SQL Server version will be a sub-class
 * of that abstract base class and other databases will be sub-classes of the abstract base class as well.
 */
/**
 * Creates the appropriate CodeGen database provider based on the configured database type.
 * Falls back to SQLServerCodeGenProvider for backward compatibility.
 * 
 * @param dbType The database platform type from configuration
 * @returns A CodeGenDatabaseProvider instance for the specified platform
 */
function createCodeGenProvider(dbType: string): CodeGenDatabaseProvider {
    switch (dbType) {
        case 'postgresql':
            // Dynamic import is avoided - the PostgreSQL provider should be
            // registered via MJGlobal ClassFactory for proper decoupling.
            // For now, attempt to resolve from ClassFactory.
            try {
                const pgProvider = MJGlobal.Instance.ClassFactory.CreateInstance<CodeGenDatabaseProvider>(
                    CodeGenDatabaseProvider,
                    'PostgreSQLCodeGenProvider'
                );
                if (pgProvider) {
                    return pgProvider;
                }
            } catch {
                // Fall through to error
            }
            throw new Error(
                'PostgreSQL CodeGen provider not found. Ensure @memberjunction/postgresql-dataprovider ' +
                'is installed and its CodeGen provider is registered before running CodeGen.'
            );
        case 'mssql':
        default:
            return new SQLServerCodeGenProvider();
    }
}

export class SQLCodeGenBase {
    protected _sqlUtilityObject: SQLUtilityBase = MJGlobal.Instance.ClassFactory.CreateInstance<SQLUtilityBase>(SQLUtilityBase)!;
    public get SQLUtilityObject(): SQLUtilityBase {
        return this._sqlUtilityObject;
    }

    /**
     * The database-specific code generation provider. Defaults to SQL Server.
     * Override this property or set it before calling generation methods to use
     * a different database platform (e.g., PostgreSQL).
     */
    protected _dbProvider: CodeGenDatabaseProvider = createCodeGenProvider(configInfo.dbType);
    public get DBProvider(): CodeGenDatabaseProvider {
        return this._dbProvider;
    }
    public set DBProvider(value: CodeGenDatabaseProvider) {
        this._dbProvider = value;
    }

    /**
     * Array of entity names that qualify for forced regeneration based on the whereClause filter
     */
    protected entitiesQualifiedForForcedRegeneration: string[] = [];

    /**
     * Flag indicating whether to filter entities for forced regeneration based on entityWhereClause
     */
    protected filterEntitiesQualifiedForRegeneration: boolean = false;

    /**
     * Tracks cascade delete dependencies between entities.
     * Key: Entity ID whose update/delete SP is called by other entities' delete SPs
     * Value: Set of Entity IDs that have CascadeDeletes=true and call this entity's update/delete SP
     */
    protected cascadeDeleteDependencies: Map<string, Set<string>> = new Map();

    /**
     * Tracks entities that need their delete stored procedures regenerated due to cascade dependencies
     */
    protected entitiesNeedingDeleteSPRegeneration: Set<string> = new Set();
    
    /**
     * Ordered list of entity IDs for delete SP regeneration (dependency order)
     */
    protected orderedEntitiesForDeleteSPRegeneration: string[] = [];

    public async manageSQLScriptsAndExecution(pool: CodeGenConnection, entities: EntityInfo[], directory: string, currentUser: UserInfo): Promise<boolean> {
        try {
            // Build list of entities qualified for forced regeneration if entityWhereClause is provided
            if (configInfo.forceRegeneration?.enabled && configInfo.forceRegeneration?.entityWhereClause) {
                this.filterEntitiesQualifiedForRegeneration = true; // Enable filtering
                try {
                    const whereClause = configInfo.forceRegeneration.entityWhereClause;
                    const qs = this._dbProvider.Dialect.QuoteSchema.bind(this._dbProvider.Dialect);
                    const query = `
                        SELECT Name 
                        FROM ${qs(mjCoreSchema, 'Entity')} 
                        WHERE ${whereClause}
                    `;
                    const result = await pool.query(query);
                    this.entitiesQualifiedForForcedRegeneration = result.recordset.map((r: any) => r.Name);
                    
                    logStatus(`Force regeneration filter enabled: ${this.entitiesQualifiedForForcedRegeneration.length} entities qualified based on entityWhereClause: ${whereClause}`);
                } catch (error) {
                    logError(`CRITICAL ERROR: Failed to execute forceRegeneration.entityWhereClause query: ${error}`);
                    logError(`WHERE clause: ${configInfo.forceRegeneration.entityWhereClause}`);
                    logError(`Stopping execution due to invalid entityWhereClause configuration`);
                    throw new Error(`Invalid forceRegeneration.entityWhereClause: ${error}`);
                }
            }

            // STEP 1 - execute any custom SQL scripts for object creation that need to happen first - for example, if
            //          we have custom base views, need to have them defined before we do
            //          the rest as the generated stuff might use custom base views in compiled
            //          objects like spCreate for a given entity might reference the vw for that entity
            startSpinner('Running custom SQL scripts...');
            const startTime: Date = new Date();
            if (! await this.runCustomSQLScripts(pool, 'before-sql')) {
                failSpinner('Failed to run custom SQL scripts');
                return false;
            }
            succeedSpinner(`Custom SQL scripts completed (${(new Date().getTime() - startTime.getTime())/1000}s)`);

            // ALWAYS use the first filter where we only include entities that have IncludeInAPI = 1
            // Entities are already sorted by name in PostProcessEntityMetadata (see providerBase.ts)
            const baselineEntities = entities.filter(e => e.IncludeInAPI);
            const includedEntities = baselineEntities.filter(e => configInfo.excludeSchemas.find(s => s.toLowerCase() === e.SchemaName.toLowerCase()) === undefined); //only include entities that are NOT in the excludeSchemas list
            const excludedEntities = baselineEntities.filter(e => configInfo.excludeSchemas.find(s => s.toLowerCase() === e.SchemaName.toLowerCase()) !== undefined); //only include entities that ARE in the excludeSchemas list in this array

            // Initialize temp batch files for each schema
            // These will be populated as SQL is generated and will be used for actual execution
            const schemas = Array.from(new Set(baselineEntities.map(e => e.SchemaName)));
            TempBatchFile.initialize(directory, schemas);

            // STEP 1.5 - Check for cascade delete dependencies that require regeneration
            startSpinner('Analyzing cascade delete dependencies...');
            await this.markEntitiesForCascadeDeleteRegeneration(pool, includedEntities);
            succeedSpinner('Cascade delete dependency analysis completed');

            // STEP 2(a) - clean out all *.generated.sql and *.permissions.generated.sql files from the directory
            startSpinner('Cleaning generated files...');
            this.deleteGeneratedEntityFiles(directory, baselineEntities);
            succeedSpinner('Cleaned generated files');

            // STEP 2(b) - generate all the SQL files and execute them
            startSpinner(`Generating SQL for ${includedEntities.length} entities...`);
            const step2StartTime: Date = new Date();

            // First, separate entities that need cascade delete regeneration from others
            const entitiesWithoutCascadeRegeneration = includedEntities.filter(e => !this.entitiesNeedingDeleteSPRegeneration.has(e.ID));
            const entitiesForCascadeRegeneration = this.orderedEntitiesForDeleteSPRegeneration
                .map(id => includedEntities.find(e => e.ID === id))
                .filter(e => e !== undefined) as EntityInfo[];

            // Generate SQL for entities that don't need cascade delete regeneration
            const genResult = await this.generateAndExecuteEntitySQLToSeparateFiles({
                pool, 
                entities: entitiesWithoutCascadeRegeneration, 
                directory, 
                onlyPermissions: false, 
                skipExecution: true, // skip execution because we execute it all in a giant batch below
                writeFiles: true, 
                batchSize: 5, 
                enableSQLLoggingForNewOrModifiedEntities: true
            }); // enable sql logging for NEW entities....
            if (!genResult.Success) {
                failSpinner('Failed to generate entity SQL files');
                return false;
            }
            
            // Generate SQL for cascade delete regenerations in dependency order (sequentially)
            if (entitiesForCascadeRegeneration.length > 0) {
                updateSpinner(`Regenerating ${entitiesForCascadeRegeneration.length} delete SPs in dependency order...`);
                const cascadeGenResult = await this.generateAndExecuteEntitySQLToSeparateFiles({
                    pool, 
                    entities: entitiesForCascadeRegeneration, 
                    directory, 
                    onlyPermissions: false, 
                    skipExecution: true,
                    writeFiles: true, 
                    batchSize: 1, // Process sequentially to maintain dependency order
                    enableSQLLoggingForNewOrModifiedEntities: true
                });
                if (!cascadeGenResult.Success) {
                    failSpinner('Failed to regenerate cascade delete SPs');
                    return false;
                }
                genResult.Files.push(...cascadeGenResult.Files);
            }

            // STEP 2(c) - for the excludedEntities, while we don't want to generate SQL, we do want to generate the permissions files for them
            updateSpinner(`Generating permissions for ${excludedEntities.length} excluded entities...`);
            const genResult2 = await this.generateAndExecuteEntitySQLToSeparateFiles({
                pool, 
                entities: excludedEntities, 
                directory, 
                onlyPermissions: true,
                skipExecution: true, // skip execution because we execute it all in a giant batch below
                batchSize: 5,
                writeFiles: true,
                enableSQLLoggingForNewOrModifiedEntities: false /*don't log this stuff, it is just permissions for excluded entities*/
            });
            if (!genResult2.Success) {
                failSpinner('Failed to generate permissions for excluded entities');
                return false;
            }
            succeedSpinner(`Entity generation completed (${(new Date().getTime() - step2StartTime.getTime())/1000}s)`);

            // STEP 2(d) now that we've generated the SQL, let's create a combined file in each schema sub-directory for convenience for a DBA
            startSpinner('Creating combined SQL files...');
            const allEntityFiles = this.createCombinedEntitySQLFiles(directory, baselineEntities);
            succeedSpinner(`Created combined SQL files for ${allEntityFiles.length} schemas`);

            // STEP 2(e) ---- FINALLY, we execute SQL in proper dependency order
            // Use temp batch files (which maintain CodeGen log order) if available, otherwise fall back to combined files
            startSpinner('Executing entity SQL files...');
            const step2eStartTime: Date = new Date();

            let executionSuccess = false;
            if (TempBatchFile.hasContent()) {
                // Execute temp batch files in dependency order (matches CodeGen run log)
                const tempFiles = TempBatchFile.getTempFilePaths();
                logIf(configInfo?.verboseOutput ?? false, `Executing ${tempFiles.length} temp batch file(s) in dependency order`);
                executionSuccess = await this.SQLUtilityObject.executeSQLFiles(tempFiles, configInfo?.verboseOutput ?? false);

                // Clean up temp files after execution
                TempBatchFile.cleanup();
            } else {
                // Fall back to combined files (for backward compatibility or if temp files weren't created)
                logIf(configInfo?.verboseOutput ?? false, `Executing ${allEntityFiles.length} combined file(s)`);
                executionSuccess = await this.SQLUtilityObject.executeSQLFiles(allEntityFiles, configInfo?.verboseOutput ?? false);
            }

            let overallSuccess = true;
            if (!executionSuccess) {
                failSpinner('Failed to execute entity SQL files');
                TempBatchFile.cleanup(); // Cleanup on error
                overallSuccess = false;
                // Continue to manage entity fields metadata even after SQL execution failure.
                // This prevents virtual fields from being incorrectly dropped when sqlcmd fails
                // (e.g., SSL certificate errors) but the mssql connection still works.
            }
            else {
                const step2eEndTime: Date = new Date();
                succeedSpinner(`SQL execution completed (${(step2eEndTime.getTime() - step2eStartTime.getTime())/1000}s)`);
            }

            const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)!;
            // STEP 3 - re-run the process to manage entity fields since the Step 1 and 2 above might have resulted in differences in base view columns compared to what we had at first
            // we CAN skip the entity field values part because that wouldn't change from the first time we ran it
            // Run advanced generation here in case new virtual fields added, so we do NOT run advanced geneartion in the main manageMetadata() call
            startSpinner('Managing entity fields metadata...');
            if (! await manageMD.manageEntityFields(pool, configInfo.excludeSchemas, true, true, currentUser, false)) {
                failSpinner('Failed to manage entity fields');
                overallSuccess = false;
            }
            else {
                succeedSpinner('Entity fields metadata updated');
            }
            // no logStatus/timer for this because manageEntityFields() has its own internal logging for this including the total, so it is redundant to log it here

            // STEP 4- Apply permissions, executing all .permissions files
            startSpinner('Applying permissions...');
            const step4StartTime: Date = new Date();
            if (! await this.applyPermissions(pool, directory, baselineEntities)) {
                failSpinner('Failed to apply permissions');
                overallSuccess = false;
            }
            else {
                succeedSpinner(`Permissions applied (${(new Date().getTime() - step4StartTime.getTime())/1000}s)`);
            }

            // STEP 5 - execute any custom SQL scripts that should run afterwards
            startSpinner('Running post-generation SQL scripts...');
            const step5StartTime: Date = new Date();
            if (! await this.runCustomSQLScripts(pool, 'after-sql')) {
                failSpinner('Failed to run post-generation SQL scripts');
                overallSuccess = false;
            }
            else {
                succeedSpinner(`Post-generation scripts completed (${(new Date().getTime() - step5StartTime.getTime())/1000}s)`);
            }

            if (overallSuccess) {
                succeedSpinner(`SQL CodeGen completed successfully (${((new Date().getTime() - startTime.getTime())/1000)}s total)`);
            }

            // now - we need to tell our metadata object to refresh itself
            const md = new Metadata();
            await md.Refresh();

            return overallSuccess;
        }
        catch (err) {
            logError(err as string);
            // Clean up temp batch files on error
            TempBatchFile.cleanup();
            return false;
        }
    }

    public async runCustomSQLScripts(pool: CodeGenConnection, when: string): Promise<boolean> {
        try {
            const scripts = customSqlScripts(when);
            let bSuccess: boolean = true;

            if (scripts) {
                for (let i = 0; i < scripts.length; ++i) {
                    const s = scripts[i];
                    if (! await this.SQLUtilityObject.executeSQLFile(s.scriptFile)) {
                        logError(`Error executing custom '${when}' SQL script ${s.scriptFile}`);
                        bSuccess = false; // keep going if we have more scripts, but make sure we return false
                    }
                }
            }

            return bSuccess;
        }
        catch (e) {
            logError(e as string);
            return false;
        }
    }


    public async applyPermissions(pool: CodeGenConnection, directory: string, entities: EntityInfo[], batchSize: number = 5): Promise<boolean> {
        try {
            let bSuccess = true;

            for (let i = 0; i < entities.length; i += batchSize) {
                const batch = entities.slice(i, i + batchSize);
                const promises = batch.map(async (e) => {
                    // generate the file names for the entity
                    const files = this.getEntityPermissionFileNames(e);
                    let innerSuccess: boolean = true;
                    for (const f of files) {
                        const fullPath = path.join(directory, f);
                        if (fs.existsSync(fullPath)) {
                            const fileBuffer = fs.readFileSync(fullPath);
                            const fileContents = fileBuffer.toString();
                            try {
                                await pool.query(fileContents);                            
                            }
                            catch (e: any) {
                                logError(`Error executing permissions file ${fullPath} for entity ${e.Name}: ${e}`);
                                innerSuccess = false;
                            }
                        }
                        else {
                            // we don't have the file, so we can't execute it, but we should log it as an error
                            // and then keep going
                            logError(`Permissions file ${fullPath} does not exist for entity ${e.Name}`);
                        }
                    }
                    return innerSuccess;
                });

                const results = await Promise.all(promises);
                if (results.includes(false)) {
                    logError(`Error executing one or more permissions files in batch starting from index ${i}`);
                    bSuccess = false; // keep going, but will return false at the end
                }
            }

            return bSuccess;
        }
        catch (err) {
            logError(err as string);
            return false;
        }
    }


    /**
     * This function will handle the process of creating all of the generated objects like base view, stored procedures, etc. for all entities in the entities array. It will generate the SQL for each entity and then execute it.
     * @param ds The DataSource object to use to execute the SQL
     * @param entities The array of EntityInfo objects to generate SQL for
     * @param directory The directory to save the generated SQL files to
     * @param onlyPermissions If true, only the permissions files will be generated and executed, not the actual SQL files. Use this if you are simply setting permission changes but no actual changes to the entities have occured.
     */
    public async generateAndExecuteEntitySQLToSeparateFiles(options: {
        pool: CodeGenConnection, 
        entities: EntityInfo[], 
        directory: string, 
        onlyPermissions: boolean, 
        writeFiles: boolean, 
        skipExecution: boolean, 
        batchSize?: number, 
        enableSQLLoggingForNewOrModifiedEntities?: boolean
    }): Promise<{Success: boolean, Files: string[]}> {
        if (!options.batchSize)
            options.batchSize = 5; // default to 5 if not specified

        const files: string[] = [];
        try {
            let bFail: boolean = false;
            const totalEntities = options.entities.length;

            for (let i = 0; i < totalEntities; i += options.batchSize) {
                const batch = options.entities.slice(i, i + options.batchSize);
                const promises = batch.map(async (e) => {
                    const pkeyField = e.Fields.find(f => f.IsPrimaryKey)
                    if (!pkeyField) {
                        logError(`SKIPPING SQL GENERATION: Entity ${e.Name} has no primary key field in metadata. If using soft primary keys, ensure metadata was refreshed after applySoftPKFKConfig().`);
                        return {Success: false, Files: []};
                    }
                    return this.generateAndExecuteSingleEntitySQLToSeparateFiles({
                        pool: options.pool,
                        entity: e,
                        directory: options.directory,
                        onlyPermissions: options.onlyPermissions,
                        writeFiles: options.writeFiles,
                        skipExecution: options.skipExecution,
                        enableSQLLoggingForNewOrModifiedEntities: options.enableSQLLoggingForNewOrModifiedEntities
                    });
                });

                const results = await Promise.all(promises);
                results.forEach(r => {
                    if (!r.Success)
                        bFail = true; // keep going, but will return false at the end
                    files.push(...r.Files); // add the files to the main files array
                });
            }

            return {Success: !bFail, Files: files};
        }
        catch (err) {
            logError(err as string);
            return {Success: false, Files: files};
        }
    }

    public deleteGeneratedEntityFiles(directory: string, entities: EntityInfo[]) {
        try {
            // for the schemas associated with the specified entities, clean out all the generated files
            const schemaNames = entities.map(e => e.SchemaName).filter((value, index, self) => self.indexOf(value) === index);
            for (const s of schemaNames) {
                const fullPath = path.join(directory, s);
                // now, within each schema directory, clean out all the generated files
                // the generated files map this pattern: *.generated.sql or *.permissions.generated.sql
                let stats: fs.Stats | undefined;
                try {
                  stats = fs.statSync(fullPath)
                } catch (e) {
                    // this is NOT an error, so not doing this logging anymore as it makes it seem like we're having a problem, not needed
                    //logMessage(`      Directory '${fullPath}' does not exist so no need to delete previously generated SQL`, 'Info');
                }
                if (stats?.isDirectory()) {
                    const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.generated.sql') || f.endsWith('.permissions.generated.sql'));
                    for (const f of files) {
                        const filePath = path.join(fullPath, f);
                        fs.unlinkSync(filePath);
                    }
                }
            }
        }
        catch (e) {
            logError(e as string);
        }
    }

    public createCombinedEntitySQLFiles(directory: string, entities: EntityInfo[]): string[] {
        // first, get a disinct list of schemanames from the entities
        const files: string[] = [];
        const schemaNames = entities.map(e => e.SchemaName).filter((value, index, self) => self.indexOf(value) === index);
        for (const s of schemaNames) {
            // generate the all-entities.sql file and all-entities.permissions.sql file in each schema folder
            const fullPath = path.join(directory, s);
            if (fs.statSync(fullPath).isDirectory()) {
                combineFiles(fullPath, '_all_entities.sql', '*.generated.sql', true);
                files.push(path.join(fullPath, '_all_entities.sql'));
                combineFiles(fullPath, '_all_entities.permissions.sql', '*.permissions.generated.sql', true);
                files.push(path.join(fullPath, '_all_entities.permissions.sql'));
            }
        }
        return files;
    }



    public async generateAndExecuteSingleEntitySQLToSeparateFiles(options: {
        pool: CodeGenConnection, 
        entity: EntityInfo, 
        directory: string, 
        onlyPermissions: boolean, 
        writeFiles: boolean, 
        skipExecution: boolean, 
        enableSQLLoggingForNewOrModifiedEntities?: boolean
    }): Promise<{Success: boolean, Files: string[]}> {
        try {
            const {sql, permissionsSQL, files} = await this.generateSingleEntitySQLToSeparateFiles(options); // this creates the files and returns a single string with all the SQL we can then execute
            if (!options.skipExecution) {
                return {
                    Success: await this.SQLUtilityObject.executeSQLScript(options.pool, sql + "\n\nGO\n\n" + permissionsSQL, true), // combine the SQL and permissions and execute it,
                    Files: files
                }
            }
            else
                return {Success: true, Files: files};
        }
        catch (err) {
            logError(err as string);
            return {Success: false, Files: []};
        }
    }

    /**
     * Writes a generated SQL file to disk only if the content has changed from the existing file.
     * Returns true if the file was written (content changed or file is new), false if unchanged.
     * This avoids false timestamp updates and unnecessary I/O.
     */
    protected writeFileIfChanged(filePath: string, newContent: string): boolean {
        if (fs.existsSync(filePath)) {
            const existing = fs.readFileSync(filePath, 'utf-8');
            if (existing === newContent) {
                return false;
            }
        }
        fs.writeFileSync(filePath, newContent);
        return true;
    }

    /**
     * Fetches the current base view definition from SQL Server and compares it against newly generated SQL.
     * If the view body has changed (e.g., a virtual field was added to a joined table), the entity is
     * logged and executed. Unlike adding to modifiedEntityList (which would cause all SPs,
     * permissions, indexes, etc. to be logged too), this only logs the base view SQL itself.
     *
     * Comparison extracts the SELECT body from both the DB definition (CREATE VIEW ... AS <body>)
     * and the generated SQL, normalizing whitespace for a fair comparison.
     * @returns true if the base view changed, false otherwise
     */
    protected async checkBaseViewChangedInDB(pool: CodeGenConnection, entity: EntityInfo, generatedViewSQL: string): Promise<boolean> {
        // Skip if entity is already tracked as new or modified — those are handled by existing logic
        if (ManageMetadataBase.newEntityList.includes(entity.Name) ||
            ManageMetadataBase.modifiedEntityList.includes(entity.Name)) {
            return false;
        }

        try {
            const viewName = entity.BaseView ? entity.BaseView : `vw${entity.CodeName}`;
            const viewDefSQL = this._dbProvider.getViewDefinitionSQL(entity.SchemaName, viewName);
            const result = await pool.query(viewDefSQL);
            const dbDefinition = result.recordset?.[0]?.ViewDefinition;
            if (!dbDefinition) {
                // View doesn't exist in DB yet — it's new, will be handled by existing new entity logic
                return false;
            }

            // Extract the SELECT body from both: everything after "AS\n" up to the trailing GO/permissions
            const generatedBody = this.extractViewSelectBody(generatedViewSQL);
            const dbBody = this.extractViewSelectBody(dbDefinition);

            if (generatedBody !== dbBody) {
                logStatus(`  Base view changed for ${entity.Name} — logging view SQL`);
                return true;
            }
            return false;
        }
        catch (e) {
            // Non-fatal — if we can't compare, the existing logic still runs
            logIf(configInfo.verboseOutput, `Could not compare base view for ${entity.Name}: ${e}`);
            return false;
        }
    }

    /**
     * Extracts the SELECT body from a CREATE VIEW statement, normalizing whitespace for comparison.
     * Handles both DB-stored definitions (CREATE VIEW ... AS SELECT ...) and generated SQL
     * (which includes DROP VIEW, comment headers, GO, and permissions after the view body).
     */
    protected extractViewSelectBody(viewSQL: string): string {
        // Find the AS keyword that precedes the SELECT — match "AS" on its own line or followed by whitespace+SELECT
        const asMatch = viewSQL.match(/\bAS\s*\r?\n\s*SELECT\b/i);
        if (!asMatch || asMatch.index === undefined) {
            return viewSQL.trim(); // fallback: compare the whole thing
        }

        // Start from the SELECT keyword
        let body = viewSQL.substring(asMatch.index + asMatch[0].indexOf('SELECT'));

        // Trim trailing GO and anything after it (permissions, etc.)
        const batchSep = this._dbProvider.BatchSeparator;
        const goMatch = body.match(new RegExp(`\\r?\\n${batchSep}\\b`, 'i'));
        if (goMatch && goMatch.index !== undefined) {
            body = body.substring(0, goMatch.index);
        }

        // Normalize whitespace for fair comparison: collapse runs of whitespace to single space
        return body.replace(/\s+/g, ' ').trim();
    }

    protected logSQLForNewOrModifiedEntity(entity: EntityInfo, sql: string, description: string, logSql: boolean = false, forceLog: boolean = false) {
        // Check if we should log this SQL
        let shouldLog = forceLog;

        if (!shouldLog && logSql) {
            // Check if entity is in new or modified lists
            const isNewOrModified = !!ManageMetadataBase.newEntityList.find(e => e === entity.Name) ||
                                   !!ManageMetadataBase.modifiedEntityList.find(e => e === entity.Name);

            // Check if entity is being regenerated due to cascade dependencies
            const isCascadeDependencyRegeneration = description.toLowerCase().includes('spdelete') &&
                                                   this.entitiesNeedingDeleteSPRegeneration.has(entity.ID);

            // Check if force regeneration is enabled for relevant SQL types
            const isForceRegeneration = configInfo.forceRegeneration?.enabled && (
                (description.toLowerCase().includes('base view') && configInfo.forceRegeneration.baseViews) ||
                (description.toLowerCase().includes('root id function') && configInfo.forceRegeneration.baseViews) || // TVFs are part of base view infrastructure
                (description.toLowerCase().includes('spcreate') && configInfo.forceRegeneration.spCreate) ||
                (description.toLowerCase().includes('spupdate') && configInfo.forceRegeneration.spUpdate) ||
                (description.toLowerCase().includes('spdelete') && configInfo.forceRegeneration.spDelete) ||
                (description.toLowerCase().includes('index') && configInfo.forceRegeneration.indexes) ||
                (description.toLowerCase().includes('full text search') && configInfo.forceRegeneration.fullTextSearch) ||
                (configInfo.forceRegeneration.allStoredProcedures &&
                 (description.toLowerCase().includes('spcreate') ||
                  description.toLowerCase().includes('spupdate') ||
                  description.toLowerCase().includes('spdelete')))
            );

            // Check if entity has RelatedEntityJoinFields configured (requires view regeneration for metadata-only changes)
            const hasRelatedEntityJoinFields = description.toLowerCase().includes('base view') &&
                entity.Fields.some(f => f.RelatedEntityJoinFieldsConfig !== null);

            // Determine if we should log based on entity state and force regeneration settings
            if (isNewOrModified) {
                // Always log new or modified entities
                shouldLog = true;
            } else if (hasRelatedEntityJoinFields) {
                // Always regenerate base views for entities with RelatedEntityJoinFields configuration
                shouldLog = true;
            } else if (isCascadeDependencyRegeneration) {
                // Always log cascade dependency regenerations
                shouldLog = true;
            } else if (isForceRegeneration) {
                // For force regeneration, the specific type flags (spCreate, baseViews, etc.)
                // already filtered this - now we just need to check entity filtering
                if (this.filterEntitiesQualifiedForRegeneration) {
                    // Only log if entity is in the qualified list
                    shouldLog = this.entitiesQualifiedForForcedRegeneration.includes(entity.Name);
                } else {
                    // No entity filtering - regenerate this type for all entities
                    shouldLog = true;
                }
            }
        }

        if (shouldLog) {
            SQLLogging.appendToSQLLogFile(sql, description);
            TempBatchFile.appendToTempBatchFile(sql, entity.SchemaName);
        }

        logIf(configInfo.verboseOutput, `SQL Generated for ${entity.Name}: ${description}`);
    }

    public async generateSingleEntitySQLToSeparateFiles(options: {
        pool: CodeGenConnection, 
        entity: EntityInfo, 
        directory: string, 
        onlyPermissions: boolean, 
        writeFiles: boolean, 
        skipExecution: boolean, 
        enableSQLLoggingForNewOrModifiedEntities?: boolean
    }): Promise<{sql: string, permissionsSQL: string, files: string[]}> {
        const files: string[] = [];
        try {
            // create the directory if it doesn't exist
            if (options.writeFiles && !fs.existsSync(options.directory))
                fs.mkdirSync(options.directory, { recursive: true });

            // now do the same thing for the /schema directory within the provided directory
            const schemaDirectory = path.join(options.directory, options.entity.SchemaName);
            if (options.writeFiles && !fs.existsSync(schemaDirectory))
                fs.mkdirSync(schemaDirectory, { recursive: true }); // create the directory if it doesn't exist

            let sRet: string = ''
            let permissionsSQL: string = ''
            // Tracks whether the base view SQL differs from what's in the database.
            // When true, we force-log the view, its permissions, and all SPs (which compile the view in)
            // so the migration log script can fully update target databases.
            let baseViewChanged = false;
            // Indexes for Fkeys for the table (skip for virtual entities — views can't have indexes)
            if (!options.onlyPermissions && !options.entity.VirtualEntity){
                const shouldGenerateIndexes = autoIndexForeignKeys() || (configInfo.forceRegeneration?.enabled && configInfo.forceRegeneration?.indexes);
                const indexSQL = shouldGenerateIndexes ? this.generateIndexesForForeignKeys(options.pool, options.entity) : ''; // generate indexes if auto-indexing is on OR force regeneration is enabled
                const s = this.generateSingleEntitySQLFileHeader(options.entity, 'Index for Foreign Keys') + indexSQL; 
                if (options.writeFiles) {
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('index', options.entity.SchemaName, options.entity.BaseTable, false, true));
                    this.writeFileIfChanged(filePath, s);
                    this.logSQLForNewOrModifiedEntity(options.entity, s, 'Index for Foreign Keys for ' + options.entity.BaseTable, options.enableSQLLoggingForNewOrModifiedEntities);
                    files.push(filePath);
                }
                sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';
            }

            // BASE VIEW AND RELATED TVFs
            // Only generate if BaseViewGenerated is true (respects custom views where it's false)
            // forceRegeneration.baseViews only forces regeneration of views where BaseViewGenerated=true
            if (!options.onlyPermissions &&
                options.entity.BaseViewGenerated &&
                !options.entity.VirtualEntity) {

                // ROOT ID FUNCTIONS (TVFs)
                // Generate inline Table Value Functions for recursive foreign keys
                // These must be created BEFORE the view that references them
                const recursiveFKs = this.detectRecursiveForeignKeys(options.entity);
                if (recursiveFKs.length > 0) {
                    for (const field of recursiveFKs) {
                        const functionName = `fn${options.entity.BaseTable}${field.Name}_GetRootID`;
                        const s = this.generateSingleEntitySQLFileHeader(options.entity, functionName) +
                                  this.generateRootIDFunction(options.entity, field);
                        const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('function', options.entity.SchemaName, functionName, false, true));
                        if (options.writeFiles) {
                            this.writeFileIfChanged(filePath, s);
                            this.logSQLForNewOrModifiedEntity(options.entity, s, `Root ID Function SQL for ${options.entity.Name}.${field.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);
                            files.push(filePath);
                        }
                        // Add function SQL to output BEFORE the view
                        sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';
                    }
                }

                // Generate the base view (which may reference the TVFs created above)
                const s = this.generateSingleEntitySQLFileHeader(options.entity,options.entity.BaseView) + await this.generateBaseView(options.pool, options.entity)

                // Compare generated view SQL against what's currently in the database.
                // If the SELECT body differs, force-log just this base view via the forceLog flag
                // so logging stays centralized in logSQLForNewOrModifiedEntity.
                baseViewChanged = await this.checkBaseViewChangedInDB(options.pool, options.entity, s);

                const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('view', options.entity.SchemaName, options.entity.BaseView, false, true));
                if (options.writeFiles) {
                    this.writeFileIfChanged(filePath, s);
                    this.logSQLForNewOrModifiedEntity(options.entity, s, `Base View SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities, baseViewChanged);
                    files.push(filePath);
                }
                sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';
            }
            // always generate permissions for the base view
            const s = this.generateSingleEntitySQLFileHeader(options.entity, 'Permissions for ' + options.entity.BaseView) + this.generateViewPermissions(options.entity)
            if (s.length > 0)
                permissionsSQL += s + '\n' + this._dbProvider.BatchSeparator + '\n';
            if (options.writeFiles) {
                const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('view', options.entity.SchemaName, options.entity.BaseView, true, true));
                this.writeFileIfChanged(filePath, s);
                this.logSQLForNewOrModifiedEntity(options.entity, s, `Base View Permissions SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities, baseViewChanged);
                files.push(filePath);
            }

            // now, append the permissions to the return string IF we did NOT generate the base view - because if we generated the base view, that
            // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
            if (!options.entity.BaseViewGenerated)
                sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';

            // CREATE SP
            if (options.entity.AllowCreateAPI && !options.entity.VirtualEntity) {
                const spName: string = this.getSPName(options.entity, SPType.Create);
                // Only generate if spCreateGenerated is true (respects custom SPs where it's false)
                // forceRegeneration only forces regeneration of SPs where spCreateGenerated=true
                if (!options.onlyPermissions && options.entity.spCreateGenerated) {
                    // generate the create SP
                    const s = this.generateSingleEntitySQLFileHeader(options.entity, spName) + this.generateSPCreate(options.entity)
                    if (options.writeFiles) {
                        const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, false, true))
                        this.writeFileIfChanged(filePath, s);
                        this.logSQLForNewOrModifiedEntity(options.entity, s, `spCreate SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities, baseViewChanged);
                        files.push(filePath);
                    }
                    sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';
                }
                const s = this.generateSPPermissions(options.entity, spName, SPType.Create) + '\n\n';
                if (s.length > 0)
                    permissionsSQL += s + '\n' + this._dbProvider.BatchSeparator + '\n';
                if (options.writeFiles) {
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, true, true))
                    this.writeFileIfChanged(filePath, s);
                    this.logSQLForNewOrModifiedEntity(options.entity, s, `spCreate Permissions for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities, baseViewChanged);
                    files.push(filePath);
                }

                // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!options.entity.spCreateGenerated)
                    sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';
            }

            // UPDATE SP
            if (options.entity.AllowUpdateAPI && !options.entity.VirtualEntity) {
                const spName: string = this.getSPName(options.entity, SPType.Update);
                // Only generate if spUpdateGenerated is true (respects custom SPs where it's false)
                // forceRegeneration only forces regeneration of SPs where spUpdateGenerated=true
                if (!options.onlyPermissions && options.entity.spUpdateGenerated) {
                    // generate the update SP
                    const s = this.generateSingleEntitySQLFileHeader(options.entity, spName) + this.generateSPUpdate(options.entity)
                    if (options.writeFiles) {
                        const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, false, true))
                        this.writeFileIfChanged(filePath, s);
                        this.logSQLForNewOrModifiedEntity(options.entity, s, `spUpdate SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities, baseViewChanged);
                        files.push(filePath);
                    }
                    sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';
                }
                const s = this.generateSPPermissions(options.entity, spName, SPType.Update) + '\n\n';
                if (s.length > 0)
                    permissionsSQL += s + '\n' + this._dbProvider.BatchSeparator + '\n';
                if (options.writeFiles) {
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, true, true));
                    this.writeFileIfChanged(filePath, s);
                    this.logSQLForNewOrModifiedEntity(options.entity, s, `spUpdate Permissions for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities, baseViewChanged);
                    files.push(filePath);
                }

                // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!options.entity.spUpdateGenerated)
                    sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';
            }

            // DELETE SP
            if (options.entity.AllowDeleteAPI && !options.entity.VirtualEntity) {
                const spName: string = this.getSPName(options.entity, SPType.Delete);
                // Only generate if spDeleteGenerated is true (respects custom SPs where it's false)
                // OR if this entity has cascade delete dependencies that require regeneration
                // forceRegeneration only forces regeneration of SPs where spDeleteGenerated=true
                if (!options.onlyPermissions &&
                    (options.entity.spDeleteGenerated ||
                     this.entitiesNeedingDeleteSPRegeneration.has(options.entity.ID))) {
                    // generate the delete SP
                    if (this.entitiesNeedingDeleteSPRegeneration.has(options.entity.ID)) {
                        logStatus(`  Regenerating ${spName} due to cascade dependency changes`);
                    }
                    const s = this.generateSingleEntitySQLFileHeader(options.entity, spName) + await this.generateSPDelete(options.entity, options.pool)
                    if (options.writeFiles) {
                        const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, false, true))
                        this.writeFileIfChanged(filePath, s);
                        this.logSQLForNewOrModifiedEntity(options.entity, s, `spDelete SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities, baseViewChanged);
                        files.push(filePath);
                    }
                    sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';
                }
                const s = this.generateSPPermissions(options.entity, spName, SPType.Delete) + '\n\n';
                if (s.length > 0)
                    permissionsSQL += s + '\n' + this._dbProvider.BatchSeparator + '\n';
                if (options.writeFiles) {
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, true, true));
                    this.writeFileIfChanged(filePath, s);
                    this.logSQLForNewOrModifiedEntity(options.entity, s, `spDelete Permissions for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities, baseViewChanged);
                    files.push(filePath);
                }

                // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!options.entity.spDeleteGenerated)
                    sRet += s + '\n' + this._dbProvider.BatchSeparator + '\n';
            }

            // check to see if the options.entity supports full text search or not
            if (options.entity.FullTextSearchEnabled || (configInfo.forceRegeneration?.enabled && configInfo.forceRegeneration?.fullTextSearch)) {
                // always generate the code so we can get the function name from the below function call
                const ft = await this.generateEntityFullTextSearchSQL(options.pool, options.entity);
                if (!options.onlyPermissions) {
                    // only write the actual sql out if we're not only generating permissions
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('full_text_search_function', options.entity.SchemaName, options.entity.BaseTable, false, true));
                    if (options.writeFiles) {
                        this.writeFileIfChanged(filePath, ft.sql);
                        this.logSQLForNewOrModifiedEntity(options.entity, ft.sql, `Full Text Search SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);
                        files.push(filePath);
                    }
                    sRet += ft.sql + '\n' + this._dbProvider.BatchSeparator + '\n';
                }

                const sP = this.generateFullTextSearchFunctionPermissions(options.entity, ft.functionName) + '\n\n';
                if (sP.length > 0)
                    permissionsSQL += sP + '\n' + this._dbProvider.BatchSeparator + '\n';

                const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('full_text_search_function', options.entity.SchemaName, options.entity.BaseTable, true, true));
                if (options.writeFiles) {
                    this.writeFileIfChanged(filePath, sP);
                    this.logSQLForNewOrModifiedEntity(options.entity, sP, `Full Text Search Permissions for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);
                    files.push(filePath);
                }

                // now, append the permissions to the return string IF we did NOT generate the function - because if we generated the function, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!options.entity.FullTextSearchFunctionGenerated)
                    sRet += sP + '\n' + this._dbProvider.BatchSeparator + '\n';
            }

            return {sql: sRet, permissionsSQL: permissionsSQL, files: files};
        }
        catch (err) {
            logError(err as string)
            return null!;
        }
    }

    public getSPName(entity: EntityInfo, type: SPType): string {
        return this._dbProvider.getCRUDRoutineName(entity, type as 'Create' | 'Update' | 'Delete');
    }

    public getEntityPermissionFileNames(entity: EntityInfo): string[] {
        const files = [];
        // all entities have a base view - and we always generate permissions for the base view even if not generated base view
        files.push(this.SQLUtilityObject.getDBObjectFileName('view', entity.SchemaName, entity.BaseView, true, true));

        // only add the SP files if the entity is not a virtual entity
        if (!entity.VirtualEntity) {
            // only add each SP file if the Allow flags are set to true, doesn't matter if the SPs are generated or not, we always generate permissions
            if (entity.AllowCreateAPI)
                files.push(this.SQLUtilityObject.getDBObjectFileName('sp', entity.SchemaName, this.getSPName(entity, SPType.Create), true, true));
            if (entity.AllowUpdateAPI)
                files.push(this.SQLUtilityObject.getDBObjectFileName('sp', entity.SchemaName, this.getSPName(entity, SPType.Update), true, true));
            if (entity.AllowDeleteAPI)
                files.push(this.SQLUtilityObject.getDBObjectFileName('sp', entity.SchemaName, this.getSPName(entity, SPType.Delete), true, true));
        }
        if (entity.FullTextSearchEnabled)
            files.push(this.SQLUtilityObject.getDBObjectFileName('full_text_search_function', entity.SchemaName, entity.BaseTable, true, true));

        return files;
    }


    /**
     * Deprecated - do not use
     * @deprecated
     * @param ds 
     * @param entity 
     * @returns 
     */
    public async generateEntitySQL(pool: CodeGenConnection, entity: EntityInfo): Promise<string> {
        let sOutput: string = ''
        if (entity.BaseViewGenerated && !entity.VirtualEntity)
            // generated the base view (will include permissions)
            sOutput += await this.generateBaseView(pool, entity) + '\n\n';
        else
            // still generate the permissions for the view even if a custom view
            sOutput += this.generateViewPermissions(entity) + '\n\n';

        if (entity.AllowCreateAPI && !entity.VirtualEntity) {
            if (entity.spCreateGenerated)
                // generated SP, will include permissions
                sOutput += this.generateSPCreate(entity) + '\n\n';
            else
                // custom SP, still generate the permissions
                sOutput += this.generateSPPermissions(entity, entity.spCreate, SPType.Create) + '\n\n';
        }

        if (entity.AllowUpdateAPI && !entity.VirtualEntity) {
            if (entity.spUpdateGenerated)
                // generated SP, will include permissions
                sOutput += this.generateSPUpdate(entity) + '\n\n';
            else
                // custom SP, still generate the permissions
                sOutput += this.generateSPPermissions(entity, entity.spUpdate, SPType.Update) + '\n\n';
        }

        if (entity.AllowDeleteAPI && !entity.VirtualEntity) {
            if (entity.spDeleteGenerated)
                // generated SP, will include permissions
                sOutput += await this.generateSPDelete(entity, pool) + '\n\n';
            else
                // custom SP, still generate the permissions
                sOutput += this.generateSPPermissions(entity, entity.spDelete, SPType.Delete) + '\n\n';
        }

        // check to see if the entity supports full text search or not
        if (entity.FullTextSearchEnabled) {
            sOutput += await this.generateEntityFullTextSearchSQL(pool, entity) + '\n\n';
        }
        return sOutput
    }

    async generateEntityFullTextSearchSQL(pool: CodeGenConnection, entity: EntityInfo): Promise<{sql: string, functionName: string}> {
        const searchFields = entity.Fields.filter(f => f.FullTextSearchEnabled);
        
        // Validate search fields exist when needed
        if (entity.FullTextIndexGenerated && searchFields.length === 0)
            throw new Error(`FullTextIndexGenerated is true for entity ${entity.Name}, but no fields are marked as FullTextSearchEnabled`);
        if (entity.FullTextSearchFunctionGenerated && searchFields.length === 0)
            throw new Error(`FullTextSearchFunctionGenerated is true for entity ${entity.Name}, but no fields are marked as FullTextSearchEnabled`);

        // Get the primary key index name (needed for full text index)
        let primaryKeyIndexName = '';
        if (entity.FullTextIndexGenerated) {
            primaryKeyIndexName = await this.getEntityPrimaryKeyIndexName(pool, entity);
        }

        // If the function name is not set, save it to the DB
        const functionName = entity.FullTextSearchFunction && entity.FullTextSearchFunction.length > 0
            ? entity.FullTextSearchFunction
            : `fnSearch${entity.CodeName}`;

        if (entity.FullTextSearchFunctionGenerated && (!entity.FullTextSearchFunction || entity.FullTextSearchFunction.length === 0)) {
            const md = new Metadata();
            const u = UserCache.Instance.Users[0];
            if (!u)
                throw new Error('Could not find the first user in the cache, cant generate the full text search function without a user');

            const e = <MJEntityEntity>await md.GetEntityObject('MJ: Entities', u);
            await e.Load(entity.ID);
            e.FullTextSearchFunction = functionName;
            if (!await e.Save())
                throw new Error(`Could not update the FullTextSearchFunction for entity ${entity.Name}`);
        }

        // Delegate SQL generation to the provider
        const result = this._dbProvider.generateFullTextSearch(entity, searchFields, primaryKeyIndexName);

        // Add permissions if function was generated
        if (entity.FullTextSearchFunctionGenerated) {
            result.sql += this.generateFullTextSearchFunctionPermissions(entity, functionName) + '\n\n' + this._dbProvider.BatchSeparator + '\n';
        }

        return result;
    }

    async getEntityPrimaryKeyIndexName(pool: CodeGenConnection, entity: EntityInfo): Promise<string> {
        const sSQL = this._dbProvider.getPrimaryKeyIndexNameSQL(entity.SchemaName, entity.BaseTable);
        const resultResult = await pool.query(sSQL);
        const result = resultResult.recordset;
        if (result && result.length > 0)
            return result[0].IndexName;
        else
            throw new Error(`Could not find primary key index for entity ${entity.Name}`);
    }

    public generateAllEntitiesSQLFileHeader(): string {
        return this._dbProvider.generateAllEntitiesSQLFileHeader();
    }

    public generateSingleEntitySQLFileHeader(entity: EntityInfo, itemName: string): string {
        return this._dbProvider.generateSQLFileHeader(entity, itemName);
    }

    /**
     * Generates the SQL for creating indexes for the foreign keys in the entity.
     * Delegates to the database provider for platform-specific index DDL.
     */
    generateIndexesForForeignKeys(pool: CodeGenConnection, entity: EntityInfo): string {
        const indexStatements = this._dbProvider.generateForeignKeyIndexes(entity);
        return indexStatements.join('\n\n');
    }

    /**
     * Detects self-referential foreign keys in an entity (e.g., ParentTaskID pointing back to Task table)
     * Returns array of field info objects representing recursive relationships
     */
    protected detectRecursiveForeignKeys(entity: EntityInfo): EntityFieldInfo[] {
        return entity.Fields.filter(field =>
            field.RelatedEntityID != null &&
            field.RelatedEntityID === entity.ID
        );
    }

    /**
     * Generates an inline Table Value Function for calculating root ID for a recursive FK field
     * The function takes both the record ID and parent ID for optimization
     * Returns SQL to create the function including DROP IF EXISTS
     */
    protected generateRootIDFunction(entity: EntityInfo, field: EntityFieldInfo): string {
        return this._dbProvider.generateRootIDFunction(entity, field);
    }

    /**
     * Generates all inline Table Value Functions for an entity's recursive foreign keys
     * Returns empty string if no recursive FKs exist
     */
    protected generateAllRootIDFunctions(entity: EntityInfo, recursiveFKs: EntityFieldInfo[]): string {
        if (recursiveFKs.length === 0) {
            return '';
        }

        return recursiveFKs
            .map(field => this.generateRootIDFunction(entity, field))
            .join('\n');
    }


    /**
     * Generates the SELECT clause additions for root fields from TVFs
     * Example: , root_ParentID.RootID AS [RootParentID]
     */
    protected generateRootFieldSelects(recursiveFKs: EntityFieldInfo[], classNameFirstChar: string): string {
        if (recursiveFKs.length === 0) return '';
        let sOutput = '';
        for (let i = 0; i < recursiveFKs.length; i++) {
            const field = recursiveFKs[i];
            const alias = `rootFn_${field.Name}`;
            // We need the entity for the provider call, but we don't have it here.
            // The provider's generateRootFieldSelect only uses the field and alias.
            // Pass a minimal entity context (the field's parent entity info is in field.EntityID).
            sOutput += `,\n    ${this._dbProvider.generateRootFieldSelect(null!, field, alias)}`;
        }
        return sOutput;
    }

    /**
     * Generates OUTER APPLY joins to inline Table Value Functions for root ID calculation
     * Each recursive FK gets an OUTER APPLY that calls its corresponding function
     */
    protected generateRootIDJoins(recursiveFKs: EntityFieldInfo[], classNameFirstChar: string, entity: EntityInfo): string {
        if (recursiveFKs.length === 0) return '';
        let sOutput = '';
        for (let i = 0; i < recursiveFKs.length; i++) {
            const field = recursiveFKs[i];
            const alias = `rootFn_${field.Name}`;
            if (sOutput.length > 0) sOutput += '\n';
            sOutput += this._dbProvider.generateRootFieldJoin(entity, field, alias);
        }
        return '\n' + sOutput;
    }

    /**
     * @deprecated Use generateRootIDJoins instead - kept for backward compatibility during migration
     * Generates LEFT OUTER JOINs to the recursive CTEs
     */
    protected generateRecursiveCTEJoins(recursiveFKs: EntityFieldInfo[], classNameFirstChar: string, entity: EntityInfo): string {
        return this.generateRootIDJoins(recursiveFKs, classNameFirstChar, entity);
    }

    /**
     * Generates SELECT field expressions for IS-A parent entity columns.
     * Walks the ParentID chain upward, joining to each parent's base table, and includes
     * non-PK, non-timestamp, non-virtual fields from each parent table.
     * Returns a string starting with ',\n' if there are parent fields, or '' if none.
     */
    protected generateParentEntityFieldSelects(entity: EntityInfo): string {
        if (!entity.IsChildType) return '';

        const parentChain = entity.ParentChain;
        if (parentChain.length === 0) return '';

        const fieldExpressions: string[] = [];

        for (let i = 0; i < parentChain.length; i++) {
            const parent = parentChain[i];
            const alias = `__mj_isa_p${i + 1}`;

            for (const field of parent.Fields) {
                // Skip PKs (shared with child), timestamps, and virtual fields (view-computed)
                if (field.IsPrimaryKey || field.Name.startsWith('__mj_') || field.IsVirtual) continue;

                fieldExpressions.push(`    ${alias}.${this._dbProvider.Dialect.QuoteIdentifier(field.Name)}`);
            }
        }

        if (fieldExpressions.length === 0) return '';
        return ',\n' + fieldExpressions.join(',\n');
    }

    /**
     * Generates INNER JOIN clauses for IS-A parent entity base tables.
     * Chains joins from child -> parent -> grandparent using PK-to-PK conditions.
     * Each parent is joined via its base table (not view) to avoid view dependency ordering issues.
     */
    protected generateParentEntityJoins(entity: EntityInfo, classNameFirstChar: string): string {
        if (!entity.IsChildType) return '';

        const parentChain = entity.ParentChain;
        if (parentChain.length === 0) return '';

        const joins: string[] = [];

        for (let i = 0; i < parentChain.length; i++) {
            const parent = parentChain[i];
            const parentAlias = `__mj_isa_p${i + 1}`;
            // First parent joins to child table alias; deeper parents chain to previous parent alias
            const sourceAlias = i === 0 ? classNameFirstChar : `__mj_isa_p${i}`;

            // Build PK-to-PK join condition (supports composite keys)
            const qi = this._dbProvider.Dialect.QuoteIdentifier.bind(this._dbProvider.Dialect);
            const joinConditions = entity.PrimaryKeys.map(pk =>
                `${qi(sourceAlias)}.${qi(pk.Name)} = ${parentAlias}.${qi(pk.Name)}`
            ).join(' AND ');

            const qs = this._dbProvider.Dialect.QuoteSchema.bind(this._dbProvider.Dialect);
            joins.push(
                `INNER JOIN\n    ${qs(parent.SchemaName, parent.BaseTable)} AS ${parentAlias}\n  ON\n    ${joinConditions}`
            );
        }

        return joins.join('\n');
    }

    async generateBaseView(pool: CodeGenConnection, entity: EntityInfo): Promise<string> {
        const viewName: string = entity.BaseView ? entity.BaseView : `vw${entity.CodeName}`;
        const classNameFirstChar: string = entity.BaseTableCodeName.charAt(0).toLowerCase();
        const relatedFieldsString: string = await this.generateBaseViewRelatedFieldsString(pool, entity.Fields);
        const relatedFieldsJoinString: string = this.generateBaseViewJoins(entity, entity.Fields);
        const permissions: string = this.generateViewPermissions(entity);
        const qi = this._dbProvider.Dialect.QuoteIdentifier.bind(this._dbProvider.Dialect);
        const whereClause: string = entity.DeleteType === 'Soft' ? `WHERE
    ${qi(classNameFirstChar)}.${qi(EntityInfo.DeletedAtFieldName)} IS NULL
` : '';

        // Detect recursive foreign keys and generate TVF joins and root field selects
        const recursiveFKs = this.detectRecursiveForeignKeys(entity);
        const rootFields = recursiveFKs.length > 0 ? this.generateRootFieldSelects(recursiveFKs, classNameFirstChar) : '';
        const rootJoins = recursiveFKs.length > 0 ? this.generateRootIDJoins(recursiveFKs, classNameFirstChar, entity) : '';

        // IS-A parent entity JOINs — walk ParentID chain, JOIN to each parent's base table
        const parentFieldsString: string = this.generateParentEntityFieldSelects(entity);
        const parentJoinsString: string = this.generateParentEntityJoins(entity, classNameFirstChar);

        const context: BaseViewGenerationContext = {
            entity,
            relatedFieldsSelect: relatedFieldsString,
            relatedFieldsJoins: relatedFieldsJoinString,
            parentFieldsSelect: parentFieldsString,
            parentJoins: parentJoinsString,
            rootFieldsSelect: rootFields,
            rootJoins: rootJoins,
        };
        return this._dbProvider.generateBaseView(context) + permissions
    }

    protected generateViewPermissions(entity: EntityInfo): string {
        return this._dbProvider.generateViewPermissions(entity);
    }

    protected generateBaseViewJoins(entity: EntityInfo, entityFields: EntityFieldInfo[]): string {
        let sOutput: string = '';
        const classNameFirstChar: string = entity.BaseTableCodeName.charAt(0).toLowerCase();
        for (let i: number = 0; i < entityFields.length; i++) {
            const ef: EntityFieldInfo = entityFields[i];
            // Generate SQL JOIN for related entities that have configured join fields
            // _RelatedEntityJoinFieldMappings is populated during field analysis if:
            // - IncludeRelatedEntityNameFieldInBaseView is true (legacy), OR
            // - RelatedEntityJoinFieldsConfig specifies fields to join
            // This generates the JOIN clause; the actual field aliases are added separately in generateBaseViewFields()
            if (ef.RelatedEntityID && ef._RelatedEntityJoinFieldMappings && ef._RelatedEntityJoinFieldMappings.length > 0 && ef._RelatedEntityTableAlias) {
                sOutput += sOutput == '' ? '' : '\n';
                const qi = this._dbProvider.Dialect.QuoteIdentifier.bind(this._dbProvider.Dialect);
                const qs = this._dbProvider.Dialect.QuoteSchema.bind(this._dbProvider.Dialect);
                const relatedTable = ef._RelatedEntityNameFieldIsVirtual ? ef.RelatedEntityBaseView : ef.RelatedEntityBaseTable;
                sOutput += `${ef.AllowsNull ? 'LEFT OUTER' : 'INNER' } JOIN\n    ${qs(ef.RelatedEntitySchemaName, relatedTable)} AS ${ef._RelatedEntityTableAlias}\n  ON\n    ${qi(classNameFirstChar)}.${qi(ef.Name)} = ${ef._RelatedEntityTableAlias}.${qi(ef.RelatedEntityFieldName)}`;
            }
        }
        return sOutput;
    }

    async generateBaseViewRelatedFieldsString(pool: CodeGenConnection, entityFields: EntityFieldInfo[]): Promise<string> {
        let sOutput: string = '';
        let fieldCount: number = 0;
        const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)!;
        const md = new Metadata();
        const allGeneratedAliases: string[] = [];

        // Get fields that are related entities with join field configuration.
        //
        // BACKWARD COMPATIBILITY LOGIC:
        // This handles two cases:
        // 1. Legacy behavior: IncludeRelatedEntityNameFieldInBaseView=true, no RelatedEntityJoinFieldsConfig
        //    → Automatically defaults to { mode: 'extend' } and joins the related entity's NameField (as before)
        // 2. New behavior: RelatedEntityJoinFieldsConfig specified
        //    → Can 'extend' the NameField with additional fields, 'override' it completely, or 'disable' joins
        //
        // Result: _RelatedEntityJoinFieldMappings is populated with all fields to be joined from the related entity.
        //         If both old and new configs are set, they work together (new fields extend or replace the NameField).
        const qualifyingFields = entityFields.filter(f => f.RelatedEntityID && (f.IncludeRelatedEntityNameFieldInBaseView || f.RelatedEntityJoinFieldsConfig));
        for (const ef of qualifyingFields) {
            const config = ef.RelatedEntityJoinFieldsConfig || { mode: 'extend' };
            if (config.mode === 'disable') {
                continue;
            }

            ef._RelatedEntityJoinFieldMappings = [];
            let anyFieldIsVirtual = false;

            // 1. Handle NameField (if not overridden)
            // In 'extend' mode: include the NameField (backward compatible with IncludeRelatedEntityNameFieldInBaseView)
            // In 'override' mode: skip the NameField, only use explicitly configured fields
            if (config.mode !== 'override' && ef.IncludeRelatedEntityNameFieldInBaseView) {
                const { nameField, nameFieldIsVirtual } = this.getIsNameFieldForSingleEntity(ef.RelatedEntity);
                if (nameField !== '') {
                    // only add to the output, if we found a name field for the related entity.
                    ef._RelatedEntityTableAlias = ef.RelatedEntityClassName + '_' + ef.Name;

                    // This next section generates a field name for the new virtual field and makes sure it doesn't collide with a field in the base table
                    const candidateName = this.stripID(ef.Name);

                    // Skip if candidateName is empty (e.g., field named exactly "ID")
                    // This happens in table-per-type inheritance where child.ID is FK to parent.ID
                    // stripID("ID") returns "" which would generate invalid SQL: AS []
                    if (candidateName.trim().length === 0) {
                        logStatus(`  Skipping related entity name field for ${ef.Name} in entity - stripID returned empty string (likely inheritance pattern)`);
                    }
                    else {
                        // check to make sure candidateName is not already a field name in the base table (other than a virtual field of course, as that is what we're creating)
                        // because if it is, we need to change it to something else
                        const bFound = entityFields.find(f => f.IsVirtual === false && f.Name.trim().toLowerCase() === candidateName.trim().toLowerCase()) !== undefined ||
                            allGeneratedAliases.some(a => a.toLowerCase() === candidateName.trim().toLowerCase());
                        const safeAlias = bFound ? candidateName + '_Virtual' : candidateName;

                        ef._RelatedEntityNameFieldMap = safeAlias;
                        ef._RelatedEntityJoinFieldMappings.push({
                            sourceField: nameField,
                            alias: safeAlias,
                            isVirtual: nameFieldIsVirtual
                        });
                        allGeneratedAliases.push(safeAlias);
                        if (nameFieldIsVirtual) anyFieldIsVirtual = true;

                        // check to see if the database already knows about the RelatedEntityNameFieldMap or not
                        if (ef.RelatedEntityNameFieldMap === null ||
                            ef.RelatedEntityNameFieldMap === undefined ||
                            ef.RelatedEntityNameFieldMap.trim().length === 0) {
                            // the database doesn't yet know about this RelatedEntityNameFieldMap, so we need to update it
                            // first update the actul field in the metadata object so it can be used from this point forward
                            // and it also reflects what the DB will hold
                            ef.RelatedEntityNameFieldMap = ef._RelatedEntityNameFieldMap;
                            // then update the database itself
                            await manageMD.updateEntityFieldRelatedEntityNameFieldMap(pool, ef.ID, ef.RelatedEntityNameFieldMap);
                        }
                    }
                }
            }

            // 2. Handle configured additional fields
            if (config.fields && config.fields.length > 0) {
                const currentEntity = md.Entities.find(e => e.ID === ef.EntityID);
                for (const fieldConfig of config.fields) {
                    const fieldName = fieldConfig.field;
                    const alias = fieldConfig.alias || this.generateDefaultAlias(ef.Name, fieldName);

                    // Validate field exists on related entity
                    if (!this.validateFieldExists(ef.RelatedEntity, fieldName)) {
                        logError(`RelatedEntityJoinFields: Field '${fieldName}' not found on entity '${ef.RelatedEntity}' (FK: ${ef.Name})`);
                        continue;
                    }

                    // Check for alias collisions
                    if (currentEntity && this.hasAliasCollision(currentEntity, alias, allGeneratedAliases)) {
                        logError(`RelatedEntityJoinFields: Alias '${alias}' for field '${fieldName}' would collide with an existing field or alias in entity '${currentEntity.Name}'`);
                        continue;
                    }

                    // Get field metadata from related entity to check if virtual
                    const relatedEntity = md.Entities.find(e => e.Name === ef.RelatedEntity);
                    const relatedField = relatedEntity?.Fields.find(f => f.Name.toLowerCase() === fieldName.toLowerCase());
                    const isVirtual = relatedField?.IsVirtual || false;

                    ef._RelatedEntityJoinFieldMappings.push({
                        sourceField: fieldName,
                        alias: alias,
                        isVirtual: isVirtual
                    });
                    allGeneratedAliases.push(alias);
                    if (isVirtual) anyFieldIsVirtual = true;
                }
            }

            // 3. Generate SQL for the mappings
            if (ef._RelatedEntityJoinFieldMappings.length > 0) {
                ef._RelatedEntityTableAlias = ef.RelatedEntityClassName + '_' + ef.Name;
                ef._RelatedEntityNameFieldIsVirtual = anyFieldIsVirtual;

                for (const mapping of ef._RelatedEntityJoinFieldMappings) {
                    const qi = this._dbProvider.Dialect.QuoteIdentifier.bind(this._dbProvider.Dialect);
                    sOutput += `${fieldCount === 0 ? '' : ','}\n    ${ef._RelatedEntityTableAlias}.${qi(mapping.sourceField)} AS ${qi(mapping.alias)}`;
                    fieldCount++;
                }
            }
        }
        return sOutput;
    }

    protected getIsNameFieldForSingleEntity(entityName: string): {nameField: string, nameFieldIsVirtual: boolean} {
        const md: Metadata = new Metadata(); // use the full metadata entity list, not the filtered version that we receive
        const e: EntityInfo = md.Entities.find(e => e.Name === entityName)!;
        if (e) {
            const ef: EntityFieldInfo = e.NameField!;
            if (e.NameField)
                return {nameField: ef.Name, nameFieldIsVirtual: ef.IsVirtual};
        }
        else
            logStatus(`ERROR: Could not find entity with name ${entityName}`);

        return {nameField: '', nameFieldIsVirtual: false}
    }

    protected stripID(name: string): string {
        if (name.endsWith('ID'))
            return name.substring(0, name.length - 2);
        else
            return name;
    }

    protected generateDefaultAlias(fkFieldName: string, relatedFieldName: string): string {
        const baseName = this.stripID(fkFieldName);
        if (baseName.toLowerCase() === relatedFieldName.toLowerCase()) {
            return baseName;
        }
        return baseName + relatedFieldName;
    }

    protected validateFieldExists(entityName: string, fieldName: string): boolean {
        const md = new Metadata();
        const entity = md.Entities.find(e => e.Name === entityName);
        if (!entity) return false;
        return entity.Fields.some(f => f.Name.toLowerCase() === fieldName.toLowerCase());
    }

    protected hasAliasCollision(entity: EntityInfo, alias: string, generatedAliases: string[]): boolean {
        // Check against existing fields in the entity (non-virtual fields first)
        if (entity.Fields.some(f => !f.IsVirtual && f.Name.toLowerCase() === alias.toLowerCase())) return true;

        // Check against other generated aliases in this view
        if (generatedAliases.some(a => a.toLowerCase() === alias.toLowerCase())) return true;

        // Check against system fields
        const systemFields = ['__mj_CreatedAt', '__mj_UpdatedAt', EntityInfo.DeletedAtFieldName];
        if (systemFields.some(sf => sf?.toLowerCase() === alias.toLowerCase())) return true;

        return false;
    }


    protected generateSPPermissions(entity: EntityInfo, spName: string, type: SPType): string {
        return this._dbProvider.generateCRUDPermissions(entity, spName, type as 'Create' | 'Update' | 'Delete');
    }

    protected generateFullTextSearchFunctionPermissions(entity: EntityInfo, functionName: string): string {
        return this._dbProvider.generateFullTextSearchPermissions(entity, functionName);
    }


    protected generateSPCreate(entity: EntityInfo): string {
        return this._dbProvider.generateCRUDCreate(entity);
    }


    protected generateUpdatedAtTrigger(entity: EntityInfo): string {
        return this._dbProvider.generateTimestampTrigger(entity);
    }

    protected generateSPUpdate(entity: EntityInfo): string {
        return this._dbProvider.generateCRUDUpdate(entity);
    }

    /**
     * Formats a default value for use in SQL, handling special cases like SQL functions
     * @param defaultValue The default value from the database metadata
     * @param needsQuotes Whether the field type typically needs quotes
     * @returns Properly formatted default value for SQL
     */
    protected formatDefaultValue(defaultValue: string, needsQuotes: boolean): string {
        return this._dbProvider.formatDefaultValue(defaultValue, needsQuotes);
    }

    protected createEntityFieldsParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
        return this._dbProvider.generateCRUDParamString(entityFields, isUpdate);
    }

    protected createEntityFieldsInsertString(entity: EntityInfo, entityFields: EntityFieldInfo[], prefix: string, excludePrimaryKey: boolean = false): string {
        return this._dbProvider.generateInsertFieldString(entity, entityFields, prefix, excludePrimaryKey);
    }


    protected createEntityFieldsUpdateString(entityFields: EntityFieldInfo[]): string {
        return this._dbProvider.generateUpdateFieldString(entityFields);
    }


    protected async generateSPDelete(entity: EntityInfo, pool: CodeGenConnection): Promise<string> {
        const cascadeSQL = await this.generateCascadeDeletes(entity, pool);
        return this._dbProvider.generateCRUDDelete(entity, cascadeSQL);
    }

    protected async generateCascadeDeletes(entity: EntityInfo, pool: CodeGenConnection): Promise<string> {
        let sOutput: string = '';
        if (entity.CascadeDeletes) {
            const md = new Metadata();

            // Find all fields in other entities that are foreign keys to this entity
            for (const e of md.Entities) {
                for (const ef of e.Fields) {
                    if (ef.RelatedEntityID === entity.ID && ef.IsVirtual === false) {
                        const cascadeSql = await this.generateSingleCascadeOperation(entity, e, ef, pool);

                        if (cascadeSql !== '') {
                            if (sOutput !== '')
                                sOutput += '\n    ';
                            sOutput += cascadeSql;
                        }
                    }
                }
            }
        }
        return sOutput === '' ? '' : `${sOutput}\n    `;
    }

    protected async generateSingleCascadeOperation(parentEntity: EntityInfo, relatedEntity: EntityInfo, fkField: EntityFieldInfo, pool: CodeGenConnection): Promise<string> {
        // Check if nullable FK is part of composite unique constraint
        // If so, we must DELETE instead of UPDATE to avoid unique constraint violations
        if (fkField.AllowsNull) {
            const isCompositeUnique = await this.isFieldInCompositeUniqueConstraint(
                pool,
                relatedEntity.SchemaName,
                relatedEntity.BaseTable,
                fkField.Name
            );

            if (isCompositeUnique) {
                if (relatedEntity.AllowDeleteAPI) {
                    // FK is part of composite unique - use DELETE instead of UPDATE
                    logStatus(`    ${relatedEntity.Name}.${fkField.Name} is part of composite unique constraint - using DELETE cascade`);
                    return this.generateCascadeCursorOperation(parentEntity, relatedEntity, fkField, 'delete');
                } else {
                    // Can't delete and can't safely update - warn
                    const msg = `${relatedEntity.Name}.${fkField.Name} is part of composite unique constraint but entity doesn't allow delete API`;
                    logWarning(`WARNING in spDelete${parentEntity.BaseTableCodeName}: ${msg}`);
                    return `
    -- WARNING: ${msg} - cascade operation may fail due to unique constraint violation`;
                }
            }
        }

        if (fkField.AllowsNull === false && relatedEntity.AllowDeleteAPI) {
            // Non-nullable FK: generate cursor-based cascade delete
            return this.generateCascadeCursorOperation(parentEntity, relatedEntity, fkField, 'delete');
        }
        else if (fkField.AllowsNull && relatedEntity.AllowUpdateAPI) {
            // Nullable FK: generate cursor-based update to set FK to null
            return this.generateCascadeCursorOperation(parentEntity, relatedEntity, fkField, 'update');
        }
        else if (fkField.AllowsNull && !relatedEntity.AllowUpdateAPI) {
            // Nullable FK but no update API - this is a configuration error
            const sqlComment = `WARNING: ${relatedEntity.BaseTable} has nullable FK to ${parentEntity.BaseTable} but doesn't allow update API - cascade operation will fail`;
            const consoleMsg = `WARNING in spDelete${parentEntity.BaseTableCodeName} generation: ${relatedEntity.BaseTable} has nullable FK to ${parentEntity.BaseTable} but doesn't allow update API - cascade operation will fail`;
            logWarning(consoleMsg);
            return `
    -- ${sqlComment}
    -- This will cause the delete operation to fail due to referential integrity`;
        }
        else if (!relatedEntity.AllowDeleteAPI) {
            // Entity doesn't allow delete API, so we can't cascade delete
            const sqlComment = `WARNING: ${relatedEntity.BaseTable} has non-nullable FK to ${parentEntity.BaseTable} but doesn't allow delete API - cascade operation will fail`;
            const consoleMsg = `WARNING in spDelete${parentEntity.BaseTableCodeName} generation: ${relatedEntity.BaseTable} has non-nullable FK to ${parentEntity.BaseTable} but doesn't allow delete API - cascade operation will fail`;
            logWarning(consoleMsg);
            return `
    -- ${sqlComment}
    -- This will cause a referential integrity violation`;
        }

        return '';
    }

    protected generateCascadeCursorOperation(parentEntity: EntityInfo, relatedEntity: EntityInfo, fkField: EntityFieldInfo, operation: 'delete' | 'update'): string {
        return this._dbProvider.generateSingleCascadeOperation({
            parentEntity,
            relatedEntity,
            fkField,
            operation,
        });
    }

    protected buildPrimaryKeyComponents(entity: EntityInfo, prefix: string = ''): {
        varDeclarations: string,
        selectFields: string,
        fetchInto: string,
        spParams: string
    } {
        const result = this._dbProvider.buildPrimaryKeyComponents(entity, prefix || undefined);
        return {
            varDeclarations: result.varDeclarations,
            selectFields: result.selectFields,
            fetchInto: result.fetchInto,
            spParams: result.routineParams,
        };
    }

    protected buildUpdateCursorParameters(entity: EntityInfo, _fkField: EntityFieldInfo, prefix: string = ''): {
        declarations: string,
        selectFields: string,
        fetchInto: string,
        allParams: string
    } {
        // This method is now only called by generateCascadeCursorOperation which
        // delegates to the provider. Kept for backward compatibility.
        throw new Error('buildUpdateCursorParameters should be handled by the database provider');
    }

    /**
     * Checks if a field is part of a composite (multi-column) unique constraint.
     * Returns true if the field participates in a unique index with 2+ columns.
     * This is used to determine if a nullable FK should use DELETE instead of UPDATE
     * during cascade operations, since setting to NULL could violate uniqueness.
     */
    protected async isFieldInCompositeUniqueConstraint(
        pool: CodeGenConnection,
        schemaName: string,
        tableName: string,
        columnName: string
    ): Promise<boolean> {
        const query = this._dbProvider.getCompositeUniqueConstraintCheckSQL(schemaName, tableName, columnName);

        try {
            const result = await pool.query(query);
            return result.recordset.length > 0;
        } catch (error) {
            logWarning(`Failed to check composite unique constraint for ${schemaName}.${tableName}.${columnName}: ${error}`);
            return false; // Fallback to existing UPDATE behavior
        }
    }

    /**
     * Analyzes cascade delete dependencies without generating SQL.
     * This method only tracks which entities depend on others for cascade operations.
     */
    protected analyzeCascadeDeleteDependencies(entity: EntityInfo): void {
        if (entity.CascadeDeletes) {
            const md = new Metadata();

            // Find all fields in other entities that are foreign keys to this entity
            for (const e of md.Entities) {
                for (const ef of e.Fields) {
                    if (ef.RelatedEntityID === entity.ID && ef.IsVirtual === false) {
                        // Skip self-referential foreign keys (e.g., ParentID pointing to same entity)
                        // These don't create inter-entity dependencies for ordering purposes
                        if (e.ID === entity.ID) {
                            continue;
                        }

                        // Check if this would generate a cascade operation
                        const wouldGenerateOperation =
                            (ef.AllowsNull === false && e.AllowDeleteAPI) || // Non-nullable FK: cascade delete
                            (ef.AllowsNull && e.AllowUpdateAPI); // Nullable FK: cascade update

                        if (wouldGenerateOperation) {
                            // Track the dependency: entity's delete SP depends on e's update/delete SP
                            if (ef.AllowsNull && e.AllowUpdateAPI) {
                                // entity's delete SP will call e's update SP
                                if (!this.cascadeDeleteDependencies.has(e.ID)) {
                                    this.cascadeDeleteDependencies.set(e.ID, new Set());
                                }
                                this.cascadeDeleteDependencies.get(e.ID)!.add(entity.ID);
                            } else if (!ef.AllowsNull && e.AllowDeleteAPI) {
                                // entity's delete SP will call e's delete SP
                                if (!this.cascadeDeleteDependencies.has(e.ID)) {
                                    this.cascadeDeleteDependencies.set(e.ID, new Set());
                                }
                                this.cascadeDeleteDependencies.get(e.ID)!.add(entity.ID);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Builds a complete map of cascade delete dependencies by analyzing all entities.
     * This method populates the cascadeDeleteDependencies map without generating SQL.
     */
    protected async buildCascadeDeleteDependencies(entities: EntityInfo[]): Promise<void> {
        // Clear existing dependencies
        this.cascadeDeleteDependencies.clear();

        logStatus(`Building cascade delete dependencies...`);
        
        // Analyze cascade deletes for each entity with CascadeDeletes=true
        // This will populate the cascadeDeleteDependencies map WITHOUT generating SQL
        let entitiesWithCascadeDeletes = 0;
        for (const entity of entities) {
            if (entity.CascadeDeletes) {
                entitiesWithCascadeDeletes++;
                if (entity.spDeleteGenerated) {
                    logStatus(`  Analyzing cascade deletes for ${entity.Name}...`);
                    this.analyzeCascadeDeleteDependencies(entity);
                } else {
                    logStatus(`  Skipping ${entity.Name} - has CascadeDeletes but spDeleteGenerated=false`);
                }
            }
        }
        logStatus(`Total entities with CascadeDeletes=true: ${entitiesWithCascadeDeletes}`)
        
        // Log the dependency map
        logStatus(`Cascade delete dependency map built:`);
        for (const [dependedOnEntityId, dependentEntityIds] of this.cascadeDeleteDependencies) {
            const dependedOnEntity = entities.find(e => e.ID === dependedOnEntityId);
            const dependentNames = Array.from(dependentEntityIds)
                .map(id => entities.find(e => e.ID === id)?.Name || id)
                .join(', ');
            logStatus(`  ${dependedOnEntity?.Name || dependedOnEntityId} is depended on by: ${dependentNames}`);
        }
    }

    /**
     * Gets entities that had schema changes from the ManageMetadataBase tracking.
     * Returns a map of entity names to their IDs for entities that had update-affecting changes.
     */
    protected async getModifiedEntitiesWithUpdateAPI(entities: EntityInfo[]): Promise<Map<string, string>> {
        const modifiedEntitiesMap = new Map<string, string>();

        // Get the list of modified entity names from the metadata management phase
        const modifiedEntityNames = ManageMetadataBase.modifiedEntityList;

        logStatus(`Modified entities from metadata phase: ${modifiedEntityNames.join(', ')}`);

        // Convert entity names to IDs and filter for those with update API
        for (const entityName of modifiedEntityNames) {
            const entity = entities.find(e =>
                e.Name === entityName &&
                e.AllowUpdateAPI &&
                e.spUpdateGenerated
            );

            if (entity) {
                modifiedEntitiesMap.set(entity.Name, entity.ID);
                logStatus(`  - ${entity.Name} (${entity.ID}) has update API and will be tracked`);
            } else {
                const nonUpdateEntity = entities.find(e => e.Name === entityName);
                if (nonUpdateEntity) {
                    logStatus(`  - ${entityName} found but AllowUpdateAPI=${nonUpdateEntity.AllowUpdateAPI}, spUpdateGenerated=${nonUpdateEntity.spUpdateGenerated}`);
                } else {
                    logStatus(`  - ${entityName} not found in entities list`);
                }
            }
        }

        return modifiedEntitiesMap;
    }

    /**
     * Identifies entities that need their delete stored procedures regenerated
     * due to cascade dependencies on entities that had schema changes.
     */
    protected async getEntitiesRequiringCascadeDeleteRegeneration(
        pool: CodeGenConnection,
        changedEntityIds: Set<string>
    ): Promise<Set<string>> {
        const entitiesNeedingRegeneration = new Set<string>();

        // For each changed entity, find all entities that depend on it
        for (const changedEntityId of changedEntityIds) {
            const dependentEntities = this.cascadeDeleteDependencies.get(changedEntityId);
            if (dependentEntities) {
                for (const dependentEntityId of dependentEntities) {
                    entitiesNeedingRegeneration.add(dependentEntityId);
                }
            }
        }

        return entitiesNeedingRegeneration;
    }

    /**
     * Marks entities for delete stored procedure regeneration based on cascade dependencies.
     * This should be called after metadata management and before SQL generation.
     */
    protected async markEntitiesForCascadeDeleteRegeneration(
        pool: CodeGenConnection,
        entities: EntityInfo[]
    ): Promise<void> {
        try {
            // Build the cascade delete dependency map
            await this.buildCascadeDeleteDependencies(entities);

            // Get entities that were modified during metadata management
            const modifiedEntitiesMap = await this.getModifiedEntitiesWithUpdateAPI(entities);
            
            if (modifiedEntitiesMap.size > 0) {
                logStatus(`Found ${modifiedEntitiesMap.size} entities with schema changes affecting update SPs`);

                // Convert map values to set of IDs
                const changedEntityIds = new Set(modifiedEntitiesMap.values());

                // Find entities that need delete SP regeneration
                const entitiesNeedingRegeneration = await this.getEntitiesRequiringCascadeDeleteRegeneration(pool, changedEntityIds);
                
                if (entitiesNeedingRegeneration.size > 0) {
                    logStatus(`Identified ${entitiesNeedingRegeneration.size} entities requiring delete SP regeneration due to cascade dependencies`);

                    // Store the entity IDs that need regeneration (only if spDeleteGenerated=true)
                    for (const entityId of entitiesNeedingRegeneration) {
                        const entity = entities.find(e => e.ID === entityId);
                        if (entity && entity.spDeleteGenerated) {
                            this.entitiesNeedingDeleteSPRegeneration.add(entityId);
                            logStatus(`  - Marked ${entity.Name} for delete SP regeneration (cascade dependency)`);
                        } else if (entity && !entity.spDeleteGenerated) {
                            logStatus(`  - Skipping ${entity.Name} - has cascade dependency but spDeleteGenerated=false (custom SP)`);
                        }
                    }

                    // Order entities by dependencies for proper regeneration
                    this.orderedEntitiesForDeleteSPRegeneration = this.orderEntitiesByDependencies(
                        entities,
                        this.entitiesNeedingDeleteSPRegeneration
                    );

                    if (this.orderedEntitiesForDeleteSPRegeneration.length > 0) {
                        logStatus(`Ordered entities for delete SP regeneration:`);
                        this.orderedEntitiesForDeleteSPRegeneration.forEach((entityId, index) => {
                            const entity = entities.find(e => e.ID === entityId);
                            logStatus(`  ${index + 1}. ${entity?.Name || entityId}`);
                        });
                    }
                }
            }
        } catch (error) {
            logError(`Error in cascade delete dependency analysis: ${error}`);
            // Continue with normal processing even if dependency analysis fails
        }
    }
    
    /**
     * Orders entities by their cascade delete dependencies using topological sort.
     * Ensures that if Entity A's delete SP calls Entity B's update/delete SP,
     * then Entity B is regenerated before Entity A.
     * 
     * @param entities All entities for name lookup
     * @param entityIdsToOrder Set of entity IDs that need ordering
     * @returns Array of entity IDs in dependency order
     */
    protected orderEntitiesByDependencies(entities: EntityInfo[], entityIdsToOrder: Set<string>): string[] {
        const ordered: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        // Build reverse dependency map for entities we're ordering
        // If A depends on B, then reverseMap[A] contains B
        const reverseMap = new Map<string, Set<string>>();

        for (const entityId of entityIdsToOrder) {
            reverseMap.set(entityId, new Set<string>());
        }

        // For each entity in our set, find what it depends on
        for (const [dependedOnId, dependentIds] of this.cascadeDeleteDependencies) {
            for (const dependentId of dependentIds) {
                if (entityIdsToOrder.has(dependentId) && entityIdsToOrder.has(dependedOnId)) {
                    // dependentId depends on dependedOnId
                    reverseMap.get(dependentId)!.add(dependedOnId);
                }
            }
        }

        // Topological sort using DFS with circular dependency handling
        const circularDeps = new Set<string>();

        const visit = (entityId: string): boolean => {
            if (visited.has(entityId)) {
                return true;
            }

            if (visiting.has(entityId)) {
                // Circular dependency detected - mark it but don't fail
                const entity = entities.find(e => e.ID === entityId);
                logStatus(`Warning: Circular cascade delete dependency detected involving ${entity?.Name || entityId}`);
                circularDeps.add(entityId);
                return false; // Signal circular dependency but continue processing
            }

            visiting.add(entityId);

            // Visit dependencies first
            const dependencies = reverseMap.get(entityId) || new Set();
            for (const depId of dependencies) {
                if (!visit(depId)) {
                    // If dependency visit failed (circular), skip this dependency edge
                    // but continue processing other dependencies
                    continue;
                }
            }

            visiting.delete(entityId);
            visited.add(entityId);
            ordered.push(entityId);

            return true;
        };

        // Visit all entities that need ordering
        for (const entityId of entityIdsToOrder) {
            if (!visited.has(entityId)) {
                const success = visit(entityId);
                if (!success && circularDeps.has(entityId)) {
                    // Entity is part of circular dependency - add it anyway in arbitrary order
                    // The SQL will still be generated, just not in perfect dependency order
                    logStatus(`  - Adding ${entities.find(e => e.ID === entityId)?.Name || entityId} despite circular dependency`);
                    visited.add(entityId);
                    ordered.push(entityId);
                }
            }
        }

        if (circularDeps.size > 0) {
            logStatus(`Note: ${circularDeps.size} entities have circular cascade delete dependencies and will be regenerated in arbitrary order.`);
        }
        
        return ordered;
    }
}
