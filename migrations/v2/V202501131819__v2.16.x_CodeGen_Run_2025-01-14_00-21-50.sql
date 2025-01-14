/* SQL generated to create new entity Query Entities */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'efb0fd56-7ad5-4bfe-be31-74628ff77265',
         'Query Entities',
         NULL,
         NULL,
         'QueryEntity',
         'vwQueryEntities',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new permission for entity Query Entities for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('efb0fd56-7ad5-4bfe-be31-74628ff77265', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Query Entities for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('efb0fd56-7ad5-4bfe-be31-74628ff77265', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Query Entities for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('efb0fd56-7ad5-4bfe-be31-74628ff77265', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity ${flyway:defaultSchema}.QueryEntity */
ALTER TABLE [${flyway:defaultSchema}].[QueryEntity] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity ${flyway:defaultSchema}.QueryEntity */
ALTER TABLE [${flyway:defaultSchema}].[QueryEntity] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

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
         '7869f621-5add-4df1-80fb-793d33b5c7c8',
         'EFB0FD56-7AD5-4BFE-BE31-74628FF77265',
         1,
         'ID',
         'ID',
         'Unique identifier for the QueryEntity record.',
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
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
         '2e647ae3-51c5-4b6e-8d26-e8485ebfdf67',
         'EFB0FD56-7AD5-4BFE-BE31-74628FF77265',
         2,
         'QueryID',
         'Query ID',
         'References the ID of the query in the Queries table.',
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         '1B248F34-2837-EF11-86D4-6045BDEE16E6',
         'ID',
         0,
         0,
         1,
         1,
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
         'd7eec7a6-d48e-4298-95e5-c1c0a38633bb',
         'EFB0FD56-7AD5-4BFE-BE31-74628FF77265',
         3,
         'EntityID',
         'Entity ID',
         'References the ID of the entity in the Entities table.',
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'E0238F34-2837-EF11-86D4-6045BDEE16E6',
         'ID',
         0,
         0,
         1,
         1,
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
         '1d7b5b3b-9180-465b-8929-3b2610c26742',
         'EFB0FD56-7AD5-4BFE-BE31-74628FF77265',
         4,
         '${flyway:defaultSchema}_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
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
         'b1d15eea-d2b9-46f5-89fa-c71ddd7d3964',
         'EFB0FD56-7AD5-4BFE-BE31-74628FF77265',
         5,
         '${flyway:defaultSchema}_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         1,
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

/* SQL text to create Entitiy Relationships */
INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                          VALUES ('6a6577b1-4d89-42e6-a8ff-d9be5a993dec', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', 'EntityID', 'One To Many', 1, 1, 'Query Entities', 1);
                              

/* SQL text to create Entitiy Relationships */
INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                          VALUES ('71c6e03a-608f-4610-b00b-e4893fd26daf', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', 'QueryID', 'One To Many', 1, 1, 'Query Entities', 2);
                              

/* SQL text to update entity field related entity name field map for entity field ID 2E647AE3-51C5-4B6E-8D26-E8485EBFDF67 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2E647AE3-51C5-4B6E-8D26-E8485EBFDF67',
         @RelatedEntityNameFieldMap='Query'

/* SQL text to update entity field related entity name field map for entity field ID D7EEC7A6-D48E-4298-95E5-C1C0A38633BB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D7EEC7A6-D48E-4298-95E5-C1C0A38633BB',
         @RelatedEntityNameFieldMap='Entity'

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
         'a644b982-0b5d-4716-aeba-fef626972833',
         'EFB0FD56-7AD5-4BFE-BE31-74628FF77265',
         6,
         'Query',
         'Query',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
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
         'e2d88d12-9102-4514-87b6-37e19f351066',
         'EFB0FD56-7AD5-4BFE-BE31-74628FF77265',
         7,
         'Entity',
         'Entity',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
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

