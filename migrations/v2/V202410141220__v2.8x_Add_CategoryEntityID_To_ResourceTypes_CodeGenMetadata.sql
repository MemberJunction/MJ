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
         '67E7CC2B-528A-EF11-8473-6045BDF077EE', -- hardcoded to what we generated in the dev run
         '0B248F34-2837-EF11-86D4-6045BDEE16E6',
         9,
         'CategoryEntityID',
         'Category Entity ID',
         'Nullable foreign key to the ID column in Entities entity, representing the category entity. ASSUMPTION: If provided, the assumption is there is a self-referencing/recursive foreign key establishing a hierarchy within the Category Entity, commonly called ParentID, but it can be named anything.',
         'uniqueidentifier',
         16,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         'E0238F34-2837-EF11-86D4-6045BDEE16E6',
         'ID',
         0,
         0,
         1,
         0,
         0,
         0,
         'Dropdown'
      )

/* SQL text to insert new entity field */

      INSERT INTO [${flyway:defaultSchema}].EntityField
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
         '0B248F34-2837-EF11-86D4-6045BDEE16E6',
         11,
         'CategoryEntity',
         'Category Entity',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
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
         'Dropdown'
      )

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to update ValueListType for entity field ID 42DE5E8E-A83B-EF11-86D4-0022481D1B23 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='42DE5E8E-A83B-EF11-86D4-0022481D1B23'

/* SQL text to update ValueListType for entity field ID 3FDE5E8E-A83B-EF11-86D4-0022481D1B23 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3FDE5E8E-A83B-EF11-86D4-0022481D1B23'

/* SQL text to update ValueListType for entity field ID 270644A9-0A3C-EF11-86D4-0022481D1B23 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='270644A9-0A3C-EF11-86D4-0022481D1B23'

/* SQL text to update ValueListType for entity field ID F573433E-F36B-1410-883E-00D02208DC50 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F573433E-F36B-1410-883E-00D02208DC50'

/* SQL text to update ValueListType for entity field ID 0074433E-F36B-1410-883E-00D02208DC50 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='0074433E-F36B-1410-883E-00D02208DC50'

/* SQL text to update ValueListType for entity field ID C64D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C64D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID B04C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B04C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID C64D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C64D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID F64217F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F64217F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 055817F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='055817F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 115917F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='115917F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID F75817F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F75817F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 334D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='334D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 304D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='304D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 614D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='614D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 2F4D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2F4D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID C34217F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C34217F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 3670D30B-8A55-EF11-991A-000D3A9D8BF3 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3670D30B-8A55-EF11-991A-000D3A9D8BF3'

/* SQL text to update ValueListType for entity field ID D44217F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D44217F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 144F17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='144F17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID B75717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B75717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID B85717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B85717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID B24D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B24D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID E74217F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='E74217F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID F04217F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F04217F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID D74D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D74D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID D94D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D94D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID DC4D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='DC4D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID F34D17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F34D17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 124E17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='124E17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 544317F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='544317F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 524317F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='524317F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 5C4317F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5C4317F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 734E17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='734E17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID E54317F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='E54317F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID F74317F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F74317F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID EE4E17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='EE4E17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 1B4F17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1B4F17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 1D4F17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1D4F17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 2E4417F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2E4417F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 2F4417F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2F4417F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 3F4F17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3F4F17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 384F17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='384F17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 3B4F17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3B4F17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 384417F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='384417F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 3B4417F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3B4417F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 505717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='505717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 7A4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7A4C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 7E4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 545717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='545717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 595717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='595717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID F95817F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F95817F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 5E5717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5E5717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 964C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='964C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID A24C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A24C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID A34C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A34C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID A34C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A34C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 755717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='755717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID B44C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B44C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 805717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='805717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 815717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='815717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 875717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='875717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID BA4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='BA4C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID BC4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='BC4C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 9C5717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9C5717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID FC5817F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='FC5817F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID A55717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A55717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID F74C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F74C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID FD4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='FD4C17F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID F65717F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F65717F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID 995817F0-6F36-EF11-86D4-6045BDEE16E6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='995817F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update ValueListType for entity field ID DE344718-4687-EF11-8473-6045BDF077EE */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='DE344718-4687-EF11-8473-6045BDF077EE'

/* SQL text to update ValueListType for entity field ID E3344718-4687-EF11-8473-6045BDF077EE */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='E3344718-4687-EF11-8473-6045BDF077EE'

/* SQL text to update entity field related entity name field map for entity field ID 67E7CC2B-528A-EF11-8473-6045BDF077EE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='67E7CC2B-528A-EF11-8473-6045BDF077EE',
         @RelatedEntityNameFieldMap='CategoryEntity'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'






-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Resource Types
-- Item: vwResourceTypes
-- Generated: 10/14/2024, 12:32:03 PM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Resource Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ResourceType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwResourceTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwResourceTypes]
AS
SELECT
    r.*,
    Entity_EntityID.[Name] AS [Entity],
    Entity_CategoryEntityID.[Name] AS [CategoryEntity]
FROM
    [${flyway:defaultSchema}].[ResourceType] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_CategoryEntityID
  ON
    [r].[CategoryEntityID] = Entity_CategoryEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwResourceTypes] TO [cdp_UI]
