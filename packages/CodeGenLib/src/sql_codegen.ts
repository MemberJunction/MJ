import { EntityInfo, EntityFieldInfo, EntityPermissionInfo, Metadata } from '@memberjunction/core';
import { logError, logStatus } from './logging';
import * as fs from 'fs';
import path from 'path';

import { executeSQLFile, executeSQLScript } from './sql';
import { DataSource } from 'typeorm';
import { configInfo, customSqlScripts, dbDatabase } from './config';
import { manageEntityFields, updateEntityFieldRelatedEntityNameFieldMap } from './manageMetadata';

import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { combineFiles } from './util';
import { EntityEntity } from '@memberjunction/core-entities';
//import { LoadGeneratedEntities } from 'mj_generatedentities';
//LoadGeneratedEntities(); // make sure we have everything loaded up

export async function manageSQLScriptsAndExecution(ds: DataSource, entities: EntityInfo[], directory: string): Promise<boolean> {
    try {
        // STEP 1 - execute any custom SQL scripts for object creation that need to happen first - for example, if 
        //          we have custom base views, need to have them defined before we do 
        //          the rest as the generated stuff might use custom base views in compiled 
        //          objects like spCreate for a given entity might reference the vw for that entity
        const startTime: Date = new Date();
        if (! await runCustomSQLScripts(ds, 'before-sql'))
            return false;
        logStatus(`   Time to run custom SQL scripts: ${(new Date().getTime() - startTime.getTime())/1000} seconds`);

        // ALWAYS use the first filter where we only include entities that have IncludeInAPI = 1
        const includedEntities = entities.filter(e => e.IncludeInAPI).filter(e => configInfo.excludeSchemas.find(s => s.toLowerCase() === e.SchemaName.toLowerCase()) === undefined); //only include entities that are NOT in the excludeSchemas list
        const excludedEntities = entities.filter(e => e.IncludeInAPI).filter(e => configInfo.excludeSchemas.find(s => s.toLowerCase() === e.SchemaName.toLowerCase()) !== undefined); //only include entities that ARE in the excludeSchemas list in this array

        // STEP 2(a) - generate all the SQL files and execute them
        const step2StartTime: Date = new Date();
        if (! await generateAndExecuteAllEntitiesSQLToSeparateFiles(ds, includedEntities, directory, false, false)) { // pass in false for createCombinedFile because we don't want to create the combined file yet, we want to do that after we've done the excluded entities below for their permissions SQL, no need to do it twice, waste of resources.
            logError('Error generating and executing all entities SQL to separate files');
            return false;
        }

        // STEP 2(b) - for the excludedEntities, while we don't want to generate SQL, we do want to generate the permissions files for them
        if (! await generateAndExecuteAllEntitiesSQLToSeparateFiles(ds, excludedEntities, directory, true, true)) {
            logError('Error generating and executing permissions SQL for excluded entities to separate files');
            return false;
        }
        logStatus(`   Time to Generate/Execute Entity SQL: ${(new Date().getTime() - step2StartTime.getTime())/1000} seconds`);
        
        // STEP 3 - re-run the process to manage entity fields since the Step 1 and 2 above might have resulted in differences in base view columns compared to what we had at first
        if (! await manageEntityFields(ds)) {
            logError('Error managing entity fields');
            return false;
        }
        // no logStatus/timer for this because manageEntityFields() has its own internal logging for this including the total, so it is redundant to log it here

        // STEP 4- Apply permissions, executing all .permissions files
        const step4StartTime: Date = new Date();
        if (! await applyPermissions(ds, directory)) {
            logError('Error applying permissions');
            return false;
        }
        logStatus(`   Time to Apply Permissions: ${(new Date().getTime() - step4StartTime.getTime())/1000} seconds`);

        // STEP 5 - execute any custom SQL scripts that should run afterwards
        const step5StartTime: Date = new Date();
        if (! await runCustomSQLScripts(ds, 'after-sql'))
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

export async function runCustomSQLScripts(ds: DataSource, when: string): Promise<boolean> {
    try {
        const scripts = customSqlScripts(when);
        let bSuccess: boolean = true;

        if (scripts) {
            for (let i = 0; i < scripts.length; ++i) {
                const s = scripts[i];
                if (! await executeSQLFile(ds, s.scriptFile, true)) {
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


export async function applyPermissions(ds: DataSource, directory: string, batchSize: number = 5): Promise<boolean> {
    try {
        let bSuccess = true;
        const files = fs.readdirSync(directory);
        const permissionsFiles = files.filter(file => file.includes('.permissions.'));

        for (let i = 0; i < permissionsFiles.length; i += batchSize) {
            const batch = permissionsFiles.slice(i, i + batchSize);
            const promises = batch.map(async (f) => {
                return executeSQLFile(ds, path.join(directory, f), true);
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



export async function generateAndExecuteAllEntitiesSQLToSeparateFiles(ds: DataSource, entities: EntityInfo[], directory: string, onlyPermissions: boolean, createCombinedFile: boolean, batchSize: number = 5): Promise<boolean> {
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
                return generateAndExecuteSingleEntitySQLToSeparateFiles(ds, e, directory, onlyPermissions);
            });

            const results = await Promise.all(promises);
            if (results.includes(false)) {
                bFail = true; // keep going, but will return false at the end
            }
        }

        if (!createCombinedFile) {
            return !bFail;
        }
        else {
            // caller wants a combined file created from the output of everything in the directory, so create it here
            if (!bFail) {
                // generate the all-entities.sql file and all-entities.permissions.sql file
                combineFiles(directory, '_all_entities.sql', '*.generated.sql', true);
                combineFiles(directory, '_all_entities.permissions.sql', '*.permissions.generated.sql', true);
                return true;
            }
            else 
                return false;
        }
    }
    catch (err) {
        logError(err);
        return false;
    }
}



export async function generateAndExecuteSingleEntitySQLToSeparateFiles(ds: DataSource, entity: EntityInfo, directory: string, onlyPermissions: boolean): Promise<boolean> {
    try {
        const sSQL = await generateSingleEntitySQLToSeparateFiles(ds, entity, directory, onlyPermissions); // this creates the files and returns a single string with all the SQL we can then execute
        return await executeSQLScript(ds, sSQL, true)
    }
    catch (err) {
        logError(err);
        return false;
    }
}

export async function generateSingleEntitySQLToSeparateFiles(ds: DataSource, entity: EntityInfo, directory: string, onlyPermissions: boolean): Promise<string> {
    try {
        if (!fs.existsSync(directory))
            fs.mkdirSync(directory, { recursive: true }); // create the directory if it doesn't exist

        let sRet: string = ''
        // BASE VIEW  
        if (!onlyPermissions && entity.BaseViewGenerated && !entity.VirtualEntity) {
            // generate the base view
            const s = generateSingleEntitySQLFileHeader(entity,entity.BaseView) + await generateBaseView(ds, entity)
            fs.writeFileSync(directory + `/${entity.BaseView}.generated.sql`, s)
            sRet += s + '\nGO\n';
        }
        // always generate permissions for the base view
        const s = generateSingleEntitySQLFileHeader(entity, 'Permissions for ' + entity.BaseView) + generateViewPermissions(entity)
        fs.writeFileSync(directory + `/${entity.BaseView}.permissions.generated.sql`, s)

        // now, append the permissions to the return string IF we did NOT generate the base view - because if we generated the base view, that
        // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
        if (!entity.BaseViewGenerated)
            sRet += s + '\nGO\n';

        // CREATE SP
        if (entity.AllowCreateAPI && !entity.VirtualEntity) {
            const spName: string = entity.spCreate && entity.spCreate.length > 0 ? entity.spCreate : 'spCreate' + entity.ClassName;
            if (!onlyPermissions && entity.spCreateGenerated) {
                // generate the create SP
                const s = generateSingleEntitySQLFileHeader(entity, spName) + generateSPCreate(entity)
                fs.writeFileSync(directory + `/${spName}.generated.sql`, s)
                sRet += s + '\nGO\n';
            }
            const s = generateSPPermissions(entity, spName, SPType.Create) + '\n\n';           
            fs.writeFileSync(directory + `/${spName}.permissions.generated.sql`, s)

            // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
            // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
            if (!entity.spCreateGenerated)
                sRet += s + '\nGO\n';
        }

        // UPDATE SP
        if (entity.AllowUpdateAPI && !entity.VirtualEntity) {
            const spName: string = entity.spUpdate && entity.spUpdate.length > 0 ? entity.spUpdate : 'spUpdate' + entity.ClassName;
            if (!onlyPermissions && entity.spUpdateGenerated) {
                // generate the update SP
                const s = generateSingleEntitySQLFileHeader(entity, spName) + generateSPUpdate(entity)
                fs.writeFileSync(directory + `/${spName}.generated.sql`, s)    
                sRet += s + '\nGO\n';
            }
            const s = generateSPPermissions(entity, spName, SPType.Update) + '\n\n';
            fs.writeFileSync(directory + `/${spName}.permissions.generated.sql`, s)

            // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
            // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
            if (!entity.spUpdateGenerated)
                sRet += s + '\nGO\n';
        }

        // DELETE SP
        if (entity.AllowDeleteAPI && !entity.VirtualEntity) {
            const spName: string = entity.spDelete && entity.spDelete.length > 0 ? entity.spDelete : 'spDelete' + entity.ClassName;
            if (!onlyPermissions && entity.spDeleteGenerated) {
                // generate the delete SP
                const s = generateSingleEntitySQLFileHeader(entity, spName) + generateSPDelete(entity)
                fs.writeFileSync(directory + `/${spName}.generated.sql`, s)
                sRet += s + '\nGO\n';
            }
            const s = generateSPPermissions(entity, spName, SPType.Delete) + '\n\n';
            fs.writeFileSync(directory + `/${spName}.permissions.generated.sql`, s)

            // now, append the permissions to the return string IF we did NOT generate the proc - because if we generated the proc, that
            // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
            if (!entity.spDeleteGenerated)
                sRet += s + '\nGO\n';
        }

        // check to see if the entity supports full text search or not
        if (entity.FullTextSearchEnabled) {
            // always generate the code so we can get the function name from the below function call
            const ft = await generateEntityFullTextSearchSQL(ds, entity);
            if (!onlyPermissions) {
                // only write the actual sql out if we're not only generating permissions
                fs.writeFileSync(directory + `/${entity.BaseTable}.fulltext.generated.sql`, ft.sql)
                sRet += ft.sql + '\nGO\n';
            }

            const sP = generateFullTextSearchFunctionPermissions(entity, ft.functionName) + '\n\n';
            fs.writeFileSync(directory + `/${entity.BaseTable}.fulltext.permissions.generated.sql`, sP)
            
            // now, append the permissions to the return string IF we did NOT generate the function - because if we generated the function, that
            // means we already generated the permissions for it above and it is part of sRet already, but we always save it to a file, (per above line)
            if (!entity.FullTextSearchFunctionGenerated)
                sRet += sP + '\nGO\n';
        }

        return sRet
    }
    catch (err) {
        logError(err)
        return null
    }
}

export async function generateEntitySQL(ds: DataSource, entity: EntityInfo): Promise<string> {
    let sOutput: string = ''
    if (entity.BaseViewGenerated && !entity.VirtualEntity) 
        // generated the base view (will include permissions)
        sOutput += await generateBaseView(ds, entity) + '\n\n';
    else 
        // still generate the permissions for the view even if a custom view
        sOutput += generateViewPermissions(entity) + '\n\n';

    if (entity.AllowCreateAPI && !entity.VirtualEntity) {
        if (entity.spCreateGenerated) 
            // generated SP, will include permissions
            sOutput += generateSPCreate(entity) + '\n\n';
        else
            // custom SP, still generate the permissions
            sOutput += generateSPPermissions(entity, entity.spCreate, SPType.Create) + '\n\n';           
    }

    if (entity.AllowUpdateAPI && !entity.VirtualEntity) {
        if (entity.spUpdateGenerated)
            // generated SP, will include permissions
            sOutput += generateSPUpdate(entity) + '\n\n';
        else
            // custom SP, still generate the permissions
            sOutput += generateSPPermissions(entity, entity.spUpdate, SPType.Update) + '\n\n';           
    }

    if (entity.AllowDeleteAPI && !entity.VirtualEntity) {
        if (entity.spDeleteGenerated)
            // generated SP, will include permissions
            sOutput += generateSPDelete(entity) + '\n\n';
        else
            // custom SP, still generate the permissions
            sOutput += generateSPPermissions(entity, entity.spDelete, SPType.Delete) + '\n\n';   
    }

    // check to see if the entity supports full text search or not
    if (entity.FullTextSearchEnabled) {
        sOutput += await generateEntityFullTextSearchSQL(ds, entity) + '\n\n';
    }
    return sOutput
}

async function generateEntityFullTextSearchSQL(ds: DataSource, entity: EntityInfo): Promise<{sql: string, functionName: string}> {
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
        const entity_pk_name = await getEntityPrimaryKeyIndexName(ds, entity);
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
        sql += generateFullTextSearchFunctionPermissions(entity, functionName) + '\n\nGO\n';
    }

    return {sql,functionName};
}

async function getEntityPrimaryKeyIndexName(ds: DataSource, entity: EntityInfo): Promise<string> {
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

export function generateAllEntitiesSQLFileHeader(): string {
    return `-----------------------------------------------------------------
-- SQL Code Generation for Entities
-- Generated: ${new Date().toLocaleString()}
--
-- This file contains the SQL code for the entities in the database 
-- that are included in the API and have generated SQL elements like views and 
-- stored procedures.
--
-- It is generated by the Entity Generator.
-- It is not intended to be edited by hand.
-----------------------------------------------------------------
`
}

export function generateSingleEntitySQLFileHeader(entity: EntityInfo, itemName: string): string {
    return `-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: ${entity.Name}
-- Item: ${itemName}
-- Generated: ${new Date().toLocaleString()}
--
-- This was generated by the Entity Generator.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
`
}

async function generateBaseView(ds: DataSource, entity: EntityInfo): Promise<string> {
    const viewName: string = entity.BaseView ? entity.BaseView : `vw${entity.CodeName}`;
    const baseTableFirstChar: string = entity.BaseTable.charAt(0).toLowerCase();
    const relatedFieldsString: string = await generateBaseViewRelatedFieldsString(ds, entity.Fields);
    const relatedFieldsJoinString: string = generateBaseViewJoins(entity.Fields);
    const permissions: string = generateViewPermissions(entity);
    return `
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      ${entity.Name}
-----               SCHEMA:      ${entity.SchemaName}
-----               BASE TABLE:  ${entity.BaseTable}
-----               PRIMARY KEY: ${entity.PrimaryKey.Name}
------------------------------------------------------------
DROP VIEW IF EXISTS [${entity.SchemaName}].[${viewName}]
GO

CREATE VIEW [${entity.SchemaName}].[${viewName}]
AS
SELECT 
    ${baseTableFirstChar}.*${relatedFieldsString.length > 0 ? ',' : ''}${relatedFieldsString}
FROM
    [${entity.SchemaName}].[${entity.BaseTable}] AS ${baseTableFirstChar}${relatedFieldsJoinString ? '\n' + relatedFieldsJoinString : ''}
GO${permissions}
`
}

function generateViewPermissions(entity: EntityInfo): string {
    let sOutput: string = '';
    for (let i: number = 0; i < entity.Permissions.length; i++) {
        const ep: EntityPermissionInfo = entity.Permissions[i];
        sOutput += (sOutput == '' ? `GRANT SELECT ON [${entity.SchemaName}].[${entity.BaseView}] TO ` : ', ') + `[${ep.RoleSQLName}]`
    }
    return (sOutput == '' ? '' : '\n') + sOutput;
}

function generateBaseViewJoins(entityFields: EntityFieldInfo[]): string {
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

async function generateBaseViewRelatedFieldsString(ds: DataSource, entityFields: EntityFieldInfo[]): Promise<string> {
    let sOutput: string = '';
    let fieldCount: number = 0;
    for (let i: number = 0; i < entityFields.length; i++) { 
        const ef: EntityFieldInfo = entityFields[i];
        if (ef.RelatedEntityID && ef.IncludeRelatedEntityNameFieldInBaseView) {
            const {nameField, nameFieldIsVirtual} = getIsNameFieldForSingleEntity(ef.RelatedEntity);
            if (nameField !== '') {
                // only add to the output, if we found a name field for the related entity.
                ef._RelatedEntityTableAlias = ef.RelatedEntityClassName + '_' + ef.Name;
                ef._RelatedEntityNameFieldIsVirtual = nameFieldIsVirtual;

                // This next section generates a field name for the new virtual field and makes sure it doesn't collide with a field in the base table
                const candidateName = stripID(ef.Name);
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
                    await updateEntityFieldRelatedEntityNameFieldMap(ds, ef.ID, ef.RelatedEntityNameFieldMap);
                }
                fieldCount++;
            }
        }
    }
    return sOutput;
}

function getIsNameFieldForSingleEntity(entityName: string): {nameField: string, nameFieldIsVirtual: boolean} {
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

function stripID(name: string): string {
    if (name.endsWith('ID'))
        return name.substring(0, name.length - 2);
    else    
        return name;
}

export const SPType = {
    Create: 'Create',
    Update: 'Update',
    Delete: 'Delete',
  } as const;
  
export type SPType = typeof SPType[keyof typeof SPType];
  

function generateSPPermissions(entity: EntityInfo, spName: string, type: SPType): string {
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

function generateFullTextSearchFunctionPermissions(entity: EntityInfo, functionName: string): string {
    let sOutput: string = '';
    for (let i: number = 0; i < entity.Permissions.length; i++) {
        const ep: EntityPermissionInfo = entity.Permissions[i];
        if (ep.CanRead)
            sOutput += (sOutput == '' ? `GRANT SELECT ON [${entity.SchemaName}].[${functionName}] TO ` : ', ') + `[${ep.RoleSQLName}]`
    }
    return (sOutput == '' ? '' : '\n') + sOutput;
}


function generateSPCreate(entity: EntityInfo): string {
    const spName: string = entity.spCreate ? entity.spCreate : `spCreate${entity.ClassName}`;
    const autoGeneratedPrimaryKey: boolean = entity.PrimaryKey.AutoIncrement || entity.PrimaryKey.Type.toLowerCase().trim() === 'uniqueidentifier';
    const efString: string = createEntityFieldsParamString(entity.Fields, !autoGeneratedPrimaryKey);
    const permissions: string = generateSPPermissions(entity, spName, SPType.Create);

    let primaryKeyInsertValue = '';
    let selectInsertedRecord = '';
    let additionalFieldList = '';
    let additionalValueList = '';
    if (entity.PrimaryKey.AutoIncrement) {
        selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${entity.PrimaryKey.Name}] = SCOPE_IDENTITY()`;
    } else if (entity.PrimaryKey.Type.toLowerCase().trim() === 'uniqueidentifier') {
        primaryKeyInsertValue = `DECLARE @newId UNIQUEIDENTIFIER = NEWID();\n    SET @${entity.PrimaryKey.Name} = @newId;\n`;
        additionalFieldList = ',\n            [' + entity.PrimaryKey.CodeName + ']';
        additionalValueList = ',\n            @newId';

        selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${entity.PrimaryKey.Name}] = @newId`;
    } else {
        selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE `;
        let isFirst = true;
        for (let k of entity.PrimaryKeys) {
            if (!isFirst) 
                selectInsertedRecord += ' AND ';
            selectInsertedRecord += `[${k.CodeName}] = @${k.CodeName}`;            
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
    ${primaryKeyInsertValue}
    INSERT INTO 
    [${entity.SchemaName}].[${entity.BaseTable}]
        (
            ${createEntityFieldsInsertString(entity, entity.Fields, '')}${additionalFieldList}
        )
    VALUES
        (
            ${createEntityFieldsInsertString(entity, entity.Fields, '@')}${additionalValueList}
        )
    -- return the new record from the base view, which might have some calculated fields
    ${selectInsertedRecord}
END
GO${permissions}
`
}

function generateSPUpdate(entity: EntityInfo): string {
    const spName: string = entity.spUpdate ? entity.spUpdate : `spUpdate${entity.ClassName}`;
    const efParamString: string = createEntityFieldsParamString(entity.Fields, true);
    const permissions: string = generateSPPermissions(entity, spName, SPType.Update);

    let selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE `;
    let isFirst = true;
    for (let k of entity.PrimaryKeys) {
        if (!isFirst) 
            selectInsertedRecord += ' AND ';
        selectInsertedRecord += `[${k.CodeName}] = @${k.CodeName}`;            
        isFirst = false;
    }

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
        ${createEntityFieldsUpdateString(entity.Fields)}
    WHERE 
        [${entity.PrimaryKey.Name}] = @${entity.PrimaryKey.Name}

    -- return the updated record so the caller can see the updated values and any calculated fields
    ${selectInsertedRecord}
END
GO${permissions}
    `
}

function createEntityFieldsParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
    let sOutput: string = '', isFirst: boolean = true;
    for (let i: number = 0; i < entityFields.length; ++i) {
        const ef: EntityFieldInfo = entityFields[i];
        const autoGeneratedPrimaryKey: boolean = ef.AutoIncrement || ef.Type.toLowerCase().trim() === 'uniqueidentifier';
        if ( (ef.AllowUpdateAPI || (ef.IsPrimaryKey && isUpdate)) && 
            !ef.IsVirtual && 
            ((!ef.IsPrimaryKey || !autoGeneratedPrimaryKey) || isUpdate) && 
            ef.Name.toLowerCase().trim() !== 'updatedat' && 
            ef.Name.toLowerCase().trim() !== 'createdat'  && 
            ef.Type.toLowerCase().trim() !== 'uniqueidentifier' ) {
            if (!isFirst) 
                sOutput += ',\n    '
            else
                isFirst = false;

            sOutput += `@${ef.CodeName} ${ef.SQLFullType}`;
        }
    }
    return sOutput;
}

function createEntityFieldsInsertString(entity: EntityInfo, entityFields: EntityFieldInfo[], prefix: string): string {
    const autoGeneratedPrimaryKey = entity.PrimaryKey.AutoIncrement || entity.PrimaryKey.Type.toLowerCase().trim() === 'uniqueidentifier';
    let sOutput: string = '', isFirst: boolean = true;
    for (let i: number = 0; i < entityFields.length; ++i) {
        const ef: EntityFieldInfo = entityFields[i];
        if ((!ef.IsPrimaryKey || !autoGeneratedPrimaryKey) && 
            ef.IsVirtual === false && 
            ef.AllowUpdateAPI && 
            ef.AutoIncrement === false && 
            ef.Type.trim().toLowerCase() !== 'uniqueidentifier') {
            if (!isFirst) 
                sOutput += ',\n            '
            else
                isFirst = false;

            if (prefix !== '' && (ef.Name.toLowerCase().trim() === 'updatedat' || 
                                  ef.Name.toLowerCase().trim() === 'createdat')
               )
                sOutput += `GETDATE()`;
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


function createEntityFieldsUpdateString(entityFields: EntityFieldInfo[]): string {
    let sOutput: string = '', isFirst: boolean = true;
    for (let i: number = 0; i < entityFields.length; ++i) {
        const ef: EntityFieldInfo = entityFields[i];
        if (!ef.IsPrimaryKey && 
            ef.IsVirtual === false && 
            ef.AllowUpdateAPI && 
            ef.AutoIncrement === false && 
            ef.Name.toLowerCase().trim() !== 'createdat' && 
            ef.Name.toLowerCase().trim() !== 'updatedat' && 
            ef.Type.toLowerCase().trim() !== 'uniqueidentifier') {
            if (!isFirst) 
                sOutput += ',\n        '
            else
                isFirst = false;

            sOutput += `[${ef.Name}] = @${ef.CodeName}`; // always put field names in brackets for field names that have spaces or use reserved words. Also, we use CodeName for the param name, which is the field name unless it has spaces
        }
        else if (ef.Name.trim().toLowerCase() === 'updatedat') {
            if (!isFirst) 
                sOutput += ',\n        '
            else
                isFirst = false;
            sOutput += `[${ef.Name}] = GETDATE()`;
        }
    }
    return sOutput;
}


function generateSPDelete(entity: EntityInfo): string {
    const spName: string = entity.spDelete ? entity.spDelete : `spDelete${entity.ClassName}`;
    const sCascadeDeletes: string = generateCascadeDeletes(entity);
    const permissions: string = generateSPPermissions(entity, spName, SPType.Delete);
    let sVariables: string = '';
    let sSelect: string = '';
    for (let k of entity.PrimaryKeys) {
        if (sVariables !== '')
            sVariables += ', ';
        sVariables += `@${k.CodeName} ${k.SQLFullType}`;

        if (sSelect !== '')
            sSelect += ', ';
        sSelect += `@${k.CodeName} AS [${k.CodeName}]`;        
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

    DELETE FROM 
        [${entity.SchemaName}].[${entity.BaseTable}]
    WHERE 
        [${entity.PrimaryKey.Name}] = @${entity.PrimaryKey.CodeName}

    SELECT ${sSelect} -- Return the primary key to indicate we successfully deleted the record
END
GO${permissions}
`
}

function generateCascadeDeletes(entity: EntityInfo): string {
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
        [${ef.CodeName}] = @${entity.PrimaryKey.CodeName}`;
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
        [${ef.CodeName}] = @${entity.PrimaryKey.CodeName}`;
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