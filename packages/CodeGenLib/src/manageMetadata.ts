/* Steps in this process are:
   1) Create New Entity Records from new tables
   2) 

   */

import { DataSource } from "typeorm";
import { configInfo, mj_core_schema } from './config';
import { EntityInfo, LogError, LogStatus, Metadata } from "@memberjunction/core";
import { logError, logStatus } from "./logging";
import { recompileAllBaseViews } from "./sql";
import { AdvancedGeneration, EntityDescriptionResult, EntityNameResult } from "./advanced_generation";

export const newEntityList: string[] = [];

export async function manageMetadata(ds: DataSource): Promise<boolean> {
   const md = new Metadata();

   let bSuccess = true;
   if (! await createNewEntities(ds)) {
      logError('Error creating new entities');
      bSuccess = false;
   }  
   if (! await updateExistingEntitiesFromSchema(ds)) {
      logError('Error updating existing entities');
      bSuccess = false;
   }  
   if (! await recompileAllBaseViews(ds, true)) {
      logError('Warning: Non-Fatal error recompiling base views');
      // many times the former versions of base views will NOT succesfully recompile, so don't consider that scenario to be a 
      // failure for this entire function
   }         

   if (! await manageEntityFields(ds)) {
      logError('Error managing entity fields');
      bSuccess = false;
   }
   if (! await manageEntityRelationships(ds, md)) {
      logError('Error managing entity relationships');
      bSuccess = false;
   }

   if (newEntityList.length > 0) {
      await generateNewEntityDescriptions(ds, md);
   }

   // if (! await manageVirtualEntities(ds)) {
   //    logError('Error managing virtual entities');
   //    bSuccess = false;
   // }

   // now - we need to tell our metadata object to refresh itself
   await md.Refresh();

   return bSuccess;
}

// COMMENTED OUT FOR NOW - FUTURE FUNCTIONALITY...
// ------------------------------------------------
// export async function manageVirtualEntities(ds: DataSource): Promise<boolean> {
//    let bSuccess = true;
//    // virtual entities are records defined in the entity metadata and do NOT define a distinct base table
//    // but they do specify a base view. We DO NOT generate a base view for a virtual entity, we simply use it to figure
//    // out the fields that should be in the entity definition and add/update/delete the entity definition to match what's in the view when this runs
//    const sql = 'SELECT * FROM vwEntities WHERE VirtualEntity = 1';
//    const virtualEntities = await ds.query(sql);
//    if (virtualEntities && virtualEntities.length > 0) {
//       // we have 1+ virtual entities, now loop through them and process each one
//       for (const ve of virtualEntities) {
//          if (! await manageSingleVirtualEntity(ds, ve)) {
//             logError(`Error managing virtual entity ${ve.Name}`);
//             bSuccess = false;
//          }
//       }
//    }
//    return bSuccess;
// }

// async function manageSingleVirtualEntity(ds: DataSource, ve: any): Promise<boolean> {
//    try {
//       // for a given virtual entity, we need to loop through the fields that exist in the current SQL definition for the view
//       // and add/update/delete the entity fields to match what's in the view
//       let bSuccess = true;

//       const sql = `SELECT * FROM vwSQLColumnsAndEntityFields WHERE EntityID = ${ve.ID}`;
//       const veFields = await ds.query(sql);
//       if (veFields && veFields.length > 0) {
//          // we have 1+ fields, now loop through them and process each one
//          // first though, remove any fields that are no longer in the view
//          const md = new Metadata();
//          const entity = md.Entities.find(e => e.Name === ve.Name);
//          if (entity) {
//             const removeList = [];
//             const fieldsToRemove = entity.Fields.filter(f => !veFields.find(vf => vf.FieldName === f.Name));
//             for (const f of fieldsToRemove) {
//                removeList.push(f.ID);
//             }
//             const sqlRemove = `DELETE FROM [${mj_core_schema()}].EntityField WHERE ID IN (${removeList.join(',')})`;
//             await ds.query(sqlRemove); // this removes the fields that shouldn't be there anymore
//          }

//          for (const vef of veFields) {
//             if (! await manageSingleVirtualEntityField(ds, ve, vef)) {
//                logError(`Error managing virtual entity field ${vef.FieldName} for virtual entity ${ve.Name}`);
//                bSuccess = false;
//             }
//          }
//       }

//       // finally make sure we update the UpdatedAt field for the entity
//       const sqlUpdate = `UPDATE [${mj_core_schema()}].Entity SET UpdatedAt=GETDATE() WHERE ID = ${ve.ID}`;
//       await ds.query(sqlUpdate);

//       return true;
//    }
//    catch (e) {
//       logError(e);
//       return false;
//    }

// }

// async function manageSingleVirtualEntityField(ds: DataSource, ve: any, veField: any): Promise<boolean> {
//    // this function checks to see if the field exists in the entity definition, and if not, adds it
//    // if it exist it updates the entity field to match the view's data type and nullability attributes

//    // first, get the entity definition
//    const md = new Metadata();
//    const entity = md.Entities.find(e => e.Name === ve.Name);
//    if (entity) {
//       const field = entity.Fields.find(f => f.Name === veField.FieldName);
//       if (field) {
//          // have a match, so the field exists in the entity definition, now check to see if it needs to be updated
//          if (field.Type !== veField.Type || field.AllowsNull !== veField.AllowsNull) {
//             // the field needs to be updated, so update it
//             const sqlUpdate = `UPDATE [${mj_core_schema()}].EntityField SET Type='${veField.Type}', AllowsNull=${veField.AllowsNull ? 1 : 0}, UpdatedAt=GETDATE() WHERE ID = ${field.ID}`;
//             await ds.query(sqlUpdate);
//          }
//       }
//    }
//    return true;
// }


export async function manageEntityRelationships(ds: DataSource, md: Metadata): Promise<boolean> {
   let bResult: boolean = true;
   bResult = bResult && await manageManyToManyEntityRelationships(ds);
   bResult = bResult && await manageOneToManyEntityRelationships(ds, md);
   return bResult;
}

export async function manageOneToManyEntityRelationships(ds: DataSource, md: Metadata): Promise<boolean> {
   // the way this works is that we look for entities in our catalog and we look for 
   // foreign keys in those entities. For example, if we saw an entity called Persons and that entity
   // had a foreign key linking to an entity called Organizations via a field called OrganizationID, then we would create a relationship
   // record in the EntityRelationship table for that relationships. In that example we would create the 
   // relationship record with the following values:
   //   EntityID = ID of Organizations entity
   //   RelatedEntityID = ID of Persons entity
   //   RelatedEntityJoinField = OrganizationID
   //   Type = "One To Many"
   //   BundleInAPI = 1
   //   DisplayInForm = 1
   //   DisplayName = Persons (name of the entity)
   
   try {
      // STEP 1 - search for all foreign keys in the vwEntityFields view, we use the RelatedEntityID field to determine our FKs
      const sSQL = `SELECT * FROM ${mj_core_schema()}.vwEntityFields WHERE RelatedEntityID IS NOT NULL AND IsVirtual = 0 ORDER BY RelatedEntityID`;
      const entityFields = await ds.query(sSQL);
      // now loop through all of our fkey fields
      for (const f of entityFields) {
         // for each field determine if an existing relationship exists, if not, create it
         const sSQLRelationship = `SELECT * FROM ${mj_core_schema()}.EntityRelationship WHERE EntityID = ${f.RelatedEntityID} AND RelatedEntityID = ${f.EntityID}`;
         const relationships = await ds.query(sSQLRelationship);
         if (relationships && relationships.length === 0) {
            // no relationship exists, so create it
            const e = md.Entities.find(e => e.ID === f.EntityID)
            const sSQLInsert = `INSERT INTO ${mj_core_schema()}.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName) 
                                    VALUES (${f.RelatedEntityID}, ${f.EntityID}, '${f.Name}', 'One To Many', 1, 1, '${e.Name}')`;
            await ds.query(sSQLInsert);
         }
      }
      return true;
   }
   catch (e) {
      logError(e);
      return false;
   }
}

export async function manageManyToManyEntityRelationships(ds: DataSource): Promise<boolean> {
   return true; // not implemented for now
}



export async function manageEntityFields(ds: DataSource): Promise<boolean> {
   let bSuccess = true;
   const startTime: Date = new Date();
   if (! await deleteUnneededEntityFields(ds)) {
      logError ('Error deleting unneeded entity fields');
      bSuccess = false;
   }
   logStatus(`   Deleted unneeded entity fields in ${(new Date().getTime() - startTime.getTime()) / 1000} seconds`);

   const step2StartTime: Date = new Date();
   if (! await updateExistingEntityFieldsFromSchema(ds)) {
      logError ('Error updating existing entity fields from schema')
      bSuccess = false;
   }
   logStatus(`   Updated existing entity fields from schema in ${(new Date().getTime() - step2StartTime.getTime()) / 1000} seconds`);

   const step3StartTime: Date = new Date();
   if (! await createNewEntityFieldsFromSchema(ds)) {
      logError ('Error creating new entity fields from schema')
      bSuccess = false;
   }
   logStatus(`   Created new entity fields from schema in ${(new Date().getTime() - step3StartTime.getTime()) / 1000} seconds`);

   const step4StartTime: Date = new Date();
   if (! await setDefaultColumnWidthWhereNeeded(ds)) {
      logError ('Error setting default column width where needed')
      bSuccess = false;
   }
   logStatus(`   Set default column width where needed in ${(new Date().getTime() - step4StartTime.getTime()) / 1000} seconds`);

   const step5StartTime: Date = new Date();
   if (! await updateEntityFieldDisplayNameWhereNull(ds)) {
      logError('Error updating entity field display name where null');
      bSuccess = false;
   }
   logStatus(`   Updated entity field display name where null in ${(new Date().getTime() - step5StartTime.getTime()) / 1000} seconds`);

   logStatus(`   Total time to manage entity fields: ${(new Date().getTime() - startTime.getTime()) / 1000} seconds`);

   return bSuccess;
}

async function generateNewEntityDescriptions(ds: DataSource, md: Metadata) {
   // for the list of new entities, go through and attempt to generate new entity descriptions
   const ag = new AdvancedGeneration();
   if (ag.featureEnabled('EntityDescriptions')) {
      // we have the feature enabled, so let's loop through the new entities and generate descriptions for them
      const llm = ag.LLM;
      const prompt = ag.getPrompt('EntityDescriptions');
      const systemPrompt = prompt.systemPrompt;
      const userMessage = prompt.userMessage + '\n\n';
      // now loop through the new entities and generate descriptions for them
      for (let e of newEntityList) {
         const data = await ds.query(`SELECT * FROM [${mj_core_schema()}].vwEntities WHERE Name = '${e}'`);
         const fields = await ds.query(`SELECT * FROM [${mj_core_schema()}].vwEntityFields WHERE EntityID = ${data[0].ID}`);
         const entityUserMessage = userMessage + `Entity Name: ${e}, 
                                                  Base Table: ${data[0].BaseTable}, 
                                                  Schema: ${data[0].SchemaName}. 
                                                  Fields: 
                                                  ${fields.map(f => `   ${f.Name}: ${f.Type}`).join('\n')}`;
         const result = await llm.ChatCompletion({
            model: ag.AIModel,
            messages: [
               {
                  role: 'system',
                  content: systemPrompt
               },
               {
                  role: 'user',
                  content: entityUserMessage
               }
            ]
         })
         if (result?.success) {
            const resultText = result?.data.choices[0].message.content;
            try {
               const structuredResult: EntityDescriptionResult = JSON.parse(resultText);
               if (structuredResult?.entityDescription && structuredResult.entityDescription.length > 0) {
                  const ssql = `UPDATE [${mj_core_schema()}].Entity SET Description = '${structuredResult.entityDescription}' WHERE Name = '${e}'`;
                  await ds.query(ssql);
               }
               else {
                  console.warn('   >>> Advanced Generation Error: LLM returned a blank entity description, skipping entity description for entity ' + e);
               }
            }
            catch (e) {
               console.warn('   >>> Advanced Generation Error: LLM returned invalid result, skipping entity description for entity ' + e + '. Result from LLM: ' + resultText, e);
            }
         }
         else {
            console.warn('   >>> Advanced Generation Error: LLM call failed, skipping entity description for entity ' + e);
         }
      }
   }
}

async function updateEntityFieldDisplayNameWhereNull(ds: DataSource): Promise<boolean> {
   try   {
      const fields = await ds.query(`SELECT ID, Name FROM [${mj_core_schema()}].vwEntityFields WHERE DisplayName IS NULL AND Name <> \'ID\'`)
      if (fields && fields.length > 0)
         for (const field of fields) {
            const sDisplayName = stripTrailingChars(convertCamelCaseToHaveSpaces(field.Name), 'ID', true).trim()
            if (sDisplayName.length > 0 && sDisplayName.toLowerCase().trim() !== field.Name.toLowerCase().trim()) {
               const sSQL = `UPDATE [${mj_core_schema()}].EntityField SET UpdatedAt=GETDATE(), DisplayName = '${sDisplayName}' WHERE ID = ${field.ID}`
               await ds.query(sSQL)
            }
         }
      
      return true;
   }
   catch (e) {
      logError(e);
      return false;
   }
}

async function setDefaultColumnWidthWhereNeeded(ds: DataSource): Promise<boolean> {
   try   {
      await ds.query(`EXEC ${mj_core_schema()}.spSetDefaultColumnWidthWhereNeeded`)
      return true;
   }
   catch (e) {
      logError(e);
      return false;
   }
}
function getPendingEntityFieldsSELECTSQL(): string {
   const sSQL = `WITH NumberedRows AS (
SELECT 
   sf.EntityID,
   sf.Sequence,
   sf.FieldName,
   sf.Description,
   sf.Type,
   sf.Length,
   sf.Precision,
   sf.Scale,
   sf.AllowsNull,
   sf.DefaultValue,
   sf.AutoIncrement,
   IIF(sf.IsVirtual = 1, 0, IIF(sf.FieldName = 'CreatedAt' OR sf.FieldName = 'UpdatedAt' OR sf.FieldName = 'ID', 0, 1)) AllowUpdateAPI,
   sf.IsVirtual,
   re.ID RelatedEntityID,
   fk.referenced_column RelatedEntityFieldName,
   IIF(sf.FieldName = 'Name', 1, 0) IsNameField,
   IsPrimaryKey =	CASE 
         WHEN pk.ColumnName IS NOT NULL THEN 1 
         ELSE 0 
      END,
   IsUnique =		CASE 
         WHEN pk.ColumnName IS NOT NULL THEN 1 
         ELSE 
            CASE 
               WHEN uk.ColumnName IS NOT NULL THEN 1 
               ELSE 0 
            END 
      END,
   ROW_NUMBER() OVER (PARTITION BY sf.EntityID, sf.FieldName ORDER BY (SELECT NULL)) AS rn
FROM
   [${mj_core_schema()}].vwSQLColumnsAndEntityFields sf
LEFT OUTER JOIN	
   [${mj_core_schema()}].Entity e
ON
   sf.EntityID = e.ID
LEFT OUTER JOIN
   [${mj_core_schema()}].vwForeignKeys fk
ON
   sf.FieldName = fk.[column] AND
   e.BaseTable = fk.[table] AND
   e.SchemaName = fk.[schema_name]
LEFT OUTER JOIN 
   [${mj_core_schema()}].Entity re -- Related Entity
ON
   re.BaseTable = fk.referenced_table AND
   re.SchemaName = fk.[schema_name]
LEFT OUTER JOIN 
   [${mj_core_schema()}].vwTablePrimaryKeys pk
ON
   e.BaseTable = pk.TableName AND
   sf.FieldName = pk.ColumnName AND
   e.SchemaName = pk.SchemaName
LEFT OUTER JOIN 
   [${mj_core_schema()}].vwTableUniqueKeys uk
ON
   e.BaseTable = uk.TableName AND
   sf.FieldName = uk.ColumnName AND
   e.SchemaName = uk.SchemaName
WHERE
   EntityFieldID IS NULL -- only where we have NOT YET CREATED EntityField records\n${createExcludeTablesAndSchemasFilter('sf.')}
)
SELECT 
   * 
FROM 
   NumberedRows WHERE rn = 1 -- if someone has two foreign keys with same to/from table and field name this makes sure we only get the field info ONCE 
ORDER BY EntityID, Sequence`
   return sSQL;
}
function getPendingEntityFieldINSERTSQL(n: any): string {
   const bDefaultInView: boolean = (n.FieldName?.trim().toLowerCase() === 'id' || 
                                    n.FieldName?.trim().toLowerCase() === 'name' || 
                                    n.Sequence <= configInfo.newEntityDefaults?.IncludeFirstNFieldsAsDefaultInView ||
                                    n.IsNameField ? true : false);
   const escapedDescription = n.Description ? `'${n.Description.replace(/'/g, "''")}'` : 'NULL';
   return `
   INSERT INTO [${mj_core_schema()}].EntityField
   (
      EntityID,
      Sequence,
      Name,
      DisplayName,
      Description,
      Type,
      Length,
      Precision,
      Scale,
      AllowsNull,
      DefaultValue,
      AutoIncrement,
      AllowUpdateAPI,
      IsVirtual,
      RelatedEntityID,
      RelatedEntityFieldName,
      IsNameField,
      IncludeInUserSearchAPI,
      IncludeRelatedEntityNameFieldInBaseView,
      DefaultInView,
      IsPrimaryKey,
      IsUnique
   )
   VALUES
   (
      ${n.EntityID},
      ${n.Sequence},
      '${n.FieldName}',
      '${convertCamelCaseToHaveSpaces(n.FieldName).trim()}',
      ${escapedDescription},
      '${n.Type}',
      ${n.Length},
      ${n.Precision},
      ${n.Scale},
      ${n.AllowsNull ? 1 : 0},
      '${parseDefaultValue(n.DefaultValue)}',
      ${n.AutoIncrement ? 1 : 0},
      ${n.AllowUpdateAPI ? 1 : 0},
      ${n.IsVirtual ? 1 : 0},
      ${n.RelatedEntityID},
      ${n.RelatedEntityFieldName && n.RelatedEntityFieldName.length > 0 ? `'${n.RelatedEntityFieldName}'` : 'NULL'},
      ${n.IsNameField !== null ? n.IsNameField : 0},
      ${n.FieldName === 'ID' || n.IsNameField ? 1 : 0},
      ${n.RelatedEntityID && n.RelatedEntityID > 0 && n.Type.trim().toLowerCase() === 'int' ? 1 : 0},
      ${bDefaultInView ? 1 : 0},
      ${n.IsPrimaryKey},
      ${n.IsUnique}
   )`      
}

function parseDefaultValue(sqlDefaultValue: string): string {
   let sResult: string = null;

   if (sqlDefaultValue !== null && sqlDefaultValue !== undefined) {
      if (sqlDefaultValue.startsWith('(') && sqlDefaultValue.endsWith(')'))
         sResult = sqlDefaultValue.substring(1, sqlDefaultValue.length - 1);
      else
         sResult = sqlDefaultValue;

      if (sResult.toUpperCase().startsWith('N\'') && sResult.endsWith('\''))
         sResult = sResult.substring(2, sResult.length - 1);

      if (sResult.startsWith('\'') && sResult.endsWith('\''))
         sResult = sResult.substring(1, sResult.length - 1);
   }

   return sResult;
}

async function createNewEntityFieldsFromSchema(ds: DataSource): Promise<boolean> {
   try   {
      const sSQL = getPendingEntityFieldsSELECTSQL();
      const newEntityFields = await ds.query(sSQL);
      await ds.transaction(async () => {
         // wrap in a transaction so we get all of it or none of it
         for (let i = 0; i < newEntityFields.length; ++i) {
            const n = newEntityFields[i];
            if (n.EntityID !== null && n.EntityID !== undefined && n.EntityID > 0) {
               // need to check for null entity id = that is because the above query can return candidate Entity Fields but the entities may not have been created if the entities 
               // that would have been created violate rules - such as not having an ID column, etc.
               const sSQLInsert = getPendingEntityFieldINSERTSQL(n);
               await ds.query(sSQLInsert);
               // if we get here, we're okay, otherwise we have an exception, which we want as it blows up transaction   
            }
         }
      });
      
      return true;
   }
   catch (e) {
      logError(e);
      return false;
   }
}

export async function updateEntityFieldRelatedEntityNameFieldMap(ds: DataSource, entityFieldID: number, relatedEntityNameFieldMap: string): Promise<boolean> {
   try   {
      const sSQL = `EXEC [${mj_core_schema()}].spUpdateEntityFieldRelatedEntityNameFieldMap 
      @EntityFieldID=${entityFieldID} ,
      @RelatedEntityNameFieldMap='${relatedEntityNameFieldMap}'`
      
      await ds.query(sSQL)
      return true;
   }
   catch (e) {
      logError(e);
      return false;
   }
}
async function updateExistingEntitiesFromSchema(ds: DataSource): Promise<boolean> {
   try   {
      await ds.query(`EXEC [${mj_core_schema()}].spUpdateExistingEntitiesFromSchema`)
      return true;
   }
   catch (e) {
      logError(e);
      return false;
   }
}
async function updateExistingEntityFieldsFromSchema(ds: DataSource): Promise<boolean> {
   try   {
      await ds.query(`EXEC [${mj_core_schema()}].spUpdateExistingEntityFieldsFromSchema`)
      return true;
   }
   catch (e) {
      logError(e);
      return false;
   }
}
async function deleteUnneededEntityFields(ds: DataSource): Promise<boolean> {
   try   {
      await ds.query(`EXEC [${mj_core_schema()}].spDeleteUnneededEntityFields`)
      return true;
   }
   catch (e) {
      logError(e);
      return false;
   }
}

function createExcludeTablesAndSchemasFilter(fieldPrefix: string): string {
   let sExcludeTables: string = '';
   let sExcludeSchemas: string = '';
   if (configInfo.excludeTables) {
      for (let i = 0; i < configInfo.excludeTables.length; ++i) {
         const t = configInfo.excludeTables[i];
         sExcludeTables += (sExcludeTables.length > 0 ? ' AND ' : '') + 
                           (t.schema.indexOf('%') > -1 ? ` NOT ( ${fieldPrefix}SchemaName LIKE '${t.schema}'` : 
                                                             ` NOT ( ${fieldPrefix}SchemaName = '${t.schema}'`);
         sExcludeTables += (t.table.indexOf('%') > -1 ? ` AND ${fieldPrefix}TableName LIKE '${t.table}') ` : 
                                                        ` AND ${fieldPrefix}TableName = '${t.table}') `);
      }
   }
   if (configInfo.excludeSchemas) {
      for (let i = 0; i < configInfo.excludeSchemas.length; ++i) {
         const s = configInfo.excludeSchemas[i];
         sExcludeSchemas += (sExcludeSchemas.length > 0 ? ' AND ' : '') + 
                            (s.indexOf('%') > -1 ? `${fieldPrefix}SchemaName NOT LIKE '${s}'` : `${fieldPrefix}SchemaName <> '${s}'`);
      }
   }

   const sWhere = (sExcludeTables.length > 0 || sExcludeSchemas.length >0 ? ` AND ` : '') + 
                  (sExcludeTables.length > 0 ? `(${sExcludeTables})` : '') +
                  (sExcludeSchemas.length > 0 ? (sExcludeTables.length > 0 ? ` AND ` : ``) + '(' + sExcludeSchemas + ')' : '');
   return sWhere;
}
async function createNewEntities(ds: DataSource): Promise<boolean> {
   try   {
      const sSQL = `SELECT * FROM [${mj_core_schema()}].vwSQLTablesAndEntities WHERE EntityID IS NULL ` + createExcludeTablesAndSchemasFilter('');
      const newEntities = await ds.query(sSQL);
      if (newEntities && newEntities.length > 0 ) {
         const md = new Metadata()
         await ds.transaction(async () => {
            // wrap in a transaction so we get all of it or none of it
            for ( let i = 0; i < newEntities.length; ++i) {
               // process each of the new entities
               await createNewEntity(ds, newEntities[i], md);
            } 
         })
   
         LogStatus(`   Done creating entities, refreshing metadata to reflect new entities...`)
         await md.Refresh();// refresh now since we've added some new entities
      }
      return true; // if we get here, we succeeded
   }
   catch (e) {
      LogError(e);
      return false;
   }
}

async function shouldCreateNewEntity(ds: DataSource, newEntity: any): Promise<{shouldCreate: boolean, validationMessage: string}> {
   // validate that the new entity meets our criteria for creation
   // criteria:
   // 1) entity has a field that is a primary key
   // validate all of these factors by getting the sql from SQL Server and check the result, if failure, shouldCreate=false and generate validation message, otherwise return empty validation message and true for shouldCreate.

   const query = `EXEC ${Metadata.Provider.ConfigData.MJCoreSchemaName}.spGetPrimaryKeyForTable @TableName='${newEntity.TableName}', @SchemaName='${newEntity.SchemaName}'`;

   try {
       const result = await ds.query(query);
       if (result.length === 0) {
           return { shouldCreate: false, validationMessage: "No primary key found" };
       }

       return { shouldCreate: true, validationMessage: '' };
   } 
   catch (error) {
      const errorMsg = 'Error validating new entity for table:' + newEntity?.TableName;
      console.error(errorMsg, error);
      return { shouldCreate: false, validationMessage: errorMsg };
   }   
}
async function createNewEntityName(newEntity: any): Promise<string> {
   const ag = new AdvancedGeneration();
   if (ag.featureEnabled('EntityNames')) {
      // get the LLM for this entity
      const chat = ag.LLM;
      const prompt = ag.getPrompt('EntityNames')
      const systemPrompt = ag.fillTemplate(prompt.systemPrompt, newEntity);
      const userMessage = ag.fillTemplate(prompt.userMessage, newEntity);
      const result = await chat.ChatCompletion({
         model: ag.AIModel,
         messages: [
            {
               role: 'system',
               content: systemPrompt
            },
            {
               role: 'user',
               content: userMessage
            }
         ]
      })
      if (result?.success) {
         const resultText = result?.data.choices[0].message.content;
         try {
            const structuredResult: EntityNameResult = JSON.parse(resultText);
            if (structuredResult?.entityName) {
               return structuredResult.entityName;
            }   
            else {
               console.warn('   >>> Advanced Generation Error: LLM returned a blank entity name, falling back to simple generated entity name');
               return simpleNewEntityName(newEntity.TableName);
            }
         }
         catch (e) {
            console.warn('   >>> Advanced Generation Error: LLM returned invalid result, falling back to simple generated entity name. Result from LLM: ' + resultText, e);
            return simpleNewEntityName(newEntity.TableName);
         }
      }
      else {
         console.warn('   >>> Advanced Generation Error: LLM call failed, falling back to simple generated entity name.');
         return simpleNewEntityName(newEntity.TableName);
      }
   }
   else {
      return simpleNewEntityName(newEntity.TableName);
   }
}
function simpleNewEntityName(tableName: string): string {
   return convertCamelCaseToHaveSpaces(generatePluralName(tableName));
}

async function createNewEntity(ds: DataSource, newEntity: any, md: Metadata) {
   try {
      const {shouldCreate, validationMessage} = await shouldCreateNewEntity(ds, newEntity);
      if (shouldCreate) {
         // process a single new entity 
         let newEntityName: string = await createNewEntityName(newEntity);
         let suffix = '';
         const existingEntity = md.Entities.find(e => e.Name === newEntityName);
         if (existingEntity) {
            // the generated name is already in place, so we need another name
            // use Entity Name __ SchemaName instead of just the table name as basis
            suffix = '__' + newEntity.SchemaName;
            newEntityName = newEntityName + suffix  
            LogError(`   >>>> WARNING: Entity name already exists, so using ${newEntityName} instead. If you did not intend for this, please rename the ${newEntity.SchemaName}.${newEntity.TableName} table in the database.`)
         }

         // get the next entity ID
         const params = [newEntity.SchemaName];
         const sSQLNewEntityID = `EXEC [${mj_core_schema()}].spGetNextEntityID @SchemaName=@0`;
         const newEntityIDRaw = await ds.query(sSQLNewEntityID, params);
         const newEntityID = newEntityIDRaw && newEntityIDRaw.length > 0 ? newEntityIDRaw[0].NextID : null;
         if (newEntityID && newEntityID > 0) {
            const isNewSchema = await isSchemaNew(ds, newEntity.SchemaName);
            const sSQLInsert = createNewEntityInsertSQL(newEntityID, newEntityName, newEntity, suffix);
            await ds.query(sSQLInsert);
            // if we get here we created a new entity safely, otherwise we get exception

            // add it to the new entity list
            newEntityList.push(newEntityName);

            // next, check if this entity is in a schema that is new (e.g. no other entities have been added to this schema yet), if so and if 
            // our config option is set to create new applications from new schemas, then create a new application for this schema
            if (isNewSchema &&  configInfo.newSchemaDefaults.CreateNewApplicationWithSchemaName) {
               // new schema and config option is to create a new application from the schema name so do that
               
               if (!await applicationExists(ds, newEntity.SchemaName))
                  await createNewApplication(ds, newEntity.SchemaName);                     
            }          
            else {
               // not a new schema, attempt to look up the application for this schema
               await getApplicationIDForSchema(ds, newEntity.SchemaName);
            }        
            // now we have an application ID, but make sure that we are configured to add this new entity to an application at all
            if (configInfo.newEntityDefaults.AddToApplicationWithSchemaName) {
               // we should add this entity to the application
               const sSQLInsertApplicationEntity = `INSERT INTO ${mj_core_schema()}.ApplicationEntity 
                                                         (ApplicationName, EntityID, Sequence) VALUES 
                                                         ('${newEntity.SchemaName}', ${newEntityID}, (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${mj_core_schema()}.ApplicationEntity WHERE ApplicationName = '${newEntity.SchemaName}'))`;
               await ds.query(sSQLInsertApplicationEntity);
            }

            // next up, we need to check if we're configured to add permissions for new entities, and if so, add them
            if (configInfo.newEntityDefaults.PermissionDefaults && configInfo.newEntityDefaults.PermissionDefaults.AutoAddPermissionsForNewEntities) {
               // we are asked to add permissions for new entities, so do that by looping through the permissions and adding them
               const permissions = configInfo.newEntityDefaults.PermissionDefaults.Permissions;
               for (const p of permissions) {
                  const sSQLInsertPermission = `INSERT INTO ${mj_core_schema()}.EntityPermission 
                                                         (EntityID, RoleName, CanRead, CanCreate, CanUpdate, CanDelete) VALUES 
                                                         (${newEntityID}, '${p.RoleName}', ${p.CanRead ? 1 : 0}, ${p.CanCreate ? 1 : 0}, ${p.CanUpdate ? 1 : 0}, ${p.CanDelete ? 1 : 0})`;
                  await ds.query(sSQLInsertPermission);
               }
            }

            LogStatus(`   Created new entity ${newEntityName} for table ${newEntity.SchemaName}.${newEntity.TableName}`)
         }
         else {
            LogError(`ERROR: Unable to get next entity ID for ${newEntity.SchemaName}.${newEntity.TableName} - it is possible that the schema has reached its MAX Id, 
                           check the Schema Info entity for this schema to see if all ID values have been allocated.`)
         }
      }
      else {
         LogStatus(`   Skipping new entity ${newEntity.TableName} because it doesn't qualify to be created. Reason: ${validationMessage}`)
         return;
      }
   }
   catch (e) {
      LogError(`Failed to create new entity ${newEntity?.TableName}`);
   }
}

async function isSchemaNew(ds: DataSource, schemaName: string): Promise<boolean> {
   // check to see if there are any entities in the db with this schema name
   const sSQL: string = `SELECT COUNT(*) AS Count FROM [${mj_core_schema()}].Entity WHERE SchemaName = '${schemaName}'`;
   const result = await ds.query(sSQL);
   return result && result.length > 0 ? result[0].Count === 0 : true;
}

async function createNewApplication(ds: DataSource, appName: string): Promise<number>{
   const sSQL: string = "INSERT INTO [" + mj_core_schema() + "].Application (Name, Description) VALUES ('" + appName + "', 'Generated for Schema'); SELECT @@IDENTITY AS ID";
   const result = await ds.query(sSQL);
   return result && result.length > 0 ? result[0].ID : null;
}

async function applicationExists(ds: DataSource, applicationName: string): Promise<boolean>{
   const sSQL: string = `SELECT ID FROM [${mj_core_schema()}].Application WHERE Name = '${applicationName}'`;
   const result = await ds.query(sSQL);
   return result && result.length > 0 ? result[0].ID > 0 : false;
}

async function getApplicationIDForSchema(ds: DataSource, schemaName: string): Promise<number>{
   const sSQL: string = `SELECT ID FROM [${mj_core_schema()}].Application WHERE Name = '${schemaName}'`;
   const result = await ds.query(sSQL);
   return result && result.length > 0 ? result[0].ID : null;
}

function createNewEntityInsertSQL(newEntityID: number, newEntityName: string, newEntity: any, newEntitySuffix: string): string {
   const newEntityDefaults = configInfo.newEntityDefaults;
   const newEntityDescriptionEscaped = newEntity.Description ? `'${newEntity.Description.replace(/'/g, "''")}` : null;
   const sSQLInsert = `INSERT INTO [${mj_core_schema()}].Entity (
      ID, 
      Name, 
      Description,
      NameSuffix,
      BaseTable, 
      BaseView, 
      SchemaName, 
      IncludeInAPI, 
      AllowUserSearchAPI
      ${newEntityDefaults.TrackRecordChanges === undefined ? '' : ', TrackRecordChanges'}
      ${newEntityDefaults.AuditRecordAccess === undefined ? '' : ', AuditRecordAccess'}
      ${newEntityDefaults.AuditViewRuns === undefined ? '' : ', AuditViewRuns'}
      ${newEntityDefaults.AllowAllRowsAPI === undefined ? '' : ', AllowAllRowsAPI'}
      ${newEntityDefaults.AllowCreateAPI === undefined ? '' : ', AllowCreateAPI'}
      ${newEntityDefaults.AllowUpdateAPI === undefined ? '' : ', AllowUpdateAPI'}
      ${newEntityDefaults.AllowDeleteAPI === undefined ? '' : ', AllowDeleteAPI'}
      ${newEntityDefaults.UserViewMaxRows === undefined ? '' : ', UserViewMaxRows'}
     ) 
     VALUES (
      ${newEntityID},
      '${newEntityName}', 
      ${newEntityDescriptionEscaped ? newEntityDescriptionEscaped : 'NULL' /*if no description, then null*/},
      ${newEntitySuffix && newEntitySuffix.length > 0 ? `'${newEntitySuffix}'` : 'NULL'},
      '${newEntity.TableName}', 
      'vw${generatePluralName(newEntity.TableName) + (newEntitySuffix && newEntitySuffix.length > 0 ? newEntitySuffix : '')}', 
      '${newEntity.SchemaName}',
      1, 
      ${newEntityDefaults.AllowUserSearchAPI === undefined ? 1 : newEntityDefaults.AllowUserSearchAPI ? 1 : 0}
      ${newEntityDefaults.TrackRecordChanges === undefined ? '' : ', ' + (newEntityDefaults.TrackRecordChanges ? '1' : '0')}
      ${newEntityDefaults.AuditRecordAccess === undefined ? '' : ', ' + (newEntityDefaults.AuditRecordAccess ? '1' : '0')}
      ${newEntityDefaults.AuditViewRuns === undefined ? '' : ', ' + (newEntityDefaults.AuditViewRuns ? '1' : '0')}
      ${newEntityDefaults.AllowAllRowsAPI === undefined ? '' : ', ' + (newEntityDefaults.AllowAllRowsAPI ? '1' : '0')}
      ${newEntityDefaults.AllowCreateAPI === undefined ? '' : ', ' + (newEntityDefaults.AllowCreateAPI ? '1' : '0')}
      ${newEntityDefaults.AllowUpdateAPI === undefined ? '' : ', ' + (newEntityDefaults.AllowUpdateAPI ? '1' : '0')}
      ${newEntityDefaults.AllowDeleteAPI === undefined ? '' : ', ' + (newEntityDefaults.AllowDeleteAPI ? '1' : '0')}
      ${newEntityDefaults.UserViewMaxRows === undefined ? '' : ', ' + (newEntityDefaults.UserViewMaxRows)}
     )`;

   return sSQLInsert;
}

function stripTrailingChars(s:string, charsToStrip: string, skipIfExactMatch: boolean): string {
   if (s && charsToStrip) {
      if (s.endsWith(charsToStrip) && (skipIfExactMatch ? s !== charsToStrip : true))
         return s.substring(0, s.length - charsToStrip.length);
      else 
         return s
   }
   else 
      return s;
}

function convertCamelCaseToHaveSpaces(s: string): string {
   let result = '';
   for (let i = 0; i < s.length; ++i) {
      if ( s[i] === s[i].toUpperCase() && // current character is upper case
           i > 0 && // not first character
           s[i - 1] !== ' ' && // previous character is not a space - needed for strings like "Database Version" that already have spaces
           (s[i - 1] !== s[i - 1].toUpperCase()) // previous character is not upper case handles not putting space between I and D in ID as an example of consecutive upper case
         ) {
         result += ' ';
      }
      result += s[i];
   }
   return result;
}

function stripWhitespace(s: string): string {
   return s.replace(/\s/g, '');
}  

function generatePluralName(singularName: string) {
   if (singularName.endsWith('y') && singularName.length > 1) {
       // Check if the letter before 'y' is a vowel
       const secondLastChar = singularName[singularName.length - 2].toLowerCase();
       if ('aeiou'.includes(secondLastChar)) {
           // If it's a vowel, just add 's', example "key/keys"
           return singularName + 's';
       } else {
           // If it's a consonant, replace 'y' with 'ies' - example "party/parties"
           return singularName.substring(0, singularName.length - 1) + 'ies';
       }
   } else if (singularName.endsWith('y')) {
       // If the string is just 'y', treat it like a vowel and just add 's'
       return singularName + 's';
   }
   else if (singularName.endsWith('s')) {
       // Singular name already ends with 's', so just return it
       return singularName;
   }
   else if (singularName.endsWith('ch') || singularName.endsWith('sh') || singularName.endsWith('x') || singularName.endsWith('z')) {
         // If the singular name ends with 'ch', 'sh', 'x', or 'z', add 'es' - example "box/boxes", "index/indexes", "church/churches", "dish/dishes", "buzz/buzzes"
         return singularName + 'es';
   }
   else {
       // For other cases, just add 's'
       return singularName + 's';
   }
} 