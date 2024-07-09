import { EntityInfo, EntityFieldInfo, EntityPermissionInfo, Metadata } from '@memberjunction/core';
import { logError, logStatus } from '../Misc/logging';
import * as fs from 'fs';
import path from 'path';

import { SQLUtilityBase } from './sql';
import { DataSource } from 'typeorm';
import { configInfo, customSqlScripts, dbDatabase } from '../Config/config';
import { ManageMetadataBase } from './manage-metadata';

import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { combineFiles } from '../Misc/util';
import { EntityEntity } from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass } from '@memberjunction/global';


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
@RegisterClass(SQLCodeGenBase)
export class SQLCodeGenBase {
    protected _sqlUtilityObject: SQLUtilityBase = MJGlobal.Instance.ClassFactory.CreateInstance<SQLUtilityBase>(SQLUtilityBase);
    public get SQLUtilityObject(): SQLUtilityBase {
        return this._sqlUtilityObject;
    }

    public async manageSQLScriptsAndExecution(ds: DataSource, entities: EntityInfo[], directory: string): Promise<boolean> {
        try {
            // STEP 1 - execute any custom SQL scripts for object creation that need to happen first - for example, if 
            //          we have custom base views, need to have them defined before we do 
            //          the rest as the generated stuff might use custom base views in compiled 
            //          objects like spCreate for a given entity might reference the vw for that entity
            const startTime: Date = new Date();
            if (! await this.runCustomSQLScripts(ds, 'before-sql'))
                return false;
            logStatus(`   Time to run custom SQL scripts: ${(new Date().getTime() - startTime.getTime())/1000} seconds`);
    
            // ALWAYS use the first filter where we only include entities that have IncludeInAPI = 1
            const baselineEntities = entities.filter(e => e.IncludeInAPI);
            const includedEntities = baselineEntities.filter(e => configInfo.excludeSchemas.find(s => s.toLowerCase() === e.SchemaName.toLowerCase()) === undefined); //only include entities that are NOT in the excludeSchemas list
            const excludedEntities = baselineEntities.filter(e => configInfo.excludeSchemas.find(s => s.toLowerCase() === e.SchemaName.toLowerCase()) !== undefined); //only include entities that ARE in the excludeSchemas list in this array
    
            // STEP 2(a) - generate all the SQL files and execute them
            const step2StartTime: Date = new Date();
            if (! await this.generateAndExecuteEntitySQLToSeparateFiles(ds, includedEntities, directory, false)) {  
                logError('Error generating and executing all entities SQL to separate files');
                return false;
            }
    
            // STEP 2(b) - for the excludedEntities, while we don't want to generate SQL, we do want to generate the permissions files for them
            if (! await this.generateAndExecuteEntitySQLToSeparateFiles(ds, excludedEntities, directory, true)) {
                logError('Error generating and executing permissions SQL for excluded entities to separate files');
                return false;
            }
            logStatus(`   Time to Generate/Execute Entity SQL: ${(new Date().getTime() - step2StartTime.getTime())/1000} seconds`);
    
            // now that we've generated the SQL, let's create a combined file in each schema sub-directory for convenience for a DBA
            this.createCombinedEntitySQLFiles(directory, baselineEntities);
                    
            const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)
            // STEP 3 - re-run the process to manage entity fields since the Step 1 and 2 above might have resulted in differences in base view columns compared to what we had at first
            if (! await manageMD.manageEntityFields(ds, configInfo.excludeSchemas, true)) {
                logError('Error managing entity fields');
                return false;
            }
            // no logStatus/timer for this because manageEntityFields() has its own internal logging for this including the total, so it is redundant to log it here
    
            // STEP 4- Apply permissions, executing all .permissions files
            const step4StartTime: Date = new Date();
            if (! await this.applyPermissions(ds, directory, baselineEntities)) {
                logError('Error applying permissions');
                return false;
            }
            logStatus(`   Time to Apply Permissions: ${(new Date().getTime() - step4StartTime.getTime())/1000} seconds`);
    
            // STEP 5 - execute any custom SQL scripts that should run afterwards
            const step5StartTime: Date = new Date();
            if (! await this.runCustomSQLScripts(ds, 'after-sql'))
                return false;
    
            logStatus(`   Time to run custom SQL scripts: ${(new Date().getTime() - step5StartTime.getTime())/1000} seconds`);
    
            logStatus('   Total time to run generate and execute SQL scripts: ' + ((new Date().getTime() - startTime.getTime())/1000) + ' seconds');
    
            // now - we need to tell our metadata object to refresh itself
            const md = new Metadata();
            await md.Refresh();
            
            return true;
        }
        catch (err) {
            logError(err);
            return false;
        }
    }
    
    public async runCustomSQLScripts(ds: DataSource, when: string): Promise<boolean> {
        try {
            const scripts = customSqlScripts(when);
            let bSuccess: boolean = true;
    
            if (scripts) {
                for (let i = 0; i < scripts.length; ++i) {
                    const s = scripts[i];
                    if (! await this.SQLUtilityObject.executeSQLFile(ds, s.scriptFile, true)) {
                        logError(`Error executing custom '${when}' SQL script ${s.scriptFile}`);
                        bSuccess = false; // keep going if we have more scripts, but make sure we return false
                    }
                }
            }
    
            return bSuccess;
        }
        catch (e) {
            logError(e);
            return false;
        }
    }
    
    
    public async applyPermissions(ds: DataSource, directory: string, entities: EntityInfo[], batchSize: number = 5): Promise<boolean> {
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
                            if (!await this.SQLUtilityObject.executeSQLFile(ds, fullPath, true))
                                innerSuccess = false; // we keep going, just note that something failed
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
            logError(err);
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
    public async generateAndExecuteEntitySQLToSeparateFiles(ds: DataSource, entities: EntityInfo[], directory: string, onlyPermissions: boolean, writeFiles: boolean = true, batchSize: number = 5): Promise<boolean> {
        try {
            let bFail: boolean = false;
            const totalEntities = entities.length;
    
            for (let i = 0; i < totalEntities; i += batchSize) {
                const batch = entities.slice(i, i + batchSize);
                const promises = batch.map(async (e) => {
                    const pkeyField = e.Fields.find(f => f.IsPrimaryKey)
                    if (!pkeyField) {
                        logError(`SKIPPING ENTITY: Entity ${e.Name}, because it does not have a primary key field defined. A table must have a primary key defined to quality to be a MemberJunction entity`);
                        return false;
                    }
                    return this.generateAndExecuteSingleEntitySQLToSeparateFiles(ds, e, directory, onlyPermissions, writeFiles);
                });
    
                const results = await Promise.all(promises);
                if (results.includes(false)) {
                    bFail = true; // keep going, but will return false at the end
                }
            }
    
            return !bFail;
        }
        catch (err) {
            logError(err);
            return false;
        }
    }
    
    public async createCombinedEntitySQLFiles(directory: string, entities: EntityInfo[]) {
        // first, get a disinct list of schemanames from the entities
        const schemaNames = entities.map(e => e.SchemaName).filter((value, index, self) => self.indexOf(value) === index);
        for (const s of schemaNames) {
            // generate the all-entities.sql file and all-entities.permissions.sql file in each schema folder
            const fullPath = path.join(directory, s);
            if (fs.statSync(fullPath).isDirectory()) {
                combineFiles(fullPath, '_all_entities.sql', '*.generated.sql', true);
                combineFiles(fullPath, '_all_entities.permissions.sql', '*.permissions.generated.sql', true);
            }
        }
    }
    
    
    
    public async generateAndExecuteSingleEntitySQLToSeparateFiles(ds: DataSource, entity: EntityInfo, directory: string, onlyPermissions: boolean, writeFiles: boolean = true): Promise<boolean> {
        try {
            const {sql, permissionsSQL} = await this.generateSingleEntitySQLToSeparateFiles(ds, entity, directory, onlyPermissions, writeFiles); // this creates the files and returns a single string with all the SQL we can then execute
            return await this.SQLUtilityObject.executeSQLScript(ds, sql, true) && 
                   await this.SQLUtilityObject.executeSQLScript(ds, permissionsSQL, true);
        }
        catch (err) {
            logError(err);
            return false;
        }
    }
    
    public async generateSingleEntitySQLToSeparateFiles(ds: DataSource, entity: EntityInfo, directory: string, onlyPermissions: boolean, writeFiles: boolean = true): Promise<{sql: string, permissionsSQL: string}> {
        try {
            // create the directory if it doesn't exist
            if (writeFiles && !fs.existsSync(directory))
                fs.mkdirSync(directory, { recursive: true }); 
    
            // now do the same thing for the /schema directory within the provided directory
            const schemaDirectory = path.join(directory, entity.SchemaName);
            if (writeFiles && !fs.existsSync(schemaDirectory))
                fs.mkdirSync(schemaDirectory, { recursive: true }); // create the directory if it doesn't exist
    
            let sRet: string = ''
            let permissionsSQL: string = ''
            // BASE VIEW  
            if (!onlyPermissions && entity.BaseViewGenerated && !entity.VirtualEntity) {
                // generate the base view
                const s = this.generateSingleEntitySQLFileHeader(entity,entity.BaseView) + await this.generateBaseView(ds, entity)
                const filePath = path.join(directory, this.SQLUtilityObject.getDBObjectFileName('view', entity.SchemaName, entity.BaseView, false, true));
                if (writeFiles)
                    fs.writeFileSync(filePath, s)
                sRet += s + '\nGO\n';
            }
            // always generate permissions for the base view
            const s = this.generateSingleEntitySQLFileHeader(entity, 'Permissions for ' + entity.BaseView) + this.generateViewPermissions(entity)
            if (s.length > 0) 
                permissionsSQL += s + '\nGO\n'; 
            if (writeFiles)
                fs.writeFileSync(path.join(directory, this.SQLUtilityObject.getDBObjectFileName('view', entity.SchemaName, entity.BaseView, true, true)), s)
    
            // now, append the permissions to the return string IF we did NOT generate the base view - because if we generated the base view, that
            // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
            if (!entity.BaseViewGenerated)
                sRet += s + '\nGO\n';
    
            // CREATE SP
            if (entity.AllowCreateAPI && !entity.VirtualEntity) {
                const spName: string = this.getSPName(entity, SPType.Create);
                if (!onlyPermissions && entity.spCreateGenerated) {
                    // generate the create SP
                    const s = this.generateSingleEntitySQLFileHeader(entity, spName) + this.generateSPCreate(entity)
                    if (writeFiles)
                        fs.writeFileSync(path.join(directory, this.SQLUtilityObject.getDBObjectFileName('sp', entity.SchemaName, spName, false, true)), s)
                    sRet += s + '\nGO\n';
                }
                const s = this.generateSPPermissions(entity, spName, SPType.Create) + '\n\n';           
                if (s.length > 0) 
                    permissionsSQL += s + '\nGO\n'; 
                if (writeFiles)
                    fs.writeFileSync(path.join(directory, this.SQLUtilityObject.getDBObjectFileName('sp', entity.SchemaName, spName, true, true)), s)
    
                // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!entity.spCreateGenerated)
                    sRet += s + '\nGO\n';
            }
    
            // UPDATE SP
            if (entity.AllowUpdateAPI && !entity.VirtualEntity) {
                const spName: string = this.getSPName(entity, SPType.Update);
                if (!onlyPermissions && entity.spUpdateGenerated) {
                    // generate the update SP
                    const s = this.generateSingleEntitySQLFileHeader(entity, spName) + this.generateSPUpdate(entity)
                    if (writeFiles)
                        fs.writeFileSync(path.join(directory, this.SQLUtilityObject.getDBObjectFileName('sp', entity.SchemaName, spName, false, true)), s)    
                    sRet += s + '\nGO\n';
                }
                const s = this.generateSPPermissions(entity, spName, SPType.Update) + '\n\n';
                if (s.length > 0) 
                    permissionsSQL += s + '\nGO\n';     
                if (writeFiles)
                    fs.writeFileSync(path.join(directory, this.SQLUtilityObject.getDBObjectFileName('sp', entity.SchemaName, spName, true, true)), s)
    
                // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!entity.spUpdateGenerated)
                    sRet += s + '\nGO\n';
            }
    
            // DELETE SP
            if (entity.AllowDeleteAPI && !entity.VirtualEntity) {
                const spName: string = this.getSPName(entity, SPType.Delete);
                if (!onlyPermissions && entity.spDeleteGenerated) {
                    // generate the delete SP
                    const s = this.generateSingleEntitySQLFileHeader(entity, spName) + this.generateSPDelete(entity)
                    if (writeFiles)
                        fs.writeFileSync(path.join(directory, this.SQLUtilityObject.getDBObjectFileName('sp', entity.SchemaName, spName, false, true)), s)
                    sRet += s + '\nGO\n';
                }
                const s = this.generateSPPermissions(entity, spName, SPType.Delete) + '\n\n';
                if (s.length > 0) 
                    permissionsSQL += s + '\nGO\n';     
                if (writeFiles)
                    fs.writeFileSync(path.join(directory, this.SQLUtilityObject.getDBObjectFileName('sp', entity.SchemaName, spName, true, true)), s)
    
                // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!entity.spDeleteGenerated)
                    sRet += s + '\nGO\n';
            }
    
            // check to see if the entity supports full text search or not
            if (entity.FullTextSearchEnabled) {
                // always generate the code so we can get the function name from the below function call
                const ft = await this.generateEntityFullTextSearchSQL(ds, entity);
                if (!onlyPermissions) {
                    // only write the actual sql out if we're not only generating permissions
                    const filePath = path.join(directory, this.SQLUtilityObject.getDBObjectFileName('full_text_search_function', entity.SchemaName, entity.BaseTable, false, true));
                    if (writeFiles)
                        fs.writeFileSync(filePath, ft.sql)
                    sRet += ft.sql + '\nGO\n';
                }
    
                const sP = this.generateFullTextSearchFunctionPermissions(entity, ft.functionName) + '\n\n';
                if (sP.length > 0) 
                    permissionsSQL += sP + '\nGO\n'; 
    
                const filePath = path.join(directory, this.SQLUtilityObject.getDBObjectFileName('full_text_search_function', entity.SchemaName, entity.BaseTable, true, true));
                if (writeFiles)
                    fs.writeFileSync(filePath, sP)
                
                // now, append the permissions to the return string IF we did NOT generate the function - because if we generated the function, that
                // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
                if (!entity.FullTextSearchFunctionGenerated)
                    sRet += sP + '\nGO\n';
            }
    
            return {sql: sRet, permissionsSQL: permissionsSQL};
        }
        catch (err) {
            logError(err)
            return null
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
    
    
    public async generateEntitySQL(ds: DataSource, entity: EntityInfo): Promise<string> {
        let sOutput: string = ''
        if (entity.BaseViewGenerated && !entity.VirtualEntity) 
            // generated the base view (will include permissions)
            sOutput += await this.generateBaseView(ds, entity) + '\n\n';
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
            sOutput += await this.generateEntityFullTextSearchSQL(ds, entity) + '\n\n';
        }
        return sOutput
    }
    
    async generateEntityFullTextSearchSQL(ds: DataSource, entity: EntityInfo): Promise<{sql: string, functionName: string}> {
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
            const entity_pk_name = await this.getEntityPrimaryKeyIndexName(ds, entity);
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
    
    async getEntityPrimaryKeyIndexName(ds: DataSource, entity: EntityInfo): Promise<string> {
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
        const result = await ds.query(sSQL);
        if (result && result.length > 0)
            return result[0].IndexName;
        else
            throw new Error(`Could not find primary key index for entity ${entity.Name}`);
    }
    
    public generateAllEntitiesSQLFileHeader(): string {
        return `-----------------------------------------------------------------
-- SQL Code Generation for Entities
-- Generated: ${new Date().toLocaleString()}
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
-- Generated: ${new Date().toLocaleString()}
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
`
    }
    
    async generateBaseView(ds: DataSource, entity: EntityInfo): Promise<string> {
        const viewName: string = entity.BaseView ? entity.BaseView : `vw${entity.CodeName}`;
        const baseTableFirstChar: string = entity.BaseTable.charAt(0).toLowerCase();
        const relatedFieldsString: string = await this.generateBaseViewRelatedFieldsString(ds, entity.Fields);
        const relatedFieldsJoinString: string = this.generateBaseViewJoins(entity.Fields);
        const permissions: string = this.generateViewPermissions(entity);
        const whereClause: string = entity.DeleteType === 'Soft' ? `WHERE 
    ${baseTableFirstChar}.[${EntityInfo.DeletedAtFieldName}] IS NULL
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
    ${baseTableFirstChar}.*${relatedFieldsString.length > 0 ? ',' : ''}${relatedFieldsString}
FROM
    [${entity.SchemaName}].[${entity.BaseTable}] AS ${baseTableFirstChar}${relatedFieldsJoinString ? '\n' + relatedFieldsJoinString : ''}
${whereClause}GO${permissions}
    `
    }
    
    protected generateViewPermissions(entity: EntityInfo): string {
        let sOutput: string = '';
        for (let i: number = 0; i < entity.Permissions.length; i++) {
            const ep: EntityPermissionInfo = entity.Permissions[i];
            sOutput += (sOutput == '' ? `GRANT SELECT ON [${entity.SchemaName}].[${entity.BaseView}] TO ` : ', ') + `[${ep.RoleSQLName}]`
        }
        return (sOutput == '' ? '' : '\n') + sOutput;
    }
    
    protected generateBaseViewJoins(entityFields: EntityFieldInfo[]): string {
        let sOutput: string = '';
        for (let i: number = 0; i < entityFields.length; i++) { 
            const ef: EntityFieldInfo = entityFields[i];
            if (ef.RelatedEntityID && ef.IncludeRelatedEntityNameFieldInBaseView && ef._RelatedEntityTableAlias) {
                sOutput += sOutput == '' ? '' : '\n';
                sOutput += `${ef.AllowsNull ? 'LEFT OUTER' : 'INNER' } JOIN\n    ${ef._RelatedEntityNameFieldIsVirtual ? '' : '[' + ef.RelatedEntitySchemaName + '].'}[${ef._RelatedEntityNameFieldIsVirtual ? ef.RelatedEntityBaseView : ef.RelatedEntityBaseTable}] AS ${ef._RelatedEntityTableAlias}\n  ON\n    [${ef.Entity.charAt(0).toLowerCase()}].[${ef.Name}] = ${ef._RelatedEntityTableAlias}.[${ef.RelatedEntityFieldName}]`;
            }
        }
        return sOutput;
    }
    
    async generateBaseViewRelatedFieldsString(ds: DataSource, entityFields: EntityFieldInfo[]): Promise<string> {
        let sOutput: string = '';
        let fieldCount: number = 0;
        const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)
        for (let i: number = 0; i < entityFields.length; i++) { 
            const ef: EntityFieldInfo = entityFields[i];
            if (ef.RelatedEntityID && ef.IncludeRelatedEntityNameFieldInBaseView) {
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
                    sOutput += `${fieldCount == 0 ? '' : ','}\n    ${ef._RelatedEntityTableAlias}.[${nameField}] AS [${ef._RelatedEntityNameFieldMap}]`;
    
                    // check to see if the database already knows about the RelatedEntityNameFieldMap or not
                    if (ef.RelatedEntityNameFieldMap === null || 
                        ef.RelatedEntityNameFieldMap === undefined || 
                        ef.RelatedEntityNameFieldMap.trim().length === 0) {
                        // the database doesn't yet know about this RelatedEntityNameFieldMap, so we need to update it
                        // first update the actul field in the metadata object so it can be used from this point forward
                        // and it also reflects what the DB will hold
                        ef.RelatedEntityNameFieldMap = ef._RelatedEntityNameFieldMap;
                        // then update the database itself
                        await manageMD.updateEntityFieldRelatedEntityNameFieldMap(ds, ef.ID, ef.RelatedEntityNameFieldMap);
                    }
                    fieldCount++;
                }
            }
        }
        return sOutput;
    }
    
    protected getIsNameFieldForSingleEntity(entityName: string): {nameField: string, nameFieldIsVirtual: boolean} {
        const md: Metadata = new Metadata(); // use the full metadata entity list, not the filtered version that we receive
        const e: EntityInfo = md.Entities.find(e => e.Name === entityName);
        if (e) {
            const ef: EntityFieldInfo = e.NameField;
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
               )
                sOutput += (sOutput == '' ? `GRANT EXECUTE ON [${entity.SchemaName}].[${spName}] TO ` : ', ') + `[${ep.RoleSQLName}]`
        }
        return (sOutput == '' ? '' : '\n') + sOutput;
    }
    
    protected generateFullTextSearchFunctionPermissions(entity: EntityInfo, functionName: string): string {
        let sOutput: string = '';
        for (let i: number = 0; i < entity.Permissions.length; i++) {
            const ep: EntityPermissionInfo = entity.Permissions[i];
            if (ep.CanRead)
                sOutput += (sOutput == '' ? `GRANT SELECT ON [${entity.SchemaName}].[${functionName}] TO ` : ', ') + `[${ep.RoleSQLName}]`
        }
        return (sOutput == '' ? '' : '\n') + sOutput;
    }
    
    
    protected generateSPCreate(entity: EntityInfo): string {
        const spName: string = entity.spCreate ? entity.spCreate : `spCreate${entity.ClassName}`;
        const firstKey = entity.FirstPrimaryKey;
        const primaryKeyAutomatic: boolean = firstKey.AutoIncrement || (firstKey.Type.toLowerCase().trim() === 'uniqueidentifier' && firstKey.DefaultValue && firstKey.DefaultValue.trim().length > 0);
        const efString: string = this.createEntityFieldsParamString(entity.Fields, !primaryKeyAutomatic);
        const permissions: string = this.generateSPPermissions(entity, spName, SPType.Create);
    
        let preInsertCode = '';
        let outputCode = '';
        let selectInsertedRecord = '';
        let additionalFieldList = '';
        let additionalValueList = '';
        if (entity.FirstPrimaryKey.AutoIncrement) {
            selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${entity.FirstPrimaryKey.Name}] = SCOPE_IDENTITY()`;
        } else if (entity.FirstPrimaryKey.Type.toLowerCase().trim() === 'uniqueidentifier') {
            // our primary key is a uniqueidentifier. Two scenarios exist for this:
            // 1) The default value is specified in the database (usually either NEWID() or NEWSEQUENTIALID()). 
            // 2) No default value is specified, so we need to generate a new GUID in the stored procedure using NEWID() --- NewSequentialID() is not allowed in a stored procedure, only usable as a default value.

            // so, first check to see if there is a default value for the field or not
            const hasDefaultValue = entity.FirstPrimaryKey.DefaultValue && entity.FirstPrimaryKey.DefaultValue.trim().length > 0;
            // if we have a default value, then we do NOT want to insert a new value, let the database use the default
            if (hasDefaultValue) {
                // in this situation, we DO have a default value, so we do NOT insert a new value, we let the database use the default
                // however, we need to do some extra preprocessing to use the OUTPUT from the INSERT statement and return the record that was
                // just created, that is how we get the newly created GUID that was the default value
                preInsertCode = `DECLARE @InsertedRow TABLE ([${entity.FirstPrimaryKey.Name}] UNIQUEIDENTIFIER)`;
                outputCode = `OUTPUT INSERTED.[${entity.FirstPrimaryKey.Name}] INTO @InsertedRow
    `
                selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${entity.FirstPrimaryKey.Name}] = (SELECT [${entity.FirstPrimaryKey.Name}] FROM @InsertedRow)`;    
            }
            else {
                // we have no default value, so we use NEWID() to generate a new GUID and we manually insert it into the table
                // as part of the sproc
                preInsertCode = `DECLARE @newId UNIQUEIDENTIFIER = NEWID();\n    SET @${entity.FirstPrimaryKey.Name} = @newId;\n`;

                additionalFieldList = ',\n            [' + entity.FirstPrimaryKey.Name + ']';
                additionalValueList = ',\n            @newId';
        
                selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${entity.FirstPrimaryKey.Name}] = @newId`;    
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
    ${preInsertCode}
    INSERT INTO 
    [${entity.SchemaName}].[${entity.BaseTable}]
        (
            ${this.createEntityFieldsInsertString(entity, entity.Fields, '')}${additionalFieldList}
        )
    ${outputCode}VALUES
        (
            ${this.createEntityFieldsInsertString(entity, entity.Fields, '@')}${additionalValueList}
        )
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
    
    protected createEntityFieldsParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
        let sOutput: string = '', isFirst: boolean = true;
        for (let i: number = 0; i < entityFields.length; ++i) {
            const ef: EntityFieldInfo = entityFields[i];
            const autoGeneratedPrimaryKey: boolean = ef.AutoIncrement || ef.Type.toLowerCase().trim() === 'uniqueidentifier';
            if (
              (ef.AllowUpdateAPI || (ef.IsPrimaryKey && isUpdate)) &&
              !ef.IsVirtual &&
              (!ef.IsPrimaryKey || !autoGeneratedPrimaryKey || isUpdate) &&
              !ef.IsSpecialDateField ) {
              if (!isFirst) 
                sOutput += ',\n    ';
              else 
                isFirst = false;

              sOutput += `@${ef.CodeName} ${ef.SQLFullType}`;
            }
        }
        return sOutput;
    }
    
    protected createEntityFieldsInsertString(entity: EntityInfo, entityFields: EntityFieldInfo[], prefix: string): string {
        const autoGeneratedPrimaryKey = entity.FirstPrimaryKey.AutoIncrement || entity.FirstPrimaryKey.Type.toLowerCase().trim() === 'uniqueidentifier';
        let sOutput: string = '', isFirst: boolean = true;
        for (let i: number = 0; i < entityFields.length; ++i) {
            const ef: EntityFieldInfo = entityFields[i];
            if ((!ef.IsPrimaryKey || !autoGeneratedPrimaryKey) && 
                ef.IsVirtual === false && 
                ef.AllowUpdateAPI && 
                ef.AutoIncrement === false) {
                if (!isFirst) 
                    sOutput += ',\n            '
                else
                    isFirst = false;
    
                if (prefix !== '' && ef.IsSpecialDateField) {
                    if (ef.IsCreatedAtField || ef.IsUpdatedAtField)
                        sOutput += `GETUTCDATE()`; // we set the inserted row value to the current date for created and updated at fields
                    else
                        sOutput += `NULL`; // we don't set the deleted at field on an insert, only on a delete
                }
                else {
                    let sVal = prefix + (prefix !== '' ? ef.CodeName : ef.Name); // if we have a prefix, then we need to use the CodeName, otherwise we use the actual field name
                    if (!prefix || prefix.length === 0)
                        sVal = '[' + sVal + ']'; // always put field names in brackets so that if reserved words are being used for field names in a table like "USER" and so on, they still work
    
                    sOutput += sVal;
                }
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