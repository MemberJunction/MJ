/* SQL generated to create new entity Legislative Findings */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
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
         'e427eeaa-dae7-448a-be58-bd3b389692f6',
         'Legislative Findings',
         NULL,
         NULL,
         NULL,
         'LegislativeFindings',
         'vwLegislativeFindings',
         'demo',
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
   

/* SQL generated to create new application demo */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description, SchemaAutoAddNewEntities) VALUES ('447dfe3a-1db7-4d7c-87f2-2cb1c956c944', 'demo', 'Generated for schema', 'demo')

/* SQL generated to add new entity Legislative Findings to application ID: '447dfe3a-1db7-4d7c-87f2-2cb1c956c944' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('447dfe3a-1db7-4d7c-87f2-2cb1c956c944', 'e427eeaa-dae7-448a-be58-bd3b389692f6', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '447dfe3a-1db7-4d7c-87f2-2cb1c956c944'))

/* SQL generated to add new permission for entity Legislative Findings for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e427eeaa-dae7-448a-be58-bd3b389692f6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Legislative Findings for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e427eeaa-dae7-448a-be58-bd3b389692f6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Legislative Findings for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e427eeaa-dae7-448a-be58-bd3b389692f6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity demo.LegislativeFindings */
ALTER TABLE [demo].[LegislativeFindings] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity demo.LegislativeFindings */
ALTER TABLE [demo].[LegislativeFindings] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5eebb21e-b394-4f2d-a306-4364e84c2083'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            '5eebb21e-b394-4f2d-a306-4364e84c2083',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100001,
            'ID',
            'ID',
            NULL,
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
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '64b043a6-5220-48ba-ac4e-74373786155a'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'ItemNumber')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            '64b043a6-5220-48ba-ac4e-74373786155a',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100002,
            'ItemNumber',
            'Item Number',
            NULL,
            'nvarchar',
            100,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2f587edd-d1e2-4ff3-92c0-241ea8486aaf'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            '2f587edd-d1e2-4ff3-92c0-241ea8486aaf',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100003,
            'Title',
            'Title',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c8c1afd4-cfd0-4aab-bc18-4ad9ce991912'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'Summary')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            'c8c1afd4-cfd0-4aab-bc18-4ad9ce991912',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100004,
            'Summary',
            'Summary',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0e51bb47-ae0f-4572-b7cd-6792c7d1dee9'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'FullText')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            '0e51bb47-ae0f-4572-b7cd-6792c7d1dee9',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100005,
            'FullText',
            'Full Text',
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8c1b76fe-9956-41a5-85a0-38788c09fac6'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'SourceURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            '8c1b76fe-9956-41a5-85a0-38788c09fac6',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100006,
            'SourceURL',
            'Source URL',
            NULL,
            'nvarchar',
            2000,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e99176c9-2636-4f5a-b79c-38c641b829d4'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'Category')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            'e99176c9-2636-4f5a-b79c-38c641b829d4',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100007,
            'Category',
            'Category',
            NULL,
            'nvarchar',
            200,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b06bac6b-2d93-4551-94ac-fc56419adcf1'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'PriorityLevel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            'b06bac6b-2d93-4551-94ac-fc56419adcf1',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100008,
            'PriorityLevel',
            'Priority Level',
            NULL,
            'nvarchar',
            40,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6acb68c3-b22e-4c61-baad-7a578e678f15'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'ItemType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            '6acb68c3-b22e-4c61-baad-7a578e678f15',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100009,
            'ItemType',
            'Item Type',
            NULL,
            'nvarchar',
            100,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'da4a7475-df14-4d53-9b40-8b91360fab27'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            'da4a7475-df14-4d53-9b40-8b91360fab27',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100010,
            'Notes',
            'Notes',
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '081f8c97-ec30-4c58-a0c3-5dc222e1717e'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = 'ActionItems')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            '081f8c97-ec30-4c58-a0c3-5dc222e1717e',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100011,
            'ActionItems',
            'Action Items',
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0254e30d-836a-4a81-a95c-9c7b14bd81f2'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            '0254e30d-836a-4a81-a95c-9c7b14bd81f2',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100012,
            '__mj_CreatedAt',
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
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '067d7b69-a0dc-4371-9b11-d4e4e3f5dfd3'  OR 
               (EntityID = 'E427EEAA-DAE7-448A-BE58-BD3B389692F6' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
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
            '067d7b69-a0dc-4371-9b11-d4e4e3f5dfd3',
            'E427EEAA-DAE7-448A-BE58-BD3B389692F6', -- Entity: Legislative Findings
            100013,
            '__mj_UpdatedAt',
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
            0,
            0,
            0,
            'Search'
         )
      END

/* Index for Foreign Keys for LegislativeFindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Legislative Findings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Legislative Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Legislative Findings
-- Item: vwLegislativeFindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Legislative Findings
-----               SCHEMA:      demo
-----               BASE TABLE:  LegislativeFindings
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[demo].[vwLegislativeFindings]', 'V') IS NOT NULL
    DROP VIEW [demo].[vwLegislativeFindings];
GO

CREATE VIEW [demo].[vwLegislativeFindings]
AS
SELECT
    l.*
FROM
    [demo].[LegislativeFindings] AS l
GO
GRANT SELECT ON [demo].[vwLegislativeFindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Legislative Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Legislative Findings
-- Item: Permissions for vwLegislativeFindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [demo].[vwLegislativeFindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Legislative Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Legislative Findings
-- Item: spCreateLegislativeFindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR LegislativeFindings
------------------------------------------------------------
IF OBJECT_ID('[demo].[spCreateLegislativeFindings]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spCreateLegislativeFindings];
GO

CREATE PROCEDURE [demo].[spCreateLegislativeFindings]
    @ID uniqueidentifier = NULL,
    @ItemNumber nvarchar(50),
    @Title nvarchar(500),
    @Summary nvarchar(MAX),
    @FullText nvarchar(MAX),
    @SourceURL nvarchar(1000),
    @Category nvarchar(100),
    @PriorityLevel nvarchar(20),
    @ItemType nvarchar(50),
    @Notes nvarchar(MAX),
    @ActionItems nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [demo].[LegislativeFindings]
            (
                [ID],
                [ItemNumber],
                [Title],
                [Summary],
                [FullText],
                [SourceURL],
                [Category],
                [PriorityLevel],
                [ItemType],
                [Notes],
                [ActionItems]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ItemNumber,
                @Title,
                @Summary,
                @FullText,
                @SourceURL,
                @Category,
                @PriorityLevel,
                @ItemType,
                @Notes,
                @ActionItems
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [demo].[LegislativeFindings]
            (
                [ItemNumber],
                [Title],
                [Summary],
                [FullText],
                [SourceURL],
                [Category],
                [PriorityLevel],
                [ItemType],
                [Notes],
                [ActionItems]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ItemNumber,
                @Title,
                @Summary,
                @FullText,
                @SourceURL,
                @Category,
                @PriorityLevel,
                @ItemType,
                @Notes,
                @ActionItems
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [demo].[vwLegislativeFindings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [demo].[spCreateLegislativeFindings] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Legislative Findings */

GRANT EXECUTE ON [demo].[spCreateLegislativeFindings] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Legislative Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Legislative Findings
-- Item: spUpdateLegislativeFindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR LegislativeFindings
------------------------------------------------------------
IF OBJECT_ID('[demo].[spUpdateLegislativeFindings]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spUpdateLegislativeFindings];
GO

CREATE PROCEDURE [demo].[spUpdateLegislativeFindings]
    @ID uniqueidentifier,
    @ItemNumber nvarchar(50),
    @Title nvarchar(500),
    @Summary nvarchar(MAX),
    @FullText nvarchar(MAX),
    @SourceURL nvarchar(1000),
    @Category nvarchar(100),
    @PriorityLevel nvarchar(20),
    @ItemType nvarchar(50),
    @Notes nvarchar(MAX),
    @ActionItems nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[LegislativeFindings]
    SET
        [ItemNumber] = @ItemNumber,
        [Title] = @Title,
        [Summary] = @Summary,
        [FullText] = @FullText,
        [SourceURL] = @SourceURL,
        [Category] = @Category,
        [PriorityLevel] = @PriorityLevel,
        [ItemType] = @ItemType,
        [Notes] = @Notes,
        [ActionItems] = @ActionItems
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [demo].[vwLegislativeFindings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [demo].[vwLegislativeFindings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [demo].[spUpdateLegislativeFindings] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the LegislativeFindings table
------------------------------------------------------------
IF OBJECT_ID('[demo].[trgUpdateLegislativeFindings]', 'TR') IS NOT NULL
    DROP TRIGGER [demo].[trgUpdateLegislativeFindings];
GO
CREATE TRIGGER [demo].trgUpdateLegislativeFindings
ON [demo].[LegislativeFindings]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[LegislativeFindings]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [demo].[LegislativeFindings] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Legislative Findings */

GRANT EXECUTE ON [demo].[spUpdateLegislativeFindings] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Legislative Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Legislative Findings
-- Item: spDeleteLegislativeFindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR LegislativeFindings
------------------------------------------------------------
IF OBJECT_ID('[demo].[spDeleteLegislativeFindings]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spDeleteLegislativeFindings];
GO

CREATE PROCEDURE [demo].[spDeleteLegislativeFindings]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [demo].[LegislativeFindings]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [demo].[spDeleteLegislativeFindings] TO [cdp_Integration]
    

/* spDelete Permissions for Legislative Findings */

GRANT EXECUTE ON [demo].[spDeleteLegislativeFindings] TO [cdp_Integration]



