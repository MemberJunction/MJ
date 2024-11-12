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
         '7d91381d-abc9-46dd-aa66-3e1909be1cb2',
         'E5238F34-2837-EF11-86D4-6045BDEE16E6',
         10,
         'Status',
         'Status',
         'Status of the integration run. Possible values: Pending, In Progress, Success, Failed.',
         'nvarchar',
         40,
         0,
         0,
         0,
         'Pending',
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
         '429c9b37-8575-4f2d-9e19-f39378ec3a12',
         'E5238F34-2837-EF11-86D4-6045BDEE16E6',
         11,
         'ErrorLog',
         'Error Log',
         'Optional error log information for the integration run.',
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
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
         'cb3f1399-7741-4882-99d6-f6cde80e3897',
         'E5238F34-2837-EF11-86D4-6045BDEE16E6',
         12,
         'ConfigData',
         'Config Data',
         'Optional configuration data in JSON format for the request that started the integration run for audit purposes.',
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
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

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue 
                                       (EntityFieldID, Sequence, Value, Code) 
                                    VALUES 
                                       ('7D91381D-ABC9-46DD-AA66-3E1909BE1CB2', 1, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue 
                                       (EntityFieldID, Sequence, Value, Code) 
                                    VALUES 
                                       ('7D91381D-ABC9-46DD-AA66-3E1909BE1CB2', 2, 'In Progress', 'In Progress')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue 
                                       (EntityFieldID, Sequence, Value, Code) 
                                    VALUES 
                                       ('7D91381D-ABC9-46DD-AA66-3E1909BE1CB2', 3, 'Success', 'Success')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue 
                                       (EntityFieldID, Sequence, Value, Code) 
                                    VALUES 
                                       ('7D91381D-ABC9-46DD-AA66-3E1909BE1CB2', 4, 'Failed', 'Failed')

/* SQL text to update ValueListType for entity field ID 7D91381D-ABC9-46DD-AA66-3E1909BE1CB2 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7D91381D-ABC9-46DD-AA66-3E1909BE1CB2'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

