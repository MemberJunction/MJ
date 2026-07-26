-- ============================================================================
-- Migration: Public Web Widget + Returning-Visitor Memory  (consolidated)
-- Part of the Agent Bridges & Public Widget program.
--   plans/realtime/bridges-and-widget/public-web-widget.md         (Widget Instances + Guest RLS)
--   plans/realtime/bridges-and-widget/returning-visitor-memory.md  (RV0 schema)
--   plans/realtime/bridges-and-widget/widget-schema-redesign.md    (pre-merge revision)
--
-- This is the SINGLE schema migration for the PR. It contains, in order:
--   1. "MJ: Conversation Widget Instances" table — durable per-deployment widget
--      config, INCLUDING the returning-visitor opt-in toggle + retention (R6).
--   2. Returning-visitor cross-session continuity columns on Conversation:
--      a durable visitor anchor (VisitorKey, R3) and a conversation-altitude chain
--      (LastConversationID, R2). The RESOLVED counterparty identity reuses the
--      existing polymorphic LinkedEntityID / LinkedRecordID pair (present from the
--      v5.38 baseline, CK_Conversation_LinkBinding) — NO second pair is added.
--   3. A polymorphic LinkedEntityID / LinkedRecordID pair on AIAgentSession, so a
--      realtime session can carry its counterparty identity directly (mirrors the
--      Conversation pair + its both-or-neither LinkBinding check).
--   4. Hand-authored non-FK lookup index for VisitorKey.
--   5. Widget Guest Row-Level-Security filter seed rows (reference data).
--   6. [appended below] CodeGen output for all of the above.
--
-- NOTE on memory scoping (plan R5, superseded): the agent-notes system already
--   carries a polymorphic note scope (MJ: AI Agent Notes . PrimaryScopeEntityID +
--   PrimaryScopeRecordID + SecondaryScopes), and the memory injector already filters
--   by it. Returning-visitor recaps reuse that existing scope (matching AN-BC's
--   "reuse the existing memory system, no parallel store" guidance), so this migration
--   adds NO columns to AIAgentNote — the polymorphic identity lives on Conversation /
--   AIAgentSession.
--
-- NOTE on naming (widget-schema-redesign): the entity is ConversationWidgetInstance
--   (not WidgetInstance) to follow MJ's domain-prefix convention (ConversationX,
--   AIAgentX). The conversation chain column is LastConversationID (not
--   PreviousConversationID) to mirror the existing AIAgentSession.LastSessionID name.
--
-- Conventions: no __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are
--   declared here — CodeGen generates those (IDX_AUTO_MJ_FKEY_*). One ALTER TABLE
--   per table with comma-separated ADDs. sp_addextendedproperty for every new
--   column. Polymorphic *RecordID columns are NVARCHAR(500), NOT FK-constrained
--   (they point at any entity's record, incl. composite/non-uuid PKs).
--   Seed config rows for Conversation Widget Instances go via mj-sync metadata (NOT
--   SQL INSERTs). The RLS filter rows ARE SQL-seeded because RowLevelSecurityFilter
--   create is denied to non-Owner principals (MetadataSync runs as System), identical
--   to the Magic Link RLS seeds; the EntityPermission -> filter LINK is done in
--   metadata (metadata/entity-permissions) via @lookup by Name.
-- ============================================================================


-- =============================================================================
-- 1. MJ: Conversation Widget Instances
-- =============================================================================
-- A Conversation Widget Instance is the durable, per-deployment configuration for
-- one embeddable public support widget — one row per site/embed that drops the
-- <script> tag. It resolves a public widget key (pk_live_…) to its application
-- scope, the PINNED support agent, the restricted GUEST ROLE, the allowed
-- embedding origins, the enabled modality + auth strategy, abuse ceilings, and
-- (R6) whether this deployment remembers returning visitors + for how long.
CREATE TABLE ${flyway:defaultSchema}.ConversationWidgetInstance (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    PublicKey NVARCHAR(100) NOT NULL,
    ApplicationID UNIQUEIDENTIFIER NOT NULL,
    PinnedAgentID UNIQUEIDENTIFIER NOT NULL,
    GuestRoleID UNIQUEIDENTIFIER NOT NULL,
    AllowedOrigins NVARCHAR(MAX) NULL,
    Modality NVARCHAR(10) NOT NULL DEFAULT 'Text',
    AuthStrategy NVARCHAR(20) NOT NULL DEFAULT 'Anonymous',
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    SessionTTLMinutes INT NOT NULL DEFAULT 15,
    RateLimitPerMinute INT NOT NULL DEFAULT 30,
    VoiceMaxSessionMinutes INT NULL,
    EnabledChannels NVARCHAR(MAX) NULL,
    HostPublicKey NVARCHAR(MAX) NULL,
    RememberReturningVisitors BIT NOT NULL DEFAULT 0,
    VisitorMemoryRetentionDays INT NULL,
    CONSTRAINT PK_ConversationWidgetInstance PRIMARY KEY (ID),
    CONSTRAINT UQ_ConversationWidgetInstance_PublicKey UNIQUE (PublicKey),
    CONSTRAINT FK_ConversationWidgetInstance_Application FOREIGN KEY (ApplicationID)
        REFERENCES ${flyway:defaultSchema}.Application(ID),
    CONSTRAINT FK_ConversationWidgetInstance_PinnedAgent FOREIGN KEY (PinnedAgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_ConversationWidgetInstance_GuestRole FOREIGN KEY (GuestRoleID)
        REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT CK_ConversationWidgetInstance_Modality
        CHECK (Modality IN ('Text', 'Voice', 'Both')),
    CONSTRAINT CK_ConversationWidgetInstance_AuthStrategy
        CHECK (AuthStrategy IN ('Anonymous', 'MagicLinkUpgrade', 'HostIdentity')),
    CONSTRAINT CK_ConversationWidgetInstance_Status
        CHECK (Status IN ('Active', 'Disabled')),
    CONSTRAINT CK_ConversationWidgetInstance_SessionTTLMinutes
        CHECK (SessionTTLMinutes > 0 AND SessionTTLMinutes <= 1440),
    CONSTRAINT CK_ConversationWidgetInstance_RateLimitPerMinute
        CHECK (RateLimitPerMinute > 0),
    CONSTRAINT CK_ConversationWidgetInstance_VisitorMemoryRetentionDays
        CHECK (VisitorMemoryRetentionDays > 0)
);


-- =============================================================================
-- 2. Returning-visitor continuity on Conversation
-- =============================================================================
-- VisitorKey  = durable anonymous anchor (R3).
-- LastConversationID = the visitor's immediately-prior conversation (R2), named to
--   mirror AIAgentSession.LastSessionID. The RESOLVED counterparty identity is NOT a
--   new pair here — it reuses the existing LinkedEntityID / LinkedRecordID polymorphic
--   pair (baseline v5.38, governed by CK_Conversation_LinkBinding).
ALTER TABLE ${flyway:defaultSchema}.Conversation ADD
    VisitorKey         NVARCHAR(255) NULL,
    LastConversationID UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_Conversation_LastConversation
        FOREIGN KEY (LastConversationID) REFERENCES ${flyway:defaultSchema}.Conversation(ID);


-- =============================================================================
-- 3. Polymorphic counterparty identity on AIAgentSession
-- =============================================================================
-- Mirrors the Conversation linked pair so a realtime session can carry its
-- counterparty identity directly. LinkedRecordID is NVARCHAR(500), NOT FK-constrained
-- (points at any entity's record, incl. composite/non-uuid PKs). The both-or-neither
-- binding mirrors CK_Conversation_LinkBinding.
ALTER TABLE ${flyway:defaultSchema}.AIAgentSession ADD
    LinkedEntityID UNIQUEIDENTIFIER NULL,
    LinkedRecordID NVARCHAR(500) NULL,
    CONSTRAINT FK_AIAgentSession_LinkedEntity
        FOREIGN KEY (LinkedEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT CK_AIAgentSession_LinkBinding
        CHECK (LinkedEntityID IS NULL AND LinkedRecordID IS NULL OR LinkedEntityID IS NOT NULL AND LinkedRecordID IS NOT NULL);


-- =============================================================================
-- 4. Hand-authored non-FK lookup index (VisitorKey)
-- =============================================================================
-- NOT an FK index (CodeGen owns IDX_AUTO_MJ_FKEY_* for LastConversationID). Backs the
-- resolver lookup by the durable cookie VisitorKey. The resolved-identity lookup uses
-- the existing baseline index on (LinkedEntityID, LinkedRecordID).
CREATE NONCLUSTERED INDEX IX_Conversation_VisitorKey
    ON ${flyway:defaultSchema}.Conversation (VisitorKey);


-- =============================================================================
-- Extended properties
-- =============================================================================

-- ── ConversationWidgetInstance table + columns ──────────────────────────────
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Durable per-deployment configuration for one embeddable public support widget (text and/or voice). One row per site/embed. Resolves a public widget key to its application scope, pinned support agent, restricted guest role, allowed origins, modality, auth strategy, and abuse ceilings. Reuses the magic-link anonymous-embed minting path at session time; this entity holds only the configuration.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Human-readable name for this widget deployment (e.g. "Acme Marketing Site Support").',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Public, non-secret embed key (e.g. "pk_live_…") placed in the host page''s data-widget-key attribute. Used to resolve this configuration at POST /widget/session. Unique. Not a credential — security comes from the origin allowlist, rate limits, the restricted guest role, and short-lived minted tokens.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'PublicKey';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Application — the single app a guest session is scoped to. Mirrors the magic-link single-application model.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'ApplicationID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to AIAgent — the support agent that is PINNED for every turn (passed as explicitAgentId). D5: pinning fixes which agent runs; combined with the restricted guest role it prevents a public visitor from reaching arbitrary agents/data. The pinned agent''s own tool/handoff surface should be support-scoped.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'PinnedAgentID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Role — the restricted guest role assigned to the synthesized guest principal. This role''s entity permissions are the real authorization boundary (read/write only the visitor''s own Conversation + Conversation Details). Roles ride per-session JWT claims, not DB rows on the shared Anonymous principal.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'GuestRoleID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Allowed embedding origins for this widget, as a JSON array of origin strings (e.g. ["https://www.acme.com","https://acme.com"]). Enforced both at mint (POST /widget/session rejects unlisted Origin) and via CORS. NULL or empty means no origin is allowed (fail-closed).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'AllowedOrigins';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Which modalities this widget exposes: Text (chat only), Voice (client-direct realtime only), or Both. Gates whether the realtime-mint path is offered to the guest.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'Modality';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Pluggable public-auth strategy (D1): Anonymous (guest-first, default), MagicLinkUpgrade (guest may escalate to an email-verified session), or HostIdentity (an authenticated host portal posts a signed identity assertion exchanged for an MJ guest JWT). All three converge on AuthProviderFactory + buildMagicLinkSessionUser.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'AuthStrategy';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Lifecycle status. Active widgets mint sessions; Disabled widgets reject all mints (used to turn off a deployment without deleting its config).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'Status';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Time-to-live in minutes for a minted guest session JWT. Short by design (default 15) to limit replay/theft; the widget refreshes before expiry. Capped at 1440 (24h).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'SessionTTLMinutes';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Maximum number of guest-session mints allowed per minute per source IP/origin for this widget. Reuses the magic-link rate-limit pattern.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'RateLimitPerMinute';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Optional hard ceiling (minutes) on a single voice session''s duration for this widget. NULL means fall back to the server-wide default. Voice is the biggest cost/abuse surface; the SessionJanitor enforces this server-side (W4).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'VoiceMaxSessionMinutes';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Which MJ interactive channels this widget may attach when a voice session is active, as a JSON array of channel names (e.g. ["Whiteboard"]). Resolved client-side through MJGlobal.ClassFactory the same way the realtime client driver is resolved; each named channel is scoped by the existing Widget Guest RLS on AI Agent Session Channels. NULL or empty array = no channels (the backwards-compatible default). Remote Browser, given its control surface, should only be listed when a deployment explicitly opts in.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'EnabledChannels';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'PEM-encoded RS256 public key for the host-identity auth strategy (D1). When AuthStrategy is HostIdentity, the host signs a short-lived identity assertion with its private key; the HostIdentityProvider verifies it against this per-instance key. Supersedes the interim config map (mj.config.cjs hostPublicKeys keyed by PublicKey). NULL when the widget does not use host identity; a HostIdentity widget with no key fails closed at mint.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'HostPublicKey';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Returning-visitor memory opt-in (R6). When 0 (default) this widget sets no durable visitor cookie and writes no cross-session recap — fully off. When 1, the widget mints a durable VisitorKey cookie, links each new Conversation to the visitor''s prior one, and writes a recap memory note on close so a returning visitor''s agent opens with prior context.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'RememberReturningVisitors';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Retention window (days) for returning-visitor recap memory notes generated by this widget. NULL means use the system default. Past this window the visitor''s auto-generated recap notes decay/archive via the Memory Manager. Ignored when RememberReturningVisitors = 0.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ConversationWidgetInstance',
    @level2type=N'COLUMN', @level2name=N'VisitorMemoryRetentionDays';

-- ── Conversation columns ────────────────────────────────────────────────────
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Durable, opaque returning-visitor anchor (R3). Holds the value of a long-lived first-party cookie minted by the widget on first visit, used to find this visitor''s prior conversations while they are still anonymous. Distinct from ExternalID (which stays per-session for RLS isolation). NULL for conversations that are not widget returning-visitor sessions.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Conversation',
    @level2type=N'COLUMN', @level2name=N'VisitorKey';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Conversation-altitude returning-visitor chain (R2). Self-foreign-key to the visitor''s immediately prior Conversation (found by VisitorKey or the resolved LinkedEntityID/LinkedRecordID pair at mint time). History and memory are conversation-scoped, so the chain lives here — NOT on AIAgentSession.LastSessionID, which owns reconnect/resume semantics and is walked by the replay viewer. Named to mirror AIAgentSession.LastSessionID. NULL for a brand-new visitor''s first conversation.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Conversation',
    @level2type=N'COLUMN', @level2name=N'LastConversationID';

-- ── AIAgentSession columns ──────────────────────────────────────────────────
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Polymorphic counterparty-identity entity. Foreign key to Entity — identifies WHICH entity this realtime session''s counterparty resolved to (e.g. User, a member/contact record, BizAppsCommon Person). Paired with LinkedRecordID via the CK_AIAgentSession_LinkBinding both-or-neither check, mirroring Conversation''s linked pair. NULL while the session''s counterparty is anonymous/unresolved.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'AIAgentSession',
    @level2type=N'COLUMN', @level2name=N'LinkedEntityID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Polymorphic counterparty-identity record key. The primary-key value of the record (within LinkedEntityID''s entity) this session resolved to, serialized as a string so any entity type can be referenced regardless of PK shape (UUID, int, composite). NVARCHAR(500), intentionally NOT FK-constrained. Used together with LinkedEntityID — see CK_AIAgentSession_LinkBinding. NULL while the session''s counterparty is anonymous/unresolved.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'AIAgentSession',
    @level2type=N'COLUMN', @level2name=N'LinkedRecordID';


-- =============================================================================
-- 5. Widget Guest Row-Level-Security filter seed rows (reference data)
-- =============================================================================
-- Created in SQL (not metadata) because creating a RowLevelSecurityFilter is denied
-- to non-Owner principals and MetadataSync runs as the System user. Fixed UUIDs.
-- The EntityPermission -> filter LINK is done in metadata (entity-permissions) via
-- @lookup by Name. {{ScopeResourceID}} is the base64url session id ([A-Za-z0-9_-]
-- only — no quote/escape chars), so substitution into the literal is injection-safe;
-- an absent scope resolves to '' (fail-closed: matches no rows).

-- Widget Guest: Own Conversations — guest sees only conversations whose ExternalID
-- matches its signed session scope.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'A1E6D2C4-4F1B-4C7E-9E3A-1D2B3C4D5E6F')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'A1E6D2C4-4F1B-4C7E-9E3A-1D2B3C4D5E6F',
        'Widget Guest: Own Conversations',
        'ExternalID = ''{{ScopeResourceID}}''',
        'Isolates a public web-widget guest to its OWN conversations. Conversations are stamped with ExternalID = the opaque per-session id at create time; this filter restricts reads/updates to rows matching the session scope ({{ScopeResourceID}}) carried on the signed guest token. Attached to the Widget Guest role''s read+update permission on Conversations so two anonymous guests sharing the Anonymous principal cannot see each other''s conversations.'
    );
END;

-- Widget Guest: Own Conversation Details — details scoped by their parent
-- conversation's ExternalID (not their own), so agent AI-reply details (no ExternalID)
-- stay visible to the owning session.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'B2F7E3D5-5A2C-4D8F-AF4B-2E3C4D5E6F70')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'B2F7E3D5-5A2C-4D8F-AF4B-2E3C4D5E6F70',
        'Widget Guest: Own Conversation Details',
        'ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')',
        'Isolates a public web-widget guest to the messages of its OWN conversations. Scopes Conversation Details by the parent conversation''s ExternalID (matched against the session scope {{ScopeResourceID}} on the signed guest token) rather than the detail''s own ExternalID — so the agent''s AI-reply details (which carry no ExternalID) stay visible to the owning session while remaining hidden from other guests. Attached to the Widget Guest role''s read+update permission on Conversation Details.'
    );
END;

-- Widget Guest: Own Agent Sessions — extends guest isolation to the realtime VOICE
-- path; a session's Conversation is stamped with ExternalID = the guest scope.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'B1E7C0A2-3D4F-4A5B-8C6D-7E8F9A0B1C2D')
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'B1E7C0A2-3D4F-4A5B-8C6D-7E8F9A0B1C2D',
        'Widget Guest: Own Agent Sessions',
        'ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')',
        'Isolates a public web-widget VOICE guest to its OWN realtime agent sessions. A session''s Conversation is stamped with ExternalID = the opaque per-session id at create time; this filter restricts reads/updates of MJ: AI Agent Sessions to rows whose Conversation matches the session scope ({{ScopeResourceID}}) carried on the signed guest token. Attached to the Widget Guest role''s read+update permission on AI Agent Sessions so two anonymous guests sharing the Anonymous principal cannot see each other''s sessions.'
    );

-- Widget Guest: Own Agent Session Channels — scoped by parent session's Conversation
-- ExternalID.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'C2F8D1B3-4E5A-4B6C-9D7E-8F0A1B2C3D4E')
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'C2F8D1B3-4E5A-4B6C-9D7E-8F0A1B2C3D4E',
        'Widget Guest: Own Agent Session Channels',
        'AgentSessionID IN (SELECT ID FROM ${flyway:defaultSchema}.vwAIAgentSessions WHERE ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}''))',
        'Isolates a public web-widget VOICE guest to the channels of its OWN realtime agent sessions. Scopes MJ: AI Agent Session Channels by the parent session''s Conversation ExternalID (matched against the session scope {{ScopeResourceID}} on the signed guest token). Attached to the Widget Guest role''s read+update permission on AI Agent Session Channels.'
    );

-- Widget Guest: Widget-Pinned Agents [DEMO-GRADE] — limit a guest to ONLY the agents
-- pinned to an ACTIVE widget instance (the agents intentionally exposed publicly).
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'D3A9E2C4-5F6B-4C7D-AE8F-9A0B1C2D3E4F')
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'D3A9E2C4-5F6B-4C7D-AE8F-9A0B1C2D3E4F',
        'Widget Guest: Widget-Pinned Agents',
        'ID IN (SELECT PinnedAgentID FROM ${flyway:defaultSchema}.vwConversationWidgetInstances WHERE Status = ''Active'' AND PinnedAgentID IS NOT NULL)',
        'Restricts a public web-widget guest to reading ONLY the agents pinned to an active widget instance (the agents intentionally exposed to the public), never the full internal agent roster. Attached to the Widget Guest role''s read permission on MJ: AI Agents so the client-side ConversationsRuntime can resolve the pinned agent without exposing other agents.'
    );

-- Widget Guest: Own Agent Runs — read-scopes the three AI run entities (MJ: AI Agent Runs /
-- AI Agent Run Steps / AI Prompt Runs) to the guest's OWN session. The text path runs the agent
-- under a trusted server principal (no guest run writes); the voice path still writes its runs under
-- the guest, so this read filter closes the cross-guest leak. All three carry a ConversationID; a
-- guest's session Conversation is stamped with ExternalID = the per-session scope.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = '48078109-E006-456D-A877-F254EA447B34')
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        '48078109-E006-456D-A877-F254EA447B34',
        'Widget Guest: Own Agent Runs',
        'ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')',
        'Isolates a public web-widget guest to its OWN AI run rows (MJ: AI Agent Runs / AI Agent Run Steps / AI Prompt Runs). All three carry a ConversationID; a guest''s session Conversation is stamped with ExternalID = the opaque per-session scope ({{ScopeResourceID}}) carried on the signed guest token, so this filter restricts reads to runs belonging to the guest''s own session. Closes the cross-guest read leak from the previous unscoped grants. The text path runs the agent under a trusted server principal (no guest run writes); the voice path still writes runs under the guest, and this filter scopes their reads. Attached to the Widget Guest role''s read permission on those three run entities.'
    );
























































































































































/* SQL generated to create new entity MJ: Conversation Widget Instances */

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
         '88026538-d440-48f5-9fe8-a8a7198dbf83',
         'MJ: Conversation Widget Instances',
         'Conversation Widget Instances',
         'Durable per-deployment configuration for one embeddable public support widget (text and/or voice). One row per site/embed. Resolves a public widget key to its application scope, pinned support agent, restricted guest role, allowed origins, modality, auth strategy, and abuse ceilings. Reuses the magic-link anonymous-embed minting path at session time; this entity holds only the configuration.',
         NULL,
         'ConversationWidgetInstance',
         'vwConversationWidgetInstances',
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

/* SQL generated to add new entity MJ: Conversation Widget Instances to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '88026538-d440-48f5-9fe8-a8a7198dbf83', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Conversation Widget Instances for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('88026538-d440-48f5-9fe8-a8a7198dbf83', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Conversation Widget Instances for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('88026538-d440-48f5-9fe8-a8a7198dbf83', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Conversation Widget Instances for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('88026538-d440-48f5-9fe8-a8a7198dbf83', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationWidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[ConversationWidgetInstance] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationWidgetInstance */
UPDATE [${flyway:defaultSchema}].[ConversationWidgetInstance] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationWidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[ConversationWidgetInstance] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationWidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[ConversationWidgetInstance] ADD CONSTRAINT [DF___mj_ConversationWidgetInstance___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationWidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[ConversationWidgetInstance] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationWidgetInstance */
UPDATE [${flyway:defaultSchema}].[ConversationWidgetInstance] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationWidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[ConversationWidgetInstance] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationWidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[ConversationWidgetInstance] ADD CONSTRAINT [DF___mj_ConversationWidgetInstance___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '042ab9a6-963b-4f43-b4ae-862f83446494' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'VisitorKey')) BEGIN
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
            '042ab9a6-963b-4f43-b4ae-862f83446494',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100058,
            'VisitorKey',
            'Visitor Key',
            'Durable, opaque returning-visitor anchor (R3). Holds the value of a long-lived first-party cookie minted by the widget on first visit, used to find this visitor''s prior conversations while they are still anonymous. Distinct from ExternalID (which stays per-session for RLS isolation). NULL for conversations that are not widget returning-visitor sessions.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '879e3427-c9b6-4d2b-93e0-3bf6adfcd361' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastConversationID')) BEGIN
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
            '879e3427-c9b6-4d2b-93e0-3bf6adfcd361',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100059,
            'LastConversationID',
            'Last Conversation ID',
            'Conversation-altitude returning-visitor chain (R2). Self-foreign-key to the visitor''s immediately prior Conversation (found by VisitorKey or the resolved LinkedEntityID/LinkedRecordID pair at mint time). History and memory are conversation-scoped, so the chain lives here — NOT on AIAgentSession.LastSessionID, which owns reconnect/resume semantics and is walked by the replay viewer. Named to mirror AIAgentSession.LastSessionID. NULL for a brand-new visitor''s first conversation.',
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
            '13248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39d168d2-f07b-4d85-bb95-08cb2d786e0f' OR (EntityID = '17198778-E25A-4457-80AF-9E8C4961DC29' AND Name = 'LinkedEntityID')) BEGIN
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
            '39d168d2-f07b-4d85-bb95-08cb2d786e0f',
            '17198778-E25A-4457-80AF-9E8C4961DC29', -- Entity: MJ: AI Agent Sessions
            100040,
            'LinkedEntityID',
            'Linked Entity ID',
            'Polymorphic counterparty-identity entity. Foreign key to Entity — identifies WHICH entity this realtime session''s counterparty resolved to (e.g. User, a member/contact record, BizAppsCommon Person). Paired with LinkedRecordID via the CK_AIAgentSession_LinkBinding both-or-neither check, mirroring Conversation''s linked pair. NULL while the session''s counterparty is anonymous/unresolved.',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f69e7371-7f9c-4c91-a5fe-ca430f295583' OR (EntityID = '17198778-E25A-4457-80AF-9E8C4961DC29' AND Name = 'LinkedRecordID')) BEGIN
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
            'f69e7371-7f9c-4c91-a5fe-ca430f295583',
            '17198778-E25A-4457-80AF-9E8C4961DC29', -- Entity: MJ: AI Agent Sessions
            100041,
            'LinkedRecordID',
            'Linked Record ID',
            'Polymorphic counterparty-identity record key. The primary-key value of the record (within LinkedEntityID''s entity) this session resolved to, serialized as a string so any entity type can be referenced regardless of PK shape (UUID, int, composite). NVARCHAR(500), intentionally NOT FK-constrained. Used together with LinkedEntityID — see CK_AIAgentSession_LinkBinding. NULL while the session''s counterparty is anonymous/unresolved.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ffa3e465-0582-48b4-906a-a5997c8a0803' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'ID')) BEGIN
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
            'ffa3e465-0582-48b4-906a-a5997c8a0803',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'adaa0676-b5e6-458c-aec2-2b1bd6b12242' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'Name')) BEGIN
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
            'adaa0676-b5e6-458c-aec2-2b1bd6b12242',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100002,
            'Name',
            'Name',
            'Human-readable name for this widget deployment (e.g. "Acme Marketing Site Support").',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a377bb89-2a5e-42e5-aeae-933c0835dcfd' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'PublicKey')) BEGIN
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
            'a377bb89-2a5e-42e5-aeae-933c0835dcfd',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100003,
            'PublicKey',
            'Public Key',
            'Public, non-secret embed key (e.g. "pk_live_…") placed in the host page''s data-widget-key attribute. Used to resolve this configuration at POST /widget/session. Unique. Not a credential — security comes from the origin allowlist, rate limits, the restricted guest role, and short-lived minted tokens.',
            'nvarchar',
            200,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f8c1246-6551-4f5d-a18c-5ba817c701e2' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'ApplicationID')) BEGIN
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
            '1f8c1246-6551-4f5d-a18c-5ba817c701e2',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100004,
            'ApplicationID',
            'Application ID',
            'Foreign key to Application — the single app a guest session is scoped to. Mirrors the magic-link single-application model.',
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
            'E8238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e099daf-45d2-4908-9230-5af734a3b330' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'PinnedAgentID')) BEGIN
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
            '6e099daf-45d2-4908-9230-5af734a3b330',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100005,
            'PinnedAgentID',
            'Pinned Agent ID',
            'Foreign key to AIAgent — the support agent that is PINNED for every turn (passed as explicitAgentId). D5: pinning fixes which agent runs; combined with the restricted guest role it prevents a public visitor from reaching arbitrary agents/data. The pinned agent''s own tool/handoff surface should be support-scoped.',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e6f8dfd-272e-4336-9def-c8fc5c8ee5d9' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'GuestRoleID')) BEGIN
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
            '7e6f8dfd-272e-4336-9def-c8fc5c8ee5d9',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100006,
            'GuestRoleID',
            'Guest Role ID',
            'Foreign key to Role — the restricted guest role assigned to the synthesized guest principal. This role''s entity permissions are the real authorization boundary (read/write only the visitor''s own Conversation + Conversation Details). Roles ride per-session JWT claims, not DB rows on the shared Anonymous principal.',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '75923530-6de5-41bd-9615-7c72b5a69510' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'AllowedOrigins')) BEGIN
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
            '75923530-6de5-41bd-9615-7c72b5a69510',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100007,
            'AllowedOrigins',
            'Allowed Origins',
            'Allowed embedding origins for this widget, as a JSON array of origin strings (e.g. ["https://www.acme.com","https://acme.com"]). Enforced both at mint (POST /widget/session rejects unlisted Origin) and via CORS. NULL or empty means no origin is allowed (fail-closed).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9714d30c-a9e7-4cb3-bb2e-c7dc5f5dd094' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'Modality')) BEGIN
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
            '9714d30c-a9e7-4cb3-bb2e-c7dc5f5dd094',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100008,
            'Modality',
            'Modality',
            'Which modalities this widget exposes: Text (chat only), Voice (client-direct realtime only), or Both. Gates whether the realtime-mint path is offered to the guest.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'Text',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34794587-43d0-451c-9846-aeda0dfcee58' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'AuthStrategy')) BEGIN
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
            '34794587-43d0-451c-9846-aeda0dfcee58',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100009,
            'AuthStrategy',
            'Auth Strategy',
            'Pluggable public-auth strategy (D1): Anonymous (guest-first, default), MagicLinkUpgrade (guest may escalate to an email-verified session), or HostIdentity (an authenticated host portal posts a signed identity assertion exchanged for an MJ guest JWT). All three converge on AuthProviderFactory + buildMagicLinkSessionUser.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Anonymous',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cdad88b3-02d2-48f7-bd2a-5dc15ce9ea37' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'Status')) BEGIN
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
            'cdad88b3-02d2-48f7-bd2a-5dc15ce9ea37',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100010,
            'Status',
            'Status',
            'Lifecycle status. Active widgets mint sessions; Disabled widgets reject all mints (used to turn off a deployment without deleting its config).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54a96afe-a5f0-4956-85f4-d02b5a4fd83f' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'SessionTTLMinutes')) BEGIN
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
            '54a96afe-a5f0-4956-85f4-d02b5a4fd83f',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100011,
            'SessionTTLMinutes',
            'Session TTL Minutes',
            'Time-to-live in minutes for a minted guest session JWT. Short by design (default 15) to limit replay/theft; the widget refreshes before expiry. Capped at 1440 (24h).',
            'int',
            4,
            10,
            0,
            0,
            '(15)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa99f64e-2902-4926-9ea4-1c8e45931ebc' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'RateLimitPerMinute')) BEGIN
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
            'fa99f64e-2902-4926-9ea4-1c8e45931ebc',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100012,
            'RateLimitPerMinute',
            'Rate Limit Per Minute',
            'Maximum number of guest-session mints allowed per minute per source IP/origin for this widget. Reuses the magic-link rate-limit pattern.',
            'int',
            4,
            10,
            0,
            0,
            '(30)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1acea033-d135-436c-8c03-ea506dae37b0' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'VoiceMaxSessionMinutes')) BEGIN
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
            '1acea033-d135-436c-8c03-ea506dae37b0',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100013,
            'VoiceMaxSessionMinutes',
            'Voice Max Session Minutes',
            'Optional hard ceiling (minutes) on a single voice session''s duration for this widget. NULL means fall back to the server-wide default. Voice is the biggest cost/abuse surface; the SessionJanitor enforces this server-side (W4).',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a78c2af9-8d4f-4ca6-931a-66b419de8d13' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'EnabledChannels')) BEGIN
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
            'a78c2af9-8d4f-4ca6-931a-66b419de8d13',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100014,
            'EnabledChannels',
            'Enabled Channels',
            'Which MJ interactive channels this widget may attach when a voice session is active, as a JSON array of channel names (e.g. ["Whiteboard"]). Resolved client-side through MJGlobal.ClassFactory the same way the realtime client driver is resolved; each named channel is scoped by the existing Widget Guest RLS on AI Agent Session Channels. NULL or empty array = no channels (the backwards-compatible default). Remote Browser, given its control surface, should only be listed when a deployment explicitly opts in.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42a9864d-15fc-4edc-8fd0-8fa6b7fabefe' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'HostPublicKey')) BEGIN
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
            '42a9864d-15fc-4edc-8fd0-8fa6b7fabefe',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100015,
            'HostPublicKey',
            'Host Public Key',
            'PEM-encoded RS256 public key for the host-identity auth strategy (D1). When AuthStrategy is HostIdentity, the host signs a short-lived identity assertion with its private key; the HostIdentityProvider verifies it against this per-instance key. Supersedes the interim config map (mj.config.cjs hostPublicKeys keyed by PublicKey). NULL when the widget does not use host identity; a HostIdentity widget with no key fails closed at mint.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8227149-3534-4ac9-8c28-908893ba2c2c' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'RememberReturningVisitors')) BEGIN
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
            'c8227149-3534-4ac9-8c28-908893ba2c2c',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100016,
            'RememberReturningVisitors',
            'Remember Returning Visitors',
            'Returning-visitor memory opt-in (R6). When 0 (default) this widget sets no durable visitor cookie and writes no cross-session recap — fully off. When 1, the widget mints a durable VisitorKey cookie, links each new Conversation to the visitor''s prior one, and writes a recap memory note on close so a returning visitor''s agent opens with prior context.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8773c7a4-317a-4947-b9f5-346dc7cdaba5' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'VisitorMemoryRetentionDays')) BEGIN
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
            '8773c7a4-317a-4947-b9f5-346dc7cdaba5',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100017,
            'VisitorMemoryRetentionDays',
            'Visitor Memory Retention Days',
            'Retention window (days) for returning-visitor recap memory notes generated by this widget. NULL means use the system default. Past this window the visitor''s auto-generated recap notes decay/archive via the Memory Manager. Ignored when RememberReturningVisitors = 0.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de3f0e6c-e5e3-47df-9880-92ded0c24085' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = '__mj_CreatedAt')) BEGIN
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
            'de3f0e6c-e5e3-47df-9880-92ded0c24085',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100018,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4163b93b-f43e-42e0-bdd4-01160b1f42ca' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4163b93b-f43e-42e0-bdd4-01160b1f42ca',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100019,
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

/* SQL text to insert entity field value with ID d3cd4d4b-b061-4061-875a-9f0e993fc6bb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d3cd4d4b-b061-4061-875a-9f0e993fc6bb', '9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094', 1, 'Both', 'Both', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 106b27cf-5dd2-46f3-9794-76915e40b05c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('106b27cf-5dd2-46f3-9794-76915e40b05c', '9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094', 2, 'Text', 'Text', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 58320a02-fe38-4eec-a460-1c4ded2dd519 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58320a02-fe38-4eec-a460-1c4ded2dd519', '9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094', 3, 'Voice', 'Voice', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094';

/* SQL text to insert entity field value with ID 43853eb9-44e2-4d07-a56a-d6fbebf38101 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('43853eb9-44e2-4d07-a56a-d6fbebf38101', '34794587-43D0-451C-9846-AEDA0DFCEE58', 1, 'Anonymous', 'Anonymous', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bda27514-032f-4785-87c5-b9a6e9148ece */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bda27514-032f-4785-87c5-b9a6e9148ece', '34794587-43D0-451C-9846-AEDA0DFCEE58', 2, 'HostIdentity', 'HostIdentity', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4861f26c-88fe-4cb5-8870-28e8deec88d3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4861f26c-88fe-4cb5-8870-28e8deec88d3', '34794587-43D0-451C-9846-AEDA0DFCEE58', 3, 'MagicLinkUpgrade', 'MagicLinkUpgrade', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 34794587-43D0-451C-9846-AEDA0DFCEE58 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='34794587-43D0-451C-9846-AEDA0DFCEE58';

/* SQL text to insert entity field value with ID 6784dee2-6699-48d7-9a3b-eb9b36c9a935 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6784dee2-6699-48d7-9a3b-eb9b36c9a935', 'CDAD88B3-02D2-48F7-BD2A-5DC15CE9EA37', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 306c9586-a69b-4c08-8d2a-4f95b4a0861f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('306c9586-a69b-4c08-8d2a-4f95b4a0861f', 'CDAD88B3-02D2-48F7-BD2A-5DC15CE9EA37', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CDAD88B3-02D2-48F7-BD2A-5DC15CE9EA37 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CDAD88B3-02D2-48F7-BD2A-5DC15CE9EA37';


/* Create Entity Relationship: MJ: AI Agents -> MJ: Conversation Widget Instances (One To Many via PinnedAgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '425589ee-c89d-44da-bfae-8d1c0cae27e1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('425589ee-c89d-44da-bfae-8d1c0cae27e1', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '88026538-D440-48F5-9FE8-A8A7198DBF83', 'PinnedAgentID', 'One To Many', 1, 1, 35, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Roles -> MJ: Conversation Widget Instances (One To Many via GuestRoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd4e1c60f-7844-41a8-823b-8383bea33412'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d4e1c60f-7844-41a8-823b-8383bea33412', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '88026538-D440-48F5-9FE8-A8A7198DBF83', 'GuestRoleID', 'One To Many', 1, 1, 15, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: AI Agent Sessions (One To Many via LinkedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bf6a0485-8ac1-4204-b8b0-023723d7f5b6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bf6a0485-8ac1-4204-b8b0-023723d7f5b6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '17198778-E25A-4457-80AF-9E8C4961DC29', 'LinkedEntityID', 'One To Many', 1, 1, 69, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Applications -> MJ: Conversation Widget Instances (One To Many via ApplicationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '288fa7a0-d0b5-45bb-b61a-8c64f78fec76'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('288fa7a0-d0b5-45bb-b61a-8c64f78fec76', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', '88026538-D440-48F5-9FE8-A8A7198DBF83', 'ApplicationID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Conversations -> MJ: Conversations (One To Many via LastConversationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b90218d9-99e4-4d55-8f34-fd025e710c2d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b90218d9-99e4-4d55-8f34-fd025e710c2d', '13248F34-2837-EF11-86D4-6045BDEE16E6', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'LastConversationID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;

/* Root ID Function SQL for MJ: AI Agent Notes.ConsolidatedIntoNoteID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: fnAIAgentNoteConsolidatedIntoNoteID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentNote].[ConsolidatedIntoNoteID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentNoteConsolidatedIntoNoteID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentNoteConsolidatedIntoNoteID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentNoteConsolidatedIntoNoteID_GetRootID]
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
            [ConsolidatedIntoNoteID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentNote]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ConsolidatedIntoNoteID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentNote] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ConsolidatedIntoNoteID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ConsolidatedIntoNoteID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Notes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentNote
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentNotes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentNotes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentNotes]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIAgentNoteType_AgentNoteTypeID.[Name] AS [AgentNoteType],
    MJUser_UserID.[Name] AS [User],
    MJConversation_SourceConversationID.[Name] AS [SourceConversation],
    MJConversationDetail_SourceConversationDetailID.[ExternalID] AS [SourceConversationDetail],
    MJAIAgentRun_SourceAIAgentRunID.[RunName] AS [SourceAIAgentRun],
    MJCompany_CompanyID.[Name] AS [Company],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJEntity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity],
    MJAIAgentNote_ConsolidatedIntoNoteID.[Type] AS [ConsolidatedIntoNote],
    root_ConsolidatedIntoNoteID.RootID AS [RootConsolidatedIntoNoteID]
FROM
    [${flyway:defaultSchema}].[AIAgentNote] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentNoteType] AS MJAIAgentNoteType_AgentNoteTypeID
  ON
    [a].[AgentNoteTypeID] = MJAIAgentNoteType_AgentNoteTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_SourceConversationID
  ON
    [a].[SourceConversationID] = MJConversation_SourceConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_SourceConversationDetailID
  ON
    [a].[SourceConversationDetailID] = MJConversationDetail_SourceConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_SourceAIAgentRunID
  ON
    [a].[SourceAIAgentRunID] = MJAIAgentRun_SourceAIAgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [a].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [a].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = MJEntity_PrimaryScopeEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentNote] AS MJAIAgentNote_ConsolidatedIntoNoteID
  ON
    [a].[ConsolidatedIntoNoteID] = MJAIAgentNote_ConsolidatedIntoNoteID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentNoteConsolidatedIntoNoteID_GetRootID]([a].[ID], [a].[ConsolidatedIntoNoteID]) AS root_ConsolidatedIntoNoteID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: Permissions for vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spCreateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote]
    @ID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @AgentNoteTypeID_Clear bit = 0,
    @AgentNoteTypeID uniqueidentifier = NULL,
    @Note_Clear bit = 0,
    @Note nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @IsAutoGenerated bit = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @ConsolidatedIntoNoteID_Clear bit = 0,
    @ConsolidatedIntoNoteID uniqueidentifier = NULL,
    @ConsolidationCount int = NULL,
    @DerivedFromNoteIDs_Clear bit = 0,
    @DerivedFromNoteIDs nvarchar(MAX) = NULL,
    @ProtectionTier nvarchar(20) = NULL,
    @ImportanceScore_Clear bit = 0,
    @ImportanceScore decimal(5, 2) = NULL,
    @AuthorType nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentNote]
            (
                [ID],
                [AgentID],
                [AgentNoteTypeID],
                [Note],
                [UserID],
                [Type],
                [IsAutoGenerated],
                [Comments],
                [Status],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [CompanyID],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt],
                [ConsolidatedIntoNoteID],
                [ConsolidationCount],
                [DerivedFromNoteIDs],
                [ProtectionTier],
                [ImportanceScore],
                [AuthorType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @AgentNoteTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AgentNoteTypeID, NULL) END,
                CASE WHEN @Note_Clear = 1 THEN NULL ELSE ISNULL(@Note, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                ISNULL(@Type, 'Preference'),
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @ConsolidatedIntoNoteID_Clear = 1 THEN NULL ELSE ISNULL(@ConsolidatedIntoNoteID, NULL) END,
                ISNULL(@ConsolidationCount, 0),
                CASE WHEN @DerivedFromNoteIDs_Clear = 1 THEN NULL ELSE ISNULL(@DerivedFromNoteIDs, NULL) END,
                ISNULL(@ProtectionTier, 'Standard'),
                CASE WHEN @ImportanceScore_Clear = 1 THEN NULL ELSE ISNULL(@ImportanceScore, NULL) END,
                ISNULL(@AuthorType, 'MemoryManager')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentNote]
            (
                [AgentID],
                [AgentNoteTypeID],
                [Note],
                [UserID],
                [Type],
                [IsAutoGenerated],
                [Comments],
                [Status],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [CompanyID],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt],
                [ConsolidatedIntoNoteID],
                [ConsolidationCount],
                [DerivedFromNoteIDs],
                [ProtectionTier],
                [ImportanceScore],
                [AuthorType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @AgentNoteTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AgentNoteTypeID, NULL) END,
                CASE WHEN @Note_Clear = 1 THEN NULL ELSE ISNULL(@Note, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                ISNULL(@Type, 'Preference'),
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @ConsolidatedIntoNoteID_Clear = 1 THEN NULL ELSE ISNULL(@ConsolidatedIntoNoteID, NULL) END,
                ISNULL(@ConsolidationCount, 0),
                CASE WHEN @DerivedFromNoteIDs_Clear = 1 THEN NULL ELSE ISNULL(@DerivedFromNoteIDs, NULL) END,
                ISNULL(@ProtectionTier, 'Standard'),
                CASE WHEN @ImportanceScore_Clear = 1 THEN NULL ELSE ISNULL(@ImportanceScore, NULL) END,
                ISNULL(@AuthorType, 'MemoryManager')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spUpdateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote]
    @ID uniqueidentifier,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @AgentNoteTypeID_Clear bit = 0,
    @AgentNoteTypeID uniqueidentifier = NULL,
    @Note_Clear bit = 0,
    @Note nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @IsAutoGenerated bit = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @ConsolidatedIntoNoteID_Clear bit = 0,
    @ConsolidatedIntoNoteID uniqueidentifier = NULL,
    @ConsolidationCount int = NULL,
    @DerivedFromNoteIDs_Clear bit = 0,
    @DerivedFromNoteIDs nvarchar(MAX) = NULL,
    @ProtectionTier nvarchar(20) = NULL,
    @ImportanceScore_Clear bit = 0,
    @ImportanceScore decimal(5, 2) = NULL,
    @AuthorType nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [AgentNoteTypeID] = CASE WHEN @AgentNoteTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AgentNoteTypeID, [AgentNoteTypeID]) END,
        [Note] = CASE WHEN @Note_Clear = 1 THEN NULL ELSE ISNULL(@Note, [Note]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [Type] = ISNULL(@Type, [Type]),
        [IsAutoGenerated] = ISNULL(@IsAutoGenerated, [IsAutoGenerated]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [Status] = ISNULL(@Status, [Status]),
        [SourceConversationID] = CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, [SourceConversationID]) END,
        [SourceConversationDetailID] = CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, [SourceConversationDetailID]) END,
        [SourceAIAgentRunID] = CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, [SourceAIAgentRunID]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [PrimaryScopeEntityID] = CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, [PrimaryScopeEntityID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [SecondaryScopes] = CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, [SecondaryScopes]) END,
        [LastAccessedAt] = CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, [LastAccessedAt]) END,
        [AccessCount] = ISNULL(@AccessCount, [AccessCount]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [ConsolidatedIntoNoteID] = CASE WHEN @ConsolidatedIntoNoteID_Clear = 1 THEN NULL ELSE ISNULL(@ConsolidatedIntoNoteID, [ConsolidatedIntoNoteID]) END,
        [ConsolidationCount] = ISNULL(@ConsolidationCount, [ConsolidationCount]),
        [DerivedFromNoteIDs] = CASE WHEN @DerivedFromNoteIDs_Clear = 1 THEN NULL ELSE ISNULL(@DerivedFromNoteIDs, [DerivedFromNoteIDs]) END,
        [ProtectionTier] = ISNULL(@ProtectionTier, [ProtectionTier]),
        [ImportanceScore] = CASE WHEN @ImportanceScore_Clear = 1 THEN NULL ELSE ISNULL(@ImportanceScore, [ImportanceScore]) END,
        [AuthorType] = ISNULL(@AuthorType, [AuthorType])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentNotes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentNote]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentNote];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentNote
ON [${flyway:defaultSchema}].[AIAgentNote]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentNote] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spDeleteAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentNote]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentNote]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for AIAgentSession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_AgentID ON [${flyway:defaultSchema}].[AIAgentSession] ([AgentID]);

-- Index for foreign key UserID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_UserID ON [${flyway:defaultSchema}].[AIAgentSession] ([UserID]);

-- Index for foreign key ConversationID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_ConversationID ON [${flyway:defaultSchema}].[AIAgentSession] ([ConversationID]);

-- Index for foreign key LastSessionID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_LastSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_LastSessionID ON [${flyway:defaultSchema}].[AIAgentSession] ([LastSessionID]);

-- Index for foreign key RecordingFileID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_RecordingFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_RecordingFileID ON [${flyway:defaultSchema}].[AIAgentSession] ([RecordingFileID]);

-- Index for foreign key LinkedEntityID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_LinkedEntityID ON [${flyway:defaultSchema}].[AIAgentSession] ([LinkedEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 39D168D2-F07B-4D85-BB95-08CB2D786E0F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='39D168D2-F07B-4D85-BB95-08CB2D786E0F', @RelatedEntityNameFieldMap='LinkedEntity';

/* Root ID Function SQL for MJ: AI Agent Sessions.LastSessionID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: fnAIAgentSessionLastSessionID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentSession].[LastSessionID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentSessionLastSessionID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentSessionLastSessionID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentSessionLastSessionID_GetRootID]
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
            [LastSessionID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentSession]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[LastSessionID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentSession] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[LastSessionID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [LastSessionID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: vwAIAgentSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Sessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentSessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentSessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentSessions]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJUser_UserID.[Name] AS [User],
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJFile_RecordingFileID.[Name] AS [RecordingFile],
    MJEntity_LinkedEntityID.[Name] AS [LinkedEntity],
    root_LastSessionID.RootID AS [RootLastSessionID]
FROM
    [${flyway:defaultSchema}].[AIAgentSession] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [a].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_RecordingFileID
  ON
    [a].[RecordingFileID] = MJFile_RecordingFileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_LinkedEntityID
  ON
    [a].[LinkedEntityID] = MJEntity_LinkedEntityID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentSessionLastSessionID_GetRootID]([a].[ID], [a].[LastSessionID]) AS root_LastSessionID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: Permissions for vwAIAgentSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: spCreateAIAgentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSession]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @UserID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @LastSessionID_Clear bit = 0,
    @LastSessionID uniqueidentifier = NULL,
    @HostInstanceID_Clear bit = 0,
    @HostInstanceID nvarchar(200) = NULL,
    @Config_Clear bit = 0,
    @Config nvarchar(MAX) = NULL,
    @LastActiveAt datetimeoffset = NULL,
    @ClosedAt_Clear bit = 0,
    @ClosedAt datetimeoffset = NULL,
    @CloseReason_Clear bit = 0,
    @CloseReason nvarchar(20) = NULL,
    @RecordingMedia_Clear bit = 0,
    @RecordingMedia nvarchar(20) = NULL,
    @RecordingStartedAt_Clear bit = 0,
    @RecordingStartedAt datetimeoffset = NULL,
    @RecordingFileID_Clear bit = 0,
    @RecordingFileID uniqueidentifier = NULL,
    @LinkedEntityID_Clear bit = 0,
    @LinkedEntityID uniqueidentifier = NULL,
    @LinkedRecordID_Clear bit = 0,
    @LinkedRecordID nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSession]
            (
                [ID],
                [AgentID],
                [UserID],
                [Status],
                [ConversationID],
                [LastSessionID],
                [HostInstanceID],
                [Config],
                [LastActiveAt],
                [ClosedAt],
                [CloseReason],
                [RecordingMedia],
                [RecordingStartedAt],
                [RecordingFileID],
                [LinkedEntityID],
                [LinkedRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @UserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @LastSessionID_Clear = 1 THEN NULL ELSE ISNULL(@LastSessionID, NULL) END,
                CASE WHEN @HostInstanceID_Clear = 1 THEN NULL ELSE ISNULL(@HostInstanceID, NULL) END,
                CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, NULL) END,
                ISNULL(@LastActiveAt, sysdatetimeoffset()),
                CASE WHEN @ClosedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClosedAt, NULL) END,
                CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, NULL) END,
                CASE WHEN @RecordingMedia_Clear = 1 THEN NULL ELSE ISNULL(@RecordingMedia, NULL) END,
                CASE WHEN @RecordingStartedAt_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStartedAt, NULL) END,
                CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, NULL) END,
                CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, NULL) END,
                CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSession]
            (
                [AgentID],
                [UserID],
                [Status],
                [ConversationID],
                [LastSessionID],
                [HostInstanceID],
                [Config],
                [LastActiveAt],
                [ClosedAt],
                [CloseReason],
                [RecordingMedia],
                [RecordingStartedAt],
                [RecordingFileID],
                [LinkedEntityID],
                [LinkedRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @UserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @LastSessionID_Clear = 1 THEN NULL ELSE ISNULL(@LastSessionID, NULL) END,
                CASE WHEN @HostInstanceID_Clear = 1 THEN NULL ELSE ISNULL(@HostInstanceID, NULL) END,
                CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, NULL) END,
                ISNULL(@LastActiveAt, sysdatetimeoffset()),
                CASE WHEN @ClosedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClosedAt, NULL) END,
                CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, NULL) END,
                CASE WHEN @RecordingMedia_Clear = 1 THEN NULL ELSE ISNULL(@RecordingMedia, NULL) END,
                CASE WHEN @RecordingStartedAt_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStartedAt, NULL) END,
                CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, NULL) END,
                CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, NULL) END,
                CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentSessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: spUpdateAIAgentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSession]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @LastSessionID_Clear bit = 0,
    @LastSessionID uniqueidentifier = NULL,
    @HostInstanceID_Clear bit = 0,
    @HostInstanceID nvarchar(200) = NULL,
    @Config_Clear bit = 0,
    @Config nvarchar(MAX) = NULL,
    @LastActiveAt datetimeoffset = NULL,
    @ClosedAt_Clear bit = 0,
    @ClosedAt datetimeoffset = NULL,
    @CloseReason_Clear bit = 0,
    @CloseReason nvarchar(20) = NULL,
    @RecordingMedia_Clear bit = 0,
    @RecordingMedia nvarchar(20) = NULL,
    @RecordingStartedAt_Clear bit = 0,
    @RecordingStartedAt datetimeoffset = NULL,
    @RecordingFileID_Clear bit = 0,
    @RecordingFileID uniqueidentifier = NULL,
    @LinkedEntityID_Clear bit = 0,
    @LinkedEntityID uniqueidentifier = NULL,
    @LinkedRecordID_Clear bit = 0,
    @LinkedRecordID nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSession]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [Status] = ISNULL(@Status, [Status]),
        [ConversationID] = CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, [ConversationID]) END,
        [LastSessionID] = CASE WHEN @LastSessionID_Clear = 1 THEN NULL ELSE ISNULL(@LastSessionID, [LastSessionID]) END,
        [HostInstanceID] = CASE WHEN @HostInstanceID_Clear = 1 THEN NULL ELSE ISNULL(@HostInstanceID, [HostInstanceID]) END,
        [Config] = CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, [Config]) END,
        [LastActiveAt] = ISNULL(@LastActiveAt, [LastActiveAt]),
        [ClosedAt] = CASE WHEN @ClosedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClosedAt, [ClosedAt]) END,
        [CloseReason] = CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, [CloseReason]) END,
        [RecordingMedia] = CASE WHEN @RecordingMedia_Clear = 1 THEN NULL ELSE ISNULL(@RecordingMedia, [RecordingMedia]) END,
        [RecordingStartedAt] = CASE WHEN @RecordingStartedAt_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStartedAt, [RecordingStartedAt]) END,
        [RecordingFileID] = CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, [RecordingFileID]) END,
        [LinkedEntityID] = CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, [LinkedEntityID]) END,
        [LinkedRecordID] = CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, [LinkedRecordID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentSessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentSessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentSession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentSession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentSession
ON [${flyway:defaultSchema}].[AIAgentSession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentSession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: spDeleteAIAgentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentSession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSession] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ConversationWidgetInstance */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table ConversationWidgetInstance
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationWidgetInstance_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationWidgetInstance]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationWidgetInstance_ApplicationID ON [${flyway:defaultSchema}].[ConversationWidgetInstance] ([ApplicationID]);

-- Index for foreign key PinnedAgentID in table ConversationWidgetInstance
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationWidgetInstance_PinnedAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationWidgetInstance]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationWidgetInstance_PinnedAgentID ON [${flyway:defaultSchema}].[ConversationWidgetInstance] ([PinnedAgentID]);

-- Index for foreign key GuestRoleID in table ConversationWidgetInstance
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationWidgetInstance_GuestRoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationWidgetInstance]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationWidgetInstance_GuestRoleID ON [${flyway:defaultSchema}].[ConversationWidgetInstance] ([GuestRoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 1F8C1246-6551-4F5D-A18C-5BA817C701E2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1F8C1246-6551-4F5D-A18C-5BA817C701E2', @RelatedEntityNameFieldMap='Application';

/* SQL text to update entity field related entity name field map for entity field ID 6E099DAF-45D2-4908-9230-5AF734A3B330 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6E099DAF-45D2-4908-9230-5AF734A3B330', @RelatedEntityNameFieldMap='PinnedAgent';

/* SQL text to update entity field related entity name field map for entity field ID 7E6F8DFD-272E-4336-9DEF-C8FC5C8EE5D9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7E6F8DFD-272E-4336-9DEF-C8FC5C8EE5D9', @RelatedEntityNameFieldMap='GuestRole';

/* Base View SQL for MJ: Conversation Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: vwConversationWidgetInstances
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Widget Instances
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationWidgetInstance
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationWidgetInstances]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationWidgetInstances];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationWidgetInstances]
AS
SELECT
    c.*,
    MJApplication_ApplicationID.[Name] AS [Application],
    MJAIAgent_PinnedAgentID.[Name] AS [PinnedAgent],
    MJRole_GuestRoleID.[Name] AS [GuestRole]
FROM
    [${flyway:defaultSchema}].[ConversationWidgetInstance] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Application] AS MJApplication_ApplicationID
  ON
    [c].[ApplicationID] = MJApplication_ApplicationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_PinnedAgentID
  ON
    [c].[PinnedAgentID] = MJAIAgent_PinnedAgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_GuestRoleID
  ON
    [c].[GuestRoleID] = MJRole_GuestRoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationWidgetInstances] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversation Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: Permissions for vwConversationWidgetInstances
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationWidgetInstances] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Conversation Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: spCreateConversationWidgetInstance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationWidgetInstance
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationWidgetInstance]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationWidgetInstance];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationWidgetInstance]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @PublicKey nvarchar(100),
    @ApplicationID uniqueidentifier,
    @PinnedAgentID uniqueidentifier,
    @GuestRoleID uniqueidentifier,
    @AllowedOrigins_Clear bit = 0,
    @AllowedOrigins nvarchar(MAX) = NULL,
    @Modality nvarchar(10) = NULL,
    @AuthStrategy nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @SessionTTLMinutes int = NULL,
    @RateLimitPerMinute int = NULL,
    @VoiceMaxSessionMinutes_Clear bit = 0,
    @VoiceMaxSessionMinutes int = NULL,
    @EnabledChannels_Clear bit = 0,
    @EnabledChannels nvarchar(MAX) = NULL,
    @HostPublicKey_Clear bit = 0,
    @HostPublicKey nvarchar(MAX) = NULL,
    @RememberReturningVisitors bit = NULL,
    @VisitorMemoryRetentionDays_Clear bit = 0,
    @VisitorMemoryRetentionDays int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationWidgetInstance]
            (
                [ID],
                [Name],
                [PublicKey],
                [ApplicationID],
                [PinnedAgentID],
                [GuestRoleID],
                [AllowedOrigins],
                [Modality],
                [AuthStrategy],
                [Status],
                [SessionTTLMinutes],
                [RateLimitPerMinute],
                [VoiceMaxSessionMinutes],
                [EnabledChannels],
                [HostPublicKey],
                [RememberReturningVisitors],
                [VisitorMemoryRetentionDays]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @PublicKey,
                @ApplicationID,
                @PinnedAgentID,
                @GuestRoleID,
                CASE WHEN @AllowedOrigins_Clear = 1 THEN NULL ELSE ISNULL(@AllowedOrigins, NULL) END,
                ISNULL(@Modality, 'Text'),
                ISNULL(@AuthStrategy, 'Anonymous'),
                ISNULL(@Status, 'Active'),
                ISNULL(@SessionTTLMinutes, 15),
                ISNULL(@RateLimitPerMinute, 30),
                CASE WHEN @VoiceMaxSessionMinutes_Clear = 1 THEN NULL ELSE ISNULL(@VoiceMaxSessionMinutes, NULL) END,
                CASE WHEN @EnabledChannels_Clear = 1 THEN NULL ELSE ISNULL(@EnabledChannels, NULL) END,
                CASE WHEN @HostPublicKey_Clear = 1 THEN NULL ELSE ISNULL(@HostPublicKey, NULL) END,
                ISNULL(@RememberReturningVisitors, 0),
                CASE WHEN @VisitorMemoryRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@VisitorMemoryRetentionDays, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationWidgetInstance]
            (
                [Name],
                [PublicKey],
                [ApplicationID],
                [PinnedAgentID],
                [GuestRoleID],
                [AllowedOrigins],
                [Modality],
                [AuthStrategy],
                [Status],
                [SessionTTLMinutes],
                [RateLimitPerMinute],
                [VoiceMaxSessionMinutes],
                [EnabledChannels],
                [HostPublicKey],
                [RememberReturningVisitors],
                [VisitorMemoryRetentionDays]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @PublicKey,
                @ApplicationID,
                @PinnedAgentID,
                @GuestRoleID,
                CASE WHEN @AllowedOrigins_Clear = 1 THEN NULL ELSE ISNULL(@AllowedOrigins, NULL) END,
                ISNULL(@Modality, 'Text'),
                ISNULL(@AuthStrategy, 'Anonymous'),
                ISNULL(@Status, 'Active'),
                ISNULL(@SessionTTLMinutes, 15),
                ISNULL(@RateLimitPerMinute, 30),
                CASE WHEN @VoiceMaxSessionMinutes_Clear = 1 THEN NULL ELSE ISNULL(@VoiceMaxSessionMinutes, NULL) END,
                CASE WHEN @EnabledChannels_Clear = 1 THEN NULL ELSE ISNULL(@EnabledChannels, NULL) END,
                CASE WHEN @HostPublicKey_Clear = 1 THEN NULL ELSE ISNULL(@HostPublicKey, NULL) END,
                ISNULL(@RememberReturningVisitors, 0),
                CASE WHEN @VisitorMemoryRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@VisitorMemoryRetentionDays, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationWidgetInstances] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationWidgetInstance] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Widget Instances */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationWidgetInstance] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Conversation Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: spUpdateConversationWidgetInstance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationWidgetInstance
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationWidgetInstance]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationWidgetInstance];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationWidgetInstance]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @PublicKey nvarchar(100) = NULL,
    @ApplicationID uniqueidentifier = NULL,
    @PinnedAgentID uniqueidentifier = NULL,
    @GuestRoleID uniqueidentifier = NULL,
    @AllowedOrigins_Clear bit = 0,
    @AllowedOrigins nvarchar(MAX) = NULL,
    @Modality nvarchar(10) = NULL,
    @AuthStrategy nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @SessionTTLMinutes int = NULL,
    @RateLimitPerMinute int = NULL,
    @VoiceMaxSessionMinutes_Clear bit = 0,
    @VoiceMaxSessionMinutes int = NULL,
    @EnabledChannels_Clear bit = 0,
    @EnabledChannels nvarchar(MAX) = NULL,
    @HostPublicKey_Clear bit = 0,
    @HostPublicKey nvarchar(MAX) = NULL,
    @RememberReturningVisitors bit = NULL,
    @VisitorMemoryRetentionDays_Clear bit = 0,
    @VisitorMemoryRetentionDays int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationWidgetInstance]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [PublicKey] = ISNULL(@PublicKey, [PublicKey]),
        [ApplicationID] = ISNULL(@ApplicationID, [ApplicationID]),
        [PinnedAgentID] = ISNULL(@PinnedAgentID, [PinnedAgentID]),
        [GuestRoleID] = ISNULL(@GuestRoleID, [GuestRoleID]),
        [AllowedOrigins] = CASE WHEN @AllowedOrigins_Clear = 1 THEN NULL ELSE ISNULL(@AllowedOrigins, [AllowedOrigins]) END,
        [Modality] = ISNULL(@Modality, [Modality]),
        [AuthStrategy] = ISNULL(@AuthStrategy, [AuthStrategy]),
        [Status] = ISNULL(@Status, [Status]),
        [SessionTTLMinutes] = ISNULL(@SessionTTLMinutes, [SessionTTLMinutes]),
        [RateLimitPerMinute] = ISNULL(@RateLimitPerMinute, [RateLimitPerMinute]),
        [VoiceMaxSessionMinutes] = CASE WHEN @VoiceMaxSessionMinutes_Clear = 1 THEN NULL ELSE ISNULL(@VoiceMaxSessionMinutes, [VoiceMaxSessionMinutes]) END,
        [EnabledChannels] = CASE WHEN @EnabledChannels_Clear = 1 THEN NULL ELSE ISNULL(@EnabledChannels, [EnabledChannels]) END,
        [HostPublicKey] = CASE WHEN @HostPublicKey_Clear = 1 THEN NULL ELSE ISNULL(@HostPublicKey, [HostPublicKey]) END,
        [RememberReturningVisitors] = ISNULL(@RememberReturningVisitors, [RememberReturningVisitors]),
        [VisitorMemoryRetentionDays] = CASE WHEN @VisitorMemoryRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@VisitorMemoryRetentionDays, [VisitorMemoryRetentionDays]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationWidgetInstances] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationWidgetInstances]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationWidgetInstance] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationWidgetInstance table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationWidgetInstance]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationWidgetInstance];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationWidgetInstance
ON [${flyway:defaultSchema}].[ConversationWidgetInstance]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationWidgetInstance]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationWidgetInstance] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversation Widget Instances */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationWidgetInstance] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: spDeleteConversationWidgetInstance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationWidgetInstance
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationWidgetInstance]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationWidgetInstance]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Widget Instances */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Conversation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_UserID ON [${flyway:defaultSchema}].[Conversation] ([UserID]);

-- Index for foreign key LinkedEntityID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID ON [${flyway:defaultSchema}].[Conversation] ([LinkedEntityID]);

-- Index for foreign key DataContextID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_DataContextID ON [${flyway:defaultSchema}].[Conversation] ([DataContextID]);

-- Index for foreign key EnvironmentID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_EnvironmentID ON [${flyway:defaultSchema}].[Conversation] ([EnvironmentID]);

-- Index for foreign key ProjectID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_ProjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_ProjectID ON [${flyway:defaultSchema}].[Conversation] ([ProjectID]);

-- Index for foreign key TestRunID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_TestRunID ON [${flyway:defaultSchema}].[Conversation] ([TestRunID]);

-- Index for foreign key ApplicationID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_ApplicationID ON [${flyway:defaultSchema}].[Conversation] ([ApplicationID]);

-- Index for foreign key DefaultAgentID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_DefaultAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_DefaultAgentID ON [${flyway:defaultSchema}].[Conversation] ([DefaultAgentID]);

-- Index for foreign key RecordingFileID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_RecordingFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_RecordingFileID ON [${flyway:defaultSchema}].[Conversation] ([RecordingFileID]);

-- Index for foreign key LastConversationID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_LastConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_LastConversationID ON [${flyway:defaultSchema}].[Conversation] ([LastConversationID]);

/* SQL text to update entity field related entity name field map for entity field ID 879E3427-C9B6-4D2B-93E0-3BF6ADFCD361 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='879E3427-C9B6-4D2B-93E0-3BF6ADFCD361', @RelatedEntityNameFieldMap='LastConversation';

/* Root ID Function SQL for MJ: Conversations.LastConversationID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: fnConversationLastConversationID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Conversation].[LastConversationID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnConversationLastConversationID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnConversationLastConversationID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnConversationLastConversationID_GetRootID]
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
            [LastConversationID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Conversation]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[LastConversationID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Conversation] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[LastConversationID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [LastConversationID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Conversation
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversations]
AS
SELECT
    c.*,
    MJUser_UserID.[Name] AS [User],
    MJEntity_LinkedEntityID.[Name] AS [LinkedEntity],
    MJDataContext_DataContextID.[Name] AS [DataContext],
    MJEnvironment_EnvironmentID.[Name] AS [Environment],
    MJProject_ProjectID.[Name] AS [Project],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    MJApplication_ApplicationID.[Name] AS [Application],
    MJAIAgent_DefaultAgentID.[Name] AS [DefaultAgent],
    MJFile_RecordingFileID.[Name] AS [RecordingFile],
    MJConversation_LastConversationID.[Name] AS [LastConversation],
    root_LastConversationID.RootID AS [RootLastConversationID]
FROM
    [${flyway:defaultSchema}].[Conversation] AS c
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [c].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_LinkedEntityID
  ON
    [c].[LinkedEntityID] = MJEntity_LinkedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS MJDataContext_DataContextID
  ON
    [c].[DataContextID] = MJDataContext_DataContextID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS MJEnvironment_EnvironmentID
  ON
    [c].[EnvironmentID] = MJEnvironment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS MJProject_ProjectID
  ON
    [c].[ProjectID] = MJProject_ProjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [c].[TestRunID] = MJTestRun_TestRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Application] AS MJApplication_ApplicationID
  ON
    [c].[ApplicationID] = MJApplication_ApplicationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_DefaultAgentID
  ON
    [c].[DefaultAgentID] = MJAIAgent_DefaultAgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_RecordingFileID
  ON
    [c].[RecordingFileID] = MJFile_RecordingFileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_LastConversationID
  ON
    [c].[LastConversationID] = MJConversation_LastConversationID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnConversationLastConversationID_GetRootID]([c].[ID], [c].[LastConversationID]) AS root_LastConversationID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: Permissions for vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spCreateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversation]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(500) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Type nvarchar(50) = NULL,
    @IsArchived bit = NULL,
    @LinkedEntityID_Clear bit = 0,
    @LinkedEntityID uniqueidentifier = NULL,
    @LinkedRecordID_Clear bit = 0,
    @LinkedRecordID nvarchar(500) = NULL,
    @DataContextID_Clear bit = 0,
    @DataContextID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @ProjectID_Clear bit = 0,
    @ProjectID uniqueidentifier = NULL,
    @IsPinned bit = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ApplicationScope nvarchar(20) = NULL,
    @ApplicationID_Clear bit = 0,
    @ApplicationID uniqueidentifier = NULL,
    @DefaultAgentID_Clear bit = 0,
    @DefaultAgentID uniqueidentifier = NULL,
    @AdditionalData_Clear bit = 0,
    @AdditionalData nvarchar(MAX) = NULL,
    @RecordingFileID_Clear bit = 0,
    @RecordingFileID uniqueidentifier = NULL,
    @EgressID_Clear bit = 0,
    @EgressID nvarchar(255) = NULL,
    @VisitorKey_Clear bit = 0,
    @VisitorKey nvarchar(255) = NULL,
    @LastConversationID_Clear bit = 0,
    @LastConversationID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Conversation]
            (
                [ID],
                [UserID],
                [ExternalID],
                [Name],
                [Description],
                [Type],
                [IsArchived],
                [LinkedEntityID],
                [LinkedRecordID],
                [DataContextID],
                [Status],
                [EnvironmentID],
                [ProjectID],
                [IsPinned],
                [TestRunID],
                [ApplicationScope],
                [ApplicationID],
                [DefaultAgentID],
                [AdditionalData],
                [RecordingFileID],
                [EgressID],
                [VisitorKey],
                [LastConversationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Type, 'Skip'),
                ISNULL(@IsArchived, 0),
                CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, NULL) END,
                CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, NULL) END,
                CASE WHEN @DataContextID_Clear = 1 THEN NULL ELSE ISNULL(@DataContextID, NULL) END,
                ISNULL(@Status, 'Available'),
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN @ProjectID_Clear = 1 THEN NULL ELSE ISNULL(@ProjectID, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                ISNULL(@ApplicationScope, 'Global'),
                CASE WHEN @ApplicationID_Clear = 1 THEN NULL ELSE ISNULL(@ApplicationID, NULL) END,
                CASE WHEN @DefaultAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultAgentID, NULL) END,
                CASE WHEN @AdditionalData_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalData, NULL) END,
                CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, NULL) END,
                CASE WHEN @EgressID_Clear = 1 THEN NULL ELSE ISNULL(@EgressID, NULL) END,
                CASE WHEN @VisitorKey_Clear = 1 THEN NULL ELSE ISNULL(@VisitorKey, NULL) END,
                CASE WHEN @LastConversationID_Clear = 1 THEN NULL ELSE ISNULL(@LastConversationID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Conversation]
            (
                [UserID],
                [ExternalID],
                [Name],
                [Description],
                [Type],
                [IsArchived],
                [LinkedEntityID],
                [LinkedRecordID],
                [DataContextID],
                [Status],
                [EnvironmentID],
                [ProjectID],
                [IsPinned],
                [TestRunID],
                [ApplicationScope],
                [ApplicationID],
                [DefaultAgentID],
                [AdditionalData],
                [RecordingFileID],
                [EgressID],
                [VisitorKey],
                [LastConversationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Type, 'Skip'),
                ISNULL(@IsArchived, 0),
                CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, NULL) END,
                CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, NULL) END,
                CASE WHEN @DataContextID_Clear = 1 THEN NULL ELSE ISNULL(@DataContextID, NULL) END,
                ISNULL(@Status, 'Available'),
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN @ProjectID_Clear = 1 THEN NULL ELSE ISNULL(@ProjectID, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                ISNULL(@ApplicationScope, 'Global'),
                CASE WHEN @ApplicationID_Clear = 1 THEN NULL ELSE ISNULL(@ApplicationID, NULL) END,
                CASE WHEN @DefaultAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultAgentID, NULL) END,
                CASE WHEN @AdditionalData_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalData, NULL) END,
                CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, NULL) END,
                CASE WHEN @EgressID_Clear = 1 THEN NULL ELSE ISNULL(@EgressID, NULL) END,
                CASE WHEN @VisitorKey_Clear = 1 THEN NULL ELSE ISNULL(@VisitorKey, NULL) END,
                CASE WHEN @LastConversationID_Clear = 1 THEN NULL ELSE ISNULL(@LastConversationID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate Permissions for MJ: Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spUpdate SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spUpdateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversation]
    @ID uniqueidentifier,
    @UserID uniqueidentifier = NULL,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(500) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Type nvarchar(50) = NULL,
    @IsArchived bit = NULL,
    @LinkedEntityID_Clear bit = 0,
    @LinkedEntityID uniqueidentifier = NULL,
    @LinkedRecordID_Clear bit = 0,
    @LinkedRecordID nvarchar(500) = NULL,
    @DataContextID_Clear bit = 0,
    @DataContextID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @ProjectID_Clear bit = 0,
    @ProjectID uniqueidentifier = NULL,
    @IsPinned bit = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ApplicationScope nvarchar(20) = NULL,
    @ApplicationID_Clear bit = 0,
    @ApplicationID uniqueidentifier = NULL,
    @DefaultAgentID_Clear bit = 0,
    @DefaultAgentID uniqueidentifier = NULL,
    @AdditionalData_Clear bit = 0,
    @AdditionalData nvarchar(MAX) = NULL,
    @RecordingFileID_Clear bit = 0,
    @RecordingFileID uniqueidentifier = NULL,
    @EgressID_Clear bit = 0,
    @EgressID nvarchar(255) = NULL,
    @VisitorKey_Clear bit = 0,
    @VisitorKey nvarchar(255) = NULL,
    @LastConversationID_Clear bit = 0,
    @LastConversationID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        [UserID] = ISNULL(@UserID, [UserID]),
        [ExternalID] = CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, [ExternalID]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Type] = ISNULL(@Type, [Type]),
        [IsArchived] = ISNULL(@IsArchived, [IsArchived]),
        [LinkedEntityID] = CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, [LinkedEntityID]) END,
        [LinkedRecordID] = CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, [LinkedRecordID]) END,
        [DataContextID] = CASE WHEN @DataContextID_Clear = 1 THEN NULL ELSE ISNULL(@DataContextID, [DataContextID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [EnvironmentID] = ISNULL(@EnvironmentID, [EnvironmentID]),
        [ProjectID] = CASE WHEN @ProjectID_Clear = 1 THEN NULL ELSE ISNULL(@ProjectID, [ProjectID]) END,
        [IsPinned] = ISNULL(@IsPinned, [IsPinned]),
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [ApplicationScope] = ISNULL(@ApplicationScope, [ApplicationScope]),
        [ApplicationID] = CASE WHEN @ApplicationID_Clear = 1 THEN NULL ELSE ISNULL(@ApplicationID, [ApplicationID]) END,
        [DefaultAgentID] = CASE WHEN @DefaultAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultAgentID, [DefaultAgentID]) END,
        [AdditionalData] = CASE WHEN @AdditionalData_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalData, [AdditionalData]) END,
        [RecordingFileID] = CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, [RecordingFileID]) END,
        [EgressID] = CASE WHEN @EgressID_Clear = 1 THEN NULL ELSE ISNULL(@EgressID, [EgressID]) END,
        [VisitorKey] = CASE WHEN @VisitorKey_Clear = 1 THEN NULL ELSE ISNULL(@VisitorKey, [VisitorKey]) END,
        [LastConversationID] = CASE WHEN @LastConversationID_Clear = 1 THEN NULL ELSE ISNULL(@LastConversationID, [LastConversationID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Conversation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversation
ON [${flyway:defaultSchema}].[Conversation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Conversation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationID_cursor INTO @MJAIAgentExamples_SourceConversationIDID, @MJAIAgentExamples_SourceConversationID_AgentID, @MJAIAgentExamples_SourceConversationID_UserID, @MJAIAgentExamples_SourceConversationID_CompanyID, @MJAIAgentExamples_SourceConversationID_Type, @MJAIAgentExamples_SourceConversationID_ExampleInput, @MJAIAgentExamples_SourceConversationID_ExampleOutput, @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationID_SourceConversationID, @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationID_SuccessScore, @MJAIAgentExamples_SourceConversationID_Comments, @MJAIAgentExamples_SourceConversationID_Status, @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @MJAIAgentExamples_SourceConversationID_AccessCount, @MJAIAgentExamples_SourceConversationID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationID_SourceConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationIDID, @AgentID = @MJAIAgentExamples_SourceConversationID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @SourceConversationID_Clear = 1, @SourceConversationID = @MJAIAgentExamples_SourceConversationID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationID_Comments, @Status = @MJAIAgentExamples_SourceConversationID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationID_cursor INTO @MJAIAgentExamples_SourceConversationIDID, @MJAIAgentExamples_SourceConversationID_AgentID, @MJAIAgentExamples_SourceConversationID_UserID, @MJAIAgentExamples_SourceConversationID_CompanyID, @MJAIAgentExamples_SourceConversationID_Type, @MJAIAgentExamples_SourceConversationID_ExampleInput, @MJAIAgentExamples_SourceConversationID_ExampleOutput, @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationID_SourceConversationID, @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationID_SuccessScore, @MJAIAgentExamples_SourceConversationID_Comments, @MJAIAgentExamples_SourceConversationID_Status, @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @MJAIAgentExamples_SourceConversationID_AccessCount, @MJAIAgentExamples_SourceConversationID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceConversationID_AuthorType nvarchar(20)
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore, @MJAIAgentNotes_SourceConversationID_AuthorType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationID_SourceConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationIDID, @AgentID = @MJAIAgentNotes_SourceConversationID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationID_Note, @UserID = @MJAIAgentNotes_SourceConversationID_UserID, @Type = @MJAIAgentNotes_SourceConversationID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationID_Comments, @Status = @MJAIAgentNotes_SourceConversationID_Status, @SourceConversationID_Clear = 1, @SourceConversationID = @MJAIAgentNotes_SourceConversationID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceConversationID_AuthorType

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore, @MJAIAgentNotes_SourceConversationID_AuthorType
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_Success bit
    DECLARE @MJAIAgentRuns_ConversationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRuns_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationIDID, @AgentID = @MJAIAgentRuns_ConversationID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationID_ParentRunID, @Status = @MJAIAgentRuns_ConversationID_Status, @StartedAt = @MJAIAgentRuns_ConversationID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationID_CompletedAt, @Success = @MJAIAgentRuns_ConversationID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationID_ErrorMessage, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentRuns_ConversationID_ConversationID, @UserID = @MJAIAgentRuns_ConversationID_UserID, @Result = @MJAIAgentRuns_ConversationID_Result, @AgentState = @MJAIAgentRuns_ConversationID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConversationID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationID_FinalPayload, @Message = @MJAIAgentRuns_ConversationID_Message, @LastRunID = @MJAIAgentRuns_ConversationID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationID_Data, @Verbose = @MJAIAgentRuns_ConversationID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationID_RunName, @Comments = @MJAIAgentRuns_ConversationID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConversationID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationID_cursor
    
    -- Cascade update on AIAgentSession using cursor to call spUpdateAIAgentSession
    DECLARE @MJAIAgentSessions_ConversationIDID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LastSessionID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_HostInstanceID nvarchar(200)
    DECLARE @MJAIAgentSessions_ConversationID_Config nvarchar(MAX)
    DECLARE @MJAIAgentSessions_ConversationID_LastActiveAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_ClosedAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_CloseReason nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingMedia nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingStartedAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_RecordingFileID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LinkedEntityID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LinkedRecordID nvarchar(500)
    DECLARE cascade_update_MJAIAgentSessions_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [Status], [ConversationID], [LastSessionID], [HostInstanceID], [Config], [LastActiveAt], [ClosedAt], [CloseReason], [RecordingMedia], [RecordingStartedAt], [RecordingFileID], [LinkedEntityID], [LinkedRecordID]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentSessions_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSessions_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentSession] @ID = @MJAIAgentSessions_ConversationIDID, @AgentID = @MJAIAgentSessions_ConversationID_AgentID, @UserID = @MJAIAgentSessions_ConversationID_UserID, @Status = @MJAIAgentSessions_ConversationID_Status, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentSessions_ConversationID_ConversationID, @LastSessionID = @MJAIAgentSessions_ConversationID_LastSessionID, @HostInstanceID = @MJAIAgentSessions_ConversationID_HostInstanceID, @Config = @MJAIAgentSessions_ConversationID_Config, @LastActiveAt = @MJAIAgentSessions_ConversationID_LastActiveAt, @ClosedAt = @MJAIAgentSessions_ConversationID_ClosedAt, @CloseReason = @MJAIAgentSessions_ConversationID_CloseReason, @RecordingMedia = @MJAIAgentSessions_ConversationID_RecordingMedia, @RecordingStartedAt = @MJAIAgentSessions_ConversationID_RecordingStartedAt, @RecordingFileID = @MJAIAgentSessions_ConversationID_RecordingFileID, @LinkedEntityID = @MJAIAgentSessions_ConversationID_LinkedEntityID, @LinkedRecordID = @MJAIAgentSessions_ConversationID_LinkedRecordID

        FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID
    END

    CLOSE cascade_update_MJAIAgentSessions_ConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentSessions_ConversationID_cursor
    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact
    DECLARE @MJConversationArtifacts_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationArtifacts_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifact]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationArtifacts_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationArtifacts_ConversationID_cursor INTO @MJConversationArtifacts_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifact] @ID = @MJConversationArtifacts_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationArtifacts_ConversationID_cursor INTO @MJConversationArtifacts_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationArtifacts_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationArtifacts_ConversationID_cursor
    
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail
    DECLARE @MJConversationDetails_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetails_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationDetails_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetails_ConversationID_cursor INTO @MJConversationDetails_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetail] @ID = @MJConversationDetails_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetails_ConversationID_cursor INTO @MJConversationDetails_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationDetails_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationDetails_ConversationID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_LastConversationIDID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_UserID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ExternalID nvarchar(500)
    DECLARE @MJConversations_LastConversationID_Name nvarchar(255)
    DECLARE @MJConversations_LastConversationID_Description nvarchar(MAX)
    DECLARE @MJConversations_LastConversationID_Type nvarchar(50)
    DECLARE @MJConversations_LastConversationID_IsArchived bit
    DECLARE @MJConversations_LastConversationID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_LastConversationID_DataContextID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_Status nvarchar(20)
    DECLARE @MJConversations_LastConversationID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ProjectID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_IsPinned bit
    DECLARE @MJConversations_LastConversationID_TestRunID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_LastConversationID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_LastConversationID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_EgressID nvarchar(255)
    DECLARE @MJConversations_LastConversationID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_LastConversationID_LastConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_LastConversationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [LastConversationID] = @ID

    OPEN cascade_update_MJConversations_LastConversationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_LastConversationID_cursor INTO @MJConversations_LastConversationIDID, @MJConversations_LastConversationID_UserID, @MJConversations_LastConversationID_ExternalID, @MJConversations_LastConversationID_Name, @MJConversations_LastConversationID_Description, @MJConversations_LastConversationID_Type, @MJConversations_LastConversationID_IsArchived, @MJConversations_LastConversationID_LinkedEntityID, @MJConversations_LastConversationID_LinkedRecordID, @MJConversations_LastConversationID_DataContextID, @MJConversations_LastConversationID_Status, @MJConversations_LastConversationID_EnvironmentID, @MJConversations_LastConversationID_ProjectID, @MJConversations_LastConversationID_IsPinned, @MJConversations_LastConversationID_TestRunID, @MJConversations_LastConversationID_ApplicationScope, @MJConversations_LastConversationID_ApplicationID, @MJConversations_LastConversationID_DefaultAgentID, @MJConversations_LastConversationID_AdditionalData, @MJConversations_LastConversationID_RecordingFileID, @MJConversations_LastConversationID_EgressID, @MJConversations_LastConversationID_VisitorKey, @MJConversations_LastConversationID_LastConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_LastConversationID_LastConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_LastConversationIDID, @UserID = @MJConversations_LastConversationID_UserID, @ExternalID = @MJConversations_LastConversationID_ExternalID, @Name = @MJConversations_LastConversationID_Name, @Description = @MJConversations_LastConversationID_Description, @Type = @MJConversations_LastConversationID_Type, @IsArchived = @MJConversations_LastConversationID_IsArchived, @LinkedEntityID = @MJConversations_LastConversationID_LinkedEntityID, @LinkedRecordID = @MJConversations_LastConversationID_LinkedRecordID, @DataContextID = @MJConversations_LastConversationID_DataContextID, @Status = @MJConversations_LastConversationID_Status, @EnvironmentID = @MJConversations_LastConversationID_EnvironmentID, @ProjectID = @MJConversations_LastConversationID_ProjectID, @IsPinned = @MJConversations_LastConversationID_IsPinned, @TestRunID = @MJConversations_LastConversationID_TestRunID, @ApplicationScope = @MJConversations_LastConversationID_ApplicationScope, @ApplicationID = @MJConversations_LastConversationID_ApplicationID, @DefaultAgentID = @MJConversations_LastConversationID_DefaultAgentID, @AdditionalData = @MJConversations_LastConversationID_AdditionalData, @RecordingFileID = @MJConversations_LastConversationID_RecordingFileID, @EgressID = @MJConversations_LastConversationID_EgressID, @VisitorKey = @MJConversations_LastConversationID_VisitorKey, @LastConversationID_Clear = 1, @LastConversationID = @MJConversations_LastConversationID_LastConversationID

        FETCH NEXT FROM cascade_update_MJConversations_LastConversationID_cursor INTO @MJConversations_LastConversationIDID, @MJConversations_LastConversationID_UserID, @MJConversations_LastConversationID_ExternalID, @MJConversations_LastConversationID_Name, @MJConversations_LastConversationID_Description, @MJConversations_LastConversationID_Type, @MJConversations_LastConversationID_IsArchived, @MJConversations_LastConversationID_LinkedEntityID, @MJConversations_LastConversationID_LinkedRecordID, @MJConversations_LastConversationID_DataContextID, @MJConversations_LastConversationID_Status, @MJConversations_LastConversationID_EnvironmentID, @MJConversations_LastConversationID_ProjectID, @MJConversations_LastConversationID_IsPinned, @MJConversations_LastConversationID_TestRunID, @MJConversations_LastConversationID_ApplicationScope, @MJConversations_LastConversationID_ApplicationID, @MJConversations_LastConversationID_DefaultAgentID, @MJConversations_LastConversationID_AdditionalData, @MJConversations_LastConversationID_RecordingFileID, @MJConversations_LastConversationID_EgressID, @MJConversations_LastConversationID_VisitorKey, @MJConversations_LastConversationID_LastConversationID
    END

    CLOSE cascade_update_MJConversations_LastConversationID_cursor
    DEALLOCATE cascade_update_MJConversations_LastConversationID_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @MJReports_ConversationIDID uniqueidentifier
    DECLARE @MJReports_ConversationID_Name nvarchar(255)
    DECLARE @MJReports_ConversationID_Description nvarchar(MAX)
    DECLARE @MJReports_ConversationID_CategoryID uniqueidentifier
    DECLARE @MJReports_ConversationID_UserID uniqueidentifier
    DECLARE @MJReports_ConversationID_SharingScope nvarchar(20)
    DECLARE @MJReports_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJReports_ConversationID_ConversationDetailID uniqueidentifier
    DECLARE @MJReports_ConversationID_DataContextID uniqueidentifier
    DECLARE @MJReports_ConversationID_Configuration nvarchar(MAX)
    DECLARE @MJReports_ConversationID_OutputTriggerTypeID uniqueidentifier
    DECLARE @MJReports_ConversationID_OutputFormatTypeID uniqueidentifier
    DECLARE @MJReports_ConversationID_OutputDeliveryTypeID uniqueidentifier
    DECLARE @MJReports_ConversationID_OutputFrequency nvarchar(50)
    DECLARE @MJReports_ConversationID_OutputTargetEmail nvarchar(255)
    DECLARE @MJReports_ConversationID_OutputWorkflowID uniqueidentifier
    DECLARE @MJReports_ConversationID_Thumbnail nvarchar(MAX)
    DECLARE @MJReports_ConversationID_EnvironmentID uniqueidentifier
    DECLARE cascade_update_MJReports_ConversationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJReports_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJReports_ConversationID_cursor INTO @MJReports_ConversationIDID, @MJReports_ConversationID_Name, @MJReports_ConversationID_Description, @MJReports_ConversationID_CategoryID, @MJReports_ConversationID_UserID, @MJReports_ConversationID_SharingScope, @MJReports_ConversationID_ConversationID, @MJReports_ConversationID_ConversationDetailID, @MJReports_ConversationID_DataContextID, @MJReports_ConversationID_Configuration, @MJReports_ConversationID_OutputTriggerTypeID, @MJReports_ConversationID_OutputFormatTypeID, @MJReports_ConversationID_OutputDeliveryTypeID, @MJReports_ConversationID_OutputFrequency, @MJReports_ConversationID_OutputTargetEmail, @MJReports_ConversationID_OutputWorkflowID, @MJReports_ConversationID_Thumbnail, @MJReports_ConversationID_EnvironmentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJReports_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @MJReports_ConversationIDID, @Name = @MJReports_ConversationID_Name, @Description = @MJReports_ConversationID_Description, @CategoryID = @MJReports_ConversationID_CategoryID, @UserID = @MJReports_ConversationID_UserID, @SharingScope = @MJReports_ConversationID_SharingScope, @ConversationID_Clear = 1, @ConversationID = @MJReports_ConversationID_ConversationID, @ConversationDetailID = @MJReports_ConversationID_ConversationDetailID, @DataContextID = @MJReports_ConversationID_DataContextID, @Configuration = @MJReports_ConversationID_Configuration, @OutputTriggerTypeID = @MJReports_ConversationID_OutputTriggerTypeID, @OutputFormatTypeID = @MJReports_ConversationID_OutputFormatTypeID, @OutputDeliveryTypeID = @MJReports_ConversationID_OutputDeliveryTypeID, @OutputFrequency = @MJReports_ConversationID_OutputFrequency, @OutputTargetEmail = @MJReports_ConversationID_OutputTargetEmail, @OutputWorkflowID = @MJReports_ConversationID_OutputWorkflowID, @Thumbnail = @MJReports_ConversationID_Thumbnail, @EnvironmentID = @MJReports_ConversationID_EnvironmentID

        FETCH NEXT FROM cascade_update_MJReports_ConversationID_cursor INTO @MJReports_ConversationIDID, @MJReports_ConversationID_Name, @MJReports_ConversationID_Description, @MJReports_ConversationID_CategoryID, @MJReports_ConversationID_UserID, @MJReports_ConversationID_SharingScope, @MJReports_ConversationID_ConversationID, @MJReports_ConversationID_ConversationDetailID, @MJReports_ConversationID_DataContextID, @MJReports_ConversationID_Configuration, @MJReports_ConversationID_OutputTriggerTypeID, @MJReports_ConversationID_OutputFormatTypeID, @MJReports_ConversationID_OutputDeliveryTypeID, @MJReports_ConversationID_OutputFrequency, @MJReports_ConversationID_OutputTargetEmail, @MJReports_ConversationID_OutputWorkflowID, @MJReports_ConversationID_Thumbnail, @MJReports_ConversationID_EnvironmentID
    END

    CLOSE cascade_update_MJReports_ConversationID_cursor
    DEALLOCATE cascade_update_MJReports_ConversationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Conversation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

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
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ParentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ParentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ParentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ParentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ParentID_DefaultMediaCollectionID

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID
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
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_DefaultCoAgentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID
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
    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance
    DECLARE @MJConversationWidgetInstances_PinnedAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationWidgetInstance]
        WHERE [PinnedAgentID] = @ID
    
    OPEN cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance] @ID = @MJConversationWidgetInstances_PinnedAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    END
    
    CLOSE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    DEALLOCATE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    
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
    DECLARE @MJConversations_DefaultAgentID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_LastConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @Type = @MJConversations_DefaultAgentID_Type, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData, @RecordingFileID = @MJConversations_DefaultAgentID_RecordingFileID, @EgressID = @MJConversations_DefaultAgentID_EgressID, @VisitorKey = @MJConversations_DefaultAgentID_VisitorKey, @LastConversationID = @MJConversations_DefaultAgentID_LastConversationID

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID
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

/* spDelete SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: spDeleteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Application
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ApplicationEntity using cursor to call spDeleteApplicationEntity
    DECLARE @MJApplicationEntities_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationEntities_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationEntity]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationEntities_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationEntities_ApplicationID_cursor INTO @MJApplicationEntities_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationEntity] @ID = @MJApplicationEntities_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationEntities_ApplicationID_cursor INTO @MJApplicationEntities_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationEntities_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationEntities_ApplicationID_cursor
    
    -- Cascade delete from ApplicationRole using cursor to call spDeleteApplicationRole
    DECLARE @MJApplicationRoles_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationRoles_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationRole]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationRoles_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationRoles_ApplicationID_cursor INTO @MJApplicationRoles_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationRole] @ID = @MJApplicationRoles_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationRoles_ApplicationID_cursor INTO @MJApplicationRoles_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationRoles_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationRoles_ApplicationID_cursor
    
    -- Cascade delete from ApplicationSetting using cursor to call spDeleteApplicationSetting
    DECLARE @MJApplicationSettings_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationSettings_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationSetting]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationSettings_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationSettings_ApplicationID_cursor INTO @MJApplicationSettings_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationSetting] @ID = @MJApplicationSettings_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationSettings_ApplicationID_cursor INTO @MJApplicationSettings_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationSettings_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationSettings_ApplicationID_cursor
    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance
    DECLARE @MJConversationWidgetInstances_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationWidgetInstance]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor INTO @MJConversationWidgetInstances_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance] @ID = @MJConversationWidgetInstances_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor INTO @MJConversationWidgetInstances_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_ApplicationIDID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_UserID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ExternalID nvarchar(500)
    DECLARE @MJConversations_ApplicationID_Name nvarchar(255)
    DECLARE @MJConversations_ApplicationID_Description nvarchar(MAX)
    DECLARE @MJConversations_ApplicationID_Type nvarchar(50)
    DECLARE @MJConversations_ApplicationID_IsArchived bit
    DECLARE @MJConversations_ApplicationID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_ApplicationID_DataContextID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_Status nvarchar(20)
    DECLARE @MJConversations_ApplicationID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ProjectID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_IsPinned bit
    DECLARE @MJConversations_ApplicationID_TestRunID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_ApplicationID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_ApplicationID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_EgressID nvarchar(255)
    DECLARE @MJConversations_ApplicationID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_ApplicationID_LastConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_ApplicationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [ApplicationID] = @ID

    OPEN cascade_update_MJConversations_ApplicationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_Type, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData, @MJConversations_ApplicationID_RecordingFileID, @MJConversations_ApplicationID_EgressID, @MJConversations_ApplicationID_VisitorKey, @MJConversations_ApplicationID_LastConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_ApplicationID_ApplicationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_ApplicationIDID, @UserID = @MJConversations_ApplicationID_UserID, @ExternalID = @MJConversations_ApplicationID_ExternalID, @Name = @MJConversations_ApplicationID_Name, @Description = @MJConversations_ApplicationID_Description, @Type = @MJConversations_ApplicationID_Type, @IsArchived = @MJConversations_ApplicationID_IsArchived, @LinkedEntityID = @MJConversations_ApplicationID_LinkedEntityID, @LinkedRecordID = @MJConversations_ApplicationID_LinkedRecordID, @DataContextID = @MJConversations_ApplicationID_DataContextID, @Status = @MJConversations_ApplicationID_Status, @EnvironmentID = @MJConversations_ApplicationID_EnvironmentID, @ProjectID = @MJConversations_ApplicationID_ProjectID, @IsPinned = @MJConversations_ApplicationID_IsPinned, @TestRunID = @MJConversations_ApplicationID_TestRunID, @ApplicationScope = @MJConversations_ApplicationID_ApplicationScope, @ApplicationID_Clear = 1, @ApplicationID = @MJConversations_ApplicationID_ApplicationID, @DefaultAgentID = @MJConversations_ApplicationID_DefaultAgentID, @AdditionalData = @MJConversations_ApplicationID_AdditionalData, @RecordingFileID = @MJConversations_ApplicationID_RecordingFileID, @EgressID = @MJConversations_ApplicationID_EgressID, @VisitorKey = @MJConversations_ApplicationID_VisitorKey, @LastConversationID = @MJConversations_ApplicationID_LastConversationID

        FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_Type, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData, @MJConversations_ApplicationID_RecordingFileID, @MJConversations_ApplicationID_EgressID, @MJConversations_ApplicationID_VisitorKey, @MJConversations_ApplicationID_LastConversationID
    END

    CLOSE cascade_update_MJConversations_ApplicationID_cursor
    DEALLOCATE cascade_update_MJConversations_ApplicationID_cursor
    
    -- Cascade delete from DashboardUserPreference using cursor to call spDeleteDashboardUserPreference
    DECLARE @MJDashboardUserPreferences_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[DashboardUserPreference]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor INTO @MJDashboardUserPreferences_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteDashboardUserPreference] @ID = @MJDashboardUserPreferences_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor INTO @MJDashboardUserPreferences_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    
    -- Cascade update on Dashboard using cursor to call spUpdateDashboard
    DECLARE @MJDashboards_ApplicationIDID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_Name nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_Description nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_UserID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_CategoryID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_UIConfigDetails nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_Type nvarchar(20)
    DECLARE @MJDashboards_ApplicationID_Thumbnail nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_Scope nvarchar(20)
    DECLARE @MJDashboards_ApplicationID_ApplicationID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_DriverClass nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_Code nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_EnvironmentID uniqueidentifier
    DECLARE cascade_update_MJDashboards_ApplicationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [UserID], [CategoryID], [UIConfigDetails], [Type], [Thumbnail], [Scope], [ApplicationID], [DriverClass], [Code], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Dashboard]
        WHERE [ApplicationID] = @ID

    OPEN cascade_update_MJDashboards_ApplicationID_cursor
    FETCH NEXT FROM cascade_update_MJDashboards_ApplicationID_cursor INTO @MJDashboards_ApplicationIDID, @MJDashboards_ApplicationID_Name, @MJDashboards_ApplicationID_Description, @MJDashboards_ApplicationID_UserID, @MJDashboards_ApplicationID_CategoryID, @MJDashboards_ApplicationID_UIConfigDetails, @MJDashboards_ApplicationID_Type, @MJDashboards_ApplicationID_Thumbnail, @MJDashboards_ApplicationID_Scope, @MJDashboards_ApplicationID_ApplicationID, @MJDashboards_ApplicationID_DriverClass, @MJDashboards_ApplicationID_Code, @MJDashboards_ApplicationID_EnvironmentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDashboards_ApplicationID_ApplicationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDashboard] @ID = @MJDashboards_ApplicationIDID, @Name = @MJDashboards_ApplicationID_Name, @Description = @MJDashboards_ApplicationID_Description, @UserID = @MJDashboards_ApplicationID_UserID, @CategoryID = @MJDashboards_ApplicationID_CategoryID, @UIConfigDetails = @MJDashboards_ApplicationID_UIConfigDetails, @Type = @MJDashboards_ApplicationID_Type, @Thumbnail = @MJDashboards_ApplicationID_Thumbnail, @Scope = @MJDashboards_ApplicationID_Scope, @ApplicationID_Clear = 1, @ApplicationID = @MJDashboards_ApplicationID_ApplicationID, @DriverClass = @MJDashboards_ApplicationID_DriverClass, @Code = @MJDashboards_ApplicationID_Code, @EnvironmentID = @MJDashboards_ApplicationID_EnvironmentID

        FETCH NEXT FROM cascade_update_MJDashboards_ApplicationID_cursor INTO @MJDashboards_ApplicationIDID, @MJDashboards_ApplicationID_Name, @MJDashboards_ApplicationID_Description, @MJDashboards_ApplicationID_UserID, @MJDashboards_ApplicationID_CategoryID, @MJDashboards_ApplicationID_UIConfigDetails, @MJDashboards_ApplicationID_Type, @MJDashboards_ApplicationID_Thumbnail, @MJDashboards_ApplicationID_Scope, @MJDashboards_ApplicationID_ApplicationID, @MJDashboards_ApplicationID_DriverClass, @MJDashboards_ApplicationID_Code, @MJDashboards_ApplicationID_EnvironmentID
    END

    CLOSE cascade_update_MJDashboards_ApplicationID_cursor
    DEALLOCATE cascade_update_MJDashboards_ApplicationID_cursor
    
    -- Cascade delete from MagicLinkInviteApplication using cursor to call spDeleteMagicLinkInviteApplication
    DECLARE @MJMagicLinkInviteApplications_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MagicLinkInviteApplication]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor INTO @MJMagicLinkInviteApplications_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMagicLinkInviteApplication] @ID = @MJMagicLinkInviteApplications_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor INTO @MJMagicLinkInviteApplications_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    
    -- Cascade delete from MagicLinkInvite using cursor to call spDeleteMagicLinkInvite
    DECLARE @MJMagicLinkInvites_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MagicLinkInvite]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJMagicLinkInvites_ApplicationID_cursor INTO @MJMagicLinkInvites_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMagicLinkInvite] @ID = @MJMagicLinkInvites_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJMagicLinkInvites_ApplicationID_cursor INTO @MJMagicLinkInvites_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    
    -- Cascade delete from UserApplication using cursor to call spDeleteUserApplication
    DECLARE @MJUserApplications_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJUserApplications_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[UserApplication]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJUserApplications_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJUserApplications_ApplicationID_cursor INTO @MJUserApplications_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteUserApplication] @ID = @MJUserApplications_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJUserApplications_ApplicationID_cursor INTO @MJUserApplications_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJUserApplications_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJUserApplications_ApplicationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Application]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21269657-c023-4b86-b815-690ea6c1d1bc' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastConversation')) BEGIN
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
            '21269657-c023-4b86-b815-690ea6c1d1bc',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100069,
            'LastConversation',
            'Last Conversation',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1123af13-3974-4746-9895-373420418772' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootLastConversationID')) BEGIN
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
            '1123af13-3974-4746-9895-373420418772',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100070,
            'RootLastConversationID',
            'Root Last Conversation ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a216d3de-11c4-44be-86de-c7aa488a3189' OR (EntityID = '17198778-E25A-4457-80AF-9E8C4961DC29' AND Name = 'LinkedEntity')) BEGIN
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
            'a216d3de-11c4-44be-86de-c7aa488a3189',
            '17198778-E25A-4457-80AF-9E8C4961DC29', -- Entity: MJ: AI Agent Sessions
            100046,
            'LinkedEntity',
            'Linked Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15c08f1a-d26a-40cb-b051-5ed89c62f36f' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'Application')) BEGIN
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
            '15c08f1a-d26a-40cb-b051-5ed89c62f36f',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100039,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ec23fcee-9c2b-4757-81b1-d1dab59a9672' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'PinnedAgent')) BEGIN
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
            'ec23fcee-9c2b-4757-81b1-d1dab59a9672',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100040,
            'PinnedAgent',
            'Pinned Agent',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2c1556e-9691-4917-8251-72ae39aebb20' OR (EntityID = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND Name = 'GuestRole')) BEGIN
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
            'd2c1556e-9691-4917-8251-72ae39aebb20',
            '88026538-D440-48F5-9FE8-A8A7198DBF83', -- Entity: MJ: Conversation Widget Instances
            100041,
            'GuestRole',
            'Guest Role',
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

/* Generated Validation Functions for MJ: AI Agent Sessions */
-- CHECK constraint for MJ: AI Agent Sessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([LinkedEntityID] IS NULL AND [LinkedRecordID] IS NULL OR [LinkedEntityID] IS NOT NULL AND [LinkedRecordID] IS NOT NULL)', 'public ValidateLinkedEntityAndRecordCoexistence(result: ValidationResult) {
	const hasEntity = this.LinkedEntityID != null;
	const hasRecord = this.LinkedRecordID != null && this.LinkedRecordID !== "";

	if (hasEntity !== hasRecord) {
		result.Errors.push(new ValidationErrorInfo(
			"LinkedEntityID",
			"Both Linked Entity ID and Linked Record ID must be provided together, or both must be left blank.",
			this.LinkedEntityID,
			ValidationErrorType.Failure
		));
	}
}', 'Both Linked Entity ID and Linked Record ID must either be provided together or both left empty. This ensures that a link to an external record is always complete with both its entity type and record identifier.', 'ValidateLinkedEntityAndRecordCoexistence', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '17198778-E25A-4457-80AF-9E8C4961DC29');

/* Generated Validation Functions for MJ: Conversation Widget Instances */
-- CHECK constraint for MJ: Conversation Widget Instances: Field: RateLimitPerMinute was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([RateLimitPerMinute]>(0))', 'public ValidateRateLimitPerMinuteGreaterThanZero(result: ValidationResult) {
	if (this.RateLimitPerMinute !== undefined && this.RateLimitPerMinute !== null && this.RateLimitPerMinute <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"RateLimitPerMinute",
			"The rate limit per minute must be greater than 0.",
			this.RateLimitPerMinute,
			ValidationErrorType.Failure
		));
	}
}', 'The rate limit per minute must be a positive number greater than zero to ensure the application can process requests.', 'ValidateRateLimitPerMinuteGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'FA99F64E-2902-4926-9EA4-1C8E45931EBC');

            -- CHECK constraint for MJ: Conversation Widget Instances: Field: SessionTTLMinutes was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([SessionTTLMinutes]>(0) AND [SessionTTLMinutes]<=(1440))', 'public ValidateSessionTTLMinutesRange(result: ValidationResult) {
	if (this.SessionTTLMinutes != null && (this.SessionTTLMinutes <= 0 || this.SessionTTLMinutes > 1440)) {
		result.Errors.push(new ValidationErrorInfo(
			"SessionTTLMinutes",
			"Session TTL must be greater than 0 and less than or equal to 1440 minutes (24 hours).",
			this.SessionTTLMinutes,
			ValidationErrorType.Failure
		));
	}
}', 'The session time-to-live (TTL) must be greater than 0 minutes and cannot exceed 1440 minutes (24 hours).', 'ValidateSessionTTLMinutesRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '54A96AFE-A5F0-4956-85F4-D02B5A4FD83F');

            -- CHECK constraint for MJ: Conversation Widget Instances: Field: VisitorMemoryRetentionDays was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([VisitorMemoryRetentionDays]>(0))', 'public ValidateVisitorMemoryRetentionDaysGreaterThanZero(result: ValidationResult) {
	if (this.VisitorMemoryRetentionDays != null && this.VisitorMemoryRetentionDays <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"VisitorMemoryRetentionDays",
			"Visitor memory retention days must be greater than 0.",
			this.VisitorMemoryRetentionDays,
			ValidationErrorType.Failure
		));
	}
}', 'The visitor memory retention period, if specified, must be a positive number of days greater than zero.', 'ValidateVisitorMemoryRetentionDaysGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8773C7A4-317A-4947-B9F5-346DC7CDABA5');

