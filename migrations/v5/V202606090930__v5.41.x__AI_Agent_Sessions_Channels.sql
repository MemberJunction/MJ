/* ============================================================================
   Real-Time AI Agents — Sessions, Channels & Co-Agent schema
   v5.41.x

   Companion plan: /plans/ai-agent-sessions.md

   One consolidated migration for the real-time agents feature:

   New tables (no destructive changes):
     AIAgentChannel         — pluggable channel-definition registry (reference
                              data; seeded via metadata files, NOT SQL INSERTs)
     AIAgentSession         — the long-lived, stateful session record, including
                              CloseReason (authoritative close provenance)
     AIAgentSessionChannel  — one row per channel instance attached to a session
                              (normalized replacement for an ActiveChannels blob)

   Existing tables — one additive nullable FK column each:
     AIAgentRun.AgentSessionID         — links a run to its parent session
     ConversationDetail.AgentSessionID — links a message to the session it
                                         occurred in
     AIAgentType.DefaultCoAgentID      — per-type default co-agent
     AIAgent.DefaultCoAgentID          — per-agent co-agent persona

   Co-agent resolution chain (a real-time session pairs a TARGET agent with the
   CO-AGENT that is its live voice; both columns reference AIAgent because a
   co-agent is just an agent of the Realtime type), resolved at session start:

       runtime parameter (StartRealtimeClientSession coAgentId)
         > AIAgent.DefaultCoAgentID          (per-agent persona)
           > AIAgentType.DefaultCoAgentID    (per-type default)
             > global default                (name lookup fallback)

   Naming note: the persisted session FK columns are AgentSessionID (NOT
   SessionID), to stay distinct from the per-connection transport sessionID.
   See the plan's "Unified Session Transport" section.

   CodeGen convention (per CLAUDE.md migrations guide):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
     * sp_addextendedproperty on business columns (and the new FK columns, for
       documentation) so CodeGen surfaces descriptions on regen.
     * Status-style columns use CHECK constraints so CodeGen emits string-union
       types. Server code that sets/reads the new columns ships AFTER CodeGen
       generates the typed entity properties, per the no-weak-typing rule.
     * Reference data (AIAgentChannel rows, realtime models, the Voice Co-Agent)
       is seeded via metadata/mj-sync, NOT here.

   Entity metadata, views, and spCreate/Update/Delete are produced by CodeGen
   after this migration runs.
   ============================================================================ */


-- ============================================================================
-- 1. AIAgentChannel  ("MJ: AI Agent Channels") — pluggable channel registry
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIAgentChannel (
    ID                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name               NVARCHAR(100)    NOT NULL,
    Description        NVARCHAR(1000)   NULL,
    ServerPluginClass  NVARCHAR(250)    NOT NULL,
    ClientPluginClass  NVARCHAR(250)    NOT NULL,
    TransportType      NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIAgentChannel_TransportType DEFAULT ('PubSub'),
    ConfigSchema       NVARCHAR(MAX)    NULL,
    IsActive           BIT              NOT NULL CONSTRAINT DF_AIAgentChannel_IsActive DEFAULT (1),
    CONSTRAINT PK_AIAgentChannel PRIMARY KEY (ID),
    CONSTRAINT UQ_AIAgentChannel_Name UNIQUE (Name),
    CONSTRAINT CK_AIAgentChannel_TransportType
        CHECK (TransportType IN ('PubSub', 'WebRTC', 'WebSocket'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique channel definition name (e.g. VoiceAudio, TextChat, ClientControl, Whiteboard).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentChannel',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional human-readable description of what the channel surface does.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentChannel',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance on the server. MUST match the @RegisterClass key on the concrete server-side channel plugin.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentChannel',
    @level2type = N'COLUMN', @level2name = N'ServerPluginClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance on the client. MUST match the @RegisterClass key on the concrete client-side channel plugin (typically an Angular component).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentChannel',
    @level2type = N'COLUMN', @level2name = N'ClientPluginClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Which transport plane this channel rides: PubSub (the shared control plane), WebRTC (binary media), or WebSocket.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentChannel',
    @level2type = N'COLUMN', @level2name = N'TransportType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON Schema used to validate the per-instance channel configuration (AIAgentSessionChannel.Config).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentChannel',
    @level2type = N'COLUMN', @level2name = N'ConfigSchema';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this channel definition is available for use. Inactive channels cannot be attached to a session.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentChannel',
    @level2type = N'COLUMN', @level2name = N'IsActive';


-- ============================================================================
-- 2. AIAgentSession  ("MJ: AI Agent Sessions") — long-lived session record
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIAgentSession (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID         UNIQUEIDENTIFIER NOT NULL,
    UserID          UNIQUEIDENTIFIER NOT NULL,
    Status          NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIAgentSession_Status DEFAULT ('Active'),
    ConversationID  UNIQUEIDENTIFIER NULL,
    LastSessionID   UNIQUEIDENTIFIER NULL,
    HostInstanceID  NVARCHAR(200)    NULL,
    Config          NVARCHAR(MAX)    NULL,
    LastActiveAt    DATETIMEOFFSET   NOT NULL CONSTRAINT DF_AIAgentSession_LastActiveAt DEFAULT (SYSDATETIMEOFFSET()),
    ClosedAt        DATETIMEOFFSET   NULL,
    CloseReason     NVARCHAR(20)     NULL,
    CONSTRAINT PK_AIAgentSession PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentSession_Agent FOREIGN KEY (AgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID),
    CONSTRAINT FK_AIAgentSession_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT FK_AIAgentSession_Conversation FOREIGN KEY (ConversationID)
        REFERENCES ${flyway:defaultSchema}.Conversation (ID),
    CONSTRAINT FK_AIAgentSession_LastSession FOREIGN KEY (LastSessionID)
        REFERENCES ${flyway:defaultSchema}.AIAgentSession (ID),
    CONSTRAINT CK_AIAgentSession_Status
        CHECK (Status IN ('Active', 'Idle', 'Closed')),
    CONSTRAINT CK_AIAgentSession_CloseReason
        CHECK (CloseReason IN ('Explicit', 'Janitor', 'Shutdown', 'Error'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status of the session. Active = traffic flowing; Idle = connected but quiet beyond the idle threshold; Closed = terminal (ClosedAt set, channels disconnected).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSession',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the server node currently hosting this sessions in-memory sockets (e.g. hostname:pid:bootId). Used for affinity and janitor orphan reconciliation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSession',
    @level2type = N'COLUMN', @level2name = N'HostInstanceID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON block for free-form, low-traffic session-specific state and variables.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSession',
    @level2type = N'COLUMN', @level2name = N'Config';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the last activity on the session. Bubbled up from the most-recently-active channel; used by the heartbeat and staleness sweep.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSession',
    @level2type = N'COLUMN', @level2name = N'LastActiveAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the session was closed (terminal). NULL while the session is Active or Idle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSession',
    @level2type = N'COLUMN', @level2name = N'ClosedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why the session was closed: Explicit (user hang-up / deliberate API close), Janitor (orphan or staleness sweep), Shutdown (graceful server shutdown), Error (session failure). NULL while the session is Active/Idle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSession',
    @level2type = N'COLUMN', @level2name = N'CloseReason';


-- ============================================================================
-- 3. AIAgentSessionChannel  ("MJ: AI Agent Session Channels") — active channel rows
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIAgentSessionChannel (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentSessionID  UNIQUEIDENTIFIER NOT NULL,
    ChannelID       UNIQUEIDENTIFIER NOT NULL,
    Status          NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIAgentSessionChannel_Status DEFAULT ('Connecting'),
    SocketUrl       NVARCHAR(500)    NULL,
    Config          NVARCHAR(MAX)    NULL,
    LastActiveAt    DATETIMEOFFSET   NOT NULL CONSTRAINT DF_AIAgentSessionChannel_LastActiveAt DEFAULT (SYSDATETIMEOFFSET()),
    DisconnectedAt  DATETIMEOFFSET   NULL,
    CONSTRAINT PK_AIAgentSessionChannel PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentSessionChannel_Session FOREIGN KEY (AgentSessionID)
        REFERENCES ${flyway:defaultSchema}.AIAgentSession (ID),
    CONSTRAINT FK_AIAgentSessionChannel_Channel FOREIGN KEY (ChannelID)
        REFERENCES ${flyway:defaultSchema}.AIAgentChannel (ID),
    CONSTRAINT UQ_AIAgentSessionChannel UNIQUE (AgentSessionID, ChannelID),
    CONSTRAINT CK_AIAgentSessionChannel_Status
        CHECK (Status IN ('Connecting', 'Connected', 'Paused', 'Disconnected'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Connection status of this channel instance within the session.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionChannel',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Socket URL handed to the client for this channel. NULL for PubSub channels, which ride the shared session subscription rather than a dedicated socket.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionChannel',
    @level2type = N'COLUMN', @level2name = N'SocketUrl';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON of per-instance channel configuration/state, validated against the channel definitions ConfigSchema.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionChannel',
    @level2type = N'COLUMN', @level2name = N'Config';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the last activity (or heartbeat) on this channel instance.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionChannel',
    @level2type = N'COLUMN', @level2name = N'LastActiveAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When this channel instance disconnected. NULL while still connected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionChannel',
    @level2type = N'COLUMN', @level2name = N'DisconnectedAt';


-- ============================================================================
-- 4. Existing-table additions — one ALTER per table, FK inline
--    (FK indexes + spCreate/Update/Delete handled by CodeGen.)
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun ADD
    AgentSessionID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_AIAgentRun_AgentSession
        REFERENCES ${flyway:defaultSchema}.AIAgentSession (ID);
GO

ALTER TABLE ${flyway:defaultSchema}.ConversationDetail ADD
    AgentSessionID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_ConversationDetail_AgentSession
        REFERENCES ${flyway:defaultSchema}.AIAgentSession (ID);
GO

ALTER TABLE ${flyway:defaultSchema}.AIAgentType ADD
    DefaultCoAgentID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_AIAgentType_DefaultCoAgent
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID);
GO

ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    DefaultCoAgentID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_AIAgent_DefaultCoAgent
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Links this run to the long-lived AIAgentSession it executed within. NULL for runs outside any real-time session. This is the persisted session reference and is distinct from the per-connection transport sessionID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'AgentSessionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Links this message to the AIAgentSession that was active when it was created. NULL for messages typed in standard text chat outside any live session. Lets the conversation timeline group a sessions messages into a single collapsible block.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationDetail',
    @level2type = N'COLUMN', @level2name = N'AgentSessionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default co-agent (a Realtime-type AI Agent) that voices agents of this type in real-time sessions. Overridden by AIAgent.DefaultCoAgentID and by the runtime coAgentId parameter; NULL falls through to the global default co-agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'DefaultCoAgentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default co-agent (a Realtime-type AI Agent) that voices THIS agent in real-time sessions — a per-agent persona. Overrides the agent type''s DefaultCoAgentID; overridden by the runtime coAgentId parameter; NULL falls through to the type-level default, then the global default co-agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'DefaultCoAgentID';





































































-- CODE GEN RUN
/* SQL generated to create new entity MJ: AI Agent Channels */

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
         '417336be-9dd3-481b-9686-81a435f54147',
         'MJ: AI Agent Channels',
         'AI Agent Channels',
         NULL,
         NULL,
         'AIAgentChannel',
         'vwAIAgentChannels',
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

/* SQL generated to add new entity MJ: AI Agent Channels to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '417336be-9dd3-481b-9686-81a435f54147', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Channels for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('417336be-9dd3-481b-9686-81a435f54147', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Channels for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('417336be-9dd3-481b-9686-81a435f54147', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Channels for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('417336be-9dd3-481b-9686-81a435f54147', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Agent Sessions */

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
         'df2b0246-1729-4552-9fb7-48891b5f4873',
         'MJ: AI Agent Sessions',
         'AI Agent Sessions',
         NULL,
         NULL,
         'AIAgentSession',
         'vwAIAgentSessions',
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

/* SQL generated to add new entity MJ: AI Agent Sessions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'df2b0246-1729-4552-9fb7-48891b5f4873', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Sessions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('df2b0246-1729-4552-9fb7-48891b5f4873', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Sessions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('df2b0246-1729-4552-9fb7-48891b5f4873', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Sessions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('df2b0246-1729-4552-9fb7-48891b5f4873', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Agent Session Channels */

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
         'a909c8e5-d406-4899-878b-61972f736779',
         'MJ: AI Agent Session Channels',
         'AI Agent Session Channels',
         NULL,
         NULL,
         'AIAgentSessionChannel',
         'vwAIAgentSessionChannels',
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

/* SQL generated to add new entity MJ: AI Agent Session Channels to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a909c8e5-d406-4899-878b-61972f736779', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Session Channels for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a909c8e5-d406-4899-878b-61972f736779', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Session Channels for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a909c8e5-d406-4899-878b-61972f736779', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Session Channels for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a909c8e5-d406-4899-878b-61972f736779', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSession */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSession] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSession */
UPDATE [${flyway:defaultSchema}].[AIAgentSession] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSession */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSession] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSession */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSession] ADD CONSTRAINT [DF___mj_AIAgentSession___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSession */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSession] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSession */
UPDATE [${flyway:defaultSchema}].[AIAgentSession] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSession */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSession] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSession */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSession] ADD CONSTRAINT [DF___mj_AIAgentSession___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSessionChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionChannel] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSessionChannel */
UPDATE [${flyway:defaultSchema}].[AIAgentSessionChannel] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSessionChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionChannel] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSessionChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionChannel] ADD CONSTRAINT [DF___mj_AIAgentSessionChannel___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSessionChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionChannel] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSessionChannel */
UPDATE [${flyway:defaultSchema}].[AIAgentSessionChannel] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSessionChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionChannel] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSessionChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionChannel] ADD CONSTRAINT [DF___mj_AIAgentSessionChannel___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentChannel] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentChannel */
UPDATE [${flyway:defaultSchema}].[AIAgentChannel] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentChannel] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentChannel] ADD CONSTRAINT [DF___mj_AIAgentChannel___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentChannel] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentChannel */
UPDATE [${flyway:defaultSchema}].[AIAgentChannel] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentChannel] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentChannel */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentChannel] ADD CONSTRAINT [DF___mj_AIAgentChannel___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23d0314b-0894-4e38-a243-6fe6d13b79c0' OR (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'AgentSessionID')) BEGIN
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
            '23d0314b-0894-4e38-a243-6fe6d13b79c0',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100114,
            'AgentSessionID',
            'Agent Session ID',
            'Links this run to the long-lived AIAgentSession it executed within. NULL for runs outside any real-time session. This is the persisted session reference and is distinct from the per-connection transport sessionID.',
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
            'DF2B0246-1729-4552-9FB7-48891B5F4873',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5389e13a-6d4f-4eef-80a1-51b828ebd9c3' OR (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'DefaultCoAgentID')) BEGIN
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
            '5389e13a-6d4f-4eef-80a1-51b828ebd9c3',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: MJ: AI Agents
            100143,
            'DefaultCoAgentID',
            'Default Co Agent ID',
            'Default co-agent (a Realtime-type AI Agent) that voices THIS agent in real-time sessions — a per-agent persona. Overrides the agent type''s DefaultCoAgentID; overridden by the runtime coAgentId parameter; NULL falls through to the type-level default, then the global default co-agent.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c215d1c0-9eb6-43ec-a8c2-ac64e9bded0e' OR (EntityID = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND Name = 'DefaultCoAgentID')) BEGIN
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
            'c215d1c0-9eb6-43ec-a8c2-ac64e9bded0e',
            '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- Entity: MJ: AI Agent Types
            100034,
            'DefaultCoAgentID',
            'Default Co Agent ID',
            'Default co-agent (a Realtime-type AI Agent) that voices agents of this type in real-time sessions. Overridden by AIAgent.DefaultCoAgentID and by the runtime coAgentId parameter; NULL falls through to the global default co-agent.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5feead82-55fc-4231-972a-b39511ee1410' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'ID')) BEGIN
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
            '5feead82-55fc-4231-972a-b39511ee1410',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a1d999ab-cba5-4233-a296-87e026e40807' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'AgentID')) BEGIN
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
            'a1d999ab-cba5-4233-a296-87e026e40807',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100002,
            'AgentID',
            'Agent ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee4f8641-bf5c-449f-b249-ef634d240c90' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'UserID')) BEGIN
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
            'ee4f8641-bf5c-449f-b249-ef634d240c90',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100003,
            'UserID',
            'User ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ee2bc8d-fefc-4ae9-b3c6-e1cdf54f7893' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'Status')) BEGIN
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
            '1ee2bc8d-fefc-4ae9-b3c6-e1cdf54f7893',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100004,
            'Status',
            'Status',
            'Lifecycle status of the session. Active = traffic flowing; Idle = connected but quiet beyond the idle threshold; Closed = terminal (ClosedAt set, channels disconnected).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61e0bcc1-5696-4f1d-9fdc-4c71a7bed310' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'ConversationID')) BEGIN
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
            '61e0bcc1-5696-4f1d-9fdc-4c71a7bed310',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100005,
            'ConversationID',
            'Conversation ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db4d8fc0-1480-4d34-8365-a107fee0f9ad' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'LastSessionID')) BEGIN
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
            'db4d8fc0-1480-4d34-8365-a107fee0f9ad',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100006,
            'LastSessionID',
            'Last Session ID',
            NULL,
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
            'DF2B0246-1729-4552-9FB7-48891B5F4873',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69619e4b-2ef9-4763-90c3-afa942dc0aa1' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'HostInstanceID')) BEGIN
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
            '69619e4b-2ef9-4763-90c3-afa942dc0aa1',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100007,
            'HostInstanceID',
            'Host Instance ID',
            'Identifier of the server node currently hosting this sessions in-memory sockets (e.g. hostname:pid:bootId). Used for affinity and janitor orphan reconciliation.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c783c488-ac96-413f-ada4-2377cbb0c35a' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'Config')) BEGIN
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
            'c783c488-ac96-413f-ada4-2377cbb0c35a',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100008,
            'Config',
            'Config',
            'JSON block for free-form, low-traffic session-specific state and variables.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c704f55-4757-462c-8c67-04920d9da336' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'LastActiveAt')) BEGIN
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
            '8c704f55-4757-462c-8c67-04920d9da336',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100009,
            'LastActiveAt',
            'Last Active At',
            'Timestamp of the last activity on the session. Bubbled up from the most-recently-active channel; used by the heartbeat and staleness sweep.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fc7db66-fb18-4a10-a7b1-17e871efbce2' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'ClosedAt')) BEGIN
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
            '8fc7db66-fb18-4a10-a7b1-17e871efbce2',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100010,
            'ClosedAt',
            'Closed At',
            'When the session was closed (terminal). NULL while the session is Active or Idle.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3dcef25d-0546-4c75-8a9a-8cb891ab0e51' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'CloseReason')) BEGIN
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
            '3dcef25d-0546-4c75-8a9a-8cb891ab0e51',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100011,
            'CloseReason',
            'Close Reason',
            'Why the session was closed: Explicit (user hang-up / deliberate API close), Janitor (orphan or staleness sweep), Shutdown (graceful server shutdown), Error (session failure). NULL while the session is Active/Idle.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'feafc3fd-1342-41b3-936a-508c6818fdc5' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = '__mj_CreatedAt')) BEGIN
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
            'feafc3fd-1342-41b3-936a-508c6818fdc5',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100012,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3dd79455-7665-46de-b1c0-2cbd208644a4' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3dd79455-7665-46de-b1c0-2cbd208644a4',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5470c38c-cf11-45de-8dac-54b55dcc244c' OR (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AgentSessionID')) BEGIN
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
            '5470c38c-cf11-45de-8dac-54b55dcc244c',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversation Details
            100064,
            'AgentSessionID',
            'Agent Session ID',
            'Links this message to the AIAgentSession that was active when it was created. NULL for messages typed in standard text chat outside any live session. Lets the conversation timeline group a sessions messages into a single collapsible block.',
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
            'DF2B0246-1729-4552-9FB7-48891B5F4873',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e3d73a1-dd35-4709-aa02-10373242ca24' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = 'ID')) BEGIN
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
            '5e3d73a1-dd35-4709-aa02-10373242ca24',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2bbc1988-61a7-4d21-ad19-eed50e2b0a05' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = 'AgentSessionID')) BEGIN
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
            '2bbc1988-61a7-4d21-ad19-eed50e2b0a05',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100002,
            'AgentSessionID',
            'Agent Session ID',
            NULL,
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
            'DF2B0246-1729-4552-9FB7-48891B5F4873',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '784b75f0-16c4-485f-b2f4-8b07f50fbc4e' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = 'ChannelID')) BEGIN
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
            '784b75f0-16c4-485f-b2f4-8b07f50fbc4e',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100003,
            'ChannelID',
            'Channel ID',
            NULL,
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
            '417336BE-9DD3-481B-9686-81A435F54147',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '17506f15-da0f-49c3-baba-a9f1c179ee3e' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = 'Status')) BEGIN
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
            '17506f15-da0f-49c3-baba-a9f1c179ee3e',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100004,
            'Status',
            'Status',
            'Connection status of this channel instance within the session.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Connecting',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f07fcb82-69fe-4ed4-aecd-1310377a439b' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = 'SocketUrl')) BEGIN
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
            'f07fcb82-69fe-4ed4-aecd-1310377a439b',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100005,
            'SocketUrl',
            'Socket Url',
            'Socket URL handed to the client for this channel. NULL for PubSub channels, which ride the shared session subscription rather than a dedicated socket.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '989052bd-fcb6-44d7-a4d8-3fb3116a4c5c' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = 'Config')) BEGIN
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
            '989052bd-fcb6-44d7-a4d8-3fb3116a4c5c',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100006,
            'Config',
            'Config',
            'JSON of per-instance channel configuration/state, validated against the channel definitions ConfigSchema.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4cedb027-c266-400f-9f92-624fc9e658bd' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = 'LastActiveAt')) BEGIN
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
            '4cedb027-c266-400f-9f92-624fc9e658bd',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100007,
            'LastActiveAt',
            'Last Active At',
            'Timestamp of the last activity (or heartbeat) on this channel instance.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba18e18e-521f-44b2-bfe3-40b155c58ba3' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = 'DisconnectedAt')) BEGIN
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
            'ba18e18e-521f-44b2-bfe3-40b155c58ba3',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100008,
            'DisconnectedAt',
            'Disconnected At',
            'When this channel instance disconnected. NULL while still connected.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bff02a46-902c-4159-92de-ccd3ff211e37' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = '__mj_CreatedAt')) BEGIN
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
            'bff02a46-902c-4159-92de-ccd3ff211e37',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100009,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '241bafb0-da75-4e87-91d5-c8b341ebaa2d' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '241bafb0-da75-4e87-91d5-c8b341ebaa2d',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100010,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18a62344-3698-4445-b2ee-48b19b3e323d' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = 'ID')) BEGIN
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
            '18a62344-3698-4445-b2ee-48b19b3e323d',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ee074c4-60ed-4df5-b9dd-eec722a7b3c2' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = 'Name')) BEGIN
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
            '6ee074c4-60ed-4df5-b9dd-eec722a7b3c2',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
            100002,
            'Name',
            'Name',
            'Unique channel definition name (e.g. VoiceAudio, TextChat, ClientControl, Whiteboard).',
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
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd85030e0-5ada-4001-a4e3-92157b381fa0' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = 'Description')) BEGIN
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
            'd85030e0-5ada-4001-a4e3-92157b381fa0',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
            100003,
            'Description',
            'Description',
            'Optional human-readable description of what the channel surface does.',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40c2da29-40ad-4f49-8121-7fcd282f28af' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = 'ServerPluginClass')) BEGIN
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
            '40c2da29-40ad-4f49-8121-7fcd282f28af',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
            100004,
            'ServerPluginClass',
            'Server Plugin Class',
            'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance on the server. MUST match the @RegisterClass key on the concrete server-side channel plugin.',
            'nvarchar',
            500,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed708ea1-ddbd-4027-840a-4d35896cfda2' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = 'ClientPluginClass')) BEGIN
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
            'ed708ea1-ddbd-4027-840a-4d35896cfda2',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
            100005,
            'ClientPluginClass',
            'Client Plugin Class',
            'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance on the client. MUST match the @RegisterClass key on the concrete client-side channel plugin (typically an Angular component).',
            'nvarchar',
            500,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8279ec1-5264-4070-bd8a-9927df140745' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = 'TransportType')) BEGIN
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
            'b8279ec1-5264-4070-bd8a-9927df140745',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
            100006,
            'TransportType',
            'Transport Type',
            'Which transport plane this channel rides: PubSub (the shared control plane), WebRTC (binary media), or WebSocket.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'PubSub',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0a0b7a6-5d3e-4a56-a410-112f51a5de51' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = 'ConfigSchema')) BEGIN
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
            'b0a0b7a6-5d3e-4a56-a410-112f51a5de51',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
            100007,
            'ConfigSchema',
            'Config Schema',
            'Optional JSON Schema used to validate the per-instance channel configuration (AIAgentSessionChannel.Config).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a80023d7-4d33-4443-9504-37fe6ae132ff' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = 'IsActive')) BEGIN
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
            'a80023d7-4d33-4443-9504-37fe6ae132ff',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
            100008,
            'IsActive',
            'Is Active',
            'Whether this channel definition is available for use. Inactive channels cannot be attached to a session.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5844e14d-27b7-43a2-adcc-e1732f3a947d' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = '__mj_CreatedAt')) BEGIN
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
            '5844e14d-27b7-43a2-adcc-e1732f3a947d',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
            100009,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5b1c8b8-bed9-406a-9403-9413a0554639' OR (EntityID = '417336BE-9DD3-481B-9686-81A435F54147' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'e5b1c8b8-bed9-406a-9403-9413a0554639',
            '417336BE-9DD3-481B-9686-81A435F54147', -- Entity: MJ: AI Agent Channels
            100010,
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

/* SQL text to insert entity field value with ID 63563b50-ef9b-4fb4-8328-889202904510 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('63563b50-ef9b-4fb4-8328-889202904510', 'B8279EC1-5264-4070-BD8A-9927DF140745', 1, 'PubSub', 'PubSub', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID acfaa429-9e91-465d-a6ff-e9f401f9fa3d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('acfaa429-9e91-465d-a6ff-e9f401f9fa3d', 'B8279EC1-5264-4070-BD8A-9927DF140745', 2, 'WebRTC', 'WebRTC', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b8c3da68-c24d-473e-a357-3ec967a2900f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b8c3da68-c24d-473e-a357-3ec967a2900f', 'B8279EC1-5264-4070-BD8A-9927DF140745', 3, 'WebSocket', 'WebSocket', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B8279EC1-5264-4070-BD8A-9927DF140745 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B8279EC1-5264-4070-BD8A-9927DF140745';

/* SQL text to insert entity field value with ID f3ec11a0-1a3e-4c65-905b-c92640b7f747 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f3ec11a0-1a3e-4c65-905b-c92640b7f747', '1EE2BC8D-FEFC-4AE9-B3C6-E1CDF54F7893', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4992c7ee-0129-42e9-bd9b-20b18502eb66 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4992c7ee-0129-42e9-bd9b-20b18502eb66', '1EE2BC8D-FEFC-4AE9-B3C6-E1CDF54F7893', 2, 'Closed', 'Closed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e83e3051-4ba7-4067-83f5-ed5e36bf37c9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e83e3051-4ba7-4067-83f5-ed5e36bf37c9', '1EE2BC8D-FEFC-4AE9-B3C6-E1CDF54F7893', 3, 'Idle', 'Idle', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1EE2BC8D-FEFC-4AE9-B3C6-E1CDF54F7893 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1EE2BC8D-FEFC-4AE9-B3C6-E1CDF54F7893';

/* SQL text to insert entity field value with ID 1358d5b1-3943-42a6-b6bb-ab67139b241a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1358d5b1-3943-42a6-b6bb-ab67139b241a', '3DCEF25D-0546-4C75-8A9A-8CB891AB0E51', 1, 'Error', 'Error', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 69e7330f-b160-411e-9761-78480db2c8ee */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('69e7330f-b160-411e-9761-78480db2c8ee', '3DCEF25D-0546-4C75-8A9A-8CB891AB0E51', 2, 'Explicit', 'Explicit', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 428b6fd0-6cc6-4f9a-8b79-39c219c30802 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('428b6fd0-6cc6-4f9a-8b79-39c219c30802', '3DCEF25D-0546-4C75-8A9A-8CB891AB0E51', 3, 'Janitor', 'Janitor', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0510f7fa-be9a-4d33-a962-f31639da1ffc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0510f7fa-be9a-4d33-a962-f31639da1ffc', '3DCEF25D-0546-4C75-8A9A-8CB891AB0E51', 4, 'Shutdown', 'Shutdown', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3DCEF25D-0546-4C75-8A9A-8CB891AB0E51 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3DCEF25D-0546-4C75-8A9A-8CB891AB0E51';

/* SQL text to insert entity field value with ID c73fdde7-453f-4722-91bf-c25b84b94277 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c73fdde7-453f-4722-91bf-c25b84b94277', '17506F15-DA0F-49C3-BABA-A9F1C179EE3E', 1, 'Connected', 'Connected', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9ae13d62-f701-4ed0-a6b8-de279b391172 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9ae13d62-f701-4ed0-a6b8-de279b391172', '17506F15-DA0F-49C3-BABA-A9F1C179EE3E', 2, 'Connecting', 'Connecting', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 683f936b-efba-4e61-8b7c-d01e0b385665 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('683f936b-efba-4e61-8b7c-d01e0b385665', '17506F15-DA0F-49C3-BABA-A9F1C179EE3E', 3, 'Disconnected', 'Disconnected', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2440eb11-293f-40fd-b022-5b843c0d8546 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2440eb11-293f-40fd-b022-5b843c0d8546', '17506F15-DA0F-49C3-BABA-A9F1C179EE3E', 4, 'Paused', 'Paused', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 17506F15-DA0F-49C3-BABA-A9F1C179EE3E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='17506F15-DA0F-49C3-BABA-A9F1C179EE3E';


/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Agent Types (One To Many via DefaultCoAgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ee64fb00-25c8-45a5-a0eb-22e8c800c378'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ee64fb00-25c8-45a5-a0eb-22e8c800c378', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '65CDC348-C4A6-4D00-A57B-2D489C56F128', 'DefaultCoAgentID', 'One To Many', 1, 1, 28, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Agent Sessions (One To Many via AgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '12e36473-b744-4e41-b3e3-c81289c05a50'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('12e36473-b744-4e41-b3e3-c81289c05a50', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'DF2B0246-1729-4552-9FB7-48891B5F4873', 'AgentID', 'One To Many', 1, 1, 29, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Agents (One To Many via DefaultCoAgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c51a49b2-a28d-45b5-ba1d-430d9bce9630'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c51a49b2-a28d-45b5-ba1d-430d9bce9630', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'DefaultCoAgentID', 'One To Many', 1, 1, 30, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agent Sessions -> MJ: AI Agent Sessions (One To Many via LastSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '14ad014f-a718-4e90-9bbe-e423b7abf66f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('14ad014f-a718-4e90-9bbe-e423b7abf66f', 'DF2B0246-1729-4552-9FB7-48891B5F4873', 'DF2B0246-1729-4552-9FB7-48891B5F4873', 'LastSessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agent Sessions -> MJ: AI Agent Runs (One To Many via AgentSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6cd7f671-4b39-4960-b148-930f645bb693'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6cd7f671-4b39-4960-b148-930f645bb693', 'DF2B0246-1729-4552-9FB7-48891B5F4873', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'AgentSessionID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Agent Sessions -> MJ: Conversation Details (One To Many via AgentSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '482aaaec-17e3-4d1c-985e-0a8401ff9f8f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('482aaaec-17e3-4d1c-985e-0a8401ff9f8f', 'DF2B0246-1729-4552-9FB7-48891B5F4873', '12248F34-2837-EF11-86D4-6045BDEE16E6', 'AgentSessionID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Agent Sessions -> MJ: AI Agent Session Channels (One To Many via AgentSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fc4fb2fe-dd7b-4944-b7d6-7d818b69a984'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fc4fb2fe-dd7b-4944-b7d6-7d818b69a984', 'DF2B0246-1729-4552-9FB7-48891B5F4873', 'A909C8E5-D406-4899-878B-61972F736779', 'AgentSessionID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: AI Agent Sessions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'acea4e6e-75e8-44a1-8d09-0444047573b9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('acea4e6e-75e8-44a1-8d09-0444047573b9', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'DF2B0246-1729-4552-9FB7-48891B5F4873', 'UserID', 'One To Many', 1, 1, 102, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Conversations -> MJ: AI Agent Sessions (One To Many via ConversationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f55028e2-0d60-465a-97b3-a786d7947782'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f55028e2-0d60-465a-97b3-a786d7947782', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'DF2B0246-1729-4552-9FB7-48891B5F4873', 'ConversationID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agent Channels -> MJ: AI Agent Session Channels (One To Many via ChannelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '38ad5e19-b37b-485a-a3c0-b751476e6a33'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('38ad5e19-b37b-485a-a3c0-b751476e6a33', '417336BE-9DD3-481B-9686-81A435F54147', 'A909C8E5-D406-4899-878B-61972F736779', 'ChannelID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for AIAgentChannel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: vwAIAgentChannels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Channels
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentChannel
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentChannels]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentChannels];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentChannels]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIAgentChannel] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentChannels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: Permissions for vwAIAgentChannels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentChannels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: spCreateAIAgentChannel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentChannel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentChannel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentChannel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentChannel]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(1000) = NULL,
    @ServerPluginClass nvarchar(250),
    @ClientPluginClass nvarchar(250),
    @TransportType nvarchar(20) = NULL,
    @ConfigSchema_Clear bit = 0,
    @ConfigSchema nvarchar(MAX) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentChannel]
            (
                [ID],
                [Name],
                [Description],
                [ServerPluginClass],
                [ClientPluginClass],
                [TransportType],
                [ConfigSchema],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ServerPluginClass,
                @ClientPluginClass,
                ISNULL(@TransportType, 'PubSub'),
                CASE WHEN @ConfigSchema_Clear = 1 THEN NULL ELSE ISNULL(@ConfigSchema, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentChannel]
            (
                [Name],
                [Description],
                [ServerPluginClass],
                [ClientPluginClass],
                [TransportType],
                [ConfigSchema],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ServerPluginClass,
                @ClientPluginClass,
                ISNULL(@TransportType, 'PubSub'),
                CASE WHEN @ConfigSchema_Clear = 1 THEN NULL ELSE ISNULL(@ConfigSchema, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentChannels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Channels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: spUpdateAIAgentChannel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentChannel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentChannel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentChannel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentChannel]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(1000) = NULL,
    @ServerPluginClass nvarchar(250) = NULL,
    @ClientPluginClass nvarchar(250) = NULL,
    @TransportType nvarchar(20) = NULL,
    @ConfigSchema_Clear bit = 0,
    @ConfigSchema nvarchar(MAX) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentChannel]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ServerPluginClass] = ISNULL(@ServerPluginClass, [ServerPluginClass]),
        [ClientPluginClass] = ISNULL(@ClientPluginClass, [ClientPluginClass]),
        [TransportType] = ISNULL(@TransportType, [TransportType]),
        [ConfigSchema] = CASE WHEN @ConfigSchema_Clear = 1 THEN NULL ELSE ISNULL(@ConfigSchema, [ConfigSchema]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentChannels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentChannels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentChannel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentChannel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentChannel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentChannel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentChannel
ON [${flyway:defaultSchema}].[AIAgentChannel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentChannel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentChannel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Channels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: spDeleteAIAgentChannel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentChannel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentChannel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentChannel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentChannel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentChannel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Channels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for AIAgentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID ON [${flyway:defaultSchema}].[AIAgentRun] ([AgentID]);

-- Index for foreign key ParentRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ParentRunID]);

-- Index for foreign key ConversationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationID]);

-- Index for foreign key UserID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_UserID ON [${flyway:defaultSchema}].[AIAgentRun] ([UserID]);

-- Index for foreign key ConversationDetailID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationDetailID]);

-- Index for foreign key LastRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([LastRunID]);

-- Index for foreign key ConfigurationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConfigurationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConfigurationID]);

-- Index for foreign key OverrideModelID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideModelID ON [${flyway:defaultSchema}].[AIAgentRun] ([OverrideModelID]);

-- Index for foreign key OverrideVendorID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideVendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideVendorID ON [${flyway:defaultSchema}].[AIAgentRun] ([OverrideVendorID]);

-- Index for foreign key ScheduledJobRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ScheduledJobRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ScheduledJobRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ScheduledJobRunID]);

-- Index for foreign key TestRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_TestRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([TestRunID]);

-- Index for foreign key PrimaryScopeEntityID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_PrimaryScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_PrimaryScopeEntityID ON [${flyway:defaultSchema}].[AIAgentRun] ([PrimaryScopeEntityID]);

-- Index for foreign key AgentSessionID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_AgentSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_AgentSessionID ON [${flyway:defaultSchema}].[AIAgentRun] ([AgentSessionID]);

/* Index for Foreign Keys for AIAgentSessionChannel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Channels
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentSessionID in table AIAgentSessionChannel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSessionChannel_AgentSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSessionChannel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSessionChannel_AgentSessionID ON [${flyway:defaultSchema}].[AIAgentSessionChannel] ([AgentSessionID]);

-- Index for foreign key ChannelID in table AIAgentSessionChannel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSessionChannel_ChannelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSessionChannel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSessionChannel_ChannelID ON [${flyway:defaultSchema}].[AIAgentSessionChannel] ([ChannelID]);

/* SQL text to update entity field related entity name field map for entity field ID 784B75F0-16C4-485F-B2F4-8B07F50FBC4E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='784B75F0-16C4-485F-B2F4-8B07F50FBC4E', @RelatedEntityNameFieldMap='Channel';

/* Root ID Function SQL for MJ: AI Agent Runs.ParentRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRun].[ParentRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]
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
            [ParentRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentRunID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Root ID Function SQL for MJ: AI Agent Runs.LastRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunLastRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRun].[LastRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]
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
            [LastRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[LastRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[LastRunID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [LastRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRuns]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIAgentRun_ParentRunID.[RunName] AS [ParentRun],
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJUser_UserID.[Name] AS [User],
    MJConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    MJAIAgentRun_LastRunID.[RunName] AS [LastRun],
    MJAIConfiguration_ConfigurationID.[Name] AS [Configuration],
    MJAIModel_OverrideModelID.[Name] AS [OverrideModel],
    MJAIVendor_OverrideVendorID.[Name] AS [OverrideVendor],
    MJScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    MJEntity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity],
    root_ParentRunID.RootID AS [RootParentRunID],
    root_LastRunID.RootID AS [RootLastRunID]
FROM
    [${flyway:defaultSchema}].[AIAgentRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_ParentRunID
  ON
    [a].[ParentRunID] = MJAIAgentRun_ParentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [a].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ConversationDetailID
  ON
    [a].[ConversationDetailID] = MJConversationDetail_ConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_LastRunID
  ON
    [a].[LastRunID] = MJAIAgentRun_LastRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS MJAIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = MJAIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_OverrideModelID
  ON
    [a].[OverrideModelID] = MJAIModel_OverrideModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS MJAIVendor_OverrideVendorID
  ON
    [a].[OverrideVendorID] = MJAIVendor_OverrideVendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwScheduledJobRuns] AS MJScheduledJobRun_ScheduledJobRunID
  ON
    [a].[ScheduledJobRunID] = MJScheduledJobRun_ScheduledJobRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [a].[TestRunID] = MJTestRun_TestRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = MJEntity_PrimaryScopeEntityID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]([a].[ID], [a].[ParentRunID]) AS root_ParentRunID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]([a].[ID], [a].[LastRunID]) AS root_LastRunID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Permissions for vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ParentRunID_Clear bit = 0,
    @ParentRunID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @AgentState_Clear bit = 0,
    @AgentState nvarchar(MAX) = NULL,
    @TotalTokensUsed_Clear bit = 0,
    @TotalTokensUsed int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @TotalPromptTokensUsed_Clear bit = 0,
    @TotalPromptTokensUsed int = NULL,
    @TotalCompletionTokensUsed_Clear bit = 0,
    @TotalCompletionTokensUsed int = NULL,
    @TotalTokensUsedRollup_Clear bit = 0,
    @TotalTokensUsedRollup int = NULL,
    @TotalPromptTokensUsedRollup_Clear bit = 0,
    @TotalPromptTokensUsedRollup int = NULL,
    @TotalCompletionTokensUsedRollup_Clear bit = 0,
    @TotalCompletionTokensUsedRollup int = NULL,
    @TotalCostRollup_Clear bit = 0,
    @TotalCostRollup decimal(19, 8) = NULL,
    @ConversationDetailID_Clear bit = 0,
    @ConversationDetailID uniqueidentifier = NULL,
    @ConversationDetailSequence_Clear bit = 0,
    @ConversationDetailSequence int = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(30) = NULL,
    @FinalStep_Clear bit = 0,
    @FinalStep nvarchar(30) = NULL,
    @FinalPayload_Clear bit = 0,
    @FinalPayload nvarchar(MAX) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @LastRunID_Clear bit = 0,
    @LastRunID uniqueidentifier = NULL,
    @StartingPayload_Clear bit = 0,
    @StartingPayload nvarchar(MAX) = NULL,
    @TotalPromptIterations int = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @OverrideModelID_Clear bit = 0,
    @OverrideModelID uniqueidentifier = NULL,
    @OverrideVendorID_Clear bit = 0,
    @OverrideVendorID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Verbose_Clear bit = 0,
    @Verbose bit = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(200) = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @TotalCacheReadTokensUsed_Clear bit = 0,
    @TotalCacheReadTokensUsed int = NULL,
    @TotalCacheWriteTokensUsed_Clear bit = 0,
    @TotalCacheWriteTokensUsed int = NULL,
    @LastHeartbeatAt_Clear bit = 0,
    @LastHeartbeatAt datetimeoffset = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [ID],
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [ExternalReferenceID],
                [CompanyID],
                [TotalCacheReadTokensUsed],
                [TotalCacheWriteTokensUsed],
                [LastHeartbeatAt],
                [AgentSessionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                CASE WHEN @ParentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ParentRunID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @AgentState_Clear = 1 THEN NULL ELSE ISNULL(@AgentState, NULL) END,
                CASE WHEN @TotalTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsed, 0) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, 0.000000) END,
                CASE WHEN @TotalPromptTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsed, NULL) END,
                CASE WHEN @TotalCompletionTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsed, NULL) END,
                CASE WHEN @TotalTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsedRollup, NULL) END,
                CASE WHEN @TotalPromptTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCompletionTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCostRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCostRollup, NULL) END,
                CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, NULL) END,
                CASE WHEN @ConversationDetailSequence_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailSequence, NULL) END,
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @FinalStep_Clear = 1 THEN NULL ELSE ISNULL(@FinalStep, NULL) END,
                CASE WHEN @FinalPayload_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayload, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @LastRunID_Clear = 1 THEN NULL ELSE ISNULL(@LastRunID, NULL) END,
                CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, NULL) END,
                ISNULL(@TotalPromptIterations, 0),
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                CASE WHEN @OverrideModelID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideModelID, NULL) END,
                CASE WHEN @OverrideVendorID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideVendorID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Verbose_Clear = 1 THEN NULL ELSE ISNULL(@Verbose, 0) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @TotalCacheReadTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheReadTokensUsed, NULL) END,
                CASE WHEN @TotalCacheWriteTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheWriteTokensUsed, NULL) END,
                CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, NULL) END,
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [ExternalReferenceID],
                [CompanyID],
                [TotalCacheReadTokensUsed],
                [TotalCacheWriteTokensUsed],
                [LastHeartbeatAt],
                [AgentSessionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                CASE WHEN @ParentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ParentRunID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @AgentState_Clear = 1 THEN NULL ELSE ISNULL(@AgentState, NULL) END,
                CASE WHEN @TotalTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsed, 0) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, 0.000000) END,
                CASE WHEN @TotalPromptTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsed, NULL) END,
                CASE WHEN @TotalCompletionTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsed, NULL) END,
                CASE WHEN @TotalTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsedRollup, NULL) END,
                CASE WHEN @TotalPromptTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCompletionTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCostRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCostRollup, NULL) END,
                CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, NULL) END,
                CASE WHEN @ConversationDetailSequence_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailSequence, NULL) END,
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @FinalStep_Clear = 1 THEN NULL ELSE ISNULL(@FinalStep, NULL) END,
                CASE WHEN @FinalPayload_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayload, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @LastRunID_Clear = 1 THEN NULL ELSE ISNULL(@LastRunID, NULL) END,
                CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, NULL) END,
                ISNULL(@TotalPromptIterations, 0),
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                CASE WHEN @OverrideModelID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideModelID, NULL) END,
                CASE WHEN @OverrideVendorID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideVendorID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Verbose_Clear = 1 THEN NULL ELSE ISNULL(@Verbose, 0) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @TotalCacheReadTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheReadTokensUsed, NULL) END,
                CASE WHEN @TotalCacheWriteTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheWriteTokensUsed, NULL) END,
                CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, NULL) END,
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @ParentRunID_Clear bit = 0,
    @ParentRunID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @AgentState_Clear bit = 0,
    @AgentState nvarchar(MAX) = NULL,
    @TotalTokensUsed_Clear bit = 0,
    @TotalTokensUsed int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @TotalPromptTokensUsed_Clear bit = 0,
    @TotalPromptTokensUsed int = NULL,
    @TotalCompletionTokensUsed_Clear bit = 0,
    @TotalCompletionTokensUsed int = NULL,
    @TotalTokensUsedRollup_Clear bit = 0,
    @TotalTokensUsedRollup int = NULL,
    @TotalPromptTokensUsedRollup_Clear bit = 0,
    @TotalPromptTokensUsedRollup int = NULL,
    @TotalCompletionTokensUsedRollup_Clear bit = 0,
    @TotalCompletionTokensUsedRollup int = NULL,
    @TotalCostRollup_Clear bit = 0,
    @TotalCostRollup decimal(19, 8) = NULL,
    @ConversationDetailID_Clear bit = 0,
    @ConversationDetailID uniqueidentifier = NULL,
    @ConversationDetailSequence_Clear bit = 0,
    @ConversationDetailSequence int = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(30) = NULL,
    @FinalStep_Clear bit = 0,
    @FinalStep nvarchar(30) = NULL,
    @FinalPayload_Clear bit = 0,
    @FinalPayload nvarchar(MAX) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @LastRunID_Clear bit = 0,
    @LastRunID uniqueidentifier = NULL,
    @StartingPayload_Clear bit = 0,
    @StartingPayload nvarchar(MAX) = NULL,
    @TotalPromptIterations int = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @OverrideModelID_Clear bit = 0,
    @OverrideModelID uniqueidentifier = NULL,
    @OverrideVendorID_Clear bit = 0,
    @OverrideVendorID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Verbose_Clear bit = 0,
    @Verbose bit = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(200) = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @TotalCacheReadTokensUsed_Clear bit = 0,
    @TotalCacheReadTokensUsed int = NULL,
    @TotalCacheWriteTokensUsed_Clear bit = 0,
    @TotalCacheWriteTokensUsed int = NULL,
    @LastHeartbeatAt_Clear bit = 0,
    @LastHeartbeatAt datetimeoffset = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [ParentRunID] = CASE WHEN @ParentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ParentRunID, [ParentRunID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [Success] = CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, [Success]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ConversationID] = CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, [ConversationID]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [Result] = CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, [Result]) END,
        [AgentState] = CASE WHEN @AgentState_Clear = 1 THEN NULL ELSE ISNULL(@AgentState, [AgentState]) END,
        [TotalTokensUsed] = CASE WHEN @TotalTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsed, [TotalTokensUsed]) END,
        [TotalCost] = CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, [TotalCost]) END,
        [TotalPromptTokensUsed] = CASE WHEN @TotalPromptTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsed, [TotalPromptTokensUsed]) END,
        [TotalCompletionTokensUsed] = CASE WHEN @TotalCompletionTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsed, [TotalCompletionTokensUsed]) END,
        [TotalTokensUsedRollup] = CASE WHEN @TotalTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsedRollup, [TotalTokensUsedRollup]) END,
        [TotalPromptTokensUsedRollup] = CASE WHEN @TotalPromptTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsedRollup, [TotalPromptTokensUsedRollup]) END,
        [TotalCompletionTokensUsedRollup] = CASE WHEN @TotalCompletionTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsedRollup, [TotalCompletionTokensUsedRollup]) END,
        [TotalCostRollup] = CASE WHEN @TotalCostRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCostRollup, [TotalCostRollup]) END,
        [ConversationDetailID] = CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, [ConversationDetailID]) END,
        [ConversationDetailSequence] = CASE WHEN @ConversationDetailSequence_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailSequence, [ConversationDetailSequence]) END,
        [CancellationReason] = CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, [CancellationReason]) END,
        [FinalStep] = CASE WHEN @FinalStep_Clear = 1 THEN NULL ELSE ISNULL(@FinalStep, [FinalStep]) END,
        [FinalPayload] = CASE WHEN @FinalPayload_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayload, [FinalPayload]) END,
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [LastRunID] = CASE WHEN @LastRunID_Clear = 1 THEN NULL ELSE ISNULL(@LastRunID, [LastRunID]) END,
        [StartingPayload] = CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, [StartingPayload]) END,
        [TotalPromptIterations] = ISNULL(@TotalPromptIterations, [TotalPromptIterations]),
        [ConfigurationID] = CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, [ConfigurationID]) END,
        [OverrideModelID] = CASE WHEN @OverrideModelID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideModelID, [OverrideModelID]) END,
        [OverrideVendorID] = CASE WHEN @OverrideVendorID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideVendorID, [OverrideVendorID]) END,
        [Data] = CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, [Data]) END,
        [Verbose] = CASE WHEN @Verbose_Clear = 1 THEN NULL ELSE ISNULL(@Verbose, [Verbose]) END,
        [EffortLevel] = CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, [EffortLevel]) END,
        [RunName] = CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, [RunName]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [ScheduledJobRunID] = CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, [ScheduledJobRunID]) END,
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [PrimaryScopeEntityID] = CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, [PrimaryScopeEntityID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [SecondaryScopes] = CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, [SecondaryScopes]) END,
        [ExternalReferenceID] = CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, [ExternalReferenceID]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [TotalCacheReadTokensUsed] = CASE WHEN @TotalCacheReadTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheReadTokensUsed, [TotalCacheReadTokensUsed]) END,
        [TotalCacheWriteTokensUsed] = CASE WHEN @TotalCacheWriteTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheWriteTokensUsed, [TotalCacheWriteTokensUsed]) END,
        [LastHeartbeatAt] = CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, [LastHeartbeatAt]) END,
        [AgentSessionID] = CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, [AgentSessionID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRun
ON [${flyway:defaultSchema}].[AIAgentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: AI Agent Session Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Channels
-- Item: vwAIAgentSessionChannels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Session Channels
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentSessionChannel
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentSessionChannels]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentSessionChannels];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentSessionChannels]
AS
SELECT
    a.*,
    MJAIAgentChannel_ChannelID.[Name] AS [Channel]
FROM
    [${flyway:defaultSchema}].[AIAgentSessionChannel] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgentChannel] AS MJAIAgentChannel_ChannelID
  ON
    [a].[ChannelID] = MJAIAgentChannel_ChannelID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionChannels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Session Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Channels
-- Item: Permissions for vwAIAgentSessionChannels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionChannels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Session Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Channels
-- Item: spCreateAIAgentSessionChannel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentSessionChannel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentSessionChannel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSessionChannel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSessionChannel]
    @ID uniqueidentifier = NULL,
    @AgentSessionID uniqueidentifier,
    @ChannelID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @SocketUrl_Clear bit = 0,
    @SocketUrl nvarchar(500) = NULL,
    @Config_Clear bit = 0,
    @Config nvarchar(MAX) = NULL,
    @LastActiveAt datetimeoffset = NULL,
    @DisconnectedAt_Clear bit = 0,
    @DisconnectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSessionChannel]
            (
                [ID],
                [AgentSessionID],
                [ChannelID],
                [Status],
                [SocketUrl],
                [Config],
                [LastActiveAt],
                [DisconnectedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentSessionID,
                @ChannelID,
                ISNULL(@Status, 'Connecting'),
                CASE WHEN @SocketUrl_Clear = 1 THEN NULL ELSE ISNULL(@SocketUrl, NULL) END,
                CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, NULL) END,
                ISNULL(@LastActiveAt, sysdatetimeoffset()),
                CASE WHEN @DisconnectedAt_Clear = 1 THEN NULL ELSE ISNULL(@DisconnectedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSessionChannel]
            (
                [AgentSessionID],
                [ChannelID],
                [Status],
                [SocketUrl],
                [Config],
                [LastActiveAt],
                [DisconnectedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentSessionID,
                @ChannelID,
                ISNULL(@Status, 'Connecting'),
                CASE WHEN @SocketUrl_Clear = 1 THEN NULL ELSE ISNULL(@SocketUrl, NULL) END,
                CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, NULL) END,
                ISNULL(@LastActiveAt, sysdatetimeoffset()),
                CASE WHEN @DisconnectedAt_Clear = 1 THEN NULL ELSE ISNULL(@DisconnectedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentSessionChannels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionChannel] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Session Channels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionChannel] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Session Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Channels
-- Item: spUpdateAIAgentSessionChannel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentSessionChannel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentSessionChannel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSessionChannel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSessionChannel]
    @ID uniqueidentifier,
    @AgentSessionID uniqueidentifier = NULL,
    @ChannelID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SocketUrl_Clear bit = 0,
    @SocketUrl nvarchar(500) = NULL,
    @Config_Clear bit = 0,
    @Config nvarchar(MAX) = NULL,
    @LastActiveAt datetimeoffset = NULL,
    @DisconnectedAt_Clear bit = 0,
    @DisconnectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSessionChannel]
    SET
        [AgentSessionID] = ISNULL(@AgentSessionID, [AgentSessionID]),
        [ChannelID] = ISNULL(@ChannelID, [ChannelID]),
        [Status] = ISNULL(@Status, [Status]),
        [SocketUrl] = CASE WHEN @SocketUrl_Clear = 1 THEN NULL ELSE ISNULL(@SocketUrl, [SocketUrl]) END,
        [Config] = CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, [Config]) END,
        [LastActiveAt] = ISNULL(@LastActiveAt, [LastActiveAt]),
        [DisconnectedAt] = CASE WHEN @DisconnectedAt_Clear = 1 THEN NULL ELSE ISNULL(@DisconnectedAt, [DisconnectedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentSessionChannels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentSessionChannels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionChannel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSessionChannel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentSessionChannel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentSessionChannel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentSessionChannel
ON [${flyway:defaultSchema}].[AIAgentSessionChannel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSessionChannel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentSessionChannel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Session Channels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionChannel] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Session Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Channels
-- Item: spDeleteAIAgentSessionChannel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentSessionChannel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentSessionChannel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSessionChannel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSessionChannel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentSessionChannel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionChannel] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Session Channels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionChannel] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceAIAgentRunIDID, @AgentID = @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @UserID = @MJAIAgentExamples_SourceAIAgentRunID_UserID, @CompanyID = @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @Type = @MJAIAgentExamples_SourceAIAgentRunID_Type, @ExampleInput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @Comments = @MJAIAgentExamples_SourceAIAgentRunID_Comments, @Status = @MJAIAgentExamples_SourceAIAgentRunID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore decimal(5, 2)
    DECLARE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceAIAgentRunIDID, @AgentID = @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceAIAgentRunID_Note, @UserID = @MJAIAgentNotes_SourceAIAgentRunID_UserID, @Type = @MJAIAgentNotes_SourceAIAgentRunID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceAIAgentRunID_Comments, @Status = @MJAIAgentNotes_SourceAIAgentRunID_Status, @SourceConversationID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @OriginatingAgentRunID_Clear = 1, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_ResumingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [ResumingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_ResumingAgentRunIDID, @AgentID = @MJAIAgentRequests_ResumingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_ResumingAgentRunID_Status, @Request = @MJAIAgentRequests_ResumingAgentRunID_Request, @Response = @MJAIAgentRequests_ResumingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_ResumingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_ResumingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID_Clear = 1, @ResumingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia
    DECLARE @MJAIAgentRunMedias_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunMedia]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] @ID = @MJAIAgentRunMedias_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] @ID = @MJAIAgentRunSteps_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ParentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ParentRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_Success bit
    DECLARE @MJAIAgentRuns_ParentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ParentRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ParentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Verbose bit
    DECLARE @MJAIAgentRuns_ParentRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_ParentRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ParentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ParentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRuns_ParentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ParentRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ParentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ParentRunID_ParentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ParentRunIDID, @AgentID = @MJAIAgentRuns_ParentRunID_AgentID, @ParentRunID_Clear = 1, @ParentRunID = @MJAIAgentRuns_ParentRunID_ParentRunID, @Status = @MJAIAgentRuns_ParentRunID_Status, @StartedAt = @MJAIAgentRuns_ParentRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_ParentRunID_CompletedAt, @Success = @MJAIAgentRuns_ParentRunID_Success, @ErrorMessage = @MJAIAgentRuns_ParentRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ParentRunID_ConversationID, @UserID = @MJAIAgentRuns_ParentRunID_UserID, @Result = @MJAIAgentRuns_ParentRunID_Result, @AgentState = @MJAIAgentRuns_ParentRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ParentRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ParentRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ParentRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ParentRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_ParentRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_ParentRunID_FinalPayload, @Message = @MJAIAgentRuns_ParentRunID_Message, @LastRunID = @MJAIAgentRuns_ParentRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_ParentRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ParentRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ParentRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ParentRunID_OverrideVendorID, @Data = @MJAIAgentRuns_ParentRunID_Data, @Verbose = @MJAIAgentRuns_ParentRunID_Verbose, @EffortLevel = @MJAIAgentRuns_ParentRunID_EffortLevel, @RunName = @MJAIAgentRuns_ParentRunID_RunName, @Comments = @MJAIAgentRuns_ParentRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ParentRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ParentRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ParentRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ParentRunID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID
    END

    CLOSE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_LastRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_LastRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_Success bit
    DECLARE @MJAIAgentRuns_LastRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_LastRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_LastRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Verbose bit
    DECLARE @MJAIAgentRuns_LastRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_LastRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_LastRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_LastRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRuns_LastRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [LastRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_LastRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_LastRunID_LastRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_LastRunIDID, @AgentID = @MJAIAgentRuns_LastRunID_AgentID, @ParentRunID = @MJAIAgentRuns_LastRunID_ParentRunID, @Status = @MJAIAgentRuns_LastRunID_Status, @StartedAt = @MJAIAgentRuns_LastRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_LastRunID_CompletedAt, @Success = @MJAIAgentRuns_LastRunID_Success, @ErrorMessage = @MJAIAgentRuns_LastRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_LastRunID_ConversationID, @UserID = @MJAIAgentRuns_LastRunID_UserID, @Result = @MJAIAgentRuns_LastRunID_Result, @AgentState = @MJAIAgentRuns_LastRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_LastRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_LastRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_LastRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_LastRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_LastRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_LastRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_LastRunID_FinalPayload, @Message = @MJAIAgentRuns_LastRunID_Message, @LastRunID_Clear = 1, @LastRunID = @MJAIAgentRuns_LastRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_LastRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_LastRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_LastRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_LastRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_LastRunID_OverrideVendorID, @Data = @MJAIAgentRuns_LastRunID_Data, @Verbose = @MJAIAgentRuns_LastRunID_Verbose, @EffortLevel = @MJAIAgentRuns_LastRunID_EffortLevel, @RunName = @MJAIAgentRuns_LastRunID_RunName, @Comments = @MJAIAgentRuns_LastRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_LastRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_LastRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_LastRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_LastRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_LastRunID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID
    END

    CLOSE cascade_update_MJAIAgentRuns_LastRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_LastRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_Success bit
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopK int
    DECLARE @MJAIPromptRuns_AgentRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_Seed int
    DECLARE @MJAIPromptRuns_AgentRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentRunID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentRunIDID, @PromptID = @MJAIPromptRuns_AgentRunID_PromptID, @ModelID = @MJAIPromptRuns_AgentRunID_ModelID, @VendorID = @MJAIPromptRuns_AgentRunID_VendorID, @AgentID = @MJAIPromptRuns_AgentRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentRunID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentRunID_Messages, @Result = @MJAIPromptRuns_AgentRunID_Result, @TokensUsed = @MJAIPromptRuns_AgentRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentRunID_TotalCost, @Success = @MJAIPromptRuns_AgentRunID_Success, @ErrorMessage = @MJAIPromptRuns_AgentRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentRunID_ParentID, @RunType = @MJAIPromptRuns_AgentRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentRunID_ExecutionOrder, @AgentRunID_Clear = 1, @AgentRunID = @MJAIPromptRuns_AgentRunID_AgentRunID, @Cost = @MJAIPromptRuns_AgentRunID_Cost, @CostCurrency = @MJAIPromptRuns_AgentRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentRunID_Temperature, @TopP = @MJAIPromptRuns_AgentRunID_TopP, @TopK = @MJAIPromptRuns_AgentRunID_TopK, @MinP = @MJAIPromptRuns_AgentRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentRunID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentRunID_Seed, @StopSequences = @MJAIPromptRuns_AgentRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentRunID_ModelSelection, @Status = @MJAIPromptRuns_AgentRunID_Status, @Cancelled = @MJAIPromptRuns_AgentRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentRunID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentRunID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentRunID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentRunID_EffortLevel, @RunName = @MJAIPromptRuns_AgentRunID_RunName, @Comments = @MJAIPromptRuns_AgentRunID_Comments, @TestRunID = @MJAIPromptRuns_AgentRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

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

/* SQL text to update entity field related entity name field map for entity field ID A1D999AB-CBA5-4233-A296-87E026E40807 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A1D999AB-CBA5-4233-A296-87E026E40807', @RelatedEntityNameFieldMap='Agent';

/* Index for Foreign Keys for AIAgentType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SystemPromptID in table AIAgentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentType_SystemPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentType_SystemPromptID ON [${flyway:defaultSchema}].[AIAgentType] ([SystemPromptID]);

-- Index for foreign key DefaultStorageAccountID in table AIAgentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentType_DefaultStorageAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentType_DefaultStorageAccountID ON [${flyway:defaultSchema}].[AIAgentType] ([DefaultStorageAccountID]);

-- Index for foreign key DefaultCoAgentID in table AIAgentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentType_DefaultCoAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentType_DefaultCoAgentID ON [${flyway:defaultSchema}].[AIAgentType] ([DefaultCoAgentID]);

/* SQL text to update entity field related entity name field map for entity field ID C215D1C0-9EB6-43EC-A8C2-AC64E9BDED0E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C215D1C0-9EB6-43EC-A8C2-AC64E9BDED0E', @RelatedEntityNameFieldMap='DefaultCoAgent';

/* Base View SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: vwAIAgentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentTypes]
AS
SELECT
    a.*,
    MJAIPrompt_SystemPromptID.[Name] AS [SystemPrompt],
    MJFileStorageAccount_DefaultStorageAccountID.[Name] AS [DefaultStorageAccount],
    MJAIAgent_DefaultCoAgentID.[Name] AS [DefaultCoAgent]
FROM
    [${flyway:defaultSchema}].[AIAgentType] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_SystemPromptID
  ON
    [a].[SystemPromptID] = MJAIPrompt_SystemPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageAccount] AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    [a].[DefaultStorageAccountID] = MJFileStorageAccount_DefaultStorageAccountID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_DefaultCoAgentID
  ON
    [a].[DefaultCoAgentID] = MJAIAgent_DefaultCoAgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: Permissions for vwAIAgentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spCreateAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SystemPromptID_Clear bit = 0,
    @SystemPromptID uniqueidentifier = NULL,
    @IsActive bit = NULL,
    @AgentPromptPlaceholder_Clear bit = 0,
    @AgentPromptPlaceholder nvarchar(255) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @UIFormSectionKey_Clear bit = 0,
    @UIFormSectionKey nvarchar(500) = NULL,
    @UIFormKey_Clear bit = 0,
    @UIFormKey nvarchar(500) = NULL,
    @UIFormSectionExpandedByDefault bit = NULL,
    @PromptParamsSchema_Clear bit = 0,
    @PromptParamsSchema nvarchar(MAX) = NULL,
    @AssignmentStrategy_Clear bit = 0,
    @AssignmentStrategy nvarchar(MAX) = NULL,
    @DefaultStorageAccountID_Clear bit = 0,
    @DefaultStorageAccountID uniqueidentifier = NULL,
    @DefaultCoAgentID_Clear bit = 0,
    @DefaultCoAgentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentType]
            (
                [ID],
                [Name],
                [Description],
                [SystemPromptID],
                [IsActive],
                [AgentPromptPlaceholder],
                [DriverClass],
                [UIFormSectionKey],
                [UIFormKey],
                [UIFormSectionExpandedByDefault],
                [PromptParamsSchema],
                [AssignmentStrategy],
                [DefaultStorageAccountID],
                [DefaultCoAgentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SystemPromptID_Clear = 1 THEN NULL ELSE ISNULL(@SystemPromptID, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @AgentPromptPlaceholder_Clear = 1 THEN NULL ELSE ISNULL(@AgentPromptPlaceholder, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @UIFormSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@UIFormSectionKey, NULL) END,
                CASE WHEN @UIFormKey_Clear = 1 THEN NULL ELSE ISNULL(@UIFormKey, NULL) END,
                ISNULL(@UIFormSectionExpandedByDefault, 1),
                CASE WHEN @PromptParamsSchema_Clear = 1 THEN NULL ELSE ISNULL(@PromptParamsSchema, NULL) END,
                CASE WHEN @AssignmentStrategy_Clear = 1 THEN NULL ELSE ISNULL(@AssignmentStrategy, NULL) END,
                CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, NULL) END,
                CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentType]
            (
                [Name],
                [Description],
                [SystemPromptID],
                [IsActive],
                [AgentPromptPlaceholder],
                [DriverClass],
                [UIFormSectionKey],
                [UIFormKey],
                [UIFormSectionExpandedByDefault],
                [PromptParamsSchema],
                [AssignmentStrategy],
                [DefaultStorageAccountID],
                [DefaultCoAgentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SystemPromptID_Clear = 1 THEN NULL ELSE ISNULL(@SystemPromptID, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @AgentPromptPlaceholder_Clear = 1 THEN NULL ELSE ISNULL(@AgentPromptPlaceholder, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @UIFormSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@UIFormSectionKey, NULL) END,
                CASE WHEN @UIFormKey_Clear = 1 THEN NULL ELSE ISNULL(@UIFormKey, NULL) END,
                ISNULL(@UIFormSectionExpandedByDefault, 1),
                CASE WHEN @PromptParamsSchema_Clear = 1 THEN NULL ELSE ISNULL(@PromptParamsSchema, NULL) END,
                CASE WHEN @AssignmentStrategy_Clear = 1 THEN NULL ELSE ISNULL(@AssignmentStrategy, NULL) END,
                CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, NULL) END,
                CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spUpdateAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SystemPromptID_Clear bit = 0,
    @SystemPromptID uniqueidentifier = NULL,
    @IsActive bit = NULL,
    @AgentPromptPlaceholder_Clear bit = 0,
    @AgentPromptPlaceholder nvarchar(255) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @UIFormSectionKey_Clear bit = 0,
    @UIFormSectionKey nvarchar(500) = NULL,
    @UIFormKey_Clear bit = 0,
    @UIFormKey nvarchar(500) = NULL,
    @UIFormSectionExpandedByDefault bit = NULL,
    @PromptParamsSchema_Clear bit = 0,
    @PromptParamsSchema nvarchar(MAX) = NULL,
    @AssignmentStrategy_Clear bit = 0,
    @AssignmentStrategy nvarchar(MAX) = NULL,
    @DefaultStorageAccountID_Clear bit = 0,
    @DefaultStorageAccountID uniqueidentifier = NULL,
    @DefaultCoAgentID_Clear bit = 0,
    @DefaultCoAgentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [SystemPromptID] = CASE WHEN @SystemPromptID_Clear = 1 THEN NULL ELSE ISNULL(@SystemPromptID, [SystemPromptID]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [AgentPromptPlaceholder] = CASE WHEN @AgentPromptPlaceholder_Clear = 1 THEN NULL ELSE ISNULL(@AgentPromptPlaceholder, [AgentPromptPlaceholder]) END,
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [UIFormSectionKey] = CASE WHEN @UIFormSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@UIFormSectionKey, [UIFormSectionKey]) END,
        [UIFormKey] = CASE WHEN @UIFormKey_Clear = 1 THEN NULL ELSE ISNULL(@UIFormKey, [UIFormKey]) END,
        [UIFormSectionExpandedByDefault] = ISNULL(@UIFormSectionExpandedByDefault, [UIFormSectionExpandedByDefault]),
        [PromptParamsSchema] = CASE WHEN @PromptParamsSchema_Clear = 1 THEN NULL ELSE ISNULL(@PromptParamsSchema, [PromptParamsSchema]) END,
        [AssignmentStrategy] = CASE WHEN @AssignmentStrategy_Clear = 1 THEN NULL ELSE ISNULL(@AssignmentStrategy, [AssignmentStrategy]) END,
        [DefaultStorageAccountID] = CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, [DefaultStorageAccountID]) END,
        [DefaultCoAgentID] = CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, [DefaultCoAgentID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentType
ON [${flyway:defaultSchema}].[AIAgentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spDeleteAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentType] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID EE4F8641-BF5C-449F-B249-EF634D240C90 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EE4F8641-BF5C-449F-B249-EF634D240C90', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 61E0BCC1-5696-4F1D-9FDC-4C71A7BED310 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='61E0BCC1-5696-4F1D-9FDC-4C71A7BED310', @RelatedEntityNameFieldMap='Conversation';

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
    @CloseReason nvarchar(20) = NULL
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
                [CloseReason]
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
                CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, NULL) END
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
                [CloseReason]
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
                CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, NULL) END
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
    @CloseReason nvarchar(20) = NULL
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
        [CloseReason] = CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, [CloseReason]) END
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

/* Index for Foreign Keys for ConversationDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID ON [${flyway:defaultSchema}].[ConversationDetail] ([ConversationID]);

-- Index for foreign key UserID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_UserID ON [${flyway:defaultSchema}].[ConversationDetail] ([UserID]);

-- Index for foreign key ArtifactID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactID]);

-- Index for foreign key ArtifactVersionID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactVersionID]);

-- Index for foreign key ParentID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID ON [${flyway:defaultSchema}].[ConversationDetail] ([ParentID]);

-- Index for foreign key AgentID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID ON [${flyway:defaultSchema}].[ConversationDetail] ([AgentID]);

-- Index for foreign key TestRunID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID ON [${flyway:defaultSchema}].[ConversationDetail] ([TestRunID]);

-- Index for foreign key AgentSessionID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_AgentSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_AgentSessionID ON [${flyway:defaultSchema}].[ConversationDetail] ([AgentSessionID]);

/* Root ID Function SQL for MJ: Conversation Details.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: fnConversationDetailParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ConversationDetail].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]
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
            [${flyway:defaultSchema}].[ConversationDetail]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ConversationDetail] c
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

/* Base View SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetails]
AS
SELECT
    c.*,
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJUser_UserID.[Name] AS [User],
    MJConversationArtifact_ArtifactID.[Name] AS [Artifact],
    MJConversationArtifactVersion_ArtifactVersionID.[ConversationArtifact] AS [ArtifactVersion],
    MJConversationDetail_ParentID.[Message] AS [Parent],
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[ConversationDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [c].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [c].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS MJConversationArtifact_ArtifactID
  ON
    [c].[ArtifactID] = MJConversationArtifact_ArtifactID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwConversationArtifactVersions] AS MJConversationArtifactVersion_ArtifactVersionID
  ON
    [c].[ArtifactVersionID] = MJConversationArtifactVersion_ArtifactVersionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ParentID
  ON
    [c].[ParentID] = MJConversationDetail_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [c].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [c].[TestRunID] = MJTestRun_TestRunID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: Permissions for vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(100) = NULL,
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX),
    @Error_Clear bit = 0,
    @Error nvarchar(MAX) = NULL,
    @HiddenToUser bit = NULL,
    @UserRating_Clear bit = 0,
    @UserRating int = NULL,
    @UserFeedback_Clear bit = 0,
    @UserFeedback nvarchar(MAX) = NULL,
    @ReflectionInsights_Clear bit = 0,
    @ReflectionInsights nvarchar(MAX) = NULL,
    @SummaryOfEarlierConversation_Clear bit = 0,
    @SummaryOfEarlierConversation nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime bigint = NULL,
    @IsPinned bit = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses_Clear bit = 0,
    @SuggestedResponses nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ResponseForm_Clear bit = 0,
    @ResponseForm nvarchar(MAX) = NULL,
    @ActionableCommands_Clear bit = 0,
    @ActionableCommands nvarchar(MAX) = NULL,
    @AutomaticCommands_Clear bit = 0,
    @AutomaticCommands nvarchar(MAX) = NULL,
    @OriginalMessageChanged bit = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ID],
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged],
                [AgentSessionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                ISNULL(@Role, user_name()),
                @Message,
                CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, NULL) END,
                ISNULL(@HiddenToUser, 0),
                CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, NULL) END,
                CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, NULL) END,
                CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, NULL) END,
                CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, NULL) END,
                CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, NULL) END,
                CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, NULL) END,
                ISNULL(@OriginalMessageChanged, 0),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged],
                [AgentSessionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                ISNULL(@Role, user_name()),
                @Message,
                CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, NULL) END,
                ISNULL(@HiddenToUser, 0),
                CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, NULL) END,
                CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, NULL) END,
                CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, NULL) END,
                CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, NULL) END,
                CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, NULL) END,
                CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, NULL) END,
                ISNULL(@OriginalMessageChanged, 0),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spUpdate SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spUpdateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier = NULL,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(100) = NULL,
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX) = NULL,
    @Error_Clear bit = 0,
    @Error nvarchar(MAX) = NULL,
    @HiddenToUser bit = NULL,
    @UserRating_Clear bit = 0,
    @UserRating int = NULL,
    @UserFeedback_Clear bit = 0,
    @UserFeedback nvarchar(MAX) = NULL,
    @ReflectionInsights_Clear bit = 0,
    @ReflectionInsights nvarchar(MAX) = NULL,
    @SummaryOfEarlierConversation_Clear bit = 0,
    @SummaryOfEarlierConversation nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime bigint = NULL,
    @IsPinned bit = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses_Clear bit = 0,
    @SuggestedResponses nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ResponseForm_Clear bit = 0,
    @ResponseForm nvarchar(MAX) = NULL,
    @ActionableCommands_Clear bit = 0,
    @ActionableCommands nvarchar(MAX) = NULL,
    @AutomaticCommands_Clear bit = 0,
    @AutomaticCommands nvarchar(MAX) = NULL,
    @OriginalMessageChanged bit = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        [ConversationID] = ISNULL(@ConversationID, [ConversationID]),
        [ExternalID] = CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, [ExternalID]) END,
        [Role] = ISNULL(@Role, [Role]),
        [Message] = ISNULL(@Message, [Message]),
        [Error] = CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, [Error]) END,
        [HiddenToUser] = ISNULL(@HiddenToUser, [HiddenToUser]),
        [UserRating] = CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, [UserRating]) END,
        [UserFeedback] = CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, [UserFeedback]) END,
        [ReflectionInsights] = CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, [ReflectionInsights]) END,
        [SummaryOfEarlierConversation] = CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, [SummaryOfEarlierConversation]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [ArtifactID] = CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, [ArtifactID]) END,
        [ArtifactVersionID] = CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, [ArtifactVersionID]) END,
        [CompletionTime] = CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, [CompletionTime]) END,
        [IsPinned] = ISNULL(@IsPinned, [IsPinned]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [SuggestedResponses] = CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, [SuggestedResponses]) END,
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [ResponseForm] = CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, [ResponseForm]) END,
        [ActionableCommands] = CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, [ActionableCommands]) END,
        [AutomaticCommands] = CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, [AutomaticCommands]) END,
        [OriginalMessageChanged] = ISNULL(@OriginalMessageChanged, [OriginalMessageChanged]),
        [AgentSessionID] = CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, [AgentSessionID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetail
ON [${flyway:defaultSchema}].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationDetailIDID, @AgentID = @MJAIAgentExamples_SourceConversationDetailID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationDetailID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationDetailID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationDetailID_Comments, @Status = @MJAIAgentExamples_SourceConversationDetailID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore decimal(5, 2)
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationDetailIDID, @AgentID = @MJAIAgentNotes_SourceConversationDetailID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationDetailID_Note, @UserID = @MJAIAgentNotes_SourceConversationDetailID_UserID, @Type = @MJAIAgentNotes_SourceConversationDetailID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationDetailID_Comments, @Status = @MJAIAgentNotes_SourceConversationDetailID_Status, @SourceConversationID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_Success bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationDetailID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationDetailID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @MJAIAgentRuns_ConversationDetailID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationDetailIDID, @AgentID = @MJAIAgentRuns_ConversationDetailID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationDetailID_ParentRunID, @Status = @MJAIAgentRuns_ConversationDetailID_Status, @StartedAt = @MJAIAgentRuns_ConversationDetailID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationDetailID_CompletedAt, @Success = @MJAIAgentRuns_ConversationDetailID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ConversationDetailID_ConversationID, @UserID = @MJAIAgentRuns_ConversationDetailID_UserID, @Result = @MJAIAgentRuns_ConversationDetailID_Result, @AgentState = @MJAIAgentRuns_ConversationDetailID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationDetailID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationDetailID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationDetailID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationDetailID_FinalPayload, @Message = @MJAIAgentRuns_ConversationDetailID_Message, @LastRunID = @MJAIAgentRuns_ConversationDetailID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationDetailID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationDetailID_Data, @Verbose = @MJAIAgentRuns_ConversationDetailID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationDetailID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationDetailID_RunName, @Comments = @MJAIAgentRuns_ConversationDetailID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationDetailID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationDetailID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConversationDetailID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @MJAIAgentRuns_ConversationDetailID_AgentSessionID
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJConversationDetailArtifacts_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJConversationDetailArtifacts_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment
    DECLARE @MJConversationDetailAttachments_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailAttachment]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] @ID = @MJConversationDetailAttachments_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJConversationDetailRatings_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJConversationDetailRatings_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ParentIDID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ParentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_HiddenToUser bit
    DECLARE @MJConversationDetails_ParentID_UserRating int
    DECLARE @MJConversationDetails_ParentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_CompletionTime bigint
    DECLARE @MJConversationDetails_ParentID_IsPinned bit
    DECLARE @MJConversationDetails_ParentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_ParentID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJConversationDetails_ParentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJConversationDetails_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged, @MJConversationDetails_ParentID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ParentIDID, @ConversationID = @MJConversationDetails_ParentID_ConversationID, @ExternalID = @MJConversationDetails_ParentID_ExternalID, @Role = @MJConversationDetails_ParentID_Role, @Message = @MJConversationDetails_ParentID_Message, @Error = @MJConversationDetails_ParentID_Error, @HiddenToUser = @MJConversationDetails_ParentID_HiddenToUser, @UserRating = @MJConversationDetails_ParentID_UserRating, @UserFeedback = @MJConversationDetails_ParentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ParentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ParentID_UserID, @ArtifactID = @MJConversationDetails_ParentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_ParentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ParentID_CompletionTime, @IsPinned = @MJConversationDetails_ParentID_IsPinned, @ParentID_Clear = 1, @ParentID = @MJConversationDetails_ParentID_ParentID, @AgentID = @MJConversationDetails_ParentID_AgentID, @Status = @MJConversationDetails_ParentID_Status, @SuggestedResponses = @MJConversationDetails_ParentID_SuggestedResponses, @TestRunID = @MJConversationDetails_ParentID_TestRunID, @ResponseForm = @MJConversationDetails_ParentID_ResponseForm, @ActionableCommands = @MJConversationDetails_ParentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ParentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ParentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_ParentID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged, @MJConversationDetails_ParentID_AgentSessionID
    END

    CLOSE cascade_update_MJConversationDetails_ParentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ParentID_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @MJReports_ConversationDetailIDID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJReports_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_CategoryID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_SharingScope nvarchar(20)
    DECLARE @MJReports_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_DataContextID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Configuration nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_OutputTriggerTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputFormatTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputDeliveryTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputFrequency nvarchar(50)
    DECLARE @MJReports_ConversationDetailID_OutputTargetEmail nvarchar(255)
    DECLARE @MJReports_ConversationDetailID_OutputWorkflowID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Thumbnail nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE cascade_update_MJReports_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJReports_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJReports_ConversationDetailID_cursor INTO @MJReports_ConversationDetailIDID, @MJReports_ConversationDetailID_Name, @MJReports_ConversationDetailID_Description, @MJReports_ConversationDetailID_CategoryID, @MJReports_ConversationDetailID_UserID, @MJReports_ConversationDetailID_SharingScope, @MJReports_ConversationDetailID_ConversationID, @MJReports_ConversationDetailID_ConversationDetailID, @MJReports_ConversationDetailID_DataContextID, @MJReports_ConversationDetailID_Configuration, @MJReports_ConversationDetailID_OutputTriggerTypeID, @MJReports_ConversationDetailID_OutputFormatTypeID, @MJReports_ConversationDetailID_OutputDeliveryTypeID, @MJReports_ConversationDetailID_OutputFrequency, @MJReports_ConversationDetailID_OutputTargetEmail, @MJReports_ConversationDetailID_OutputWorkflowID, @MJReports_ConversationDetailID_Thumbnail, @MJReports_ConversationDetailID_EnvironmentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJReports_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @MJReports_ConversationDetailIDID, @Name = @MJReports_ConversationDetailID_Name, @Description = @MJReports_ConversationDetailID_Description, @CategoryID = @MJReports_ConversationDetailID_CategoryID, @UserID = @MJReports_ConversationDetailID_UserID, @SharingScope = @MJReports_ConversationDetailID_SharingScope, @ConversationID = @MJReports_ConversationDetailID_ConversationID, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJReports_ConversationDetailID_ConversationDetailID, @DataContextID = @MJReports_ConversationDetailID_DataContextID, @Configuration = @MJReports_ConversationDetailID_Configuration, @OutputTriggerTypeID = @MJReports_ConversationDetailID_OutputTriggerTypeID, @OutputFormatTypeID = @MJReports_ConversationDetailID_OutputFormatTypeID, @OutputDeliveryTypeID = @MJReports_ConversationDetailID_OutputDeliveryTypeID, @OutputFrequency = @MJReports_ConversationDetailID_OutputFrequency, @OutputTargetEmail = @MJReports_ConversationDetailID_OutputTargetEmail, @OutputWorkflowID = @MJReports_ConversationDetailID_OutputWorkflowID, @Thumbnail = @MJReports_ConversationDetailID_Thumbnail, @EnvironmentID = @MJReports_ConversationDetailID_EnvironmentID

        FETCH NEXT FROM cascade_update_MJReports_ConversationDetailID_cursor INTO @MJReports_ConversationDetailIDID, @MJReports_ConversationDetailID_Name, @MJReports_ConversationDetailID_Description, @MJReports_ConversationDetailID_CategoryID, @MJReports_ConversationDetailID_UserID, @MJReports_ConversationDetailID_SharingScope, @MJReports_ConversationDetailID_ConversationID, @MJReports_ConversationDetailID_ConversationDetailID, @MJReports_ConversationDetailID_DataContextID, @MJReports_ConversationDetailID_Configuration, @MJReports_ConversationDetailID_OutputTriggerTypeID, @MJReports_ConversationDetailID_OutputFormatTypeID, @MJReports_ConversationDetailID_OutputDeliveryTypeID, @MJReports_ConversationDetailID_OutputFrequency, @MJReports_ConversationDetailID_OutputTargetEmail, @MJReports_ConversationDetailID_OutputWorkflowID, @MJReports_ConversationDetailID_Thumbnail, @MJReports_ConversationDetailID_EnvironmentID
    END

    CLOSE cascade_update_MJReports_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJReports_ConversationDetailID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_ConversationDetailIDID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ParentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJTasks_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_TypeID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ProjectID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJTasks_ConversationDetailID_PercentComplete int
    DECLARE @MJTasks_ConversationDetailID_DueAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE cascade_update_MJTasks_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJTasks_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_ConversationDetailIDID, @ParentID = @MJTasks_ConversationDetailID_ParentID, @Name = @MJTasks_ConversationDetailID_Name, @Description = @MJTasks_ConversationDetailID_Description, @TypeID = @MJTasks_ConversationDetailID_TypeID, @EnvironmentID = @MJTasks_ConversationDetailID_EnvironmentID, @ProjectID = @MJTasks_ConversationDetailID_ProjectID, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJTasks_ConversationDetailID_ConversationDetailID, @UserID = @MJTasks_ConversationDetailID_UserID, @AgentID = @MJTasks_ConversationDetailID_AgentID, @Status = @MJTasks_ConversationDetailID_Status, @PercentComplete = @MJTasks_ConversationDetailID_PercentComplete, @DueAt = @MJTasks_ConversationDetailID_DueAt, @StartedAt = @MJTasks_ConversationDetailID_StartedAt, @CompletedAt = @MJTasks_ConversationDetailID_CompletedAt

        FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt
    END

    CLOSE cascade_update_MJTasks_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJTasks_ConversationDetailID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ArtifactVersionIDID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ArtifactVersionID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactVersionID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_HiddenToUser bit
    DECLARE @MJConversationDetails_ArtifactVersionID_UserRating int
    DECLARE @MJConversationDetails_ArtifactVersionID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_CompletionTime bigint
    DECLARE @MJConversationDetails_ArtifactVersionID_IsPinned bit
    DECLARE @MJConversationDetails_ArtifactVersionID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactVersionID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_ArtifactVersionID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJConversationDetails_ArtifactVersionID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactVersionID] = @ID

    OPEN cascade_update_MJConversationDetails_ArtifactVersionID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ArtifactVersionID_cursor INTO @MJConversationDetails_ArtifactVersionIDID, @MJConversationDetails_ArtifactVersionID_ConversationID, @MJConversationDetails_ArtifactVersionID_ExternalID, @MJConversationDetails_ArtifactVersionID_Role, @MJConversationDetails_ArtifactVersionID_Message, @MJConversationDetails_ArtifactVersionID_Error, @MJConversationDetails_ArtifactVersionID_HiddenToUser, @MJConversationDetails_ArtifactVersionID_UserRating, @MJConversationDetails_ArtifactVersionID_UserFeedback, @MJConversationDetails_ArtifactVersionID_ReflectionInsights, @MJConversationDetails_ArtifactVersionID_SummaryOfEarlierConversation, @MJConversationDetails_ArtifactVersionID_UserID, @MJConversationDetails_ArtifactVersionID_ArtifactID, @MJConversationDetails_ArtifactVersionID_ArtifactVersionID, @MJConversationDetails_ArtifactVersionID_CompletionTime, @MJConversationDetails_ArtifactVersionID_IsPinned, @MJConversationDetails_ArtifactVersionID_ParentID, @MJConversationDetails_ArtifactVersionID_AgentID, @MJConversationDetails_ArtifactVersionID_Status, @MJConversationDetails_ArtifactVersionID_SuggestedResponses, @MJConversationDetails_ArtifactVersionID_TestRunID, @MJConversationDetails_ArtifactVersionID_ResponseForm, @MJConversationDetails_ArtifactVersionID_ActionableCommands, @MJConversationDetails_ArtifactVersionID_AutomaticCommands, @MJConversationDetails_ArtifactVersionID_OriginalMessageChanged, @MJConversationDetails_ArtifactVersionID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ArtifactVersionID_ArtifactVersionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ArtifactVersionIDID, @ConversationID = @MJConversationDetails_ArtifactVersionID_ConversationID, @ExternalID = @MJConversationDetails_ArtifactVersionID_ExternalID, @Role = @MJConversationDetails_ArtifactVersionID_Role, @Message = @MJConversationDetails_ArtifactVersionID_Message, @Error = @MJConversationDetails_ArtifactVersionID_Error, @HiddenToUser = @MJConversationDetails_ArtifactVersionID_HiddenToUser, @UserRating = @MJConversationDetails_ArtifactVersionID_UserRating, @UserFeedback = @MJConversationDetails_ArtifactVersionID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ArtifactVersionID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ArtifactVersionID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ArtifactVersionID_UserID, @ArtifactID = @MJConversationDetails_ArtifactVersionID_ArtifactID, @ArtifactVersionID_Clear = 1, @ArtifactVersionID = @MJConversationDetails_ArtifactVersionID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ArtifactVersionID_CompletionTime, @IsPinned = @MJConversationDetails_ArtifactVersionID_IsPinned, @ParentID = @MJConversationDetails_ArtifactVersionID_ParentID, @AgentID = @MJConversationDetails_ArtifactVersionID_AgentID, @Status = @MJConversationDetails_ArtifactVersionID_Status, @SuggestedResponses = @MJConversationDetails_ArtifactVersionID_SuggestedResponses, @TestRunID = @MJConversationDetails_ArtifactVersionID_TestRunID, @ResponseForm = @MJConversationDetails_ArtifactVersionID_ResponseForm, @ActionableCommands = @MJConversationDetails_ArtifactVersionID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ArtifactVersionID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ArtifactVersionID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_ArtifactVersionID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJConversationDetails_ArtifactVersionID_cursor INTO @MJConversationDetails_ArtifactVersionIDID, @MJConversationDetails_ArtifactVersionID_ConversationID, @MJConversationDetails_ArtifactVersionID_ExternalID, @MJConversationDetails_ArtifactVersionID_Role, @MJConversationDetails_ArtifactVersionID_Message, @MJConversationDetails_ArtifactVersionID_Error, @MJConversationDetails_ArtifactVersionID_HiddenToUser, @MJConversationDetails_ArtifactVersionID_UserRating, @MJConversationDetails_ArtifactVersionID_UserFeedback, @MJConversationDetails_ArtifactVersionID_ReflectionInsights, @MJConversationDetails_ArtifactVersionID_SummaryOfEarlierConversation, @MJConversationDetails_ArtifactVersionID_UserID, @MJConversationDetails_ArtifactVersionID_ArtifactID, @MJConversationDetails_ArtifactVersionID_ArtifactVersionID, @MJConversationDetails_ArtifactVersionID_CompletionTime, @MJConversationDetails_ArtifactVersionID_IsPinned, @MJConversationDetails_ArtifactVersionID_ParentID, @MJConversationDetails_ArtifactVersionID_AgentID, @MJConversationDetails_ArtifactVersionID_Status, @MJConversationDetails_ArtifactVersionID_SuggestedResponses, @MJConversationDetails_ArtifactVersionID_TestRunID, @MJConversationDetails_ArtifactVersionID_ResponseForm, @MJConversationDetails_ArtifactVersionID_ActionableCommands, @MJConversationDetails_ArtifactVersionID_AutomaticCommands, @MJConversationDetails_ArtifactVersionID_OriginalMessageChanged, @MJConversationDetails_ArtifactVersionID_AgentSessionID
    END

    CLOSE cascade_update_MJConversationDetails_ArtifactVersionID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ArtifactVersionID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ConversationArtifactPermission using cursor to call spDeleteConversationArtifactPermission
    DECLARE @MJConversationArtifactPermissions_ConversationArtifactIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactPermission]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor INTO @MJConversationArtifactPermissions_ConversationArtifactIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] @ID = @MJConversationArtifactPermissions_ConversationArtifactIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor INTO @MJConversationArtifactPermissions_ConversationArtifactIDID
    END
    
    CLOSE cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor
    DEALLOCATE cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor
    
    -- Cascade delete from ConversationArtifactVersion using cursor to call spDeleteConversationArtifactVersion
    DECLARE @MJConversationArtifactVersions_ConversationArtifactIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactVersion]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor INTO @MJConversationArtifactVersions_ConversationArtifactIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] @ID = @MJConversationArtifactVersions_ConversationArtifactIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor INTO @MJConversationArtifactVersions_ConversationArtifactIDID
    END
    
    CLOSE cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor
    DEALLOCATE cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ArtifactIDID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ArtifactID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_HiddenToUser bit
    DECLARE @MJConversationDetails_ArtifactID_UserRating int
    DECLARE @MJConversationDetails_ArtifactID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_CompletionTime bigint
    DECLARE @MJConversationDetails_ArtifactID_IsPinned bit
    DECLARE @MJConversationDetails_ArtifactID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_ArtifactID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJConversationDetails_ArtifactID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactID] = @ID

    OPEN cascade_update_MJConversationDetails_ArtifactID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ArtifactID_cursor INTO @MJConversationDetails_ArtifactIDID, @MJConversationDetails_ArtifactID_ConversationID, @MJConversationDetails_ArtifactID_ExternalID, @MJConversationDetails_ArtifactID_Role, @MJConversationDetails_ArtifactID_Message, @MJConversationDetails_ArtifactID_Error, @MJConversationDetails_ArtifactID_HiddenToUser, @MJConversationDetails_ArtifactID_UserRating, @MJConversationDetails_ArtifactID_UserFeedback, @MJConversationDetails_ArtifactID_ReflectionInsights, @MJConversationDetails_ArtifactID_SummaryOfEarlierConversation, @MJConversationDetails_ArtifactID_UserID, @MJConversationDetails_ArtifactID_ArtifactID, @MJConversationDetails_ArtifactID_ArtifactVersionID, @MJConversationDetails_ArtifactID_CompletionTime, @MJConversationDetails_ArtifactID_IsPinned, @MJConversationDetails_ArtifactID_ParentID, @MJConversationDetails_ArtifactID_AgentID, @MJConversationDetails_ArtifactID_Status, @MJConversationDetails_ArtifactID_SuggestedResponses, @MJConversationDetails_ArtifactID_TestRunID, @MJConversationDetails_ArtifactID_ResponseForm, @MJConversationDetails_ArtifactID_ActionableCommands, @MJConversationDetails_ArtifactID_AutomaticCommands, @MJConversationDetails_ArtifactID_OriginalMessageChanged, @MJConversationDetails_ArtifactID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ArtifactID_ArtifactID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ArtifactIDID, @ConversationID = @MJConversationDetails_ArtifactID_ConversationID, @ExternalID = @MJConversationDetails_ArtifactID_ExternalID, @Role = @MJConversationDetails_ArtifactID_Role, @Message = @MJConversationDetails_ArtifactID_Message, @Error = @MJConversationDetails_ArtifactID_Error, @HiddenToUser = @MJConversationDetails_ArtifactID_HiddenToUser, @UserRating = @MJConversationDetails_ArtifactID_UserRating, @UserFeedback = @MJConversationDetails_ArtifactID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ArtifactID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ArtifactID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ArtifactID_UserID, @ArtifactID_Clear = 1, @ArtifactID = @MJConversationDetails_ArtifactID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_ArtifactID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ArtifactID_CompletionTime, @IsPinned = @MJConversationDetails_ArtifactID_IsPinned, @ParentID = @MJConversationDetails_ArtifactID_ParentID, @AgentID = @MJConversationDetails_ArtifactID_AgentID, @Status = @MJConversationDetails_ArtifactID_Status, @SuggestedResponses = @MJConversationDetails_ArtifactID_SuggestedResponses, @TestRunID = @MJConversationDetails_ArtifactID_TestRunID, @ResponseForm = @MJConversationDetails_ArtifactID_ResponseForm, @ActionableCommands = @MJConversationDetails_ArtifactID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ArtifactID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ArtifactID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_ArtifactID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJConversationDetails_ArtifactID_cursor INTO @MJConversationDetails_ArtifactIDID, @MJConversationDetails_ArtifactID_ConversationID, @MJConversationDetails_ArtifactID_ExternalID, @MJConversationDetails_ArtifactID_Role, @MJConversationDetails_ArtifactID_Message, @MJConversationDetails_ArtifactID_Error, @MJConversationDetails_ArtifactID_HiddenToUser, @MJConversationDetails_ArtifactID_UserRating, @MJConversationDetails_ArtifactID_UserFeedback, @MJConversationDetails_ArtifactID_ReflectionInsights, @MJConversationDetails_ArtifactID_SummaryOfEarlierConversation, @MJConversationDetails_ArtifactID_UserID, @MJConversationDetails_ArtifactID_ArtifactID, @MJConversationDetails_ArtifactID_ArtifactVersionID, @MJConversationDetails_ArtifactID_CompletionTime, @MJConversationDetails_ArtifactID_IsPinned, @MJConversationDetails_ArtifactID_ParentID, @MJConversationDetails_ArtifactID_AgentID, @MJConversationDetails_ArtifactID_Status, @MJConversationDetails_ArtifactID_SuggestedResponses, @MJConversationDetails_ArtifactID_TestRunID, @MJConversationDetails_ArtifactID_ResponseForm, @MJConversationDetails_ArtifactID_ActionableCommands, @MJConversationDetails_ArtifactID_AutomaticCommands, @MJConversationDetails_ArtifactID_OriginalMessageChanged, @MJConversationDetails_ArtifactID_AgentSessionID
    END

    CLOSE cascade_update_MJConversationDetails_ArtifactID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ArtifactID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Developer], [cdp_Integration];

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
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationID_SourceConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationIDID, @AgentID = @MJAIAgentNotes_SourceConversationID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationID_Note, @UserID = @MJAIAgentNotes_SourceConversationID_UserID, @Type = @MJAIAgentNotes_SourceConversationID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationID_Comments, @Status = @MJAIAgentNotes_SourceConversationID_Status, @SourceConversationID_Clear = 1, @SourceConversationID = @MJAIAgentNotes_SourceConversationID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore
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
    DECLARE cascade_update_MJAIAgentSessions_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [Status], [ConversationID], [LastSessionID], [HostInstanceID], [Config], [LastActiveAt], [ClosedAt], [CloseReason]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentSessions_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSessions_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentSession] @ID = @MJAIAgentSessions_ConversationIDID, @AgentID = @MJAIAgentSessions_ConversationID_AgentID, @UserID = @MJAIAgentSessions_ConversationID_UserID, @Status = @MJAIAgentSessions_ConversationID_Status, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentSessions_ConversationID_ConversationID, @LastSessionID = @MJAIAgentSessions_ConversationID_LastSessionID, @HostInstanceID = @MJAIAgentSessions_ConversationID_HostInstanceID, @Config = @MJAIAgentSessions_ConversationID_Config, @LastActiveAt = @MJAIAgentSessions_ConversationID_LastActiveAt, @ClosedAt = @MJAIAgentSessions_ConversationID_ClosedAt, @CloseReason = @MJAIAgentSessions_ConversationID_CloseReason

        FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason
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

/* SQL text to update entity field related entity name field map for entity field ID 5389E13A-6D4F-4EEF-80A1-51B828EBD9C3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5389E13A-6D4F-4EEF-80A1-51B828EBD9C3', @RelatedEntityNameFieldMap='DefaultCoAgent';

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
    @DefaultCoAgentID uniqueidentifier = NULL
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
                [DefaultCoAgentID]
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
                CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, NULL) END
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
                [DefaultCoAgentID]
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
                CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, NULL) END
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
    @DefaultCoAgentID uniqueidentifier = NULL
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
        [DefaultCoAgentID] = CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, [DefaultCoAgentID]) END
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
    DECLARE cascade_update_MJAIAgentNotes_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentNotes_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentNotes_AgentID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_AgentID_AgentNoteTypeID, @Note = @MJAIAgentNotes_AgentID_Note, @UserID = @MJAIAgentNotes_AgentID_UserID, @Type = @MJAIAgentNotes_AgentID_Type, @IsAutoGenerated = @MJAIAgentNotes_AgentID_IsAutoGenerated, @Comments = @MJAIAgentNotes_AgentID_Comments, @Status = @MJAIAgentNotes_AgentID_Status, @SourceConversationID = @MJAIAgentNotes_AgentID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_AgentID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_AgentID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_AgentID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_AgentID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_AgentID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_AgentID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_AgentID_AccessCount, @ExpiresAt = @MJAIAgentNotes_AgentID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_AgentID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_AgentID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_AgentID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore
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
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_DefaultCoAgentIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_IsActive bit
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_DefaultCoAgentID_DefaultCoAgentID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [DefaultCoAgentID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgentTypes_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_DefaultCoAgentID_cursor INTO @MJAIAgentTypes_DefaultCoAgentIDID, @MJAIAgentTypes_DefaultCoAgentID_Name, @MJAIAgentTypes_DefaultCoAgentID_Description, @MJAIAgentTypes_DefaultCoAgentID_SystemPromptID, @MJAIAgentTypes_DefaultCoAgentID_IsActive, @MJAIAgentTypes_DefaultCoAgentID_AgentPromptPlaceholder, @MJAIAgentTypes_DefaultCoAgentID_DriverClass, @MJAIAgentTypes_DefaultCoAgentID_UIFormSectionKey, @MJAIAgentTypes_DefaultCoAgentID_UIFormKey, @MJAIAgentTypes_DefaultCoAgentID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_DefaultCoAgentID_PromptParamsSchema, @MJAIAgentTypes_DefaultCoAgentID_AssignmentStrategy, @MJAIAgentTypes_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgentTypes_DefaultCoAgentID_DefaultCoAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_DefaultCoAgentIDID, @Name = @MJAIAgentTypes_DefaultCoAgentID_Name, @Description = @MJAIAgentTypes_DefaultCoAgentID_Description, @SystemPromptID = @MJAIAgentTypes_DefaultCoAgentID_SystemPromptID, @IsActive = @MJAIAgentTypes_DefaultCoAgentID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_DefaultCoAgentID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_DefaultCoAgentID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_DefaultCoAgentID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_DefaultCoAgentID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_DefaultCoAgentID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_DefaultCoAgentID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_DefaultCoAgentID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_DefaultCoAgentID_DefaultStorageAccountID, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgentTypes_DefaultCoAgentID_DefaultCoAgentID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_DefaultCoAgentID_cursor INTO @MJAIAgentTypes_DefaultCoAgentIDID, @MJAIAgentTypes_DefaultCoAgentID_Name, @MJAIAgentTypes_DefaultCoAgentID_Description, @MJAIAgentTypes_DefaultCoAgentID_SystemPromptID, @MJAIAgentTypes_DefaultCoAgentID_IsActive, @MJAIAgentTypes_DefaultCoAgentID_AgentPromptPlaceholder, @MJAIAgentTypes_DefaultCoAgentID_DriverClass, @MJAIAgentTypes_DefaultCoAgentID_UIFormSectionKey, @MJAIAgentTypes_DefaultCoAgentID_UIFormKey, @MJAIAgentTypes_DefaultCoAgentID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_DefaultCoAgentID_PromptParamsSchema, @MJAIAgentTypes_DefaultCoAgentID_AssignmentStrategy, @MJAIAgentTypes_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgentTypes_DefaultCoAgentID_DefaultCoAgentID
    END

    CLOSE cascade_update_MJAIAgentTypes_DefaultCoAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_DefaultCoAgentID_cursor
    
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
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID
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
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID
    END

    CLOSE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    
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
    DECLARE cascade_update_MJConversationDetails_AgentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJConversationDetails_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_AgentIDID, @ConversationID = @MJConversationDetails_AgentID_ConversationID, @ExternalID = @MJConversationDetails_AgentID_ExternalID, @Role = @MJConversationDetails_AgentID_Role, @Message = @MJConversationDetails_AgentID_Message, @Error = @MJConversationDetails_AgentID_Error, @HiddenToUser = @MJConversationDetails_AgentID_HiddenToUser, @UserRating = @MJConversationDetails_AgentID_UserRating, @UserFeedback = @MJConversationDetails_AgentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_AgentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_AgentID_UserID, @ArtifactID = @MJConversationDetails_AgentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_AgentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_AgentID_CompletionTime, @IsPinned = @MJConversationDetails_AgentID_IsPinned, @ParentID = @MJConversationDetails_AgentID_ParentID, @AgentID_Clear = 1, @AgentID = @MJConversationDetails_AgentID_AgentID, @Status = @MJConversationDetails_AgentID_Status, @SuggestedResponses = @MJConversationDetails_AgentID_SuggestedResponses, @TestRunID = @MJConversationDetails_AgentID_TestRunID, @ResponseForm = @MJConversationDetails_AgentID_ResponseForm, @ActionableCommands = @MJConversationDetails_AgentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_AgentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_AgentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_AgentID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID
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
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @Type = @MJConversations_DefaultAgentID_Type, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData
    END

    CLOSE cascade_update_MJConversations_DefaultAgentID_cursor
    DEALLOCATE cascade_update_MJConversations_DefaultAgentID_cursor
    
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

/* spDelete SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentConfiguration using cursor to call spUpdateAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AIConfigurationIDID uniqueidentifier
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Name nvarchar(100)
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_DisplayName nvarchar(200)
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Description nvarchar(MAX)
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID uniqueidentifier
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_IsDefault bit
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Priority int
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Status nvarchar(20)
    DECLARE cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [DisplayName], [Description], [AIConfigurationID], [IsDefault], [Priority], [Status]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AIConfigurationID] = @ID

    OPEN cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor INTO @MJAIAgentConfigurations_AIConfigurationIDID, @MJAIAgentConfigurations_AIConfigurationID_AgentID, @MJAIAgentConfigurations_AIConfigurationID_Name, @MJAIAgentConfigurations_AIConfigurationID_DisplayName, @MJAIAgentConfigurations_AIConfigurationID_Description, @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, @MJAIAgentConfigurations_AIConfigurationID_IsDefault, @MJAIAgentConfigurations_AIConfigurationID_Priority, @MJAIAgentConfigurations_AIConfigurationID_Status

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AIConfigurationIDID, @AgentID = @MJAIAgentConfigurations_AIConfigurationID_AgentID, @Name = @MJAIAgentConfigurations_AIConfigurationID_Name, @DisplayName = @MJAIAgentConfigurations_AIConfigurationID_DisplayName, @Description = @MJAIAgentConfigurations_AIConfigurationID_Description, @AIConfigurationID_Clear = 1, @AIConfigurationID = @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, @IsDefault = @MJAIAgentConfigurations_AIConfigurationID_IsDefault, @Priority = @MJAIAgentConfigurations_AIConfigurationID_Priority, @Status = @MJAIAgentConfigurations_AIConfigurationID_Status

        FETCH NEXT FROM cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor INTO @MJAIAgentConfigurations_AIConfigurationIDID, @MJAIAgentConfigurations_AIConfigurationID_AgentID, @MJAIAgentConfigurations_AIConfigurationID_Name, @MJAIAgentConfigurations_AIConfigurationID_DisplayName, @MJAIAgentConfigurations_AIConfigurationID_Description, @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, @MJAIAgentConfigurations_AIConfigurationID_IsDefault, @MJAIAgentConfigurations_AIConfigurationID_Priority, @MJAIAgentConfigurations_AIConfigurationID_Status
    END

    CLOSE cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_ConfigurationIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [ConfigurationID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor INTO @MJAIAgentPrompts_ConfigurationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_ConfigurationIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor INTO @MJAIAgentPrompts_ConfigurationIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConfigurationIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConfigurationID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConfigurationID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConfigurationID_Success bit
    DECLARE @MJAIAgentRuns_ConfigurationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConfigurationID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConfigurationID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConfigurationID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConfigurationID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConfigurationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_Verbose bit
    DECLARE @MJAIAgentRuns_ConfigurationID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConfigurationID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConfigurationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConfigurationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConfigurationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConfigurationID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRuns_ConfigurationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConfigurationID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConfigurationID_cursor INTO @MJAIAgentRuns_ConfigurationIDID, @MJAIAgentRuns_ConfigurationID_AgentID, @MJAIAgentRuns_ConfigurationID_ParentRunID, @MJAIAgentRuns_ConfigurationID_Status, @MJAIAgentRuns_ConfigurationID_StartedAt, @MJAIAgentRuns_ConfigurationID_CompletedAt, @MJAIAgentRuns_ConfigurationID_Success, @MJAIAgentRuns_ConfigurationID_ErrorMessage, @MJAIAgentRuns_ConfigurationID_ConversationID, @MJAIAgentRuns_ConfigurationID_UserID, @MJAIAgentRuns_ConfigurationID_Result, @MJAIAgentRuns_ConfigurationID_AgentState, @MJAIAgentRuns_ConfigurationID_TotalTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCost, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCostRollup, @MJAIAgentRuns_ConfigurationID_ConversationDetailID, @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, @MJAIAgentRuns_ConfigurationID_CancellationReason, @MJAIAgentRuns_ConfigurationID_FinalStep, @MJAIAgentRuns_ConfigurationID_FinalPayload, @MJAIAgentRuns_ConfigurationID_Message, @MJAIAgentRuns_ConfigurationID_LastRunID, @MJAIAgentRuns_ConfigurationID_StartingPayload, @MJAIAgentRuns_ConfigurationID_TotalPromptIterations, @MJAIAgentRuns_ConfigurationID_ConfigurationID, @MJAIAgentRuns_ConfigurationID_OverrideModelID, @MJAIAgentRuns_ConfigurationID_OverrideVendorID, @MJAIAgentRuns_ConfigurationID_Data, @MJAIAgentRuns_ConfigurationID_Verbose, @MJAIAgentRuns_ConfigurationID_EffortLevel, @MJAIAgentRuns_ConfigurationID_RunName, @MJAIAgentRuns_ConfigurationID_Comments, @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, @MJAIAgentRuns_ConfigurationID_TestRunID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConfigurationID_SecondaryScopes, @MJAIAgentRuns_ConfigurationID_ExternalReferenceID, @MJAIAgentRuns_ConfigurationID_CompanyID, @MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConfigurationID_LastHeartbeatAt, @MJAIAgentRuns_ConfigurationID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConfigurationID_ConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConfigurationIDID, @AgentID = @MJAIAgentRuns_ConfigurationID_AgentID, @ParentRunID = @MJAIAgentRuns_ConfigurationID_ParentRunID, @Status = @MJAIAgentRuns_ConfigurationID_Status, @StartedAt = @MJAIAgentRuns_ConfigurationID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConfigurationID_CompletedAt, @Success = @MJAIAgentRuns_ConfigurationID_Success, @ErrorMessage = @MJAIAgentRuns_ConfigurationID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ConfigurationID_ConversationID, @UserID = @MJAIAgentRuns_ConfigurationID_UserID, @Result = @MJAIAgentRuns_ConfigurationID_Result, @AgentState = @MJAIAgentRuns_ConfigurationID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConfigurationID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConfigurationID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConfigurationID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConfigurationID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConfigurationID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConfigurationID_FinalPayload, @Message = @MJAIAgentRuns_ConfigurationID_Message, @LastRunID = @MJAIAgentRuns_ConfigurationID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConfigurationID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConfigurationID_TotalPromptIterations, @ConfigurationID_Clear = 1, @ConfigurationID = @MJAIAgentRuns_ConfigurationID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConfigurationID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConfigurationID_OverrideVendorID, @Data = @MJAIAgentRuns_ConfigurationID_Data, @Verbose = @MJAIAgentRuns_ConfigurationID_Verbose, @EffortLevel = @MJAIAgentRuns_ConfigurationID_EffortLevel, @RunName = @MJAIAgentRuns_ConfigurationID_RunName, @Comments = @MJAIAgentRuns_ConfigurationID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConfigurationID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConfigurationID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConfigurationID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConfigurationID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConfigurationID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConfigurationID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConfigurationID_cursor INTO @MJAIAgentRuns_ConfigurationIDID, @MJAIAgentRuns_ConfigurationID_AgentID, @MJAIAgentRuns_ConfigurationID_ParentRunID, @MJAIAgentRuns_ConfigurationID_Status, @MJAIAgentRuns_ConfigurationID_StartedAt, @MJAIAgentRuns_ConfigurationID_CompletedAt, @MJAIAgentRuns_ConfigurationID_Success, @MJAIAgentRuns_ConfigurationID_ErrorMessage, @MJAIAgentRuns_ConfigurationID_ConversationID, @MJAIAgentRuns_ConfigurationID_UserID, @MJAIAgentRuns_ConfigurationID_Result, @MJAIAgentRuns_ConfigurationID_AgentState, @MJAIAgentRuns_ConfigurationID_TotalTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCost, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCostRollup, @MJAIAgentRuns_ConfigurationID_ConversationDetailID, @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, @MJAIAgentRuns_ConfigurationID_CancellationReason, @MJAIAgentRuns_ConfigurationID_FinalStep, @MJAIAgentRuns_ConfigurationID_FinalPayload, @MJAIAgentRuns_ConfigurationID_Message, @MJAIAgentRuns_ConfigurationID_LastRunID, @MJAIAgentRuns_ConfigurationID_StartingPayload, @MJAIAgentRuns_ConfigurationID_TotalPromptIterations, @MJAIAgentRuns_ConfigurationID_ConfigurationID, @MJAIAgentRuns_ConfigurationID_OverrideModelID, @MJAIAgentRuns_ConfigurationID_OverrideVendorID, @MJAIAgentRuns_ConfigurationID_Data, @MJAIAgentRuns_ConfigurationID_Verbose, @MJAIAgentRuns_ConfigurationID_EffortLevel, @MJAIAgentRuns_ConfigurationID_RunName, @MJAIAgentRuns_ConfigurationID_Comments, @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, @MJAIAgentRuns_ConfigurationID_TestRunID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConfigurationID_SecondaryScopes, @MJAIAgentRuns_ConfigurationID_ExternalReferenceID, @MJAIAgentRuns_ConfigurationID_CompanyID, @MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConfigurationID_LastHeartbeatAt, @MJAIAgentRuns_ConfigurationID_AgentSessionID
    END

    CLOSE cascade_update_MJAIAgentRuns_ConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConfigurationID_cursor
    
    -- Cascade delete from AIConfigurationParam using cursor to call spDeleteAIConfigurationParam
    DECLARE @MJAIConfigurationParams_ConfigurationIDID uniqueidentifier
    DECLARE cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIConfigurationParam]
        WHERE [ConfigurationID] = @ID
    
    OPEN cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor
    FETCH NEXT FROM cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor INTO @MJAIConfigurationParams_ConfigurationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIConfigurationParam] @ID = @MJAIConfigurationParams_ConfigurationIDID
        
        FETCH NEXT FROM cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor INTO @MJAIConfigurationParams_ConfigurationIDID
    END
    
    CLOSE cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor
    DEALLOCATE cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_ParentIDID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_ParentID_IsDefault bit
    DECLARE @MJAIConfigurations_ParentID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_ParentID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIConfigurations_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_ParentID_cursor INTO @MJAIConfigurations_ParentIDID, @MJAIConfigurations_ParentID_Name, @MJAIConfigurations_ParentID_Description, @MJAIConfigurations_ParentID_IsDefault, @MJAIConfigurations_ParentID_Status, @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID, @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_ParentID_DefaultStorageProviderID, @MJAIConfigurations_ParentID_DefaultStorageRootPath, @MJAIConfigurations_ParentID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_ParentIDID, @Name = @MJAIConfigurations_ParentID_Name, @Description = @MJAIConfigurations_ParentID_Description, @IsDefault = @MJAIConfigurations_ParentID_IsDefault, @Status = @MJAIConfigurations_ParentID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_ParentID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_ParentID_DefaultStorageRootPath, @ParentID_Clear = 1, @ParentID = @MJAIConfigurations_ParentID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_ParentID_cursor INTO @MJAIConfigurations_ParentIDID, @MJAIConfigurations_ParentID_Name, @MJAIConfigurations_ParentID_Description, @MJAIConfigurations_ParentID_IsDefault, @MJAIConfigurations_ParentID_Status, @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID, @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_ParentID_DefaultStorageProviderID, @MJAIConfigurations_ParentID_DefaultStorageRootPath, @MJAIConfigurations_ParentID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_ParentID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_ParentID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_ConfigurationIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_ConfigurationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [ConfigurationID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_ConfigurationID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_ConfigurationID_cursor INTO @MJAIPromptModels_ConfigurationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_ConfigurationIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_ConfigurationID_cursor INTO @MJAIPromptModels_ConfigurationIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_ConfigurationID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_ConfigurationID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ConfigurationIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ConfigurationID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensUsed int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ConfigurationID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ConfigurationID_Success bit
    DECLARE @MJAIPromptRuns_ConfigurationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ConfigurationID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ConfigurationID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ConfigurationID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_TopK int
    DECLARE @MJAIPromptRuns_ConfigurationID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_Seed int
    DECLARE @MJAIPromptRuns_ConfigurationID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_LogProbs bit
    DECLARE @MJAIPromptRuns_ConfigurationID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ConfigurationID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ConfigurationID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ConfigurationID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ConfigurationID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ConfigurationID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ConfigurationID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_Cancelled bit
    DECLARE @MJAIPromptRuns_ConfigurationID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ConfigurationID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_CacheHit bit
    DECLARE @MJAIPromptRuns_ConfigurationID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ConfigurationID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ConfigurationID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ConfigurationID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ConfigurationID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_QueueTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_PromptTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_CompletionTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_EffortLevel int
    DECLARE @MJAIPromptRuns_ConfigurationID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ConfigurationID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_ConfigurationID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ConfigurationID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ConfigurationID_cursor INTO @MJAIPromptRuns_ConfigurationIDID, @MJAIPromptRuns_ConfigurationID_PromptID, @MJAIPromptRuns_ConfigurationID_ModelID, @MJAIPromptRuns_ConfigurationID_VendorID, @MJAIPromptRuns_ConfigurationID_AgentID, @MJAIPromptRuns_ConfigurationID_ConfigurationID, @MJAIPromptRuns_ConfigurationID_RunAt, @MJAIPromptRuns_ConfigurationID_CompletedAt, @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, @MJAIPromptRuns_ConfigurationID_Messages, @MJAIPromptRuns_ConfigurationID_Result, @MJAIPromptRuns_ConfigurationID_TokensUsed, @MJAIPromptRuns_ConfigurationID_TokensPrompt, @MJAIPromptRuns_ConfigurationID_TokensCompletion, @MJAIPromptRuns_ConfigurationID_TotalCost, @MJAIPromptRuns_ConfigurationID_Success, @MJAIPromptRuns_ConfigurationID_ErrorMessage, @MJAIPromptRuns_ConfigurationID_ParentID, @MJAIPromptRuns_ConfigurationID_RunType, @MJAIPromptRuns_ConfigurationID_ExecutionOrder, @MJAIPromptRuns_ConfigurationID_AgentRunID, @MJAIPromptRuns_ConfigurationID_Cost, @MJAIPromptRuns_ConfigurationID_CostCurrency, @MJAIPromptRuns_ConfigurationID_TokensUsedRollup, @MJAIPromptRuns_ConfigurationID_TokensPromptRollup, @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, @MJAIPromptRuns_ConfigurationID_Temperature, @MJAIPromptRuns_ConfigurationID_TopP, @MJAIPromptRuns_ConfigurationID_TopK, @MJAIPromptRuns_ConfigurationID_MinP, @MJAIPromptRuns_ConfigurationID_FrequencyPenalty, @MJAIPromptRuns_ConfigurationID_PresencePenalty, @MJAIPromptRuns_ConfigurationID_Seed, @MJAIPromptRuns_ConfigurationID_StopSequences, @MJAIPromptRuns_ConfigurationID_ResponseFormat, @MJAIPromptRuns_ConfigurationID_LogProbs, @MJAIPromptRuns_ConfigurationID_TopLogProbs, @MJAIPromptRuns_ConfigurationID_DescendantCost, @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, @MJAIPromptRuns_ConfigurationID_FinalValidationPassed, @MJAIPromptRuns_ConfigurationID_ValidationBehavior, @MJAIPromptRuns_ConfigurationID_RetryStrategy, @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, @MJAIPromptRuns_ConfigurationID_FinalValidationError, @MJAIPromptRuns_ConfigurationID_ValidationErrorCount, @MJAIPromptRuns_ConfigurationID_CommonValidationError, @MJAIPromptRuns_ConfigurationID_FirstAttemptAt, @MJAIPromptRuns_ConfigurationID_LastAttemptAt, @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, @MJAIPromptRuns_ConfigurationID_ValidationAttempts, @MJAIPromptRuns_ConfigurationID_ValidationSummary, @MJAIPromptRuns_ConfigurationID_FailoverAttempts, @MJAIPromptRuns_ConfigurationID_FailoverErrors, @MJAIPromptRuns_ConfigurationID_FailoverDurations, @MJAIPromptRuns_ConfigurationID_OriginalModelID, @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, @MJAIPromptRuns_ConfigurationID_ModelSelection, @MJAIPromptRuns_ConfigurationID_Status, @MJAIPromptRuns_ConfigurationID_Cancelled, @MJAIPromptRuns_ConfigurationID_CancellationReason, @MJAIPromptRuns_ConfigurationID_ModelPowerRank, @MJAIPromptRuns_ConfigurationID_SelectionStrategy, @MJAIPromptRuns_ConfigurationID_CacheHit, @MJAIPromptRuns_ConfigurationID_CacheKey, @MJAIPromptRuns_ConfigurationID_JudgeID, @MJAIPromptRuns_ConfigurationID_JudgeScore, @MJAIPromptRuns_ConfigurationID_WasSelectedResult, @MJAIPromptRuns_ConfigurationID_StreamingEnabled, @MJAIPromptRuns_ConfigurationID_FirstTokenTime, @MJAIPromptRuns_ConfigurationID_ErrorDetails, @MJAIPromptRuns_ConfigurationID_ChildPromptID, @MJAIPromptRuns_ConfigurationID_QueueTime, @MJAIPromptRuns_ConfigurationID_PromptTime, @MJAIPromptRuns_ConfigurationID_CompletionTime, @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, @MJAIPromptRuns_ConfigurationID_EffortLevel, @MJAIPromptRuns_ConfigurationID_RunName, @MJAIPromptRuns_ConfigurationID_Comments, @MJAIPromptRuns_ConfigurationID_TestRunID, @MJAIPromptRuns_ConfigurationID_AssistantPrefill, @MJAIPromptRuns_ConfigurationID_TokensCacheRead, @MJAIPromptRuns_ConfigurationID_TokensCacheWrite, @MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup, @MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ConfigurationID_ConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ConfigurationIDID, @PromptID = @MJAIPromptRuns_ConfigurationID_PromptID, @ModelID = @MJAIPromptRuns_ConfigurationID_ModelID, @VendorID = @MJAIPromptRuns_ConfigurationID_VendorID, @AgentID = @MJAIPromptRuns_ConfigurationID_AgentID, @ConfigurationID_Clear = 1, @ConfigurationID = @MJAIPromptRuns_ConfigurationID_ConfigurationID, @RunAt = @MJAIPromptRuns_ConfigurationID_RunAt, @CompletedAt = @MJAIPromptRuns_ConfigurationID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ConfigurationID_Messages, @Result = @MJAIPromptRuns_ConfigurationID_Result, @TokensUsed = @MJAIPromptRuns_ConfigurationID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ConfigurationID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ConfigurationID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ConfigurationID_TotalCost, @Success = @MJAIPromptRuns_ConfigurationID_Success, @ErrorMessage = @MJAIPromptRuns_ConfigurationID_ErrorMessage, @ParentID = @MJAIPromptRuns_ConfigurationID_ParentID, @RunType = @MJAIPromptRuns_ConfigurationID_RunType, @ExecutionOrder = @MJAIPromptRuns_ConfigurationID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ConfigurationID_AgentRunID, @Cost = @MJAIPromptRuns_ConfigurationID_Cost, @CostCurrency = @MJAIPromptRuns_ConfigurationID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ConfigurationID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ConfigurationID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ConfigurationID_Temperature, @TopP = @MJAIPromptRuns_ConfigurationID_TopP, @TopK = @MJAIPromptRuns_ConfigurationID_TopK, @MinP = @MJAIPromptRuns_ConfigurationID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ConfigurationID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ConfigurationID_PresencePenalty, @Seed = @MJAIPromptRuns_ConfigurationID_Seed, @StopSequences = @MJAIPromptRuns_ConfigurationID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ConfigurationID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ConfigurationID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ConfigurationID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ConfigurationID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ConfigurationID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ConfigurationID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ConfigurationID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ConfigurationID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ConfigurationID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ConfigurationID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ConfigurationID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ConfigurationID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ConfigurationID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ConfigurationID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ConfigurationID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ConfigurationID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ConfigurationID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ConfigurationID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ConfigurationID_ModelSelection, @Status = @MJAIPromptRuns_ConfigurationID_Status, @Cancelled = @MJAIPromptRuns_ConfigurationID_Cancelled, @CancellationReason = @MJAIPromptRuns_ConfigurationID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ConfigurationID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ConfigurationID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ConfigurationID_CacheHit, @CacheKey = @MJAIPromptRuns_ConfigurationID_CacheKey, @JudgeID = @MJAIPromptRuns_ConfigurationID_JudgeID, @JudgeScore = @MJAIPromptRuns_ConfigurationID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ConfigurationID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ConfigurationID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ConfigurationID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ConfigurationID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ConfigurationID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ConfigurationID_QueueTime, @PromptTime = @MJAIPromptRuns_ConfigurationID_PromptTime, @CompletionTime = @MJAIPromptRuns_ConfigurationID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ConfigurationID_EffortLevel, @RunName = @MJAIPromptRuns_ConfigurationID_RunName, @Comments = @MJAIPromptRuns_ConfigurationID_Comments, @TestRunID = @MJAIPromptRuns_ConfigurationID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ConfigurationID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ConfigurationID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ConfigurationID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ConfigurationID_cursor INTO @MJAIPromptRuns_ConfigurationIDID, @MJAIPromptRuns_ConfigurationID_PromptID, @MJAIPromptRuns_ConfigurationID_ModelID, @MJAIPromptRuns_ConfigurationID_VendorID, @MJAIPromptRuns_ConfigurationID_AgentID, @MJAIPromptRuns_ConfigurationID_ConfigurationID, @MJAIPromptRuns_ConfigurationID_RunAt, @MJAIPromptRuns_ConfigurationID_CompletedAt, @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, @MJAIPromptRuns_ConfigurationID_Messages, @MJAIPromptRuns_ConfigurationID_Result, @MJAIPromptRuns_ConfigurationID_TokensUsed, @MJAIPromptRuns_ConfigurationID_TokensPrompt, @MJAIPromptRuns_ConfigurationID_TokensCompletion, @MJAIPromptRuns_ConfigurationID_TotalCost, @MJAIPromptRuns_ConfigurationID_Success, @MJAIPromptRuns_ConfigurationID_ErrorMessage, @MJAIPromptRuns_ConfigurationID_ParentID, @MJAIPromptRuns_ConfigurationID_RunType, @MJAIPromptRuns_ConfigurationID_ExecutionOrder, @MJAIPromptRuns_ConfigurationID_AgentRunID, @MJAIPromptRuns_ConfigurationID_Cost, @MJAIPromptRuns_ConfigurationID_CostCurrency, @MJAIPromptRuns_ConfigurationID_TokensUsedRollup, @MJAIPromptRuns_ConfigurationID_TokensPromptRollup, @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, @MJAIPromptRuns_ConfigurationID_Temperature, @MJAIPromptRuns_ConfigurationID_TopP, @MJAIPromptRuns_ConfigurationID_TopK, @MJAIPromptRuns_ConfigurationID_MinP, @MJAIPromptRuns_ConfigurationID_FrequencyPenalty, @MJAIPromptRuns_ConfigurationID_PresencePenalty, @MJAIPromptRuns_ConfigurationID_Seed, @MJAIPromptRuns_ConfigurationID_StopSequences, @MJAIPromptRuns_ConfigurationID_ResponseFormat, @MJAIPromptRuns_ConfigurationID_LogProbs, @MJAIPromptRuns_ConfigurationID_TopLogProbs, @MJAIPromptRuns_ConfigurationID_DescendantCost, @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, @MJAIPromptRuns_ConfigurationID_FinalValidationPassed, @MJAIPromptRuns_ConfigurationID_ValidationBehavior, @MJAIPromptRuns_ConfigurationID_RetryStrategy, @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, @MJAIPromptRuns_ConfigurationID_FinalValidationError, @MJAIPromptRuns_ConfigurationID_ValidationErrorCount, @MJAIPromptRuns_ConfigurationID_CommonValidationError, @MJAIPromptRuns_ConfigurationID_FirstAttemptAt, @MJAIPromptRuns_ConfigurationID_LastAttemptAt, @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, @MJAIPromptRuns_ConfigurationID_ValidationAttempts, @MJAIPromptRuns_ConfigurationID_ValidationSummary, @MJAIPromptRuns_ConfigurationID_FailoverAttempts, @MJAIPromptRuns_ConfigurationID_FailoverErrors, @MJAIPromptRuns_ConfigurationID_FailoverDurations, @MJAIPromptRuns_ConfigurationID_OriginalModelID, @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, @MJAIPromptRuns_ConfigurationID_ModelSelection, @MJAIPromptRuns_ConfigurationID_Status, @MJAIPromptRuns_ConfigurationID_Cancelled, @MJAIPromptRuns_ConfigurationID_CancellationReason, @MJAIPromptRuns_ConfigurationID_ModelPowerRank, @MJAIPromptRuns_ConfigurationID_SelectionStrategy, @MJAIPromptRuns_ConfigurationID_CacheHit, @MJAIPromptRuns_ConfigurationID_CacheKey, @MJAIPromptRuns_ConfigurationID_JudgeID, @MJAIPromptRuns_ConfigurationID_JudgeScore, @MJAIPromptRuns_ConfigurationID_WasSelectedResult, @MJAIPromptRuns_ConfigurationID_StreamingEnabled, @MJAIPromptRuns_ConfigurationID_FirstTokenTime, @MJAIPromptRuns_ConfigurationID_ErrorDetails, @MJAIPromptRuns_ConfigurationID_ChildPromptID, @MJAIPromptRuns_ConfigurationID_QueueTime, @MJAIPromptRuns_ConfigurationID_PromptTime, @MJAIPromptRuns_ConfigurationID_CompletionTime, @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, @MJAIPromptRuns_ConfigurationID_EffortLevel, @MJAIPromptRuns_ConfigurationID_RunName, @MJAIPromptRuns_ConfigurationID_Comments, @MJAIPromptRuns_ConfigurationID_TestRunID, @MJAIPromptRuns_ConfigurationID_AssistantPrefill, @MJAIPromptRuns_ConfigurationID_TokensCacheRead, @MJAIPromptRuns_ConfigurationID_TokensCacheWrite, @MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup, @MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_ConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ConfigurationID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_ConfigurationIDID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_ConfigurationID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_ConfigurationID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_ConfigurationID_Status nvarchar(50)
    DECLARE @MJAIResultCache_ConfigurationID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_ConfigurationID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_ConfigurationID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_ConfigurationID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [ConfigurationID] = @ID

    OPEN cascade_update_MJAIResultCache_ConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_ConfigurationID_cursor INTO @MJAIResultCache_ConfigurationIDID, @MJAIResultCache_ConfigurationID_AIPromptID, @MJAIResultCache_ConfigurationID_AIModelID, @MJAIResultCache_ConfigurationID_RunAt, @MJAIResultCache_ConfigurationID_PromptText, @MJAIResultCache_ConfigurationID_ResultText, @MJAIResultCache_ConfigurationID_Status, @MJAIResultCache_ConfigurationID_ExpiredOn, @MJAIResultCache_ConfigurationID_VendorID, @MJAIResultCache_ConfigurationID_AgentID, @MJAIResultCache_ConfigurationID_ConfigurationID, @MJAIResultCache_ConfigurationID_PromptEmbedding, @MJAIResultCache_ConfigurationID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_ConfigurationID_ConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_ConfigurationIDID, @AIPromptID = @MJAIResultCache_ConfigurationID_AIPromptID, @AIModelID = @MJAIResultCache_ConfigurationID_AIModelID, @RunAt = @MJAIResultCache_ConfigurationID_RunAt, @PromptText = @MJAIResultCache_ConfigurationID_PromptText, @ResultText = @MJAIResultCache_ConfigurationID_ResultText, @Status = @MJAIResultCache_ConfigurationID_Status, @ExpiredOn = @MJAIResultCache_ConfigurationID_ExpiredOn, @VendorID = @MJAIResultCache_ConfigurationID_VendorID, @AgentID = @MJAIResultCache_ConfigurationID_AgentID, @ConfigurationID_Clear = 1, @ConfigurationID = @MJAIResultCache_ConfigurationID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_ConfigurationID_PromptEmbedding, @PromptRunID = @MJAIResultCache_ConfigurationID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_ConfigurationID_cursor INTO @MJAIResultCache_ConfigurationIDID, @MJAIResultCache_ConfigurationID_AIPromptID, @MJAIResultCache_ConfigurationID_AIModelID, @MJAIResultCache_ConfigurationID_RunAt, @MJAIResultCache_ConfigurationID_PromptText, @MJAIResultCache_ConfigurationID_ResultText, @MJAIResultCache_ConfigurationID_Status, @MJAIResultCache_ConfigurationID_ExpiredOn, @MJAIResultCache_ConfigurationID_VendorID, @MJAIResultCache_ConfigurationID_AgentID, @MJAIResultCache_ConfigurationID_ConfigurationID, @MJAIResultCache_ConfigurationID_PromptEmbedding, @MJAIResultCache_ConfigurationID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_ConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_ConfigurationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIConfiguration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Developer], [cdp_Integration];

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
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_SystemPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [DefaultCoAgentID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [SystemPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_DefaultCoAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_SystemPromptID_SystemPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_SystemPromptIDID, @Name = @MJAIAgentTypes_SystemPromptID_Name, @Description = @MJAIAgentTypes_SystemPromptID_Description, @SystemPromptID_Clear = 1, @SystemPromptID = @MJAIAgentTypes_SystemPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_SystemPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_SystemPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_SystemPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @DefaultCoAgentID = @MJAIAgentTypes_SystemPromptID_DefaultCoAgentID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_DefaultCoAgentID
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
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1a5da45-b7f4-4431-a4d4-664963e1a02c' OR (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'DefaultCoAgent')) BEGIN
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
            'e1a5da45-b7f4-4431-a4d4-664963e1a02c',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: MJ: AI Agents
            100152,
            'DefaultCoAgent',
            'Default Co Agent',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fcb06004-55f2-4245-bc9d-3762d292bf04' OR (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'RootDefaultCoAgentID')) BEGIN
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
            'fcb06004-55f2-4245-bc9d-3762d292bf04',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: MJ: AI Agents
            100154,
            'RootDefaultCoAgentID',
            'Root Default Co Agent ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20f00ce4-c7f5-4328-bc29-858cdfababc0' OR (EntityID = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND Name = 'DefaultCoAgent')) BEGIN
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
            '20f00ce4-c7f5-4328-bc29-858cdfababc0',
            '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- Entity: MJ: AI Agent Types
            100037,
            'DefaultCoAgent',
            'Default Co Agent',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c157ced3-2570-465b-b9a8-1b748a03de41' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'Agent')) BEGIN
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
            'c157ced3-2570-465b-b9a8-1b748a03de41',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100027,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5872144-c342-4e6c-b8ab-97323a939b5c' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'User')) BEGIN
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
            'd5872144-c342-4e6c-b8ab-97323a939b5c',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100028,
            'User',
            'User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b75d30aa-b9aa-4096-b598-0b95d640021c' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'Conversation')) BEGIN
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
            'b75d30aa-b9aa-4096-b598-0b95d640021c',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100029,
            'Conversation',
            'Conversation',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0eaeeadb-75b6-401e-a868-07f0400ed365' OR (EntityID = 'DF2B0246-1729-4552-9FB7-48891B5F4873' AND Name = 'RootLastSessionID')) BEGIN
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
            '0eaeeadb-75b6-401e-a868-07f0400ed365',
            'DF2B0246-1729-4552-9FB7-48891B5F4873', -- Entity: MJ: AI Agent Sessions
            100030,
            'RootLastSessionID',
            'Root Last Session ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b4f9b2c-1f98-463b-8712-ed29b825152f' OR (EntityID = 'A909C8E5-D406-4899-878B-61972F736779' AND Name = 'Channel')) BEGIN
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
            '3b4f9b2c-1f98-463b-8712-ed29b825152f',
            'A909C8E5-D406-4899-878B-61972F736779', -- Entity: MJ: AI Agent Session Channels
            100021,
            'Channel',
            'Channel',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '3B4F9B2C-1F98-463B-8712-ED29B825152F'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '17506F15-DA0F-49C3-BABA-A9F1C179EE3E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4CEDB027-C266-400F-9F92-624FC9E658BD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BA18E18E-521F-44B2-BFE3-40B155C58BA3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3B4F9B2C-1F98-463B-8712-ED29B825152F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '17506F15-DA0F-49C3-BABA-A9F1C179EE3E'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3B4F9B2C-1F98-463B-8712-ED29B825152F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '3B4F9B2C-1F98-463B-8712-ED29B825152F'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '17506F15-DA0F-49C3-BABA-A9F1C179EE3E'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '5C0C0D1C-4B14-417E-9280-B4545A8AF1EF'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '65CDC348-C4A6-4D00-A57B-2D489C56F128'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'C157CED3-2570-465B-B9A8-1B748A03DE41'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'D5872144-C342-4E6C-B8AB-97323A939B5C'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1EE2BC8D-FEFC-4AE9-B3C6-E1CDF54F7893'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8C704F55-4757-462C-8C67-04920D9DA336'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C157CED3-2570-465B-B9A8-1B748A03DE41'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D5872144-C342-4E6C-B8AB-97323A939B5C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B75D30AA-B9AA-4096-B598-0B95D640021C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C157CED3-2570-465B-B9A8-1B748A03DE41'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D5872144-C342-4E6C-B8AB-97323A939B5C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B75D30AA-B9AA-4096-B598-0B95D640021C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B8279EC1-5264-4070-BD8A-9927DF140745'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A80023D7-4D33-4443-9504-37FE6AE132FF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B8279EC1-5264-4070-BD8A-9927DF140745'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '6EE074C4-60ED-4DF5-B9DD-EEC722A7B3C2'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'B8279EC1-5264-4070-BD8A-9927DF140745'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '124E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '695817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '124E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '64FAC701-8AB3-43C0-B741-71252122E8B0'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '12248F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Contains'
               WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'E1F5A7A4-9248-4C45-9D74-04E7B44A1DD5'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5E3D73A1-DD35-4709-AA02-10373242CA24' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.AgentSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Session',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2BBC1988-61A7-4D21-AD19-EED50E2B0A05' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.ChannelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '784B75F0-16C4-485F-B2F4-8B07F50FBC4E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.Channel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B4F9B2C-1F98-463B-8712-ED29B825152F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Connection Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '17506F15-DA0F-49C3-BABA-A9F1C179EE3E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.LastActiveAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Connection Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4CEDB027-C266-400F-9F92-624FC9E658BD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.DisconnectedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Connection Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA18E18E-521F-44B2-BFE3-40B155C58BA3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.SocketUrl 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Socket URL',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'F07FCB82-69FE-4ED4-AECD-1310377A439B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.Config 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '989052BD-FCB6-44D7-A4D8-3FB3116A4C5C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BFF02A46-902C-4159-92DE-CCD3FF211E37' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Session Channels.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '241BAFB0-DA75-4E87-91D5-C8B341EBAA2D' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-network-wired */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-network-wired', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A909C8E5-D406-4899-878B-61972F736779';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('57482640-9ca2-4a4d-93c2-98ad1beae634', 'A909C8E5-D406-4899-878B-61972F736779', 'FieldCategoryInfo', '{"Session Context":{"icon":"fa fa-info-circle","description":"Core identifiers linking this channel instance to the active session"},"Connection Status":{"icon":"fa fa-signal","description":"Real-time status, activity tracking, and disconnection details"},"Configuration":{"icon":"fa fa-sliders-h","description":"Technical connection parameters and instance-specific state"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a8abc25a-7b90-4d0a-b2a0-97fed1186610', 'A909C8E5-D406-4899-878B-61972F736779', 'FieldCategoryIcons', '{"Session Context":"fa fa-info-circle","Connection Status":"fa fa-signal","Configuration":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A909C8E5-D406-4899-878B-61972F736779';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18A62344-3698-4445-B2EE-48B19B3E323D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6EE074C4-60ED-4DF5-B9DD-EEC722A7B3C2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D85030E0-5ADA-4001-A4E3-92157B381FA0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A80023D7-4D33-4443-9504-37FE6AE132FF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.ServerPluginClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '40C2DA29-40AD-4F49-8121-7FCD282F28AF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.ClientPluginClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ED708EA1-DDBD-4027-840A-4D35896CFDA2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.TransportType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8279EC1-5264-4070-BD8A-9927DF140745' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.ConfigSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration Schema',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B0A0B7A6-5D3E-4A56-A410-112F51A5DE51' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5844E14D-27B7-43A2-ADCC-E1732F3A947D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5B1C8B8-BED9-406A-9403-9413A0554639' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-broadcast-tower */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-broadcast-tower', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '417336BE-9DD3-481B-9686-81A435F54147';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8a60bbb1-e97c-47f5-aa2f-5dc5f044ea30', '417336BE-9DD3-481B-9686-81A435F54147', 'FieldCategoryInfo', '{"Channel Definition":{"icon":"fa fa-info-circle","description":"Basic identification and status settings for the AI agent channel"},"Integration Configuration":{"icon":"fa fa-plug","description":"Technical settings for server/client plugins and transport protocols"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c819e33d-b1f9-402e-a1a9-cbd32d89df33', '417336BE-9DD3-481B-9686-81A435F54147', 'FieldCategoryIcons', '{"Channel Definition":"fa fa-info-circle","Integration Configuration":"fa fa-plug","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '417336BE-9DD3-481B-9686-81A435F54147';

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5FEEAD82-55FC-4231-972A-B39511EE1410' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1D999AB-CBA5-4233-A296-87E026E40807' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE4F8641-BF5C-449F-B249-EF634D240C90' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.ConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61E0BCC1-5696-4F1D-9FDC-4C71A7BED310' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C157CED3-2570-465B-B9A8-1B748A03DE41' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D5872144-C342-4E6C-B8AB-97323A939B5C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.Conversation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B75D30AA-B9AA-4096-B598-0B95D640021C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1EE2BC8D-FEFC-4AE9-B3C6-E1CDF54F7893' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.LastActiveAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8C704F55-4757-462C-8C67-04920D9DA336' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.ClosedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8FC7DB66-FB18-4A10-A7B1-17E871EFBCE2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.CloseReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3DCEF25D-0546-4C75-8A9A-8CB891AB0E51' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.HostInstanceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Infrastructure',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '69619E4B-2EF9-4763-90C3-AFA942DC0AA1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.Config 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Infrastructure',
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'C783C488-AC96-413F-ADA4-2377CBB0C35A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.LastSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Infrastructure',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB4D8FC0-1480-4D34-8365-A107FEE0F9AD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.RootLastSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Infrastructure',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0EAEEADB-75B6-401E-A868-07F0400ED365' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FEAFC3FD-1342-41B3-936A-508C6818FDC5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3DD79455-7665-46DE-B1C0-2CBD208644A4' AND AutoUpdateCategory = 1;

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BDF7CC2-8BB6-4B10-A69B-F5C4EF647FAF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5C0C0D1C-4B14-417E-9280-B4545A8AF1EF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C6E768F-C587-4538-BC48-C869854F3A18' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.SystemPromptID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '24424A6A-C0E3-4DB0-9AF1-551D12AE7E10' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.AgentPromptPlaceholder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '47FCBE6A-43EA-47FA-912B-ACB82A311471' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.PromptParamsSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Parameters Schema',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '41DA3898-26C0-4AE9-B934-84EA97C726B7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.SystemPrompt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'System Prompt Content',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '200792E6-E7EC-4293-A821-77B42A49DAB5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '980B9BE8-5C4E-45A4-BE62-32874A339AF6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB83502E-F00C-4CF8-AD0E-FFE9BF3C8904' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.UIFormSectionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7763B64B-E410-4247-89DE-5E9E565F15A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.UIFormKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FAC68362-126A-4F7E-B706-8DD7B40897A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.UIFormSectionExpandedByDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA3D74E3-D1A2-4932-A1FB-4219F3BE1CC9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.AssignmentStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '27C830A6-A889-4A9C-908C-33BB7A6CDB37' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultStorageAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B31A64B-6BD8-446B-B306-0BDD65645694' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultStorageAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC5FC66F-CDED-4316-8E1A-F0B3F0577F3D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultCoAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Integration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Co-Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C215D1C0-9EB6-43EC-A8C2-AC64E9BDED0E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultCoAgent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Integration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Co-Agent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20F00CE4-C7F5-4328-BC29-858CDFABABC0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7A190481-BB1D-4B6D-8EA1-E554E56B83B9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4AEB4F4F-664A-409A-AD4E-FD96800BF5FF' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-robot */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-robot', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'DF2B0246-1729-4552-9FB7-48891B5F4873';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b7f4df0b-b7ef-48f6-8242-e60107c0e8ff', 'DF2B0246-1729-4552-9FB7-48891B5F4873', 'FieldCategoryInfo', '{"Session Context":{"icon":"fa fa-user-circle","description":"Information linking the session to agents, users, and conversations"},"Session Lifecycle":{"icon":"fa fa-clock","description":"Operational status, activity timestamps, and closure details"},"Technical Infrastructure":{"icon":"fa fa-server","description":"Server affinity, configuration, and session lineage metadata"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('40fa4d4d-b04c-4c2e-b2bc-d7d22a2e3785', 'DF2B0246-1729-4552-9FB7-48891B5F4873', 'FieldCategoryIcons', '{"Session Context":"fa fa-user-circle","Session Lifecycle":"fa fa-clock","Technical Infrastructure":"fa fa-server","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'DF2B0246-1729-4552-9FB7-48891B5F4873';

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"Agent Integration":{"icon":"fa fa-users","description":"Configuration for co-agents and real-time interaction partners"}}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND [Name] = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"Agent Integration":"fa fa-users"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND [Name] = 'FieldCategoryIcons';

/* Set categories for 36 fields */

-- UPDATE Entity Field Category Info MJ: Conversation Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '124E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Message 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '134E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Error 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.HiddenToUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.SummaryOfEarlierConversation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation Summary',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21B640E1-D21E-4E4B-95BC-E9862FD11C8A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.CompletionTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Completion Time (ms)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55E7C54B-74F7-4E25-BF60-A79C28AD2410' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.IsPinned 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D04D36AE-BCB4-4DF2-8BB7-0ED3567FACF2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64FAC701-8AB3-43C0-B741-71252122E8B0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.SuggestedResponses 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Suggested Responses (Legacy)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '79639F85-7B4A-4ACA-89B3-3D043D0AE9FB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.OriginalMessageChanged 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F99F9670-A9A8-44BE-8F4F-1C3138490591' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ExternalID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '695817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.TestRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B4BAC05B-4345-49B2-97B2-FB761777078D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.RootParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Parent ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F2FE5B3-6AD4-485C-AEBA-F7060064E62C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.UserRating 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ACAB0610-A4EA-433B-A39A-C2D6EFB46F59' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.UserFeedback 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C400A5F2-1BE3-4441-AEFA-06344A12AAB2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ReflectionInsights 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E69363F6-164F-41B8-B521-889B56493CE9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '68EA370B-0AB9-45AF-A1EC-88A94329A3A2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ArtifactID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E9AB7E01-35D5-4FDB-8C61-24292B0F0A19' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ArtifactVersionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABF64F53-7927-4039-B5B8-DC07E8435B36' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Message',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '14488A57-7BC6-455F-88DF-2264585DA63F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8BE14CF2-2F23-4208-8313-91259D312DB2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.AgentSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Entities',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Session',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5470C38C-CF11-45DE-8DAC-54B55DCC244C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Conversation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6D4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '50D773C6-6E9F-4C00-AAE3-A284ABE38676' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Artifact 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D350E5F8-8128-4A32-851E-BA6A227E4D5C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ArtifactVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact Version Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D510523A-90B9-4797-B1B9-83B5C16AC117' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B4B63C2-91A7-4B53-ABAC-E15AA9600FEB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C6CC59F-D153-47DB-A664-3C9884B07059' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.TestRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Entities',
   GeneratedFormSection = 'Category',
   DisplayName = 'Test Run Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '84FA19A3-7667-43C6-9273-070A9A925D7F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ResponseForm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '811099AE-EFF5-4BAE-BFD1-66F68F95C36E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ActionableCommands 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2433C81E-0921-404B-969F-7A37DBF23D4A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Conversation Details.AutomaticCommands 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D185550-A536-43BD-8A45-1324F35B7BA1' AND AutoUpdateCategory = 1;

/* Set categories for 64 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CDCEFDE-FBFE-44CD-ACAF-A1543F309EC4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B5B91C2-2D8D-441D-9281-19089EF7B21E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ParentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8BE780BC-757D-4AC0-9ECC-5C9FFBAA38FD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.LastRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44D62D04-D013-4C3B-A535-555E3AA388BB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.RunName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51A944B0-A282-4ED0-9D4E-1EE41498065A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77918E52-6BA1-4FA6-9AE1-F5987906D0C8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ExternalReferenceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'External Reference ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '40EA5AB0-58A3-4CCE-B7E1-C9BB56E7D5A4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ParentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Run (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D94F2321-5DCA-4B11-8E17-57DC851BFDC5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.LastRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Last Run (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2996B20E-9DFD-41C8-A810-B0EC3038622B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Run (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C30AB32-15A4-460D-9955-DD89EDEF5F62' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.RootParentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Parent Run ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A860DAE5-5AA8-4EBE-9C5F-914AFDD0E3C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.RootLastRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Last Run ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D3B3BBE7-627B-4A67-BFC3-81C2F248B9ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1F5A7A4-9248-4C45-9D74-04E7B44A1DD5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '025D0895-4A17-4168-8B38-9B9C6D68CFD8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80FAFCF2-539E-4A38-86CD-9E9395C8664F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Success 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3C8FBEA-CA05-462D-94E5-7B4875446A79' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '057C84E7-BAD3-405A-B2B9-5D13551EFCD4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Result 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '974746E9-53D2-484B-AFF3-9B7D9292D6B7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentState 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '6FF56877-27AE-47D9-A6CD-641088C2458E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.CancellationReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '14A76D05-D24C-4EE0-B24E-B840DD330F60' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.FinalStep 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.FinalPayload 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '6FFF2754-A03E-4DFD-AC17-FB16CDAD5346' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Message 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Message',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B55CD7D-06C3-485C-9FC0-CF4C33D66DF5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.StartingPayload 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B106357D-347F-45BE-89AA-B96298ED1DDA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptIterations 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7411D673-9C57-4419-96BA-1C607B77DA43' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Data 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Data',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '08037344-3952-4EBE-BA34-F87BD670C61A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Verbose 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07CD2EF5-1737-4662-BE76-301A3E88BD9D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6962DE96-798F-4E1C-AE87-489429927C4C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.LastHeartbeatAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details & Outcome',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AE864635-13FE-474C-BCD9-2238A8CDD682' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FF245A3-C823-49F8-B20A-31A64D0E6E77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '625FE9E6-9058-4FDD-8970-4595336C60D3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetailID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8505597E-558F-4222-ABF7-5BA4E163A97D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetailSequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation Detail Sequence',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D4896B2F-D530-4844-8C96-A0016F0A81D4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38A3F73F-9364-428E-A195-5DF74B9F9ACB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Conversation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8FAF86E8-F74E-4D76-972A-197FBB245478' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9FEAEC67-96DB-4551-9954-AC631C8ADF0A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation Detail (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '66AAF27B-995D-4F5F-8149-BE6E35C7694C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contextual Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Session',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23D0314B-0894-4E38-A243-6FE6D13B79C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Tokens Used',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7C0AFAA-E27C-41DA-8FAA-0B48E276089D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34F910FE-C31E-42FE-9A9E-08407AF79BDB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Prompt Tokens',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '69B7EB99-3409-4B84-B979-877E992964DC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCompletionTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Completion Tokens',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BE28D8A-2E06-460D-BDD7-34E5BEB5DBB0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalTokensUsedRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A60033A0-D13C-4954-8EF3-6BB8A5618126' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptTokensUsedRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Prompt Tokens (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FCD5864B-65BB-4E9F-A3FE-2C09D3461364' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCompletionTokensUsedRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Completion Tokens (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B1401167-0C3B-4D14-9633-6A3A1DC429A9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCostRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F9928463-5F2B-46C0-8DA3-6EEF2FA816EF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCacheReadTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Cache Read Tokens',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CAEE3E16-509E-4F64-A4FD-6B5428D325BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCacheWriteTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Cache Write Tokens',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B815F5A-2C13-4FE8-9C8F-ED4A1022883B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '13198D22-60EB-4694-B420-7BDB4E3E9BB8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B025CDE5-5300-46DA-BC49-7130D0689E81' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConfigurationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '038B0DB2-EB71-4E8D-945E-EBA1AA570391' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Model Override',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E95FDE6B-12E3-4A41-AA15-9EAD7695B266' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideVendorID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Vendor Override',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F8747D24-8E7D-4D12-BCF8-8CD9F7749566' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.EffortLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B16B5B36-7238-4A90-ABAD-DA64ED8FADCA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F32D57F-954A-4DDD-BE50-A52E7E9FA1FF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Model Override (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F27EECF4-14ED-4338-9ABE-3E472415CE2B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideVendor 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Vendor Override (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E8614CB-65CB-4C28-9D0B-198CBA49CBBF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TestRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7685B81B-FD95-40F8-A3D6-4EB710DB054D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TestRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Test Run (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34DF8E45-2C56-4E9D-AC4C-2FD4C4EEE196' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0F924E4-A919-4AE5-A0E6-F5D4847926D6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Scope Record ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C6602391-0B0C-4ECB-8A16-3A8B019B5C3D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.SecondaryScopes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '21FC62F2-F9CC-40C4-A1BA-462699CCD289' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '766B0728-BB2E-4827-B23A-7A4CA04FB7F6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Scope Entity (Ref)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ECFA16C9-1005-4B07-90CB-690623428037' AND AutoUpdateCategory = 1;

/* Set categories for 78 fields */

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

-- UPDATE Entity Field Category Info MJ: AI Agents.TypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
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
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8' AND AutoUpdateCategory = 1;

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

-- UPDATE Entity Field Category Info MJ: AI Agents.IsRestricted 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5B17B79-282F-4F19-9656-246DE119D588' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AgentTypePromptParams 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.CategoryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DCA7B3C-9A81-4D32-AF2E-5EA32B22D988' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
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
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6517DB09-A12E-4F1B-95B6-0B0A92918A1D' AND AutoUpdateCategory = 1;

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

-- UPDATE Entity Field Category Info MJ: AI Agents.InvocationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '52E74C81-D246-4B52-B7A7-91757C299671' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.RootParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '644AA4B2-1044-430C-BCBA-245644294E02' AND AutoUpdateCategory = 1;

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
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '451D5C8F-6749-4789-A158-658B38A74AE4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPromptID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FFD209C5-48F3-45D1-9094-E76EC832EA07' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageRetentionCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73A50D68-976F-49A7-9737-12D1D26C6011' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPrompt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD36EF69-1494-409C-A97E-FE73669DD28A' AND AutoUpdateCategory = 1;

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

-- UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
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

-- UPDATE Entity Field Category Info MJ: AI Agents.AllowEphemeralClientTools 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '98BE9EE9-A855-488E-9D97-441AEBA2B34D' AND AutoUpdateCategory = 1;

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
   Category = 'Runtime Limits & Execution Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Co-Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5389E13A-6D4F-4EEF-80A1-51B828EBD9C3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultCoAgent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Runtime Limits & Execution Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Co-Agent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1A5DA45-B7F4-4431-A4D4-664963E1A02C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.RootDefaultCoAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Runtime Limits & Execution Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Default Co-Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FCB06004-55F2-4245-BC9D-3762D292BF04' AND AutoUpdateCategory = 1;

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
   DisplayName = 'Inline Storage Threshold (Bytes)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '76AF4818-C79E-4DB5-8039-6B51C1C3A832' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.AttachmentStorageProvider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B6261245-1F52-43BA-9C92-A3E494D8C5BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D900C3B8-F414-4468-AAA1-3CEB52C80ACD' AND AutoUpdateCategory = 1;

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

-- UPDATE Entity Field Category Info MJ: AI Agents.SearchScopeAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB' AND AutoUpdateCategory = 1;

