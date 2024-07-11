import { logError } from "../Misc/logging";
import fs from 'fs';
import path from 'path';
import { EntityInfo, Metadata } from "@memberjunction/core";
import { DataSource } from "typeorm";
import { outputDir } from "../Config/config";
import { ManageMetadataBase } from "../Database/manage-metadata";
import { RegisterClass } from "@memberjunction/global";


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
            currentLevel.push(entityMap.get(entityName));
         }
     }

     if (currentLevel.length === 0) {
      // we have a cyclical dependency at this level, so we can't continue, instead of bombing completely, throw a warning and include in the final level
      // all of the remaining entities in the dependency Map
      console.warn(`    > Build Entity Levels Tree: Non-Fatal Error: Cyclical Dependency Detected, including remaining entities in final level. Entities: ${Array.from(dependencyMap.keys()).join(', ')}`);
      for (const item of dependencyMap) {
         const entityName = item[0];
         currentLevel.push(entityMap.get(entityName));
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
   const tasks: Promise<boolean>[] = [];
   const concurrencyLimit = 3;

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
     for (const entity of l) {
       tasks.push(this.recompileSingleBaseView(ds, entity, applyPermissions));
       if (tasks.length === concurrencyLimit) {
         bSuccess = (await Promise.all(tasks)).every(result => result) && bSuccess;
         tasks.length = 0; // clear the array
       }
     }
     if (tasks.length > 0) {
       bSuccess = (await Promise.all(tasks)).every(result => result) && bSuccess;
       tasks.length = 0; // clear the array for the next level
     }
   }

   if (!bSuccess) {
     // temp thing for debug, let's dump the new entity list to see what's up
     console.warn('New Entity List:');
     console.warn('    ' + ManageMetadataBase.newEntityList.join('\n    '));
   }

   return bSuccess;
 }



// public async recompileAllBaseViews(ds: DataSource, excludeSchemas: string[], applyPermissions: boolean): Promise<boolean> {
//     let bSuccess: boolean = true; // start off true
//     const md: Metadata = new Metadata();
//     const tasks: Promise<boolean>[] = [];
//     const concurrencyLimit = 5;

//     const filteredEntities = md.Entities.filter(e => !excludeSchemas.includes(e.SchemaName) && e.BaseViewGenerated && e.IncludeInAPI && !e.VirtualEntity && !ManageMetadataBase.newEntityList.includes(e.Name));
//     // filtered entities now has the entities we care about for purposes of recompiling base views. 
//     // what we want to do now is build a dependency order tree. the way this works is that each LEVEL of that dependency order tree
//     // has entities that are NOT dependent on any other entity in that level or any level below it.
//     // we can then process one level at a time, in parallel, and then move on to the next level.
//     // we have the dependency information in the metadata. Each entity has fields and those fields have RelatedEntity info (if they are foreign keys)
//     // so we use that to build the tree.
//     const entityLevelTree = this.buildEntityLevelsTree(filteredEntities);

//     for (let i = 0; i < md.Entities.length; ++i) {  
//       if (!excludeSchemas.includes(md.Entities[i].SchemaName)) {
//          // do this in two steps to ensure recompile isn't ever short circuited through code optimization
//          const e = md.Entities[i];
//          e.RelatedEntities
//          if ( e.BaseViewGenerated && // only do this for entities that have a base view generated
//                e.IncludeInAPI && // only do this for entities that are included in the API
//                !e.VirtualEntity && // do not include virtual entities
//                !ManageMetadataBase.newEntityList.includes(e.Name)) {
//             // only do this if base view generated and for NON-virtual entities, 
//             // custom base views should be defined in the BEFORE SQL Scripts 
//             // and NOT for newly created entities         
//             tasks.push(this.recompileSingleBaseView(ds, e, applyPermissions));
//             if (tasks.length === concurrencyLimit) {
//               bSuccess = (await Promise.all(tasks)).every(result => result) && bSuccess;
//               tasks.length = 0; // clear the array
//             }
//             // bSuccess = await this.recompileSingleBaseView(ds, e, applyPermissions) && bSuccess;
//          }
//       }
//     }

//     // Process any remaining tasks
//     if (tasks.length > 0) {
//       bSuccess = (await Promise.all(tasks)).every(result => result) && bSuccess;
//     }    

//     if (!bSuccess) {
//          // temp thing for debug, let's dump the new entity list to see what's up
//          console.warn('New Entity List:');
//          console.warn('    ' + ManageMetadataBase.newEntityList.join('\n    '));
//     }
//     return bSuccess;
//  }
 
 public async recompileSingleBaseView(ds: DataSource, entity: EntityInfo, applyPermissions: boolean): Promise<boolean> {
   const file = this.getDBObjectFileName('view', entity.SchemaName, entity.BaseView, false, entity.BaseViewGenerated);
   const filePath = path.join(outputDir('SQL', true), file);
   if (fs.existsSync(filePath)) {
      const recompileResult = await this.executeSQLFile(ds, filePath, true)
      if (applyPermissions) {
         // now apply permissions
         const permissionsFile = this.getDBObjectFileName('view', entity.SchemaName, entity.BaseView, true, entity.BaseViewGenerated);
         const permissionsFilePath = path.join(outputDir('SQL', true), permissionsFile);
         if (fs.existsSync(permissionsFilePath)) {
            return await this.executeSQLFile(ds, permissionsFilePath, true) && recompileResult;
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
 
 public async executeSQLFile(ds: DataSource, filePath: string, inChunks : boolean): Promise<boolean> {
    const scriptSQL = fs.readFileSync(filePath, 'utf-8');
    return this.executeSQLScript(ds, scriptSQL, inChunks);
 }
 
 public async executeSQLScript(ds: DataSource, scriptText: string, inChunks : boolean): Promise<boolean> {
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
}