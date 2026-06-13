/* ============================================================================
   Realtime Bridges — Meeting & Telephony media transports for AI agents
   v5.42.x

   Companion plan: /plans/realtime/realtime-bridges-architecture.md

   ONE realtime engine; a *bridge* is a pluggable MEDIA transport (audio, video,
   screen — full duplex) + channel contributor that connects that engine to an
   external endpoint: a Zoom/Teams/Slack/Meet/Webex/Discord MEETING, or a
   Twilio/Vonage/RingCentral/VOIP CALL. Nothing here is audio-specific — media
   tracks are typed and directional so video lights up with zero re-architecture.

   This migration is Phase 1 of the program: the schema only. Five new tables,
   no destructive changes, no modification of the shipped realtime tables:

     AIBridgeProvider          — the platform registry + capability flags
                                       (what each platform supports; the engine
                                       gates optional calls on these flags).
     AIBridgeAgentIdentity     — an agent's addressable identity per
                                       platform (calendar mailbox / phone number)
                                       — how invite-based joins and inbound
                                       routing find the agent.
     AIBridgeProviderChannel   — junction: which AIAgentChannel rows a
                                       provider contributes by default. Bridge
                                       channels live in the SAME registry as
                                       MJ-native channels ("3rd-party channels
                                       understood the same way as MJ channels").
     AIAgentSessionBridge            — binds an existing AIAgentSession to a
                                       bridge connection (the session IS the
                                       realtime session; the bridge is an
                                       ATTACHMENT, exactly like
                                       AIAgentSessionChannel attaches a channel).
     AIAgentSessionBridgeParticipant — who is on the meeting/call (diarization
                                       mapping + multi-party awareness).

   Telephony reuses these SAME tables (BridgeType='Telephony',
   IdentityType='PhoneNumber', Direction Inbound/Outbound) — no schema fork.

   CodeGen convention (per CLAUDE.md migrations guide):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
     * sp_addextendedproperty on business columns so CodeGen surfaces descriptions.
     * Status / enum columns use CHECK constraints so CodeGen emits string-union
       types. Server code that sets/reads the new columns ships AFTER CodeGen
       generates the typed entity properties, per the no-weak-typing rule.
     * Reference data (provider rows + capability flags, the authorization, any
       default provider-channel rows) is seeded via metadata/mj-sync, NOT here.

   Entity metadata, views, and spCreate/Update/Delete are produced by CodeGen
   after this migration runs.
   ============================================================================ */


-- ============================================================================
-- 1. AIBridgeProvider  ("MJ: AI Bridge Providers")
--    The platform registry. Capability flags are TRANSPORT/MEDIA concerns only
--    (join methods, directional media tracks, diarization, DTMF/transfer,
--    recording). Interactive surfaces (hand-raise, chat, whiteboard) are NOT
--    flags here — they are CHANNELS the bridge contributes (see table 3).
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIBridgeProvider (
    ID                          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                        NVARCHAR(100)    NOT NULL,
    Description                 NVARCHAR(1000)   NULL,
    BridgeType                  NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIBridgeProvider_BridgeType DEFAULT ('Meeting'),
    DriverClass                 NVARCHAR(250)    NOT NULL,
    Status                      NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIBridgeProvider_Status DEFAULT ('Active'),
    SupportedFeatures           NVARCHAR(MAX)    NULL,
    ConfigSchema                NVARCHAR(MAX)    NULL,
    Configuration               NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_AIBridgeProvider PRIMARY KEY (ID),
    CONSTRAINT UQ_AIBridgeProvider_Name UNIQUE (Name),
    CONSTRAINT CK_AIBridgeProvider_BridgeType
        CHECK (BridgeType IN ('Meeting', 'Telephony')),
    CONSTRAINT CK_AIBridgeProvider_Status
        CHECK (Status IN ('Active', 'Disabled'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique platform name (e.g. Zoom, Microsoft Teams, Google Meet, Webex, Slack, Discord, RingCentral, Twilio, Vonage, LiveKit).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProvider', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional human-readable description of the platform / driver.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProvider', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The family of endpoint this bridge connects to: Meeting (a conferencing room) or Telephony (a phone call). LiveKit (MJ-native multi-party room) is a Meeting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProvider', @level2type = N'COLUMN', @level2name = N'BridgeType';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseRealtimeBridge, DriverClass). MUST match the @RegisterClass key on the concrete bridge driver.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProvider', @level2type = N'COLUMN', @level2name = N'DriverClass';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this provider is available for use. Inactive providers cannot start new bridge sessions.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProvider', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Strongly-typed JSON of the platform''s supported features (the IBridgeProviderFeatures interface, bound via JSONType metadata): join methods (OnDemandJoin, ScheduledJoin, InviteJoin, NativeInvite, InboundRouting, OutboundDial), directional media tracks (AudioIn/Out, VideoIn/Out, ScreenIn/Out), and signals (SpeakerDiarization, DTMF, CallTransfer, Recording). The engine gates optional driver calls on these flags; the base driver throws BridgeCapabilityNotSupportedError when a feature is claimed but unimplemented. Held as JSON so new features need no schema change. NULL/omitted = unsupported.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProvider', @level2type = N'COLUMN', @level2name = N'SupportedFeatures';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional JSON Schema validating the provider Configuration and per-session bridge Config payloads.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProvider', @level2type = N'COLUMN', @level2name = N'ConfigSchema';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Provider-level configuration JSON (e.g. credential references resolved via the MJ credential system, region, bot display name). Never store secrets inline.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProvider', @level2type = N'COLUMN', @level2name = N'Configuration';


-- ============================================================================
-- 2. AIBridgeAgentIdentity  ("MJ: AI Bridge Agent Identities")
--    An agent's addressable identity on a platform — the calendar mailbox that
--    organizers invite, or the phone number that routes inbound calls. The seam
--    that generalizes to agent "presence" (email/calendar/telephony) over time.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIBridgeAgentIdentity (
    ID             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID        UNIQUEIDENTIFIER NOT NULL,
    ProviderID     UNIQUEIDENTIFIER NOT NULL,
    IdentityType   NVARCHAR(20)     NOT NULL,
    IdentityValue  NVARCHAR(500)    NOT NULL,
    DisplayName    NVARCHAR(255)    NULL,
    IsActive       BIT              NOT NULL CONSTRAINT DF_AIBridgeAgentIdentity_IsActive DEFAULT (1),
    Configuration  NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_AIBridgeAgentIdentity PRIMARY KEY (ID),
    CONSTRAINT FK_AIBridgeAgentIdentity_Agent FOREIGN KEY (AgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID),
    CONSTRAINT FK_AIBridgeAgentIdentity_Provider FOREIGN KEY (ProviderID)
        REFERENCES ${flyway:defaultSchema}.AIBridgeProvider (ID),
    CONSTRAINT UQ_AIBridgeAgentIdentity UNIQUE (ProviderID, IdentityValue),
    CONSTRAINT CK_AIBridgeAgentIdentity_Type
        CHECK (IdentityType IN ('Email', 'PhoneNumber', 'AccountID'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The kind of address: Email (a calendar mailbox organizers invite), PhoneNumber (an inbound DID), or AccountID (a platform-native bot/user account).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeAgentIdentity', @level2type = N'COLUMN', @level2name = N'IdentityType';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The address value itself (e.g. sage@customer.com, +15551234567, or a platform account id). Unique per provider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeAgentIdentity', @level2type = N'COLUMN', @level2name = N'IdentityValue';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Friendly display name shown to other participants (e.g. "Sage (AI)").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeAgentIdentity', @level2type = N'COLUMN', @level2name = N'DisplayName';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this identity is active. Inactive identities are ignored by invite watchers and inbound routing.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeAgentIdentity', @level2type = N'COLUMN', @level2name = N'IsActive';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Identity-level configuration JSON (e.g. tenant/mailbox references, calendar-watch scopes). Credentials resolve via the MJ credential system; never inline.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeAgentIdentity', @level2type = N'COLUMN', @level2name = N'Configuration';


-- ============================================================================
-- 3. AIBridgeProviderChannel  ("MJ: AI Bridge Provider Channels")
--    Junction declaring which AIAgentChannel rows a provider contributes by
--    default (e.g. Zoom -> Meeting Controls + Native Whiteboard). Bridge
--    channels live in the SAME AIAgentChannel registry as MJ-native channels,
--    so 3rd-party surfaces are understood exactly like MJ channels. Fully
--    runtime-dynamic channels (no registry row) are handled separately in a
--    later phase and are not modeled here.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIBridgeProviderChannel (
    ID             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProviderID     UNIQUEIDENTIFIER NOT NULL,
    ChannelID      UNIQUEIDENTIFIER NOT NULL,
    IsDefault      BIT              NOT NULL CONSTRAINT DF_AIBridgeProviderChannel_IsDefault DEFAULT (1),
    Sequence       INT              NOT NULL CONSTRAINT DF_AIBridgeProviderChannel_Sequence DEFAULT (0),
    Configuration  NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_AIBridgeProviderChannel PRIMARY KEY (ID),
    CONSTRAINT FK_AIBridgeProviderChannel_Provider FOREIGN KEY (ProviderID)
        REFERENCES ${flyway:defaultSchema}.AIBridgeProvider (ID),
    CONSTRAINT FK_AIBridgeProviderChannel_Channel FOREIGN KEY (ChannelID)
        REFERENCES ${flyway:defaultSchema}.AIAgentChannel (ID),
    CONSTRAINT UQ_AIBridgeProviderChannel UNIQUE (ProviderID, ChannelID)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When 1, this channel is auto-attached to a new bridge session on this provider; when 0, it is available but attached on demand.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProviderChannel', @level2type = N'COLUMN', @level2name = N'IsDefault';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display/attachment order of this channel for the provider (ascending).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProviderChannel', @level2type = N'COLUMN', @level2name = N'Sequence';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional per-provider configuration JSON for this channel contribution (e.g. mapping platform tool names to the channel''s tool vocabulary).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeProviderChannel', @level2type = N'COLUMN', @level2name = N'Configuration';


-- ============================================================================
-- 4. AIAgentSessionBridge  ("MJ: AI Agent Session Bridges")
--    Binds an existing AIAgentSession to a bridge connection. The session IS the
--    realtime session (co-agent, tools, narration, transcript, persistence all
--    reused); this row is the transport ATTACHMENT, parallel to
--    AIAgentSessionChannel. HostInstanceID + CloseReason mirror AIAgentSession
--    for node affinity + janitor reconciliation.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIAgentSessionBridge (
    ID                    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentSessionID        UNIQUEIDENTIFIER NOT NULL,
    ProviderID            UNIQUEIDENTIFIER NOT NULL,
    Direction             NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIAgentSessionBridge_Direction DEFAULT ('Outbound'),
    JoinMethod            NVARCHAR(30)     NOT NULL CONSTRAINT DF_AIAgentSessionBridge_JoinMethod DEFAULT ('OnDemand'),
    TurnMode              NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIAgentSessionBridge_TurnMode DEFAULT ('Passive'),
    ExternalConnectionID  NVARCHAR(500)    NULL,
    Address               NVARCHAR(2000)   NULL,
    BotParticipantID      NVARCHAR(500)    NULL,
    Status                NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIAgentSessionBridge_Status DEFAULT ('Pending'),
    ScheduledStartTime    DATETIMEOFFSET   NULL,
    ConnectedAt           DATETIMEOFFSET   NULL,
    DisconnectedAt        DATETIMEOFFSET   NULL,
    CloseReason           NVARCHAR(20)     NULL,
    HostInstanceID        NVARCHAR(200)    NULL,
    Config                NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_AIAgentSessionBridge PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentSessionBridge_Session FOREIGN KEY (AgentSessionID)
        REFERENCES ${flyway:defaultSchema}.AIAgentSession (ID),
    CONSTRAINT FK_AIAgentSessionBridge_Provider FOREIGN KEY (ProviderID)
        REFERENCES ${flyway:defaultSchema}.AIBridgeProvider (ID),
    CONSTRAINT CK_AIAgentSessionBridge_Direction
        CHECK (Direction IN ('Inbound', 'Outbound')),
    CONSTRAINT CK_AIAgentSessionBridge_JoinMethod
        CHECK (JoinMethod IN ('OnDemand', 'Scheduled', 'Invite', 'NativeInvite', 'InboundRoute', 'InMeetingCommand')),
    CONSTRAINT CK_AIAgentSessionBridge_TurnMode
        CHECK (TurnMode IN ('Passive', 'Active', 'Hybrid')),
    CONSTRAINT CK_AIAgentSessionBridge_Status
        CHECK (Status IN ('Pending', 'Scheduled', 'Connecting', 'Connected', 'Disconnecting', 'Disconnected', 'Failed')),
    CONSTRAINT CK_AIAgentSessionBridge_CloseReason
        CHECK (CloseReason IN ('Explicit', 'HostEnded', 'Janitor', 'Error', 'Shutdown'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Direction of the connection: Outbound (the agent goes to a meeting / places a call) or Inbound (a meeting/call routes to the agent).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'Direction';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'How the agent connected: OnDemand, Scheduled, Invite (calendar), NativeInvite (platform UI), InboundRoute (call/invite to the agent''s identity), or InMeetingCommand (chat command).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'JoinMethod';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Turn-taking mode for this bridged session: Passive (speak only when addressed — default), Active (proactive in silence windows), or Hybrid (passive voice + post-to-chat hand-raise).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'TurnMode';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The platform''s identifier for the connection (meeting id / call SID), set once connecting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'ExternalConnectionID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The endpoint address: a meeting join URL (meetings) or a phone number (telephony).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'Address';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The agent bot''s own participant id within the meeting/call once admitted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'BotParticipantID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Bridge connection lifecycle: Pending, Scheduled, Connecting, Connected, Disconnecting, Disconnected, or Failed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For scheduled/invite joins: when the bridge should connect. NULL for immediate (on-demand/inbound).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'ScheduledStartTime';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the bridge became Connected (media flowing). NULL until connected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'ConnectedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the bridge disconnected. NULL while still connected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'DisconnectedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Why the bridge closed: Explicit, HostEnded (the meeting/call ended), Janitor (orphan sweep), Error, or Shutdown. NULL while active.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'CloseReason';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Identifier of the server node currently hosting this bridge''s bot connection (hostname:pid:bootId). Used for affinity and janitor orphan reconciliation, mirroring AIAgentSession.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'HostInstanceID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Per-session bridge configuration/state JSON (validated against the provider ConfigSchema).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'Config';


-- ============================================================================
-- 5. AIAgentSessionBridgeParticipant  ("MJ: AI Agent Session Bridge Participants")
--    Who is on the meeting/call — diarization mapping + multi-party awareness
--    (the signal intel a facilitator agent reads). One row per participant,
--    including the agent bot itself (IsAgent = 1).
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIAgentSessionBridgeParticipant (
    ID                     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SessionBridgeID        UNIQUEIDENTIFIER NOT NULL,
    ExternalParticipantID  NVARCHAR(500)    NULL,
    DisplayName            NVARCHAR(500)    NULL,
    Role                   NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIAgentSessionBridgeParticipant_Role DEFAULT ('Participant'),
    UserID                 UNIQUEIDENTIFIER NULL,
    IsAgent                BIT              NOT NULL CONSTRAINT DF_AIAgentSessionBridgeParticipant_IsAgent DEFAULT (0),
    JoinedAt               DATETIMEOFFSET   NULL,
    LeftAt                 DATETIMEOFFSET   NULL,
    CONSTRAINT PK_AIAgentSessionBridgeParticipant PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentSessionBridgeParticipant_Bridge FOREIGN KEY (SessionBridgeID)
        REFERENCES ${flyway:defaultSchema}.AIAgentSessionBridge (ID),
    CONSTRAINT FK_AIAgentSessionBridgeParticipant_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT CK_AIAgentSessionBridgeParticipant_Role
        CHECK (Role IN ('Host', 'CoHost', 'Participant', 'Agent'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The platform''s participant identifier (used to map diarized audio to a person).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridgeParticipant', @level2type = N'COLUMN', @level2name = N'ExternalParticipantID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The participant''s display name as shown on the platform.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridgeParticipant', @level2type = N'COLUMN', @level2name = N'DisplayName';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The participant''s role in the meeting/call: Host, CoHost, Participant, or Agent (the AI bot).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridgeParticipant', @level2type = N'COLUMN', @level2name = N'Role';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The matched MJ user, when the participant can be identified (NULL for external/anonymous participants).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridgeParticipant', @level2type = N'COLUMN', @level2name = N'UserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'True when this participant is the bridged AI agent bot itself.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridgeParticipant', @level2type = N'COLUMN', @level2name = N'IsAgent';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the participant joined the meeting/call.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridgeParticipant', @level2type = N'COLUMN', @level2name = N'JoinedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the participant left. NULL while still present.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridgeParticipant', @level2type = N'COLUMN', @level2name = N'LeftAt';






































































-- CODE GEN RUN
