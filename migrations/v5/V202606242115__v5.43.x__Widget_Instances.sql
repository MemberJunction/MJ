-- ============================================================================
-- Migration: Widget Instances  ("MJ: Widget Instances")
-- Part of the Public Web Widget program (plans/realtime/bridges-and-widget/public-web-widget.md, Phase W2).
--
-- A Widget Instance is the durable, per-deployment configuration for one
-- embeddable public support widget — one row per site/embed that drops the
-- <script> tag. It resolves a public widget key (pk_live_…) to:
--   * the Application the guest session is scoped to,
--   * the PINNED support agent (D5: the widget always passes explicitAgentId),
--   * the restricted GUEST ROLE that bounds the synthesized guest principal,
--   * the allowed embedding origins (CORS + mint allowlist),
--   * the enabled modality (Text / Voice / Both) and the auth strategy (D1),
--   * rate-limit + voice-abuse ceilings.
--
-- WHY A NEW ENTITY (open question #3 in the widget doc, resolved):
--   Magic-link rows model an EPHEMERAL, per-token invite/redemption. A widget
--   instance models DURABLE per-deployment config (long-lived public key, pinned
--   agent, origin allowlist, modality). These are different lifecycles and a
--   1:1 reuse would overload the invite table. The widget REUSES the magic-link
--   *minting path* (anonymous-embed) at session time, but its configuration is
--   its own entity. (See WidgetSessionService in W1.)
--
-- NOTE: No __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are declared
--   here — CodeGen generates those. The UNIQUE constraint on PublicKey IS
--   declared (it is not a foreign key). Seed data is applied via mj-sync
--   metadata (metadata/widget-instances/), NOT SQL INSERTs (MJ convention).
-- ============================================================================

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
        CHECK (RateLimitPerMinute > 0)
);

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
