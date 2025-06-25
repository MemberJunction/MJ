import { EntityInfo, EntityFieldInfo, EntityPermissionInfo, Metadata, UserInfo, EntityFieldTSType } from '@memberjunction/core';
import { logError, logMessage, logStatus, logWarning, startSpinner, updateSpinner, succeedSpinner, failSpinner } from '../Misc/status_logging';
import * as fs from 'fs';
import path from 'path';

import { SQLUtilityBase } from './sql';
import * as sql from 'mssql';
import { autoIndexForeignKeys, configInfo, customSqlScripts, dbDatabase, mjCoreSchema, MAX_INDEX_NAME_LENGTH } from '../Config/config';
import { ManageMetadataBase } from './manage-metadata';

import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { combineFiles, logIf } from '../Misc/util';
import { EntityEntity } from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { SQLLogging } from '../Misc/sql_logging';


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
export class SQLCodeGenBase {
    protected _sqlUtilityObject: SQLUtilityBase = MJGlobal.Instance.ClassFactory.CreateInstance<SQLUtilityBase>(SQLUtilityBase)!;
    public get SQLUtilityObject(): SQLUtilityBase {
        return this._sqlUtilityObject;
    }

    /**
     * Array of entity names that qualify for forced regeneration based on the whereClause filter
     */
    protected entitiesQualifiedForForcedRegeneration: string[] = [];

    /**
     * Flag indicating whether to filter entities for forced regeneration based on entityWhereClause
     */
    protected filterEntitiesQualifiedForRegeneration: boolean = false;

    public async manageSQLScriptsAndExecution(pool: sql.ConnectionPool, entities: EntityInfo[], directory: string, currentUser: UserInfo): Promise<boolean> {
        try {
            // Build list of entities qualified for forced regeneration if entityWhereClause is provided
            if (configInfo.forceRegeneration?.enabled && configInfo.forceRegeneration?.entityWhereClause) {
                this.filterEntitiesQualifiedForRegeneration = true; // Enable filtering
                try {
                    const whereClause = configInfo.forceRegeneration.entityWhereClause;
                    const query = `
                        SELECT Name 
                        FROM [${mjCoreSchema}].[Entity] 
                        WHERE ${whereClause}
                    `;
                    const result = await pool.request().query(query);
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
            const baselineEntities = entities.filter(e => e.IncludeInAPI);
            const includedEntities = baselineEntities.filter(e => configInfo.excludeSchemas.find(s => s.toLowerCase() === e.SchemaName.toLowerCase()) === undefined); //only include entities that are NOT in the excludeSchemas list
            const excludedEntities = baselineEntities.filter(e => configInfo.excludeSchemas.find(s => s.toLowerCase() === e.SchemaName.toLowerCase()) !== undefined); //only include entities that ARE in the excludeSchemas list in this array

            // STEP 2(a) - clean out all *.generated.sql and *.permissions.generated.sql files from the directory
            startSpinner('Cleaning generated files...');
            this.deleteGeneratedEntityFiles(directory, baselineEntities);
            succeedSpinner('Cleaned generated files');

            // STEP 2(b) - generate all the SQL files and execute them
            startSpinner(`Generating SQL for ${includedEntities.length} entities...`);
            const step2StartTime: Date = new Date();

            const genResult = await this.generateAndExecuteEntitySQLToSeparateFiles({
                pool, 
                entities: includedEntities, 
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
            
            // STEP 2(e) ---- FINALLY, we now execute all the combined files by schema;
            startSpinner('Executing combined entity SQL files...');
            const step2eStartTime: Date = new Date();
            if (! await this.SQLUtilityObject.executeSQLFiles(allEntityFiles, configInfo?.verboseOutput ?? false)) {
                failSpinner('Failed to execute combined entity SQL files');
                return false;
            }
            const step2eEndTime: Date = new Date();
            succeedSpinner(`SQL execution completed (${(step2eEndTime.getTime() - step2eStartTime.getTime())/1000}s)`);

            const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)!;
            // STEP 3 - re-run the process to manage entity fields since the Step 1 and 2 above might have resulted in differences in base view columns compared to what we had at first
            // we CAN skip the entity field values part because that wouldn't change from the first time we ran it
            startSpinner('Managing entity fields metadata...');
            if (! await manageMD.manageEntityFields(pool, configInfo.excludeSchemas, true, true, currentUser)) {
                failSpinner('Failed to manage entity fields');
                return false;
            }
            succeedSpinner('Entity fields metadata updated');
            // no logStatus/timer for this because manageEntityFields() has its own internal logging for this including the total, so it is redundant to log it here

            // STEP 4- Apply permissions, executing all .permissions files
            startSpinner('Applying permissions...');
            const step4StartTime: Date = new Date();
            if (! await this.applyPermissions(pool, directory, baselineEntities)) {
                failSpinner('Failed to apply permissions');
                return false;
            }
            succeedSpinner(`Permissions applied (${(new Date().getTime() - step4StartTime.getTime())/1000}s)`);
            
            // STEP 5 - execute any custom SQL scripts that should run afterwards
            startSpinner('Running post-generation SQL scripts...');
            const step5StartTime: Date = new Date();
            if (! await this.runCustomSQLScripts(pool, 'after-sql')) {
                failSpinner('Failed to run post-generation SQL scripts');
                return false;
            }
            succeedSpinner(`Post-generation scripts completed (${(new Date().getTime() - step5StartTime.getTime())/1000}s)`);

            succeedSpinner(`CodeGen completed successfully (${((new Date().getTime() - startTime.getTime())/1000)}s total)`);

            // now - we need to tell our metadata object to refresh itself
            const md = new Metadata();
            await md.Refresh();

            return true;
        }
        catch (err) {
            logError(err as string);
            return false;
        }
    }

    public async runCustomSQLScripts(pool: sql.ConnectionPool, when: string): Promise<boolean> {
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


    public async applyPermissions(pool: sql.ConnectionPool, directory: string, entities: EntityInfo[], batchSize: number = 5): Promise<boolean> {
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
                                await pool.request().query(fileContents);                            
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
        pool: sql.ConnectionPool, 
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
                        logError(`SKIPPING ENTITY: Entity ${e.Name}, because it does not have a primary key field defined. A table must have a primary key defined to quality to be a MemberJunction entity`);
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
        pool: sql.ConnectionPool, 
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

    protected logSQLForNewOrModifiedEntity(entity: EntityInfo, sql: string, description: string, logSql: boolean = false) {
        // Check if we should log this SQL
        let shouldLog = false;
        
        if (logSql) {
            // Check if entity is in new or modified lists
            const isNewOrModified = !!ManageMetadataBase.newEntityList.find(e => e === entity.Name) || 
                                   !!ManageMetadataBase.modifiedEntityList.find(e => e === entity.Name);
            
            // Check if force regeneration is enabled for relevant SQL types
            const isForceRegeneration = configInfo.forceRegeneration?.enabled && (
                (description.toLowerCase().includes('base view') && configInfo.forceRegeneration.baseViews) ||
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
            
            // Determine if we should log based on entity state and force regeneration settings
            if (isNewOrModified) {
                // Always log new or modified entities
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
        }
        
        logIf(configInfo.verboseOutput, `SQL Generated for ${entity.Name}: ${description}`);
    }

    public async generateSingleEntitySQLToSeparateFiles(options: {
        pool: sql.ConnectionPool, 
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
            // Indexes for Fkeys for the table
            if (!options.onlyPermissions){
                const shouldGenerateIndexes = autoIndexForeignKeys() || (configInfo.forceRegeneration?.enabled && configInfo.forceRegeneration?.indexes);
                const indexSQL = shouldGenerateIndexes ? this.generateIndexesForForeignKeys(options.pool, options.entity) : ''; // generate indexes if auto-indexing is on OR force regeneration is enabled
                const s = this.generateSingleEntitySQLFileHeader(options.entity, 'Index for Foreign Keys') + indexSQL; 
                if (options.writeFiles) {
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('index', options.entity.SchemaName, options.entity.BaseTable, false, true));
                    this.logSQLForNewOrModifiedEntity(options.entity, s, 'Index for Foreign Keys for ' + options.entity.BaseTable, options.enableSQLLoggingForNewOrModifiedEntities);
                    fs.writeFileSync(filePath, s);
                    files.push(filePath);
                }
                sRet += s + '\nGO\n';
            }

            // BASE VIEW
            if (!options.onlyPermissions && 
                (options.entity.BaseViewGenerated || (configInfo.forceRegeneration?.enabled && configInfo.forceRegeneration?.baseViews)) && 
                !options.entity.VirtualEntity) {
                // generate the base view
                const s = this.generateSingleEntitySQLFileHeader(options.entity,options.entity.BaseView) + await this.generateBaseView(options.pool, options.entity)
                const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('view', options.entity.SchemaName, options.entity.BaseView, false, true));
                if (options.writeFiles) {
                    this.logSQLForNewOrModifiedEntity(options.entity, s, `Base View SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);
                    fs.writeFileSync(filePath, s)
                    files.push(filePath);
                }
                sRet += s + '\nGO\n';
            }
            // always generate permissions for the base view
            const s = this.generateSingleEntitySQLFileHeader(options.entity, 'Permissions for ' + options.entity.BaseView) + this.generateViewPermissions(options.entity)
            if (s.length > 0)
                permissionsSQL += s + '\nGO\n';
            if (options.writeFiles) {
                const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('view', options.entity.SchemaName, options.entity.BaseView, true, true));
                fs.writeFileSync(filePath, s)
                this.logSQLForNewOrModifiedEntity(options.entity, s, `Base View Permissions SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);

                files.push(filePath);
            }

            // now, append the permissions to the return string IF we did NOT generate the base view - because if we generated the base view, that
            // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
            if (!options.entity.BaseViewGenerated)
                sRet += s + '\nGO\n';

            // CREATE SP
            if (options.entity.AllowCreateAPI && !options.entity.VirtualEntity) {
                const spName: string = this.getSPName(options.entity, SPType.Create);
                if (!options.onlyPermissions && 
                    (options.entity.spCreateGenerated || 
                     (configInfo.forceRegeneration?.enabled && (configInfo.forceRegeneration?.spCreate || configInfo.forceRegeneration?.allStoredProcedures)))) {
                    // generate the create SP
                    const s = this.generateSingleEntitySQLFileHeader(options.entity, spName) + this.generateSPCreate(options.entity)
                    if (options.writeFiles) {
                        const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, false, true))

                        this.logSQLForNewOrModifiedEntity(options.entity, s, `spCreate SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);

                        fs.writeFileSync(filePath, s);
                        files.push(filePath);
                    }
                    sRet += s + '\nGO\n';
                }
                const s = this.generateSPPermissions(options.entity, spName, SPType.Create) + '\n\n';
                if (s.length > 0)
                    permissionsSQL += s + '\nGO\n';
                if (options.writeFiles) {
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, true, true))

                    this.logSQLForNewOrModifiedEntity(options.entity, s, `spCreate Permissions for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);

                    fs.writeFileSync(filePath, s);
                    files.push(filePath);
                }

                // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!options.entity.spCreateGenerated)
                    sRet += s + '\nGO\n';
            }

            // UPDATE SP
            if (options.entity.AllowUpdateAPI && !options.entity.VirtualEntity) {
                const spName: string = this.getSPName(options.entity, SPType.Update);
                if (!options.onlyPermissions && 
                    (options.entity.spUpdateGenerated || 
                     (configInfo.forceRegeneration?.enabled && (configInfo.forceRegeneration?.spUpdate || configInfo.forceRegeneration?.allStoredProcedures)))) {
                    // generate the update SP
                    const s = this.generateSingleEntitySQLFileHeader(options.entity, spName) + this.generateSPUpdate(options.entity)
                    if (options.writeFiles) {
                        const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, false, true))
                        fs.writeFileSync(filePath, s);

                        this.logSQLForNewOrModifiedEntity(options.entity, s, `spUpdate SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);

                        files.push(filePath);
                    }
                    sRet += s + '\nGO\n';
                }
                const s = this.generateSPPermissions(options.entity, spName, SPType.Update) + '\n\n';
                if (s.length > 0)
                    permissionsSQL += s + '\nGO\n';
                if (options.writeFiles) {
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, true, true));

                    this.logSQLForNewOrModifiedEntity(options.entity, s, `spUpdate Permissions for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);

                    fs.writeFileSync(filePath, s);
                    files.push(filePath);
                }

                // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!options.entity.spUpdateGenerated)
                    sRet += s + '\nGO\n';
            }

            // DELETE SP
            if (options.entity.AllowDeleteAPI && !options.entity.VirtualEntity) {
                const spName: string = this.getSPName(options.entity, SPType.Delete);
                if (!options.onlyPermissions && 
                    (options.entity.spDeleteGenerated || 
                     (configInfo.forceRegeneration?.enabled && (configInfo.forceRegeneration?.spDelete || configInfo.forceRegeneration?.allStoredProcedures)))) {
                    // generate the delete SP
                    const s = this.generateSingleEntitySQLFileHeader(options.entity, spName) + this.generateSPDelete(options.entity)
                    if (options.writeFiles) {
                        const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, false, true))

                        this.logSQLForNewOrModifiedEntity(options.entity, s, `spDelete SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);

                        fs.writeFileSync(filePath, s);
                        files.push(filePath);
                    }
                    sRet += s + '\nGO\n';
                }
                const s = this.generateSPPermissions(options.entity, spName, SPType.Delete) + '\n\n';
                if (s.length > 0)
                    permissionsSQL += s + '\nGO\n';
                if (options.writeFiles) {
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('sp', options.entity.SchemaName, spName, true, true));

                    this.logSQLForNewOrModifiedEntity(options.entity, s, `spDelete Permissions for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);

                    fs.writeFileSync(filePath, s);
                    files.push(filePath);
                }

                // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!options.entity.spDeleteGenerated)
                    sRet += s + '\nGO\n';
            }

            // check to see if the options.entity supports full text search or not
            if (options.entity.FullTextSearchEnabled || (configInfo.forceRegeneration?.enabled && configInfo.forceRegeneration?.fullTextSearch)) {
                // always generate the code so we can get the function name from the below function call
                const ft = await this.generateEntityFullTextSearchSQL(options.pool, options.entity);
                if (!options.onlyPermissions) {
                    // only write the actual sql out if we're not only generating permissions
                    const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('full_text_search_function', options.entity.SchemaName, options.entity.BaseTable, false, true));
                    if (options.writeFiles) {
                        this.logSQLForNewOrModifiedEntity(options.entity, ft.sql, `Full Text Search SQL for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);

                        fs.writeFileSync(filePath, ft.sql)
                        files.push(filePath);
                    }
                    sRet += ft.sql + '\nGO\n';
                }

                const sP = this.generateFullTextSearchFunctionPermissions(options.entity, ft.functionName) + '\n\n';
                if (sP.length > 0)
                    permissionsSQL += sP + '\nGO\n';

                const filePath = path.join(options.directory, this.SQLUtilityObject.getDBObjectFileName('full_text_search_function', options.entity.SchemaName, options.entity.BaseTable, true, true));
                if (options.writeFiles) {
                    this.logSQLForNewOrModifiedEntity(options.entity, sP, `Full Text Search Permissions for ${options.entity.Name}`, options.enableSQLLoggingForNewOrModifiedEntities);

                    fs.writeFileSync(filePath, sP)
                    files.push(filePath);
                }

                // now, append the permissions to the return string IF we did NOT generate the function - because if we generated the function, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!options.entity.FullTextSearchFunctionGenerated)
                    sRet += sP + '\nGO\n';
            }

            return {sql: sRet, permissionsSQL: permissionsSQL, files: files};
        }
        catch (err) {
            logError(err as string)
            return null!;
        }
    }

    public getSPName(entity: EntityInfo, type: SPType): string {
        switch (type) {
            case SPType.Create:
                return entity.spCreate && entity.spCreate.length > 0 ? entity.spCreate : 'spCreate' + entity.ClassName;
            case SPType.Update:
                return entity.spUpdate && entity.spUpdate.length > 0 ? entity.spUpdate : 'spUpdate' + entity.ClassName;
            case SPType.Delete:
                return entity.spDelete && entity.spDelete.length > 0 ? entity.spDelete : 'spDelete' + entity.ClassName;
        }
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
    public async generateEntitySQL(pool: sql.ConnectionPool, entity: EntityInfo): Promise<string> {
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
                sOutput += this.generateSPDelete(entity) + '\n\n';
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

    async generateEntityFullTextSearchSQL(pool: sql.ConnectionPool, entity: EntityInfo): Promise<{sql: string, functionName: string}> {
        let sql = '';

        const catalogName = entity.FullTextCatalog && entity.FullTextCatalog.length > 0 ? entity.FullTextCatalog : dbDatabase + '_FullTextCatalog';
        if (entity.FullTextCatalogGenerated) {
            // this situation means we have a generated catalog and the user has provided a name specific to THIS entity
            sql += `                -- CREATE THE FULL TEXT CATALOG FOR THE ENTITY, IF NOT ALREADY CREATED
                IF NOT EXISTS (
                    SELECT *
                    FROM sys.fulltext_catalogs
                    WHERE name = '${catalogName}'
                )
                    CREATE FULLTEXT CATALOG ${catalogName};
                GO
    `
        }

        if (entity.FullTextIndexGenerated) {
            const fullTextFields = entity.Fields.filter(f => f.FullTextSearchEnabled).map(f => `${f.Name} LANGUAGE 'English'`).join(', ');
            if (fullTextFields.length === 0)
                throw new Error(`FullTextIndexGenerated is true for entity ${entity.Name}, but no fields are marked as FullTextSearchEnabled`);
            // drop and recreate the full text index
            const entity_pk_name = await this.getEntityPrimaryKeyIndexName(pool, entity);
            sql += `                -- DROP AND RECREATE THE FULL TEXT INDEX
                IF EXISTS (
                    SELECT *
                    FROM sys.fulltext_indexes
                    WHERE object_id = OBJECT_ID('${entity.SchemaName}.${entity.BaseTable}')
                )
                BEGIN
                    DROP FULLTEXT INDEX ON [${entity.SchemaName}].[${entity.BaseTable}];
                END
                GO

                IF NOT EXISTS (
                    SELECT *
                    FROM sys.fulltext_indexes
                    WHERE object_id = OBJECT_ID('${entity.SchemaName}.${entity.BaseTable}')
                )
                BEGIN
                    CREATE FULLTEXT INDEX ON [${entity.SchemaName}].[${entity.BaseTable}]
                    (
                        ${fullTextFields}
                    )
                    KEY INDEX ${entity_pk_name}
                    ON ${catalogName};
                END
                GO
    `
        }

        const functionName: string = entity.FullTextSearchFunction && entity.FullTextSearchFunction.length > 0 ? entity.FullTextSearchFunction : `fnSearch${entity.CodeName}`;
        if (entity.FullTextSearchFunctionGenerated) {
            const fullTextFieldsSimple = entity.Fields.filter(f => f.FullTextSearchEnabled).map(f => '[' + f.Name + ']').join(', ');
            if (fullTextFieldsSimple.length === 0)
                throw new Error(`FullTextSearchFunctionGenerated is true for entity ${entity.Name}, but no fields are marked as FullTextSearchEnabled`);
            if (!entity.FullTextSearchFunction || entity.FullTextSearchFunction.length === 0) {
                // update this in the DB
                const md = new Metadata();
                const u = UserCache.Instance.Users[0];
                if (!u)
                    throw new Error('Could not find the first user in the cache, cant generate the full text search function without a user');

                const e = <EntityEntity>await md.GetEntityObject('Entities', u);
                await e.Load(entity.ID);
                e.FullTextSearchFunction = functionName;
                if (!await e.Save())
                    throw new Error(`Could not update the FullTextSearchFunction for entity ${entity.Name}`);
            }
            const pkeyList = entity.PrimaryKeys.map(pk => '[' + pk.Name + ']').join(', ');
            // drop and recreate the full text search function
            sql += `                -- DROP AND RECREATE THE FULL TEXT SEARCH FUNCTION
                -- Create an inline table-valued function to perform full-text search
                -- Drop the function if it already exists
                IF OBJECT_ID('${entity.SchemaName}.${functionName}', 'IF') IS NOT NULL
                    DROP FUNCTION ${entity.SchemaName}.${functionName};
                GO
                CREATE FUNCTION ${entity.SchemaName}.${functionName} (@searchTerm NVARCHAR(255))
                RETURNS TABLE
                AS
                RETURN (
                    SELECT ${pkeyList}
                    FROM [${entity.SchemaName}].[${entity.BaseTable}]
                    WHERE CONTAINS((${fullTextFieldsSimple}), @searchTerm)
                )
                GO
    `
            sql += this.generateFullTextSearchFunctionPermissions(entity, functionName) + '\n\nGO\n';
        }

        return {sql,functionName};
    }

    async getEntityPrimaryKeyIndexName(pool: sql.ConnectionPool, entity: EntityInfo): Promise<string> {
        const sSQL = `  SELECT
        i.name AS IndexName
    FROM
        sys.indexes i
    INNER JOIN
        sys.objects o ON i.object_id = o.object_id
    INNER JOIN
        sys.key_constraints kc ON i.object_id = kc.parent_object_id AND
        i.index_id = kc.unique_index_id
    WHERE
        o.name = '${entity.BaseTable}' AND
        o.schema_id = SCHEMA_ID('${entity.SchemaName}') AND
        kc.type = 'PK';
        `
        const resultResult = await pool.request().query(sSQL);
            const result = resultResult.recordset;
        if (result && result.length > 0)
            return result[0].IndexName;
        else
            throw new Error(`Could not find primary key index for entity ${entity.Name}`);
    }

    public generateAllEntitiesSQLFileHeader(): string {
        return `-----------------------------------------------------------------
-- SQL Code Generation for Entities
--
-- This file contains the SQL code for the entities in the database
-- that are included in the API and have generated SQL elements like views and
-- stored procedures.
--
-- It is generated by the MemberJunction CodeGen tool.
-- It is not intended to be edited by hand.
-----------------------------------------------------------------
`
    }

    public generateSingleEntitySQLFileHeader(entity: EntityInfo, itemName: string): string {
        return `-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: ${entity.Name}
-- Item: ${itemName}
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
`
    }

    /**
     * Generates the SQL for creating indexes for the foreign keys in the entity
     * @param pool 
     * @param entity 
     */
    generateIndexesForForeignKeys(pool: sql.ConnectionPool, entity: EntityInfo): string {
        // iterate through all of the fields in the entity that are foreign keys and generate an index for each one
        let sOutput: string = ''; 
        for (const f of entity.Fields) {
            if (f.RelatedEntity && f.RelatedEntity.length > 0) {
                // we have an fkey, so generate the create index
                let indexName = `IDX_AUTO_MJ_FKEY_${entity.BaseTableCodeName}_${f.CodeName}`; // use code names in case the table and/or field names have special characters or spaces/etc
                if (indexName.length > MAX_INDEX_NAME_LENGTH)
                    indexName = indexName.substring(0, MAX_INDEX_NAME_LENGTH); // truncate to max length if necessary

                if (sOutput.length > 0)
                    sOutput += '\n\n'; // do this way so we don't end up with a trailing newline at end of the string/file

                sOutput += `-- Index for foreign key ${f.Name} in table ${entity.BaseTable}
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = '${indexName}' 
    AND object_id = OBJECT_ID('[${entity.SchemaName}].[${entity.BaseTable}]')
)
CREATE INDEX ${indexName} ON [${entity.SchemaName}].[${entity.BaseTable}] ([${f.Name}]);`
            }
        }
        return sOutput;
    }

    async generateBaseView(pool: sql.ConnectionPool, entity: EntityInfo): Promise<string> {
        const viewName: string = entity.BaseView ? entity.BaseView : `vw${entity.CodeName}`;
        const classNameFirstChar: string = entity.ClassName.charAt(0).toLowerCase();
        const relatedFieldsString: string = await this.generateBaseViewRelatedFieldsString(pool, entity.Fields);
        const relatedFieldsJoinString: string = this.generateBaseViewJoins(entity, entity.Fields);
        const permissions: string = this.generateViewPermissions(entity);
        const whereClause: string = entity.DeleteType === 'Soft' ? `WHERE
    ${classNameFirstChar}.[${EntityInfo.DeletedAtFieldName}] IS NULL
` : '';
        return `
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      ${entity.Name}
-----               SCHEMA:      ${entity.SchemaName}
-----               BASE TABLE:  ${entity.BaseTable}
-----               PRIMARY KEY: ${entity.PrimaryKeys.map(pk => pk.Name).join(', ')}
------------------------------------------------------------
DROP VIEW IF EXISTS [${entity.SchemaName}].[${viewName}]
GO

CREATE VIEW [${entity.SchemaName}].[${viewName}]
AS
SELECT
    ${classNameFirstChar}.*${relatedFieldsString.length > 0 ? ',' : ''}${relatedFieldsString}
FROM
    [${entity.SchemaName}].[${entity.BaseTable}] AS ${classNameFirstChar}${relatedFieldsJoinString ? '\n' + relatedFieldsJoinString : ''}
${whereClause}GO${permissions}
    `
    }

    protected generateViewPermissions(entity: EntityInfo): string {
        let sOutput: string = '';
        for (let i: number = 0; i < entity.Permissions.length; i++) {
            const ep: EntityPermissionInfo = entity.Permissions[i];
            if (ep.RoleSQLName && ep.RoleSQLName.length > 0) {
                sOutput += (sOutput === '' ? `GRANT SELECT ON [${entity.SchemaName}].[${entity.BaseView}] TO ` : ', ') + `[${ep.RoleSQLName}]`
            }
        }
        return (sOutput == '' ? '' : '\n') + sOutput;
    }

    protected generateBaseViewJoins(entity: EntityInfo, entityFields: EntityFieldInfo[]): string {
        let sOutput: string = '';
        const classNameFirstChar: string = entity.ClassName.charAt(0).toLowerCase();
        for (let i: number = 0; i < entityFields.length; i++) {
            const ef: EntityFieldInfo = entityFields[i];
            if (ef.RelatedEntityID && ef.IncludeRelatedEntityNameFieldInBaseView && ef._RelatedEntityTableAlias) {
                sOutput += sOutput == '' ? '' : '\n';
                sOutput += `${ef.AllowsNull ? 'LEFT OUTER' : 'INNER' } JOIN\n    ${'[' + ef.RelatedEntitySchemaName + '].'}[${ef._RelatedEntityNameFieldIsVirtual ? ef.RelatedEntityBaseView : ef.RelatedEntityBaseTable}] AS ${ef._RelatedEntityTableAlias}\n  ON\n    [${classNameFirstChar}].[${ef.Name}] = ${ef._RelatedEntityTableAlias}.[${ef.RelatedEntityFieldName}]`;
            }
        }
        return sOutput;
    }

    async generateBaseViewRelatedFieldsString(pool: sql.ConnectionPool, entityFields: EntityFieldInfo[]): Promise<string> {
        let sOutput: string = '';
        let fieldCount: number = 0;
        const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)!;

        // next get the fields that are related entities and have the IncludeRelatedEntityNameFieldInBaseView flag set to true
        const qualifyingFields = entityFields.filter(f => f.RelatedEntityID && f.IncludeRelatedEntityNameFieldInBaseView);
        for (const ef of qualifyingFields) {
            const {nameField, nameFieldIsVirtual} = this.getIsNameFieldForSingleEntity(ef.RelatedEntity);
            if (nameField !== '') {
                // only add to the output, if we found a name field for the related entity.
                ef._RelatedEntityTableAlias = ef.RelatedEntityClassName + '_' + ef.Name;
                ef._RelatedEntityNameFieldIsVirtual = nameFieldIsVirtual;

                // This next section generates a field name for the new virtual field and makes sure it doesn't collide with a field in the base table
                const candidateName = this.stripID(ef.Name);
                // check to make sure candidateName is not already a field name in the base table (other than a virtual field of course, as that is what we're creating)
                // because if it is, we need to change it to something else
                const bFound = entityFields.find(f => f.IsVirtual === false && f.Name.trim().toLowerCase() === candidateName.trim().toLowerCase()) !== undefined;
                if (bFound)
                    ef._RelatedEntityNameFieldMap = candidateName + '_Virtual';
                else
                    ef._RelatedEntityNameFieldMap = candidateName;

                // now we have a safe field name alias for the new virtual field in the _RelatedEntityNameFieldMap property, so use it...
                sOutput += `${fieldCount === 0 ? '' : ','}\n    ${ef._RelatedEntityTableAlias}.[${nameField}] AS [${ef._RelatedEntityNameFieldMap}]`;

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
                fieldCount++;
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


    protected generateSPPermissions(entity: EntityInfo, spName: string, type: SPType): string {
        let sOutput: string = '';
        for (let i: number = 0; i < entity.Permissions.length; i++) {
            const ep: EntityPermissionInfo = entity.Permissions[i];
            if (
                    (type == SPType.Create && ep.CanCreate) ||
                    (type == SPType.Update && ep.CanUpdate) ||
                    (type == SPType.Delete && ep.CanDelete)
               ) {
                    if (ep.RoleSQLName && ep.RoleSQLName.length > 0) {
                        sOutput += (sOutput === '' ? `GRANT EXECUTE ON [${entity.SchemaName}].[${spName}] TO ` : ', ') + `[${ep.RoleSQLName}]`
                    }
               }
        }
        return (sOutput == '' ? '' : '\n') + sOutput;
    }

    protected generateFullTextSearchFunctionPermissions(entity: EntityInfo, functionName: string): string {
        let sOutput: string = '';
        for (let i: number = 0; i < entity.Permissions.length; i++) {
            const ep: EntityPermissionInfo = entity.Permissions[i];
            if (ep.CanRead) {
                if (ep.RoleSQLName && ep.RoleSQLName.length > 0) {
                    sOutput += (sOutput === '' ? `GRANT SELECT ON [${entity.SchemaName}].[${functionName}] TO ` : ', ') + `[${ep.RoleSQLName}]`;
                }
            }
        }
        return (sOutput == '' ? '' : '\n') + sOutput;
    }


    protected generateSPCreate(entity: EntityInfo): string {
        const spName: string = entity.spCreate ? entity.spCreate : `spCreate${entity.ClassName}`;
        const firstKey = entity.FirstPrimaryKey;

        //double exclamations used on the firstKey.DefaultValue property otherwise the type of this variable is 'number | ""';
        const primaryKeyAutomatic: boolean = firstKey.AutoIncrement; // Only exclude auto-increment fields, allow manual override for all other PKs including UUIDs with defaults
        const efString: string = this.createEntityFieldsParamString(entity.Fields, false); // Always pass false for isUpdate since this is generateSPCreate
        const permissions: string = this.generateSPPermissions(entity, spName, SPType.Create);

        let preInsertCode = '';
        let outputCode = '';
        let selectInsertedRecord = '';
        let additionalFieldList = '';
        let additionalValueList = '';
        if (entity.FirstPrimaryKey.AutoIncrement) {
            selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${entity.FirstPrimaryKey.Name}] = SCOPE_IDENTITY()`;
        } else if (entity.FirstPrimaryKey.Type.toLowerCase().trim() === 'uniqueidentifier' && entity.PrimaryKeys.length === 1) {
            // our primary key is a uniqueidentifier. Now we support optional override:
            // - If PKEY is provided (not NULL), use it
            // - If PKEY is NULL and there's a default value, let the database use it
            // - If PKEY is NULL and no default value, generate NEWID()

            const hasDefaultValue = entity.FirstPrimaryKey.DefaultValue && entity.FirstPrimaryKey.DefaultValue.trim().length > 0;
            
            if (hasDefaultValue) {
                // Has default value - use conditional logic to either include the field or let DB use default
                preInsertCode = `DECLARE @InsertedRow TABLE ([${entity.FirstPrimaryKey.Name}] UNIQUEIDENTIFIER)
    
    IF @${entity.FirstPrimaryKey.Name} IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${entity.SchemaName}].[${entity.BaseTable}]
            (
                [${entity.FirstPrimaryKey.Name}],
                ${this.createEntityFieldsInsertString(entity, entity.Fields, '', true)}
            )
        OUTPUT INSERTED.[${entity.FirstPrimaryKey.Name}] INTO @InsertedRow
        VALUES
            (
                @${entity.FirstPrimaryKey.Name},
                ${this.createEntityFieldsInsertString(entity, entity.Fields, '@', true)}
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${entity.SchemaName}].[${entity.BaseTable}]
            (
                ${this.createEntityFieldsInsertString(entity, entity.Fields, '', true)}
            )
        OUTPUT INSERTED.[${entity.FirstPrimaryKey.Name}] INTO @InsertedRow
        VALUES
            (
                ${this.createEntityFieldsInsertString(entity, entity.Fields, '@', true)}
            )
    END`;
                
                // Clear these as we're handling the INSERT in preInsertCode
                additionalFieldList = '';
                additionalValueList = '';
                outputCode = '';
                
                selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${entity.FirstPrimaryKey.Name}] = (SELECT [${entity.FirstPrimaryKey.Name}] FROM @InsertedRow)`;
            }
            else {
                // No default value - we calculate the ID upfront, so no need for OUTPUT clause
                preInsertCode = `DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@${entity.FirstPrimaryKey.Name}, NEWID())`;
                
                additionalFieldList = ',\n                [' + entity.FirstPrimaryKey.Name + ']';
                additionalValueList = ',\n                @ActualID';
                outputCode = ''; // No OUTPUT clause needed
                
                // We already know the ID, so just select using it directly
                selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${entity.FirstPrimaryKey.Name}] = @ActualID`;
            }
        } else {
            selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE `;
            let isFirst = true;
            for (let k of entity.PrimaryKeys) {
                if (!isFirst)
                    selectInsertedRecord += ' AND ';
                selectInsertedRecord += `[${k.Name}] = @${k.CodeName}`;
                isFirst = false;
            }
        }

        return `
------------------------------------------------------------
----- CREATE PROCEDURE FOR ${entity.BaseTable}
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${entity.SchemaName}].[${spName}]
GO

CREATE PROCEDURE [${entity.SchemaName}].[${spName}]
    ${efString}
AS
BEGIN
    SET NOCOUNT ON;
    ${preInsertCode}${preInsertCode.includes('INSERT INTO') ? '' : `
    INSERT INTO
    [${entity.SchemaName}].[${entity.BaseTable}]
        (
            ${this.createEntityFieldsInsertString(entity, entity.Fields, '')}${additionalFieldList}
        )
    ${outputCode}VALUES
        (
            ${this.createEntityFieldsInsertString(entity, entity.Fields, '@')}${additionalValueList}
        )`}
    -- return the new record from the base view, which might have some calculated fields
    ${selectInsertedRecord}
END
GO${permissions}
    `
    }


    protected generateUpdatedAtTrigger(entity: EntityInfo): string {
        const updatedAtField = entity.Fields.find(f => f.Name.toLowerCase().trim() === EntityInfo.UpdatedAtFieldName.toLowerCase().trim());
        if (!updatedAtField)
            return '';

        const triggerStatement = `
------------------------------------------------------------
----- TRIGGER FOR ${EntityInfo.UpdatedAtFieldName} field for the ${entity.BaseTable} table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${entity.SchemaName}].trgUpdate${entity.ClassName}
GO
CREATE TRIGGER [${entity.SchemaName}].trgUpdate${entity.ClassName}
ON [${entity.SchemaName}].[${entity.BaseTable}]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${entity.SchemaName}].[${entity.BaseTable}]
    SET
        ${EntityInfo.UpdatedAtFieldName} = GETUTCDATE()
    FROM
        [${entity.SchemaName}].[${entity.BaseTable}] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        ${entity.PrimaryKeys.map(k => `_organicTable.[${k.Name}] = I.[${k.Name}]`).join(' AND ')};
END;
GO`;
        return triggerStatement;
    }

    protected generateSPUpdate(entity: EntityInfo): string {
        const spName: string = entity.spUpdate ? entity.spUpdate : `spUpdate${entity.ClassName}`;
        const efParamString: string = this.createEntityFieldsParamString(entity.Fields, true);
        const permissions: string = this.generateSPPermissions(entity, spName, SPType.Update);
        const hasUpdatedAtField: boolean = entity.Fields.find(f => f.Name.toLowerCase().trim() === EntityInfo.UpdatedAtFieldName.trim().toLowerCase()) !== undefined;
        const updatedAtTrigger: string = hasUpdatedAtField ? this.generateUpdatedAtTrigger(entity) : '';
        let selectInsertedRecord = `SELECT
                                        *
                                    FROM
                                        [${entity.SchemaName}].[${entity.BaseView}]
                                    WHERE
                                        ${entity.PrimaryKeys.map(k => `[${k.Name}] = @${k.CodeName}`).join(' AND ')}
                                    `;

        return `
------------------------------------------------------------
----- UPDATE PROCEDURE FOR ${entity.BaseTable}
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${entity.SchemaName}].[${spName}]
GO

CREATE PROCEDURE [${entity.SchemaName}].[${spName}]
    ${efParamString}
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${entity.SchemaName}].[${entity.BaseTable}]
    SET
        ${this.createEntityFieldsUpdateString(entity.Fields)}
    WHERE
        ${entity.PrimaryKeys.map(k => `[${k.Name}] = @${k.CodeName}`).join(' AND ')}

    -- return the updated record so the caller can see the updated values and any calculated fields
    ${selectInsertedRecord}
END
GO
${permissions}
GO
${updatedAtTrigger}
        `
    }

    private __specialUUIDValue = '00000000-0000-0000-0000-000000000000';

    protected createEntityFieldsParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
        let sOutput: string = '', isFirst: boolean = true;
        for (let i: number = 0; i < entityFields.length; ++i) {
            const ef: EntityFieldInfo = entityFields[i];
            const autoGeneratedPrimaryKey: boolean = ef.AutoIncrement; // Only exclude auto-increment fields from params
            if (
                (ef.AllowUpdateAPI || (ef.IsPrimaryKey && isUpdate) || (ef.IsPrimaryKey && !autoGeneratedPrimaryKey && !isUpdate)) &&
                    !ef.IsVirtual &&
                (!ef.IsPrimaryKey || !autoGeneratedPrimaryKey || isUpdate) &&
                    !ef.IsSpecialDateField
              ) {
                if (!isFirst)
                    sOutput += ',\n    ';
                else
                    isFirst = false;

                // Check if we need a default value
                let defaultParamValue = '';
                if (!isUpdate && ef.IsPrimaryKey && !ef.AutoIncrement) {
                    // For primary keys (non-auto-increment), make them optional with NULL default
                    // This allows callers to omit the PK and let the DB/sproc handle it
                    defaultParamValue = ' = NULL';
                }
                sOutput += `@${ef.CodeName} ${ef.SQLFullType}${defaultParamValue}`;
            }
        }
        return sOutput;
    }

    protected createEntityFieldsInsertString(entity: EntityInfo, entityFields: EntityFieldInfo[], prefix: string, excludePrimaryKey: boolean = false): string {
        const autoGeneratedPrimaryKey = entity.FirstPrimaryKey.AutoIncrement; // Only exclude auto-increment PKs from insert
        let sOutput: string = '', isFirst: boolean = true;
        const filteredFields = entityFields.filter(f => f.AllowUpdateAPI);
        for (let i: number = 0; i < entityFields.length; ++i) {
            const ef: EntityFieldInfo = entityFields[i];
            const quotes: string = ef.NeedsQuotes ? "'" : "";
            // we only want fields that are (a) not primary keys, or if a pkey, not an auto-increment pkey and (b) not virtual fields and (c) updateable fields and (d) not auto-increment fields if they're not pkeys)
            // ALSO: if excludePrimaryKey is true, skip all primary key fields
            if ( (excludePrimaryKey && ef.IsPrimaryKey) || (ef.IsPrimaryKey && autoGeneratedPrimaryKey) || ef.IsVirtual || !ef.AllowUpdateAPI || ef.AutoIncrement) {
                continue; // skip this field
            }
            
            if (!isFirst)
                sOutput += ',\n                '
            else
                isFirst = false;

            if (prefix !== '' && ef.IsSpecialDateField) {
                if (ef.IsCreatedAtField || ef.IsUpdatedAtField)
                    sOutput += `GETUTCDATE()`; // we set the inserted row value to the current date for created and updated at fields
                else
                    sOutput += `NULL`; // we don't set the deleted at field on an insert, only on a delete
            }
            else if ((prefix && prefix !== '') && !ef.IsPrimaryKey && ef.IsUniqueIdentifier && ef.HasDefaultValue) {
                    // this is the VALUE side (prefix not null/blank), is NOT a primary key, and is a uniqueidentifier column, and has a default value specified
                    // in this situation we need to check if the value being passed in is the special value '00000000-0000-0000-0000-000000000000' (which is in __specialUUIDValue) if it is, we substitute it with the actual default value
                    // otherwise we use the value passed in
                    // next check to make sure ef.DefaultValue does not contain quotes around the value if it is a string type, if it does, we need to remove them
                    let defValue = ef.DefaultValue;
                    if (ef.TSType === EntityFieldTSType.String) {
                        if (defValue.startsWith("'") && defValue.endsWith("'")) {
                            defValue = defValue.substring(1, defValue.length - 1).trim(); // remove the quotes
                        }
                    }
                sOutput += `CASE @${ef.CodeName} WHEN '${this.__specialUUIDValue}' THEN ${quotes}${defValue}${quotes} ELSE @${ef.CodeName} END`;
            }
            else {
                let sVal: string = '';
                if (!prefix || prefix.length === 0)
                    sVal = '[' + ef.Name + ']'; // always put field names in brackets so that if reserved words are being used for field names in a table like "USER" and so on, they still work
                else
                    sVal = prefix + ef.CodeName;

                sOutput += sVal;
            }
        }
        return sOutput;
    }


    protected createEntityFieldsUpdateString(entityFields: EntityFieldInfo[]): string {
        let sOutput: string = '', isFirst: boolean = true;
        for (let i: number = 0; i < entityFields.length; ++i) {
            const ef: EntityFieldInfo = entityFields[i];
            if (!ef.IsPrimaryKey &&
                !ef.IsVirtual &&
                ef.AllowUpdateAPI &&
                !ef.AutoIncrement &&
                !ef.IsSpecialDateField) {
                if (!isFirst)
                    sOutput += ',\n        '
                else
                    isFirst = false;

                sOutput += `[${ef.Name}] = @${ef.CodeName}`; // always put field names in brackets for field names that have spaces or use reserved words. Also, we use CodeName for the param name, which is the field name unless it has spaces
            }
        }
        return sOutput;
    }


    protected generateSPDelete(entity: EntityInfo): string {
        const spName: string = entity.spDelete ? entity.spDelete : `spDelete${entity.ClassName}`;
        const sCascadeDeletes: string = this.generateCascadeDeletes(entity);
        const permissions: string = this.generateSPPermissions(entity, spName, SPType.Delete);
        let sVariables: string = '';
        let sSelect: string = '';
        for (let k of entity.PrimaryKeys) {
            if (sVariables !== '')
                sVariables += ', ';
            sVariables += `@${k.CodeName} ${k.SQLFullType}`;

            if (sSelect !== '')
                sSelect += ', ';
            sSelect += `@${k.CodeName} AS [${k.Name}]`;
        }

        // next up, create the delete code which is based on the type of delete the entity is set to
        // start off by creating the where clause first and then prepend the delete or update statement to it
        let deleteCode: string = `    WHERE
        ${entity.PrimaryKeys.map(k => `[${k.Name}] = @${k.CodeName}`).join(' AND ')}
`
        if (entity.DeleteType === 'Hard') {
            deleteCode =`    DELETE FROM
        [${entity.SchemaName}].[${entity.BaseTable}]
${deleteCode}`
        }
        else {
            deleteCode = `    UPDATE
        [${entity.SchemaName}].[${entity.BaseTable}]
    SET
        ${EntityInfo.DeletedAtFieldName} = GETUTCDATE()
${deleteCode}        AND ${EntityInfo.DeletedAtFieldName} IS NULL -- don't update the record if it's already been deleted via a soft delete`
        }

        return `
------------------------------------------------------------
----- DELETE PROCEDURE FOR ${entity.BaseTable}
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${entity.SchemaName}].[${spName}]
GO

CREATE PROCEDURE [${entity.SchemaName}].[${spName}]
    ${sVariables}
AS
BEGIN
    SET NOCOUNT ON;${sCascadeDeletes}

${deleteCode}

    SELECT ${sSelect} -- Return the primary key to indicate we successfully deleted the record
END
GO${permissions}
    `
    }

    protected generateCascadeDeletes(entity: EntityInfo): string {
        let sOutput: string = '';
        if (entity.CascadeDeletes) {
            const md = new Metadata();

            // we need to find all of the fields in other entities that are foreign keys to this entity
            // and generate DELETE statements for those tables
            for (let i: number = 0; i < md.Entities.length; ++i) {
                const e = md.Entities[i];
                for (let j: number = 0; j < e.Fields.length; ++j) {
                    const ef = e.Fields[j];
                    if (ef.RelatedEntityID === entity.ID && ef.IsVirtual === false) {
                        let sql: string = '';
                        if (ef.AllowsNull === false) {
                            // we have a non-virtual field that is a foreign key to this entity
                            // and only those that are non-null. If they allow null we want to UPDATE those rows to be null
                            // so we need to generate a DELETE statement for that table
                            sql = `
    -- Cascade delete from ${e.BaseTable}
    DELETE FROM
        [${e.SchemaName}].[${e.BaseTable}]
    WHERE
        [${ef.CodeName}] = @${entity.FirstPrimaryKey.CodeName}`;
                        }
                        else {
                            // we have a non-virtual field that is a foreign key to this entity
                            // and this field ALLOWS nulls, which means we don't delete the rows, we just update them to be null
                            // so they don't have an orphaned foreign key
                            sql = `
    -- Cascade update on ${e.BaseTable} - set FK to null before deleting rows in ${entity.BaseTable}
    UPDATE
        [${e.SchemaName}].[${e.BaseTable}]
    SET
        [${ef.CodeName}] = NULL
    WHERE
        [${ef.CodeName}] = @${entity.FirstPrimaryKey.CodeName}`;
                        }
                        if (sOutput !== '')
                            sOutput += '\n    ';
                        sOutput += sql;
                    }
                }
            }
        }
        return sOutput === '' ? '' : `${sOutput}\n    `;
    }
}
