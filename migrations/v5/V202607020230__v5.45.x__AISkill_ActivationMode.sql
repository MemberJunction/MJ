-- =============================================================================
-- AISkill.ActivationMode — per-skill control over agent self-activation
-- =============================================================================
-- Agents with AcceptsSkills='All'/'Limited' see their allowed skills as a
-- name+description catalog in every prompt and may self-activate any of them
-- mid-run on their own judgment. That is the right default for most skills
-- (progressive disclosure paying off), but consequential skills — e.g. ones
-- that send outbound communications — should never widen an agent's tool
-- surface without an explicit user request.
--
-- ActivationMode adds that dial per skill:
--   * 'Auto' (default)   — current behavior: in the prompt catalog, agent may
--                           self-activate via a 'Skill' step at any time.
--   * 'RequestedOnly'    — excluded from the prompt catalog entirely; only
--                           activatable when the user explicitly requests it
--                           for the run (ExecuteAgentParams.requestedSkillIDs,
--                           i.e. a /skill mention in the composer).
--
-- All other gates (AcceptsSkills, AISkill.Status, AIAgentSkill assignment,
-- user Run permission) apply unchanged on both paths.
-- =============================================================================

ALTER TABLE ${flyway:defaultSchema}.AISkill ADD
    ActivationMode NVARCHAR(20) NOT NULL
        CONSTRAINT DF_AISkill_ActivationMode DEFAULT ('Auto')
        CONSTRAINT CK_AISkill_ActivationMode
            CHECK (ActivationMode IN ('Auto', 'RequestedOnly'));

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls how the skill can be activated at agent runtime. Auto (default): the skill appears in accepting agents'' prompt catalogs and agents may self-activate it mid-run via a Skill step. RequestedOnly: the skill is excluded from prompt catalogs and can only be activated when the user explicitly requests it for the run (a /skill mention flowing through ExecuteAgentParams.requestedSkillIDs). Use RequestedOnly for consequential skills (e.g. outbound communications) that should never activate on agent judgment alone. All other activation gates (AcceptsSkills, skill Status, per-agent assignment, user Run permission) apply unchanged in both modes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill',
    @level2type = N'COLUMN', @level2name = N'ActivationMode';
