-- =============================================================================
-- Realtime Co-Agent Pairing & Agent Type Configuration
-- =============================================================================
-- Three additive pieces enabling the multi-co-agent product direction while the
-- zero-config default stays exactly as it is today:
--
--  1. AIAgentPairedAgent — OPT-IN pairing junction: a (Realtime-type) co-agent
--     declares which underlying agents it can front. A co-agent with ZERO rows
--     (the seeded default "Realtime Co-Agent") remains UNIVERSAL — it fronts any
--     single agent supplied at runtime, no metadata required. Rows therefore
--     RESTRICT + PREBUILD, never mandate.
--  2. AIAgent.TypeConfiguration — agent-type-specific configuration JSON (for
--     Realtime co-agents: model preference, per-provider voice, tone/speaking
--     style, override policy, narration pacing). Validated server-side against…
--  3. AIAgentType.ConfigSchema — a JSON Schema the agent type publishes for its
--     agents' TypeConfiguration payloads (enforced in MJAIAgentEntityServer's
--     ValidateAsync, not in the database).
--
-- Runtime parameters keep overriding everything for authorized callers: the
-- session-start mutation's targetAgentId / coAgentId / config overrides layer on
-- top of this metadata (server-authoritative precedence, enforced in code).
--
-- NO seed rows here — the 'Realtime: Advanced Session Controls' authorization
-- and any prebuilt pairings ship via metadata sync, per repo convention.
-- =============================================================================

-- ── 1. The pairing junction ──────────────────────────────────────────────────
CREATE TABLE ${flyway:defaultSchema}.AIAgentPairedAgent (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CoAgentID UNIQUEIDENTIFIER NOT NULL,
    TargetAgentID UNIQUEIDENTIFIER NOT NULL,
    IsDefault BIT NOT NULL DEFAULT 0,
    Sequence INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_AIAgentPairedAgent PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentPairedAgent_CoAgent FOREIGN KEY (CoAgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_AIAgentPairedAgent_TargetAgent FOREIGN KEY (TargetAgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT UQ_AIAgentPairedAgent_Pair UNIQUE (CoAgentID, TargetAgentID),
    CONSTRAINT CK_AIAgentPairedAgent_NotSelf CHECK (CoAgentID <> TargetAgentID)
);

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'OPT-IN pairing between a Realtime-type co-agent and the underlying agents it can front in realtime sessions. A co-agent with NO rows is universal (fronts any single agent supplied at runtime — the zero-config default); rows restrict the co-agent to a prebuilt target list. The co-agent must be an Active agent of the Realtime type (enforced server-side).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentPairedAgent';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this target is the co-agent''s default underlying agent — used when a session starts against the co-agent without an explicit runtime target. At most one default per co-agent is enforced server-side.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentPairedAgent',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display/priority order of this pairing in target-agent pickers (ascending).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentPairedAgent',
    @level2type = N'COLUMN', @level2name = N'Sequence';

-- ── 2. Agent-type-specific configuration on the agent ────────────────────────
ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    TypeConfiguration NVARCHAR(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Agent-type-specific configuration JSON, validated against the agent type''s ConfigSchema (when one is published) in the server-side entity subclass. For Realtime-type co-agents this holds the realtime profile: preferred model, per-provider voice settings, tone/speaking style (folded into the session system prompt at mint), user-override policy, and narration pacing. Null = type defaults apply.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'TypeConfiguration';

-- ── 3. The type's published schema + type-level defaults for that configuration ──
ALTER TABLE ${flyway:defaultSchema}.AIAgentType ADD
    ConfigSchema NVARCHAR(MAX) NULL,
    DefaultConfiguration NVARCHAR(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON Schema (draft-07) describing the shape of TypeConfiguration payloads on agents of this type. When present, agent saves validate their TypeConfiguration against it server-side (MJAIAgentEntityServer.ValidateAsync); null = TypeConfiguration is freeform for this type.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'ConfigSchema';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type-level DEFAULT configuration JSON for agents of this type — the base layer of the effective-configuration merge: type DefaultConfiguration <- agent TypeConfiguration <- runtime overrides (later layers win per key, deep-merged). Must itself conform to ConfigSchema when one is published. Null = no type defaults.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'DefaultConfiguration';
