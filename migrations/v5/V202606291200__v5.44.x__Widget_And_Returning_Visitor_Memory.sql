-- ============================================================================
-- Migration: Public Web Widget + Returning-Visitor Memory  (consolidated)
-- Part of the Agent Bridges & Public Widget program.
--   plans/realtime/bridges-and-widget/public-web-widget.md        (Widget Instances + Guest RLS)
--   plans/realtime/bridges-and-widget/returning-visitor-memory.md (RV0 schema)
--
-- This is the SINGLE schema migration for the PR. It contains, in order:
--   1. "MJ: Widget Instances" table — durable per-deployment widget config,
--      INCLUDING the returning-visitor opt-in toggle + retention (R6).
--   2. Returning-visitor cross-session continuity columns on Conversation:
--      a durable visitor anchor (VisitorKey, R3), a POLYMORPHIC resolved identity
--      (ResolvedEntityID + ResolvedRecordID, R1), and a conversation-altitude chain
--      (PreviousConversationID, R2).
--   3. Hand-authored non-FK lookup indexes for the polymorphic pair + VisitorKey.
--   4. Widget Guest Row-Level-Security filter seed rows (reference data).
--   5. [appended below] CodeGen output for all of the above.
--
-- NOTE on memory scoping (plan R5, superseded): the agent-notes system already
--   carries a polymorphic note scope (MJ: AI Agent Notes . PrimaryScopeEntityID +
--   PrimaryScopeRecordID + SecondaryScopes), and the memory injector already filters
--   by it. Returning-visitor recaps reuse that existing scope (matching AN-BC's
--   "reuse the existing memory system, no parallel store" guidance), so this migration
--   adds NO columns to AIAgentNote — the polymorphic identity lives on the Conversation.
--
-- Conventions: no __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are
--   declared here — CodeGen generates those (IDX_AUTO_MJ_FKEY_*). One ALTER TABLE
--   per table with comma-separated ADDs. sp_addextendedproperty for every new
--   column. Polymorphic *RecordID columns are NVARCHAR(450), INDEXED but NOT
--   FK-constrained (they point at any entity's record, incl. composite/non-uuid PKs).
--   Seed config rows for Widget Instances go via mj-sync metadata (NOT SQL INSERTs).
--   The RLS filter rows ARE SQL-seeded because RowLevelSecurityFilter create is
--   denied to non-Owner principals (MetadataSync runs as System), identical to the
--   Magic Link RLS seeds; the EntityPermission -> filter LINK is done in metadata
--   (metadata/entity-permissions) via @lookup by Name.
-- ============================================================================


-- =============================================================================
-- 1. MJ: Widget Instances
-- =============================================================================
-- A Widget Instance is the durable, per-deployment configuration for one
-- embeddable public support widget — one row per site/embed that drops the
-- <script> tag. It resolves a public widget key (pk_live_…) to its application
-- scope, the PINNED support agent, the restricted GUEST ROLE, the allowed
-- embedding origins, the enabled modality + auth strategy, abuse ceilings, and
-- (R6) whether this deployment remembers returning visitors + for how long.
CREATE TABLE ${flyway:defaultSchema}.WidgetInstance (
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
    RememberReturningVisitors BIT NOT NULL DEFAULT 0,
    VisitorMemoryRetentionDays INT NULL,
    CONSTRAINT PK_WidgetInstance PRIMARY KEY (ID),
    CONSTRAINT UQ_WidgetInstance_PublicKey UNIQUE (PublicKey),
    CONSTRAINT FK_WidgetInstance_Application FOREIGN KEY (ApplicationID)
        REFERENCES ${flyway:defaultSchema}.Application(ID),
    CONSTRAINT FK_WidgetInstance_PinnedAgent FOREIGN KEY (PinnedAgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_WidgetInstance_GuestRole FOREIGN KEY (GuestRoleID)
        REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT CK_WidgetInstance_Modality
        CHECK (Modality IN ('Text', 'Voice', 'Both')),
    CONSTRAINT CK_WidgetInstance_AuthStrategy
        CHECK (AuthStrategy IN ('Anonymous', 'MagicLinkUpgrade', 'HostIdentity')),
    CONSTRAINT CK_WidgetInstance_Status
        CHECK (Status IN ('Active', 'Disabled')),
    CONSTRAINT CK_WidgetInstance_SessionTTLMinutes
        CHECK (SessionTTLMinutes > 0 AND SessionTTLMinutes <= 1440),
    CONSTRAINT CK_WidgetInstance_RateLimitPerMinute
        CHECK (RateLimitPerMinute > 0),
    CONSTRAINT CK_WidgetInstance_VisitorMemoryRetentionDays
        CHECK (VisitorMemoryRetentionDays > 0)
);


-- =============================================================================
-- 2. Returning-visitor continuity on Conversation
-- =============================================================================
ALTER TABLE ${flyway:defaultSchema}.Conversation ADD
    VisitorKey             NVARCHAR(255) NULL,
    ResolvedEntityID       UNIQUEIDENTIFIER NULL,
    ResolvedRecordID       NVARCHAR(450) NULL,
    PreviousConversationID UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_Conversation_ResolvedEntity
        FOREIGN KEY (ResolvedEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_Conversation_PreviousConversation
        FOREIGN KEY (PreviousConversationID) REFERENCES ${flyway:defaultSchema}.Conversation(ID);


-- =============================================================================
-- 3. Hand-authored non-FK lookup indexes (polymorphic pair + VisitorKey)
-- =============================================================================
-- These are NOT FK indexes (CodeGen owns IDX_AUTO_MJ_FKEY_* for ResolvedEntityID and
-- PreviousConversationID). They back the resolver lookups: by the resolved
-- (EntityID, RecordID) pair and by the durable cookie VisitorKey. RecordID is
-- intentionally not constrained, so it's index-only.
CREATE NONCLUSTERED INDEX IX_Conversation_ResolvedRecord
    ON ${flyway:defaultSchema}.Conversation (ResolvedEntityID, ResolvedRecordID);
CREATE NONCLUSTERED INDEX IX_Conversation_VisitorKey
    ON ${flyway:defaultSchema}.Conversation (VisitorKey);


-- =============================================================================
-- Extended properties
-- =============================================================================

-- ── WidgetInstance table + columns ──────────────────────────────────────────
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Durable per-deployment configuration for one embeddable public support widget (text and/or voice). One row per site/embed. Resolves a public widget key to its application scope, pinned support agent, restricted guest role, allowed origins, modality, auth strategy, and abuse ceilings. Reuses the magic-link anonymous-embed minting path at session time; this entity holds only the configuration.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Human-readable name for this widget deployment (e.g. "Acme Marketing Site Support").',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Public, non-secret embed key (e.g. "pk_live_…") placed in the host page''s data-widget-key attribute. Used to resolve this configuration at POST /widget/session. Unique. Not a credential — security comes from the origin allowlist, rate limits, the restricted guest role, and short-lived minted tokens.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'PublicKey';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Application — the single app a guest session is scoped to. Mirrors the magic-link single-application model.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'ApplicationID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to AIAgent — the support agent that is PINNED for every turn (passed as explicitAgentId). D5: pinning fixes which agent runs; combined with the restricted guest role it prevents a public visitor from reaching arbitrary agents/data. The pinned agent''s own tool/handoff surface should be support-scoped.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'PinnedAgentID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Role — the restricted guest role assigned to the synthesized guest principal. This role''s entity permissions are the real authorization boundary (read/write only the visitor''s own Conversation + Conversation Details). Roles ride per-session JWT claims, not DB rows on the shared Anonymous principal.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'GuestRoleID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Allowed embedding origins for this widget, as a JSON array of origin strings (e.g. ["https://www.acme.com","https://acme.com"]). Enforced both at mint (POST /widget/session rejects unlisted Origin) and via CORS. NULL or empty means no origin is allowed (fail-closed).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'AllowedOrigins';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Which modalities this widget exposes: Text (chat only), Voice (client-direct realtime only), or Both. Gates whether the realtime-mint path is offered to the guest.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'Modality';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Pluggable public-auth strategy (D1): Anonymous (guest-first, default), MagicLinkUpgrade (guest may escalate to an email-verified session), or HostIdentity (an authenticated host portal posts a signed identity assertion exchanged for an MJ guest JWT). All three converge on AuthProviderFactory + buildMagicLinkSessionUser.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'AuthStrategy';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Lifecycle status. Active widgets mint sessions; Disabled widgets reject all mints (used to turn off a deployment without deleting its config).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'Status';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Time-to-live in minutes for a minted guest session JWT. Short by design (default 15) to limit replay/theft; the widget refreshes before expiry. Capped at 1440 (24h).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'SessionTTLMinutes';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Maximum number of guest-session mints allowed per minute per source IP/origin for this widget. Reuses the magic-link rate-limit pattern.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'RateLimitPerMinute';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Optional hard ceiling (minutes) on a single voice session''s duration for this widget. NULL means fall back to the server-wide default. Voice is the biggest cost/abuse surface; the SessionJanitor enforces this server-side (W4).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'VoiceMaxSessionMinutes';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Returning-visitor memory opt-in (R6). When 0 (default) this widget sets no durable visitor cookie and writes no cross-session recap — fully off. When 1, the widget mints a durable VisitorKey cookie, links each new Conversation to the visitor''s prior one, and writes a recap memory note on close so a returning visitor''s agent opens with prior context.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'RememberReturningVisitors';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Retention window (days) for returning-visitor recap memory notes generated by this widget. NULL means use the system default. Past this window the visitor''s auto-generated recap notes decay/archive via the Memory Manager. Ignored when RememberReturningVisitors = 0.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'WidgetInstance',
    @level2type=N'COLUMN', @level2name=N'VisitorMemoryRetentionDays';

-- ── Conversation columns ────────────────────────────────────────────────────
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Durable, opaque returning-visitor anchor (R3). Holds the value of a long-lived first-party cookie minted by the widget on first visit, used to find this visitor''s prior conversations while they are still anonymous. Distinct from ExternalID (which stays per-session for RLS isolation). NULL for conversations that are not widget returning-visitor sessions.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Conversation',
    @level2type=N'COLUMN', @level2name=N'VisitorKey';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Polymorphic resolved-identity entity (R1). Foreign key to Entity — identifies WHICH entity the conversation''s counterparty resolved to (e.g. User, a member/contact record, BizAppsCommon Person). Paired with ResolvedRecordID. NULL while the visitor is anonymous. "The conversation is always with a User" is a false premise — pointing at a User is one case, not the contract.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Conversation',
    @level2type=N'COLUMN', @level2name=N'ResolvedEntityID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Polymorphic resolved-identity record key (R1). The primary-key value of the record (within ResolvedEntityID''s entity) the conversation resolved to. NVARCHAR(450), indexed but intentionally NOT FK-constrained so it can point at any entity, including composite or non-uuid PKs. NULL while the visitor is anonymous.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Conversation',
    @level2type=N'COLUMN', @level2name=N'ResolvedRecordID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Conversation-altitude returning-visitor chain (R2). Self-foreign-key to the visitor''s immediately prior Conversation (found by VisitorKey or the resolved pair at mint time). History and memory are conversation-scoped, so the chain lives here — NOT on AIAgentSession.LastSessionID, which owns reconnect/resume semantics and is walked by the replay viewer. NULL for a brand-new visitor''s first conversation.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Conversation',
    @level2type=N'COLUMN', @level2name=N'PreviousConversationID';


-- =============================================================================
-- 4. Widget Guest Row-Level-Security filter seed rows (reference data)
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
        'ID IN (SELECT PinnedAgentID FROM ${flyway:defaultSchema}.vwWidgetInstances WHERE Status = ''Active'' AND PinnedAgentID IS NOT NULL)',
        'Restricts a public web-widget guest to reading ONLY the agents pinned to an active widget instance (the agents intentionally exposed to the public), never the full internal agent roster. Attached to the Widget Guest role''s read permission on MJ: AI Agents so the client-side ConversationsRuntime can resolve the pinned agent without exposing other agents.'
    );



-- ============================================================================
-- CodeGen output (appended)
-- ----------------------------------------------------------------------------
-- Generated by `mj codegen` against the schema above (entity metadata, views,
-- CRUD procedures, permissions, and field-validation functions for MJ: Widget
-- Instances and the new Conversation columns). Do not hand-edit.
-- ============================================================================


/* SQL generated to create new entity MJ: Widget Instances */

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
         '4dd2fd4a-19a0-4822-8380-6f13e0558f7d',
         'MJ: Widget Instances',
         'Widget Instances',
         'Durable per-deployment configuration for one embeddable public support widget (text and/or voice). One row per site/embed. Resolves a public widget key to its application scope, pinned support agent, restricted guest role, allowed origins, modality, auth strategy, and abuse ceilings. Reuses the magic-link anonymous-embed minting path at session time; this entity holds only the configuration.',
         NULL,
         'WidgetInstance',
         'vwWidgetInstances',
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

/* SQL generated to add new entity MJ: Widget Instances to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4dd2fd4a-19a0-4822-8380-6f13e0558f7d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Widget Instances for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4dd2fd4a-19a0-4822-8380-6f13e0558f7d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Widget Instances for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4dd2fd4a-19a0-4822-8380-6f13e0558f7d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Widget Instances for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4dd2fd4a-19a0-4822-8380-6f13e0558f7d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[WidgetInstance] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WidgetInstance */
UPDATE [${flyway:defaultSchema}].[WidgetInstance] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[WidgetInstance] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[WidgetInstance] ADD CONSTRAINT [DF___mj_WidgetInstance___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[WidgetInstance] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WidgetInstance */
UPDATE [${flyway:defaultSchema}].[WidgetInstance] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[WidgetInstance] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WidgetInstance */
ALTER TABLE [${flyway:defaultSchema}].[WidgetInstance] ADD CONSTRAINT [DF___mj_WidgetInstance___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '49c35ccd-b95b-48c0-b027-799d738e5749' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'VisitorKey')) BEGIN
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
            '49c35ccd-b95b-48c0-b027-799d738e5749',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100060,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4a1aeb0-d11b-4d5b-a1d4-7e8e61920bc0' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ResolvedEntityID')) BEGIN
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
            'a4a1aeb0-d11b-4d5b-a1d4-7e8e61920bc0',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100061,
            'ResolvedEntityID',
            'Resolved Entity ID',
            'Polymorphic resolved-identity entity (R1). Foreign key to Entity — identifies WHICH entity the conversation''s counterparty resolved to (e.g. User, a member/contact record, BizAppsCommon Person). Paired with ResolvedRecordID. NULL while the visitor is anonymous. "The conversation is always with a User" is a false premise — pointing at a User is one case, not the contract.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b7042cf-ea36-43c6-b2a3-2fabe6b85038' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ResolvedRecordID')) BEGIN
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
            '6b7042cf-ea36-43c6-b2a3-2fabe6b85038',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100062,
            'ResolvedRecordID',
            'Resolved Record ID',
            'Polymorphic resolved-identity record key (R1). The primary-key value of the record (within ResolvedEntityID''s entity) the conversation resolved to. NVARCHAR(450), indexed but intentionally NOT FK-constrained so it can point at any entity, including composite or non-uuid PKs. NULL while the visitor is anonymous.',
            'nvarchar',
            900,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4107aaa2-d63b-4a2e-8d12-05f92b12efa1' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PreviousConversationID')) BEGIN
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
            '4107aaa2-d63b-4a2e-8d12-05f92b12efa1',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100063,
            'PreviousConversationID',
            'Previous Conversation ID',
            'Conversation-altitude returning-visitor chain (R2). Self-foreign-key to the visitor''s immediately prior Conversation (found by VisitorKey or the resolved pair at mint time). History and memory are conversation-scoped, so the chain lives here — NOT on AIAgentSession.LastSessionID, which owns reconnect/resume semantics and is walked by the replay viewer. NULL for a brand-new visitor''s first conversation.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a1b0776-336f-4960-a100-fc4c85f62562' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'ID')) BEGIN
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
            '3a1b0776-336f-4960-a100-fc4c85f62562',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66df0aeb-835e-4b94-a625-69d5d7ac1a24' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'Name')) BEGIN
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
            '66df0aeb-835e-4b94-a625-69d5d7ac1a24',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '335aea03-8486-435d-b305-be9411d8b163' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'PublicKey')) BEGIN
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
            '335aea03-8486-435d-b305-be9411d8b163',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7df43368-7a23-4849-bb9a-7dd1f7dd9794' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'ApplicationID')) BEGIN
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
            '7df43368-7a23-4849-bb9a-7dd1f7dd9794',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f39393d1-0882-4068-a301-fbaa139ba57d' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'PinnedAgentID')) BEGIN
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
            'f39393d1-0882-4068-a301-fbaa139ba57d',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97cfedc2-7739-496d-9e17-e8e7fefbc476' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'GuestRoleID')) BEGIN
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
            '97cfedc2-7739-496d-9e17-e8e7fefbc476',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08c80ff3-eab5-4a29-acc1-b5598d760ecb' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'AllowedOrigins')) BEGIN
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
            '08c80ff3-eab5-4a29-acc1-b5598d760ecb',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0a76505-2f99-42e2-a9d7-14673be34162' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'Modality')) BEGIN
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
            'a0a76505-2f99-42e2-a9d7-14673be34162',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '471611e9-c1c2-4c9c-9f82-77894e218e24' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'AuthStrategy')) BEGIN
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
            '471611e9-c1c2-4c9c-9f82-77894e218e24',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3aa13694-df85-40da-bcec-7a1d2869fe27' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'Status')) BEGIN
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
            '3aa13694-df85-40da-bcec-7a1d2869fe27',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b77c411a-cb2f-4f70-8e57-01b2b29cc8d1' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'SessionTTLMinutes')) BEGIN
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
            'b77c411a-cb2f-4f70-8e57-01b2b29cc8d1',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e45b7124-a337-4ae4-ad25-dfde57772424' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'RateLimitPerMinute')) BEGIN
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
            'e45b7124-a337-4ae4-ad25-dfde57772424',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e677365-4180-4da9-872b-9e1ef4b39457' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'VoiceMaxSessionMinutes')) BEGIN
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
            '5e677365-4180-4da9-872b-9e1ef4b39457',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae5f8f88-4265-4a6b-a1eb-eb76af246ad3' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'RememberReturningVisitors')) BEGIN
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
            'ae5f8f88-4265-4a6b-a1eb-eb76af246ad3',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b500b73d-bc6a-4e9d-99a0-ba8821c541c1' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'VisitorMemoryRetentionDays')) BEGIN
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
            'b500b73d-bc6a-4e9d-99a0-ba8821c541c1',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb4ba7d8-cda6-48a9-bad3-654a28178b7f' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = '__mj_CreatedAt')) BEGIN
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
            'bb4ba7d8-cda6-48a9-bad3-654a28178b7f',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
            100016,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f390069-5d45-45b4-848b-2ad09463721a' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '2f390069-5d45-45b4-848b-2ad09463721a',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
            100017,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37ec18e7-34cb-436c-8ca1-7e6fb73aec1a' OR (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'Subpath')) BEGIN
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
            '37ec18e7-34cb-436c-8ca1-7e6fb73aec1a',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100043,
            'Subpath',
            'Subpath',
            'In-repo subdirectory the app was installed from for multi-app repositories (e.g. ''CRM/HubSpot''). NULL when the app''s mj-app.json is at the repository root.',
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

/* SQL text to insert entity field value with ID 47cd208b-7c5d-477c-8704-ae89b85f212e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('47cd208b-7c5d-477c-8704-ae89b85f212e', 'A0A76505-2F99-42E2-A9D7-14673BE34162', 1, 'Both', 'Both', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6800687b-cb5a-4a89-8cfe-54e3412c37ab */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6800687b-cb5a-4a89-8cfe-54e3412c37ab', 'A0A76505-2F99-42E2-A9D7-14673BE34162', 2, 'Text', 'Text', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 936f7d34-ddbc-4817-93c2-547e14b69f5f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('936f7d34-ddbc-4817-93c2-547e14b69f5f', 'A0A76505-2F99-42E2-A9D7-14673BE34162', 3, 'Voice', 'Voice', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A0A76505-2F99-42E2-A9D7-14673BE34162 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A0A76505-2F99-42E2-A9D7-14673BE34162';

/* SQL text to insert entity field value with ID 0f3aecc5-1e0d-47ec-b124-88b2106d59ad */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0f3aecc5-1e0d-47ec-b124-88b2106d59ad', '471611E9-C1C2-4C9C-9F82-77894E218E24', 1, 'Anonymous', 'Anonymous', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 78f866ee-c75f-4a9e-915a-80b7c57fd6fc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('78f866ee-c75f-4a9e-915a-80b7c57fd6fc', '471611E9-C1C2-4C9C-9F82-77894E218E24', 2, 'HostIdentity', 'HostIdentity', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d43a311d-5137-4038-8187-0f7371ba17f8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d43a311d-5137-4038-8187-0f7371ba17f8', '471611E9-C1C2-4C9C-9F82-77894E218E24', 3, 'MagicLinkUpgrade', 'MagicLinkUpgrade', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 471611E9-C1C2-4C9C-9F82-77894E218E24 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='471611E9-C1C2-4C9C-9F82-77894E218E24';

/* SQL text to insert entity field value with ID 4ec1dc4f-f22b-45d7-af5e-62c5235a548c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4ec1dc4f-f22b-45d7-af5e-62c5235a548c', '3AA13694-DF85-40DA-BCEC-7A1D2869FE27', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 04152b68-e36e-4366-ac48-3224b5e9b6c1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('04152b68-e36e-4366-ac48-3224b5e9b6c1', '3AA13694-DF85-40DA-BCEC-7A1D2869FE27', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3AA13694-DF85-40DA-BCEC-7A1D2869FE27 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3AA13694-DF85-40DA-BCEC-7A1D2869FE27';


/* Create Entity Relationship: MJ: AI Agents -> MJ: Widget Instances (One To Many via PinnedAgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7517900e-397b-4b8b-b84b-bd544180842e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7517900e-397b-4b8b-b84b-bd544180842e', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', 'PinnedAgentID', 'One To Many', 1, 1, 35, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Roles -> MJ: Widget Instances (One To Many via GuestRoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6f5842f3-dd35-4fe6-91b2-1f081bfe0de3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6f5842f3-dd35-4fe6-91b2-1f081bfe0de3', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', 'GuestRoleID', 'One To Many', 1, 1, 15, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Conversations (One To Many via ResolvedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a865e48f-a29f-415b-8cef-0ca080a62d02'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a865e48f-a29f-415b-8cef-0ca080a62d02', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'ResolvedEntityID', 'One To Many', 1, 1, 67, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Applications -> MJ: Widget Instances (One To Many via ApplicationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'affc7281-dba6-4638-b567-35caae884a9c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('affc7281-dba6-4638-b567-35caae884a9c', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', 'ApplicationID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Conversations -> MJ: Conversations (One To Many via PreviousConversationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f7a45693-49ec-4a1b-bd8a-509cc7c85e75'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f7a45693-49ec-4a1b-bd8a-509cc7c85e75', '13248F34-2837-EF11-86D4-6045BDEE16E6', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'PreviousConversationID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;

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

-- Index for foreign key ResolvedEntityID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_ResolvedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_ResolvedEntityID ON [${flyway:defaultSchema}].[Conversation] ([ResolvedEntityID]);

-- Index for foreign key PreviousConversationID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_PreviousConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_PreviousConversationID ON [${flyway:defaultSchema}].[Conversation] ([PreviousConversationID]);

/* SQL text to update entity field related entity name field map for entity field ID A4A1AEB0-D11B-4D5B-A1D4-7E8E61920BC0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A4A1AEB0-D11B-4D5B-A1D4-7E8E61920BC0', @RelatedEntityNameFieldMap='ResolvedEntity';

/* SQL text to update entity field related entity name field map for entity field ID 4107AAA2-D63B-4A2E-8D12-05F92B12EFA1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4107AAA2-D63B-4A2E-8D12-05F92B12EFA1', @RelatedEntityNameFieldMap='PreviousConversation';

/* Root ID Function SQL for MJ: Conversations.PreviousConversationID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: fnConversationPreviousConversationID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Conversation].[PreviousConversationID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnConversationPreviousConversationID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnConversationPreviousConversationID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnConversationPreviousConversationID_GetRootID]
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
            [PreviousConversationID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Conversation]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[PreviousConversationID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Conversation] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[PreviousConversationID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [PreviousConversationID] IS NULL
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
    MJEntity_ResolvedEntityID.[Name] AS [ResolvedEntity],
    MJConversation_PreviousConversationID.[Name] AS [PreviousConversation],
    root_PreviousConversationID.RootID AS [RootPreviousConversationID]
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
    [${flyway:defaultSchema}].[Entity] AS MJEntity_ResolvedEntityID
  ON
    [c].[ResolvedEntityID] = MJEntity_ResolvedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_PreviousConversationID
  ON
    [c].[PreviousConversationID] = MJConversation_PreviousConversationID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnConversationPreviousConversationID_GetRootID]([c].[ID], [c].[PreviousConversationID]) AS root_PreviousConversationID
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
    @ResolvedEntityID_Clear bit = 0,
    @ResolvedEntityID uniqueidentifier = NULL,
    @ResolvedRecordID_Clear bit = 0,
    @ResolvedRecordID nvarchar(450) = NULL,
    @PreviousConversationID_Clear bit = 0,
    @PreviousConversationID uniqueidentifier = NULL
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
                [ResolvedEntityID],
                [ResolvedRecordID],
                [PreviousConversationID]
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
                CASE WHEN @ResolvedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedEntityID, NULL) END,
                CASE WHEN @ResolvedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedRecordID, NULL) END,
                CASE WHEN @PreviousConversationID_Clear = 1 THEN NULL ELSE ISNULL(@PreviousConversationID, NULL) END
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
                [ResolvedEntityID],
                [ResolvedRecordID],
                [PreviousConversationID]
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
                CASE WHEN @ResolvedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedEntityID, NULL) END,
                CASE WHEN @ResolvedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedRecordID, NULL) END,
                CASE WHEN @PreviousConversationID_Clear = 1 THEN NULL ELSE ISNULL(@PreviousConversationID, NULL) END
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
    @ResolvedEntityID_Clear bit = 0,
    @ResolvedEntityID uniqueidentifier = NULL,
    @ResolvedRecordID_Clear bit = 0,
    @ResolvedRecordID nvarchar(450) = NULL,
    @PreviousConversationID_Clear bit = 0,
    @PreviousConversationID uniqueidentifier = NULL
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
        [ResolvedEntityID] = CASE WHEN @ResolvedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedEntityID, [ResolvedEntityID]) END,
        [ResolvedRecordID] = CASE WHEN @ResolvedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedRecordID, [ResolvedRecordID]) END,
        [PreviousConversationID] = CASE WHEN @PreviousConversationID_Clear = 1 THEN NULL ELSE ISNULL(@PreviousConversationID, [PreviousConversationID]) END
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
    DECLARE cascade_update_MJAIAgentSessions_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [Status], [ConversationID], [LastSessionID], [HostInstanceID], [Config], [LastActiveAt], [ClosedAt], [CloseReason], [RecordingMedia], [RecordingStartedAt], [RecordingFileID]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentSessions_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSessions_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentSession] @ID = @MJAIAgentSessions_ConversationIDID, @AgentID = @MJAIAgentSessions_ConversationID_AgentID, @UserID = @MJAIAgentSessions_ConversationID_UserID, @Status = @MJAIAgentSessions_ConversationID_Status, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentSessions_ConversationID_ConversationID, @LastSessionID = @MJAIAgentSessions_ConversationID_LastSessionID, @HostInstanceID = @MJAIAgentSessions_ConversationID_HostInstanceID, @Config = @MJAIAgentSessions_ConversationID_Config, @LastActiveAt = @MJAIAgentSessions_ConversationID_LastActiveAt, @ClosedAt = @MJAIAgentSessions_ConversationID_ClosedAt, @CloseReason = @MJAIAgentSessions_ConversationID_CloseReason, @RecordingMedia = @MJAIAgentSessions_ConversationID_RecordingMedia, @RecordingStartedAt = @MJAIAgentSessions_ConversationID_RecordingStartedAt, @RecordingFileID = @MJAIAgentSessions_ConversationID_RecordingFileID

        FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID
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
    DECLARE @MJConversations_PreviousConversationIDID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_UserID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_ExternalID nvarchar(500)
    DECLARE @MJConversations_PreviousConversationID_Name nvarchar(255)
    DECLARE @MJConversations_PreviousConversationID_Description nvarchar(MAX)
    DECLARE @MJConversations_PreviousConversationID_Type nvarchar(50)
    DECLARE @MJConversations_PreviousConversationID_IsArchived bit
    DECLARE @MJConversations_PreviousConversationID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_PreviousConversationID_DataContextID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_Status nvarchar(20)
    DECLARE @MJConversations_PreviousConversationID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_ProjectID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_IsPinned bit
    DECLARE @MJConversations_PreviousConversationID_TestRunID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_PreviousConversationID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_PreviousConversationID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_EgressID nvarchar(255)
    DECLARE @MJConversations_PreviousConversationID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_PreviousConversationID_ResolvedEntityID uniqueidentifier
    DECLARE @MJConversations_PreviousConversationID_ResolvedRecordID nvarchar(450)
    DECLARE @MJConversations_PreviousConversationID_PreviousConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_PreviousConversationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [ResolvedEntityID], [ResolvedRecordID], [PreviousConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [PreviousConversationID] = @ID

    OPEN cascade_update_MJConversations_PreviousConversationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_PreviousConversationID_cursor INTO @MJConversations_PreviousConversationIDID, @MJConversations_PreviousConversationID_UserID, @MJConversations_PreviousConversationID_ExternalID, @MJConversations_PreviousConversationID_Name, @MJConversations_PreviousConversationID_Description, @MJConversations_PreviousConversationID_Type, @MJConversations_PreviousConversationID_IsArchived, @MJConversations_PreviousConversationID_LinkedEntityID, @MJConversations_PreviousConversationID_LinkedRecordID, @MJConversations_PreviousConversationID_DataContextID, @MJConversations_PreviousConversationID_Status, @MJConversations_PreviousConversationID_EnvironmentID, @MJConversations_PreviousConversationID_ProjectID, @MJConversations_PreviousConversationID_IsPinned, @MJConversations_PreviousConversationID_TestRunID, @MJConversations_PreviousConversationID_ApplicationScope, @MJConversations_PreviousConversationID_ApplicationID, @MJConversations_PreviousConversationID_DefaultAgentID, @MJConversations_PreviousConversationID_AdditionalData, @MJConversations_PreviousConversationID_RecordingFileID, @MJConversations_PreviousConversationID_EgressID, @MJConversations_PreviousConversationID_VisitorKey, @MJConversations_PreviousConversationID_ResolvedEntityID, @MJConversations_PreviousConversationID_ResolvedRecordID, @MJConversations_PreviousConversationID_PreviousConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_PreviousConversationID_PreviousConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_PreviousConversationIDID, @UserID = @MJConversations_PreviousConversationID_UserID, @ExternalID = @MJConversations_PreviousConversationID_ExternalID, @Name = @MJConversations_PreviousConversationID_Name, @Description = @MJConversations_PreviousConversationID_Description, @Type = @MJConversations_PreviousConversationID_Type, @IsArchived = @MJConversations_PreviousConversationID_IsArchived, @LinkedEntityID = @MJConversations_PreviousConversationID_LinkedEntityID, @LinkedRecordID = @MJConversations_PreviousConversationID_LinkedRecordID, @DataContextID = @MJConversations_PreviousConversationID_DataContextID, @Status = @MJConversations_PreviousConversationID_Status, @EnvironmentID = @MJConversations_PreviousConversationID_EnvironmentID, @ProjectID = @MJConversations_PreviousConversationID_ProjectID, @IsPinned = @MJConversations_PreviousConversationID_IsPinned, @TestRunID = @MJConversations_PreviousConversationID_TestRunID, @ApplicationScope = @MJConversations_PreviousConversationID_ApplicationScope, @ApplicationID = @MJConversations_PreviousConversationID_ApplicationID, @DefaultAgentID = @MJConversations_PreviousConversationID_DefaultAgentID, @AdditionalData = @MJConversations_PreviousConversationID_AdditionalData, @RecordingFileID = @MJConversations_PreviousConversationID_RecordingFileID, @EgressID = @MJConversations_PreviousConversationID_EgressID, @VisitorKey = @MJConversations_PreviousConversationID_VisitorKey, @ResolvedEntityID = @MJConversations_PreviousConversationID_ResolvedEntityID, @ResolvedRecordID = @MJConversations_PreviousConversationID_ResolvedRecordID, @PreviousConversationID_Clear = 1, @PreviousConversationID = @MJConversations_PreviousConversationID_PreviousConversationID

        FETCH NEXT FROM cascade_update_MJConversations_PreviousConversationID_cursor INTO @MJConversations_PreviousConversationIDID, @MJConversations_PreviousConversationID_UserID, @MJConversations_PreviousConversationID_ExternalID, @MJConversations_PreviousConversationID_Name, @MJConversations_PreviousConversationID_Description, @MJConversations_PreviousConversationID_Type, @MJConversations_PreviousConversationID_IsArchived, @MJConversations_PreviousConversationID_LinkedEntityID, @MJConversations_PreviousConversationID_LinkedRecordID, @MJConversations_PreviousConversationID_DataContextID, @MJConversations_PreviousConversationID_Status, @MJConversations_PreviousConversationID_EnvironmentID, @MJConversations_PreviousConversationID_ProjectID, @MJConversations_PreviousConversationID_IsPinned, @MJConversations_PreviousConversationID_TestRunID, @MJConversations_PreviousConversationID_ApplicationScope, @MJConversations_PreviousConversationID_ApplicationID, @MJConversations_PreviousConversationID_DefaultAgentID, @MJConversations_PreviousConversationID_AdditionalData, @MJConversations_PreviousConversationID_RecordingFileID, @MJConversations_PreviousConversationID_EgressID, @MJConversations_PreviousConversationID_VisitorKey, @MJConversations_PreviousConversationID_ResolvedEntityID, @MJConversations_PreviousConversationID_ResolvedRecordID, @MJConversations_PreviousConversationID_PreviousConversationID
    END

    CLOSE cascade_update_MJConversations_PreviousConversationID_cursor
    DEALLOCATE cascade_update_MJConversations_PreviousConversationID_cursor
    
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

/* Index for Foreign Keys for OpenApp */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InstalledByUserID in table OpenApp
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenApp]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID ON [${flyway:defaultSchema}].[OpenApp] ([InstalledByUserID]);

/* Base View SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open Apps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenApp
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOpenApps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOpenApps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOpenApps]
AS
SELECT
    o.*,
    MJUser_InstalledByUserID.[Name] AS [InstalledByUser]
FROM
    [${flyway:defaultSchema}].[OpenApp] AS o
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_InstalledByUserID
  ON
    [o].[InstalledByUserID] = MJUser_InstalledByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Permissions for vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spCreateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(64),
    @DisplayName nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version nvarchar(50),
    @Publisher nvarchar(200),
    @PublisherEmail_Clear bit = 0,
    @PublisherEmail nvarchar(255) = NULL,
    @PublisherURL_Clear bit = 0,
    @PublisherURL nvarchar(500) = NULL,
    @RepositoryURL nvarchar(500),
    @SchemaName_Clear bit = 0,
    @SchemaName nvarchar(128) = NULL,
    @MJVersionRange nvarchar(100),
    @License_Clear bit = 0,
    @License nvarchar(50) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(20) = NULL,
    @ManifestJSON nvarchar(MAX),
    @ConfigurationSchemaJSON_Clear bit = 0,
    @ConfigurationSchemaJSON nvarchar(MAX) = NULL,
    @InstalledByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @Subpath_Clear bit = 0,
    @Subpath nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [ID],
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status],
                [Subpath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @DisplayName,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Version,
                @Publisher,
                CASE WHEN @PublisherEmail_Clear = 1 THEN NULL ELSE ISNULL(@PublisherEmail, NULL) END,
                CASE WHEN @PublisherURL_Clear = 1 THEN NULL ELSE ISNULL(@PublisherURL, NULL) END,
                @RepositoryURL,
                CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, NULL) END,
                @MJVersionRange,
                CASE WHEN @License_Clear = 1 THEN NULL ELSE ISNULL(@License, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                @ManifestJSON,
                CASE WHEN @ConfigurationSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationSchemaJSON, NULL) END,
                @InstalledByUserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status],
                [Subpath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @DisplayName,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Version,
                @Publisher,
                CASE WHEN @PublisherEmail_Clear = 1 THEN NULL ELSE ISNULL(@PublisherEmail, NULL) END,
                CASE WHEN @PublisherURL_Clear = 1 THEN NULL ELSE ISNULL(@PublisherURL, NULL) END,
                @RepositoryURL,
                CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, NULL) END,
                @MJVersionRange,
                CASE WHEN @License_Clear = 1 THEN NULL ELSE ISNULL(@License, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                @ManifestJSON,
                CASE WHEN @ConfigurationSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationSchemaJSON, NULL) END,
                @InstalledByUserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spUpdateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp]
    @ID uniqueidentifier,
    @Name nvarchar(64) = NULL,
    @DisplayName nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version nvarchar(50) = NULL,
    @Publisher nvarchar(200) = NULL,
    @PublisherEmail_Clear bit = 0,
    @PublisherEmail nvarchar(255) = NULL,
    @PublisherURL_Clear bit = 0,
    @PublisherURL nvarchar(500) = NULL,
    @RepositoryURL nvarchar(500) = NULL,
    @SchemaName_Clear bit = 0,
    @SchemaName nvarchar(128) = NULL,
    @MJVersionRange nvarchar(100) = NULL,
    @License_Clear bit = 0,
    @License nvarchar(50) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(20) = NULL,
    @ManifestJSON nvarchar(MAX) = NULL,
    @ConfigurationSchemaJSON_Clear bit = 0,
    @ConfigurationSchemaJSON nvarchar(MAX) = NULL,
    @InstalledByUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @Subpath_Clear bit = 0,
    @Subpath nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [DisplayName] = ISNULL(@DisplayName, [DisplayName]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Version] = ISNULL(@Version, [Version]),
        [Publisher] = ISNULL(@Publisher, [Publisher]),
        [PublisherEmail] = CASE WHEN @PublisherEmail_Clear = 1 THEN NULL ELSE ISNULL(@PublisherEmail, [PublisherEmail]) END,
        [PublisherURL] = CASE WHEN @PublisherURL_Clear = 1 THEN NULL ELSE ISNULL(@PublisherURL, [PublisherURL]) END,
        [RepositoryURL] = ISNULL(@RepositoryURL, [RepositoryURL]),
        [SchemaName] = CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, [SchemaName]) END,
        [MJVersionRange] = ISNULL(@MJVersionRange, [MJVersionRange]),
        [License] = CASE WHEN @License_Clear = 1 THEN NULL ELSE ISNULL(@License, [License]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [Color] = CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, [Color]) END,
        [ManifestJSON] = ISNULL(@ManifestJSON, [ManifestJSON]),
        [ConfigurationSchemaJSON] = CASE WHEN @ConfigurationSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationSchemaJSON, [ConfigurationSchemaJSON]) END,
        [InstalledByUserID] = ISNULL(@InstalledByUserID, [InstalledByUserID]),
        [Status] = ISNULL(@Status, [Status]),
        [Subpath] = CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, [Subpath]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOpenApps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenApp table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOpenApp]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOpenApp];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOpenApp
ON [${flyway:defaultSchema}].[OpenApp]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OpenApp] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spDeleteOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OpenApp]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for WidgetInstance */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Widget Instances
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table WidgetInstance
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WidgetInstance_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WidgetInstance]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WidgetInstance_ApplicationID ON [${flyway:defaultSchema}].[WidgetInstance] ([ApplicationID]);

-- Index for foreign key PinnedAgentID in table WidgetInstance
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WidgetInstance_PinnedAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WidgetInstance]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WidgetInstance_PinnedAgentID ON [${flyway:defaultSchema}].[WidgetInstance] ([PinnedAgentID]);

-- Index for foreign key GuestRoleID in table WidgetInstance
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WidgetInstance_GuestRoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WidgetInstance]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WidgetInstance_GuestRoleID ON [${flyway:defaultSchema}].[WidgetInstance] ([GuestRoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 7DF43368-7A23-4849-BB9A-7DD1F7DD9794 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7DF43368-7A23-4849-BB9A-7DD1F7DD9794', @RelatedEntityNameFieldMap='Application';

/* SQL text to update entity field related entity name field map for entity field ID F39393D1-0882-4068-A301-FBAA139BA57D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F39393D1-0882-4068-A301-FBAA139BA57D', @RelatedEntityNameFieldMap='PinnedAgent';

/* SQL text to update entity field related entity name field map for entity field ID 97CFEDC2-7739-496D-9E17-E8E7FEFBC476 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='97CFEDC2-7739-496D-9E17-E8E7FEFBC476', @RelatedEntityNameFieldMap='GuestRole';

/* Base View SQL for MJ: Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Widget Instances
-- Item: vwWidgetInstances
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Widget Instances
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  WidgetInstance
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwWidgetInstances]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwWidgetInstances];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwWidgetInstances]
AS
SELECT
    w.*,
    MJApplication_ApplicationID.[Name] AS [Application],
    MJAIAgent_PinnedAgentID.[Name] AS [PinnedAgent],
    MJRole_GuestRoleID.[Name] AS [GuestRole]
FROM
    [${flyway:defaultSchema}].[WidgetInstance] AS w
INNER JOIN
    [${flyway:defaultSchema}].[Application] AS MJApplication_ApplicationID
  ON
    [w].[ApplicationID] = MJApplication_ApplicationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_PinnedAgentID
  ON
    [w].[PinnedAgentID] = MJAIAgent_PinnedAgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_GuestRoleID
  ON
    [w].[GuestRoleID] = MJRole_GuestRoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwWidgetInstances] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Widget Instances
-- Item: Permissions for vwWidgetInstances
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWidgetInstances] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Widget Instances
-- Item: spCreateWidgetInstance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WidgetInstance
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWidgetInstance]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWidgetInstance];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWidgetInstance]
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
        INSERT INTO [${flyway:defaultSchema}].[WidgetInstance]
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
                ISNULL(@RememberReturningVisitors, 0),
                CASE WHEN @VisitorMemoryRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@VisitorMemoryRetentionDays, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[WidgetInstance]
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
                ISNULL(@RememberReturningVisitors, 0),
                CASE WHEN @VisitorMemoryRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@VisitorMemoryRetentionDays, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWidgetInstances] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWidgetInstance] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Widget Instances */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWidgetInstance] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Widget Instances
-- Item: spUpdateWidgetInstance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WidgetInstance
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWidgetInstance]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWidgetInstance];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWidgetInstance]
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
    @RememberReturningVisitors bit = NULL,
    @VisitorMemoryRetentionDays_Clear bit = 0,
    @VisitorMemoryRetentionDays int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WidgetInstance]
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
        [RememberReturningVisitors] = ISNULL(@RememberReturningVisitors, [RememberReturningVisitors]),
        [VisitorMemoryRetentionDays] = CASE WHEN @VisitorMemoryRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@VisitorMemoryRetentionDays, [VisitorMemoryRetentionDays]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWidgetInstances] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWidgetInstances]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWidgetInstance] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WidgetInstance table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWidgetInstance]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWidgetInstance];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWidgetInstance
ON [${flyway:defaultSchema}].[WidgetInstance]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WidgetInstance]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WidgetInstance] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Widget Instances */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWidgetInstance] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Widget Instances
-- Item: spDeleteWidgetInstance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WidgetInstance
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWidgetInstance]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWidgetInstance];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWidgetInstance]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WidgetInstance]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWidgetInstance] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Widget Instances */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWidgetInstance] TO [cdp_Developer], [cdp_Integration];

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
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ParentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ParentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ParentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ParentID_RecordingStorageProviderID

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID
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
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_DefaultCoAgentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID
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
    DECLARE @MJConversations_DefaultAgentID_ResolvedEntityID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ResolvedRecordID nvarchar(450)
    DECLARE @MJConversations_DefaultAgentID_PreviousConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [ResolvedEntityID], [ResolvedRecordID], [PreviousConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_ResolvedEntityID, @MJConversations_DefaultAgentID_ResolvedRecordID, @MJConversations_DefaultAgentID_PreviousConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @Type = @MJConversations_DefaultAgentID_Type, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData, @RecordingFileID = @MJConversations_DefaultAgentID_RecordingFileID, @EgressID = @MJConversations_DefaultAgentID_EgressID, @VisitorKey = @MJConversations_DefaultAgentID_VisitorKey, @ResolvedEntityID = @MJConversations_DefaultAgentID_ResolvedEntityID, @ResolvedRecordID = @MJConversations_DefaultAgentID_ResolvedRecordID, @PreviousConversationID = @MJConversations_DefaultAgentID_PreviousConversationID

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_ResolvedEntityID, @MJConversations_DefaultAgentID_ResolvedRecordID, @MJConversations_DefaultAgentID_PreviousConversationID
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
    
    -- Cascade delete from WidgetInstance using cursor to call spDeleteWidgetInstance
    DECLARE @MJWidgetInstances_PinnedAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJWidgetInstances_PinnedAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[WidgetInstance]
        WHERE [PinnedAgentID] = @ID
    
    OPEN cascade_delete_MJWidgetInstances_PinnedAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJWidgetInstances_PinnedAgentID_cursor INTO @MJWidgetInstances_PinnedAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteWidgetInstance] @ID = @MJWidgetInstances_PinnedAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJWidgetInstances_PinnedAgentID_cursor INTO @MJWidgetInstances_PinnedAgentIDID
    END
    
    CLOSE cascade_delete_MJWidgetInstances_PinnedAgentID_cursor
    DEALLOCATE cascade_delete_MJWidgetInstances_PinnedAgentID_cursor
    

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
    DECLARE @MJConversations_ApplicationID_ResolvedEntityID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ResolvedRecordID nvarchar(450)
    DECLARE @MJConversations_ApplicationID_PreviousConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_ApplicationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [ResolvedEntityID], [ResolvedRecordID], [PreviousConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [ApplicationID] = @ID

    OPEN cascade_update_MJConversations_ApplicationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_Type, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData, @MJConversations_ApplicationID_RecordingFileID, @MJConversations_ApplicationID_EgressID, @MJConversations_ApplicationID_VisitorKey, @MJConversations_ApplicationID_ResolvedEntityID, @MJConversations_ApplicationID_ResolvedRecordID, @MJConversations_ApplicationID_PreviousConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_ApplicationID_ApplicationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_ApplicationIDID, @UserID = @MJConversations_ApplicationID_UserID, @ExternalID = @MJConversations_ApplicationID_ExternalID, @Name = @MJConversations_ApplicationID_Name, @Description = @MJConversations_ApplicationID_Description, @Type = @MJConversations_ApplicationID_Type, @IsArchived = @MJConversations_ApplicationID_IsArchived, @LinkedEntityID = @MJConversations_ApplicationID_LinkedEntityID, @LinkedRecordID = @MJConversations_ApplicationID_LinkedRecordID, @DataContextID = @MJConversations_ApplicationID_DataContextID, @Status = @MJConversations_ApplicationID_Status, @EnvironmentID = @MJConversations_ApplicationID_EnvironmentID, @ProjectID = @MJConversations_ApplicationID_ProjectID, @IsPinned = @MJConversations_ApplicationID_IsPinned, @TestRunID = @MJConversations_ApplicationID_TestRunID, @ApplicationScope = @MJConversations_ApplicationID_ApplicationScope, @ApplicationID_Clear = 1, @ApplicationID = @MJConversations_ApplicationID_ApplicationID, @DefaultAgentID = @MJConversations_ApplicationID_DefaultAgentID, @AdditionalData = @MJConversations_ApplicationID_AdditionalData, @RecordingFileID = @MJConversations_ApplicationID_RecordingFileID, @EgressID = @MJConversations_ApplicationID_EgressID, @VisitorKey = @MJConversations_ApplicationID_VisitorKey, @ResolvedEntityID = @MJConversations_ApplicationID_ResolvedEntityID, @ResolvedRecordID = @MJConversations_ApplicationID_ResolvedRecordID, @PreviousConversationID = @MJConversations_ApplicationID_PreviousConversationID

        FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_Type, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData, @MJConversations_ApplicationID_RecordingFileID, @MJConversations_ApplicationID_EgressID, @MJConversations_ApplicationID_VisitorKey, @MJConversations_ApplicationID_ResolvedEntityID, @MJConversations_ApplicationID_ResolvedRecordID, @MJConversations_ApplicationID_PreviousConversationID
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
    
    -- Cascade delete from WidgetInstance using cursor to call spDeleteWidgetInstance
    DECLARE @MJWidgetInstances_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJWidgetInstances_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[WidgetInstance]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJWidgetInstances_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJWidgetInstances_ApplicationID_cursor INTO @MJWidgetInstances_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteWidgetInstance] @ID = @MJWidgetInstances_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJWidgetInstances_ApplicationID_cursor INTO @MJWidgetInstances_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJWidgetInstances_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJWidgetInstances_ApplicationID_cursor
    

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '451c476e-a0a5-4044-9bed-fc884ef3d28a' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ResolvedEntity')) BEGIN
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
            '451c476e-a0a5-4044-9bed-fc884ef3d28a',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100073,
            'ResolvedEntity',
            'Resolved Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd73d7da-b3ca-442b-bc9d-f523ef1bb244' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PreviousConversation')) BEGIN
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
            'bd73d7da-b3ca-442b-bc9d-f523ef1bb244',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100074,
            'PreviousConversation',
            'Previous Conversation',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25d473ef-91b3-4adb-a3a3-558e509d5955' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootPreviousConversationID')) BEGIN
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
            '25d473ef-91b3-4adb-a3a3-558e509d5955',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100075,
            'RootPreviousConversationID',
            'Root Previous Conversation ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '571da0b0-a5e2-4866-aaa7-a4e6f92dd5d2' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'Application')) BEGIN
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
            '571da0b0-a5e2-4866-aaa7-a4e6f92dd5d2',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
            100035,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '136c3d70-e8e0-4880-9f18-92a69c5cf576' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'PinnedAgent')) BEGIN
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
            '136c3d70-e8e0-4880-9f18-92a69c5cf576',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
            100036,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '79400ab6-bca2-487e-bc57-9e0b00629085' OR (EntityID = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D' AND Name = 'GuestRole')) BEGIN
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
            '79400ab6-bca2-487e-bc57-9e0b00629085',
            '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', -- Entity: MJ: Widget Instances
            100037,
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '335AEA03-8486-435D-B305-BE9411D8B163'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A0A76505-2F99-42E2-A9D7-14673BE34162'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3AA13694-DF85-40DA-BCEC-7A1D2869FE27'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '571DA0B0-A5E2-4866-AAA7-A4E6F92DD5D2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '335AEA03-8486-435D-B305-BE9411D8B163'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '66DF0AEB-835E-4B94-A625-69D5D7AC1A24'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '335AEA03-8486-435D-B305-BE9411D8B163'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '27E04775-D00D-4D25-A076-4A6FF0205260'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'ABE2E189-4467-4E98-87C5-B209D656438B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '27E04775-D00D-4D25-A076-4A6FF0205260'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '6AC413DC-EBE1-4DFC-9BE4-8E44377B7F46'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'AC4A2799-454B-4395-AA56-A42241F32C12'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Widget Instances.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A1B0776-336F-4960-A100-FC4C85F62562' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Widget Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '66DF0AEB-835E-4B94-A625-69D5D7AC1A24' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.PublicKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Widget Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '335AEA03-8486-435D-B305-BE9411D8B163' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.ApplicationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Application',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DF43368-7A23-4849-BB9A-7DD1F7DD9794' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.PinnedAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Pinned Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F39393D1-0882-4068-A301-FBAA139BA57D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.GuestRoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Guest Role',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '97CFEDC2-7739-496D-9E17-E8E7FEFBC476' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.AllowedOrigins 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Security',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08C80FF3-EAB5-4A29-ACC1-B5598D760ECB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.Modality 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Widget Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0A76505-2F99-42E2-A9D7-14673BE34162' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.AuthStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Security',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '471611E9-C1C2-4C9C-9F82-77894E218E24' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Widget Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3AA13694-DF85-40DA-BCEC-7A1D2869FE27' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.SessionTTLMinutes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session and Abuse Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Session TTL (Minutes)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B77C411A-CB2F-4F70-8E57-01B2B29CC8D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.RateLimitPerMinute 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session and Abuse Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E45B7124-A337-4AE4-AD25-DFDE57772424' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.VoiceMaxSessionMinutes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session and Abuse Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5E677365-4180-4DA9-872B-9E1EF4B39457' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.RememberReturningVisitors 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Visitor Experience',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AE5F8F88-4265-4A6B-A1EB-EB76AF246AD3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.VisitorMemoryRetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Visitor Experience',
   GeneratedFormSection = 'Category',
   DisplayName = 'Visitor Memory Retention (Days)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B500B73D-BC6A-4E9D-99A0-BA8821C541C1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB4BA7D8-CDA6-48A9-BAD3-654A28178B7F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F390069-5D45-45B4-848B-2AD09463721A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.Application 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Application Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '571DA0B0-A5E2-4866-AAA7-A4E6F92DD5D2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.PinnedAgent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Pinned Agent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '136C3D70-E8E0-4880-9F18-92A69C5CF576' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Widget Instances.GuestRole 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Guest Role Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '79400AB6-BCA2-487E-BC57-9E0B00629085' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-window-maximize */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-window-maximize', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('397c2a55-9800-43b5-abd9-f83d25619287', '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', 'FieldCategoryInfo', '{"Widget Configuration":{"icon":"fa fa-sliders-h","description":"General settings and deployment identification"},"Integration and Security":{"icon":"fa fa-shield-alt","description":"Security boundaries, auth strategies, and system linking"},"Session and Abuse Control":{"icon":"fa fa-tachometer-alt","description":"Limits and duration settings to manage abuse and performance"},"Visitor Experience":{"icon":"fa fa-user-clock","description":"Settings for managing returning visitor context and memory"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('f7ed67d5-e0b3-47b3-b822-1b68985acf1f', '4DD2FD4A-19A0-4822-8380-6F13E0558F7D', 'FieldCategoryIcons', '{"Widget Configuration":"fa fa-sliders-h","Integration and Security":"fa fa-shield-alt","Session and Abuse Control":"fa fa-tachometer-alt","Visitor Experience":"fa fa-user-clock","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '4DD2FD4A-19A0-4822-8380-6F13E0558F7D';

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Open Apps.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7655DE67-050C-4FEC-833F-3B3FE61E2451' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6AC413DC-EBE1-4DFC-9BE4-8E44377B7F46' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27E04775-D00D-4D25-A076-4A6FF0205260' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3849DB2D-73C2-46BF-B263-AF66D6A0B34D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Version and Compatibility',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABE2E189-4467-4E98-87C5-B209D656438B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.MJVersionRange 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Version and Compatibility',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A1465DB-2055-46AB-93D8-A70DD2245102' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Publisher 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.PublisherEmail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '0F40CC6A-B28A-4B49-AF23-BEFE1B9907D3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.PublisherURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'F099ED4E-387C-4F5E-87A7-5272516719D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.RepositoryURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '132CF4B3-E5E5-4083-B91D-1A629352872B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.License 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8721CEB2-E802-4C49-BBFC-BF6AEB51544B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8A2781A-95C0-4335-81B6-0021B7078E06' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'UI Branding',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '19CD1851-4DA5-43E7-BCE7-175F1248EB26' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Color 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'UI Branding',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8A25DC2-66A9-4338-8CD5-C169F940372E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.ManifestJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B37C9605-C957-4A09-ACC6-2862C1A86D67' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.ConfigurationSchemaJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '519A5582-4618-4138-B19C-1713064CC457' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.InstalledByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A47E36F4-7942-4A8B-9735-72F74B07C618' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8416B44A-1A4D-4D48-AC1F-5831D14DFA12' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12A25C96-E439-471A-AB5D-E190A3FFC957' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Subpath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37EC18E7-34CB-436C-8CA1-7E6FB73AEC1A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.InstalledByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC2D5658-7CAD-45CA-BCC5-A87E70144545' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-puzzle-piece */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-puzzle-piece', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'AC4A2799-454B-4395-AA56-A42241F32C12';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e49e61b8-341b-4b27-8a1b-67ca7bf10c0f', 'AC4A2799-454B-4395-AA56-A42241F32C12', 'FieldCategoryInfo', '{"App Identity":{"icon":"fa fa-id-card","description":"Core identifying information and current status of the application"},"Version and Compatibility":{"icon":"fa fa-code-branch","description":"Version tracking and framework compatibility requirements"},"Publisher Information":{"icon":"fa fa-building","description":"Details regarding the author, contact information, and licensing"},"UI Branding":{"icon":"fa fa-palette","description":"Visual customization settings for the application interface"},"Technical Configuration":{"icon":"fa fa-wrench","description":"Low-level configuration, schema, and manifest definitions"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7d58ee3a-97dd-4142-a2f8-06cf39f81c4b', 'AC4A2799-454B-4395-AA56-A42241F32C12', 'FieldCategoryIcons', '{"App Identity":"fa fa-id-card","Version and Compatibility":"fa fa-code-branch","Publisher Information":"fa fa-building","UI Branding":"fa fa-palette","Technical Configuration":"fa fa-wrench","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set categories for 39 fields */

-- UPDATE Entity Field Category Info MJ: Conversations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.IsArchived 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '144417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '575753A4-C12E-4E48-A835-6FE3FACE5527' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.IsPinned 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7CAD1EDB-FDFC-4C19-8E8C-CCBCE0C60558' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '104E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.ExternalID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '114E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.LinkedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Linked Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '814E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.LinkedRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Linked Record',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '824E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.LinkedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Linked Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '834E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.VisitorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participants & References',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '49C35CCD-B95B-48C0-B027-799D738E5749' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.ResolvedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participants & References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resolved Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A4A1AEB0-D11B-4D5B-A1D4-7E8E61920BC0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.ResolvedRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participants & References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resolved Record',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B7042CF-EA36-43C6-B2A3-2FABE6B85038' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.PreviousConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participants & References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Previous Conversation',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4107AAA2-D63B-4A2E-8D12-05F92B12EFA1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.ResolvedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participants & References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resolved Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '451C476E-A0A5-4044-9BED-FC884EF3D28A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.PreviousConversation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participants & References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Previous Conversation Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD73D7DA-B3CA-442B-BC9D-F523EF1BB244' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.RootPreviousConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participants & References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Previous Conversation',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '25D473EF-91B3-4ADB-A3A3-558E509D5955' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.DataContextID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Data Context',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.EnvironmentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Environment',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8EE672F-D2DF-4C0F-81FC-1392FCAD9813' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.ProjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Project',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB07B3D0-FF8B-43AD-A612-01340C796652' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.DataContext 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Data Context Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1AE26D76-2246-4FD4-8BCB-04C1953E2612' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.Environment 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Environment Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '49A2D31E-331D-42C6-BA30-C96EB5A1310F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.Project 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Project Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE95FC8E-8A64-48D1-AA72-2F141C9199A2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.TestRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Test Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E687A08-D39E-4488-9AF9-C71394F7217A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.TestRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Test Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '281A4C5E-0BE9-48EC-9AFE-2CAB36118447' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.ApplicationScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E6637F4-CFB6-4722-B00B-9DB7C0440E0B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.ApplicationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Application',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1EC97AB3-F5F1-493C-A3B1-6583AEE9F649' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.DefaultAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1FBFCE7B-F7ED-4245-A862-AF9F72F20E2B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.AdditionalData 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '83E9FBC5-ED0F-4F37-BF90-29DD94CDED94' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.Application 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Application Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1252BE08-2567-4DA1-98C6-75AD57B2FE41' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.DefaultAgent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Agent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '996F4F15-858F-428C-8962-6BBD6AE78585' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.RecordingFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Recording File',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD2A591E-0B24-494E-BED3-752C84126D13' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.EgressID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9AC692D0-1927-4C2F-846A-71A0DFA478AF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversations.RecordingFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Recording File Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7EF418D2-A409-4FE4-B49D-121C814BBFF3' AND AutoUpdateCategory = 1;

/* Generated Validation Functions for MJ: Widget Instances */
-- CHECK constraint for MJ: Widget Instances: Field: RateLimitPerMinute was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([RateLimitPerMinute]>(0))', 'public ValidateRateLimitPerMinuteGreaterThanZero(result: ValidationResult) {
	if (this.RateLimitPerMinute !== undefined && this.RateLimitPerMinute !== null && this.RateLimitPerMinute <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"RateLimitPerMinute",
			"Rate limit per minute must be greater than 0.",
			this.RateLimitPerMinute,
			ValidationErrorType.Failure
		));
	}
}', 'The rate limit per minute must be a positive number greater than zero to ensure API requests are throttled correctly.', 'ValidateRateLimitPerMinuteGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'E45B7124-A337-4AE4-AD25-DFDE57772424');

            -- CHECK constraint for MJ: Widget Instances: Field: SessionTTLMinutes was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
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
}', 'The session time-to-live (TTL) must be greater than 0 minutes and cannot exceed 1440 minutes (24 hours) to ensure session durations remain within a secure and valid range.', 'ValidateSessionTTLMinutesRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B77C411A-CB2F-4F70-8E57-01B2B29CC8D1');

            -- CHECK constraint for MJ: Widget Instances: Field: VisitorMemoryRetentionDays was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
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
}', 'Visitor memory retention days must be a positive number greater than 0 if specified.', 'ValidateVisitorMemoryRetentionDaysGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B500B73D-BC6A-4E9D-99A0-BA8821C541C1');

