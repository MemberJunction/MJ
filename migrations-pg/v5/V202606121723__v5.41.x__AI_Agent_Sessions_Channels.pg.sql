-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606121723__v5.41.x__AI_Agent_Sessions_Channels.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================
   Real-Time AI Agents — Sessions, Channels & Co-Agent schema
   v5.41.x

   Companion plan: /plans/ai-agent-sessions.md

   One consolidated migration for the real-time agents feature. Every table is
   touched exactly ONCE — full schema in the first shot (new tables created
   complete; existing tables get a single ALTER each).

   New tables (no destructive changes):
     AIAgentChannel         — pluggable channel-definition registry (reference
                              data; seeded via metadata files, NOT SQL INSERTs)
     AIAgentSession         — the long-lived, stateful session record, including
                              CloseReason (authoritative close provenance)
     AIAgentSessionChannel  — one row per channel instance attached to a session
                              (normalized replacement for an ActiveChannels blob)
     AIAgentCoAgent         — agent↔agent affinity registry, co-agent pairings
                              first (Type vocabulary reserves future natures)

   Existing tables — ONE additive ALTER each:
     AIAgentRun.AgentSessionID         — links a run to its parent session
     ConversationDetail.AgentSessionID — links a message to the session it
                                         occurred in
     AIAgent.DefaultCoAgentID          — per-agent co-agent persona (self-FK)
     AIAgent.TypeConfiguration         — agent-type-specific configuration JSON
     AIAgentType.ConfigSchema          — JSON Schema for TypeConfiguration
     AIAgentType.DefaultConfiguration  — type-level configuration defaults

   DEPENDENCY-CYCLE NOTE: deliberately NO AIAgentType.DefaultCoAgentID column.
   An earlier revision had one, which created the only FK cycle in core MJ
   (AIAgent.TypeID → AIAgentType → AIAgent). Type-level co-agent defaults are
   expressed as AIAgentCoAgent rows with TargetAgentTypeID instead — the
   junction points DOWNWARD at both AIAgent and AIAgentType, keeping the core
   schema acyclic, and gains Sequence/IsDefault/multiple candidates for free.

   Co-agent resolution chain (a real-time session pairs a TARGET agent with the
   CO-AGENT that is its live voice; a co-agent is just an agent of the Realtime
   type), resolved server-side at session start:

       runtime parameter (StartRealtimeClientSession coAgentId)
         > AIAgent.DefaultCoAgentID                  (per-agent persona)
           > AIAgentCoAgent row, TargetAgentTypeID   (type-level default)
             > global default                        (name lookup fallback)

   Naming notes:
     * Persisted session FK columns are AgentSessionID (NOT SessionID), to stay
       distinct from the per-connection transport sessionID. See the plan's
       "Unified Session Transport" section.
     * AIAgentCoAgent vs the existing AIAgentRelationship: AIAgentRelationship
       is the agent→SUB-AGENT invocation wiring (input/output mappings,
       MessageMode, MaxMessages — A executes B). AIAgentCoAgent is PEER-level
       affinity with no invocation config — which agents may front, converse
       with, review, or substitute for each other. Different concerns, kept in
       different tables on purpose.

   CodeGen convention (per CLAUDE.md migrations guide):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
     * sp_addextendedproperty on business columns (and the new FK columns, for
       documentation) so CodeGen surfaces descriptions on regen.
     * Status-style columns use CHECK constraints so CodeGen emits string-union
       types. Server code that sets/reads the new columns ships AFTER CodeGen
       generates the typed entity properties, per the no-weak-typing rule.
     * Reference data (AIAgentChannel rows, realtime models, the Voice Co-Agent,
       prebuilt co-agent pairings, the 'Realtime: Advanced Session Controls'
       authorization) is seeded via metadata/mj-sync, NOT here.

   Entity metadata, views, and spCreate/Update/Delete are produced by CodeGen
   after this migration runs.
   ============================================================================ */ /* ============================================================================ */ /* 1. AIAgentChannel  ("MJ: AI Agent Channels") — pluggable channel registry */ /* ============================================================================ */
CREATE TABLE __mj."AIAgentChannel" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(100) NOT NULL,
  "Description" VARCHAR(1000) NULL,
  "ServerPluginClass" VARCHAR(250) NOT NULL,
  "ClientPluginClass" VARCHAR(250) NOT NULL,
  "TransportType" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgentChannel_TransportType" DEFAULT (
    'PubSub'
  ),
  "ConfigSchema" TEXT NULL,
  "IsActive" BOOLEAN NOT NULL CONSTRAINT "DF_AIAgentChannel_IsActive" DEFAULT TRUE,
  CONSTRAINT "PK_AIAgentChannel" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_AIAgentChannel_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "CK_AIAgentChannel_TransportType" CHECK ("TransportType" IN ('PubSub', 'WebRTC', 'WebSocket'))
);

COMMENT ON COLUMN __mj."AIAgentChannel"."Name" IS 'Unique channel definition name (e.g. VoiceAudio, TextChat, ClientControl, Whiteboard).';

COMMENT ON COLUMN __mj."AIAgentChannel"."Description" IS 'Optional human-readable description of what the channel surface does.';

COMMENT ON COLUMN __mj."AIAgentChannel"."ServerPluginClass" IS 'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance on the server. MUST match the @RegisterClass key on the concrete server-side channel plugin.';

COMMENT ON COLUMN __mj."AIAgentChannel"."ClientPluginClass" IS 'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance on the client. MUST match the @RegisterClass key on the concrete client-side channel plugin (typically an Angular component).';

COMMENT ON COLUMN __mj."AIAgentChannel"."TransportType" IS 'Which transport plane this channel rides: PubSub (the shared control plane), WebRTC (binary media), or WebSocket.';

COMMENT ON COLUMN __mj."AIAgentChannel"."ConfigSchema" IS 'Optional JSON Schema used to validate the per-instance channel configuration (AIAgentSessionChannel.Config).';

COMMENT ON COLUMN __mj."AIAgentChannel"."IsActive" IS 'Whether this channel definition is available for use. Inactive channels cannot be attached to a session.';

/* ============================================================================ */ /* 2. AIAgentSession  ("MJ: AI Agent Sessions") — long-lived session record */ /* ============================================================================ */
CREATE TABLE __mj."AIAgentSession" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "AgentID" UUID NOT NULL,
  "UserID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgentSession_Status" DEFAULT (
    'Active'
  ),
  "ConversationID" UUID NULL,
  "LastSessionID" UUID NULL,
  "HostInstanceID" VARCHAR(200) NULL,
  "Config" TEXT NULL,
  "LastActiveAt" TIMESTAMPTZ NOT NULL CONSTRAINT "DF_AIAgentSession_LastActiveAt" DEFAULT (
    NOW()
  ),
  "ClosedAt" TIMESTAMPTZ NULL,
  "CloseReason" VARCHAR(20) NULL,
  CONSTRAINT "PK_AIAgentSession" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIAgentSession_Agent" FOREIGN KEY ("AgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentSession_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentSession_Conversation" FOREIGN KEY ("ConversationID") REFERENCES __mj."Conversation" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentSession_LastSession" FOREIGN KEY ("LastSessionID") REFERENCES __mj."AIAgentSession" (
    "ID"
  ),
  CONSTRAINT "CK_AIAgentSession_Status" CHECK ("Status" IN ('Active', 'Idle', 'Closed')),
  CONSTRAINT "CK_AIAgentSession_CloseReason" CHECK ("CloseReason" IN ('Explicit', 'Janitor', 'Shutdown', 'Error'))
);

COMMENT ON COLUMN __mj."AIAgentSession"."Status" IS 'Lifecycle status of the session. Active = traffic flowing; Idle = connected but quiet beyond the idle threshold; Closed = terminal (ClosedAt set, channels disconnected).';

COMMENT ON COLUMN __mj."AIAgentSession"."HostInstanceID" IS 'Identifier of the server node currently hosting this sessions in-memory sockets (e.g. hostname:pid:bootId). Used for affinity and janitor orphan reconciliation.';

COMMENT ON COLUMN __mj."AIAgentSession"."Config" IS 'JSON block for free-form, low-traffic session-specific state and variables.';

COMMENT ON COLUMN __mj."AIAgentSession"."LastActiveAt" IS 'Timestamp of the last activity on the session. Bubbled up from the most-recently-active channel; used by the heartbeat and staleness sweep.';

COMMENT ON COLUMN __mj."AIAgentSession"."ClosedAt" IS 'When the session was closed (terminal). NULL while the session is Active or Idle.';

COMMENT ON COLUMN __mj."AIAgentSession"."CloseReason" IS 'Why the session was closed: Explicit (user hang-up / deliberate API close), Janitor (orphan or staleness sweep), Shutdown (graceful server shutdown), Error (session failure). NULL while the session is Active/Idle.';

/* ============================================================================ */ /* 3. AIAgentSessionChannel  ("MJ: AI Agent Session Channels") — active channel rows */ /* ============================================================================ */
CREATE TABLE __mj."AIAgentSessionChannel" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "AgentSessionID" UUID NOT NULL,
  "ChannelID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgentSessionChannel_Status" DEFAULT (
    'Connecting'
  ),
  "SocketUrl" VARCHAR(500) NULL,
  "Config" TEXT NULL,
  "LastActiveAt" TIMESTAMPTZ NOT NULL CONSTRAINT "DF_AIAgentSessionChannel_LastActiveAt" DEFAULT (
    NOW()
  ),
  "DisconnectedAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_AIAgentSessionChannel" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIAgentSessionChannel_Session" FOREIGN KEY ("AgentSessionID") REFERENCES __mj."AIAgentSession" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentSessionChannel_Channel" FOREIGN KEY ("ChannelID") REFERENCES __mj."AIAgentChannel" (
    "ID"
  ),
  CONSTRAINT "UQ_AIAgentSessionChannel" UNIQUE (
    "AgentSessionID",
    "ChannelID"
  ),
  CONSTRAINT "CK_AIAgentSessionChannel_Status" CHECK ("Status" IN ('Connecting', 'Connected', 'Paused', 'Disconnected'))
);

COMMENT ON COLUMN __mj."AIAgentSessionChannel"."Status" IS 'Connection status of this channel instance within the session.';

COMMENT ON COLUMN __mj."AIAgentSessionChannel"."SocketUrl" IS 'Socket URL handed to the client for this channel. NULL for PubSub channels, which ride the shared session subscription rather than a dedicated socket.';

COMMENT ON COLUMN __mj."AIAgentSessionChannel"."Config" IS 'JSON of per-instance channel configuration/state, validated against the channel definitions ConfigSchema.';

COMMENT ON COLUMN __mj."AIAgentSessionChannel"."LastActiveAt" IS 'Timestamp of the last activity (or heartbeat) on this channel instance.';

COMMENT ON COLUMN __mj."AIAgentSessionChannel"."DisconnectedAt" IS 'When this channel instance disconnected. NULL while still connected.';

/* ============================================================================ */ /* 4. AIAgentCoAgent  ("MJ: AI Agent Co Agents") — agent↔agent affinity registry */ /*    OPT-IN pairings between a (Realtime-type) co-agent and the agents — or */ /*    whole agent TYPES — it can front. A co-agent with ZERO rows (the seeded */ /*    default "Realtime Co-Agent") remains UNIVERSAL: it fronts any single */ /*    agent supplied at runtime, no metadata required. Rows therefore RESTRICT */ /*    + PREBUILD, never mandate. */ /*    The Type column ships a fuller relationship vocabulary now so the CHECK */ /*    string-union and generated types are stable, but ONLY 'CoAgent' is */ /*    implemented today — every other value is RESERVED for future features */ /*    (see column description). Distinct from AIAgentRelationship, which wires */ /*    agent→sub-agent INVOCATION (mappings, message modes); this table is pure */ /*    peer affinity with no invocation config. */ /*    Cross-record invariants — uniqueness of (CoAgentID, target side, Type) */ /*    and at-most-one IsDefault per (CoAgentID, Type) — are enforced in */ /*    MJAIAgentCoAgentEntityServer.ValidateAsync per the BaseEntity server */ /*    patterns guide, NOT as DB constraints (two nullable target columns make */ /*    DB-level uniqueness misbehave). */ /* ============================================================================ */
CREATE TABLE __mj."AIAgentCoAgent" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "CoAgentID" UUID NOT NULL,
  "TargetAgentID" UUID NULL,
  "TargetAgentTypeID" UUID NULL,
  "Type" VARCHAR(30) NOT NULL CONSTRAINT "DF_AIAgentCoAgent_Type" DEFAULT (
    'CoAgent'
  ),
  "IsDefault" BOOLEAN NOT NULL CONSTRAINT "DF_AIAgentCoAgent_IsDefault" DEFAULT FALSE,
  "Sequence" INT NOT NULL CONSTRAINT "DF_AIAgentCoAgent_Sequence" DEFAULT (
    0
  ),
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgentCoAgent_Status" DEFAULT (
    'Active'
  ),
  "Configuration" TEXT NULL,
  CONSTRAINT "PK_AIAgentCoAgent" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIAgentCoAgent_CoAgent" FOREIGN KEY ("CoAgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentCoAgent_TargetAgent" FOREIGN KEY ("TargetAgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentCoAgent_TargetAgentType" FOREIGN KEY ("TargetAgentTypeID") REFERENCES __mj."AIAgentType" (
    "ID"
  ),
  CONSTRAINT "CK_AIAgentCoAgent_Type" CHECK ("Type" IN ('CoAgent', 'Peer', 'Delegate', 'Fallback', 'Reviewer', 'Observer')),
  CONSTRAINT "CK_AIAgentCoAgent_Status" CHECK ("Status" IN ('Active', 'Disabled')),
  CONSTRAINT "CK_AIAgentCoAgent_OneTarget" CHECK ((
    NOT "TargetAgentID" IS NULL AND "TargetAgentTypeID" IS NULL
  )
  OR (
    "TargetAgentID" IS NULL AND NOT "TargetAgentTypeID" IS NULL
  )),
  CONSTRAINT "CK_AIAgentCoAgent_NotSelf" CHECK ("TargetAgentID" IS NULL OR "CoAgentID" <> "TargetAgentID")
);

COMMENT ON TABLE __mj."AIAgentCoAgent" IS 'Agent-to-agent affinity registry. Today: OPT-IN co-agent pairings — which underlying agents (or whole agent types) a Realtime-type co-agent can front in live sessions. A co-agent with NO rows is universal (fronts any single agent supplied at runtime — the zero-config default); rows restrict the co-agent to a prebuilt target list. The Type column reserves future relationship natures (Peer/Delegate/Fallback/Reviewer/Observer). Distinct from AIAgentRelationship, which wires agent-to-SUB-AGENT invocation (mappings, message modes); this table is peer affinity with no invocation config.';

COMMENT ON COLUMN __mj."AIAgentCoAgent"."CoAgentID" IS 'The relationship OWNER. For Type=CoAgent this is the Realtime-type co-agent (the live voice); it must be an Active agent of the Realtime type (enforced server-side). For reserved future types, the agent the relationship is read FROM.';

COMMENT ON COLUMN __mj."AIAgentCoAgent"."TargetAgentID" IS 'A specific paired agent — for Type=CoAgent, an underlying agent this co-agent can front. Exactly one of TargetAgentID / TargetAgentTypeID is set per row.';

COMMENT ON COLUMN __mj."AIAgentCoAgent"."TargetAgentTypeID" IS 'A whole agent TYPE as the paired side — for Type=CoAgent, this co-agent applies to every agent of the type (with IsDefault=1, it is the type-level default co-agent, replacing a column-based default that would create an AIAgent↔AIAgentType FK cycle). Exactly one of TargetAgentID / TargetAgentTypeID is set per row.';

COMMENT ON COLUMN __mj."AIAgentCoAgent"."Type" IS 'Nature of the relationship, read CoAgentID → target side. CoAgent = the owner can front the target in realtime sessions (the ONLY type implemented today). Peer (agent-to-agent conversation partners), Delegate (handoff/escalation), Fallback (substitute when owner unavailable), Reviewer (target reviews owner output), Observer (target observes owner sessions) are RESERVED for future features — the vocabulary ships now so generated string-union types stay stable.';

COMMENT ON COLUMN __mj."AIAgentCoAgent"."IsDefault" IS 'When 1: for a TargetAgentID row, this target is the co-agent''s default underlying agent (used when a session starts against the co-agent without an explicit runtime target); for a TargetAgentTypeID row, this co-agent is the default co-agent for agents of that type. At most one default per (CoAgentID, Type) is enforced server-side.';

COMMENT ON COLUMN __mj."AIAgentCoAgent"."Sequence" IS 'Display/priority order of this pairing in target-agent pickers and resolution ties (ascending).';

COMMENT ON COLUMN __mj."AIAgentCoAgent"."Status" IS 'Whether this pairing participates in resolution. Disabled rows are kept for audit/toggling but ignored by the resolution chain and pickers.';

COMMENT ON COLUMN __mj."AIAgentCoAgent"."Configuration" IS 'Optional per-relationship configuration JSON (shape owned by the Type, e.g. a future Peer arena''s turn budget). NULL for plain pairings.';

ALTER TABLE __mj."AIAgentRun"
  ADD COLUMN "AgentSessionID" UUID NULL CONSTRAINT "FK_AIAgentRun_AgentSession" REFERENCES __mj."AIAgentSession" (
    "ID"
  )
 /* ============================================================================ */ /* 5. Existing-table additions — exactly ONE ALTER per table, FKs inline */ /*    (FK indexes + spCreate/Update/Delete handled by CodeGen.) */ /* ============================================================================ */;

ALTER TABLE __mj."ConversationDetail"
  ADD COLUMN "AgentSessionID" UUID NULL CONSTRAINT "FK_ConversationDetail_AgentSession" REFERENCES __mj."AIAgentSession" (
    "ID"
  );

ALTER TABLE __mj."AIAgent"
  ADD COLUMN "DefaultCoAgentID" UUID NULL CONSTRAINT "FK_AIAgent_DefaultCoAgent" REFERENCES __mj."AIAgent" (
    "ID"
  ),
  ADD COLUMN "TypeConfiguration" TEXT NULL;

ALTER TABLE __mj."AIAgentType"
ADD COLUMN "ConfigSchema" TEXT NULL, ADD COLUMN "DefaultConfiguration" TEXT NULL;

COMMENT ON COLUMN __mj."AIAgentRun"."AgentSessionID" IS 'Links this run to the long-lived AIAgentSession it executed within. NULL for runs outside any real-time session. This is the persisted session reference and is distinct from the per-connection transport sessionID.';

COMMENT ON COLUMN __mj."ConversationDetail"."AgentSessionID" IS 'Links this message to the AIAgentSession that was active when it was created. NULL for messages typed in standard text chat outside any live session. Lets the conversation timeline group a sessions messages into a single collapsible block.';

COMMENT ON COLUMN __mj."AIAgent"."DefaultCoAgentID" IS 'Default co-agent (a Realtime-type AI Agent) that voices THIS agent in real-time sessions — a per-agent persona. Overridden by the runtime coAgentId parameter; NULL falls through to a type-level AIAgentCoAgent default row, then the global default co-agent.';

COMMENT ON COLUMN __mj."AIAgent"."TypeConfiguration" IS 'Agent-type-specific configuration JSON, validated against the agent type''s ConfigSchema (when one is published) in the server-side entity subclass. For Realtime-type co-agents this holds the realtime profile: preferred model, per-provider voice settings, tone/speaking style (folded into the session system prompt at mint), user-override policy, and narration pacing. Null = type defaults apply.';

COMMENT ON COLUMN __mj."AIAgentType"."ConfigSchema" IS 'JSON Schema (draft-07) describing the shape of TypeConfiguration payloads on agents of this type. When present, agent saves validate their TypeConfiguration against it server-side (MJAIAgentEntityServer.ValidateAsync); null = TypeConfiguration is freeform for this type.';

COMMENT ON COLUMN __mj."AIAgentType"."DefaultConfiguration" IS 'Type-level DEFAULT configuration JSON for agents of this type — the base layer of the effective-configuration merge: type DefaultConfiguration <- agent TypeConfiguration <- runtime overrides (later layers win per key, deep-merged). Must itself conform to ConfigSchema when one is published. Null = no type defaults.';

/* SQL generated to create new entity MJ: AI Agent Channels */
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
    '31a90934-e8e7-4ef9-8430-d63e8f224abd',
    'MJ: AI Agent Channels',
    'AI Agent Channels',
    NULL,
    NULL,
    'AIAgentChannel',
    'vwAIAgentChannels',
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

/* SQL generated to add new entity MJ: AI Agent Channels to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '31a90934-e8e7-4ef9-8430-d63e8f224abd',
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

/* SQL generated to add new permission for entity MJ: AI Agent Channels for role UI */
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
    '31a90934-e8e7-4ef9-8430-d63e8f224abd',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Channels for role Developer */
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
    '31a90934-e8e7-4ef9-8430-d63e8f224abd',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Channels for role Integration */
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
    '31a90934-e8e7-4ef9-8430-d63e8f224abd',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Agent Sessions */
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
    '17198778-e25a-4457-80af-9e8c4961dc29',
    'MJ: AI Agent Sessions',
    'AI Agent Sessions',
    NULL,
    NULL,
    'AIAgentSession',
    'vwAIAgentSessions',
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

/* SQL generated to add new entity MJ: AI Agent Sessions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '17198778-e25a-4457-80af-9e8c4961dc29',
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

/* SQL generated to add new permission for entity MJ: AI Agent Sessions for role UI */
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
    '17198778-e25a-4457-80af-9e8c4961dc29',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Sessions for role Developer */
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
    '17198778-e25a-4457-80af-9e8c4961dc29',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Sessions for role Integration */
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
    '17198778-e25a-4457-80af-9e8c4961dc29',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Agent Session Channels */
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
    '890bddc2-36d4-4330-9d37-655655e3491e',
    'MJ: AI Agent Session Channels',
    'AI Agent Session Channels',
    NULL,
    NULL,
    'AIAgentSessionChannel',
    'vwAIAgentSessionChannels',
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

/* SQL generated to add new entity MJ: AI Agent Session Channels to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '890bddc2-36d4-4330-9d37-655655e3491e',
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

/* SQL generated to add new permission for entity MJ: AI Agent Session Channels for role UI */
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
    '890bddc2-36d4-4330-9d37-655655e3491e',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Session Channels for role Developer */
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
    '890bddc2-36d4-4330-9d37-655655e3491e',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Session Channels for role Integration */
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
    '890bddc2-36d4-4330-9d37-655655e3491e',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Agent Co Agents */
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
    '75630af8-d6be-47ce-83ae-f9783d4c6a31',
    'MJ: AI Agent Co Agents',
    'AI Agent Co Agents',
    'Agent-to-agent affinity registry. Today: OPT-IN co-agent pairings — which underlying agents (or whole agent types) a Realtime-type co-agent can front in live sessions. A co-agent with NO rows is universal (fronts any single agent supplied at runtime — the zero-config default); rows restrict the co-agent to a prebuilt target list. The Type column reserves future relationship natures (Peer/Delegate/Fallback/Reviewer/Observer). Distinct from AIAgentRelationship, which wires agent-to-SUB-AGENT invocation (mappings, message modes); this table is peer affinity with no invocation config.',
    NULL,
    'AIAgentCoAgent',
    'vwAIAgentCoAgents',
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

/* SQL generated to add new entity MJ: AI Agent Co Agents to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '75630af8-d6be-47ce-83ae-f9783d4c6a31',
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

/* SQL generated to add new permission for entity MJ: AI Agent Co Agents for role UI */
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
    '75630af8-d6be-47ce-83ae-f9783d4c6a31',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Co Agents for role Developer */
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
    '75630af8-d6be-47ce-83ae-f9783d4c6a31',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Co Agents for role Integration */
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
    '75630af8-d6be-47ce-83ae-f9783d4c6a31',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

ALTER TABLE __mj."AIAgentSessionChannel"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSessionChannel */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSessionChannel */
UPDATE __mj."AIAgentSessionChannel" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentSessionChannel' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSessionChannel" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSessionChannel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentSessionChannel"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSessionChannel */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSessionChannel */
UPDATE __mj."AIAgentSessionChannel" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentSessionChannel' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSessionChannel" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSessionChannel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentSession"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSession */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSession */
UPDATE __mj."AIAgentSession" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentSession' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSession" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSession" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentSession"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSession */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSession */
UPDATE __mj."AIAgentSession" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentSession' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSession" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSession" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentChannel"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentChannel */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentChannel */
UPDATE __mj."AIAgentChannel" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentChannel' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentChannel" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentChannel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentChannel"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentChannel */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentChannel */
UPDATE __mj."AIAgentChannel" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentChannel' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentChannel" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentChannel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentCoAgent"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentCoAgent */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentCoAgent */
UPDATE __mj."AIAgentCoAgent" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentCoAgent' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentCoAgent" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentCoAgent" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentCoAgent"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentCoAgent */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentCoAgent */
UPDATE __mj."AIAgentCoAgent" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentCoAgent' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentCoAgent" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentCoAgent" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7e320744-89d1-4315-88de-29a8f59fd61f' OR ("EntityID" = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND "Name" = 'AgentSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7e320744-89d1-4315-88de-29a8f59fd61f', '5190AF93-4C39-4429-BDAA-0AEB492A0256' /* Entity: MJ: AI Agent Runs */, 100114, 'AgentSessionID', 'Agent Session ID', 'Links this run to the long-lived AIAgentSession it executed within. NULL for runs outside any real-time session. This is the persisted session reference and is distinct from the per-connection transport sessionID.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '17198778-E25A-4457-80AF-9E8C4961DC29', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '724adc60-12a5-4c77-8c7d-ac8f110ee069' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'DefaultCoAgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('724adc60-12a5-4c77-8c7d-ac8f110ee069', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' /* Entity: MJ: AI Agents */, 100144, 'DefaultCoAgentID', 'Default Co Agent ID', 'Default co-agent (a Realtime-type AI Agent) that voices THIS agent in real-time sessions — a per-agent persona. Overridden by the runtime coAgentId parameter; NULL falls through to a type-level AIAgentCoAgent default row, then the global default co-agent.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6f17dfc0-75fa-4f2a-9cf7-df90b51c1239' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'TypeConfiguration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6f17dfc0-75fa-4f2a-9cf7-df90b51c1239', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' /* Entity: MJ: AI Agents */, 100145, 'TypeConfiguration', 'Type Configuration', 'Agent-type-specific configuration JSON, validated against the agent type''s ConfigSchema (when one is published) in the server-side entity subclass. For Realtime-type co-agents this holds the realtime profile: preferred model, per-provider voice settings, tone/speaking style (folded into the session system prompt at mint), user-override policy, and narration pacing. Null = type defaults apply.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a1045c5b-01ce-47d7-8738-ed980447b714' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'ConfigSchema')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a1045c5b-01ce-47d7-8738-ed980447b714', '65CDC348-C4A6-4D00-A57B-2D489C56F128' /* Entity: MJ: AI Agent Types */, 100035, 'ConfigSchema', 'Config Schema', 'JSON Schema (draft-07) describing the shape of TypeConfiguration payloads on agents of this type. When present, agent saves validate their TypeConfiguration against it server-side (MJAIAgentEntityServer.ValidateAsync); null = TypeConfiguration is freeform for this type.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd82ebc4-4921-4c5b-a0a8-a8f0a50201ca' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'DefaultConfiguration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd82ebc4-4921-4c5b-a0a8-a8f0a50201ca', '65CDC348-C4A6-4D00-A57B-2D489C56F128' /* Entity: MJ: AI Agent Types */, 100036, 'DefaultConfiguration', 'Default Configuration', 'Type-level DEFAULT configuration JSON for agents of this type — the base layer of the effective-configuration merge: type DefaultConfiguration <- agent TypeConfiguration <- runtime overrides (later layers win per key, deep-merged). Must itself conform to ConfigSchema when one is published. Null = no type defaults.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '09433588-7e71-406b-b1b7-5621c66a23e4' OR ("EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AgentSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('09433588-7e71-406b-b1b7-5621c66a23e4', '12248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Conversation Details */, 100064, 'AgentSessionID', 'Agent Session ID', 'Links this message to the AIAgentSession that was active when it was created. NULL for messages typed in standard text chat outside any live session. Lets the conversation timeline group a sessions messages into a single collapsible block.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '17198778-E25A-4457-80AF-9E8C4961DC29', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9ffc3f0e-9ba1-47e4-9f62-3adc7bd36d97' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9ffc3f0e-9ba1-47e4-9f62-3adc7bd36d97', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'db2a3ad4-0bdd-4e45-841a-ae153561eb9d' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = 'AgentSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('db2a3ad4-0bdd-4e45-841a-ae153561eb9d', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100002, 'AgentSessionID', 'Agent Session ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '17198778-E25A-4457-80AF-9E8C4961DC29', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '36e1284d-2ecd-4bcf-8106-61826ba463d6' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = 'ChannelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('36e1284d-2ecd-4bcf-8106-61826ba463d6', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100003, 'ChannelID', 'Channel ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '31A90934-E8E7-4EF9-8430-D63E8F224ABD', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a4e90a34-9aa9-4893-aeb6-cba1ca8beaba' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a4e90a34-9aa9-4893-aeb6-cba1ca8beaba', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100004, 'Status', 'Status', 'Connection status of this channel instance within the session.', 'nvarchar', 40, 0, 0, FALSE, 'Connecting', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88142f45-e55b-451d-a19e-9019ebc1d0fa' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = 'SocketUrl')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('88142f45-e55b-451d-a19e-9019ebc1d0fa', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100005, 'SocketUrl', 'Socket Url', 'Socket URL handed to the client for this channel. NULL for PubSub channels, which ride the shared session subscription rather than a dedicated socket.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83fbef85-15ea-49bc-98b1-5e01c7a8e811' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = 'Config')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('83fbef85-15ea-49bc-98b1-5e01c7a8e811', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100006, 'Config', 'Config', 'JSON of per-instance channel configuration/state, validated against the channel definitions ConfigSchema.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1becf7c6-e23a-4b33-8523-d22d24343c49' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = 'LastActiveAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1becf7c6-e23a-4b33-8523-d22d24343c49', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100007, 'LastActiveAt', 'Last Active At', 'Timestamp of the last activity (or heartbeat) on this channel instance.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '50dc2f03-fb29-456f-80ab-deee88e853dc' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = 'DisconnectedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('50dc2f03-fb29-456f-80ab-deee88e853dc', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100008, 'DisconnectedAt', 'Disconnected At', 'When this channel instance disconnected. NULL while still connected.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '84c3df80-7281-45b8-b611-b410a4f3a0f2' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('84c3df80-7281-45b8-b611-b410a4f3a0f2', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100009, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d29a15d-79b2-4ac9-a6eb-45c4dace0960' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4d29a15d-79b2-4ac9-a6eb-45c4dace0960', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100010, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '225945bf-c48d-4ed4-80a1-68dced2c7618' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('225945bf-c48d-4ed4-80a1-68dced2c7618', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '62d4d186-8e26-4d02-a6c2-aaec8473cbd9' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'AgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('62d4d186-8e26-4d02-a6c2-aaec8473cbd9', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100002, 'AgentID', 'Agent ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '751ae972-9b9a-4795-a632-c86e51b13fed' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('751ae972-9b9a-4795-a632-c86e51b13fed', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100003, 'UserID', 'User ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cdc6edfe-8983-4c17-82a0-3cd59902ea8e' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cdc6edfe-8983-4c17-82a0-3cd59902ea8e', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100004, 'Status', 'Status', 'Lifecycle status of the session. Active = traffic flowing; Idle = connected but quiet beyond the idle threshold; Closed = terminal (ClosedAt set, channels disconnected).', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '831c7fb9-30b7-42da-bef8-07eda831816a' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'ConversationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('831c7fb9-30b7-42da-bef8-07eda831816a', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100005, 'ConversationID', 'Conversation ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '13248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '661f0a42-1e79-482e-ba61-7095214a2f2a' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'LastSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('661f0a42-1e79-482e-ba61-7095214a2f2a', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100006, 'LastSessionID', 'Last Session ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '17198778-E25A-4457-80AF-9E8C4961DC29', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5071c101-4906-4ccb-9988-29252b254457' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'HostInstanceID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5071c101-4906-4ccb-9988-29252b254457', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100007, 'HostInstanceID', 'Host Instance ID', 'Identifier of the server node currently hosting this sessions in-memory sockets (e.g. hostname:pid:bootId). Used for affinity and janitor orphan reconciliation.', 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '17c49d62-83b7-4a73-a394-ed9ac308c937' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'Config')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('17c49d62-83b7-4a73-a394-ed9ac308c937', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100008, 'Config', 'Config', 'JSON block for free-form, low-traffic session-specific state and variables.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '43cc6270-1f56-499f-b2cc-614c40ea7cc7' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'LastActiveAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('43cc6270-1f56-499f-b2cc-614c40ea7cc7', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100009, 'LastActiveAt', 'Last Active At', 'Timestamp of the last activity on the session. Bubbled up from the most-recently-active channel; used by the heartbeat and staleness sweep.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9fe5135f-a74d-4796-b964-b147b8cbcb83' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'ClosedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9fe5135f-a74d-4796-b964-b147b8cbcb83', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100010, 'ClosedAt', 'Closed At', 'When the session was closed (terminal). NULL while the session is Active or Idle.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b84df363-5908-4df6-be35-75ed371b328e' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'CloseReason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b84df363-5908-4df6-be35-75ed371b328e', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100011, 'CloseReason', 'Close Reason', 'Why the session was closed: Explicit (user hang-up / deliberate API close), Janitor (orphan or staleness sweep), Shutdown (graceful server shutdown), Error (session failure). NULL while the session is Active/Idle.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7972c1b8-81b4-47f7-9872-18780efd07ff' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7972c1b8-81b4-47f7-9872-18780efd07ff', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100012, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c2688ba1-6e89-436a-8080-625405edeaa8' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c2688ba1-6e89-436a-8080-625405edeaa8', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100013, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'db44a6c4-baf0-4359-b418-e5fb718ee90e' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('db44a6c4-baf0-4359-b418-e5fb718ee90e', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c90ce2da-e8d8-4d71-973c-fe59f5d418c4' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c90ce2da-e8d8-4d71-973c-fe59f5d418c4', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100002, 'Name', 'Name', 'Unique channel definition name (e.g. VoiceAudio, TextChat, ClientControl, Whiteboard).', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0ad5c52d-1798-4641-ad57-ffba62e2c76b' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ad5c52d-1798-4641-ad57-ffba62e2c76b', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100003, 'Description', 'Description', 'Optional human-readable description of what the channel surface does.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f73f7460-ff98-4456-ba1b-dc4de6aa4084' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'ServerPluginClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f73f7460-ff98-4456-ba1b-dc4de6aa4084', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100004, 'ServerPluginClass', 'Server Plugin Class', 'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance on the server. MUST match the @RegisterClass key on the concrete server-side channel plugin.', 'nvarchar', 500, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '082adea5-d3dc-45fe-94bf-3ef4f00213b7' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'ClientPluginClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('082adea5-d3dc-45fe-94bf-3ef4f00213b7', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100005, 'ClientPluginClass', 'Client Plugin Class', 'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance on the client. MUST match the @RegisterClass key on the concrete client-side channel plugin (typically an Angular component).', 'nvarchar', 500, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1156a613-e382-407f-b854-78726bea9935' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'TransportType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1156a613-e382-407f-b854-78726bea9935', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100006, 'TransportType', 'Transport Type', 'Which transport plane this channel rides: PubSub (the shared control plane), WebRTC (binary media), or WebSocket.', 'nvarchar', 40, 0, 0, FALSE, 'PubSub', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aa605081-b521-4529-990f-3a6f0ca7bb6c' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'ConfigSchema')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aa605081-b521-4529-990f-3a6f0ca7bb6c', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100007, 'ConfigSchema', 'Config Schema', 'Optional JSON Schema used to validate the per-instance channel configuration (AIAgentSessionChannel.Config).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c8cbc42f-51b8-45d1-8881-e2919a9c7f57' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'IsActive')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c8cbc42f-51b8-45d1-8881-e2919a9c7f57', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100008, 'IsActive', 'Is Active', 'Whether this channel definition is available for use. Inactive channels cannot be attached to a session.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7f7e3f6b-81ab-438c-94f8-7de7dd4d1fbb' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7f7e3f6b-81ab-438c-94f8-7de7dd4d1fbb', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100009, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7ea84205-06e2-4257-bd39-3de60eb0969f' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7ea84205-06e2-4257-bd39-3de60eb0969f', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100010, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a914d9e4-63fa-4f77-b80b-2a94aef836cc' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a914d9e4-63fa-4f77-b80b-2a94aef836cc', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8c767332-afbb-4207-bec8-94ce794824c3' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'CoAgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8c767332-afbb-4207-bec8-94ce794824c3', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100002, 'CoAgentID', 'Co Agent ID', 'The relationship OWNER. For Type=CoAgent this is the Realtime-type co-agent (the live voice); it must be an Active agent of the Realtime type (enforced server-side). For reserved future types, the agent the relationship is read FROM.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '150e86bc-0e3f-43f9-a3f5-096acac6eb20' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'TargetAgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('150e86bc-0e3f-43f9-a3f5-096acac6eb20', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100003, 'TargetAgentID', 'Target Agent ID', 'A specific paired agent — for Type=CoAgent, an underlying agent this co-agent can front. Exactly one of TargetAgentID / TargetAgentTypeID is set per row.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c7bb80ce-1f61-4382-ad27-aa8f3a90b8a1' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'TargetAgentTypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c7bb80ce-1f61-4382-ad27-aa8f3a90b8a1', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100004, 'TargetAgentTypeID', 'Target Agent Type ID', 'A whole agent TYPE as the paired side — for Type=CoAgent, this co-agent applies to every agent of the type (with IsDefault=1, it is the type-level default co-agent, replacing a column-based default that would create an AIAgent↔AIAgentType FK cycle). Exactly one of TargetAgentID / TargetAgentTypeID is set per row.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '65CDC348-C4A6-4D00-A57B-2D489C56F128', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ead906c9-f5b5-4a51-9317-1660596fca55' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'Type')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ead906c9-f5b5-4a51-9317-1660596fca55', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100005, 'Type', 'Type', 'Nature of the relationship, read CoAgentID → target side. CoAgent = the owner can front the target in realtime sessions (the ONLY type implemented today). Peer (agent-to-agent conversation partners), Delegate (handoff/escalation), Fallback (substitute when owner unavailable), Reviewer (target reviews owner output), Observer (target observes owner sessions) are RESERVED for future features — the vocabulary ships now so generated string-union types stay stable.', 'nvarchar', 60, 0, 0, FALSE, 'CoAgent', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f5b14d16-b819-463d-b97f-6c785d86f44b' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'IsDefault')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f5b14d16-b819-463d-b97f-6c785d86f44b', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100006, 'IsDefault', 'Is Default', 'When 1: for a TargetAgentID row, this target is the co-agent''s default underlying agent (used when a session starts against the co-agent without an explicit runtime target); for a TargetAgentTypeID row, this co-agent is the default co-agent for agents of that type. At most one default per (CoAgentID, Type) is enforced server-side.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e2643473-0ec5-431c-ad4a-caceb3c9c802' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e2643473-0ec5-431c-ad4a-caceb3c9c802', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100007, 'Sequence', 'Sequence', 'Display/priority order of this pairing in target-agent pickers and resolution ties (ascending).', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '06586f5b-80bc-4c50-9344-6ece5b385a76' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('06586f5b-80bc-4c50-9344-6ece5b385a76', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100008, 'Status', 'Status', 'Whether this pairing participates in resolution. Disabled rows are kept for audit/toggling but ignored by the resolution chain and pickers.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5e948203-f31b-44b4-b223-0c61c5786731' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5e948203-f31b-44b4-b223-0c61c5786731', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100009, 'Configuration', 'Configuration', 'Optional per-relationship configuration JSON (shape owned by the Type, e.g. a future Peer arena''s turn budget). NULL for plain pairings.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ed57a344-e01d-4507-b46f-cbd4b1dd9b0e' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ed57a344-e01d-4507-b46f-cbd4b1dd9b0e', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb1e2562-cb98-42bf-9c53-9a0048d1087d' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eb1e2562-cb98-42bf-9c53-9a0048d1087d', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID c80179a9-65de-4d0d-a15d-6bdd2189a7c8 */
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
    'c80179a9-65de-4d0d-a15d-6bdd2189a7c8',
    '1156A613-E382-407F-B854-78726BEA9935',
    1,
    'PubSub',
    'PubSub',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 0faa5c1b-6705-4e1a-bd0b-10a5116e7573 */
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
    '0faa5c1b-6705-4e1a-bd0b-10a5116e7573',
    '1156A613-E382-407F-B854-78726BEA9935',
    2,
    'WebRTC',
    'WebRTC',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 0f1f6585-476d-4196-b1fa-fd82bc8cdce4 */
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
    '0f1f6585-476d-4196-b1fa-fd82bc8cdce4',
    '1156A613-E382-407F-B854-78726BEA9935',
    3,
    'WebSocket',
    'WebSocket',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 1156A613-E382-407F-B854-78726BEA9935 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '1156A613-E382-407F-B854-78726BEA9935';

/* SQL text to insert entity field value with ID d6e5b871-9891-4687-87d4-9775298451df */
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
    'd6e5b871-9891-4687-87d4-9775298451df',
    'CDC6EDFE-8983-4C17-82A0-3CD59902EA8E',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID a179df7f-b1e0-4a07-860d-4066febb6be8 */
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
    'a179df7f-b1e0-4a07-860d-4066febb6be8',
    'CDC6EDFE-8983-4C17-82A0-3CD59902EA8E',
    2,
    'Closed',
    'Closed',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 17223d09-62e4-4a1b-b7a6-7d666cf97c22 */
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
    '17223d09-62e4-4a1b-b7a6-7d666cf97c22',
    'CDC6EDFE-8983-4C17-82A0-3CD59902EA8E',
    3,
    'Idle',
    'Idle',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID CDC6EDFE-8983-4C17-82A0-3CD59902EA8E */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'CDC6EDFE-8983-4C17-82A0-3CD59902EA8E';

/* SQL text to insert entity field value with ID 79a4dfef-fab7-499b-934a-cce88f224495 */
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
    '79a4dfef-fab7-499b-934a-cce88f224495',
    'B84DF363-5908-4DF6-BE35-75ED371B328E',
    1,
    'Error',
    'Error',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 36f76635-83a9-4642-b972-9780b03b52bd */
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
    '36f76635-83a9-4642-b972-9780b03b52bd',
    'B84DF363-5908-4DF6-BE35-75ED371B328E',
    2,
    'Explicit',
    'Explicit',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 5bb3f39d-4bba-4838-acce-9382a33b9b35 */
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
    '5bb3f39d-4bba-4838-acce-9382a33b9b35',
    'B84DF363-5908-4DF6-BE35-75ED371B328E',
    3,
    'Janitor',
    'Janitor',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID d1ab61f6-b698-4060-b320-f8fa7ccdb52c */
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
    'd1ab61f6-b698-4060-b320-f8fa7ccdb52c',
    'B84DF363-5908-4DF6-BE35-75ED371B328E',
    4,
    'Shutdown',
    'Shutdown',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID B84DF363-5908-4DF6-BE35-75ED371B328E */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B84DF363-5908-4DF6-BE35-75ED371B328E';

/* SQL text to insert entity field value with ID 5a135ee3-fe29-4520-a159-1bf64e7d95c9 */
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
    '5a135ee3-fe29-4520-a159-1bf64e7d95c9',
    'A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA',
    1,
    'Connected',
    'Connected',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID c0bda07e-db05-4797-b3a3-8b8e337cbca9 */
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
    'c0bda07e-db05-4797-b3a3-8b8e337cbca9',
    'A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA',
    2,
    'Connecting',
    'Connecting',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID b5d7de04-ec93-4500-8533-85f97af65a62 */
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
    'b5d7de04-ec93-4500-8533-85f97af65a62',
    'A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA',
    3,
    'Disconnected',
    'Disconnected',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 2c4b6194-e3d6-4e89-b8b8-75cd4d2e362d */
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
    '2c4b6194-e3d6-4e89-b8b8-75cd4d2e362d',
    'A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA',
    4,
    'Paused',
    'Paused',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA';

/* SQL text to insert entity field value with ID 5e9149da-2a6b-48fb-b0bd-2f12d43f02b6 */
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
    '5e9149da-2a6b-48fb-b0bd-2f12d43f02b6',
    'EAD906C9-F5B5-4A51-9317-1660596FCA55',
    1,
    'CoAgent',
    'CoAgent',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID a3f849e0-311d-4da0-b9f9-982206fd490a */
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
    'a3f849e0-311d-4da0-b9f9-982206fd490a',
    'EAD906C9-F5B5-4A51-9317-1660596FCA55',
    2,
    'Delegate',
    'Delegate',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 2f558848-f409-4999-8225-50a3bc0c3661 */
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
    '2f558848-f409-4999-8225-50a3bc0c3661',
    'EAD906C9-F5B5-4A51-9317-1660596FCA55',
    3,
    'Fallback',
    'Fallback',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID a8587a88-cad5-4d49-bb04-73845db9aaf7 */
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
    'a8587a88-cad5-4d49-bb04-73845db9aaf7',
    'EAD906C9-F5B5-4A51-9317-1660596FCA55',
    4,
    'Observer',
    'Observer',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID adcda55c-71f0-4883-b98d-2b0e8c152507 */
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
    'adcda55c-71f0-4883-b98d-2b0e8c152507',
    'EAD906C9-F5B5-4A51-9317-1660596FCA55',
    5,
    'Peer',
    'Peer',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 3e79fec9-d15e-431a-b334-81dfb4fd9239 */
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
    '3e79fec9-d15e-431a-b334-81dfb4fd9239',
    'EAD906C9-F5B5-4A51-9317-1660596FCA55',
    6,
    'Reviewer',
    'Reviewer',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID EAD906C9-F5B5-4A51-9317-1660596FCA55 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'EAD906C9-F5B5-4A51-9317-1660596FCA55';

/* SQL text to insert entity field value with ID 751bb578-9eab-44c2-9be3-ded85f3b9ecb */
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
    '751bb578-9eab-44c2-9be3-ded85f3b9ecb',
    '06586F5B-80BC-4C50-9344-6ECE5B385A76',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID bb2f5c58-c02d-4bef-a321-a573463029dc */
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
    'bb2f5c58-c02d-4bef-a321-a573463029dc',
    '06586F5B-80BC-4C50-9344-6ECE5B385A76',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 06586F5B-80BC-4C50-9344-6ECE5B385A76 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '06586F5B-80BC-4C50-9344-6ECE5B385A76';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b164d4ca-0e3b-4e75-b904-d76dfb2f615f') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b164d4ca-0e3b-4e75-b904-d76dfb2f615f', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '17198778-E25A-4457-80AF-9E8C4961DC29', 'AgentID', 'One To Many', TRUE, TRUE, 28, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b428d54f-59f1-4838-bf14-8b0b5f310ee4') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b428d54f-59f1-4838-bf14-8b0b5f310ee4', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'DefaultCoAgentID', 'One To Many', TRUE, TRUE, 29, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a29ac4e5-78dc-449f-b7ac-89e9a29190fb') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a29ac4e5-78dc-449f-b7ac-89e9a29190fb', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31', 'CoAgentID', 'One To Many', TRUE, TRUE, 30, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6e8697b9-d0fb-4d90-bbeb-99a568bceb91') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6e8697b9-d0fb-4d90-bbeb-99a568bceb91', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31', 'TargetAgentID', 'One To Many', TRUE, TRUE, 31, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8db92593-2422-4f7f-b5ac-d32d0ade5463') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8db92593-2422-4f7f-b5ac-d32d0ade5463', '65CDC348-C4A6-4D00-A57B-2D489C56F128', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31', 'TargetAgentTypeID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2c879eee-b163-42af-8296-e27a903997c7') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c879eee-b163-42af-8296-e27a903997c7', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '17198778-E25A-4457-80AF-9E8C4961DC29', 'UserID', 'One To Many', TRUE, TRUE, 102, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '90f611c4-eb32-4e12-8aa4-57e931afe395') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('90f611c4-eb32-4e12-8aa4-57e931afe395', '13248F34-2837-EF11-86D4-6045BDEE16E6', '17198778-E25A-4457-80AF-9E8C4961DC29', 'ConversationID', 'One To Many', TRUE, TRUE, 7, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '25cce2b7-2b93-467a-b114-081c5ef042e1') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('25cce2b7-2b93-467a-b114-081c5ef042e1', '17198778-E25A-4457-80AF-9E8C4961DC29', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'AgentSessionID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9c6f50c5-8465-4d14-8b30-3fb3a0d7c03d') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9c6f50c5-8465-4d14-8b30-3fb3a0d7c03d', '17198778-E25A-4457-80AF-9E8C4961DC29', '890BDDC2-36D4-4330-9D37-655655E3491E', 'AgentSessionID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'aa861d5b-d876-407c-bc71-9c26938a60cd') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aa861d5b-d876-407c-bc71-9c26938a60cd', '17198778-E25A-4457-80AF-9E8C4961DC29', '12248F34-2837-EF11-86D4-6045BDEE16E6', 'AgentSessionID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '3ceef1f8-6c29-44ab-8d8a-97714cbb0813') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3ceef1f8-6c29-44ab-8d8a-97714cbb0813', '17198778-E25A-4457-80AF-9E8C4961DC29', '17198778-E25A-4457-80AF-9E8C4961DC29', 'LastSessionID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0d8ff92a-662d-47cf-86ad-b0330b03d784') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0d8ff92a-662d-47cf-86ad-b0330b03d784', '31A90934-E8E7-4EF9-8430-D63E8F224ABD', '890BDDC2-36D4-4330-9D37-655655E3491E', 'ChannelID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aac9da92-2bbe-4599-b742-4ae9e01da10b' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'DefaultCoAgent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aac9da92-2bbe-4599-b742-4ae9e01da10b', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' /* Entity: MJ: AI Agents */, 100154, 'DefaultCoAgent', 'Default Co Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1861e78b-4306-44ca-8e62-70991a1f58ca' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'RootDefaultCoAgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1861e78b-4306-44ca-8e62-70991a1f58ca', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' /* Entity: MJ: AI Agents */, 100156, 'RootDefaultCoAgentID', 'Root Default Co Agent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd29f840-a7e8-411e-a3e8-6083a4b06f01' OR ("EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E' AND "Name" = 'Channel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cd29f840-a7e8-411e-a3e8-6083a4b06f01', '890BDDC2-36D4-4330-9D37-655655E3491E' /* Entity: MJ: AI Agent Session Channels */, 100021, 'Channel', 'Channel', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7bd7e62f-626f-4a86-a358-f02911ba1e22' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'Agent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7bd7e62f-626f-4a86-a358-f02911ba1e22', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100027, 'Agent', 'Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c809f411-2b44-4cf2-a3cb-21579231a875' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c809f411-2b44-4cf2-a3cb-21579231a875', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100028, 'User', 'User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c8e511f7-8847-48e6-b121-ce54904b5ff6' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'Conversation')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c8e511f7-8847-48e6-b121-ce54904b5ff6', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100029, 'Conversation', 'Conversation', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8536fed0-75f7-4bf4-addb-3c2b353e2d59' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'RootLastSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8536fed0-75f7-4bf4-addb-3c2b353e2d59', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, 100030, 'RootLastSessionID', 'Root Last Session ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3aad2738-791b-4a65-91ae-362ff97d7921' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'CoAgent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3aad2738-791b-4a65-91ae-362ff97d7921', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100023, 'CoAgent', 'Co Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1c0ccca8-d687-4dca-888d-512a92571093' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'TargetAgent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1c0ccca8-d687-4dca-888d-512a92571093', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100024, 'TargetAgent', 'Target Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3e367406-0d0c-4d58-8989-ec1eb78bbb33' OR ("EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' AND "Name" = 'TargetAgentType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3e367406-0d0c-4d58-8989-ec1eb78bbb33', '75630AF8-D6BE-47CE-83AE-F9783D4C6A31' /* Entity: MJ: AI Agent Co Agents */, 100025, 'TargetAgentType', 'Target Agent Type', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1156A613-E382-407F-B854-78726BEA9935'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C8CBC42F-51B8-45D1-8881-E2919A9C7F57'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '0AD5C52D-1798-4641-AD57-FFBA62E2C76B'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '1156A613-E382-407F-B854-78726BEA9935'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'C90CE2DA-E8D8-4D71-973C-FE59F5D418C4'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '1156A613-E382-407F-B854-78726BEA9935'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1BECF7C6-E23A-4B33-8523-D22D24343C49'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '50DC2F03-FB29-456F-80AB-DEEE88E853DC'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'CD29F840-A7E8-411E-A3E8-6083A4B06F01'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'CD29F840-A7E8-411E-A3E8-6083A4B06F01'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'CD29F840-A7E8-411E-A3E8-6083A4B06F01'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4AEB4F4F-664A-409A-AD4E-FD96800BF5FF'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '5C0C0D1C-4B14-417E-9280-B4545A8AF1EF'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'CDC6EDFE-8983-4C17-82A0-3CD59902EA8E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '43CC6270-1F56-499F-B2CC-614C40EA7CC7'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '9FE5135F-A74D-4796-B964-B147B8CBCB83'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '7BD7E62F-626F-4A86-A358-F02911BA1E22'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C809F411-2B44-4CF2-A3CB-21579231A875'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '7BD7E62F-626F-4A86-A358-F02911BA1E22'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'C809F411-2B44-4CF2-A3CB-21579231A875'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'C8E511F7-8847-48E6-B121-CE54904B5FF6'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '7BD7E62F-626F-4A86-A358-F02911BA1E22'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'C809F411-2B44-4CF2-A3CB-21579231A875'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'C8E511F7-8847-48E6-B121-CE54904B5FF6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'EAD906C9-F5B5-4A51-9317-1660596FCA55'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'F5B14D16-B819-463D-B97F-6C785D86F44B'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '06586F5B-80BC-4C50-9344-6ECE5B385A76'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3AAD2738-791B-4A65-91AE-362FF97D7921'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1C0CCCA8-D687-4DCA-888D-512A92571093'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3E367406-0D0C-4D58-8989-EC1EB78BBB33'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '3AAD2738-791B-4A65-91AE-362FF97D7921'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '1C0CCCA8-D687-4DCA-888D-512A92571093'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '3E367406-0D0C-4D58-8989-EC1EB78BBB33'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '0D4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '134E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '695817F0-6F36-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '0D4E17F0-6F36-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '124E17F0-6F36-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = '12248F34-2837-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '38A3F73F-9364-428E-A195-5DF74B9F9ACB'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 10 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Channels.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DB44A6C4-BAF0-4359-B418-E5FB718EE90E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.Name */
UPDATE __mj."EntityField" SET "Category" = 'Channel Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C90CE2DA-E8D8-4D71-973C-FE59F5D418C4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.Description */
UPDATE __mj."EntityField" SET "Category" = 'Channel Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0AD5C52D-1798-4641-AD57-FFBA62E2C76B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.IsActive */
UPDATE __mj."EntityField" SET "Category" = 'Channel Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C8CBC42F-51B8-45D1-8881-E2919A9C7F57' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.TransportType */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1156A613-E382-407F-B854-78726BEA9935' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.ServerPluginClass */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F73F7460-FF98-4456-BA1B-DC4DE6AA4084' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.ClientPluginClass */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '082ADEA5-D3DC-45FE-94BF-3EF4F00213B7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.ConfigSchema */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Configuration Schema', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'AA605081-B521-4529-990F-3A6F0CA7BB6C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7F7E3F6B-81AB-438C-94F8-7DE7DD4D1FBB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7EA84205-06E2-4257-BD39-3DE60EB0969F' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-broadcast-tower */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-broadcast-tower', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD';

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
    'c44e6d16-ca38-4b62-880f-49aa7cdc2e47',
    '31A90934-E8E7-4EF9-8430-D63E8F224ABD',
    'FieldCategoryInfo',
    '{"Channel Definition":{"icon":"fa fa-info-circle","description":"Basic identification and status settings for the AI channel"},"Technical Configuration":{"icon":"fa fa-cogs","description":"Low-level driver, transport, and schema configuration settings"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}',
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
    '91bed0fd-7b40-4e8e-a30f-7f43d652ad32',
    '31A90934-E8E7-4EF9-8430-D63E8F224ABD',
    'FieldCategoryIcons',
    '{"Channel Definition":"fa fa-info-circle","Technical Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD';

/* Set categories for 19 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Types.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5BDF7CC2-8BB6-4B10-A69B-F5C4EF647FAF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5C0C0D1C-4B14-417E-9280-B4545A8AF1EF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0C6E768F-C587-4538-BC48-C869854F3A18' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.SystemPromptID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '24424A6A-C0E3-4DB0-9AF1-551D12AE7E10' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.AgentPromptPlaceholder */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '47FCBE6A-43EA-47FA-912B-ACB82A311471' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.PromptParamsSchema */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt Parameters Schema', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '41DA3898-26C0-4AE9-B934-84EA97C726B7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.SystemPrompt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'System Prompt Content', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '200792E6-E7EC-4293-A821-77B42A49DAB5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.IsActive */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Is Active', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '980B9BE8-5C4E-45A4-BE62-32874A339AF6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.DriverClass */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DB83502E-F00C-4CF8-AD0E-FFE9BF3C8904' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.UIFormSectionKey */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7763B64B-E410-4247-89DE-5E9E565F15A0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.UIFormKey */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FAC68362-126A-4F7E-B706-8DD7B40897A1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.UIFormSectionExpandedByDefault */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DA3D74E3-D1A2-4932-A1FB-4219F3BE1CC9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.AssignmentStrategy */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '27C830A6-A889-4A9C-908C-33BB7A6CDB37' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.ConfigSchema */
UPDATE __mj."EntityField" SET "Category" = 'Behavior & UI Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Configuration Schema', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'A1045C5B-01CE-47D7-8738-ED980447B714' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultConfiguration */
UPDATE __mj."EntityField" SET "Category" = 'Behavior & UI Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'FD82EBC4-4921-4C5B-A0A8-A8F0A50201CA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultStorageAccountID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6B31A64B-6BD8-446B-B306-0BDD65645694' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultStorageAccount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BC5FC66F-CDED-4316-8E1A-F0B3F0577F3D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7A190481-BB1D-4B6D-8EA1-E554E56B83B9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Types.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4AEB4F4F-664A-409A-AD4E-FD96800BF5FF' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 14 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A914D9E4-63FA-4F77-B80B-2A94AEF836CC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.CoAgentID */
UPDATE __mj."EntityField" SET "Category" = 'Agent Relationship', "GeneratedFormSection" = 'Category', "DisplayName" = 'Co-Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8C767332-AFBB-4207-BEC8-94CE794824C3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.CoAgent */
UPDATE __mj."EntityField" SET "Category" = 'Agent Relationship', "GeneratedFormSection" = 'Category', "DisplayName" = 'Co-Agent Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3AAD2738-791B-4A65-91AE-362FF97D7921' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.TargetAgentID */
UPDATE __mj."EntityField" SET "Category" = 'Agent Relationship', "GeneratedFormSection" = 'Category', "DisplayName" = 'Target Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '150E86BC-0E3F-43F9-A3F5-096ACAC6EB20' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.TargetAgent */
UPDATE __mj."EntityField" SET "Category" = 'Agent Relationship', "GeneratedFormSection" = 'Category', "DisplayName" = 'Target Agent Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1C0CCCA8-D687-4DCA-888D-512A92571093' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.TargetAgentTypeID */
UPDATE __mj."EntityField" SET "Category" = 'Agent Relationship', "GeneratedFormSection" = 'Category', "DisplayName" = 'Target Agent Type', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C7BB80CE-1F61-4382-AD27-AA8F3A90B8A1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.TargetAgentType */
UPDATE __mj."EntityField" SET "Category" = 'Agent Relationship', "GeneratedFormSection" = 'Category', "DisplayName" = 'Target Agent Type Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3E367406-0D0C-4D58-8989-EC1EB78BBB33' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.Type */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Relationship Type', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EAD906C9-F5B5-4A51-9317-1660596FCA55' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.IsDefault */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F5B14D16-B819-463D-B97F-6C785D86F44B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.Sequence */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E2643473-0EC5-431C-AD4A-CACEB3C9C802' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.Status */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '06586F5B-80BC-4C50-9344-6ECE5B385A76' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.Configuration */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '5E948203-F31B-44B4-B223-0C61C5786731' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ED57A344-E01D-4507-B46F-CBD4B1DD9B0E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Co Agents.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EB1E2562-CB98-42BF-9C53-9A0048D1087D' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 11 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9FFC3F0E-9BA1-47E4-9F62-3ADC7BD36D97' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.AgentSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Session', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DB2A3AD4-0BDD-4E45-841A-AE153561EB9D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.ChannelID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '36E1284D-2ECD-4BCF-8106-61826BA463D6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.Channel */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CD29F840-A7E8-411E-A3E8-6083A4B06F01' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.Status */
UPDATE __mj."EntityField" SET "Category" = 'Connection Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A4E90A34-9AA9-4893-AEB6-CBA1CA8BEABA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.SocketUrl */
UPDATE __mj."EntityField" SET "Category" = 'Connection Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Socket URL', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = '88142F45-E55B-451D-A19E-9019EBC1D0FA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.LastActiveAt */
UPDATE __mj."EntityField" SET "Category" = 'Connection Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1BECF7C6-E23A-4B33-8523-D22D24343C49' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.DisconnectedAt */
UPDATE __mj."EntityField" SET "Category" = 'Connection Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '50DC2F03-FB29-456F-80AB-DEEE88E853DC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.Config */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Configuration', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '83FBEF85-15EA-49BC-98B1-5E01C7A8E811' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '84C3DF80-7281-45B8-B611-B410A4F3A0F2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Session Channels.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4D29A15D-79B2-4AC9-A6EB-45C4DACE0960' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-plug */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-plug', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '890BDDC2-36D4-4330-9D37-655655E3491E';

/* Set entity icon to fa fa-users */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-users', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31';

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
    '86eb98b7-d215-4952-bd2a-55e6f8dc1f08',
    '75630AF8-D6BE-47CE-83AE-F9783D4C6A31',
    'FieldCategoryInfo',
    '{"Agent Relationship":{"icon":"fa fa-link","description":"Defines the primary co-agent and its associated target agents or agent types"},"Configuration":{"icon":"fa fa-sliders-h","description":"Settings for relationship type, priority, and behavior"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

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
    '23ff1b05-584f-4992-9907-9a5d8178ec9c',
    '890BDDC2-36D4-4330-9D37-655655E3491E',
    'FieldCategoryInfo',
    '{"Session Context":{"icon":"fa fa-info-circle","description":"Core identifiers linking this channel to an agent session"},"Connection Status":{"icon":"fa fa-signal","description":"Real-time connection state, socket information, and activity timestamps"},"Configuration":{"icon":"fa fa-cog","description":"Per-instance channel configuration settings"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}',
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
    '83bb7506-bbc7-4aa5-8939-95704ef2329c',
    '75630AF8-D6BE-47CE-83AE-F9783D4C6A31',
    'FieldCategoryIcons',
    '{"Agent Relationship":"fa fa-link","Configuration":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
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
    '442d629f-ecbd-4b97-940c-5ce8faf8bebe',
    '890BDDC2-36D4-4330-9D37-655655E3491E',
    'FieldCategoryIcons',
    '{"Session Context":"fa fa-info-circle","Connection Status":"fa fa-signal","Configuration":"fa fa-cog","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '75630AF8-D6BE-47CE-83AE-F9783D4C6A31';

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '890BDDC2-36D4-4330-9D37-655655E3491E';

/* Set categories for 17 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Sessions.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '225945BF-C48D-4ED4-80A1-68DCED2C7618' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.AgentID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '62D4D186-8E26-4D02-A6C2-AAEC8473CBD9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '751AE972-9B9A-4795-A632-C86E51B13FED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.ConversationID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '831C7FB9-30B7-42DA-BEF8-07EDA831816A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.Agent */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7BD7E62F-626F-4A86-A358-F02911BA1E22' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.User */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C809F411-2B44-4CF2-A3CB-21579231A875' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.Conversation */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C8E511F7-8847-48E6-B121-CE54904B5FF6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.Status */
UPDATE __mj."EntityField" SET "Category" = 'Session Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CDC6EDFE-8983-4C17-82A0-3CD59902EA8E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.LastActiveAt */
UPDATE __mj."EntityField" SET "Category" = 'Session Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '43CC6270-1F56-499F-B2CC-614C40EA7CC7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.ClosedAt */
UPDATE __mj."EntityField" SET "Category" = 'Session Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9FE5135F-A74D-4796-B964-B147B8CBCB83' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.CloseReason */
UPDATE __mj."EntityField" SET "Category" = 'Session Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B84DF363-5908-4DF6-BE35-75ED371B328E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.HostInstanceID */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5071C101-4906-4CCB-9988-29252B254457' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.Config */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Configuration', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '17C49D62-83B7-4A73-A394-ED9AC308C937' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.LastSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '661F0A42-1E79-482E-BA61-7095214A2F2A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.RootLastSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8536FED0-75F7-4BF4-ADDB-3C2B353E2D59' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7972C1B8-81B4-47F7-9872-18780EFD07FF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C2688BA1-6E89-436A-8080-625405EDEAA8' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-robot */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-robot', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '17198778-E25A-4457-80AF-9E8C4961DC29';

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
    '1f71b1b6-647e-4307-a068-c45f22424639',
    '17198778-E25A-4457-80AF-9E8C4961DC29',
    'FieldCategoryInfo',
    '{"Session Context":{"icon":"fa fa-user-circle","description":"Identifiers linking the session to agents, users, and conversations"},"Session Status":{"icon":"fa fa-clock","description":"Lifecycle tracking, activity timestamps, and session closure details"},"Technical Configuration":{"icon":"fa fa-wrench","description":"Low-level server affinity, session state, and historical chaining"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
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
    '101b1214-ea31-4e34-ad75-093838835112',
    '17198778-E25A-4457-80AF-9E8C4961DC29',
    'FieldCategoryIcons',
    '{"Session Context":"fa fa-user-circle","Session Status":"fa fa-clock","Technical Configuration":"fa fa-wrench","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29';

/* Set categories for 36 fields */ /* UPDATE Entity Field Category Info MJ: Conversation Details.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0B4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.ConversationID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0C4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.Role */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '124E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.Message */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '134E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.Error */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.HiddenToUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Hidden to User', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.SummaryOfEarlierConversation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation Summary', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '21B640E1-D21E-4E4B-95BC-E9862FD11C8A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.CompletionTime */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Completion Time (ms)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '55E7C54B-74F7-4E25-BF60-A79C28AD2410' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.IsPinned */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Pinned', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D04D36AE-BCB4-4DF2-8BB7-0ED3567FACF2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '64FAC701-8AB3-43C0-B741-71252122E8B0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.SuggestedResponses */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Suggested Responses (Legacy)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '79639F85-7B4A-4ACA-89B3-3D043D0AE9FB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.OriginalMessageChanged */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Message Modified', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F99F9670-A9A8-44BE-8F4F-1C3138490591' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.ExternalID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0D4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '695817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.TestRunID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B4BAC05B-4345-49B2-97B2-FB761777078D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.RootParentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Root Parent ID', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4F2FE5B3-6AD4-485C-AEBA-F7060064E62C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.UserRating */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ACAB0610-A4EA-433B-A39A-C2D6EFB46F59' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.UserFeedback */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C400A5F2-1BE3-4441-AEFA-06344A12AAB2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.ReflectionInsights */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E69363F6-164F-41B8-B521-889B56493CE9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.UserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '68EA370B-0AB9-45AF-A1EC-88A94329A3A2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.ArtifactID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E9AB7E01-35D5-4FDB-8C61-24292B0F0A19' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.ArtifactVersionID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ABF64F53-7927-4039-B5B8-DC07E8435B36' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.ParentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Message', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '14488A57-7BC6-455F-88DF-2264585DA63F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.AgentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8BE14CF2-2F23-4208-8313-91259D312DB2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.AgentSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Related Entities', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Session', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '09433588-7E71-406B-B1B7-5621C66A23E4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.Conversation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6D4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.User */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'User Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '50D773C6-6E9F-4C00-AAE3-A284ABE38676' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.Artifact */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Artifact Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D350E5F8-8128-4A32-851E-BA6A227E4D5C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.ArtifactVersion */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Artifact Version Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D510523A-90B9-4797-B1B9-83B5C16AC117' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.Parent */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6B4B63C2-91A7-4B53-ABAC-E15AA9600FEB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.Agent */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6C6CC59F-D153-47DB-A664-3C9884B07059' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.TestRun */
UPDATE __mj."EntityField" SET "Category" = 'Related Entities', "GeneratedFormSection" = 'Category', "DisplayName" = 'Test Run Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '84FA19A3-7667-43C6-9273-070A9A925D7F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.ResponseForm */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '811099AE-EFF5-4BAE-BFD1-66F68F95C36E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.ActionableCommands */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '2433C81E-0921-404B-969F-7A37DBF23D4A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Details.AutomaticCommands */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '5D185550-A536-43BD-8A45-1324F35B7BA1' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 64 fields */ /* UPDATE Entity Field Category Info MJ: AI Agent Runs.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0CDCEFDE-FBFE-44CD-ACAF-A1543F309EC4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4B5B91C2-2D8D-441D-9281-19089EF7B21E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ParentRunID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8BE780BC-757D-4AC0-9ECC-5C9FFBAA38FD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.LastRunID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '44D62D04-D013-4C3B-A535-555E3AA388BB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.RunName */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '51A944B0-A282-4ED0-9D4E-1EE41498065A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ScheduledJobRunID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '77918E52-6BA1-4FA6-9AE1-F5987906D0C8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ExternalReferenceID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '40EA5AB0-58A3-4CCE-B7E1-C9BB56E7D5A4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ParentRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Run Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D94F2321-5DCA-4B11-8E17-57DC851BFDC5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.LastRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Last Run Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2996B20E-9DFD-41C8-A810-B0EC3038622B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ScheduledJobRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Scheduled Job Run Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3C30AB32-15A4-460D-9955-DD89EDEF5F62' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.RootParentRunID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A860DAE5-5AA8-4EBE-9C5F-914AFDD0E3C6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.RootLastRunID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D3B3BBE7-627B-4A67-BFC3-81C2F248B9ED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E1F5A7A4-9248-4C45-9D74-04E7B44A1DD5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.StartedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '025D0895-4A17-4168-8B38-9B9C6D68CFD8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.CompletedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '80FAFCF2-539E-4A38-86CD-9E9395C8664F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Success */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B3C8FBEA-CA05-462D-94E5-7B4875446A79' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ErrorMessage */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '057C84E7-BAD3-405A-B2B9-5D13551EFCD4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Result */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '974746E9-53D2-484B-AFF3-9B7D9292D6B7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentState */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6FF56877-27AE-47D9-A6CD-641088C2458E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.CancellationReason */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '14A76D05-D24C-4EE0-B24E-B840DD330F60' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.FinalStep */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.FinalPayload */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6FFF2754-A03E-4DFD-AC17-FB16CDAD5346' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Message */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0B55CD7D-06C3-485C-9FC0-CF4C33D66DF5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.StartingPayload */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B106357D-347F-45BE-89AA-B96298ED1DDA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptIterations */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7411D673-9C57-4419-96BA-1C607B77DA43' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Data */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Input Data', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '08037344-3952-4EBE-BA34-F87BD670C61A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Verbose */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '07CD2EF5-1737-4662-BE76-301A3E88BD9D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Comments */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6962DE96-798F-4E1C-AE87-489429927C4C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.LastHeartbeatAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution Details & Outcome', "GeneratedFormSection" = 'Category', "DisplayName" = 'Last Heartbeat', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AE864635-13FE-474C-BCD9-2238A8CDD682' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4FF245A3-C823-49F8-B20A-31A64D0E6E77' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.UserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '625FE9E6-9058-4FDD-8970-4595336C60D3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetailID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8505597E-558F-4222-ABF7-5BA4E163A97D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetailSequence */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Detail Sequence', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D4896B2F-D530-4844-8C96-A0016F0A81D4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Agent */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '38A3F73F-9364-428E-A195-5DF74B9F9ACB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Conversation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8FAF86E8-F74E-4D76-972A-197FBB245478' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.User */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'User Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9FEAEC67-96DB-4551-9954-AC631C8ADF0A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetail */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation Detail Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '66AAF27B-995D-4F5F-8149-BE6E35C7694C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Contextual Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Session', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7E320744-89D1-4315-88DE-29A8F59FD61F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalTokensUsed */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Total Tokens Used', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A7C0AFAA-E27C-41DA-8FAA-0B48E276089D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCost */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '34F910FE-C31E-42FE-9A9E-08407AF79BDB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptTokensUsed */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '69B7EB99-3409-4B84-B979-877E992964DC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCompletionTokensUsed */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4BE28D8A-2E06-460D-BDD7-34E5BEB5DBB0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalTokensUsedRollup */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A60033A0-D13C-4954-8EF3-6BB8A5618126' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptTokensUsedRollup */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FCD5864B-65BB-4E9F-A3FE-2C09D3461364' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCompletionTokensUsedRollup */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B1401167-0C3B-4D14-9633-6A3A1DC429A9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCostRollup */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F9928463-5F2B-46C0-8DA3-6EEF2FA816EF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCacheReadTokensUsed */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CAEE3E16-509E-4F64-A4FD-6B5428D325BE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCacheWriteTokensUsed */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3B815F5A-2C13-4FE8-9C8F-ED4A1022883B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.ConfigurationID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '038B0DB2-EB71-4E8D-945E-EBA1AA570391' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideModelID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E95FDE6B-12E3-4A41-AA15-9EAD7695B266' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideVendorID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F8747D24-8E7D-4D12-BCF8-8CD9F7749566' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.EffortLevel */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B16B5B36-7238-4A90-ABAD-DA64ED8FADCA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.Configuration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Configuration Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2F32D57F-954A-4DDD-BE50-A52E7E9FA1FF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideModel */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Override Model Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F27EECF4-14ED-4338-9ABE-3E472415CE2B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideVendor */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Override Vendor Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9E8614CB-65CB-4C28-9D0B-198CBA49CBBF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TestRunID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7685B81B-FD95-40F8-A3D6-4EB710DB054D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.TestRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Test Run Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '34DF8E45-2C56-4E9D-AC4C-2FD4C4EEE196' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeEntityID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B0F924E4-A919-4AE5-A0E6-F5D4847926D6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeRecordID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C6602391-0B0C-4ECB-8A16-3A8B019B5C3D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.SecondaryScopes */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '21FC62F2-F9CC-40C4-A1BA-462699CCD289' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.CompanyID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '766B0728-BB2E-4827-B23A-7A4CA04FB7F6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeEntity */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Primary Scope Entity Info', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ECFA16C9-1005-4B07-90CB-690623428037' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '13198D22-60EB-4694-B420-7BDB4E3E9BB8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Runs.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B025CDE5-5300-46DA-BC49-7130D0689E81' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 77 fields */ /* UPDATE Entity Field Category Info MJ: AI Agents.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.LogoURL */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = '77845738-5781-458B-AD3C-5DAE745373C2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.TypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '91CA077D-3F59-48E1-A593-AF8686276115' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DriverClass */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.IconClass */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ModelSelectionMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactTypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F58EA638-CE95-4D2A-9095-9909149B83C7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.OwnerUserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Owner User', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ArtifactCreationMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4371BED0-7C4A-4D24-9E07-17E15D617607' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.FunctionalRequirements */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.TechnicalDesign */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CAEA2872-B089-4192-8FA8-1737FF357FFD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.IsRestricted */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E5B17B79-282F-4F19-9656-246DE119D588' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AgentTypePromptParams */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.CategoryID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7DCA7B3C-9A81-4D32-AF2E-5EA32B22D988' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Type */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.OwnerUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Owner User Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B098B41F-7953-473E-8257-DB6BFFEF48A0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Category */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6517DB09-A12E-4F1B-95B6-0B0A92918A1D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ParentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExposeAsAction */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExecutionOrder */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '090830CE-4073-486C-BBF2-E2105BEADD91' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExecutionMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8261D630-2560-4C03-BE14-C8A9682ABBB4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.InvocationMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Parent */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Agent Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '52E74C81-D246-4B52-B7A7-91757C299671' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.RootParentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Root Parent Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '644AA4B2-1044-430C-BCBA-245644294E02' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.EnableContextCompression */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '09AFE563-63E3-4F2B-B6F1-5945432FF07B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageThreshold */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Context Compression Threshold', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '451D5C8F-6749-4789-A158-658B38A74AE4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPromptID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Context Compression Prompt', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FFD209C5-48F3-45D1-9094-E76EC832EA07' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageRetentionCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Retention Count', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '73A50D68-976F-49A7-9737-12D1D26C6011' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPrompt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Context Compression Prompt Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AD36EF69-1494-409C-A97E-FE73669DD28A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadDownstreamPaths */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '85B6AA86-796D-4970-9E35-5A483498B517' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadUpstreamPaths */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DA784B76-66CD-434B-90BD-DEC808917E68' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfReadPaths */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfWritePaths */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadScope */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2E542986-0164-4B9E-8457-06826A4AB892' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1C7959AE-F48B-4858-8383-28C3F4706314' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Final Validation Mode', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8931DE12-4048-4DEB-A2A3-E821354CFFB2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMaxRetries */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Final Validation Max Retries', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidationMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Starting Validation Mode', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0947203D-A5CA-4ED2-895B-17A8007323FC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.InjectNotes */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxNotesToInject */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.NoteInjectionStrategy */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.InjectExamples */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxExamplesToInject */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExampleInjectionStrategy */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '291FEE7A-1245-4C82-A470-07EEB8847F1E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxCostPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '23850C5A-311A-4271-AE53-BD36921C5AA5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxTokensPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxIterationsPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxTimePerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MinExecutionsPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxExecutionsPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultPromptEffortLevel */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ChatHandlingOption */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MessageMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '445C1618-EADB-4B34-B318-40C662141FE1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxMessages */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F8924303-D53A-43B0-B70F-5B74FA6248D9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AllowEphemeralClientTools */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '98BE9EE9-A855-488E-9D97-441AEBA2B34D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AcceptUnregisteredFiles */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1380146E-BF7D-4624-803A-45B1E65F0B52' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultCoAgentID */
UPDATE __mj."EntityField" SET "Category" = 'Runtime Limits & Execution Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Default Co-Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '724ADC60-12A5-4C77-8C7D-AC8F110EE069' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.TypeConfiguration */
UPDATE __mj."EntityField" SET "Category" = 'Runtime Limits & Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6F17DFC0-75FA-4F2A-9CF7-DF90B51C1239' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultCoAgent */
UPDATE __mj."EntityField" SET "Category" = 'Runtime Limits & Execution Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Default Co-Agent Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AAC9DA92-2BBE-4599-B742-4AE9E01DA10B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.RootDefaultCoAgentID */
UPDATE __mj."EntityField" SET "Category" = 'Runtime Limits & Execution Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Root Default Co-Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1861E78B-4306-44CA-8E62-70991A1F58CA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AttachmentStorageProviderID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AttachmentRootPath */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BA112220-B0D8-4C6F-B63A-027EB706B132' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.InlineStorageThresholdBytes */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Inline Storage Threshold', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccountID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '76AF4818-C79E-4DB5-8039-6B51C1C3A832' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AttachmentStorageProvider */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B6261245-1F52-43BA-9C92-A3E494D8C5BE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D900C3B8-F414-4468-AAA1-3CEB52C80ACD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ScopeConfig */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F644A0DD-0C7D-44E5-A2D5-0DAE4F0455AD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.NoteRetentionDays */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '38ABFFF6-5E0D-4AF1-B5CC-AB46B2358FB4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExampleRetentionDays */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A112A808-63DB-4B48-B38F-06554B912DED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AutoArchiveEnabled */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '85774265-68C5-4067-9C2B-F70A7F21B94A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.RerankerConfiguration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '269087F5-DEBE-4B14-8FA3-5938ADCF7325' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.SearchScopeAccess */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: vwAIAgentChannels
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Channels
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentChannel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentChannels"
AS
SELECT
    a.*
FROM
    __mj."AIAgentChannel" AS a
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
    AND tc.relname = 'vwAIAgentChannels'
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
    AND tc.relname = 'vwAIAgentChannels'
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
        AND tc.relname = 'vwAIAgentChannels'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentChannels" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentChannels" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentChannels" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentChannels" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: spCreateAIAgentChannel
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentChannel"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_serverpluginclass text DEFAULT NULL,
    p_clientpluginclass text DEFAULT NULL,
    p_transporttype text DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema text DEFAULT NULL,
    p_isactive boolean DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentChannels" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentChannel"
        (
            "ID",
            "Name",
                "Description",
                "ServerPluginClass",
                "ClientPluginClass",
                "TransportType",
                "ConfigSchema",
                "IsActive"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_serverpluginclass,
                p_clientpluginclass,
                COALESCE(p_transporttype, 'PubSub'),
                CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, NULL) END,
                COALESCE(p_isactive, TRUE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentChannels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentChannel" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: spUpdateAIAgentChannel
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentChannel"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_serverpluginclass text DEFAULT NULL,
    p_clientpluginclass text DEFAULT NULL,
    p_transporttype text DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema text DEFAULT NULL,
    p_isactive boolean DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentChannels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentChannel"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ServerPluginClass" = COALESCE(p_serverpluginclass, "ServerPluginClass"),
        "ClientPluginClass" = COALESCE(p_clientpluginclass, "ClientPluginClass"),
        "TransportType" = COALESCE(p_transporttype, "TransportType"),
        "ConfigSchema" = CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, "ConfigSchema") END,
        "IsActive" = COALESCE(p_isactive, "IsActive")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentChannels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentChannel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentChannel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_channel"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_channel" ON __mj."AIAgentChannel";

CREATE TRIGGER "trg_update_ai_agent_channel"
BEFORE UPDATE ON __mj."AIAgentChannel"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_channel"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: spDeleteAIAgentChannel
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentChannel"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentChannel"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentChannel" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Co Agents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_co_agent_co_agent_id"
    ON __mj."AIAgentCoAgent" ("CoAgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_co_agent_target_agent_id"
    ON __mj."AIAgentCoAgent" ("TargetAgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_co_agent_target_agent_type_id"
    ON __mj."AIAgentCoAgent" ("TargetAgentTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Co Agents
-- Item: vwAIAgentCoAgents
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Co Agents
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentCoAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentCoAgents"
AS
SELECT
    a.*,
    MJAIAgent_CoAgentID."Name" AS "CoAgent",
    MJAIAgent_TargetAgentID."Name" AS "TargetAgent",
    MJAIAgentType_TargetAgentTypeID."Name" AS "TargetAgentType"
FROM
    __mj."AIAgentCoAgent" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_CoAgentID
  ON
    "a"."CoAgentID" = MJAIAgent_CoAgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_TargetAgentID
  ON
    "a"."TargetAgentID" = MJAIAgent_TargetAgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentType" AS MJAIAgentType_TargetAgentTypeID
  ON
    "a"."TargetAgentTypeID" = MJAIAgentType_TargetAgentTypeID."ID"
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
    AND tc.relname = 'vwAIAgentCoAgents'
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
    AND tc.relname = 'vwAIAgentCoAgents'
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
        AND tc.relname = 'vwAIAgentCoAgents'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentCoAgents" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentCoAgents" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentCoAgents" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentCoAgents" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Co Agents
-- Item: spCreateAIAgentCoAgent
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentCoAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentCoAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentCoAgent"(
    p_id uuid DEFAULT NULL,
    p_coagentid uuid DEFAULT NULL,
    p_targetagentid_clear boolean DEFAULT false,
    p_targetagentid uuid DEFAULT NULL,
    p_targetagenttypeid_clear boolean DEFAULT false,
    p_targetagenttypeid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isdefault boolean DEFAULT NULL,
    p_sequence integer DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentCoAgents" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentCoAgent"
        (
            "ID",
            "CoAgentID",
                "TargetAgentID",
                "TargetAgentTypeID",
                "Type",
                "IsDefault",
                "Sequence",
                "Status",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            p_coagentid,
                CASE WHEN p_targetagentid_clear = true THEN NULL ELSE COALESCE(p_targetagentid, NULL) END,
                CASE WHEN p_targetagenttypeid_clear = true THEN NULL ELSE COALESCE(p_targetagenttypeid, NULL) END,
                COALESCE(p_type, 'CoAgent'),
                COALESCE(p_isdefault, FALSE),
                COALESCE(p_sequence, 0),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentCoAgents"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentCoAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentCoAgent" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Co Agents
-- Item: spUpdateAIAgentCoAgent
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentCoAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentCoAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentCoAgent"(
    p_id uuid,
    p_coagentid uuid DEFAULT NULL,
    p_targetagentid_clear boolean DEFAULT false,
    p_targetagentid uuid DEFAULT NULL,
    p_targetagenttypeid_clear boolean DEFAULT false,
    p_targetagenttypeid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isdefault boolean DEFAULT NULL,
    p_sequence integer DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentCoAgents" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentCoAgent"
    SET
        "CoAgentID" = COALESCE(p_coagentid, "CoAgentID"),
        "TargetAgentID" = CASE WHEN p_targetagentid_clear = true THEN NULL ELSE COALESCE(p_targetagentid, "TargetAgentID") END,
        "TargetAgentTypeID" = CASE WHEN p_targetagenttypeid_clear = true THEN NULL ELSE COALESCE(p_targetagenttypeid, "TargetAgentTypeID") END,
        "Type" = COALESCE(p_type, "Type"),
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Status" = COALESCE(p_status, "Status"),
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
    SELECT * FROM __mj."vwAIAgentCoAgents"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentCoAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentCoAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentCoAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_co_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_co_agent" ON __mj."AIAgentCoAgent";

CREATE TRIGGER "trg_update_ai_agent_co_agent"
BEFORE UPDATE ON __mj."AIAgentCoAgent"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_co_agent"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Co Agents
-- Item: spDeleteAIAgentCoAgent
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentCoAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentCoAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentCoAgent"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentCoAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentCoAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentCoAgent" TO "cdp_Integration";

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
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Channels
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_channel_agent_session_id"
    ON __mj."AIAgentSessionChannel" ("AgentSessionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_channel_channel_id"
    ON __mj."AIAgentSessionChannel" ("ChannelID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Channels
-- Item: vwAIAgentSessionChannels
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Session Channels
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentSessionChannel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentSessionChannels"
AS
SELECT
    a.*,
    MJAIAgentChannel_ChannelID."Name" AS "Channel"
FROM
    __mj."AIAgentSessionChannel" AS a
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
    AND tc.relname = 'vwAIAgentSessionChannels'
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
    AND tc.relname = 'vwAIAgentSessionChannels'
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
        AND tc.relname = 'vwAIAgentSessionChannels'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentSessionChannels" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentSessionChannels" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentSessionChannels" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentSessionChannels" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Channels
-- Item: spCreateAIAgentSessionChannel
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentSessionChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentSessionChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentSessionChannel"(
    p_id uuid DEFAULT NULL,
    p_agentsessionid uuid DEFAULT NULL,
    p_channelid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_socketurl_clear boolean DEFAULT false,
    p_socketurl text DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config text DEFAULT NULL,
    p_lastactiveat timestamptz DEFAULT NULL,
    p_disconnectedat_clear boolean DEFAULT false,
    p_disconnectedat timestamptz DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSessionChannels" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentSessionChannel"
        (
            "ID",
            "AgentSessionID",
                "ChannelID",
                "Status",
                "SocketUrl",
                "Config",
                "LastActiveAt",
                "DisconnectedAt"
        )
    VALUES
        (
            v_new_id,
            p_agentsessionid,
                p_channelid,
                COALESCE(p_status, 'Connecting'),
                CASE WHEN p_socketurl_clear = true THEN NULL ELSE COALESCE(p_socketurl, NULL) END,
                CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, NULL) END,
                COALESCE(p_lastactiveat, NOW()),
                CASE WHEN p_disconnectedat_clear = true THEN NULL ELSE COALESCE(p_disconnectedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSessionChannels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSessionChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSessionChannel" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Channels
-- Item: spUpdateAIAgentSessionChannel
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentSessionChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentSessionChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentSessionChannel"(
    p_id uuid,
    p_agentsessionid uuid DEFAULT NULL,
    p_channelid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_socketurl_clear boolean DEFAULT false,
    p_socketurl text DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config text DEFAULT NULL,
    p_lastactiveat timestamptz DEFAULT NULL,
    p_disconnectedat_clear boolean DEFAULT false,
    p_disconnectedat timestamptz DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSessionChannels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentSessionChannel"
    SET
        "AgentSessionID" = COALESCE(p_agentsessionid, "AgentSessionID"),
        "ChannelID" = COALESCE(p_channelid, "ChannelID"),
        "Status" = COALESCE(p_status, "Status"),
        "SocketUrl" = CASE WHEN p_socketurl_clear = true THEN NULL ELSE COALESCE(p_socketurl, "SocketUrl") END,
        "Config" = CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, "Config") END,
        "LastActiveAt" = COALESCE(p_lastactiveat, "LastActiveAt"),
        "DisconnectedAt" = CASE WHEN p_disconnectedat_clear = true THEN NULL ELSE COALESCE(p_disconnectedat, "DisconnectedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSessionChannels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSessionChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSessionChannel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSessionChannel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_session_channel"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_session_channel" ON __mj."AIAgentSessionChannel";

CREATE TRIGGER "trg_update_ai_agent_session_channel"
BEFORE UPDATE ON __mj."AIAgentSessionChannel"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_session_channel"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Channels
-- Item: spDeleteAIAgentSessionChannel
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentSessionChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentSessionChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentSessionChannel"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentSessionChannel"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSessionChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSessionChannel" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_agent_id"
    ON __mj."AIAgentSession" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_user_id"
    ON __mj."AIAgentSession" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_conversation_id"
    ON __mj."AIAgentSession" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_last_session_id"
    ON __mj."AIAgentSession" ("LastSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: fnAIAgentSessionLastSessionID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentSession.LastSessionID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_session_last_session_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "LastSessionID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentSession"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."LastSessionID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentSession" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."LastSessionID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "LastSessionID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: vwAIAgentSessions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Sessions
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentSessions"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJUser_UserID."Name" AS "User",
    MJConversation_ConversationID."Name" AS "Conversation",
    root_LastSessionID.root_id AS "RootLastSessionID"
FROM
    __mj."AIAgentSession" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
INNER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_session_last_session_id_get_root_id"(a."ID", a."LastSessionID") AS root_id
) AS root_LastSessionID ON true
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
    AND tc.relname = 'vwAIAgentSessions'
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
    AND tc.relname = 'vwAIAgentSessions'
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
        AND tc.relname = 'vwAIAgentSessions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentSessions" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentSessions" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentSessions" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentSessions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: spCreateAIAgentSession
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentSession"(
    p_id uuid DEFAULT NULL,
    p_agentid uuid DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid uuid DEFAULT NULL,
    p_lastsessionid_clear boolean DEFAULT false,
    p_lastsessionid uuid DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid text DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config text DEFAULT NULL,
    p_lastactiveat timestamptz DEFAULT NULL,
    p_closedat_clear boolean DEFAULT false,
    p_closedat timestamptz DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSessions" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentSession"
        (
            "ID",
            "AgentID",
                "UserID",
                "Status",
                "ConversationID",
                "LastSessionID",
                "HostInstanceID",
                "Config",
                "LastActiveAt",
                "ClosedAt",
                "CloseReason"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_userid,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, NULL) END,
                CASE WHEN p_lastsessionid_clear = true THEN NULL ELSE COALESCE(p_lastsessionid, NULL) END,
                CASE WHEN p_hostinstanceid_clear = true THEN NULL ELSE COALESCE(p_hostinstanceid, NULL) END,
                CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, NULL) END,
                COALESCE(p_lastactiveat, NOW()),
                CASE WHEN p_closedat_clear = true THEN NULL ELSE COALESCE(p_closedat, NULL) END,
                CASE WHEN p_closereason_clear = true THEN NULL ELSE COALESCE(p_closereason, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSessions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSession" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: spUpdateAIAgentSession
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentSession"(
    p_id uuid,
    p_agentid uuid DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid uuid DEFAULT NULL,
    p_lastsessionid_clear boolean DEFAULT false,
    p_lastsessionid uuid DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid text DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config text DEFAULT NULL,
    p_lastactiveat timestamptz DEFAULT NULL,
    p_closedat_clear boolean DEFAULT false,
    p_closedat timestamptz DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSessions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentSession"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "Status" = COALESCE(p_status, "Status"),
        "ConversationID" = CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, "ConversationID") END,
        "LastSessionID" = CASE WHEN p_lastsessionid_clear = true THEN NULL ELSE COALESCE(p_lastsessionid, "LastSessionID") END,
        "HostInstanceID" = CASE WHEN p_hostinstanceid_clear = true THEN NULL ELSE COALESCE(p_hostinstanceid, "HostInstanceID") END,
        "Config" = CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, "Config") END,
        "LastActiveAt" = COALESCE(p_lastactiveat, "LastActiveAt"),
        "ClosedAt" = CASE WHEN p_closedat_clear = true THEN NULL ELSE COALESCE(p_closedat, "ClosedAt") END,
        "CloseReason" = CASE WHEN p_closereason_clear = true THEN NULL ELSE COALESCE(p_closereason, "CloseReason") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSessions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSession" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSession table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_session"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_session" ON __mj."AIAgentSession";

CREATE TRIGGER "trg_update_ai_agent_session"
BEFORE UPDATE ON __mj."AIAgentSession"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_session"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: spDeleteAIAgentSession
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentSession"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentSession"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSession" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Types
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_type_system_prompt_id"
    ON __mj."AIAgentType" ("SystemPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_type_default_storage_account_id"
    ON __mj."AIAgentType" ("DefaultStorageAccountID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Types
-- Item: vwAIAgentTypes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentTypes"
AS
SELECT
    a.*,
    MJAIPrompt_SystemPromptID."Name" AS "SystemPrompt",
    MJFileStorageAccount_DefaultStorageAccountID."Name" AS "DefaultStorageAccount"
FROM
    __mj."AIAgentType" AS a
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_SystemPromptID
  ON
    "a"."SystemPromptID" = MJAIPrompt_SystemPromptID."ID"
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    "a"."DefaultStorageAccountID" = MJFileStorageAccount_DefaultStorageAccountID."ID"
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
    AND tc.relname = 'vwAIAgentTypes'
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
    AND tc.relname = 'vwAIAgentTypes'
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
        AND tc.relname = 'vwAIAgentTypes'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentTypes" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentTypes" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentTypes" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentTypes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Types
-- Item: spCreateAIAgentType
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentType"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_systempromptid_clear boolean DEFAULT false,
    p_systempromptid uuid DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_agentpromptplaceholder_clear boolean DEFAULT false,
    p_agentpromptplaceholder text DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass text DEFAULT NULL,
    p_uiformsectionkey_clear boolean DEFAULT false,
    p_uiformsectionkey text DEFAULT NULL,
    p_uiformkey_clear boolean DEFAULT false,
    p_uiformkey text DEFAULT NULL,
    p_uiformsectionexpandedbydefault BOOLEAN DEFAULT NULL,
    p_promptparamsschema_clear boolean DEFAULT false,
    p_promptparamsschema text DEFAULT NULL,
    p_assignmentstrategy_clear boolean DEFAULT false,
    p_assignmentstrategy text DEFAULT NULL,
    p_defaultstorageaccountid_clear boolean DEFAULT false,
    p_defaultstorageaccountid uuid DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema text DEFAULT NULL,
    p_defaultconfiguration_clear boolean DEFAULT false,
    p_defaultconfiguration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentTypes" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentType"
        (
            "ID",
            "Name",
                "Description",
                "SystemPromptID",
                "IsActive",
                "AgentPromptPlaceholder",
                "DriverClass",
                "UIFormSectionKey",
                "UIFormKey",
                "UIFormSectionExpandedByDefault",
                "PromptParamsSchema",
                "AssignmentStrategy",
                "DefaultStorageAccountID",
                "ConfigSchema",
                "DefaultConfiguration"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_systempromptid_clear = true THEN NULL ELSE COALESCE(p_systempromptid, NULL) END,
                COALESCE(p_isactive, TRUE),
                CASE WHEN p_agentpromptplaceholder_clear = true THEN NULL ELSE COALESCE(p_agentpromptplaceholder, NULL) END,
                CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, NULL) END,
                CASE WHEN p_uiformsectionkey_clear = true THEN NULL ELSE COALESCE(p_uiformsectionkey, NULL) END,
                CASE WHEN p_uiformkey_clear = true THEN NULL ELSE COALESCE(p_uiformkey, NULL) END,
                COALESCE(p_uiformsectionexpandedbydefault, TRUE),
                CASE WHEN p_promptparamsschema_clear = true THEN NULL ELSE COALESCE(p_promptparamsschema, NULL) END,
                CASE WHEN p_assignmentstrategy_clear = true THEN NULL ELSE COALESCE(p_assignmentstrategy, NULL) END,
                CASE WHEN p_defaultstorageaccountid_clear = true THEN NULL ELSE COALESCE(p_defaultstorageaccountid, NULL) END,
                CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, NULL) END,
                CASE WHEN p_defaultconfiguration_clear = true THEN NULL ELSE COALESCE(p_defaultconfiguration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentType" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Types
-- Item: spUpdateAIAgentType
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentType"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_systempromptid_clear boolean DEFAULT false,
    p_systempromptid uuid DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_agentpromptplaceholder_clear boolean DEFAULT false,
    p_agentpromptplaceholder text DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass text DEFAULT NULL,
    p_uiformsectionkey_clear boolean DEFAULT false,
    p_uiformsectionkey text DEFAULT NULL,
    p_uiformkey_clear boolean DEFAULT false,
    p_uiformkey text DEFAULT NULL,
    p_uiformsectionexpandedbydefault BOOLEAN DEFAULT NULL,
    p_promptparamsschema_clear boolean DEFAULT false,
    p_promptparamsschema text DEFAULT NULL,
    p_assignmentstrategy_clear boolean DEFAULT false,
    p_assignmentstrategy text DEFAULT NULL,
    p_defaultstorageaccountid_clear boolean DEFAULT false,
    p_defaultstorageaccountid uuid DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema text DEFAULT NULL,
    p_defaultconfiguration_clear boolean DEFAULT false,
    p_defaultconfiguration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "SystemPromptID" = CASE WHEN p_systempromptid_clear = true THEN NULL ELSE COALESCE(p_systempromptid, "SystemPromptID") END,
        "IsActive" = COALESCE(p_isactive, "IsActive"),
        "AgentPromptPlaceholder" = CASE WHEN p_agentpromptplaceholder_clear = true THEN NULL ELSE COALESCE(p_agentpromptplaceholder, "AgentPromptPlaceholder") END,
        "DriverClass" = CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, "DriverClass") END,
        "UIFormSectionKey" = CASE WHEN p_uiformsectionkey_clear = true THEN NULL ELSE COALESCE(p_uiformsectionkey, "UIFormSectionKey") END,
        "UIFormKey" = CASE WHEN p_uiformkey_clear = true THEN NULL ELSE COALESCE(p_uiformkey, "UIFormKey") END,
        "UIFormSectionExpandedByDefault" = COALESCE(p_uiformsectionexpandedbydefault, "UIFormSectionExpandedByDefault"),
        "PromptParamsSchema" = CASE WHEN p_promptparamsschema_clear = true THEN NULL ELSE COALESCE(p_promptparamsschema, "PromptParamsSchema") END,
        "AssignmentStrategy" = CASE WHEN p_assignmentstrategy_clear = true THEN NULL ELSE COALESCE(p_assignmentstrategy, "AssignmentStrategy") END,
        "DefaultStorageAccountID" = CASE WHEN p_defaultstorageaccountid_clear = true THEN NULL ELSE COALESCE(p_defaultstorageaccountid, "DefaultStorageAccountID") END,
        "ConfigSchema" = CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, "ConfigSchema") END,
        "DefaultConfiguration" = CASE WHEN p_defaultconfiguration_clear = true THEN NULL ELSE COALESCE(p_defaultconfiguration, "DefaultConfiguration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentType" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_type" ON __mj."AIAgentType";

CREATE TRIGGER "trg_update_ai_agent_type"
BEFORE UPDATE ON __mj."AIAgentType"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_type"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Types
-- Item: spDeleteAIAgentType
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentType"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentType"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentType" TO "cdp_Integration";

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
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration']
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

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_template_id"
    ON __mj."AIPrompt" ("TemplateID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_category_id"
    ON __mj."AIPrompt" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_type_id"
    ON __mj."AIPrompt" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_ai_model_type_id"
    ON __mj."AIPrompt" ("AIModelTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_result_selector_prompt_id"
    ON __mj."AIPrompt" ("ResultSelectorPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: fnAIPromptResultSelectorPromptID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPrompt.ResultSelectorPromptID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_prompt_result_selector_prompt_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ResultSelectorPromptID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIPrompt"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ResultSelectorPromptID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIPrompt" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ResultSelectorPromptID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ResultSelectorPromptID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: vwAIPrompts
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompts
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIPrompts"
AS
SELECT
    a.*,
    MJTemplate_TemplateID."Name" AS "Template",
    MJAIPromptCategory_CategoryID."Name" AS "Category",
    MJAIPromptType_TypeID."Name" AS "Type",
    MJAIModelType_AIModelTypeID."Name" AS "AIModelType",
    MJAIPrompt_ResultSelectorPromptID."Name" AS "ResultSelectorPrompt",
    root_ResultSelectorPromptID.root_id AS "RootResultSelectorPromptID"
FROM
    __mj."AIPrompt" AS a
INNER JOIN
    __mj."Template" AS MJTemplate_TemplateID
  ON
    "a"."TemplateID" = MJTemplate_TemplateID."ID"
LEFT OUTER JOIN
    __mj."AIPromptCategory" AS MJAIPromptCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIPromptCategory_CategoryID."ID"
INNER JOIN
    __mj."AIPromptType" AS MJAIPromptType_TypeID
  ON
    "a"."TypeID" = MJAIPromptType_TypeID."ID"
LEFT OUTER JOIN
    __mj."AIModelType" AS MJAIModelType_AIModelTypeID
  ON
    "a"."AIModelTypeID" = MJAIModelType_AIModelTypeID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ResultSelectorPromptID
  ON
    "a"."ResultSelectorPromptID" = MJAIPrompt_ResultSelectorPromptID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_prompt_result_selector_prompt_id_get_root_id"(a."ID", a."ResultSelectorPromptID") AS root_id
) AS root_ResultSelectorPromptID ON true
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
    AND tc.relname = 'vwAIPrompts'
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
    AND tc.relname = 'vwAIPrompts'
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
        AND tc.relname = 'vwAIPrompts'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIPrompts" CASCADE;
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
GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_Integration";
GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spCreateAIPrompt
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPrompt"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_templateid uuid DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid uuid DEFAULT NULL,
    p_typeid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_responseformat text DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat text DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid uuid DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank integer DEFAULT NULL,
    p_selectionstrategy text DEFAULT NULL,
    p_powerpreference text DEFAULT NULL,
    p_parallelizationmode text DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount integer DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam text DEFAULT NULL,
    p_outputtype text DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample text DEFAULT NULL,
    p_validationbehavior text DEFAULT NULL,
    p_maxretries integer DEFAULT NULL,
    p_retrydelayms integer DEFAULT NULL,
    p_retrystrategy text DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid uuid DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds integer DEFAULT NULL,
    p_cachematchtype text DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole text DEFAULT NULL,
    p_promptposition text DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk integer DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed integer DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences text DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs integer DEFAULT NULL,
    p_failoverstrategy text DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts integer DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds integer DEFAULT NULL,
    p_failovermodelstrategy text DEFAULT NULL,
    p_failovererrorscope text DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel integer DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill text DEFAULT NULL,
    p_prefillfallbackmode text DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwAIPrompts" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIPrompt"
        (
            "ID",
            "Name",
                "Description",
                "TemplateID",
                "CategoryID",
                "TypeID",
                "Status",
                "ResponseFormat",
                "ModelSpecificResponseFormat",
                "AIModelTypeID",
                "MinPowerRank",
                "SelectionStrategy",
                "PowerPreference",
                "ParallelizationMode",
                "ParallelCount",
                "ParallelConfigParam",
                "OutputType",
                "OutputExample",
                "ValidationBehavior",
                "MaxRetries",
                "RetryDelayMS",
                "RetryStrategy",
                "ResultSelectorPromptID",
                "EnableCaching",
                "CacheTTLSeconds",
                "CacheMatchType",
                "CacheSimilarityThreshold",
                "CacheMustMatchModel",
                "CacheMustMatchVendor",
                "CacheMustMatchAgent",
                "CacheMustMatchConfig",
                "PromptRole",
                "PromptPosition",
                "Temperature",
                "TopP",
                "TopK",
                "MinP",
                "FrequencyPenalty",
                "PresencePenalty",
                "Seed",
                "StopSequences",
                "IncludeLogProbs",
                "TopLogProbs",
                "FailoverStrategy",
                "FailoverMaxAttempts",
                "FailoverDelaySeconds",
                "FailoverModelStrategy",
                "FailoverErrorScope",
                "EffortLevel",
                "AssistantPrefill",
                "PrefillFallbackMode",
                "RequireSpecificModels"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_templateid,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                p_typeid,
                p_status,
                COALESCE(p_responseformat, 'Any'),
                CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, NULL) END,
                CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, NULL) END,
                CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, 0) END,
                COALESCE(p_selectionstrategy, 'Default'),
                COALESCE(p_powerpreference, 'Highest'),
                COALESCE(p_parallelizationmode, 'None'),
                CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, NULL) END,
                CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, NULL) END,
                COALESCE(p_outputtype, 'string'),
                CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, NULL) END,
                COALESCE(p_validationbehavior, 'Warn'),
                COALESCE(p_maxretries, 0),
                COALESCE(p_retrydelayms, 0),
                COALESCE(p_retrystrategy, 'Fixed'),
                CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, NULL) END,
                COALESCE(p_enablecaching, FALSE),
                CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, NULL) END,
                COALESCE(p_cachematchtype, 'Exact'),
                CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, NULL) END,
                COALESCE(p_cachemustmatchmodel, TRUE),
                COALESCE(p_cachemustmatchvendor, TRUE),
                COALESCE(p_cachemustmatchagent, FALSE),
                COALESCE(p_cachemustmatchconfig, FALSE),
                COALESCE(p_promptrole, 'System'),
                COALESCE(p_promptposition, 'First'),
                CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, NULL) END,
                CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, NULL) END,
                CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, NULL) END,
                CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, NULL) END,
                CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, NULL) END,
                CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, NULL) END,
                CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, NULL) END,
                CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, NULL) END,
                CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, FALSE) END,
                CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, NULL) END,
                COALESCE(p_failoverstrategy, 'SameModelDifferentVendor'),
                CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, 3) END,
                CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, 5) END,
                COALESCE(p_failovermodelstrategy, 'PreferSameModel'),
                COALESCE(p_failovererrorscope, 'All'),
                CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, NULL) END,
                CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, NULL) END,
                COALESCE(p_prefillfallbackmode, 'Ignore'),
                COALESCE(p_requirespecificmodels, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIPrompts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPrompt" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spUpdateAIPrompt
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPrompt"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_templateid uuid DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid uuid DEFAULT NULL,
    p_typeid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_responseformat text DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat text DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid uuid DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank integer DEFAULT NULL,
    p_selectionstrategy text DEFAULT NULL,
    p_powerpreference text DEFAULT NULL,
    p_parallelizationmode text DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount integer DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam text DEFAULT NULL,
    p_outputtype text DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample text DEFAULT NULL,
    p_validationbehavior text DEFAULT NULL,
    p_maxretries integer DEFAULT NULL,
    p_retrydelayms integer DEFAULT NULL,
    p_retrystrategy text DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid uuid DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds integer DEFAULT NULL,
    p_cachematchtype text DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole text DEFAULT NULL,
    p_promptposition text DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk integer DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed integer DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences text DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs integer DEFAULT NULL,
    p_failoverstrategy text DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts integer DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds integer DEFAULT NULL,
    p_failovermodelstrategy text DEFAULT NULL,
    p_failovererrorscope text DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel integer DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill text DEFAULT NULL,
    p_prefillfallbackmode text DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwAIPrompts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIPrompt"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TemplateID" = COALESCE(p_templateid, "TemplateID"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "Status" = COALESCE(p_status, "Status"),
        "ResponseFormat" = COALESCE(p_responseformat, "ResponseFormat"),
        "ModelSpecificResponseFormat" = CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, "ModelSpecificResponseFormat") END,
        "AIModelTypeID" = CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, "AIModelTypeID") END,
        "MinPowerRank" = CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, "MinPowerRank") END,
        "SelectionStrategy" = COALESCE(p_selectionstrategy, "SelectionStrategy"),
        "PowerPreference" = COALESCE(p_powerpreference, "PowerPreference"),
        "ParallelizationMode" = COALESCE(p_parallelizationmode, "ParallelizationMode"),
        "ParallelCount" = CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, "ParallelCount") END,
        "ParallelConfigParam" = CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, "ParallelConfigParam") END,
        "OutputType" = COALESCE(p_outputtype, "OutputType"),
        "OutputExample" = CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, "OutputExample") END,
        "ValidationBehavior" = COALESCE(p_validationbehavior, "ValidationBehavior"),
        "MaxRetries" = COALESCE(p_maxretries, "MaxRetries"),
        "RetryDelayMS" = COALESCE(p_retrydelayms, "RetryDelayMS"),
        "RetryStrategy" = COALESCE(p_retrystrategy, "RetryStrategy"),
        "ResultSelectorPromptID" = CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, "ResultSelectorPromptID") END,
        "EnableCaching" = COALESCE(p_enablecaching, "EnableCaching"),
        "CacheTTLSeconds" = CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, "CacheTTLSeconds") END,
        "CacheMatchType" = COALESCE(p_cachematchtype, "CacheMatchType"),
        "CacheSimilarityThreshold" = CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, "CacheSimilarityThreshold") END,
        "CacheMustMatchModel" = COALESCE(p_cachemustmatchmodel, "CacheMustMatchModel"),
        "CacheMustMatchVendor" = COALESCE(p_cachemustmatchvendor, "CacheMustMatchVendor"),
        "CacheMustMatchAgent" = COALESCE(p_cachemustmatchagent, "CacheMustMatchAgent"),
        "CacheMustMatchConfig" = COALESCE(p_cachemustmatchconfig, "CacheMustMatchConfig"),
        "PromptRole" = COALESCE(p_promptrole, "PromptRole"),
        "PromptPosition" = COALESCE(p_promptposition, "PromptPosition"),
        "Temperature" = CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, "Temperature") END,
        "TopP" = CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, "TopP") END,
        "TopK" = CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, "TopK") END,
        "MinP" = CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, "MinP") END,
        "FrequencyPenalty" = CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, "FrequencyPenalty") END,
        "PresencePenalty" = CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, "PresencePenalty") END,
        "Seed" = CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, "Seed") END,
        "StopSequences" = CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, "StopSequences") END,
        "IncludeLogProbs" = CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, "IncludeLogProbs") END,
        "TopLogProbs" = CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, "TopLogProbs") END,
        "FailoverStrategy" = COALESCE(p_failoverstrategy, "FailoverStrategy"),
        "FailoverMaxAttempts" = CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, "FailoverMaxAttempts") END,
        "FailoverDelaySeconds" = CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, "FailoverDelaySeconds") END,
        "FailoverModelStrategy" = COALESCE(p_failovermodelstrategy, "FailoverModelStrategy"),
        "FailoverErrorScope" = COALESCE(p_failovererrorscope, "FailoverErrorScope"),
        "EffortLevel" = CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, "EffortLevel") END,
        "AssistantPrefill" = CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, "AssistantPrefill") END,
        "PrefillFallbackMode" = COALESCE(p_prefillfallbackmode, "PrefillFallbackMode"),
        "RequireSpecificModels" = COALESCE(p_requirespecificmodels, "RequireSpecificModels")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIPrompts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPrompt" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_prompt"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt" ON __mj."AIPrompt";

CREATE TRIGGER "trg_update_ai_prompt"
BEFORE UPDATE ON __mj."AIPrompt"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_prompt"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPrompt"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Actions.DefaultCompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "DefaultCompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Action"
        SET "DefaultCompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Actions.CompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "CompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "CompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.SystemPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentType"
        WHERE "SystemPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentType"
        SET "SystemPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextCompressionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfiguration"
        WHERE "DefaultPromptForContextCompressionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIConfiguration"
        SET "DefaultPromptForContextCompressionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextSummarizationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfiguration"
        WHERE "DefaultPromptForContextSummarizationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIConfiguration"
        SET "DefaultPromptForContextSummarizationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Models records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptModel"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptModel"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Runs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.JudgeID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "JudgeID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "JudgeID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ChildPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "ChildPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "ChildPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompts.ResultSelectorPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPrompt"
        WHERE "ResultSelectorPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPrompt"
        SET "ResultSelectorPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Result Cache records via AIPromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "AIPromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIResultCache"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."AIPrompt"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer";
