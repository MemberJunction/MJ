import { logError, logMessage } from "../Misc/status_logging";
import fs from 'fs';
import path from 'path';
import { EntityInfo, Metadata } from "@memberjunction/core";
import { CodeGenDatabaseProvider, CodeGenConnection } from './codeGenDatabaseProvider';
import { SQLServerCodeGenProvider } from './SQLServerCodeGenProvider';
import { configInfo, outputDir } from "../Config/config";
import { ManageMetadataBase } from "../Database/manage-metadata";
import { MJGlobal } from "@memberjunction/global";
import { SQLCodeGenBase } from './sql_codegen';

import * as crypto from 'crypto';
import { mkdirSync } from "fs";
import { attemptDeleteFile, logIf } from "../Misc/util";


/**
 * Base class for SQL Utility functions, you can sub-class this class to create your own SQL Utility functions/override existing functionality.
 */
export class SQLUtilityBase {
private _dbProvider: CodeGenDatabaseProvider | null = null;

/**
 * Lazy-initialized database provider. Uses the same factory pattern as ManageMetadataBase
 * and SQLCodeGenBase to resolve the correct provider for the configured database platform.
 */
protected get dbProvider(): CodeGenDatabaseProvider {
   if (!this._dbProvider) {
      const platform = configInfo.dbType;
      if (platform === 'postgresql') {
         const pgProvider = MJGlobal.Instance.ClassFactory.CreateInstance<CodeGenDatabaseProvider>(
            CodeGenDatabaseProvider, 'PostgreSQLCodeGenProvider'
         );
         if (pgProvider) {
            this._dbProvider = pgProvider;
         } else {
            throw new Error(
               'PostgreSQL CodeGen provider not found. Ensure @memberjunction/postgresql-dataprovider ' +
               'is installed and its CodeGen provider is registered before running CodeGen.'
            );
         }
      } else {
         this._dbProvider = new SQLServerCodeGenProvider();
      }
   }
   return this._dbProvider;
}

/**
 * Returns a file name for a given DB Object given a type, schema and object name.
 * The basic format is to have a directory for each schema, and within each directory
 * the file name for each object has this format: <type>.<objectName>.<permissions>.<generated>.sql
 * Where in the above format the <permissions> is only included if the isPermissions flag is true.
 * For example:
 *    getDBObjectFileName('view', 'dbo', 'MyView', false, true) => 'dbo/MyView.view.generated.sql'
 *    getDBObjectFileName('view', 'dbo', 'MyView', true, true)  => 'dbo/MyView.view.permissions.generated.sql'
 *    getDBObjectFileName('full_text_search_function', 'dbo', 'tableName', false, true) => 'dbo/tableName.fulltext.generated.sql'
 * @param type 
 * @param schema 
 * @param objectName 
 */
public getDBObjectFileName(type: 'view' | 'sp' | 'function' | 'full_text_search_function' | 'index',
                                    schema: string,
                                    objectName: string,
                                    isPermissions: boolean,
                                    isGenerated: boolean): string {
   let extraText: string = '';
   switch (type) {
    case 'full_text_search_function':
      extraText = '.fulltext';
      break;
   }
   return path.join(schema, `${objectName}.${type}${extraText}${isPermissions ? '.permissions' : ''}${isGenerated ? '.generated' : ''}.sql`);
}

/**
 * This method will build a two dimensional array of EntityInfo objects. The first dimension of the array is the level of the entity in the dependency tree.
 * The second dimension of the array is the entities at that level. The entities at each level are NOT dependent on any other entity in that level or any level below it.
 * This method uses the foreign key information witin the Entity Fields array to find these dependencies. self-referencing foreign keys are ignored.
 */
public buildEntityLevelsTree(entities: EntityInfo[]): EntityInfo[][] {
   const entityLevelTree: EntityInfo[][] = [];
   const entityMap = new Map<string, EntityInfo>();
   const dependencyMap = new Map<string, Set<string>>();

   // Initialize entity map and dependency map
   entities.forEach(entity => {
     entityMap.set(entity.Name, entity);
     dependencyMap.set(entity.Name, new Set<string>());
   });

   // Populate dependency map based on foreign keys
   entities.forEach(entity => {
     entity.Fields.forEach(field => {
       if (field.RelatedEntity && field.RelatedEntity !== entity.Name) {
         dependencyMap.get(entity.Name)?.add(field.RelatedEntity);
       }
     });
   });

   // Process entities to build levels
   while (dependencyMap.size > 0) {
     const currentLevel: EntityInfo[] = [];

     // Find entities with no dependencies
     for (const item of dependencyMap) {
         const entityName = item[0];
         const dependencies = item[1];
         if (dependencies.size === 0) {
            currentLevel.push(entityMap.get(entityName)!);
         }
     }

     if (currentLevel.length === 0) {
      // We have a cyclical dependency at this level, so we can't continue. Instead of bombing completely, throw a warning and include in the final level
      // all of the remaining entities in the dependency map.
      const circularDeps: string[] = [];
      for (const [entityName, dependencies] of dependencyMap.entries()) {
        circularDeps.push(`${entityName} depends on ${Array.from(dependencies).join(', ')}`);
      }
      console.warn(`      > Cyclical Dependency Detected (non-fatal), including remaining entities in final level. Details:`);
      circularDeps.forEach(dep => console.warn(`        * ${dep}`));
      
      for (const item of dependencyMap) {
        const entityName = item[0];
        currentLevel.push(entityMap.get(entityName)!);
      }
    }


     // Add current level to the tree
     entityLevelTree.push(currentLevel);

     // Remove current level entities from the dependency map and other entities' dependencies
     currentLevel.forEach(entity => {
       dependencyMap.delete(entity.Name);
     });

     dependencyMap.forEach(dependencies => {
       currentLevel.forEach(entity => {
         dependencies.delete(entity.Name);
       });
     });
   }

   return entityLevelTree;
 }

public async recompileAllBaseViews(ds: CodeGenConnection, excludeSchemas: string[], applyPermissions: boolean, excludeEntities?: string[]): Promise<boolean> {
   let bSuccess: boolean = true; // start off true
   const md: Metadata = new Metadata();

   // Build the dependency order tree, provide ALL entities for this process
   const entityLevelTree = this.buildEntityLevelsTree(md.Entities);
   // Process each level sequentially, but entities within a level in parallel
   for (const level of entityLevelTree) {
      // now filter out each LEVEL to only include entities that are not needed for recompilation
      const l = level.filter(e => 
        !excludeSchemas.includes(e.SchemaName) && 
        e.BaseViewGenerated && 
        e.IncludeInAPI && 
        !e.VirtualEntity && 
        !ManageMetadataBase.newEntityList.includes(e.Name));

      let sqlCommand: string = '';

      if (this.dbProvider.NeedsViewRefresh) {
        for (const entity of l) {
          // if an excludeEntities variable was provided, skip this entity if it's in the list
          if (!excludeEntities || !excludeEntities.includes(entity.Name)) {
            sqlCommand += this.dbProvider.generateViewRefreshSQL(entity.SchemaName, entity.BaseView);
          }
        }
      }

      // Execute the initial refresh attempts
      bSuccess = await this.executeSQLScript(ds, sqlCommand, false) && bSuccess;
      
      // Now check which views failed to refresh and regenerate them
      const failedEntities = await this.identifyFailedViewRefreshes(ds, l);
      if (failedEntities.length > 0) {
        logMessage(`Detected ${failedEntities.length} views that failed to refresh. Attempting to regenerate view definitions...`, 'Info');
        
        // Regenerate the failed views using the SQL CodeGen approach
        const regenerateSuccess = await this.regenerateFailedBaseViews(ds, failedEntities);
        if (!regenerateSuccess) {
          logError('Failed to regenerate some base views after refresh failure');
          bSuccess = false;
        }
      }
    }

   if (!bSuccess) {
     // temp thing for debug, let's dump the new entity list to see what's up
     console.warn('New Entity List:');
     console.warn('    ' + ManageMetadataBase.newEntityList.join('\n    '));
   }

   return bSuccess;
 }


 public getBaseViewFiles(entity: EntityInfo): string[] {
    const files: string[] = [];
    const baseViewFile = this.getDBObjectFileName('view', entity.SchemaName, entity.BaseView, false, entity.BaseViewGenerated);
    const baseViewPermissionsFile = this.getDBObjectFileName('view', entity.SchemaName, entity.BaseView, true, entity.BaseViewGenerated);
    const baseViewFilePath = path.join(outputDir('SQL', true)!, baseViewFile);
    const baseViewPermissionsFilePath = path.join(outputDir('SQL', true)!, baseViewPermissionsFile);
    if (fs.existsSync(baseViewFilePath)) {
      files.push(baseViewFile);
    }
    if (fs.existsSync(baseViewPermissionsFilePath)) {
      files.push(baseViewPermissionsFile);
    }
    return files;
 }

 public combineMultipleSQLFiles(files: string[]): string {
    let combinedSQL: string = "";
    for (const file of files) {
      const filePath = path.join(outputDir('SQL', true)!, file);
      if (fs.existsSync(filePath)) {
        combinedSQL += (combinedSQL.length === 0 ? "" : "\n\nGO\n\n") + fs.readFileSync(filePath, 'utf-8');
      }
      else {
        logError(`     Error Combining SQL Files: File ${filePath} does not exist`)
      }
    }
    return combinedSQL;
 }
 
 public async recompileSingleBaseView(ds: CodeGenConnection, entity: EntityInfo, applyPermissions: boolean): Promise<boolean> {
  try {
    if (!this.dbProvider.NeedsViewRefresh) {
      return true;
    }
    const refreshSQL = this.dbProvider.generateViewRefreshSQL(entity.SchemaName, entity.BaseView);
    await this.executeSQLScript(ds, refreshSQL, false);
    return true;
  }
  catch (e) {
    logError(e as string);
    return false;
  }
 }
 
 /**
  * Identifies which entities had views that failed to refresh by checking if their base views are still valid
  * @param ds DataSource for database queries
  * @param entities List of entities to check
  * @returns Array of entities whose views failed to refresh
  */
 private async identifyFailedViewRefreshes(ds: CodeGenConnection, entities: EntityInfo[]): Promise<EntityInfo[]> {
   const failedEntities: EntityInfo[] = [];

   for (const entity of entities) {
     try {
       const testQuery = this.dbProvider.generateViewTestQuerySQL(entity.SchemaName, entity.BaseView);
       await ds.query(testQuery);
     } catch (e) {
       logMessage(`View ${entity.SchemaName}.${entity.BaseView} is invalid and will be regenerated`, 'Warning');
       failedEntities.push(entity);
     }
   }

   return failedEntities;
 }
 
 /**
  * Regenerates base views for entities that failed the refresh process using the full CodeGen approach
  * @param ds DataSource for database operations
  * @param entities List of entities whose views need to be regenerated
  * @returns True if all regenerations succeeded, false otherwise
  */
 private async regenerateFailedBaseViews(ds: CodeGenConnection, entities: EntityInfo[]): Promise<boolean> {
   let bSuccess = true;
   
   const sqlCodeGen = new SQLCodeGenBase();
   
   for (const entity of entities) {
     try {
       logMessage(`Regenerating base view for ${entity.Name}...`, 'Info');
       
       // Generate the new view definition using the CodeGen approach
       const viewSQL = await sqlCodeGen.generateBaseView(ds, entity);
       
       // Execute the new view definition
       await this.executeSQLScript(ds, viewSQL, false);
       
       logMessage(`Successfully regenerated base view for ${entity.Name}`, 'Info');
     } catch (e) {
       logError(`Failed to regenerate base view for ${entity.Name}: ${e}`);
       bSuccess = false;
     }
   }
   
   return bSuccess;
 }
 
 public async executeSQLFiles(filePaths: string[], outputMessages: boolean): Promise<boolean> {
    for (const filePath of filePaths) {
       const startTime = Date.now();
       if (!await this.executeSQLFile(filePath))
          return false;
       const endTime = Date.now();
       if (outputMessages)
          console.log(`      Executed ${filePath} in ${endTime - startTime}ms`);
    }
    return true;
 }

 private static _batchScriptCounter: number = 0;
 public async executeSQLFile(filePath: string): Promise<boolean> {
  return this.dbProvider.executeSQLFileViaShell(filePath);
 }

 public async executeBatchSQLScript(scriptText: string): Promise<boolean> {
  try {
    if (!scriptText || scriptText.length === 0) return true; // nothing to do

    // Write the scriptText to a temporary file
    const uniqueFileName = `temp_script_${SQLUtilityBase._batchScriptCounter++}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.sql`;
    const tempDir = path.join(process.cwd(), 'temp_sql_scripts');
    mkdirSync(tempDir, { recursive: true });
    const scriptFilePath = path.join(tempDir, uniqueFileName);
    fs.writeFileSync(scriptFilePath, scriptText);

    logIf(configInfo.verboseOutput, `Executing batch SQL script: ${scriptFilePath}`);
    await this.executeSQLFile(scriptFilePath);

    // Remove the temporary file
    attemptDeleteFile(scriptFilePath, 3, 2000); // don't await this, just fire and forget

    return true;
  } 
  catch (error) {
    console.error(error);
    return false;
  }
}




 public async executeSQLScript(ds: CodeGenConnection, scriptText: string, inChunks : boolean): Promise<boolean> {
    try {
      if (!scriptText || scriptText.length == 0)
         return true; // nothing to do

      logIf(configInfo.verboseOutput, `Executing SQL Script: ${scriptText?.length > 100 ? scriptText.substring(0, 100) + '...' : scriptText}`);

      return this.executeBatchSQLScript(scriptText);
    }
    catch (e) {
       logError(e as string);
       return false;
    }
 }
}