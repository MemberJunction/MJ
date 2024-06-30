import { DataSource } from "typeorm";
import { configInfo, mj_core_schema } from '../Config/config';
import { CodeNameFromString, EntityInfo, ExtractActualDefaultValue, LogError, LogStatus, Metadata, SeverityType } from "@memberjunction/core";
import { logError, logMessage, logStatus, logWarning } from "../Misc/logging";
import { SQLUtilityBase } from "./sql";
import { AdvancedGeneration, EntityDescriptionResult, EntityNameResult } from "../Misc/advanced_generation";
import { MJGlobal, RegisterClass } from "@memberjunction/global";


/**
 * Base class for managing metadata within the CodeGen system. This class can be sub-classed to extend/override base class functionality. Make sure to use the RegisterClass decorator from the @memberjunction/global package
 * to properly register your subclass with a priority of 1+ to ensure it gets instantiated. 
 */
@RegisterClass(ManageMetadataBase)
export class ManageMetadataBase {
   private static _newEntityList: string[] = [];
   public static get newEntityList(): string[] {
      return this._newEntityList;
   }

   /**
    * Primary function to manage metadata within the CodeGen system. This function will call a series of sub-functions to manage the metadata.
    * @param ds - the DataSource object to use for querying and updating the database
    * @returns 
    */
   public async manageMetadata(ds: DataSource): Promise<boolean> {
      const md = new Metadata();
      const excludeSchemas = configInfo.excludeSchemas ? configInfo.excludeSchemas : [];
   
      let bSuccess = true;
      if (! await this.createNewEntities(ds)) {
         logError('Error creating new entities');
         bSuccess = false;
      }  
      if (! await this.updateExistingEntitiesFromSchema(ds, excludeSchemas)) {
         logError('Error updating existing entities');
         bSuccess = false;
      }  
      const sqlUtility = MJGlobal.Instance.ClassFactory.CreateInstance<SQLUtilityBase>(SQLUtilityBase);
      if (! await sqlUtility.recompileAllBaseViews(ds, excludeSchemas, true)) {
         logMessage('Warning: Non-Fatal error recompiling base views', SeverityType.Warning, false);
         // many times the former versions of base views will NOT succesfully recompile, so don't consider that scenario to be a 
         // failure for this entire function
      }         
   
      if (! await this.manageEntityFields(ds, excludeSchemas, false)) {
         logError('Error managing entity fields');
         bSuccess = false;
      }
      if (! await this.manageEntityRelationships(ds, excludeSchemas, md)) {
         logError('Error managing entity relationships');
         bSuccess = false;
      }
   
      if (ManageMetadataBase.newEntityList.length > 0) {
         await this.generateNewEntityDescriptions(ds, md); // don't pass excludeSchemas becuase by definition this is the NEW entities we created
      }
   
      if (! await this.manageVirtualEntities(ds)) {
         logError('Error managing virtual entities');
         bSuccess = false;
      }
   
      // now - we need to tell our metadata object to refresh itself
      await md.Refresh();
   
      return bSuccess;
   }
   
   // VIRTUAL ENTITY FUNCTIONALITY IS COMMENTED OUT FOR NOW - FUTURE FUNCTIONALITY...
   // ------------------------------------------------
   protected async manageVirtualEntities(ds: DataSource): Promise<boolean> {
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
      return true; // temp until the above is implemented
   }
   
   protected async manageSingleVirtualEntity(ds: DataSource, ve: any): Promise<boolean> {
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
      return true; // temp until the above is implemented
   }
   
   protected async manageSingleVirtualEntityField(ds: DataSource, ve: any, veField: any): Promise<boolean> {
   //    // this protected checks to see if the field exists in the entity definition, and if not, adds it
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
      return true; // temp until the above is implemented
   }
   
   
   /**
    * This method creates and updates relationships in the metadata based on foreign key relationships in the database.
    * @param ds 
    * @param excludeSchemas - specify any schemas to exclude here and any relationships to/from the specified schemas will be ignored
    * @param md 
    * @returns 
    */
   protected async manageEntityRelationships(ds: DataSource, excludeSchemas: string[], md: Metadata): Promise<boolean> {
      let bResult: boolean = true;
      bResult = bResult && await this.manageManyToManyEntityRelationships(ds, excludeSchemas);
      bResult = bResult && await this.manageOneToManyEntityRelationships(ds, excludeSchemas, md);
      return bResult;
   }
   
   /**
    * Manages 1->M relationships between entities in the metadata based on foreign key relationships in the database.
    * @param ds 
    * @param excludeSchemas - specify any schemas to exclude here and any relationships to/from the specified schemas will be ignored
    * @param md 
    * @returns 
    */
   protected async manageOneToManyEntityRelationships(ds: DataSource, excludeSchemas: string[],  md: Metadata): Promise<boolean> {
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
         const sSQL = `SELECT * 
                       FROM ${mj_core_schema()}.vwEntityFields 
                       WHERE 
                             RelatedEntityID IS NOT NULL AND 
                             IsVirtual = 0 AND 
                             EntityID NOT IN (SELECT ID FROM ${mj_core_schema()}.Entity WHERE SchemaName IN (${excludeSchemas.map(s => `'${s}'`).join(',')}))
                       ORDER BY RelatedEntityID`;
         const entityFields = await ds.query(sSQL);

         // Get the relationship counts for each entity
         const sSQLRelationshipCount = `SELECT EntityID, COUNT(*) AS Count FROM ${mj_core_schema()}.EntityRelationship GROUP BY EntityID`;
         const relationshipCounts = await ds.query(sSQLRelationshipCount);
         const relationshipCountMap = new Map<number, number>();
         for (const rc of relationshipCounts) {
            relationshipCountMap.set(rc.EntityID, rc.Count);
         }

         // now loop through all of our fkey fields
         for (const f of entityFields) {
            // for each field determine if an existing relationship exists, if not, create it
            const sSQLRelationship = `SELECT * FROM ${mj_core_schema()}.EntityRelationship WHERE EntityID = ${f.RelatedEntityID} AND RelatedEntityID = ${f.EntityID}`;
            const relationships = await ds.query(sSQLRelationship);
            if (relationships && relationships.length === 0) {
               // no relationship exists, so create it
               const e = md.Entities.find(e => e.ID === f.EntityID)
               // calculate the sequence by getting the count of existing relationships for the entity and adding 1 and then increment the count for future inserts in this loop
               const relCount = relationshipCountMap.get(f.EntityID) ? relationshipCountMap.get(f.EntityID) : 0;
               const sequence = relCount + 1;
               const sSQLInsert = `INSERT INTO ${mj_core_schema()}.EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) 
                                       VALUES (${f.RelatedEntityID}, ${f.EntityID}, '${f.Name}', 'One To Many', 1, 1, '${e.Name}', ${sequence})`;
               // now update the map for the relationship count
               relationshipCountMap.set(f.EntityID, sequence);                                       
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
   
   /**
    * Manages M->M relationships between entities in the metadata based on foreign key relationships in the database.
    * NOT IMPLEMENTED IN CURRENT VERSION IN BASE CLASS. M->M relationships ARE supported fully, but they are not AUTO generated by this
    * method, instead an administrator must manually create these relationships in the metadata.
    * @param ds 
    * @param excludeSchemas 
    * @returns 
    */
   protected async manageManyToManyEntityRelationships(ds: DataSource, excludeSchemas: string[]): Promise<boolean> {
      return true; // not implemented for now, require the admin to manually create these relationships
   }
   
   /**
    * Manages the creation, updating and deletion of entity field records in the metadata based on the database schema.
    * @param ds 
    * @param excludeSchemas 
    * @returns 
    */
   public async manageEntityFields(ds: DataSource, excludeSchemas: string[], skipCreatedAtUpdatedAtDeletedAtFieldValidation: boolean): Promise<boolean> {
      let bSuccess = true;
      const startTime: Date = new Date();

      if (!skipCreatedAtUpdatedAtDeletedAtFieldValidation) {
         if (!await this.ensureCreatedAtUpdatedAtFieldsExist(ds, excludeSchemas) ||
             !await this.ensureDeletedAtFieldsExist(ds, excludeSchemas)) {
            logError (`Error ensuring ${EntityInfo.CreatedAtFieldName}, ${EntityInfo.UpdatedAtFieldName} and ${EntityInfo.DeletedAtFieldName} fields exist`);
            bSuccess = false;
         }
         logStatus(`   Ensured ${EntityInfo.CreatedAtFieldName}/${EntityInfo.UpdatedAtFieldName}/${EntityInfo.DeletedAtFieldName} fields exist in ${(new Date().getTime() - startTime.getTime()) / 1000} seconds`);
      } 

      const step1StartTime: Date = new Date();
      if (! await this.deleteUnneededEntityFields(ds, excludeSchemas)) {
         logError ('Error deleting unneeded entity fields');
         bSuccess = false;
      }
      logStatus(`   Deleted unneeded entity fields in ${(new Date().getTime() - step1StartTime.getTime()) / 1000} seconds`);
   
      const step2StartTime: Date = new Date();
      if (! await this.updateExistingEntityFieldsFromSchema(ds, excludeSchemas)) {
         logError ('Error updating existing entity fields from schema')
         bSuccess = false;
      }
      logStatus(`   Updated existing entity fields from schema in ${(new Date().getTime() - step2StartTime.getTime()) / 1000} seconds`);
   
      const step3StartTime: Date = new Date();
      if (! await this.createNewEntityFieldsFromSchema(ds)) { // has its own internal filtering for exclude schema/table so don't pass in
         logError ('Error creating new entity fields from schema')
         bSuccess = false;
      }
      logStatus(`   Created new entity fields from schema in ${(new Date().getTime() - step3StartTime.getTime()) / 1000} seconds`);
   
      const step4StartTime: Date = new Date();
      if (! await this.setDefaultColumnWidthWhereNeeded(ds, excludeSchemas)) {
         logError ('Error setting default column width where needed')
         bSuccess = false;
      }
      logStatus(`   Set default column width where needed in ${(new Date().getTime() - step4StartTime.getTime()) / 1000} seconds`);
   
      const step5StartTime: Date = new Date();
      if (! await this.updateEntityFieldDisplayNameWhereNull(ds, excludeSchemas)) {
         logError('Error updating entity field display name where null');
         bSuccess = false;
      }
      logStatus(`   Updated entity field display name where null in ${(new Date().getTime() - step5StartTime.getTime()) / 1000} seconds`);
   
      const step6StartTime: Date = new Date();
      if (! await this.manageEntityFieldValues(ds, excludeSchemas)) {
         logError('Error managing entity field values');
         bSuccess = false;
      }
      logStatus(`   Managed entity field values in ${(new Date().getTime() - step6StartTime.getTime()) / 1000} seconds`);
   
      logStatus(`   Total time to manage entity fields: ${(new Date().getTime() - startTime.getTime()) / 1000} seconds`);
   
      return bSuccess;
   }


   /**
    * This method ensures that the __mj_DeletedAt field exists in each entity that has DeleteType=Soft. If the field does not exist, it is created.
    */
   protected async ensureDeletedAtFieldsExist(ds: DataSource, excludeSchemas: string[]): Promise<boolean> {
      try {
         const sqlEntities = `SELECT * FROM [${mj_core_schema()}].vwEntities WHERE DeleteType='Soft' AND SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})`;
         const entities = await ds.query(sqlEntities);
         let overallResult = true;
         if (entities.length > 0) {
            // we have 1+ entities that need the special fields, so loop through them and ensure the fields exist
            // validate that each entity has the __mj_DeletedAt field, and it is a DATETIMEOFFSET fields, NOT NULL and both are fields that have a DEFAULT value of GETUTCDATE().
            const sql = `SELECT * 
                         FROM INFORMATION_SCHEMA.COLUMNS
                         WHERE 
                         ${entities.map(e => `(TABLE_SCHEMA='${e.SchemaName}' AND TABLE_NAME='${e.BaseTable}')`).join(' OR ')}
                         AND COLUMN_NAME='${EntityInfo.DeletedAtFieldName}'`
            const result = await ds.query(sql);


            for (const e of entities) {
               const eResult = result.filter(r => r.TABLE_NAME === e.BaseTable && r.TABLE_SCHEMA === e.SchemaName); // get just the fields for this entity
               const deletedAt = eResult.find(r => r.COLUMN_NAME.trim().toLowerCase() === EntityInfo.DeletedAtFieldName.trim().toLowerCase());

               // now, if we have the fields, we need to check the default value and update if necessary
               const fieldResult = await this.ensureSpecialDateFieldExistsAndHasCorrectDefaultValue(ds, e, EntityInfo.DeletedAtFieldName, deletedAt, true)

               overallResult = overallResult && fieldResult;
            }
         }
         return overallResult;
      }
      catch (e) {
         logError(e);
         return false;
      }
   }

   /**
    * This method ensures that the __mj_CreatedAt and __mj_UpdatedAt fields exist in each entity that has TrackRecordChanges set to true. If the fields do not exist, they are created.
    * If the fields exist but have incorrect default values, the default values are updated. The default value that is to be used for these special fields is GETUTCDATE() which is the
    * UTC date and time. This method is called as part of the manageEntityFields method and is not intended to be called directly.
    * @param ds 
    */
   protected async ensureCreatedAtUpdatedAtFieldsExist(ds: DataSource, excludeSchemas: string[]): Promise<boolean> {
      try {
         const sqlEntities = `SELECT * FROM [${mj_core_schema()}].vwEntities WHERE TrackRecordChanges = 1 AND SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})`;
         const entities = await ds.query(sqlEntities);
         let overallResult = true;
         if (entities.length > 0) {
            // we have 1+ entities that need the special fields, so loop through them and ensure the fields exist
            // validate that each entity has two specific fields, the first one is __mj_CreatedAt and the second one is __mj_UpdatedAt
            // both are DATETIME fields, NOT NULL and both are fields that have a DEFAULT value of GETUTCDATE().
            const sqlCreatedUpdated = `SELECT * 
                                       FROM INFORMATION_SCHEMA.COLUMNS
                                       WHERE 
                                          ${entities.map(e => `(TABLE_SCHEMA='${e.SchemaName}' AND TABLE_NAME='${e.BaseTable}')`).join(' OR ')}
                                       AND COLUMN_NAME IN ('${EntityInfo.CreatedAtFieldName}','${EntityInfo.UpdatedAtFieldName}')`
            const result = await ds.query(sqlCreatedUpdated);
            for (const e of entities) {
               // result has both created at and updated at fields, so filter on the result for each and do what we need to based on that
               const eResult = result.filter(r => r.TABLE_NAME === e.BaseTable && r.TABLE_SCHEMA === e.SchemaName); // get just the fields for this entity
               const createdAt = eResult.find(r => r.COLUMN_NAME.trim().toLowerCase() === EntityInfo.CreatedAtFieldName.trim().toLowerCase());
               const updatedAt = eResult.find(r => r.COLUMN_NAME.trim().toLowerCase() === EntityInfo.UpdatedAtFieldName.trim().toLowerCase());

               // now, if we have the fields, we need to check the default value and update if necessary
               const fieldResult = await this.ensureSpecialDateFieldExistsAndHasCorrectDefaultValue(ds, e, EntityInfo.CreatedAtFieldName, createdAt, false) &&
                                   await this.ensureSpecialDateFieldExistsAndHasCorrectDefaultValue(ds, e, EntityInfo.UpdatedAtFieldName, updatedAt, false);

               overallResult = overallResult && fieldResult;
            }
         }
         return overallResult;
      }
      catch (e) {
         logError(e);
         return false;
      }
   }

   /**
    * This method handles the validation of the existence of the specified special date field and if it does exist it makes sure the default value is set correctly, if it doesn't exist 
    * it makes sure that it is created. This method is called as part of the ensureCreatedAtUpdatedAtFieldsExist method and is not intended to be called directly.
    * @param entity 
    * @param fieldName 
    * @param currentFieldData 
    */
   protected async ensureSpecialDateFieldExistsAndHasCorrectDefaultValue(ds: DataSource, entity: any, fieldName: string, currentFieldData: any, allowNull: boolean): Promise<boolean> {
      try {
         if (!currentFieldData) {
            // field doesn't exist, let's create it
            const sql = `ALTER TABLE [${entity.SchemaName}].[${entity.BaseTable}] ADD ${fieldName} DATETIMEOFFSET ${allowNull ? 'NULL' : 'NOT NULL DEFAULT GETUTCDATE()'}`;
            await ds.query(sql);
         }
         else {
            // field does exist, let's first check the data type/nullability
            if ( currentFieldData.DATA_TYPE.trim().toLowerCase() !== 'datetimeoffset' || 
                (currentFieldData.IS_NULLABLE.trim().toLowerCase() !== 'no' && !allowNull) || 
                (currentFieldData.IS_NULLABLE.trim().toLowerCase() === 'no' && allowNull)) {
               // the column is the wrong type, or has wrong nullability attribute, so let's update it, first removing the default constraint, then 
               // modifying the column, and finally adding the default constraint back in.
               await this.dropExistingDefaultConstraint(ds, entity, fieldName);
   
               const sql = `ALTER TABLE [${entity.SchemaName}].[${entity.BaseTable}] ALTER COLUMN ${fieldName} DATETIMEOFFSET ${allowNull ? 'NULL' : 'NOT NULL'}`;
               await ds.query(sql);
   
               if (!allowNull)
                  await this.createDefaultConstraintForSpecialDateField(ds, entity, fieldName);
            }
            else {
               // if we get here that means the column is the correct type and nullability, so now let's check the default value, but we only do that if we are dealing with a
               // field that is NOT NULL
               if (!allowNull) {
                  const defaultValue = currentFieldData.COLUMN_DEFAULT;
                  const realDefaultValue = ExtractActualDefaultValue(defaultValue);
                  if (!realDefaultValue || realDefaultValue.trim().toLowerCase() !== 'getutcdate()') {
                     await this.dropAndCreateDefaultConstraintForSpecialDateField(ds, entity, fieldName);
                  }
               } 
            }
         }
         // if we get here, we're good
         return true;   
      }
      catch (e) {
         logError(e);
         return false;
      }
   }

   /**
    * Creates the default constraint for a special date field. This method is called as part of the ensureSpecialDateFieldExistsAndHasCorrectDefaultValue method and is not intended to be called directly.
    */
   protected async createDefaultConstraintForSpecialDateField(ds: DataSource, entity: any, fieldName: string) {
      try {
         const sqlAddDefaultConstraint = `ALTER TABLE [${entity.SchemaName}].[${entity.BaseTable}] ADD CONSTRAINT DF_${entity.SchemaName}_${CodeNameFromString(entity.BaseTable)}_${fieldName} DEFAULT GETUTCDATE() FOR [${fieldName}]`;
         await ds.query(sqlAddDefaultConstraint);   
      }
      catch (e) {
         logError(e);
      }
   }

   /**
    * Drops and recreates the default constraint for a special date field. This method is called as part of the ensureSpecialDateFieldExistsAndHasCorrectDefaultValue method and is not intended to be called directly.
    * @param ds 
    * @param entity 
    * @param fieldName 
    */
   protected async dropAndCreateDefaultConstraintForSpecialDateField(ds: DataSource, entity: any, fieldName: string) {
      // default value is not correct, so let's update it
      await this.dropExistingDefaultConstraint(ds, entity, fieldName);
      await this.createDefaultConstraintForSpecialDateField(ds, entity, fieldName);
   }

   /**
    * Drops an existing default constraint from a given column within a given entity, if it exists
    * @param ds 
    * @param entity 
    * @param fieldName 
    */
   protected async dropExistingDefaultConstraint(ds: DataSource, entity: any, fieldName: string) {
      try {
         const sqlDropDefaultConstraint = `
         DECLARE @constraintName NVARCHAR(255);

         -- Get the default constraint name
         SELECT @constraintName = d.name
         FROM sys.tables t
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         JOIN sys.columns c ON t.object_id = c.object_id
         JOIN sys.default_constraints d ON c.default_object_id = d.object_id
         WHERE s.name = '${entity.SchemaName}' 
         AND t.name = '${entity.BaseTable}' 
         AND c.name = '${fieldName}';

         -- Drop the default constraint if it exists
         IF @constraintName IS NOT NULL
         BEGIN
            EXEC('ALTER TABLE [${entity.SchemaName}].[${entity.BaseTable}] DROP CONSTRAINT ' + @constraintName);
         END
         `;
         await ds.query(sqlDropDefaultConstraint);      
      }
      catch (e) {
         logError(e);
      }
   }

   
   /**
    * This method generates descriptions for entities in teh system where there is no existing description. This is an experimental feature and is done using AI. In order for it
    * to be invoked, the EntityDescriptions feature must be enabled in the Advanced Generation configuration.
    * @param ds 
    * @param md 
    */
   protected async generateNewEntityDescriptions(ds: DataSource, md: Metadata) {
      // for the list of new entities, go through and attempt to generate new entity descriptions
      const ag = new AdvancedGeneration();
      if (ag.featureEnabled('EntityDescriptions')) {
         // we have the feature enabled, so let's loop through the new entities and generate descriptions for them
         const llm = ag.LLM;
         const prompt = ag.getPrompt('EntityDescriptions');
         const systemPrompt = prompt.systemPrompt;
         const userMessage = prompt.userMessage + '\n\n';
         // now loop through the new entities and generate descriptions for them
         for (let e of ManageMetadataBase.newEntityList) {
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
   
   /**
    * This method is responsible for generating a Display Name for each field where a display name is not already set. The approach in the base class
    * uses a simple algorithm that looks for case changes in the field name and inserts spaces at those points. It also strips the trailing 'ID' from the field name if it exists.
    * Override this method in a sub-class if you would like to implement a different approach for generating display names.
    * @param ds 
    * @param excludeSchemas 
    * @returns 
    */
   protected async updateEntityFieldDisplayNameWhereNull(ds: DataSource, excludeSchemas: string[]): Promise<boolean> {
      try   {
         const sql = `SELECT 
                        ef.ID, ef.Name 
                      FROM 
                        [${mj_core_schema()}].vwEntityFields ef
                      INNER JOIN
                        [${mj_core_schema()}].vwEntities e
                      ON
                        ef.EntityID = e.ID
                      WHERE 
                        ef.DisplayName IS NULL AND 
                        ef.DisplayName <> ef.Name AND
                        ef.Name <> \'ID\' AND
                        e.SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})
                        ` 
         const fields = await ds.query(sql)
         if (fields && fields.length > 0)
            for (const field of fields) {
               const sDisplayName = this.stripTrailingChars(this.convertCamelCaseToHaveSpaces(field.Name), 'ID', true).trim()
               if (sDisplayName.length > 0 && sDisplayName.toLowerCase().trim() !== field.Name.toLowerCase().trim()) {
                  const sSQL = `UPDATE [${mj_core_schema()}].EntityField SET ${EntityInfo.UpdatedAtFieldName}=GETUTCDATE(), DisplayName = '${sDisplayName}' WHERE ID = ${field.ID}`
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
   
   /**
    * This method updates the DefaultColumnWidth field in the EntityField metadata. The default logic uses a stored procedure called spSetDefaultColumnWidthWhereNeeded
    * which is part of the MJ Core Schema. You can override this method to implement custom logic for setting default column widths. It is NOT recommended to 
    * modify the stored procedure in the MJ Core Schema because your changes will be overriden during a future upgrade.
    * @param ds 
    * @param excludeSchemas 
    * @returns 
    */
   protected async setDefaultColumnWidthWhereNeeded(ds: DataSource, excludeSchemas: string[]): Promise<boolean> {
      try   {
         await ds.query(`EXEC ${mj_core_schema()}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='${excludeSchemas.join(',')}'`)
         return true;
      }
      catch (e) {
         logError(e);
         return false;
      }
   }

   /**
    * Creates a SQL statement to retrieve all of the pending entity fields that need to be created in the metadata. This method looks for fields that exist in the underlying
    * database but are NOT in the metadata.  
    */
   protected getPendingEntityFieldsSELECTSQL(): string {
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
      IIF(sf.IsVirtual = 1, 0, IIF(sf.FieldName = '${EntityInfo.CreatedAtFieldName}' OR sf.FieldName = '${EntityInfo.UpdatedAtFieldName}' OR sf.FieldName = 'ID', 0, 1)) AllowUpdateAPI,
      sf.IsVirtual,
      e.RelationshipDefaultDisplayType,
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
      re.SchemaName = fk.[referenced_schema]
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
      EntityFieldID IS NULL -- only where we have NOT YET CREATED EntityField records\n${this.createExcludeTablesAndSchemasFilter('sf.')}
   )
   SELECT 
      * 
   FROM 
      NumberedRows WHERE rn = 1 -- if someone has two foreign keys with same to/from table and field name this makes sure we only get the field info ONCE 
   ORDER BY EntityID, Sequence`
      return sSQL;
   }

   /**
    * This method builds a SQL Statement that will insert a row into the EntityField table with information about a new field.
    * @param n - the new field
    * @returns 
    */
   protected getPendingEntityFieldINSERTSQL(n: any): string {
      const bDefaultInView: boolean = (n.FieldName?.trim().toLowerCase() === 'id' || 
                                       n.FieldName?.trim().toLowerCase() === 'name' || 
                                       n.Sequence <= configInfo.newEntityDefaults?.IncludeFirstNFieldsAsDefaultInView ||
                                       n.IsNameField ? true : false);
      const escapedDescription = n.Description ? `'${n.Description.replace(/'/g, "''")}'` : 'NULL';
      let fieldDisplayName: string = '';
      switch (n.FieldName.trim().toLowerCase()) {
         case EntityInfo.CreatedAtFieldName.trim().toLowerCase():
            fieldDisplayName = "Created At";
            break;
         case EntityInfo.UpdatedAtFieldName.trim().toLowerCase():
            fieldDisplayName = "Updated At";
            break;
         default:
            fieldDisplayName = this.convertCamelCaseToHaveSpaces(n.FieldName).trim();
            break;
      }
      
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
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         ${n.EntityID},
         ${n.Sequence},
         '${n.FieldName}',
         '${fieldDisplayName}',
         ${escapedDescription},
         '${n.Type}',
         ${n.Length},
         ${n.Precision},
         ${n.Scale},
         ${n.AllowsNull ? 1 : 0},
         '${this.parseDefaultValue(n.DefaultValue)}',
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
         ${n.IsUnique},
         '${n.RelationshipDefaultDisplayType}'
      )`      
   }
   
   /**
    * This method takes the stored DEFAULT CONSTRAINT value from the database and parses it to retrieve the actual default value. This is necessary because the default value is 
    * sometimes wrapped in parentheses and sometimes wrapped in single quotes. This method removes the wrapping characters and returns the actual default value. Some common raw values
    * that exist in SQL Server include 'getdate()', '(getdate())', 'N''SomeValue''', etc. and this method will remove those wrapping characters to get the actual underlying default value.
    * NOTE: For future versions of MemberJunction where multiple back-end providers could be used, this method will be moved to the Provider architecture so that database-specific versions
    * can be implemented, along with many other aspects of this current codebase.
    * @param sqlDefaultValue 
    * @returns 
    */
   protected parseDefaultValue(sqlDefaultValue: string): string {
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
   
   protected async createNewEntityFieldsFromSchema(ds: DataSource): Promise<boolean> {
      try   {
         const sSQL = this.getPendingEntityFieldsSELECTSQL();
         const newEntityFields = await ds.query(sSQL);
         await ds.transaction(async () => {
            // wrap in a transaction so we get all of it or none of it
            for (let i = 0; i < newEntityFields.length; ++i) {
               const n = newEntityFields[i];
               if (n.EntityID !== null && n.EntityID !== undefined && n.EntityID > 0) {
                  // need to check for null entity id = that is because the above query can return candidate Entity Fields but the entities may not have been created if the entities 
                  // that would have been created violate rules - such as not having an ID column, etc.
                  const sSQLInsert = this.getPendingEntityFieldINSERTSQL(n);
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
   
   /**
    * This method handles updating entity field related name field maps which is basically the process of finding the related entity field that is the "name" field for the related entity.
    * @param ds 
    * @param entityFieldID 
    * @param relatedEntityNameFieldMap 
    * @returns 
    */
   public async updateEntityFieldRelatedEntityNameFieldMap(ds: DataSource, entityFieldID: number, relatedEntityNameFieldMap: string): Promise<boolean> {
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
   protected async updateExistingEntitiesFromSchema(ds: DataSource, excludeSchemas: string[]): Promise<boolean> {
      try   {
         await ds.query(`EXEC [${mj_core_schema()}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='${excludeSchemas.join(',')}'`)
         return true;
      }
      catch (e) {
         logError(e);
         return false;
      }
   }
   protected async updateExistingEntityFieldsFromSchema(ds: DataSource, excludeSchemas: string[]): Promise<boolean> {
      try   {
         await ds.query(`EXEC [${mj_core_schema()}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='${excludeSchemas.join(',')}'`)
         return true;
      }
      catch (e) {
         logError(e);
         return false;
      }
   }
   protected async deleteUnneededEntityFields(ds: DataSource, excludeSchemas: string[]): Promise<boolean> {
      try   {
         await ds.query(`EXEC [${mj_core_schema()}].spDeleteUnneededEntityFields @ExcludedSchemaNames='${excludeSchemas.join(',')}'`)
         return true;
      }
      catch (e) {
         logError(e);
         return false;
      }
   }
   
   protected async manageEntityFieldValues(ds: DataSource, excludeSchemas: string[]): Promise<boolean> {
      try  {
         // here we want to get all of the entity fields that have check constraints attached to them. For each field that has a check constraint, we want to 
         // evaluate it to see if it is a simple series of OR statements or not, if it is a simple series of OR statements, we can parse the possible values
         // for the field and sync that up with the EntityFieldValue table. If it is not a simple series of OR statements, we will not be able to parse it and we'll 
         // just ignore it.
         const filter = excludeSchemas && excludeSchemas.length > 0 ? ` WHERE SchemaName NOT IN (${excludeSchemas.map(s => `'${s}'`).join(',')})` : '';
         const sSQL = `SELECT * FROM [${mj_core_schema()}].vwEntityFieldsWithCheckConstraints${filter}`
         const result = await ds.query(sSQL);
         // now, for each of the constraints we get back here, loop through and evaluate if they're simple and if they're simple, parse and sync with entity field values for that field
         for (const r of result) {
            if (r.ConstraintDefinition && r.ConstraintDefinition.length > 0) {
               const parsedValues = this.parseCheckConstraintValues(r.ConstraintDefinition, r.ColumnName, r.EntityName);
               if (parsedValues) {
                  // flip the order of parsedValues because they come out in reverse order from SQL Server
                  parsedValues.reverse();

                  // we have parsed values from the check constraint, so sync them with the entity field values
                  await this.syncEntityFieldValues(ds, r.EntityFieldID, parsedValues);
                  
                  // finally, make sure the ValueListType column within the EntityField table is set to "List" because for check constraints we only allow the values specified in the list.
                  await ds.query(`UPDATE [${mj_core_schema()}].EntityField SET ValueListType='List' WHERE ID='${r.EntityFieldID}'`)
               }
            }
         }
   
   
         return true;
      }
      catch (e) {
         logError(e);
         return false;
      }
   }
   
   protected async syncEntityFieldValues(ds: DataSource, entityFieldID: number, possibleValues: string[]): Promise<boolean> {
      try {
         // first, get a list of all of the existing entity field values for the field already in the database
         const sSQL = `SELECT * FROM [${mj_core_schema()}].EntityFieldValue WHERE EntityFieldID= '${entityFieldID}'`;
         const existingValues = await ds.query(sSQL);
         // now, loop through the possible values and add any that are not already in the database
   
         // Step 1: for any existing value that is NOT in the list of possible Values, delete it
         let numRemoved: number = 0;
         await ds.transaction(async () => {
            for (const ev of existingValues) {
               if (!possibleValues.find(v => v === ev.Value)) {
                  // delete the value from the database
                  const sSQLDelete = `DELETE FROM [${mj_core_schema()}].EntityFieldValue WHERE ID='${ev.ID}'`;
                  await ds.query(sSQLDelete);
                  numRemoved++;
               }
            }
   
            // Step 2: for any possible value that is NOT in the list of existing values, add it
            let numAdded = 0;
            for (const v of possibleValues) {
               if (!existingValues.find(ev => ev.Value === v)) {
                  // add the value to the database
                  const sSQLInsert = `INSERT INTO [${mj_core_schema()}].EntityFieldValue 
                                       (EntityFieldID, Sequence, Value, Code) 
                                    VALUES 
                                       ('${entityFieldID}', ${1 + possibleValues.indexOf(v)}, '${v}', '${v}')`;
                  await ds.query(sSQLInsert);
                  numAdded++;
               }
            }
   
            // Step 3: finally, for the existing values that are in the list of possible values, update the sequence to match the order in the possible values list
            let numUpdated = 0;
            for (const v of possibleValues) {
               const ev = existingValues.find(ev => ev.Value === v);
               if (ev) {
                  // update the sequence to match the order in the possible values list
                  const sSQLUpdate = `UPDATE [${mj_core_schema()}].EntityFieldValue SET Sequence=${1 + possibleValues.indexOf(v)} WHERE ID='${ev.ID}'`;
                  await ds.query(sSQLUpdate);
                  numUpdated++;
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
   
   protected parseCheckConstraintValues(constraintDefinition: string, fieldName: string, entityName: string): string[] | null {
      // This regex checks for the overall structure including field name and 'OR' sequences
      // an example of a valid constraint definition would be: ([FieldName]='Value1' OR [FieldName]='Value2' OR [FieldName]='Value3')
      // like: ([AutoRunIntervalUnits]='Years' OR [AutoRunIntervalUnits]='Months' OR [AutoRunIntervalUnits]='Weeks' OR [AutoRunIntervalUnits]='Days' OR [AutoRunIntervalUnits]='Hours' OR [AutoRunIntervalUnits]='Minutes')
      // Note: Assuming fieldName does not contain regex special characters; otherwise, it needs to be escaped as well.
      const structureRegex = new RegExp(`^\\(\\[${fieldName}\\]='[^']+'(?: OR \\[${fieldName}\\]='[^']+?')+\\)$`);
      if (!structureRegex.test(constraintDefinition)) {
         logWarning(`      [${entityName}].[${fieldName}] constraint does not match the simple OR condition pattern or field name does not match: ${constraintDefinition}`);
         return null;
      }
   
      // Regular expression to match the values within the single quotes specifically for the field
      const valueRegex = new RegExp(`\\[${fieldName}\\]='([^']+)\'`, 'g');
      let match;
      const possibleValues: string[] = [];
   
      // Use regex to find matches and extract the values
      while ((match = valueRegex.exec(constraintDefinition)) !== null) {
          // This is necessary to avoid infinite loops with zero-width matches
          if (match.index === valueRegex.lastIndex) {
              valueRegex.lastIndex++;
          }
   
          // The first captured group contains the value
          if (match[1]) {
              possibleValues.push(match[1]);
          }
      }
   
      return possibleValues;
   }
   
   
   protected createExcludeTablesAndSchemasFilter(fieldPrefix: string): string {
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

   protected async createNewEntities(ds: DataSource): Promise<boolean> {
      try   {
         const sSQL = `SELECT * FROM [${mj_core_schema()}].vwSQLTablesAndEntities WHERE EntityID IS NULL ` + this.createExcludeTablesAndSchemasFilter('');
         const newEntities = await ds.query(sSQL);
         if (newEntities && newEntities.length > 0 ) {
            const md = new Metadata()
            await ds.transaction(async () => {
               // wrap in a transaction so we get all of it or none of it
               for ( let i = 0; i < newEntities.length; ++i) {
                  // process each of the new entities
                  await this.createNewEntity(ds, newEntities[i], md);
               } 
            })
      
            if (ManageMetadataBase.newEntityList.length > 0) {
               // only do this if we actually created new entities
               LogStatus(`   Done creating entities, refreshing metadata to reflect new entities...`)
               await md.Refresh();// refresh now since we've added some new entities   
            }
         }
         return true; // if we get here, we succeeded
      }
      catch (e) {
         LogError(e);
         return false;
      }
   }
   
   protected async shouldCreateNewEntity(ds: DataSource, newEntity: any): Promise<{shouldCreate: boolean, validationMessage: string}> {
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
   protected async createNewEntityName(newEntity: any): Promise<string> {
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
                  return this.simpleNewEntityName(newEntity.TableName);
               }
            }
            catch (e) {
               console.warn('   >>> Advanced Generation Error: LLM returned invalid result, falling back to simple generated entity name. Result from LLM: ' + resultText, e);
               return this.simpleNewEntityName(newEntity.TableName);
            }
         }
         else {
            console.warn('   >>> Advanced Generation Error: LLM call failed, falling back to simple generated entity name.');
            return this.simpleNewEntityName(newEntity.TableName);
         }
      }
      else {
         return this.simpleNewEntityName(newEntity.TableName);
      }
   }
   protected simpleNewEntityName(tableName: string): string {
      return this.convertCamelCaseToHaveSpaces(this.generatePluralName(tableName));
   }
   
   protected async createNewEntity(ds: DataSource, newEntity: any, md: Metadata) {
      try {
         const {shouldCreate, validationMessage} = await this.shouldCreateNewEntity(ds, newEntity);
         if (shouldCreate) {
            // process a single new entity 
            let newEntityName: string = await this.createNewEntityName(newEntity);
            let suffix = '';
            const existingEntity = md.Entities.find(e => e.Name === newEntityName);
            const existingEntityInNewEntityList = ManageMetadataBase.newEntityList.find(e => e === newEntityName); // check the newly created entity list to make sure we didn't create the new entity name along the way in this RUN of CodeGen as it wouldn't yet be in our metadata above
            if (existingEntity || existingEntityInNewEntityList) {
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
               const isNewSchema = await this.isSchemaNew(ds, newEntity.SchemaName);
               const sSQLInsert = this.createNewEntityInsertSQL(newEntityID, newEntityName, newEntity, suffix);
               await ds.query(sSQLInsert);
               // if we get here we created a new entity safely, otherwise we get exception
   
               // add it to the new entity list
               ManageMetadataBase.newEntityList.push(newEntityName);
   
               // next, check if this entity is in a schema that is new (e.g. no other entities have been added to this schema yet), if so and if 
               // our config option is set to create new applications from new schemas, then create a new application for this schema
               if (isNewSchema &&  configInfo.newSchemaDefaults.CreateNewApplicationWithSchemaName) {
                  // new schema and config option is to create a new application from the schema name so do that
                  
                  if (!await this.applicationExists(ds, newEntity.SchemaName))
                     await this.createNewApplication(ds, newEntity.SchemaName);                     
               }          
               else {
                  // not a new schema, attempt to look up the application for this schema
                  await this.getApplicationIDForSchema(ds, newEntity.SchemaName);
               }        
               // now we have an application ID, but make sure that we are configured to add this new entity to an application at all
               if (configInfo.newEntityDefaults.AddToApplicationWithSchemaName) {
                  // we should add this entity to the application
                  const appName: string = newEntity.SchemaName === mj_core_schema() ? 'Admin' : newEntity.SchemaName; // for the __mj schema or whatever it is installed as for mj_core - we want to drop stuff into the admin app
                  const sSQLInsertApplicationEntity = `INSERT INTO ${mj_core_schema()}.ApplicationEntity 
                                                            (ApplicationName, EntityID, Sequence) VALUES 
                                                            ('${appName}', ${newEntityID}, (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${mj_core_schema()}.ApplicationEntity WHERE ApplicationName = '${appName}'))`;
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
   
   protected async isSchemaNew(ds: DataSource, schemaName: string): Promise<boolean> {
      // check to see if there are any entities in the db with this schema name
      const sSQL: string = `SELECT COUNT(*) AS Count FROM [${mj_core_schema()}].Entity WHERE SchemaName = '${schemaName}'`;
      const result = await ds.query(sSQL);
      return result && result.length > 0 ? result[0].Count === 0 : true;
   }
   
   protected async createNewApplication(ds: DataSource, appName: string): Promise<number>{
      const sSQL: string = "INSERT INTO [" + mj_core_schema() + "].Application (Name, Description) VALUES ('" + appName + "', 'Generated for Schema'); SELECT @@IDENTITY AS ID";
      const result = await ds.query(sSQL);
      return result && result.length > 0 ? result[0].ID : null;
   }
   
   protected async applicationExists(ds: DataSource, applicationName: string): Promise<boolean>{
      const sSQL: string = `SELECT ID FROM [${mj_core_schema()}].Application WHERE Name = '${applicationName}'`;
      const result = await ds.query(sSQL);
      return result && result.length > 0 ? result[0].ID > 0 : false;
   }
   
   protected async getApplicationIDForSchema(ds: DataSource, schemaName: string): Promise<number>{
      const sSQL: string = `SELECT ID FROM [${mj_core_schema()}].Application WHERE Name = '${schemaName}'`;
      const result = await ds.query(sSQL);
      return result && result.length > 0 ? result[0].ID : null;
   }
   
   protected createNewEntityInsertSQL(newEntityID: number, newEntityName: string, newEntity: any, newEntitySuffix: string): string {
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
         'vw${this.generatePluralName(newEntity.TableName) + (newEntitySuffix && newEntitySuffix.length > 0 ? newEntitySuffix : '')}', 
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
   
   protected stripTrailingChars(s:string, charsToStrip: string, skipIfExactMatch: boolean): string {
      if (s && charsToStrip) {
         if (s.endsWith(charsToStrip) && (skipIfExactMatch ? s !== charsToStrip : true))
            return s.substring(0, s.length - charsToStrip.length);
         else 
            return s
      }
      else 
         return s;
   }
   
   protected convertCamelCaseToHaveSpaces(s: string): string {
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
   
   protected stripWhitespace(s: string): string {
      return s.replace(/\s/g, '');
   }  
   
   protected generatePluralName(singularName: string) {
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
   

}