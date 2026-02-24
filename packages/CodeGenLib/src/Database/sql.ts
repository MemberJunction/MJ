import { logError, logMessage, logWarning } from "../Misc/status_logging";
import fs from 'fs';
import path from 'path';
import { EntityInfo, Metadata } from "@memberjunction/core";
import { CodeGenConnection } from './codeGenDatabaseProvider';
import { configInfo, dbType, outputDir } from "../Config/config";
import { ManageMetadataBase } from "../Database/manage-metadata";
import { RegisterClass } from "@memberjunction/global";
import { SQLCodeGenBase } from './sql_codegen';
import { sqlConfig } from "../Config/db-connection";

import { exec, execFile, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { mkdirSync } from "fs";
import { attemptDeleteFile, logIf } from "../Misc/util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Escapes special characters in a string for safe use as a shell command argument.
 * Handles both Unix-like shells (bash/sh) and Windows (cmd.exe).
 *
 * For Unix systems: Designed to work with single quotes, which prevent all shell expansion.
 * Only single quotes themselves need escaping (by ending the quoted string, adding an escaped quote, and starting a new quoted string).
 *
 * For Windows: Uses standard cmd.exe escaping for double-quoted strings.
 *
 * @param value The string to escape
 * @returns The escaped string safe for shell use
 */
function escapeShellArg(value: string): string {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
        // Windows cmd.exe escaping for double-quoted strings
        return value
            .replace(/"/g, '""')      // Double quotes -> doubled
            .replace(/\^/g, '^^')     // Caret escape
            .replace(/%/g, '%%')      // Percent for environment vars
            .replace(/&/g, '^&')      // Ampersand
            .replace(/\|/g, '^|')     // Pipe
            .replace(/</g, '^<')      // Less than
            .replace(/>/g, '^>')      // Greater than
            .replace(/\(/g, '^(')     // Left paren
            .replace(/\)/g, '^)');    // Right paren
    } else {
        // Unix-like shell escaping for single-quoted strings
        // In single quotes, everything is literal except single quotes themselves
        // To include a single quote: end the quoted string, add an escaped single quote, start a new quoted string
        // Example: 'It'\''s working' produces: It's working
        return value.replace(/'/g, "'\\''");
    }
}

/**
 * Escapes special characters in a string specifically for use as sqlcmd parameter values.
 * When values are passed to sqlcmd wrapped in quotes, the quotes protect most special characters
 * from cmd.exe interpretation, but certain characters need additional escaping.
 *
 * For Windows: We need to escape:
 * 1. Double quotes using """ (three quotes) - cmd.exe rule for quotes in quoted strings
 * 2. Special characters (>, <, |, &, ^) using ^ prefix - even inside quoted strings these need escaping
 * 3. Percent signs %% - to prevent variable expansion
 *
 * For Unix: Single quotes protect everything except single quotes themselves.
 *
 * @param value The string to escape for sqlcmd parameter
 * @returns The escaped string safe for use in sqlcmd parameters
 */
function escapeSqlcmdParam(value: string): string {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
        // For Windows cmd.exe with double-quoted strings:
        // Must escape special characters even inside quotes when using child_process.exec()
        return value
            .replace(/"/g, '"""')      // Double quotes -> triple quotes (must be first)
            .replace(/\^/g, '^^')      // Caret escape
            .replace(/%/g, '%%')       // Percent for environment vars
            .replace(/>/g, '^>')       // Greater than (redirection)
            .replace(/</g, '^<')       // Less than (redirection)
            .replace(/\|/g, '^|')      // Pipe
            .replace(/&/g, '^&')       // Ampersand
            .replace(/\(/g, '^(')      // Left paren
            .replace(/\)/g, '^)');     // Right paren
    } else {
        // For Unix sqlcmd parameters in single quotes:
        // Only single quotes need escaping
        return value.replace(/'/g, "'\\''");
    }
}

/**
 * Base class for SQL Utility functions, you can sub-class this class to create your own SQL Utility functions/override existing functionality.
 */
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
      const failedRefreshEntities: EntityInfo[] = [];
      
      const isPG = dbType() === 'postgresql';
      for (const entity of l) {
        // if an excludeEntities variable was provided, skip this entity if it's in the list
        if (!excludeEntities || !excludeEntities.includes(entity.Name)) {
          if (isPG) {
            // PostgreSQL views don't need explicit refresh - they resolve at query time.
            // We can verify they're valid by doing a quick query. For now, skip.
            // If the view was recreated by CodeGen, it's already up to date.
          } else {
            sqlCommand += ` DECLARE @RefreshError_${entity.CodeName} INT = 0;
                            BEGIN TRY
                                EXEC sp_refreshview '${entity.SchemaName}.${entity.BaseView}';
                            END TRY
                            BEGIN CATCH
                                SET @RefreshError_${entity.CodeName} = 1;
                                PRINT 'View refresh failed for ${entity.SchemaName}.${entity.BaseView}: ' + ERROR_MESSAGE();
                            END CATCH
                            
                            IF @RefreshError_${entity.CodeName} = 1
                            BEGIN
                                PRINT 'Attempting to regenerate view definition for ${entity.SchemaName}.${entity.BaseView}';
                            END
                          `
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
    if (dbType() === 'postgresql') {
      // PostgreSQL views don't need explicit refresh - they resolve at query time.
      return true;
    }
    // SQL Server: EXEC sp_refreshview to recompile the view
    await this.executeSQLScript(ds, `EXEC sp_refreshview '${entity.SchemaName}.${entity.BaseView}';`, false);
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
   const isPG = dbType() === 'postgresql';
   
   for (const entity of entities) {
     try {
       // Try to query the view to see if it's valid
       const testQuery = isPG
         ? `SELECT * FROM "${entity.SchemaName}"."${entity.BaseView}" LIMIT 1`
         : `SELECT TOP 1 * FROM [${entity.SchemaName}].[${entity.BaseView}]`;
       await ds.query(testQuery);
     } catch (e) {
       // If the query fails, the view is invalid and needs to be regenerated
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
  if (dbType() === 'postgresql') {
    return this.executeSQLFilePostgreSQL(filePath);
  }
  return this.executeSQLFileSQLServer(filePath);
 }

 /**
  * Executes a SQL file against PostgreSQL using the psql CLI.
  * Reads PG connection params from environment variables (same ones used by setupPostgreSQLDataSource).
  */
 private async executeSQLFilePostgreSQL(filePath: string): Promise<boolean> {
  const pgHost = process.env.PG_HOST ?? configInfo.dbHost;
  const pgPort = process.env.PG_PORT ?? String(configInfo.dbPort ?? 5432);
  const pgDatabase = process.env.PG_DATABASE ?? configInfo.dbDatabase;
  const pgUser = process.env.PG_USERNAME ?? configInfo.codeGenLogin;
  const pgPassword = process.env.PG_PASSWORD ?? configInfo.codeGenPassword;

  if (!pgUser || !pgPassword || !pgDatabase) {
    throw new Error("PostgreSQL user, password, and database must be provided in the configuration or environment variables");
  }

  const absoluteFilePath = path.resolve(process.cwd(), filePath);

  const args = [
    '-h', pgHost,
    '-p', pgPort,
    '-U', pgUser,
    '-d', pgDatabase,
    '-v', 'ON_ERROR_STOP=1',  // Stop on first error (similar to sqlcmd -V 17)
    '-f', absoluteFilePath
  ];

  logIf(configInfo.verboseOutput, `Executing SQL file (psql): ${filePath} as ${pgUser}@${pgHost}:${pgPort}/${pgDatabase}`);

  try {
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn('psql', args, {
        shell: false,
        env: { ...process.env, PGPASSWORD: pgPassword }
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error: Error) => {
        reject(error);
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const error = new Error(`psql exited with code ${code}`);
          Object.assign(error, { stdout, stderr, code });
          reject(error);
        }
      });
    });

    // psql sends informational messages to stderr (NOTICE, etc.) - only warn on non-empty output
    if (result.stdout && result.stdout.trim().length > 0) {
      logIf(configInfo.verboseOutput, `PostgreSQL output: ${result.stdout.trim()}`);
    }
    if (result.stderr && result.stderr.trim().length > 0) {
      // Filter out NOTICE messages which are informational
      const nonNoticeLines = result.stderr.split('\n').filter(l => !l.trim().startsWith('NOTICE:') && !l.trim().startsWith('psql:') && l.trim().length > 0);
      if (nonNoticeLines.length > 0) {
        logWarning(`PostgreSQL stderr: ${nonNoticeLines.join('\n')}`);
      }
    }

    return true;
  } catch (e: unknown) {
    let message = (e instanceof Error) ? e.message : String(e);

    const errRecord = e as Record<string, unknown>;
    if (errRecord.stdout) {
      message += `\n PostgreSQL output: ${errRecord.stdout}`;
    }
    if (errRecord.stderr) {
      message += `\n PostgreSQL error: ${errRecord.stderr}`;
    }

    // Mask password in error messages
    const errorMessage = pgPassword ? this.maskPassword(message, pgPassword) : message;
    logError("Error executing PostgreSQL SQL file: " + errorMessage);
    return false;
  }
 }

 /**
  * Executes a SQL file against SQL Server using the sqlcmd CLI.
  */
 private async executeSQLFileSQLServer(filePath: string): Promise<boolean> {
  try {
    if (sqlConfig.user === undefined || sqlConfig.password === undefined || sqlConfig.database === undefined) {
      throw new Error("SQL Server user, password, and database must be provided in the configuration");
    }

    // Build the server specification string (server[,port][\instance])
    let serverSpec = sqlConfig.server;
    if (sqlConfig.port) {
      serverSpec += `,${sqlConfig.port}`;
    }
    if (sqlConfig.options?.instanceName) {
      serverSpec += `\\${sqlConfig.options.instanceName}`;
    }

    const cwd = path.resolve(process.cwd());
    let absoluteFilePath = path.resolve(cwd, filePath);

    // On Windows, convert to short path (8.3 format) if the path contains spaces
    // This avoids quoting issues when using windowsVerbatimArguments
    const isWindows = process.platform === 'win32';
    if (isWindows && absoluteFilePath.includes(' ')) {
      try {
        // Use fsutil to get the short path name on Windows
        const result = execSync(`for %I in ("${absoluteFilePath}") do @echo %~sI`, {
          encoding: 'utf8',
          shell: 'cmd.exe'
        }).trim();
        if (result && !result.includes('ERROR') && !result.includes('%~sI')) {
          absoluteFilePath = result;
          logIf(configInfo.verboseOutput, `Converted path to short format: ${absoluteFilePath}`);
        }
      } catch (e) {
        // If short path conversion fails, we'll try with the original path
        logIf(configInfo.verboseOutput, `Could not convert to short path, using original: ${e}`);
      }
    }

    // Build arguments array for spawn (bypasses shell, no escaping needed!)
    const args = [
      '-S', serverSpec,
      '-U', sqlConfig.user,
      '-P', sqlConfig.password,
      '-d', sqlConfig.database,
      '-I',  // Enable QUOTED_IDENTIFIER (required for indexed views, computed columns, etc.)
      '-V', '17',  // Only fail on severity >= 17 (system errors)
      '-i', absoluteFilePath
    ];

    // Add -C flag to trust server certificate when configured
    if (sqlConfig.options?.trustServerCertificate) {
      args.push('-C');
    }

    // Execute the command using spawn to completely bypass shell escaping issues
    logIf(configInfo.verboseOutput, `Executing SQL file: ${filePath} as ${sqlConfig.user}@${sqlConfig.server}:${sqlConfig.port}/${sqlConfig.database}`);

    // Debug logging for Windows password issues
    if (process.platform === 'win32' && configInfo.verboseOutput) {
      const maskedArgs = args.map((arg, i) =>
        args[i-1] === '-P' ? '[MASKED]' : arg
      );
      logMessage(`sqlcmd args (password masked): ${JSON.stringify(maskedArgs)}`, 'Info');
      logMessage(`Password length: ${sqlConfig.password.length}, contains special chars: ${/[^a-zA-Z0-9]/.test(sqlConfig.password)}`, 'Info');
    }

    try {
      // Use spawn instead of execFile for better Windows compatibility
      // spawn with shell:false ensures no cmd.exe interpretation of arguments
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const sqlcmdCommand = isWindows ? 'sqlcmd.exe' : 'sqlcmd';

        const spawnOptions: Record<string, unknown> = {
          shell: false  // Critical: bypass shell entirely on all platforms
        };

        // On Windows, use windowsVerbatimArguments to pass args exactly as-is
        // File paths with spaces are handled by converting to 8.3 short format above
        if (isWindows) {
          spawnOptions.windowsVerbatimArguments = true;
        }

        const child = spawn(sqlcmdCommand, args, spawnOptions as Parameters<typeof spawn>[2]);

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        child.on('error', (error: Error) => {
          reject(error);
        });

        child.on('close', (code: number | null) => {
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            const error = new Error(`sqlcmd exited with code ${code}`);
            Object.assign(error, { stdout, stderr, code });
            reject(error);
          }
        });
      });

      // Log any output as warnings (they're non-fatal since we didn't throw)
      if (result.stdout && result.stdout.trim().length > 0) {
        logWarning(`SQL Server message: ${result.stdout.trim()}`);
      }
      if (result.stderr && result.stderr.trim().length > 0) {
        logWarning(`SQL Server stderr: ${result.stderr.trim()}`);
      }

      return true;
    } catch (execError: unknown) {
      // Only errors with severity >= 17 will cause sqlcmd to exit with non-zero code
      // Re-throw to be handled by outer catch block
      throw execError;
    }
  }
  catch (e) {
    let message = (e as Record<string, unknown>).message || e;

    // Include stdout and stderr if available from exec error
    if ((e as Record<string, unknown>).stdout) {
      message += `\n SQL Server message: ${(e as Record<string, unknown>).stdout}`;
    }
    if ((e as Record<string, unknown>).stderr) {
      message += `\n SQL Server error: ${(e as Record<string, unknown>).stderr}`;
    }

    // Mask password in error messages
    const errorMessage = sqlConfig.password ? this.maskPassword(String(message), sqlConfig.password) : String(message);
    logError("Error executing batch SQL file: " + errorMessage);
    return false;
  }
 }

 private maskPassword(input: string, password: string, replaceWith: string = 'XXXXX'): string {
  return input.replace(password, replaceWith);
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