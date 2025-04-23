-- =============================================
-- Flyway migration: create ReportType table with JSON constraint and extended properties
-- =============================================

CREATE TABLE ${flyway:defaultSchema}.ReportType (
    ID             UNIQUEIDENTIFIER NOT NULL  
                   CONSTRAINT PK_ReportType PRIMARY KEY
                   DEFAULT NEWSEQUENTIALID(),
    Name           NVARCHAR(100)   NOT NULL,
    Description    NVARCHAR(255)   NULL,
    Configuration  NVARCHAR(MAX)   NOT NULL
);
GO

-- JSON validity constraint
ALTER TABLE ${flyway:defaultSchema}.ReportType
ADD CONSTRAINT CK_ReportType_Config_IsJson
    CHECK (ISJSON(Configuration) = 1);
GO

-- =============================================
-- Extended properties for documentation
-- =============================================

-- Table description
EXEC sp_addextendedproperty 
  @name = N'MS_Description', 
  @value = N'Contains metadata for report types, including default styling and configuration.', 
  @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}', 
  @level1type = N'TABLE',   @level1name = N'ReportType';
GO

-- Column descriptions
EXEC sp_addextendedproperty 
  @name = N'MS_Description', 
  @value = N'Primary key for the ReportType table.', 
  @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}', 
  @level1type = N'TABLE',   @level1name = N'ReportType', 
  @level2type = N'COLUMN',  @level2name = N'ID';
GO

EXEC sp_addextendedproperty 
  @name = N'MS_Description', 
  @value = N'Human-readable name of the report type.', 
  @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}', 
  @level1type = N'TABLE',   @level1name = N'ReportType', 
  @level2type = N'COLUMN',  @level2name = N'Name';
GO

EXEC sp_addextendedproperty 
  @name = N'MS_Description', 
  @value = N'Optional description of the report type.', 
  @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}', 
  @level1type = N'TABLE',   @level1name = N'ReportType', 
  @level2type = N'COLUMN',  @level2name = N'Description';
GO

EXEC sp_addextendedproperty 
  @name = N'MS_Description', 
  @value = N'JSON configuration blob for styling and behavior defaults.', 
  @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}', 
  @level1type = N'TABLE',   @level1name = N'ReportType', 
  @level2type = N'COLUMN',  @level2name = N'Configuration';
GO

-- =============================================
-- Seed initial ReportType row
-- =============================================
INSERT INTO ${flyway:defaultSchema}.ReportType (ID, Name, Description, Configuration)
VALUES (
  '2493433E-F36B-1410-8E16-00F026831CBD',
  'Skip Dynamic Chart',
  'Default Plotly styling for skip dynamic charts',
  N'{
    "plot_bgcolor": "#f8f9fa",
    "font": {
      "family": "Roboto, sans-serif",
      "size": 12,
      "color": "#000"
    },
    "colorway": [
      "#1B91CB",
      "#007BC1",
      "#0069AC",
      "#2B87C9",
      "#5DA5D7",
      "#7AC3EA",
      "#A2D8F2",
      "#CBE9F8",
      "#E6F4FB"
    ],
    "margin": {
      "l": 40,
      "r": 40,
      "t": 120,
      "b": 120
    },
    "title": {
      "font": {
        "family": "Roboto, sans-serif",
        "size": 24,
        "color": "#0076B6"
      }
    },
    "xaxis": {
      "automargin": true,
      "tickangle": 45,
      "ticklabelposition": "outside",
      "tickpadding": 20,
      "title": {
        "font": {
          "color": "#0076B6",
          "size": 18
        }
      }
    },
    "yaxis": {
      "automargin": true,
      "ticklabelposition": "outside",
      "tickpadding": 20,
      "title": {
        "font": {
          "color": "#0076B6",
          "size": 18
        }
      }
    },
    "legend": {
      "x": 1,
      "xanchor": "left"
    }
  }'
);
GO


----- CODE GENERATION -----
/* SQL generated to create new entity MJ: Report Types */

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
         'ade1756e-f1bb-4c4d-bf8c-88c849d0aa1e',
         'MJ: Report Types',
         NULL,
         NULL,
         'ReportType',
         'vwReportTypes',
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
   

/* SQL generated to add new permission for entity MJ: Report Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ade1756e-f1bb-4c4d-bf8c-88c849d0aa1e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Report Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ade1756e-f1bb-4c4d-bf8c-88c849d0aa1e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Report Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ade1756e-f1bb-4c4d-bf8c-88c849d0aa1e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity ${flyway:defaultSchema}.ReportType */
ALTER TABLE [${flyway:defaultSchema}].[ReportType] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity ${flyway:defaultSchema}.ReportType */
ALTER TABLE [${flyway:defaultSchema}].[ReportType] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1f546074-6522-4c4a-9dff-ba688b0e896c'  OR 
               (EntityID = 'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E' AND Name = 'ID')
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
            '1f546074-6522-4c4a-9dff-ba688b0e896c',
            'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E', -- Entity: MJ: Report Types
            1,
            'ID',
            'ID',
            'Primary key for the ReportType table.',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b47c7ee5-c666-42ad-bfda-40cd6309ad01'  OR 
               (EntityID = 'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E' AND Name = 'Name')
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
            'b47c7ee5-c666-42ad-bfda-40cd6309ad01',
            'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E', -- Entity: MJ: Report Types
            2,
            'Name',
            'Name',
            'Human-readable name of the report type.',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '38fd8d86-6355-476d-a90c-70fe35577493'  OR 
               (EntityID = 'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E' AND Name = 'Description')
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
            '38fd8d86-6355-476d-a90c-70fe35577493',
            'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E', -- Entity: MJ: Report Types
            3,
            'Description',
            'Description',
            'Optional description of the report type.',
            'nvarchar',
            510,
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '49928466-b7d1-4009-a8e8-d568da31cef8'  OR 
               (EntityID = 'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E' AND Name = 'Configuration')
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
            '49928466-b7d1-4009-a8e8-d568da31cef8',
            'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E', -- Entity: MJ: Report Types
            4,
            'Configuration',
            'Configuration',
            'JSON configuration blob for styling and behavior defaults.',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '12fba020-7c54-4d9c-92f7-c51755a61054'  OR 
               (EntityID = 'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E' AND Name = '${flyway:defaultSchema}_CreatedAt')
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
            '12fba020-7c54-4d9c-92f7-c51755a61054',
            'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E', -- Entity: MJ: Report Types
            5,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e1eec761-eacb-4ef0-b76d-d9dbba1c7cc5'  OR 
               (EntityID = 'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E' AND Name = '${flyway:defaultSchema}_UpdatedAt')
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
            'e1eec761-eacb-4ef0-b76d-d9dbba1c7cc5',
            'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E', -- Entity: MJ: Report Types
            6,
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
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* Base View SQL for MJ: Report Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Types
-- Item: vwReportTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Report Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ReportType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReportTypes]
AS
SELECT
    r.*
FROM
    [${flyway:defaultSchema}].[ReportType] AS r
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReportTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Report Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Types
-- Item: Permissions for vwReportTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReportTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Report Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Types
-- Item: spCreateReportType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReportType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReportType]
    @Name nvarchar(100),
    @Description nvarchar(255),
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ReportType]
        (
            [Name],
            [Description],
            [Configuration]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Configuration
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReportTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Report Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Report Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Types
-- Item: spUpdateReportType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReportType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReportType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(255),
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReportTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ReportType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReportType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReportType
ON [${flyway:defaultSchema}].[ReportType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportType]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ReportType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Report Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Report Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Types
-- Item: spDeleteReportType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReportType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ReportType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Report Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportType] TO [cdp_Integration]


----- Insert into MJ Dataset -----
INSERT INTO __mj.DatasetItem (ID, Code, DatasetID, Sequence, EntityID, DateFieldToCheck)
VALUES ('845F433E-F36B-1410-8E17-00F026831CBD', 'ReportTypes', 'E4ADCCEC-6A37-EF11-86D4-000D3A4E707E', 23, 'ADE1756E-F1BB-4C4D-BF8C-88C849D0AA1E', '__mj_UpdatedAt');