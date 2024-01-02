import { logError } from "./logging";
import fs from 'fs';
import path from 'path';
import { EntityInfo, Metadata } from "@memberjunction/core";
import { DataSource } from "typeorm";
import { outputDir } from "./config";
import { newEntityList } from "./manageMetadata";


export async function recompileAllBaseViews(ds: DataSource): Promise<boolean> {
    let bSuccess: boolean = true; // start off true
    const md: Metadata = new Metadata();
    for (let i = 0; i < md.Entities.length; ++i) {  
       // do this in two steps to ensure recompile isn't ever short circuited through code optimization
      const e = md.Entities[i];
      if ( e.BaseViewGenerated && 
           !e.VirtualEntity && 
           !newEntityList.includes(e.Name)) {
         // only do this if base view generated and for NON-virtual entities, 
         // custom base views should be defined in the BEFORE SQL Scripts 
         // and NOT for newly created entities         
         bSuccess = await recompileSingleBaseView(ds, e) && bSuccess;
      }
    }

    if (!bSuccess) {
         // temp thing for debug, let's dump the new entity list to see what's up
         console.warn('New Entity List:');
         console.warn('    ' + newEntityList.join('\n    '));
    }
    return bSuccess;
 }
 
 export async function recompileSingleBaseView(ds: DataSource, entity: EntityInfo): Promise<boolean> {
    const filePath = path.join(outputDir('SQL', true), `${entity.BaseView}${entity.BaseViewGenerated ? '.generated' : ''}.sql`);
    if (fs.existsSync(filePath)) 
      return await executeSQLFile(ds, filePath, true)
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
 