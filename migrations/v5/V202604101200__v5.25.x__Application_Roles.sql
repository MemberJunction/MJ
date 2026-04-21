-- Application Roles: Role-based access control for Applications.
-- When an application has zero ApplicationRole records, all roles can access it (open access, backwards compatible).
-- When at least one ApplicationRole record exists, only roles with CanAccess=1 are permitted.

CREATE TABLE ${flyway:defaultSchema}.ApplicationRole (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ApplicationID UNIQUEIDENTIFIER NOT NULL,
    RoleID UNIQUEIDENTIFIER NOT NULL,
    CanAccess BIT NOT NULL DEFAULT 1,
    CanAdmin BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_ApplicationRole PRIMARY KEY (ID),
    CONSTRAINT FK_ApplicationRole_Application
        FOREIGN KEY (ApplicationID) REFERENCES ${flyway:defaultSchema}.Application(ID),
    CONSTRAINT FK_ApplicationRole_Role
        FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT UQ_ApplicationRole_App_Role
        UNIQUE (ApplicationID, RoleID)
);

-- Extended properties for CodeGen
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls which roles can access and administer specific applications. When no ApplicationRole records exist for an application, all roles can access it (open access). When at least one record exists, only roles with CanAccess=1 are permitted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Application this role grant applies to',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole',
    @level2type = N'COLUMN', @level2name = N'ApplicationID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Role being granted or denied access',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole',
    @level2type = N'COLUMN', @level2name = N'RoleID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, users in this role can access the application. When false, this record acts as an explicit deny for the role.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole',
    @level2type = N'COLUMN', @level2name = N'CanAccess';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, users in this role can modify application settings, manage nav items, and configure the application.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole',
    @level2type = N'COLUMN', @level2name = N'CanAdmin';

















































/* CODEGEN */

/* SQL generated to create new entity MJ: Application Roles */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '6d3d08a7-12f2-42ea-bd15-128fbe4a4259',
         'MJ: Application Roles',
         'Application Roles',
         'Controls which roles can access and administer specific applications. When no ApplicationRole records exist for an application, all roles can access it (open access). When at least one record exists, only roles with CanAccess=1 are permitted.',
         NULL,
         'ApplicationRole',
         'vwApplicationRoles',
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
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Application Roles to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '6d3d08a7-12f2-42ea-bd15-128fbe4a4259', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Application Roles for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6d3d08a7-12f2-42ea-bd15-128fbe4a4259', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Application Roles for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6d3d08a7-12f2-42ea-bd15-128fbe4a4259', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Application Roles for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6d3d08a7-12f2-42ea-bd15-128fbe4a4259', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ApplicationRole */
ALTER TABLE [${flyway:defaultSchema}].[ApplicationRole] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ApplicationRole */
UPDATE [${flyway:defaultSchema}].[ApplicationRole] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ApplicationRole */
ALTER TABLE [${flyway:defaultSchema}].[ApplicationRole] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ApplicationRole */
ALTER TABLE [${flyway:defaultSchema}].[ApplicationRole] ADD CONSTRAINT [DF___mj_ApplicationRole___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ApplicationRole */
ALTER TABLE [${flyway:defaultSchema}].[ApplicationRole] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ApplicationRole */
UPDATE [${flyway:defaultSchema}].[ApplicationRole] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ApplicationRole */
ALTER TABLE [${flyway:defaultSchema}].[ApplicationRole] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ApplicationRole */
ALTER TABLE [${flyway:defaultSchema}].[ApplicationRole] ADD CONSTRAINT [DF___mj_ApplicationRole___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'da036f52-2ade-46a5-8f59-b0dc5b585604' OR (EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'da036f52-2ade-46a5-8f59-b0dc5b585604',
            '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- Entity: MJ: Application Roles
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff3a1a6b-fe9a-4cab-91df-5b31b7163b24' OR (EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND Name = 'ApplicationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ff3a1a6b-fe9a-4cab-91df-5b31b7163b24',
            '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- Entity: MJ: Application Roles
            100002,
            'ApplicationID',
            'Application ID',
            'Foreign key to the Application this role grant applies to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'E8238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11aebe82-d291-41ba-8d4a-b82269d19a47' OR (EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND Name = 'RoleID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '11aebe82-d291-41ba-8d4a-b82269d19a47',
            '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- Entity: MJ: Application Roles
            100003,
            'RoleID',
            'Role ID',
            'Foreign key to the Role being granted or denied access',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'DA238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e76a4f1e-353a-4b03-afbd-c01d89cd6826' OR (EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND Name = 'CanAccess')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e76a4f1e-353a-4b03-afbd-c01d89cd6826',
            '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- Entity: MJ: Application Roles
            100004,
            'CanAccess',
            'Can Access',
            'When true, users in this role can access the application. When false, this record acts as an explicit deny for the role.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c85af0d2-0087-4b0b-9b42-4cea052151cd' OR (EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND Name = 'CanAdmin')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c85af0d2-0087-4b0b-9b42-4cea052151cd',
            '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- Entity: MJ: Application Roles
            100005,
            'CanAdmin',
            'Can Admin',
            'When true, users in this role can modify application settings, manage nav items, and configure the application.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ed625b3-c9a0-4fe5-bf9b-0a3b2ba878df' OR (EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8ed625b3-c9a0-4fe5-bf9b-0a3b2ba878df',
            '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- Entity: MJ: Application Roles
            100006,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ddb6e26-63b2-493a-8a06-a5cd09e0fe7b' OR (EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0ddb6e26-63b2-493a-8a06-a5cd09e0fe7b',
            '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- Entity: MJ: Application Roles
            100007,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END


/* Create Entity Relationship: MJ: Roles -> MJ: Application Roles (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f8e3068c-b7ff-4d1a-89f3-e261945fd0b4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f8e3068c-b7ff-4d1a-89f3-e261945fd0b4', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', 'RoleID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Applications -> MJ: Application Roles (One To Many via ApplicationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f30a95e9-87af-41f7-ad0f-c92f167e43e7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f30a95e9-87af-41f7-ad0f-c92f167e43e7', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', 'ApplicationID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for ApplicationRole */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table ApplicationRole
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ApplicationRole_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ApplicationRole]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ApplicationRole_ApplicationID ON [${flyway:defaultSchema}].[ApplicationRole] ([ApplicationID]);

-- Index for foreign key RoleID in table ApplicationRole
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ApplicationRole_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ApplicationRole]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ApplicationRole_RoleID ON [${flyway:defaultSchema}].[ApplicationRole] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID FF3A1A6B-FE9A-4CAB-91DF-5B31B7163B24 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FF3A1A6B-FE9A-4CAB-91DF-5B31B7163B24', @RelatedEntityNameFieldMap='Application'

/* SQL text to update entity field related entity name field map for entity field ID 11AEBE82-D291-41BA-8D4A-B82269D19A47 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='11AEBE82-D291-41BA-8D4A-B82269D19A47', @RelatedEntityNameFieldMap='Role'

/* Base View SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: vwApplicationRoles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Application Roles
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ApplicationRole
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwApplicationRoles]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwApplicationRoles];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwApplicationRoles]
AS
SELECT
    a.*,
    MJApplication_ApplicationID.[Name] AS [Application],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[ApplicationRole] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Application] AS MJApplication_ApplicationID
  ON
    [a].[ApplicationID] = MJApplication_ApplicationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [a].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwApplicationRoles] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: Permissions for vwApplicationRoles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwApplicationRoles] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: spCreateApplicationRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ApplicationRole
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateApplicationRole]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateApplicationRole];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateApplicationRole]
    @ID uniqueidentifier = NULL,
    @ApplicationID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanAccess bit = NULL,
    @CanAdmin bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
            (
                [ID],
                [ApplicationID],
                [RoleID],
                [CanAccess],
                [CanAdmin]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ApplicationID,
                @RoleID,
                ISNULL(@CanAccess, 1),
                ISNULL(@CanAdmin, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
            (
                [ApplicationID],
                [RoleID],
                [CanAccess],
                [CanAdmin]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ApplicationID,
                @RoleID,
                ISNULL(@CanAccess, 1),
                ISNULL(@CanAdmin, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwApplicationRoles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplicationRole] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Application Roles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplicationRole] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: spUpdateApplicationRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ApplicationRole
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateApplicationRole]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateApplicationRole];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateApplicationRole]
    @ID uniqueidentifier,
    @ApplicationID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanAccess bit,
    @CanAdmin bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ApplicationRole]
    SET
        [ApplicationID] = @ApplicationID,
        [RoleID] = @RoleID,
        [CanAccess] = @CanAccess,
        [CanAdmin] = @CanAdmin
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwApplicationRoles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwApplicationRoles]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplicationRole] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ApplicationRole table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateApplicationRole]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateApplicationRole];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateApplicationRole
ON [${flyway:defaultSchema}].[ApplicationRole]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ApplicationRole]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ApplicationRole] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Application Roles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplicationRole] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: spDeleteApplicationRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationRole
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteApplicationRole]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteApplicationRole];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplicationRole]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ApplicationRole]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplicationRole] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Application Roles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplicationRole] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8fde076-8709-484a-beb7-6f8e104f9c52' OR (EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND Name = 'Application')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8fde076-8709-484a-beb7-6f8e104f9c52',
            '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- Entity: MJ: Application Roles
            100015,
            'Application',
            'Application',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fd232d0-501b-4b50-9161-220f43381de9' OR (EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND Name = 'Role')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6fd232d0-501b-4b50-9161-220f43381de9',
            '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- Entity: MJ: Application Roles
            100016,
            'Role',
            'Role',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E76A4F1E-353A-4B03-AFBD-C01D89CD6826'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C85AF0D2-0087-4B0B-9B42-4CEA052151CD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D8FDE076-8709-484A-BEB7-6F8E104F9C52'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6FD232D0-501B-4B50-9161-220F43381DE9'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'D8FDE076-8709-484A-BEB7-6F8E104F9C52'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '6FD232D0-501B-4B50-9161-220F43381DE9'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Application Roles.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA036F52-2ADE-46A5-8F59-B0DC5B585604' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Application Roles.ApplicationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Role Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Application',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF3A1A6B-FE9A-4CAB-91DF-5B31B7163B24' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Application Roles.Application 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Role Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Application Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8FDE076-8709-484A-BEB7-6F8E104F9C52' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Application Roles.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Role Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11AEBE82-D291-41BA-8D4A-B82269D19A47' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Application Roles.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Role Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6FD232D0-501B-4B50-9161-220F43381DE9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Application Roles.CanAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Permissions',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E76A4F1E-353A-4B03-AFBD-C01D89CD6826' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Application Roles.CanAdmin 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Permissions',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C85AF0D2-0087-4B0B-9B42-4CEA052151CD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Application Roles.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8ED625B3-C9A0-4FE5-BF9B-0A3B2BA878DF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Application Roles.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DDB6E26-63B2-493A-8A06-A5CD09E0FE7B' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-shield-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('10ceddf0-68df-435b-ae79-5012ec42ec0a', '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', 'FieldCategoryInfo', '{"Role Assignment":{"icon":"fa fa-link","description":"The specific application and role association being configured"},"Access Permissions":{"icon":"fa fa-user-lock","description":"Specific access and administrative rights granted to the role for this application"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ae7824ff-ad5b-4b5a-9023-51e90c0cb0d0', '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', 'FieldCategoryIcons', '{"Role Assignment":"fa fa-link","Access Permissions":"fa fa-user-lock","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259'
      

