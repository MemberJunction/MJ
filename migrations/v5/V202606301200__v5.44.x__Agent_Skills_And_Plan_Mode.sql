-- ============================================================================
-- Agent Skills + Plan Mode  (v5.44.x)
-- ============================================================================
-- Carved out of the Conversations Phase 1 roadmap (PR #2953) as a self-contained,
-- agent-framework feature. Plan + Skills are bundled here because they share two
-- schema objects: the consolidated AIAgent ALTER and the AIAgentRunStep.StepType
-- CHECK (both add a value). The remaining Phase 1 pieces (User Routines,
-- project-scoped memory, group chat) are independent migrations landed when built.
--
--   New tables (all "MJ: " entity names assigned by CodeGen):
--     AISkill           — reusable capability bundle (Instructions appended to an
--                         accepting agent's system prompt on activation).
--     AISkillAction     — Actions bundled into a skill (enabled while skill active).
--     AISkillSubAgent   — sub-agents bundled into a skill.
--     AIAgentSkill      — agent <-> skill assignment (for AcceptsSkills = Limited).
--     AISkillPermission — per-user / per-role access to a skill (View / Run / Edit /
--                         Delete). Mirrors AIAgentPermission — the dedicated-table,
--                         open-by-default parity model. Backs the AISkillPermissionHelper
--                         runtime gate and the MJAISkillPermissionProvider unified-engine
--                         wrapper (see guides/UNIFIED_PERMISSIONS_GUIDE.md).
--
--   Additive columns:
--     AIAgent.SupportsPlanMode  — capability flag (default ON / opt-out).
--     AIAgent.AcceptsSkills     — None | All | Limited (default None / opt-in).
--     AISkill.IconClass         — Font Awesome icon class for the /skill picker + catalog.
--     AISkill.Color             — accent color for the skill's chip/badge in the UI.
--
--   AIAgentRunStep.StepType extended with 'Plan' and 'Skill'.
--
--   Data seed: SupportsPlanMode = 0 for existing Realtime agents (session-driven,
--   structurally skip plan mode). Remote Proxy agents get seeded when that type
--   ships (Phase 2).
--
--   Permissions: skills use dedicated-table parity with agents (AISkillPermission,
--   above). The "Can Share Skills" authorization is seeded via metadata sync AFTER
--   CodeGen registers the entities; the MJ: Permission Domains catalog row for
--   'AI Skill Permissions' -> MJAISkillPermissionProvider is likewise metadata sync,
--   not this migration.
-- ============================================================================


-- ============================================================================
-- 1. AISkill  ("MJ: AI Skills")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AISkill (
    ID               UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name             NVARCHAR(255)    NOT NULL,
    Description      NVARCHAR(MAX)    NULL,
    Instructions     NVARCHAR(MAX)    NOT NULL,
    Status           NVARCHAR(20)     NOT NULL CONSTRAINT DF_AISkill_Status DEFAULT ('Active'),
    Category         NVARCHAR(100)    NULL,
    IconClass        NVARCHAR(100)    NULL,
    Color            NVARCHAR(50)     NULL,
    CreatedByUserID  UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_AISkill PRIMARY KEY (ID),
    CONSTRAINT FK_AISkill_CreatedByUser FOREIGN KEY (CreatedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT CK_AISkill_Status
        CHECK (Status IN ('Active', 'Pending', 'Deprecated'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Skill name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Short description shown in the skill catalog (used for progressive-disclosure exposure to agents — name + description only are injected until the skill is activated).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Instruction text appended to an accepting agent''s system prompt when the skill is activated.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Instructions';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lifecycle status. Only Active skills can be activated by agents. Defaults to Active so a freshly authored skill is usable by its owner immediately; set to Deprecated to retire without deleting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional grouping category.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Category';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional Font Awesome icon class (e.g. "fa-solid fa-wand-magic-sparkles") shown for this skill in the /skill picker and skill catalog. When null, the UI falls back to a derived default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'IconClass';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional accent color (hex or CSS color token) for this skill''s chip/badge in the composer and catalog UI. When null, the UI falls back to a derived default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Color';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'User who authored the skill (owner). Authoring is open to self by default; sharing requires the Can Share Skills privilege.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'CreatedByUserID';


-- ============================================================================
-- 2. AISkillAction  ("MJ: AI Skill Actions")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AISkillAction (
    ID                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SkillID              UNIQUEIDENTIFIER NOT NULL,
    ActionID             UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_AISkillAction PRIMARY KEY (ID),
    CONSTRAINT FK_AISkillAction_Skill FOREIGN KEY (SkillID)
        REFERENCES ${flyway:defaultSchema}.AISkill (ID),
    CONSTRAINT FK_AISkillAction_Action FOREIGN KEY (ActionID)
        REFERENCES ${flyway:defaultSchema}.Action (ID),
    CONSTRAINT UQ_AISkillAction_Skill_Action UNIQUE (SkillID, ActionID)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Skill that bundles this action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillAction', @level2type = N'COLUMN', @level2name = N'SkillID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Action made available to the agent while the skill is active. Whether and how often the model invokes it is governed by the skill''s Instructions, not by a hard execution count.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillAction', @level2type = N'COLUMN', @level2name = N'ActionID';


-- ============================================================================
-- 3. AISkillSubAgent  ("MJ: AI Skill Sub Agents")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AISkillSubAgent (
    ID          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SkillID     UNIQUEIDENTIFIER NOT NULL,
    SubAgentID  UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_AISkillSubAgent PRIMARY KEY (ID),
    CONSTRAINT FK_AISkillSubAgent_Skill FOREIGN KEY (SkillID)
        REFERENCES ${flyway:defaultSchema}.AISkill (ID),
    CONSTRAINT FK_AISkillSubAgent_SubAgent FOREIGN KEY (SubAgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID),
    CONSTRAINT UQ_AISkillSubAgent_Skill_SubAgent UNIQUE (SkillID, SubAgentID)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Skill that bundles this sub-agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillSubAgent', @level2type = N'COLUMN', @level2name = N'SkillID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Sub-agent made available to the agent while the skill is active.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillSubAgent', @level2type = N'COLUMN', @level2name = N'SubAgentID';


-- ============================================================================
-- 4. AIAgentSkill  ("MJ: AI Agent Skills") — agent <-> skill assignment
--    Used when the agent's AcceptsSkills = Limited.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIAgentSkill (
    ID       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID  UNIQUEIDENTIFIER NOT NULL,
    SkillID  UNIQUEIDENTIFIER NOT NULL,
    Status   NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIAgentSkill_Status DEFAULT ('Active'),
    CONSTRAINT PK_AIAgentSkill PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentSkill_Agent FOREIGN KEY (AgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID),
    CONSTRAINT FK_AIAgentSkill_Skill FOREIGN KEY (SkillID)
        REFERENCES ${flyway:defaultSchema}.AISkill (ID),
    CONSTRAINT UQ_AIAgentSkill_Agent_Skill UNIQUE (AgentID, SkillID),
    CONSTRAINT CK_AIAgentSkill_Status
        CHECK (Status IN ('Active', 'Pending', 'Revoked'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Agent the skill is assigned to. Used when the agent''s AcceptsSkills = Limited.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSkill', @level2type = N'COLUMN', @level2name = N'AgentID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Skill assigned to the agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSkill', @level2type = N'COLUMN', @level2name = N'SkillID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Per-assignment status: Active, Pending, or Revoked. Lets an assignment be disabled without unlinking.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSkill', @level2type = N'COLUMN', @level2name = N'Status';


-- ============================================================================
-- 4b. AISkillPermission  ("MJ: AI Skill Permissions") — per-user / per-role access
--     to a skill. Mirrors AIAgentPermission (dedicated-table parity). Exactly one of
--     UserID / RoleID is set per row (enforced by the entity server validator, matching
--     AIAgentPermission — not a DB constraint, so a null grantee surfaces as a validation
--     error rather than a raw constraint violation). Open-by-default semantics live in the
--     AISkillPermissionHelper runtime gate; this table stores only explicit grants.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AISkillPermission (
    ID         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SkillID    UNIQUEIDENTIFIER NOT NULL,
    RoleID     UNIQUEIDENTIFIER NULL,
    UserID     UNIQUEIDENTIFIER NULL,
    CanView    BIT              NOT NULL CONSTRAINT DF_AISkillPermission_CanView   DEFAULT (0),
    CanRun     BIT              NOT NULL CONSTRAINT DF_AISkillPermission_CanRun    DEFAULT (0),
    CanEdit    BIT              NOT NULL CONSTRAINT DF_AISkillPermission_CanEdit   DEFAULT (0),
    CanDelete  BIT              NOT NULL CONSTRAINT DF_AISkillPermission_CanDelete DEFAULT (0),
    Comments   NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_AISkillPermission PRIMARY KEY (ID),
    CONSTRAINT FK_AISkillPermission_Skill FOREIGN KEY (SkillID)
        REFERENCES ${flyway:defaultSchema}.AISkill (ID),
    CONSTRAINT FK_AISkillPermission_Role FOREIGN KEY (RoleID)
        REFERENCES ${flyway:defaultSchema}.Role (ID),
    CONSTRAINT FK_AISkillPermission_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Skill this permission grant applies to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillPermission', @level2type = N'COLUMN', @level2name = N'SkillID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Role this grant is for. Mutually exclusive with UserID — exactly one of the two is set per row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillPermission', @level2type = N'COLUMN', @level2name = N'RoleID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'User this grant is for. Mutually exclusive with RoleID — exactly one of the two is set per row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillPermission', @level2type = N'COLUMN', @level2name = N'UserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Grants viewing the skill in catalogs/pickers. Maps to the normalized Read action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillPermission', @level2type = N'COLUMN', @level2name = N'CanView';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Grants requesting/activating the skill at agent runtime. Maps to the normalized Execute action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillPermission', @level2type = N'COLUMN', @level2name = N'CanRun';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Grants editing the skill definition and its bundled actions/sub-agents. Maps to the normalized Update action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillPermission', @level2type = N'COLUMN', @level2name = N'CanEdit';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Grants deleting the skill. Maps to the normalized Delete action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillPermission', @level2type = N'COLUMN', @level2name = N'CanDelete';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional free-text note explaining why the grant exists.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillPermission', @level2type = N'COLUMN', @level2name = N'Comments';


-- ============================================================================
-- 5. ALTER AIAgent — plan-mode capability (default ON / opt-out) + skills
--    acceptance gate (default None / opt-in). One consolidated ALTER.
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    SupportsPlanMode BIT          NOT NULL CONSTRAINT DF_AIAgent_SupportsPlanMode DEFAULT (1),
    AcceptsSkills    NVARCHAR(20) NOT NULL CONSTRAINT DF_AIAgent_AcceptsSkills DEFAULT ('None'),
    CONSTRAINT CK_AIAgent_AcceptsSkills CHECK (AcceptsSkills IN ('None', 'All', 'Limited'));
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this agent supports Plan Mode. Defaults ON (opt-out). Plan-mode instructions are only injected when this is on AND plan mode is enabled per-request, so default runtime behavior is unchanged. Realtime agents are seeded to 0 (they skip plan mode structurally); Remote Proxy agents will be seeded when that type ships.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent', @level2type = N'COLUMN', @level2name = N'SupportsPlanMode';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this agent accepts skills: None (no skills — default), All (any Active skill), or Limited (only skills assigned via AIAgentSkill). This is the per-agent gate; AISkill.Status and AIAgentSkill.Status provide catalog- and assignment-level gating on top.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent', @level2type = N'COLUMN', @level2name = N'AcceptsSkills';


-- ============================================================================
-- 6. Extend AIAgentRunStep.StepType with 'Plan' and 'Skill'
--    (constraint name varies by environment — discover then drop)
-- ============================================================================
DECLARE @StepTypeConstraint NVARCHAR(200);
SELECT @StepTypeConstraint = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunStep]')
  AND COL_NAME(parent_object_id, parent_column_id) = 'StepType';

IF @StepTypeConstraint IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[AIAgentRunStep] DROP CONSTRAINT ' + @StepTypeConstraint);
    PRINT 'Dropped existing StepType check constraint: ' + @StepTypeConstraint;
END
GO

ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
    ADD CONSTRAINT CK_AIAgentRunStep_StepType
        CHECK ([StepType] IN ('Prompt', 'Actions', 'Sub-Agent', 'Chat', 'Decision', 'Validation', 'ForEach', 'While', 'Tool', 'Plan', 'Skill'));
GO


-- ============================================================================
-- 7. Data seed — Realtime agents skip plan mode structurally.
--    (Remote Proxy agents are seeded when that agent type ships in Phase 2.)
-- ============================================================================
UPDATE a
SET a.SupportsPlanMode = 0
FROM ${flyway:defaultSchema}.AIAgent a
INNER JOIN ${flyway:defaultSchema}.AIAgentType t ON a.TypeID = t.ID
WHERE t.Name = 'Realtime'
  AND a.SupportsPlanMode = 1;
GO





































-- INCLUDED SINCE WITIN 5.44 we are modifying the same table(s) more than once so this is required between migration applications. CodeGen normally does this each run.

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1


































































-- CODE GEN RUN
/* SQL generated to create new entity MJ: AI Skills */

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
         '1d52de84-dd3f-4e46-8d2b-574b70080bb4',
         'MJ: AI Skills',
         'AI Skills',
         NULL,
         NULL,
         'AISkill',
         'vwAISkills',
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

/* SQL generated to add new entity MJ: AI Skills to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1d52de84-dd3f-4e46-8d2b-574b70080bb4', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skills for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1d52de84-dd3f-4e46-8d2b-574b70080bb4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skills for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1d52de84-dd3f-4e46-8d2b-574b70080bb4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skills for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1d52de84-dd3f-4e46-8d2b-574b70080bb4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Skill Actions */

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
         '5e3ea927-befa-417e-8fd9-6c114c1c0a2a',
         'MJ: AI Skill Actions',
         'AI Skill Actions',
         NULL,
         NULL,
         'AISkillAction',
         'vwAISkillActions',
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

/* SQL generated to add new entity MJ: AI Skill Actions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '5e3ea927-befa-417e-8fd9-6c114c1c0a2a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Actions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('5e3ea927-befa-417e-8fd9-6c114c1c0a2a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Actions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('5e3ea927-befa-417e-8fd9-6c114c1c0a2a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Actions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('5e3ea927-befa-417e-8fd9-6c114c1c0a2a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Skill Sub Agents */

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
         'aa4add02-7763-44ce-b07d-0cf74708749c',
         'MJ: AI Skill Sub Agents',
         'AI Skill Sub Agents',
         NULL,
         NULL,
         'AISkillSubAgent',
         'vwAISkillSubAgents',
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

/* SQL generated to add new entity MJ: AI Skill Sub Agents to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'aa4add02-7763-44ce-b07d-0cf74708749c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Sub Agents for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('aa4add02-7763-44ce-b07d-0cf74708749c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Sub Agents for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('aa4add02-7763-44ce-b07d-0cf74708749c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Sub Agents for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('aa4add02-7763-44ce-b07d-0cf74708749c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Agent Skills */

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
         '1f1ebdd5-84da-4554-a029-87aff327971d',
         'MJ: AI Agent Skills',
         'AI Agent Skills',
         NULL,
         NULL,
         'AIAgentSkill',
         'vwAIAgentSkills',
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

/* SQL generated to add new entity MJ: AI Agent Skills to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1f1ebdd5-84da-4554-a029-87aff327971d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Skills for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1f1ebdd5-84da-4554-a029-87aff327971d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Skills for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1f1ebdd5-84da-4554-a029-87aff327971d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Skills for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1f1ebdd5-84da-4554-a029-87aff327971d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Skill Permissions */

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
         '7eedd9fb-3882-4e98-804e-be1e95fac54a',
         'MJ: AI Skill Permissions',
         'AI Skill Permissions',
         NULL,
         NULL,
         'AISkillPermission',
         'vwAISkillPermissions',
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

/* SQL generated to add new entity MJ: AI Skill Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7eedd9fb-3882-4e98-804e-be1e95fac54a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Permissions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7eedd9fb-3882-4e98-804e-be1e95fac54a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Permissions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7eedd9fb-3882-4e98-804e-be1e95fac54a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Skill Permissions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7eedd9fb-3882-4e98-804e-be1e95fac54a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillSubAgent */
ALTER TABLE [${flyway:defaultSchema}].[AISkillSubAgent] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillSubAgent */
UPDATE [${flyway:defaultSchema}].[AISkillSubAgent] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillSubAgent */
ALTER TABLE [${flyway:defaultSchema}].[AISkillSubAgent] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillSubAgent */
ALTER TABLE [${flyway:defaultSchema}].[AISkillSubAgent] ADD CONSTRAINT [DF___mj_AISkillSubAgent___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillSubAgent */
ALTER TABLE [${flyway:defaultSchema}].[AISkillSubAgent] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillSubAgent */
UPDATE [${flyway:defaultSchema}].[AISkillSubAgent] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillSubAgent */
ALTER TABLE [${flyway:defaultSchema}].[AISkillSubAgent] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillSubAgent */
ALTER TABLE [${flyway:defaultSchema}].[AISkillSubAgent] ADD CONSTRAINT [DF___mj_AISkillSubAgent___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkill */
ALTER TABLE [${flyway:defaultSchema}].[AISkill] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkill */
UPDATE [${flyway:defaultSchema}].[AISkill] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkill */
ALTER TABLE [${flyway:defaultSchema}].[AISkill] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkill */
ALTER TABLE [${flyway:defaultSchema}].[AISkill] ADD CONSTRAINT [DF___mj_AISkill___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkill */
ALTER TABLE [${flyway:defaultSchema}].[AISkill] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkill */
UPDATE [${flyway:defaultSchema}].[AISkill] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkill */
ALTER TABLE [${flyway:defaultSchema}].[AISkill] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkill */
ALTER TABLE [${flyway:defaultSchema}].[AISkill] ADD CONSTRAINT [DF___mj_AISkill___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillAction */
ALTER TABLE [${flyway:defaultSchema}].[AISkillAction] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillAction */
UPDATE [${flyway:defaultSchema}].[AISkillAction] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillAction */
ALTER TABLE [${flyway:defaultSchema}].[AISkillAction] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillAction */
ALTER TABLE [${flyway:defaultSchema}].[AISkillAction] ADD CONSTRAINT [DF___mj_AISkillAction___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillAction */
ALTER TABLE [${flyway:defaultSchema}].[AISkillAction] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillAction */
UPDATE [${flyway:defaultSchema}].[AISkillAction] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillAction */
ALTER TABLE [${flyway:defaultSchema}].[AISkillAction] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillAction */
ALTER TABLE [${flyway:defaultSchema}].[AISkillAction] ADD CONSTRAINT [DF___mj_AISkillAction___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSkill */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSkill] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSkill */
UPDATE [${flyway:defaultSchema}].[AIAgentSkill] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSkill */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSkill] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSkill */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSkill] ADD CONSTRAINT [DF___mj_AIAgentSkill___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSkill */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSkill] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSkill */
UPDATE [${flyway:defaultSchema}].[AIAgentSkill] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSkill */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSkill] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSkill */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSkill] ADD CONSTRAINT [DF___mj_AIAgentSkill___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillPermission */
ALTER TABLE [${flyway:defaultSchema}].[AISkillPermission] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillPermission */
UPDATE [${flyway:defaultSchema}].[AISkillPermission] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillPermission */
ALTER TABLE [${flyway:defaultSchema}].[AISkillPermission] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AISkillPermission */
ALTER TABLE [${flyway:defaultSchema}].[AISkillPermission] ADD CONSTRAINT [DF___mj_AISkillPermission___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillPermission */
ALTER TABLE [${flyway:defaultSchema}].[AISkillPermission] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillPermission */
UPDATE [${flyway:defaultSchema}].[AISkillPermission] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillPermission */
ALTER TABLE [${flyway:defaultSchema}].[AISkillPermission] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AISkillPermission */
ALTER TABLE [${flyway:defaultSchema}].[AISkillPermission] ADD CONSTRAINT [DF___mj_AISkillPermission___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f06bf51-578f-4879-ad6a-9ec786939be7' OR (EntityID = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND Name = 'ID')) BEGIN
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
            '6f06bf51-578f-4879-ad6a-9ec786939be7',
            'AA4ADD02-7763-44CE-B07D-0CF74708749C', -- Entity: MJ: AI Skill Sub Agents
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00059b09-d83b-44e4-8604-dc0102128fa1' OR (EntityID = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND Name = 'SkillID')) BEGIN
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
            '00059b09-d83b-44e4-8604-dc0102128fa1',
            'AA4ADD02-7763-44CE-B07D-0CF74708749C', -- Entity: MJ: AI Skill Sub Agents
            100002,
            'SkillID',
            'Skill ID',
            'Skill that bundles this sub-agent.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7319e9ce-62d0-4dd4-99bd-e48fc866277f' OR (EntityID = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND Name = 'SubAgentID')) BEGIN
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
            '7319e9ce-62d0-4dd4-99bd-e48fc866277f',
            'AA4ADD02-7763-44CE-B07D-0CF74708749C', -- Entity: MJ: AI Skill Sub Agents
            100003,
            'SubAgentID',
            'Sub Agent ID',
            'Sub-agent made available to the agent while the skill is active.',
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
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eed49c3c-6ef3-4258-b38b-625b2dfb694f' OR (EntityID = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND Name = '__mj_CreatedAt')) BEGIN
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
            'eed49c3c-6ef3-4258-b38b-625b2dfb694f',
            'AA4ADD02-7763-44CE-B07D-0CF74708749C', -- Entity: MJ: AI Skill Sub Agents
            100004,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c692028-511d-4fe4-a475-590724775eb4' OR (EntityID = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6c692028-511d-4fe4-a475-590724775eb4',
            'AA4ADD02-7763-44CE-B07D-0CF74708749C', -- Entity: MJ: AI Skill Sub Agents
            100005,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e8ad66e4-d6eb-4a92-8e9d-bae06162b98d' OR (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'SupportsPlanMode')) BEGIN
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
            'e8ad66e4-d6eb-4a92-8e9d-bae06162b98d',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: MJ: AI Agents
            100160,
            'SupportsPlanMode',
            'Supports Plan Mode',
            'Whether this agent supports Plan Mode. Defaults ON (opt-out). Plan-mode instructions are only injected when this is on AND plan mode is enabled per-request, so default runtime behavior is unchanged. Realtime agents are seeded to 0 (they skip plan mode structurally); Remote Proxy agents will be seeded when that type ships.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5147944d-e146-47a9-b728-e46bbacdeab5' OR (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'AcceptsSkills')) BEGIN
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
            '5147944d-e146-47a9-b728-e46bbacdeab5',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: MJ: AI Agents
            100161,
            'AcceptsSkills',
            'Accepts Skills',
            'Whether this agent accepts skills: None (no skills — default), All (any Active skill), or Limited (only skills assigned via AIAgentSkill). This is the per-agent gate; AISkill.Status and AIAgentSkill.Status provide catalog- and assignment-level gating on top.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'None',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0738691-8e33-41fc-9e5b-efaf4a13ab01' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'ID')) BEGIN
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
            'b0738691-8e33-41fc-9e5b-efaf4a13ab01',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf89fcce-6d4d-4dd0-ac89-f7785be11f27' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'Name')) BEGIN
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
            'bf89fcce-6d4d-4dd0-ac89-f7785be11f27',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100002,
            'Name',
            'Name',
            'Skill name.',
            'nvarchar',
            510,
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
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27eddfe6-8e94-4f90-abb3-bfd7029c3640' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'Description')) BEGIN
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
            '27eddfe6-8e94-4f90-abb3-bfd7029c3640',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100003,
            'Description',
            'Description',
            'Short description shown in the skill catalog (used for progressive-disclosure exposure to agents — name + description only are injected until the skill is activated).',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ea0de7b-5bf0-4f2a-a8c4-cc8ae1fe47a7' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'Instructions')) BEGIN
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
            '4ea0de7b-5bf0-4f2a-a8c4-cc8ae1fe47a7',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100004,
            'Instructions',
            'Instructions',
            'Instruction text appended to an accepting agent''s system prompt when the skill is activated.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58bcaf71-a955-473d-99e4-fa0997cfbe56' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'Status')) BEGIN
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
            '58bcaf71-a955-473d-99e4-fa0997cfbe56',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100005,
            'Status',
            'Status',
            'Lifecycle status. Only Active skills can be activated by agents. Defaults to Active so a freshly authored skill is usable by its owner immediately; set to Deprecated to retire without deleting.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03bf582c-cbe4-4de3-a5d9-f9b788e0d665' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'Category')) BEGIN
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
            '03bf582c-cbe4-4de3-a5d9-f9b788e0d665',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100006,
            'Category',
            'Category',
            'Optional grouping category.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f38d266-56d2-49de-9912-3c67a28413cc' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'IconClass')) BEGIN
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
            '4f38d266-56d2-49de-9912-3c67a28413cc',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100007,
            'IconClass',
            'Icon Class',
            'Optional Font Awesome icon class (e.g. "fa-solid fa-wand-magic-sparkles") shown for this skill in the /skill picker and skill catalog. When null, the UI falls back to a derived default.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9cc2c1ad-8a1d-4dab-bea5-83845f7feec9' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'Color')) BEGIN
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
            '9cc2c1ad-8a1d-4dab-bea5-83845f7feec9',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100008,
            'Color',
            'Color',
            'Optional accent color (hex or CSS color token) for this skill''s chip/badge in the composer and catalog UI. When null, the UI falls back to a derived default.',
            'nvarchar',
            100,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a807d7c3-7083-42e5-baf7-62eeca9c8813' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'CreatedByUserID')) BEGIN
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
            'a807d7c3-7083-42e5-baf7-62eeca9c8813',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100009,
            'CreatedByUserID',
            'Created By User ID',
            'User who authored the skill (owner). Authoring is open to self by default; sharing requires the Can Share Skills privilege.',
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
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0021e00-68ff-4499-b029-d16440781316' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = '__mj_CreatedAt')) BEGIN
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
            'b0021e00-68ff-4499-b029-d16440781316',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100010,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86ff4d27-32d6-4e3d-9857-da7da9855289' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '86ff4d27-32d6-4e3d-9857-da7da9855289',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100011,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81ab537e-0d9f-4090-9b15-3b372100e402' OR (EntityID = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND Name = 'ID')) BEGIN
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
            '81ab537e-0d9f-4090-9b15-3b372100e402',
            '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', -- Entity: MJ: AI Skill Actions
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39650eae-013a-4e44-a315-0695c32df61d' OR (EntityID = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND Name = 'SkillID')) BEGIN
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
            '39650eae-013a-4e44-a315-0695c32df61d',
            '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', -- Entity: MJ: AI Skill Actions
            100002,
            'SkillID',
            'Skill ID',
            'Skill that bundles this action.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a96bc379-f67f-475c-a272-5f847ce1f821' OR (EntityID = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND Name = 'ActionID')) BEGIN
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
            'a96bc379-f67f-475c-a272-5f847ce1f821',
            '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', -- Entity: MJ: AI Skill Actions
            100003,
            'ActionID',
            'Action ID',
            'Action made available to the agent while the skill is active. Whether and how often the model invokes it is governed by the skill''s Instructions, not by a hard execution count.',
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
            '38248F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96d3843f-079f-4bee-8ecc-8012a07f10d6' OR (EntityID = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND Name = '__mj_CreatedAt')) BEGIN
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
            '96d3843f-079f-4bee-8ecc-8012a07f10d6',
            '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', -- Entity: MJ: AI Skill Actions
            100004,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5737f0b-e63f-464a-8bd0-81b9f7fdb446' OR (EntityID = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'd5737f0b-e63f-464a-8bd0-81b9f7fdb446',
            '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', -- Entity: MJ: AI Skill Actions
            100005,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cfb281f4-03ac-41a2-b61a-32f39c6ad41b' OR (EntityID = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND Name = 'ID')) BEGIN
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
            'cfb281f4-03ac-41a2-b61a-32f39c6ad41b',
            '1F1EBDD5-84DA-4554-A029-87AFF327971D', -- Entity: MJ: AI Agent Skills
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73aa9933-4307-43e6-8080-f5304d5d34bb' OR (EntityID = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND Name = 'AgentID')) BEGIN
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
            '73aa9933-4307-43e6-8080-f5304d5d34bb',
            '1F1EBDD5-84DA-4554-A029-87AFF327971D', -- Entity: MJ: AI Agent Skills
            100002,
            'AgentID',
            'Agent ID',
            'Agent the skill is assigned to. Used when the agent''s AcceptsSkills = Limited.',
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
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81fa8f23-39ba-4246-b583-daab08cbf4e1' OR (EntityID = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND Name = 'SkillID')) BEGIN
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
            '81fa8f23-39ba-4246-b583-daab08cbf4e1',
            '1F1EBDD5-84DA-4554-A029-87AFF327971D', -- Entity: MJ: AI Agent Skills
            100003,
            'SkillID',
            'Skill ID',
            'Skill assigned to the agent.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fdcf5c8c-e402-497c-9da8-5a47e6295937' OR (EntityID = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND Name = 'Status')) BEGIN
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
            'fdcf5c8c-e402-497c-9da8-5a47e6295937',
            '1F1EBDD5-84DA-4554-A029-87AFF327971D', -- Entity: MJ: AI Agent Skills
            100004,
            'Status',
            'Status',
            'Per-assignment status: Active, Pending, or Revoked. Lets an assignment be disabled without unlinking.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8fcf2dd-1109-42f6-9c3b-04a998414c5f' OR (EntityID = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND Name = '__mj_CreatedAt')) BEGIN
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
            'c8fcf2dd-1109-42f6-9c3b-04a998414c5f',
            '1F1EBDD5-84DA-4554-A029-87AFF327971D', -- Entity: MJ: AI Agent Skills
            100005,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4d2d43c-ee05-4f56-8636-68cff6c74050' OR (EntityID = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'c4d2d43c-ee05-4f56-8636-68cff6c74050',
            '1F1EBDD5-84DA-4554-A029-87AFF327971D', -- Entity: MJ: AI Agent Skills
            100006,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcf6f504-a122-4e01-910d-da799502d208' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'ID')) BEGIN
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
            'bcf6f504-a122-4e01-910d-da799502d208',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f1584029-6fa2-417f-8592-29288a8a2d3c' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'SkillID')) BEGIN
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
            'f1584029-6fa2-417f-8592-29288a8a2d3c',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100002,
            'SkillID',
            'Skill ID',
            'Skill this permission grant applies to.',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '758c7804-58ea-4092-b420-9e24fcc072eb' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'RoleID')) BEGIN
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
            '758c7804-58ea-4092-b420-9e24fcc072eb',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100003,
            'RoleID',
            'Role ID',
            'Role this grant is for. Mutually exclusive with UserID — exactly one of the two is set per row.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e741feb8-69ea-49bc-b6b9-a89ca678a324' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'UserID')) BEGIN
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
            'e741feb8-69ea-49bc-b6b9-a89ca678a324',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100004,
            'UserID',
            'User ID',
            'User this grant is for. Mutually exclusive with RoleID — exactly one of the two is set per row.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '360c60b6-7f6e-4659-a588-f7c293119143' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'CanView')) BEGIN
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
            '360c60b6-7f6e-4659-a588-f7c293119143',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100005,
            'CanView',
            'Can View',
            'Grants viewing the skill in catalogs/pickers. Maps to the normalized Read action.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e0ac00f-a853-4ce1-932c-1b1867eae004' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'CanRun')) BEGIN
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
            '6e0ac00f-a853-4ce1-932c-1b1867eae004',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100006,
            'CanRun',
            'Can Run',
            'Grants requesting/activating the skill at agent runtime. Maps to the normalized Execute action.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c7205e95-20ed-4b5c-a809-74cbec0e82f3' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'CanEdit')) BEGIN
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
            'c7205e95-20ed-4b5c-a809-74cbec0e82f3',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100007,
            'CanEdit',
            'Can Edit',
            'Grants editing the skill definition and its bundled actions/sub-agents. Maps to the normalized Update action.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '05ff7c4a-fc59-41df-a656-bf2a5cc4b112' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'CanDelete')) BEGIN
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
            '05ff7c4a-fc59-41df-a656-bf2a5cc4b112',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100008,
            'CanDelete',
            'Can Delete',
            'Grants deleting the skill. Maps to the normalized Delete action.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a64b3cb-3e78-4cad-99ae-4d8f0a606151' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'Comments')) BEGIN
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
            '5a64b3cb-3e78-4cad-99ae-4d8f0a606151',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100009,
            'Comments',
            'Comments',
            'Optional free-text note explaining why the grant exists.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f24f0607-585a-46dd-a1ce-e1204e98b5ae' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = '__mj_CreatedAt')) BEGIN
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
            'f24f0607-585a-46dd-a1ce-e1204e98b5ae',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100010,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '137f6a40-b765-46eb-b13e-e136e8f35766' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '137f6a40-b765-46eb-b13e-e136e8f35766',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100011,
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

/* SQL text to insert entity field value with ID 8182b804-9d3b-424b-b7e1-98e74bd5d37d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8182b804-9d3b-424b-b7e1-98e74bd5d37d', '58BCAF71-A955-473D-99E4-FA0997CFBE56', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0479be4e-4225-4301-b05a-71416ab3d22b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0479be4e-4225-4301-b05a-71416ab3d22b', '58BCAF71-A955-473D-99E4-FA0997CFBE56', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 366b5c02-e6be-41dd-82b0-456e3764715e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('366b5c02-e6be-41dd-82b0-456e3764715e', '58BCAF71-A955-473D-99E4-FA0997CFBE56', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 58BCAF71-A955-473D-99E4-FA0997CFBE56 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='58BCAF71-A955-473D-99E4-FA0997CFBE56';

/* SQL text to insert entity field value with ID e6f3d0a3-72ea-464e-b9fe-9943fc06a3f8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e6f3d0a3-72ea-464e-b9fe-9943fc06a3f8', 'FDCF5C8C-E402-497C-9DA8-5A47E6295937', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7001b5fe-7a31-4364-b4d4-0b97478fff2b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7001b5fe-7a31-4364-b4d4-0b97478fff2b', 'FDCF5C8C-E402-497C-9DA8-5A47E6295937', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4eef763f-87ac-4735-8a57-773ca619c8b4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4eef763f-87ac-4735-8a57-773ca619c8b4', 'FDCF5C8C-E402-497C-9DA8-5A47E6295937', 3, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID FDCF5C8C-E402-497C-9DA8-5A47E6295937 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FDCF5C8C-E402-497C-9DA8-5A47E6295937';

/* SQL text to insert entity field value with ID dcdfea86-30ca-45b9-a14d-71ef8dfd4c86 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dcdfea86-30ca-45b9-a14d-71ef8dfd4c86', '5147944D-E146-47A9-B728-E46BBACDEAB5', 1, 'All', 'All', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 96ab48af-a429-49a7-92ac-45bb4064d87e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('96ab48af-a429-49a7-92ac-45bb4064d87e', '5147944D-E146-47A9-B728-E46BBACDEAB5', 2, 'Limited', 'Limited', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f9379a40-6ea6-4340-b48c-87fa70c7bb54 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f9379a40-6ea6-4340-b48c-87fa70c7bb54', '5147944D-E146-47A9-B728-E46BBACDEAB5', 3, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5147944D-E146-47A9-B728-E46BBACDEAB5 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5147944D-E146-47A9-B728-E46BBACDEAB5';

/* SQL text to insert entity field value with ID 6b6811bd-344f-4805-a13a-94076410c986 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6b6811bd-344f-4805-a13a-94076410c986', 'B04A327B-55BF-4914-9DCF-3552A5DD0293', 5, 'Plan', 'Plan', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 903515ef-293d-4186-8fa1-95ac7a83f5ab */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('903515ef-293d-4186-8fa1-95ac7a83f5ab', 'B04A327B-55BF-4914-9DCF-3552A5DD0293', 7, 'Skill', 'Skill', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='B4FDC768-5F15-4720-B9EA-FB39634AFEF9';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=8 WHERE ID='B1115D73-2524-4329-B202-B6D453DE8FA9';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=9 WHERE ID='BA69DCBC-B743-4DED-930D-6F0DB4E8C01E';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=10 WHERE ID='61F9CF39-ECB3-4476-9AFC-7F037F5EB34E';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=11 WHERE ID='5E90D638-0329-4FF7-BA05-B38037474BF5';


/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Agent Skills (One To Many via AgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1d5a8480-384d-461b-ad27-334d676f9113'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1d5a8480-384d-461b-ad27-334d676f9113', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '1F1EBDD5-84DA-4554-A029-87AFF327971D', 'AgentID', 'One To Many', 1, 1, 35, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Skill Sub Agents (One To Many via SubAgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bc151c47-e823-4b5f-9261-3118dde42df0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bc151c47-e823-4b5f-9261-3118dde42df0', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'AA4ADD02-7763-44CE-B07D-0CF74708749C', 'SubAgentID', 'One To Many', 1, 1, 36, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Skills -> MJ: AI Skill Sub Agents (One To Many via SkillID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b3bb324e-0dff-4e77-8dbc-50ec6098d07d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b3bb324e-0dff-4e77-8dbc-50ec6098d07d', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'AA4ADD02-7763-44CE-B07D-0CF74708749C', 'SkillID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Skills -> MJ: AI Agent Skills (One To Many via SkillID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f0cfd509-8c61-4b90-8b32-917c9e394bc9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f0cfd509-8c61-4b90-8b32-917c9e394bc9', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', '1F1EBDD5-84DA-4554-A029-87AFF327971D', 'SkillID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Skills -> MJ: AI Skill Actions (One To Many via SkillID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c214d7b7-6526-48d7-a93f-5adebfacb121'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c214d7b7-6526-48d7-a93f-5adebfacb121', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', 'SkillID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Skills -> MJ: AI Skill Permissions (One To Many via SkillID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd87b66e2-13b0-4444-af5b-1684e5f71c70'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d87b66e2-13b0-4444-af5b-1684e5f71c70', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', 'SkillID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Roles -> MJ: AI Skill Permissions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f2139e41-3ffb-4a97-a769-156cf5ef9726'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f2139e41-3ffb-4a97-a769-156cf5ef9726', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', 'RoleID', 'One To Many', 1, 1, 15, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: AI Skill Permissions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a1a64d0d-9b8c-4d26-a051-eb9e0bc91732'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a1a64d0d-9b8c-4d26-a051-eb9e0bc91732', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', 'UserID', 'One To Many', 1, 1, 106, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: AI Skills (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9471d132-baac-4a71-bf22-cc1e0d79a07c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9471d132-baac-4a71-bf22-cc1e0d79a07c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'CreatedByUserID', 'One To Many', 1, 1, 107, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Actions -> MJ: AI Skill Actions (One To Many via ActionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '91cdffd9-19ce-465a-b1a1-2e1b7c71b5c6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('91cdffd9-19ce-465a-b1a1-2e1b7c71b5c6', '38248F34-2837-EF11-86D4-6045BDEE16E6', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', 'ActionID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for AIAgentSkill */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Skills
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentSkill
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSkill_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSkill]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSkill_AgentID ON [${flyway:defaultSchema}].[AIAgentSkill] ([AgentID]);

-- Index for foreign key SkillID in table AIAgentSkill
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSkill_SkillID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSkill]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSkill_SkillID ON [${flyway:defaultSchema}].[AIAgentSkill] ([SkillID]);

/* SQL text to update entity field related entity name field map for entity field ID 73AA9933-4307-43E6-8080-F5304D5D34BB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='73AA9933-4307-43E6-8080-F5304D5D34BB', @RelatedEntityNameFieldMap='Agent';

/* SQL text to update entity field related entity name field map for entity field ID 81FA8F23-39BA-4246-B583-DAAB08CBF4E1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='81FA8F23-39BA-4246-B583-DAAB08CBF4E1', @RelatedEntityNameFieldMap='Skill';

/* Base View SQL for MJ: AI Agent Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Skills
-- Item: vwAIAgentSkills
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Skills
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentSkill
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentSkills]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentSkills];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentSkills]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAISkill_SkillID.[Name] AS [Skill]
FROM
    [${flyway:defaultSchema}].[AIAgentSkill] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AISkill] AS MJAISkill_SkillID
  ON
    [a].[SkillID] = MJAISkill_SkillID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSkills] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Skills
-- Item: Permissions for vwAIAgentSkills
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSkills] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Skills
-- Item: spCreateAIAgentSkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentSkill
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentSkill]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSkill];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSkill]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @SkillID uniqueidentifier,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSkill]
            (
                [ID],
                [AgentID],
                [SkillID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @SkillID,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSkill]
            (
                [AgentID],
                [SkillID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @SkillID,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentSkills] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSkill] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Skills */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSkill] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Skills
-- Item: spUpdateAIAgentSkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentSkill
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentSkill]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSkill];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSkill]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @SkillID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSkill]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [SkillID] = ISNULL(@SkillID, [SkillID]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentSkills] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentSkills]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSkill] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSkill table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentSkill]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentSkill];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentSkill
ON [${flyway:defaultSchema}].[AIAgentSkill]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSkill]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentSkill] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Skills */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSkill] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Skills
-- Item: spDeleteAIAgentSkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentSkill
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentSkill]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSkill];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSkill]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentSkill]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSkill] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Skills */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSkill] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for AISkillAction */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Actions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SkillID in table AISkillAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AISkillAction_SkillID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AISkillAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AISkillAction_SkillID ON [${flyway:defaultSchema}].[AISkillAction] ([SkillID]);

-- Index for foreign key ActionID in table AISkillAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AISkillAction_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AISkillAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AISkillAction_ActionID ON [${flyway:defaultSchema}].[AISkillAction] ([ActionID]);

/* SQL text to update entity field related entity name field map for entity field ID 39650EAE-013A-4E44-A315-0695C32DF61D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='39650EAE-013A-4E44-A315-0695C32DF61D', @RelatedEntityNameFieldMap='Skill';

/* Index for Foreign Keys for AISkillPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SkillID in table AISkillPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AISkillPermission_SkillID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AISkillPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AISkillPermission_SkillID ON [${flyway:defaultSchema}].[AISkillPermission] ([SkillID]);

-- Index for foreign key RoleID in table AISkillPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AISkillPermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AISkillPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AISkillPermission_RoleID ON [${flyway:defaultSchema}].[AISkillPermission] ([RoleID]);

-- Index for foreign key UserID in table AISkillPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AISkillPermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AISkillPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AISkillPermission_UserID ON [${flyway:defaultSchema}].[AISkillPermission] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID F1584029-6FA2-417F-8592-29288A8A2D3C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F1584029-6FA2-417F-8592-29288A8A2D3C', @RelatedEntityNameFieldMap='Skill';

/* Index for Foreign Keys for AISkillSubAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Sub Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SkillID in table AISkillSubAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AISkillSubAgent_SkillID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AISkillSubAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AISkillSubAgent_SkillID ON [${flyway:defaultSchema}].[AISkillSubAgent] ([SkillID]);

-- Index for foreign key SubAgentID in table AISkillSubAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AISkillSubAgent_SubAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AISkillSubAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AISkillSubAgent_SubAgentID ON [${flyway:defaultSchema}].[AISkillSubAgent] ([SubAgentID]);

/* SQL text to update entity field related entity name field map for entity field ID 00059B09-D83B-44E4-8604-DC0102128FA1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='00059B09-D83B-44E4-8604-DC0102128FA1', @RelatedEntityNameFieldMap='Skill';

/* SQL text to update entity field related entity name field map for entity field ID 7319E9CE-62D0-4DD4-99BD-E48FC866277F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7319E9CE-62D0-4DD4-99BD-E48FC866277F', @RelatedEntityNameFieldMap='SubAgent';

/* SQL text to update entity field related entity name field map for entity field ID A96BC379-F67F-475C-A272-5F847CE1F821 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A96BC379-F67F-475C-A272-5F847CE1F821', @RelatedEntityNameFieldMap='Action';

/* SQL text to update entity field related entity name field map for entity field ID 758C7804-58EA-4092-B420-9E24FCC072EB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='758C7804-58EA-4092-B420-9E24FCC072EB', @RelatedEntityNameFieldMap='Role';

/* SQL text to update entity field related entity name field map for entity field ID E741FEB8-69EA-49BC-B6B9-A89CA678A324 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E741FEB8-69EA-49BC-B6B9-A89CA678A324', @RelatedEntityNameFieldMap='User';

/* Base View SQL for MJ: AI Skill Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Actions
-- Item: vwAISkillActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skill Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AISkillAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAISkillActions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAISkillActions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAISkillActions]
AS
SELECT
    a.*,
    MJAISkill_SkillID.[Name] AS [Skill],
    MJAction_ActionID.[Name] AS [Action]
FROM
    [${flyway:defaultSchema}].[AISkillAction] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AISkill] AS MJAISkill_SkillID
  ON
    [a].[SkillID] = MJAISkill_SkillID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS MJAction_ActionID
  ON
    [a].[ActionID] = MJAction_ActionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkillActions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Skill Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Actions
-- Item: Permissions for vwAISkillActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkillActions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Skill Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Actions
-- Item: spCreateAISkillAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AISkillAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAISkillAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAISkillAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAISkillAction]
    @ID uniqueidentifier = NULL,
    @SkillID uniqueidentifier,
    @ActionID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AISkillAction]
            (
                [ID],
                [SkillID],
                [ActionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SkillID,
                @ActionID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AISkillAction]
            (
                [SkillID],
                [ActionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SkillID,
                @ActionID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAISkillActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkillAction] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Skill Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkillAction] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Skill Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Actions
-- Item: spUpdateAISkillAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AISkillAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAISkillAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkillAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkillAction]
    @ID uniqueidentifier,
    @SkillID uniqueidentifier = NULL,
    @ActionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkillAction]
    SET
        [SkillID] = ISNULL(@SkillID, [SkillID]),
        [ActionID] = ISNULL(@ActionID, [ActionID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAISkillActions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAISkillActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkillAction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkillAction table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAISkillAction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAISkillAction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAISkillAction
ON [${flyway:defaultSchema}].[AISkillAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkillAction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AISkillAction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Skill Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkillAction] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Skill Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Actions
-- Item: spDeleteAISkillAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AISkillAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAISkillAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkillAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkillAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AISkillAction]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkillAction] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Skill Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkillAction] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: AI Skill Sub Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Sub Agents
-- Item: vwAISkillSubAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skill Sub Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AISkillSubAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAISkillSubAgents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAISkillSubAgents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAISkillSubAgents]
AS
SELECT
    a.*,
    MJAISkill_SkillID.[Name] AS [Skill],
    MJAIAgent_SubAgentID.[Name] AS [SubAgent]
FROM
    [${flyway:defaultSchema}].[AISkillSubAgent] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AISkill] AS MJAISkill_SkillID
  ON
    [a].[SkillID] = MJAISkill_SkillID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_SubAgentID
  ON
    [a].[SubAgentID] = MJAIAgent_SubAgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkillSubAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Skill Sub Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Sub Agents
-- Item: Permissions for vwAISkillSubAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkillSubAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Skill Sub Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Sub Agents
-- Item: spCreateAISkillSubAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AISkillSubAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAISkillSubAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAISkillSubAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAISkillSubAgent]
    @ID uniqueidentifier = NULL,
    @SkillID uniqueidentifier,
    @SubAgentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AISkillSubAgent]
            (
                [ID],
                [SkillID],
                [SubAgentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SkillID,
                @SubAgentID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AISkillSubAgent]
            (
                [SkillID],
                [SubAgentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SkillID,
                @SubAgentID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAISkillSubAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkillSubAgent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Skill Sub Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkillSubAgent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Skill Sub Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Sub Agents
-- Item: spUpdateAISkillSubAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AISkillSubAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAISkillSubAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkillSubAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkillSubAgent]
    @ID uniqueidentifier,
    @SkillID uniqueidentifier = NULL,
    @SubAgentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkillSubAgent]
    SET
        [SkillID] = ISNULL(@SkillID, [SkillID]),
        [SubAgentID] = ISNULL(@SubAgentID, [SubAgentID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAISkillSubAgents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAISkillSubAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkillSubAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkillSubAgent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAISkillSubAgent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAISkillSubAgent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAISkillSubAgent
ON [${flyway:defaultSchema}].[AISkillSubAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkillSubAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AISkillSubAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Skill Sub Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkillSubAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Skill Sub Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Sub Agents
-- Item: spDeleteAISkillSubAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AISkillSubAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAISkillSubAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkillSubAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkillSubAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AISkillSubAgent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkillSubAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Skill Sub Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkillSubAgent] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: AI Skill Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Permissions
-- Item: vwAISkillPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skill Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AISkillPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAISkillPermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAISkillPermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAISkillPermissions]
AS
SELECT
    a.*,
    MJAISkill_SkillID.[Name] AS [Skill],
    MJRole_RoleID.[Name] AS [Role],
    MJUser_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[AISkillPermission] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AISkill] AS MJAISkill_SkillID
  ON
    [a].[SkillID] = MJAISkill_SkillID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [a].[RoleID] = MJRole_RoleID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkillPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Skill Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Permissions
-- Item: Permissions for vwAISkillPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAISkillPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Skill Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Permissions
-- Item: spCreateAISkillPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AISkillPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAISkillPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAISkillPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAISkillPermission]
    @ID uniqueidentifier = NULL,
    @SkillID uniqueidentifier,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @CanView bit = NULL,
    @CanRun bit = NULL,
    @CanEdit bit = NULL,
    @CanDelete bit = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AISkillPermission]
            (
                [ID],
                [SkillID],
                [RoleID],
                [UserID],
                [CanView],
                [CanRun],
                [CanEdit],
                [CanDelete],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SkillID,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                ISNULL(@CanView, 0),
                ISNULL(@CanRun, 0),
                ISNULL(@CanEdit, 0),
                ISNULL(@CanDelete, 0),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AISkillPermission]
            (
                [SkillID],
                [RoleID],
                [UserID],
                [CanView],
                [CanRun],
                [CanEdit],
                [CanDelete],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SkillID,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                ISNULL(@CanView, 0),
                ISNULL(@CanRun, 0),
                ISNULL(@CanEdit, 0),
                ISNULL(@CanDelete, 0),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAISkillPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkillPermission] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Skill Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkillPermission] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Skill Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Permissions
-- Item: spUpdateAISkillPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AISkillPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAISkillPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkillPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAISkillPermission]
    @ID uniqueidentifier,
    @SkillID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @CanView bit = NULL,
    @CanRun bit = NULL,
    @CanEdit bit = NULL,
    @CanDelete bit = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkillPermission]
    SET
        [SkillID] = ISNULL(@SkillID, [SkillID]),
        [RoleID] = CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, [RoleID]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [CanView] = ISNULL(@CanView, [CanView]),
        [CanRun] = ISNULL(@CanRun, [CanRun]),
        [CanEdit] = ISNULL(@CanEdit, [CanEdit]),
        [CanDelete] = ISNULL(@CanDelete, [CanDelete]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAISkillPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAISkillPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkillPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkillPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAISkillPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAISkillPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAISkillPermission
ON [${flyway:defaultSchema}].[AISkillPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AISkillPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AISkillPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Skill Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAISkillPermission] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Skill Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Skill Permissions
-- Item: spDeleteAISkillPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AISkillPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAISkillPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkillPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAISkillPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AISkillPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkillPermission] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Skill Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkillPermission] TO [cdp_Developer], [cdp_Integration];

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

/* SQL text to update entity field related entity name field map for entity field ID A807D7C3-7083-42E5-BAF7-62EECA9C8813 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A807D7C3-7083-42E5-BAF7-62EECA9C8813', @RelatedEntityNameFieldMap='CreatedByUser';

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
    @CreatedByUserID uniqueidentifier
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
                [CreatedByUserID]
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
                @CreatedByUserID
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
                [CreatedByUserID]
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
                @CreatedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAISkills] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAISkill] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Skills */

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
    @CreatedByUserID uniqueidentifier = NULL
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
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID])
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkill] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Skills */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAISkill] TO [cdp_Developer], [cdp_Integration];

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
    
    -- Cascade delete from ScheduledAction using cursor to call spDeleteScheduledAction
    DECLARE @MJScheduledActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJScheduledActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScheduledAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJScheduledActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJScheduledActions_ActionID_cursor INTO @MJScheduledActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScheduledAction] @ID = @MJScheduledActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJScheduledActions_ActionID_cursor INTO @MJScheduledActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJScheduledActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJScheduledActions_ActionID_cursor
    

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration], [cdp_Developer];

/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ParentID ON [${flyway:defaultSchema}].[AIAgent] ([ParentID]);

-- Index for foreign key ContextCompressionPromptID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID ON [${flyway:defaultSchema}].[AIAgent] ([ContextCompressionPromptID]);

-- Index for foreign key TypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_TypeID ON [${flyway:defaultSchema}].[AIAgent] ([TypeID]);

-- Index for foreign key DefaultArtifactTypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID ON [${flyway:defaultSchema}].[AIAgent] ([DefaultArtifactTypeID]);

-- Index for foreign key OwnerUserID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID ON [${flyway:defaultSchema}].[AIAgent] ([OwnerUserID]);

-- Index for foreign key AttachmentStorageProviderID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID ON [${flyway:defaultSchema}].[AIAgent] ([AttachmentStorageProviderID]);

-- Index for foreign key CategoryID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_CategoryID ON [${flyway:defaultSchema}].[AIAgent] ([CategoryID]);

-- Index for foreign key DefaultStorageAccountID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_DefaultStorageAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_DefaultStorageAccountID ON [${flyway:defaultSchema}].[AIAgent] ([DefaultStorageAccountID]);

-- Index for foreign key DefaultCoAgentID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_DefaultCoAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_DefaultCoAgentID ON [${flyway:defaultSchema}].[AIAgent] ([DefaultCoAgentID]);

-- Index for foreign key RecordingStorageProviderID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_RecordingStorageProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_RecordingStorageProviderID ON [${flyway:defaultSchema}].[AIAgent] ([RecordingStorageProviderID]);

-- Index for foreign key DefaultMediaCollectionID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_DefaultMediaCollectionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_DefaultMediaCollectionID ON [${flyway:defaultSchema}].[AIAgent] ([DefaultMediaCollectionID]);

/* Root ID Function SQL for MJ: AI Agents.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: fnAIAgentParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgent].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgent]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgent] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Root ID Function SQL for MJ: AI Agents.DefaultCoAgentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: fnAIAgentDefaultCoAgentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgent].[DefaultCoAgentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentDefaultCoAgentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentDefaultCoAgentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentDefaultCoAgentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [DefaultCoAgentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgent]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[DefaultCoAgentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgent] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[DefaultCoAgentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [DefaultCoAgentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    MJAIAgent_ParentID.[Name] AS [Parent],
    MJAIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    MJAIAgentType_TypeID.[Name] AS [Type],
    MJArtifactType_DefaultArtifactTypeID.[Name] AS [DefaultArtifactType],
    MJUser_OwnerUserID.[Name] AS [OwnerUser],
    MJFileStorageProvider_AttachmentStorageProviderID.[Name] AS [AttachmentStorageProvider],
    MJAIAgentCategory_CategoryID.[Name] AS [Category],
    MJFileStorageAccount_DefaultStorageAccountID.[Name] AS [DefaultStorageAccount],
    MJAIAgent_DefaultCoAgentID.[Name] AS [DefaultCoAgent],
    MJFileStorageProvider_RecordingStorageProviderID.[Name] AS [RecordingStorageProvider],
    MJCollection_DefaultMediaCollectionID.[Name] AS [DefaultMediaCollection],
    root_ParentID.RootID AS [RootParentID],
    root_DefaultCoAgentID.RootID AS [RootDefaultCoAgentID]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_ParentID
  ON
    [a].[ParentID] = MJAIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = MJAIPrompt_ContextCompressionPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentType] AS MJAIAgentType_TypeID
  ON
    [a].[TypeID] = MJAIAgentType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS MJArtifactType_DefaultArtifactTypeID
  ON
    [a].[DefaultArtifactTypeID] = MJArtifactType_DefaultArtifactTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_OwnerUserID
  ON
    [a].[OwnerUserID] = MJUser_OwnerUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    [a].[AttachmentStorageProviderID] = MJFileStorageProvider_AttachmentStorageProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentCategory] AS MJAIAgentCategory_CategoryID
  ON
    [a].[CategoryID] = MJAIAgentCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageAccount] AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    [a].[DefaultStorageAccountID] = MJFileStorageAccount_DefaultStorageAccountID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_DefaultCoAgentID
  ON
    [a].[DefaultCoAgentID] = MJAIAgent_DefaultCoAgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_RecordingStorageProviderID
  ON
    [a].[RecordingStorageProviderID] = MJFileStorageProvider_RecordingStorageProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Collection] AS MJCollection_DefaultMediaCollectionID
  ON
    [a].[DefaultMediaCollectionID] = MJCollection_DefaultMediaCollectionID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentDefaultCoAgentID_GetRootID]([a].[ID], [a].[DefaultCoAgentID]) AS root_DefaultCoAgentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @ID uniqueidentifier = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @LogoURL_Clear bit = 0,
    @LogoURL nvarchar(255) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @ExposeAsAction bit = NULL,
    @ExecutionOrder int = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @EnableContextCompression bit = NULL,
    @ContextCompressionMessageThreshold_Clear bit = 0,
    @ContextCompressionMessageThreshold int = NULL,
    @ContextCompressionPromptID_Clear bit = 0,
    @ContextCompressionPromptID uniqueidentifier = NULL,
    @ContextCompressionMessageRetentionCount_Clear bit = 0,
    @ContextCompressionMessageRetentionCount int = NULL,
    @TypeID_Clear bit = 0,
    @TypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @ModelSelectionMode nvarchar(50) = NULL,
    @PayloadDownstreamPaths nvarchar(MAX) = NULL,
    @PayloadUpstreamPaths nvarchar(MAX) = NULL,
    @PayloadSelfReadPaths_Clear bit = 0,
    @PayloadSelfReadPaths nvarchar(MAX) = NULL,
    @PayloadSelfWritePaths_Clear bit = 0,
    @PayloadSelfWritePaths nvarchar(MAX) = NULL,
    @PayloadScope_Clear bit = 0,
    @PayloadScope nvarchar(MAX) = NULL,
    @FinalPayloadValidation_Clear bit = 0,
    @FinalPayloadValidation nvarchar(MAX) = NULL,
    @FinalPayloadValidationMode nvarchar(25) = NULL,
    @FinalPayloadValidationMaxRetries int = NULL,
    @MaxCostPerRun_Clear bit = 0,
    @MaxCostPerRun decimal(10, 4) = NULL,
    @MaxTokensPerRun_Clear bit = 0,
    @MaxTokensPerRun int = NULL,
    @MaxIterationsPerRun_Clear bit = 0,
    @MaxIterationsPerRun int = NULL,
    @MaxTimePerRun_Clear bit = 0,
    @MaxTimePerRun int = NULL,
    @MinExecutionsPerRun_Clear bit = 0,
    @MinExecutionsPerRun int = NULL,
    @MaxExecutionsPerRun_Clear bit = 0,
    @MaxExecutionsPerRun int = NULL,
    @StartingPayloadValidation_Clear bit = 0,
    @StartingPayloadValidation nvarchar(MAX) = NULL,
    @StartingPayloadValidationMode nvarchar(25) = NULL,
    @DefaultPromptEffortLevel_Clear bit = 0,
    @DefaultPromptEffortLevel int = NULL,
    @ChatHandlingOption_Clear bit = 0,
    @ChatHandlingOption nvarchar(30) = NULL,
    @DefaultArtifactTypeID_Clear bit = 0,
    @DefaultArtifactTypeID uniqueidentifier = NULL,
    @OwnerUserID uniqueidentifier = NULL,
    @InvocationMode nvarchar(20) = NULL,
    @ArtifactCreationMode nvarchar(20) = NULL,
    @FunctionalRequirements_Clear bit = 0,
    @FunctionalRequirements nvarchar(MAX) = NULL,
    @TechnicalDesign_Clear bit = 0,
    @TechnicalDesign nvarchar(MAX) = NULL,
    @InjectNotes bit = NULL,
    @MaxNotesToInject int = NULL,
    @NoteInjectionStrategy nvarchar(20) = NULL,
    @InjectExamples bit = NULL,
    @MaxExamplesToInject int = NULL,
    @ExampleInjectionStrategy nvarchar(20) = NULL,
    @IsRestricted bit = NULL,
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages_Clear bit = 0,
    @MaxMessages int = NULL,
    @AttachmentStorageProviderID_Clear bit = 0,
    @AttachmentStorageProviderID uniqueidentifier = NULL,
    @AttachmentRootPath_Clear bit = 0,
    @AttachmentRootPath nvarchar(500) = NULL,
    @InlineStorageThresholdBytes_Clear bit = 0,
    @InlineStorageThresholdBytes int = NULL,
    @AgentTypePromptParams_Clear bit = 0,
    @AgentTypePromptParams nvarchar(MAX) = NULL,
    @ScopeConfig_Clear bit = 0,
    @ScopeConfig nvarchar(MAX) = NULL,
    @NoteRetentionDays_Clear bit = 0,
    @NoteRetentionDays int = NULL,
    @ExampleRetentionDays_Clear bit = 0,
    @ExampleRetentionDays int = NULL,
    @AutoArchiveEnabled bit = NULL,
    @RerankerConfiguration_Clear bit = 0,
    @RerankerConfiguration nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @AllowEphemeralClientTools bit = NULL,
    @DefaultStorageAccountID_Clear bit = 0,
    @DefaultStorageAccountID uniqueidentifier = NULL,
    @SearchScopeAccess nvarchar(20) = NULL,
    @AcceptUnregisteredFiles bit = NULL,
    @DefaultCoAgentID_Clear bit = 0,
    @DefaultCoAgentID uniqueidentifier = NULL,
    @TypeConfiguration_Clear bit = 0,
    @TypeConfiguration nvarchar(MAX) = NULL,
    @AllowMemoryWrite bit = NULL,
    @RecordingDefault_Clear bit = 0,
    @RecordingDefault nvarchar(20) = NULL,
    @RecordingStorageProviderID_Clear bit = 0,
    @RecordingStorageProviderID uniqueidentifier = NULL,
    @DefaultMediaCollectionID_Clear bit = 0,
    @DefaultMediaCollectionID uniqueidentifier = NULL,
    @SupportsPlanMode bit = NULL,
    @AcceptsSkills nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [ID],
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes],
                [AgentTypePromptParams],
                [ScopeConfig],
                [NoteRetentionDays],
                [ExampleRetentionDays],
                [AutoArchiveEnabled],
                [RerankerConfiguration],
                [CategoryID],
                [AllowEphemeralClientTools],
                [DefaultStorageAccountID],
                [SearchScopeAccess],
                [AcceptUnregisteredFiles],
                [DefaultCoAgentID],
                [TypeConfiguration],
                [AllowMemoryWrite],
                [RecordingDefault],
                [RecordingStorageProviderID],
                [DefaultMediaCollectionID],
                [SupportsPlanMode],
                [AcceptsSkills]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                CASE WHEN @ContextCompressionMessageThreshold_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageThreshold, NULL) END,
                CASE WHEN @ContextCompressionPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionPromptID, NULL) END,
                CASE WHEN @ContextCompressionMessageRetentionCount_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageRetentionCount, NULL) END,
                CASE WHEN @TypeID_Clear = 1 THEN NULL ELSE ISNULL(@TypeID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                CASE WHEN @PayloadSelfReadPaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfReadPaths, NULL) END,
                CASE WHEN @PayloadSelfWritePaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfWritePaths, NULL) END,
                CASE WHEN @PayloadScope_Clear = 1 THEN NULL ELSE ISNULL(@PayloadScope, NULL) END,
                CASE WHEN @FinalPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidation, NULL) END,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                CASE WHEN @MaxCostPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxCostPerRun, NULL) END,
                CASE WHEN @MaxTokensPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTokensPerRun, NULL) END,
                CASE WHEN @MaxIterationsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxIterationsPerRun, NULL) END,
                CASE WHEN @MaxTimePerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTimePerRun, NULL) END,
                CASE WHEN @MinExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MinExecutionsPerRun, NULL) END,
                CASE WHEN @MaxExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxExecutionsPerRun, NULL) END,
                CASE WHEN @StartingPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayloadValidation, NULL) END,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                CASE WHEN @DefaultPromptEffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPromptEffortLevel, NULL) END,
                CASE WHEN @ChatHandlingOption_Clear = 1 THEN NULL ELSE ISNULL(@ChatHandlingOption, NULL) END,
                CASE WHEN @DefaultArtifactTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultArtifactTypeID, NULL) END,
                CASE WHEN @OwnerUserID = '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, NULL) END,
                CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, NULL) END,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                CASE WHEN @MaxMessages_Clear = 1 THEN NULL ELSE ISNULL(@MaxMessages, NULL) END,
                CASE WHEN @AttachmentStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentStorageProviderID, NULL) END,
                CASE WHEN @AttachmentRootPath_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentRootPath, NULL) END,
                CASE WHEN @InlineStorageThresholdBytes_Clear = 1 THEN NULL ELSE ISNULL(@InlineStorageThresholdBytes, NULL) END,
                CASE WHEN @AgentTypePromptParams_Clear = 1 THEN NULL ELSE ISNULL(@AgentTypePromptParams, NULL) END,
                CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, NULL) END,
                CASE WHEN @NoteRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@NoteRetentionDays, 90) END,
                CASE WHEN @ExampleRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@ExampleRetentionDays, 180) END,
                ISNULL(@AutoArchiveEnabled, 1),
                CASE WHEN @RerankerConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@RerankerConfiguration, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                ISNULL(@AllowEphemeralClientTools, 1),
                CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, NULL) END,
                ISNULL(@SearchScopeAccess, 'None'),
                ISNULL(@AcceptUnregisteredFiles, 0),
                CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, NULL) END,
                CASE WHEN @TypeConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@TypeConfiguration, NULL) END,
                ISNULL(@AllowMemoryWrite, 1),
                CASE WHEN @RecordingDefault_Clear = 1 THEN NULL ELSE ISNULL(@RecordingDefault, NULL) END,
                CASE WHEN @RecordingStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStorageProviderID, NULL) END,
                CASE WHEN @DefaultMediaCollectionID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultMediaCollectionID, NULL) END,
                ISNULL(@SupportsPlanMode, 1),
                ISNULL(@AcceptsSkills, 'None')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes],
                [AgentTypePromptParams],
                [ScopeConfig],
                [NoteRetentionDays],
                [ExampleRetentionDays],
                [AutoArchiveEnabled],
                [RerankerConfiguration],
                [CategoryID],
                [AllowEphemeralClientTools],
                [DefaultStorageAccountID],
                [SearchScopeAccess],
                [AcceptUnregisteredFiles],
                [DefaultCoAgentID],
                [TypeConfiguration],
                [AllowMemoryWrite],
                [RecordingDefault],
                [RecordingStorageProviderID],
                [DefaultMediaCollectionID],
                [SupportsPlanMode],
                [AcceptsSkills]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                CASE WHEN @ContextCompressionMessageThreshold_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageThreshold, NULL) END,
                CASE WHEN @ContextCompressionPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionPromptID, NULL) END,
                CASE WHEN @ContextCompressionMessageRetentionCount_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageRetentionCount, NULL) END,
                CASE WHEN @TypeID_Clear = 1 THEN NULL ELSE ISNULL(@TypeID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                CASE WHEN @PayloadSelfReadPaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfReadPaths, NULL) END,
                CASE WHEN @PayloadSelfWritePaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfWritePaths, NULL) END,
                CASE WHEN @PayloadScope_Clear = 1 THEN NULL ELSE ISNULL(@PayloadScope, NULL) END,
                CASE WHEN @FinalPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidation, NULL) END,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                CASE WHEN @MaxCostPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxCostPerRun, NULL) END,
                CASE WHEN @MaxTokensPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTokensPerRun, NULL) END,
                CASE WHEN @MaxIterationsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxIterationsPerRun, NULL) END,
                CASE WHEN @MaxTimePerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTimePerRun, NULL) END,
                CASE WHEN @MinExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MinExecutionsPerRun, NULL) END,
                CASE WHEN @MaxExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxExecutionsPerRun, NULL) END,
                CASE WHEN @StartingPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayloadValidation, NULL) END,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                CASE WHEN @DefaultPromptEffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPromptEffortLevel, NULL) END,
                CASE WHEN @ChatHandlingOption_Clear = 1 THEN NULL ELSE ISNULL(@ChatHandlingOption, NULL) END,
                CASE WHEN @DefaultArtifactTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultArtifactTypeID, NULL) END,
                CASE WHEN @OwnerUserID = '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, NULL) END,
                CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, NULL) END,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                CASE WHEN @MaxMessages_Clear = 1 THEN NULL ELSE ISNULL(@MaxMessages, NULL) END,
                CASE WHEN @AttachmentStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentStorageProviderID, NULL) END,
                CASE WHEN @AttachmentRootPath_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentRootPath, NULL) END,
                CASE WHEN @InlineStorageThresholdBytes_Clear = 1 THEN NULL ELSE ISNULL(@InlineStorageThresholdBytes, NULL) END,
                CASE WHEN @AgentTypePromptParams_Clear = 1 THEN NULL ELSE ISNULL(@AgentTypePromptParams, NULL) END,
                CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, NULL) END,
                CASE WHEN @NoteRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@NoteRetentionDays, 90) END,
                CASE WHEN @ExampleRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@ExampleRetentionDays, 180) END,
                ISNULL(@AutoArchiveEnabled, 1),
                CASE WHEN @RerankerConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@RerankerConfiguration, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                ISNULL(@AllowEphemeralClientTools, 1),
                CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, NULL) END,
                ISNULL(@SearchScopeAccess, 'None'),
                ISNULL(@AcceptUnregisteredFiles, 0),
                CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, NULL) END,
                CASE WHEN @TypeConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@TypeConfiguration, NULL) END,
                ISNULL(@AllowMemoryWrite, 1),
                CASE WHEN @RecordingDefault_Clear = 1 THEN NULL ELSE ISNULL(@RecordingDefault, NULL) END,
                CASE WHEN @RecordingStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStorageProviderID, NULL) END,
                CASE WHEN @DefaultMediaCollectionID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultMediaCollectionID, NULL) END,
                ISNULL(@SupportsPlanMode, 1),
                ISNULL(@AcceptsSkills, 'None')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @LogoURL_Clear bit = 0,
    @LogoURL nvarchar(255) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @ExposeAsAction bit = NULL,
    @ExecutionOrder int = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @EnableContextCompression bit = NULL,
    @ContextCompressionMessageThreshold_Clear bit = 0,
    @ContextCompressionMessageThreshold int = NULL,
    @ContextCompressionPromptID_Clear bit = 0,
    @ContextCompressionPromptID uniqueidentifier = NULL,
    @ContextCompressionMessageRetentionCount_Clear bit = 0,
    @ContextCompressionMessageRetentionCount int = NULL,
    @TypeID_Clear bit = 0,
    @TypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @ModelSelectionMode nvarchar(50) = NULL,
    @PayloadDownstreamPaths nvarchar(MAX) = NULL,
    @PayloadUpstreamPaths nvarchar(MAX) = NULL,
    @PayloadSelfReadPaths_Clear bit = 0,
    @PayloadSelfReadPaths nvarchar(MAX) = NULL,
    @PayloadSelfWritePaths_Clear bit = 0,
    @PayloadSelfWritePaths nvarchar(MAX) = NULL,
    @PayloadScope_Clear bit = 0,
    @PayloadScope nvarchar(MAX) = NULL,
    @FinalPayloadValidation_Clear bit = 0,
    @FinalPayloadValidation nvarchar(MAX) = NULL,
    @FinalPayloadValidationMode nvarchar(25) = NULL,
    @FinalPayloadValidationMaxRetries int = NULL,
    @MaxCostPerRun_Clear bit = 0,
    @MaxCostPerRun decimal(10, 4) = NULL,
    @MaxTokensPerRun_Clear bit = 0,
    @MaxTokensPerRun int = NULL,
    @MaxIterationsPerRun_Clear bit = 0,
    @MaxIterationsPerRun int = NULL,
    @MaxTimePerRun_Clear bit = 0,
    @MaxTimePerRun int = NULL,
    @MinExecutionsPerRun_Clear bit = 0,
    @MinExecutionsPerRun int = NULL,
    @MaxExecutionsPerRun_Clear bit = 0,
    @MaxExecutionsPerRun int = NULL,
    @StartingPayloadValidation_Clear bit = 0,
    @StartingPayloadValidation nvarchar(MAX) = NULL,
    @StartingPayloadValidationMode nvarchar(25) = NULL,
    @DefaultPromptEffortLevel_Clear bit = 0,
    @DefaultPromptEffortLevel int = NULL,
    @ChatHandlingOption_Clear bit = 0,
    @ChatHandlingOption nvarchar(30) = NULL,
    @DefaultArtifactTypeID_Clear bit = 0,
    @DefaultArtifactTypeID uniqueidentifier = NULL,
    @OwnerUserID uniqueidentifier = NULL,
    @InvocationMode nvarchar(20) = NULL,
    @ArtifactCreationMode nvarchar(20) = NULL,
    @FunctionalRequirements_Clear bit = 0,
    @FunctionalRequirements nvarchar(MAX) = NULL,
    @TechnicalDesign_Clear bit = 0,
    @TechnicalDesign nvarchar(MAX) = NULL,
    @InjectNotes bit = NULL,
    @MaxNotesToInject int = NULL,
    @NoteInjectionStrategy nvarchar(20) = NULL,
    @InjectExamples bit = NULL,
    @MaxExamplesToInject int = NULL,
    @ExampleInjectionStrategy nvarchar(20) = NULL,
    @IsRestricted bit = NULL,
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages_Clear bit = 0,
    @MaxMessages int = NULL,
    @AttachmentStorageProviderID_Clear bit = 0,
    @AttachmentStorageProviderID uniqueidentifier = NULL,
    @AttachmentRootPath_Clear bit = 0,
    @AttachmentRootPath nvarchar(500) = NULL,
    @InlineStorageThresholdBytes_Clear bit = 0,
    @InlineStorageThresholdBytes int = NULL,
    @AgentTypePromptParams_Clear bit = 0,
    @AgentTypePromptParams nvarchar(MAX) = NULL,
    @ScopeConfig_Clear bit = 0,
    @ScopeConfig nvarchar(MAX) = NULL,
    @NoteRetentionDays_Clear bit = 0,
    @NoteRetentionDays int = NULL,
    @ExampleRetentionDays_Clear bit = 0,
    @ExampleRetentionDays int = NULL,
    @AutoArchiveEnabled bit = NULL,
    @RerankerConfiguration_Clear bit = 0,
    @RerankerConfiguration nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @AllowEphemeralClientTools bit = NULL,
    @DefaultStorageAccountID_Clear bit = 0,
    @DefaultStorageAccountID uniqueidentifier = NULL,
    @SearchScopeAccess nvarchar(20) = NULL,
    @AcceptUnregisteredFiles bit = NULL,
    @DefaultCoAgentID_Clear bit = 0,
    @DefaultCoAgentID uniqueidentifier = NULL,
    @TypeConfiguration_Clear bit = 0,
    @TypeConfiguration nvarchar(MAX) = NULL,
    @AllowMemoryWrite bit = NULL,
    @RecordingDefault_Clear bit = 0,
    @RecordingDefault nvarchar(20) = NULL,
    @RecordingStorageProviderID_Clear bit = 0,
    @RecordingStorageProviderID uniqueidentifier = NULL,
    @DefaultMediaCollectionID_Clear bit = 0,
    @DefaultMediaCollectionID uniqueidentifier = NULL,
    @SupportsPlanMode bit = NULL,
    @AcceptsSkills nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [LogoURL] = CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, [LogoURL]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [ExposeAsAction] = ISNULL(@ExposeAsAction, [ExposeAsAction]),
        [ExecutionOrder] = ISNULL(@ExecutionOrder, [ExecutionOrder]),
        [ExecutionMode] = ISNULL(@ExecutionMode, [ExecutionMode]),
        [EnableContextCompression] = ISNULL(@EnableContextCompression, [EnableContextCompression]),
        [ContextCompressionMessageThreshold] = CASE WHEN @ContextCompressionMessageThreshold_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageThreshold, [ContextCompressionMessageThreshold]) END,
        [ContextCompressionPromptID] = CASE WHEN @ContextCompressionPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionPromptID, [ContextCompressionPromptID]) END,
        [ContextCompressionMessageRetentionCount] = CASE WHEN @ContextCompressionMessageRetentionCount_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageRetentionCount, [ContextCompressionMessageRetentionCount]) END,
        [TypeID] = CASE WHEN @TypeID_Clear = 1 THEN NULL ELSE ISNULL(@TypeID, [TypeID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [IconClass] = CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, [IconClass]) END,
        [ModelSelectionMode] = ISNULL(@ModelSelectionMode, [ModelSelectionMode]),
        [PayloadDownstreamPaths] = ISNULL(@PayloadDownstreamPaths, [PayloadDownstreamPaths]),
        [PayloadUpstreamPaths] = ISNULL(@PayloadUpstreamPaths, [PayloadUpstreamPaths]),
        [PayloadSelfReadPaths] = CASE WHEN @PayloadSelfReadPaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfReadPaths, [PayloadSelfReadPaths]) END,
        [PayloadSelfWritePaths] = CASE WHEN @PayloadSelfWritePaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfWritePaths, [PayloadSelfWritePaths]) END,
        [PayloadScope] = CASE WHEN @PayloadScope_Clear = 1 THEN NULL ELSE ISNULL(@PayloadScope, [PayloadScope]) END,
        [FinalPayloadValidation] = CASE WHEN @FinalPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidation, [FinalPayloadValidation]) END,
        [FinalPayloadValidationMode] = ISNULL(@FinalPayloadValidationMode, [FinalPayloadValidationMode]),
        [FinalPayloadValidationMaxRetries] = ISNULL(@FinalPayloadValidationMaxRetries, [FinalPayloadValidationMaxRetries]),
        [MaxCostPerRun] = CASE WHEN @MaxCostPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxCostPerRun, [MaxCostPerRun]) END,
        [MaxTokensPerRun] = CASE WHEN @MaxTokensPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTokensPerRun, [MaxTokensPerRun]) END,
        [MaxIterationsPerRun] = CASE WHEN @MaxIterationsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxIterationsPerRun, [MaxIterationsPerRun]) END,
        [MaxTimePerRun] = CASE WHEN @MaxTimePerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTimePerRun, [MaxTimePerRun]) END,
        [MinExecutionsPerRun] = CASE WHEN @MinExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MinExecutionsPerRun, [MinExecutionsPerRun]) END,
        [MaxExecutionsPerRun] = CASE WHEN @MaxExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxExecutionsPerRun, [MaxExecutionsPerRun]) END,
        [StartingPayloadValidation] = CASE WHEN @StartingPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayloadValidation, [StartingPayloadValidation]) END,
        [StartingPayloadValidationMode] = ISNULL(@StartingPayloadValidationMode, [StartingPayloadValidationMode]),
        [DefaultPromptEffortLevel] = CASE WHEN @DefaultPromptEffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPromptEffortLevel, [DefaultPromptEffortLevel]) END,
        [ChatHandlingOption] = CASE WHEN @ChatHandlingOption_Clear = 1 THEN NULL ELSE ISNULL(@ChatHandlingOption, [ChatHandlingOption]) END,
        [DefaultArtifactTypeID] = CASE WHEN @DefaultArtifactTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultArtifactTypeID, [DefaultArtifactTypeID]) END,
        [OwnerUserID] = ISNULL(@OwnerUserID, [OwnerUserID]),
        [InvocationMode] = ISNULL(@InvocationMode, [InvocationMode]),
        [ArtifactCreationMode] = ISNULL(@ArtifactCreationMode, [ArtifactCreationMode]),
        [FunctionalRequirements] = CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, [FunctionalRequirements]) END,
        [TechnicalDesign] = CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, [TechnicalDesign]) END,
        [InjectNotes] = ISNULL(@InjectNotes, [InjectNotes]),
        [MaxNotesToInject] = ISNULL(@MaxNotesToInject, [MaxNotesToInject]),
        [NoteInjectionStrategy] = ISNULL(@NoteInjectionStrategy, [NoteInjectionStrategy]),
        [InjectExamples] = ISNULL(@InjectExamples, [InjectExamples]),
        [MaxExamplesToInject] = ISNULL(@MaxExamplesToInject, [MaxExamplesToInject]),
        [ExampleInjectionStrategy] = ISNULL(@ExampleInjectionStrategy, [ExampleInjectionStrategy]),
        [IsRestricted] = ISNULL(@IsRestricted, [IsRestricted]),
        [MessageMode] = ISNULL(@MessageMode, [MessageMode]),
        [MaxMessages] = CASE WHEN @MaxMessages_Clear = 1 THEN NULL ELSE ISNULL(@MaxMessages, [MaxMessages]) END,
        [AttachmentStorageProviderID] = CASE WHEN @AttachmentStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentStorageProviderID, [AttachmentStorageProviderID]) END,
        [AttachmentRootPath] = CASE WHEN @AttachmentRootPath_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentRootPath, [AttachmentRootPath]) END,
        [InlineStorageThresholdBytes] = CASE WHEN @InlineStorageThresholdBytes_Clear = 1 THEN NULL ELSE ISNULL(@InlineStorageThresholdBytes, [InlineStorageThresholdBytes]) END,
        [AgentTypePromptParams] = CASE WHEN @AgentTypePromptParams_Clear = 1 THEN NULL ELSE ISNULL(@AgentTypePromptParams, [AgentTypePromptParams]) END,
        [ScopeConfig] = CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, [ScopeConfig]) END,
        [NoteRetentionDays] = CASE WHEN @NoteRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@NoteRetentionDays, [NoteRetentionDays]) END,
        [ExampleRetentionDays] = CASE WHEN @ExampleRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@ExampleRetentionDays, [ExampleRetentionDays]) END,
        [AutoArchiveEnabled] = ISNULL(@AutoArchiveEnabled, [AutoArchiveEnabled]),
        [RerankerConfiguration] = CASE WHEN @RerankerConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@RerankerConfiguration, [RerankerConfiguration]) END,
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [AllowEphemeralClientTools] = ISNULL(@AllowEphemeralClientTools, [AllowEphemeralClientTools]),
        [DefaultStorageAccountID] = CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, [DefaultStorageAccountID]) END,
        [SearchScopeAccess] = ISNULL(@SearchScopeAccess, [SearchScopeAccess]),
        [AcceptUnregisteredFiles] = ISNULL(@AcceptUnregisteredFiles, [AcceptUnregisteredFiles]),
        [DefaultCoAgentID] = CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, [DefaultCoAgentID]) END,
        [TypeConfiguration] = CASE WHEN @TypeConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@TypeConfiguration, [TypeConfiguration]) END,
        [AllowMemoryWrite] = ISNULL(@AllowMemoryWrite, [AllowMemoryWrite]),
        [RecordingDefault] = CASE WHEN @RecordingDefault_Clear = 1 THEN NULL ELSE ISNULL(@RecordingDefault, [RecordingDefault]) END,
        [RecordingStorageProviderID] = CASE WHEN @RecordingStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStorageProviderID, [RecordingStorageProviderID]) END,
        [DefaultMediaCollectionID] = CASE WHEN @DefaultMediaCollectionID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultMediaCollectionID, [DefaultMediaCollectionID]) END,
        [SupportsPlanMode] = ISNULL(@SupportsPlanMode, [SupportsPlanMode]),
        [AcceptsSkills] = ISNULL(@AcceptsSkills, [AcceptsSkills])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_CreatedByAgentIDID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CategoryID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Name nvarchar(425)
    DECLARE @MJActions_CreatedByAgentID_Description nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Type nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_UserComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Code nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_CreatedByAgentID_CodeLocked bit
    DECLARE @MJActions_CreatedByAgentID_ForceCodeGeneration bit
    DECLARE @MJActions_CreatedByAgentID_RetentionPeriod int
    DECLARE @MJActions_CreatedByAgentID_Status nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_DriverClass nvarchar(255)
    DECLARE @MJActions_CreatedByAgentID_ParentID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_IconClass nvarchar(100)
    DECLARE @MJActions_CreatedByAgentID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Config nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_MaxExecutionTimeMS int
    DECLARE @MJActions_CreatedByAgentID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_CreatedByAgentID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [CreatedByAgentID] = @ID

    OPEN cascade_update_MJActions_CreatedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_CreatedByAgentID_CreatedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_CreatedByAgentIDID, @CategoryID = @MJActions_CreatedByAgentID_CategoryID, @Name = @MJActions_CreatedByAgentID_Name, @Description = @MJActions_CreatedByAgentID_Description, @Type = @MJActions_CreatedByAgentID_Type, @UserPrompt = @MJActions_CreatedByAgentID_UserPrompt, @UserComments = @MJActions_CreatedByAgentID_UserComments, @Code = @MJActions_CreatedByAgentID_Code, @CodeComments = @MJActions_CreatedByAgentID_CodeComments, @CodeApprovalStatus = @MJActions_CreatedByAgentID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_CreatedByAgentID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_CreatedByAgentID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_CreatedByAgentID_CodeApprovedAt, @CodeLocked = @MJActions_CreatedByAgentID_CodeLocked, @ForceCodeGeneration = @MJActions_CreatedByAgentID_ForceCodeGeneration, @RetentionPeriod = @MJActions_CreatedByAgentID_RetentionPeriod, @Status = @MJActions_CreatedByAgentID_Status, @DriverClass = @MJActions_CreatedByAgentID_DriverClass, @ParentID = @MJActions_CreatedByAgentID_ParentID, @IconClass = @MJActions_CreatedByAgentID_IconClass, @DefaultCompactPromptID = @MJActions_CreatedByAgentID_DefaultCompactPromptID, @Config = @MJActions_CreatedByAgentID_Config, @RuntimeActionConfiguration = @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @CreatedByAgentID_Clear = 1, @CreatedByAgentID = @MJActions_CreatedByAgentID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_CreatedByAgentID_cursor
    DEALLOCATE cascade_update_MJActions_CreatedByAgentID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_AgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactLength int
    DECLARE @MJAIAgentActions_AgentID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentActions_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentActions_AgentID_AgentID, @ActionID = @MJAIAgentActions_AgentID_ActionID, @Status = @MJAIAgentActions_AgentID_Status, @MinExecutionsPerRun = @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_AgentID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_AgentID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_AgentID_CompactMode, @CompactLength = @MJAIAgentActions_AgentID_CompactLength, @CompactPromptID = @MJAIAgentActions_AgentID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_AgentID_cursor
    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType
    DECLARE @MJAIAgentArtifactTypes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentArtifactType]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] @ID = @MJAIAgentArtifactTypes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool
    DECLARE @MJAIAgentClientTools_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentClientTools_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentClientTool]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentClientTools_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentClientTool] @ID = @MJAIAgentClientTools_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    
    -- Cascade delete from AIAgentCoAgent using cursor to call spDeleteAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_CoAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [CoAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCoAgent] @ID = @MJAIAgentCoAgents_CoAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    
    -- Cascade update on AIAgentCoAgent using cursor to call spUpdateAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_TargetAgentIDID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_CoAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Type nvarchar(30)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_IsDefault bit
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Sequence int
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor CURSOR FOR
        SELECT [ID], [CoAgentID], [TargetAgentID], [TargetAgentTypeID], [Type], [IsDefault], [Sequence], [Status], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [TargetAgentID] = @ID

    OPEN cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentCoAgents_TargetAgentID_TargetAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentCoAgent] @ID = @MJAIAgentCoAgents_TargetAgentIDID, @CoAgentID = @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @TargetAgentID_Clear = 1, @TargetAgentID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @TargetAgentTypeID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @Type = @MJAIAgentCoAgents_TargetAgentID_Type, @IsDefault = @MJAIAgentCoAgents_TargetAgentID_IsDefault, @Sequence = @MJAIAgentCoAgents_TargetAgentID_Sequence, @Status = @MJAIAgentCoAgents_TargetAgentID_Status, @Configuration = @MJAIAgentCoAgents_TargetAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentConfigurations_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource
    DECLARE @MJAIAgentDataSources_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentDataSources_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentDataSource]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentDataSources_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] @ID = @MJAIAgentDataSources_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample
    DECLARE @MJAIAgentExamples_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentExamples_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentExamples_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentExample] @ID = @MJAIAgentExamples_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentExamples_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentExamples_AgentID_cursor
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle
    DECLARE @MJAIAgentLearningCycles_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentLearningCycle]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] @ID = @MJAIAgentLearningCycles_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality
    DECLARE @MJAIAgentModalities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentModalities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentModality]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentModalities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentModality] @ID = @MJAIAgentModalities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentModalities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentModalities_AgentID_cursor
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel
    DECLARE @MJAIAgentModels_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_Active bit
    DECLARE @MJAIAgentModels_AgentID_Priority int
    DECLARE cascade_update_MJAIAgentModels_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ModelID], [Active], [Priority]
        FROM [${flyway:defaultSchema}].[AIAgentModel]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentModels_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentModels_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentModel] @ID = @MJAIAgentModels_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentModels_AgentID_AgentID, @ModelID = @MJAIAgentModels_AgentID_ModelID, @Active = @MJAIAgentModels_AgentID_Active, @Priority = @MJAIAgentModels_AgentID_Priority

        FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority
    END

    CLOSE cascade_update_MJAIAgentModels_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentModels_AgentID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_AgentID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_AccessCount int
    DECLARE @MJAIAgentNotes_AgentID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_AgentID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_AgentID_AuthorType nvarchar(20)
    DECLARE cascade_update_MJAIAgentNotes_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentNotes_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentNotes_AgentID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_AgentID_AgentNoteTypeID, @Note = @MJAIAgentNotes_AgentID_Note, @UserID = @MJAIAgentNotes_AgentID_UserID, @Type = @MJAIAgentNotes_AgentID_Type, @IsAutoGenerated = @MJAIAgentNotes_AgentID_IsAutoGenerated, @Comments = @MJAIAgentNotes_AgentID_Comments, @Status = @MJAIAgentNotes_AgentID_Status, @SourceConversationID = @MJAIAgentNotes_AgentID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_AgentID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_AgentID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_AgentID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_AgentID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_AgentID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_AgentID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_AgentID_AccessCount, @ExpiresAt = @MJAIAgentNotes_AgentID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_AgentID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_AgentID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_AgentID_ImportanceScore, @AuthorType = @MJAIAgentNotes_AgentID_AuthorType

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType
    END

    CLOSE cascade_update_MJAIAgentNotes_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_AgentID_cursor
    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission
    DECLARE @MJAIAgentPermissions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPermissions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPermission]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPermissions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPermission] @ID = @MJAIAgentPermissions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest
    DECLARE @MJAIAgentRequests_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRequests_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRequests_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRequest] @ID = @MJAIAgentRequests_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRequests_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRequests_AgentID_cursor
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun
    DECLARE @MJAIAgentRuns_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRuns_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRuns_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRun] @ID = @MJAIAgentRuns_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRuns_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRuns_AgentID_cursor
    
    -- Cascade delete from AIAgentSearchScope using cursor to call spDeleteAIAgentSearchScope
    DECLARE @MJAIAgentSearchScopes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSearchScope]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope] @ID = @MJAIAgentSearchScopes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    
    -- Cascade delete from AIAgentSession using cursor to call spDeleteAIAgentSession
    DECLARE @MJAIAgentSessions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSessions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSessions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSession] @ID = @MJAIAgentSessions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSessions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSessions_AgentID_cursor
    
    -- Cascade delete from AIAgentSkill using cursor to call spDeleteAIAgentSkill
    DECLARE @MJAIAgentSkills_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSkills_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSkill]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSkills_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSkill] @ID = @MJAIAgentSkills_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSkills_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSkills_AgentID_cursor
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep
    DECLARE @MJAIAgentSteps_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSteps_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSteps_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentStep] @ID = @MJAIAgentSteps_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSteps_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSteps_AgentID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_SubAgentIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_SubAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_StartingStep bit
    DECLARE @MJAIAgentSteps_SubAgentID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_SubAgentID_RetryCount int
    DECLARE @MJAIAgentSteps_SubAgentID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_PositionX int
    DECLARE @MJAIAgentSteps_SubAgentID_PositionY int
    DECLARE @MJAIAgentSteps_SubAgentID_Width int
    DECLARE @MJAIAgentSteps_SubAgentID_Height int
    DECLARE @MJAIAgentSteps_SubAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_SubAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_SubAgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [SubAgentID] = @ID

    OPEN cascade_update_MJAIAgentSteps_SubAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_SubAgentID_SubAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_SubAgentIDID, @AgentID = @MJAIAgentSteps_SubAgentID_AgentID, @Name = @MJAIAgentSteps_SubAgentID_Name, @Description = @MJAIAgentSteps_SubAgentID_Description, @StepType = @MJAIAgentSteps_SubAgentID_StepType, @StartingStep = @MJAIAgentSteps_SubAgentID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_SubAgentID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_SubAgentID_ActionID, @SubAgentID_Clear = 1, @SubAgentID = @MJAIAgentSteps_SubAgentID_SubAgentID, @PromptID = @MJAIAgentSteps_SubAgentID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_SubAgentID_PositionX, @PositionY = @MJAIAgentSteps_SubAgentID_PositionY, @Width = @MJAIAgentSteps_SubAgentID_Width, @Height = @MJAIAgentSteps_SubAgentID_Height, @Status = @MJAIAgentSteps_SubAgentID_Status, @ActionInputMapping = @MJAIAgentSteps_SubAgentID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_SubAgentID_LoopBodyType, @Configuration = @MJAIAgentSteps_SubAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ParentIDID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Name nvarchar(255)
    DECLARE @MJAIAgents_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ExposeAsAction bit
    DECLARE @MJAIAgents_ParentID_ExecutionOrder int
    DECLARE @MJAIAgents_ParentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_EnableContextCompression bit
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ParentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ParentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Status nvarchar(20)
    DECLARE @MJAIAgents_ParentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ParentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ParentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ParentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ParentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ParentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxTimePerRun int
    DECLARE @MJAIAgents_ParentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ParentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ParentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_InjectNotes bit
    DECLARE @MJAIAgents_ParentID_MaxNotesToInject int
    DECLARE @MJAIAgents_ParentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_InjectExamples bit
    DECLARE @MJAIAgents_ParentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ParentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_IsRestricted bit
    DECLARE @MJAIAgents_ParentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_MaxMessages int
    DECLARE @MJAIAgents_ParentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ParentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ParentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_NoteRetentionDays int
    DECLARE @MJAIAgents_ParentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ParentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ParentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ParentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ParentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ParentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ParentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ParentID_AcceptsSkills nvarchar(20)
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ParentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ParentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ParentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ParentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ParentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ParentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ParentID_AcceptsSkills

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills
    END

    CLOSE cascade_update_MJAIAgents_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ParentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_DefaultCoAgentIDID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Name nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ExposeAsAction bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionOrder int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_EnableContextCompression bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Status nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_DefaultCoAgentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTimePerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_DefaultCoAgentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectNotes bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxNotesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectExamples bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_IsRestricted bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxMessages int
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptsSkills nvarchar(20)
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_DefaultCoAgentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_DefaultCoAgentID_AcceptsSkills

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills
    END

    CLOSE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    
    -- Cascade delete from AIBridgeAgentIdentity using cursor to call spDeleteAIBridgeAgentIdentity
    DECLARE @MJAIBridgeAgentIdentities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] @ID = @MJAIBridgeAgentIdentities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_Success bit
    DECLARE @MJAIPromptRuns_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopK int
    DECLARE @MJAIPromptRuns_AgentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_Seed int
    DECLARE @MJAIPromptRuns_AgentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_AgentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_AgentRunID, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentIDID, @PromptID = @MJAIPromptRuns_AgentID_PromptID, @ModelID = @MJAIPromptRuns_AgentID_ModelID, @VendorID = @MJAIPromptRuns_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIPromptRuns_AgentID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentID_Messages, @Result = @MJAIPromptRuns_AgentID_Result, @TokensUsed = @MJAIPromptRuns_AgentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentID_TotalCost, @Success = @MJAIPromptRuns_AgentID_Success, @ErrorMessage = @MJAIPromptRuns_AgentID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentID_ParentID, @RunType = @MJAIPromptRuns_AgentID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_AgentID_AgentRunID, @Cost = @MJAIPromptRuns_AgentID_Cost, @CostCurrency = @MJAIPromptRuns_AgentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentID_Temperature, @TopP = @MJAIPromptRuns_AgentID_TopP, @TopK = @MJAIPromptRuns_AgentID_TopK, @MinP = @MJAIPromptRuns_AgentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentID_Seed, @StopSequences = @MJAIPromptRuns_AgentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentID_ModelSelection, @Status = @MJAIPromptRuns_AgentID_Status, @Cancelled = @MJAIPromptRuns_AgentID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentID_EffortLevel, @RunName = @MJAIPromptRuns_AgentID_RunName, @Comments = @MJAIPromptRuns_AgentID_Comments, @TestRunID = @MJAIPromptRuns_AgentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_AgentRunID, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_AgentIDID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_AgentID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_Status nvarchar(50)
    DECLARE @MJAIResultCache_AgentID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_AgentID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_AgentID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIResultCache_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_AgentIDID, @AIPromptID = @MJAIResultCache_AgentID_AIPromptID, @AIModelID = @MJAIResultCache_AgentID_AIModelID, @RunAt = @MJAIResultCache_AgentID_RunAt, @PromptText = @MJAIResultCache_AgentID_PromptText, @ResultText = @MJAIResultCache_AgentID_ResultText, @Status = @MJAIResultCache_AgentID_Status, @ExpiredOn = @MJAIResultCache_AgentID_ExpiredOn, @VendorID = @MJAIResultCache_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIResultCache_AgentID_AgentID, @ConfigurationID = @MJAIResultCache_AgentID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_AgentID_PromptEmbedding, @PromptRunID = @MJAIResultCache_AgentID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_AgentID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_AgentID_cursor
    
    -- Cascade delete from AISkillSubAgent using cursor to call spDeleteAISkillSubAgent
    DECLARE @MJAISkillSubAgents_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AISkillSubAgent]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAISkillSubAgent] @ID = @MJAISkillSubAgents_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_AgentIDID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_AgentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_HiddenToUser bit
    DECLARE @MJConversationDetails_AgentID_UserRating int
    DECLARE @MJConversationDetails_AgentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_CompletionTime bigint
    DECLARE @MJConversationDetails_AgentID_IsPinned bit
    DECLARE @MJConversationDetails_AgentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_AgentID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_AgentID_UtteranceStartMs int
    DECLARE @MJConversationDetails_AgentID_UtteranceEndMs int
    DECLARE @MJConversationDetails_AgentID_MediaType nvarchar(20)
    DECLARE cascade_update_MJConversationDetails_AgentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJConversationDetails_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_AgentIDID, @ConversationID = @MJConversationDetails_AgentID_ConversationID, @ExternalID = @MJConversationDetails_AgentID_ExternalID, @Role = @MJConversationDetails_AgentID_Role, @Message = @MJConversationDetails_AgentID_Message, @Error = @MJConversationDetails_AgentID_Error, @HiddenToUser = @MJConversationDetails_AgentID_HiddenToUser, @UserRating = @MJConversationDetails_AgentID_UserRating, @UserFeedback = @MJConversationDetails_AgentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_AgentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_AgentID_UserID, @ArtifactID = @MJConversationDetails_AgentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_AgentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_AgentID_CompletionTime, @IsPinned = @MJConversationDetails_AgentID_IsPinned, @ParentID = @MJConversationDetails_AgentID_ParentID, @AgentID_Clear = 1, @AgentID = @MJConversationDetails_AgentID_AgentID, @Status = @MJConversationDetails_AgentID_Status, @SuggestedResponses = @MJConversationDetails_AgentID_SuggestedResponses, @TestRunID = @MJConversationDetails_AgentID_TestRunID, @ResponseForm = @MJConversationDetails_AgentID_ResponseForm, @ActionableCommands = @MJConversationDetails_AgentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_AgentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_AgentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_AgentID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_AgentID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_AgentID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_AgentID_UtteranceEndMs, @MediaType = @MJConversationDetails_AgentID_MediaType

        FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType
    END

    CLOSE cascade_update_MJConversationDetails_AgentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_AgentID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_DefaultAgentIDID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_UserID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ExternalID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_Name nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_Description nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_Type nvarchar(50)
    DECLARE @MJConversations_DefaultAgentID_IsArchived bit
    DECLARE @MJConversations_DefaultAgentID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_DataContextID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_Status nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ProjectID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_IsPinned bit
    DECLARE @MJConversations_DefaultAgentID_TestRunID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_EgressID nvarchar(255)
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @Type = @MJConversations_DefaultAgentID_Type, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData, @RecordingFileID = @MJConversations_DefaultAgentID_RecordingFileID, @EgressID = @MJConversations_DefaultAgentID_EgressID

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID
    END

    CLOSE cascade_update_MJConversations_DefaultAgentID_cursor
    DEALLOCATE cascade_update_MJConversations_DefaultAgentID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningAgentIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningAgentID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningAgentIDID, @Name = @MJEntityDocuments_ReasoningAgentID_Name, @TypeID = @MJEntityDocuments_ReasoningAgentID_TypeID, @EntityID = @MJEntityDocuments_ReasoningAgentID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningAgentID_Status, @TemplateID = @MJEntityDocuments_ReasoningAgentID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningAgentID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningAgentID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @ReasoningPromptID = @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @ReasoningAgentID_Clear = 1, @ReasoningAgentID = @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningAgentID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_AgentIDID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_AgentID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_AgentID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_AgentID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_AgentID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_AgentID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_AgentID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_AgentID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_AgentID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_BatchSize int
    DECLARE @MJRecordProcesses_AgentID_MaxConcurrency int
    DECLARE @MJRecordProcesses_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_AgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJRecordProcesses_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_AgentIDID, @Name = @MJRecordProcesses_AgentID_Name, @Description = @MJRecordProcesses_AgentID_Description, @CategoryID = @MJRecordProcesses_AgentID_CategoryID, @EntityID = @MJRecordProcesses_AgentID_EntityID, @Status = @MJRecordProcesses_AgentID_Status, @WorkType = @MJRecordProcesses_AgentID_WorkType, @ActionID = @MJRecordProcesses_AgentID_ActionID, @AgentID_Clear = 1, @AgentID = @MJRecordProcesses_AgentID_AgentID, @PromptID = @MJRecordProcesses_AgentID_PromptID, @ScopeType = @MJRecordProcesses_AgentID_ScopeType, @ScopeViewID = @MJRecordProcesses_AgentID_ScopeViewID, @ScopeListID = @MJRecordProcesses_AgentID_ScopeListID, @ScopeFilter = @MJRecordProcesses_AgentID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_AgentID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_AgentID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_AgentID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_AgentID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_AgentID_CronExpression, @Timezone = @MJRecordProcesses_AgentID_Timezone, @OnDemandEnabled = @MJRecordProcesses_AgentID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_AgentID_InputMapping, @OutputMapping = @MJRecordProcesses_AgentID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_AgentID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_AgentID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_AgentID_BatchSize, @MaxConcurrency = @MJRecordProcesses_AgentID_MaxConcurrency, @Configuration = @MJRecordProcesses_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_AgentID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_AgentID_cursor
    
    -- Cascade update on SearchExecutionLog using cursor to call spUpdateSearchExecutionLog
    DECLARE @MJSearchExecutionLogs_AIAgentIDID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_SearchScopeID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_UserID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_AIAgentID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_Query nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_TotalDurationMs int
    DECLARE @MJSearchExecutionLogs_AIAgentID_ResultCount int
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerName nvarchar(100)
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerCostCents decimal(10, 4)
    DECLARE @MJSearchExecutionLogs_AIAgentID_Status nvarchar(20)
    DECLARE @MJSearchExecutionLogs_AIAgentID_FailureReason nvarchar(500)
    DECLARE @MJSearchExecutionLogs_AIAgentID_ProvidersJSON nvarchar(MAX)
    DECLARE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor CURSOR FOR
        SELECT [ID], [SearchScopeID], [UserID], [AIAgentID], [Query], [TotalDurationMs], [ResultCount], [RerankerName], [RerankerCostCents], [Status], [FailureReason], [ProvidersJSON]
        FROM [${flyway:defaultSchema}].[SearchExecutionLog]
        WHERE [AIAgentID] = @ID

    OPEN cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJSearchExecutionLogs_AIAgentID_AIAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] @ID = @MJSearchExecutionLogs_AIAgentIDID, @SearchScopeID = @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @UserID = @MJSearchExecutionLogs_AIAgentID_UserID, @AIAgentID_Clear = 1, @AIAgentID = @MJSearchExecutionLogs_AIAgentID_AIAgentID, @Query = @MJSearchExecutionLogs_AIAgentID_Query, @TotalDurationMs = @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @ResultCount = @MJSearchExecutionLogs_AIAgentID_ResultCount, @RerankerName = @MJSearchExecutionLogs_AIAgentID_RerankerName, @RerankerCostCents = @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @Status = @MJSearchExecutionLogs_AIAgentID_Status, @FailureReason = @MJSearchExecutionLogs_AIAgentID_FailureReason, @ProvidersJSON = @MJSearchExecutionLogs_AIAgentID_ProvidersJSON

        FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON
    END

    CLOSE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    DEALLOCATE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentIDID uniqueidentifier
    DECLARE @MJTasks_AgentID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Name nvarchar(255)
    DECLARE @MJTasks_AgentID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Status nvarchar(50)
    DECLARE @MJTasks_AgentID_PercentComplete int
    DECLARE @MJTasks_AgentID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentID_CompletedAt datetimeoffset
    DECLARE cascade_update_MJTasks_AgentID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJTasks_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentIDID, @ParentID = @MJTasks_AgentID_ParentID, @Name = @MJTasks_AgentID_Name, @Description = @MJTasks_AgentID_Description, @TypeID = @MJTasks_AgentID_TypeID, @EnvironmentID = @MJTasks_AgentID_EnvironmentID, @ProjectID = @MJTasks_AgentID_ProjectID, @ConversationDetailID = @MJTasks_AgentID_ConversationDetailID, @UserID = @MJTasks_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJTasks_AgentID_AgentID, @Status = @MJTasks_AgentID_Status, @PercentComplete = @MJTasks_AgentID_PercentComplete, @DueAt = @MJTasks_AgentID_DueAt, @StartedAt = @MJTasks_AgentID_StartedAt, @CompletedAt = @MJTasks_AgentID_CompletedAt

        FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt
    END

    CLOSE cascade_update_MJTasks_AgentID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_DefaultCompactPromptIDID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CategoryID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Name nvarchar(425)
    DECLARE @MJActions_DefaultCompactPromptID_Description nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Type nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_UserComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Code nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_DefaultCompactPromptID_CodeLocked bit
    DECLARE @MJActions_DefaultCompactPromptID_ForceCodeGeneration bit
    DECLARE @MJActions_DefaultCompactPromptID_RetentionPeriod int
    DECLARE @MJActions_DefaultCompactPromptID_Status nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_DriverClass nvarchar(255)
    DECLARE @MJActions_DefaultCompactPromptID_ParentID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_IconClass nvarchar(100)
    DECLARE @MJActions_DefaultCompactPromptID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Config nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS int
    DECLARE @MJActions_DefaultCompactPromptID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_DefaultCompactPromptID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [DefaultCompactPromptID] = @ID

    OPEN cascade_update_MJActions_DefaultCompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_DefaultCompactPromptID_DefaultCompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_DefaultCompactPromptIDID, @CategoryID = @MJActions_DefaultCompactPromptID_CategoryID, @Name = @MJActions_DefaultCompactPromptID_Name, @Description = @MJActions_DefaultCompactPromptID_Description, @Type = @MJActions_DefaultCompactPromptID_Type, @UserPrompt = @MJActions_DefaultCompactPromptID_UserPrompt, @UserComments = @MJActions_DefaultCompactPromptID_UserComments, @Code = @MJActions_DefaultCompactPromptID_Code, @CodeComments = @MJActions_DefaultCompactPromptID_CodeComments, @CodeApprovalStatus = @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_DefaultCompactPromptID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_DefaultCompactPromptID_CodeApprovedAt, @CodeLocked = @MJActions_DefaultCompactPromptID_CodeLocked, @ForceCodeGeneration = @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @RetentionPeriod = @MJActions_DefaultCompactPromptID_RetentionPeriod, @Status = @MJActions_DefaultCompactPromptID_Status, @DriverClass = @MJActions_DefaultCompactPromptID_DriverClass, @ParentID = @MJActions_DefaultCompactPromptID_ParentID, @IconClass = @MJActions_DefaultCompactPromptID_IconClass, @DefaultCompactPromptID_Clear = 1, @DefaultCompactPromptID = @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @Config = @MJActions_DefaultCompactPromptID_Config, @RuntimeActionConfiguration = @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @CreatedByAgentID = @MJActions_DefaultCompactPromptID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_DefaultCompactPromptID_cursor
    DEALLOCATE cascade_update_MJActions_DefaultCompactPromptID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_CompactPromptIDID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactLength int
    DECLARE @MJAIAgentActions_CompactPromptID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_CompactPromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [CompactPromptID] = @ID

    OPEN cascade_update_MJAIAgentActions_CompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_CompactPromptID_CompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_CompactPromptIDID, @AgentID = @MJAIAgentActions_CompactPromptID_AgentID, @ActionID = @MJAIAgentActions_CompactPromptID_ActionID, @Status = @MJAIAgentActions_CompactPromptID_Status, @MinExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_CompactPromptID_CompactMode, @CompactLength = @MJAIAgentActions_CompactPromptID_CompactLength, @CompactPromptID_Clear = 1, @CompactPromptID = @MJAIAgentActions_CompactPromptID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_PromptIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_PromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_StartingStep bit
    DECLARE @MJAIAgentSteps_PromptID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_PromptID_RetryCount int
    DECLARE @MJAIAgentSteps_PromptID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_PositionX int
    DECLARE @MJAIAgentSteps_PromptID_PositionY int
    DECLARE @MJAIAgentSteps_PromptID_Width int
    DECLARE @MJAIAgentSteps_PromptID_Height int
    DECLARE @MJAIAgentSteps_PromptID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_PromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJAIAgentSteps_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_PromptIDID, @AgentID = @MJAIAgentSteps_PromptID_AgentID, @Name = @MJAIAgentSteps_PromptID_Name, @Description = @MJAIAgentSteps_PromptID_Description, @StepType = @MJAIAgentSteps_PromptID_StepType, @StartingStep = @MJAIAgentSteps_PromptID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_PromptID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_PromptID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_PromptID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_PromptID_ActionID, @SubAgentID = @MJAIAgentSteps_PromptID_SubAgentID, @PromptID_Clear = 1, @PromptID = @MJAIAgentSteps_PromptID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_PromptID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_PromptID_PositionX, @PositionY = @MJAIAgentSteps_PromptID_PositionY, @Width = @MJAIAgentSteps_PromptID_Width, @Height = @MJAIAgentSteps_PromptID_Height, @Status = @MJAIAgentSteps_PromptID_Status, @ActionInputMapping = @MJAIAgentSteps_PromptID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_PromptID_LoopBodyType, @Configuration = @MJAIAgentSteps_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_PromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_PromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_SystemPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_SystemPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_SystemPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentTypes_SystemPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [SystemPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_SystemPromptID_SystemPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_SystemPromptIDID, @Name = @MJAIAgentTypes_SystemPromptID_Name, @Description = @MJAIAgentTypes_SystemPromptID_Description, @SystemPromptID_Clear = 1, @SystemPromptID = @MJAIAgentTypes_SystemPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_SystemPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_SystemPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_SystemPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_SystemPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_SystemPromptID_DefaultConfiguration

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration
    END

    CLOSE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxMessages int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptsSkills nvarchar(20)
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ContextCompressionPromptID_AcceptsSkills

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills
    END

    CLOSE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextCompressionID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @Name = @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @DefaultPromptForContextCompressionID_Clear = 1, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextSummarizationID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @Name = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID_Clear = 1, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_PromptID_cursor
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun
    DECLARE @MJAIPromptRuns_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRuns_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptRuns_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRun] @ID = @MJAIPromptRuns_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRuns_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRuns_PromptID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_JudgeIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_JudgeID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsed int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPrompt int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletion int
    DECLARE @MJAIPromptRuns_JudgeID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_Success bit
    DECLARE @MJAIPromptRuns_JudgeID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_JudgeID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_JudgeID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopK int
    DECLARE @MJAIPromptRuns_JudgeID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_Seed int
    DECLARE @MJAIPromptRuns_JudgeID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_LogProbs bit
    DECLARE @MJAIPromptRuns_JudgeID_TopLogProbs int
    DECLARE @MJAIPromptRuns_JudgeID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_JudgeID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_JudgeID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_JudgeID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_JudgeID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_JudgeID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_Cancelled bit
    DECLARE @MJAIPromptRuns_JudgeID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_JudgeID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_CacheHit bit
    DECLARE @MJAIPromptRuns_JudgeID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_JudgeID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_JudgeID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_JudgeID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_JudgeID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_QueueTime int
    DECLARE @MJAIPromptRuns_JudgeID_PromptTime int
    DECLARE @MJAIPromptRuns_JudgeID_CompletionTime int
    DECLARE @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_EffortLevel int
    DECLARE @MJAIPromptRuns_JudgeID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_JudgeID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [JudgeID] = @ID

    OPEN cascade_update_MJAIPromptRuns_JudgeID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_AgentRunID, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_JudgeID_JudgeID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_JudgeIDID, @PromptID = @MJAIPromptRuns_JudgeID_PromptID, @ModelID = @MJAIPromptRuns_JudgeID_ModelID, @VendorID = @MJAIPromptRuns_JudgeID_VendorID, @AgentID = @MJAIPromptRuns_JudgeID_AgentID, @ConfigurationID = @MJAIPromptRuns_JudgeID_ConfigurationID, @RunAt = @MJAIPromptRuns_JudgeID_RunAt, @CompletedAt = @MJAIPromptRuns_JudgeID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_JudgeID_Messages, @Result = @MJAIPromptRuns_JudgeID_Result, @TokensUsed = @MJAIPromptRuns_JudgeID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_JudgeID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_JudgeID_TokensCompletion, @TotalCost = @MJAIPromptRuns_JudgeID_TotalCost, @Success = @MJAIPromptRuns_JudgeID_Success, @ErrorMessage = @MJAIPromptRuns_JudgeID_ErrorMessage, @ParentID = @MJAIPromptRuns_JudgeID_ParentID, @RunType = @MJAIPromptRuns_JudgeID_RunType, @ExecutionOrder = @MJAIPromptRuns_JudgeID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_JudgeID_AgentRunID, @Cost = @MJAIPromptRuns_JudgeID_Cost, @CostCurrency = @MJAIPromptRuns_JudgeID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_JudgeID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_JudgeID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_JudgeID_Temperature, @TopP = @MJAIPromptRuns_JudgeID_TopP, @TopK = @MJAIPromptRuns_JudgeID_TopK, @MinP = @MJAIPromptRuns_JudgeID_MinP, @FrequencyPenalty = @MJAIPromptRuns_JudgeID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_JudgeID_PresencePenalty, @Seed = @MJAIPromptRuns_JudgeID_Seed, @StopSequences = @MJAIPromptRuns_JudgeID_StopSequences, @ResponseFormat = @MJAIPromptRuns_JudgeID_ResponseFormat, @LogProbs = @MJAIPromptRuns_JudgeID_LogProbs, @TopLogProbs = @MJAIPromptRuns_JudgeID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_JudgeID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_JudgeID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_JudgeID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_JudgeID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_JudgeID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_JudgeID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_JudgeID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_JudgeID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_JudgeID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_JudgeID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_JudgeID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_JudgeID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_JudgeID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_JudgeID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_JudgeID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_JudgeID_ModelSelection, @Status = @MJAIPromptRuns_JudgeID_Status, @Cancelled = @MJAIPromptRuns_JudgeID_Cancelled, @CancellationReason = @MJAIPromptRuns_JudgeID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_JudgeID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_JudgeID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_JudgeID_CacheHit, @CacheKey = @MJAIPromptRuns_JudgeID_CacheKey, @JudgeID_Clear = 1, @JudgeID = @MJAIPromptRuns_JudgeID_JudgeID, @JudgeScore = @MJAIPromptRuns_JudgeID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_JudgeID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_JudgeID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_JudgeID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_JudgeID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_JudgeID_ChildPromptID, @QueueTime = @MJAIPromptRuns_JudgeID_QueueTime, @PromptTime = @MJAIPromptRuns_JudgeID_PromptTime, @CompletionTime = @MJAIPromptRuns_JudgeID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_JudgeID_EffortLevel, @RunName = @MJAIPromptRuns_JudgeID_RunName, @Comments = @MJAIPromptRuns_JudgeID_Comments, @TestRunID = @MJAIPromptRuns_JudgeID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_JudgeID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_JudgeID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_JudgeID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_AgentRunID, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_JudgeID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_JudgeID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ChildPromptIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsed int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_Success bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopK int
    DECLARE @MJAIPromptRuns_ChildPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_Seed int
    DECLARE @MJAIPromptRuns_ChildPromptID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_LogProbs bit
    DECLARE @MJAIPromptRuns_ChildPromptID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ChildPromptID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_Cancelled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ChildPromptID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheHit bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ChildPromptID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ChildPromptID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_QueueTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletionTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_EffortLevel int
    DECLARE @MJAIPromptRuns_ChildPromptID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_ChildPromptID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ChildPromptID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_AgentRunID, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ChildPromptID_ChildPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ChildPromptIDID, @PromptID = @MJAIPromptRuns_ChildPromptID_PromptID, @ModelID = @MJAIPromptRuns_ChildPromptID_ModelID, @VendorID = @MJAIPromptRuns_ChildPromptID_VendorID, @AgentID = @MJAIPromptRuns_ChildPromptID_AgentID, @ConfigurationID = @MJAIPromptRuns_ChildPromptID_ConfigurationID, @RunAt = @MJAIPromptRuns_ChildPromptID_RunAt, @CompletedAt = @MJAIPromptRuns_ChildPromptID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ChildPromptID_Messages, @Result = @MJAIPromptRuns_ChildPromptID_Result, @TokensUsed = @MJAIPromptRuns_ChildPromptID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ChildPromptID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ChildPromptID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ChildPromptID_TotalCost, @Success = @MJAIPromptRuns_ChildPromptID_Success, @ErrorMessage = @MJAIPromptRuns_ChildPromptID_ErrorMessage, @ParentID = @MJAIPromptRuns_ChildPromptID_ParentID, @RunType = @MJAIPromptRuns_ChildPromptID_RunType, @ExecutionOrder = @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ChildPromptID_AgentRunID, @Cost = @MJAIPromptRuns_ChildPromptID_Cost, @CostCurrency = @MJAIPromptRuns_ChildPromptID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ChildPromptID_Temperature, @TopP = @MJAIPromptRuns_ChildPromptID_TopP, @TopK = @MJAIPromptRuns_ChildPromptID_TopK, @MinP = @MJAIPromptRuns_ChildPromptID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ChildPromptID_PresencePenalty, @Seed = @MJAIPromptRuns_ChildPromptID_Seed, @StopSequences = @MJAIPromptRuns_ChildPromptID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ChildPromptID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ChildPromptID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ChildPromptID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ChildPromptID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ChildPromptID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ChildPromptID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ChildPromptID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ChildPromptID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ChildPromptID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ChildPromptID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ChildPromptID_ModelSelection, @Status = @MJAIPromptRuns_ChildPromptID_Status, @Cancelled = @MJAIPromptRuns_ChildPromptID_Cancelled, @CancellationReason = @MJAIPromptRuns_ChildPromptID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ChildPromptID_CacheHit, @CacheKey = @MJAIPromptRuns_ChildPromptID_CacheKey, @JudgeID = @MJAIPromptRuns_ChildPromptID_JudgeID, @JudgeScore = @MJAIPromptRuns_ChildPromptID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ChildPromptID_ErrorDetails, @ChildPromptID_Clear = 1, @ChildPromptID = @MJAIPromptRuns_ChildPromptID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ChildPromptID_QueueTime, @PromptTime = @MJAIPromptRuns_ChildPromptID_PromptTime, @CompletionTime = @MJAIPromptRuns_ChildPromptID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ChildPromptID_EffortLevel, @RunName = @MJAIPromptRuns_ChildPromptID_RunName, @Comments = @MJAIPromptRuns_ChildPromptID_Comments, @TestRunID = @MJAIPromptRuns_ChildPromptID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_AgentRunID, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt
    DECLARE @MJAIPrompts_ResultSelectorPromptIDID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Name nvarchar(255)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Description nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Status nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResponseFormat nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinPowerRank int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PowerPreference nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelCount int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam nvarchar(100)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputType nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputExample nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MaxRetries int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EnableCaching bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMatchType nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold float(53)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptRole nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptPosition nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopK int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Seed int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_StopSequences nvarchar(1000)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopLogProbs int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EffortLevel int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels bit
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel], [AssistantPrefill], [PrefillFallbackMode], [RequireSpecificModels]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID_Clear = 1, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @AssistantPrefill = @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @PrefillFallbackMode = @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @RequireSpecificModels = @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels
    END

    CLOSE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    DEALLOCATE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache
    DECLARE @MJAIResultCache_AIPromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIResultCache_AIPromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AIPromptID] = @ID
    
    OPEN cascade_delete_MJAIResultCache_AIPromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIResultCache] @ID = @MJAIResultCache_AIPromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    END
    
    CLOSE cascade_delete_MJAIResultCache_AIPromptID_cursor
    DEALLOCATE cascade_delete_MJAIResultCache_AIPromptID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningPromptIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningPromptID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningPromptIDID, @Name = @MJEntityDocuments_ReasoningPromptID_Name, @TypeID = @MJEntityDocuments_ReasoningPromptID_TypeID, @EntityID = @MJEntityDocuments_ReasoningPromptID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningPromptID_Status, @TemplateID = @MJEntityDocuments_ReasoningPromptID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningPromptID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningPromptID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @ReasoningPromptID_Clear = 1, @ReasoningPromptID = @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @ReasoningAgentID = @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningPromptID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_PromptIDID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_PromptID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_PromptID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_PromptID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_PromptID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_PromptID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_PromptID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_PromptID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_PromptID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_BatchSize int
    DECLARE @MJRecordProcesses_PromptID_MaxConcurrency int
    DECLARE @MJRecordProcesses_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_PromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJRecordProcesses_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_PromptIDID, @Name = @MJRecordProcesses_PromptID_Name, @Description = @MJRecordProcesses_PromptID_Description, @CategoryID = @MJRecordProcesses_PromptID_CategoryID, @EntityID = @MJRecordProcesses_PromptID_EntityID, @Status = @MJRecordProcesses_PromptID_Status, @WorkType = @MJRecordProcesses_PromptID_WorkType, @ActionID = @MJRecordProcesses_PromptID_ActionID, @AgentID = @MJRecordProcesses_PromptID_AgentID, @PromptID_Clear = 1, @PromptID = @MJRecordProcesses_PromptID_PromptID, @ScopeType = @MJRecordProcesses_PromptID_ScopeType, @ScopeViewID = @MJRecordProcesses_PromptID_ScopeViewID, @ScopeListID = @MJRecordProcesses_PromptID_ScopeListID, @ScopeFilter = @MJRecordProcesses_PromptID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_PromptID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_PromptID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_PromptID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_PromptID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_PromptID_CronExpression, @Timezone = @MJRecordProcesses_PromptID_Timezone, @OnDemandEnabled = @MJRecordProcesses_PromptID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_PromptID_InputMapping, @OutputMapping = @MJRecordProcesses_PromptID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_PromptID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_PromptID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_PromptID_BatchSize, @MaxConcurrency = @MJRecordProcesses_PromptID_MaxConcurrency, @Configuration = @MJRecordProcesses_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_PromptID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_PromptID_cursor
    
    -- Cascade delete from ScopedPromptPart using cursor to call spDeleteScopedPromptPart
    DECLARE @MJScopedPromptParts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJScopedPromptParts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScopedPromptPart]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJScopedPromptParts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScopedPromptPart] @ID = @MJScopedPromptParts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    END
    
    CLOSE cascade_delete_MJScopedPromptParts_PromptID_cursor
    DEALLOCATE cascade_delete_MJScopedPromptParts_PromptID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* spDelete Permissions for MJ: AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a631bb20-d464-46d5-aed7-afe0f8b0f5ea' OR (EntityID = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND Name = 'Skill')) BEGIN
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
            'a631bb20-d464-46d5-aed7-afe0f8b0f5ea',
            'AA4ADD02-7763-44CE-B07D-0CF74708749C', -- Entity: MJ: AI Skill Sub Agents
            100011,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3254762-6b08-431d-bb4c-2973859fb1ed' OR (EntityID = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND Name = 'SubAgent')) BEGIN
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
            'b3254762-6b08-431d-bb4c-2973859fb1ed',
            'AA4ADD02-7763-44CE-B07D-0CF74708749C', -- Entity: MJ: AI Skill Sub Agents
            100012,
            'SubAgent',
            'Sub Agent',
            NULL,
            'nvarchar',
            510,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9252d454-9cc5-4719-9604-a558224c4a4c' OR (EntityID = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND Name = 'CreatedByUser')) BEGIN
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
            '9252d454-9cc5-4719-9604-a558224c4a4c',
            '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', -- Entity: MJ: AI Skills
            100023,
            'CreatedByUser',
            'Created By User',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24e87322-7829-4951-9bc3-bbe9c72ce9e1' OR (EntityID = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND Name = 'Skill')) BEGIN
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
            '24e87322-7829-4951-9bc3-bbe9c72ce9e1',
            '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', -- Entity: MJ: AI Skill Actions
            100011,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '716ccfef-3b4d-4e12-8e75-6db96997a051' OR (EntityID = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND Name = 'Action')) BEGIN
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
            '716ccfef-3b4d-4e12-8e75-6db96997a051',
            '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', -- Entity: MJ: AI Skill Actions
            100012,
            'Action',
            'Action',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '33ab33c2-ac0f-430a-b189-4fa6cc2f7459' OR (EntityID = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND Name = 'Agent')) BEGIN
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
            '33ab33c2-ac0f-430a-b189-4fa6cc2f7459',
            '1F1EBDD5-84DA-4554-A029-87AFF327971D', -- Entity: MJ: AI Agent Skills
            100013,
            'Agent',
            'Agent',
            NULL,
            'nvarchar',
            510,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '28aee521-e7a0-42bb-8b5e-d0390523aff3' OR (EntityID = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND Name = 'Skill')) BEGIN
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
            '28aee521-e7a0-42bb-8b5e-d0390523aff3',
            '1F1EBDD5-84DA-4554-A029-87AFF327971D', -- Entity: MJ: AI Agent Skills
            100014,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1150580c-84a4-425e-8d9d-5d10cb9ed8c8' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'Skill')) BEGIN
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
            '1150580c-84a4-425e-8d9d-5d10cb9ed8c8',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100023,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd7ec9643-30aa-429d-a9b5-d8310a6e1d1e' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'Role')) BEGIN
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
            'd7ec9643-30aa-429d-a9b5-d8310a6e1d1e',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100024,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed9603db-5736-4d0c-93f6-e0386171822c' OR (EntityID = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND Name = 'User')) BEGIN
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
            'ed9603db-5736-4d0c-93f6-e0386171822c',
            '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', -- Entity: MJ: AI Skill Permissions
            100025,
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
               WHERE ID = 'FDCF5C8C-E402-497C-9DA8-5A47E6295937'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '33AB33C2-AC0F-430A-B189-4FA6CC2F7459'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '28AEE521-E7A0-42BB-8B5E-D0390523AFF3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FDCF5C8C-E402-497C-9DA8-5A47E6295937'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '33AB33C2-AC0F-430A-B189-4FA6CC2F7459'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '28AEE521-E7A0-42BB-8B5E-D0390523AFF3'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '33AB33C2-AC0F-430A-B189-4FA6CC2F7459'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '28AEE521-E7A0-42BB-8B5E-D0390523AFF3'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'FDCF5C8C-E402-497C-9DA8-5A47E6295937'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '24E87322-7829-4951-9BC3-BBE9C72CE9E1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '716CCFEF-3B4D-4E12-8E75-6DB96997A051'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '24E87322-7829-4951-9BC3-BBE9C72CE9E1'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '716CCFEF-3B4D-4E12-8E75-6DB96997A051'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '24E87322-7829-4951-9BC3-BBE9C72CE9E1'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6C692028-511D-4FE4-A475-590724775EB4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A631BB20-D464-46D5-AED7-AFE0F8B0F5EA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B3254762-6B08-431D-BB4C-2973859FB1ED'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A631BB20-D464-46D5-AED7-AFE0F8B0F5EA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B3254762-6B08-431D-BB4C-2973859FB1ED'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'A631BB20-D464-46D5-AED7-AFE0F8B0F5EA'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'B3254762-6B08-431D-BB4C-2973859FB1ED'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '360C60B6-7F6E-4659-A588-F7C293119143'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6E0AC00F-A853-4CE1-932C-1B1867EAE004'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C7205E95-20ED-4B5C-A809-74CBEC0E82F3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '05FF7C4A-FC59-41DF-A656-BF2A5CC4B112'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1150580C-84A4-425E-8D9D-5D10CB9ED8C8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D7EC9643-30AA-429D-A9B5-D8310A6E1D1E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'ED9603DB-5736-4D0C-93F6-E0386171822C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1150580C-84A4-425E-8D9D-5D10CB9ED8C8'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D7EC9643-30AA-429D-A9B5-D8310A6E1D1E'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'ED9603DB-5736-4D0C-93F6-E0386171822C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1150580C-84A4-425E-8D9D-5D10CB9ED8C8'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'ED9603DB-5736-4D0C-93F6-E0386171822C'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'D7EC9643-30AA-429D-A9B5-D8310A6E1D1E'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '58BCAF71-A955-473D-99E4-FA0997CFBE56'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '03BF582C-CBE4-4DE3-A5D9-F9B788E0D665'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9252D454-9CC5-4719-9604-A558224C4A4C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '03BF582C-CBE4-4DE3-A5D9-F9B788E0D665'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9252D454-9CC5-4719-9604-A558224C4A4C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'BF89FCCE-6D4D-4DD0-AC89-F7785BE11F27'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '03BF582C-CBE4-4DE3-A5D9-F9B788E0D665'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '9252D454-9CC5-4719-9604-A558224C4A4C'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Skills.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CFB281F4-03AC-41A2-B61A-32F39C6AD41B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Skills.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73AA9933-4307-43E6-8080-F5304D5D34BB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Skills.SkillID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Skill',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81FA8F23-39BA-4246-B583-DAAB08CBF4E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Skills.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FDCF5C8C-E402-497C-9DA8-5A47E6295937' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Skills.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '33AB33C2-AC0F-430A-B189-4FA6CC2F7459' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Skills.Skill 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Skill Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '28AEE521-E7A0-42BB-8B5E-D0390523AFF3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Skills.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8FCF2DD-1109-42F6-9C3B-04A998414C5F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Skills.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C4D2D43C-EE05-4F56-8636-68CFF6C74050' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1F1EBDD5-84DA-4554-A029-87AFF327971D';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('bc8ff518-0ccf-48ba-be40-dd79e2c21043', '1F1EBDD5-84DA-4554-A029-87AFF327971D', 'FieldCategoryInfo', '{"Assignment Details":{"icon":"fa fa-tasks","description":"Configuration and status of skills assigned to specific AI agents"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('bf4bd092-ce73-4363-99da-1aa695317379', '1F1EBDD5-84DA-4554-A029-87AFF327971D', 'FieldCategoryIcons', '{"Assignment Details":"fa fa-tasks","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '1F1EBDD5-84DA-4554-A029-87AFF327971D';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: AI Skills.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0738691-8E33-41FC-9E5B-EFAF4A13AB01' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Skill Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF89FCCE-6D4D-4DD0-AC89-F7785BE11F27' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Skill Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27EDDFE6-8E94-4F90-ABB3-BFD7029C3640' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.Instructions 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Skill Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '4EA0DE7B-5BF0-4F2A-A8C4-CC8AE1FE47A7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '58BCAF71-A955-473D-99E4-FA0997CFBE56' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '03BF582C-CBE4-4DE3-A5D9-F9B788E0D665' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.IconClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'UI Customization',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F38D266-56D2-49DE-9912-3C67A28413CC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.Color 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'UI Customization',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9CC2C1AD-8A1D-4DAB-BEA5-83845F7FEEC9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.CreatedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Audit',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A807D7C3-7083-42E5-BAF7-62EECA9C8813' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.CreatedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Audit',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9252D454-9CC5-4719-9604-A558224C4A4C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0021E00-68FF-4499-B029-D16440781316' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skills.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '86FF4D27-32D6-4E3D-9857-DA7DA9855289' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-wand-magic-sparkles */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-wand-magic-sparkles', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1bfb828d-b86f-4abe-b2ac-97c029722d35', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'FieldCategoryInfo', '{"Skill Definition":{"icon":"fa fa-book","description":"Core identity and behavioral instructions for the AI skill"},"Configuration":{"icon":"fa fa-cog","description":"Operational settings and classification for the skill"},"UI Customization":{"icon":"fa fa-palette","description":"Visual styling elements for the skill in the catalog"},"Ownership and Audit":{"icon":"fa fa-user-shield","description":"Information regarding skill ownership and authorship"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6d3ca558-12e1-4dc6-9f1e-14165d0417d7', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'FieldCategoryIcons', '{"Skill Definition":"fa fa-book","Configuration":"fa fa-cog","UI Customization":"fa fa-palette","Ownership and Audit":"fa fa-user-shield","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4';

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6F06BF51-578F-4879-AD6A-9EC786939BE7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.SkillID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Association',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '00059B09-D83B-44E4-8604-DC0102128FA1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.SubAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Sub-Agent ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7319E9CE-62D0-4DD4-99BD-E48FC866277F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.Skill 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Association',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A631BB20-D464-46D5-AED7-AFE0F8B0F5EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.SubAgent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Sub-Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3254762-6B08-431D-BB4C-2973859FB1ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EED49C3C-6EF3-4258-B38B-625B2DFB694F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C692028-511D-4FE4-A475-590724775EB4' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-network-wired */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-network-wired', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'AA4ADD02-7763-44CE-B07D-0CF74708749C';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('25e4112c-a1d6-41aa-9b4e-7352b9d828e5', 'AA4ADD02-7763-44CE-B07D-0CF74708749C', 'FieldCategoryInfo', '{"Agent Association":{"icon":"fa fa-link","description":"Associations linking primary AI Skills with their designated Sub-Agents"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('fe44b15b-cc79-4285-9759-4db8d95602f1', 'AA4ADD02-7763-44CE-B07D-0CF74708749C', 'FieldCategoryIcons', '{"Agent Association":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'AA4ADD02-7763-44CE-B07D-0CF74708749C';

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: AI Skill Actions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81AB537E-0D9F-4090-9B15-3B372100E402' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Actions.SkillID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Skill & Action Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39650EAE-013A-4E44-A315-0695C32DF61D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Actions.ActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Skill & Action Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A96BC379-F67F-475C-A272-5F847CE1F821' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Actions.Skill 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Skill & Action Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '24E87322-7829-4951-9BC3-BBE9C72CE9E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Actions.Action 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Skill & Action Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '716CCFEF-3B4D-4E12-8E75-6DB96997A051' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Actions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '96D3843F-079F-4BEE-8ECC-8012A07F10D6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Actions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D5737F0B-E63F-464A-8BD0-81B9F7FDB446' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-bolt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-bolt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6bed06d3-7b8c-43e1-84e6-4dfec8328fca', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', 'FieldCategoryInfo', '{"Skill & Action Mapping":{"icon":"fa fa-link","description":"Associations between AI skills and the actions they are permitted to invoke."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('087db2f4-f6a4-4d7e-8e84-26a917e19755', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', 'FieldCategoryIcons', '{"Skill & Action Mapping":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A';

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BCF6F504-A122-4E01-910D-DA799502D208' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.SkillID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Assignment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1584029-6FA2-417F-8592-29288A8A2D3C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.Skill 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Assignment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1150580C-84A4-425E-8D9D-5D10CB9ED8C8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Assignment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '758C7804-58EA-4092-B420-9E24FCC072EB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Assignment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D7EC9643-30AA-429D-A9B5-D8310A6E1D1E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Assignment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E741FEB8-69EA-49BC-B6B9-A89CA678A324' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Assignment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ED9603DB-5736-4D0C-93F6-E0386171822C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.CanView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rights',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '360C60B6-7F6E-4659-A588-F7C293119143' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.CanRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rights',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E0AC00F-A853-4CE1-932C-1B1867EAE004' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.CanEdit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rights',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7205E95-20ED-4B5C-A809-74CBEC0E82F3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.CanDelete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rights',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '05FF7C4A-FC59-41DF-A656-BF2A5CC4B112' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rights',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A64B3CB-3E78-4CAD-99AE-4D8F0A606151' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F24F0607-585A-46DD-A1CE-E1204E98B5AE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Skill Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '137F6A40-B765-46EB-B13E-E136E8F35766' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-user-shield */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-user-shield', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('56a6798b-534d-4dc2-a7ff-7343fa38d3cd', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', 'FieldCategoryInfo', '{"Permission Assignment":{"icon":"fa fa-user-tag","description":"Details regarding the target skill and the user or role receiving the permission grant"},"Access Rights":{"icon":"fa fa-shield-alt","description":"Specific action-level permissions (View, Run, Edit, Delete) and associated justification notes"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('83e98632-300a-4b65-b9a5-14ab5475ec98', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', 'FieldCategoryIcons', '{"Permission Assignment":"fa fa-user-tag","Access Rights":"fa fa-shield-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A';

/* Set categories for 87 fields */

-- UPDATE Entity Field Category Info MJ: AI Agents.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.LogoURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '77845738-5781-458B-AD3C-5DAE745373C2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '353D4710-73B2-4AF5-8A93-9DC1F47FF6E5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3177830D-10A0-4003-B95D-8514974BA846' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ExposeAsAction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ExecutionOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '090830CE-4073-486C-BBF2-E2105BEADD91' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ExecutionMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8261D630-2560-4C03-BE14-C8A9682ABBB4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.EnableContextCompression 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '09AFE563-63E3-4F2B-B6F1-5945432FF07B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageThreshold 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Context Compression Message Threshold',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '451D5C8F-6749-4789-A158-658B38A74AE4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPromptID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Context Compression Prompt',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FFD209C5-48F3-45D1-9094-E76EC832EA07' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageRetentionCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Context Compression Message Retention Count',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73A50D68-976F-49A7-9737-12D1D26C6011' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.TypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91CA077D-3F59-48E1-A593-AF8686276115' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.IconClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ModelSelectionMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadDownstreamPaths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '85B6AA86-796D-4970-9E35-5A483498B517' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadUpstreamPaths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'DA784B76-66CD-434B-90BD-DEC808917E68' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfReadPaths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfWritePaths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E542986-0164-4B9E-8457-06826A4AB892' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Final Payload Validation Schema',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '1C7959AE-F48B-4858-8383-28C3F4706314' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8931DE12-4048-4DEB-A2A3-E821354CFFB2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMaxRetries 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxCostPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23850C5A-311A-4271-AE53-BD36921C5AA5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxTokensPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxIterationsPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxTimePerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MinExecutionsPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxExecutionsPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Starting Payload Validation Schema',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0947203D-A5CA-4ED2-895B-17A8007323FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultPromptEffortLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ChatHandlingOption 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F58EA638-CE95-4D2A-9095-9909149B83C7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.OwnerUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Owner User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.InvocationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ArtifactCreationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4371BED0-7C4A-4D24-9E07-17E15D617607' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.FunctionalRequirements 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.TechnicalDesign 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CAEA2872-B089-4192-8FA8-1737FF357FFD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.InjectNotes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxNotesToInject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.NoteInjectionStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.InjectExamples 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxExamplesToInject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ExampleInjectionStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '291FEE7A-1245-4C82-A470-07EEB8847F1E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.IsRestricted 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5B17B79-282F-4F19-9656-246DE119D588' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MessageMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '445C1618-EADB-4B34-B318-40C662141FE1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxMessages 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F8924303-D53A-43B0-B70F-5B74FA6248D9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AttachmentStorageProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AttachmentRootPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA112220-B0D8-4C6F-B63A-027EB706B132' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.InlineStorageThresholdBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AgentTypePromptParams 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ScopeConfig 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'F644A0DD-0C7D-44E5-A2D5-0DAE4F0455AD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.NoteRetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38ABFFF6-5E0D-4AF1-B5CC-AB46B2358FB4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ExampleRetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A112A808-63DB-4B48-B38F-06554B912DED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AutoArchiveEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85774265-68C5-4067-9C2B-F70A7F21B94A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.RerankerConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '269087F5-DEBE-4B14-8FA3-5938ADCF7325' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.CategoryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DCA7B3C-9A81-4D32-AF2E-5EA32B22D988' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AllowEphemeralClientTools 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '98BE9EE9-A855-488E-9D97-441AEBA2B34D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '76AF4818-C79E-4DB5-8039-6B51C1C3A832' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.SearchScopeAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AcceptUnregisteredFiles 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1380146E-BF7D-4624-803A-45B1E65F0B52' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultCoAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '724ADC60-12A5-4C77-8C7D-AC8F110EE069' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.TypeConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '6F17DFC0-75FA-4F2A-9CF7-DF90B51C1239' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AllowMemoryWrite 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F224B93A-955B-4810-A042-20CD259D4CED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.RecordingDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '04C616DB-ABF1-4879-A79B-3229FD8A37B3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.RecordingStorageProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F516126-FCD8-4AF9-8600-E324886CC875' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultMediaCollectionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB1433BA-3037-44C5-8CCB-F8E9E4DBB001' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.SupportsPlanMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Runtime Limits & Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E8AD66E4-D6EB-4A92-8E9D-BAE06162B98D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AcceptsSkills 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Runtime Limits & Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5147944D-E146-47A9-B728-E46BBACDEAB5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '52E74C81-D246-4B52-B7A7-91757C299671' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPrompt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Context Compression Prompt Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD36EF69-1494-409C-A97E-FE73669DD28A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.OwnerUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Owner User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AttachmentStorageProvider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B6261245-1F52-43BA-9C92-A3E494D8C5BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6517DB09-A12E-4F1B-95B6-0B0A92918A1D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D900C3B8-F414-4468-AAA1-3CEB52C80ACD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultCoAgent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AAC9DA92-2BBE-4599-B742-4AE9E01DA10B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.RecordingStorageProvider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3D53D5CF-CCED-4C20-A342-5FFDF9C34FE8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultMediaCollection 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6782D948-AE63-4A05-AFFF-066B97C2D865' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.RootParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Parent ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '644AA4B2-1044-430C-BCBA-245644294E02' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.RootDefaultCoAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Default Co-Agent ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1861E78B-4306-44CA-8E62-70991A1F58CA' AND AutoUpdateCategory = 1;

