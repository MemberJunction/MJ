/* ============================================================================
   Entity Field Permissions — Field-Level (Column-Level) Security
   v6.1.x

   Companion plan: plans/field-level-security.md (Phase 1).

   Adds role-based FIELD-level access control, filling the gap between the
   existing entity-level CRUD permissions (EntityPermission) and row-level
   security (RowLevelSecurityFilter). Until now the only field-scoped feature
   was encryption-at-rest, which obfuscates data but does not control per-role
   visibility.

   Permission model — mirrors EntityPermission exactly:
     * Allow rows OR-aggregate across all of the user's matching roles.
     * Deny rows from ANY matching role subtract from the aggregated Allow set.
     * NO records for a field  → fully open (backwards compatible: every
       existing deployment behaves identically after this migration until an
       administrator explicitly adds a row).
     * Records exist but NONE match the user's roles → no access.

   CanCreate ships in the schema now but is NOT enforced in this release
   (CanRead/CanUpdate only). Adding the column up front is cheaper than a
   follow-up schema change and keeps the table additive-only under the
   publish-then-no-breaking-changes policy; enforcement is a later, additive
   change once the INSERT-time semantics for NOT NULL columns are settled.

   Enforcement (Phase 2, separate change) happens at the OUTPUT boundary —
   result projection and GraphQL field mapping — never by mutating a loaded
   entity's in-memory values, which would round-trip as a real NULL write via
   GenerateSaveSQL. Predicate validation (ExtraFilter/OrderBy/UserSearchString)
   is a first-class enforcement point alongside output projection.

   CodeGen convention (per migrations/CLAUDE.md):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates them automatically.
     * sp_addextendedproperty for every non-PK/FK column so CodeGen surfaces
       descriptions on regen.
   ============================================================================ */


-- ============================================================================
-- EntityFieldPermission  ("MJ: Entity Field Permissions")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.EntityFieldPermission (
    ID            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_EntityFieldPermission_ID DEFAULT (NEWSEQUENTIALID()),
    EntityFieldID UNIQUEIDENTIFIER NOT NULL,
    RoleID        UNIQUEIDENTIFIER NOT NULL,
    Type          NVARCHAR(10)     NOT NULL CONSTRAINT DF_EntityFieldPermission_Type DEFAULT (N'Allow'),
    CanRead       BIT              NOT NULL CONSTRAINT DF_EntityFieldPermission_CanRead DEFAULT (0),
    CanUpdate     BIT              NOT NULL CONSTRAINT DF_EntityFieldPermission_CanUpdate DEFAULT (0),
    CanCreate     BIT              NOT NULL CONSTRAINT DF_EntityFieldPermission_CanCreate DEFAULT (0),
    CONSTRAINT PK_EntityFieldPermission PRIMARY KEY (ID),
    CONSTRAINT FK_EntityFieldPermission_EntityField
        FOREIGN KEY (EntityFieldID) REFERENCES ${flyway:defaultSchema}.EntityField(ID),
    CONSTRAINT FK_EntityFieldPermission_Role
        FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT UQ_EntityFieldPermission_Field_Role_Type UNIQUE (EntityFieldID, RoleID, Type),
    CONSTRAINT CK_EntityFieldPermission_Type CHECK (Type IN (N'Allow', N'Deny'))
);
GO


-- ============================================================================
-- Descriptions
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Role-based field-level (column-level) security. Maps an entity field to a role with per-field Read/Update access flags and Allow/Deny semantics, mirroring EntityPermission at entity level. Allow rows OR-aggregate across the roles a user holds; a Deny row from any matching role subtracts from that aggregate. When NO rows exist for a field, access is fully open (backwards compatible) and governed solely by entity-level permissions; when rows exist but none match the user''s roles, access is denied. Primary keys and MemberJunction system audit columns are never restrictable.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Allow (default) or Deny. Deny rows override matching Allow rows for the same access flag during EntityFieldInfo.GetUserFieldPermissions() aggregation, letting administrators carve out specific role exclusions without restructuring the Allow grants.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission',
    @level2type = N'COLUMN', @level2name = N'Type';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1 on an Allow row, this role may read the field''s values. When 1 on a Deny row, this role is blocked from reading it regardless of any Allow grant. Enforced at the API output boundary (result projection and GraphQL field mapping) and by predicate validation, which rejects an ExtraFilter/OrderBy referencing an unreadable field.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission',
    @level2type = N'COLUMN', @level2name = N'CanRead';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1 on an Allow row, this role may modify the field''s value on an existing record. When 1 on a Deny row, this role is blocked from modifying it regardless of any Allow grant. Enforced server-side before SQL generation; the client-side BaseEntity check is UX-level defense-in-depth only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission',
    @level2type = N'COLUMN', @level2name = N'CanUpdate';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reserved for a future release: whether this role may supply the field''s value on INSERT. The column ships now so the schema stays additive, but it is NOT enforced in this release — only CanRead and CanUpdate are. Enforcement is deferred until the semantics for NOT NULL columns a user cannot populate are settled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission',
    @level2type = N'COLUMN', @level2name = N'CanCreate';
GO























































/* ============================================================================= */
/* ============================================================================= */
/*                    ⚙️  CODEGEN OUTPUT BELOW THIS LINE  ⚙️                      */
/*                                                                               */
/* Everything below this block was generated by the MemberJunction CodeGen tool  */
/* after the hand-written DDL above was applied to the development database.     */
/*                                                                               */
/* It contains the framework plumbing for the new EntityFieldPermission entity:  */
/*   - Entity metadata INSERT ("MJ: Entity Field Permissions")                   */
/*   - Application entity registration and role permission grants                */
/*   - __mj_CreatedAt / __mj_UpdatedAt columns, defaults, and update trigger     */
/*   - EntityField metadata rows (including the EntityField/Role virtual name    */
/*     columns the base view joins in) and EntityFieldValue rows for the         */
/*     Type CHECK constraint                                                     */
/*   - Foreign key indexes (IDX_AUTO_MJ_FKEY_*)                                  */
/*   - The base view vwEntityFieldPermissions                                    */
/*   - spCreate / spUpdate / spDelete stored procedures + EXECUTE grants         */
/*   - Extended properties                                                       */
/*                                                                               */
/* DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen    */
/* and replace this entire section with the fresh output.                        */
/* ============================================================================= */
/* ============================================================================= */

/* SQL generated to create new entity MJ: Entity Field Permissions */

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
         '73a1329b-5372-441d-8a47-670d5b3c6f72',
         'MJ: Entity Field Permissions',
         'Entity Field Permissions',
         'Role-based field-level (column-level) security. Maps an entity field to a role with per-field Read/Update access flags and Allow/Deny semantics, mirroring EntityPermission at entity level. Allow rows OR-aggregate across the roles a user holds; a Deny row from any matching role subtracts from that aggregate. When NO rows exist for a field, access is fully open (backwards compatible) and governed solely by entity-level permissions; when rows exist but none match the user''s roles, access is denied. Primary keys and MemberJunction system audit columns are never restrictable.',
         NULL,
         'EntityFieldPermission',
         'vwEntityFieldPermissions',
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
      );

/* SQL generated to add new entity MJ: Entity Field Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '73a1329b-5372-441d-8a47-670d5b3c6f72', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('73a1329b-5372-441d-8a47-670d5b3c6f72', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('73a1329b-5372-441d-8a47-670d5b3c6f72', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('73a1329b-5372-441d-8a47-670d5b3c6f72', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFieldPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityFieldPermission] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFieldPermission */
UPDATE [${flyway:defaultSchema}].[EntityFieldPermission] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFieldPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityFieldPermission] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFieldPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityFieldPermission] ADD CONSTRAINT [DF___mj_EntityFieldPermission___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFieldPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityFieldPermission] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFieldPermission */
UPDATE [${flyway:defaultSchema}].[EntityFieldPermission] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFieldPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityFieldPermission] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFieldPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityFieldPermission] ADD CONSTRAINT [DF___mj_EntityFieldPermission___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 9 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fbcfe19-49a4-481f-af74-05e1aa04952e' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = 'ID')) BEGIN
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
            [IsComputed],
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
            '6fbcfe19-49a4-481f-af74-05e1aa04952e',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ad4d3cf-4442-4b7b-97c7-c744906305fc' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = 'EntityFieldID')) BEGIN
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
            [IsComputed],
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
            '8ad4d3cf-4442-4b7b-97c7-c744906305fc',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100002,
            'EntityFieldID',
            'Entity Field ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'DF238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b44531bf-1eb2-427a-b44f-4a2da0564916' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = 'RoleID')) BEGIN
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
            [IsComputed],
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
            'b44531bf-1eb2-427a-b44f-4a2da0564916',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100003,
            'RoleID',
            'Role ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2215bbbd-1c24-4964-8178-bc2e8f94d189' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = 'Type')) BEGIN
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
            [IsComputed],
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
            '2215bbbd-1c24-4964-8178-bc2e8f94d189',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100004,
            'Type',
            'Type',
            'Allow (default) or Deny. Deny rows override matching Allow rows for the same access flag during EntityFieldInfo.GetUserFieldPermissions() aggregation, letting administrators carve out specific role exclusions without restructuring the Allow grants.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'Allow',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'afa27274-7846-48af-8e3f-d20a80901a4c' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = 'CanRead')) BEGIN
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
            [IsComputed],
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
            'afa27274-7846-48af-8e3f-d20a80901a4c',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100005,
            'CanRead',
            'Can Read',
            'When 1 on an Allow row, this role may read the field''s values. When 1 on a Deny row, this role is blocked from reading it regardless of any Allow grant. Enforced at the API output boundary (result projection and GraphQL field mapping) and by predicate validation, which rejects an ExtraFilter/OrderBy referencing an unreadable field.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8feb045-8080-4dca-a59e-b41974e0ec0f' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = 'CanUpdate')) BEGIN
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
            [IsComputed],
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
            'd8feb045-8080-4dca-a59e-b41974e0ec0f',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100006,
            'CanUpdate',
            'Can Update',
            'When 1 on an Allow row, this role may modify the field''s value on an existing record. When 1 on a Deny row, this role is blocked from modifying it regardless of any Allow grant. Enforced server-side before SQL generation; the client-side BaseEntity check is UX-level defense-in-depth only.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c18d78f5-d212-4af4-9bbf-4985e417c704' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = 'CanCreate')) BEGIN
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
            [IsComputed],
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
            'c18d78f5-d212-4af4-9bbf-4985e417c704',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100007,
            'CanCreate',
            'Can Create',
            'Reserved for a future release: whether this role may supply the field''s value on INSERT. The column ships now so the schema stays additive, but it is NOT enforced in this release — only CanRead and CanUpdate are. Enforcement is deferred until the semantics for NOT NULL columns a user cannot populate are settled.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '384187b9-ebaf-4212-bd81-4cf8fe874062' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = '__mj_CreatedAt')) BEGIN
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
            [IsComputed],
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
            '384187b9-ebaf-4212-bd81-4cf8fe874062',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100008,
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a589a45-53a9-429e-b0ec-451ce3fee508' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = '__mj_UpdatedAt')) BEGIN
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
            [IsComputed],
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
            '8a589a45-53a9-429e-b0ec-451ce3fee508',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100009,
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
      END;

/* SQL text to insert entity field value with ID e485b812-e522-4526-ae50-ac5dbb8365c4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e485b812-e522-4526-ae50-ac5dbb8365c4', '2215BBBD-1C24-4964-8178-BC2E8F94D189', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6b0481dd-7986-4e8f-85d1-f788695e26f2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6b0481dd-7986-4e8f-85d1-f788695e26f2', '2215BBBD-1C24-4964-8178-BC2E8F94D189', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2215BBBD-1C24-4964-8178-BC2E8F94D189 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2215BBBD-1C24-4964-8178-BC2E8F94D189';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Field Permissions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '758c5ad7-2f30-4657-8916-9ca4d4f4c01e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('758c5ad7-2f30-4657-8916-9ca4d4f4c01e', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '73A1329B-5372-441D-8A47-670D5B3C6F72', 'RoleID', 'One To Many', 1, 1, 17, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entity Fields -> MJ: Entity Field Permissions (One To Many via EntityFieldID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a2390b10-2dc4-40cf-bca0-3068f2528f69'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a2390b10-2dc4-40cf-bca0-3068f2528f69', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '73A1329B-5372-441D-8A47-670D5B3C6F72', 'EntityFieldID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for EntityFieldPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityFieldID in table EntityFieldPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFieldPermission_EntityFieldID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFieldPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFieldPermission_EntityFieldID ON [${flyway:defaultSchema}].[EntityFieldPermission] ([EntityFieldID]);

-- Index for foreign key RoleID in table EntityFieldPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFieldPermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFieldPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFieldPermission_RoleID ON [${flyway:defaultSchema}].[EntityFieldPermission] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 8AD4D3CF-4442-4B7B-97C7-C744906305FC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8AD4D3CF-4442-4B7B-97C7-C744906305FC', @RelatedEntityNameFieldMap='EntityField';

/* SQL text to update entity field related entity name field map for entity field ID B44531BF-1EB2-427A-B44F-4A2DA0564916 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B44531BF-1EB2-427A-B44F-4A2DA0564916', @RelatedEntityNameFieldMap='Role';

/* Base View SQL for MJ: Entity Field Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Permissions
-- Item: vwEntityFieldPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Field Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityFieldPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityFieldPermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityFieldPermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityFieldPermissions]
AS
SELECT
    e.*,
    MJEntityField_EntityFieldID.[Name] AS [EntityField],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[EntityFieldPermission] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EntityField] AS MJEntityField_EntityFieldID
  ON
    [e].[EntityFieldID] = MJEntityField_EntityFieldID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [e].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFieldPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Entity Field Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Permissions
-- Item: Permissions for vwEntityFieldPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFieldPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Entity Field Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Permissions
-- Item: spCreateEntityFieldPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFieldPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFieldPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldPermission]
    @ID uniqueidentifier = NULL,
    @EntityFieldID uniqueidentifier,
    @RoleID uniqueidentifier,
    @Type nvarchar(10) = NULL,
    @CanRead bit = NULL,
    @CanUpdate bit = NULL,
    @CanCreate bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldPermission]
            (
                [ID],
                [EntityFieldID],
                [RoleID],
                [Type],
                [CanRead],
                [CanUpdate],
                [CanCreate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityFieldID,
                @RoleID,
                ISNULL(@Type, 'Allow'),
                ISNULL(@CanRead, 0),
                ISNULL(@CanUpdate, 0),
                ISNULL(@CanCreate, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldPermission]
            (
                [EntityFieldID],
                [RoleID],
                [Type],
                [CanRead],
                [CanUpdate],
                [CanCreate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityFieldID,
                @RoleID,
                ISNULL(@Type, 'Allow'),
                ISNULL(@CanRead, 0),
                ISNULL(@CanUpdate, 0),
                ISNULL(@CanCreate, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFieldPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFieldPermission] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Field Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFieldPermission] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Field Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Permissions
-- Item: spUpdateEntityFieldPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFieldPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityFieldPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldPermission]
    @ID uniqueidentifier,
    @EntityFieldID uniqueidentifier = NULL,
    @RoleID uniqueidentifier = NULL,
    @Type nvarchar(10) = NULL,
    @CanRead bit = NULL,
    @CanUpdate bit = NULL,
    @CanCreate bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldPermission]
    SET
        [EntityFieldID] = ISNULL(@EntityFieldID, [EntityFieldID]),
        [RoleID] = ISNULL(@RoleID, [RoleID]),
        [Type] = ISNULL(@Type, [Type]),
        [CanRead] = ISNULL(@CanRead, [CanRead]),
        [CanUpdate] = ISNULL(@CanUpdate, [CanUpdate]),
        [CanCreate] = ISNULL(@CanCreate, [CanCreate])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFieldPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFieldPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFieldPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFieldPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityFieldPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityFieldPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityFieldPermission
ON [${flyway:defaultSchema}].[EntityFieldPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityFieldPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Field Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFieldPermission] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Field Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Permissions
-- Item: spDeleteEntityFieldPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFieldPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityFieldPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityFieldPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFieldPermission] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Field Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFieldPermission] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50d1960b-8612-4dcc-9e83-d08312888d79' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = 'EntityField')) BEGIN
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
            [IsComputed],
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
            '50d1960b-8612-4dcc-9e83-d08312888d79',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100019,
            'EntityField',
            'Entity Field',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37d71201-c458-42dc-880e-75cc743bad1c' OR (EntityID = '73A1329B-5372-441D-8A47-670D5B3C6F72' AND Name = 'Role')) BEGIN
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
            [IsComputed],
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
            '37d71201-c458-42dc-880e-75cc743bad1c',
            '73A1329B-5372-441D-8A47-670D5B3C6F72', -- Entity: MJ: Entity Field Permissions
            100020,
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
      END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2215BBBD-1C24-4964-8178-BC2E8F94D189'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AFA27274-7846-48AF-8E3F-D20A80901A4C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D8FEB045-8080-4DCA-A59E-B41974E0EC0F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '50D1960B-8612-4DCC-9E83-D08312888D79'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '37D71201-C458-42DC-880E-75CC743BAD1C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '50D1960B-8612-4DCC-9E83-D08312888D79'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '37D71201-C458-42DC-880E-75CC743BAD1C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6FBCFE19-49A4-481F-AF74-05E1AA04952E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.EntityFieldID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Scope',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8AD4D3CF-4442-4B7B-97C7-C744906305FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Scope',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B44531BF-1EB2-427A-B44F-4A2DA0564916' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.EntityField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Scope',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '50D1960B-8612-4DCC-9E83-D08312888D79' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Scope',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37D71201-C458-42DC-880E-75CC743BAD1C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Access Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2215BBBD-1C24-4964-8178-BC2E8F94D189' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.CanRead 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AFA27274-7846-48AF-8E3F-D20A80901A4C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.CanUpdate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8FEB045-8080-4DCA-A59E-B41974E0EC0F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.CanCreate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C18D78F5-D212-4AF4-9BBF-4985E417C704' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '384187B9-EBAF-4212-BD81-4CF8FE874062' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A589A45-53A9-429E-B0EC-451CE3FEE508' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-shield-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '73A1329B-5372-441D-8A47-670D5B3C6F72';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('dd7edb6a-f7ec-4a5b-b469-c6de8c661c6c', '73A1329B-5372-441D-8A47-670D5B3C6F72', 'FieldCategoryInfo', '{"Permission Scope":{"icon":"fa fa-crosshairs","description":"Defines the target entity field and the role affected by this permission"},"Access Rules":{"icon":"fa fa-lock","description":"Defines the specific read, update, or create access permissions granted or denied"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3637d688-bbf9-4461-bd75-4496b45b08b3', '73A1329B-5372-441D-8A47-670D5B3C6F72', 'FieldCategoryIcons', '{"Permission Scope":"fa fa-crosshairs","Access Rules":"fa fa-lock","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '73A1329B-5372-441D-8A47-670D5B3C6F72';

