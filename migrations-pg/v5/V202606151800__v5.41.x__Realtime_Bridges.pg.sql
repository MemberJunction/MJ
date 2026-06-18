-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606151800__v5.41.x__Realtime_Bridges.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

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
   ============================================================================ */ /* ============================================================================ */ /* 1. AIBridgeProvider  ("MJ: AI Bridge Providers") */ /*    The platform registry. Capability flags are TRANSPORT/MEDIA concerns only */ /*    (join methods, directional media tracks, diarization, DTMF/transfer, */ /*    recording). Interactive surfaces (hand-raise, chat, whiteboard) are NOT */ /*    flags here — they are CHANNELS the bridge contributes (see table 3). */ /* ============================================================================ */
CREATE TABLE __mj."AIBridgeProvider" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(100) NOT NULL,
  "Description" VARCHAR(1000) NULL,
  "BridgeType" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIBridgeProvider_BridgeType" DEFAULT (
    'Meeting'
  ),
  "DriverClass" VARCHAR(250) NOT NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIBridgeProvider_Status" DEFAULT (
    'Active'
  ),
  "SupportedFeatures" TEXT NULL,
  "ConfigSchema" TEXT NULL,
  "Configuration" TEXT NULL,
  CONSTRAINT "PK_AIBridgeProvider" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_AIBridgeProvider_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "CK_AIBridgeProvider_BridgeType" CHECK ("BridgeType" IN ('Meeting', 'Telephony')),
  CONSTRAINT "CK_AIBridgeProvider_Status" CHECK ("Status" IN ('Active', 'Disabled'))
);

COMMENT ON COLUMN __mj."AIBridgeProvider"."Name" IS 'Unique platform name (e.g. Zoom, Microsoft Teams, Google Meet, Webex, Slack, Discord, RingCentral, Twilio, Vonage, LiveKit).';

COMMENT ON COLUMN __mj."AIBridgeProvider"."Description" IS 'Optional human-readable description of the platform / driver.';

COMMENT ON COLUMN __mj."AIBridgeProvider"."BridgeType" IS 'The family of endpoint this bridge connects to: Meeting (a conferencing room) or Telephony (a phone call). LiveKit (MJ-native multi-party room) is a Meeting.';

COMMENT ON COLUMN __mj."AIBridgeProvider"."DriverClass" IS 'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseRealtimeBridge, DriverClass). MUST match the @RegisterClass key on the concrete bridge driver.';

COMMENT ON COLUMN __mj."AIBridgeProvider"."Status" IS 'Whether this provider is available for use. Inactive providers cannot start new bridge sessions.';

COMMENT ON COLUMN __mj."AIBridgeProvider"."SupportedFeatures" IS 'Strongly-typed JSON of the platform''s supported features (the IBridgeProviderFeatures interface, bound via JSONType metadata): join methods (OnDemandJoin, ScheduledJoin, InviteJoin, NativeInvite, InboundRouting, OutboundDial), directional media tracks (AudioIn/Out, VideoIn/Out, ScreenIn/Out), and signals (SpeakerDiarization, DTMF, CallTransfer, Recording). The engine gates optional driver calls on these flags; the base driver throws BridgeCapabilityNotSupportedError when a feature is claimed but unimplemented. Held as JSON so new features need no schema change. NULL/omitted = unsupported.';

COMMENT ON COLUMN __mj."AIBridgeProvider"."ConfigSchema" IS 'Optional JSON Schema validating the provider Configuration and per-session bridge Config payloads.';

COMMENT ON COLUMN __mj."AIBridgeProvider"."Configuration" IS 'Provider-level configuration JSON (e.g. credential references resolved via the MJ credential system, region, bot display name). Never store secrets inline.';

/* ============================================================================ */ /* 2. AIBridgeAgentIdentity  ("MJ: AI Bridge Agent Identities") */ /*    An agent's addressable identity on a platform — the calendar mailbox that */ /*    organizers invite, or the phone number that routes inbound calls. The seam */ /*    that generalizes to agent "presence" (email/calendar/telephony) over time. */ /* ============================================================================ */
CREATE TABLE __mj."AIBridgeAgentIdentity" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "AgentID" UUID NOT NULL,
  "ProviderID" UUID NOT NULL,
  "IdentityType" VARCHAR(20) NOT NULL,
  "IdentityValue" VARCHAR(500) NOT NULL,
  "DisplayName" VARCHAR(255) NULL,
  "IsActive" BOOLEAN NOT NULL CONSTRAINT "DF_AIBridgeAgentIdentity_IsActive" DEFAULT TRUE,
  "Configuration" TEXT NULL,
  CONSTRAINT "PK_AIBridgeAgentIdentity" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIBridgeAgentIdentity_Agent" FOREIGN KEY ("AgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "FK_AIBridgeAgentIdentity_Provider" FOREIGN KEY ("ProviderID") REFERENCES __mj."AIBridgeProvider" (
    "ID"
  ),
  CONSTRAINT "UQ_AIBridgeAgentIdentity" UNIQUE (
    "ProviderID",
    "IdentityValue"
  ),
  CONSTRAINT "CK_AIBridgeAgentIdentity_Type" CHECK ("IdentityType" IN ('Email', 'PhoneNumber', 'AccountID'))
);

COMMENT ON COLUMN __mj."AIBridgeAgentIdentity"."IdentityType" IS 'The kind of address: Email (a calendar mailbox organizers invite), PhoneNumber (an inbound DID), or AccountID (a platform-native bot/user account).';

COMMENT ON COLUMN __mj."AIBridgeAgentIdentity"."IdentityValue" IS 'The address value itself (e.g. sage@customer.com, +15551234567, or a platform account id). Unique per provider.';

COMMENT ON COLUMN __mj."AIBridgeAgentIdentity"."DisplayName" IS 'Friendly display name shown to other participants (e.g. "Sage (AI)").';

COMMENT ON COLUMN __mj."AIBridgeAgentIdentity"."IsActive" IS 'Whether this identity is active. Inactive identities are ignored by invite watchers and inbound routing.';

COMMENT ON COLUMN __mj."AIBridgeAgentIdentity"."Configuration" IS 'Identity-level configuration JSON (e.g. tenant/mailbox references, calendar-watch scopes). Credentials resolve via the MJ credential system; never inline.';

/* ============================================================================ */ /* 3. AIBridgeProviderChannel  ("MJ: AI Bridge Provider Channels") */ /*    Junction declaring which AIAgentChannel rows a provider contributes by */ /*    default (e.g. Zoom -> Meeting Controls + Native Whiteboard). Bridge */ /*    channels live in the SAME AIAgentChannel registry as MJ-native channels, */ /*    so 3rd-party surfaces are understood exactly like MJ channels. Fully */ /*    runtime-dynamic channels (no registry row) are handled separately in a */ /*    later phase and are not modeled here. */ /* ============================================================================ */
CREATE TABLE __mj."AIBridgeProviderChannel" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "ProviderID" UUID NOT NULL,
  "ChannelID" UUID NOT NULL,
  "IsDefault" BOOLEAN NOT NULL CONSTRAINT "DF_AIBridgeProviderChannel_IsDefault" DEFAULT TRUE,
  "Sequence" INT NOT NULL CONSTRAINT "DF_AIBridgeProviderChannel_Sequence" DEFAULT (
    0
  ),
  "Configuration" TEXT NULL,
  CONSTRAINT "PK_AIBridgeProviderChannel" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIBridgeProviderChannel_Provider" FOREIGN KEY ("ProviderID") REFERENCES __mj."AIBridgeProvider" (
    "ID"
  ),
  CONSTRAINT "FK_AIBridgeProviderChannel_Channel" FOREIGN KEY ("ChannelID") REFERENCES __mj."AIAgentChannel" (
    "ID"
  ),
  CONSTRAINT "UQ_AIBridgeProviderChannel" UNIQUE (
    "ProviderID",
    "ChannelID"
  )
);

COMMENT ON COLUMN __mj."AIBridgeProviderChannel"."IsDefault" IS 'When 1, this channel is auto-attached to a new bridge session on this provider; when 0, it is available but attached on demand.';

COMMENT ON COLUMN __mj."AIBridgeProviderChannel"."Sequence" IS 'Display/attachment order of this channel for the provider (ascending).';

COMMENT ON COLUMN __mj."AIBridgeProviderChannel"."Configuration" IS 'Optional per-provider configuration JSON for this channel contribution (e.g. mapping platform tool names to the channel''s tool vocabulary).';

/* ============================================================================ */ /* 4. AIAgentSessionBridge  ("MJ: AI Agent Session Bridges") */ /*    Binds an existing AIAgentSession to a bridge connection. The session IS the */ /*    realtime session (co-agent, tools, narration, transcript, persistence all */ /*    reused); this row is the transport ATTACHMENT, parallel to */ /*    AIAgentSessionChannel. HostInstanceID + CloseReason mirror AIAgentSession */ /*    for node affinity + janitor reconciliation. */ /* ============================================================================ */
CREATE TABLE __mj."AIAgentSessionBridge" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "AgentSessionID" UUID NOT NULL,
  "ProviderID" UUID NOT NULL,
  "Direction" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgentSessionBridge_Direction" DEFAULT (
    'Outbound'
  ),
  "JoinMethod" VARCHAR(30) NOT NULL CONSTRAINT "DF_AIAgentSessionBridge_JoinMethod" DEFAULT (
    'OnDemand'
  ),
  "TurnMode" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgentSessionBridge_TurnMode" DEFAULT (
    'Passive'
  ),
  "ExternalConnectionID" VARCHAR(500) NULL,
  "Address" VARCHAR(2000) NULL,
  "BotParticipantID" VARCHAR(500) NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgentSessionBridge_Status" DEFAULT (
    'Pending'
  ),
  "ScheduledStartTime" TIMESTAMPTZ NULL,
  "ConnectedAt" TIMESTAMPTZ NULL,
  "DisconnectedAt" TIMESTAMPTZ NULL,
  "CloseReason" VARCHAR(20) NULL,
  "HostInstanceID" VARCHAR(200) NULL,
  "Config" TEXT NULL,
  CONSTRAINT "PK_AIAgentSessionBridge" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIAgentSessionBridge_Session" FOREIGN KEY ("AgentSessionID") REFERENCES __mj."AIAgentSession" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentSessionBridge_Provider" FOREIGN KEY ("ProviderID") REFERENCES __mj."AIBridgeProvider" (
    "ID"
  ),
  CONSTRAINT "CK_AIAgentSessionBridge_Direction" CHECK ("Direction" IN ('Inbound', 'Outbound')),
  CONSTRAINT "CK_AIAgentSessionBridge_JoinMethod" CHECK ("JoinMethod" IN (
    'OnDemand',
    'Scheduled',
    'Invite',
    'NativeInvite',
    'InboundRoute',
    'InMeetingCommand'
  )),
  CONSTRAINT "CK_AIAgentSessionBridge_TurnMode" CHECK ("TurnMode" IN ('Passive', 'Active', 'Hybrid')),
  CONSTRAINT "CK_AIAgentSessionBridge_Status" CHECK ("Status" IN (
    'Pending',
    'Scheduled',
    'Connecting',
    'Connected',
    'Disconnecting',
    'Disconnected',
    'Failed'
  )),
  CONSTRAINT "CK_AIAgentSessionBridge_CloseReason" CHECK ("CloseReason" IN ('Explicit', 'HostEnded', 'Janitor', 'Error', 'Shutdown'))
);

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."Direction" IS 'Direction of the connection: Outbound (the agent goes to a meeting / places a call) or Inbound (a meeting/call routes to the agent).';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."JoinMethod" IS 'How the agent connected: OnDemand, Scheduled, Invite (calendar), NativeInvite (platform UI), InboundRoute (call/invite to the agent''s identity), or InMeetingCommand (chat command).';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."TurnMode" IS 'Turn-taking mode for this bridged session: Passive (speak only when addressed — default), Active (proactive in silence windows), or Hybrid (passive voice + post-to-chat hand-raise).';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."ExternalConnectionID" IS 'The platform''s identifier for the connection (meeting id / call SID), set once connecting.';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."Address" IS 'The endpoint address: a meeting join URL (meetings) or a phone number (telephony).';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."BotParticipantID" IS 'The agent bot''s own participant id within the meeting/call once admitted.';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."Status" IS 'Bridge connection lifecycle: Pending, Scheduled, Connecting, Connected, Disconnecting, Disconnected, or Failed.';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."ScheduledStartTime" IS 'For scheduled/invite joins: when the bridge should connect. NULL for immediate (on-demand/inbound).';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."ConnectedAt" IS 'When the bridge became Connected (media flowing). NULL until connected.';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."DisconnectedAt" IS 'When the bridge disconnected. NULL while still connected.';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."CloseReason" IS 'Why the bridge closed: Explicit, HostEnded (the meeting/call ended), Janitor (orphan sweep), Error, or Shutdown. NULL while active.';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."HostInstanceID" IS 'Identifier of the server node currently hosting this bridge''s bot connection (hostname:pid:bootId). Used for affinity and janitor orphan reconciliation, mirroring AIAgentSession.';

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."Config" IS 'Per-session bridge configuration/state JSON (validated against the provider ConfigSchema).';

/* ============================================================================ */ /* 5. AIAgentSessionBridgeParticipant  ("MJ: AI Agent Session Bridge Participants") */ /*    Who is on the meeting/call — diarization mapping + multi-party awareness */ /*    (the signal intel a facilitator agent reads). One row per participant, */ /*    including the agent bot itself (IsAgent = 1). */ /* ============================================================================ */
CREATE TABLE __mj."AIAgentSessionBridgeParticipant" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "SessionBridgeID" UUID NOT NULL,
  "ExternalParticipantID" VARCHAR(500) NULL,
  "DisplayName" VARCHAR(500) NULL,
  "Role" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgentSessionBridgeParticipant_Role" DEFAULT (
    'Participant'
  ),
  "UserID" UUID NULL,
  "IsAgent" BOOLEAN NOT NULL CONSTRAINT "DF_AIAgentSessionBridgeParticipant_IsAgent" DEFAULT FALSE,
  "JoinedAt" TIMESTAMPTZ NULL,
  "LeftAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_AIAgentSessionBridgeParticipant" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIAgentSessionBridgeParticipant_Bridge" FOREIGN KEY ("SessionBridgeID") REFERENCES __mj."AIAgentSessionBridge" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentSessionBridgeParticipant_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "CK_AIAgentSessionBridgeParticipant_Role" CHECK ("Role" IN ('Host', 'CoHost', 'Participant', 'Agent'))
);

COMMENT ON COLUMN __mj."AIAgentSessionBridgeParticipant"."ExternalParticipantID" IS 'The platform''s participant identifier (used to map diarized audio to a person).';

COMMENT ON COLUMN __mj."AIAgentSessionBridgeParticipant"."DisplayName" IS 'The participant''s display name as shown on the platform.';

COMMENT ON COLUMN __mj."AIAgentSessionBridgeParticipant"."Role" IS 'The participant''s role in the meeting/call: Host, CoHost, Participant, or Agent (the AI bot).';

COMMENT ON COLUMN __mj."AIAgentSessionBridgeParticipant"."UserID" IS 'The matched MJ user, when the participant can be identified (NULL for external/anonymous participants).';

COMMENT ON COLUMN __mj."AIAgentSessionBridgeParticipant"."IsAgent" IS 'True when this participant is the bridged AI agent bot itself.';

COMMENT ON COLUMN __mj."AIAgentSessionBridgeParticipant"."JoinedAt" IS 'When the participant joined the meeting/call.';

COMMENT ON COLUMN __mj."AIAgentSessionBridgeParticipant"."LeftAt" IS 'When the participant left. NULL while still present.';

/* SQL generated to create new entity MJ: AI Agent Session Bridges */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '58d95aa3-52c3-4131-bf62-e84e75b04bd2',
    'MJ: AI Agent Session Bridges',
    'AI Agent Session Bridges',
    NULL,
    NULL,
    'AIAgentSessionBridge',
    'vwAIAgentSessionBridges',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Agent Session Bridges to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '58d95aa3-52c3-4131-bf62-e84e75b04bd2',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Session Bridges for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '58d95aa3-52c3-4131-bf62-e84e75b04bd2',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Session Bridges for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '58d95aa3-52c3-4131-bf62-e84e75b04bd2',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Session Bridges for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '58d95aa3-52c3-4131-bf62-e84e75b04bd2',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Agent Session Bridge Participants */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f4559f85-72b8-468a-a706-235ff252e01d',
    'MJ: AI Agent Session Bridge Participants',
    'AI Agent Session Bridge Participants',
    NULL,
    NULL,
    'AIAgentSessionBridgeParticipant',
    'vwAIAgentSessionBridgeParticipants',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Agent Session Bridge Participants to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'f4559f85-72b8-468a-a706-235ff252e01d',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Session Bridge Participants for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f4559f85-72b8-468a-a706-235ff252e01d',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Session Bridge Participants for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f4559f85-72b8-468a-a706-235ff252e01d',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Session Bridge Participants for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f4559f85-72b8-468a-a706-235ff252e01d',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Bridge Providers */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '840a51d1-7436-45f9-9176-31e1fe785635',
    'MJ: AI Bridge Providers',
    'AI Bridge Providers',
    NULL,
    NULL,
    'AIBridgeProvider',
    'vwAIBridgeProviders',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Bridge Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '840a51d1-7436-45f9-9176-31e1fe785635',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Bridge Providers for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '840a51d1-7436-45f9-9176-31e1fe785635',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Bridge Providers for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '840a51d1-7436-45f9-9176-31e1fe785635',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Bridge Providers for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '840a51d1-7436-45f9-9176-31e1fe785635',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Bridge Agent Identities */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7efb8744-cf96-4c61-8a78-92fac4fe1b77',
    'MJ: AI Bridge Agent Identities',
    'AI Bridge Agent Identities',
    NULL,
    NULL,
    'AIBridgeAgentIdentity',
    'vwAIBridgeAgentIdentities',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Bridge Agent Identities to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '7efb8744-cf96-4c61-8a78-92fac4fe1b77',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Bridge Agent Identities for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7efb8744-cf96-4c61-8a78-92fac4fe1b77',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Bridge Agent Identities for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7efb8744-cf96-4c61-8a78-92fac4fe1b77',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Bridge Agent Identities for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7efb8744-cf96-4c61-8a78-92fac4fe1b77',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Bridge Provider Channels */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e6c72108-a52b-4162-b0c3-cc6cfecd642d',
    'MJ: AI Bridge Provider Channels',
    'AI Bridge Provider Channels',
    NULL,
    NULL,
    'AIBridgeProviderChannel',
    'vwAIBridgeProviderChannels',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Bridge Provider Channels to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'e6c72108-a52b-4162-b0c3-cc6cfecd642d',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Bridge Provider Channels for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e6c72108-a52b-4162-b0c3-cc6cfecd642d',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Bridge Provider Channels for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e6c72108-a52b-4162-b0c3-cc6cfecd642d',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Bridge Provider Channels for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e6c72108-a52b-4162-b0c3-cc6cfecd642d',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

ALTER TABLE __mj."AIAgentSessionBridgeParticipant"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSessionBridgeParticipant */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSessionBridgeParticipant */
UPDATE __mj."AIAgentSessionBridgeParticipant" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIAgentSessionBridgeParticipant' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSessionBridgeParticipant" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSessionBridgeParticipant" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentSessionBridgeParticipant"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSessionBridgeParticipant */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSessionBridgeParticipant */
UPDATE __mj."AIAgentSessionBridgeParticipant" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIAgentSessionBridgeParticipant' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSessionBridgeParticipant" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSessionBridgeParticipant" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIBridgeProvider"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIBridgeProvider */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIBridgeProvider */
UPDATE __mj."AIBridgeProvider" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIBridgeProvider' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIBridgeProvider" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIBridgeProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIBridgeProvider"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIBridgeProvider */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIBridgeProvider */
UPDATE __mj."AIBridgeProvider" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIBridgeProvider' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIBridgeProvider" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIBridgeProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIBridgeAgentIdentity"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIBridgeAgentIdentity */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIBridgeAgentIdentity */
UPDATE __mj."AIBridgeAgentIdentity" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIBridgeAgentIdentity' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIBridgeAgentIdentity" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIBridgeAgentIdentity" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIBridgeAgentIdentity"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIBridgeAgentIdentity */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIBridgeAgentIdentity */
UPDATE __mj."AIBridgeAgentIdentity" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIBridgeAgentIdentity' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIBridgeAgentIdentity" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIBridgeAgentIdentity" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIBridgeProviderChannel"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIBridgeProviderChannel */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIBridgeProviderChannel */
UPDATE __mj."AIBridgeProviderChannel" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIBridgeProviderChannel' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIBridgeProviderChannel" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIBridgeProviderChannel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIBridgeProviderChannel"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIBridgeProviderChannel */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIBridgeProviderChannel */
UPDATE __mj."AIBridgeProviderChannel" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIBridgeProviderChannel' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIBridgeProviderChannel" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIBridgeProviderChannel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentSessionBridge"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSessionBridge */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSessionBridge */
UPDATE __mj."AIAgentSessionBridge" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIAgentSessionBridge' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSessionBridge" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSessionBridge" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentSessionBridge"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSessionBridge */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSessionBridge */
UPDATE __mj."AIAgentSessionBridge" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIAgentSessionBridge' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSessionBridge" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSessionBridge" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '27f416d4-ac82-4698-95c3-a462635d81c8' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('27f416d4-ac82-4698-95c3-a462635d81c8', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '14e095f9-26f2-4620-b238-2ec613883fc9' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'SessionBridgeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14e095f9-26f2-4620-b238-2ec613883fc9', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100002, 'SessionBridgeID', 'Session Bridge ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '58D95AA3-52C3-4131-BF62-E84E75B04BD2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '18f703dc-03d6-4b93-96cb-7f74b6837042' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'ExternalParticipantID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('18f703dc-03d6-4b93-96cb-7f74b6837042', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100003, 'ExternalParticipantID', 'External Participant ID', 'The platform''s participant identifier (used to map diarized audio to a person).', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6b191fe0-ffcd-41bd-8b4f-b74a62dc889c' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'DisplayName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6b191fe0-ffcd-41bd-8b4f-b74a62dc889c', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100004, 'DisplayName', 'Display Name', 'The participant''s display name as shown on the platform.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29949d7a-c3e2-4890-a9f1-9af5c316e07d' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'Role')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29949d7a-c3e2-4890-a9f1-9af5c316e07d', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100005, 'Role', 'Role', 'The participant''s role in the meeting/call: Host, CoHost, Participant, or Agent (the AI bot).', 'nvarchar', 40, 0, 0, FALSE, 'Participant', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0b9e9e68-076f-470a-be2e-173594c1e631' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0b9e9e68-076f-470a-be2e-173594c1e631', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100006, 'UserID', 'User ID', 'The matched MJ user, when the participant can be identified (NULL for external/anonymous participants).', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f0503a62-b321-40ff-a185-c97be93784ff' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'IsAgent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f0503a62-b321-40ff-a185-c97be93784ff', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100007, 'IsAgent', 'Is Agent', 'True when this participant is the bridged AI agent bot itself.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd12fcfd1-6e70-47d2-9646-191d3065ebdc' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'JoinedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d12fcfd1-6e70-47d2-9646-191d3065ebdc', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100008, 'JoinedAt', 'Joined At', 'When the participant joined the meeting/call.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e8e8674a-1fea-40b0-a14b-adc7797fe9cc' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'LeftAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e8e8674a-1fea-40b0-a14b-adc7797fe9cc', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100009, 'LeftAt', 'Left At', 'When the participant left. NULL while still present.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '020d2b81-ff36-4ae2-be49-157a127ab9f5' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('020d2b81-ff36-4ae2-be49-157a127ab9f5', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6da50585-381d-4ca6-80ec-67b95192f01c' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6da50585-381d-4ca6-80ec-67b95192f01c', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6c09890e-9e79-4c52-aacd-de3039c2fc12' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6c09890e-9e79-4c52-aacd-de3039c2fc12', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1683b2f7-14a1-4466-8f8a-1c42c84138b8' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1683b2f7-14a1-4466-8f8a-1c42c84138b8', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100002, 'Name', 'Name', 'Unique platform name (e.g. Zoom, Microsoft Teams, Google Meet, Webex, Slack, Discord, RingCentral, Twilio, Vonage, LiveKit).', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bcedeefe-9c1f-4833-a344-47a7a3df478d' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bcedeefe-9c1f-4833-a344-47a7a3df478d', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100003, 'Description', 'Description', 'Optional human-readable description of the platform / driver.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6de0633c-530a-4dfe-811b-42b9886b7b81' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = 'BridgeType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6de0633c-530a-4dfe-811b-42b9886b7b81', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100004, 'BridgeType', 'Bridge Type', 'The family of endpoint this bridge connects to: Meeting (a conferencing room) or Telephony (a phone call). LiveKit (MJ-native multi-party room) is a Meeting.', 'nvarchar', 40, 0, 0, FALSE, 'Meeting', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cb02738f-6cd8-4647-a64d-c3a41f7069a1' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = 'DriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cb02738f-6cd8-4647-a64d-c3a41f7069a1', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100005, 'DriverClass', 'Driver Class', 'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseRealtimeBridge, DriverClass). MUST match the @RegisterClass key on the concrete bridge driver.', 'nvarchar', 500, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'abc7dd0a-e751-4b97-a40f-01b0e1b01f5d' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('abc7dd0a-e751-4b97-a40f-01b0e1b01f5d', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100006, 'Status', 'Status', 'Whether this provider is available for use. Inactive providers cannot start new bridge sessions.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2e8a00ef-6e53-4a04-a8bd-8ef2e948f818' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = 'SupportedFeatures')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2e8a00ef-6e53-4a04-a8bd-8ef2e948f818', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100007, 'SupportedFeatures', 'Supported Features', 'Strongly-typed JSON of the platform''s supported features (the IBridgeProviderFeatures interface, bound via JSONType metadata): join methods (OnDemandJoin, ScheduledJoin, InviteJoin, NativeInvite, InboundRouting, OutboundDial), directional media tracks (AudioIn/Out, VideoIn/Out, ScreenIn/Out), and signals (SpeakerDiarization, DTMF, CallTransfer, Recording). The engine gates optional driver calls on these flags; the base driver throws BridgeCapabilityNotSupportedError when a feature is claimed but unimplemented. Held as JSON so new features need no schema change. NULL/omitted = unsupported.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4fabdf5d-fde6-4ada-b3a6-9923e5aa7dd4' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = 'ConfigSchema')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4fabdf5d-fde6-4ada-b3a6-9923e5aa7dd4', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100008, 'ConfigSchema', 'Config Schema', 'Optional JSON Schema validating the provider Configuration and per-session bridge Config payloads.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f77d391f-5e66-4e21-a104-dc4d389fbb19' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f77d391f-5e66-4e21-a104-dc4d389fbb19', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100009, 'Configuration', 'Configuration', 'Provider-level configuration JSON (e.g. credential references resolved via the MJ credential system, region, bot display name). Never store secrets inline.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0a7913fa-c6a1-4e15-b29e-fa776c9f1d8b' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0a7913fa-c6a1-4e15-b29e-fa776c9f1d8b', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1beb341e-9a0e-4bbe-97d8-407ad522d50d' OR ("EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1beb341e-9a0e-4bbe-97d8-407ad522d50d', '840A51D1-7436-45F9-9176-31E1FE785635' /* Entity: MJ: AI Bridge Providers */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e63ac383-34c6-423b-a627-5f8e834697b8' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e63ac383-34c6-423b-a627-5f8e834697b8', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ce170e63-3448-4b76-be01-b865a181c906' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'AgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ce170e63-3448-4b76-be01-b865a181c906', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100002, 'AgentID', 'Agent ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '995a5799-d436-4c36-9008-911834362852' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'ProviderID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('995a5799-d436-4c36-9008-911834362852', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100003, 'ProviderID', 'Provider ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '840A51D1-7436-45F9-9176-31E1FE785635', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f95225b4-9736-4048-9878-63a1e2027b19' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'IdentityType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f95225b4-9736-4048-9878-63a1e2027b19', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100004, 'IdentityType', 'Identity Type', 'The kind of address: Email (a calendar mailbox organizers invite), PhoneNumber (an inbound DID), or AccountID (a platform-native bot/user account).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '55df4d22-4556-4067-80b2-be5878fe3ad1' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'IdentityValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('55df4d22-4556-4067-80b2-be5878fe3ad1', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100005, 'IdentityValue', 'Identity Value', 'The address value itself (e.g. sage@customer.com, +15551234567, or a platform account id). Unique per provider.', 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a0698b17-b847-4039-bdc0-e170753b63ce' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'DisplayName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a0698b17-b847-4039-bdc0-e170753b63ce', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100006, 'DisplayName', 'Display Name', 'Friendly display name shown to other participants (e.g. "Sage (AI)").', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b61968e8-ecb4-4a0a-ac7a-1d59e569e098' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'IsActive')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b61968e8-ecb4-4a0a-ac7a-1d59e569e098', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100007, 'IsActive', 'Is Active', 'Whether this identity is active. Inactive identities are ignored by invite watchers and inbound routing.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e61e0b7d-406e-4379-9fe4-c2d13dfe586a' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e61e0b7d-406e-4379-9fe4-c2d13dfe586a', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100008, 'Configuration', 'Configuration', 'Identity-level configuration JSON (e.g. tenant/mailbox references, calendar-watch scopes). Credentials resolve via the MJ credential system; never inline.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8ba873c-6fa2-4188-ab66-e23d147508d7' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d8ba873c-6fa2-4188-ab66-e23d147508d7', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100009, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c0147a9c-306f-4b16-9fdb-3f26fc5be339' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c0147a9c-306f-4b16-9fdb-3f26fc5be339', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100010, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6a22344a-ec8c-4907-9b40-cb9c42eb6a61' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6a22344a-ec8c-4907-9b40-cb9c42eb6a61', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'efb596d7-28c0-4e47-8bae-2dd977377f0a' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = 'ProviderID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('efb596d7-28c0-4e47-8bae-2dd977377f0a', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100002, 'ProviderID', 'Provider ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '840A51D1-7436-45F9-9176-31E1FE785635', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51c8f183-060d-4204-935a-feadb4fab77f' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = 'ChannelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('51c8f183-060d-4204-935a-feadb4fab77f', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100003, 'ChannelID', 'Channel ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '31A90934-E8E7-4EF9-8430-D63E8F224ABD', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f228fc90-7c14-4e6d-97d7-44a7974607a7' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = 'IsDefault')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f228fc90-7c14-4e6d-97d7-44a7974607a7', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100004, 'IsDefault', 'Is Default', 'When 1, this channel is auto-attached to a new bridge session on this provider; when 0, it is available but attached on demand.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5bdb0bfc-b805-4911-a991-9161101d0c74' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5bdb0bfc-b805-4911-a991-9161101d0c74', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100005, 'Sequence', 'Sequence', 'Display/attachment order of this channel for the provider (ascending).', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bfa64567-bb2a-4439-96c9-f7c612d718df' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bfa64567-bb2a-4439-96c9-f7c612d718df', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100006, 'Configuration', 'Configuration', 'Optional per-provider configuration JSON for this channel contribution (e.g. mapping platform tool names to the channel''s tool vocabulary).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '876cb633-f9c1-4590-a969-2386a5f2f9be' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('876cb633-f9c1-4590-a969-2386a5f2f9be', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100007, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '349ff1fc-812a-42f2-96c6-8102b12495ae' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('349ff1fc-812a-42f2-96c6-8102b12495ae', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100008, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ccdeb9c6-696e-43ae-b560-208790838f08' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ccdeb9c6-696e-43ae-b560-208790838f08', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03a50bb3-788c-4193-a929-157389b3ffa8' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'AgentSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03a50bb3-788c-4193-a929-157389b3ffa8', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100002, 'AgentSessionID', 'Agent Session ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '17198778-E25A-4457-80AF-9E8C4961DC29', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2db6fccb-cc02-4e7c-b1fe-e20795739e13' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'ProviderID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2db6fccb-cc02-4e7c-b1fe-e20795739e13', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100003, 'ProviderID', 'Provider ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '840A51D1-7436-45F9-9176-31E1FE785635', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1a074707-f092-4611-98b0-e4a84cd4c008' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'Direction')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1a074707-f092-4611-98b0-e4a84cd4c008', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100004, 'Direction', 'Direction', 'Direction of the connection: Outbound (the agent goes to a meeting / places a call) or Inbound (a meeting/call routes to the agent).', 'nvarchar', 40, 0, 0, FALSE, 'Outbound', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41694f55-f736-4443-a897-423251552868' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'JoinMethod')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('41694f55-f736-4443-a897-423251552868', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100005, 'JoinMethod', 'Join Method', 'How the agent connected: OnDemand, Scheduled, Invite (calendar), NativeInvite (platform UI), InboundRoute (call/invite to the agent''s identity), or InMeetingCommand (chat command).', 'nvarchar', 60, 0, 0, FALSE, 'OnDemand', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd71309dd-89ef-47a3-91fc-526652879423' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'TurnMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d71309dd-89ef-47a3-91fc-526652879423', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100006, 'TurnMode', 'Turn Mode', 'Turn-taking mode for this bridged session: Passive (speak only when addressed — default), Active (proactive in silence windows), or Hybrid (passive voice + post-to-chat hand-raise).', 'nvarchar', 40, 0, 0, FALSE, 'Passive', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ed966da2-42e1-480f-87fb-c4e9d8fffdb4' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'ExternalConnectionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ed966da2-42e1-480f-87fb-c4e9d8fffdb4', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100007, 'ExternalConnectionID', 'External Connection ID', 'The platform''s identifier for the connection (meeting id / call SID), set once connecting.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3a54b01a-6905-478a-b352-c21de18d4d2b' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'Address')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3a54b01a-6905-478a-b352-c21de18d4d2b', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100008, 'Address', 'Address', 'The endpoint address: a meeting join URL (meetings) or a phone number (telephony).', 'nvarchar', 4000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cf64a1fe-0568-4864-93aa-28197fcafd28' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'BotParticipantID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cf64a1fe-0568-4864-93aa-28197fcafd28', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100009, 'BotParticipantID', 'Bot Participant ID', 'The agent bot''s own participant id within the meeting/call once admitted.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef5fe4c6-065b-4e02-88ea-19e3c0cc08c2' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ef5fe4c6-065b-4e02-88ea-19e3c0cc08c2', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100010, 'Status', 'Status', 'Bridge connection lifecycle: Pending, Scheduled, Connecting, Connected, Disconnecting, Disconnected, or Failed.', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fccc746f-ffab-478d-9115-d1021bee3b10' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'ScheduledStartTime')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fccc746f-ffab-478d-9115-d1021bee3b10', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100011, 'ScheduledStartTime', 'Scheduled Start Time', 'For scheduled/invite joins: when the bridge should connect. NULL for immediate (on-demand/inbound).', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c53f2fa8-ff9b-473c-8059-35bbb150322d' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'ConnectedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c53f2fa8-ff9b-473c-8059-35bbb150322d', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100012, 'ConnectedAt', 'Connected At', 'When the bridge became Connected (media flowing). NULL until connected.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b5da55ad-8059-482e-b692-ccc84d9c4736' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'DisconnectedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b5da55ad-8059-482e-b692-ccc84d9c4736', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100013, 'DisconnectedAt', 'Disconnected At', 'When the bridge disconnected. NULL while still connected.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cebd2acc-8753-4abe-971d-4d5b570da993' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'CloseReason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cebd2acc-8753-4abe-971d-4d5b570da993', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100014, 'CloseReason', 'Close Reason', 'Why the bridge closed: Explicit, HostEnded (the meeting/call ended), Janitor (orphan sweep), Error, or Shutdown. NULL while active.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c4756fb-add7-493e-8ddc-9d772bc96775' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'HostInstanceID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c4756fb-add7-493e-8ddc-9d772bc96775', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100015, 'HostInstanceID', 'Host Instance ID', 'Identifier of the server node currently hosting this bridge''s bot connection (hostname:pid:bootId). Used for affinity and janitor orphan reconciliation, mirroring AIAgentSession.', 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ee25f1a8-6802-42f9-a291-150b3199c0a0' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'Config')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ee25f1a8-6802-42f9-a291-150b3199c0a0', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100016, 'Config', 'Config', 'Per-session bridge configuration/state JSON (validated against the provider ConfigSchema).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cb4bf8bb-5b6a-4c93-8bc4-79c22e2def5e' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cb4bf8bb-5b6a-4c93-8bc4-79c22e2def5e', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100017, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b6545b81-b121-4bab-a519-5bd391ed8574' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b6545b81-b121-4bab-a519-5bd391ed8574', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100018, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 28faa6a1-04bd-4b08-919d-dfdc1747421d */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '28faa6a1-04bd-4b08-919d-dfdc1747421d',
    '1A074707-F092-4611-98B0-E4A84CD4C008',
    1,
    'Inbound',
    'Inbound',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 1ba9681e-cc45-4b49-8663-cac414e3f1af */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1ba9681e-cc45-4b49-8663-cac414e3f1af',
    '1A074707-F092-4611-98B0-E4A84CD4C008',
    2,
    'Outbound',
    'Outbound',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 1A074707-F092-4611-98B0-E4A84CD4C008 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '1A074707-F092-4611-98B0-E4A84CD4C008';

/* SQL text to insert entity field value with ID 6df49b60-6d3a-4546-8a7a-c2f05aedbcaa */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6df49b60-6d3a-4546-8a7a-c2f05aedbcaa',
    '41694F55-F736-4443-A897-423251552868',
    1,
    'InMeetingCommand',
    'InMeetingCommand',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID f557da74-6b2e-46a1-ab45-40e82c7d8006 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f557da74-6b2e-46a1-ab45-40e82c7d8006',
    '41694F55-F736-4443-A897-423251552868',
    2,
    'InboundRoute',
    'InboundRoute',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 86a9f296-2143-439d-bf47-c01758d82c2f */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '86a9f296-2143-439d-bf47-c01758d82c2f',
    '41694F55-F736-4443-A897-423251552868',
    3,
    'Invite',
    'Invite',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 632e2958-4dbf-46fe-82dd-424cf5f8db39 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '632e2958-4dbf-46fe-82dd-424cf5f8db39',
    '41694F55-F736-4443-A897-423251552868',
    4,
    'NativeInvite',
    'NativeInvite',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID e18fb49b-1792-47f5-9ba4-8225bb54511d */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e18fb49b-1792-47f5-9ba4-8225bb54511d',
    '41694F55-F736-4443-A897-423251552868',
    5,
    'OnDemand',
    'OnDemand',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 7735b567-f7b2-4875-9a4f-c4699a8ad2ac */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7735b567-f7b2-4875-9a4f-c4699a8ad2ac',
    '41694F55-F736-4443-A897-423251552868',
    6,
    'Scheduled',
    'Scheduled',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 41694F55-F736-4443-A897-423251552868 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '41694F55-F736-4443-A897-423251552868';

/* SQL text to insert entity field value with ID eb6f0bc8-6d80-4e05-8f2d-f0562fce719c */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'eb6f0bc8-6d80-4e05-8f2d-f0562fce719c',
    'D71309DD-89EF-47A3-91FC-526652879423',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID f0bc3fc9-42ea-4e34-ba89-8313ccc77ddd */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f0bc3fc9-42ea-4e34-ba89-8313ccc77ddd',
    'D71309DD-89EF-47A3-91FC-526652879423',
    2,
    'Hybrid',
    'Hybrid',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID e3c597dc-eec0-4876-b119-f7034acdb6fe */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e3c597dc-eec0-4876-b119-f7034acdb6fe',
    'D71309DD-89EF-47A3-91FC-526652879423',
    3,
    'Passive',
    'Passive',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID D71309DD-89EF-47A3-91FC-526652879423 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D71309DD-89EF-47A3-91FC-526652879423';

/* SQL text to insert entity field value with ID cf5cff2d-1184-4dbb-8f76-5b6e8fa8ad00 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'cf5cff2d-1184-4dbb-8f76-5b6e8fa8ad00',
    'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2',
    1,
    'Connected',
    'Connected',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID f586c372-950b-4bf7-8f6f-f332aa9020c9 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f586c372-950b-4bf7-8f6f-f332aa9020c9',
    'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2',
    2,
    'Connecting',
    'Connecting',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 850ca385-08bf-4068-b718-d6e57fdadbd3 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '850ca385-08bf-4068-b718-d6e57fdadbd3',
    'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2',
    3,
    'Disconnected',
    'Disconnected',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID c53cd62b-98ae-4a7f-851c-3b44982bfa92 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c53cd62b-98ae-4a7f-851c-3b44982bfa92',
    'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2',
    4,
    'Disconnecting',
    'Disconnecting',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 148ce2d2-3ff9-4bf0-bff3-370b1f796cc9 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '148ce2d2-3ff9-4bf0-bff3-370b1f796cc9',
    'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2',
    5,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 9c06db71-ee2c-47ff-8924-0e6afb779781 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9c06db71-ee2c-47ff-8924-0e6afb779781',
    'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2',
    6,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID eb8708e7-5723-4026-bb4b-ce82874e9c50 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'eb8708e7-5723-4026-bb4b-ce82874e9c50',
    'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2',
    7,
    'Scheduled',
    'Scheduled',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2';

/* SQL text to insert entity field value with ID 30d2362f-8758-4b5d-99a6-df13b1965319 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '30d2362f-8758-4b5d-99a6-df13b1965319',
    'CEBD2ACC-8753-4ABE-971D-4D5B570DA993',
    1,
    'Error',
    'Error',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID afe8ed50-d017-48a6-b93a-dbd49fa7dc32 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'afe8ed50-d017-48a6-b93a-dbd49fa7dc32',
    'CEBD2ACC-8753-4ABE-971D-4D5B570DA993',
    2,
    'Explicit',
    'Explicit',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID dfbaf28a-2b58-4d17-9789-a1a60358c53f */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'dfbaf28a-2b58-4d17-9789-a1a60358c53f',
    'CEBD2ACC-8753-4ABE-971D-4D5B570DA993',
    3,
    'HostEnded',
    'HostEnded',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 9ae6a9eb-1b07-4918-919a-0dfde676a1ac */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9ae6a9eb-1b07-4918-919a-0dfde676a1ac',
    'CEBD2ACC-8753-4ABE-971D-4D5B570DA993',
    4,
    'Janitor',
    'Janitor',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 549d5e74-9f1e-457f-a702-26816f092036 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '549d5e74-9f1e-457f-a702-26816f092036',
    'CEBD2ACC-8753-4ABE-971D-4D5B570DA993',
    5,
    'Shutdown',
    'Shutdown',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID CEBD2ACC-8753-4ABE-971D-4D5B570DA993 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'CEBD2ACC-8753-4ABE-971D-4D5B570DA993';

/* SQL text to insert entity field value with ID 76c508fa-b9eb-4cb1-8eb4-d6198a36949b */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '76c508fa-b9eb-4cb1-8eb4-d6198a36949b',
    '29949D7A-C3E2-4890-A9F1-9AF5C316E07D',
    1,
    'Agent',
    'Agent',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 6a820b3c-d386-4c3a-8481-5dbefdeafd2f */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6a820b3c-d386-4c3a-8481-5dbefdeafd2f',
    '29949D7A-C3E2-4890-A9F1-9AF5C316E07D',
    2,
    'CoHost',
    'CoHost',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 85e62bca-1e0e-4592-9b3f-6ad700c80704 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '85e62bca-1e0e-4592-9b3f-6ad700c80704',
    '29949D7A-C3E2-4890-A9F1-9AF5C316E07D',
    3,
    'Host',
    'Host',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 656d2fff-5edf-4a9f-97a0-25d0341062e5 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '656d2fff-5edf-4a9f-97a0-25d0341062e5',
    '29949D7A-C3E2-4890-A9F1-9AF5C316E07D',
    4,
    'Participant',
    'Participant',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 29949D7A-C3E2-4890-A9F1-9AF5C316E07D */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '29949D7A-C3E2-4890-A9F1-9AF5C316E07D';

/* SQL text to insert entity field value with ID ff17fa08-9a50-4d99-a4bc-8ac6b2626978 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ff17fa08-9a50-4d99-a4bc-8ac6b2626978',
    '6DE0633C-530A-4DFE-811B-42B9886B7B81',
    1,
    'Meeting',
    'Meeting',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 81fb9c3a-aa99-4038-b428-428329a05387 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '81fb9c3a-aa99-4038-b428-428329a05387',
    '6DE0633C-530A-4DFE-811B-42B9886B7B81',
    2,
    'Telephony',
    'Telephony',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 6DE0633C-530A-4DFE-811B-42B9886B7B81 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '6DE0633C-530A-4DFE-811B-42B9886B7B81';

/* SQL text to insert entity field value with ID 505d03f2-4a3c-4c4b-b5ae-fa2916ebc296 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '505d03f2-4a3c-4c4b-b5ae-fa2916ebc296',
    'ABC7DD0A-E751-4B97-A40F-01B0E1B01F5D',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 08d198f0-e877-4cdb-a3f5-3700b520ae96 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '08d198f0-e877-4cdb-a3f5-3700b520ae96',
    'ABC7DD0A-E751-4B97-A40F-01B0E1B01F5D',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID ABC7DD0A-E751-4B97-A40F-01B0E1B01F5D */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'ABC7DD0A-E751-4B97-A40F-01B0E1B01F5D';

/* SQL text to insert entity field value with ID 6057fc87-9429-4dd8-a7e5-22256edbdd66 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6057fc87-9429-4dd8-a7e5-22256edbdd66',
    'F95225B4-9736-4048-9878-63A1E2027B19',
    1,
    'AccountID',
    'AccountID',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 9f620ca5-9f91-483d-ab57-6da0385e2fe6 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9f620ca5-9f91-483d-ab57-6da0385e2fe6',
    'F95225B4-9736-4048-9878-63A1E2027B19',
    2,
    'Email',
    'Email',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID feba22d8-105a-45a5-b32d-05853cf476b7 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'feba22d8-105a-45a5-b32d-05853cf476b7',
    'F95225B4-9736-4048-9878-63A1E2027B19',
    3,
    'PhoneNumber',
    'PhoneNumber',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID F95225B4-9736-4048-9878-63A1E2027B19 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'F95225B4-9736-4048-9878-63A1E2027B19';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '3fa517dd-738d-4b7a-8a34-f2b9a71a702e') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3fa517dd-738d-4b7a-8a34-f2b9a71a702e', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77', 'AgentID', 'One To Many', TRUE, TRUE, 32, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4b743f39-802b-4389-8a81-d5643bebc888') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b743f39-802b-4389-8a81-d5643bebc888', '840A51D1-7436-45F9-9176-31E1FE785635', '58D95AA3-52C3-4131-BF62-E84E75B04BD2', 'ProviderID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2bddf772-a62e-417f-a17d-2d53b0700ecc') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2bddf772-a62e-417f-a17d-2d53b0700ecc', '840A51D1-7436-45F9-9176-31E1FE785635', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D', 'ProviderID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '36827cbe-4d5a-4fa3-853c-b26f0f245666') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('36827cbe-4d5a-4fa3-853c-b26f0f245666', '840A51D1-7436-45F9-9176-31E1FE785635', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77', 'ProviderID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5325d2b9-e4eb-4f25-8367-aa65418069e9') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5325d2b9-e4eb-4f25-8367-aa65418069e9', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'F4559F85-72B8-468A-A706-235FF252E01D', 'UserID', 'One To Many', TRUE, TRUE, 103, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0b75e6a4-6c0d-4ba2-8d53-5726ce5bbb5e') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0b75e6a4-6c0d-4ba2-8d53-5726ce5bbb5e', '17198778-E25A-4457-80AF-9E8C4961DC29', '58D95AA3-52C3-4131-BF62-E84E75B04BD2', 'AgentSessionID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4ea9b6fb-a4e3-4d16-b0c5-b6657c468a9c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4ea9b6fb-a4e3-4d16-b0c5-b6657c468a9c', '31A90934-E8E7-4EF9-8430-D63E8F224ABD', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D', 'ChannelID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6810d156-0edc-4a81-a62a-cedf6aefd636') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6810d156-0edc-4a81-a62a-cedf6aefd636', '58D95AA3-52C3-4131-BF62-E84E75B04BD2', 'F4559F85-72B8-468A-A706-235FF252E01D', 'SessionBridgeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e133cd15-b7c6-44f1-ab72-99623e0bdc54' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e133cd15-b7c6-44f1-ab72-99623e0bdc54', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100023, 'User', 'User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd1ceb001-6864-4e31-b119-22066ab45351' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'Agent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d1ceb001-6864-4e31-b119-22066ab45351', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100021, 'Agent', 'Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ffaf2b58-42ca-4ad6-a458-57edc74fa687' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'Provider')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ffaf2b58-42ca-4ad6-a458-57edc74fa687', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, 100022, 'Provider', 'Provider', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32e94636-467c-4a78-9a37-6f33b4276dcf' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = 'Provider')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('32e94636-467c-4a78-9a37-6f33b4276dcf', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100017, 'Provider', 'Provider', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '928dc15c-979e-46d3-bd2e-ae4cff380362' OR ("EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' AND "Name" = 'Channel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('928dc15c-979e-46d3-bd2e-ae4cff380362', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D' /* Entity: MJ: AI Bridge Provider Channels */, 100018, 'Channel', 'Channel', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e0d60b23-d306-444a-93a4-5636b2fe2fb5' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'Provider')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e0d60b23-d306-444a-93a4-5636b2fe2fb5', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, 100037, 'Provider', 'Provider', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'F228FC90-7C14-4E6D-97D7-44A7974607A7'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '5BDB0BFC-B805-4911-A991-9161101D0C74'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '32E94636-467C-4A78-9A37-6F33B4276DCF'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '928DC15C-979E-46D3-BD2E-AE4CFF380362'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '32E94636-467C-4A78-9A37-6F33B4276DCF'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '928DC15C-979E-46D3-BD2E-AE4CFF380362'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '32E94636-467C-4A78-9A37-6F33B4276DCF'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '928DC15C-979E-46D3-BD2E-AE4CFF380362'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = 'A0698B17-B847-4039-BDC0-E170753B63CE' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'F95225B4-9736-4048-9878-63A1E2027B19'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '55DF4D22-4556-4067-80B2-BE5878FE3AD1'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A0698B17-B847-4039-BDC0-E170753B63CE'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B61968E8-ECB4-4A0A-AC7A-1D59E569E098'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D1CEB001-6864-4E31-B119-22066AB45351'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '55DF4D22-4556-4067-80B2-BE5878FE3AD1'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'A0698B17-B847-4039-BDC0-E170753B63CE'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'D1CEB001-6864-4E31-B119-22066AB45351'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'A0698B17-B847-4039-BDC0-E170753B63CE'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'D1CEB001-6864-4E31-B119-22066AB45351'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '6B191FE0-FFCD-41BD-8B4F-B74A62DC889C' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '6B191FE0-FFCD-41BD-8B4F-B74A62DC889C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '29949D7A-C3E2-4890-A9F1-9AF5C316E07D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'F0503A62-B321-40FF-A185-C97BE93784FF'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D12FCFD1-6E70-47D2-9646-191D3065EBDC'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'E8E8674A-1FEA-40B0-A14B-ADC7797FE9CC'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '6B191FE0-FFCD-41BD-8B4F-B74A62DC889C'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '29949D7A-C3E2-4890-A9F1-9AF5C316E07D'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '29949D7A-C3E2-4890-A9F1-9AF5C316E07D'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '6DE0633C-530A-4DFE-811B-42B9886B7B81'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'ABC7DD0A-E751-4B97-A40F-01B0E1B01F5D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '6DE0633C-530A-4DFE-811B-42B9886B7B81'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'ABC7DD0A-E751-4B97-A40F-01B0E1B01F5D'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '1683B2F7-14A1-4466-8F8A-1C42C84138B8'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '6DE0633C-530A-4DFE-811B-42B9886B7B81'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'ABC7DD0A-E751-4B97-A40F-01B0E1B01F5D'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = 'ED966DA2-42E1-480F-87FB-C4E9D8FFFDB4' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1A074707-F092-4611-98B0-E4A84CD4C008'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '41694F55-F736-4443-A897-423251552868'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'ED966DA2-42E1-480F-87FB-C4E9D8FFFDB4'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C53F2FA8-FF9B-473C-8059-35BBB150322D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'E0D60B23-D306-444A-93A4-5636B2FE2FB5'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'ED966DA2-42E1-480F-87FB-C4E9D8FFFDB4'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '3A54B01A-6905-478A-B352-C21DE18D4D2B'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'CF64A1FE-0568-4864-93AA-28197FCAFD28'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'E0D60B23-D306-444A-93A4-5636B2FE2FB5'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'ED966DA2-42E1-480F-87FB-C4E9D8FFFDB4'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'CF64A1FE-0568-4864-93AA-28197FCAFD28'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'E0D60B23-D306-444A-93A4-5636B2FE2FB5'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 10 fields */ /* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6A22344A-EC8C-4907-9B40-CB9C42EB6A61' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.ProviderID */
UPDATE __mj."EntityField" SET "Category" = 'Bridge Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Provider', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EFB596D7-28C0-4E47-8BAE-2DD977377F0A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.ChannelID */
UPDATE __mj."EntityField" SET "Category" = 'Bridge Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Channel', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '51C8F183-060D-4204-935A-FEADB4FAB77F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.Provider */
UPDATE __mj."EntityField" SET "Category" = 'Bridge Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Provider Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '32E94636-467C-4A78-9A37-6F33B4276DCF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.Channel */
UPDATE __mj."EntityField" SET "Category" = 'Bridge Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Channel Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '928DC15C-979E-46D3-BD2E-AE4CFF380362' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.IsDefault */
UPDATE __mj."EntityField" SET "Category" = 'Channel Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F228FC90-7C14-4E6D-97D7-44A7974607A7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.Sequence */
UPDATE __mj."EntityField" SET "Category" = 'Channel Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5BDB0BFC-B805-4911-A991-9161101D0C74' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.Configuration */
UPDATE __mj."EntityField" SET "Category" = 'Channel Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'BFA64567-BB2A-4439-96C9-F7C612D718DF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '876CB633-F9C1-4590-A969-2386A5F2F9BE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Provider Channels.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '349FF1FC-812A-42F2-96C6-8102B12495AE' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-project-diagram */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-project-diagram', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'fbb83b30-9416-4d0d-b2a8-aca0a61f066e',
    'E6C72108-A52B-4162-B0C3-CC6CFECD642D',
    'FieldCategoryInfo',
    '{"Bridge Relationships":{"icon":"fa fa-link","description":"Links and descriptive names for the provider and channel relationships"},"Channel Configuration":{"icon":"fa fa-sliders-h","description":"Settings governing channel behavior, display order, and technical mapping"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '55c6cabc-d7c8-41b4-8fb9-b9cb4cd09f5d',
    'E6C72108-A52B-4162-B0C3-CC6CFECD642D',
    'FieldCategoryIcons',
    '{"Bridge Relationships":"fa fa-link","Channel Configuration":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'E6C72108-A52B-4162-B0C3-CC6CFECD642D';

/* Set categories for 11 fields */ /* UPDATE Entity Field Category Info MJ: AI Bridge Providers.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6C09890E-9E79-4C52-AACD-DE3039C2FC12' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.Name */
UPDATE __mj."EntityField" SET "Category" = 'Provider Information', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1683B2F7-14A1-4466-8F8A-1C42C84138B8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.Description */
UPDATE __mj."EntityField" SET "Category" = 'Provider Information', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BCEDEEFE-9C1F-4833-A344-47A7A3DF478D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.BridgeType */
UPDATE __mj."EntityField" SET "Category" = 'Provider Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6DE0633C-530A-4DFE-811B-42B9886B7B81' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.DriverClass */
UPDATE __mj."EntityField" SET "Category" = 'Provider Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CB02738F-6CD8-4647-A64D-C3A41F7069A1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.Status */
UPDATE __mj."EntityField" SET "Category" = 'Provider Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ABC7DD0A-E751-4B97-A40F-01B0E1B01F5D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.SupportedFeatures */
UPDATE __mj."EntityField" SET "Category" = 'Technical Capabilities', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '2E8A00EF-6E53-4A04-A8BD-8EF2E948F818' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.ConfigSchema */
UPDATE __mj."EntityField" SET "Category" = 'Technical Capabilities', "GeneratedFormSection" = 'Category', "DisplayName" = 'Configuration Schema', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '4FABDF5D-FDE6-4ADA-B3A6-9923E5AA7DD4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.Configuration */
UPDATE __mj."EntityField" SET "Category" = 'Provider Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'F77D391F-5E66-4E21-A104-DC4D389FBB19' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0A7913FA-C6A1-4E15-B29E-FA776C9F1D8B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Providers.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1BEB341E-9A0E-4BBE-97D8-407AD522D50D' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-network-wired */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-network-wired', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '840A51D1-7436-45F9-9176-31E1FE785635';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f88d953c-2bd6-4cda-b6dc-0230ab6495cd',
    '840A51D1-7436-45F9-9176-31E1FE785635',
    'FieldCategoryInfo',
    '{"Provider Information":{"icon":"fa fa-info-circle","description":"General identification and descriptive details for the bridge provider."},"Provider Configuration":{"icon":"fa fa-sliders-h","description":"Core operational settings, driver class mappings, and status controls."},"Technical Capabilities":{"icon":"fa fa-code","description":"Advanced technical definitions, feature sets, and configuration schemas."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd40ee699-2bb7-4736-8732-7a075bb24965',
    '840A51D1-7436-45F9-9176-31E1FE785635',
    'FieldCategoryIcons',
    '{"Provider Information":"fa fa-info-circle","Provider Configuration":"fa fa-sliders-h","Technical Capabilities":"fa fa-code","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '840A51D1-7436-45F9-9176-31E1FE785635';

/* Set categories for 12 fields */ /* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.AgentID */
UPDATE __mj."EntityField" SET "Category" = 'Identity Assignment', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CE170E63-3448-4B76-BE01-B865A181C906' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.Agent */
UPDATE __mj."EntityField" SET "Category" = 'Identity Assignment', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D1CEB001-6864-4E31-B119-22066AB45351' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.ProviderID */
UPDATE __mj."EntityField" SET "Category" = 'Identity Assignment', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '995A5799-D436-4C36-9008-911834362852' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.Provider */
UPDATE __mj."EntityField" SET "Category" = 'Identity Assignment', "GeneratedFormSection" = 'Category', "DisplayName" = 'Provider Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FFAF2B58-42CA-4AD6-A458-57EDC74FA687' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.IdentityType */
UPDATE __mj."EntityField" SET "Category" = 'Identity Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F95225B4-9736-4048-9878-63A1E2027B19' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.IdentityValue */
UPDATE __mj."EntityField" SET "Category" = 'Identity Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '55DF4D22-4556-4067-80B2-BE5878FE3AD1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.DisplayName */
UPDATE __mj."EntityField" SET "Category" = 'Identity Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A0698B17-B847-4039-BDC0-E170753B63CE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.IsActive */
UPDATE __mj."EntityField" SET "Category" = 'Identity Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B61968E8-ECB4-4A0A-AC7A-1D59E569E098' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.Configuration */
UPDATE __mj."EntityField" SET "Category" = 'Identity Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'E61E0B7D-406E-4379-9FE4-C2D13DFE586A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E63AC383-34C6-423B-A627-5F8E834697B8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D8BA873C-6FA2-4188-AB66-E23D147508D7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C0147A9C-306F-4B16-9FDB-3F26FC5BE339' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-id-card */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-id-card', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd724a3d7-fa2c-47e4-a331-6a4076abd075',
    '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77',
    'FieldCategoryInfo',
    '{"Identity Assignment":{"icon":"fa fa-link","description":"Links this identity to specific agents and service providers"},"Identity Details":{"icon":"fa fa-id-card","description":"Core descriptive information regarding the identity type and address"},"Identity Configuration":{"icon":"fa fa-sliders-h","description":"Operational settings and technical configuration for the identity"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1e98bf66-db00-4f24-b92a-0538944fc9c1',
    '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77',
    'FieldCategoryIcons',
    '{"Identity Assignment":"fa fa-link","Identity Details":"fa fa-id-card","Identity Configuration":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77';

/* Set categories for 12 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '27F416D4-AC82-4698-95C3-A462635D81C8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.SessionBridgeID */
UPDATE __mj."EntityField" SET "Category" = 'Session Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'Session Bridge', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '14E095F9-26F2-4620-B238-2EC613883FC9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.ExternalParticipantID */
UPDATE __mj."EntityField" SET "Category" = 'Participant Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '18F703DC-03D6-4B93-96CB-7F74B6837042' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.DisplayName */
UPDATE __mj."EntityField" SET "Category" = 'Participant Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6B191FE0-FFCD-41BD-8B4F-B74A62DC889C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.Role */
UPDATE __mj."EntityField" SET "Category" = 'Participant Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '29949D7A-C3E2-4890-A9F1-9AF5C316E07D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.UserID */
UPDATE __mj."EntityField" SET "Category" = 'User Association', "GeneratedFormSection" = 'Category', "DisplayName" = 'User', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0B9E9E68-076F-470A-BE2E-173594C1E631' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.User */
UPDATE __mj."EntityField" SET "Category" = 'User Association', "GeneratedFormSection" = 'Category', "DisplayName" = 'User Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E133CD15-B7C6-44F1-AB72-99623E0BDC54' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.IsAgent */
UPDATE __mj."EntityField" SET "Category" = 'Participant Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Is AI Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F0503A62-B321-40FF-A185-C97BE93784FF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.JoinedAt */
UPDATE __mj."EntityField" SET "Category" = 'Session Timeline', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D12FCFD1-6E70-47D2-9646-191D3065EBDC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.LeftAt */
UPDATE __mj."EntityField" SET "Category" = 'Session Timeline', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E8E8674A-1FEA-40B0-A14B-ADC7797FE9CC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '020D2B81-FF36-4AE2-BE49-157A127AB9F5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6DA50585-381D-4CA6-80EC-67B95192F01C' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-users */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-users', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'F4559F85-72B8-468A-A706-235FF252E01D';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1db9d96e-caef-4187-860e-2322376b3983',
    'F4559F85-72B8-468A-A706-235FF252E01D',
    'FieldCategoryInfo',
    '{"Participant Details":{"icon":"fa fa-user-tag","description":"Core identity and role information for meeting participants"},"Session Timeline":{"icon":"fa fa-clock","description":"Tracking of when participants entered and exited the session"},"User Association":{"icon":"fa fa-user-check","description":"Information linking the participant to internal system users"},"Session Information":{"icon":"fa fa-plug","description":"Linkage to the parent AI session bridge"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '775988d0-2f42-4708-ba5c-e28d2884af88',
    'F4559F85-72B8-468A-A706-235FF252E01D',
    'FieldCategoryIcons',
    '{"Participant Details":"fa fa-user-tag","Session Timeline":"fa fa-clock","User Association":"fa fa-user-check","Session Information":"fa fa-plug","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D';

/* Set categories for 19 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CCDEB9C6-696E-43AE-B560-208790838F08' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.AgentSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Session', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '03A50BB3-788C-4193-A929-157389B3FFA8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.ProviderID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2DB6FCCB-CC02-4E7C-B1FE-E20795739E13' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.Provider */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E0D60B23-D306-444A-93A4-5636B2FE2FB5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.Direction */
UPDATE __mj."EntityField" SET "Category" = 'Connection Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1A074707-F092-4611-98B0-E4A84CD4C008' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.JoinMethod */
UPDATE __mj."EntityField" SET "Category" = 'Connection Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '41694F55-F736-4443-A897-423251552868' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.TurnMode */
UPDATE __mj."EntityField" SET "Category" = 'Connection Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D71309DD-89EF-47A3-91FC-526652879423' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.ExternalConnectionID */
UPDATE __mj."EntityField" SET "Category" = 'Connection Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ED966DA2-42E1-480F-87FB-C4E9D8FFFDB4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.Address */
UPDATE __mj."EntityField" SET "Category" = 'Connection Details', "GeneratedFormSection" = 'Category', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = '3A54B01A-6905-478A-B352-C21DE18D4D2B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.BotParticipantID */
UPDATE __mj."EntityField" SET "Category" = 'Connection Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CF64A1FE-0568-4864-93AA-28197FCAFD28' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.Status */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EF5FE4C6-065B-4E02-88EA-19E3C0CC08C2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.ScheduledStartTime */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FCCC746F-FFAB-478D-9115-D1021BEE3B10' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.ConnectedAt */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C53F2FA8-FF9B-473C-8059-35BBB150322D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.DisconnectedAt */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B5DA55AD-8059-482E-B692-CCC84D9C4736' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.CloseReason */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CEBD2ACC-8753-4ABE-971D-4D5B570DA993' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.HostInstanceID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2C4756FB-ADD7-493E-8DDC-9D772BC96775' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.Config */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Configuration', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'EE25F1A8-6802-42F9-A291-150B3199C0A0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CB4BF8BB-5B6A-4C93-8BC4-79C22E2DEF5E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B6545B81-B121-4BAB-A519-5BD391ED8574' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-network-wired */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-network-wired', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '795e3390-7ab0-4584-a8c4-3cfd6a560bb2',
    '58D95AA3-52C3-4131-BF62-E84E75B04BD2',
    'FieldCategoryInfo',
    '{"Session Context":{"icon":"fa fa-info-circle","description":"Core context identifiers linking the bridge to agents and providers"},"Connection Details":{"icon":"fa fa-plug","description":"Technical details regarding how the bridge connects and operates"},"Lifecycle and Timing":{"icon":"fa fa-clock","description":"Timeline and status tracking for the connection lifecycle"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit, configuration, and infrastructure fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f54f76ea-a480-46ea-b9a4-b2fd4f5ffa2e',
    '58D95AA3-52C3-4131-BF62-E84E75B04BD2',
    'FieldCategoryIcons',
    '{"Session Context":"fa fa-info-circle","Connection Details":"fa fa-plug","Lifecycle and Timing":"fa fa-clock","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2';
/* second CodeGen run - after JSONType in place */;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '95427194-037B-40BB-8A70-23D84323BC4B' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '95427194-037B-40BB-8A70-23D84323BC4B'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '6C6A6186-10F2-41B4-85D5-E1F44ADAC380'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '65ABF2B8-3355-4427-828B-E3082806C557'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = 'CB7692F5-554C-48A6-B88B-207DD35A3072' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = '09248F34-2837-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'C400A5F2-1BE3-4441-AEFA-06344A12AAB2'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '64FAC701-8AB3-43C0-B741-71252122E8B0'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'E1F5A7A4-9248-4C45-9D74-04E7B44A1DD5'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = 'C769307F-0D9E-4ED3-9FE1-9DD39E9D8F8C' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '68D6F8C2-3A54-4D7A-92DD-F90792348295' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D720FC44-1C0D-43BB-ACF5-051F4E65FE5B'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'C769307F-0D9E-4ED3-9FE1-9DD39E9D8F8C'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'C60AA966-1839-4F47-A009-F08FBE3B2885'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = '3A139346-CC48-479A-A53B-8892664F5DFD'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = 'C01717BE-FF5A-4C92-820A-A547324F6F1B' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '4AB03803-B3E2-4482-986B-13A5EBB70E76' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'FF6598BB-8BAA-4C44-AAF5-80ACBB4C1C69'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '45946792-C4FA-4D0B-81C9-C1C764E185BC'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'C01717BE-FF5A-4C92-820A-A547324F6F1B'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '45946792-C4FA-4D0B-81C9-C1C764E185BC'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'A24EF5EC-D32C-4A53-85A9-364E322451E6'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 39 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Notes.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '225421C0-34B7-466F-95C9-74DE8432B137' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.AgentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '54E9381D-F8B7-4AE2-BE4D-B8BA612E2923' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.AgentNoteTypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '324755A2-657E-42A0-A339-620F7379397D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.Note */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Note Content', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4AB03803-B3E2-4482-986B-13A5EBB70E76' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7CF765EF-9212-427B-B7BA-2CA57E27CD22' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4B2B427D-3F97-494F-94D6-AB18FD7E83CA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.UserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B8B8C7B4-2F27-4555-80F1-FEF0D2F662C3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.Type */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Note Type', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C01717BE-FF5A-4C92-820A-A547324F6F1B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.IsAutoGenerated */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Is Auto-Generated', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0A9FC5B8-D931-4741-91FE-1C40ABF4B1AD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.Comments */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '93CEF268-8B79-4985-9E7F-5F584B7F1D14' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '70B237B2-D508-4C19-8838-850ACC9961F1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.SourceConversationID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A96D7811-B4EF-47B3-B044-C5F1D0658AAB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.SourceConversationDetailID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8C2C7801-F008-49D7-A663-1A16BE929C5B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.SourceAIAgentRunID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A343B2F0-D157-4574-BADD-0520A2D9C4A9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.CompanyID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4796734A-9D50-4726-A04A-59010C91A3E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.EmbeddingVector */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7309EF51-3A04-4AE1-A7DC-B999BB0044A3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.EmbeddingModelID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '55BA7B81-7947-4990-928B-083BE2BFC916' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.PrimaryScopeEntityID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1F1E84FE-99C5-4AEB-817E-6B03BB6FD5BC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.PrimaryScopeRecordID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '702F4025-07E3-458E-9B93-82313A52DBD0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.SecondaryScopes */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '513178C8-F947-4A4F-9A9C-678648E51368' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.LastAccessedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E122CC35-6540-4A2F-90EE-5A32C7BF1F1E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.AccessCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2282BF73-E454-4868-A2D1-DCCDA9D54AB3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.ExpiresAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EAF1C1AB-4019-4A41-BF59-20B88DA44567' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.ConsolidatedIntoNoteID */
UPDATE __mj."EntityField" SET "Category" = 'Usage & Lifecycle', "GeneratedFormSection" = 'Category', "DisplayName" = 'Consolidated Into Note', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2D8BE8BB-AD23-44AC-8735-0A3D450439BB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.ConsolidationCount */
UPDATE __mj."EntityField" SET "Category" = 'Usage & Lifecycle', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5F8DDF01-E2AD-4C5F-ACE6-FC65AE72FBC6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.DerivedFromNoteIDs */
UPDATE __mj."EntityField" SET "Category" = 'Usage & Lifecycle', "GeneratedFormSection" = 'Category', "DisplayName" = 'Derived From Note IDs', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '12D40F7B-87E8-4C4F-910D-E751288D179F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.ProtectionTier */
UPDATE __mj."EntityField" SET "Category" = 'Usage & Lifecycle', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BCD8589F-8CC6-4D4D-B13C-426FD982F3ED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.ImportanceScore */
UPDATE __mj."EntityField" SET "Category" = 'Usage & Lifecycle', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FF6598BB-8BAA-4C44-AAF5-80ACBB4C1C69' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.Agent */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4EB4FD5F-749F-4A11-B5C4-8F70995DAC3C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.AgentNoteType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Note Type Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '45946792-C4FA-4D0B-81C9-C1C764E185BC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.User */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'User Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B5569F04-CBF7-4660-8BA5-CA0D1EAB75CF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.SourceConversation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Source Conversation Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0FCB492C-5AFA-492B-8E6C-B56A269BD486' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.SourceConversationDetail */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Source Conversation Detail Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D9422A2E-4C9B-4DAA-AD7C-484C063C240B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.SourceAIAgentRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Source AI Agent Run Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '65862A21-C4A3-4848-AAB9-BDFD79AD1117' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.Company */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Company Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C43547D2-E1F3-4AE5-9A2B-9C63ADBE2365' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.EmbeddingModel */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Embedding Model Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '728A2DC6-ED02-4841-B9D2-B2641A4BF107' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.PrimaryScopeEntity */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Primary Scope Entity Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '79FAD22E-7080-4283-B3DD-ED140949E39A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.ConsolidatedIntoNote */
UPDATE __mj."EntityField" SET "Category" = 'Usage & Lifecycle', "GeneratedFormSection" = 'Category', "DisplayName" = 'Consolidated Into Note Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CF526B9D-E927-4084-8AA6-C2B2EBB0EB2D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Notes.RootConsolidatedIntoNoteID */
UPDATE __mj."EntityField" SET "Category" = 'Usage & Lifecycle', "GeneratedFormSection" = 'Category', "DisplayName" = 'Root Consolidated Note', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '991F078C-B367-4530-88DC-B9C65568B495' AND "AutoUpdateCategory" = TRUE;
/* CodeGen Run #3 */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7ee32ba2-748d-4174-9e49-dd0fe6a40d70' OR ("EntityID" = 'F4559F85-72B8-468A-A706-235FF252E01D' AND "Name" = 'SessionBridge')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7ee32ba2-748d-4174-9e49-dd0fe6a40d70', 'F4559F85-72B8-468A-A706-235FF252E01D' /* Entity: MJ: AI Agent Session Bridge Participants */, 100024, 'SessionBridge', 'Session Bridge', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '18F703DC-03D6-4B93-96CB-7F74B6837042'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '18F703DC-03D6-4B93-96CB-7F74B6837042'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 13 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '27F416D4-AC82-4698-95C3-A462635D81C8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '020D2B81-FF36-4AE2-BE49-157A127AB9F5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6DA50585-381D-4CA6-80EC-67B95192F01C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.SessionBridgeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '14E095F9-26F2-4620-B238-2EC613883FC9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.SessionBridge */
UPDATE __mj."EntityField" SET "Category" = 'Session Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'Session Bridge Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7EE32BA2-748D-4174-9E49-DD0FE6A40D70' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.ExternalParticipantID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '18F703DC-03D6-4B93-96CB-7F74B6837042' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.DisplayName */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6B191FE0-FFCD-41BD-8B4F-B74A62DC889C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.Role */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '29949D7A-C3E2-4890-A9F1-9AF5C316E07D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.IsAgent */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Is Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F0503A62-B321-40FF-A185-C97BE93784FF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.UserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0B9E9E68-076F-470A-BE2E-173594C1E631' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.User */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E133CD15-B7C6-44F1-AB72-99623E0BDC54' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.JoinedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D12FCFD1-6E70-47D2-9646-191D3065EBDC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridge Participants.LeftAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E8E8674A-1FEA-40B0-A14B-ADC7797FE9CC' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_agent_id"
    ON __mj."AIAgentExample" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_user_id"
    ON __mj."AIAgentExample" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_company_id"
    ON __mj."AIAgentExample" ("CompanyID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_source_conversation_id"
    ON __mj."AIAgentExample" ("SourceConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_source_conversation_detail_id"
    ON __mj."AIAgentExample" ("SourceConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_source_ai_agent_run_id"
    ON __mj."AIAgentExample" ("SourceAIAgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_embedding_model_id"
    ON __mj."AIAgentExample" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_primary_scope_entity_id"
    ON __mj."AIAgentExample" ("PrimaryScopeEntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: vwAIAgentExamples
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Examples
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentExample
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentExamples"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJUser_UserID."Name" AS "User",
    MJCompany_CompanyID."Name" AS "Company",
    MJConversation_SourceConversationID."Name" AS "SourceConversation",
    MJConversationDetail_SourceConversationDetailID."ExternalID" AS "SourceConversationDetail",
    MJAIAgentRun_SourceAIAgentRunID."RunName" AS "SourceAIAgentRun",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity"
FROM
    __mj."AIAgentExample" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Company" AS MJCompany_CompanyID
  ON
    "a"."CompanyID" = MJCompany_CompanyID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_SourceConversationID
  ON
    "a"."SourceConversationID" = MJConversation_SourceConversationID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_SourceConversationDetailID
  ON
    "a"."SourceConversationDetailID" = MJConversationDetail_SourceConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_SourceAIAgentRunID
  ON
    "a"."SourceAIAgentRunID" = MJAIAgentRun_SourceAIAgentRunID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "a"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentExamples'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentExamples'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentExamples'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentExamples" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIAgentExamples" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentExamples" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentExamples" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: spCreateAIAgentExample
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentExample
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentExample'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentExample"(
    p_id uuid DEFAULT NULL,
    p_agentid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_exampleinput text DEFAULT NULL,
    p_exampleoutput text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_successscore_clear boolean DEFAULT false,
    p_successscore decimal(5, 2) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentExamples" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentExample"
        (
            "ID",
            "AgentID",
                "UserID",
                "CompanyID",
                "Type",
                "ExampleInput",
                "ExampleOutput",
                "IsAutoGenerated",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "SuccessScore",
                "Comments",
                "Status",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END,
                COALESCE(p_type, 'Example'),
                p_exampleinput,
                p_exampleoutput,
                COALESCE(p_isautogenerated, FALSE),
                CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, NULL) END,
                CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, NULL) END,
                CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, NULL) END,
                CASE WHEN p_successscore_clear = true THEN NULL ELSE COALESCE(p_successscore, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, NULL) END,
                CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, NULL) END,
                CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, NULL) END,
                CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, NULL) END,
                COALESCE(p_accesscount, 0),
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentExamples"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentExample" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentExample" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: spUpdateAIAgentExample
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentExample
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentExample'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentExample"(
    p_id uuid,
    p_agentid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_exampleinput text DEFAULT NULL,
    p_exampleoutput text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_successscore_clear boolean DEFAULT false,
    p_successscore decimal(5, 2) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentExamples" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentExample"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END,
        "Type" = COALESCE(p_type, "Type"),
        "ExampleInput" = COALESCE(p_exampleinput, "ExampleInput"),
        "ExampleOutput" = COALESCE(p_exampleoutput, "ExampleOutput"),
        "IsAutoGenerated" = COALESCE(p_isautogenerated, "IsAutoGenerated"),
        "SourceConversationID" = CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, "SourceConversationID") END,
        "SourceConversationDetailID" = CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, "SourceConversationDetailID") END,
        "SourceAIAgentRunID" = CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, "SourceAIAgentRunID") END,
        "SuccessScore" = CASE WHEN p_successscore_clear = true THEN NULL ELSE COALESCE(p_successscore, "SuccessScore") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Status" = COALESCE(p_status, "Status"),
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, "SecondaryScopes") END,
        "LastAccessedAt" = CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, "LastAccessedAt") END,
        "AccessCount" = COALESCE(p_accesscount, "AccessCount"),
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentExamples"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentExample" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentExample" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentExample table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_example"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_example" ON __mj."AIAgentExample";

CREATE TRIGGER "trg_update_ai_agent_example"
BEFORE UPDATE ON __mj."AIAgentExample"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_example"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: spDeleteAIAgentExample
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentExample
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentExample'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentExample"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentExample"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentExample" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentExample" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_agent_id"
    ON __mj."AIAgentNote" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_agent_note_type_id"
    ON __mj."AIAgentNote" ("AgentNoteTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_user_id"
    ON __mj."AIAgentNote" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_conversation_id"
    ON __mj."AIAgentNote" ("SourceConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_conversation_detail_id"
    ON __mj."AIAgentNote" ("SourceConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_ai_agent_run_id"
    ON __mj."AIAgentNote" ("SourceAIAgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_company_id"
    ON __mj."AIAgentNote" ("CompanyID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_embedding_model_id"
    ON __mj."AIAgentNote" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_primary_scope_entity_id"
    ON __mj."AIAgentNote" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_consolidated_into_note_id"
    ON __mj."AIAgentNote" ("ConsolidatedIntoNoteID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: fnAIAgentNoteConsolidatedIntoNoteID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentNote.ConsolidatedIntoNoteID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_note_consolidated_into_note_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ConsolidatedIntoNoteID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentNote"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ConsolidatedIntoNoteID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentNote" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ConsolidatedIntoNoteID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ConsolidatedIntoNoteID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: vwAIAgentNotes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Notes
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentNote
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentNotes"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentNoteType_AgentNoteTypeID."Name" AS "AgentNoteType",
    MJUser_UserID."Name" AS "User",
    MJConversation_SourceConversationID."Name" AS "SourceConversation",
    MJConversationDetail_SourceConversationDetailID."ExternalID" AS "SourceConversationDetail",
    MJAIAgentRun_SourceAIAgentRunID."RunName" AS "SourceAIAgentRun",
    MJCompany_CompanyID."Name" AS "Company",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    MJAIAgentNote_ConsolidatedIntoNoteID."Type" AS "ConsolidatedIntoNote",
    root_ConsolidatedIntoNoteID.root_id AS "RootConsolidatedIntoNoteID"
FROM
    __mj."AIAgentNote" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentNoteType" AS MJAIAgentNoteType_AgentNoteTypeID
  ON
    "a"."AgentNoteTypeID" = MJAIAgentNoteType_AgentNoteTypeID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_SourceConversationID
  ON
    "a"."SourceConversationID" = MJConversation_SourceConversationID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_SourceConversationDetailID
  ON
    "a"."SourceConversationDetailID" = MJConversationDetail_SourceConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_SourceAIAgentRunID
  ON
    "a"."SourceAIAgentRunID" = MJAIAgentRun_SourceAIAgentRunID."ID"
LEFT OUTER JOIN
    __mj."Company" AS MJCompany_CompanyID
  ON
    "a"."CompanyID" = MJCompany_CompanyID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "a"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"
LEFT OUTER JOIN
    __mj."AIAgentNote" AS MJAIAgentNote_ConsolidatedIntoNoteID
  ON
    "a"."ConsolidatedIntoNoteID" = MJAIAgentNote_ConsolidatedIntoNoteID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_note_consolidated_into_note_id_get_root_id"(a."ID", a."ConsolidatedIntoNoteID") AS root_id
) AS root_ConsolidatedIntoNoteID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentNotes'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentNotes'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentNotes'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentNotes" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: spCreateAIAgentNote
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentNote
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentNote'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentNote"(
    p_id uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_agentnotetypeid_clear boolean DEFAULT false,
    p_agentnotetypeid uuid DEFAULT NULL,
    p_note_clear boolean DEFAULT false,
    p_note text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_consolidatedintonoteid_clear boolean DEFAULT false,
    p_consolidatedintonoteid uuid DEFAULT NULL,
    p_consolidationcount integer DEFAULT NULL,
    p_derivedfromnoteids_clear boolean DEFAULT false,
    p_derivedfromnoteids text DEFAULT NULL,
    p_protectiontier text DEFAULT NULL,
    p_importancescore_clear boolean DEFAULT false,
    p_importancescore decimal(5, 2) DEFAULT NULL,
    p_authortype text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentNotes" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentNote"
        (
            "ID",
            "AgentID",
                "AgentNoteTypeID",
                "Note",
                "UserID",
                "Type",
                "IsAutoGenerated",
                "Comments",
                "Status",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "CompanyID",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt",
                "ConsolidatedIntoNoteID",
                "ConsolidationCount",
                "DerivedFromNoteIDs",
                "ProtectionTier",
                "ImportanceScore",
                "AuthorType"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                CASE WHEN p_agentnotetypeid_clear = true THEN NULL ELSE COALESCE(p_agentnotetypeid, NULL) END,
                CASE WHEN p_note_clear = true THEN NULL ELSE COALESCE(p_note, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                COALESCE(p_type, 'Preference'),
                COALESCE(p_isautogenerated, FALSE),
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, NULL) END,
                CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, NULL) END,
                CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, NULL) END,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END,
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, NULL) END,
                CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, NULL) END,
                CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, NULL) END,
                CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, NULL) END,
                COALESCE(p_accesscount, 0),
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END,
                CASE WHEN p_consolidatedintonoteid_clear = true THEN NULL ELSE COALESCE(p_consolidatedintonoteid, NULL) END,
                COALESCE(p_consolidationcount, 0),
                CASE WHEN p_derivedfromnoteids_clear = true THEN NULL ELSE COALESCE(p_derivedfromnoteids, NULL) END,
                COALESCE(p_protectiontier, 'Standard'),
                CASE WHEN p_importancescore_clear = true THEN NULL ELSE COALESCE(p_importancescore, NULL) END,
                COALESCE(p_authortype, 'MemoryManager')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentNotes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: spUpdateAIAgentNote
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentNote
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentNote'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentNote"(
    p_id uuid,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_agentnotetypeid_clear boolean DEFAULT false,
    p_agentnotetypeid uuid DEFAULT NULL,
    p_note_clear boolean DEFAULT false,
    p_note text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_consolidatedintonoteid_clear boolean DEFAULT false,
    p_consolidatedintonoteid uuid DEFAULT NULL,
    p_consolidationcount integer DEFAULT NULL,
    p_derivedfromnoteids_clear boolean DEFAULT false,
    p_derivedfromnoteids text DEFAULT NULL,
    p_protectiontier text DEFAULT NULL,
    p_importancescore_clear boolean DEFAULT false,
    p_importancescore decimal(5, 2) DEFAULT NULL,
    p_authortype text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentNotes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentNote"
    SET
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "AgentNoteTypeID" = CASE WHEN p_agentnotetypeid_clear = true THEN NULL ELSE COALESCE(p_agentnotetypeid, "AgentNoteTypeID") END,
        "Note" = CASE WHEN p_note_clear = true THEN NULL ELSE COALESCE(p_note, "Note") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "Type" = COALESCE(p_type, "Type"),
        "IsAutoGenerated" = COALESCE(p_isautogenerated, "IsAutoGenerated"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Status" = COALESCE(p_status, "Status"),
        "SourceConversationID" = CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, "SourceConversationID") END,
        "SourceConversationDetailID" = CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, "SourceConversationDetailID") END,
        "SourceAIAgentRunID" = CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, "SourceAIAgentRunID") END,
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END,
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, "SecondaryScopes") END,
        "LastAccessedAt" = CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, "LastAccessedAt") END,
        "AccessCount" = COALESCE(p_accesscount, "AccessCount"),
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END,
        "ConsolidatedIntoNoteID" = CASE WHEN p_consolidatedintonoteid_clear = true THEN NULL ELSE COALESCE(p_consolidatedintonoteid, "ConsolidatedIntoNoteID") END,
        "ConsolidationCount" = COALESCE(p_consolidationcount, "ConsolidationCount"),
        "DerivedFromNoteIDs" = CASE WHEN p_derivedfromnoteids_clear = true THEN NULL ELSE COALESCE(p_derivedfromnoteids, "DerivedFromNoteIDs") END,
        "ProtectionTier" = COALESCE(p_protectiontier, "ProtectionTier"),
        "ImportanceScore" = CASE WHEN p_importancescore_clear = true THEN NULL ELSE COALESCE(p_importancescore, "ImportanceScore") END,
        "AuthorType" = COALESCE(p_authortype, "AuthorType")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentNotes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_note"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_note" ON __mj."AIAgentNote";

CREATE TRIGGER "trg_update_ai_agent_note"
BEFORE UPDATE ON __mj."AIAgentNote"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_note"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: spDeleteAIAgentNote
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentNote
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentNote'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentNote"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentNote"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON __mj."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON __mj."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON __mj."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON __mj."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON __mj."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON __mj."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON __mj."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON __mj."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON __mj."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON __mj."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON __mj."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON __mj."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_session_id"
    ON __mj."AIAgentRun" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunLastRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.LastRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_last_run_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "LastRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."LastRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."LastRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "LastRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRuns"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentRun_ParentRunID."RunName" AS "ParentRun",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJAIAgentRun_LastRunID."RunName" AS "LastRun",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIModel_OverrideModelID."Name" AS "OverrideModel",
    MJAIVendor_OverrideVendorID."Name" AS "OverrideVendor",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    root_ParentRunID.root_id AS "RootParentRunID",
    root_LastRunID.root_id AS "RootLastRunID"
FROM
    __mj."AIAgentRun" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    __mj."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_parent_run_id_get_root_id"(a."ID", a."ParentRunID") AS root_id
) AS root_ParentRunID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_last_run_id_get_root_id"(a."ID", a."LastRunID") AS root_id
) AS root_LastRunID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
AS $$
DECLARE
    v_id uuid;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::uuid;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::uuid';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'LastHeartbeatAt', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'AgentSessionID']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ParentRunID' THEN '($1->>''ParentRunID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Running'')'
        WHEN 'StartedAt' THEN 'COALESCE(($1->>''StartedAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'Success' THEN '($1->>''Success'')::BOOLEAN'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ConversationID' THEN '($1->>''ConversationID'')::UUID'
        WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'AgentState' THEN '($1->>''AgentState'')'
        WHEN 'TotalTokensUsed' THEN '($1->>''TotalTokensUsed'')::INTEGER'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'TotalPromptTokensUsed' THEN '($1->>''TotalPromptTokensUsed'')::INTEGER'
        WHEN 'TotalCompletionTokensUsed' THEN '($1->>''TotalCompletionTokensUsed'')::INTEGER'
        WHEN 'TotalTokensUsedRollup' THEN '($1->>''TotalTokensUsedRollup'')::INTEGER'
        WHEN 'TotalPromptTokensUsedRollup' THEN '($1->>''TotalPromptTokensUsedRollup'')::INTEGER'
        WHEN 'TotalCompletionTokensUsedRollup' THEN '($1->>''TotalCompletionTokensUsedRollup'')::INTEGER'
        WHEN 'TotalCostRollup' THEN '($1->>''TotalCostRollup'')::DECIMAL(19, 8)'
        WHEN 'ConversationDetailID' THEN '($1->>''ConversationDetailID'')::UUID'
        WHEN 'ConversationDetailSequence' THEN '($1->>''ConversationDetailSequence'')::INTEGER'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'FinalStep' THEN '($1->>''FinalStep'')'
        WHEN 'FinalPayload' THEN '($1->>''FinalPayload'')'
        WHEN 'Message' THEN '($1->>''Message'')'
        WHEN 'LastRunID' THEN '($1->>''LastRunID'')::UUID'
        WHEN 'StartingPayload' THEN '($1->>''StartingPayload'')'
        WHEN 'TotalPromptIterations' THEN 'COALESCE(($1->>''TotalPromptIterations'')::INTEGER, 0)'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'OverrideModelID' THEN '($1->>''OverrideModelID'')::UUID'
        WHEN 'OverrideVendorID' THEN '($1->>''OverrideVendorID'')::UUID'
        WHEN 'Data' THEN '($1->>''Data'')'
        WHEN 'Verbose' THEN '($1->>''Verbose'')::BOOLEAN'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INTEGER'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'ScheduledJobRunID' THEN '($1->>''ScheduledJobRunID'')::UUID'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'PrimaryScopeEntityID' THEN '($1->>''PrimaryScopeEntityID'')::UUID'
        WHEN 'PrimaryScopeRecordID' THEN '($1->>''PrimaryScopeRecordID'')'
        WHEN 'SecondaryScopes' THEN '($1->>''SecondaryScopes'')'
        WHEN 'ExternalReferenceID' THEN '($1->>''ExternalReferenceID'')'
        WHEN 'CompanyID' THEN '($1->>''CompanyID'')::UUID'
        WHEN 'LastHeartbeatAt' THEN '($1->>''LastHeartbeatAt'')::TIMESTAMPTZ'
        WHEN 'TotalCacheReadTokensUsed' THEN '($1->>''TotalCacheReadTokensUsed'')::INTEGER'
        WHEN 'TotalCacheWriteTokensUsed' THEN '($1->>''TotalCacheWriteTokensUsed'')::INTEGER'
        WHEN 'AgentSessionID' THEN '($1->>''AgentSessionID'')::UUID'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIAgentRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
AS $$
DECLARE
    v_id uuid := (p_data->>'ID')::uuid;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgentRun"
    SET
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ParentRunID" = CASE WHEN p_data ? 'ParentRunID' THEN (p_data->>'ParentRunID')::UUID ELSE "ParentRunID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "StartedAt" = CASE WHEN p_data ? 'StartedAt' THEN (p_data->>'StartedAt')::TIMESTAMPTZ ELSE "StartedAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ConversationID" = CASE WHEN p_data ? 'ConversationID' THEN (p_data->>'ConversationID')::UUID ELSE "ConversationID" END,
        "UserID" = CASE WHEN p_data ? 'UserID' THEN (p_data->>'UserID')::UUID ELSE "UserID" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "AgentState" = CASE WHEN p_data ? 'AgentState' THEN (p_data->>'AgentState') ELSE "AgentState" END,
        "TotalTokensUsed" = CASE WHEN p_data ? 'TotalTokensUsed' THEN (p_data->>'TotalTokensUsed')::INTEGER ELSE "TotalTokensUsed" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "TotalPromptTokensUsed" = CASE WHEN p_data ? 'TotalPromptTokensUsed' THEN (p_data->>'TotalPromptTokensUsed')::INTEGER ELSE "TotalPromptTokensUsed" END,
        "TotalCompletionTokensUsed" = CASE WHEN p_data ? 'TotalCompletionTokensUsed' THEN (p_data->>'TotalCompletionTokensUsed')::INTEGER ELSE "TotalCompletionTokensUsed" END,
        "TotalTokensUsedRollup" = CASE WHEN p_data ? 'TotalTokensUsedRollup' THEN (p_data->>'TotalTokensUsedRollup')::INTEGER ELSE "TotalTokensUsedRollup" END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_data ? 'TotalPromptTokensUsedRollup' THEN (p_data->>'TotalPromptTokensUsedRollup')::INTEGER ELSE "TotalPromptTokensUsedRollup" END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_data ? 'TotalCompletionTokensUsedRollup' THEN (p_data->>'TotalCompletionTokensUsedRollup')::INTEGER ELSE "TotalCompletionTokensUsedRollup" END,
        "TotalCostRollup" = CASE WHEN p_data ? 'TotalCostRollup' THEN (p_data->>'TotalCostRollup')::DECIMAL(19, 8) ELSE "TotalCostRollup" END,
        "ConversationDetailID" = CASE WHEN p_data ? 'ConversationDetailID' THEN (p_data->>'ConversationDetailID')::UUID ELSE "ConversationDetailID" END,
        "ConversationDetailSequence" = CASE WHEN p_data ? 'ConversationDetailSequence' THEN (p_data->>'ConversationDetailSequence')::INTEGER ELSE "ConversationDetailSequence" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "FinalStep" = CASE WHEN p_data ? 'FinalStep' THEN (p_data->>'FinalStep') ELSE "FinalStep" END,
        "FinalPayload" = CASE WHEN p_data ? 'FinalPayload' THEN (p_data->>'FinalPayload') ELSE "FinalPayload" END,
        "Message" = CASE WHEN p_data ? 'Message' THEN (p_data->>'Message') ELSE "Message" END,
        "LastRunID" = CASE WHEN p_data ? 'LastRunID' THEN (p_data->>'LastRunID')::UUID ELSE "LastRunID" END,
        "StartingPayload" = CASE WHEN p_data ? 'StartingPayload' THEN (p_data->>'StartingPayload') ELSE "StartingPayload" END,
        "TotalPromptIterations" = CASE WHEN p_data ? 'TotalPromptIterations' THEN (p_data->>'TotalPromptIterations')::INTEGER ELSE "TotalPromptIterations" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "OverrideModelID" = CASE WHEN p_data ? 'OverrideModelID' THEN (p_data->>'OverrideModelID')::UUID ELSE "OverrideModelID" END,
        "OverrideVendorID" = CASE WHEN p_data ? 'OverrideVendorID' THEN (p_data->>'OverrideVendorID')::UUID ELSE "OverrideVendorID" END,
        "Data" = CASE WHEN p_data ? 'Data' THEN (p_data->>'Data') ELSE "Data" END,
        "Verbose" = CASE WHEN p_data ? 'Verbose' THEN (p_data->>'Verbose')::BOOLEAN ELSE "Verbose" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INTEGER ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "ScheduledJobRunID" = CASE WHEN p_data ? 'ScheduledJobRunID' THEN (p_data->>'ScheduledJobRunID')::UUID ELSE "ScheduledJobRunID" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "PrimaryScopeEntityID" = CASE WHEN p_data ? 'PrimaryScopeEntityID' THEN (p_data->>'PrimaryScopeEntityID')::UUID ELSE "PrimaryScopeEntityID" END,
        "PrimaryScopeRecordID" = CASE WHEN p_data ? 'PrimaryScopeRecordID' THEN (p_data->>'PrimaryScopeRecordID') ELSE "PrimaryScopeRecordID" END,
        "SecondaryScopes" = CASE WHEN p_data ? 'SecondaryScopes' THEN (p_data->>'SecondaryScopes') ELSE "SecondaryScopes" END,
        "ExternalReferenceID" = CASE WHEN p_data ? 'ExternalReferenceID' THEN (p_data->>'ExternalReferenceID') ELSE "ExternalReferenceID" END,
        "CompanyID" = CASE WHEN p_data ? 'CompanyID' THEN (p_data->>'CompanyID')::UUID ELSE "CompanyID" END,
        "LastHeartbeatAt" = CASE WHEN p_data ? 'LastHeartbeatAt' THEN (p_data->>'LastHeartbeatAt')::TIMESTAMPTZ ELSE "LastHeartbeatAt" END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_data ? 'TotalCacheReadTokensUsed' THEN (p_data->>'TotalCacheReadTokensUsed')::INTEGER ELSE "TotalCacheReadTokensUsed" END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_data ? 'TotalCacheWriteTokensUsed' THEN (p_data->>'TotalCacheWriteTokensUsed')::INTEGER ELSE "TotalCacheWriteTokensUsed" END,
        "AgentSessionID" = CASE WHEN p_data ? 'AgentSessionID' THEN (p_data->>'AgentSessionID')::UUID ELSE "AgentSessionID" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON __mj."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON __mj."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRun"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridge Participants
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_bridge_participant_session_br"
    ON __mj."AIAgentSessionBridgeParticipant" ("SessionBridgeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_bridge_participant_user_id"
    ON __mj."AIAgentSessionBridgeParticipant" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridge Participants
-- Item: vwAIAgentSessionBridgeParticipants
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Session Bridge Participants
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentSessionBridgeParticipant
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentSessionBridgeParticipants"
AS
SELECT
    a.*,
    MJAIAgentSessionBridge_SessionBridgeID."ExternalConnectionID" AS "SessionBridge",
    MJUser_UserID."Name" AS "User"
FROM
    __mj."AIAgentSessionBridgeParticipant" AS a
INNER JOIN
    __mj."AIAgentSessionBridge" AS MJAIAgentSessionBridge_SessionBridgeID
  ON
    "a"."SessionBridgeID" = MJAIAgentSessionBridge_SessionBridgeID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentSessionBridgeParticipants'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentSessionBridgeParticipants'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentSessionBridgeParticipants'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentSessionBridgeParticipants" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIAgentSessionBridgeParticipants" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentSessionBridgeParticipants" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentSessionBridgeParticipants" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridge Participants
-- Item: spCreateAIAgentSessionBridgeParticipant
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentSessionBridgeParticipant
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentSessionBridgeParticipant'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentSessionBridgeParticipant"(
    p_id uuid DEFAULT NULL,
    p_sessionbridgeid uuid DEFAULT NULL,
    p_externalparticipantid_clear boolean DEFAULT false,
    p_externalparticipantid text DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_isagent boolean DEFAULT NULL,
    p_joinedat_clear boolean DEFAULT false,
    p_joinedat timestamptz DEFAULT NULL,
    p_leftat_clear boolean DEFAULT false,
    p_leftat timestamptz DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSessionBridgeParticipants" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentSessionBridgeParticipant"
        (
            "ID",
            "SessionBridgeID",
                "ExternalParticipantID",
                "DisplayName",
                "Role",
                "UserID",
                "IsAgent",
                "JoinedAt",
                "LeftAt"
        )
    VALUES
        (
            v_new_id,
            p_sessionbridgeid,
                CASE WHEN p_externalparticipantid_clear = true THEN NULL ELSE COALESCE(p_externalparticipantid, NULL) END,
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                COALESCE(p_role, 'Participant'),
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                COALESCE(p_isagent, FALSE),
                CASE WHEN p_joinedat_clear = true THEN NULL ELSE COALESCE(p_joinedat, NULL) END,
                CASE WHEN p_leftat_clear = true THEN NULL ELSE COALESCE(p_leftat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSessionBridgeParticipants"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSessionBridgeParticipant" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSessionBridgeParticipant" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridge Participants
-- Item: spUpdateAIAgentSessionBridgeParticipant
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentSessionBridgeParticipant
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentSessionBridgeParticipant'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentSessionBridgeParticipant"(
    p_id uuid,
    p_sessionbridgeid uuid DEFAULT NULL,
    p_externalparticipantid_clear boolean DEFAULT false,
    p_externalparticipantid text DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_isagent boolean DEFAULT NULL,
    p_joinedat_clear boolean DEFAULT false,
    p_joinedat timestamptz DEFAULT NULL,
    p_leftat_clear boolean DEFAULT false,
    p_leftat timestamptz DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSessionBridgeParticipants" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentSessionBridgeParticipant"
    SET
        "SessionBridgeID" = COALESCE(p_sessionbridgeid, "SessionBridgeID"),
        "ExternalParticipantID" = CASE WHEN p_externalparticipantid_clear = true THEN NULL ELSE COALESCE(p_externalparticipantid, "ExternalParticipantID") END,
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "Role" = COALESCE(p_role, "Role"),
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "IsAgent" = COALESCE(p_isagent, "IsAgent"),
        "JoinedAt" = CASE WHEN p_joinedat_clear = true THEN NULL ELSE COALESCE(p_joinedat, "JoinedAt") END,
        "LeftAt" = CASE WHEN p_leftat_clear = true THEN NULL ELSE COALESCE(p_leftat, "LeftAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSessionBridgeParticipants"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSessionBridgeParticipant" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSessionBridgeParticipant" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSessionBridgeParticipant table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_session_bridge_participant"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_session_bridge_participant" ON __mj."AIAgentSessionBridgeParticipant";

CREATE TRIGGER "trg_update_ai_agent_session_bridge_participant"
BEFORE UPDATE ON __mj."AIAgentSessionBridgeParticipant"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_session_bridge_participant"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridge Participants
-- Item: spDeleteAIAgentSessionBridgeParticipant
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentSessionBridgeParticipant
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentSessionBridgeParticipant'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentSessionBridgeParticipant"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentSessionBridgeParticipant"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSessionBridgeParticipant" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSessionBridgeParticipant" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridges
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_bridge_agent_session_id"
    ON __mj."AIAgentSessionBridge" ("AgentSessionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_bridge_provider_id"
    ON __mj."AIAgentSessionBridge" ("ProviderID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridges
-- Item: vwAIAgentSessionBridges
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Session Bridges
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentSessionBridge
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentSessionBridges"
AS
SELECT
    a.*,
    MJAIBridgeProvider_ProviderID."Name" AS "Provider"
FROM
    __mj."AIAgentSessionBridge" AS a
INNER JOIN
    __mj."AIBridgeProvider" AS MJAIBridgeProvider_ProviderID
  ON
    "a"."ProviderID" = MJAIBridgeProvider_ProviderID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentSessionBridges'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentSessionBridges'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentSessionBridges'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentSessionBridges" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIAgentSessionBridges" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentSessionBridges" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentSessionBridges" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridges
-- Item: spCreateAIAgentSessionBridge
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentSessionBridge
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentSessionBridge'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentSessionBridge"(
    p_id uuid DEFAULT NULL,
    p_agentsessionid uuid DEFAULT NULL,
    p_providerid uuid DEFAULT NULL,
    p_direction text DEFAULT NULL,
    p_joinmethod text DEFAULT NULL,
    p_turnmode text DEFAULT NULL,
    p_externalconnectionid_clear boolean DEFAULT false,
    p_externalconnectionid text DEFAULT NULL,
    p_address_clear boolean DEFAULT false,
    p_address text DEFAULT NULL,
    p_botparticipantid_clear boolean DEFAULT false,
    p_botparticipantid text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_scheduledstarttime_clear boolean DEFAULT false,
    p_scheduledstarttime timestamptz DEFAULT NULL,
    p_connectedat_clear boolean DEFAULT false,
    p_connectedat timestamptz DEFAULT NULL,
    p_disconnectedat_clear boolean DEFAULT false,
    p_disconnectedat timestamptz DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason text DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid text DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSessionBridges" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentSessionBridge"
        (
            "ID",
            "AgentSessionID",
                "ProviderID",
                "Direction",
                "JoinMethod",
                "TurnMode",
                "ExternalConnectionID",
                "Address",
                "BotParticipantID",
                "Status",
                "ScheduledStartTime",
                "ConnectedAt",
                "DisconnectedAt",
                "CloseReason",
                "HostInstanceID",
                "Config"
        )
    VALUES
        (
            v_new_id,
            p_agentsessionid,
                p_providerid,
                COALESCE(p_direction, 'Outbound'),
                COALESCE(p_joinmethod, 'OnDemand'),
                COALESCE(p_turnmode, 'Passive'),
                CASE WHEN p_externalconnectionid_clear = true THEN NULL ELSE COALESCE(p_externalconnectionid, NULL) END,
                CASE WHEN p_address_clear = true THEN NULL ELSE COALESCE(p_address, NULL) END,
                CASE WHEN p_botparticipantid_clear = true THEN NULL ELSE COALESCE(p_botparticipantid, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_scheduledstarttime_clear = true THEN NULL ELSE COALESCE(p_scheduledstarttime, NULL) END,
                CASE WHEN p_connectedat_clear = true THEN NULL ELSE COALESCE(p_connectedat, NULL) END,
                CASE WHEN p_disconnectedat_clear = true THEN NULL ELSE COALESCE(p_disconnectedat, NULL) END,
                CASE WHEN p_closereason_clear = true THEN NULL ELSE COALESCE(p_closereason, NULL) END,
                CASE WHEN p_hostinstanceid_clear = true THEN NULL ELSE COALESCE(p_hostinstanceid, NULL) END,
                CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSessionBridges"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSessionBridge" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSessionBridge" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridges
-- Item: spUpdateAIAgentSessionBridge
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentSessionBridge
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentSessionBridge'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentSessionBridge"(
    p_id uuid,
    p_agentsessionid uuid DEFAULT NULL,
    p_providerid uuid DEFAULT NULL,
    p_direction text DEFAULT NULL,
    p_joinmethod text DEFAULT NULL,
    p_turnmode text DEFAULT NULL,
    p_externalconnectionid_clear boolean DEFAULT false,
    p_externalconnectionid text DEFAULT NULL,
    p_address_clear boolean DEFAULT false,
    p_address text DEFAULT NULL,
    p_botparticipantid_clear boolean DEFAULT false,
    p_botparticipantid text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_scheduledstarttime_clear boolean DEFAULT false,
    p_scheduledstarttime timestamptz DEFAULT NULL,
    p_connectedat_clear boolean DEFAULT false,
    p_connectedat timestamptz DEFAULT NULL,
    p_disconnectedat_clear boolean DEFAULT false,
    p_disconnectedat timestamptz DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason text DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid text DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSessionBridges" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentSessionBridge"
    SET
        "AgentSessionID" = COALESCE(p_agentsessionid, "AgentSessionID"),
        "ProviderID" = COALESCE(p_providerid, "ProviderID"),
        "Direction" = COALESCE(p_direction, "Direction"),
        "JoinMethod" = COALESCE(p_joinmethod, "JoinMethod"),
        "TurnMode" = COALESCE(p_turnmode, "TurnMode"),
        "ExternalConnectionID" = CASE WHEN p_externalconnectionid_clear = true THEN NULL ELSE COALESCE(p_externalconnectionid, "ExternalConnectionID") END,
        "Address" = CASE WHEN p_address_clear = true THEN NULL ELSE COALESCE(p_address, "Address") END,
        "BotParticipantID" = CASE WHEN p_botparticipantid_clear = true THEN NULL ELSE COALESCE(p_botparticipantid, "BotParticipantID") END,
        "Status" = COALESCE(p_status, "Status"),
        "ScheduledStartTime" = CASE WHEN p_scheduledstarttime_clear = true THEN NULL ELSE COALESCE(p_scheduledstarttime, "ScheduledStartTime") END,
        "ConnectedAt" = CASE WHEN p_connectedat_clear = true THEN NULL ELSE COALESCE(p_connectedat, "ConnectedAt") END,
        "DisconnectedAt" = CASE WHEN p_disconnectedat_clear = true THEN NULL ELSE COALESCE(p_disconnectedat, "DisconnectedAt") END,
        "CloseReason" = CASE WHEN p_closereason_clear = true THEN NULL ELSE COALESCE(p_closereason, "CloseReason") END,
        "HostInstanceID" = CASE WHEN p_hostinstanceid_clear = true THEN NULL ELSE COALESCE(p_hostinstanceid, "HostInstanceID") END,
        "Config" = CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, "Config") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSessionBridges"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSessionBridge" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSessionBridge" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSessionBridge table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_session_bridge"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_session_bridge" ON __mj."AIAgentSessionBridge";

CREATE TRIGGER "trg_update_ai_agent_session_bridge"
BEFORE UPDATE ON __mj."AIAgentSessionBridge"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_session_bridge"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridges
-- Item: spDeleteAIAgentSessionBridge
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentSessionBridge
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentSessionBridge'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentSessionBridge"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentSessionBridge"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSessionBridge" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSessionBridge" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_bridge_agent_identity_agent_id"
    ON __mj."AIBridgeAgentIdentity" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_bridge_agent_identity_provider_id"
    ON __mj."AIBridgeAgentIdentity" ("ProviderID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: vwAIBridgeAgentIdentities
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Bridge Agent Identities
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIBridgeAgentIdentity
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIBridgeAgentIdentities"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIBridgeProvider_ProviderID."Name" AS "Provider"
FROM
    __mj."AIBridgeAgentIdentity" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
INNER JOIN
    __mj."AIBridgeProvider" AS MJAIBridgeProvider_ProviderID
  ON
    "a"."ProviderID" = MJAIBridgeProvider_ProviderID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIBridgeAgentIdentities'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIBridgeAgentIdentities'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIBridgeAgentIdentities'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIBridgeAgentIdentities" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIBridgeAgentIdentities" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIBridgeAgentIdentities" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIBridgeAgentIdentities" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: spCreateAIBridgeAgentIdentity
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIBridgeAgentIdentity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIBridgeAgentIdentity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIBridgeAgentIdentity"(
    p_id uuid DEFAULT NULL,
    p_agentid uuid DEFAULT NULL,
    p_providerid uuid DEFAULT NULL,
    p_identitytype text DEFAULT NULL,
    p_identityvalue text DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname text DEFAULT NULL,
    p_isactive boolean DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIBridgeAgentIdentities" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIBridgeAgentIdentity"
        (
            "ID",
            "AgentID",
                "ProviderID",
                "IdentityType",
                "IdentityValue",
                "DisplayName",
                "IsActive",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_providerid,
                p_identitytype,
                p_identityvalue,
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                COALESCE(p_isactive, TRUE),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIBridgeAgentIdentities"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIBridgeAgentIdentity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIBridgeAgentIdentity" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: spUpdateAIBridgeAgentIdentity
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIBridgeAgentIdentity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIBridgeAgentIdentity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIBridgeAgentIdentity"(
    p_id uuid,
    p_agentid uuid DEFAULT NULL,
    p_providerid uuid DEFAULT NULL,
    p_identitytype text DEFAULT NULL,
    p_identityvalue text DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname text DEFAULT NULL,
    p_isactive boolean DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIBridgeAgentIdentities" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIBridgeAgentIdentity"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "ProviderID" = COALESCE(p_providerid, "ProviderID"),
        "IdentityType" = COALESCE(p_identitytype, "IdentityType"),
        "IdentityValue" = COALESCE(p_identityvalue, "IdentityValue"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "IsActive" = COALESCE(p_isactive, "IsActive"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIBridgeAgentIdentities"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIBridgeAgentIdentity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIBridgeAgentIdentity" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIBridgeAgentIdentity table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_bridge_agent_identity"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_bridge_agent_identity" ON __mj."AIBridgeAgentIdentity";

CREATE TRIGGER "trg_update_ai_bridge_agent_identity"
BEFORE UPDATE ON __mj."AIBridgeAgentIdentity"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_bridge_agent_identity"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: spDeleteAIBridgeAgentIdentity
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIBridgeAgentIdentity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIBridgeAgentIdentity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIBridgeAgentIdentity"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIBridgeAgentIdentity"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIBridgeAgentIdentity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIBridgeAgentIdentity" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Provider Channels
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_bridge_provider_channel_provider_id"
    ON __mj."AIBridgeProviderChannel" ("ProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_bridge_provider_channel_channel_id"
    ON __mj."AIBridgeProviderChannel" ("ChannelID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Provider Channels
-- Item: vwAIBridgeProviderChannels
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Bridge Provider Channels
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIBridgeProviderChannel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIBridgeProviderChannels"
AS
SELECT
    a.*,
    MJAIBridgeProvider_ProviderID."Name" AS "Provider",
    MJAIAgentChannel_ChannelID."Name" AS "Channel"
FROM
    __mj."AIBridgeProviderChannel" AS a
INNER JOIN
    __mj."AIBridgeProvider" AS MJAIBridgeProvider_ProviderID
  ON
    "a"."ProviderID" = MJAIBridgeProvider_ProviderID."ID"
INNER JOIN
    __mj."AIAgentChannel" AS MJAIAgentChannel_ChannelID
  ON
    "a"."ChannelID" = MJAIAgentChannel_ChannelID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIBridgeProviderChannels'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIBridgeProviderChannels'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIBridgeProviderChannels'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIBridgeProviderChannels" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIBridgeProviderChannels" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIBridgeProviderChannels" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIBridgeProviderChannels" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Provider Channels
-- Item: spCreateAIBridgeProviderChannel
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIBridgeProviderChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIBridgeProviderChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIBridgeProviderChannel"(
    p_id uuid DEFAULT NULL,
    p_providerid uuid DEFAULT NULL,
    p_channelid uuid DEFAULT NULL,
    p_isdefault boolean DEFAULT NULL,
    p_sequence integer DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIBridgeProviderChannels" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIBridgeProviderChannel"
        (
            "ID",
            "ProviderID",
                "ChannelID",
                "IsDefault",
                "Sequence",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            p_providerid,
                p_channelid,
                COALESCE(p_isdefault, TRUE),
                COALESCE(p_sequence, 0),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIBridgeProviderChannels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIBridgeProviderChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIBridgeProviderChannel" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Provider Channels
-- Item: spUpdateAIBridgeProviderChannel
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIBridgeProviderChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIBridgeProviderChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIBridgeProviderChannel"(
    p_id uuid,
    p_providerid uuid DEFAULT NULL,
    p_channelid uuid DEFAULT NULL,
    p_isdefault boolean DEFAULT NULL,
    p_sequence integer DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIBridgeProviderChannels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIBridgeProviderChannel"
    SET
        "ProviderID" = COALESCE(p_providerid, "ProviderID"),
        "ChannelID" = COALESCE(p_channelid, "ChannelID"),
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIBridgeProviderChannels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIBridgeProviderChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIBridgeProviderChannel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIBridgeProviderChannel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_bridge_provider_channel"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_bridge_provider_channel" ON __mj."AIBridgeProviderChannel";

CREATE TRIGGER "trg_update_ai_bridge_provider_channel"
BEFORE UPDATE ON __mj."AIBridgeProviderChannel"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_bridge_provider_channel"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Provider Channels
-- Item: spDeleteAIBridgeProviderChannel
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIBridgeProviderChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIBridgeProviderChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIBridgeProviderChannel"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIBridgeProviderChannel"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIBridgeProviderChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIBridgeProviderChannel" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Providers
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Providers
-- Item: vwAIBridgeProviders
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Bridge Providers
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIBridgeProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIBridgeProviders"
AS
SELECT
    a.*
FROM
    __mj."AIBridgeProvider" AS a
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIBridgeProviders'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIBridgeProviders'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIBridgeProviders'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIBridgeProviders" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIBridgeProviders" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIBridgeProviders" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIBridgeProviders" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Providers
-- Item: spCreateAIBridgeProvider
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIBridgeProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIBridgeProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIBridgeProvider"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_bridgetype text DEFAULT NULL,
    p_driverclass text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_supportedfeatures_clear boolean DEFAULT false,
    p_supportedfeatures text DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIBridgeProviders" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIBridgeProvider"
        (
            "ID",
            "Name",
                "Description",
                "BridgeType",
                "DriverClass",
                "Status",
                "SupportedFeatures",
                "ConfigSchema",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_bridgetype, 'Meeting'),
                p_driverclass,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_supportedfeatures_clear = true THEN NULL ELSE COALESCE(p_supportedfeatures, NULL) END,
                CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIBridgeProviders"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIBridgeProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIBridgeProvider" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Providers
-- Item: spUpdateAIBridgeProvider
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIBridgeProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIBridgeProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIBridgeProvider"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_bridgetype text DEFAULT NULL,
    p_driverclass text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_supportedfeatures_clear boolean DEFAULT false,
    p_supportedfeatures text DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIBridgeProviders" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIBridgeProvider"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "BridgeType" = COALESCE(p_bridgetype, "BridgeType"),
        "DriverClass" = COALESCE(p_driverclass, "DriverClass"),
        "Status" = COALESCE(p_status, "Status"),
        "SupportedFeatures" = CASE WHEN p_supportedfeatures_clear = true THEN NULL ELSE COALESCE(p_supportedfeatures, "SupportedFeatures") END,
        "ConfigSchema" = CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, "ConfigSchema") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIBridgeProviders"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIBridgeProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIBridgeProvider" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIBridgeProvider table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_bridge_provider"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_bridge_provider" ON __mj."AIBridgeProvider";

CREATE TRIGGER "trg_update_ai_bridge_provider"
BEFORE UPDATE ON __mj."AIBridgeProvider"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_bridge_provider"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Providers
-- Item: spDeleteAIBridgeProvider
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIBridgeProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIBridgeProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIBridgeProvider"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIBridgeProvider"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIBridgeProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIBridgeProvider" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Ratings
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_rating_conversation_detail"
    ON __mj."ConversationDetailRating" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_rating_user_id"
    ON __mj."ConversationDetailRating" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Ratings
-- Item: vwConversationDetailRatings
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Ratings
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetailRating
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailRatings"
AS
SELECT
    c.*,
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJUser_UserID."Name" AS "User"
FROM
    __mj."ConversationDetailRating" AS c
INNER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "c"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
INNER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "c"."UserID" = MJUser_UserID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationDetailRatings'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationDetailRatings'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwConversationDetailRatings'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversationDetailRatings" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwConversationDetailRatings" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationDetailRatings" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationDetailRatings" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Ratings
-- Item: spCreateConversationDetailRating
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationDetailRating
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationDetailRating'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailRating"(
    p_id uuid DEFAULT NULL,
    p_conversationdetailid uuid DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_rating integer DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetailRatings" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationDetailRating"
        (
            "ID",
            "ConversationDetailID",
                "UserID",
                "Rating",
                "Comments"
        )
    VALUES
        (
            v_new_id,
            p_conversationdetailid,
                p_userid,
                p_rating,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetailRatings"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailRating" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailRating" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailRating" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Ratings
-- Item: spUpdateConversationDetailRating
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationDetailRating
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationDetailRating'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailRating"(
    p_id uuid,
    p_conversationdetailid uuid DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_rating integer DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetailRatings" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationDetailRating"
    SET
        "ConversationDetailID" = COALESCE(p_conversationdetailid, "ConversationDetailID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "Rating" = COALESCE(p_rating, "Rating"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetailRatings"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailRating" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailRating" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailRating" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetailRating table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation_detail_rating"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_detail_rating" ON __mj."ConversationDetailRating";

CREATE TRIGGER "trg_update_conversation_detail_rating"
BEFORE UPDATE ON __mj."ConversationDetailRating"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation_detail_rating"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Ratings
-- Item: spDeleteConversationDetailRating
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationDetailRating
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationDetailRating'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailRating"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ConversationDetailRating"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailRating" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailRating" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_attachment_conversation_de"
    ON __mj."ConversationDetailAttachment" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_attachment_modality_id"
    ON __mj."ConversationDetailAttachment" ("ModalityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_attachment_file_id"
    ON __mj."ConversationDetailAttachment" ("FileID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_attachment_artifact_versio"
    ON __mj."ConversationDetailAttachment" ("ArtifactVersionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: vwConversationDetailAttachments
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Attachments
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetailAttachment
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailAttachments"
AS
SELECT
    c.*,
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJAIModality_ModalityID."Name" AS "Modality",
    MJFile_FileID."Name" AS "File",
    MJArtifactVersion_ArtifactVersionID."Name" AS "ArtifactVersion"
FROM
    __mj."ConversationDetailAttachment" AS c
INNER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "c"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
INNER JOIN
    __mj."AIModality" AS MJAIModality_ModalityID
  ON
    "c"."ModalityID" = MJAIModality_ModalityID."ID"
LEFT OUTER JOIN
    __mj."File" AS MJFile_FileID
  ON
    "c"."FileID" = MJFile_FileID."ID"
LEFT OUTER JOIN
    __mj."ArtifactVersion" AS MJArtifactVersion_ArtifactVersionID
  ON
    "c"."ArtifactVersionID" = MJArtifactVersion_ArtifactVersionID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationDetailAttachments'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationDetailAttachments'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwConversationDetailAttachments'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversationDetailAttachments" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: spCreateConversationDetailAttachment
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationDetailAttachment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationDetailAttachment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailAttachment"(
    p_id uuid DEFAULT NULL,
    p_conversationdetailid uuid DEFAULT NULL,
    p_modalityid uuid DEFAULT NULL,
    p_mimetype text DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename text DEFAULT NULL,
    p_filesizebytes integer DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width integer DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height integer DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds integer DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata text DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid uuid DEFAULT NULL,
    p_displayorder integer DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetailAttachments" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationDetailAttachment"
        (
            "ID",
            "ConversationDetailID",
                "ModalityID",
                "MimeType",
                "FileName",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "InlineData",
                "FileID",
                "DisplayOrder",
                "ThumbnailBase64",
                "Description",
                "ArtifactVersionID"
        )
    VALUES
        (
            v_new_id,
            p_conversationdetailid,
                p_modalityid,
                p_mimetype,
                CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, NULL) END,
                p_filesizebytes,
                CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, NULL) END,
                CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, NULL) END,
                CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, NULL) END,
                CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END,
                COALESCE(p_displayorder, 0),
                CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_artifactversionid_clear = true THEN NULL ELSE COALESCE(p_artifactversionid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetailAttachments"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: spUpdateConversationDetailAttachment
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationDetailAttachment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationDetailAttachment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailAttachment"(
    p_id uuid,
    p_conversationdetailid uuid DEFAULT NULL,
    p_modalityid uuid DEFAULT NULL,
    p_mimetype text DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename text DEFAULT NULL,
    p_filesizebytes integer DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width integer DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height integer DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds integer DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata text DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid uuid DEFAULT NULL,
    p_displayorder integer DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetailAttachments" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationDetailAttachment"
    SET
        "ConversationDetailID" = COALESCE(p_conversationdetailid, "ConversationDetailID"),
        "ModalityID" = COALESCE(p_modalityid, "ModalityID"),
        "MimeType" = COALESCE(p_mimetype, "MimeType"),
        "FileName" = CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, "FileName") END,
        "FileSizeBytes" = COALESCE(p_filesizebytes, "FileSizeBytes"),
        "Width" = CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, "Width") END,
        "Height" = CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, "Height") END,
        "DurationSeconds" = CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, "DurationSeconds") END,
        "InlineData" = CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, "InlineData") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END,
        "DisplayOrder" = COALESCE(p_displayorder, "DisplayOrder"),
        "ThumbnailBase64" = CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, "ThumbnailBase64") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ArtifactVersionID" = CASE WHEN p_artifactversionid_clear = true THEN NULL ELSE COALESCE(p_artifactversionid, "ArtifactVersionID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetailAttachments"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetailAttachment table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation_detail_attachment"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_detail_attachment" ON __mj."ConversationDetailAttachment";

CREATE TRIGGER "trg_update_conversation_detail_attachment"
BEFORE UPDATE ON __mj."ConversationDetailAttachment"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation_detail_attachment"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: spDeleteConversationDetailAttachment
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationDetailAttachment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationDetailAttachment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailAttachment"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ConversationDetailAttachment"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Artifacts
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_conversation_deta"
    ON __mj."ConversationDetailArtifact" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_artifact_version_"
    ON __mj."ConversationDetailArtifact" ("ArtifactVersionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Artifacts
-- Item: vwConversationDetailArtifacts
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Artifacts
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetailArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailArtifacts"
AS
SELECT
    c.*,
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJArtifactVersion_ArtifactVersionID."Name" AS "ArtifactVersion"
FROM
    __mj."ConversationDetailArtifact" AS c
INNER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "c"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
INNER JOIN
    __mj."ArtifactVersion" AS MJArtifactVersion_ArtifactVersionID
  ON
    "c"."ArtifactVersionID" = MJArtifactVersion_ArtifactVersionID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationDetailArtifacts'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationDetailArtifacts'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwConversationDetailArtifacts'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversationDetailArtifacts" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwConversationDetailArtifacts" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationDetailArtifacts" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationDetailArtifacts" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Artifacts
-- Item: spCreateConversationDetailArtifact
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationDetailArtifact
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationDetailArtifact'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailArtifact"(
    p_id uuid DEFAULT NULL,
    p_conversationdetailid uuid DEFAULT NULL,
    p_artifactversionid uuid DEFAULT NULL,
    p_direction text DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetailArtifacts" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationDetailArtifact"
        (
            "ID",
            "ConversationDetailID",
                "ArtifactVersionID",
                "Direction"
        )
    VALUES
        (
            v_new_id,
            p_conversationdetailid,
                p_artifactversionid,
                COALESCE(p_direction, 'Output')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetailArtifacts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailArtifact" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailArtifact" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailArtifact" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Artifacts
-- Item: spUpdateConversationDetailArtifact
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationDetailArtifact
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationDetailArtifact'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailArtifact"(
    p_id uuid,
    p_conversationdetailid uuid DEFAULT NULL,
    p_artifactversionid uuid DEFAULT NULL,
    p_direction text DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetailArtifacts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationDetailArtifact"
    SET
        "ConversationDetailID" = COALESCE(p_conversationdetailid, "ConversationDetailID"),
        "ArtifactVersionID" = COALESCE(p_artifactversionid, "ArtifactVersionID"),
        "Direction" = COALESCE(p_direction, "Direction")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetailArtifacts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailArtifact" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailArtifact" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailArtifact" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetailArtifact table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation_detail_artifact"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_detail_artifact" ON __mj."ConversationDetailArtifact";

CREATE TRIGGER "trg_update_conversation_detail_artifact"
BEFORE UPDATE ON __mj."ConversationDetailArtifact"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation_detail_artifact"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Artifacts
-- Item: spDeleteConversationDetailArtifact
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationDetailArtifact
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationDetailArtifact'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailArtifact"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ConversationDetailArtifact"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailArtifact" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailArtifact" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_conversation_id"
    ON __mj."ConversationDetail" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_user_id"
    ON __mj."ConversationDetail" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_id"
    ON __mj."ConversationDetail" ("ArtifactID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_version_id"
    ON __mj."ConversationDetail" ("ArtifactVersionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_parent_id"
    ON __mj."ConversationDetail" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_agent_id"
    ON __mj."ConversationDetail" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_test_run_id"
    ON __mj."ConversationDetail" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_agent_session_id"
    ON __mj."ConversationDetail" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: fnConversationDetailParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ConversationDetail.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_conversation_detail_parent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."ConversationDetail"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."ConversationDetail" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: vwConversationDetails
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Details
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetails"
AS
SELECT
    c.*,
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationArtifact_ArtifactID."Name" AS "Artifact",
    MJConversationArtifactVersion_ArtifactVersionID."ConversationArtifact" AS "ArtifactVersion",
    MJConversationDetail_ParentID."ExternalID" AS "Parent",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJTestRun_TestRunID."Test" AS "TestRun",
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."ConversationDetail" AS c
INNER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "c"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "c"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."ConversationArtifact" AS MJConversationArtifact_ArtifactID
  ON
    "c"."ArtifactID" = MJConversationArtifact_ArtifactID."ID"
LEFT OUTER JOIN
    __mj."vwConversationArtifactVersions" AS MJConversationArtifactVersion_ArtifactVersionID
  ON
    "c"."ArtifactVersionID" = MJConversationArtifactVersion_ArtifactVersionID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ParentID
  ON
    "c"."ParentID" = MJConversationDetail_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "c"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "c"."TestRunID" = MJTestRun_TestRunID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_conversation_detail_parent_id_get_root_id"(c."ID", c."ParentID") AS root_id
) AS root_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationDetails'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationDetails'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwConversationDetails'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversationDetails" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: spCreateConversationDetail
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetail"(
    p_id uuid DEFAULT NULL,
    p_conversationid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_error_clear boolean DEFAULT false,
    p_error text DEFAULT NULL,
    p_hiddentouser BOOLEAN DEFAULT NULL,
    p_userrating_clear boolean DEFAULT false,
    p_userrating integer DEFAULT NULL,
    p_userfeedback_clear boolean DEFAULT false,
    p_userfeedback text DEFAULT NULL,
    p_reflectioninsights_clear boolean DEFAULT false,
    p_reflectioninsights text DEFAULT NULL,
    p_summaryofearlierconversation_clear boolean DEFAULT false,
    p_summaryofearlierconversation text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_artifactid_clear boolean DEFAULT false,
    p_artifactid uuid DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL,
    p_completiontime_clear boolean DEFAULT false,
    p_completiontime bigint DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_suggestedresponses_clear boolean DEFAULT false,
    p_suggestedresponses text DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_responseform_clear boolean DEFAULT false,
    p_responseform text DEFAULT NULL,
    p_actionablecommands_clear boolean DEFAULT false,
    p_actionablecommands text DEFAULT NULL,
    p_automaticcommands_clear boolean DEFAULT false,
    p_automaticcommands text DEFAULT NULL,
    p_originalmessagechanged BOOLEAN DEFAULT NULL,
    p_agentsessionid_clear boolean DEFAULT false,
    p_agentsessionid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetails" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationDetail"
        (
            "ID",
            "ConversationID",
                "ExternalID",
                "Role",
                "Message",
                "Error",
                "HiddenToUser",
                "UserRating",
                "UserFeedback",
                "ReflectionInsights",
                "SummaryOfEarlierConversation",
                "UserID",
                "ArtifactID",
                "ArtifactVersionID",
                "CompletionTime",
                "IsPinned",
                "ParentID",
                "AgentID",
                "Status",
                "SuggestedResponses",
                "TestRunID",
                "ResponseForm",
                "ActionableCommands",
                "AutomaticCommands",
                "OriginalMessageChanged",
                "AgentSessionID"
        )
    VALUES
        (
            v_new_id,
            p_conversationid,
                CASE WHEN p_externalid_clear = true THEN NULL ELSE COALESCE(p_externalid, NULL) END,
                COALESCE(p_role, 'current_user'),
                p_message,
                CASE WHEN p_error_clear = true THEN NULL ELSE COALESCE(p_error, NULL) END,
                COALESCE(p_hiddentouser, FALSE),
                CASE WHEN p_userrating_clear = true THEN NULL ELSE COALESCE(p_userrating, NULL) END,
                CASE WHEN p_userfeedback_clear = true THEN NULL ELSE COALESCE(p_userfeedback, NULL) END,
                CASE WHEN p_reflectioninsights_clear = true THEN NULL ELSE COALESCE(p_reflectioninsights, NULL) END,
                CASE WHEN p_summaryofearlierconversation_clear = true THEN NULL ELSE COALESCE(p_summaryofearlierconversation, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_artifactid_clear = true THEN NULL ELSE COALESCE(p_artifactid, NULL) END,
                CASE WHEN p_artifactversionid_clear = true THEN NULL ELSE COALESCE(p_artifactversionid, NULL) END,
                CASE WHEN p_completiontime_clear = true THEN NULL ELSE COALESCE(p_completiontime, NULL) END,
                COALESCE(p_ispinned, FALSE),
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                COALESCE(p_status, 'Complete'),
                CASE WHEN p_suggestedresponses_clear = true THEN NULL ELSE COALESCE(p_suggestedresponses, NULL) END,
                CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, NULL) END,
                CASE WHEN p_responseform_clear = true THEN NULL ELSE COALESCE(p_responseform, NULL) END,
                CASE WHEN p_actionablecommands_clear = true THEN NULL ELSE COALESCE(p_actionablecommands, NULL) END,
                CASE WHEN p_automaticcommands_clear = true THEN NULL ELSE COALESCE(p_automaticcommands, NULL) END,
                COALESCE(p_originalmessagechanged, FALSE),
                CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: spUpdateConversationDetail
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetail"(
    p_id uuid,
    p_conversationid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_error_clear boolean DEFAULT false,
    p_error text DEFAULT NULL,
    p_hiddentouser BOOLEAN DEFAULT NULL,
    p_userrating_clear boolean DEFAULT false,
    p_userrating integer DEFAULT NULL,
    p_userfeedback_clear boolean DEFAULT false,
    p_userfeedback text DEFAULT NULL,
    p_reflectioninsights_clear boolean DEFAULT false,
    p_reflectioninsights text DEFAULT NULL,
    p_summaryofearlierconversation_clear boolean DEFAULT false,
    p_summaryofearlierconversation text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_artifactid_clear boolean DEFAULT false,
    p_artifactid uuid DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL,
    p_completiontime_clear boolean DEFAULT false,
    p_completiontime bigint DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_suggestedresponses_clear boolean DEFAULT false,
    p_suggestedresponses text DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_responseform_clear boolean DEFAULT false,
    p_responseform text DEFAULT NULL,
    p_actionablecommands_clear boolean DEFAULT false,
    p_actionablecommands text DEFAULT NULL,
    p_automaticcommands_clear boolean DEFAULT false,
    p_automaticcommands text DEFAULT NULL,
    p_originalmessagechanged BOOLEAN DEFAULT NULL,
    p_agentsessionid_clear boolean DEFAULT false,
    p_agentsessionid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationDetail"
    SET
        "ConversationID" = COALESCE(p_conversationid, "ConversationID"),
        "ExternalID" = CASE WHEN p_externalid_clear = true THEN NULL ELSE COALESCE(p_externalid, "ExternalID") END,
        "Role" = COALESCE(p_role, "Role"),
        "Message" = COALESCE(p_message, "Message"),
        "Error" = CASE WHEN p_error_clear = true THEN NULL ELSE COALESCE(p_error, "Error") END,
        "HiddenToUser" = COALESCE(p_hiddentouser, "HiddenToUser"),
        "UserRating" = CASE WHEN p_userrating_clear = true THEN NULL ELSE COALESCE(p_userrating, "UserRating") END,
        "UserFeedback" = CASE WHEN p_userfeedback_clear = true THEN NULL ELSE COALESCE(p_userfeedback, "UserFeedback") END,
        "ReflectionInsights" = CASE WHEN p_reflectioninsights_clear = true THEN NULL ELSE COALESCE(p_reflectioninsights, "ReflectionInsights") END,
        "SummaryOfEarlierConversation" = CASE WHEN p_summaryofearlierconversation_clear = true THEN NULL ELSE COALESCE(p_summaryofearlierconversation, "SummaryOfEarlierConversation") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "ArtifactID" = CASE WHEN p_artifactid_clear = true THEN NULL ELSE COALESCE(p_artifactid, "ArtifactID") END,
        "ArtifactVersionID" = CASE WHEN p_artifactversionid_clear = true THEN NULL ELSE COALESCE(p_artifactversionid, "ArtifactVersionID") END,
        "CompletionTime" = CASE WHEN p_completiontime_clear = true THEN NULL ELSE COALESCE(p_completiontime, "CompletionTime") END,
        "IsPinned" = COALESCE(p_ispinned, "IsPinned"),
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "Status" = COALESCE(p_status, "Status"),
        "SuggestedResponses" = CASE WHEN p_suggestedresponses_clear = true THEN NULL ELSE COALESCE(p_suggestedresponses, "SuggestedResponses") END,
        "TestRunID" = CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, "TestRunID") END,
        "ResponseForm" = CASE WHEN p_responseform_clear = true THEN NULL ELSE COALESCE(p_responseform, "ResponseForm") END,
        "ActionableCommands" = CASE WHEN p_actionablecommands_clear = true THEN NULL ELSE COALESCE(p_actionablecommands, "ActionableCommands") END,
        "AutomaticCommands" = CASE WHEN p_automaticcommands_clear = true THEN NULL ELSE COALESCE(p_automaticcommands, "AutomaticCommands") END,
        "OriginalMessageChanged" = COALESCE(p_originalmessagechanged, "OriginalMessageChanged"),
        "AgentSessionID" = CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, "AgentSessionID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_detail" ON __mj."ConversationDetail";

CREATE TRIGGER "trg_update_conversation_detail"
BEFORE UPDATE ON __mj."ConversationDetail"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation_detail"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetail"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Artifacts records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetailArtifact"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetailArtifact"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Attachments records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetailAttachment"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetailAttachment"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Ratings records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetailRating"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetailRating"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Reports.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Report"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Report"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Task"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Task"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."ConversationDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Reports
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_category_id"
    ON __mj."Report" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_user_id"
    ON __mj."Report" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_conversation_id"
    ON __mj."Report" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_conversation_detail_id"
    ON __mj."Report" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_data_context_id"
    ON __mj."Report" ("DataContextID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_output_trigger_type_id"
    ON __mj."Report" ("OutputTriggerTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_output_format_type_id"
    ON __mj."Report" ("OutputFormatTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_output_delivery_type_id"
    ON __mj."Report" ("OutputDeliveryTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_output_workflow_id"
    ON __mj."Report" ("OutputWorkflowID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_report_environment_id"
    ON __mj."Report" ("EnvironmentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Reports
-- Item: vwReports
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Reports
-----               SCHEMA:      __mj
-----               BASE TABLE:  Report
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwReports"
AS
SELECT
    r.*,
    MJReportCategory_CategoryID."Name" AS "Category",
    MJUser_UserID."Name" AS "User",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJDataContext_DataContextID."Name" AS "DataContext",
    MJOutputTriggerType_OutputTriggerTypeID."Name" AS "OutputTriggerType",
    MJOutputFormatType_OutputFormatTypeID."Name" AS "OutputFormatType",
    MJOutputDeliveryType_OutputDeliveryTypeID."Name" AS "OutputDeliveryType",
    MJWorkflow_OutputWorkflowID."Name" AS "OutputWorkflow",
    MJEnvironment_EnvironmentID."Name" AS "Environment"
FROM
    __mj."Report" AS r
LEFT OUTER JOIN
    __mj."ReportCategory" AS MJReportCategory_CategoryID
  ON
    "r"."CategoryID" = MJReportCategory_CategoryID."ID"
INNER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "r"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "r"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "r"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."DataContext" AS MJDataContext_DataContextID
  ON
    "r"."DataContextID" = MJDataContext_DataContextID."ID"
LEFT OUTER JOIN
    __mj."OutputTriggerType" AS MJOutputTriggerType_OutputTriggerTypeID
  ON
    "r"."OutputTriggerTypeID" = MJOutputTriggerType_OutputTriggerTypeID."ID"
LEFT OUTER JOIN
    __mj."OutputFormatType" AS MJOutputFormatType_OutputFormatTypeID
  ON
    "r"."OutputFormatTypeID" = MJOutputFormatType_OutputFormatTypeID."ID"
LEFT OUTER JOIN
    __mj."OutputDeliveryType" AS MJOutputDeliveryType_OutputDeliveryTypeID
  ON
    "r"."OutputDeliveryTypeID" = MJOutputDeliveryType_OutputDeliveryTypeID."ID"
LEFT OUTER JOIN
    __mj."Workflow" AS MJWorkflow_OutputWorkflowID
  ON
    "r"."OutputWorkflowID" = MJWorkflow_OutputWorkflowID."ID"
INNER JOIN
    __mj."Environment" AS MJEnvironment_EnvironmentID
  ON
    "r"."EnvironmentID" = MJEnvironment_EnvironmentID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwReports'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwReports'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwReports'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwReports" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwReports" TO "cdp_Developer";
GRANT SELECT ON __mj."vwReports" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Reports
-- Item: spCreateReport
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Report
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateReport'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateReport"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid uuid DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_sharingscope text DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid uuid DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid uuid DEFAULT NULL,
    p_datacontextid_clear boolean DEFAULT false,
    p_datacontextid uuid DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL,
    p_outputtriggertypeid_clear boolean DEFAULT false,
    p_outputtriggertypeid uuid DEFAULT NULL,
    p_outputformattypeid_clear boolean DEFAULT false,
    p_outputformattypeid uuid DEFAULT NULL,
    p_outputdeliverytypeid_clear boolean DEFAULT false,
    p_outputdeliverytypeid uuid DEFAULT NULL,
    p_outputfrequency_clear boolean DEFAULT false,
    p_outputfrequency text DEFAULT NULL,
    p_outputtargetemail_clear boolean DEFAULT false,
    p_outputtargetemail text DEFAULT NULL,
    p_outputworkflowid_clear boolean DEFAULT false,
    p_outputworkflowid uuid DEFAULT NULL,
    p_thumbnail_clear boolean DEFAULT false,
    p_thumbnail text DEFAULT NULL,
    p_environmentid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwReports" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Report"
        (
            "ID",
            "Name",
                "Description",
                "CategoryID",
                "UserID",
                "SharingScope",
                "ConversationID",
                "ConversationDetailID",
                "DataContextID",
                "Configuration",
                "OutputTriggerTypeID",
                "OutputFormatTypeID",
                "OutputDeliveryTypeID",
                "OutputFrequency",
                "OutputTargetEmail",
                "OutputWorkflowID",
                "Thumbnail",
                "EnvironmentID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                p_userid,
                COALESCE(p_sharingscope, 'Personal'),
                CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, NULL) END,
                CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, NULL) END,
                CASE WHEN p_datacontextid_clear = true THEN NULL ELSE COALESCE(p_datacontextid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_outputtriggertypeid_clear = true THEN NULL ELSE COALESCE(p_outputtriggertypeid, NULL) END,
                CASE WHEN p_outputformattypeid_clear = true THEN NULL ELSE COALESCE(p_outputformattypeid, NULL) END,
                CASE WHEN p_outputdeliverytypeid_clear = true THEN NULL ELSE COALESCE(p_outputdeliverytypeid, NULL) END,
                CASE WHEN p_outputfrequency_clear = true THEN NULL ELSE COALESCE(p_outputfrequency, NULL) END,
                CASE WHEN p_outputtargetemail_clear = true THEN NULL ELSE COALESCE(p_outputtargetemail, NULL) END,
                CASE WHEN p_outputworkflowid_clear = true THEN NULL ELSE COALESCE(p_outputworkflowid, NULL) END,
                CASE WHEN p_thumbnail_clear = true THEN NULL ELSE COALESCE(p_thumbnail, NULL) END,
                COALESCE(p_environmentid, 'F51358F3-9447-4176-B313-BF8025FD8D09')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwReports"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateReport" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateReport" TO "cdp_UI";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Reports
-- Item: spUpdateReport
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Report
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateReport'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateReport"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid uuid DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_sharingscope text DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid uuid DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid uuid DEFAULT NULL,
    p_datacontextid_clear boolean DEFAULT false,
    p_datacontextid uuid DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL,
    p_outputtriggertypeid_clear boolean DEFAULT false,
    p_outputtriggertypeid uuid DEFAULT NULL,
    p_outputformattypeid_clear boolean DEFAULT false,
    p_outputformattypeid uuid DEFAULT NULL,
    p_outputdeliverytypeid_clear boolean DEFAULT false,
    p_outputdeliverytypeid uuid DEFAULT NULL,
    p_outputfrequency_clear boolean DEFAULT false,
    p_outputfrequency text DEFAULT NULL,
    p_outputtargetemail_clear boolean DEFAULT false,
    p_outputtargetemail text DEFAULT NULL,
    p_outputworkflowid_clear boolean DEFAULT false,
    p_outputworkflowid uuid DEFAULT NULL,
    p_thumbnail_clear boolean DEFAULT false,
    p_thumbnail text DEFAULT NULL,
    p_environmentid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwReports" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Report"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "UserID" = COALESCE(p_userid, "UserID"),
        "SharingScope" = COALESCE(p_sharingscope, "SharingScope"),
        "ConversationID" = CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, "ConversationID") END,
        "ConversationDetailID" = CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, "ConversationDetailID") END,
        "DataContextID" = CASE WHEN p_datacontextid_clear = true THEN NULL ELSE COALESCE(p_datacontextid, "DataContextID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "OutputTriggerTypeID" = CASE WHEN p_outputtriggertypeid_clear = true THEN NULL ELSE COALESCE(p_outputtriggertypeid, "OutputTriggerTypeID") END,
        "OutputFormatTypeID" = CASE WHEN p_outputformattypeid_clear = true THEN NULL ELSE COALESCE(p_outputformattypeid, "OutputFormatTypeID") END,
        "OutputDeliveryTypeID" = CASE WHEN p_outputdeliverytypeid_clear = true THEN NULL ELSE COALESCE(p_outputdeliverytypeid, "OutputDeliveryTypeID") END,
        "OutputFrequency" = CASE WHEN p_outputfrequency_clear = true THEN NULL ELSE COALESCE(p_outputfrequency, "OutputFrequency") END,
        "OutputTargetEmail" = CASE WHEN p_outputtargetemail_clear = true THEN NULL ELSE COALESCE(p_outputtargetemail, "OutputTargetEmail") END,
        "OutputWorkflowID" = CASE WHEN p_outputworkflowid_clear = true THEN NULL ELSE COALESCE(p_outputworkflowid, "OutputWorkflowID") END,
        "Thumbnail" = CASE WHEN p_thumbnail_clear = true THEN NULL ELSE COALESCE(p_thumbnail, "Thumbnail") END,
        "EnvironmentID" = COALESCE(p_environmentid, "EnvironmentID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwReports"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateReport" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateReport" TO "cdp_UI";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Report table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_report"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_report" ON __mj."Report";

CREATE TRIGGER "trg_update_report"
BEFORE UPDATE ON __mj."Report"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_report"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Reports
-- Item: spDeleteReport
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Report
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteReport'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteReport"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: Report Snapshots records via ReportID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ReportSnapshot"
        WHERE "ReportID" = p_id
    LOOP
        PERFORM __mj."spDeleteReportSnapshot"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Report User States records via ReportID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ReportUserState"
        WHERE "ReportID" = p_id
    LOOP
        PERFORM __mj."spDeleteReportUserState"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Report Versions records via ReportID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ReportVersion"
        WHERE "ReportID" = p_id
    LOOP
        PERFORM __mj."spDeleteReportVersion"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."Report"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteReport" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteReport" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_task_parent_id"
    ON __mj."Task" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_task_type_id"
    ON __mj."Task" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_task_environment_id"
    ON __mj."Task" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_task_project_id"
    ON __mj."Task" ("ProjectID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_task_conversation_detail_id"
    ON __mj."Task" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_task_user_id"
    ON __mj."Task" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_task_agent_id"
    ON __mj."Task" ("AgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: fnTaskParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: Task.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_task_parent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."Task"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."Task" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: vwTasks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tasks
-----               SCHEMA:      __mj
-----               BASE TABLE:  Task
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTasks"
AS
SELECT
    t.*,
    MJTask_ParentID."Name" AS "Parent",
    MJTaskType_TypeID."Name" AS "Type",
    MJEnvironment_EnvironmentID."Name" AS "Environment",
    MJProject_ProjectID."Name" AS "Project",
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJUser_UserID."Name" AS "User",
    MJAIAgent_AgentID."Name" AS "Agent",
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."Task" AS t
LEFT OUTER JOIN
    __mj."Task" AS MJTask_ParentID
  ON
    "t"."ParentID" = MJTask_ParentID."ID"
INNER JOIN
    __mj."TaskType" AS MJTaskType_TypeID
  ON
    "t"."TypeID" = MJTaskType_TypeID."ID"
INNER JOIN
    __mj."Environment" AS MJEnvironment_EnvironmentID
  ON
    "t"."EnvironmentID" = MJEnvironment_EnvironmentID."ID"
LEFT OUTER JOIN
    __mj."Project" AS MJProject_ProjectID
  ON
    "t"."ProjectID" = MJProject_ProjectID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "t"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "t"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "t"."AgentID" = MJAIAgent_AgentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_task_parent_id_get_root_id"(t."ID", t."ParentID") AS root_id
) AS root_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwTasks'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwTasks'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwTasks'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwTasks" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwTasks" TO "cdp_UI";
GRANT SELECT ON __mj."vwTasks" TO "cdp_Developer";
GRANT SELECT ON __mj."vwTasks" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: spCreateTask
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Task
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTask'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateTask"(
    p_id uuid DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_typeid uuid DEFAULT NULL,
    p_environmentid uuid DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid uuid DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_percentcomplete_clear boolean DEFAULT false,
    p_percentcomplete integer DEFAULT NULL,
    p_dueat_clear boolean DEFAULT false,
    p_dueat TIMESTAMPTZ DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF __mj."vwTasks" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Task"
        (
            "ID",
            "ParentID",
                "Name",
                "Description",
                "TypeID",
                "EnvironmentID",
                "ProjectID",
                "ConversationDetailID",
                "UserID",
                "AgentID",
                "Status",
                "PercentComplete",
                "DueAt",
                "StartedAt",
                "CompletedAt"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_typeid,
                COALESCE(p_environmentid, 'F51358F3-9447-4176-B313-BF8025FD8D09'),
                CASE WHEN p_projectid_clear = true THEN NULL ELSE COALESCE(p_projectid, NULL) END,
                CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_percentcomplete_clear = true THEN NULL ELSE COALESCE(p_percentcomplete, 0) END,
                CASE WHEN p_dueat_clear = true THEN NULL ELSE COALESCE(p_dueat, NULL) END,
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwTasks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateTask" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: spUpdateTask
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Task
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTask'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateTask"(
    p_id uuid,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_typeid uuid DEFAULT NULL,
    p_environmentid uuid DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid uuid DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_percentcomplete_clear boolean DEFAULT false,
    p_percentcomplete integer DEFAULT NULL,
    p_dueat_clear boolean DEFAULT false,
    p_dueat TIMESTAMPTZ DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF __mj."vwTasks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Task"
    SET
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "EnvironmentID" = COALESCE(p_environmentid, "EnvironmentID"),
        "ProjectID" = CASE WHEN p_projectid_clear = true THEN NULL ELSE COALESCE(p_projectid, "ProjectID") END,
        "ConversationDetailID" = CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, "ConversationDetailID") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "Status" = COALESCE(p_status, "Status"),
        "PercentComplete" = CASE WHEN p_percentcomplete_clear = true THEN NULL ELSE COALESCE(p_percentcomplete, "PercentComplete") END,
        "DueAt" = CASE WHEN p_dueat_clear = true THEN NULL ELSE COALESCE(p_dueat, "DueAt") END,
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwTasks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateTask" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Task table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_task"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_task" ON __mj."Task";

CREATE TRIGGER "trg_update_task"
BEFORE UPDATE ON __mj."Task"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_task"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: spDeleteTask
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Task
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTask'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteTask"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."Task"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteTask" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_parent_id"
    ON __mj."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_context_compression_prompt_id"
    ON __mj."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_type_id"
    ON __mj."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_artifact_type_id"
    ON __mj."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_owner_user_id"
    ON __mj."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_attachment_storage_provider_id"
    ON __mj."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_category_id"
    ON __mj."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_storage_account_id"
    ON __mj."AIAgent" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_co_agent_id"
    ON __mj."AIAgent" ("DefaultCoAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fnAIAgentParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_parent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgent" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fnAIAgentDefaultCoAgentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.DefaultCoAgentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_default_co_agent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "DefaultCoAgentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."DefaultCoAgentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgent" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."DefaultCoAgentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "DefaultCoAgentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: vwAIAgents
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agents
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgents"
AS
SELECT
    a.*,
    MJAIAgent_ParentID."Name" AS "Parent",
    MJAIPrompt_ContextCompressionPromptID."Name" AS "ContextCompressionPrompt",
    MJAIAgentType_TypeID."Name" AS "Type",
    MJArtifactType_DefaultArtifactTypeID."Name" AS "DefaultArtifactType",
    MJUser_OwnerUserID."Name" AS "OwnerUser",
    MJFileStorageProvider_AttachmentStorageProviderID."Name" AS "AttachmentStorageProvider",
    MJAIAgentCategory_CategoryID."Name" AS "Category",
    MJFileStorageAccount_DefaultStorageAccountID."Name" AS "DefaultStorageAccount",
    MJAIAgent_DefaultCoAgentID."Name" AS "DefaultCoAgent",
    root_ParentID.root_id AS "RootParentID",
    root_DefaultCoAgentID.root_id AS "RootDefaultCoAgentID"
FROM
    __mj."AIAgent" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_ParentID
  ON
    "a"."ParentID" = MJAIAgent_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ContextCompressionPromptID
  ON
    "a"."ContextCompressionPromptID" = MJAIPrompt_ContextCompressionPromptID."ID"
LEFT OUTER JOIN
    __mj."AIAgentType" AS MJAIAgentType_TypeID
  ON
    "a"."TypeID" = MJAIAgentType_TypeID."ID"
LEFT OUTER JOIN
    __mj."ArtifactType" AS MJArtifactType_DefaultArtifactTypeID
  ON
    "a"."DefaultArtifactTypeID" = MJArtifactType_DefaultArtifactTypeID."ID"
INNER JOIN
    __mj."User" AS MJUser_OwnerUserID
  ON
    "a"."OwnerUserID" = MJUser_OwnerUserID."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    "a"."AttachmentStorageProviderID" = MJFileStorageProvider_AttachmentStorageProviderID."ID"
LEFT OUTER JOIN
    __mj."AIAgentCategory" AS MJAIAgentCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIAgentCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    "a"."DefaultStorageAccountID" = MJFileStorageAccount_DefaultStorageAccountID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_DefaultCoAgentID
  ON
    "a"."DefaultCoAgentID" = MJAIAgent_DefaultCoAgentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_default_co_agent_id_get_root_id"(a."ID", a."DefaultCoAgentID") AS root_id
) AS root_DefaultCoAgentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgents'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgents'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgents'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgents" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spCreateAIAgent
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
AS $$
DECLARE
    v_id uuid;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::uuid;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::uuid';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'Name' THEN '($1->>''Name'')'
        WHEN 'Description' THEN '($1->>''Description'')'
        WHEN 'LogoURL' THEN '($1->>''LogoURL'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'ExposeAsAction' THEN 'COALESCE(($1->>''ExposeAsAction'')::BOOLEAN, FALSE)'
        WHEN 'ExecutionOrder' THEN 'COALESCE(($1->>''ExecutionOrder'')::INTEGER, 0)'
        WHEN 'ExecutionMode' THEN 'COALESCE(($1->>''ExecutionMode''), ''Sequential'')'
        WHEN 'EnableContextCompression' THEN 'COALESCE(($1->>''EnableContextCompression'')::BOOLEAN, FALSE)'
        WHEN 'ContextCompressionMessageThreshold' THEN '($1->>''ContextCompressionMessageThreshold'')::INTEGER'
        WHEN 'ContextCompressionPromptID' THEN '($1->>''ContextCompressionPromptID'')::UUID'
        WHEN 'ContextCompressionMessageRetentionCount' THEN '($1->>''ContextCompressionMessageRetentionCount'')::INTEGER'
        WHEN 'TypeID' THEN '($1->>''TypeID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'DriverClass' THEN '($1->>''DriverClass'')'
        WHEN 'IconClass' THEN '($1->>''IconClass'')'
        WHEN 'ModelSelectionMode' THEN 'COALESCE(($1->>''ModelSelectionMode''), ''Agent Type'')'
        WHEN 'PayloadDownstreamPaths' THEN 'COALESCE(($1->>''PayloadDownstreamPaths''), ''["*"]'')'
        WHEN 'PayloadUpstreamPaths' THEN 'COALESCE(($1->>''PayloadUpstreamPaths''), ''["*"]'')'
        WHEN 'PayloadSelfReadPaths' THEN '($1->>''PayloadSelfReadPaths'')'
        WHEN 'PayloadSelfWritePaths' THEN '($1->>''PayloadSelfWritePaths'')'
        WHEN 'PayloadScope' THEN '($1->>''PayloadScope'')'
        WHEN 'FinalPayloadValidation' THEN '($1->>''FinalPayloadValidation'')'
        WHEN 'FinalPayloadValidationMode' THEN 'COALESCE(($1->>''FinalPayloadValidationMode''), ''Retry'')'
        WHEN 'FinalPayloadValidationMaxRetries' THEN 'COALESCE(($1->>''FinalPayloadValidationMaxRetries'')::INTEGER, 3)'
        WHEN 'MaxCostPerRun' THEN '($1->>''MaxCostPerRun'')::DECIMAL(10, 4)'
        WHEN 'MaxTokensPerRun' THEN '($1->>''MaxTokensPerRun'')::INTEGER'
        WHEN 'MaxIterationsPerRun' THEN '($1->>''MaxIterationsPerRun'')::INTEGER'
        WHEN 'MaxTimePerRun' THEN '($1->>''MaxTimePerRun'')::INTEGER'
        WHEN 'MinExecutionsPerRun' THEN '($1->>''MinExecutionsPerRun'')::INTEGER'
        WHEN 'MaxExecutionsPerRun' THEN '($1->>''MaxExecutionsPerRun'')::INTEGER'
        WHEN 'StartingPayloadValidation' THEN '($1->>''StartingPayloadValidation'')'
        WHEN 'StartingPayloadValidationMode' THEN 'COALESCE(($1->>''StartingPayloadValidationMode''), ''Fail'')'
        WHEN 'DefaultPromptEffortLevel' THEN '($1->>''DefaultPromptEffortLevel'')::INTEGER'
        WHEN 'ChatHandlingOption' THEN '($1->>''ChatHandlingOption'')'
        WHEN 'DefaultArtifactTypeID' THEN '($1->>''DefaultArtifactTypeID'')::UUID'
        WHEN 'OwnerUserID' THEN 'COALESCE(($1->>''OwnerUserID'')::UUID, ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'')'
        WHEN 'InvocationMode' THEN 'COALESCE(($1->>''InvocationMode''), ''Any'')'
        WHEN 'ArtifactCreationMode' THEN 'COALESCE(($1->>''ArtifactCreationMode''), ''Always'')'
        WHEN 'FunctionalRequirements' THEN '($1->>''FunctionalRequirements'')'
        WHEN 'TechnicalDesign' THEN '($1->>''TechnicalDesign'')'
        WHEN 'InjectNotes' THEN 'COALESCE(($1->>''InjectNotes'')::BOOLEAN, TRUE)'
        WHEN 'MaxNotesToInject' THEN 'COALESCE(($1->>''MaxNotesToInject'')::INTEGER, 5)'
        WHEN 'NoteInjectionStrategy' THEN 'COALESCE(($1->>''NoteInjectionStrategy''), ''Relevant'')'
        WHEN 'InjectExamples' THEN 'COALESCE(($1->>''InjectExamples'')::BOOLEAN, FALSE)'
        WHEN 'MaxExamplesToInject' THEN 'COALESCE(($1->>''MaxExamplesToInject'')::INTEGER, 3)'
        WHEN 'ExampleInjectionStrategy' THEN 'COALESCE(($1->>''ExampleInjectionStrategy''), ''Semantic'')'
        WHEN 'IsRestricted' THEN 'COALESCE(($1->>''IsRestricted'')::BOOLEAN, FALSE)'
        WHEN 'MessageMode' THEN 'COALESCE(($1->>''MessageMode''), ''None'')'
        WHEN 'MaxMessages' THEN '($1->>''MaxMessages'')::INTEGER'
        WHEN 'AttachmentStorageProviderID' THEN '($1->>''AttachmentStorageProviderID'')::UUID'
        WHEN 'AttachmentRootPath' THEN '($1->>''AttachmentRootPath'')'
        WHEN 'InlineStorageThresholdBytes' THEN '($1->>''InlineStorageThresholdBytes'')::INTEGER'
        WHEN 'AgentTypePromptParams' THEN '($1->>''AgentTypePromptParams'')'
        WHEN 'ScopeConfig' THEN '($1->>''ScopeConfig'')'
        WHEN 'NoteRetentionDays' THEN '($1->>''NoteRetentionDays'')::INTEGER'
        WHEN 'ExampleRetentionDays' THEN '($1->>''ExampleRetentionDays'')::INTEGER'
        WHEN 'AutoArchiveEnabled' THEN 'COALESCE(($1->>''AutoArchiveEnabled'')::BOOLEAN, TRUE)'
        WHEN 'RerankerConfiguration' THEN '($1->>''RerankerConfiguration'')'
        WHEN 'CategoryID' THEN '($1->>''CategoryID'')::UUID'
        WHEN 'AllowEphemeralClientTools' THEN 'COALESCE(($1->>''AllowEphemeralClientTools'')::BOOLEAN, TRUE)'
        WHEN 'DefaultStorageAccountID' THEN '($1->>''DefaultStorageAccountID'')::UUID'
        WHEN 'SearchScopeAccess' THEN 'COALESCE(($1->>''SearchScopeAccess''), ''None'')'
        WHEN 'AcceptUnregisteredFiles' THEN 'COALESCE(($1->>''AcceptUnregisteredFiles'')::BOOLEAN, FALSE)'
        WHEN 'DefaultCoAgentID' THEN '($1->>''DefaultCoAgentID'')::UUID'
        WHEN 'TypeConfiguration' THEN '($1->>''TypeConfiguration'')'
        WHEN 'AllowMemoryWrite' THEN 'COALESCE(($1->>''AllowMemoryWrite'')::BOOLEAN, TRUE)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIAgent" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
AS $$
DECLARE
    v_id uuid := (p_data->>'ID')::uuid;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgent: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgent"
    SET
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "LogoURL" = CASE WHEN p_data ? 'LogoURL' THEN (p_data->>'LogoURL') ELSE "LogoURL" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "ExposeAsAction" = CASE WHEN p_data ? 'ExposeAsAction' THEN (p_data->>'ExposeAsAction')::BOOLEAN ELSE "ExposeAsAction" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INTEGER ELSE "ExecutionOrder" END,
        "ExecutionMode" = CASE WHEN p_data ? 'ExecutionMode' THEN (p_data->>'ExecutionMode') ELSE "ExecutionMode" END,
        "EnableContextCompression" = CASE WHEN p_data ? 'EnableContextCompression' THEN (p_data->>'EnableContextCompression')::BOOLEAN ELSE "EnableContextCompression" END,
        "ContextCompressionMessageThreshold" = CASE WHEN p_data ? 'ContextCompressionMessageThreshold' THEN (p_data->>'ContextCompressionMessageThreshold')::INTEGER ELSE "ContextCompressionMessageThreshold" END,
        "ContextCompressionPromptID" = CASE WHEN p_data ? 'ContextCompressionPromptID' THEN (p_data->>'ContextCompressionPromptID')::UUID ELSE "ContextCompressionPromptID" END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_data ? 'ContextCompressionMessageRetentionCount' THEN (p_data->>'ContextCompressionMessageRetentionCount')::INTEGER ELSE "ContextCompressionMessageRetentionCount" END,
        "TypeID" = CASE WHEN p_data ? 'TypeID' THEN (p_data->>'TypeID')::UUID ELSE "TypeID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "DriverClass" = CASE WHEN p_data ? 'DriverClass' THEN (p_data->>'DriverClass') ELSE "DriverClass" END,
        "IconClass" = CASE WHEN p_data ? 'IconClass' THEN (p_data->>'IconClass') ELSE "IconClass" END,
        "ModelSelectionMode" = CASE WHEN p_data ? 'ModelSelectionMode' THEN (p_data->>'ModelSelectionMode') ELSE "ModelSelectionMode" END,
        "PayloadDownstreamPaths" = CASE WHEN p_data ? 'PayloadDownstreamPaths' THEN (p_data->>'PayloadDownstreamPaths') ELSE "PayloadDownstreamPaths" END,
        "PayloadUpstreamPaths" = CASE WHEN p_data ? 'PayloadUpstreamPaths' THEN (p_data->>'PayloadUpstreamPaths') ELSE "PayloadUpstreamPaths" END,
        "PayloadSelfReadPaths" = CASE WHEN p_data ? 'PayloadSelfReadPaths' THEN (p_data->>'PayloadSelfReadPaths') ELSE "PayloadSelfReadPaths" END,
        "PayloadSelfWritePaths" = CASE WHEN p_data ? 'PayloadSelfWritePaths' THEN (p_data->>'PayloadSelfWritePaths') ELSE "PayloadSelfWritePaths" END,
        "PayloadScope" = CASE WHEN p_data ? 'PayloadScope' THEN (p_data->>'PayloadScope') ELSE "PayloadScope" END,
        "FinalPayloadValidation" = CASE WHEN p_data ? 'FinalPayloadValidation' THEN (p_data->>'FinalPayloadValidation') ELSE "FinalPayloadValidation" END,
        "FinalPayloadValidationMode" = CASE WHEN p_data ? 'FinalPayloadValidationMode' THEN (p_data->>'FinalPayloadValidationMode') ELSE "FinalPayloadValidationMode" END,
        "FinalPayloadValidationMaxRetries" = CASE WHEN p_data ? 'FinalPayloadValidationMaxRetries' THEN (p_data->>'FinalPayloadValidationMaxRetries')::INTEGER ELSE "FinalPayloadValidationMaxRetries" END,
        "MaxCostPerRun" = CASE WHEN p_data ? 'MaxCostPerRun' THEN (p_data->>'MaxCostPerRun')::DECIMAL(10, 4) ELSE "MaxCostPerRun" END,
        "MaxTokensPerRun" = CASE WHEN p_data ? 'MaxTokensPerRun' THEN (p_data->>'MaxTokensPerRun')::INTEGER ELSE "MaxTokensPerRun" END,
        "MaxIterationsPerRun" = CASE WHEN p_data ? 'MaxIterationsPerRun' THEN (p_data->>'MaxIterationsPerRun')::INTEGER ELSE "MaxIterationsPerRun" END,
        "MaxTimePerRun" = CASE WHEN p_data ? 'MaxTimePerRun' THEN (p_data->>'MaxTimePerRun')::INTEGER ELSE "MaxTimePerRun" END,
        "MinExecutionsPerRun" = CASE WHEN p_data ? 'MinExecutionsPerRun' THEN (p_data->>'MinExecutionsPerRun')::INTEGER ELSE "MinExecutionsPerRun" END,
        "MaxExecutionsPerRun" = CASE WHEN p_data ? 'MaxExecutionsPerRun' THEN (p_data->>'MaxExecutionsPerRun')::INTEGER ELSE "MaxExecutionsPerRun" END,
        "StartingPayloadValidation" = CASE WHEN p_data ? 'StartingPayloadValidation' THEN (p_data->>'StartingPayloadValidation') ELSE "StartingPayloadValidation" END,
        "StartingPayloadValidationMode" = CASE WHEN p_data ? 'StartingPayloadValidationMode' THEN (p_data->>'StartingPayloadValidationMode') ELSE "StartingPayloadValidationMode" END,
        "DefaultPromptEffortLevel" = CASE WHEN p_data ? 'DefaultPromptEffortLevel' THEN (p_data->>'DefaultPromptEffortLevel')::INTEGER ELSE "DefaultPromptEffortLevel" END,
        "ChatHandlingOption" = CASE WHEN p_data ? 'ChatHandlingOption' THEN (p_data->>'ChatHandlingOption') ELSE "ChatHandlingOption" END,
        "DefaultArtifactTypeID" = CASE WHEN p_data ? 'DefaultArtifactTypeID' THEN (p_data->>'DefaultArtifactTypeID')::UUID ELSE "DefaultArtifactTypeID" END,
        "OwnerUserID" = CASE WHEN p_data ? 'OwnerUserID' THEN (p_data->>'OwnerUserID')::UUID ELSE "OwnerUserID" END,
        "InvocationMode" = CASE WHEN p_data ? 'InvocationMode' THEN (p_data->>'InvocationMode') ELSE "InvocationMode" END,
        "ArtifactCreationMode" = CASE WHEN p_data ? 'ArtifactCreationMode' THEN (p_data->>'ArtifactCreationMode') ELSE "ArtifactCreationMode" END,
        "FunctionalRequirements" = CASE WHEN p_data ? 'FunctionalRequirements' THEN (p_data->>'FunctionalRequirements') ELSE "FunctionalRequirements" END,
        "TechnicalDesign" = CASE WHEN p_data ? 'TechnicalDesign' THEN (p_data->>'TechnicalDesign') ELSE "TechnicalDesign" END,
        "InjectNotes" = CASE WHEN p_data ? 'InjectNotes' THEN (p_data->>'InjectNotes')::BOOLEAN ELSE "InjectNotes" END,
        "MaxNotesToInject" = CASE WHEN p_data ? 'MaxNotesToInject' THEN (p_data->>'MaxNotesToInject')::INTEGER ELSE "MaxNotesToInject" END,
        "NoteInjectionStrategy" = CASE WHEN p_data ? 'NoteInjectionStrategy' THEN (p_data->>'NoteInjectionStrategy') ELSE "NoteInjectionStrategy" END,
        "InjectExamples" = CASE WHEN p_data ? 'InjectExamples' THEN (p_data->>'InjectExamples')::BOOLEAN ELSE "InjectExamples" END,
        "MaxExamplesToInject" = CASE WHEN p_data ? 'MaxExamplesToInject' THEN (p_data->>'MaxExamplesToInject')::INTEGER ELSE "MaxExamplesToInject" END,
        "ExampleInjectionStrategy" = CASE WHEN p_data ? 'ExampleInjectionStrategy' THEN (p_data->>'ExampleInjectionStrategy') ELSE "ExampleInjectionStrategy" END,
        "IsRestricted" = CASE WHEN p_data ? 'IsRestricted' THEN (p_data->>'IsRestricted')::BOOLEAN ELSE "IsRestricted" END,
        "MessageMode" = CASE WHEN p_data ? 'MessageMode' THEN (p_data->>'MessageMode') ELSE "MessageMode" END,
        "MaxMessages" = CASE WHEN p_data ? 'MaxMessages' THEN (p_data->>'MaxMessages')::INTEGER ELSE "MaxMessages" END,
        "AttachmentStorageProviderID" = CASE WHEN p_data ? 'AttachmentStorageProviderID' THEN (p_data->>'AttachmentStorageProviderID')::UUID ELSE "AttachmentStorageProviderID" END,
        "AttachmentRootPath" = CASE WHEN p_data ? 'AttachmentRootPath' THEN (p_data->>'AttachmentRootPath') ELSE "AttachmentRootPath" END,
        "InlineStorageThresholdBytes" = CASE WHEN p_data ? 'InlineStorageThresholdBytes' THEN (p_data->>'InlineStorageThresholdBytes')::INTEGER ELSE "InlineStorageThresholdBytes" END,
        "AgentTypePromptParams" = CASE WHEN p_data ? 'AgentTypePromptParams' THEN (p_data->>'AgentTypePromptParams') ELSE "AgentTypePromptParams" END,
        "ScopeConfig" = CASE WHEN p_data ? 'ScopeConfig' THEN (p_data->>'ScopeConfig') ELSE "ScopeConfig" END,
        "NoteRetentionDays" = CASE WHEN p_data ? 'NoteRetentionDays' THEN (p_data->>'NoteRetentionDays')::INTEGER ELSE "NoteRetentionDays" END,
        "ExampleRetentionDays" = CASE WHEN p_data ? 'ExampleRetentionDays' THEN (p_data->>'ExampleRetentionDays')::INTEGER ELSE "ExampleRetentionDays" END,
        "AutoArchiveEnabled" = CASE WHEN p_data ? 'AutoArchiveEnabled' THEN (p_data->>'AutoArchiveEnabled')::BOOLEAN ELSE "AutoArchiveEnabled" END,
        "RerankerConfiguration" = CASE WHEN p_data ? 'RerankerConfiguration' THEN (p_data->>'RerankerConfiguration') ELSE "RerankerConfiguration" END,
        "CategoryID" = CASE WHEN p_data ? 'CategoryID' THEN (p_data->>'CategoryID')::UUID ELSE "CategoryID" END,
        "AllowEphemeralClientTools" = CASE WHEN p_data ? 'AllowEphemeralClientTools' THEN (p_data->>'AllowEphemeralClientTools')::BOOLEAN ELSE "AllowEphemeralClientTools" END,
        "DefaultStorageAccountID" = CASE WHEN p_data ? 'DefaultStorageAccountID' THEN (p_data->>'DefaultStorageAccountID')::UUID ELSE "DefaultStorageAccountID" END,
        "SearchScopeAccess" = CASE WHEN p_data ? 'SearchScopeAccess' THEN (p_data->>'SearchScopeAccess') ELSE "SearchScopeAccess" END,
        "AcceptUnregisteredFiles" = CASE WHEN p_data ? 'AcceptUnregisteredFiles' THEN (p_data->>'AcceptUnregisteredFiles')::BOOLEAN ELSE "AcceptUnregisteredFiles" END,
        "DefaultCoAgentID" = CASE WHEN p_data ? 'DefaultCoAgentID' THEN (p_data->>'DefaultCoAgentID')::UUID ELSE "DefaultCoAgentID" END,
        "TypeConfiguration" = CASE WHEN p_data ? 'TypeConfiguration' THEN (p_data->>'TypeConfiguration') ELSE "TypeConfiguration" END,
        "AllowMemoryWrite" = CASE WHEN p_data ? 'AllowMemoryWrite' THEN (p_data->>'AllowMemoryWrite')::BOOLEAN ELSE "AllowMemoryWrite" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent" ON __mj."AIAgent";

CREATE TRIGGER "trg_update_ai_agent"
BEFORE UPDATE ON __mj."AIAgent"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Actions.CreatedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "CreatedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Action"
        SET "CreatedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Actions.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Artifact Types records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentArtifactType"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentArtifactType"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Client Tools records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentClientTool"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentClientTool"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Co Agents records via CoAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "CoAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentCoAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Co Agents.TargetAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "TargetAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentCoAgent"
        SET "TargetAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Configurations records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentConfiguration"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentConfiguration"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Data Sources records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentDataSource"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentDataSource"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Examples records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentExample"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Learning Cycles records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentLearningCycle"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentLearningCycle"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Modalities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModality"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentModality"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Models.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModel"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentModel"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Permissions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPermission"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Requests records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRequest"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Runs records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Search Scopes records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSearchScope"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSearchScope"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Sessions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSession"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSession"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Steps records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.SubAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "SubAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "SubAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.DefaultCoAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "DefaultCoAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "DefaultCoAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Bridge Agent Identities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIBridgeAgentIdentity"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIBridgeAgentIdentity"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIResultCache"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversations.DefaultAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Conversation"
        WHERE "DefaultAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Conversation"
        SET "DefaultAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Search Execution Logs.AIAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."SearchExecutionLog"
        WHERE "AIAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."SearchExecutionLog"
        SET "AIAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Task"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Task"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifact Versions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_artifact_version_conversation_art"
    ON __mj."ConversationArtifactVersion" ("ConversationArtifactID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifact Versions
-- Item: vwConversationArtifactVersions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifact Versions
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationArtifactVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationArtifactVersions"
AS
SELECT
    c.*,
    MJConversationArtifact_ConversationArtifactID."Name" AS "ConversationArtifact"
FROM
    __mj."ConversationArtifactVersion" AS c
INNER JOIN
    __mj."ConversationArtifact" AS MJConversationArtifact_ConversationArtifactID
  ON
    "c"."ConversationArtifactID" = MJConversationArtifact_ConversationArtifactID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationArtifactVersions'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationArtifactVersions'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwConversationArtifactVersions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversationArtifactVersions" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwConversationArtifactVersions" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationArtifactVersions" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationArtifactVersions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifact Versions
-- Item: spCreateConversationArtifactVersion
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationArtifactVersion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationArtifactVersion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationArtifactVersion"(
    p_id uuid DEFAULT NULL,
    p_conversationartifactid uuid DEFAULT NULL,
    p_version integer DEFAULT NULL,
    p_configuration text DEFAULT NULL,
    p_content_clear boolean DEFAULT false,
    p_content text DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL
) RETURNS SETOF __mj."vwConversationArtifactVersions" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationArtifactVersion"
        (
            "ID",
            "ConversationArtifactID",
                "Version",
                "Configuration",
                "Content",
                "Comments"
        )
    VALUES
        (
            v_new_id,
            p_conversationartifactid,
                p_version,
                p_configuration,
                CASE WHEN p_content_clear = true THEN NULL ELSE COALESCE(p_content, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationArtifactVersions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationArtifactVersion" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationArtifactVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationArtifactVersion" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifact Versions
-- Item: spUpdateConversationArtifactVersion
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationArtifactVersion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationArtifactVersion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationArtifactVersion"(
    p_id uuid,
    p_conversationartifactid uuid DEFAULT NULL,
    p_version integer DEFAULT NULL,
    p_configuration text DEFAULT NULL,
    p_content_clear boolean DEFAULT false,
    p_content text DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL
) RETURNS SETOF __mj."vwConversationArtifactVersions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationArtifactVersion"
    SET
        "ConversationArtifactID" = COALESCE(p_conversationartifactid, "ConversationArtifactID"),
        "Version" = COALESCE(p_version, "Version"),
        "Configuration" = COALESCE(p_configuration, "Configuration"),
        "Content" = CASE WHEN p_content_clear = true THEN NULL ELSE COALESCE(p_content, "Content") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationArtifactVersions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationArtifactVersion" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationArtifactVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationArtifactVersion" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifactVersion table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation_artifact_version"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_artifact_version" ON __mj."ConversationArtifactVersion";

CREATE TRIGGER "trg_update_conversation_artifact_version"
BEFORE UPDATE ON __mj."ConversationArtifactVersion"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation_artifact_version"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationArtifactVersion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationArtifactVersion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifactVersion"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Conversation Details.ArtifactVersionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "ArtifactVersionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "ArtifactVersionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."ConversationArtifactVersion"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifactVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifactVersion" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifacts
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_artifact_conversation_id"
    ON __mj."ConversationArtifact" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_artifact_artifact_type_id"
    ON __mj."ConversationArtifact" ("ArtifactTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifacts
-- Item: vwConversationArtifacts
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifacts
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationArtifacts"
AS
SELECT
    c.*,
    MJConversation_ConversationID."Name" AS "Conversation",
    MJArtifactType_ArtifactTypeID."Name" AS "ArtifactType"
FROM
    __mj."ConversationArtifact" AS c
INNER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "c"."ConversationID" = MJConversation_ConversationID."ID"
INNER JOIN
    __mj."ArtifactType" AS MJArtifactType_ArtifactTypeID
  ON
    "c"."ArtifactTypeID" = MJArtifactType_ArtifactTypeID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationArtifacts'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversationArtifacts'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwConversationArtifacts'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversationArtifacts" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwConversationArtifacts" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationArtifacts" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationArtifacts" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifacts
-- Item: spCreateConversationArtifact
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationArtifact
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationArtifact'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationArtifact"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_conversationid uuid DEFAULT NULL,
    p_artifacttypeid uuid DEFAULT NULL,
    p_sharingscope text DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL
) RETURNS SETOF __mj."vwConversationArtifacts" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationArtifact"
        (
            "ID",
            "Name",
                "Description",
                "ConversationID",
                "ArtifactTypeID",
                "SharingScope",
                "Comments"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_conversationid,
                p_artifacttypeid,
                p_sharingscope,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationArtifacts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationArtifact" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationArtifact" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationArtifact" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifacts
-- Item: spUpdateConversationArtifact
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationArtifact
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationArtifact'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationArtifact"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_conversationid uuid DEFAULT NULL,
    p_artifacttypeid uuid DEFAULT NULL,
    p_sharingscope text DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL
) RETURNS SETOF __mj."vwConversationArtifacts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationArtifact"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ConversationID" = COALESCE(p_conversationid, "ConversationID"),
        "ArtifactTypeID" = COALESCE(p_artifacttypeid, "ArtifactTypeID"),
        "SharingScope" = COALESCE(p_sharingscope, "SharingScope"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationArtifacts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationArtifact" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationArtifact" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationArtifact" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifact table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation_artifact"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_artifact" ON __mj."ConversationArtifact";

CREATE TRIGGER "trg_update_conversation_artifact"
BEFORE UPDATE ON __mj."ConversationArtifact"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation_artifact"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationArtifact
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationArtifact'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifact"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: Conversation Artifact Permissions records via ConversationArtifactID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationArtifactPermission"
        WHERE "ConversationArtifactID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationArtifactPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Artifact Versions records via ConversationArtifactID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationArtifactVersion"
        WHERE "ConversationArtifactID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationArtifactVersion"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.ArtifactID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "ArtifactID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "ArtifactID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."ConversationArtifact"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifact" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifact" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_user_id"
    ON __mj."Conversation" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_linked_entity_id"
    ON __mj."Conversation" ("LinkedEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_data_context_id"
    ON __mj."Conversation" ("DataContextID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_environment_id"
    ON __mj."Conversation" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_project_id"
    ON __mj."Conversation" ("ProjectID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_test_run_id"
    ON __mj."Conversation" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_application_id"
    ON __mj."Conversation" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_default_agent_id"
    ON __mj."Conversation" ("DefaultAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversations
-- Item: vwConversations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversations
-----               SCHEMA:      __mj
-----               BASE TABLE:  Conversation
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversations"
AS
SELECT
    c.*,
    MJUser_UserID."Name" AS "User",
    MJEntity_LinkedEntityID."Name" AS "LinkedEntity",
    MJDataContext_DataContextID."Name" AS "DataContext",
    MJEnvironment_EnvironmentID."Name" AS "Environment",
    MJProject_ProjectID."Name" AS "Project",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJApplication_ApplicationID."Name" AS "Application",
    MJAIAgent_DefaultAgentID."Name" AS "DefaultAgent"
FROM
    __mj."Conversation" AS c
INNER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "c"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_LinkedEntityID
  ON
    "c"."LinkedEntityID" = MJEntity_LinkedEntityID."ID"
LEFT OUTER JOIN
    __mj."DataContext" AS MJDataContext_DataContextID
  ON
    "c"."DataContextID" = MJDataContext_DataContextID."ID"
INNER JOIN
    __mj."Environment" AS MJEnvironment_EnvironmentID
  ON
    "c"."EnvironmentID" = MJEnvironment_EnvironmentID."ID"
LEFT OUTER JOIN
    __mj."Project" AS MJProject_ProjectID
  ON
    "c"."ProjectID" = MJProject_ProjectID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "c"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    __mj."Application" AS MJApplication_ApplicationID
  ON
    "c"."ApplicationID" = MJApplication_ApplicationID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_DefaultAgentID
  ON
    "c"."DefaultAgentID" = MJAIAgent_DefaultAgentID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversations'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwConversations'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwConversations'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversations" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwConversations" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversations" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversations" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversations
-- Item: spCreateConversation
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Conversation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateConversation"(
    p_id uuid DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isarchived BOOLEAN DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid uuid DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid text DEFAULT NULL,
    p_datacontextid_clear boolean DEFAULT false,
    p_datacontextid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_environmentid uuid DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid uuid DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_applicationscope text DEFAULT NULL,
    p_applicationid_clear boolean DEFAULT false,
    p_applicationid uuid DEFAULT NULL,
    p_defaultagentid_clear boolean DEFAULT false,
    p_defaultagentid uuid DEFAULT NULL,
    p_additionaldata_clear boolean DEFAULT false,
    p_additionaldata text DEFAULT NULL
) RETURNS SETOF __mj."vwConversations" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Conversation"
        (
            "ID",
            "UserID",
                "ExternalID",
                "Name",
                "Description",
                "Type",
                "IsArchived",
                "LinkedEntityID",
                "LinkedRecordID",
                "DataContextID",
                "Status",
                "EnvironmentID",
                "ProjectID",
                "IsPinned",
                "TestRunID",
                "ApplicationScope",
                "ApplicationID",
                "DefaultAgentID",
                "AdditionalData"
        )
    VALUES
        (
            v_new_id,
            p_userid,
                CASE WHEN p_externalid_clear = true THEN NULL ELSE COALESCE(p_externalid, NULL) END,
                CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_type, 'Skip'),
                COALESCE(p_isarchived, FALSE),
                CASE WHEN p_linkedentityid_clear = true THEN NULL ELSE COALESCE(p_linkedentityid, NULL) END,
                CASE WHEN p_linkedrecordid_clear = true THEN NULL ELSE COALESCE(p_linkedrecordid, NULL) END,
                CASE WHEN p_datacontextid_clear = true THEN NULL ELSE COALESCE(p_datacontextid, NULL) END,
                COALESCE(p_status, 'Available'),
                COALESCE(p_environmentid, 'F51358F3-9447-4176-B313-BF8025FD8D09'),
                CASE WHEN p_projectid_clear = true THEN NULL ELSE COALESCE(p_projectid, NULL) END,
                COALESCE(p_ispinned, FALSE),
                CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, NULL) END,
                COALESCE(p_applicationscope, 'Global'),
                CASE WHEN p_applicationid_clear = true THEN NULL ELSE COALESCE(p_applicationid, NULL) END,
                CASE WHEN p_defaultagentid_clear = true THEN NULL ELSE COALESCE(p_defaultagentid, NULL) END,
                CASE WHEN p_additionaldata_clear = true THEN NULL ELSE COALESCE(p_additionaldata, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversation" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversations
-- Item: spUpdateConversation
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Conversation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversation"(
    p_id uuid,
    p_userid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isarchived BOOLEAN DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid uuid DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid text DEFAULT NULL,
    p_datacontextid_clear boolean DEFAULT false,
    p_datacontextid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_environmentid uuid DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid uuid DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_applicationscope text DEFAULT NULL,
    p_applicationid_clear boolean DEFAULT false,
    p_applicationid uuid DEFAULT NULL,
    p_defaultagentid_clear boolean DEFAULT false,
    p_defaultagentid uuid DEFAULT NULL,
    p_additionaldata_clear boolean DEFAULT false,
    p_additionaldata text DEFAULT NULL
) RETURNS SETOF __mj."vwConversations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Conversation"
    SET
        "UserID" = COALESCE(p_userid, "UserID"),
        "ExternalID" = CASE WHEN p_externalid_clear = true THEN NULL ELSE COALESCE(p_externalid, "ExternalID") END,
        "Name" = CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, "Name") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Type" = COALESCE(p_type, "Type"),
        "IsArchived" = COALESCE(p_isarchived, "IsArchived"),
        "LinkedEntityID" = CASE WHEN p_linkedentityid_clear = true THEN NULL ELSE COALESCE(p_linkedentityid, "LinkedEntityID") END,
        "LinkedRecordID" = CASE WHEN p_linkedrecordid_clear = true THEN NULL ELSE COALESCE(p_linkedrecordid, "LinkedRecordID") END,
        "DataContextID" = CASE WHEN p_datacontextid_clear = true THEN NULL ELSE COALESCE(p_datacontextid, "DataContextID") END,
        "Status" = COALESCE(p_status, "Status"),
        "EnvironmentID" = COALESCE(p_environmentid, "EnvironmentID"),
        "ProjectID" = CASE WHEN p_projectid_clear = true THEN NULL ELSE COALESCE(p_projectid, "ProjectID") END,
        "IsPinned" = COALESCE(p_ispinned, "IsPinned"),
        "TestRunID" = CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, "TestRunID") END,
        "ApplicationScope" = COALESCE(p_applicationscope, "ApplicationScope"),
        "ApplicationID" = CASE WHEN p_applicationid_clear = true THEN NULL ELSE COALESCE(p_applicationid, "ApplicationID") END,
        "DefaultAgentID" = CASE WHEN p_defaultagentid_clear = true THEN NULL ELSE COALESCE(p_defaultagentid, "DefaultAgentID") END,
        "AdditionalData" = CASE WHEN p_additionaldata_clear = true THEN NULL ELSE COALESCE(p_additionaldata, "AdditionalData") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversation" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Conversation table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation" ON __mj."Conversation";

CREATE TRIGGER "trg_update_conversation"
BEFORE UPDATE ON __mj."Conversation"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversations
-- Item: spDeleteConversation
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Conversation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversation"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Sessions.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSession"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentSession"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Artifacts records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationArtifact"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationArtifact"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Details records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetail"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Reports.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Report"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Report"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."Conversation"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_configuration_default_prompt_for_context_co"
    ON __mj."AIConfiguration" ("DefaultPromptForContextCompressionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_configuration_default_prompt_for_context_su"
    ON __mj."AIConfiguration" ("DefaultPromptForContextSummarizationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_configuration_default_storage_provider_id"
    ON __mj."AIConfiguration" ("DefaultStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_configuration_parent_id"
    ON __mj."AIConfiguration" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: fnAIConfigurationParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIConfiguration.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_configuration_parent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIConfiguration"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIConfiguration" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: vwAIConfigurations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Configurations
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIConfigurations"
AS
SELECT
    a.*,
    MJAIPrompt_DefaultPromptForContextCompressionID."Name" AS "DefaultPromptForContextCompression",
    MJAIPrompt_DefaultPromptForContextSummarizationID."Name" AS "DefaultPromptForContextSummarization",
    MJFileStorageProvider_DefaultStorageProviderID."Name" AS "DefaultStorageProvider",
    MJAIConfiguration_ParentID."Name" AS "Parent",
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."AIConfiguration" AS a
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_DefaultPromptForContextCompressionID
  ON
    "a"."DefaultPromptForContextCompressionID" = MJAIPrompt_DefaultPromptForContextCompressionID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_DefaultPromptForContextSummarizationID
  ON
    "a"."DefaultPromptForContextSummarizationID" = MJAIPrompt_DefaultPromptForContextSummarizationID."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS MJFileStorageProvider_DefaultStorageProviderID
  ON
    "a"."DefaultStorageProviderID" = MJFileStorageProvider_DefaultStorageProviderID."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS MJAIConfiguration_ParentID
  ON
    "a"."ParentID" = MJAIConfiguration_ParentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_configuration_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIConfigurations'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIConfigurations'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIConfigurations'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIConfigurations" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIConfigurations" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIConfigurations" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIConfigurations" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: spCreateAIConfiguration
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIConfiguration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIConfiguration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIConfiguration"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_defaultpromptforcontextcompressionid_clear boolean DEFAULT false,
    p_defaultpromptforcontextcompressionid uuid DEFAULT NULL,
    p_defaultpromptforcontextsummarizationid_clear boolean DEFAULT false,
    p_defaultpromptforcontextsummarizationid uuid DEFAULT NULL,
    p_defaultstorageproviderid_clear boolean DEFAULT false,
    p_defaultstorageproviderid uuid DEFAULT NULL,
    p_defaultstoragerootpath_clear boolean DEFAULT false,
    p_defaultstoragerootpath text DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwAIConfigurations" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIConfiguration"
        (
            "ID",
            "Name",
                "Description",
                "IsDefault",
                "Status",
                "DefaultPromptForContextCompressionID",
                "DefaultPromptForContextSummarizationID",
                "DefaultStorageProviderID",
                "DefaultStorageRootPath",
                "ParentID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_isdefault, FALSE),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_defaultpromptforcontextcompressionid_clear = true THEN NULL ELSE COALESCE(p_defaultpromptforcontextcompressionid, NULL) END,
                CASE WHEN p_defaultpromptforcontextsummarizationid_clear = true THEN NULL ELSE COALESCE(p_defaultpromptforcontextsummarizationid, NULL) END,
                CASE WHEN p_defaultstorageproviderid_clear = true THEN NULL ELSE COALESCE(p_defaultstorageproviderid, NULL) END,
                CASE WHEN p_defaultstoragerootpath_clear = true THEN NULL ELSE COALESCE(p_defaultstoragerootpath, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIConfigurations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIConfiguration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIConfiguration" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: spUpdateAIConfiguration
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIConfiguration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIConfiguration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIConfiguration"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_defaultpromptforcontextcompressionid_clear boolean DEFAULT false,
    p_defaultpromptforcontextcompressionid uuid DEFAULT NULL,
    p_defaultpromptforcontextsummarizationid_clear boolean DEFAULT false,
    p_defaultpromptforcontextsummarizationid uuid DEFAULT NULL,
    p_defaultstorageproviderid_clear boolean DEFAULT false,
    p_defaultstorageproviderid uuid DEFAULT NULL,
    p_defaultstoragerootpath_clear boolean DEFAULT false,
    p_defaultstoragerootpath text DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwAIConfigurations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIConfiguration"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "Status" = COALESCE(p_status, "Status"),
        "DefaultPromptForContextCompressionID" = CASE WHEN p_defaultpromptforcontextcompressionid_clear = true THEN NULL ELSE COALESCE(p_defaultpromptforcontextcompressionid, "DefaultPromptForContextCompressionID") END,
        "DefaultPromptForContextSummarizationID" = CASE WHEN p_defaultpromptforcontextsummarizationid_clear = true THEN NULL ELSE COALESCE(p_defaultpromptforcontextsummarizationid, "DefaultPromptForContextSummarizationID") END,
        "DefaultStorageProviderID" = CASE WHEN p_defaultstorageproviderid_clear = true THEN NULL ELSE COALESCE(p_defaultstorageproviderid, "DefaultStorageProviderID") END,
        "DefaultStorageRootPath" = CASE WHEN p_defaultstoragerootpath_clear = true THEN NULL ELSE COALESCE(p_defaultstoragerootpath, "DefaultStorageRootPath") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIConfigurations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIConfiguration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIConfiguration" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIConfiguration table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_configuration"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_configuration" ON __mj."AIConfiguration";

CREATE TRIGGER "trg_update_ai_configuration"
BEFORE UPDATE ON __mj."AIConfiguration"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_configuration"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIConfiguration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIConfiguration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIConfiguration"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Configurations.AIConfigurationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentConfiguration"
        WHERE "AIConfigurationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentConfiguration"
        SET "AIConfigurationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via ConfigurationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "ConfigurationID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConfigurationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ConfigurationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ConfigurationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Configuration Params records via ConfigurationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfigurationParam"
        WHERE "ConfigurationID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIConfigurationParam"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfiguration"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIConfiguration"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Models records via ConfigurationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptModel"
        WHERE "ConfigurationID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptModel"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ConfigurationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "ConfigurationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "ConfigurationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.ConfigurationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "ConfigurationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIResultCache"
        SET "ConfigurationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIConfiguration"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIConfiguration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIConfiguration" TO "cdp_Integration";
