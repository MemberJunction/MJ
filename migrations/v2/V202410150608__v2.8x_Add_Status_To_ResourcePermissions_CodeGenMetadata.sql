/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to insert new entity field */

      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         ID,
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
         '3922FE34-E68A-EF11-8473-6045BDF077EE',
         '201852E1-4587-EF11-8473-6045BDF077EE',
         12,
         'Status',
         'Status',
         'Status of the resource permission request. Possible values are Requested, Approved, Rejected, or Revoked.',
         'nvarchar',
         40,
         0,
         0,
         0,
         'Requested',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'
 
/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue 
                                       (EntityFieldID, Sequence, Value, Code) 
                                    VALUES 
                                       ('3922FE34-E68A-EF11-8473-6045BDF077EE', 1, 'Requested', 'Requested')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue 
                                       (EntityFieldID, Sequence, Value, Code) 
                                    VALUES 
                                       ('3922FE34-E68A-EF11-8473-6045BDF077EE', 2, 'Approved', 'Approved')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue 
                                       (EntityFieldID, Sequence, Value, Code) 
                                    VALUES 
                                       ('3922FE34-E68A-EF11-8473-6045BDF077EE', 3, 'Rejected', 'Rejected')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue 
                                       (EntityFieldID, Sequence, Value, Code) 
                                    VALUES 
                                       ('3922FE34-E68A-EF11-8473-6045BDF077EE', 4, 'Revoked', 'Revoked')

/* SQL text to update ValueListType for entity field ID 3922FE34-E68A-EF11-8473-6045BDF077EE */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3922FE34-E68A-EF11-8473-6045BDF077EE'


/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

