/* SQL generated to create new entity MJ: Search Scope Permissions */

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
         [AllowUserSearchAPI],
         [AllowCaching]
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
         '3939c9ec-bf91-4009-b83e-6e79307e06e9',
         'MJ: Search Scope Permissions',
         'Search Scope Permissions',
         'Per-user or per-role permission grant on a SearchScope. Exactly one of UserID or RoleID is set on each row; the other is NULL. PermissionLevel is one of None, Read, Search, Manage. Combined with AIAgent.SearchScopeAccess for agent-side fallbacks via the SearchScopePermissionResolver.',
         NULL,
         'SearchScopePermission',
         'vwSearchScopePermissions',
         '${flyway:defaultSchema}',
         1,
         1,
         1
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
   

/* SQL generated to add new entity MJ: Search Scope Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3939c9ec-bf91-4009-b83e-6e79307e06e9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Search Scope Permissions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3939c9ec-bf91-4009-b83e-6e79307e06e9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Search Scope Permissions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3939c9ec-bf91-4009-b83e-6e79307e06e9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Search Scope Permissions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3939c9ec-bf91-4009-b83e-6e79307e06e9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
UPDATE [${flyway:defaultSchema}].[SearchScopePermission] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ADD CONSTRAINT [DF___mj_SearchScopePermission___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
UPDATE [${flyway:defaultSchema}].[SearchScopePermission] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ADD CONSTRAINT [DF___mj_SearchScopePermission___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '643c02f8-60c1-4a99-9bf1-e7ab3ad84800' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = 'ID')) BEGIN
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
            '643c02f8-60c1-4a99-9bf1-e7ab3ad84800',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
            100001,
            'ID',
            'ID',
            'Primary key. Auto-generated.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aedd1cbc-6d4a-4ab0-9403-c3c0ac7d662d' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = 'SearchScopeID')) BEGIN
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
            'aedd1cbc-6d4a-4ab0-9403-c3c0ac7d662d',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
            100002,
            'SearchScopeID',
            'Search Scope ID',
            'The SearchScope this permission row applies to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '73A3EDE8-070F-4CC8-BD5D-C6B654FAE2F6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bbd065e7-97b7-4ce3-b97a-a32a9d237bd3' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = 'UserID')) BEGIN
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
            'bbd065e7-97b7-4ce3-b97a-a32a9d237bd3',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
            100003,
            'UserID',
            'User ID',
            'The user this permission applies to. Mutually exclusive with RoleID — exactly one must be set.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5f5ef24-662e-406a-803c-e9b2ab311b75' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = 'RoleID')) BEGIN
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
            'c5f5ef24-662e-406a-803c-e9b2ab311b75',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
            100004,
            'RoleID',
            'Role ID',
            'The role this permission applies to. Mutually exclusive with UserID — exactly one must be set. Permissions granted via roles flow to all users in that role.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06a5b4dc-729b-40f9-9c9e-c7f03ef33eeb' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = 'PermissionLevel')) BEGIN
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
            '06a5b4dc-729b-40f9-9c9e-c7f03ef33eeb',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
            100005,
            'PermissionLevel',
            'Permission Level',
            'Capability granted on this SearchScope. None = explicit deny (overrides role grants), Read = view scope metadata, Search = invoke ScopedSearchAction, Manage = full edit including authoring of permission rows. The resolver picks the highest level when multiple grants apply (direct + role).',
            'nvarchar',
            40,
            0,
            0,
            0,
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3d15591-ae65-4680-b625-553679e43fbc' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a3d15591-ae65-4680-b625-553679e43fbc',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd5e940b-edf0-4751-904f-01023961a3e8' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'fd5e940b-edf0-4751-904f-01023961a3e8',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
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

/* SQL text to insert entity field value with ID 5c15b190-4d08-4a1d-93c5-bb35f1e48fb8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5c15b190-4d08-4a1d-93c5-bb35f1e48fb8', '06A5B4DC-729B-40F9-9C9E-C7F03EF33EEB', 1, 'Manage', 'Manage', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 69ec75aa-741e-4461-9729-239377b9e58a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('69ec75aa-741e-4461-9729-239377b9e58a', '06A5B4DC-729B-40F9-9C9E-C7F03EF33EEB', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 12d029c2-8492-424f-ad87-d66c815dd00a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('12d029c2-8492-424f-ad87-d66c815dd00a', '06A5B4DC-729B-40F9-9C9E-C7F03EF33EEB', 3, 'Read', 'Read', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID a7c9bfe2-cf2f-4938-9081-761e161f17d0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a7c9bfe2-cf2f-4938-9081-761e161f17d0', '06A5B4DC-729B-40F9-9C9E-C7F03EF33EEB', 4, 'Search', 'Search', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 06A5B4DC-729B-40F9-9C9E-C7F03EF33EEB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='06A5B4DC-729B-40F9-9C9E-C7F03EF33EEB'


/* Create Entity Relationship: MJ: Roles -> MJ: Search Scope Permissions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '73bde172-011b-4d43-ac10-031be9367126'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('73bde172-011b-4d43-ac10-031be9367126', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '3939C9EC-BF91-4009-B83E-6E79307E06E9', 'RoleID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Search Scope Permissions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4c407124-9797-4a76-8d68-1322dd2e76db'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4c407124-9797-4a76-8d68-1322dd2e76db', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3939C9EC-BF91-4009-B83E-6E79307E06E9', 'UserID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Search Scopes -> MJ: Search Scope Permissions (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5036194d-6382-44bc-ad75-1cc62bebd513'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5036194d-6382-44bc-ad75-1cc62bebd513', '73A3EDE8-070F-4CC8-BD5D-C6B654FAE2F6', '3939C9EC-BF91-4009-B83E-6E79307E06E9', 'SearchScopeID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for SearchScopePermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopePermission_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopePermission_SearchScopeID ON [${flyway:defaultSchema}].[SearchScopePermission] ([SearchScopeID]);

-- Index for foreign key UserID in table SearchScopePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopePermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopePermission_UserID ON [${flyway:defaultSchema}].[SearchScopePermission] ([UserID]);

-- Index for foreign key RoleID in table SearchScopePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopePermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopePermission_RoleID ON [${flyway:defaultSchema}].[SearchScopePermission] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID AEDD1CBC-6D4A-4AB0-9403-C3C0AC7D662D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='AEDD1CBC-6D4A-4AB0-9403-C3C0AC7D662D', @RelatedEntityNameFieldMap='SearchScope'

/* SQL text to update entity field related entity name field map for entity field ID BBD065E7-97B7-4CE3-B97A-A32A9D237BD3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BBD065E7-97B7-4CE3-B97A-A32A9D237BD3', @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID C5F5EF24-662E-406A-803C-E9B2AB311B75 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C5F5EF24-662E-406A-803C-E9B2AB311B75', @RelatedEntityNameFieldMap='Role'

/* Base View SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: vwSearchScopePermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchScopePermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchScopePermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchScopePermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchScopePermissions]
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope],
    MJUser_UserID.[Name] AS [User],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[SearchScopePermission] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [s].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [s].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [s].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopePermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: Permissions for vwSearchScopePermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopePermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: spCreateSearchScopePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopePermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchScopePermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopePermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopePermission]
    @ID uniqueidentifier = NULL,
    @SearchScopeID uniqueidentifier,
    @UserID uniqueidentifier,
    @RoleID uniqueidentifier,
    @PermissionLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchScopePermission]
            (
                [ID],
                [SearchScopeID],
                [UserID],
                [RoleID],
                [PermissionLevel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SearchScopeID,
                @UserID,
                @RoleID,
                @PermissionLevel
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchScopePermission]
            (
                [SearchScopeID],
                [UserID],
                [RoleID],
                [PermissionLevel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SearchScopeID,
                @UserID,
                @RoleID,
                @PermissionLevel
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchScopePermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopePermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Search Scope Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopePermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: spUpdateSearchScopePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopePermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchScopePermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopePermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopePermission]
    @ID uniqueidentifier,
    @SearchScopeID uniqueidentifier,
    @UserID uniqueidentifier,
    @RoleID uniqueidentifier,
    @PermissionLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopePermission]
    SET
        [SearchScopeID] = @SearchScopeID,
        [UserID] = @UserID,
        [RoleID] = @RoleID,
        [PermissionLevel] = @PermissionLevel
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchScopePermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchScopePermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopePermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchScopePermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchScopePermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchScopePermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchScopePermission
ON [${flyway:defaultSchema}].[SearchScopePermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopePermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchScopePermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Search Scope Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopePermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: spDeleteSearchScopePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopePermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchScopePermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopePermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopePermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchScopePermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopePermission] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Search Scope Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopePermission] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bee7fd29-f483-457d-add5-5d057a626f94' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = 'SearchScope')) BEGIN
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
            'bee7fd29-f483-457d-add5-5d057a626f94',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
            100015,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb709707-99b2-4da3-b5ae-7b8675484e83' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = 'User')) BEGIN
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
            'cb709707-99b2-4da3-b5ae-7b8675484e83',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
            100016,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dbde454c-e91c-4bc9-a9c3-6a82d5866259' OR (EntityID = '3939C9EC-BF91-4009-B83E-6E79307E06E9' AND Name = 'Role')) BEGIN
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
            'dbde454c-e91c-4bc9-a9c3-6a82d5866259',
            '3939C9EC-BF91-4009-B83E-6E79307E06E9', -- Entity: MJ: Search Scope Permissions
            100017,
            'Role',
            'Role',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
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

