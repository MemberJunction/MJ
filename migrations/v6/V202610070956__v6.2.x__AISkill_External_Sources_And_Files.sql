-- ============================================================================
-- v6.2.x — First-class external skills: source tracking on AISkill + multi-file skills (AISkillFile)
--
-- WHY. An MJ skill was one Instructions string plus bundled Actions and sub-agents, imported only by
-- uploading a single MJ-dialect SKILL.md. Nothing recorded where it came from, so an instruction-only
-- Anthropic-style skill (SKILL.md + references/) could neither be imported whole nor tracked as its
-- upstream moved. See plans/archify-diagram-skill.md, Phase 4.
--
-- WHAT.
--   AISkill — six nullable source columns, all NULL for a skill authored or uploaded here:
--     SourceType         'URL' | 'GitHub'; NULL = no upstream to track
--     SourceURL          where the content came from (raw URL, or the GitHub folder URL)
--     SourceRef          GitHub ref (tag, branch or commit SHA) the import pinned to
--     SourceVersion      version the upstream declares (SKILL.md frontmatter metadata.version)
--     SourceContentHash  SHA-256 of the imported SKILL.md + files; the scheduled update check
--                        compares it with upstream and sets Status = 'Pending' on a difference
--     LastSyncedAt       when the content was last imported from the source
--   AISkill.Frontmatter — SKILL.md frontmatter keys MJ does not model as columns (license, metadata,
--     allowed-tools, ...), as a JSON object, so an import -> export round trip keeps them.
--   AISkillFile — the skill's other files (references/, examples), one row per relative Path. Not
--     injected on activation: the activation message lists the paths and the agent reads one on
--     demand through the `Read Skill File` action (progressive disclosure).
--
-- AISkill.Status already allows 'Pending' (CK_AISkill_Status, v5.44), so it is not changed here.
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.AISkill
    ADD SourceType        NVARCHAR(20)   NULL
            CONSTRAINT CK_AISkill_SourceType CHECK (SourceType IN ('URL', 'GitHub')),
        SourceURL         NVARCHAR(1000) NULL,
        SourceRef         NVARCHAR(255)  NULL,
        SourceVersion     NVARCHAR(100)  NULL,
        SourceContentHash NVARCHAR(64)   NULL,
        LastSyncedAt      DATETIMEOFFSET NULL,
        Frontmatter       NVARCHAR(MAX)  NULL;
GO

CREATE TABLE ${flyway:defaultSchema}.AISkillFile (
    ID       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SkillID  UNIQUEIDENTIFIER NOT NULL,
    Path     NVARCHAR(500)    NOT NULL,
    Content  NVARCHAR(MAX)    NOT NULL,
    CONSTRAINT PK_AISkillFile PRIMARY KEY (ID),
    CONSTRAINT FK_AISkillFile_Skill FOREIGN KEY (SkillID)
        REFERENCES ${flyway:defaultSchema}.AISkill (ID),
    CONSTRAINT UQ_AISkillFile_SkillID_Path UNIQUE (SkillID, Path)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Where this skill''s content came from. URL: a SKILL.md fetched from a plain URL. GitHub: a skill folder in a GitHub repository (SKILL.md plus its other files). NULL: authored or uploaded in this instance, with no upstream to track. Only sourced skills are checked by the Skill Update Check scheduled job.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'SourceType';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The source location. For URL, the URL of the SKILL.md itself. For GitHub, the skill folder as https://github.com/<owner>/<repo>/tree/<ref>/<path>, with the ref also stored in SourceRef so a ref containing slashes stays unambiguous.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'SourceURL';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The git ref (tag, branch or commit SHA) a GitHub-sourced skill was imported from and is checked against. Pin to a tag or commit for a reviewable supply chain; a branch moves with every upstream commit. NULL for URL sources.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'SourceRef';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The version the upstream skill declares (SKILL.md frontmatter metadata.version) as of the last import. Informational; change detection uses SourceContentHash.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'SourceVersion';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lowercase hex SHA-256 over the imported SKILL.md and every imported file (sorted by path). The Skill Update Check job recomputes it from the source; when it differs, the skill is set to Pending for admin review rather than overwritten.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'SourceContentHash';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the skill''s content was last imported from its source. An update check that finds no change does not touch it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'LastSyncedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'SKILL.md frontmatter keys MJ does not model as columns (for example license, metadata, allowed-tools), as a JSON object. Written back on SKILL.md export so an import/export round trip keeps them. NULL when the imported file had none.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Frontmatter';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A file that belongs to a skill besides its SKILL.md, such as a reference document or an example. Not injected when the skill activates: the activation message lists each file''s Path, and the agent reads one on demand through the Read Skill File action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillFile';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Path relative to the skill folder, with forward slashes, for example references/api.md. Unique within a skill.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillFile', @level2type = N'COLUMN', @level2name = N'Path';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The file''s text content. Binary files are not imported.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillFile', @level2type = N'COLUMN', @level2name = N'Content';
GO























































/******************************************************************************************************
 * EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL — DO NOT EDIT BY HAND.
 *
 * Generated 2026-10-06 by `mj codegen` on a clean database built from migrations + metadata
 * (MJ_ARCHIFY_P4: migrate, codegen --skipfiles, sync push, at research-mermaid-diagrams @ 9c8f1bac35,
 * then the DDL above), unfiltered — the run emitted nothing unrelated:
 *   - MJ: AI Skill Files — the new entity row, its application link and role permissions, the
 *     __mj_CreatedAt/__mj_UpdatedAt columns, its EntityField rows (apply-time Sequence), the
 *     AISkills -> AISkillFiles relationship, the SkillID FK index, vwAISkillFiles (with the Skill
 *     name column), spCreate/spUpdate/spDelete AISkillFile + permissions.
 *   - MJ: AI Skills — the seven new EntityField rows, the SourceType value list (URL, GitHub), and the
 *     regenerated vwAISkills + spCreate/spUpdate/spDelete AISkill + permissions.
 *
 * If the hand-written DDL above changes, re-run CodeGen and replace this entire generated section.
 * The PostgreSQL counterpart is deferred to the release build (see migrations/CLAUDE.md).
 ******************************************************************************************************/

/* SQL generated to create new entity MJ: AI Skill Files */

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
         'ebd888fa-6f33-4950-a16b-4f178fc8107e',
         'MJ: AI Skill Files',
         'AI Skill Files',
         'A file that belongs to a skill besides its SKILL.md, such as a reference document or an example. Not injected when the skill activates: the activation message lists each file''s Path, and the agent reads one on demand through the Read Skill File action.',
         NULL,
         'AISkillFile',
         'vwAISkillFiles',
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

/* SQL generated to add new entity MJ: AI Skill Files to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ebd888fa-6f33-4950-a16b-4f178fc8107e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Files for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ebd888fa-6f33-4950-a16b-4f178fc8107e' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ebd888fa-6f33-4950-a16b-4f178fc8107e' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: AI Skill Files for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ebd888fa-6f33-4950-a16b-4f178fc8107e' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ebd888fa-6f33-4950-a16b-4f178fc8107e' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: AI Skill Files for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ebd888fa-6f33-4950-a16b-4f178fc8107e' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ebd888fa-6f33-4950-a16b-4f178fc8107e' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillFile */
ALTER TABLE [${flyway:defaultSchema}].[AISkillFile] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillFile */
UPDATE [${flyway:defaultSchema}].[AISkillFile] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillFile */
ALTER TABLE [${flyway:defaultSchema}].[AISkillFile] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillFile */
ALTER TABLE [${flyway:defaultSchema}].[AISkillFile] ADD CONSTRAINT [DF___mj_AISkillFile___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillFile */
ALTER TABLE [${flyway:defaultSchema}].[AISkillFile] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillFile */
UPDATE [${flyway:defaultSchema}].[AISkillFile] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillFile */
ALTER TABLE [${flyway:defaultSchema}].[AISkillFile] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillFile */
ALTER TABLE [${flyway:defaultSchema}].[AISkillFile] ADD CONSTRAINT [DF___mj_AISkillFile___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 13 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61e8a935-056f-4f65-9ef2-436735c26cb2' OR (EntityID = 'EBD888FA-6F33-4950-A16B-4F178FC8107E' AND Name = 'ID')) BEGIN
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
            '61e8a935-056f-4f65-9ef2-436735c26cb2',
            'EBD888FA-6F33-4950-A16B-4F178FC8107E', -- Entity: MJ: AI Skill Files
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBD888FA-6F33-4950-A16B-4F178FC8107E'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80df7c7c-8e16-4191-9460-e80bb16f0cce' OR (EntityID = 'EBD888FA-6F33-4950-A16B-4F178FC8107E' AND Name = 'SkillID')) BEGIN
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
            '80df7c7c-8e16-4191-9460-e80bb16f0cce',
            'EBD888FA-6F33-4950-A16B-4F178FC8107E', -- Entity: MJ: AI Skill Files
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBD888FA-6F33-4950-A16B-4F178FC8107E'),
            'SkillID',
            'Skill ID',
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
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4f06c0c-ec61-42cc-880c-79c6ea277a3b' OR (EntityID = 'EBD888FA-6F33-4950-A16B-4F178FC8107E' AND Name = 'Path')) BEGIN
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
            'a4f06c0c-ec61-42cc-880c-79c6ea277a3b',
            'EBD888FA-6F33-4950-A16B-4F178FC8107E', -- Entity: MJ: AI Skill Files
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBD888FA-6F33-4950-A16B-4F178FC8107E'),
            'Path',
            'Path',
            'Path relative to the skill folder, with forward slashes, for example references/api.md. Unique within a skill.',
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '793348b7-042b-4594-94db-66018b0bde54' OR (EntityID = 'EBD888FA-6F33-4950-A16B-4F178FC8107E' AND Name = 'Content')) BEGIN
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
            '793348b7-042b-4594-94db-66018b0bde54',
            'EBD888FA-6F33-4950-A16B-4F178FC8107E', -- Entity: MJ: AI Skill Files
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBD888FA-6F33-4950-A16B-4F178FC8107E'),
            'Content',
            'Content',
            'The file''s text content. Binary files are not imported.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ccf777b9-e5fe-4ca5-a88b-c9a200d9bfb4' OR (EntityID = 'EBD888FA-6F33-4950-A16B-4F178FC8107E' AND Name = '__mj_CreatedAt')) BEGIN
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
            'ccf777b9-e5fe-4ca5-a88b-c9a200d9bfb4',
            'EBD888FA-6F33-4950-A16B-4F178FC8107E', -- Entity: MJ: AI Skill Files
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBD888FA-6F33-4950-A16B-4F178FC8107E'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d033a49-0af8-4e4b-bd3a-80bbcecb3f41' OR (EntityID = 'EBD888FA-6F33-4950-A16B-4F178FC8107E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6d033a49-0af8-4e4b-bd3a-80bbcecb3f41',
            'EBD888FA-6F33-4950-A16B-4F178FC8107E', -- Entity: MJ: AI Skill Files
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBD888FA-6F33-4950-A16B-4F178FC8107E'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe77ea93-f962-4e2f-b6c3-700f05597cd2' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'SourceType')) BEGIN
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
            'fe77ea93-f962-4e2f-b6c3-700f05597cd2',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4'),
            'SourceType',
            'Source Type',
            'Where this skill''s content came from. URL: a SKILL.md fetched from a plain URL. GitHub: a skill folder in a GitHub repository (SKILL.md plus its other files). NULL: authored or uploaded in this instance, with no upstream to track. Only sourced skills are checked by the Skill Update Check scheduled job.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d2bf984-6e47-47b3-b814-14fd34c6e1ab' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'SourceURL')) BEGIN
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
            '2d2bf984-6e47-47b3-b814-14fd34c6e1ab',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4'),
            'SourceURL',
            'Source URL',
            'The source location. For URL, the URL of the SKILL.md itself. For GitHub, the skill folder as https://github.com/<owner>/<repo>/tree/<ref>/<path>, with the ref also stored in SourceRef so a ref containing slashes stays unambiguous.',
            'nvarchar',
            2000,
            0,
            0,
            1,
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a2cba82f-501a-4e19-9f5a-ed3a061fa0be' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'SourceRef')) BEGIN
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
            'a2cba82f-501a-4e19-9f5a-ed3a061fa0be',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4'),
            'SourceRef',
            'Source Ref',
            'The git ref (tag, branch or commit SHA) a GitHub-sourced skill was imported from and is checked against. Pin to a tag or commit for a reviewable supply chain; a branch moves with every upstream commit. NULL for URL sources.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'effc739b-9cad-4f5d-bbc5-6f42f8479a0a' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'SourceVersion')) BEGIN
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
            'effc739b-9cad-4f5d-bbc5-6f42f8479a0a',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4'),
            'SourceVersion',
            'Source Version',
            'The version the upstream skill declares (SKILL.md frontmatter metadata.version) as of the last import. Informational; change detection uses SourceContentHash.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94372581-9601-4712-b996-8ab8b3d5cc61' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'SourceContentHash')) BEGIN
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
            '94372581-9601-4712-b996-8ab8b3d5cc61',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4'),
            'SourceContentHash',
            'Source Content Hash',
            'Lowercase hex SHA-256 over the imported SKILL.md and every imported file (sorted by path). The Skill Update Check job recomputes it from the source; when it differs, the skill is set to Pending for admin review rather than overwritten.',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a7e66e2-3e71-4796-8d3e-73a48ae5258e' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'LastSyncedAt')) BEGIN
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
            '5a7e66e2-3e71-4796-8d3e-73a48ae5258e',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4'),
            'LastSyncedAt',
            'Last Synced At',
            'When the skill''s content was last imported from its source. An update check that finds no change does not touch it.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c9824392-c080-40ff-adf5-2d8255f5c82e' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'Frontmatter')) BEGIN
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
            'c9824392-c080-40ff-adf5-2d8255f5c82e',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4'),
            'Frontmatter',
            'Frontmatter',
            'SKILL.md frontmatter keys MJ does not model as columns (for example license, metadata, allowed-tools), as a JSON object. Written back on SKILL.md export so an import/export round trip keeps them. NULL when the imported file had none.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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

/* SQL text to insert entity field value with ID f6e0b3f5-65e2-467a-9488-469032e043f5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f6e0b3f5-65e2-467a-9488-469032e043f5', 'FE77EA93-F962-4E2F-B6C3-700F05597CD2', 1, 'GitHub', 'GitHub', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1a2b7b57-04c2-4ebe-8fcd-09503b3d9f66 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1a2b7b57-04c2-4ebe-8fcd-09503b3d9f66', 'FE77EA93-F962-4E2F-B6C3-700F05597CD2', 2, 'URL', 'URL', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID FE77EA93-F962-4E2F-B6C3-700F05597CD2 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FE77EA93-F962-4E2F-B6C3-700F05597CD2';

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: AI Skills -> MJ: AI Skill Files (One To Many via SkillID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '87d0600b-b06b-460d-b217-e44ae377501c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('87d0600b-b06b-460d-b217-e44ae377501c', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'EBD888FA-6F33-4950-A16B-4F178FC8107E', 'SkillID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for AISkillFile */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Files
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SkillID in table AISkillFile
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AISkillFile_SkillID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AISkillFile]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AISkillFile_SkillID ON [${flyway:defaultSchema}].[AISkillFile] ([SkillID]);

/* SQL text to update entity field related entity name field map for entity field ID 80DF7C7C-8E16-4191-9460-E80BB16F0CCE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='80DF7C7C-8E16-4191-9460-E80BB16F0CCE', @RelatedEntityNameFieldMap='Skill';

/* Index for Foreign Keys for AISkill */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skills
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CreatedByUserID in table AISkill
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AISkill_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AISkill]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AISkill_CreatedByUserID ON [${flyway:defaultSchema}].[AISkill] ([CreatedByUserID]);

/* Base View SQL for MJ: AI Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skills
-- Item: vwAISkills
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skills
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AISkill
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAISkills]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAISkills];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAISkills]
AS
SELECT
    a.*,
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser]
FROM
    [${flyway:defaultSchema}].[AISkill] AS a
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [a].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAISkills] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAISkills] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAISkills] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkills] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skills
-- Item: Permissions for vwAISkills
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwAISkills] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAISkills] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAISkills] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkills] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skills
-- Item: spCreateAISkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AISkill
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAISkill]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAISkill];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAISkill]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Instructions nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(50) = NULL,
    @CreatedByUserID uniqueidentifier,
    @ActivationMode nvarchar(20) = NULL,
    @SearchScopeAccess_Clear bit = 0,
    @SearchScopeAccess nvarchar(20) = NULL,
    @ActivationScope nvarchar(20) = NULL,
    @SourceType_Clear bit = 0,
    @SourceType nvarchar(20) = NULL,
    @SourceURL_Clear bit = 0,
    @SourceURL nvarchar(1000) = NULL,
    @SourceRef_Clear bit = 0,
    @SourceRef nvarchar(255) = NULL,
    @SourceVersion_Clear bit = 0,
    @SourceVersion nvarchar(100) = NULL,
    @SourceContentHash_Clear bit = 0,
    @SourceContentHash nvarchar(64) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL,
    @Frontmatter_Clear bit = 0,
    @Frontmatter nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AISkill]
            (
                [ID],
                [Name],
                [Description],
                [Instructions],
                [Status],
                [Category],
                [IconClass],
                [Color],
                [CreatedByUserID],
                [ActivationMode],
                [SearchScopeAccess],
                [ActivationScope],
                [SourceType],
                [SourceURL],
                [SourceRef],
                [SourceVersion],
                [SourceContentHash],
                [LastSyncedAt],
                [Frontmatter]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Instructions,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                @CreatedByUserID,
                ISNULL(@ActivationMode, 'RequestedOnly'),
                CASE WHEN @SearchScopeAccess_Clear = 1 THEN NULL ELSE ISNULL(@SearchScopeAccess, NULL) END,
                ISNULL(@ActivationScope, 'Run'),
                CASE WHEN @SourceType_Clear = 1 THEN NULL ELSE ISNULL(@SourceType, NULL) END,
                CASE WHEN @SourceURL_Clear = 1 THEN NULL ELSE ISNULL(@SourceURL, NULL) END,
                CASE WHEN @SourceRef_Clear = 1 THEN NULL ELSE ISNULL(@SourceRef, NULL) END,
                CASE WHEN @SourceVersion_Clear = 1 THEN NULL ELSE ISNULL(@SourceVersion, NULL) END,
                CASE WHEN @SourceContentHash_Clear = 1 THEN NULL ELSE ISNULL(@SourceContentHash, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END,
                CASE WHEN @Frontmatter_Clear = 1 THEN NULL ELSE ISNULL(@Frontmatter, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AISkill]
            (
                [Name],
                [Description],
                [Instructions],
                [Status],
                [Category],
                [IconClass],
                [Color],
                [CreatedByUserID],
                [ActivationMode],
                [SearchScopeAccess],
                [ActivationScope],
                [SourceType],
                [SourceURL],
                [SourceRef],
                [SourceVersion],
                [SourceContentHash],
                [LastSyncedAt],
                [Frontmatter]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Instructions,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                @CreatedByUserID,
                ISNULL(@ActivationMode, 'RequestedOnly'),
                CASE WHEN @SearchScopeAccess_Clear = 1 THEN NULL ELSE ISNULL(@SearchScopeAccess, NULL) END,
                ISNULL(@ActivationScope, 'Run'),
                CASE WHEN @SourceType_Clear = 1 THEN NULL ELSE ISNULL(@SourceType, NULL) END,
                CASE WHEN @SourceURL_Clear = 1 THEN NULL ELSE ISNULL(@SourceURL, NULL) END,
                CASE WHEN @SourceRef_Clear = 1 THEN NULL ELSE ISNULL(@SourceRef, NULL) END,
                CASE WHEN @SourceVersion_Clear = 1 THEN NULL ELSE ISNULL(@SourceVersion, NULL) END,
                CASE WHEN @SourceContentHash_Clear = 1 THEN NULL ELSE ISNULL(@SourceContentHash, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END,
                CASE WHEN @Frontmatter_Clear = 1 THEN NULL ELSE ISNULL(@Frontmatter, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAISkills] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkill] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkill] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkill] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Skills */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkill] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkill] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkill] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skills
-- Item: spUpdateAISkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AISkill
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAISkill]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkill];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkill]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Instructions nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(50) = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @ActivationMode nvarchar(20) = NULL,
    @SearchScopeAccess_Clear bit = 0,
    @SearchScopeAccess nvarchar(20) = NULL,
    @ActivationScope nvarchar(20) = NULL,
    @SourceType_Clear bit = 0,
    @SourceType nvarchar(20) = NULL,
    @SourceURL_Clear bit = 0,
    @SourceURL nvarchar(1000) = NULL,
    @SourceRef_Clear bit = 0,
    @SourceRef nvarchar(255) = NULL,
    @SourceVersion_Clear bit = 0,
    @SourceVersion nvarchar(100) = NULL,
    @SourceContentHash_Clear bit = 0,
    @SourceContentHash nvarchar(64) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL,
    @Frontmatter_Clear bit = 0,
    @Frontmatter nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkill]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Instructions] = ISNULL(@Instructions, [Instructions]),
        [Status] = ISNULL(@Status, [Status]),
        [Category] = CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, [Category]) END,
        [IconClass] = CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, [IconClass]) END,
        [Color] = CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, [Color]) END,
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID]),
        [ActivationMode] = ISNULL(@ActivationMode, [ActivationMode]),
        [SearchScopeAccess] = CASE WHEN @SearchScopeAccess_Clear = 1 THEN NULL ELSE ISNULL(@SearchScopeAccess, [SearchScopeAccess]) END,
        [ActivationScope] = ISNULL(@ActivationScope, [ActivationScope]),
        [SourceType] = CASE WHEN @SourceType_Clear = 1 THEN NULL ELSE ISNULL(@SourceType, [SourceType]) END,
        [SourceURL] = CASE WHEN @SourceURL_Clear = 1 THEN NULL ELSE ISNULL(@SourceURL, [SourceURL]) END,
        [SourceRef] = CASE WHEN @SourceRef_Clear = 1 THEN NULL ELSE ISNULL(@SourceRef, [SourceRef]) END,
        [SourceVersion] = CASE WHEN @SourceVersion_Clear = 1 THEN NULL ELSE ISNULL(@SourceVersion, [SourceVersion]) END,
        [SourceContentHash] = CASE WHEN @SourceContentHash_Clear = 1 THEN NULL ELSE ISNULL(@SourceContentHash, [SourceContentHash]) END,
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END,
        [Frontmatter] = CASE WHEN @Frontmatter_Clear = 1 THEN NULL ELSE ISNULL(@Frontmatter, [Frontmatter]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAISkills] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAISkills]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkill] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkill] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkill] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkill table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAISkill]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAISkill];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAISkill
ON [${flyway:defaultSchema}].[AISkill]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkill]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AISkill] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Skills */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkill] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkill] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkill] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skills
-- Item: spDeleteAISkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AISkill
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAISkill]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkill];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkill]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AISkill]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkill] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkill] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkill] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Skills */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkill] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkill] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkill] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: AI Skill Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Files
-- Item: vwAISkillFiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skill Files
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AISkillFile
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAISkillFiles]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAISkillFiles];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAISkillFiles]
AS
SELECT
    a.*,
    MJAISkill_SkillID.[Name] AS [Skill]
FROM
    [${flyway:defaultSchema}].[AISkillFile] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AISkill] AS MJAISkill_SkillID
  ON
    [a].[SkillID] = MJAISkill_SkillID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkillFiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Skill Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Files
-- Item: Permissions for vwAISkillFiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkillFiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Skill Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Files
-- Item: spCreateAISkillFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AISkillFile
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAISkillFile]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAISkillFile];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAISkillFile]
    @ID uniqueidentifier = NULL,
    @SkillID uniqueidentifier,
    @Path nvarchar(500),
    @Content nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AISkillFile]
            (
                [ID],
                [SkillID],
                [Path],
                [Content]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SkillID,
                @Path,
                @Content
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AISkillFile]
            (
                [SkillID],
                [Path],
                [Content]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SkillID,
                @Path,
                @Content
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAISkillFiles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkillFile] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Skill Files */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkillFile] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Skill Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Files
-- Item: spUpdateAISkillFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AISkillFile
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAISkillFile]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkillFile];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkillFile]
    @ID uniqueidentifier,
    @SkillID uniqueidentifier = NULL,
    @Path nvarchar(500) = NULL,
    @Content nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkillFile]
    SET
        [SkillID] = ISNULL(@SkillID, [SkillID]),
        [Path] = ISNULL(@Path, [Path]),
        [Content] = ISNULL(@Content, [Content])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAISkillFiles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAISkillFiles]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkillFile] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkillFile table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAISkillFile]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAISkillFile];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAISkillFile
ON [${flyway:defaultSchema}].[AISkillFile]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkillFile]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AISkillFile] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Skill Files */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkillFile] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Skill Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Files
-- Item: spDeleteAISkillFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AISkillFile
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAISkillFile]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkillFile];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkillFile]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AISkillFile]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkillFile] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Skill Files */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkillFile] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43ba1e62-5ffc-4a29-b2a4-65f7a8e48552' OR (EntityID = 'EBD888FA-6F33-4950-A16B-4F178FC8107E' AND Name = 'Skill')) BEGIN
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
            '43ba1e62-5ffc-4a29-b2a4-65f7a8e48552',
            'EBD888FA-6F33-4950-A16B-4F178FC8107E', -- Entity: MJ: AI Skill Files
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBD888FA-6F33-4950-A16B-4F178FC8107E'),
            'Skill',
            'Skill',
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

