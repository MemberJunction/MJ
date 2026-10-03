/* ============================================================================
   Telephony / contact-center core schema — phone numbers, number pools, and
   channel-agnostic Interactions
   v6.2.x

   Companion plan: plans/realtime/bridges-and-widget/ (see LOCAL-HANDOFF.md there)

   The realtime bridges migration (V202606151800__v5.41.x__Realtime_Bridges.sql) gave
   MJ a transport layer for phone calls: AIBridgeProvider (Twilio / Vonage / ...),
   AIBridgeAgentIdentity, AIAgentSessionBridge. What it does NOT model is the thing
   a contact center is actually built around: the phone numbers an organization
   owns, how outbound calls pick a caller ID, and a durable, channel-agnostic record
   of "one live conversation" with its lifecycle events and what it was about.
   This migration adds exactly that, as five new tables in the core schema:

     NumberPool        — a named group of phone numbers with a caller-ID selection
                         rule (round robin / local presence / random) and an
                         optional per-number concurrency ceiling.
     PhoneNumber       — an E.164 number owned through a telephony AIBridgeProvider,
                         with its capabilities, status and optional pool membership.
     Interaction       — one live conversation on any channel (Phone / Web /
                         Meeting). Links to the AIAgentSession that drives it, the
                         room it ran in, and the PhoneNumber it used.
     InteractionEvent  — append-only lifecycle log for an Interaction (queued,
                         offered, accepted, transferred, escalated, ended, ...).
     InteractionLink   — polymorphic link from an Interaction to ANY MJ record
                         (the caller, what it was regarding, what it created),
                         modelled like TaggedItem (EntityID + RecordID).

   Creation order matters: NumberPool, then PhoneNumber (FK to NumberPool), then
   Interaction (FKs to PhoneNumber / AIAgentSession), then the two child tables.

   Purely additive: five new tables, no change to any shipped table. The contact-center
   Open App (a separate repository) ships its own migration that references
   PhoneNumber / NumberPool / Interaction with real foreign keys, which is why these
   live in MJ core rather than in the app schema: FKs and package dependencies in this
   program point UP only.

   TWO-STEP LOCAL PLAN (the owner applies this; CodeGen is NOT run while authoring):
     1. Apply this migration to a dedicated database (mj migrate).
     2. Run CodeGen (mj codegen), then append the CodeGen SQL capture to the
        bottom of THIS file, below the banner at the end. Delete the standalone
        CodeGen_Run_*.sql. See plans/realtime/bridges-and-widget/LOCAL-HANDOFF.md.

   CodeGen convention (per CLAUDE.md migrations guide):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
     * sp_addextendedproperty on every business column so CodeGen surfaces descriptions.
     * Enum-like columns use simple CHECK ... IN (...) constraints so CodeGen emits
       value lists / string-union types. NEVER hand-insert EntityFieldValue rows.
     * No EntityField / Entity / view / stored procedure DDL here — CodeGen owns it.
     * No seed data. The CHECK value lists are the vocabulary.
   ============================================================================ */


-- ============================================================================
-- 1. NumberPool  ("MJ: Number Pools")
--    A named group of phone numbers with a selection rule for outbound caller ID.
--    Created first because PhoneNumber references it.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.NumberPool (
    ID                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                     NVARCHAR(255)    NOT NULL,
    SelectionRule            NVARCHAR(20)     NOT NULL CONSTRAINT DF_NumberPool_SelectionRule DEFAULT ('RoundRobin'),
    MaxConcurrentPerNumber   INT              NULL,
    Description              NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_NumberPool PRIMARY KEY (ID),
    CONSTRAINT UQ_NumberPool_Name UNIQUE (Name),
    CONSTRAINT CK_NumberPool_SelectionRule
        CHECK (SelectionRule IN ('RoundRobin', 'LocalPresence', 'Random')),
    CONSTRAINT CK_NumberPool_MaxConcurrentPerNumber
        CHECK (MaxConcurrentPerNumber IS NULL OR MaxConcurrentPerNumber > 0)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A named group of phone numbers used together for outbound calling, with a rule for which number is chosen as the caller ID on each call. Inbound routing does not use pools.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'NumberPool';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique, human-readable name of the pool (e.g. Sales Outbound US, Support Callback).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'NumberPool', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'How an outbound call picks a number from the pool: RoundRobin (rotate evenly through active numbers), LocalPresence (prefer a number whose area code / region matches the callee, falling back to round robin), or Random.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'NumberPool', @level2type = N'COLUMN', @level2name = N'SelectionRule';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional ceiling on simultaneous active Interactions per number in this pool. A number at the ceiling is skipped during selection. NULL means no ceiling is enforced by MJ (the carrier may still impose one).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'NumberPool', @level2type = N'COLUMN', @level2name = N'MaxConcurrentPerNumber';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional description of what the pool is for and any selection policy notes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'NumberPool', @level2type = N'COLUMN', @level2name = N'Description';


-- ============================================================================
-- 2. PhoneNumber  ("MJ: Phone Numbers")
--    A telephone number the organization owns through a telephony bridge provider.
--    Distinct from AIBridgeAgentIdentity (which maps a number to an AGENT for inbound
--    routing): this is the inventory record for the number itself.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.PhoneNumber (
    ID             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Number]       NVARCHAR(20)     NOT NULL,
    ProviderID     UNIQUEIDENTIFIER NOT NULL,
    Capabilities   NVARCHAR(20)     NOT NULL CONSTRAINT DF_PhoneNumber_Capabilities DEFAULT ('Voice'),
    Status         NVARCHAR(20)     NOT NULL CONSTRAINT DF_PhoneNumber_Status DEFAULT ('Active'),
    NumberPoolID   UNIQUEIDENTIFIER NULL,
    Label          NVARCHAR(255)    NULL,
    Description    NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_PhoneNumber PRIMARY KEY (ID),
    CONSTRAINT UQ_PhoneNumber_Number UNIQUE ([Number]),
    CONSTRAINT FK_PhoneNumber_Provider FOREIGN KEY (ProviderID)
        REFERENCES ${flyway:defaultSchema}.AIBridgeProvider (ID),
    CONSTRAINT FK_PhoneNumber_NumberPool FOREIGN KEY (NumberPoolID)
        REFERENCES ${flyway:defaultSchema}.NumberPool (ID),
    -- E.164: a leading '+', a non-zero first digit, digits only after it, at most 15 digits.
    CONSTRAINT CK_PhoneNumber_E164
        CHECK ([Number] LIKE '+[1-9]%' AND [Number] NOT LIKE '+%[^0-9]%' AND LEN([Number]) BETWEEN 5 AND 16),
    CONSTRAINT CK_PhoneNumber_Capabilities
        CHECK (Capabilities IN ('Voice', 'VoiceAndSMS')),
    CONSTRAINT CK_PhoneNumber_Status
        CHECK (Status IN ('Active', 'Inactive', 'Porting'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A telephone number owned or leased through a telephony bridge provider. The inventory record the contact center selects from for outbound caller ID and routes inbound calls against.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PhoneNumber';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The number in E.164 format: a leading plus sign, a country code, and digits only, with no spaces or punctuation (e.g. +14155550123). Globally unique.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PhoneNumber', @level2type = N'COLUMN', @level2name = N'Number';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The telephony bridge provider (carrier / CPaaS account such as Twilio or Vonage) through which this number is owned and through which its calls are placed and received.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PhoneNumber', @level2type = N'COLUMN', @level2name = N'ProviderID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'What the number can do: Voice (calls only) or VoiceAndSMS (calls and text messages).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PhoneNumber', @level2type = N'COLUMN', @level2name = N'Capabilities';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lifecycle state of the number: Active (usable), Inactive (retained but not used for new calls), or Porting (being transferred to or from another carrier and not yet usable).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PhoneNumber', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional number pool this number belongs to for outbound caller-ID selection. NULL when the number is not pooled (for example a dedicated inbound line).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PhoneNumber', @level2type = N'COLUMN', @level2name = N'NumberPoolID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Short human-readable label shown in the UI (e.g. Main Support Line, Sales West).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PhoneNumber', @level2type = N'COLUMN', @level2name = N'Label';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional longer description of the number and how it is used.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PhoneNumber', @level2type = N'COLUMN', @level2name = N'Description';


-- ============================================================================
-- 3. Interaction  ("MJ: Interactions")
--    One live conversation, on any channel. The durable, queryable record that sits
--    ABOVE the realtime session: a session is the engine's runtime object, an
--    Interaction is the business-facing thing a supervisor sees in a queue, a
--    report counts, and a CRM links to. Rows are created at the start of a
--    conversation and closed (EndedAt / EndReason) when it finishes.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.Interaction (
    ID                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Channel           NVARCHAR(20)     NOT NULL,
    Direction         NVARCHAR(20)     NOT NULL,
    Status            NVARCHAR(20)     NOT NULL CONSTRAINT DF_Interaction_Status DEFAULT ('Queued'),
    AgentSessionID    UNIQUEIDENTIFIER NULL,
    RoomName          NVARCHAR(255)    NULL,
    PhoneNumberID     UNIQUEIDENTIFIER NULL,
    RemoteAddress     NVARCHAR(255)    NULL,
    StartedAt         DATETIMEOFFSET   NOT NULL CONSTRAINT DF_Interaction_StartedAt DEFAULT (sysdatetimeoffset()),
    AnsweredAt        DATETIMEOFFSET   NULL,
    EndedAt           DATETIMEOFFSET   NULL,
    EndReason         NVARCHAR(100)    NULL,
    RecordingEnabled  BIT              NOT NULL CONSTRAINT DF_Interaction_RecordingEnabled DEFAULT (0),
    ExternalID        NVARCHAR(255)    NULL,
    CostEstimate      DECIMAL(18,6)    NULL,
    CONSTRAINT PK_Interaction PRIMARY KEY (ID),
    CONSTRAINT FK_Interaction_AgentSession FOREIGN KEY (AgentSessionID)
        REFERENCES ${flyway:defaultSchema}.AIAgentSession (ID),
    CONSTRAINT FK_Interaction_PhoneNumber FOREIGN KEY (PhoneNumberID)
        REFERENCES ${flyway:defaultSchema}.PhoneNumber (ID),
    CONSTRAINT CK_Interaction_Channel
        CHECK (Channel IN ('Phone', 'Web', 'Meeting')),
    CONSTRAINT CK_Interaction_Direction
        CHECK (Direction IN ('Inbound', 'Outbound', 'Internal')),
    CONSTRAINT CK_Interaction_Status
        CHECK (Status IN ('Queued', 'Active', 'Ended', 'Abandoned', 'Failed')),
    CONSTRAINT CK_Interaction_EndedAfterStarted
        CHECK (EndedAt IS NULL OR EndedAt >= StartedAt),
    CONSTRAINT CK_Interaction_AnsweredAfterStarted
        CHECK (AnsweredAt IS NULL OR AnsweredAt >= StartedAt),
    CONSTRAINT CK_Interaction_CostEstimate
        CHECK (CostEstimate IS NULL OR CostEstimate >= 0)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'One live conversation on any channel (phone call, web widget chat/voice, or meeting). The durable business record above the realtime agent session: what queues display, reports count, and CRM records link to. Its lifecycle is logged in InteractionEvent and its subject records are attached through InteractionLink.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The medium the conversation runs over: Phone (a telephone call through a telephony bridge), Web (an embedded web widget session), or Meeting (a multi-party conferencing room).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'Channel';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Who initiated the conversation: Inbound (the remote party reached us), Outbound (we reached the remote party), or Internal (between participants inside the organization, such as an agent-to-agent or staff consult).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'Direction';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lifecycle state: Queued (waiting for a handler), Active (a handler is engaged), Ended (completed normally), Abandoned (the remote party left before being answered), or Failed (could not be established or ended in error).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The AI agent session driving this conversation, when an agent is handling it. NULL for conversations handled entirely by humans or not yet assigned.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'AgentSessionID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Name of the realtime media room (for example the LiveKit room) the conversation runs in, which humans and agents join to participate. NULL when no room is involved.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'RoomName';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The organization-owned phone number used for a Phone conversation: the dialed number for Inbound, the caller ID for Outbound. NULL for non-phone channels.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'PhoneNumberID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The address of the remote party: the caller or callee number for phone, an anonymous session or visitor identifier for web, or the remote party identifier for meetings. Free-form text because the form depends on the channel.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'RemoteAddress';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the conversation was created (call placed or received, widget session opened). Defaults to the current time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'StartedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When a handler (agent or human) answered and the parties were connected. NULL if never answered. The gap from StartedAt is the wait time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'AnsweredAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the conversation ended. NULL while it is still queued or active. Must not precede StartedAt.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'EndedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Short reason the conversation ended (for example CallerHangup, AgentHangup, Transferred, Timeout, ProviderError). Free-form so new reasons need no schema change. NULL while still open.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'EndReason';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether media from this conversation is being recorded. Set at creation from the applicable policy and consent rules; it is the intent flag, not proof a recording file exists.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'RecordingEnabled';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The carrier or platform identifier for the conversation (for example a Twilio call SID), used to correlate provider webhooks and billing records with this row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'ExternalID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Estimated total cost of the conversation (carrier minutes, speech and model usage) in the organization''s reporting currency, accumulated as it runs. NULL when no estimate is available. An estimate, not an invoice.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Interaction', @level2type = N'COLUMN', @level2name = N'CostEstimate';


-- ============================================================================
-- 4. InteractionEvent  ("MJ: Interaction Events")
--    Append-only lifecycle log. Rows are inserted as things happen and are never
--    updated or deleted (to be enforced by the server-side entity subclass that
--    follows this migration; the schema just provides the shape).
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.InteractionEvent (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InteractionID   UNIQUEIDENTIFIER NOT NULL,
    EventType       NVARCHAR(20)     NOT NULL,
    OccurredAt      DATETIMEOFFSET   NOT NULL CONSTRAINT DF_InteractionEvent_OccurredAt DEFAULT (sysdatetimeoffset()),
    ActorUserID     UNIQUEIDENTIFIER NULL,
    ActorAgentID    UNIQUEIDENTIFIER NULL,
    Details         NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_InteractionEvent PRIMARY KEY (ID),
    CONSTRAINT FK_InteractionEvent_Interaction FOREIGN KEY (InteractionID)
        REFERENCES ${flyway:defaultSchema}.Interaction (ID),
    CONSTRAINT FK_InteractionEvent_ActorUser FOREIGN KEY (ActorUserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT FK_InteractionEvent_ActorAgent FOREIGN KEY (ActorAgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID),
    CONSTRAINT CK_InteractionEvent_EventType
        CHECK (EventType IN ('Created', 'Queued', 'Offered', 'Accepted', 'Declined', 'Answered', 'Transferred', 'Escalated', 'Held', 'Resumed', 'Ended', 'Abandoned'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Append-only lifecycle log of an Interaction: each routing decision, hand-off and state change, stamped with when it happened and who or what caused it. Rows are never edited; corrections are new events.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionEvent';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'What happened: Created, Queued (placed in a queue), Offered (offered to a handler), Accepted or Declined (handler response to an offer), Answered (parties connected), Transferred (moved to another handler), Escalated (raised to a human or higher tier), Held, Resumed, Ended, or Abandoned (remote party left before an answer).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionEvent', @level2type = N'COLUMN', @level2name = N'EventType';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the event occurred. Defaults to the current time; set explicitly when recording an event reported later by a carrier webhook.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionEvent', @level2type = N'COLUMN', @level2name = N'OccurredAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The human user who caused the event (accepted an offer, transferred, ended the call). NULL when the actor was an agent or the system.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionEvent', @level2type = N'COLUMN', @level2name = N'ActorUserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The AI agent that caused the event (answered, escalated, transferred). NULL when the actor was a human user or the system.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionEvent', @level2type = N'COLUMN', @level2name = N'ActorAgentID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional event-specific JSON detail (for example the transfer target, escalation reason, or queue name). Shape depends on EventType.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionEvent', @level2type = N'COLUMN', @level2name = N'Details';


-- ============================================================================
-- 5. InteractionLink  ("MJ: Interaction Links")
--    Polymorphic link from an Interaction to any MJ record, modelled like TaggedItem
--    (EntityID + RecordID). Lets a call be tied to the Person who called, the case it
--    was regarding, and any record it created, without the core schema knowing about
--    any application's tables.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.InteractionLink (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InteractionID   UNIQUEIDENTIFIER NOT NULL,
    EntityID        UNIQUEIDENTIFIER NOT NULL,
    RecordID        NVARCHAR(450)    NOT NULL,
    [Role]          NVARCHAR(20)     NOT NULL,
    CONSTRAINT PK_InteractionLink PRIMARY KEY (ID),
    CONSTRAINT FK_InteractionLink_Interaction FOREIGN KEY (InteractionID)
        REFERENCES ${flyway:defaultSchema}.Interaction (ID),
    CONSTRAINT FK_InteractionLink_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity (ID),
    CONSTRAINT UQ_InteractionLink UNIQUE (InteractionID, EntityID, RecordID, [Role]),
    CONSTRAINT CK_InteractionLink_Role
        CHECK ([Role] IN ('Caller', 'Regarding', 'Created'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Polymorphic link from an Interaction to any record in any entity, with the role that record played. Modelled like TaggedItem: EntityID plus RecordID identify the target without a foreign key to it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionLink';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The entity (table) of the linked record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionLink', @level2type = N'COLUMN', @level2name = N'EntityID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The primary key of the linked record, as text. For composite keys use the standard MJ concatenated key format. Sized to 450 characters, matching TaggedItem.RecordID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionLink', @level2type = N'COLUMN', @level2name = N'RecordID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'What part the linked record played: Caller (the person or organization on the other end), Regarding (what the conversation was about, such as a case or order), or Created (a record produced during the conversation, such as a ticket or follow-up task).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionLink', @level2type = N'COLUMN', @level2name = N'Role';
























































-- =====================================================================================
-- =====================================================================================
-- ==  EVERYTHING BELOW THIS BANNER IS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL    ==
-- ==  (Entity + EntityField + EntityRelationship rows, base views, spCreate / spUpdate ==
-- ==  / spDelete procedures, permission grants, extended properties).                  ==
-- ==  DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen and   ==
-- ==  replace this section wholesale.                                                  ==
-- ==                                                                                   ==
-- ==  CODEGEN OUTPUT TO BE APPENDED LOCALLY                                            ==
-- ==  The owner applies this migration and runs CodeGen against a dedicated database,  ==
-- ==  then pastes the CodeGen_Run_*.sql capture here. EntityField INSERTs in the       ==
-- ==  capture must use the apply-time MAX(Sequence)+1 expression, never a literal      ==
-- ==  (run: node .github/scripts/check-migration-entityfield-sequence.mjs).            ==
-- =====================================================================================
-- =====================================================================================
