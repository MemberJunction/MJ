import { logError } from "./logging";
import fs from 'fs';
import path from 'path';
import { EntityInfo, Metadata } from "@memberjunction/core";
import { DataSource } from "typeorm";
import { outputDir } from "./config";
import { newEntityList } from "./manageMetadata";


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
export function getDBObjectFileName(type: 'view' | 'sp' | 'full_text_search_function', 
                                    schema: string, 
                                    objectName: string, 
                                    isPermissions: boolean,
                                    isGenerated: boolean): string {
                  
   return path.join(schema, `${objectName}.${type}${type==='full_text_search_function' ? '.fulltext' : ''}${isPermissions ? '.permissions' : ''}${isGenerated ? '.generated' : ''}.sql`);
}

export async function recompileAllBaseViews(ds: DataSource, applyPermissions: boolean): Promise<boolean> {
    let bSuccess: boolean = true; // start off true
    const md: Metadata = new Metadata();
    for (let i = 0; i < md.Entities.length; ++i) {  
       // do this in two steps to ensure recompile isn't ever short circuited through code optimization
      const e = md.Entities[i];
      if ( e.BaseViewGenerated && // only do this for entities that have a base view generated
           e.IncludeInAPI && // only do this for entities that are included in the API
           !e.VirtualEntity && // do not include virtual entities
           !newEntityList.includes(e.Name)) {
         // only do this if base view generated and for NON-virtual entities, 
         // custom base views should be defined in the BEFORE SQL Scripts 
         // and NOT for newly created entities         
         bSuccess = await recompileSingleBaseView(ds, e, applyPermissions) && bSuccess;
      }
    }

    if (!bSuccess) {
         // temp thing for debug, let's dump the new entity list to see what's up
         console.warn('New Entity List:');
         console.warn('    ' + newEntityList.join('\n    '));
    }
    return bSuccess;
 }
 
 export async function recompileSingleBaseView(ds: DataSource, entity: EntityInfo, applyPermissions: boolean): Promise<boolean> {
   const file = getDBObjectFileName('view', entity.SchemaName, entity.BaseView, false, entity.BaseViewGenerated);
   const filePath = path.join(outputDir('SQL', true), file);
   if (fs.existsSync(filePath)) {
      const recompileResult = await executeSQLFile(ds, filePath, true)
      if (applyPermissions) {
         // now apply permissions
         const permissionsFile = getDBObjectFileName('view', entity.SchemaName, entity.BaseView, true, entity.BaseViewGenerated);
         const permissionsFilePath = path.join(outputDir('SQL', true), permissionsFile);
         if (fs.existsSync(permissionsFilePath)) {
            return await executeSQLFile(ds, permissionsFilePath, true) && recompileResult;
         }
      }  
      else
         return recompileResult;
   }
   else {
      logError(`     Error Recompiling Base View: File ${filePath} does not exist`)
      return false
   }
 }
 
 export async function executeSQLFile(ds: DataSource, filePath: string, inChunks : boolean): Promise<boolean> {
    const scriptSQL = fs.readFileSync(filePath, 'utf-8');
    return executeSQLScript(ds, scriptSQL, inChunks);
 }
 
 export async function executeSQLScript(ds: DataSource, scriptText: string, inChunks : boolean): Promise<boolean> {
    try {
      if (!scriptText || scriptText.length == 0)
         return true; // nothing to do

       let scriptChunks = [scriptText];
       let bSuccess: boolean = true;

       if (inChunks) 
          scriptChunks = scriptText.split('GO');
 
       await ds.transaction(async () => {
          for (let i = 0; i < scriptChunks.length; ++i) {
            try {
               await ds.query(scriptChunks[i]);// + '\n GO \n');
            }
            catch (innerE) {
               logError(innerE);
               bSuccess = false;
            }
          }
       })
       return bSuccess;
    }
    catch (e) {
       logError(e);
       return false;
    }
 }
 