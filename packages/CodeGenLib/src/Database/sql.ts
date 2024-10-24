import { logError } from "../Misc/status_logging";
import fs from 'fs';
import path from 'path';
import { EntityInfo, Metadata } from "@memberjunction/core";
import { DataSource } from "typeorm";
import { outputDir } from "../Config/config";
import { ManageMetadataBase } from "../Database/manage-metadata";
import { RegisterClass } from "@memberjunction/global";
import { MSSQLConnection, sqlConfig } from "../Config/db-connection";

import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { mkdirSync } from "fs-extra";
import { attemptDeleteFile } from "../Misc/util";

const execAsync = promisify(exec);

/**
 * Base class for SQL Utility functions, you can sub-class this class to create your own SQL Utility functions/override existing functionality.
 */
@RegisterClass(SQLUtilityBase)
export class SQLUtilityBase {
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
public getDBObjectFileName(type: 'view' | 'sp' | 'full_text_search_function', 
                                    schema: string, 
                                    objectName: string, 
                                    isPermissions: boolean,
                                    isGenerated: boolean): string {
                  
   return path.join(schema, `${objectName}.${type}${type==='full_text_search_function' ? '.fulltext' : ''}${isPermissions ? '.permissions' : ''}${isGenerated ? '.generated' : ''}.sql`);
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

public async recompileAllBaseViews(ds: DataSource, excludeSchemas: string[], applyPermissions: boolean): Promise<boolean> {
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

      //const levelFiles: string[] = [];
      let sqlCommand: string = '';
      for (const entity of l) {
        // OCT 24 2024 - changed to use sp_refreshview instead of executing the view files
        // will remove old code shortly after testing
        //levelFiles.push(...this.getBaseViewFiles(entity));
        sqlCommand += `EXEC sp_refreshview '${entity.SchemaName}.${entity.BaseView}';\n`;
      }

      // all files for this level are now in levelFiles, let's combine them and execute them
      //const combinedSQL = this.combineMultipleSQLFiles(levelFiles);
      bSuccess = await this.executeSQLScript(ds, sqlCommand, false) && bSuccess;
      //bSuccess = await this.executeBatchSQLScript(combinedSQL) && bSuccess;
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
 
 public async recompileSingleBaseView(ds: DataSource, entity: EntityInfo, applyPermissions: boolean): Promise<boolean> {
  // just call EXEC sp_refreshview 'your_schema_name.your_view_name';
  try {
    await this.executeSQLScript(ds, `EXEC sp_refreshview '${entity.SchemaName}.${entity.BaseView}';`, false);
    return true;  
  }
  catch (e) {
    logError(e as string);
    return false;
  }
  // const file = this.getDBObjectFileName('view', entity.SchemaName, entity.BaseView, false, entity.BaseViewGenerated);
  //  const filePath = path.join(outputDir('SQL', true)!, file);
  //  if (fs.existsSync(filePath)) {
  //     const recompileResult = await this.executeSQLFile(filePath)
  //     if (applyPermissions) {
  //        // now apply permissions
  //        const permissionsFile = this.getDBObjectFileName('view', entity.SchemaName, entity.BaseView, true, entity.BaseViewGenerated);
  //        const permissionsFilePath = path.join(outputDir('SQL', true)!, permissionsFile);
  //        if (fs.existsSync(permissionsFilePath)) {
  //           return await this.executeSQLFile(permissionsFilePath) && recompileResult;
  //        }
  //     }  
  //     else
  //        return recompileResult;
  //  }
  //  else {
  //     logError(`     Error Recompiling Base View: File ${filePath} does not exist`)
  //  }
  //  return false;
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
  try {
    if (sqlConfig.user === undefined || sqlConfig.password === undefined || sqlConfig.database === undefined) {
      throw new Error("SQL Server user, password, and database must be provided in the configuration");
    }

    // Construct the sqlcmd command with optional port and instance
    let command = `sqlcmd -S ${sqlConfig.server}`;
    if (sqlConfig.port) {
      command += `,${sqlConfig.port}`;
    }
    if (sqlConfig.options?.instanceName) {
      const escapedInstanceName = `"${sqlConfig.options.instanceName.replace(/"/g, '\\"')}"`;
      command += `\\${escapedInstanceName}`;
    }

    // Escape and wrap user and password in double quotes
    const escapedUser = `"${sqlConfig.user.replace(/"/g, '\\"')}"`;
    const escapedPassword = `"${sqlConfig.password.replace(/"/g, '\\"')}"`;
    const escapedDatabase = `"${sqlConfig.database.replace(/"/g, '\\"')}"`;

    const cwd = path.resolve(process.cwd());
    const absoluteFilePath = path.resolve(cwd, filePath);
    command += ` -U ${escapedUser} -P ${escapedPassword} -d ${escapedDatabase} -i "${absoluteFilePath}"`;

    // Execute the command
    const { stdout, stderr } = await execAsync(command);

    if (stderr && stderr.trim().length > 0) {
      throw new Error(stderr);
    }
    else if (stdout && stdout.trim().length > 0) {
      // we shouldn't have any output from this command if there are no errors, so consider this an error
      throw new Error(stdout);
    }
    return true;
  }
  catch (e) {
    const message = (e as any).message || e;
    const errorMessage = sqlConfig.password ? this.maskPassword(message, sqlConfig.password) : message;
    logError("Error executing batch SQL file: " + errorMessage);
    return false;
  }
 }

 private maskPassword(input: string, password: string, replaceWith: string = 'XXXXX'): string {
  return input.replace(new RegExp(password, 'g'), replaceWith);
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




 public async executeSQLScript(ds: DataSource, scriptText: string, inChunks : boolean): Promise<boolean> {
    try {
      if (!scriptText || scriptText.length == 0)
         return true; // nothing to do

      return this.executeBatchSQLScript(scriptText);
    }
    catch (e) {
       logError(e as string);
       return false;
    }
 }
}