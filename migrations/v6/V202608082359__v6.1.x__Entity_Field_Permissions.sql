/* ============================================================================
   Entity Field Permissions — Field-Level (Column-Level) Security
   v6.1.x

   Companion plans: plans/fls-redesign-direction.md (the direction),
                    plans/fls-redesign-research.md  (R1-R8 + the forward plan).

   Adds role-based FIELD-level access control, filling the gap between the
   existing entity-level CRUD permissions (EntityPermission) and row-level
   security (RowLevelSecurityFilter). Until now the only field-scoped feature
   was encryption-at-rest, which obfuscates data but does not control per-role
   visibility.

   TWO PIECES SHIP HERE:

   1. Entity.EnableFieldLevelSecurity — field-level security is ON or OFF per
      entity, EXPLICITLY. Enforcement gates on this flag alone. It is never
      inferred from "does any permission row happen to exist," which is the
      model this replaces: under that model the FIRST rule an administrator
      wrote closed the field for everyone without an explicit Allow, including
      users no rule mentioned. Flipping the flag ON snapshots the entity's
      existing entity-level permissions into per-field rows, so enabling it
      changes NOTHING behaviourally until an admin tightens a field.

   2. EntityFieldPermission — one row per (field, role), carrying three
      INDEPENDENT trinary verbs: ReadAccess, UpdateAccess, CreateAccess.

   Trinary semantics, modelled on SQL Server's own posture:
     * 'No Access' — NEUTRAL. Grants nothing, blocks nothing. Another role's
       Allow still wins. This is the default, so a hand-inserted row grants
       nothing by accident.
     * 'Allow'     — grants the action for this role.
     * 'Deny'      — trumps everything. Any Deny across any of the user's roles
       wins, no matter how many Allows sit beside it ("multiply by zero").

   Aggregation across the roles a user holds, per verb:
       effective = (any matching row Allows) AND NOT (any matching row Denies)

   READ IS REQUIRED FOR UPDATE AND CREATE. The CK_..._ReadRequired constraint
   below enforces that WITHIN A ROW. It cannot enforce it ACROSS roles — role A
   granting Read+Update and role B denying Read are each individually legal, and
   a user holding both aggregates to read-denied + update-allowed. So the rule is
   applied a SECOND time after aggregation (EntityFieldInfo.GetUserFieldPermissions):
   if effective Read is not Allow, Update and Create are forced down. The
   constraint catches the configuration mistake; the aggregation clamp is the
   enforcement. Neither alone is sufficient.

   CodeGen convention (per migrations/CLAUDE.md):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates them automatically.
     * sp_addextendedproperty for every non-PK/FK column so CodeGen surfaces
       descriptions on regen.
     * PostgreSQL counterpart is NOT hand-authored — conversion is deterministic
       transpilation run by the build engineer at release time.
   ============================================================================ */


-- ============================================================================
-- Entity.EnableFieldLevelSecurity
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.Entity
    ADD EnableFieldLevelSecurity BIT NOT NULL
        CONSTRAINT DF_Entity_EnableFieldLevelSecurity DEFAULT (0);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, field-level (column-level) security is enforced for this entity and every enforcement point consults EntityFieldPermission rows. When 0 (the default), field-level security is off entirely and any existing permission rows are retained but inactive. Enabling snapshots the entity''s current entity-level permissions into per-field rows, so turning it on changes no behavior until an administrator tightens a field; disabling preserves the rows so re-enabling does not lose the configuration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'EnableFieldLevelSecurity';
GO


-- ============================================================================
-- EntityFieldPermission  ("MJ: Entity Field Permissions")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.EntityFieldPermission (
    ID            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_EntityFieldPermission_ID DEFAULT (NEWSEQUENTIALID()),
    EntityFieldID UNIQUEIDENTIFIER NOT NULL,
    RoleID        UNIQUEIDENTIFIER NOT NULL,
    ReadAccess    NVARCHAR(20)     NOT NULL CONSTRAINT DF_EntityFieldPermission_ReadAccess   DEFAULT (N'No Access'),
    UpdateAccess  NVARCHAR(20)     NOT NULL CONSTRAINT DF_EntityFieldPermission_UpdateAccess DEFAULT (N'No Access'),
    CreateAccess  NVARCHAR(20)     NOT NULL CONSTRAINT DF_EntityFieldPermission_CreateAccess DEFAULT (N'No Access'),
    CONSTRAINT PK_EntityFieldPermission PRIMARY KEY (ID),
    CONSTRAINT FK_EntityFieldPermission_EntityField
        FOREIGN KEY (EntityFieldID) REFERENCES ${flyway:defaultSchema}.EntityField(ID),
    CONSTRAINT FK_EntityFieldPermission_Role
        FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.Role(ID),
    -- One row per (field, role). The old model carried a Type discriminator and
    -- allowed an Allow row AND a Deny row for the same pair; the trinary verbs
    -- make that split unnecessary and the ambiguity impossible.
    CONSTRAINT UQ_EntityFieldPermission_Field_Role UNIQUE (EntityFieldID, RoleID),
    CONSTRAINT CK_EntityFieldPermission_ReadAccess
        CHECK (ReadAccess   IN (N'Allow', N'Deny', N'No Access')),
    CONSTRAINT CK_EntityFieldPermission_UpdateAccess
        CHECK (UpdateAccess IN (N'Allow', N'Deny', N'No Access')),
    CONSTRAINT CK_EntityFieldPermission_CreateAccess
        CHECK (CreateAccess IN (N'Allow', N'Deny', N'No Access')),
    -- Read is required for Update and for Create. Enforced per-row here; the
    -- across-roles case is clamped in the aggregation (see the header).
    CONSTRAINT CK_EntityFieldPermission_ReadRequired
        CHECK (NOT (ReadAccess <> N'Allow' AND UpdateAccess = N'Allow')
           AND NOT (ReadAccess <> N'Allow' AND CreateAccess = N'Allow'))
);
GO


-- ============================================================================
-- Descriptions
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Role-based field-level (column-level) security. One row per (entity field, role), carrying three independent trinary verbs — ReadAccess, UpdateAccess and CreateAccess — each Allow, Deny or No Access. Rows are only consulted when the parent entity has EnableFieldLevelSecurity = 1. Across the roles a user holds, a verb resolves to (any Allow) AND NOT (any Deny); No Access is neutral and grants nothing while blocking nothing. Read is required for Update and Create, enforced per row by a CHECK constraint and again after aggregation. Primary keys and MemberJunction system audit columns are never restrictable.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this role may read the field''s values. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default) and leaves the outcome to the user''s other roles. Enforced at the API output boundary (result projection and GraphQL field mapping), by predicate validation which rejects an ExtraFilter/OrderBy/Aggregate referencing an unreadable field, and by the strongly-typed accessor path which throws.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission',
    @level2type = N'COLUMN', @level2name = N'ReadAccess';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this role may modify the field''s value on an EXISTING record. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default). Requires ReadAccess = Allow — a field a user cannot see is one they cannot change. Enforced server-side before SQL generation; the client-side BaseEntity check is UX-level defense-in-depth only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission',
    @level2type = N'COLUMN', @level2name = N'UpdateAccess';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this role may supply the field''s value when INSERTING a record. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default). Requires ReadAccess = Allow. When a user may not create a field, any value they supply is dropped and the column takes its default — the insert is not rejected, matching the read path where a denied field is simply absent rather than an error. A NOT NULL column with no default that a user cannot create makes records uncreatable for that user; restricted fields should be nullable or defaulted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission',
    @level2type = N'COLUMN', @level2name = N'CreateAccess';
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
         'c4ecced4-5040-4da9-a022-3bc195090058',
         'MJ: Entity Field Permissions',
         'Entity Field Permissions',
         'Role-based field-level (column-level) security. One row per (entity field, role), carrying three independent trinary verbs — ReadAccess, UpdateAccess and CreateAccess — each Allow, Deny or No Access. Rows are only consulted when the parent entity has EnableFieldLevelSecurity = 1. Across the roles a user holds, a verb resolves to (any Allow) AND NOT (any Deny); No Access is neutral and grants nothing while blocking nothing. Read is required for Update and Create, enforced per row by a CHECK constraint and again after aggregation. Primary keys and MemberJunction system audit columns are never restrictable.',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c4ecced4-5040-4da9-a022-3bc195090058', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c4ecced4-5040-4da9-a022-3bc195090058', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c4ecced4-5040-4da9-a022-3bc195090058', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c4ecced4-5040-4da9-a022-3bc195090058', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

/* SQL text to insert 13 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f09794b3-9a79-4757-8d88-3541ae180a99' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = 'ID')) BEGIN
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
            'f09794b3-9a79-4757-8d88-3541ae180a99',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '983a6a23-cf4e-4e60-a6f4-d6b59a8c9ddf' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = 'EntityFieldID')) BEGIN
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
            '983a6a23-cf4e-4e60-a6f4-d6b59a8c9ddf',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e23bc9d4-be73-4c49-80e7-0fb332650a32' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = 'RoleID')) BEGIN
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
            'e23bc9d4-be73-4c49-80e7-0fb332650a32',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 3,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5c9d265-1d03-47f9-98a8-439237286f5b' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = 'ReadAccess')) BEGIN
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
            'b5c9d265-1d03-47f9-98a8-439237286f5b',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 4,
            'ReadAccess',
            'Read Access',
            'Whether this role may read the field''s values. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default) and leaves the outcome to the user''s other roles. Enforced at the API output boundary (result projection and GraphQL field mapping), by predicate validation which rejects an ExtraFilter/OrderBy/Aggregate referencing an unreadable field, and by the strongly-typed accessor path which throws.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'No Access',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96309560-f20a-46a0-877a-45f9ed055ead' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = 'UpdateAccess')) BEGIN
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
            '96309560-f20a-46a0-877a-45f9ed055ead',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 5,
            'UpdateAccess',
            'Update Access',
            'Whether this role may modify the field''s value on an EXISTING record. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default). Requires ReadAccess = Allow — a field a user cannot see is one they cannot change. Enforced server-side before SQL generation; the client-side BaseEntity check is UX-level defense-in-depth only.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'No Access',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '329e100d-b576-4dff-8427-f84b2fec212c' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = 'CreateAccess')) BEGIN
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
            '329e100d-b576-4dff-8427-f84b2fec212c',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 6,
            'CreateAccess',
            'Create Access',
            'Whether this role may supply the field''s value when INSERTING a record. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default). Requires ReadAccess = Allow. When a user may not create a field, any value they supply is dropped and the column takes its default — the insert is not rejected, matching the read path where a denied field is simply absent rather than an error. A NOT NULL column with no default that a user cannot create makes records uncreatable for that user; restricted fields should be nullable or defaulted.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'No Access',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ee3d05c-c928-4b3c-9719-9164d92b74d5' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4ee3d05c-c928-4b3c-9719-9164d92b74d5',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1bfb83e3-7800-41f1-8822-461d62787018' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '1bfb83e3-7800-41f1-8822-461d62787018',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 8,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63ecdd5f-63c1-4239-a53a-f7bdbe37bfb6' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EnableFieldLevelSecurity')) BEGIN
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
            '63ecdd5f-63c1-4239-a53a-f7bdbe37bfb6',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6') + 72,
            'EnableFieldLevelSecurity',
            'Enable Field Level Security',
            'When 1, field-level (column-level) security is enforced for this entity and every enforcement point consults EntityFieldPermission rows. When 0 (the default), field-level security is off entirely and any existing permission rows are retained but inactive. Enabling snapshots the entity''s current entity-level permissions into per-field rows, so turning it on changes no behavior until an administrator tightens a field; disabling preserves the rows so re-enabling does not lose the configuration.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef4e440f-5f6c-4e38-8a88-ab180a8f7555' OR (EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            'ef4e440f-5f6c-4e38-8a88-ab180a8f7555',
            '35248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Invocations
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '35248F34-2837-EF11-86D4-6045BDEE16E6') + 8,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '965069fd-90c1-4d4a-b879-f36f400e8de9' OR (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            '965069fd-90c1-4d4a-b879-f36f400e8de9',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Filters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '39248F34-2837-EF11-86D4-6045BDEE16E6') + 8,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e223148-556a-4a1a-924b-394e6aee57bc' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            '6e223148-556a-4a1a-924b-394e6aee57bc',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3E248F34-2837-EF11-86D4-6045BDEE16E6') + 19,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15b74d1d-1ef6-4463-bb31-49b21943ac1f' OR (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            '15b74d1d-1ef6-4463-bb31-49b21943ac1f',
            '56248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Params
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '56248F34-2837-EF11-86D4-6045BDEE16E6') + 10,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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

/* SQL text to insert entity field value with ID 3e718d60-c18f-42d3-8fc5-bb74a9139899 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3e718d60-c18f-42d3-8fc5-bb74a9139899', 'B5C9D265-1D03-47F9-98A8-439237286F5B', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b785f8fa-6d79-4a06-98c9-c6d937845cee */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b785f8fa-6d79-4a06-98c9-c6d937845cee', 'B5C9D265-1D03-47F9-98A8-439237286F5B', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 83521db3-66de-44cc-a8e7-e88016db4f8f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('83521db3-66de-44cc-a8e7-e88016db4f8f', 'B5C9D265-1D03-47F9-98A8-439237286F5B', 3, 'No Access', 'No Access', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B5C9D265-1D03-47F9-98A8-439237286F5B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B5C9D265-1D03-47F9-98A8-439237286F5B';

/* SQL text to insert entity field value with ID ae90fc3d-7860-48c1-99b6-065d077f9b62 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ae90fc3d-7860-48c1-99b6-065d077f9b62', '96309560-F20A-46A0-877A-45F9ED055EAD', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 345c073e-c2bd-4402-917d-0fc7123dab14 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('345c073e-c2bd-4402-917d-0fc7123dab14', '96309560-F20A-46A0-877A-45F9ED055EAD', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b94498c7-54b3-4451-a415-b92268e18a03 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b94498c7-54b3-4451-a415-b92268e18a03', '96309560-F20A-46A0-877A-45F9ED055EAD', 3, 'No Access', 'No Access', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 96309560-F20A-46A0-877A-45F9ED055EAD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='96309560-F20A-46A0-877A-45F9ED055EAD';

/* SQL text to insert entity field value with ID 31ea8637-755d-4dec-899a-9432929ab51d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('31ea8637-755d-4dec-899a-9432929ab51d', '329E100D-B576-4DFF-8427-F84B2FEC212C', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b31d1f32-a142-4e6c-a89b-972b11ec2f4f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b31d1f32-a142-4e6c-a89b-972b11ec2f4f', '329E100D-B576-4DFF-8427-F84B2FEC212C', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 860a60cf-741a-47a3-ab7f-4dd763b76b7c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('860a60cf-741a-47a3-ab7f-4dd763b76b7c', '329E100D-B576-4DFF-8427-F84B2FEC212C', 3, 'No Access', 'No Access', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 329E100D-B576-4DFF-8427-F84B2FEC212C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='329E100D-B576-4DFF-8427-F84B2FEC212C';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Field Permissions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f1cc8c88-a222-4a1a-a204-8ed067891dcc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f1cc8c88-a222-4a1a-a204-8ed067891dcc', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'C4ECCED4-5040-4DA9-A022-3BC195090058', 'RoleID', 'One To Many', 1, 1, 17, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entity Fields -> MJ: Entity Field Permissions (One To Many via EntityFieldID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f5dc6568-2422-47db-9690-9755837d8e47'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f5dc6568-2422-47db-9690-9755837d8e47', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'C4ECCED4-5040-4DA9-A022-3BC195090058', 'EntityFieldID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ActionExecutionLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActionID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_ActionID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([ActionID]);

-- Index for foreign key UserID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_UserID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([UserID]);

-- Index for foreign key EntityActionID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([EntityActionID]);

-- Index for foreign key EntityActionInvocationTypeID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionInvocationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionInvocationTypeID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([EntityActionInvocationTypeID]);

-- Index for foreign key TargetEntityID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_TargetEntityID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([TargetEntityID]);

/* Base View SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: vwActionExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Action Execution Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ActionExecutionLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActionExecutionLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActionExecutionLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActionExecutionLogs]
AS
SELECT
    a.*,
    MJAction_ActionID.[Name] AS [Action],
    MJUser_UserID.[Name] AS [User],
    MJEntityActionInvocationType_EntityActionInvocationTypeID.[Name] AS [EntityActionInvocationType],
    MJEntity_TargetEntityID.[Name] AS [TargetEntity]
FROM
    [${flyway:defaultSchema}].[ActionExecutionLog] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS MJAction_ActionID
  ON
    [a].[ActionID] = MJAction_ActionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityActionInvocationType] AS MJEntityActionInvocationType_EntityActionInvocationTypeID
  ON
    [a].[EntityActionInvocationTypeID] = MJEntityActionInvocationType_EntityActionInvocationTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [a].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* Base View Permissions SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: Permissions for vwActionExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spCreateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateActionExecutionLog]
    @ID uniqueidentifier = NULL,
    @ActionID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Params_Clear bit = 0,
    @Params nvarchar(MAX) = NULL,
    @ResultCode_Clear bit = 0,
    @ResultCode nvarchar(255) = NULL,
    @UserID uniqueidentifier,
    @RetentionPeriod_Clear bit = 0,
    @RetentionPeriod int = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @EntityActionID_Clear bit = 0,
    @EntityActionID uniqueidentifier = NULL,
    @EntityActionInvocationTypeID_Clear bit = 0,
    @EntityActionInvocationTypeID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(450) = NULL,
    @ResultParams_Clear bit = 0,
    @ResultParams nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ActionExecutionLog]
            (
                [ID],
                [ActionID],
                [StartedAt],
                [EndedAt],
                [Params],
                [ResultCode],
                [UserID],
                [RetentionPeriod],
                [Message],
                [EntityActionID],
                [EntityActionInvocationTypeID],
                [TargetEntityID],
                [TargetRecordID],
                [ResultParams]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ActionID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, NULL) END,
                CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, NULL) END,
                @UserID,
                CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, NULL) END,
                CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ActionExecutionLog]
            (
                [ActionID],
                [StartedAt],
                [EndedAt],
                [Params],
                [ResultCode],
                [UserID],
                [RetentionPeriod],
                [Message],
                [EntityActionID],
                [EntityActionInvocationTypeID],
                [TargetEntityID],
                [TargetRecordID],
                [ResultParams]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ActionID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, NULL) END,
                CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, NULL) END,
                @UserID,
                CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, NULL) END,
                CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActionExecutionLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Action Execution Logs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spUpdateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateActionExecutionLog]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Params_Clear bit = 0,
    @Params nvarchar(MAX) = NULL,
    @ResultCode_Clear bit = 0,
    @ResultCode nvarchar(255) = NULL,
    @UserID uniqueidentifier = NULL,
    @RetentionPeriod_Clear bit = 0,
    @RetentionPeriod int = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @EntityActionID_Clear bit = 0,
    @EntityActionID uniqueidentifier = NULL,
    @EntityActionInvocationTypeID_Clear bit = 0,
    @EntityActionInvocationTypeID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(450) = NULL,
    @ResultParams_Clear bit = 0,
    @ResultParams nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionExecutionLog]
    SET
        [ActionID] = ISNULL(@ActionID, [ActionID]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Params] = CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, [Params]) END,
        [ResultCode] = CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, [ResultCode]) END,
        [UserID] = ISNULL(@UserID, [UserID]),
        [RetentionPeriod] = CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, [RetentionPeriod]) END,
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [EntityActionID] = CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, [EntityActionID]) END,
        [EntityActionInvocationTypeID] = CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, [EntityActionInvocationTypeID]) END,
        [TargetEntityID] = CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, [TargetEntityID]) END,
        [TargetRecordID] = CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, [TargetRecordID]) END,
        [ResultParams] = CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, [ResultParams]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActionExecutionLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActionExecutionLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionExecutionLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateActionExecutionLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateActionExecutionLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateActionExecutionLog
ON [${flyway:defaultSchema}].[ActionExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionExecutionLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ActionExecutionLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Action Execution Logs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spDeleteActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteActionExecutionLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ActionExecutionLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionExecutionLog] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionExecutionLog] TO [cdp_Integration];

/* spDelete Permissions for MJ: Action Execution Logs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionExecutionLog] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionExecutionLog] TO [cdp_Integration];

/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

-- Index for foreign key ExternalDataSourceID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID ON [${flyway:defaultSchema}].[Entity] ([ExternalDataSourceID]);

/* Base View Permissions SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntities] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntities] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntities] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* spCreate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @NameSuffix_Clear bit = 0,
    @NameSuffix nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog_Clear bit = 0,
    @FullTextCatalog nvarchar(255) = NULL,
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex_Clear bit = 0,
    @FullTextIndex nvarchar(255) = NULL,
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction_Clear bit = 0,
    @FullTextSearchFunction nvarchar(255) = NULL,
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows_Clear bit = 0,
    @UserViewMaxRows int = NULL,
    @spCreate_Clear bit = 0,
    @spCreate nvarchar(255) = NULL,
    @spUpdate_Clear bit = 0,
    @spUpdate nvarchar(255) = NULL,
    @spDelete_Clear bit = 0,
    @spDelete nvarchar(255) = NULL,
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch_Clear bit = 0,
    @spMatch nvarchar(255) = NULL,
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName_Clear bit = 0,
    @EntityObjectSubclassName nvarchar(255) = NULL,
    @EntityObjectSubclassImport_Clear bit = 0,
    @EntityObjectSubclassImport nvarchar(255) = NULL,
    @PreferredCommunicationField_Clear bit = 0,
    @PreferredCommunicationField nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(500) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder_Clear bit = 0,
    @RowsToPackSampleOrder nvarchar(MAX) = NULL,
    @AutoRowCountFrequency_Clear bit = 0,
    @AutoRowCountFrequency int = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @RowCountRunAt_Clear bit = 0,
    @RowCountRunAt datetimeoffset = NULL,
    @Status nvarchar(25) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @AllowMultipleSubtypes bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateAllowUserSearchAPI bit = NULL,
    @TrustServerCacheCompletely bit = NULL,
    @SupportsGeoCoding bit = NULL,
    @AutoUpdateSupportsGeoCoding bit = NULL,
    @AllowCaching bit = NULL,
    @DetectExternalChanges bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @ExternalObjectName_Clear bit = 0,
    @ExternalObjectName nvarchar(255) = NULL,
    @GeneratedBaseViewName_Clear bit = 0,
    @GeneratedBaseViewName nvarchar(255) = NULL,
    @AllowDirectSQLInsert bit = NULL,
    @AllowDirectSQLUpdate bit = NULL,
    @AllowDirectSQLDelete bit = NULL,
    @EnableFieldLevelSecurity bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ID],
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [AutoUpdateFullTextSearch],
                [AutoUpdateAllowUserSearchAPI],
                [TrustServerCacheCompletely],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding],
                [AllowCaching],
                [DetectExternalChanges],
                [ExternalDataSourceID],
                [ExternalObjectName],
                [GeneratedBaseViewName],
                [AllowDirectSQLInsert],
                [AllowDirectSQLUpdate],
                [AllowDirectSQLDelete],
                [EnableFieldLevelSecurity]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @NameSuffix_Clear = 1 THEN NULL ELSE ISNULL(@NameSuffix, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @FullTextCatalog_Clear = 1 THEN NULL ELSE ISNULL(@FullTextCatalog, NULL) END,
                ISNULL(@FullTextCatalogGenerated, 1),
                CASE WHEN @FullTextIndex_Clear = 1 THEN NULL ELSE ISNULL(@FullTextIndex, NULL) END,
                ISNULL(@FullTextIndexGenerated, 1),
                CASE WHEN @FullTextSearchFunction_Clear = 1 THEN NULL ELSE ISNULL(@FullTextSearchFunction, NULL) END,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                CASE WHEN @UserViewMaxRows_Clear = 1 THEN NULL ELSE ISNULL(@UserViewMaxRows, 1000) END,
                CASE WHEN @spCreate_Clear = 1 THEN NULL ELSE ISNULL(@spCreate, NULL) END,
                CASE WHEN @spUpdate_Clear = 1 THEN NULL ELSE ISNULL(@spUpdate, NULL) END,
                CASE WHEN @spDelete_Clear = 1 THEN NULL ELSE ISNULL(@spDelete, NULL) END,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                CASE WHEN @spMatch_Clear = 1 THEN NULL ELSE ISNULL(@spMatch, NULL) END,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                CASE WHEN @EntityObjectSubclassName_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassName, NULL) END,
                CASE WHEN @EntityObjectSubclassImport_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassImport, NULL) END,
                CASE WHEN @PreferredCommunicationField_Clear = 1 THEN NULL ELSE ISNULL(@PreferredCommunicationField, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                CASE WHEN @RowsToPackSampleOrder_Clear = 1 THEN NULL ELSE ISNULL(@RowsToPackSampleOrder, NULL) END,
                CASE WHEN @AutoRowCountFrequency_Clear = 1 THEN NULL ELSE ISNULL(@AutoRowCountFrequency, NULL) END,
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @RowCountRunAt_Clear = 1 THEN NULL ELSE ISNULL(@RowCountRunAt, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1),
                ISNULL(@TrustServerCacheCompletely, 1),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1),
                ISNULL(@AllowCaching, 0),
                ISNULL(@DetectExternalChanges, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                CASE WHEN @ExternalObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalObjectName, NULL) END,
                CASE WHEN @GeneratedBaseViewName_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedBaseViewName, NULL) END,
                ISNULL(@AllowDirectSQLInsert, 0),
                ISNULL(@AllowDirectSQLUpdate, 0),
                ISNULL(@AllowDirectSQLDelete, 0),
                ISNULL(@EnableFieldLevelSecurity, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [AutoUpdateFullTextSearch],
                [AutoUpdateAllowUserSearchAPI],
                [TrustServerCacheCompletely],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding],
                [AllowCaching],
                [DetectExternalChanges],
                [ExternalDataSourceID],
                [ExternalObjectName],
                [GeneratedBaseViewName],
                [AllowDirectSQLInsert],
                [AllowDirectSQLUpdate],
                [AllowDirectSQLDelete],
                [EnableFieldLevelSecurity]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @NameSuffix_Clear = 1 THEN NULL ELSE ISNULL(@NameSuffix, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @FullTextCatalog_Clear = 1 THEN NULL ELSE ISNULL(@FullTextCatalog, NULL) END,
                ISNULL(@FullTextCatalogGenerated, 1),
                CASE WHEN @FullTextIndex_Clear = 1 THEN NULL ELSE ISNULL(@FullTextIndex, NULL) END,
                ISNULL(@FullTextIndexGenerated, 1),
                CASE WHEN @FullTextSearchFunction_Clear = 1 THEN NULL ELSE ISNULL(@FullTextSearchFunction, NULL) END,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                CASE WHEN @UserViewMaxRows_Clear = 1 THEN NULL ELSE ISNULL(@UserViewMaxRows, 1000) END,
                CASE WHEN @spCreate_Clear = 1 THEN NULL ELSE ISNULL(@spCreate, NULL) END,
                CASE WHEN @spUpdate_Clear = 1 THEN NULL ELSE ISNULL(@spUpdate, NULL) END,
                CASE WHEN @spDelete_Clear = 1 THEN NULL ELSE ISNULL(@spDelete, NULL) END,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                CASE WHEN @spMatch_Clear = 1 THEN NULL ELSE ISNULL(@spMatch, NULL) END,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                CASE WHEN @EntityObjectSubclassName_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassName, NULL) END,
                CASE WHEN @EntityObjectSubclassImport_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassImport, NULL) END,
                CASE WHEN @PreferredCommunicationField_Clear = 1 THEN NULL ELSE ISNULL(@PreferredCommunicationField, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                CASE WHEN @RowsToPackSampleOrder_Clear = 1 THEN NULL ELSE ISNULL(@RowsToPackSampleOrder, NULL) END,
                CASE WHEN @AutoRowCountFrequency_Clear = 1 THEN NULL ELSE ISNULL(@AutoRowCountFrequency, NULL) END,
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @RowCountRunAt_Clear = 1 THEN NULL ELSE ISNULL(@RowCountRunAt, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1),
                ISNULL(@TrustServerCacheCompletely, 1),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1),
                ISNULL(@AllowCaching, 0),
                ISNULL(@DetectExternalChanges, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                CASE WHEN @ExternalObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalObjectName, NULL) END,
                CASE WHEN @GeneratedBaseViewName_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedBaseViewName, NULL) END,
                ISNULL(@AllowDirectSQLInsert, 0),
                ISNULL(@AllowDirectSQLUpdate, 0),
                ISNULL(@AllowDirectSQLDelete, 0),
                ISNULL(@EnableFieldLevelSecurity, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @NameSuffix_Clear bit = 0,
    @NameSuffix nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255) = NULL,
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog_Clear bit = 0,
    @FullTextCatalog nvarchar(255) = NULL,
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex_Clear bit = 0,
    @FullTextIndex nvarchar(255) = NULL,
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction_Clear bit = 0,
    @FullTextSearchFunction nvarchar(255) = NULL,
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows_Clear bit = 0,
    @UserViewMaxRows int = NULL,
    @spCreate_Clear bit = 0,
    @spCreate nvarchar(255) = NULL,
    @spUpdate_Clear bit = 0,
    @spUpdate nvarchar(255) = NULL,
    @spDelete_Clear bit = 0,
    @spDelete nvarchar(255) = NULL,
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch_Clear bit = 0,
    @spMatch nvarchar(255) = NULL,
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName_Clear bit = 0,
    @EntityObjectSubclassName nvarchar(255) = NULL,
    @EntityObjectSubclassImport_Clear bit = 0,
    @EntityObjectSubclassImport nvarchar(255) = NULL,
    @PreferredCommunicationField_Clear bit = 0,
    @PreferredCommunicationField nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(500) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder_Clear bit = 0,
    @RowsToPackSampleOrder nvarchar(MAX) = NULL,
    @AutoRowCountFrequency_Clear bit = 0,
    @AutoRowCountFrequency int = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @RowCountRunAt_Clear bit = 0,
    @RowCountRunAt datetimeoffset = NULL,
    @Status nvarchar(25) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @AllowMultipleSubtypes bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateAllowUserSearchAPI bit = NULL,
    @TrustServerCacheCompletely bit = NULL,
    @SupportsGeoCoding bit = NULL,
    @AutoUpdateSupportsGeoCoding bit = NULL,
    @AllowCaching bit = NULL,
    @DetectExternalChanges bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @ExternalObjectName_Clear bit = 0,
    @ExternalObjectName nvarchar(255) = NULL,
    @GeneratedBaseViewName_Clear bit = 0,
    @GeneratedBaseViewName nvarchar(255) = NULL,
    @AllowDirectSQLInsert bit = NULL,
    @AllowDirectSQLUpdate bit = NULL,
    @AllowDirectSQLDelete bit = NULL,
    @EnableFieldLevelSecurity bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [NameSuffix] = CASE WHEN @NameSuffix_Clear = 1 THEN NULL ELSE ISNULL(@NameSuffix, [NameSuffix]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [AutoUpdateDescription] = ISNULL(@AutoUpdateDescription, [AutoUpdateDescription]),
        [BaseView] = ISNULL(@BaseView, [BaseView]),
        [BaseViewGenerated] = ISNULL(@BaseViewGenerated, [BaseViewGenerated]),
        [VirtualEntity] = ISNULL(@VirtualEntity, [VirtualEntity]),
        [TrackRecordChanges] = ISNULL(@TrackRecordChanges, [TrackRecordChanges]),
        [AuditRecordAccess] = ISNULL(@AuditRecordAccess, [AuditRecordAccess]),
        [AuditViewRuns] = ISNULL(@AuditViewRuns, [AuditViewRuns]),
        [IncludeInAPI] = ISNULL(@IncludeInAPI, [IncludeInAPI]),
        [AllowAllRowsAPI] = ISNULL(@AllowAllRowsAPI, [AllowAllRowsAPI]),
        [AllowUpdateAPI] = ISNULL(@AllowUpdateAPI, [AllowUpdateAPI]),
        [AllowCreateAPI] = ISNULL(@AllowCreateAPI, [AllowCreateAPI]),
        [AllowDeleteAPI] = ISNULL(@AllowDeleteAPI, [AllowDeleteAPI]),
        [CustomResolverAPI] = ISNULL(@CustomResolverAPI, [CustomResolverAPI]),
        [AllowUserSearchAPI] = ISNULL(@AllowUserSearchAPI, [AllowUserSearchAPI]),
        [FullTextSearchEnabled] = ISNULL(@FullTextSearchEnabled, [FullTextSearchEnabled]),
        [FullTextCatalog] = CASE WHEN @FullTextCatalog_Clear = 1 THEN NULL ELSE ISNULL(@FullTextCatalog, [FullTextCatalog]) END,
        [FullTextCatalogGenerated] = ISNULL(@FullTextCatalogGenerated, [FullTextCatalogGenerated]),
        [FullTextIndex] = CASE WHEN @FullTextIndex_Clear = 1 THEN NULL ELSE ISNULL(@FullTextIndex, [FullTextIndex]) END,
        [FullTextIndexGenerated] = ISNULL(@FullTextIndexGenerated, [FullTextIndexGenerated]),
        [FullTextSearchFunction] = CASE WHEN @FullTextSearchFunction_Clear = 1 THEN NULL ELSE ISNULL(@FullTextSearchFunction, [FullTextSearchFunction]) END,
        [FullTextSearchFunctionGenerated] = ISNULL(@FullTextSearchFunctionGenerated, [FullTextSearchFunctionGenerated]),
        [UserViewMaxRows] = CASE WHEN @UserViewMaxRows_Clear = 1 THEN NULL ELSE ISNULL(@UserViewMaxRows, [UserViewMaxRows]) END,
        [spCreate] = CASE WHEN @spCreate_Clear = 1 THEN NULL ELSE ISNULL(@spCreate, [spCreate]) END,
        [spUpdate] = CASE WHEN @spUpdate_Clear = 1 THEN NULL ELSE ISNULL(@spUpdate, [spUpdate]) END,
        [spDelete] = CASE WHEN @spDelete_Clear = 1 THEN NULL ELSE ISNULL(@spDelete, [spDelete]) END,
        [spCreateGenerated] = ISNULL(@spCreateGenerated, [spCreateGenerated]),
        [spUpdateGenerated] = ISNULL(@spUpdateGenerated, [spUpdateGenerated]),
        [spDeleteGenerated] = ISNULL(@spDeleteGenerated, [spDeleteGenerated]),
        [CascadeDeletes] = ISNULL(@CascadeDeletes, [CascadeDeletes]),
        [DeleteType] = ISNULL(@DeleteType, [DeleteType]),
        [AllowRecordMerge] = ISNULL(@AllowRecordMerge, [AllowRecordMerge]),
        [spMatch] = CASE WHEN @spMatch_Clear = 1 THEN NULL ELSE ISNULL(@spMatch, [spMatch]) END,
        [RelationshipDefaultDisplayType] = ISNULL(@RelationshipDefaultDisplayType, [RelationshipDefaultDisplayType]),
        [UserFormGenerated] = ISNULL(@UserFormGenerated, [UserFormGenerated]),
        [EntityObjectSubclassName] = CASE WHEN @EntityObjectSubclassName_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassName, [EntityObjectSubclassName]) END,
        [EntityObjectSubclassImport] = CASE WHEN @EntityObjectSubclassImport_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassImport, [EntityObjectSubclassImport]) END,
        [PreferredCommunicationField] = CASE WHEN @PreferredCommunicationField_Clear = 1 THEN NULL ELSE ISNULL(@PreferredCommunicationField, [PreferredCommunicationField]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [ScopeDefault] = CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, [ScopeDefault]) END,
        [RowsToPackWithSchema] = ISNULL(@RowsToPackWithSchema, [RowsToPackWithSchema]),
        [RowsToPackSampleMethod] = ISNULL(@RowsToPackSampleMethod, [RowsToPackSampleMethod]),
        [RowsToPackSampleCount] = ISNULL(@RowsToPackSampleCount, [RowsToPackSampleCount]),
        [RowsToPackSampleOrder] = CASE WHEN @RowsToPackSampleOrder_Clear = 1 THEN NULL ELSE ISNULL(@RowsToPackSampleOrder, [RowsToPackSampleOrder]) END,
        [AutoRowCountFrequency] = CASE WHEN @AutoRowCountFrequency_Clear = 1 THEN NULL ELSE ISNULL(@AutoRowCountFrequency, [AutoRowCountFrequency]) END,
        [RowCount] = CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, [RowCount]) END,
        [RowCountRunAt] = CASE WHEN @RowCountRunAt_Clear = 1 THEN NULL ELSE ISNULL(@RowCountRunAt, [RowCountRunAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [AllowMultipleSubtypes] = ISNULL(@AllowMultipleSubtypes, [AllowMultipleSubtypes]),
        [AutoUpdateFullTextSearch] = ISNULL(@AutoUpdateFullTextSearch, [AutoUpdateFullTextSearch]),
        [AutoUpdateAllowUserSearchAPI] = ISNULL(@AutoUpdateAllowUserSearchAPI, [AutoUpdateAllowUserSearchAPI]),
        [TrustServerCacheCompletely] = ISNULL(@TrustServerCacheCompletely, [TrustServerCacheCompletely]),
        [SupportsGeoCoding] = ISNULL(@SupportsGeoCoding, [SupportsGeoCoding]),
        [AutoUpdateSupportsGeoCoding] = ISNULL(@AutoUpdateSupportsGeoCoding, [AutoUpdateSupportsGeoCoding]),
        [AllowCaching] = ISNULL(@AllowCaching, [AllowCaching]),
        [DetectExternalChanges] = ISNULL(@DetectExternalChanges, [DetectExternalChanges]),
        [ExternalDataSourceID] = CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, [ExternalDataSourceID]) END,
        [ExternalObjectName] = CASE WHEN @ExternalObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalObjectName, [ExternalObjectName]) END,
        [GeneratedBaseViewName] = CASE WHEN @GeneratedBaseViewName_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedBaseViewName, [GeneratedBaseViewName]) END,
        [AllowDirectSQLInsert] = ISNULL(@AllowDirectSQLInsert, [AllowDirectSQLInsert]),
        [AllowDirectSQLUpdate] = ISNULL(@AllowDirectSQLUpdate, [AllowDirectSQLUpdate]),
        [AllowDirectSQLDelete] = ISNULL(@AllowDirectSQLDelete, [AllowDirectSQLDelete]),
        [EnableFieldLevelSecurity] = ISNULL(@EnableFieldLevelSecurity, [EnableFieldLevelSecurity])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for EntityActionFilter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityActionID in table EntityActionFilter
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionFilter_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionFilter]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionFilter_EntityActionID ON [${flyway:defaultSchema}].[EntityActionFilter] ([EntityActionID]);

-- Index for foreign key ActionFilterID in table EntityActionFilter
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionFilter_ActionFilterID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionFilter]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionFilter_ActionFilterID ON [${flyway:defaultSchema}].[EntityActionFilter] ([ActionFilterID]);

/* Index for Foreign Keys for EntityActionInvocation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityActionID in table EntityActionInvocation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionInvocation_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionInvocation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionInvocation_EntityActionID ON [${flyway:defaultSchema}].[EntityActionInvocation] ([EntityActionID]);

-- Index for foreign key InvocationTypeID in table EntityActionInvocation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionInvocation_InvocationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionInvocation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionInvocation_InvocationTypeID ON [${flyway:defaultSchema}].[EntityActionInvocation] ([InvocationTypeID]);

/* Index for Foreign Keys for EntityActionParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityActionID in table EntityActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionParam_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionParam_EntityActionID ON [${flyway:defaultSchema}].[EntityActionParam] ([EntityActionID]);

-- Index for foreign key ActionParamID in table EntityActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionParam_ActionParamID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionParam_ActionParamID ON [${flyway:defaultSchema}].[EntityActionParam] ([ActionParamID]);

/* Base View SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: vwEntityActionFilters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Filters
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityActionFilter
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityActionFilters]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityActionFilters];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityActionFilters]
AS
SELECT
    e.*,
    MJActionFilter_ActionFilterID.[UserDescription] AS [ActionFilter]
FROM
    [${flyway:defaultSchema}].[EntityActionFilter] AS e
INNER JOIN
    [${flyway:defaultSchema}].[ActionFilter] AS MJActionFilter_ActionFilterID
  ON
    [e].[ActionFilterID] = MJActionFilter_ActionFilterID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* Base View Permissions SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: Permissions for vwEntityActionFilters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* spCreate SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spCreateEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityActionFilter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionFilter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionFilter]
    @ID uniqueidentifier = NULL,
    @EntityActionID uniqueidentifier,
    @ActionFilterID uniqueidentifier,
    @Sequence int,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityActionFilter]
            (
                [ID],
                [EntityActionID],
                [ActionFilterID],
                [Sequence],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityActionID,
                @ActionFilterID,
                @Sequence,
                ISNULL(@Status, 'Pending')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityActionFilter]
            (
                [EntityActionID],
                [ActionFilterID],
                [Sequence],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityActionID,
                @ActionFilterID,
                @Sequence,
                ISNULL(@Status, 'Pending')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityActionFilters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionFilter] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionFilter] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Action Filters */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionFilter] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionFilter] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spUpdateEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityActionFilter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionFilter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionFilter]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier = NULL,
    @ActionFilterID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionFilter]
    SET
        [EntityActionID] = ISNULL(@EntityActionID, [EntityActionID]),
        [ActionFilterID] = ISNULL(@ActionFilterID, [ActionFilterID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityActionFilters] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityActionFilters]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionFilter] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionFilter] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionFilter] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionFilter table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityActionFilter]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityActionFilter];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityActionFilter
ON [${flyway:defaultSchema}].[EntityActionFilter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionFilter]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityActionFilter] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Action Filters */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionFilter] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionFilter] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* Base View SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: vwEntityActionInvocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Invocations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityActionInvocation
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityActionInvocations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityActionInvocations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityActionInvocations]
AS
SELECT
    e.*,
    MJEntityActionInvocationType_InvocationTypeID.[Name] AS [InvocationType]
FROM
    [${flyway:defaultSchema}].[EntityActionInvocation] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EntityActionInvocationType] AS MJEntityActionInvocationType_InvocationTypeID
  ON
    [e].[InvocationTypeID] = MJEntityActionInvocationType_InvocationTypeID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* Base View Permissions SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: Permissions for vwEntityActionInvocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* spCreate SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spCreateEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityActionInvocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionInvocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionInvocation]
    @ID uniqueidentifier = NULL,
    @EntityActionID uniqueidentifier,
    @InvocationTypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @RuntimeUXDriverClass_Clear bit = 0,
    @RuntimeUXDriverClass nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityActionInvocation]
            (
                [ID],
                [EntityActionID],
                [InvocationTypeID],
                [Status],
                [RuntimeUXDriverClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityActionID,
                @InvocationTypeID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @RuntimeUXDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@RuntimeUXDriverClass, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityActionInvocation]
            (
                [EntityActionID],
                [InvocationTypeID],
                [Status],
                [RuntimeUXDriverClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityActionID,
                @InvocationTypeID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @RuntimeUXDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@RuntimeUXDriverClass, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityActionInvocations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Action Invocations */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spUpdateEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityActionInvocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionInvocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionInvocation]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier = NULL,
    @InvocationTypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @RuntimeUXDriverClass_Clear bit = 0,
    @RuntimeUXDriverClass nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionInvocation]
    SET
        [EntityActionID] = ISNULL(@EntityActionID, [EntityActionID]),
        [InvocationTypeID] = ISNULL(@InvocationTypeID, [InvocationTypeID]),
        [Status] = ISNULL(@Status, [Status]),
        [RuntimeUXDriverClass] = CASE WHEN @RuntimeUXDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@RuntimeUXDriverClass, [RuntimeUXDriverClass]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityActionInvocations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityActionInvocations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionInvocation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityActionInvocation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityActionInvocation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityActionInvocation
ON [${flyway:defaultSchema}].[EntityActionInvocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionInvocation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityActionInvocation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Action Invocations */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* Base View SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: vwEntityActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityActionParams]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityActionParams];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityActionParams]
AS
SELECT
    e.*,
    MJActionParam_ActionParamID.[Name] AS [ActionParam]
FROM
    [${flyway:defaultSchema}].[EntityActionParam] AS e
INNER JOIN
    [${flyway:defaultSchema}].[ActionParam] AS MJActionParam_ActionParamID
  ON
    [e].[ActionParamID] = MJActionParam_ActionParamID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* Base View Permissions SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: Permissions for vwEntityActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* spCreate SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spCreateEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionParam]
    @ID uniqueidentifier = NULL,
    @EntityActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value_Clear bit = 0,
    @Value nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @LogValue_Clear bit = 0,
    @LogValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityActionParam]
            (
                [ID],
                [EntityActionID],
                [ActionParamID],
                [ValueType],
                [Value],
                [Comments],
                [LogValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityActionID,
                @ActionParamID,
                @ValueType,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @LogValue_Clear = 1 THEN NULL ELSE ISNULL(@LogValue, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityActionParam]
            (
                [EntityActionID],
                [ActionParamID],
                [ValueType],
                [Value],
                [Comments],
                [LogValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityActionID,
                @ActionParamID,
                @ValueType,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @LogValue_Clear = 1 THEN NULL ELSE ISNULL(@LogValue, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Action Params */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spUpdateEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionParam]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier = NULL,
    @ActionParamID uniqueidentifier = NULL,
    @ValueType nvarchar(20) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @LogValue_Clear bit = 0,
    @LogValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionParam]
    SET
        [EntityActionID] = ISNULL(@EntityActionID, [EntityActionID]),
        [ActionParamID] = ISNULL(@ActionParamID, [ActionParamID]),
        [ValueType] = ISNULL(@ValueType, [ValueType]),
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [LogValue] = CASE WHEN @LogValue_Clear = 1 THEN NULL ELSE ISNULL(@LogValue, [LogValue]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityActionParams] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityActionParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionParam table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityActionParam]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityActionParam];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityActionParam
ON [${flyway:defaultSchema}].[EntityActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityActionParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Action Params */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spDeleteEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityActionFilter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionFilter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionFilter]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityActionFilter]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionFilter] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Action Filters */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionFilter] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spDeleteEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityActionInvocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionInvocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionInvocation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityActionInvocation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Action Invocations */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spDeleteEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityActionParam]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Action Params */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] TO [cdp_Developer], [cdp_Integration];

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

/* SQL text to update entity field related entity name field map for entity field ID 983A6A23-CF4E-4E60-A6F4-D6B59A8C9DDF */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='983A6A23-CF4E-4E60-A6F4-D6B59A8C9DDF', @RelatedEntityNameFieldMap='EntityField';

/* SQL text to update entity field related entity name field map for entity field ID E23BC9D4-BE73-4C49-80E7-0FB332650A32 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E23BC9D4-BE73-4C49-80E7-0FB332650A32', @RelatedEntityNameFieldMap='Role';

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
    @ReadAccess nvarchar(20) = NULL,
    @UpdateAccess nvarchar(20) = NULL,
    @CreateAccess nvarchar(20) = NULL
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
                [ReadAccess],
                [UpdateAccess],
                [CreateAccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityFieldID,
                @RoleID,
                ISNULL(@ReadAccess, 'No Access'),
                ISNULL(@UpdateAccess, 'No Access'),
                ISNULL(@CreateAccess, 'No Access')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldPermission]
            (
                [EntityFieldID],
                [RoleID],
                [ReadAccess],
                [UpdateAccess],
                [CreateAccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityFieldID,
                @RoleID,
                ISNULL(@ReadAccess, 'No Access'),
                ISNULL(@UpdateAccess, 'No Access'),
                ISNULL(@CreateAccess, 'No Access')
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
    @ReadAccess nvarchar(20) = NULL,
    @UpdateAccess nvarchar(20) = NULL,
    @CreateAccess nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldPermission]
    SET
        [EntityFieldID] = ISNULL(@EntityFieldID, [EntityFieldID]),
        [RoleID] = ISNULL(@RoleID, [RoleID]),
        [ReadAccess] = ISNULL(@ReadAccess, [ReadAccess]),
        [UpdateAccess] = ISNULL(@UpdateAccess, [UpdateAccess]),
        [CreateAccess] = ISNULL(@CreateAccess, [CreateAccess])
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

/* spDelete SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: spDeleteAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ActionAuthorization using cursor to call spDeleteActionAuthorization
    DECLARE @MJActionAuthorizations_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionAuthorizations_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionAuthorization]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionAuthorizations_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionAuthorizations_ActionID_cursor INTO @MJActionAuthorizations_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionAuthorization] @ID = @MJActionAuthorizations_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionAuthorizations_ActionID_cursor INTO @MJActionAuthorizations_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionAuthorizations_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionAuthorizations_ActionID_cursor
    
    -- Cascade delete from ActionContext using cursor to call spDeleteActionContext
    DECLARE @MJActionContexts_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionContexts_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionContext]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionContexts_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionContexts_ActionID_cursor INTO @MJActionContexts_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionContext] @ID = @MJActionContexts_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionContexts_ActionID_cursor INTO @MJActionContexts_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionContexts_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionContexts_ActionID_cursor
    
    -- Cascade delete from ActionExecutionLog using cursor to call spDeleteActionExecutionLog
    DECLARE @MJActionExecutionLogs_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionExecutionLogs_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionExecutionLog]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionExecutionLogs_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionExecutionLogs_ActionID_cursor INTO @MJActionExecutionLogs_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionExecutionLog] @ID = @MJActionExecutionLogs_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionExecutionLogs_ActionID_cursor INTO @MJActionExecutionLogs_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionExecutionLogs_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionExecutionLogs_ActionID_cursor
    
    -- Cascade delete from ActionLibrary using cursor to call spDeleteActionLibrary
    DECLARE @MJActionLibraries_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionLibraries_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionLibrary]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionLibraries_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionLibraries_ActionID_cursor INTO @MJActionLibraries_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionLibrary] @ID = @MJActionLibraries_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionLibraries_ActionID_cursor INTO @MJActionLibraries_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionLibraries_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionLibraries_ActionID_cursor
    
    -- Cascade delete from ActionParam using cursor to call spDeleteActionParam
    DECLARE @MJActionParams_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionParams_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionParam]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionParams_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionParams_ActionID_cursor INTO @MJActionParams_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionParam] @ID = @MJActionParams_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionParams_ActionID_cursor INTO @MJActionParams_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionParams_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionParams_ActionID_cursor
    
    -- Cascade delete from ActionResultCode using cursor to call spDeleteActionResultCode
    DECLARE @MJActionResultCodes_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionResultCodes_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionResultCode]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionResultCodes_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionResultCodes_ActionID_cursor INTO @MJActionResultCodes_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionResultCode] @ID = @MJActionResultCodes_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionResultCodes_ActionID_cursor INTO @MJActionResultCodes_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionResultCodes_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionResultCodes_ActionID_cursor
    
    -- Cascade delete from Action using cursor to call spDeleteAction
    DECLARE @MJActions_ParentIDID uniqueidentifier
    DECLARE cascade_delete_MJActions_ParentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [ParentID] = @ID
    
    OPEN cascade_delete_MJActions_ParentID_cursor
    FETCH NEXT FROM cascade_delete_MJActions_ParentID_cursor INTO @MJActions_ParentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAction] @ID = @MJActions_ParentIDID
        
        FETCH NEXT FROM cascade_delete_MJActions_ParentID_cursor INTO @MJActions_ParentIDID
    END
    
    CLOSE cascade_delete_MJActions_ParentID_cursor
    DEALLOCATE cascade_delete_MJActions_ParentID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_ActionIDID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_ActionID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_ActionID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_ActionID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_ActionID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_ActionID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_ActionID_CompactLength int
    DECLARE @MJAIAgentActions_ActionID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_ActionID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJAIAgentActions_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_ActionID_cursor INTO @MJAIAgentActions_ActionIDID, @MJAIAgentActions_ActionID_AgentID, @MJAIAgentActions_ActionID_ActionID, @MJAIAgentActions_ActionID_Status, @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @MJAIAgentActions_ActionID_ResultExpirationTurns, @MJAIAgentActions_ActionID_ResultExpirationMode, @MJAIAgentActions_ActionID_CompactMode, @MJAIAgentActions_ActionID_CompactLength, @MJAIAgentActions_ActionID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_ActionIDID, @AgentID = @MJAIAgentActions_ActionID_AgentID, @ActionID_Clear = 1, @ActionID = @MJAIAgentActions_ActionID_ActionID, @Status = @MJAIAgentActions_ActionID_Status, @MinExecutionsPerRun = @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_ActionID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_ActionID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_ActionID_CompactMode, @CompactLength = @MJAIAgentActions_ActionID_CompactLength, @CompactPromptID = @MJAIAgentActions_ActionID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_ActionID_cursor INTO @MJAIAgentActions_ActionIDID, @MJAIAgentActions_ActionID_AgentID, @MJAIAgentActions_ActionID_ActionID, @MJAIAgentActions_ActionID_Status, @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @MJAIAgentActions_ActionID_ResultExpirationTurns, @MJAIAgentActions_ActionID_ResultExpirationMode, @MJAIAgentActions_ActionID_CompactMode, @MJAIAgentActions_ActionID_CompactLength, @MJAIAgentActions_ActionID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_ActionID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_ActionID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_ActionIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_ActionID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_StartingStep bit
    DECLARE @MJAIAgentSteps_ActionID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_ActionID_RetryCount int
    DECLARE @MJAIAgentSteps_ActionID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_PositionX int
    DECLARE @MJAIAgentSteps_ActionID_PositionY int
    DECLARE @MJAIAgentSteps_ActionID_Width int
    DECLARE @MJAIAgentSteps_ActionID_Height int
    DECLARE @MJAIAgentSteps_ActionID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_ActionID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_ActionID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJAIAgentSteps_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_ActionID_cursor INTO @MJAIAgentSteps_ActionIDID, @MJAIAgentSteps_ActionID_AgentID, @MJAIAgentSteps_ActionID_Name, @MJAIAgentSteps_ActionID_Description, @MJAIAgentSteps_ActionID_StepType, @MJAIAgentSteps_ActionID_StartingStep, @MJAIAgentSteps_ActionID_TimeoutSeconds, @MJAIAgentSteps_ActionID_RetryCount, @MJAIAgentSteps_ActionID_OnErrorBehavior, @MJAIAgentSteps_ActionID_ActionID, @MJAIAgentSteps_ActionID_SubAgentID, @MJAIAgentSteps_ActionID_PromptID, @MJAIAgentSteps_ActionID_ActionOutputMapping, @MJAIAgentSteps_ActionID_PositionX, @MJAIAgentSteps_ActionID_PositionY, @MJAIAgentSteps_ActionID_Width, @MJAIAgentSteps_ActionID_Height, @MJAIAgentSteps_ActionID_Status, @MJAIAgentSteps_ActionID_ActionInputMapping, @MJAIAgentSteps_ActionID_LoopBodyType, @MJAIAgentSteps_ActionID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_ActionIDID, @AgentID = @MJAIAgentSteps_ActionID_AgentID, @Name = @MJAIAgentSteps_ActionID_Name, @Description = @MJAIAgentSteps_ActionID_Description, @StepType = @MJAIAgentSteps_ActionID_StepType, @StartingStep = @MJAIAgentSteps_ActionID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_ActionID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_ActionID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_ActionID_OnErrorBehavior, @ActionID_Clear = 1, @ActionID = @MJAIAgentSteps_ActionID_ActionID, @SubAgentID = @MJAIAgentSteps_ActionID_SubAgentID, @PromptID = @MJAIAgentSteps_ActionID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_ActionID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_ActionID_PositionX, @PositionY = @MJAIAgentSteps_ActionID_PositionY, @Width = @MJAIAgentSteps_ActionID_Width, @Height = @MJAIAgentSteps_ActionID_Height, @Status = @MJAIAgentSteps_ActionID_Status, @ActionInputMapping = @MJAIAgentSteps_ActionID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_ActionID_LoopBodyType, @Configuration = @MJAIAgentSteps_ActionID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_ActionID_cursor INTO @MJAIAgentSteps_ActionIDID, @MJAIAgentSteps_ActionID_AgentID, @MJAIAgentSteps_ActionID_Name, @MJAIAgentSteps_ActionID_Description, @MJAIAgentSteps_ActionID_StepType, @MJAIAgentSteps_ActionID_StartingStep, @MJAIAgentSteps_ActionID_TimeoutSeconds, @MJAIAgentSteps_ActionID_RetryCount, @MJAIAgentSteps_ActionID_OnErrorBehavior, @MJAIAgentSteps_ActionID_ActionID, @MJAIAgentSteps_ActionID_SubAgentID, @MJAIAgentSteps_ActionID_PromptID, @MJAIAgentSteps_ActionID_ActionOutputMapping, @MJAIAgentSteps_ActionID_PositionX, @MJAIAgentSteps_ActionID_PositionY, @MJAIAgentSteps_ActionID_Width, @MJAIAgentSteps_ActionID_Height, @MJAIAgentSteps_ActionID_Status, @MJAIAgentSteps_ActionID_ActionInputMapping, @MJAIAgentSteps_ActionID_LoopBodyType, @MJAIAgentSteps_ActionID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_ActionID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_ActionID_cursor
    
    -- Cascade delete from AISkillAction using cursor to call spDeleteAISkillAction
    DECLARE @MJAISkillActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJAISkillActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AISkillAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJAISkillActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJAISkillActions_ActionID_cursor INTO @MJAISkillActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAISkillAction] @ID = @MJAISkillActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJAISkillActions_ActionID_cursor INTO @MJAISkillActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJAISkillActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJAISkillActions_ActionID_cursor
    
    -- Cascade delete from EntityAction using cursor to call spDeleteEntityAction
    DECLARE @MJEntityActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJEntityActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityActions_ActionID_cursor INTO @MJEntityActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteEntityAction] @ID = @MJEntityActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityActions_ActionID_cursor INTO @MJEntityActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJEntityActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJEntityActions_ActionID_cursor
    
    -- Cascade update on MCPServerTool using cursor to call spUpdateMCPServerTool
    DECLARE @MJMCPServerTools_GeneratedActionIDID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_MCPServerID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolName nvarchar(255)
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolTitle nvarchar(255)
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolDescription nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_InputSchema nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_OutputSchema nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_Annotations nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_Status nvarchar(50)
    DECLARE @MJMCPServerTools_GeneratedActionID_DiscoveredAt datetimeoffset
    DECLARE @MJMCPServerTools_GeneratedActionID_LastSeenAt datetimeoffset
    DECLARE @MJMCPServerTools_GeneratedActionID_GeneratedActionID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID uniqueidentifier
    DECLARE cascade_update_MJMCPServerTools_GeneratedActionID_cursor CURSOR FOR
        SELECT [ID], [MCPServerID], [ToolName], [ToolTitle], [ToolDescription], [InputSchema], [OutputSchema], [Annotations], [Status], [DiscoveredAt], [LastSeenAt], [GeneratedActionID], [GeneratedActionCategoryID]
        FROM [${flyway:defaultSchema}].[MCPServerTool]
        WHERE [GeneratedActionID] = @ID

    OPEN cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    FETCH NEXT FROM cascade_update_MJMCPServerTools_GeneratedActionID_cursor INTO @MJMCPServerTools_GeneratedActionIDID, @MJMCPServerTools_GeneratedActionID_MCPServerID, @MJMCPServerTools_GeneratedActionID_ToolName, @MJMCPServerTools_GeneratedActionID_ToolTitle, @MJMCPServerTools_GeneratedActionID_ToolDescription, @MJMCPServerTools_GeneratedActionID_InputSchema, @MJMCPServerTools_GeneratedActionID_OutputSchema, @MJMCPServerTools_GeneratedActionID_Annotations, @MJMCPServerTools_GeneratedActionID_Status, @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @MJMCPServerTools_GeneratedActionID_LastSeenAt, @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMCPServerTools_GeneratedActionID_GeneratedActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMCPServerTool] @ID = @MJMCPServerTools_GeneratedActionIDID, @MCPServerID = @MJMCPServerTools_GeneratedActionID_MCPServerID, @ToolName = @MJMCPServerTools_GeneratedActionID_ToolName, @ToolTitle = @MJMCPServerTools_GeneratedActionID_ToolTitle, @ToolDescription = @MJMCPServerTools_GeneratedActionID_ToolDescription, @InputSchema = @MJMCPServerTools_GeneratedActionID_InputSchema, @OutputSchema = @MJMCPServerTools_GeneratedActionID_OutputSchema, @Annotations = @MJMCPServerTools_GeneratedActionID_Annotations, @Status = @MJMCPServerTools_GeneratedActionID_Status, @DiscoveredAt = @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @LastSeenAt = @MJMCPServerTools_GeneratedActionID_LastSeenAt, @GeneratedActionID_Clear = 1, @GeneratedActionID = @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @GeneratedActionCategoryID = @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID

        FETCH NEXT FROM cascade_update_MJMCPServerTools_GeneratedActionID_cursor INTO @MJMCPServerTools_GeneratedActionIDID, @MJMCPServerTools_GeneratedActionID_MCPServerID, @MJMCPServerTools_GeneratedActionID_ToolName, @MJMCPServerTools_GeneratedActionID_ToolTitle, @MJMCPServerTools_GeneratedActionID_ToolDescription, @MJMCPServerTools_GeneratedActionID_InputSchema, @MJMCPServerTools_GeneratedActionID_OutputSchema, @MJMCPServerTools_GeneratedActionID_Annotations, @MJMCPServerTools_GeneratedActionID_Status, @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @MJMCPServerTools_GeneratedActionID_LastSeenAt, @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID
    END

    CLOSE cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    DEALLOCATE cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_ActionIDID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_ActionID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_ActionID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_ActionID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_ActionID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_ActionID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_ActionID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_ActionID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_ActionID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_BatchSize int
    DECLARE @MJRecordProcesses_ActionID_MaxConcurrency int
    DECLARE @MJRecordProcesses_ActionID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_ActionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJRecordProcesses_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_ActionID_cursor INTO @MJRecordProcesses_ActionIDID, @MJRecordProcesses_ActionID_Name, @MJRecordProcesses_ActionID_Description, @MJRecordProcesses_ActionID_CategoryID, @MJRecordProcesses_ActionID_EntityID, @MJRecordProcesses_ActionID_Status, @MJRecordProcesses_ActionID_WorkType, @MJRecordProcesses_ActionID_ActionID, @MJRecordProcesses_ActionID_AgentID, @MJRecordProcesses_ActionID_PromptID, @MJRecordProcesses_ActionID_ScopeType, @MJRecordProcesses_ActionID_ScopeViewID, @MJRecordProcesses_ActionID_ScopeListID, @MJRecordProcesses_ActionID_ScopeFilter, @MJRecordProcesses_ActionID_OnChangeEnabled, @MJRecordProcesses_ActionID_OnChangeInvocationType, @MJRecordProcesses_ActionID_OnChangeFilter, @MJRecordProcesses_ActionID_ScheduleEnabled, @MJRecordProcesses_ActionID_CronExpression, @MJRecordProcesses_ActionID_Timezone, @MJRecordProcesses_ActionID_OnDemandEnabled, @MJRecordProcesses_ActionID_InputMapping, @MJRecordProcesses_ActionID_OutputMapping, @MJRecordProcesses_ActionID_SkipUnchanged, @MJRecordProcesses_ActionID_WatermarkStrategy, @MJRecordProcesses_ActionID_BatchSize, @MJRecordProcesses_ActionID_MaxConcurrency, @MJRecordProcesses_ActionID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_ActionIDID, @Name = @MJRecordProcesses_ActionID_Name, @Description = @MJRecordProcesses_ActionID_Description, @CategoryID = @MJRecordProcesses_ActionID_CategoryID, @EntityID = @MJRecordProcesses_ActionID_EntityID, @Status = @MJRecordProcesses_ActionID_Status, @WorkType = @MJRecordProcesses_ActionID_WorkType, @ActionID_Clear = 1, @ActionID = @MJRecordProcesses_ActionID_ActionID, @AgentID = @MJRecordProcesses_ActionID_AgentID, @PromptID = @MJRecordProcesses_ActionID_PromptID, @ScopeType = @MJRecordProcesses_ActionID_ScopeType, @ScopeViewID = @MJRecordProcesses_ActionID_ScopeViewID, @ScopeListID = @MJRecordProcesses_ActionID_ScopeListID, @ScopeFilter = @MJRecordProcesses_ActionID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_ActionID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_ActionID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_ActionID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_ActionID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_ActionID_CronExpression, @Timezone = @MJRecordProcesses_ActionID_Timezone, @OnDemandEnabled = @MJRecordProcesses_ActionID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_ActionID_InputMapping, @OutputMapping = @MJRecordProcesses_ActionID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_ActionID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_ActionID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_ActionID_BatchSize, @MaxConcurrency = @MJRecordProcesses_ActionID_MaxConcurrency, @Configuration = @MJRecordProcesses_ActionID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_ActionID_cursor INTO @MJRecordProcesses_ActionIDID, @MJRecordProcesses_ActionID_Name, @MJRecordProcesses_ActionID_Description, @MJRecordProcesses_ActionID_CategoryID, @MJRecordProcesses_ActionID_EntityID, @MJRecordProcesses_ActionID_Status, @MJRecordProcesses_ActionID_WorkType, @MJRecordProcesses_ActionID_ActionID, @MJRecordProcesses_ActionID_AgentID, @MJRecordProcesses_ActionID_PromptID, @MJRecordProcesses_ActionID_ScopeType, @MJRecordProcesses_ActionID_ScopeViewID, @MJRecordProcesses_ActionID_ScopeListID, @MJRecordProcesses_ActionID_ScopeFilter, @MJRecordProcesses_ActionID_OnChangeEnabled, @MJRecordProcesses_ActionID_OnChangeInvocationType, @MJRecordProcesses_ActionID_OnChangeFilter, @MJRecordProcesses_ActionID_ScheduleEnabled, @MJRecordProcesses_ActionID_CronExpression, @MJRecordProcesses_ActionID_Timezone, @MJRecordProcesses_ActionID_OnDemandEnabled, @MJRecordProcesses_ActionID_InputMapping, @MJRecordProcesses_ActionID_OutputMapping, @MJRecordProcesses_ActionID_SkipUnchanged, @MJRecordProcesses_ActionID_WatermarkStrategy, @MJRecordProcesses_ActionID_BatchSize, @MJRecordProcesses_ActionID_MaxConcurrency, @MJRecordProcesses_ActionID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_ActionID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_ActionID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_ActionIDID uniqueidentifier
    DECLARE @MJTasks_ActionID_ParentID uniqueidentifier
    DECLARE @MJTasks_ActionID_Name nvarchar(255)
    DECLARE @MJTasks_ActionID_Description nvarchar(MAX)
    DECLARE @MJTasks_ActionID_TypeID uniqueidentifier
    DECLARE @MJTasks_ActionID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_ActionID_ProjectID uniqueidentifier
    DECLARE @MJTasks_ActionID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_ActionID_UserID uniqueidentifier
    DECLARE @MJTasks_ActionID_AgentID uniqueidentifier
    DECLARE @MJTasks_ActionID_Status nvarchar(50)
    DECLARE @MJTasks_ActionID_PercentComplete int
    DECLARE @MJTasks_ActionID_DueAt datetimeoffset
    DECLARE @MJTasks_ActionID_StartedAt datetimeoffset
    DECLARE @MJTasks_ActionID_CompletedAt datetimeoffset
    DECLARE @MJTasks_ActionID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_ActionID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_ActionID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_ActionID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_ActionID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_ActionID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_ActionID_ActionID uniqueidentifier
    DECLARE cascade_update_MJTasks_ActionID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJTasks_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_ActionID_cursor INTO @MJTasks_ActionIDID, @MJTasks_ActionID_ParentID, @MJTasks_ActionID_Name, @MJTasks_ActionID_Description, @MJTasks_ActionID_TypeID, @MJTasks_ActionID_EnvironmentID, @MJTasks_ActionID_ProjectID, @MJTasks_ActionID_ConversationDetailID, @MJTasks_ActionID_UserID, @MJTasks_ActionID_AgentID, @MJTasks_ActionID_Status, @MJTasks_ActionID_PercentComplete, @MJTasks_ActionID_DueAt, @MJTasks_ActionID_StartedAt, @MJTasks_ActionID_CompletedAt, @MJTasks_ActionID_InputPayload, @MJTasks_ActionID_OutputPayload, @MJTasks_ActionID_ErrorMessage, @MJTasks_ActionID_AgentRunID, @MJTasks_ActionID_ClaimedBy, @MJTasks_ActionID_ClaimExpiresAt, @MJTasks_ActionID_ActionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_ActionIDID, @ParentID = @MJTasks_ActionID_ParentID, @Name = @MJTasks_ActionID_Name, @Description = @MJTasks_ActionID_Description, @TypeID = @MJTasks_ActionID_TypeID, @EnvironmentID = @MJTasks_ActionID_EnvironmentID, @ProjectID = @MJTasks_ActionID_ProjectID, @ConversationDetailID = @MJTasks_ActionID_ConversationDetailID, @UserID = @MJTasks_ActionID_UserID, @AgentID = @MJTasks_ActionID_AgentID, @Status = @MJTasks_ActionID_Status, @PercentComplete = @MJTasks_ActionID_PercentComplete, @DueAt = @MJTasks_ActionID_DueAt, @StartedAt = @MJTasks_ActionID_StartedAt, @CompletedAt = @MJTasks_ActionID_CompletedAt, @InputPayload = @MJTasks_ActionID_InputPayload, @OutputPayload = @MJTasks_ActionID_OutputPayload, @ErrorMessage = @MJTasks_ActionID_ErrorMessage, @AgentRunID = @MJTasks_ActionID_AgentRunID, @ClaimedBy = @MJTasks_ActionID_ClaimedBy, @ClaimExpiresAt = @MJTasks_ActionID_ClaimExpiresAt, @ActionID_Clear = 1, @ActionID = @MJTasks_ActionID_ActionID

        FETCH NEXT FROM cascade_update_MJTasks_ActionID_cursor INTO @MJTasks_ActionIDID, @MJTasks_ActionID_ParentID, @MJTasks_ActionID_Name, @MJTasks_ActionID_Description, @MJTasks_ActionID_TypeID, @MJTasks_ActionID_EnvironmentID, @MJTasks_ActionID_ProjectID, @MJTasks_ActionID_ConversationDetailID, @MJTasks_ActionID_UserID, @MJTasks_ActionID_AgentID, @MJTasks_ActionID_Status, @MJTasks_ActionID_PercentComplete, @MJTasks_ActionID_DueAt, @MJTasks_ActionID_StartedAt, @MJTasks_ActionID_CompletedAt, @MJTasks_ActionID_InputPayload, @MJTasks_ActionID_OutputPayload, @MJTasks_ActionID_ErrorMessage, @MJTasks_ActionID_AgentRunID, @MJTasks_ActionID_ClaimedBy, @MJTasks_ActionID_ClaimExpiresAt, @MJTasks_ActionID_ActionID
    END

    CLOSE cascade_update_MJTasks_ActionID_cursor
    DEALLOCATE cascade_update_MJTasks_ActionID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Action]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Actions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration], [cdp_Developer];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dffd9209-8508-4aa3-9303-ba312cf94ec1' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = 'EntityField')) BEGIN
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
            'dffd9209-8508-4aa3-9303-ba312cf94ec1',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 9,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1267840-3c4a-4532-9429-29628ed9acba' OR (EntityID = 'C4ECCED4-5040-4DA9-A022-3BC195090058' AND Name = 'Role')) BEGIN
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
            'c1267840-3c4a-4532-9429-29628ed9acba',
            'C4ECCED4-5040-4DA9-A022-3BC195090058', -- Entity: MJ: Entity Field Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058') + 10,
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
               WHERE ID = 'B5C9D265-1D03-47F9-98A8-439237286F5B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '96309560-F20A-46A0-877A-45F9ED055EAD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '329E100D-B576-4DFF-8427-F84B2FEC212C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DFFD9209-8508-4AA3-9303-BA312CF94EC1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C1267840-3C4A-4532-9429-29628ED9ACBA'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'C4ECCED4-5040-4DA9-A022-3BC195090058'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '596F0FFE-6E36-4E9B-90D2-EB5BD65933D6'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '35248F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '554D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 0
               WHERE ID = 'B3786698-56A7-4C58-BEB4-7127D992CE08'
               AND AutoUpdateIsNameField = 1;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F95717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.EntityActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Action',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ActionParamID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Parameter',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '985817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ValueType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '995817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.Value 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'JavaScript'
WHERE 
   ID = '9A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ActionParam 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Parameter Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.LogValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Parameter Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA3B5587-44A5-4266-9CE5-EDAA583DACA2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F09794B3-9A79-4757-8D88-3541AE180A99' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.EntityFieldID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '983A6A23-CF4E-4E60-A6F4-D6B59A8C9DDF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E23BC9D4-BE73-4C49-80E7-0FB332650A32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.EntityField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFFD9209-8508-4AA3-9303-BA312CF94EC1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1267840-3C4A-4532-9429-29628ED9ACBA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.ReadAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Permissions',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B5C9D265-1D03-47F9-98A8-439237286F5B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.UpdateAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Permissions',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '96309560-F20A-46A0-877A-45F9ED055EAD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.CreateAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Permissions',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '329E100D-B576-4DFF-8427-F84B2FEC212C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4EE3D05C-C928-4B3C-9719-9164D92B74D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BFB83E3-7800-41F1-8822-461D62787018' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-shield-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('674b3c9b-dfc5-46e4-8043-5ddb7804594f', 'C4ECCED4-5040-4DA9-A022-3BC195090058', 'FieldCategoryInfo', '{"Relationship Mapping":{"icon":"fa fa-link","description":"Links between entities, fields, and roles for security enforcement"},"Access Permissions":{"icon":"fa fa-lock","description":"Trinary permission settings for read, update, and create operations"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('374f8017-7981-4a14-b03b-e2976d855013', 'C4ECCED4-5040-4DA9-A022-3BC195090058', 'FieldCategoryIcons', '{"Relationship Mapping":"fa fa-link","Access Permissions":"fa fa-lock","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058';

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '974C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.RetentionPeriod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '675717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Action',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '984C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '665717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.Action 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EntityActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Associated Entities',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Action',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A06BAC2D-D59E-4D0E-BA24-DB99A3D7F4C5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EntityActionInvocationTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Associated Entities',
   GeneratedFormSection = 'Category',
   DisplayName = 'Invocation Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82F166B9-98C5-419B-8CA3-94C75F6923D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EntityActionInvocationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Associated Entities',
   GeneratedFormSection = 'Category',
   DisplayName = 'Invocation Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D336063-C666-47EA-B0D5-ED692E81E6E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.TargetEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Associated Entities',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '927CFE61-12A6-42FE-9CEF-DD20F4475BA5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.TargetEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Associated Entities',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '898D7496-DF26-4AAF-BA4B-6BE563D78184' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.TargetRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Associated Entities',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target Record',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA659C40-FE09-430C-B9A6-750263BFDC77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '635717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '645717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.Params 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Input Parameters',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A94C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ResultParams 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Result Parameters',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '1C62E051-5ABE-44B2-919D-44B19AB41BC8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ResultCode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '655717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.Message 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ACF9E782-BB68-4F6E-B6A9-EB120312C97C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

/* Set categories for 79 fields */

-- UPDATE Entity Field Category Info MJ: Entities.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '195817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.NameSuffix 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '164E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.BaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '554D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.BaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '564D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.BaseViewGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '964D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '574D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.VirtualEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Virtual Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowMultipleSubtypes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18B53A1B-EE59-4382-B902-85BAC79BCED0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.GeneratedBaseViewName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '750C9831-E23F-4EDF-85ED-ACF1685BBCEB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.CodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.ClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.BaseTableCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.ParentEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.ParentBaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.ParentBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.RelationshipDefaultDisplayType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Relationship Default Display Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F75817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.UserFormGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.EntityObjectSubclassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Object Subclass Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D84217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.EntityObjectSubclassImport 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Object Subclass Import',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.SupportsGeoCoding 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '886C982A-13B1-4EE2-8C89-A96B995BAD5D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AutoUpdateSupportsGeoCoding 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto-Update Supports Geo-Coding',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A70E1DBA-0077-49CA-AEC4-CEE1203D3946' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AutoUpdateDescription 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F34E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.TrackRecordChanges 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B94D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AuditRecordAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C74D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AuditViewRuns 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C84D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.PreferredCommunicationField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B15717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9992893-7BD7-42EA-A2A8-48928D7A5CCE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.DetectExternalChanges 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A507B1C9-ABA5-4ECF-8137-36BC6FEFA018' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.IncludeInAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowAllRowsAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowUpdateAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '414F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowCreateAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowDeleteAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '804D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.CustomResolverAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '814D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowUserSearchAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '444F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.FullTextSearchEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.FullTextCatalog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '204E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.FullTextCatalogGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '214E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.FullTextIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '224E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.FullTextIndexGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '234E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.FullTextSearchFunction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '244E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.FullTextSearchFunctionGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '254E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.UserViewMaxRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F84217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.ScopeDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Default',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BCA2D814-7530-48F8-9AB7-DCEF70AC5FC9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.RowsToPackWithSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C6AC9CC7-0C99-46B4-9940-C5A9E60EED0A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.RowsToPackSampleMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFB53FA7-D868-4E1C-9932-A5E624092DC5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.RowsToPackSampleCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B3B3BCB-9E96-4FB0-B2B2-93C676C43261' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.RowsToPackSampleOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '29690283-5206-48EA-ADF6-43C40DA3220B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AutoUpdateFullTextSearch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '788D2007-4088-405B-98CD-056B376DD4E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AutoUpdateAllowUserSearchAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto-Update Allow User Search API',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5371AF90-DCF3-44C3-990B-95C29B088F0C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.TrustServerCacheCompletely 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '928FF8E1-3C3F-4A9D-AFCC-66808D59C151' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowCaching 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F750011-FEAF-4635-A017-344C1F3851E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.spCreate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.spUpdate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.spDelete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.spCreateGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.spUpdateGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '904D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.spDeleteGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '914D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.CascadeDeletes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.DeleteType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '115917F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowRecordMerge 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '125917F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.spMatch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowDirectSQLInsert 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A020410-E5A6-4484-9F1E-88C5C010F42A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowDirectSQLUpdate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7E46D739-BFCC-4FFF-A831-C38B8AD195C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowDirectSQLDelete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81621C87-9505-456C-9C8E-6F955EC7C22C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.EnableFieldLevelSecurity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Procedures & Deletion',
   GeneratedFormSection = 'Category',
   DisplayName = 'Enable Field-Level Security',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '63ECDD5F-63C1-4239-A53A-F7BDBE37BFB6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D05717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D15717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.CanonicalSchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0465B56C-C528-4C49-807B-DD47A022D6D4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AutoRowCountFrequency 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2212928A-D5D0-4AE3-8F5A-25C4DFE8C373' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.RowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '84C51291-65AB-4677-A0B6-5DACD698A255' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.RowCountRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A02DE6F-6D75-46B7-B800-D42B82227D1A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.ExternalDataSourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C919DAE-C8E3-46BE-A0B7-A7C96B56DFA8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.ExternalObjectName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1EC0ED5-1BFA-4170-8AB5-67D57E63375E' AND AutoUpdateCategory = 1;

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntities';

/* Generated Validation Functions for MJ: Entity Field Permissions */
-- CHECK constraint for MJ: Entity Field Permissions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([ReadAccess]<>N''Allow'' AND [UpdateAccess]=N''Allow'') AND NOT ([ReadAccess]<>N''Allow'' AND [CreateAccess]=N''Allow''))', 'public ValidateReadAccessRequiredForCreateOrUpdate(result: ValidationResult) {
    if (this.ReadAccess != null && this.UpdateAccess != null && this.CreateAccess != null) {
        if ((this.UpdateAccess === "Allow" || this.CreateAccess === "Allow") && this.ReadAccess !== "Allow") {
            result.Errors.push(new ValidationErrorInfo(
                "ReadAccess",
                "Read access must be set to ''Allow'' if either Create or Update access is allowed.",
                this.ReadAccess,
                ValidationErrorType.Failure
            ));
        }
    }
}', 'Users cannot be granted Create or Update access unless they are also granted Read access, ensuring logical consistency in permission assignments.', 'ValidateReadAccessRequiredForCreateOrUpdate', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C4ECCED4-5040-4DA9-A022-3BC195090058');

/* Generated Validation Functions for MJ: Tasks */
-- CHECK constraint for MJ: Tasks @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(((case when [UserID] IS NOT NULL then (1) else (0) end+case when [AgentID] IS NOT NULL then (1) else (0) end)+case when [ActionID] IS NOT NULL then (1) else (0) end)<=(1))', 'public ValidateMutuallyExclusiveUserAgentAction(result: ValidationResult) {
    let count = 0;
    if (this.UserID != null) {
        count++;
    }
    if (this.AgentID != null) {
        count++;
    }
    if (this.ActionID != null) {
        count++;
    }

    if (count > 1) {
        const errorMessage = "Only one of User, Agent, or Action can be specified.";
        if (this.UserID != null) {
            result.Errors.push(new ValidationErrorInfo(
                "UserID",
                errorMessage,
                this.UserID,
                ValidationErrorType.Failure
            ));
        }
        if (this.AgentID != null) {
            result.Errors.push(new ValidationErrorInfo(
                "AgentID",
                errorMessage,
                this.AgentID,
                ValidationErrorType.Failure
            ));
        }
        if (this.ActionID != null) {
            result.Errors.push(new ValidationErrorInfo(
                "ActionID",
                errorMessage,
                this.ActionID,
                ValidationErrorType.Failure
            ));
        }
    }
}', 'Only one of User, Agent, or Action can be specified. This ensures that the record is associated with at most one owner or source type.', 'ValidateMutuallyExclusiveUserAgentAction', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1');




/* ============================================================================= */
/*              HAND-WRITTEN — POST-CODEGEN METADATA CORRECTION                  */
/*                                                                               */
/* This runs AFTER the CodeGen block deliberately. CodeGen creates every new     */
/* Entity row with TrackRecordChanges = 1 (see the Entity INSERT above), and it  */
/* has no way to know that this particular entity should opt out. An UPDATE      */
/* after the fact is the only place to express that, so do not fold it into the  */
/* generated INSERT — a CodeGen re-run would silently discard the edit.          */
/* ============================================================================= */

-- Turn OFF Record Changes for MJ: Entity Field Permissions.
--
-- Enabling field-level security on an entity snapshots its entity-level permissions
-- into one EntityFieldPermission row per (field x qualifying role). On a wide entity
-- with several roles that is hundreds of rows written in a single unit of work, every
-- one of them through BaseEntity.Save() — which is correct (the delta module must not
-- bypass validation or the save-time guards), but which also produces hundreds of audit
-- rows all saying the same thing: "the system wrote the defaults."
--
-- That is not an audit trail anyone reads, and it buries the entries that DO matter --
-- an administrator later tightening a specific field. The signal worth auditing is the
-- deliberate edit, and the snapshot noise is what would hide it.
--
-- Note this is NOT an opt-in to direct SQL. AllowDirectSQLInsert/Update/Delete all stay
-- off: every mutation still goes through the entity path, so validation, entity actions
-- and cache invalidation are unaffected. Only the Record Changes audit row is suppressed.
UPDATE [${flyway:defaultSchema}].[Entity]
   SET [TrackRecordChanges] = 0
 WHERE [ID] = 'C4ECCED4-5040-4DA9-A022-3BC195090058';
GO

