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
--     AISkill          — reusable capability bundle (Instructions appended to an
--                        accepting agent's system prompt on activation).
--     AISkillAction    — Actions bundled into a skill (enabled while skill active).
--     AISkillSubAgent  — sub-agents bundled into a skill.
--     AIAgentSkill     — agent <-> skill assignment (for AcceptsSkills = Limited).
--
--   Additive columns:
--     AIAgent.SupportsPlanMode  — capability flag (default ON / opt-out).
--     AIAgent.AcceptsSkills     — None | All | Limited (default None / opt-in).
--
--   AIAgentRunStep.StepType extended with 'Plan' and 'Skill'.
--
--   Data seed: SupportsPlanMode = 0 for existing Realtime agents (session-driven,
--   structurally skip plan mode). Remote Proxy agents get seeded when that type
--   ships (Phase 2).
--
--   Permissions (AI Skills resource type + "Can Share Skills" authorization) are
--   seeded via metadata sync AFTER CodeGen registers the MJ: AI Skills entity —
--   not in this migration.
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
