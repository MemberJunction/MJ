/* ============================================================================
   Entity Field Permissions — Field-Level (Column-Level) Security
   v6.1.x

   Adds role-based FIELD-level access control, filling the gap between the
   existing entity-level CRUD permissions (EntityPermission) and row-level
   security (RowLevelSecurityFilter). Until now the only field-scoped feature
   was encryption-at-rest, which obfuscates data but does not control per-role
   visibility.

   TWO PIECES SHIP HERE:

   1. Entity.EnableFieldLevelSecurity — field-level security is ON or OFF per
      entity, explicitly, and enforcement gates on this flag alone. Flipping it
      ON snapshots the entity's existing entity-level permissions into per-field
      rows, so enabling changes no behavior until an admin tightens a field.

   2. EntityFieldPermission — one row per (field, role), carrying three
      INDEPENDENT trinary verbs: ReadAccess, UpdateAccess, CreateAccess.

   Trinary semantics, modelled on SQL Server's own posture:
     * 'No Access' — NEUTRAL. Grants nothing, blocks nothing. Another role's
       Allow still wins. This is the default, so a hand-inserted row grants
       nothing by accident.
     * 'Allow'     — grants the action for this role.
     * 'Deny'      — trumps everything. Any Deny across any of the user's roles
       wins, no matter how many Allows sit beside it.

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
    -- ON DELETE CASCADE: a rule about a column that no longer exists is meaningless, and the
    -- column's own metadata row is retired by CodeGen whenever it leaves the entity's BASE VIEW
    -- (a dropped column, a dropped foreign key taking its joined display column with it, a custom
    -- view narrowed to stop selecting it). That retirement runs through
    -- spDeleteUnneededEntityFields, which does raw DML rather than going through the entity layer
    -- -- so no BaseEntity subclass, and no Entity.CascadeDeletes setting, can clean up ahead of
    -- it. Without the cascade that DELETE fails on this constraint and CodeGen's whole
    -- metadata-sync phase reports failure on any FLS-enabled entity that loses a column.
    -- spDeleteUnneededEntityFields is ALSO taught to clear these rows first (below), which is the
    -- belt to this braces: the proc keeps the deletion explicit and greppable, the cascade covers
    -- every other path that reaches EntityField.
    CONSTRAINT FK_EntityFieldPermission_EntityField
        FOREIGN KEY (EntityFieldID) REFERENCES ${flyway:defaultSchema}.EntityField(ID)
        ON DELETE CASCADE,
    CONSTRAINT FK_EntityFieldPermission_Role
        FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.Role(ID),
    -- One row per (field, role): a role's stance on a field is always a single
    -- readable row rather than a set that has to be reconciled.
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

-- ============================================================================
-- spDeleteUnneededEntityFields — teach CodeGen's field-retirement proc about
-- EntityFieldPermission
-- ============================================================================
-- CodeGen retires EntityField rows for columns that have left an entity's BASE VIEW, through
-- this proc. It does raw DML rather than going through the entity layer, so neither a
-- BaseEntity subclass nor Entity.CascadeDeletes can clean up the new child table ahead of it —
-- the DELETE simply fails on FK_EntityFieldPermission_EntityField, and CodeGen's whole
-- metadata-sync phase reports failure for any field-security-enabled entity that loses a column.
--
-- Reproduced verbatim from the v5.46 baseline with ONE addition: the EntityFieldPermission
-- delete, placed alongside the EntityFieldValue delete it mirrors. Everything else is unchanged.
-- ============================================================================
CREATE OR ALTER PROC [${flyway:defaultSchema}].[spDeleteUnneededEntityFields]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityIDs NVARCHAR(MAX) = NULL
AS
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
SET NOCOUNT ON;

IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#DeletedFields') IS NOT NULL
    DROP TABLE #DeletedFields

-- Materialize the optional entity scope list once. @IsScoped lets the WHERE clauses
-- short-circuit to the unscoped path with a single int compare instead of joining
-- against an empty table variable.
DECLARE @ScopedEntityIDs TABLE (EntityID UNIQUEIDENTIFIER PRIMARY KEY);
DECLARE @IsScoped BIT = 0;
IF @EntityIDs IS NOT NULL AND LEN(@EntityIDs) > 0
BEGIN
    INSERT INTO @ScopedEntityIDs (EntityID)
    SELECT DISTINCT TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value)))
    FROM STRING_SPLIT(@EntityIDs, ',')
    WHERE LTRIM(RTRIM(value)) <> ''
      AND TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value))) IS NOT NULL;
    IF EXISTS (SELECT 1 FROM @ScopedEntityIDs) SET @IsScoped = 1;
END

-- put these two views into temp tables, for some SQL systems, this makes the join below WAY faster
SELECT
    ef.*
INTO
    #ef_spDeleteUnneededEntityFields
FROM
    vwEntityFields ef
INNER JOIN
    vwEntities e
ON
    ef.EntityID = e.ID
-- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    e.VirtualEntity = 0 AND -- exclude virtual entities from this always
    e.ExternalDataSourceID IS NULL AND -- exclude external-data-source entities (no physical table/view; data is remote)
    excludedSchemas.value IS NULL AND -- This ensures rows with matching SchemaName are excluded
    (@IsScoped = 0 OR ef.EntityID IN (SELECT EntityID FROM @ScopedEntityIDs)) -- scoped run: only listed entities

-- get actual fields from the database so we can compare MJ metadata to the SQL catalog.
-- When scoped, narrow vwSQLColumnsAndEntityFields the same way so the orphan join below stays correct.
SELECT *
INTO #actual_spDeleteUnneededEntityFields
FROM vwSQLColumnsAndEntityFields
WHERE @IsScoped = 0 OR EntityID IN (SELECT EntityID FROM @ScopedEntityIDs)

-- now figure out which fields are NO longer in the DB and should be removed from MJ metadata
SELECT ef.* INTO #DeletedFields
    FROM
      #ef_spDeleteUnneededEntityFields ef
    LEFT JOIN
      #actual_spDeleteUnneededEntityFields actual
      ON
      ef.EntityID=actual.EntityID AND
      ef.Name = actual.EntityFieldName
    WHERE
      actual.column_id IS NULL


-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE ${flyway:defaultSchema}.Entity SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN
(
  SELECT DISTINCT EntityID FROM #DeletedFields
)

-- next delete the entity field values
DELETE FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID IN (
  SELECT ID FROM #DeletedFields
)

-- and the field-level security rules for those fields. A rule about a column that no longer
-- exists is meaningless, and FK_EntityFieldPermission_EntityField would otherwise block the
-- EntityField delete below -- which is what happens on any field-security-enabled entity that
-- loses a column from its BASE VIEW (a dropped column, a dropped foreign key taking its joined
-- display column with it, or a custom view narrowed to stop selecting one).
--
-- The FK is also ON DELETE CASCADE, so this statement is not what makes the delete succeed. It
-- is here because this proc already states its child-table cleanup explicitly for
-- EntityFieldValue, and a reader working out what happens to a retired field should find both
-- answers in the same place rather than one here and one in a constraint definition.
DELETE FROM ${flyway:defaultSchema}.EntityFieldPermission WHERE EntityFieldID IN (
  SELECT ID FROM #DeletedFields
)

-- now delete the entity fields themsevles
DELETE FROM ${flyway:defaultSchema}.EntityField WHERE ID IN
(
  SELECT ID FROM #DeletedFields
)

-- return the deleted fields to the caller
SELECT * FROM #DeletedFields

-- clean up and get rid of our temp tables now
DROP TABLE #ef_spDeleteUnneededEntityFields
DROP TABLE #actual_spDeleteUnneededEntityFields
DROP TABLE #DeletedFields
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




/* ============================================================================
   TRIMMED CodeGen output — Entity Field Permissions feature only.

   This run (2026-09-04 19:00) was the FIRST CodeGen against a from-scratch
   database (mj_test_2, rebuilt 18:38), so the raw output also contained
   fresh-install healing unrelated to this feature. Per migrations/CLAUDE.md,
   those sections were EXCLUDED here (see CodeGen_Run_2026-09-04_19-00-13.original.sql
   for the unedited output):

     - IdentityClaim / IdentityClaimType __mj default-constraint churn,
       relationships, views, procs, value lists, and AI form-layout categories
       (healing of V202608202300's tail — not this feature)
     - The 80-field MJ: Entities AI relayout, EXCEPT the single category
       update for the new EnableFieldLevelSecurity field
     - Regenerated validation functions for MJ: AI Model Price Unit Types,
       MJ: AI Prompt Runs, and MJ: Form Chrome Rules

   Everything below pertains to EntityFieldPermission ("MJ: Entity Field
   Permissions") and Entity.EnableFieldLevelSecurity.
   ============================================================================ */

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
         '3cac32da-08e0-4517-81e4-c94d87fd55b9',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3cac32da-08e0-4517-81e4-c94d87fd55b9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3cac32da-08e0-4517-81e4-c94d87fd55b9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3cac32da-08e0-4517-81e4-c94d87fd55b9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3cac32da-08e0-4517-81e4-c94d87fd55b9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

/* SQL text to insert 11 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${flyway:defaultSchema}].[EntityField]
              WHERE [EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '947136f8-b701-4b23-bc86-262f35c32cd5' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EnableFieldLevelSecurity')) BEGIN
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
            '947136f8-b701-4b23-bc86-262f35c32cd5',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            73,
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
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${flyway:defaultSchema}].[EntityField]
              WHERE [EntityID] = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '287b4632-ca5a-403b-92f3-56d870de4dd9' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = 'ID')) BEGIN
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
            '287b4632-ca5a-403b-92f3-56d870de4dd9',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ea8ea52-34e1-4856-b482-8f47dca8f57f' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = 'EntityFieldID')) BEGIN
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
            '8ea8ea52-34e1-4856-b482-8f47dca8f57f',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f155e0f3-9953-4f02-b666-27536c5135e7' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = 'RoleID')) BEGIN
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
            'f155e0f3-9953-4f02-b666-27536c5135e7',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            3,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a21a62c2-8751-4867-9292-2fcf88ae80c7' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = 'ReadAccess')) BEGIN
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
            'a21a62c2-8751-4867-9292-2fcf88ae80c7',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41dbc253-c138-4641-a87d-34fe77cf4bdb' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = 'UpdateAccess')) BEGIN
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
            '41dbc253-c138-4641-a87d-34fe77cf4bdb',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            5,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88586749-12ee-4372-a488-f65a6d52c61b' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = 'CreateAccess')) BEGIN
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
            '88586749-12ee-4372-a488-f65a6d52c61b',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'deab32a0-5dd6-4db4-995f-aab83bd0c9e8' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = '__mj_CreatedAt')) BEGIN
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
            'deab32a0-5dd6-4db4-995f-aab83bd0c9e8',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cdcaa74-a526-431f-b5cf-f3dd4f9e2896' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0cdcaa74-a526-431f-b5cf-f3dd4f9e2896',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            8,
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

/* SQL text to insert entity field value with ID b6283966-5571-42fc-93ea-5691a33d8f97 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b6283966-5571-42fc-93ea-5691a33d8f97', 'A21A62C2-8751-4867-9292-2FCF88AE80C7', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 56b109d7-9de4-4054-a524-6a3318c77a19 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('56b109d7-9de4-4054-a524-6a3318c77a19', 'A21A62C2-8751-4867-9292-2FCF88AE80C7', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d7fc9e85-f000-481a-afbc-60b7d466c790 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d7fc9e85-f000-481a-afbc-60b7d466c790', 'A21A62C2-8751-4867-9292-2FCF88AE80C7', 3, 'No Access', 'No Access', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A21A62C2-8751-4867-9292-2FCF88AE80C7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A21A62C2-8751-4867-9292-2FCF88AE80C7';

/* SQL text to insert entity field value with ID 61238344-c7db-44f2-a396-6786deec7306 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('61238344-c7db-44f2-a396-6786deec7306', '41DBC253-C138-4641-A87D-34FE77CF4BDB', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 938b6f77-903b-43ac-a84c-a27ad91ccc36 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('938b6f77-903b-43ac-a84c-a27ad91ccc36', '41DBC253-C138-4641-A87D-34FE77CF4BDB', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 87a40f09-03fc-4034-82a2-de931fb81559 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87a40f09-03fc-4034-82a2-de931fb81559', '41DBC253-C138-4641-A87D-34FE77CF4BDB', 3, 'No Access', 'No Access', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 41DBC253-C138-4641-A87D-34FE77CF4BDB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='41DBC253-C138-4641-A87D-34FE77CF4BDB';

/* SQL text to insert entity field value with ID 133488e0-a83e-4f54-bf15-acde933a05e6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('133488e0-a83e-4f54-bf15-acde933a05e6', '88586749-12EE-4372-A488-F65A6D52C61B', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 442678b4-807a-41b7-9c53-52c523322575 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('442678b4-807a-41b7-9c53-52c523322575', '88586749-12EE-4372-A488-F65A6D52C61B', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 76c9a2a4-aa41-4a07-8323-1f1a78f94d47 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('76c9a2a4-aa41-4a07-8323-1f1a78f94d47', '88586749-12EE-4372-A488-F65A6D52C61B', 3, 'No Access', 'No Access', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 88586749-12EE-4372-A488-F65A6D52C61B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='88586749-12EE-4372-A488-F65A6D52C61B';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Field Permissions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '23e31821-b39d-480d-97ce-f0f5d9268320'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('23e31821-b39d-480d-97ce-f0f5d9268320', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', 'RoleID', 'One To Many', 1, 1, 17, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entity Fields -> MJ: Entity Field Permissions (One To Many via EntityFieldID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0c9aba67-1dad-4685-8bed-02f97b2ec226'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0c9aba67-1dad-4685-8bed-02f97b2ec226', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', 'EntityFieldID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


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
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
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
                [Configuration],
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
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
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
                [Configuration],
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
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
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
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
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
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration];

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

/* SQL text to update entity field related entity name field map for entity field ID 8EA8EA52-34E1-4856-B482-8F47DCA8F57F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8EA8EA52-34E1-4856-B482-8F47DCA8F57F', @RelatedEntityNameFieldMap='EntityField';

/* SQL text to update entity field related entity name field map for entity field ID F155E0F3-9953-4F02-B666-27536C5135E7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F155E0F3-9953-4F02-B666-27536C5135E7', @RelatedEntityNameFieldMap='Role';

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

/* SQL text to insert 3 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${flyway:defaultSchema}].[EntityField]
              WHERE [EntityID] = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e8357c6-1051-4972-871f-cafd0819e015' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = 'EntityField')) BEGIN
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
            '3e8357c6-1051-4972-871f-cafd0819e015',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            9,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '33d16ab5-090c-4997-8532-0464558cce5a' OR (EntityID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9' AND Name = 'Role')) BEGIN
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
            '33d16ab5-090c-4997-8532-0464558cce5a',
            '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', -- Entity: MJ: Entity Field Permissions
            10,
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
               WHERE ID = 'A21A62C2-8751-4867-9292-2FCF88AE80C7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '41DBC253-C138-4641-A87D-34FE77CF4BDB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '88586749-12EE-4372-A488-F65A6D52C61B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3E8357C6-1051-4972-871F-CAFD0819E015'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '33D16AB5-090C-4997-8532-0464558CCE5A'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '287B4632-CA5A-403B-92F3-56D870DE4DD9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.EntityFieldID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Field',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8EA8EA52-34E1-4856-B482-8F47DCA8F57F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F155E0F3-9953-4F02-B666-27536C5135E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.EntityField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Field Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E8357C6-1051-4972-871F-CAFD0819E015' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '33D16AB5-090C-4997-8532-0464558CCE5A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.ReadAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A21A62C2-8751-4867-9292-2FCF88AE80C7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.UpdateAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41DBC253-C138-4641-A87D-34FE77CF4BDB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.CreateAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '88586749-12EE-4372-A488-F65A6D52C61B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DEAB32A0-5DD6-4DB4-995F-AAB83BD0C9E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Field Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CDCAA74-A526-431F-B5CF-F3DD4F9E2896' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-shield-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c50b9805-1bc6-4ab6-912c-6746db60f622', '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', 'FieldCategoryInfo', '{"Configuration":{"icon":"fa fa-cog","description":"Links the security rules to specific fields and roles"},"Access Control":{"icon":"fa fa-lock","description":"Defines the trinary permission levels for reading, updating, and creating data"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2e13de49-bd04-4490-9331-14b0ee376ce6', '3CAC32DA-08E0-4517-81E4-C94D87FD55B9', 'FieldCategoryIcons', '{"Configuration":"fa fa-cog","Access Control":"fa fa-lock","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '3CAC32DA-08E0-4517-81E4-C94D87FD55B9';

-- UPDATE Entity Field Category Info MJ: Entities.EnableFieldLevelSecurity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API & Search Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '947136F8-B701-4B23-BC86-262F35C32CD5' AND AutoUpdateCategory = 1;
/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntities';

/* Generated Validation Functions for MJ: Entity Field Permissions */
-- CHECK constraint for MJ: Entity Field Permissions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([ReadAccess]<>N''Allow'' AND [UpdateAccess]=N''Allow'') AND NOT ([ReadAccess]<>N''Allow'' AND [CreateAccess]=N''Allow''))', 'public ValidateReadAccessRequiredForCreateOrUpdate(result: ValidationResult) {
	if (this.ReadAccess !== "Allow") {
		if (this.UpdateAccess === "Allow") {
			result.Errors.push(new ValidationErrorInfo(
				"UpdateAccess",
				"Update access cannot be set to ''Allow'' unless Read access is also set to ''Allow''.",
				this.UpdateAccess,
				ValidationErrorType.Failure
			));
		}
		if (this.CreateAccess === "Allow") {
			result.Errors.push(new ValidationErrorInfo(
				"CreateAccess",
				"Create access cannot be set to ''Allow'' unless Read access is also set to ''Allow''.",
				this.CreateAccess,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Users cannot be granted Create or Update access unless they are also granted Read access, ensuring logical permission hierarchy.', 'ValidateReadAccessRequiredForCreateOrUpdate', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '3CAC32DA-08E0-4517-81E4-C94D87FD55B9');

