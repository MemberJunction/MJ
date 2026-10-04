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
   This migration adds exactly that, as eight new tables in the core schema:

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
     InteractionOffer  — a durable offer to a person to take over a live
                         Interaction (warm or blind hand-off), so any server
                         instance can list, accept or decline it.
     Meeting           — a Zoom-style meeting in a LiveKit room inside MJ
                         Explorer: ad hoc or scheduled, optional phone dial-in,
                         recording policy, transcript Conversation.
     MeetingParticipant— an invited or present user, AI agent or external guest.

   Creation order matters: NumberPool, then PhoneNumber (FK to NumberPool), then
   Interaction (FKs to PhoneNumber / AIAgentSession), then its three child tables,
   then Meeting (FKs to PhoneNumber / Conversation) and MeetingParticipant.

   Purely additive: eight new tables and one nullable column on the shipped
   AIAgentSessionBridge table (TurnAddressing). The contact-center
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
        CHECK (EventType IN ('Created', 'Queued', 'Offered', 'Accepted', 'Declined', 'Answered', 'Transferred', 'Escalated', 'Held', 'Resumed', 'RecordingStarted', 'RecordingStopped', 'Ended', 'Abandoned'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Append-only lifecycle log of an Interaction: each routing decision, hand-off and state change, stamped with when it happened and who or what caused it. Rows are never edited; corrections are new events.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionEvent';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'What happened: Created, Queued (placed in a queue), Offered (offered to a handler), Accepted or Declined (handler response to an offer), Answered (parties connected), Transferred (moved to another handler), Escalated (raised to a human or higher tier), Held, Resumed, RecordingStarted or RecordingStopped (recording consent was announced to every party), Ended, or Abandoned (remote party left before an answer).',
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


-- ============================================================================
-- 6. InteractionOffer  ("MJ: Interaction Offers")
--    An offer to a person to take over (or join) a live Interaction. Durable so
--    that any MJAPI instance can list, accept or decline it, and so expiries and
--    responses are auditable. The live push still goes over the GraphQL
--    subscription; this table is the source of truth.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.InteractionOffer (
    ID                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InteractionID     UNIQUEIDENTIFIER NOT NULL,
    TargetUserID      UNIQUEIDENTIFIER NOT NULL,
    OfferedByAgentID  UNIQUEIDENTIFIER NULL,
    Mode              NVARCHAR(20)     NOT NULL,
    Status            NVARCHAR(20)     NOT NULL CONSTRAINT DF_InteractionOffer_Status DEFAULT ('Pending'),
    RoomName          NVARCHAR(255)    NOT NULL,
    CallerLabel       NVARCHAR(255)    NULL,
    Summary           NVARCHAR(MAX)    NULL,
    OfferedAt         DATETIMEOFFSET   NOT NULL CONSTRAINT DF_InteractionOffer_OfferedAt DEFAULT (sysdatetimeoffset()),
    ExpiresAt         DATETIMEOFFSET   NOT NULL,
    RespondedAt       DATETIMEOFFSET   NULL,
    CONSTRAINT PK_InteractionOffer PRIMARY KEY (ID),
    CONSTRAINT FK_InteractionOffer_Interaction FOREIGN KEY (InteractionID)
        REFERENCES ${flyway:defaultSchema}.Interaction (ID),
    CONSTRAINT FK_InteractionOffer_TargetUser FOREIGN KEY (TargetUserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT FK_InteractionOffer_OfferedByAgent FOREIGN KEY (OfferedByAgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID),
    CONSTRAINT CK_InteractionOffer_Mode
        CHECK (Mode IN ('Warm', 'Blind')),
    CONSTRAINT CK_InteractionOffer_Status
        CHECK (Status IN ('Pending', 'Accepted', 'Declined', 'Expired', 'Cancelled')),
    CONSTRAINT CK_InteractionOffer_ExpiresAfterOffered
        CHECK (ExpiresAt > OfferedAt),
    CONSTRAINT CK_InteractionOffer_RespondedAfterOffered
        CHECK (RespondedAt IS NULL OR RespondedAt >= OfferedAt)
);
GO

CREATE UNIQUE INDEX UX_InteractionOffer_OneAccepted
    ON ${flyway:defaultSchema}.InteractionOffer (InteractionID)
    WHERE Status = 'Accepted';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'An offer to a specific person to take over or join a live Interaction (a warm or blind hand-off from an AI agent). Durable so any server instance can list, accept or decline it and so every response or expiry is auditable. Only the target user may accept or decline.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The Interaction being handed off.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'InteractionID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The person the offer is for. Only this user may accept or decline it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'TargetUserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The AI agent that made the offer, when an agent made it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'OfferedByAgentID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Warm (the agent stays and introduces the person before leaving) or Blind (the agent leaves as soon as the person joins).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'Mode';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Pending (awaiting a response), Accepted, Declined, Expired (no response before ExpiresAt), or Cancelled (the conversation ended or the offer was withdrawn first).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The LiveKit room the person joins on accepting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'RoomName';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A short label for who is on the other end, shown on the offer (for example a masked number or a known name). Never a full phone number.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'CallerLabel';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The agent''s brief for the person: why the conversation is being handed over and what has happened so far.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'Summary';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the offer was made.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'OfferedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When an unanswered offer lapses. A Pending offer past this time is treated as Expired.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'ExpiresAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the offer left Pending (accepted, declined, expired or cancelled).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InteractionOffer', @level2type = N'COLUMN', @level2name = N'RespondedAt';


-- ============================================================================
-- 7. Meeting  ("MJ: Meetings")
--    A Zoom-style meeting held in a LiveKit room inside MJ Explorer: ad hoc or
--    scheduled, optionally with phone dial-in and AI agents as participants.
--    The transcript lives in the linked MJ Conversation (Type 'Meeting Room').
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.Meeting (
    ID                    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Title                 NVARCHAR(255)    NOT NULL,
    Description           NVARCHAR(MAX)    NULL,
    HostUserID            UNIQUEIDENTIFIER NOT NULL,
    RoomName              NVARCHAR(255)    NOT NULL,
    Status                NVARCHAR(20)     NOT NULL CONSTRAINT DF_Meeting_Status DEFAULT ('Scheduled'),
    ScheduledStartAt      DATETIMEOFFSET   NULL,
    ScheduledEndAt        DATETIMEOFFSET   NULL,
    StartedAt             DATETIMEOFFSET   NULL,
    EndedAt               DATETIMEOFFSET   NULL,
    AllowPhoneDialIn      BIT              NOT NULL CONSTRAINT DF_Meeting_AllowPhoneDialIn DEFAULT (0),
    DialInPhoneNumberID   UNIQUEIDENTIFIER NULL,
    DialInCode            NVARCHAR(20)     NULL,
    RecordingPolicy       NVARCHAR(20)     NOT NULL CONSTRAINT DF_Meeting_RecordingPolicy DEFAULT ('Off'),
    ConversationID        UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_Meeting PRIMARY KEY (ID),
    CONSTRAINT UQ_Meeting_RoomName UNIQUE (RoomName),
    CONSTRAINT FK_Meeting_HostUser FOREIGN KEY (HostUserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT FK_Meeting_DialInPhoneNumber FOREIGN KEY (DialInPhoneNumberID)
        REFERENCES ${flyway:defaultSchema}.PhoneNumber (ID),
    CONSTRAINT FK_Meeting_Conversation FOREIGN KEY (ConversationID)
        REFERENCES ${flyway:defaultSchema}.Conversation (ID),
    CONSTRAINT CK_Meeting_Status
        CHECK (Status IN ('Scheduled', 'Live', 'Ended', 'Cancelled')),
    CONSTRAINT CK_Meeting_RecordingPolicy
        CHECK (RecordingPolicy IN ('Off', 'Allowed', 'Automatic')),
    CONSTRAINT CK_Meeting_ScheduledEndAfterStart
        CHECK (ScheduledEndAt IS NULL OR (ScheduledStartAt IS NOT NULL AND ScheduledEndAt > ScheduledStartAt)),
    CONSTRAINT CK_Meeting_EndedAfterStarted
        CHECK (EndedAt IS NULL OR (StartedAt IS NOT NULL AND EndedAt >= StartedAt)),
    CONSTRAINT CK_Meeting_DialInConfigured
        CHECK (AllowPhoneDialIn = 0 OR (DialInPhoneNumberID IS NOT NULL AND DialInCode IS NOT NULL)),
    CONSTRAINT CK_Meeting_DialInCodeDigits
        CHECK (DialInCode IS NULL OR (DialInCode NOT LIKE '%[^0-9]%' AND LEN(DialInCode) BETWEEN 6 AND 20))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A Zoom-style meeting held in a LiveKit room inside MJ Explorer. Ad hoc (no schedule) or scheduled; people join from the browser, by phone when dial-in is enabled, and AI agents can take part. The transcript is kept in the linked Conversation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The meeting title shown to participants and in invitations.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'Title';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional agenda or description.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The user who owns the meeting. The host can start and end it, admit participants and change its settings.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'HostUserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The LiveKit room the meeting runs in. Unique, and unguessable (generated, never user-chosen), because room names are also join handles.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'RoomName';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Scheduled (not yet started), Live (in progress), Ended, or Cancelled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Planned start time. NULL for an ad hoc meeting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'ScheduledStartAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Planned end time. Requires ScheduledStartAt and must be after it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'ScheduledEndAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the meeting actually started (first participant joined).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'StartedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the meeting actually ended.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'EndedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether people may join by phone. When on, DialInPhoneNumberID and DialInCode are required.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'AllowPhoneDialIn';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The phone number callers dial to reach the meeting. Several meetings may share one number; the DialInCode picks the meeting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'DialInPhoneNumberID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Digits a phone caller enters to join this meeting (6 to 20 digits). A meeting join code shown on invitations, not an account credential; generate it randomly and never reuse one across live meetings on the same number.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'DialInCode';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Off (never recorded), Allowed (the host may start a recording, which is announced to everyone), or Automatic (recording starts with the meeting and is announced to everyone).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'RecordingPolicy';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The Conversation (Type ''Meeting Room'') that holds the meeting transcript and any recording file.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'ConversationID';


-- ============================================================================
-- 8. MeetingParticipant  ("MJ: Meeting Participants")
--    Who is invited to, or took part in, a Meeting: an MJ user, an AI agent,
--    or an external guest identified by email and/or phone.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.MeetingParticipant (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MeetingID       UNIQUEIDENTIFIER NOT NULL,
    UserID          UNIQUEIDENTIFIER NULL,
    AgentID         UNIQUEIDENTIFIER NULL,
    ExternalName    NVARCHAR(255)    NULL,
    ExternalEmail   NVARCHAR(255)    NULL,
    ExternalPhone   NVARCHAR(20)     NULL,
    [Role]          NVARCHAR(20)     NOT NULL CONSTRAINT DF_MeetingParticipant_Role DEFAULT ('Attendee'),
    InviteStatus    NVARCHAR(20)     NOT NULL CONSTRAINT DF_MeetingParticipant_InviteStatus DEFAULT ('Invited'),
    JoinedAt        DATETIMEOFFSET   NULL,
    LeftAt          DATETIMEOFFSET   NULL,
    CONSTRAINT PK_MeetingParticipant PRIMARY KEY (ID),
    CONSTRAINT FK_MeetingParticipant_Meeting FOREIGN KEY (MeetingID)
        REFERENCES ${flyway:defaultSchema}.Meeting (ID),
    CONSTRAINT FK_MeetingParticipant_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT FK_MeetingParticipant_Agent FOREIGN KEY (AgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID),
    CONSTRAINT CK_MeetingParticipant_ExactlyOneKind
        CHECK ((CASE WHEN UserID IS NOT NULL THEN 1 ELSE 0 END)
             + (CASE WHEN AgentID IS NOT NULL THEN 1 ELSE 0 END)
             + (CASE WHEN ExternalEmail IS NOT NULL OR ExternalPhone IS NOT NULL THEN 1 ELSE 0 END) = 1),
    CONSTRAINT CK_MeetingParticipant_AgentRole
        CHECK ((AgentID IS NULL AND [Role] <> 'Agent') OR (AgentID IS NOT NULL AND [Role] = 'Agent')),
    CONSTRAINT CK_MeetingParticipant_ExternalPhoneE164
        CHECK (ExternalPhone IS NULL OR (ExternalPhone LIKE '+[1-9]%' AND ExternalPhone NOT LIKE '+%[^0-9]%' AND LEN(ExternalPhone) BETWEEN 5 AND 16)),
    CONSTRAINT CK_MeetingParticipant_Role
        CHECK ([Role] IN ('Host', 'CoHost', 'Attendee', 'Agent')),
    CONSTRAINT CK_MeetingParticipant_InviteStatus
        CHECK (InviteStatus IN ('Invited', 'Accepted', 'Declined', 'Tentative')),
    CONSTRAINT CK_MeetingParticipant_LeftAfterJoined
        CHECK (LeftAt IS NULL OR (JoinedAt IS NOT NULL AND LeftAt >= JoinedAt))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A person or AI agent invited to, or present in, a Meeting. Exactly one of: an MJ user (UserID), an AI agent (AgentID, Role Agent), or an external guest (ExternalEmail and/or ExternalPhone).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The meeting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'MeetingID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The MJ user, when the participant is a user.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'UserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The AI agent, when the participant is an agent. Requires Role Agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'AgentID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display name for an external guest.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'ExternalName';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Email address an external guest is invited at.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'ExternalEmail';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'E.164 phone number an external guest is dialed at or joins from.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'ExternalPhone';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Host, CoHost (same controls as the host), Attendee, or Agent (an AI agent participant).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'Role';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The response to the invitation: Invited (no response yet), Accepted, Declined, or Tentative.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'InviteStatus';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the participant most recently joined the meeting room.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'JoinedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the participant most recently left the meeting room.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MeetingParticipant', @level2type = N'COLUMN', @level2name = N'LeftAt';


-- ============================================================================
-- 9. AIAgentSessionBridge.TurnAddressing  (existing table, one new column)
--    Records how a bridged agent decided it was being addressed, next to the
--    TurnMode the table already stores. NULL for rows written before this
--    column existed, and for sessions that never chose a mode.
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgentSessionBridge ADD
    TurnAddressing NVARCHAR(20) NULL
        CONSTRAINT CK_AIAgentSessionBridge_TurnAddressing
        CHECK (TurnAddressing IS NULL OR TurnAddressing IN ('Auto', 'ModelSide', 'Regex'));
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'How the agent decided speech was addressed to it: Auto (the model''s own judgement when it is full-duplex, name matching otherwise), ModelSide (the model''s own judgement), or Regex (matching the agent''s names). NULL when not recorded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSessionBridge', @level2type = N'COLUMN', @level2name = N'TurnAddressing';
























































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

/* SQL generated to create new entity MJ: Number Pools */

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
         '59be3eba-3c9a-41d1-b725-a1ca92e0411c',
         'MJ: Number Pools',
         'Number Pools',
         'A named group of phone numbers used together for outbound calling, with a rule for which number is chosen as the caller ID on each call. Inbound routing does not use pools.',
         NULL,
         'NumberPool',
         'vwNumberPools',
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

/* SQL generated to add new entity MJ: Number Pools to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '59be3eba-3c9a-41d1-b725-a1ca92e0411c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Number Pools for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Number Pools for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Number Pools for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Phone Numbers */

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
         '8d7a7bd5-95e8-428c-874a-3829bad6685e',
         'MJ: Phone Numbers',
         'Phone Numbers',
         'A telephone number owned or leased through a telephony bridge provider. The inventory record the contact center selects from for outbound caller ID and routes inbound calls against.',
         NULL,
         'PhoneNumber',
         'vwPhoneNumbers',
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

/* SQL generated to add new entity MJ: Phone Numbers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8d7a7bd5-95e8-428c-874a-3829bad6685e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Phone Numbers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Phone Numbers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Phone Numbers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Interactions */

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
         '4a355a56-eae0-47d9-84cd-ce2bb49160db',
         'MJ: Interactions',
         'Interactions',
         'One live conversation on any channel (phone call, web widget chat/voice, or meeting). The durable business record above the realtime agent session: what queues display, reports count, and CRM records link to. Its lifecycle is logged in InteractionEvent and its subject records are attached through InteractionLink.',
         NULL,
         'Interaction',
         'vwInteractions',
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

/* SQL generated to add new entity MJ: Interactions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4a355a56-eae0-47d9-84cd-ce2bb49160db', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Interactions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Interactions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Interactions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Interaction Events */

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
         '57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3',
         'MJ: Interaction Events',
         'Interaction Events',
         'Append-only lifecycle log of an Interaction: each routing decision, hand-off and state change, stamped with when it happened and who or what caused it. Rows are never edited; corrections are new events.',
         NULL,
         'InteractionEvent',
         'vwInteractionEvents',
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

/* SQL generated to add new entity MJ: Interaction Events to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Interaction Events for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Interaction Events for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Interaction Events for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Interaction Links */

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
         '5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a',
         'MJ: Interaction Links',
         'Interaction Links',
         'Polymorphic link from an Interaction to any record in any entity, with the role that record played. Modelled like TaggedItem: EntityID plus RecordID identify the target without a foreign key to it.',
         NULL,
         'InteractionLink',
         'vwInteractionLinks',
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

/* SQL generated to add new entity MJ: Interaction Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Interaction Links for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Interaction Links for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Interaction Links for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Interaction Offers */

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
         '6dc12139-38a1-43c6-85ee-8066450e762b',
         'MJ: Interaction Offers',
         'Interaction Offers',
         'An offer to a specific person to take over or join a live Interaction (a warm or blind hand-off from an AI agent). Durable so any server instance can list, accept or decline it and so every response or expiry is auditable. Only the target user may accept or decline.',
         NULL,
         'InteractionOffer',
         'vwInteractionOffers',
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

/* SQL generated to add new entity MJ: Interaction Offers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '6dc12139-38a1-43c6-85ee-8066450e762b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Interaction Offers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Interaction Offers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Interaction Offers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Meetings */

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
         'd2a67d87-f495-43e3-a91b-5a46e5553c31',
         'MJ: Meetings',
         'Meetings',
         'A Zoom-style meeting held in a LiveKit room inside MJ Explorer. Ad hoc (no schedule) or scheduled; people join from the browser, by phone when dial-in is enabled, and AI agents can take part. The transcript is kept in the linked Conversation.',
         NULL,
         'Meeting',
         'vwMeetings',
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

/* SQL generated to add new entity MJ: Meetings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd2a67d87-f495-43e3-a91b-5a46e5553c31', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Meetings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Meetings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Meetings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Meeting Participants */

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
         'db511323-5673-45f9-a47f-5a4604fb19b0',
         'MJ: Meeting Participants',
         'Meeting Participants',
         'A person or AI agent invited to, or present in, a Meeting. Exactly one of: an MJ user (UserID), an AI agent (AgentID, Role Agent), or an external guest (ExternalEmail and/or ExternalPhone).',
         NULL,
         'MeetingParticipant',
         'vwMeetingParticipants',
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

/* SQL generated to add new entity MJ: Meeting Participants to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'db511323-5673-45f9-a47f-5a4604fb19b0', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Meeting Participants for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Meeting Participants for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Meeting Participants for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionEvent */
ALTER TABLE [${flyway:defaultSchema}].[InteractionEvent] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionEvent */
UPDATE [${flyway:defaultSchema}].[InteractionEvent] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionEvent */
ALTER TABLE [${flyway:defaultSchema}].[InteractionEvent] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionEvent */
ALTER TABLE [${flyway:defaultSchema}].[InteractionEvent] ADD CONSTRAINT [DF___mj_InteractionEvent___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionEvent */
ALTER TABLE [${flyway:defaultSchema}].[InteractionEvent] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionEvent */
UPDATE [${flyway:defaultSchema}].[InteractionEvent] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionEvent */
ALTER TABLE [${flyway:defaultSchema}].[InteractionEvent] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionEvent */
ALTER TABLE [${flyway:defaultSchema}].[InteractionEvent] ADD CONSTRAINT [DF___mj_InteractionEvent___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PhoneNumber */
ALTER TABLE [${flyway:defaultSchema}].[PhoneNumber] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PhoneNumber */
UPDATE [${flyway:defaultSchema}].[PhoneNumber] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PhoneNumber */
ALTER TABLE [${flyway:defaultSchema}].[PhoneNumber] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PhoneNumber */
ALTER TABLE [${flyway:defaultSchema}].[PhoneNumber] ADD CONSTRAINT [DF___mj_PhoneNumber___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PhoneNumber */
ALTER TABLE [${flyway:defaultSchema}].[PhoneNumber] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PhoneNumber */
UPDATE [${flyway:defaultSchema}].[PhoneNumber] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PhoneNumber */
ALTER TABLE [${flyway:defaultSchema}].[PhoneNumber] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PhoneNumber */
ALTER TABLE [${flyway:defaultSchema}].[PhoneNumber] ADD CONSTRAINT [DF___mj_PhoneNumber___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionLink */
ALTER TABLE [${flyway:defaultSchema}].[InteractionLink] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionLink */
UPDATE [${flyway:defaultSchema}].[InteractionLink] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionLink */
ALTER TABLE [${flyway:defaultSchema}].[InteractionLink] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionLink */
ALTER TABLE [${flyway:defaultSchema}].[InteractionLink] ADD CONSTRAINT [DF___mj_InteractionLink___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionLink */
ALTER TABLE [${flyway:defaultSchema}].[InteractionLink] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionLink */
UPDATE [${flyway:defaultSchema}].[InteractionLink] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionLink */
ALTER TABLE [${flyway:defaultSchema}].[InteractionLink] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionLink */
ALTER TABLE [${flyway:defaultSchema}].[InteractionLink] ADD CONSTRAINT [DF___mj_InteractionLink___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MeetingParticipant */
ALTER TABLE [${flyway:defaultSchema}].[MeetingParticipant] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MeetingParticipant */
UPDATE [${flyway:defaultSchema}].[MeetingParticipant] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MeetingParticipant */
ALTER TABLE [${flyway:defaultSchema}].[MeetingParticipant] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MeetingParticipant */
ALTER TABLE [${flyway:defaultSchema}].[MeetingParticipant] ADD CONSTRAINT [DF___mj_MeetingParticipant___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MeetingParticipant */
ALTER TABLE [${flyway:defaultSchema}].[MeetingParticipant] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MeetingParticipant */
UPDATE [${flyway:defaultSchema}].[MeetingParticipant] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MeetingParticipant */
ALTER TABLE [${flyway:defaultSchema}].[MeetingParticipant] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MeetingParticipant */
ALTER TABLE [${flyway:defaultSchema}].[MeetingParticipant] ADD CONSTRAINT [DF___mj_MeetingParticipant___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Meeting */
ALTER TABLE [${flyway:defaultSchema}].[Meeting] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Meeting */
UPDATE [${flyway:defaultSchema}].[Meeting] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Meeting */
ALTER TABLE [${flyway:defaultSchema}].[Meeting] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Meeting */
ALTER TABLE [${flyway:defaultSchema}].[Meeting] ADD CONSTRAINT [DF___mj_Meeting___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Meeting */
ALTER TABLE [${flyway:defaultSchema}].[Meeting] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Meeting */
UPDATE [${flyway:defaultSchema}].[Meeting] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Meeting */
ALTER TABLE [${flyway:defaultSchema}].[Meeting] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Meeting */
ALTER TABLE [${flyway:defaultSchema}].[Meeting] ADD CONSTRAINT [DF___mj_Meeting___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionOffer */
ALTER TABLE [${flyway:defaultSchema}].[InteractionOffer] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionOffer */
UPDATE [${flyway:defaultSchema}].[InteractionOffer] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionOffer */
ALTER TABLE [${flyway:defaultSchema}].[InteractionOffer] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InteractionOffer */
ALTER TABLE [${flyway:defaultSchema}].[InteractionOffer] ADD CONSTRAINT [DF___mj_InteractionOffer___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionOffer */
ALTER TABLE [${flyway:defaultSchema}].[InteractionOffer] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionOffer */
UPDATE [${flyway:defaultSchema}].[InteractionOffer] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionOffer */
ALTER TABLE [${flyway:defaultSchema}].[InteractionOffer] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InteractionOffer */
ALTER TABLE [${flyway:defaultSchema}].[InteractionOffer] ADD CONSTRAINT [DF___mj_InteractionOffer___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.NumberPool */
ALTER TABLE [${flyway:defaultSchema}].[NumberPool] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.NumberPool */
UPDATE [${flyway:defaultSchema}].[NumberPool] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.NumberPool */
ALTER TABLE [${flyway:defaultSchema}].[NumberPool] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.NumberPool */
ALTER TABLE [${flyway:defaultSchema}].[NumberPool] ADD CONSTRAINT [DF___mj_NumberPool___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.NumberPool */
ALTER TABLE [${flyway:defaultSchema}].[NumberPool] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.NumberPool */
UPDATE [${flyway:defaultSchema}].[NumberPool] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.NumberPool */
ALTER TABLE [${flyway:defaultSchema}].[NumberPool] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.NumberPool */
ALTER TABLE [${flyway:defaultSchema}].[NumberPool] ADD CONSTRAINT [DF___mj_NumberPool___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Interaction */
ALTER TABLE [${flyway:defaultSchema}].[Interaction] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Interaction */
UPDATE [${flyway:defaultSchema}].[Interaction] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Interaction */
ALTER TABLE [${flyway:defaultSchema}].[Interaction] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Interaction */
ALTER TABLE [${flyway:defaultSchema}].[Interaction] ADD CONSTRAINT [DF___mj_Interaction___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Interaction */
ALTER TABLE [${flyway:defaultSchema}].[Interaction] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Interaction */
UPDATE [${flyway:defaultSchema}].[Interaction] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Interaction */
ALTER TABLE [${flyway:defaultSchema}].[Interaction] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Interaction */
ALTER TABLE [${flyway:defaultSchema}].[Interaction] ADD CONSTRAINT [DF___mj_Interaction___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 95 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4b554e4-a81b-4856-8219-b383d6026759' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = 'ID')) BEGIN
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
            'd4b554e4-a81b-4856-8219-b383d6026759',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4bedf078-b1b1-4e35-a9e0-cd88952d1acb' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = 'InteractionID')) BEGIN
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
            '4bedf078-b1b1-4e35-a9e0-cd88952d1acb',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
            'InteractionID',
            'Interaction ID',
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
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0278f57-7911-448c-91d3-ce8f34ce03f1' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = 'EventType')) BEGIN
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
            'c0278f57-7911-448c-91d3-ce8f34ce03f1',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
            'EventType',
            'Event Type',
            'What happened: Created, Queued (placed in a queue), Offered (offered to a handler), Accepted or Declined (handler response to an offer), Answered (parties connected), Transferred (moved to another handler), Escalated (raised to a human or higher tier), Held, Resumed, RecordingStarted or RecordingStopped (recording consent was announced to every party), Ended, or Abandoned (remote party left before an answer).',
            'nvarchar',
            40,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd93cda9d-e87e-4744-8844-e124aff94169' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = 'OccurredAt')) BEGIN
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
            'd93cda9d-e87e-4744-8844-e124aff94169',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
            'OccurredAt',
            'Occurred At',
            'When the event occurred. Defaults to the current time; set explicitly when recording an event reported later by a carrier webhook.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd207912-2d3c-4800-8c37-179db85ab4a9' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = 'ActorUserID')) BEGIN
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
            'bd207912-2d3c-4800-8c37-179db85ab4a9',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
            'ActorUserID',
            'Actor User ID',
            'The human user who caused the event (accepted an offer, transferred, ended the call). NULL when the actor was an agent or the system.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb4b0e76-a6d2-49c1-9cc1-41f548cad78d' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = 'ActorAgentID')) BEGIN
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
            'cb4b0e76-a6d2-49c1-9cc1-41f548cad78d',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
            'ActorAgentID',
            'Actor Agent ID',
            'The AI agent that caused the event (answered, escalated, transferred). NULL when the actor was a human user or the system.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd05086c-c0ce-403a-8939-e77468d908be' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = 'Details')) BEGIN
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
            'fd05086c-c0ce-403a-8939-e77468d908be',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
            'Details',
            'Details',
            'Optional event-specific JSON detail (for example the transfer target, escalation reason, or queue name). Shape depends on EventType.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34068729-3004-4212-ae09-7236f89e045e' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = '__mj_CreatedAt')) BEGIN
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
            '34068729-3004-4212-ae09-7236f89e045e',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16b0d3b4-26c3-444a-b617-66dad6fa6058' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '16b0d3b4-26c3-444a-b617-66dad6fa6058',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d87c35d-628d-405f-92bf-ea5442c5c425' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'ID')) BEGIN
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
            '2d87c35d-628d-405f-92bf-ea5442c5c425',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b41c1dd-758f-47d3-a3ba-c368b166b8f3' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'Number')) BEGIN
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
            '3b41c1dd-758f-47d3-a3ba-c368b166b8f3',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
            'Number',
            'Number',
            'The number in E.164 format: a leading plus sign, a country code, and digits only, with no spaces or punctuation (e.g. +14155550123). Globally unique.',
            'nvarchar',
            40,
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fc8f97f-3a59-4053-9c3c-4ad7f19ff6b5' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'ProviderID')) BEGIN
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
            '2fc8f97f-3a59-4053-9c3c-4ad7f19ff6b5',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
            'ProviderID',
            'Provider ID',
            'The telephony bridge provider (carrier / CPaaS account such as Twilio or Vonage) through which this number is owned and through which its calls are placed and received.',
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
            '840A51D1-7436-45F9-9176-31E1FE785635',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7b398e84-9f18-4157-afa1-8fd3756e42cd' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'Capabilities')) BEGIN
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
            '7b398e84-9f18-4157-afa1-8fd3756e42cd',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
            'Capabilities',
            'Capabilities',
            'What the number can do: Voice (calls only) or VoiceAndSMS (calls and text messages).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Voice',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fec2316-9558-4db7-9e87-97c84b742404' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'Status')) BEGIN
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
            '2fec2316-9558-4db7-9e87-97c84b742404',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
            'Status',
            'Status',
            'Lifecycle state of the number: Active (usable), Inactive (retained but not used for new calls), or Porting (being transferred to or from another carrier and not yet usable).',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ffad7d30-f020-4ee9-9452-c283032f833a' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'NumberPoolID')) BEGIN
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
            'ffad7d30-f020-4ee9-9452-c283032f833a',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
            'NumberPoolID',
            'Number Pool ID',
            'Optional number pool this number belongs to for outbound caller-ID selection. NULL when the number is not pooled (for example a dedicated inbound line).',
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
            '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f066bb7c-c684-4327-baaa-e82a7f028ff5' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'Label')) BEGIN
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
            'f066bb7c-c684-4327-baaa-e82a7f028ff5',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
            'Label',
            'Label',
            'Short human-readable label shown in the UI (e.g. Main Support Line, Sales West).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39dbfc58-6334-4131-9552-3573d34cb88a' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'Description')) BEGIN
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
            '39dbfc58-6334-4131-9552-3573d34cb88a',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
            'Description',
            'Description',
            'Optional longer description of the number and how it is used.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69676e28-47fb-41b0-a0cd-5125abd2da76' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = '__mj_CreatedAt')) BEGIN
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
            '69676e28-47fb-41b0-a0cd-5125abd2da76',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb592e30-5b27-4c8c-93ae-53c04b45bb48' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'fb592e30-5b27-4c8c-93ae-53c04b45bb48',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7372acce-16a0-4ade-9c75-72a512197f5a' OR (EntityID = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND Name = 'ID')) BEGIN
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
            '7372acce-16a0-4ade-9c75-72a512197f5a',
            '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', -- Entity: MJ: Interaction Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '55297f30-9b4c-470c-a13f-1e0d8ae43866' OR (EntityID = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND Name = 'InteractionID')) BEGIN
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
            '55297f30-9b4c-470c-a13f-1e0d8ae43866',
            '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', -- Entity: MJ: Interaction Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'),
            'InteractionID',
            'Interaction ID',
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
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ce1ede7-ae95-476e-b7c3-12406f9f6f3a' OR (EntityID = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND Name = 'EntityID')) BEGIN
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
            '3ce1ede7-ae95-476e-b7c3-12406f9f6f3a',
            '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', -- Entity: MJ: Interaction Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'),
            'EntityID',
            'Entity ID',
            'The entity (table) of the linked record.',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dfc97246-0832-42dd-b3aa-8c61221c463e' OR (EntityID = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND Name = 'RecordID')) BEGIN
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
            'dfc97246-0832-42dd-b3aa-8c61221c463e',
            '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', -- Entity: MJ: Interaction Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'),
            'RecordID',
            'Record ID',
            'The primary key of the linked record, as text. For composite keys use the standard MJ concatenated key format. Sized to 450 characters, matching TaggedItem.RecordID.',
            'nvarchar',
            900,
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20988255-327a-46ee-aaba-60b8df1ac2a4' OR (EntityID = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND Name = 'Role')) BEGIN
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
            '20988255-327a-46ee-aaba-60b8df1ac2a4',
            '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', -- Entity: MJ: Interaction Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'),
            'Role',
            'Role',
            'What part the linked record played: Caller (the person or organization on the other end), Regarding (what the conversation was about, such as a case or order), or Created (a record produced during the conversation, such as a ticket or follow-up task).',
            'nvarchar',
            40,
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1293d1da-9692-4400-84ca-de8717f1be10' OR (EntityID = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND Name = '__mj_CreatedAt')) BEGIN
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
            '1293d1da-9692-4400-84ca-de8717f1be10',
            '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', -- Entity: MJ: Interaction Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '60b609a0-fdf7-4a6b-96a3-3b78cb083d02' OR (EntityID = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '60b609a0-fdf7-4a6b-96a3-3b78cb083d02',
            '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', -- Entity: MJ: Interaction Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e2361941-23ea-466a-9360-e8c980ebfacc' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'ID')) BEGIN
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
            'e2361941-23ea-466a-9360-e8c980ebfacc',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15040ace-8782-426c-b2c1-62117e45913d' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'MeetingID')) BEGIN
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
            '15040ace-8782-426c-b2c1-62117e45913d',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'MeetingID',
            'Meeting ID',
            'The meeting.',
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
            'D2A67D87-F495-43E3-A91B-5A46E5553C31',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b55b3d09-0a92-48b5-8654-f8ce7ca2101f' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'UserID')) BEGIN
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
            'b55b3d09-0a92-48b5-8654-f8ce7ca2101f',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'UserID',
            'User ID',
            'The MJ user, when the participant is a user.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c366bdb-25b2-4783-b1d6-444628aed556' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'AgentID')) BEGIN
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
            '2c366bdb-25b2-4783-b1d6-444628aed556',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'AgentID',
            'Agent ID',
            'The AI agent, when the participant is an agent. Requires Role Agent.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ccbc94bb-3dd7-42bb-9af4-1e4f26851015' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'ExternalName')) BEGIN
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
            'ccbc94bb-3dd7-42bb-9af4-1e4f26851015',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'ExternalName',
            'External Name',
            'Display name for an external guest.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '717ea04c-c814-47e8-9f02-44a95fe336e7' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'ExternalEmail')) BEGIN
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
            '717ea04c-c814-47e8-9f02-44a95fe336e7',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'ExternalEmail',
            'External Email',
            'Email address an external guest is invited at.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97f9d011-24b7-4775-8305-0eff11cb4fd9' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'ExternalPhone')) BEGIN
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
            '97f9d011-24b7-4775-8305-0eff11cb4fd9',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'ExternalPhone',
            'External Phone',
            'E.164 phone number an external guest is dialed at or joins from.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1627e4df-796a-4e73-ba99-fc9fbe9f1981' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'Role')) BEGIN
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
            '1627e4df-796a-4e73-ba99-fc9fbe9f1981',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'Role',
            'Role',
            'Host, CoHost (same controls as the host), Attendee, or Agent (an AI agent participant).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Attendee',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a872147-e34e-44c7-be8b-b8584a12a22c' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'InviteStatus')) BEGIN
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
            '4a872147-e34e-44c7-be8b-b8584a12a22c',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'InviteStatus',
            'Invite Status',
            'The response to the invitation: Invited (no response yet), Accepted, Declined, or Tentative.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Invited',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c3587eb5-7cec-4751-a7b1-7c485c1dbc1a' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'JoinedAt')) BEGIN
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
            'c3587eb5-7cec-4751-a7b1-7c485c1dbc1a',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'JoinedAt',
            'Joined At',
            'When the participant most recently joined the meeting room.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a76ba73-9777-4ee1-83fd-6ecfcd56e8dd' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'LeftAt')) BEGIN
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
            '4a76ba73-9777-4ee1-83fd-6ecfcd56e8dd',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'LeftAt',
            'Left At',
            'When the participant most recently left the meeting room.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7b08be5b-88b7-4763-847c-d2fe09533cff' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = '__mj_CreatedAt')) BEGIN
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
            '7b08be5b-88b7-4763-847c-d2fe09533cff',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bca8f13-2716-42e4-b1ef-19645a05a774' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3bca8f13-2716-42e4-b1ef-19645a05a774',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '875f94a4-ec81-4464-9715-bc8aec15a677' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'ID')) BEGIN
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
            '875f94a4-ec81-4464-9715-bc8aec15a677',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39f217d9-1541-4164-b739-da850f044aa4' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'Title')) BEGIN
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
            '39f217d9-1541-4164-b739-da850f044aa4',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'Title',
            'Title',
            'The meeting title shown to participants and in invitations.',
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
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a2c1e9b-6c83-4803-a5ea-639ed7689a71' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'Description')) BEGIN
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
            '5a2c1e9b-6c83-4803-a5ea-639ed7689a71',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'Description',
            'Description',
            'Optional agenda or description.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8c2f7c9-6de0-4741-8f19-81ecd08a2b6e' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'HostUserID')) BEGIN
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
            'b8c2f7c9-6de0-4741-8f19-81ecd08a2b6e',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'HostUserID',
            'Host User ID',
            'The user who owns the meeting. The host can start and end it, admit participants and change its settings.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d05dcdd-ac68-49d7-a0e9-a3701f2f1912' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'RoomName')) BEGIN
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
            '1d05dcdd-ac68-49d7-a0e9-a3701f2f1912',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'RoomName',
            'Room Name',
            'The LiveKit room the meeting runs in. Unique, and unguessable (generated, never user-chosen), because room names are also join handles.',
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
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e62e57a-f360-4b72-a675-f0799dffee6f' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'Status')) BEGIN
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
            '1e62e57a-f360-4b72-a675-f0799dffee6f',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'Status',
            'Status',
            'Scheduled (not yet started), Live (in progress), Ended, or Cancelled.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Scheduled',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63e402d5-1469-41ed-b8f5-0d31590eca4d' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'ScheduledStartAt')) BEGIN
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
            '63e402d5-1469-41ed-b8f5-0d31590eca4d',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'ScheduledStartAt',
            'Scheduled Start At',
            'Planned start time. NULL for an ad hoc meeting.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91dc7642-d457-4d7b-b8c0-77804db37695' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'ScheduledEndAt')) BEGIN
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
            '91dc7642-d457-4d7b-b8c0-77804db37695',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'ScheduledEndAt',
            'Scheduled End At',
            'Planned end time. Requires ScheduledStartAt and must be after it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '782b4288-581d-44ca-a18b-af32af7dc08c' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'StartedAt')) BEGIN
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
            '782b4288-581d-44ca-a18b-af32af7dc08c',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'StartedAt',
            'Started At',
            'When the meeting actually started (first participant joined).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fadde66d-a143-4125-afbf-061e91a6aa37' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'EndedAt')) BEGIN
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
            'fadde66d-a143-4125-afbf-061e91a6aa37',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'EndedAt',
            'Ended At',
            'When the meeting actually ended.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00945934-7691-4dfe-b0b5-8dc7d6102ebd' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'AllowPhoneDialIn')) BEGIN
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
            '00945934-7691-4dfe-b0b5-8dc7d6102ebd',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'AllowPhoneDialIn',
            'Allow Phone Dial In',
            'Whether people may join by phone. When on, DialInPhoneNumberID and DialInCode are required.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6de00dfc-503d-49bd-b527-c770f7120913' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'DialInPhoneNumberID')) BEGIN
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
            '6de00dfc-503d-49bd-b527-c770f7120913',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'DialInPhoneNumberID',
            'Dial In Phone Number ID',
            'The phone number callers dial to reach the meeting. Several meetings may share one number; the DialInCode picks the meeting.',
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
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc559752-25dd-4e8e-aa3b-51a66bc82473' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'DialInCode')) BEGIN
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
            'cc559752-25dd-4e8e-aa3b-51a66bc82473',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'DialInCode',
            'Dial In Code',
            'Digits a phone caller enters to join this meeting (6 to 20 digits). A meeting join code shown on invitations, not an account credential; generate it randomly and never reuse one across live meetings on the same number.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '12d4612e-1bc0-4d67-bf74-6c1ceae0116d' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'RecordingPolicy')) BEGIN
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
            '12d4612e-1bc0-4d67-bf74-6c1ceae0116d',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'RecordingPolicy',
            'Recording Policy',
            'Off (never recorded), Allowed (the host may start a recording, which is announced to everyone), or Automatic (recording starts with the meeting and is announced to everyone).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Off',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fc10509e-ecdb-411d-9cd9-96da88dddd6f' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'ConversationID')) BEGIN
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
            'fc10509e-ecdb-411d-9cd9-96da88dddd6f',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'ConversationID',
            'Conversation ID',
            'The Conversation (Type ''Meeting Room'') that holds the meeting transcript and any recording file.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a9dc6a28-ac90-40ef-bb3b-635ae9b77539' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a9dc6a28-ac90-40ef-bb3b-635ae9b77539',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41b2e1e4-62b2-4890-b06a-c71ecec16e85' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '41b2e1e4-62b2-4890-b06a-c71ecec16e85',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d30f606-8737-4390-ada7-a73e4a067798' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'ID')) BEGIN
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
            '9d30f606-8737-4390-ada7-a73e4a067798',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1819b575-246c-4aba-ad85-742f523054a8' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'InteractionID')) BEGIN
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
            '1819b575-246c-4aba-ad85-742f523054a8',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'InteractionID',
            'Interaction ID',
            'The Interaction being handed off.',
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
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3de69740-7fa4-4719-af4e-6c274f846eeb' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'TargetUserID')) BEGIN
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
            '3de69740-7fa4-4719-af4e-6c274f846eeb',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'TargetUserID',
            'Target User ID',
            'The person the offer is for. Only this user may accept or decline it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f08d5a5f-d0c0-485d-bc76-08cdfcafa3c3' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'OfferedByAgentID')) BEGIN
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
            'f08d5a5f-d0c0-485d-bc76-08cdfcafa3c3',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'OfferedByAgentID',
            'Offered By Agent ID',
            'The AI agent that made the offer, when an agent made it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1233ca0b-7596-4362-a6c7-cc24a670273c' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'Mode')) BEGIN
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
            '1233ca0b-7596-4362-a6c7-cc24a670273c',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'Mode',
            'Mode',
            'Warm (the agent stays and introduces the person before leaving) or Blind (the agent leaves as soon as the person joins).',
            'nvarchar',
            40,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aec569b3-0e6e-4236-b8bf-d91314801f7f' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'Status')) BEGIN
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
            'aec569b3-0e6e-4236-b8bf-d91314801f7f',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'Status',
            'Status',
            'Pending (awaiting a response), Accepted, Declined, Expired (no response before ExpiresAt), or Cancelled (the conversation ended or the offer was withdrawn first).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd0490039-c5a3-4203-a5bb-e4be61f51c1f' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'RoomName')) BEGIN
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
            'd0490039-c5a3-4203-a5bb-e4be61f51c1f',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'RoomName',
            'Room Name',
            'The LiveKit room the person joins on accepting.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '289065f3-bba3-440d-9de7-10735487bcbe' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'CallerLabel')) BEGIN
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
            '289065f3-bba3-440d-9de7-10735487bcbe',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'CallerLabel',
            'Caller Label',
            'A short label for who is on the other end, shown on the offer (for example a masked number or a known name). Never a full phone number.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30eb5d7d-bd6a-478d-9e29-7f904b111ab8' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'Summary')) BEGIN
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
            '30eb5d7d-bd6a-478d-9e29-7f904b111ab8',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'Summary',
            'Summary',
            'The agent''s brief for the person: why the conversation is being handed over and what has happened so far.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b9966af0-e7b1-4b23-8170-95b16f7b0dc8' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'OfferedAt')) BEGIN
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
            'b9966af0-e7b1-4b23-8170-95b16f7b0dc8',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'OfferedAt',
            'Offered At',
            'When the offer was made.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71b68d69-ae66-4685-890e-661f29bef358' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'ExpiresAt')) BEGIN
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
            '71b68d69-ae66-4685-890e-661f29bef358',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'ExpiresAt',
            'Expires At',
            'When an unanswered offer lapses. A Pending offer past this time is treated as Expired.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '38e1e98e-ff12-4b4f-84fb-ac4d9a255be7' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'RespondedAt')) BEGIN
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
            '38e1e98e-ff12-4b4f-84fb-ac4d9a255be7',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'RespondedAt',
            'Responded At',
            'When the offer left Pending (accepted, declined, expired or cancelled).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '55e2322c-3f37-4d56-8f78-59c9e905a00f' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = '__mj_CreatedAt')) BEGIN
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
            '55e2322c-3f37-4d56-8f78-59c9e905a00f',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d125f1d-3f6c-4c82-ae51-87c1d9a322b3' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '5d125f1d-3f6c-4c82-ae51-87c1d9a322b3',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd88de1cd-4bd3-4148-b810-dc31a7105775' OR (EntityID = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND Name = 'ID')) BEGIN
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
            'd88de1cd-4bd3-4148-b810-dc31a7105775',
            '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', -- Entity: MJ: Number Pools
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bfe7a1fb-adfe-4156-bfa1-05e2462e0afe' OR (EntityID = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND Name = 'Name')) BEGIN
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
            'bfe7a1fb-adfe-4156-bfa1-05e2462e0afe',
            '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', -- Entity: MJ: Number Pools
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'),
            'Name',
            'Name',
            'Unique, human-readable name of the pool (e.g. Sales Outbound US, Support Callback).',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad14e7d5-2350-47b7-9b98-d269076b2d19' OR (EntityID = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND Name = 'SelectionRule')) BEGIN
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
            'ad14e7d5-2350-47b7-9b98-d269076b2d19',
            '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', -- Entity: MJ: Number Pools
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'),
            'SelectionRule',
            'Selection Rule',
            'How an outbound call picks a number from the pool: RoundRobin (rotate evenly through active numbers), LocalPresence (prefer a number whose area code / region matches the callee, falling back to round robin), or Random.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'RoundRobin',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4c28018-3ec2-48d6-a2de-29e81499466a' OR (EntityID = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND Name = 'MaxConcurrentPerNumber')) BEGIN
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
            'f4c28018-3ec2-48d6-a2de-29e81499466a',
            '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', -- Entity: MJ: Number Pools
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'),
            'MaxConcurrentPerNumber',
            'Max Concurrent Per Number',
            'Optional ceiling on simultaneous active Interactions per number in this pool. A number at the ceiling is skipped during selection. NULL means no ceiling is enforced by MJ (the carrier may still impose one).',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1fb3ef3e-ae8a-4b00-81d9-9c5c1e6777d9' OR (EntityID = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND Name = 'Description')) BEGIN
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
            '1fb3ef3e-ae8a-4b00-81d9-9c5c1e6777d9',
            '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', -- Entity: MJ: Number Pools
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'),
            'Description',
            'Description',
            'Optional description of what the pool is for and any selection policy notes.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e69d38e2-71e8-4f83-845b-3ac13f180a63' OR (EntityID = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e69d38e2-71e8-4f83-845b-3ac13f180a63',
            '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', -- Entity: MJ: Number Pools
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e0f76e25-4c63-4016-bc04-9ca19dfb4b9a' OR (EntityID = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'e0f76e25-4c63-4016-bc04-9ca19dfb4b9a',
            '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', -- Entity: MJ: Number Pools
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '57d8e2c5-ad8f-4bd6-8b98-66944a7d94c9' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'ID')) BEGIN
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
            '57d8e2c5-ad8f-4bd6-8b98-66944a7d94c9',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc7f26d8-f03a-468a-92e5-ebe475e99bda' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'Channel')) BEGIN
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
            'bc7f26d8-f03a-468a-92e5-ebe475e99bda',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'Channel',
            'Channel',
            'The medium the conversation runs over: Phone (a telephone call through a telephony bridge), Web (an embedded web widget session), or Meeting (a multi-party conferencing room).',
            'nvarchar',
            40,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c5fc364-9f32-484b-8067-2da6535058e9' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'Direction')) BEGIN
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
            '2c5fc364-9f32-484b-8067-2da6535058e9',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'Direction',
            'Direction',
            'Who initiated the conversation: Inbound (the remote party reached us), Outbound (we reached the remote party), or Internal (between participants inside the organization, such as an agent-to-agent or staff consult).',
            'nvarchar',
            40,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5da9a3ea-66a5-4791-99c9-b8d45ea8d1a6' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'Status')) BEGIN
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
            '5da9a3ea-66a5-4791-99c9-b8d45ea8d1a6',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'Status',
            'Status',
            'Lifecycle state: Queued (waiting for a handler), Active (a handler is engaged), Ended (completed normally), Abandoned (the remote party left before being answered), or Failed (could not be established or ended in error).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Queued',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1741839-8e45-4e5e-8071-3ee3e871b1ce' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'AgentSessionID')) BEGIN
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
            'd1741839-8e45-4e5e-8071-3ee3e871b1ce',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'AgentSessionID',
            'Agent Session ID',
            'The AI agent session driving this conversation, when an agent is handling it. NULL for conversations handled entirely by humans or not yet assigned.',
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
            '17198778-E25A-4457-80AF-9E8C4961DC29',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e60cc1ef-2cf4-4c43-81f2-d53fb81ae344' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'RoomName')) BEGIN
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
            'e60cc1ef-2cf4-4c43-81f2-d53fb81ae344',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'RoomName',
            'Room Name',
            'Name of the realtime media room (for example the LiveKit room) the conversation runs in, which humans and agents join to participate. NULL when no room is involved.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcf245ac-6ad3-498c-a43f-6349c39b6319' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'PhoneNumberID')) BEGIN
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
            'bcf245ac-6ad3-498c-a43f-6349c39b6319',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'PhoneNumberID',
            'Phone Number ID',
            'The organization-owned phone number used for a Phone conversation: the dialed number for Inbound, the caller ID for Outbound. NULL for non-phone channels.',
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
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc2fca9d-7e93-4f97-9501-604926548779' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'RemoteAddress')) BEGIN
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
            'cc2fca9d-7e93-4f97-9501-604926548779',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'RemoteAddress',
            'Remote Address',
            'The address of the remote party: the caller or callee number for phone, an anonymous session or visitor identifier for web, or the remote party identifier for meetings. Free-form text because the form depends on the channel.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c8afa68-a349-414a-96ad-945bbf309e53' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'StartedAt')) BEGIN
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
            '9c8afa68-a349-414a-96ad-945bbf309e53',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'StartedAt',
            'Started At',
            'When the conversation was created (call placed or received, widget session opened). Defaults to the current time.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8ea7452-315a-4413-9e3f-8f99e9aedf8e' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'AnsweredAt')) BEGIN
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
            'f8ea7452-315a-4413-9e3f-8f99e9aedf8e',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'AnsweredAt',
            'Answered At',
            'When a handler (agent or human) answered and the parties were connected. NULL if never answered. The gap from StartedAt is the wait time.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61f03b68-5772-405d-bc1d-27ff1da50088' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'EndedAt')) BEGIN
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
            '61f03b68-5772-405d-bc1d-27ff1da50088',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'EndedAt',
            'Ended At',
            'When the conversation ended. NULL while it is still queued or active. Must not precede StartedAt.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1aa3f25d-0051-4c76-8539-85e5f9681aab' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'EndReason')) BEGIN
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
            '1aa3f25d-0051-4c76-8539-85e5f9681aab',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'EndReason',
            'End Reason',
            'Short reason the conversation ended (for example CallerHangup, AgentHangup, Transferred, Timeout, ProviderError). Free-form so new reasons need no schema change. NULL while still open.',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d58ace5-0caf-4a6f-9346-3f90c1982b26' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'RecordingEnabled')) BEGIN
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
            '7d58ace5-0caf-4a6f-9346-3f90c1982b26',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'RecordingEnabled',
            'Recording Enabled',
            'Whether media from this conversation is being recorded. Set at creation from the applicable policy and consent rules; it is the intent flag, not proof a recording file exists.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '05daf2cf-4866-40b5-b135-4cb459a3bab6' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'ExternalID')) BEGIN
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
            '05daf2cf-4866-40b5-b135-4cb459a3bab6',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'ExternalID',
            'External ID',
            'The carrier or platform identifier for the conversation (for example a Twilio call SID), used to correlate provider webhooks and billing records with this row.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe9afda9-6f51-428b-bd7c-d8c908ae0fdf' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'CostEstimate')) BEGIN
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
            'fe9afda9-6f51-428b-bd7c-d8c908ae0fdf',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'CostEstimate',
            'Cost Estimate',
            'Estimated total cost of the conversation (carrier minutes, speech and model usage) in the organization''s reporting currency, accumulated as it runs. NULL when no estimate is available. An estimate, not an invoice.',
            'decimal',
            9,
            18,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34c13914-4dc6-474e-8545-f3823151d39a' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = '__mj_CreatedAt')) BEGIN
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
            '34c13914-4dc6-474e-8545-f3823151d39a',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a5c5289-8d3f-451d-8d92-814cb7c896c8' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '9a5c5289-8d3f-451d-8d92-814cb7c896c8',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1607593c-cf57-41a3-b452-9da4b6559d4c' OR (EntityID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND Name = 'PhoneNumber')) BEGIN
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
            '1607593c-cf57-41a3-b452-9da4b6559d4c',
            '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', -- Entity: MJ: Interactions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'),
            'PhoneNumber',
            'Phone Number',
            NULL,
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '833a2074-2a11-42f5-9979-2e1eedecd4aa' OR (EntityID = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND Name = 'TurnAddressing')) BEGIN
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
            '833a2074-2a11-42f5-9979-2e1eedecd4aa',
            '58D95AA3-52C3-4131-BF62-E84E75B04BD2', -- Entity: MJ: AI Agent Session Bridges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '58D95AA3-52C3-4131-BF62-E84E75B04BD2'),
            'TurnAddressing',
            'Turn Addressing',
            'How the agent decided speech was addressed to it: Auto (the model''s own judgement when it is full-duplex, name matching otherwise), ModelSide (the model''s own judgement), or Regex (matching the agent''s names). NULL when not recorded.',
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

/* SQL text to insert entity field value with ID 6c203e19-2d2c-4d3a-9550-a0f7b64975b6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6c203e19-2d2c-4d3a-9550-a0f7b64975b6', 'AD14E7D5-2350-47B7-9B98-D269076B2D19', 1, 'LocalPresence', 'LocalPresence', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bad65a42-888b-4504-a435-606aaed18a2d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bad65a42-888b-4504-a435-606aaed18a2d', 'AD14E7D5-2350-47B7-9B98-D269076B2D19', 2, 'Random', 'Random', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fe3e8573-ce93-49a7-bdc7-9d7b74bb3537 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fe3e8573-ce93-49a7-bdc7-9d7b74bb3537', 'AD14E7D5-2350-47B7-9B98-D269076B2D19', 3, 'RoundRobin', 'RoundRobin', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID AD14E7D5-2350-47B7-9B98-D269076B2D19 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='AD14E7D5-2350-47B7-9B98-D269076B2D19';

/* SQL text to insert entity field value with ID 8cb78363-0db7-4b1c-a025-e33aeec54bac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8cb78363-0db7-4b1c-a025-e33aeec54bac', '7B398E84-9F18-4157-AFA1-8FD3756E42CD', 1, 'Voice', 'Voice', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0690818a-b531-4296-9828-3c4987ecd1e1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0690818a-b531-4296-9828-3c4987ecd1e1', '7B398E84-9F18-4157-AFA1-8FD3756E42CD', 2, 'VoiceAndSMS', 'VoiceAndSMS', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7B398E84-9F18-4157-AFA1-8FD3756E42CD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7B398E84-9F18-4157-AFA1-8FD3756E42CD';

/* SQL text to insert entity field value with ID 4899e48a-8e88-4754-9506-09d198c867ae */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4899e48a-8e88-4754-9506-09d198c867ae', '2FEC2316-9558-4DB7-9E87-97C84B742404', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b52dfb1a-7598-4a14-ba1a-cb8f9abaaac1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b52dfb1a-7598-4a14-ba1a-cb8f9abaaac1', '2FEC2316-9558-4DB7-9E87-97C84B742404', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 711ad453-f4db-4a55-8959-54e9a6115e48 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('711ad453-f4db-4a55-8959-54e9a6115e48', '2FEC2316-9558-4DB7-9E87-97C84B742404', 3, 'Porting', 'Porting', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2FEC2316-9558-4DB7-9E87-97C84B742404 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2FEC2316-9558-4DB7-9E87-97C84B742404';

/* SQL text to insert entity field value with ID 816c974b-6079-435c-9a55-3c9fc62019a9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('816c974b-6079-435c-9a55-3c9fc62019a9', 'BC7F26D8-F03A-468A-92E5-EBE475E99BDA', 1, 'Meeting', 'Meeting', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e7e23aea-0472-4d62-8d15-ad32036a8c5c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e7e23aea-0472-4d62-8d15-ad32036a8c5c', 'BC7F26D8-F03A-468A-92E5-EBE475E99BDA', 2, 'Phone', 'Phone', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4d37cfed-1557-478f-bc65-8cc6b3acfee5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4d37cfed-1557-478f-bc65-8cc6b3acfee5', 'BC7F26D8-F03A-468A-92E5-EBE475E99BDA', 3, 'Web', 'Web', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BC7F26D8-F03A-468A-92E5-EBE475E99BDA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BC7F26D8-F03A-468A-92E5-EBE475E99BDA';

/* SQL text to insert entity field value with ID 6e7c518a-915a-4ee2-91e8-f7fd1089821e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6e7c518a-915a-4ee2-91e8-f7fd1089821e', '2C5FC364-9F32-484B-8067-2DA6535058E9', 1, 'Inbound', 'Inbound', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7871f822-173d-4d0b-837f-351b01663101 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7871f822-173d-4d0b-837f-351b01663101', '2C5FC364-9F32-484B-8067-2DA6535058E9', 2, 'Internal', 'Internal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 37036fca-4f2a-49e4-af17-2f41bf9f00da */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('37036fca-4f2a-49e4-af17-2f41bf9f00da', '2C5FC364-9F32-484B-8067-2DA6535058E9', 3, 'Outbound', 'Outbound', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2C5FC364-9F32-484B-8067-2DA6535058E9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2C5FC364-9F32-484B-8067-2DA6535058E9';

/* SQL text to insert entity field value with ID 708c3ef7-7a6a-4400-bc66-9aa7b2ff8644 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('708c3ef7-7a6a-4400-bc66-9aa7b2ff8644', '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6', 1, 'Abandoned', 'Abandoned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b3aaecd7-583b-48a6-96b7-77c951c578d5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b3aaecd7-583b-48a6-96b7-77c951c578d5', '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6', 2, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 15066175-b60c-4e38-b975-21ec4cdbca82 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('15066175-b60c-4e38-b975-21ec4cdbca82', '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6', 3, 'Ended', 'Ended', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c7095314-aba0-472e-8ebf-478a02cde363 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c7095314-aba0-472e-8ebf-478a02cde363', '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6', 4, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3968959d-9623-441b-90d2-be08e9508f31 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3968959d-9623-441b-90d2-be08e9508f31', '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6', 5, 'Queued', 'Queued', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6';

/* SQL text to insert entity field value with ID 6b51d381-81ba-4813-8abd-033b89d7d14e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6b51d381-81ba-4813-8abd-033b89d7d14e', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 1, 'Abandoned', 'Abandoned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0f5bb670-821b-4507-86fb-264a724d15d9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0f5bb670-821b-4507-86fb-264a724d15d9', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 2, 'Accepted', 'Accepted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f87ec7bd-0d12-443d-9443-681dcae12801 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f87ec7bd-0d12-443d-9443-681dcae12801', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 3, 'Answered', 'Answered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 84889e56-6375-4afc-b0e0-ece04e9a6d2d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('84889e56-6375-4afc-b0e0-ece04e9a6d2d', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 4, 'Created', 'Created', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bb496627-8bef-4dff-9d33-d002bc5320a6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bb496627-8bef-4dff-9d33-d002bc5320a6', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 5, 'Declined', 'Declined', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a3b61fd3-2c56-44df-8d6f-685348ce95f3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a3b61fd3-2c56-44df-8d6f-685348ce95f3', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 6, 'Ended', 'Ended', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e946c905-8dd8-4bd5-91d2-37e57d923f99 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e946c905-8dd8-4bd5-91d2-37e57d923f99', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 7, 'Escalated', 'Escalated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1d6021f1-4fdc-4c65-b302-fb80e8f2066f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1d6021f1-4fdc-4c65-b302-fb80e8f2066f', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 8, 'Held', 'Held', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b4badbe9-9337-46a9-a416-41ff76c2455e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b4badbe9-9337-46a9-a416-41ff76c2455e', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 9, 'Offered', 'Offered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 805cb446-408b-4ee7-93f5-cb7b42074cea */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('805cb446-408b-4ee7-93f5-cb7b42074cea', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 10, 'Queued', 'Queued', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ea5e19c0-84a1-43d6-980a-df8106c849f9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ea5e19c0-84a1-43d6-980a-df8106c849f9', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 11, 'RecordingStarted', 'RecordingStarted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e8fe9bee-06ea-4613-b300-a61bbd29356f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e8fe9bee-06ea-4613-b300-a61bbd29356f', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 12, 'RecordingStopped', 'RecordingStopped', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fc02e30c-faf4-47f6-8ad6-6e0eb1846e0f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fc02e30c-faf4-47f6-8ad6-6e0eb1846e0f', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 13, 'Resumed', 'Resumed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2e39ca96-3ee6-49ea-8c7d-b65f31e54cbe */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2e39ca96-3ee6-49ea-8c7d-b65f31e54cbe', 'C0278F57-7911-448C-91D3-CE8F34CE03F1', 14, 'Transferred', 'Transferred', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C0278F57-7911-448C-91D3-CE8F34CE03F1 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C0278F57-7911-448C-91D3-CE8F34CE03F1';

/* SQL text to insert entity field value with ID 8c5fee51-f82a-46d1-a718-00225c9ea0f6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8c5fee51-f82a-46d1-a718-00225c9ea0f6', '20988255-327A-46EE-AABA-60B8DF1AC2A4', 1, 'Caller', 'Caller', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f08cfc4e-11c7-4bbf-83a9-19dc24336ee3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f08cfc4e-11c7-4bbf-83a9-19dc24336ee3', '20988255-327A-46EE-AABA-60B8DF1AC2A4', 2, 'Created', 'Created', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f1e9e8e4-d040-408e-9506-dbf2d0f6ca34 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f1e9e8e4-d040-408e-9506-dbf2d0f6ca34', '20988255-327A-46EE-AABA-60B8DF1AC2A4', 3, 'Regarding', 'Regarding', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 20988255-327A-46EE-AABA-60B8DF1AC2A4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='20988255-327A-46EE-AABA-60B8DF1AC2A4';

/* SQL text to insert entity field value with ID e2d91587-8498-46bf-95ec-57300265119a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e2d91587-8498-46bf-95ec-57300265119a', '1233CA0B-7596-4362-A6C7-CC24A670273C', 1, 'Blind', 'Blind', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 683a2121-ba71-4df0-9a3d-4777a2ddd3f5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('683a2121-ba71-4df0-9a3d-4777a2ddd3f5', '1233CA0B-7596-4362-A6C7-CC24A670273C', 2, 'Warm', 'Warm', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1233CA0B-7596-4362-A6C7-CC24A670273C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1233CA0B-7596-4362-A6C7-CC24A670273C';

/* SQL text to insert entity field value with ID 014c0beb-40e2-496f-9687-f646713e12be */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('014c0beb-40e2-496f-9687-f646713e12be', 'AEC569B3-0E6E-4236-B8BF-D91314801F7F', 1, 'Accepted', 'Accepted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID afa73be8-1a96-4579-84c4-a837f11fe3a6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('afa73be8-1a96-4579-84c4-a837f11fe3a6', 'AEC569B3-0E6E-4236-B8BF-D91314801F7F', 2, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dbf4475a-f38c-478e-9ec1-0285fffbe50e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dbf4475a-f38c-478e-9ec1-0285fffbe50e', 'AEC569B3-0E6E-4236-B8BF-D91314801F7F', 3, 'Declined', 'Declined', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 71c1a43b-75ff-47ff-b10d-0776cf7d207c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('71c1a43b-75ff-47ff-b10d-0776cf7d207c', 'AEC569B3-0E6E-4236-B8BF-D91314801F7F', 4, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c68b578f-ae23-42cf-925d-c2127009adde */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c68b578f-ae23-42cf-925d-c2127009adde', 'AEC569B3-0E6E-4236-B8BF-D91314801F7F', 5, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID AEC569B3-0E6E-4236-B8BF-D91314801F7F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='AEC569B3-0E6E-4236-B8BF-D91314801F7F';

/* SQL text to insert entity field value with ID 4704836c-845c-4327-9ea7-fb149a652496 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4704836c-845c-4327-9ea7-fb149a652496', '1E62E57A-F360-4B72-A675-F0799DFFEE6F', 1, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 88965ecc-818c-4dcb-aa42-99c00e67a761 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('88965ecc-818c-4dcb-aa42-99c00e67a761', '1E62E57A-F360-4B72-A675-F0799DFFEE6F', 2, 'Ended', 'Ended', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d6bf6997-1d32-48b9-adea-2a7fecd34787 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d6bf6997-1d32-48b9-adea-2a7fecd34787', '1E62E57A-F360-4B72-A675-F0799DFFEE6F', 3, 'Live', 'Live', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1943a3a6-7a1c-43c0-8e62-de9181fb5523 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1943a3a6-7a1c-43c0-8e62-de9181fb5523', '1E62E57A-F360-4B72-A675-F0799DFFEE6F', 4, 'Scheduled', 'Scheduled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1E62E57A-F360-4B72-A675-F0799DFFEE6F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1E62E57A-F360-4B72-A675-F0799DFFEE6F';

/* SQL text to insert entity field value with ID 91c8f1c4-4f26-4866-98e2-539bb551fa39 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('91c8f1c4-4f26-4866-98e2-539bb551fa39', '12D4612E-1BC0-4D67-BF74-6C1CEAE0116D', 1, 'Allowed', 'Allowed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c359df25-e105-42c5-b737-fa2704039dcd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c359df25-e105-42c5-b737-fa2704039dcd', '12D4612E-1BC0-4D67-BF74-6C1CEAE0116D', 2, 'Automatic', 'Automatic', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID af5e8ce1-9b17-46e8-8e3c-2a46ab049127 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('af5e8ce1-9b17-46e8-8e3c-2a46ab049127', '12D4612E-1BC0-4D67-BF74-6C1CEAE0116D', 3, 'Off', 'Off', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 12D4612E-1BC0-4D67-BF74-6C1CEAE0116D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='12D4612E-1BC0-4D67-BF74-6C1CEAE0116D';

/* SQL text to insert entity field value with ID 74bfc3ca-00ec-4dbd-81b4-d573254c4858 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('74bfc3ca-00ec-4dbd-81b4-d573254c4858', '1627E4DF-796A-4E73-BA99-FC9FBE9F1981', 1, 'Agent', 'Agent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 24234ef1-2789-44c8-b0bb-ff9159979ff9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('24234ef1-2789-44c8-b0bb-ff9159979ff9', '1627E4DF-796A-4E73-BA99-FC9FBE9F1981', 2, 'Attendee', 'Attendee', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 36a9497d-1352-45f6-bab9-a249664caced */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('36a9497d-1352-45f6-bab9-a249664caced', '1627E4DF-796A-4E73-BA99-FC9FBE9F1981', 3, 'CoHost', 'CoHost', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cd8f2b13-5ca1-4606-9780-3d440814e6ed */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cd8f2b13-5ca1-4606-9780-3d440814e6ed', '1627E4DF-796A-4E73-BA99-FC9FBE9F1981', 4, 'Host', 'Host', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1627E4DF-796A-4E73-BA99-FC9FBE9F1981 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1627E4DF-796A-4E73-BA99-FC9FBE9F1981';

/* SQL text to insert entity field value with ID 75c8d772-92e0-4ef4-83e5-9111daa32a97 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('75c8d772-92e0-4ef4-83e5-9111daa32a97', '4A872147-E34E-44C7-BE8B-B8584A12A22C', 1, 'Accepted', 'Accepted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 17e4d637-749d-4bcd-89c7-5852e7346e6c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('17e4d637-749d-4bcd-89c7-5852e7346e6c', '4A872147-E34E-44C7-BE8B-B8584A12A22C', 2, 'Declined', 'Declined', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 675847de-8334-4265-b137-eb66b95a0327 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('675847de-8334-4265-b137-eb66b95a0327', '4A872147-E34E-44C7-BE8B-B8584A12A22C', 3, 'Invited', 'Invited', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 22424efa-f810-4e3c-9520-16746ff5ab3f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('22424efa-f810-4e3c-9520-16746ff5ab3f', '4A872147-E34E-44C7-BE8B-B8584A12A22C', 4, 'Tentative', 'Tentative', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4A872147-E34E-44C7-BE8B-B8584A12A22C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4A872147-E34E-44C7-BE8B-B8584A12A22C';

/* SQL text to insert entity field value with ID ee27f970-00e2-4a9e-88e0-89f3917c0899 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ee27f970-00e2-4a9e-88e0-89f3917c0899', '833A2074-2A11-42F5-9979-2E1EEDECD4AA', 1, 'Auto', 'Auto', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c6f495d6-047f-4da0-af9d-8cf6c215ff59 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c6f495d6-047f-4da0-af9d-8cf6c215ff59', '833A2074-2A11-42F5-9979-2E1EEDECD4AA', 2, 'ModelSide', 'ModelSide', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f09b8019-2a31-4dc9-95fb-0c08e9ce2878 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f09b8019-2a31-4dc9-95fb-0c08e9ce2878', '833A2074-2A11-42F5-9979-2E1EEDECD4AA', 3, 'Regex', 'Regex', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 833A2074-2A11-42F5-9979-2E1EEDECD4AA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='833A2074-2A11-42F5-9979-2E1EEDECD4AA';

/* Deterministic search-flag hygiene — seed name fields */

         UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [IncludeInUserSearchAPI] = 1,
             [UserSearchPredicateAPI] = 'BeginsWith'
         WHERE [ID] IN (
            SELECT ranked.[ID] FROM (
               SELECT f.[ID],
                      ROW_NUMBER() OVER (
                         PARTITION BY f.[EntityID]
                         ORDER BY f.[Sequence], f.[Name]
                      ) AS rn
               FROM [${flyway:defaultSchema}].[EntityField] f
               INNER JOIN [${flyway:defaultSchema}].[Entity] e ON e.[ID] = f.[EntityID]
               WHERE LOWER(f.[Name]) IN ('name','title','firstname','lastname','middlename','displayname','fullname','label')
                 AND f.[AutoUpdateIncludeInUserSearchAPI] = 1
                 AND f.[IncludeInUserSearchAPI] = 0
                 AND ISNULL(f.[IsPrimaryKey], 0) = 0
                 AND ISNULL(f.[IsVirtual], 0) = 0
                 AND LOWER(f.[Type]) IN ('nvarchar','varchar','char','nchar')
                 AND ISNULL(f.[Length], 0) <> -1
                 AND e.[VirtualEntity] = 0
                 AND e.[AllowUserSearchAPI] = 1
                 AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
                 AND NOT ((e.[Name] = 'Logs' OR e.[Name] LIKE '% Logs') OR (e.[Name] = 'Log' OR e.[Name] LIKE '% Log') OR (e.[Name] = 'Runs' OR e.[Name] LIKE '% Runs') OR (e.[Name] = 'Run' OR e.[Name] LIKE '% Run') OR (e.[Name] = 'Run History' OR e.[Name] LIKE '% Run History') OR (e.[Name] = 'Run Steps' OR e.[Name] LIKE '% Run Steps') OR (e.[Name] = 'Run Messages' OR e.[Name] LIKE '% Run Messages') OR (e.[Name] = 'Execution Logs' OR e.[Name] LIKE '% Execution Logs') OR (e.[Name] = 'Details' OR e.[Name] LIKE '% Details') OR (e.[Name] = 'Detail' OR e.[Name] LIKE '% Detail') OR (e.[Name] = 'Lines' OR e.[Name] LIKE '% Lines') OR (e.[Name] = 'Line' OR e.[Name] LIKE '% Line') OR (e.[Name] = 'Items' OR e.[Name] LIKE '% Items') OR (e.[Name] = 'Item' OR e.[Name] LIKE '% Item') OR (e.[Name] = 'Steps' OR e.[Name] LIKE '% Steps') OR (e.[Name] = 'Step' OR e.[Name] LIKE '% Step') OR (e.[Name] = 'Params' OR e.[Name] LIKE '% Params') OR (e.[Name] = 'Param' OR e.[Name] LIKE '% Param') OR (e.[Name] = 'Mappings' OR e.[Name] LIKE '% Mappings') OR (e.[Name] = 'Mapping' OR e.[Name] LIKE '% Mapping') OR (e.[Name] = 'Audit' OR e.[Name] LIKE 'Audit %' OR e.[Name] LIKE '% Audit' OR e.[Name] LIKE '% Audit %') OR (e.[Name] = 'Record Change' OR e.[Name] LIKE 'Record Change %' OR e.[Name] LIKE '% Record Change' OR e.[Name] LIKE '% Record Change %'))
                 AND e.[SchemaName] NOT IN ('sys','staging')
                 AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
            ) ranked
            WHERE ranked.rn <= 3
         );

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: AI Agents -> MJ: Interaction Events (One To Many via ActorAgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '984b5cb1-0cb8-4d17-ada8-c5236be7ceaf'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('984b5cb1-0cb8-4d17-ada8-c5236be7ceaf', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'ActorAgentID', 'One To Many', 1, 1, 41, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agents -> MJ: Meeting Participants (One To Many via AgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2f031291-c10f-4733-b784-46e135cc5510'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2f031291-c10f-4733-b784-46e135cc5510', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'AgentID', 'One To Many', 1, 1, 42, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agents -> MJ: Interaction Offers (One To Many via OfferedByAgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '93d33605-b40d-4a39-bfef-65bb6c64c25d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('93d33605-b40d-4a39-bfef-65bb6c64c25d', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '6DC12139-38A1-43C6-85EE-8066450E762B', 'OfferedByAgentID', 'One To Many', 1, 1, 43, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Bridge Providers -> MJ: Phone Numbers (One To Many via ProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5c9c9718-2676-4d59-bd70-5e74b71dd4a8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5c9c9718-2676-4d59-bd70-5e74b71dd4a8', '840A51D1-7436-45F9-9176-31E1FE785635', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'ProviderID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Phone Numbers -> MJ: Meetings (One To Many via DialInPhoneNumberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6fdbbf55-f017-402e-91b6-93404b1acce4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6fdbbf55-f017-402e-91b6-93404b1acce4', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'DialInPhoneNumberID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Phone Numbers -> MJ: Interactions (One To Many via PhoneNumberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd52f432f-8d17-4449-b776-8c6043d8edf8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d52f432f-8d17-4449-b776-8c6043d8edf8', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'PhoneNumberID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Meetings -> MJ: Meeting Participants (One To Many via MeetingID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b3cce56b-c372-4732-b626-900d3e4c5f1c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b3cce56b-c372-4732-b626-900d3e4c5f1c', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'MeetingID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Interaction Links (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '82480ed1-0493-4ed3-9f9d-4b52b7d1311a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('82480ed1-0493-4ed3-9f9d-4b52b7d1311a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', 'EntityID', 'One To Many', 1, 1, 84, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Interaction Events (One To Many via ActorUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'be02e949-82c6-420b-a404-801a878a98d4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('be02e949-82c6-420b-a404-801a878a98d4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'ActorUserID', 'One To Many', 1, 1, 111, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Meeting Participants (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e3fb8c9c-8f85-4c2d-87ad-91cf4753c089'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e3fb8c9c-8f85-4c2d-87ad-91cf4753c089', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'UserID', 'One To Many', 1, 1, 112, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Meetings (One To Many via HostUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '30a86fec-c1d7-49dc-9211-c20dfb28a894'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('30a86fec-c1d7-49dc-9211-c20dfb28a894', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'HostUserID', 'One To Many', 1, 1, 113, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Interaction Offers (One To Many via TargetUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '481766dd-585b-4abf-83f8-46a5ed53d013'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('481766dd-585b-4abf-83f8-46a5ed53d013', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '6DC12139-38A1-43C6-85EE-8066450E762B', 'TargetUserID', 'One To Many', 1, 1, 114, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Conversations -> MJ: Meetings (One To Many via ConversationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1006d8e2-f526-44b4-b577-2ba7212a8a88'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1006d8e2-f526-44b4-b577-2ba7212a8a88', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'ConversationID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agent Sessions -> MJ: Interactions (One To Many via AgentSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a278943f-e32a-40d2-83fe-298f4133204c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a278943f-e32a-40d2-83fe-298f4133204c', '17198778-E25A-4457-80AF-9E8C4961DC29', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'AgentSessionID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Number Pools -> MJ: Phone Numbers (One To Many via NumberPoolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd7f6c3b3-f412-4eaa-87aa-bccfd4422265'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d7f6c3b3-f412-4eaa-87aa-bccfd4422265', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'NumberPoolID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Interactions -> MJ: Interaction Events (One To Many via InteractionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2109a096-1586-49d2-ae49-11f1b331b26b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2109a096-1586-49d2-ae49-11f1b331b26b', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'InteractionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Interactions -> MJ: Interaction Links (One To Many via InteractionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b300c018-e238-4202-9839-f812aaf36ff0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b300c018-e238-4202-9839-f812aaf36ff0', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', 'InteractionID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Interactions -> MJ: Interaction Offers (One To Many via InteractionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '03e03247-9379-43cd-bac0-a3a26bedb771'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('03e03247-9379-43cd-bac0-a3a26bedb771', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', '6DC12139-38A1-43C6-85EE-8066450E762B', 'InteractionID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for AIAgentSessionBridge */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Bridges
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentSessionID in table AIAgentSessionBridge
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSessionBridge_AgentSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSessionBridge]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSessionBridge_AgentSessionID ON [${flyway:defaultSchema}].[AIAgentSessionBridge] ([AgentSessionID]);

-- Index for foreign key ProviderID in table AIAgentSessionBridge
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSessionBridge_ProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSessionBridge]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSessionBridge_ProviderID ON [${flyway:defaultSchema}].[AIAgentSessionBridge] ([ProviderID]);

/* Base View SQL for MJ: AI Agent Session Bridges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Bridges
-- Item: vwAIAgentSessionBridges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Session Bridges
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentSessionBridge
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentSessionBridges]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentSessionBridges];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentSessionBridges]
AS
SELECT
    a.*,
    MJAIBridgeProvider_ProviderID.[Name] AS [Provider]
FROM
    [${flyway:defaultSchema}].[AIAgentSessionBridge] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIBridgeProvider] AS MJAIBridgeProvider_ProviderID
  ON
    [a].[ProviderID] = MJAIBridgeProvider_ProviderID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionBridges] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionBridges] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionBridges] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionBridges] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Session Bridges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Bridges
-- Item: Permissions for vwAIAgentSessionBridges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionBridges] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionBridges] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionBridges] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionBridges] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Session Bridges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Bridges
-- Item: spCreateAIAgentSessionBridge
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentSessionBridge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentSessionBridge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSessionBridge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSessionBridge]
    @ID uniqueidentifier = NULL,
    @AgentSessionID uniqueidentifier,
    @ProviderID uniqueidentifier,
    @Direction nvarchar(20) = NULL,
    @JoinMethod nvarchar(30) = NULL,
    @TurnMode nvarchar(20) = NULL,
    @ExternalConnectionID_Clear bit = 0,
    @ExternalConnectionID nvarchar(500) = NULL,
    @Address_Clear bit = 0,
    @Address nvarchar(2000) = NULL,
    @BotParticipantID_Clear bit = 0,
    @BotParticipantID nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @ScheduledStartTime_Clear bit = 0,
    @ScheduledStartTime datetimeoffset = NULL,
    @ConnectedAt_Clear bit = 0,
    @ConnectedAt datetimeoffset = NULL,
    @DisconnectedAt_Clear bit = 0,
    @DisconnectedAt datetimeoffset = NULL,
    @CloseReason_Clear bit = 0,
    @CloseReason nvarchar(20) = NULL,
    @HostInstanceID_Clear bit = 0,
    @HostInstanceID nvarchar(200) = NULL,
    @Config_Clear bit = 0,
    @Config nvarchar(MAX) = NULL,
    @TurnAddressing_Clear bit = 0,
    @TurnAddressing nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSessionBridge]
            (
                [ID],
                [AgentSessionID],
                [ProviderID],
                [Direction],
                [JoinMethod],
                [TurnMode],
                [ExternalConnectionID],
                [Address],
                [BotParticipantID],
                [Status],
                [ScheduledStartTime],
                [ConnectedAt],
                [DisconnectedAt],
                [CloseReason],
                [HostInstanceID],
                [Config],
                [TurnAddressing]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentSessionID,
                @ProviderID,
                ISNULL(@Direction, 'Outbound'),
                ISNULL(@JoinMethod, 'OnDemand'),
                ISNULL(@TurnMode, 'Passive'),
                CASE WHEN @ExternalConnectionID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalConnectionID, NULL) END,
                CASE WHEN @Address_Clear = 1 THEN NULL ELSE ISNULL(@Address, NULL) END,
                CASE WHEN @BotParticipantID_Clear = 1 THEN NULL ELSE ISNULL(@BotParticipantID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @ScheduledStartTime_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledStartTime, NULL) END,
                CASE WHEN @ConnectedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConnectedAt, NULL) END,
                CASE WHEN @DisconnectedAt_Clear = 1 THEN NULL ELSE ISNULL(@DisconnectedAt, NULL) END,
                CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, NULL) END,
                CASE WHEN @HostInstanceID_Clear = 1 THEN NULL ELSE ISNULL(@HostInstanceID, NULL) END,
                CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, NULL) END,
                CASE WHEN @TurnAddressing_Clear = 1 THEN NULL ELSE ISNULL(@TurnAddressing, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSessionBridge]
            (
                [AgentSessionID],
                [ProviderID],
                [Direction],
                [JoinMethod],
                [TurnMode],
                [ExternalConnectionID],
                [Address],
                [BotParticipantID],
                [Status],
                [ScheduledStartTime],
                [ConnectedAt],
                [DisconnectedAt],
                [CloseReason],
                [HostInstanceID],
                [Config],
                [TurnAddressing]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentSessionID,
                @ProviderID,
                ISNULL(@Direction, 'Outbound'),
                ISNULL(@JoinMethod, 'OnDemand'),
                ISNULL(@TurnMode, 'Passive'),
                CASE WHEN @ExternalConnectionID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalConnectionID, NULL) END,
                CASE WHEN @Address_Clear = 1 THEN NULL ELSE ISNULL(@Address, NULL) END,
                CASE WHEN @BotParticipantID_Clear = 1 THEN NULL ELSE ISNULL(@BotParticipantID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @ScheduledStartTime_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledStartTime, NULL) END,
                CASE WHEN @ConnectedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConnectedAt, NULL) END,
                CASE WHEN @DisconnectedAt_Clear = 1 THEN NULL ELSE ISNULL(@DisconnectedAt, NULL) END,
                CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, NULL) END,
                CASE WHEN @HostInstanceID_Clear = 1 THEN NULL ELSE ISNULL(@HostInstanceID, NULL) END,
                CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, NULL) END,
                CASE WHEN @TurnAddressing_Clear = 1 THEN NULL ELSE ISNULL(@TurnAddressing, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentSessionBridges] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionBridge] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionBridge] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionBridge] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Session Bridges */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionBridge] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionBridge] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionBridge] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Session Bridges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Bridges
-- Item: spUpdateAIAgentSessionBridge
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentSessionBridge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentSessionBridge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSessionBridge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSessionBridge]
    @ID uniqueidentifier,
    @AgentSessionID uniqueidentifier = NULL,
    @ProviderID uniqueidentifier = NULL,
    @Direction nvarchar(20) = NULL,
    @JoinMethod nvarchar(30) = NULL,
    @TurnMode nvarchar(20) = NULL,
    @ExternalConnectionID_Clear bit = 0,
    @ExternalConnectionID nvarchar(500) = NULL,
    @Address_Clear bit = 0,
    @Address nvarchar(2000) = NULL,
    @BotParticipantID_Clear bit = 0,
    @BotParticipantID nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @ScheduledStartTime_Clear bit = 0,
    @ScheduledStartTime datetimeoffset = NULL,
    @ConnectedAt_Clear bit = 0,
    @ConnectedAt datetimeoffset = NULL,
    @DisconnectedAt_Clear bit = 0,
    @DisconnectedAt datetimeoffset = NULL,
    @CloseReason_Clear bit = 0,
    @CloseReason nvarchar(20) = NULL,
    @HostInstanceID_Clear bit = 0,
    @HostInstanceID nvarchar(200) = NULL,
    @Config_Clear bit = 0,
    @Config nvarchar(MAX) = NULL,
    @TurnAddressing_Clear bit = 0,
    @TurnAddressing nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSessionBridge]
    SET
        [AgentSessionID] = ISNULL(@AgentSessionID, [AgentSessionID]),
        [ProviderID] = ISNULL(@ProviderID, [ProviderID]),
        [Direction] = ISNULL(@Direction, [Direction]),
        [JoinMethod] = ISNULL(@JoinMethod, [JoinMethod]),
        [TurnMode] = ISNULL(@TurnMode, [TurnMode]),
        [ExternalConnectionID] = CASE WHEN @ExternalConnectionID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalConnectionID, [ExternalConnectionID]) END,
        [Address] = CASE WHEN @Address_Clear = 1 THEN NULL ELSE ISNULL(@Address, [Address]) END,
        [BotParticipantID] = CASE WHEN @BotParticipantID_Clear = 1 THEN NULL ELSE ISNULL(@BotParticipantID, [BotParticipantID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ScheduledStartTime] = CASE WHEN @ScheduledStartTime_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledStartTime, [ScheduledStartTime]) END,
        [ConnectedAt] = CASE WHEN @ConnectedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConnectedAt, [ConnectedAt]) END,
        [DisconnectedAt] = CASE WHEN @DisconnectedAt_Clear = 1 THEN NULL ELSE ISNULL(@DisconnectedAt, [DisconnectedAt]) END,
        [CloseReason] = CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, [CloseReason]) END,
        [HostInstanceID] = CASE WHEN @HostInstanceID_Clear = 1 THEN NULL ELSE ISNULL(@HostInstanceID, [HostInstanceID]) END,
        [Config] = CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, [Config]) END,
        [TurnAddressing] = CASE WHEN @TurnAddressing_Clear = 1 THEN NULL ELSE ISNULL(@TurnAddressing, [TurnAddressing]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentSessionBridges] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentSessionBridges]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionBridge] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionBridge] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionBridge] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSessionBridge table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentSessionBridge]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentSessionBridge];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentSessionBridge
ON [${flyway:defaultSchema}].[AIAgentSessionBridge]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSessionBridge]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentSessionBridge] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Session Bridges */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionBridge] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionBridge] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionBridge] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Session Bridges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Bridges
-- Item: spDeleteAIAgentSessionBridge
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentSessionBridge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentSessionBridge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSessionBridge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSessionBridge]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentSessionBridge]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionBridge] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionBridge] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionBridge] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Session Bridges */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionBridge] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionBridge] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionBridge] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for InteractionEvent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InteractionID in table InteractionEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InteractionEvent_InteractionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InteractionEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InteractionEvent_InteractionID ON [${flyway:defaultSchema}].[InteractionEvent] ([InteractionID]);

-- Index for foreign key ActorUserID in table InteractionEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InteractionEvent_ActorUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InteractionEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InteractionEvent_ActorUserID ON [${flyway:defaultSchema}].[InteractionEvent] ([ActorUserID]);

-- Index for foreign key ActorAgentID in table InteractionEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InteractionEvent_ActorAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InteractionEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InteractionEvent_ActorAgentID ON [${flyway:defaultSchema}].[InteractionEvent] ([ActorAgentID]);

/* SQL text to update entity field related entity name field map for entity field ID BD207912-2D3C-4800-8C37-179DB85AB4A9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BD207912-2D3C-4800-8C37-179DB85AB4A9', @RelatedEntityNameFieldMap='ActorUser';

/* Index for Foreign Keys for InteractionLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InteractionID in table InteractionLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InteractionLink_InteractionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InteractionLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InteractionLink_InteractionID ON [${flyway:defaultSchema}].[InteractionLink] ([InteractionID]);

-- Index for foreign key EntityID in table InteractionLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InteractionLink_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InteractionLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InteractionLink_EntityID ON [${flyway:defaultSchema}].[InteractionLink] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 3CE1EDE7-AE95-476E-B7C3-12406F9F6F3A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3CE1EDE7-AE95-476E-B7C3-12406F9F6F3A', @RelatedEntityNameFieldMap='Entity';

/* Base View SQL for MJ: Interaction Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Links
-- Item: vwInteractionLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Interaction Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  InteractionLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwInteractionLinks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwInteractionLinks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwInteractionLinks]
AS
SELECT
    i.*,
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[InteractionLink] AS i
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [i].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractionLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Interaction Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Links
-- Item: Permissions for vwInteractionLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractionLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Interaction Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Links
-- Item: spCreateInteractionLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR InteractionLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateInteractionLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateInteractionLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateInteractionLink]
    @ID uniqueidentifier = NULL,
    @InteractionID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Role nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[InteractionLink]
            (
                [ID],
                [InteractionID],
                [EntityID],
                [RecordID],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @InteractionID,
                @EntityID,
                @RecordID,
                @Role
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[InteractionLink]
            (
                [InteractionID],
                [EntityID],
                [RecordID],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @InteractionID,
                @EntityID,
                @RecordID,
                @Role
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwInteractionLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteractionLink] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Interaction Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteractionLink] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Interaction Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Links
-- Item: spUpdateInteractionLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InteractionLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateInteractionLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateInteractionLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateInteractionLink]
    @ID uniqueidentifier,
    @InteractionID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(450) = NULL,
    @Role nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InteractionLink]
    SET
        [InteractionID] = ISNULL(@InteractionID, [InteractionID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [Role] = ISNULL(@Role, [Role])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwInteractionLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwInteractionLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteractionLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InteractionLink table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateInteractionLink]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateInteractionLink];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateInteractionLink
ON [${flyway:defaultSchema}].[InteractionLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InteractionLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[InteractionLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Interaction Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteractionLink] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Interaction Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Links
-- Item: spDeleteInteractionLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InteractionLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteInteractionLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteInteractionLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteInteractionLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[InteractionLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteractionLink] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Interaction Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteractionLink] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID CB4B0E76-A6D2-49C1-9CC1-41F548CAD78D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CB4B0E76-A6D2-49C1-9CC1-41F548CAD78D', @RelatedEntityNameFieldMap='ActorAgent';

/* Base View SQL for MJ: Interaction Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Events
-- Item: vwInteractionEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Interaction Events
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  InteractionEvent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwInteractionEvents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwInteractionEvents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwInteractionEvents]
AS
SELECT
    i.*,
    MJUser_ActorUserID.[Name] AS [ActorUser],
    MJAIAgent_ActorAgentID.[Name] AS [ActorAgent]
FROM
    [${flyway:defaultSchema}].[InteractionEvent] AS i
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ActorUserID
  ON
    [i].[ActorUserID] = MJUser_ActorUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_ActorAgentID
  ON
    [i].[ActorAgentID] = MJAIAgent_ActorAgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractionEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Interaction Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Events
-- Item: Permissions for vwInteractionEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractionEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Interaction Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Events
-- Item: spCreateInteractionEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR InteractionEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateInteractionEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateInteractionEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateInteractionEvent]
    @ID uniqueidentifier = NULL,
    @InteractionID uniqueidentifier,
    @EventType nvarchar(20),
    @OccurredAt datetimeoffset = NULL,
    @ActorUserID_Clear bit = 0,
    @ActorUserID uniqueidentifier = NULL,
    @ActorAgentID_Clear bit = 0,
    @ActorAgentID uniqueidentifier = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[InteractionEvent]
            (
                [ID],
                [InteractionID],
                [EventType],
                [OccurredAt],
                [ActorUserID],
                [ActorAgentID],
                [Details]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @InteractionID,
                @EventType,
                ISNULL(@OccurredAt, sysdatetimeoffset()),
                CASE WHEN @ActorUserID_Clear = 1 THEN NULL ELSE ISNULL(@ActorUserID, NULL) END,
                CASE WHEN @ActorAgentID_Clear = 1 THEN NULL ELSE ISNULL(@ActorAgentID, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[InteractionEvent]
            (
                [InteractionID],
                [EventType],
                [OccurredAt],
                [ActorUserID],
                [ActorAgentID],
                [Details]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @InteractionID,
                @EventType,
                ISNULL(@OccurredAt, sysdatetimeoffset()),
                CASE WHEN @ActorUserID_Clear = 1 THEN NULL ELSE ISNULL(@ActorUserID, NULL) END,
                CASE WHEN @ActorAgentID_Clear = 1 THEN NULL ELSE ISNULL(@ActorAgentID, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwInteractionEvents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteractionEvent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Interaction Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteractionEvent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Interaction Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Events
-- Item: spUpdateInteractionEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InteractionEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateInteractionEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateInteractionEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateInteractionEvent]
    @ID uniqueidentifier,
    @InteractionID uniqueidentifier = NULL,
    @EventType nvarchar(20) = NULL,
    @OccurredAt datetimeoffset = NULL,
    @ActorUserID_Clear bit = 0,
    @ActorUserID uniqueidentifier = NULL,
    @ActorAgentID_Clear bit = 0,
    @ActorAgentID uniqueidentifier = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InteractionEvent]
    SET
        [InteractionID] = ISNULL(@InteractionID, [InteractionID]),
        [EventType] = ISNULL(@EventType, [EventType]),
        [OccurredAt] = ISNULL(@OccurredAt, [OccurredAt]),
        [ActorUserID] = CASE WHEN @ActorUserID_Clear = 1 THEN NULL ELSE ISNULL(@ActorUserID, [ActorUserID]) END,
        [ActorAgentID] = CASE WHEN @ActorAgentID_Clear = 1 THEN NULL ELSE ISNULL(@ActorAgentID, [ActorAgentID]) END,
        [Details] = CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, [Details]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwInteractionEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwInteractionEvents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteractionEvent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InteractionEvent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateInteractionEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateInteractionEvent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateInteractionEvent
ON [${flyway:defaultSchema}].[InteractionEvent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InteractionEvent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[InteractionEvent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Interaction Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteractionEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Interaction Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Events
-- Item: spDeleteInteractionEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InteractionEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteInteractionEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteInteractionEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteInteractionEvent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[InteractionEvent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteractionEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Interaction Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteractionEvent] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for InteractionOffer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Offers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InteractionID in table InteractionOffer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InteractionOffer_InteractionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InteractionOffer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InteractionOffer_InteractionID ON [${flyway:defaultSchema}].[InteractionOffer] ([InteractionID]);

-- Index for foreign key TargetUserID in table InteractionOffer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InteractionOffer_TargetUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InteractionOffer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InteractionOffer_TargetUserID ON [${flyway:defaultSchema}].[InteractionOffer] ([TargetUserID]);

-- Index for foreign key OfferedByAgentID in table InteractionOffer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InteractionOffer_OfferedByAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InteractionOffer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InteractionOffer_OfferedByAgentID ON [${flyway:defaultSchema}].[InteractionOffer] ([OfferedByAgentID]);

/* SQL text to update entity field related entity name field map for entity field ID 3DE69740-7FA4-4719-AF4E-6C274F846EEB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3DE69740-7FA4-4719-AF4E-6C274F846EEB', @RelatedEntityNameFieldMap='TargetUser';

/* Index for Foreign Keys for Interaction */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentSessionID in table Interaction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Interaction_AgentSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Interaction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Interaction_AgentSessionID ON [${flyway:defaultSchema}].[Interaction] ([AgentSessionID]);

-- Index for foreign key PhoneNumberID in table Interaction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Interaction_PhoneNumberID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Interaction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Interaction_PhoneNumberID ON [${flyway:defaultSchema}].[Interaction] ([PhoneNumberID]);

/* Base View SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: vwInteractions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Interactions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Interaction
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwInteractions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwInteractions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwInteractions]
AS
SELECT
    i.*
FROM
    [${flyway:defaultSchema}].[Interaction] AS i
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: Permissions for vwInteractions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: spCreateInteraction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Interaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateInteraction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateInteraction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateInteraction]
    @ID uniqueidentifier = NULL,
    @Channel nvarchar(20),
    @Direction nvarchar(20),
    @Status nvarchar(20) = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @RoomName_Clear bit = 0,
    @RoomName nvarchar(255) = NULL,
    @PhoneNumberID_Clear bit = 0,
    @PhoneNumberID uniqueidentifier = NULL,
    @RemoteAddress_Clear bit = 0,
    @RemoteAddress nvarchar(255) = NULL,
    @StartedAt datetimeoffset = NULL,
    @AnsweredAt_Clear bit = 0,
    @AnsweredAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @EndReason_Clear bit = 0,
    @EndReason nvarchar(100) = NULL,
    @RecordingEnabled bit = NULL,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(255) = NULL,
    @CostEstimate_Clear bit = 0,
    @CostEstimate decimal(18, 6) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Interaction]
            (
                [ID],
                [Channel],
                [Direction],
                [Status],
                [AgentSessionID],
                [RoomName],
                [PhoneNumberID],
                [RemoteAddress],
                [StartedAt],
                [AnsweredAt],
                [EndedAt],
                [EndReason],
                [RecordingEnabled],
                [ExternalID],
                [CostEstimate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Channel,
                @Direction,
                ISNULL(@Status, 'Queued'),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @RoomName_Clear = 1 THEN NULL ELSE ISNULL(@RoomName, NULL) END,
                CASE WHEN @PhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@PhoneNumberID, NULL) END,
                CASE WHEN @RemoteAddress_Clear = 1 THEN NULL ELSE ISNULL(@RemoteAddress, NULL) END,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @AnsweredAt_Clear = 1 THEN NULL ELSE ISNULL(@AnsweredAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @EndReason_Clear = 1 THEN NULL ELSE ISNULL(@EndReason, NULL) END,
                ISNULL(@RecordingEnabled, 0),
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                CASE WHEN @CostEstimate_Clear = 1 THEN NULL ELSE ISNULL(@CostEstimate, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Interaction]
            (
                [Channel],
                [Direction],
                [Status],
                [AgentSessionID],
                [RoomName],
                [PhoneNumberID],
                [RemoteAddress],
                [StartedAt],
                [AnsweredAt],
                [EndedAt],
                [EndReason],
                [RecordingEnabled],
                [ExternalID],
                [CostEstimate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Channel,
                @Direction,
                ISNULL(@Status, 'Queued'),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @RoomName_Clear = 1 THEN NULL ELSE ISNULL(@RoomName, NULL) END,
                CASE WHEN @PhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@PhoneNumberID, NULL) END,
                CASE WHEN @RemoteAddress_Clear = 1 THEN NULL ELSE ISNULL(@RemoteAddress, NULL) END,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @AnsweredAt_Clear = 1 THEN NULL ELSE ISNULL(@AnsweredAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @EndReason_Clear = 1 THEN NULL ELSE ISNULL(@EndReason, NULL) END,
                ISNULL(@RecordingEnabled, 0),
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                CASE WHEN @CostEstimate_Clear = 1 THEN NULL ELSE ISNULL(@CostEstimate, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwInteractions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteraction] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Interactions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteraction] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: spUpdateInteraction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Interaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateInteraction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateInteraction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateInteraction]
    @ID uniqueidentifier,
    @Channel nvarchar(20) = NULL,
    @Direction nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @RoomName_Clear bit = 0,
    @RoomName nvarchar(255) = NULL,
    @PhoneNumberID_Clear bit = 0,
    @PhoneNumberID uniqueidentifier = NULL,
    @RemoteAddress_Clear bit = 0,
    @RemoteAddress nvarchar(255) = NULL,
    @StartedAt datetimeoffset = NULL,
    @AnsweredAt_Clear bit = 0,
    @AnsweredAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @EndReason_Clear bit = 0,
    @EndReason nvarchar(100) = NULL,
    @RecordingEnabled bit = NULL,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(255) = NULL,
    @CostEstimate_Clear bit = 0,
    @CostEstimate decimal(18, 6) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Interaction]
    SET
        [Channel] = ISNULL(@Channel, [Channel]),
        [Direction] = ISNULL(@Direction, [Direction]),
        [Status] = ISNULL(@Status, [Status]),
        [AgentSessionID] = CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, [AgentSessionID]) END,
        [RoomName] = CASE WHEN @RoomName_Clear = 1 THEN NULL ELSE ISNULL(@RoomName, [RoomName]) END,
        [PhoneNumberID] = CASE WHEN @PhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@PhoneNumberID, [PhoneNumberID]) END,
        [RemoteAddress] = CASE WHEN @RemoteAddress_Clear = 1 THEN NULL ELSE ISNULL(@RemoteAddress, [RemoteAddress]) END,
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [AnsweredAt] = CASE WHEN @AnsweredAt_Clear = 1 THEN NULL ELSE ISNULL(@AnsweredAt, [AnsweredAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [EndReason] = CASE WHEN @EndReason_Clear = 1 THEN NULL ELSE ISNULL(@EndReason, [EndReason]) END,
        [RecordingEnabled] = ISNULL(@RecordingEnabled, [RecordingEnabled]),
        [ExternalID] = CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, [ExternalID]) END,
        [CostEstimate] = CASE WHEN @CostEstimate_Clear = 1 THEN NULL ELSE ISNULL(@CostEstimate, [CostEstimate]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwInteractions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwInteractions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteraction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Interaction table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateInteraction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateInteraction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateInteraction
ON [${flyway:defaultSchema}].[Interaction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Interaction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Interaction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Interactions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteraction] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: spDeleteInteraction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Interaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteInteraction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteInteraction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteInteraction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Interaction]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteraction] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Interactions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteraction] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID F08D5A5F-D0C0-485D-BC76-08CDFCAFA3C3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F08D5A5F-D0C0-485D-BC76-08CDFCAFA3C3', @RelatedEntityNameFieldMap='OfferedByAgent';

/* Base View SQL for MJ: Interaction Offers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Offers
-- Item: vwInteractionOffers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Interaction Offers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  InteractionOffer
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwInteractionOffers]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwInteractionOffers];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwInteractionOffers]
AS
SELECT
    i.*,
    MJUser_TargetUserID.[Name] AS [TargetUser],
    MJAIAgent_OfferedByAgentID.[Name] AS [OfferedByAgent]
FROM
    [${flyway:defaultSchema}].[InteractionOffer] AS i
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_TargetUserID
  ON
    [i].[TargetUserID] = MJUser_TargetUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_OfferedByAgentID
  ON
    [i].[OfferedByAgentID] = MJAIAgent_OfferedByAgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractionOffers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Interaction Offers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Offers
-- Item: Permissions for vwInteractionOffers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractionOffers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Interaction Offers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Offers
-- Item: spCreateInteractionOffer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR InteractionOffer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateInteractionOffer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateInteractionOffer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateInteractionOffer]
    @ID uniqueidentifier = NULL,
    @InteractionID uniqueidentifier,
    @TargetUserID uniqueidentifier,
    @OfferedByAgentID_Clear bit = 0,
    @OfferedByAgentID uniqueidentifier = NULL,
    @Mode nvarchar(20),
    @Status nvarchar(20) = NULL,
    @RoomName nvarchar(255),
    @CallerLabel_Clear bit = 0,
    @CallerLabel nvarchar(255) = NULL,
    @Summary_Clear bit = 0,
    @Summary nvarchar(MAX) = NULL,
    @OfferedAt datetimeoffset = NULL,
    @ExpiresAt datetimeoffset,
    @RespondedAt_Clear bit = 0,
    @RespondedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[InteractionOffer]
            (
                [ID],
                [InteractionID],
                [TargetUserID],
                [OfferedByAgentID],
                [Mode],
                [Status],
                [RoomName],
                [CallerLabel],
                [Summary],
                [OfferedAt],
                [ExpiresAt],
                [RespondedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @InteractionID,
                @TargetUserID,
                CASE WHEN @OfferedByAgentID_Clear = 1 THEN NULL ELSE ISNULL(@OfferedByAgentID, NULL) END,
                @Mode,
                ISNULL(@Status, 'Pending'),
                @RoomName,
                CASE WHEN @CallerLabel_Clear = 1 THEN NULL ELSE ISNULL(@CallerLabel, NULL) END,
                CASE WHEN @Summary_Clear = 1 THEN NULL ELSE ISNULL(@Summary, NULL) END,
                ISNULL(@OfferedAt, sysdatetimeoffset()),
                @ExpiresAt,
                CASE WHEN @RespondedAt_Clear = 1 THEN NULL ELSE ISNULL(@RespondedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[InteractionOffer]
            (
                [InteractionID],
                [TargetUserID],
                [OfferedByAgentID],
                [Mode],
                [Status],
                [RoomName],
                [CallerLabel],
                [Summary],
                [OfferedAt],
                [ExpiresAt],
                [RespondedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @InteractionID,
                @TargetUserID,
                CASE WHEN @OfferedByAgentID_Clear = 1 THEN NULL ELSE ISNULL(@OfferedByAgentID, NULL) END,
                @Mode,
                ISNULL(@Status, 'Pending'),
                @RoomName,
                CASE WHEN @CallerLabel_Clear = 1 THEN NULL ELSE ISNULL(@CallerLabel, NULL) END,
                CASE WHEN @Summary_Clear = 1 THEN NULL ELSE ISNULL(@Summary, NULL) END,
                ISNULL(@OfferedAt, sysdatetimeoffset()),
                @ExpiresAt,
                CASE WHEN @RespondedAt_Clear = 1 THEN NULL ELSE ISNULL(@RespondedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwInteractionOffers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteractionOffer] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Interaction Offers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteractionOffer] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Interaction Offers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Offers
-- Item: spUpdateInteractionOffer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InteractionOffer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateInteractionOffer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateInteractionOffer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateInteractionOffer]
    @ID uniqueidentifier,
    @InteractionID uniqueidentifier = NULL,
    @TargetUserID uniqueidentifier = NULL,
    @OfferedByAgentID_Clear bit = 0,
    @OfferedByAgentID uniqueidentifier = NULL,
    @Mode nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @RoomName nvarchar(255) = NULL,
    @CallerLabel_Clear bit = 0,
    @CallerLabel nvarchar(255) = NULL,
    @Summary_Clear bit = 0,
    @Summary nvarchar(MAX) = NULL,
    @OfferedAt datetimeoffset = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @RespondedAt_Clear bit = 0,
    @RespondedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InteractionOffer]
    SET
        [InteractionID] = ISNULL(@InteractionID, [InteractionID]),
        [TargetUserID] = ISNULL(@TargetUserID, [TargetUserID]),
        [OfferedByAgentID] = CASE WHEN @OfferedByAgentID_Clear = 1 THEN NULL ELSE ISNULL(@OfferedByAgentID, [OfferedByAgentID]) END,
        [Mode] = ISNULL(@Mode, [Mode]),
        [Status] = ISNULL(@Status, [Status]),
        [RoomName] = ISNULL(@RoomName, [RoomName]),
        [CallerLabel] = CASE WHEN @CallerLabel_Clear = 1 THEN NULL ELSE ISNULL(@CallerLabel, [CallerLabel]) END,
        [Summary] = CASE WHEN @Summary_Clear = 1 THEN NULL ELSE ISNULL(@Summary, [Summary]) END,
        [OfferedAt] = ISNULL(@OfferedAt, [OfferedAt]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [RespondedAt] = CASE WHEN @RespondedAt_Clear = 1 THEN NULL ELSE ISNULL(@RespondedAt, [RespondedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwInteractionOffers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwInteractionOffers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteractionOffer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InteractionOffer table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateInteractionOffer]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateInteractionOffer];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateInteractionOffer
ON [${flyway:defaultSchema}].[InteractionOffer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InteractionOffer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[InteractionOffer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Interaction Offers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteractionOffer] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Interaction Offers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interaction Offers
-- Item: spDeleteInteractionOffer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InteractionOffer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteInteractionOffer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteInteractionOffer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteInteractionOffer]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[InteractionOffer]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteractionOffer] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Interaction Offers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteractionOffer] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MeetingParticipant */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MeetingID in table MeetingParticipant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MeetingParticipant_MeetingID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MeetingParticipant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MeetingParticipant_MeetingID ON [${flyway:defaultSchema}].[MeetingParticipant] ([MeetingID]);

-- Index for foreign key UserID in table MeetingParticipant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MeetingParticipant_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MeetingParticipant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MeetingParticipant_UserID ON [${flyway:defaultSchema}].[MeetingParticipant] ([UserID]);

-- Index for foreign key AgentID in table MeetingParticipant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MeetingParticipant_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MeetingParticipant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MeetingParticipant_AgentID ON [${flyway:defaultSchema}].[MeetingParticipant] ([AgentID]);

/* SQL text to update entity field related entity name field map for entity field ID B55B3D09-0A92-48B5-8654-F8CE7CA2101F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B55B3D09-0A92-48B5-8654-F8CE7CA2101F', @RelatedEntityNameFieldMap='User';

/* Index for Foreign Keys for Meeting */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key HostUserID in table Meeting
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Meeting_HostUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Meeting]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Meeting_HostUserID ON [${flyway:defaultSchema}].[Meeting] ([HostUserID]);

-- Index for foreign key DialInPhoneNumberID in table Meeting
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Meeting_DialInPhoneNumberID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Meeting]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Meeting_DialInPhoneNumberID ON [${flyway:defaultSchema}].[Meeting] ([DialInPhoneNumberID]);

-- Index for foreign key ConversationID in table Meeting
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Meeting_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Meeting]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Meeting_ConversationID ON [${flyway:defaultSchema}].[Meeting] ([ConversationID]);

/* SQL text to update entity field related entity name field map for entity field ID B8C2F7C9-6DE0-4741-8F19-81ECD08A2B6E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B8C2F7C9-6DE0-4741-8F19-81ECD08A2B6E', @RelatedEntityNameFieldMap='HostUser';

/* Index for Foreign Keys for NumberPool */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Number Pools
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Number Pools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Number Pools
-- Item: vwNumberPools
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Number Pools
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  NumberPool
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwNumberPools]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwNumberPools];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwNumberPools]
AS
SELECT
    n.*
FROM
    [${flyway:defaultSchema}].[NumberPool] AS n
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwNumberPools] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Number Pools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Number Pools
-- Item: Permissions for vwNumberPools
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwNumberPools] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Number Pools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Number Pools
-- Item: spCreateNumberPool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR NumberPool
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateNumberPool]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateNumberPool];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateNumberPool]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @SelectionRule nvarchar(20) = NULL,
    @MaxConcurrentPerNumber_Clear bit = 0,
    @MaxConcurrentPerNumber int = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[NumberPool]
            (
                [ID],
                [Name],
                [SelectionRule],
                [MaxConcurrentPerNumber],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                ISNULL(@SelectionRule, 'RoundRobin'),
                CASE WHEN @MaxConcurrentPerNumber_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcurrentPerNumber, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[NumberPool]
            (
                [Name],
                [SelectionRule],
                [MaxConcurrentPerNumber],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                ISNULL(@SelectionRule, 'RoundRobin'),
                CASE WHEN @MaxConcurrentPerNumber_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcurrentPerNumber, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwNumberPools] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateNumberPool] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Number Pools */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateNumberPool] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Number Pools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Number Pools
-- Item: spUpdateNumberPool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR NumberPool
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateNumberPool]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateNumberPool];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateNumberPool]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @SelectionRule nvarchar(20) = NULL,
    @MaxConcurrentPerNumber_Clear bit = 0,
    @MaxConcurrentPerNumber int = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[NumberPool]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [SelectionRule] = ISNULL(@SelectionRule, [SelectionRule]),
        [MaxConcurrentPerNumber] = CASE WHEN @MaxConcurrentPerNumber_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcurrentPerNumber, [MaxConcurrentPerNumber]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwNumberPools] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwNumberPools]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateNumberPool] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the NumberPool table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateNumberPool]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateNumberPool];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateNumberPool
ON [${flyway:defaultSchema}].[NumberPool]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[NumberPool]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[NumberPool] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Number Pools */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateNumberPool] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Number Pools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Number Pools
-- Item: spDeleteNumberPool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR NumberPool
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteNumberPool]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteNumberPool];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteNumberPool]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[NumberPool]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteNumberPool] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Number Pools */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteNumberPool] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID FC10509E-ECDB-411D-9CD9-96DA88DDDD6F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FC10509E-ECDB-411D-9CD9-96DA88DDDD6F', @RelatedEntityNameFieldMap='Conversation';

/* SQL text to update entity field related entity name field map for entity field ID 2C366BDB-25B2-4783-B1D6-444628AED556 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2C366BDB-25B2-4783-B1D6-444628AED556', @RelatedEntityNameFieldMap='Agent';

/* Base View SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: vwMeetingParticipants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Meeting Participants
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MeetingParticipant
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMeetingParticipants]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMeetingParticipants];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMeetingParticipants]
AS
SELECT
    m.*,
    MJUser_UserID.[Name] AS [User],
    MJAIAgent_AgentID.[Name] AS [Agent]
FROM
    [${flyway:defaultSchema}].[MeetingParticipant] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [m].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [m].[AgentID] = MJAIAgent_AgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: Permissions for vwMeetingParticipants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: spCreateMeetingParticipant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MeetingParticipant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMeetingParticipant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMeetingParticipant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMeetingParticipant]
    @ID uniqueidentifier = NULL,
    @MeetingID uniqueidentifier,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ExternalName_Clear bit = 0,
    @ExternalName nvarchar(255) = NULL,
    @ExternalEmail_Clear bit = 0,
    @ExternalEmail nvarchar(255) = NULL,
    @ExternalPhone_Clear bit = 0,
    @ExternalPhone nvarchar(20) = NULL,
    @Role nvarchar(20) = NULL,
    @InviteStatus nvarchar(20) = NULL,
    @JoinedAt_Clear bit = 0,
    @JoinedAt datetimeoffset = NULL,
    @LeftAt_Clear bit = 0,
    @LeftAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MeetingParticipant]
            (
                [ID],
                [MeetingID],
                [UserID],
                [AgentID],
                [ExternalName],
                [ExternalEmail],
                [ExternalPhone],
                [Role],
                [InviteStatus],
                [JoinedAt],
                [LeftAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MeetingID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ExternalName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalName, NULL) END,
                CASE WHEN @ExternalEmail_Clear = 1 THEN NULL ELSE ISNULL(@ExternalEmail, NULL) END,
                CASE WHEN @ExternalPhone_Clear = 1 THEN NULL ELSE ISNULL(@ExternalPhone, NULL) END,
                ISNULL(@Role, 'Attendee'),
                ISNULL(@InviteStatus, 'Invited'),
                CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, NULL) END,
                CASE WHEN @LeftAt_Clear = 1 THEN NULL ELSE ISNULL(@LeftAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MeetingParticipant]
            (
                [MeetingID],
                [UserID],
                [AgentID],
                [ExternalName],
                [ExternalEmail],
                [ExternalPhone],
                [Role],
                [InviteStatus],
                [JoinedAt],
                [LeftAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MeetingID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ExternalName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalName, NULL) END,
                CASE WHEN @ExternalEmail_Clear = 1 THEN NULL ELSE ISNULL(@ExternalEmail, NULL) END,
                CASE WHEN @ExternalPhone_Clear = 1 THEN NULL ELSE ISNULL(@ExternalPhone, NULL) END,
                ISNULL(@Role, 'Attendee'),
                ISNULL(@InviteStatus, 'Invited'),
                CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, NULL) END,
                CASE WHEN @LeftAt_Clear = 1 THEN NULL ELSE ISNULL(@LeftAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMeetingParticipants] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Meeting Participants */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: spUpdateMeetingParticipant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MeetingParticipant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMeetingParticipant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMeetingParticipant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMeetingParticipant]
    @ID uniqueidentifier,
    @MeetingID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ExternalName_Clear bit = 0,
    @ExternalName nvarchar(255) = NULL,
    @ExternalEmail_Clear bit = 0,
    @ExternalEmail nvarchar(255) = NULL,
    @ExternalPhone_Clear bit = 0,
    @ExternalPhone nvarchar(20) = NULL,
    @Role nvarchar(20) = NULL,
    @InviteStatus nvarchar(20) = NULL,
    @JoinedAt_Clear bit = 0,
    @JoinedAt datetimeoffset = NULL,
    @LeftAt_Clear bit = 0,
    @LeftAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MeetingParticipant]
    SET
        [MeetingID] = ISNULL(@MeetingID, [MeetingID]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [ExternalName] = CASE WHEN @ExternalName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalName, [ExternalName]) END,
        [ExternalEmail] = CASE WHEN @ExternalEmail_Clear = 1 THEN NULL ELSE ISNULL(@ExternalEmail, [ExternalEmail]) END,
        [ExternalPhone] = CASE WHEN @ExternalPhone_Clear = 1 THEN NULL ELSE ISNULL(@ExternalPhone, [ExternalPhone]) END,
        [Role] = ISNULL(@Role, [Role]),
        [InviteStatus] = ISNULL(@InviteStatus, [InviteStatus]),
        [JoinedAt] = CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, [JoinedAt]) END,
        [LeftAt] = CASE WHEN @LeftAt_Clear = 1 THEN NULL ELSE ISNULL(@LeftAt, [LeftAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMeetingParticipants] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMeetingParticipants]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeetingParticipant] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MeetingParticipant table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMeetingParticipant]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMeetingParticipant];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMeetingParticipant
ON [${flyway:defaultSchema}].[MeetingParticipant]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MeetingParticipant]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MeetingParticipant] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Meeting Participants */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: spDeleteMeetingParticipant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MeetingParticipant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMeetingParticipant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMeetingParticipant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMeetingParticipant]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MeetingParticipant]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Meeting Participants */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Meetings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Meeting
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMeetings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMeetings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMeetings]
AS
SELECT
    m.*,
    MJUser_HostUserID.[Name] AS [HostUser],
    MJConversation_ConversationID.[Name] AS [Conversation]
FROM
    [${flyway:defaultSchema}].[Meeting] AS m
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_HostUserID
  ON
    [m].[HostUserID] = MJUser_HostUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [m].[ConversationID] = MJConversation_ConversationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: Permissions for vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: spCreateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMeeting];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMeeting]
    @ID uniqueidentifier = NULL,
    @Title nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @HostUserID uniqueidentifier,
    @RoomName nvarchar(255),
    @Status nvarchar(20) = NULL,
    @ScheduledStartAt_Clear bit = 0,
    @ScheduledStartAt datetimeoffset = NULL,
    @ScheduledEndAt_Clear bit = 0,
    @ScheduledEndAt datetimeoffset = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @AllowPhoneDialIn bit = NULL,
    @DialInPhoneNumberID_Clear bit = 0,
    @DialInPhoneNumberID uniqueidentifier = NULL,
    @DialInCode_Clear bit = 0,
    @DialInCode nvarchar(20) = NULL,
    @RecordingPolicy nvarchar(20) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Meeting]
            (
                [ID],
                [Title],
                [Description],
                [HostUserID],
                [RoomName],
                [Status],
                [ScheduledStartAt],
                [ScheduledEndAt],
                [StartedAt],
                [EndedAt],
                [AllowPhoneDialIn],
                [DialInPhoneNumberID],
                [DialInCode],
                [RecordingPolicy],
                [ConversationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Title,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @HostUserID,
                @RoomName,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @ScheduledStartAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledStartAt, NULL) END,
                CASE WHEN @ScheduledEndAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledEndAt, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                ISNULL(@AllowPhoneDialIn, 0),
                CASE WHEN @DialInPhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@DialInPhoneNumberID, NULL) END,
                CASE WHEN @DialInCode_Clear = 1 THEN NULL ELSE ISNULL(@DialInCode, NULL) END,
                ISNULL(@RecordingPolicy, 'Off'),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Meeting]
            (
                [Title],
                [Description],
                [HostUserID],
                [RoomName],
                [Status],
                [ScheduledStartAt],
                [ScheduledEndAt],
                [StartedAt],
                [EndedAt],
                [AllowPhoneDialIn],
                [DialInPhoneNumberID],
                [DialInCode],
                [RecordingPolicy],
                [ConversationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Title,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @HostUserID,
                @RoomName,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @ScheduledStartAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledStartAt, NULL) END,
                CASE WHEN @ScheduledEndAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledEndAt, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                ISNULL(@AllowPhoneDialIn, 0),
                CASE WHEN @DialInPhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@DialInPhoneNumberID, NULL) END,
                CASE WHEN @DialInCode_Clear = 1 THEN NULL ELSE ISNULL(@DialInCode, NULL) END,
                ISNULL(@RecordingPolicy, 'Off'),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMeetings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Meetings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: spUpdateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMeeting];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMeeting]
    @ID uniqueidentifier,
    @Title nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @HostUserID uniqueidentifier = NULL,
    @RoomName nvarchar(255) = NULL,
    @Status nvarchar(20) = NULL,
    @ScheduledStartAt_Clear bit = 0,
    @ScheduledStartAt datetimeoffset = NULL,
    @ScheduledEndAt_Clear bit = 0,
    @ScheduledEndAt datetimeoffset = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @AllowPhoneDialIn bit = NULL,
    @DialInPhoneNumberID_Clear bit = 0,
    @DialInPhoneNumberID uniqueidentifier = NULL,
    @DialInCode_Clear bit = 0,
    @DialInCode nvarchar(20) = NULL,
    @RecordingPolicy nvarchar(20) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Meeting]
    SET
        [Title] = ISNULL(@Title, [Title]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [HostUserID] = ISNULL(@HostUserID, [HostUserID]),
        [RoomName] = ISNULL(@RoomName, [RoomName]),
        [Status] = ISNULL(@Status, [Status]),
        [ScheduledStartAt] = CASE WHEN @ScheduledStartAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledStartAt, [ScheduledStartAt]) END,
        [ScheduledEndAt] = CASE WHEN @ScheduledEndAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledEndAt, [ScheduledEndAt]) END,
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [AllowPhoneDialIn] = ISNULL(@AllowPhoneDialIn, [AllowPhoneDialIn]),
        [DialInPhoneNumberID] = CASE WHEN @DialInPhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@DialInPhoneNumberID, [DialInPhoneNumberID]) END,
        [DialInCode] = CASE WHEN @DialInCode_Clear = 1 THEN NULL ELSE ISNULL(@DialInCode, [DialInCode]) END,
        [RecordingPolicy] = ISNULL(@RecordingPolicy, [RecordingPolicy]),
        [ConversationID] = CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, [ConversationID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMeetings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMeetings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Meeting table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMeeting]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMeeting];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMeeting
ON [${flyway:defaultSchema}].[Meeting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Meeting]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Meeting] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Meetings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: spDeleteMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMeeting];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMeeting]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Meeting]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeeting] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Meetings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeeting] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for PhoneNumber */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Phone Numbers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProviderID in table PhoneNumber
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PhoneNumber_ProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PhoneNumber]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PhoneNumber_ProviderID ON [${flyway:defaultSchema}].[PhoneNumber] ([ProviderID]);

-- Index for foreign key NumberPoolID in table PhoneNumber
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PhoneNumber_NumberPoolID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PhoneNumber]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PhoneNumber_NumberPoolID ON [${flyway:defaultSchema}].[PhoneNumber] ([NumberPoolID]);

/* SQL text to update entity field related entity name field map for entity field ID 2FC8F97F-3A59-4053-9C3C-4AD7F19FF6B5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2FC8F97F-3A59-4053-9C3C-4AD7F19FF6B5', @RelatedEntityNameFieldMap='Provider';

/* SQL text to update entity field related entity name field map for entity field ID FFAD7D30-F020-4EE9-9452-C283032F833A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FFAD7D30-F020-4EE9-9452-C283032F833A', @RelatedEntityNameFieldMap='NumberPool';

/* Base View SQL for MJ: Phone Numbers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Phone Numbers
-- Item: vwPhoneNumbers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Phone Numbers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PhoneNumber
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPhoneNumbers]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPhoneNumbers];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPhoneNumbers]
AS
SELECT
    p.*,
    MJAIBridgeProvider_ProviderID.[Name] AS [Provider],
    MJNumberPool_NumberPoolID.[Name] AS [NumberPool]
FROM
    [${flyway:defaultSchema}].[PhoneNumber] AS p
INNER JOIN
    [${flyway:defaultSchema}].[AIBridgeProvider] AS MJAIBridgeProvider_ProviderID
  ON
    [p].[ProviderID] = MJAIBridgeProvider_ProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[NumberPool] AS MJNumberPool_NumberPoolID
  ON
    [p].[NumberPoolID] = MJNumberPool_NumberPoolID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPhoneNumbers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Phone Numbers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Phone Numbers
-- Item: Permissions for vwPhoneNumbers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPhoneNumbers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Phone Numbers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Phone Numbers
-- Item: spCreatePhoneNumber
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PhoneNumber
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePhoneNumber]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePhoneNumber];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePhoneNumber]
    @ID uniqueidentifier = NULL,
    @Number nvarchar(20),
    @ProviderID uniqueidentifier,
    @Capabilities nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @NumberPoolID_Clear bit = 0,
    @NumberPoolID uniqueidentifier = NULL,
    @Label_Clear bit = 0,
    @Label nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PhoneNumber]
            (
                [ID],
                [Number],
                [ProviderID],
                [Capabilities],
                [Status],
                [NumberPoolID],
                [Label],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Number,
                @ProviderID,
                ISNULL(@Capabilities, 'Voice'),
                ISNULL(@Status, 'Active'),
                CASE WHEN @NumberPoolID_Clear = 1 THEN NULL ELSE ISNULL(@NumberPoolID, NULL) END,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PhoneNumber]
            (
                [Number],
                [ProviderID],
                [Capabilities],
                [Status],
                [NumberPoolID],
                [Label],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Number,
                @ProviderID,
                ISNULL(@Capabilities, 'Voice'),
                ISNULL(@Status, 'Active'),
                CASE WHEN @NumberPoolID_Clear = 1 THEN NULL ELSE ISNULL(@NumberPoolID, NULL) END,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPhoneNumbers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePhoneNumber] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Phone Numbers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePhoneNumber] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Phone Numbers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Phone Numbers
-- Item: spUpdatePhoneNumber
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PhoneNumber
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePhoneNumber]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePhoneNumber];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePhoneNumber]
    @ID uniqueidentifier,
    @Number nvarchar(20) = NULL,
    @ProviderID uniqueidentifier = NULL,
    @Capabilities nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @NumberPoolID_Clear bit = 0,
    @NumberPoolID uniqueidentifier = NULL,
    @Label_Clear bit = 0,
    @Label nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PhoneNumber]
    SET
        [Number] = ISNULL(@Number, [Number]),
        [ProviderID] = ISNULL(@ProviderID, [ProviderID]),
        [Capabilities] = ISNULL(@Capabilities, [Capabilities]),
        [Status] = ISNULL(@Status, [Status]),
        [NumberPoolID] = CASE WHEN @NumberPoolID_Clear = 1 THEN NULL ELSE ISNULL(@NumberPoolID, [NumberPoolID]) END,
        [Label] = CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, [Label]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPhoneNumbers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPhoneNumbers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePhoneNumber] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PhoneNumber table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePhoneNumber]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePhoneNumber];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePhoneNumber
ON [${flyway:defaultSchema}].[PhoneNumber]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PhoneNumber]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PhoneNumber] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Phone Numbers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePhoneNumber] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Phone Numbers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Phone Numbers
-- Item: spDeletePhoneNumber
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PhoneNumber
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePhoneNumber]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePhoneNumber];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePhoneNumber]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PhoneNumber]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePhoneNumber] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Phone Numbers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePhoneNumber] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: vwRubricCriteria
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Criteria
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RubricCriterion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRubricCriteria]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRubricCriteria];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRubricCriteria]
AS
SELECT
    r.*,
    MJRubricCriterion_ParentID.[Name] AS [Parent],
    MJRubricScale_ScaleID.[Name] AS [Scale]
FROM
    [${flyway:defaultSchema}].[RubricCriterion] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RubricCriterion] AS MJRubricCriterion_ParentID
  ON
    [r].[ParentID] = MJRubricCriterion_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RubricScale] AS MJRubricScale_ScaleID
  ON
    [r].[ScaleID] = MJRubricScale_ScaleID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: Permissions for vwRubricCriteria
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: spCreateRubricCriterion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RubricCriterion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRubricCriterion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRubricCriterion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRubricCriterion]
    @ID uniqueidentifier = NULL,
    @RubricVersionID uniqueidentifier,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Key nvarchar(100),
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Guidance_Clear bit = 0,
    @Guidance nvarchar(MAX) = NULL,
    @NodeType nvarchar(20) = NULL,
    @ScaleID_Clear bit = 0,
    @ScaleID uniqueidentifier = NULL,
    @Weight decimal(18, 6) = NULL,
    @IsAdvisory bit = NULL,
    @IsGate bit = NULL,
    @GateMinimumScore_Clear bit = 0,
    @GateMinimumScore decimal(9, 6) = NULL,
    @NotApplicablePolicy_Clear bit = 0,
    @NotApplicablePolicy nvarchar(30) = NULL,
    @RollupMethod_Clear bit = 0,
    @RollupMethod nvarchar(20) = NULL,
    @EvidenceRequired bit = NULL,
    @RationaleRequired bit = NULL,
    @Sequence int = NULL,
    @EvaluatorConfig_Clear bit = 0,
    @EvaluatorConfig nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RubricCriterion]
            (
                [ID],
                [RubricVersionID],
                [ParentID],
                [Key],
                [Name],
                [Description],
                [Guidance],
                [NodeType],
                [ScaleID],
                [Weight],
                [IsAdvisory],
                [IsGate],
                [GateMinimumScore],
                [NotApplicablePolicy],
                [RollupMethod],
                [EvidenceRequired],
                [RationaleRequired],
                [Sequence],
                [EvaluatorConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RubricVersionID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Key,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, NULL) END,
                ISNULL(@NodeType, 'Criterion'),
                CASE WHEN @ScaleID_Clear = 1 THEN NULL ELSE ISNULL(@ScaleID, NULL) END,
                ISNULL(@Weight, 1),
                ISNULL(@IsAdvisory, 0),
                ISNULL(@IsGate, 0),
                CASE WHEN @GateMinimumScore_Clear = 1 THEN NULL ELSE ISNULL(@GateMinimumScore, NULL) END,
                CASE WHEN @NotApplicablePolicy_Clear = 1 THEN NULL ELSE ISNULL(@NotApplicablePolicy, NULL) END,
                CASE WHEN @RollupMethod_Clear = 1 THEN NULL ELSE ISNULL(@RollupMethod, NULL) END,
                ISNULL(@EvidenceRequired, 0),
                ISNULL(@RationaleRequired, 0),
                ISNULL(@Sequence, 0),
                CASE WHEN @EvaluatorConfig_Clear = 1 THEN NULL ELSE ISNULL(@EvaluatorConfig, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RubricCriterion]
            (
                [RubricVersionID],
                [ParentID],
                [Key],
                [Name],
                [Description],
                [Guidance],
                [NodeType],
                [ScaleID],
                [Weight],
                [IsAdvisory],
                [IsGate],
                [GateMinimumScore],
                [NotApplicablePolicy],
                [RollupMethod],
                [EvidenceRequired],
                [RationaleRequired],
                [Sequence],
                [EvaluatorConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RubricVersionID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Key,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, NULL) END,
                ISNULL(@NodeType, 'Criterion'),
                CASE WHEN @ScaleID_Clear = 1 THEN NULL ELSE ISNULL(@ScaleID, NULL) END,
                ISNULL(@Weight, 1),
                ISNULL(@IsAdvisory, 0),
                ISNULL(@IsGate, 0),
                CASE WHEN @GateMinimumScore_Clear = 1 THEN NULL ELSE ISNULL(@GateMinimumScore, NULL) END,
                CASE WHEN @NotApplicablePolicy_Clear = 1 THEN NULL ELSE ISNULL(@NotApplicablePolicy, NULL) END,
                CASE WHEN @RollupMethod_Clear = 1 THEN NULL ELSE ISNULL(@RollupMethod, NULL) END,
                ISNULL(@EvidenceRequired, 0),
                ISNULL(@RationaleRequired, 0),
                ISNULL(@Sequence, 0),
                CASE WHEN @EvaluatorConfig_Clear = 1 THEN NULL ELSE ISNULL(@EvaluatorConfig, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRubricCriteria] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Rubric Criteria */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: spUpdateRubricCriterion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RubricCriterion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRubricCriterion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRubricCriterion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRubricCriterion]
    @ID uniqueidentifier,
    @RubricVersionID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Key nvarchar(100) = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Guidance_Clear bit = 0,
    @Guidance nvarchar(MAX) = NULL,
    @NodeType nvarchar(20) = NULL,
    @ScaleID_Clear bit = 0,
    @ScaleID uniqueidentifier = NULL,
    @Weight decimal(18, 6) = NULL,
    @IsAdvisory bit = NULL,
    @IsGate bit = NULL,
    @GateMinimumScore_Clear bit = 0,
    @GateMinimumScore decimal(9, 6) = NULL,
    @NotApplicablePolicy_Clear bit = 0,
    @NotApplicablePolicy nvarchar(30) = NULL,
    @RollupMethod_Clear bit = 0,
    @RollupMethod nvarchar(20) = NULL,
    @EvidenceRequired bit = NULL,
    @RationaleRequired bit = NULL,
    @Sequence int = NULL,
    @EvaluatorConfig_Clear bit = 0,
    @EvaluatorConfig nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RubricCriterion]
    SET
        [RubricVersionID] = ISNULL(@RubricVersionID, [RubricVersionID]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Key] = ISNULL(@Key, [Key]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Guidance] = CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, [Guidance]) END,
        [NodeType] = ISNULL(@NodeType, [NodeType]),
        [ScaleID] = CASE WHEN @ScaleID_Clear = 1 THEN NULL ELSE ISNULL(@ScaleID, [ScaleID]) END,
        [Weight] = ISNULL(@Weight, [Weight]),
        [IsAdvisory] = ISNULL(@IsAdvisory, [IsAdvisory]),
        [IsGate] = ISNULL(@IsGate, [IsGate]),
        [GateMinimumScore] = CASE WHEN @GateMinimumScore_Clear = 1 THEN NULL ELSE ISNULL(@GateMinimumScore, [GateMinimumScore]) END,
        [NotApplicablePolicy] = CASE WHEN @NotApplicablePolicy_Clear = 1 THEN NULL ELSE ISNULL(@NotApplicablePolicy, [NotApplicablePolicy]) END,
        [RollupMethod] = CASE WHEN @RollupMethod_Clear = 1 THEN NULL ELSE ISNULL(@RollupMethod, [RollupMethod]) END,
        [EvidenceRequired] = ISNULL(@EvidenceRequired, [EvidenceRequired]),
        [RationaleRequired] = ISNULL(@RationaleRequired, [RationaleRequired]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [EvaluatorConfig] = CASE WHEN @EvaluatorConfig_Clear = 1 THEN NULL ELSE ISNULL(@EvaluatorConfig, [EvaluatorConfig]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRubricCriteria] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRubricCriteria]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricCriterion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRubricCriterion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRubricCriterion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRubricCriterion
ON [${flyway:defaultSchema}].[RubricCriterion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RubricCriterion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RubricCriterion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Rubric Criteria */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: spDeleteRubricCriterion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RubricCriterion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRubricCriterion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricCriterion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricCriterion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RubricCriterion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Rubric Criteria */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: vwRubricCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RubricCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRubricCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRubricCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRubricCategories]
AS
SELECT
    r.*,
    MJRubricCategory_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[RubricCategory] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RubricCategory] AS MJRubricCategory_ParentID
  ON
    [r].[ParentID] = MJRubricCategory_ParentID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: Permissions for vwRubricCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: spCreateRubricCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RubricCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRubricCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRubricCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRubricCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RubricCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RubricCategory]
            (
                [Name],
                [Description],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRubricCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Rubric Categories */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: spUpdateRubricCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RubricCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRubricCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRubricCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRubricCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RubricCategory]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRubricCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRubricCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRubricCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRubricCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRubricCategory
ON [${flyway:defaultSchema}].[RubricCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RubricCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RubricCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Rubric Categories */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: spDeleteRubricCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RubricCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRubricCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RubricCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Rubric Categories */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] TO [cdp_Developer], [cdp_Integration];

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
    DECLARE @MJAIAgentRuns_ConversationID_TotalCost decimal(19, 8)
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
    DECLARE @MJAIAgentRuns_ConversationID_PlanMode bit
    DECLARE @MJAIAgentRuns_ConversationID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID, @MJAIAgentRuns_ConversationID_PlanMode, @MJAIAgentRuns_ConversationID_ExternalSessionID, @MJAIAgentRuns_ConversationID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationIDID, @AgentID = @MJAIAgentRuns_ConversationID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationID_ParentRunID, @Status = @MJAIAgentRuns_ConversationID_Status, @StartedAt = @MJAIAgentRuns_ConversationID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationID_CompletedAt, @Success = @MJAIAgentRuns_ConversationID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationID_ErrorMessage, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentRuns_ConversationID_ConversationID, @UserID = @MJAIAgentRuns_ConversationID_UserID, @Result = @MJAIAgentRuns_ConversationID_Result, @AgentState = @MJAIAgentRuns_ConversationID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConversationID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationID_FinalPayload, @Message = @MJAIAgentRuns_ConversationID_Message, @LastRunID = @MJAIAgentRuns_ConversationID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationID_Data, @Verbose = @MJAIAgentRuns_ConversationID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationID_RunName, @Comments = @MJAIAgentRuns_ConversationID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConversationID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ConversationID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_ConversationID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_ConversationID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID, @MJAIAgentRuns_ConversationID_PlanMode, @MJAIAgentRuns_ConversationID_ExternalSessionID, @MJAIAgentRuns_ConversationID_ContinuationDepth
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
    
    -- Cascade delete from ConversationSkill using cursor to call spDeleteConversationSkill
    DECLARE @MJConversationSkills_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationSkills_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationSkill]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationSkills_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationSkills_ConversationID_cursor INTO @MJConversationSkills_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationSkill] @ID = @MJConversationSkills_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationSkills_ConversationID_cursor INTO @MJConversationSkills_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationSkills_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationSkills_ConversationID_cursor
    
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
    
    -- Cascade update on Meeting using cursor to call spUpdateMeeting
    DECLARE @MJMeetings_ConversationIDID uniqueidentifier
    DECLARE @MJMeetings_ConversationID_Title nvarchar(255)
    DECLARE @MJMeetings_ConversationID_Description nvarchar(MAX)
    DECLARE @MJMeetings_ConversationID_HostUserID uniqueidentifier
    DECLARE @MJMeetings_ConversationID_RoomName nvarchar(255)
    DECLARE @MJMeetings_ConversationID_Status nvarchar(20)
    DECLARE @MJMeetings_ConversationID_ScheduledStartAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_ScheduledEndAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_StartedAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_EndedAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_AllowPhoneDialIn bit
    DECLARE @MJMeetings_ConversationID_DialInPhoneNumberID uniqueidentifier
    DECLARE @MJMeetings_ConversationID_DialInCode nvarchar(20)
    DECLARE @MJMeetings_ConversationID_RecordingPolicy nvarchar(20)
    DECLARE @MJMeetings_ConversationID_ConversationID uniqueidentifier
    DECLARE cascade_update_MJMeetings_ConversationID_cursor CURSOR FOR
        SELECT [ID], [Title], [Description], [HostUserID], [RoomName], [Status], [ScheduledStartAt], [ScheduledEndAt], [StartedAt], [EndedAt], [AllowPhoneDialIn], [DialInPhoneNumberID], [DialInCode], [RecordingPolicy], [ConversationID]
        FROM [${flyway:defaultSchema}].[Meeting]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJMeetings_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJMeetings_ConversationID_cursor INTO @MJMeetings_ConversationIDID, @MJMeetings_ConversationID_Title, @MJMeetings_ConversationID_Description, @MJMeetings_ConversationID_HostUserID, @MJMeetings_ConversationID_RoomName, @MJMeetings_ConversationID_Status, @MJMeetings_ConversationID_ScheduledStartAt, @MJMeetings_ConversationID_ScheduledEndAt, @MJMeetings_ConversationID_StartedAt, @MJMeetings_ConversationID_EndedAt, @MJMeetings_ConversationID_AllowPhoneDialIn, @MJMeetings_ConversationID_DialInPhoneNumberID, @MJMeetings_ConversationID_DialInCode, @MJMeetings_ConversationID_RecordingPolicy, @MJMeetings_ConversationID_ConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMeetings_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMeeting] @ID = @MJMeetings_ConversationIDID, @Title = @MJMeetings_ConversationID_Title, @Description = @MJMeetings_ConversationID_Description, @HostUserID = @MJMeetings_ConversationID_HostUserID, @RoomName = @MJMeetings_ConversationID_RoomName, @Status = @MJMeetings_ConversationID_Status, @ScheduledStartAt = @MJMeetings_ConversationID_ScheduledStartAt, @ScheduledEndAt = @MJMeetings_ConversationID_ScheduledEndAt, @StartedAt = @MJMeetings_ConversationID_StartedAt, @EndedAt = @MJMeetings_ConversationID_EndedAt, @AllowPhoneDialIn = @MJMeetings_ConversationID_AllowPhoneDialIn, @DialInPhoneNumberID = @MJMeetings_ConversationID_DialInPhoneNumberID, @DialInCode = @MJMeetings_ConversationID_DialInCode, @RecordingPolicy = @MJMeetings_ConversationID_RecordingPolicy, @ConversationID_Clear = 1, @ConversationID = @MJMeetings_ConversationID_ConversationID

        FETCH NEXT FROM cascade_update_MJMeetings_ConversationID_cursor INTO @MJMeetings_ConversationIDID, @MJMeetings_ConversationID_Title, @MJMeetings_ConversationID_Description, @MJMeetings_ConversationID_HostUserID, @MJMeetings_ConversationID_RoomName, @MJMeetings_ConversationID_Status, @MJMeetings_ConversationID_ScheduledStartAt, @MJMeetings_ConversationID_ScheduledEndAt, @MJMeetings_ConversationID_StartedAt, @MJMeetings_ConversationID_EndedAt, @MJMeetings_ConversationID_AllowPhoneDialIn, @MJMeetings_ConversationID_DialInPhoneNumberID, @MJMeetings_ConversationID_DialInCode, @MJMeetings_ConversationID_RecordingPolicy, @MJMeetings_ConversationID_ConversationID
    END

    CLOSE cascade_update_MJMeetings_ConversationID_cursor
    DEALLOCATE cascade_update_MJMeetings_ConversationID_cursor
    
    -- Cascade update on UserRoutine using cursor to call spUpdateUserRoutine
    DECLARE @MJUserRoutines_ConversationIDID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_UserID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_EnvironmentID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_Name nvarchar(255)
    DECLARE @MJUserRoutines_ConversationID_Description nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_Status nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_RoutineType nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_TargetType nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_TargetID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_InitialMessage nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_StartingPayload nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_RequestedSkillIDs nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_CronExpression nvarchar(100)
    DECLARE @MJUserRoutines_ConversationID_StartAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_EndAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_NotificationTemplateID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_Timezone nvarchar(100)
    DECLARE @MJUserRoutines_ConversationID_NextRunAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_LastRunAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_LastRunStatus nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_LastResultHash nvarchar(100)
    DECLARE @MJUserRoutines_ConversationID_NotifyCondition nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_NotifyViaInApp bit
    DECLARE @MJUserRoutines_ConversationID_NotifyViaEmail bit
    DECLARE @MJUserRoutines_ConversationID_ConversationID uniqueidentifier
    DECLARE cascade_update_MJUserRoutines_ConversationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [EnvironmentID], [Name], [Description], [Status], [RoutineType], [TargetType], [TargetID], [InitialMessage], [StartingPayload], [RequestedSkillIDs], [CronExpression], [StartAt], [EndAt], [NotificationTemplateID], [Timezone], [NextRunAt], [LastRunAt], [LastRunStatus], [LastResultHash], [NotifyCondition], [NotifyViaInApp], [NotifyViaEmail], [ConversationID]
        FROM [${flyway:defaultSchema}].[UserRoutine]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJUserRoutines_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutines_ConversationID_cursor INTO @MJUserRoutines_ConversationIDID, @MJUserRoutines_ConversationID_UserID, @MJUserRoutines_ConversationID_EnvironmentID, @MJUserRoutines_ConversationID_Name, @MJUserRoutines_ConversationID_Description, @MJUserRoutines_ConversationID_Status, @MJUserRoutines_ConversationID_RoutineType, @MJUserRoutines_ConversationID_TargetType, @MJUserRoutines_ConversationID_TargetID, @MJUserRoutines_ConversationID_InitialMessage, @MJUserRoutines_ConversationID_StartingPayload, @MJUserRoutines_ConversationID_RequestedSkillIDs, @MJUserRoutines_ConversationID_CronExpression, @MJUserRoutines_ConversationID_StartAt, @MJUserRoutines_ConversationID_EndAt, @MJUserRoutines_ConversationID_NotificationTemplateID, @MJUserRoutines_ConversationID_Timezone, @MJUserRoutines_ConversationID_NextRunAt, @MJUserRoutines_ConversationID_LastRunAt, @MJUserRoutines_ConversationID_LastRunStatus, @MJUserRoutines_ConversationID_LastResultHash, @MJUserRoutines_ConversationID_NotifyCondition, @MJUserRoutines_ConversationID_NotifyViaInApp, @MJUserRoutines_ConversationID_NotifyViaEmail, @MJUserRoutines_ConversationID_ConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutines_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutine] @ID = @MJUserRoutines_ConversationIDID, @UserID = @MJUserRoutines_ConversationID_UserID, @EnvironmentID = @MJUserRoutines_ConversationID_EnvironmentID, @Name = @MJUserRoutines_ConversationID_Name, @Description = @MJUserRoutines_ConversationID_Description, @Status = @MJUserRoutines_ConversationID_Status, @RoutineType = @MJUserRoutines_ConversationID_RoutineType, @TargetType = @MJUserRoutines_ConversationID_TargetType, @TargetID = @MJUserRoutines_ConversationID_TargetID, @InitialMessage = @MJUserRoutines_ConversationID_InitialMessage, @StartingPayload = @MJUserRoutines_ConversationID_StartingPayload, @RequestedSkillIDs = @MJUserRoutines_ConversationID_RequestedSkillIDs, @CronExpression = @MJUserRoutines_ConversationID_CronExpression, @StartAt = @MJUserRoutines_ConversationID_StartAt, @EndAt = @MJUserRoutines_ConversationID_EndAt, @NotificationTemplateID = @MJUserRoutines_ConversationID_NotificationTemplateID, @Timezone = @MJUserRoutines_ConversationID_Timezone, @NextRunAt = @MJUserRoutines_ConversationID_NextRunAt, @LastRunAt = @MJUserRoutines_ConversationID_LastRunAt, @LastRunStatus = @MJUserRoutines_ConversationID_LastRunStatus, @LastResultHash = @MJUserRoutines_ConversationID_LastResultHash, @NotifyCondition = @MJUserRoutines_ConversationID_NotifyCondition, @NotifyViaInApp = @MJUserRoutines_ConversationID_NotifyViaInApp, @NotifyViaEmail = @MJUserRoutines_ConversationID_NotifyViaEmail, @ConversationID_Clear = 1, @ConversationID = @MJUserRoutines_ConversationID_ConversationID

        FETCH NEXT FROM cascade_update_MJUserRoutines_ConversationID_cursor INTO @MJUserRoutines_ConversationIDID, @MJUserRoutines_ConversationID_UserID, @MJUserRoutines_ConversationID_EnvironmentID, @MJUserRoutines_ConversationID_Name, @MJUserRoutines_ConversationID_Description, @MJUserRoutines_ConversationID_Status, @MJUserRoutines_ConversationID_RoutineType, @MJUserRoutines_ConversationID_TargetType, @MJUserRoutines_ConversationID_TargetID, @MJUserRoutines_ConversationID_InitialMessage, @MJUserRoutines_ConversationID_StartingPayload, @MJUserRoutines_ConversationID_RequestedSkillIDs, @MJUserRoutines_ConversationID_CronExpression, @MJUserRoutines_ConversationID_StartAt, @MJUserRoutines_ConversationID_EndAt, @MJUserRoutines_ConversationID_NotificationTemplateID, @MJUserRoutines_ConversationID_Timezone, @MJUserRoutines_ConversationID_NextRunAt, @MJUserRoutines_ConversationID_LastRunAt, @MJUserRoutines_ConversationID_LastRunStatus, @MJUserRoutines_ConversationID_LastResultHash, @MJUserRoutines_ConversationID_NotifyCondition, @MJUserRoutines_ConversationID_NotifyViaInApp, @MJUserRoutines_ConversationID_NotifyViaEmail, @MJUserRoutines_ConversationID_ConversationID
    END

    CLOSE cascade_update_MJUserRoutines_ConversationID_cursor
    DEALLOCATE cascade_update_MJUserRoutines_ConversationID_cursor
    

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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversations */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_UI]
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
    DECLARE @MJAIAgentActions_AgentID_DeclareAsNativeTool bit
    DECLARE cascade_update_MJAIAgentActions_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID], [DeclareAsNativeTool]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentActions_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID, @MJAIAgentActions_AgentID_DeclareAsNativeTool

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentActions_AgentID_AgentID, @ActionID = @MJAIAgentActions_AgentID_ActionID, @Status = @MJAIAgentActions_AgentID_Status, @MinExecutionsPerRun = @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_AgentID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_AgentID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_AgentID_CompactMode, @CompactLength = @MJAIAgentActions_AgentID_CompactLength, @CompactPromptID = @MJAIAgentActions_AgentID_CompactPromptID, @DeclareAsNativeTool = @MJAIAgentActions_AgentID_DeclareAsNativeTool

        FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID, @MJAIAgentActions_AgentID_DeclareAsNativeTool
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
    
    -- Cascade delete from AIAgentCredential using cursor to call spDeleteAIAgentCredential
    DECLARE @MJAIAgentCredentials_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCredentials_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCredential]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCredentials_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCredential] @ID = @MJAIAgentCredentials_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    
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
    
    -- Cascade delete from AIAgentPersona using cursor to call spDeleteAIAgentPersona
    DECLARE @MJAIAgentPersonas_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPersonas_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPersona]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPersonas_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPersonas_AgentID_cursor INTO @MJAIAgentPersonas_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPersona] @ID = @MJAIAgentPersonas_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPersonas_AgentID_cursor INTO @MJAIAgentPersonas_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPersonas_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPersonas_AgentID_cursor
    
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
    
    -- Cascade delete from AIAgentRubric using cursor to call spDeleteAIAgentRubric
    DECLARE @MJAIAgentRubrics_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRubrics_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRubric]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRubrics_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRubrics_AgentID_cursor INTO @MJAIAgentRubrics_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRubric] @ID = @MJAIAgentRubrics_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRubrics_AgentID_cursor INTO @MJAIAgentRubrics_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRubrics_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRubrics_AgentID_cursor
    
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
    
    -- Cascade delete from AIAgentSkill using cursor to call spDeleteAIAgentSkill
    DECLARE @MJAIAgentSkills_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSkills_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSkill]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSkills_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSkill] @ID = @MJAIAgentSkills_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSkills_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSkills_AgentID_cursor
    
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
    DECLARE @MJAIAgents_ParentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ParentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ParentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RequirePlanMode bit
    DECLARE @MJAIAgents_ParentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ParentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ParentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ParentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID, @MJAIAgents_ParentID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ParentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ParentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ParentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ParentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ParentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ParentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ParentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ParentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ParentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ParentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ParentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ParentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ParentID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ParentID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID, @MJAIAgents_ParentID_DeclareActionsAsNativeTools
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
    DECLARE @MJAIAgents_DefaultCoAgentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RequirePlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_DefaultCoAgentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools
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
    DECLARE @MJAIPromptRuns_AgentID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_Success bit
    DECLARE @MJAIPromptRuns_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentID_ExecutionOrder int
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
    DECLARE @MJAIPromptRuns_AgentID_DescendantCost decimal(19, 8)
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
    DECLARE @MJAIPromptRuns_AgentID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_AgentID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_AgentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @MJAIPromptRuns_AgentID_InputUnitsUsed, @MJAIPromptRuns_AgentID_OutputUnitsUsed, @MJAIPromptRuns_AgentID_UsageTypeID, @MJAIPromptRuns_AgentID_ToolCallingMode, @MJAIPromptRuns_AgentID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentIDID, @PromptID = @MJAIPromptRuns_AgentID_PromptID, @ModelID = @MJAIPromptRuns_AgentID_ModelID, @VendorID = @MJAIPromptRuns_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIPromptRuns_AgentID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentID_Messages, @Result = @MJAIPromptRuns_AgentID_Result, @TokensUsed = @MJAIPromptRuns_AgentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentID_TotalCost, @Success = @MJAIPromptRuns_AgentID_Success, @ErrorMessage = @MJAIPromptRuns_AgentID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentID_ParentID, @RunType = @MJAIPromptRuns_AgentID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentID_ExecutionOrder, @Cost = @MJAIPromptRuns_AgentID_Cost, @CostCurrency = @MJAIPromptRuns_AgentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentID_Temperature, @TopP = @MJAIPromptRuns_AgentID_TopP, @TopK = @MJAIPromptRuns_AgentID_TopK, @MinP = @MJAIPromptRuns_AgentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentID_Seed, @StopSequences = @MJAIPromptRuns_AgentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentID_ModelSelection, @Status = @MJAIPromptRuns_AgentID_Status, @Cancelled = @MJAIPromptRuns_AgentID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentID_EffortLevel, @RunName = @MJAIPromptRuns_AgentID_RunName, @Comments = @MJAIPromptRuns_AgentID_Comments, @TestRunID = @MJAIPromptRuns_AgentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_AgentID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_AgentID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_AgentID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_AgentID_ToolCallingMode, @UserID = @MJAIPromptRuns_AgentID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @MJAIPromptRuns_AgentID_InputUnitsUsed, @MJAIPromptRuns_AgentID_OutputUnitsUsed, @MJAIPromptRuns_AgentID_UsageTypeID, @MJAIPromptRuns_AgentID_ToolCallingMode, @MJAIPromptRuns_AgentID_UserID
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
    
    -- Cascade delete from AISkillSubAgent using cursor to call spDeleteAISkillSubAgent
    DECLARE @MJAISkillSubAgents_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AISkillSubAgent]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAISkillSubAgent] @ID = @MJAISkillSubAgents_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    
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
    
    -- Cascade update on InteractionEvent using cursor to call spUpdateInteractionEvent
    DECLARE @MJInteractionEvents_ActorAgentIDID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_InteractionID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_EventType nvarchar(20)
    DECLARE @MJInteractionEvents_ActorAgentID_OccurredAt datetimeoffset
    DECLARE @MJInteractionEvents_ActorAgentID_ActorUserID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_ActorAgentID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_Details nvarchar(MAX)
    DECLARE cascade_update_MJInteractionEvents_ActorAgentID_cursor CURSOR FOR
        SELECT [ID], [InteractionID], [EventType], [OccurredAt], [ActorUserID], [ActorAgentID], [Details]
        FROM [${flyway:defaultSchema}].[InteractionEvent]
        WHERE [ActorAgentID] = @ID

    OPEN cascade_update_MJInteractionEvents_ActorAgentID_cursor
    FETCH NEXT FROM cascade_update_MJInteractionEvents_ActorAgentID_cursor INTO @MJInteractionEvents_ActorAgentIDID, @MJInteractionEvents_ActorAgentID_InteractionID, @MJInteractionEvents_ActorAgentID_EventType, @MJInteractionEvents_ActorAgentID_OccurredAt, @MJInteractionEvents_ActorAgentID_ActorUserID, @MJInteractionEvents_ActorAgentID_ActorAgentID, @MJInteractionEvents_ActorAgentID_Details

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJInteractionEvents_ActorAgentID_ActorAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateInteractionEvent] @ID = @MJInteractionEvents_ActorAgentIDID, @InteractionID = @MJInteractionEvents_ActorAgentID_InteractionID, @EventType = @MJInteractionEvents_ActorAgentID_EventType, @OccurredAt = @MJInteractionEvents_ActorAgentID_OccurredAt, @ActorUserID = @MJInteractionEvents_ActorAgentID_ActorUserID, @ActorAgentID_Clear = 1, @ActorAgentID = @MJInteractionEvents_ActorAgentID_ActorAgentID, @Details = @MJInteractionEvents_ActorAgentID_Details

        FETCH NEXT FROM cascade_update_MJInteractionEvents_ActorAgentID_cursor INTO @MJInteractionEvents_ActorAgentIDID, @MJInteractionEvents_ActorAgentID_InteractionID, @MJInteractionEvents_ActorAgentID_EventType, @MJInteractionEvents_ActorAgentID_OccurredAt, @MJInteractionEvents_ActorAgentID_ActorUserID, @MJInteractionEvents_ActorAgentID_ActorAgentID, @MJInteractionEvents_ActorAgentID_Details
    END

    CLOSE cascade_update_MJInteractionEvents_ActorAgentID_cursor
    DEALLOCATE cascade_update_MJInteractionEvents_ActorAgentID_cursor
    
    -- Cascade update on InteractionOffer using cursor to call spUpdateInteractionOffer
    DECLARE @MJInteractionOffers_OfferedByAgentIDID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_InteractionID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_TargetUserID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_Mode nvarchar(20)
    DECLARE @MJInteractionOffers_OfferedByAgentID_Status nvarchar(20)
    DECLARE @MJInteractionOffers_OfferedByAgentID_RoomName nvarchar(255)
    DECLARE @MJInteractionOffers_OfferedByAgentID_CallerLabel nvarchar(255)
    DECLARE @MJInteractionOffers_OfferedByAgentID_Summary nvarchar(MAX)
    DECLARE @MJInteractionOffers_OfferedByAgentID_OfferedAt datetimeoffset
    DECLARE @MJInteractionOffers_OfferedByAgentID_ExpiresAt datetimeoffset
    DECLARE @MJInteractionOffers_OfferedByAgentID_RespondedAt datetimeoffset
    DECLARE cascade_update_MJInteractionOffers_OfferedByAgentID_cursor CURSOR FOR
        SELECT [ID], [InteractionID], [TargetUserID], [OfferedByAgentID], [Mode], [Status], [RoomName], [CallerLabel], [Summary], [OfferedAt], [ExpiresAt], [RespondedAt]
        FROM [${flyway:defaultSchema}].[InteractionOffer]
        WHERE [OfferedByAgentID] = @ID

    OPEN cascade_update_MJInteractionOffers_OfferedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJInteractionOffers_OfferedByAgentID_cursor INTO @MJInteractionOffers_OfferedByAgentIDID, @MJInteractionOffers_OfferedByAgentID_InteractionID, @MJInteractionOffers_OfferedByAgentID_TargetUserID, @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID, @MJInteractionOffers_OfferedByAgentID_Mode, @MJInteractionOffers_OfferedByAgentID_Status, @MJInteractionOffers_OfferedByAgentID_RoomName, @MJInteractionOffers_OfferedByAgentID_CallerLabel, @MJInteractionOffers_OfferedByAgentID_Summary, @MJInteractionOffers_OfferedByAgentID_OfferedAt, @MJInteractionOffers_OfferedByAgentID_ExpiresAt, @MJInteractionOffers_OfferedByAgentID_RespondedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateInteractionOffer] @ID = @MJInteractionOffers_OfferedByAgentIDID, @InteractionID = @MJInteractionOffers_OfferedByAgentID_InteractionID, @TargetUserID = @MJInteractionOffers_OfferedByAgentID_TargetUserID, @OfferedByAgentID_Clear = 1, @OfferedByAgentID = @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID, @Mode = @MJInteractionOffers_OfferedByAgentID_Mode, @Status = @MJInteractionOffers_OfferedByAgentID_Status, @RoomName = @MJInteractionOffers_OfferedByAgentID_RoomName, @CallerLabel = @MJInteractionOffers_OfferedByAgentID_CallerLabel, @Summary = @MJInteractionOffers_OfferedByAgentID_Summary, @OfferedAt = @MJInteractionOffers_OfferedByAgentID_OfferedAt, @ExpiresAt = @MJInteractionOffers_OfferedByAgentID_ExpiresAt, @RespondedAt = @MJInteractionOffers_OfferedByAgentID_RespondedAt

        FETCH NEXT FROM cascade_update_MJInteractionOffers_OfferedByAgentID_cursor INTO @MJInteractionOffers_OfferedByAgentIDID, @MJInteractionOffers_OfferedByAgentID_InteractionID, @MJInteractionOffers_OfferedByAgentID_TargetUserID, @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID, @MJInteractionOffers_OfferedByAgentID_Mode, @MJInteractionOffers_OfferedByAgentID_Status, @MJInteractionOffers_OfferedByAgentID_RoomName, @MJInteractionOffers_OfferedByAgentID_CallerLabel, @MJInteractionOffers_OfferedByAgentID_Summary, @MJInteractionOffers_OfferedByAgentID_OfferedAt, @MJInteractionOffers_OfferedByAgentID_ExpiresAt, @MJInteractionOffers_OfferedByAgentID_RespondedAt
    END

    CLOSE cascade_update_MJInteractionOffers_OfferedByAgentID_cursor
    DEALLOCATE cascade_update_MJInteractionOffers_OfferedByAgentID_cursor
    
    -- Cascade update on MeetingParticipant using cursor to call spUpdateMeetingParticipant
    DECLARE @MJMeetingParticipants_AgentIDID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_MeetingID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_UserID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_AgentID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_ExternalName nvarchar(255)
    DECLARE @MJMeetingParticipants_AgentID_ExternalEmail nvarchar(255)
    DECLARE @MJMeetingParticipants_AgentID_ExternalPhone nvarchar(20)
    DECLARE @MJMeetingParticipants_AgentID_Role nvarchar(20)
    DECLARE @MJMeetingParticipants_AgentID_InviteStatus nvarchar(20)
    DECLARE @MJMeetingParticipants_AgentID_JoinedAt datetimeoffset
    DECLARE @MJMeetingParticipants_AgentID_LeftAt datetimeoffset
    DECLARE cascade_update_MJMeetingParticipants_AgentID_cursor CURSOR FOR
        SELECT [ID], [MeetingID], [UserID], [AgentID], [ExternalName], [ExternalEmail], [ExternalPhone], [Role], [InviteStatus], [JoinedAt], [LeftAt]
        FROM [${flyway:defaultSchema}].[MeetingParticipant]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJMeetingParticipants_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJMeetingParticipants_AgentID_cursor INTO @MJMeetingParticipants_AgentIDID, @MJMeetingParticipants_AgentID_MeetingID, @MJMeetingParticipants_AgentID_UserID, @MJMeetingParticipants_AgentID_AgentID, @MJMeetingParticipants_AgentID_ExternalName, @MJMeetingParticipants_AgentID_ExternalEmail, @MJMeetingParticipants_AgentID_ExternalPhone, @MJMeetingParticipants_AgentID_Role, @MJMeetingParticipants_AgentID_InviteStatus, @MJMeetingParticipants_AgentID_JoinedAt, @MJMeetingParticipants_AgentID_LeftAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMeetingParticipants_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMeetingParticipant] @ID = @MJMeetingParticipants_AgentIDID, @MeetingID = @MJMeetingParticipants_AgentID_MeetingID, @UserID = @MJMeetingParticipants_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJMeetingParticipants_AgentID_AgentID, @ExternalName = @MJMeetingParticipants_AgentID_ExternalName, @ExternalEmail = @MJMeetingParticipants_AgentID_ExternalEmail, @ExternalPhone = @MJMeetingParticipants_AgentID_ExternalPhone, @Role = @MJMeetingParticipants_AgentID_Role, @InviteStatus = @MJMeetingParticipants_AgentID_InviteStatus, @JoinedAt = @MJMeetingParticipants_AgentID_JoinedAt, @LeftAt = @MJMeetingParticipants_AgentID_LeftAt

        FETCH NEXT FROM cascade_update_MJMeetingParticipants_AgentID_cursor INTO @MJMeetingParticipants_AgentIDID, @MJMeetingParticipants_AgentID_MeetingID, @MJMeetingParticipants_AgentID_UserID, @MJMeetingParticipants_AgentID_AgentID, @MJMeetingParticipants_AgentID_ExternalName, @MJMeetingParticipants_AgentID_ExternalEmail, @MJMeetingParticipants_AgentID_ExternalPhone, @MJMeetingParticipants_AgentID_Role, @MJMeetingParticipants_AgentID_InviteStatus, @MJMeetingParticipants_AgentID_JoinedAt, @MJMeetingParticipants_AgentID_LeftAt
    END

    CLOSE cascade_update_MJMeetingParticipants_AgentID_cursor
    DEALLOCATE cascade_update_MJMeetingParticipants_AgentID_cursor
    
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
    DECLARE @MJSearchExecutionLogs_AIAgentID_AISkillID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON nvarchar(MAX)
    DECLARE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor CURSOR FOR
        SELECT [ID], [SearchScopeID], [UserID], [AIAgentID], [Query], [TotalDurationMs], [ResultCount], [RerankerName], [RerankerCostCents], [Status], [FailureReason], [ProvidersJSON], [AISkillID], [PrimaryScopeRecordID], [ScopeDecisionJSON]
        FROM [${flyway:defaultSchema}].[SearchExecutionLog]
        WHERE [AIAgentID] = @ID

    OPEN cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJSearchExecutionLogs_AIAgentID_AIAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] @ID = @MJSearchExecutionLogs_AIAgentIDID, @SearchScopeID = @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @UserID = @MJSearchExecutionLogs_AIAgentID_UserID, @AIAgentID_Clear = 1, @AIAgentID = @MJSearchExecutionLogs_AIAgentID_AIAgentID, @Query = @MJSearchExecutionLogs_AIAgentID_Query, @TotalDurationMs = @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @ResultCount = @MJSearchExecutionLogs_AIAgentID_ResultCount, @RerankerName = @MJSearchExecutionLogs_AIAgentID_RerankerName, @RerankerCostCents = @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @Status = @MJSearchExecutionLogs_AIAgentID_Status, @FailureReason = @MJSearchExecutionLogs_AIAgentID_FailureReason, @ProvidersJSON = @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @AISkillID = @MJSearchExecutionLogs_AIAgentID_AISkillID, @PrimaryScopeRecordID = @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @ScopeDecisionJSON = @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

        FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON
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
    DECLARE @MJTasks_AgentID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_AgentID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_AgentID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_AgentID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_AgentID_ActionID uniqueidentifier
    DECLARE @MJTasks_AgentID_StepType nvarchar(20)
    DECLARE @MJTasks_AgentID_PromptID uniqueidentifier
    DECLARE @MJTasks_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_AgentID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJTasks_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentIDID, @ParentID = @MJTasks_AgentID_ParentID, @Name = @MJTasks_AgentID_Name, @Description = @MJTasks_AgentID_Description, @TypeID = @MJTasks_AgentID_TypeID, @EnvironmentID = @MJTasks_AgentID_EnvironmentID, @ProjectID = @MJTasks_AgentID_ProjectID, @ConversationDetailID = @MJTasks_AgentID_ConversationDetailID, @UserID = @MJTasks_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJTasks_AgentID_AgentID, @Status = @MJTasks_AgentID_Status, @PercentComplete = @MJTasks_AgentID_PercentComplete, @DueAt = @MJTasks_AgentID_DueAt, @StartedAt = @MJTasks_AgentID_StartedAt, @CompletedAt = @MJTasks_AgentID_CompletedAt, @InputPayload = @MJTasks_AgentID_InputPayload, @OutputPayload = @MJTasks_AgentID_OutputPayload, @ErrorMessage = @MJTasks_AgentID_ErrorMessage, @AgentRunID = @MJTasks_AgentID_AgentRunID, @ClaimedBy = @MJTasks_AgentID_ClaimedBy, @ClaimExpiresAt = @MJTasks_AgentID_ClaimExpiresAt, @ActionID = @MJTasks_AgentID_ActionID, @StepType = @MJTasks_AgentID_StepType, @PromptID = @MJTasks_AgentID_PromptID, @Configuration = @MJTasks_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agents */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 11 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a03c9f8-592e-4052-ba65-5d3dc14b4347' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = 'ActorUser')) BEGIN
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
            '1a03c9f8-592e-4052-ba65-5d3dc14b4347',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
            'ActorUser',
            'Actor User',
            NULL,
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa678a84-8b38-4bd1-921e-db04778e79fa' OR (EntityID = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND Name = 'ActorAgent')) BEGIN
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
            'fa678a84-8b38-4bd1-921e-db04778e79fa',
            '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', -- Entity: MJ: Interaction Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'),
            'ActorAgent',
            'Actor Agent',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef67cc6c-e228-4fca-b343-1b177129d199' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'Provider')) BEGIN
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
            'ef67cc6c-e228-4fca-b343-1b177129d199',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
            'Provider',
            'Provider',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e2e9818-8b2a-4679-82c3-2d71d78ff24e' OR (EntityID = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND Name = 'NumberPool')) BEGIN
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
            '1e2e9818-8b2a-4679-82c3-2d71d78ff24e',
            '8D7A7BD5-95E8-428C-874A-3829BAD6685E', -- Entity: MJ: Phone Numbers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'),
            'NumberPool',
            'Number Pool',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb401657-8929-481c-9f64-b92528c381f3' OR (EntityID = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND Name = 'Entity')) BEGIN
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
            'eb401657-8929-481c-9f64-b92528c381f3',
            '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', -- Entity: MJ: Interaction Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'),
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e55f0b48-3561-4df2-a3ce-8f0a9db519b0' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'Meeting')) BEGIN
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
            'e55f0b48-3561-4df2-a3ce-8f0a9db519b0',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'Meeting',
            'Meeting',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7bca307-8f6b-43cb-9705-db186c0c8105' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'User')) BEGIN
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
            'a7bca307-8f6b-43cb-9705-db186c0c8105',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4dce5ea0-3e6d-4db1-b74a-18646c268141' OR (EntityID = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND Name = 'Agent')) BEGIN
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
            '4dce5ea0-3e6d-4db1-b74a-18646c268141',
            'DB511323-5673-45F9-A47F-5A4604FB19B0', -- Entity: MJ: Meeting Participants
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '443ed482-5163-4176-a13c-5509edbfd766' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'HostUser')) BEGIN
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
            '443ed482-5163-4176-a13c-5509edbfd766',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'HostUser',
            'Host User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b72b8314-871d-4726-b816-5a46e5553c31' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'DialInPhoneNumber')) BEGIN
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
            'b72b8314-871d-4726-b816-5a46e5553c31',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
            'DialInPhoneNumber',
            'Dial-In Phone Number',
            NULL,
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '14d2b100-b3c1-4c04-a264-78017c272ffb' OR (EntityID = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND Name = 'Conversation')) BEGIN
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
            '14d2b100-b3c1-4c04-a264-78017c272ffb',
            'D2A67D87-F495-43E3-A91B-5A46E5553C31', -- Entity: MJ: Meetings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '566a23e4-e776-4650-a177-2b71caf6d81d' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'TargetUser')) BEGIN
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
            '566a23e4-e776-4650-a177-2b71caf6d81d',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'TargetUser',
            'Target User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e47b3708-6724-4b6b-b04d-161cdef08015' OR (EntityID = '6DC12139-38A1-43C6-85EE-8066450E762B' AND Name = 'OfferedByAgent')) BEGIN
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
            'e47b3708-6724-4b6b-b04d-161cdef08015',
            '6DC12139-38A1-43C6-85EE-8066450E762B', -- Entity: MJ: Interaction Offers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B'),
            'OfferedByAgent',
            'Offered By Agent',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '289065F3-BBA3-440D-9DE7-10735487BCBE'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AEC569B3-0E6E-4236-B8BF-D91314801F7F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '289065F3-BBA3-440D-9DE7-10735487BCBE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B9966AF0-E7B1-4B23-8170-95B16F7B0DC8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '566A23E4-E776-4650-A177-2B71CAF6D81D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '289065F3-BBA3-440D-9DE7-10735487BCBE'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '289065F3-BBA3-440D-9DE7-10735487BCBE'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '6DC12139-38A1-43C6-85EE-8066450E762B'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '3B41C1DD-758F-47D3-A3BA-C368B166B8F3'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F066BB7C-C684-4327-BAAA-E82A7F028FF5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EF67CC6C-E228-4FCA-B343-1B177129D199'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3B41C1DD-758F-47D3-A3BA-C368B166B8F3'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '3B41C1DD-758F-47D3-A3BA-C368B166B8F3'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'BFE7A1FB-ADFE-4156-BFA1-05E2462E0AFE'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '20988255-327A-46EE-AABA-60B8DF1AC2A4'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1293D1DA-9692-4400-84CA-DE8717F1BE10'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EB401657-8929-481C-9F64-B92528C381F3'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'C0278F57-7911-448C-91D3-CE8F34CE03F1'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1A03C9F8-592E-4052-BA65-5D3DC14B4347'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FA678A84-8B38-4BD1-921E-DB04778E79FA'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CC2FCA9D-7E93-4F97-9501-604926548779'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9C8AFA68-A349-414A-96AD-945BBF309E53'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CC2FCA9D-7E93-4F97-9501-604926548779'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '05DAF2CF-4866-40B5-B135-4CB459A3BAB6'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'CC2FCA9D-7E93-4F97-9501-604926548779'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '05DAF2CF-4866-40B5-B135-4CB459A3BAB6'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'CCBC94BB-3DD7-42BB-9AF4-1E4F26851015'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1627E4DF-796A-4E73-BA99-FC9FBE9F1981'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4A872147-E34E-44C7-BE8B-B8584A12A22C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C3587EB5-7CEC-4751-A7B1-7C485C1DBC1A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A7BCA307-8F6B-43CB-9705-DB186C0C8105'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4DCE5EA0-3E6D-4DB1-B74A-18646C268141'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CCBC94BB-3DD7-42BB-9AF4-1E4F26851015'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A7BCA307-8F6B-43CB-9705-DB186C0C8105'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4DCE5EA0-3E6D-4DB1-B74A-18646C268141'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'A7BCA307-8F6B-43CB-9705-DB186C0C8105'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '4DCE5EA0-3E6D-4DB1-B74A-18646C268141'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'CCBC94BB-3DD7-42BB-9AF4-1E4F26851015'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'DB511323-5673-45F9-A47F-5A4604FB19B0'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '39F217D9-1541-4164-B739-DA850F044AA4'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1E62E57A-F360-4B72-A675-F0799DFFEE6F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '63E402D5-1469-41ED-B8F5-0D31590ECA4D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '443ED482-5163-4176-A13C-5509EDBFD766'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.TurnAddressing 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Connection Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Turn Addressing Mode'
WHERE 
   ID = '833A2074-2A11-42F5-9979-2E1EEDECD4AA';

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Number Pools.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D88DE1CD-4BD3-4148-B810-DC31A7105775';

-- UPDATE Entity Field Category Info MJ: Number Pools.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pool Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BFE7A1FB-ADFE-4156-BFA1-05E2462E0AFE';

-- UPDATE Entity Field Category Info MJ: Number Pools.SelectionRule 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pool Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AD14E7D5-2350-47B7-9B98-D269076B2D19';

-- UPDATE Entity Field Category Info MJ: Number Pools.MaxConcurrentPerNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pool Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F4C28018-3EC2-48D6-A2DE-29E81499466A';

-- UPDATE Entity Field Category Info MJ: Number Pools.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pool Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1FB3EF3E-AE8A-4B00-81D9-9C5C1E6777D9';

-- UPDATE Entity Field Category Info MJ: Number Pools.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E69D38E2-71E8-4F83-845B-3AC13F180A63';

-- UPDATE Entity Field Category Info MJ: Number Pools.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E0F76E25-4C63-4016-BC04-9CA19DFB4B9A';

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Interaction Links.InteractionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Interaction'
WHERE 
   ID = '55297F30-9B4C-470C-A13F-1E0D8AE43866';

-- UPDATE Entity Field Category Info MJ: Interaction Links.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Association',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EB401657-8929-481C-9F64-B92528C381F3';

-- UPDATE Entity Field Category Info MJ: Interaction Links.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Association',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3CE1EDE7-AE95-476E-B7C3-12406F9F6F3A';

-- UPDATE Entity Field Category Info MJ: Interaction Links.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Association',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DFC97246-0832-42DD-B3AA-8C61221C463E';

-- UPDATE Entity Field Category Info MJ: Interaction Links.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Association',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '20988255-327A-46EE-AABA-60B8DF1AC2A4';

-- UPDATE Entity Field Category Info MJ: Interaction Links.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1293D1DA-9692-4400-84CA-DE8717F1BE10';

-- UPDATE Entity Field Category Info MJ: Interaction Links.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '60B609A0-FDF7-4A6B-96A3-3B78CB083D02';

/* Set entity icon to fa fa-phone-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-phone-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('762868c5-11f9-5bdc-8157-7a0da90c172b', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', 'FieldCategoryInfo', '{
  "Pool Configuration": {
    "description": "Settings defining how the phone number pool operates and selects numbers for outbound calls",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set entity icon to fa fa-link */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-link', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9ab93dab-43ea-57da-b06c-9bcf28697c93', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', 'FieldCategoryInfo', '{
  "Interaction Association": {
    "description": "Defines the polymorphic relationship between an interaction and other system records",
    "icon": "fa fa-link"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8fc6c253-3b08-569b-b74e-0ea8fc6e08b0', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', 'FieldCategoryIcons', '{
  "Pool Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('f0c6494e-e751-5d79-83d6-2183e657c01e', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', 'FieldCategoryIcons', '{
  "Interaction Association": "fa fa-link",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C';

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Phone Numbers.Number 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Phone Number Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Tel'
WHERE 
   ID = '3B41C1DD-758F-47D3-A3BA-C368B166B8F3';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.Label 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Phone Number Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F066BB7C-C684-4327-BAAA-E82A7F028FF5';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Phone Number Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '39DBFC58-6334-4131-9552-3573D34CB88A';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.Capabilities 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7B398E84-9F18-4157-AFA1-8FD3756E42CD';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2FEC2316-9558-4DB7-9E87-97C84B742404';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.Provider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Carrier Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EF67CC6C-E228-4FCA-B343-1B177129D199';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.ProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Carrier Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2FC8F97F-3A59-4053-9C3C-4AD7F19FF6B5';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.NumberPool 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routing and Pooling',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1E2E9818-8B2A-4679-82C3-2D71D78FF24E';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.NumberPoolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routing and Pooling',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FFAD7D30-F020-4EE9-9452-C283032F833A';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '69676E28-47FB-41B0-A0CD-5125ABD2DA76';

-- UPDATE Entity Field Category Info MJ: Phone Numbers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FB592E30-5B27-4C8C-93AE-53C04B45BB48';

/* Set entity icon to fa fa-phone */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-phone', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b2380936-30ef-5c74-9e0c-9e98dfc7dafe', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'FieldCategoryInfo', '{
  "Carrier Information": {
    "description": "Details regarding the telephony bridge provider and carrier account",
    "icon": "fa fa-building"
  },
  "Configuration": {
    "description": "Technical settings, capabilities, and lifecycle status",
    "icon": "fa fa-sliders-h"
  },
  "Phone Number Details": {
    "description": "Primary identification and labeling for the phone number",
    "icon": "fa fa-phone"
  },
  "Routing and Pooling": {
    "description": "Information regarding outbound caller ID pools and routing",
    "icon": "fa fa-network-wired"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e86ee2ac-a4cc-5e60-b7f7-88095d5e1f81', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'FieldCategoryIcons', '{
  "Carrier Information": "fa fa-building",
  "Configuration": "fa fa-sliders-h",
  "Phone Number Details": "fa fa-phone",
  "Routing and Pooling": "fa fa-network-wired",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '8D7A7BD5-95E8-428C-874A-3829BAD6685E';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Interaction Events.InteractionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Interaction'
WHERE 
   ID = '4BEDF078-B1B1-4E35-A9E0-CD88952D1ACB';

-- UPDATE Entity Field Category Info MJ: Interaction Events.EventType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C0278F57-7911-448C-91D3-CE8F34CE03F1';

-- UPDATE Entity Field Category Info MJ: Interaction Events.OccurredAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D93CDA9D-E87E-4744-8844-E124AFF94169';

-- UPDATE Entity Field Category Info MJ: Interaction Events.Details 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Context',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'FD05086C-C0CE-403A-8939-E77468D908BE';

-- UPDATE Entity Field Category Info MJ: Interaction Events.ActorUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Actor Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BD207912-2D3C-4800-8C37-179DB85AB4A9';

-- UPDATE Entity Field Category Info MJ: Interaction Events.ActorUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Actor Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1A03C9F8-592E-4052-BA65-5D3DC14B4347';

-- UPDATE Entity Field Category Info MJ: Interaction Events.ActorAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Actor Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CB4B0E76-A6D2-49C1-9CC1-41F548CAD78D';

-- UPDATE Entity Field Category Info MJ: Interaction Events.ActorAgent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Actor Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FA678A84-8B38-4BD1-921E-DB04778E79FA';

-- UPDATE Entity Field Category Info MJ: Interaction Events.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D4B554E4-A81B-4856-8219-B383D6026759';

-- UPDATE Entity Field Category Info MJ: Interaction Events.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '34068729-3004-4212-AE09-7236F89E045E';

-- UPDATE Entity Field Category Info MJ: Interaction Events.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '16B0D3B4-26C3-444A-B617-66DAD6FA6058';

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-history', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('77c67673-a124-55a8-a6f3-3fb6e9c64802', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'FieldCategoryInfo', '{
  "Actor Information": {
    "description": "Details identifying the human or AI agent responsible for the event",
    "icon": "fa fa-user-cog"
  },
  "Interaction Context": {
    "description": "Core details regarding the interaction event, type, and timing",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-database"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0b3a7bad-c08c-59f7-84b4-c264713b3068', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'FieldCategoryIcons', '{
  "Actor Information": "fa fa-user-cog",
  "Interaction Context": "fa fa-info-circle",
  "System Metadata": "fa fa-database"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Interaction Offers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9D30F606-8737-4390-ADA7-A73E4A067798';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.InteractionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Interaction'
WHERE 
   ID = '1819B575-246C-4ABA-AD85-742F523054A8';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.TargetUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3DE69740-7FA4-4719-AF4E-6C274F846EEB';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.TargetUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '566A23E4-E776-4650-A177-2B71CAF6D81D';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.OfferedByAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F08D5A5F-D0C0-485D-BC76-08CDFCAFA3C3';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.OfferedByAgent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E47B3708-6724-4B6B-B04D-161CDEF08015';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.Mode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1233CA0B-7596-4362-A6C7-CC24A670273C';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AEC569B3-0E6E-4236-B8BF-D91314801F7F';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.RoomName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D0490039-C5A3-4203-A5BB-E4BE61F51C1F';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.CallerLabel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '289065F3-BBA3-440D-9DE7-10735487BCBE';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.Summary 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Handover Context',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Markdown'
WHERE 
   ID = '30EB5D7D-BD6A-478D-9E29-7F904B111AB8';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.OfferedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B9966AF0-E7B1-4B23-8170-95B16F7B0DC8';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.ExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '71B68D69-AE66-4685-890E-661F29BEF358';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.RespondedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '38E1E98E-FF12-4B4F-84FB-AC4D9A255BE7';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '55E2322C-3F37-4D56-8F78-59C9E905A00F';

-- UPDATE Entity Field Category Info MJ: Interaction Offers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5D125F1D-3F6C-4C82-AE51-87C1D9A322B3';

/* Set entity icon to fa fa-headset */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-headset', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '6DC12139-38A1-43C6-85EE-8066450E762B';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('39acc3ee-1dfc-5695-a454-681acce53180', '6DC12139-38A1-43C6-85EE-8066450E762B', 'FieldCategoryInfo', '{
  "Handover Context": {
    "description": "Contextual briefing and notes for the person taking over the interaction",
    "icon": "fa fa-align-left"
  },
  "Interaction Details": {
    "description": "Core configuration and status of the interaction handover",
    "icon": "fa fa-comments"
  },
  "Participant Details": {
    "description": "Information about the AI agent and the target person involved in the handover",
    "icon": "fa fa-user-friends"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline": {
    "description": "Key timestamps related to the lifecycle of the offer",
    "icon": "fa fa-clock"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b8b1ab29-28e0-5014-8d85-5d14191c8510', '6DC12139-38A1-43C6-85EE-8066450E762B', 'FieldCategoryIcons', '{
  "Handover Context": "fa fa-align-left",
  "Interaction Details": "fa fa-comments",
  "Participant Details": "fa fa-user-friends",
  "System Metadata": "fa fa-cog",
  "Timeline": "fa fa-clock"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '6DC12139-38A1-43C6-85EE-8066450E762B';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Meeting Participants.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E2361941-23EA-466A-9360-E8C980EBFACC';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.MeetingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Meeting'
WHERE 
   ID = '15040ACE-8782-426C-B2C1-62117E45913D';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = 'B55B3D09-0A92-48B5-8654-F8CE7CA2101F';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent'
WHERE 
   ID = '2C366BDB-25B2-4783-B1D6-444628AED556';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.ExternalName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CCBC94BB-3DD7-42BB-9AF4-1E4F26851015';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.ExternalEmail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email'
WHERE 
   ID = '717EA04C-C814-47E8-9F02-44A95FE336E7';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.ExternalPhone 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Tel'
WHERE 
   ID = '97F9D011-24B7-4775-8305-0EFF11CB4FD9';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name'
WHERE 
   ID = 'A7BCA307-8F6B-43CB-9705-DB186C0C8105';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Participant Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Name'
WHERE 
   ID = '4DCE5EA0-3E6D-4DB1-B74A-18646C268141';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Participation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1627E4DF-796A-4E73-BA99-FC9FBE9F1981';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.InviteStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Participation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4A872147-E34E-44C7-BE8B-B8584A12A22C';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.JoinedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Participation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C3587EB5-7CEC-4751-A7B1-7C485C1DBC1A';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.LeftAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Participation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4A76BA73-9777-4EE1-83FD-6ECFCD56E8DD';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7B08BE5B-88B7-4763-847C-D2FE09533CFF';

-- UPDATE Entity Field Category Info MJ: Meeting Participants.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3BCA8F13-2716-42E4-B1EF-19645A05A774';

/* Set entity icon to fa fa-users */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-users', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('39a98d1c-c71c-59be-9ab3-94a88339ea1c', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'FieldCategoryInfo', '{
  "Meeting Context": {
    "description": "Information linking the participant to a specific meeting session",
    "icon": "fa fa-calendar-alt"
  },
  "Meeting Participation": {
    "description": "Details regarding the participant''s role, status, and meeting attendance times",
    "icon": "fa fa-user-clock"
  },
  "Participant Identity": {
    "description": "Details identifying the user, AI agent, or external guest",
    "icon": "fa fa-id-card"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3902f9c6-a589-5163-98eb-8b19c1497028', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'FieldCategoryIcons', '{
  "Meeting Context": "fa fa-calendar-alt",
  "Meeting Participation": "fa fa-user-clock",
  "Participant Identity": "fa fa-id-card",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'DB511323-5673-45F9-A47F-5A4604FB19B0';

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Interactions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '57D8E2C5-AD8F-4BD6-8B98-66944A7D94C9';

-- UPDATE Entity Field Category Info MJ: Interactions.Channel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BC7F26D8-F03A-468A-92E5-EBE475E99BDA';

-- UPDATE Entity Field Category Info MJ: Interactions.Direction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2C5FC364-9F32-484B-8067-2DA6535058E9';

-- UPDATE Entity Field Category Info MJ: Interactions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6';

-- UPDATE Entity Field Category Info MJ: Interactions.AgentSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Session'
WHERE 
   ID = 'D1741839-8E45-4E5E-8071-3EE3E871B1CE';

-- UPDATE Entity Field Category Info MJ: Interactions.RoomName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E60CC1EF-2CF4-4C43-81F2-D53FB81AE344';

-- UPDATE Entity Field Category Info MJ: Interactions.PhoneNumberID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BCF245AC-6AD3-498C-A43F-6349C39B6319';

-- UPDATE Entity Field Category Info MJ: Interactions.RemoteAddress 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CC2FCA9D-7E93-4F97-9501-604926548779';

-- UPDATE Entity Field Category Info MJ: Interactions.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9C8AFA68-A349-414A-96AD-945BBF309E53';

-- UPDATE Entity Field Category Info MJ: Interactions.AnsweredAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F8EA7452-315A-4413-9E3F-8F99E9AEDF8E';

-- UPDATE Entity Field Category Info MJ: Interactions.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '61F03B68-5772-405D-BC1D-27FF1DA50088';

-- UPDATE Entity Field Category Info MJ: Interactions.EndReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1AA3F25D-0051-4C76-8539-85E5F9681AAB';

-- UPDATE Entity Field Category Info MJ: Interactions.RecordingEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Interaction Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7D58ACE5-0CAF-4A6F-9346-3F90C1982B26';

-- UPDATE Entity Field Category Info MJ: Interactions.ExternalID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '05DAF2CF-4866-40B5-B135-4CB459A3BAB6';

-- UPDATE Entity Field Category Info MJ: Interactions.CostEstimate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Financial Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FE9AFDA9-6F51-428B-BD7C-D8C908AE0FDF';

-- UPDATE Entity Field Category Info MJ: Interactions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '34C13914-4DC6-474E-8545-F3823151D39A';

-- UPDATE Entity Field Category Info MJ: Interactions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9A5C5289-8D3F-451D-8D92-814CB7C896C8';

/* Set entity icon to fa fa-comments */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-comments', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('dbe41c6b-396c-5d5f-ae06-781138e2ae7d', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'FieldCategoryInfo', '{
  "Financial Details": {
    "description": "Estimated costs associated with the interaction usage.",
    "icon": "fa fa-dollar-sign"
  },
  "Interaction Details": {
    "description": "Core descriptive information about the communication channel and status.",
    "icon": "fa fa-info-circle"
  },
  "Interaction Timeline": {
    "description": "Chronological events and duration metrics for the interaction.",
    "icon": "fa fa-clock"
  },
  "System Metadata": {
    "description": "Internal tracking and audit timestamps.",
    "icon": "fa fa-cog"
  },
  "Technical Context": {
    "description": "System and platform identifiers related to the underlying media session.",
    "icon": "fa fa-server"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a6905b66-de52-53c2-bbba-9e742b57a224', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'FieldCategoryIcons', '{
  "Financial Details": "fa fa-dollar-sign",
  "Interaction Details": "fa fa-info-circle",
  "Interaction Timeline": "fa fa-clock",
  "System Metadata": "fa fa-cog",
  "Technical Context": "fa fa-server"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Meetings.Title 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '39F217D9-1541-4164-B739-DA850F044AA4';

-- UPDATE Entity Field Category Info MJ: Meetings.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5A2C1E9B-6C83-4803-A5EA-639ED7689A71';

-- UPDATE Entity Field Category Info MJ: Meetings.HostUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Host User'
WHERE 
   ID = 'B8C2F7C9-6DE0-4741-8F19-81ECD08A2B6E';

-- UPDATE Entity Field Category Info MJ: Meetings.RoomName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1D05DCDD-AC68-49D7-A0E9-A3701F2F1912';

-- UPDATE Entity Field Category Info MJ: Meetings.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Status and Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1E62E57A-F360-4B72-A675-F0799DFFEE6F';

-- UPDATE Entity Field Category Info MJ: Meetings.ScheduledStartAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Status and Timeline',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Start'
WHERE 
   ID = '63E402D5-1469-41ED-B8F5-0D31590ECA4D';

-- UPDATE Entity Field Category Info MJ: Meetings.ScheduledEndAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Status and Timeline',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled End'
WHERE 
   ID = '91DC7642-D457-4D7B-B8C0-77804DB37695';

-- UPDATE Entity Field Category Info MJ: Meetings.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Status and Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '782B4288-581D-44CA-A18B-AF32AF7DC08C';

-- UPDATE Entity Field Category Info MJ: Meetings.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Meeting Status and Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FADDE66D-A143-4125-AFBF-061E91A6AA37';

-- UPDATE Entity Field Category Info MJ: Meetings.AllowPhoneDialIn 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access and Recording',
   GeneratedFormSection = 'Category',
   DisplayName = 'Allow Phone Dial-In'
WHERE 
   ID = '00945934-7691-4DFE-B0B5-8DC7D6102EBD';

-- UPDATE Entity Field Category Info MJ: Meetings.DialInPhoneNumberID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access and Recording',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dial-In Phone Number'
WHERE 
   ID = '6DE00DFC-503D-49BD-B527-C770F7120913';

-- UPDATE Entity Field Category Info MJ: Meetings.DialInCode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access and Recording',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dial-In Code'
WHERE 
   ID = 'CC559752-25DD-4E8E-AA3B-51A66BC82473';

-- UPDATE Entity Field Category Info MJ: Meetings.RecordingPolicy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access and Recording',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '12D4612E-1BC0-4D67-BF74-6C1CEAE0116D';

-- UPDATE Entity Field Category Info MJ: Meetings.ConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access and Recording',
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation'
WHERE 
   ID = 'FC10509E-ECDB-411D-9CD9-96DA88DDDD6F';

-- UPDATE Entity Field Category Info MJ: Meetings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A9DC6A28-AC90-40EF-BB3B-635AE9B77539';

-- UPDATE Entity Field Category Info MJ: Meetings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '41B2E1E4-62B2-4890-B06A-C71ECEC16E85';

/* Set entity icon to fa fa-video */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-video', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4fe36d99-4b6f-5ef2-be49-765f7c49bc0a', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'FieldCategoryInfo', '{
  "Access and Recording": {
    "description": "Configuration for dial-in access, recording policies, and linked conversation data",
    "icon": "fa fa-shield-alt"
  },
  "Meeting Details": {
    "description": "Core descriptive information about the meeting room and its host",
    "icon": "fa fa-info-circle"
  },
  "Meeting Status and Timeline": {
    "description": "Lifecycle status and scheduled or actual timing of the meeting",
    "icon": "fa fa-clock"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('80108c86-1c89-5240-a663-1b527a919c16', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'FieldCategoryIcons', '{
  "Access and Recording": "fa fa-shield-alt",
  "Meeting Details": "fa fa-info-circle",
  "Meeting Status and Timeline": "fa fa-clock",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31';

/* Generated Validation Functions for MJ: AI Agent Rubrics */
-- CHECK constraint for MJ: AI Agent Rubrics: Field: MaxSelfCheckAttempts was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '6FC08957-1E48-4764-8C66-19A01B844E5C'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('4602548c-f559-44fc-b1c2-f016732b49df', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([MaxSelfCheckAttempts] IS NULL OR [MaxSelfCheckAttempts]>=(1))', 'public ValidateMaxSelfCheckAttemptsMinimum(result: ValidationResult) {
	if (this.MaxSelfCheckAttempts != null && this.MaxSelfCheckAttempts < 1) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxSelfCheckAttempts",
			"The maximum self-check attempts must be 1 or greater.",
			this.MaxSelfCheckAttempts,
			ValidationErrorType.Failure
		));
	}
}', 'The maximum number of self-check attempts, if specified, must be 1 or greater.', 'ValidateMaxSelfCheckAttemptsMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '6FC08957-1E48-4764-8C66-19A01B844E5C')
   END;

-- CHECK constraint for MJ: AI Agent Rubrics: Field: PassThreshold was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '8D83ED51-2476-411D-B85E-E8425F6207B6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('7b0c7394-241a-4ebd-949f-4713ca28b78a', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([PassThreshold] IS NULL OR [PassThreshold]>=(0) AND [PassThreshold]<=(1))', 'public ValidatePassThresholdRange(result: ValidationResult) {
	if (this.PassThreshold != null && (this.PassThreshold < 0 || this.PassThreshold > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"PassThreshold",
			"Pass threshold must be a value between 0 and 1.",
			this.PassThreshold,
			ValidationErrorType.Failure
		));
	}
}', 'The pass threshold must be a value between 0 and 1 (inclusive) if it is specified, ensuring it represents a valid percentage or ratio.', 'ValidatePassThresholdRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8D83ED51-2476-411D-B85E-E8425F6207B6')
   END;

-- CHECK constraint for MJ: AI Agent Rubrics: Field: SampleRate was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '97B69645-A312-4A24-8752-429B3598687F'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('d99b9019-5356-42dc-ad7d-dc9c649c7164', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([SampleRate] IS NULL OR [SampleRate]>=(0) AND [SampleRate]<=(1))', 'public ValidateSampleRateRange(result: ValidationResult) {
	if (this.SampleRate != null && (this.SampleRate < 0 || this.SampleRate > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"SampleRate",
			"Sample rate must be a value between 0 and 1.",
			this.SampleRate,
			ValidationErrorType.Failure
		));
	}
}', 'The sample rate, if provided, must be a value between 0 and 1 (inclusive) to represent a valid percentage.', 'ValidateSampleRateRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '97B69645-A312-4A24-8752-429B3598687F')
   END;

-- CHECK constraint for MJ: AI Agent Rubrics @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f6d4c356-e0a9-4c5c-8ff6-01838b9575d6', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Purpose]<>''ProductionSampling'' OR [SampleRate] IS NOT NULL)', 'public ValidateSampleRateRequiredForProductionSampling(result: ValidationResult) {
	if (this.Purpose === "ProductionSampling" && this.SampleRate == null) {
		result.Errors.push(new ValidationErrorInfo(
			"SampleRate",
			"A sample rate must be specified when the purpose is ''ProductionSampling''.",
			this.SampleRate,
			ValidationErrorType.Failure
		));
	}
}', 'If the purpose is set to ''ProductionSampling'', a sample rate must be provided to ensure proper data collection.', 'ValidateSampleRateRequiredForProductionSampling', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3')
   END;

/* Generated Validation Functions for MJ: Interaction Offers */
-- CHECK constraint for MJ: Interaction Offers @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '6DC12139-38A1-43C6-85EE-8066450E762B'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('686e9886-3931-494c-b12a-9f78fe563337', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ExpiresAt]>[OfferedAt])', 'public ValidateExpiresAtAfterOfferedAt(result: ValidationResult) {
	if (this.ExpiresAt != null && this.OfferedAt != null) {
		const expiresTime = new Date(this.ExpiresAt).getTime();
		const offeredTime = new Date(this.OfferedAt).getTime();
		if (expiresTime <= offeredTime) {
			result.Errors.push(new ValidationErrorInfo(
				"ExpiresAt",
				"The expiration date and time must be after the offered date and time.",
				this.ExpiresAt,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The expiration date and time must be after the offered date and time to ensure the offer has a valid duration.', 'ValidateExpiresAtAfterOfferedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '6DC12139-38A1-43C6-85EE-8066450E762B')
   END;

-- CHECK constraint for MJ: Interaction Offers @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '6DC12139-38A1-43C6-85EE-8066450E762B'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('904a8b22-1ea0-48db-9d6f-45d9b18ceb7d', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([RespondedAt] IS NULL OR [RespondedAt]>=[OfferedAt])', 'public ValidateRespondedAtAfterOfferedAt(result: ValidationResult) {
	if (this.RespondedAt != null && this.OfferedAt != null && this.RespondedAt < this.OfferedAt) {
		result.Errors.push(new ValidationErrorInfo(
			"RespondedAt",
			"The response date and time cannot be earlier than the offer date and time.",
			this.RespondedAt,
			ValidationErrorType.Failure
		));
	}
}', 'The response date and time must be at or after the date and time the offer was made.', 'ValidateRespondedAtAfterOfferedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '6DC12139-38A1-43C6-85EE-8066450E762B')
   END;

/* Generated Validation Functions for MJ: Interactions */
-- CHECK constraint for MJ: Interactions: Field: CostEstimate was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'FE9AFDA9-6F51-428B-BD7C-D8C908AE0FDF'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('33037475-a12e-4a24-9d07-5743050e913b', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([CostEstimate] IS NULL OR [CostEstimate]>=(0))', 'public ValidateCostEstimateGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.CostEstimate != null && this.CostEstimate < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"CostEstimate",
			"Cost estimate must be greater than or equal to zero.",
			this.CostEstimate,
			ValidationErrorType.Failure
		));
	}
}', 'The cost estimate, if provided, must be greater than or equal to zero.', 'ValidateCostEstimateGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'FE9AFDA9-6F51-428B-BD7C-D8C908AE0FDF')
   END;

-- CHECK constraint for MJ: Interactions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('3cd4344b-b2af-4346-9def-4b2b5ea5cafe', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([AnsweredAt] IS NULL OR [AnsweredAt]>=[StartedAt])', 'public ValidateAnsweredAtAfterStartedAt(result: ValidationResult) {
	// Check if AnsweredAt is populated before performing comparison
	if (this.AnsweredAt != null && this.StartedAt != null) {
		if (this.AnsweredAt < this.StartedAt) {
			result.Errors.push(new ValidationErrorInfo(
				"AnsweredAt",
				"The answered date and time cannot be earlier than the start date and time.",
				this.AnsweredAt,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The time a session is answered must be at or after the time the session started.', 'ValidateAnsweredAtAfterStartedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB')
   END;

-- CHECK constraint for MJ: Interactions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('aaedabbb-0e54-4737-9d7b-e4eac00d0f59', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([EndedAt] IS NULL OR [EndedAt]>=[StartedAt])', 'public ValidateEndedAtAfterStartedAt(result: ValidationResult) {
	if (this.EndedAt != null && this.StartedAt != null) {
		if (this.EndedAt < this.StartedAt) {
			result.Errors.push(new ValidationErrorInfo(
				"EndedAt",
				"The end date and time cannot be earlier than the start date and time.",
				this.EndedAt,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that the end date and time of a session is not earlier than its start date and time.', 'ValidateEndedAtAfterStartedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB')
   END;

/* Generated Validation Functions for MJ: Meeting Participants */
-- CHECK constraint for MJ: Meeting Participants: Field: ExternalPhone was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '97F9D011-24B7-4775-8305-0EFF11CB4FD9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('5ac626c3-f8f7-4ad1-b0e2-c71aea5b5df8', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ExternalPhone] IS NULL OR [ExternalPhone] like ''+[1-9]%'' AND NOT [ExternalPhone] like ''+%[^0-9]%'' AND (len([ExternalPhone])>=(5) AND len([ExternalPhone])<=(16)))', 'public ValidateExternalPhoneFormat(result: ValidationResult) {
	if (this.ExternalPhone != null) {
		const phone = this.ExternalPhone;
		const hasValidFormat = /^\+[1-9][0-9]*$/.test(phone);
		const hasValidLength = phone.length >= 5 && phone.length <= 16;
		
		if (!hasValidFormat || !hasValidLength) {
			result.Errors.push(new ValidationErrorInfo(
				"ExternalPhone",
				"External phone number must start with ''+'' followed by a digit from 1 to 9, contain only digits, and be between 5 and 16 characters in length.",
				this.ExternalPhone,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If an external phone number is provided, it must be in international format starting with ''+'' followed by a non-zero digit, contain only numbers, and be between 5 and 16 characters in length.', 'ValidateExternalPhoneFormat', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '97F9D011-24B7-4775-8305-0EFF11CB4FD9')
   END;

-- CHECK constraint for MJ: Meeting Participants @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('a725584e-3b64-463c-bcc9-1f82fb374544', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([AgentID] IS NULL AND [Role]<>''Agent'' OR [AgentID] IS NOT NULL AND [Role]=''Agent'')', 'public ValidateAgentIdAndRoleMatch(result: ValidationResult) {
	// If AgentID is null, Role cannot be ''Agent''
	if (this.AgentID == null && this.Role === "Agent") {
		result.Errors.push(new ValidationErrorInfo(
			"Role",
			"The ''Agent'' role requires an Agent ID to be specified.",
			this.Role,
			ValidationErrorType.Failure
		));
	}
	// If AgentID is not null, Role must be ''Agent''
	if (this.AgentID != null && this.Role !== "Agent") {
		result.Errors.push(new ValidationErrorInfo(
			"AgentID",
			"An Agent ID can only be assigned to users with the ''Agent'' role.",
			this.AgentID,
			ValidationErrorType.Failure
		));
	}
}', 'An agent identifier must be provided if and only if the role is set to ''Agent''.', 'ValidateAgentIdAndRoleMatch', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DB511323-5673-45F9-A47F-5A4604FB19B0')
   END;

-- CHECK constraint for MJ: Meeting Participants @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('d6d48cf7-ef82-4521-9268-d18dcf9407a1', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([LeftAt] IS NULL OR [JoinedAt] IS NOT NULL AND [LeftAt]>=[JoinedAt])', 'public ValidateLeftAtComparedToJoinedAt(result: ValidationResult) {
	if (this.LeftAt != null) {
		if (this.JoinedAt == null) {
			result.Errors.push(new ValidationErrorInfo(
				"LeftAt",
				"A participant cannot have a departure time without a join time.",
				this.LeftAt,
				ValidationErrorType.Failure
			));
		} else {
			const leftTime = new Date(this.LeftAt).getTime();
			const joinedTime = new Date(this.JoinedAt).getTime();
			if (leftTime < joinedTime) {
				result.Errors.push(new ValidationErrorInfo(
					"LeftAt",
					"The departure time must be greater than or equal to the join time.",
					this.LeftAt,
					ValidationErrorType.Failure
				));
			}
		}
	}
}', 'Ensures that if a participant has a departure time (LeftAt), they must also have a join time (JoinedAt), and the departure time must be after or equal to the join time.', 'ValidateLeftAtComparedToJoinedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DB511323-5673-45F9-A47F-5A4604FB19B0')
   END;

-- CHECK constraint for MJ: Meeting Participants @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'DB511323-5673-45F9-A47F-5A4604FB19B0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('18434713-8c74-4742-8f29-79ff5f2505bc', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(((case when [UserID] IS NOT NULL then (1) else (0) end+case when [AgentID] IS NOT NULL then (1) else (0) end)+case when [ExternalEmail] IS NOT NULL OR [ExternalPhone] IS NOT NULL then (1) else (0) end)=(1))', 'public ValidateSingleInviteeType(result: ValidationResult) {
	let identityCount = 0;
	if (this.UserID != null) {
		identityCount++;
	}
	if (this.AgentID != null) {
		identityCount++;
	}
	if (this.ExternalEmail != null || this.ExternalPhone != null) {
		identityCount++;
	}

	if (identityCount !== 1) {
		result.Errors.push(new ValidationErrorInfo(
			"UserID",
			"An invitee must be associated with exactly one identity type: either an internal user, an agent, or an external contact with an email or phone number.",
			this.UserID,
			ValidationErrorType.Failure
		));
	}
}', 'An invitee must be exactly one of three types: an internal user, an agent, or an external contact (defined by having an external email or phone number).', 'ValidateSingleInviteeType', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DB511323-5673-45F9-A47F-5A4604FB19B0')
   END;

/* Generated Validation Functions for MJ: Meetings */
-- CHECK constraint for MJ: Meetings: Field: DialInCode was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CC559752-25DD-4E8E-AA3B-51A66BC82473'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('124264cc-f37b-40f6-acbe-442d7ed27f57', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DialInCode] IS NULL OR NOT [DialInCode] like ''%[^0-9]%'' AND (len([DialInCode])>=(6) AND len([DialInCode])<=(20)))', 'public ValidateDialInCodeFormatAndLength(result: ValidationResult) {
	if (this.DialInCode != null && this.DialInCode !== "") {
		const isNumeric = /^[0-9]+$/.test(this.DialInCode);
		const hasValidLength = this.DialInCode.length >= 6 && this.DialInCode.length <= 20;

		if (!isNumeric || !hasValidLength) {
			result.Errors.push(new ValidationErrorInfo(
				"DialInCode",
				"The dial-in code must contain only numbers and be between 6 and 20 digits long.",
				this.DialInCode,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The dial-in code, if provided, must consist only of numeric digits and be between 6 and 20 characters in length.', 'ValidateDialInCodeFormatAndLength', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'CC559752-25DD-4E8E-AA3B-51A66BC82473')
   END;

-- CHECK constraint for MJ: Meetings @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('e800ae2a-8cd2-4457-b3d8-c58e51c17f6e', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([AllowPhoneDialIn]=(0) OR [DialInPhoneNumberID] IS NOT NULL AND [DialInCode] IS NOT NULL)', 'public ValidateDialInInformationWhenPhoneDialInAllowed(result: ValidationResult) {
	// If phone dial-in is enabled, both DialInPhoneNumberID and DialInCode are required
	if (this.AllowPhoneDialIn) {
		if (this.DialInPhoneNumberID == null || this.DialInCode == null) {
			result.Errors.push(new ValidationErrorInfo(
				"AllowPhoneDialIn",
				"When phone dial-in is enabled, both a dial-in phone number and a dial-in code must be provided.",
				this.AllowPhoneDialIn,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If phone dial-in is allowed, both a dial-in phone number and a dial-in code must be provided.', 'ValidateDialInInformationWhenPhoneDialInAllowed', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D2A67D87-F495-43E3-A91B-5A46E5553C31')
   END;

-- CHECK constraint for MJ: Meetings @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('e46e31f6-3a20-4f93-ab5e-0aa7f3015a3f', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([EndedAt] IS NULL OR [StartedAt] IS NOT NULL AND [EndedAt]>=[StartedAt])', '	public ValidateEndedAtComparedToStartedAt(result: ValidationResult) {
		if (this.EndedAt != null) {
			if (this.StartedAt == null) {
				result.Errors.push(new ValidationErrorInfo(
					"EndedAt",
					"An end date cannot be set without a start date.",
					this.EndedAt,
					ValidationErrorType.Failure
				));
			} else if (this.EndedAt < this.StartedAt) {
				result.Errors.push(new ValidationErrorInfo(
					"EndedAt",
					"The end date and time must be equal to or after the start date and time.",
					this.EndedAt,
					ValidationErrorType.Failure
				));
			}
		}
	}', 'An end date and time can only be set if a start date and time is also set, and the end date and time must be equal to or after the start date and time.', 'ValidateEndedAtComparedToStartedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D2A67D87-F495-43E3-A91B-5A46E5553C31')
   END;

-- CHECK constraint for MJ: Meetings @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('8048eea3-1f24-477d-a066-c4589095e223', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ScheduledEndAt] IS NULL OR [ScheduledStartAt] IS NOT NULL AND [ScheduledEndAt]>[ScheduledStartAt])', 'public ValidateScheduledEndAtAfterScheduledStartAt(result: ValidationResult) {
	// If ScheduledEndAt is provided, ScheduledStartAt must also be provided and must be earlier than ScheduledEndAt
	if (this.ScheduledEndAt != null) {
		if (this.ScheduledStartAt == null || this.ScheduledEndAt <= this.ScheduledStartAt) {
			result.Errors.push(new ValidationErrorInfo(
				"ScheduledEndAt",
				"The scheduled end date must be after the scheduled start date, and a start date must be provided if an end date is set.",
				this.ScheduledEndAt,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a scheduled end date is specified, a scheduled start date must also be provided, and the end date must be chronologically after the start date.', 'ValidateScheduledEndAtAfterScheduledStartAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D2A67D87-F495-43E3-A91B-5A46E5553C31')
   END;

/* Generated Validation Functions for MJ: Number Pools */
-- CHECK constraint for MJ: Number Pools: Field: MaxConcurrentPerNumber was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'F4C28018-3EC2-48D6-A2DE-29E81499466A'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('5e62e029-3bfa-4b78-9dd2-f27a167790bb', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([MaxConcurrentPerNumber] IS NULL OR [MaxConcurrentPerNumber]>(0))', 'public ValidateMaxConcurrentPerNumberGreaterThanZero(result: ValidationResult) {
	if (this.MaxConcurrentPerNumber != null && this.MaxConcurrentPerNumber <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxConcurrentPerNumber",
			"The maximum concurrent limit per number must be greater than zero.",
			this.MaxConcurrentPerNumber,
			ValidationErrorType.Failure
		));
	}
}', 'The maximum concurrent limit per number must be greater than zero if it is specified.', 'ValidateMaxConcurrentPerNumberGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F4C28018-3EC2-48D6-A2DE-29E81499466A')
   END;

/* Generated Validation Functions for MJ: Phone Numbers */
-- CHECK constraint for MJ: Phone Numbers: Field: Number was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '3B41C1DD-758F-47D3-A3BA-C368B166B8F3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('e9889b46-8599-46e3-832e-018f8ef4b159', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Number] like ''+[1-9]%'' AND NOT [Number] like ''+%[^0-9]%'' AND (len([Number])>=(5) AND len([Number])<=(16)))', 'public ValidateNumberInternationalFormat(result: ValidationResult) {
	if (this.Number != null) {
		// Matches ''+'' followed by 1-9, then only digits, with total length 5 to 16
		const phoneRegex = /^\+[1-9][0-9]{4,15}$/;
		if (!phoneRegex.test(this.Number)) {
			result.Errors.push(new ValidationErrorInfo(
				"Number",
				"The phone number must start with ''+'' followed by a digit from 1 to 9, contain only numbers, and be between 5 and 16 characters long.",
				this.Number,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The phone number must be in a valid international format, starting with a ''+'' followed by a non-zero digit, containing only digits, and having a total length between 5 and 16 characters.', 'ValidateNumberInternationalFormat', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '3B41C1DD-758F-47D3-A3BA-C368B166B8F3')
   END;

/* Generated Validation Functions for MJ: Rubric Bands */
-- CHECK constraint for MJ: Rubric Bands @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('72f89a92-b593-470b-be9e-a86736066996', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([MinScore]>=(0) AND [MaxScore]<=(1) AND [MinScore]<[MaxScore])', 'public ValidateMinAndMaxScoreRange(result: ValidationResult) {
	if (this.MinScore != null && this.MaxScore != null) {
		if (this.MinScore < 0) {
			result.Errors.push(new ValidationErrorInfo(
				"MinScore",
				"The minimum score must be 0 or greater.",
				this.MinScore,
				ValidationErrorType.Failure
			));
		}
		if (this.MaxScore > 1) {
			result.Errors.push(new ValidationErrorInfo(
				"MaxScore",
				"The maximum score must be 1 or less.",
				this.MaxScore,
				ValidationErrorType.Failure
			));
		}
		if (this.MinScore >= this.MaxScore) {
			result.Errors.push(new ValidationErrorInfo(
				"MinScore",
				"The minimum score must be less than the maximum score.",
				this.MinScore,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The minimum score must be 0 or greater, the maximum score must be 1 or less, and the minimum score must be strictly less than the maximum score.', 'ValidateMinAndMaxScoreRange', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107')
   END;

/* Generated Validation Functions for MJ: Rubric Criteria */
-- CHECK constraint for MJ: Rubric Criteria: Field: GateMinimumScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'B4CA6ED8-DFDC-4C24-9B81-D88DB02B3782'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('9ae072fd-963c-45e9-97e8-55fb4a5a6c62', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([GateMinimumScore] IS NULL OR [GateMinimumScore]>=(0) AND [GateMinimumScore]<=(1))', 'public ValidateGateMinimumScoreRange(result: ValidationResult) {
	if (this.GateMinimumScore != null && (this.GateMinimumScore < 0 || this.GateMinimumScore > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"GateMinimumScore",
			"Gate minimum score must be between 0 and 1.",
			this.GateMinimumScore,
			ValidationErrorType.Failure
		));
	}
}', 'The gate minimum score must be between 0 and 1 (inclusive) if it is specified.', 'ValidateGateMinimumScoreRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B4CA6ED8-DFDC-4C24-9B81-D88DB02B3782')
   END;

-- CHECK constraint for MJ: Rubric Criteria: Field: Weight was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'AB71F12D-2B15-4A66-B12A-C75F791CCC5A'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('e07d1345-925f-4c12-82fc-00ccc4d3f99b', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Weight]>=(0))', 'public ValidateWeightGreaterThanOrEqualToZero(result: ValidationResult) {
    if (this.Weight != null && this.Weight < 0) {
        result.Errors.push(new ValidationErrorInfo(
            "Weight",
            "Weight must be greater than or equal to 0.",
            this.Weight,
            ValidationErrorType.Failure
        ));
    }
}', 'The weight value must be greater than or equal to zero. Negative weights are not permitted.', 'ValidateWeightGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'AB71F12D-2B15-4A66-B12A-C75F791CCC5A')
   END;

-- CHECK constraint for MJ: Rubric Criteria @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('27b353c4-681e-4943-b129-057de7d12968', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([IsAdvisory]=(1) AND [IsGate]=(1)))', 'public ValidateAdvisoryAndGateFlags(result: ValidationResult) {
	if (this.IsAdvisory && this.IsGate) {
		result.Errors.push(new ValidationErrorInfo(
			"IsAdvisory",
			"An item cannot be marked as both an Advisory and a Gate simultaneously.",
			this.IsAdvisory,
			ValidationErrorType.Failure
		));
	}
}', 'An item cannot be marked as both an Advisory and a Gate at the same time.', 'ValidateAdvisoryAndGateFlags', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D')
   END;

-- CHECK constraint for MJ: Rubric Criteria @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('0761ead5-23e3-45ce-b577-08164589ffb4', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([IsGate]=(0) OR [GateMinimumScore] IS NOT NULL)', 'public ValidateGateMinimumScoreRequired(result: ValidationResult) {
	if (this.IsGate && this.GateMinimumScore == null) {
		result.Errors.push(new ValidationErrorInfo(
			"GateMinimumScore",
			"A gate minimum score must be specified when the node is designated as a gate.",
			this.GateMinimumScore,
			ValidationErrorType.Failure
		));
	}
}', 'If a rubric node is designated as a gate, a gate minimum score must be provided to ensure the gatekeeping threshold is defined.', 'ValidateGateMinimumScoreRequired', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D')
   END;

-- CHECK constraint for MJ: Rubric Criteria @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('1b964ad7-03de-4138-bd08-fda28cc6a91e', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([NodeType]=''Group'' OR [RollupMethod] IS NULL)', 'public ValidateRollupMethodOnlyForGroupNodeType(result: ValidationResult) {
	if (this.NodeType !== "Group" && this.RollupMethod != null) {
		result.Errors.push(new ValidationErrorInfo(
			"RollupMethod",
			"Rollup method can only be specified when the NodeType is ''Group''.",
			this.RollupMethod,
			ValidationErrorType.Failure
		));
	}
}', 'A rollup method can only be specified for Group nodes. If the node is not a Group, the rollup method must be empty.', 'ValidateRollupMethodOnlyForGroupNodeType', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D')
   END;

-- CHECK constraint for MJ: Rubric Criteria @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('2fea2050-c5c7-4e49-952f-8e57570fb740', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([NodeType]=''Criterion'' AND [ScaleID] IS NOT NULL OR [NodeType]=''Group'' AND [ScaleID] IS NULL)', 'public ValidateScaleIDBasedOnNodeType(result: ValidationResult) {
	if (this.NodeType === ''Criterion'' && this.ScaleID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"ScaleID",
			"A Scale must be selected when the Node Type is ''Criterion''.",
			this.ScaleID,
			ValidationErrorType.Failure
		));
	} else if (this.NodeType === ''Group'' && this.ScaleID != null) {
		result.Errors.push(new ValidationErrorInfo(
			"ScaleID",
			"A Scale cannot be assigned when the Node Type is ''Group''.",
			this.ScaleID,
			ValidationErrorType.Failure
		));
	}
}', 'A Criterion node must have an associated Scale, whereas a Group node must not have a Scale.', 'ValidateScaleIDBasedOnNodeType', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D')
   END;

/* Generated Validation Functions for MJ: Rubric Criterion Levels */
-- CHECK constraint for MJ: Rubric Criterion Levels @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('473e95c6-33b3-4d31-b64c-dc5d5a353667', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ScaleLevelID] IS NOT NULL AND [AnchorValue] IS NULL OR [ScaleLevelID] IS NULL AND [AnchorValue] IS NOT NULL)', 'public ValidateScaleLevelIDAndAnchorValueMutualExclusion(result: ValidationResult) {
	const hasScaleLevel = this.ScaleLevelID != null;
	const hasAnchorValue = this.AnchorValue != null;

	if (hasScaleLevel && hasAnchorValue) {
		result.Errors.push(new ValidationErrorInfo(
			"ScaleLevelID",
			"Cannot specify both a Scale Level and an Anchor Value. Please provide only one.",
			this.ScaleLevelID,
			ValidationErrorType.Failure
		));
	} else if (!hasScaleLevel && !hasAnchorValue) {
		result.Errors.push(new ValidationErrorInfo(
			"ScaleLevelID",
			"Either a Scale Level or an Anchor Value must be specified.",
			this.ScaleLevelID,
			ValidationErrorType.Failure
		));
	}
}', 'Each record must have either a Scale Level or an Anchor Value specified, but not both, to ensure that the criteria definition is unambiguous.', 'ValidateScaleLevelIDAndAnchorValueMutualExclusion', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7')
   END;

/* Generated Validation Functions for MJ: Rubric Evaluation Scores */
-- CHECK constraint for MJ: Rubric Evaluation Scores @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '122ED707-2BC0-42E8-B25F-6BDDE7164962'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('1fd20bc4-6a9c-419d-b71a-15279b1b10b8', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([IsNotApplicable]=(0) OR [ScaleLevelID] IS NULL AND [RawValue] IS NULL AND [NormalizedScore] IS NULL)', 'public ValidateFieldsWhenNotApplicable(result: ValidationResult) {
	if (this.IsNotApplicable) {
		if (this.ScaleLevelID != null || this.RawValue != null || this.NormalizedScore != null) {
			result.Errors.push(new ValidationErrorInfo(
				"IsNotApplicable",
				"When a criterion is marked as Not Applicable, Scale Level, Raw Value, and Normalized Score must all be empty.",
				this.IsNotApplicable,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a record is marked as Not Applicable, it must not have a Scale Level, Raw Value, or Normalized Score associated with it.', 'ValidateFieldsWhenNotApplicable', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '122ED707-2BC0-42E8-B25F-6BDDE7164962')
   END;

-- CHECK constraint for MJ: Rubric Evaluation Scores @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '122ED707-2BC0-42E8-B25F-6BDDE7164962'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('b211eb12-8d48-42c8-a27b-6172921767f6', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(([NormalizedScore] IS NULL OR [NormalizedScore]>=(0) AND [NormalizedScore]<=(1)) AND ([EffectiveWeight] IS NULL OR [EffectiveWeight]>=(0) AND [EffectiveWeight]<=(1)) AND ([OverallContribution] IS NULL OR [OverallContribution]>=(0) AND [OverallContribution]<=(1)) AND ([Completeness] IS NULL OR [Completeness]>=(0) AND [Completeness]<=(1)) AND ([Confidence] IS NULL OR [Confidence]>=(0) AND [Confidence]<=(1)))', 'public ValidateMetricsRange(result: ValidationResult) {
    if (this.NormalizedScore != null && (this.NormalizedScore < 0 || this.NormalizedScore > 1)) {
        result.Errors.push(new ValidationErrorInfo(
            "NormalizedScore",
            "Normalized Score must be between 0 and 1.",
            this.NormalizedScore,
            ValidationErrorType.Failure
        ));
    }
    if (this.EffectiveWeight != null && (this.EffectiveWeight < 0 || this.EffectiveWeight > 1)) {
        result.Errors.push(new ValidationErrorInfo(
            "EffectiveWeight",
            "Effective Weight must be between 0 and 1.",
            this.EffectiveWeight,
            ValidationErrorType.Failure
        ));
    }
    if (this.OverallContribution != null && (this.OverallContribution < 0 || this.OverallContribution > 1)) {
        result.Errors.push(new ValidationErrorInfo(
            "OverallContribution",
            "Overall Contribution must be between 0 and 1.",
            this.OverallContribution,
            ValidationErrorType.Failure
        ));
    }
    if (this.Completeness != null && (this.Completeness < 0 || this.Completeness > 1)) {
        result.Errors.push(new ValidationErrorInfo(
            "Completeness",
            "Completeness must be between 0 and 1.",
            this.Completeness,
            ValidationErrorType.Failure
        ));
    }
    if (this.Confidence != null && (this.Confidence < 0 || this.Confidence > 1)) {
        result.Errors.push(new ValidationErrorInfo(
            "Confidence",
            "Confidence must be between 0 and 1.",
            this.Confidence,
            ValidationErrorType.Failure
        ));
    }
}', 'Ensures that key evaluation metrics—including Normalized Score, Effective Weight, Overall Contribution, Completeness, and Confidence—are always expressed as ratios or percentages between 0 and 1 (inclusive) when they are provided.', 'ValidateMetricsRange', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '122ED707-2BC0-42E8-B25F-6BDDE7164962')
   END;

/* Generated Validation Functions for MJ: Rubric Evaluations */
-- CHECK constraint for MJ: Rubric Evaluations @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('0872a89b-5b75-4068-b4bc-675b42f1579d', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ContextEntityID] IS NULL AND [ContextRecordID] IS NULL OR [ContextEntityID] IS NOT NULL AND [ContextRecordID] IS NOT NULL)', 'public ValidateContextEntityAndRecordCoexistence(result: ValidationResult) {
    const hasEntity = this.ContextEntityID != null;
    const hasRecord = this.ContextRecordID != null;

    if (hasEntity !== hasRecord) {
        result.Errors.push(new ValidationErrorInfo(
            "ContextEntityID",
            "Both ContextEntityID and ContextRecordID must be provided together, or both must be left blank.",
            this.ContextEntityID,
            ValidationErrorType.Failure
        ));
    }
}', 'Context Entity ID and Context Record ID must either both be provided or both be left empty. This ensures that a context reference is never partially defined.', 'ValidateContextEntityAndRecordCoexistence', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7FAA091D-C1A3-48A7-82D2-3D17729470F9')
   END;

-- CHECK constraint for MJ: Rubric Evaluations @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('ad680582-2312-4deb-82ad-6072104d906c', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(([NormalizedScore] IS NULL OR [NormalizedScore]>=(0) AND [NormalizedScore]<=(1)) AND ([PassThresholdApplied] IS NULL OR [PassThresholdApplied]>=(0) AND [PassThresholdApplied]<=(1)) AND ([Completeness] IS NULL OR [Completeness]>=(0) AND [Completeness]<=(1)) AND ([Confidence] IS NULL OR [Confidence]>=(0) AND [Confidence]<=(1)))', 'public ValidateDecimalMetricsRange(result: ValidationResult) {
	if (this.NormalizedScore != null && (this.NormalizedScore < 0 || this.NormalizedScore > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"NormalizedScore",
			"Normalized Score must be between 0 and 1.",
			this.NormalizedScore,
			ValidationErrorType.Failure
		));
	}
	if (this.PassThresholdApplied != null && (this.PassThresholdApplied < 0 || this.PassThresholdApplied > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"PassThresholdApplied",
			"Pass Threshold Applied must be between 0 and 1.",
			this.PassThresholdApplied,
			ValidationErrorType.Failure
		));
	}
	if (this.Completeness != null && (this.Completeness < 0 || this.Completeness > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"Completeness",
			"Completeness must be between 0 and 1.",
			this.Completeness,
			ValidationErrorType.Failure
		));
	}
	if (this.Confidence != null && (this.Confidence < 0 || this.Confidence > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"Confidence",
			"Confidence must be between 0 and 1.",
			this.Confidence,
			ValidationErrorType.Failure
		));
	}
}', 'Ensures that Normalized Score, Pass Threshold Applied, Completeness, and Confidence must all be between 0 and 1 (inclusive) if they are provided.', 'ValidateDecimalMetricsRange', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7FAA091D-C1A3-48A7-82D2-3D17729470F9')
   END;

-- CHECK constraint for MJ: Rubric Evaluations @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('a81162ab-d538-4d8f-b059-1913a4c71588', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([EvaluatorType]<>''Human'' OR [EvaluatorUserID] IS NOT NULL)', 'public ValidateEvaluatorUserIDForHumanEvaluator(result: ValidationResult) {
	if (this.EvaluatorType === "Human" && this.EvaluatorUserID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"EvaluatorUserID",
			"An Evaluator User must be specified when the Evaluator Type is ''Human''.",
			this.EvaluatorUserID,
			ValidationErrorType.Failure
		));
	}
}', 'If the evaluator type is set to ''Human'', an evaluator user must be specified to ensure accountability and proper tracking.', 'ValidateEvaluatorUserIDForHumanEvaluator', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7FAA091D-C1A3-48A7-82D2-3D17729470F9')
   END;

-- CHECK constraint for MJ: Rubric Evaluations @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('32196217-f960-41a0-81a7-0840671e51ac', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([Status]=''Withdrawn'' OR [Status]=''Superseded'' OR [Status]=''Submitted'') OR [SubmittedAt] IS NOT NULL AND [Outcome] IS NOT NULL)', 'public ValidateStatusSubmittedAtAndOutcome(result: ValidationResult) {
	if (this.Status === "Withdrawn" || this.Status === "Superseded" || this.Status === "Submitted") {
		if (this.SubmittedAt == null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubmittedAt",
				"SubmittedAt is required when Status is " + this.Status + ".",
				this.SubmittedAt,
				ValidationErrorType.Failure
			));
		}
		if (this.Outcome == null) {
			result.Errors.push(new ValidationErrorInfo(
				"Outcome",
				"Outcome is required when Status is " + this.Status + ".",
				this.Outcome,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When an evaluation status is set to ''Withdrawn'', ''Superseded'', or ''Submitted'', both the submission timestamp (SubmittedAt) and the outcome must be provided.', 'ValidateStatusSubmittedAtAndOutcome', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7FAA091D-C1A3-48A7-82D2-3D17729470F9')
   END;

/* Generated Validation Functions for MJ: Rubric Scale Levels */
-- CHECK constraint for MJ: Rubric Scale Levels: Field: NormalizedValue was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'C66E3FFA-8645-4E74-9EA1-E2664B6B393C'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('9ec9448b-a7e0-4c95-bec3-74a48b29bf0e', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([NormalizedValue]>=(0) AND [NormalizedValue]<=(1))', 'public ValidateNormalizedValueRange(result: ValidationResult) {
	if (this.NormalizedValue != null && (this.NormalizedValue < 0 || this.NormalizedValue > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"NormalizedValue",
			"The normalized value must be between 0 and 1 inclusive.",
			this.NormalizedValue,
			ValidationErrorType.Failure
		));
	}
}', 'The normalized value must be a decimal number between 0 and 1 inclusive to ensure data consistency.', 'ValidateNormalizedValueRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'C66E3FFA-8645-4E74-9EA1-E2664B6B393C')
   END;

/* Generated Validation Functions for MJ: Rubric Scales */
-- CHECK constraint for MJ: Rubric Scales: Field: Step was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '7543E79C-C467-49C6-A3B5-7C0D66022E37'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('0735a94d-2b97-4b3e-a14b-50c65c1ed98e', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Step] IS NULL OR [Step]>(0))', 'public ValidateStepGreaterThanZero(result: ValidationResult) {
	if (this.Step != null && this.Step <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Step",
			"Step must be greater than 0.",
			this.Step,
			ValidationErrorType.Failure
		));
	}
}', 'The step value, if specified, must be greater than zero.', 'ValidateStepGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '7543E79C-C467-49C6-A3B5-7C0D66022E37')
   END;

-- CHECK constraint for MJ: Rubric Scales @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '517DC830-DD35-4756-B1AE-EFF5046B2837'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('9055a050-8028-453d-a6f6-fb543ade1ec6', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ScaleType]=''Levels'' OR [MinValue] IS NOT NULL AND [MaxValue] IS NOT NULL AND [MaxValue]>[MinValue])', 'public ValidateMinMaxValuesBasedOnScaleType(result: ValidationResult) {
	if (this.ScaleType !== "Levels") {
		if (this.MinValue == null || this.MaxValue == null) {
			result.Errors.push(new ValidationErrorInfo(
				"MinValue",
				"Both Minimum and Maximum values must be specified when Scale Type is not ''Levels''.",
				this.MinValue,
				ValidationErrorType.Failure
			));
		} else if (this.MaxValue <= this.MinValue) {
			result.Errors.push(new ValidationErrorInfo(
				"MaxValue",
				"The Maximum value must be greater than the Minimum value.",
				this.MaxValue,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If the scale type is not set to ''Levels'', both a minimum and a maximum value must be provided, and the maximum value must be strictly greater than the minimum value.', 'ValidateMinMaxValuesBasedOnScaleType', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '517DC830-DD35-4756-B1AE-EFF5046B2837')
   END;

/* Generated Validation Functions for MJ: Rubric Versions */
-- CHECK constraint for MJ: Rubric Versions: Field: MinimumCompleteness was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'D7A4D0DE-D847-4B53-B3A7-340911287D77'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('06f205f4-c4fb-4f18-930b-d79ecab8b95d', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([MinimumCompleteness] IS NULL OR [MinimumCompleteness]>=(0) AND [MinimumCompleteness]<=(1))', 'public ValidateMinimumCompletenessRange(result: ValidationResult) {
	if (this.MinimumCompleteness != null && (this.MinimumCompleteness < 0 || this.MinimumCompleteness > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"MinimumCompleteness",
			"Minimum completeness must be between 0 and 1 (inclusive).",
			this.MinimumCompleteness,
			ValidationErrorType.Failure
		));
	}
}', 'Minimum completeness, if specified, must be a value between 0 and 1 (inclusive).', 'ValidateMinimumCompletenessRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'D7A4D0DE-D847-4B53-B3A7-340911287D77')
   END;

-- CHECK constraint for MJ: Rubric Versions: Field: PassThreshold was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0DE57DE0-08EA-477A-A6FF-A6B5D59E69D9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('8dddd730-0ca3-431f-9846-d6e81b5538bf', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([PassThreshold] IS NULL OR [PassThreshold]>=(0) AND [PassThreshold]<=(1))', 'public ValidatePassThresholdRange(result: ValidationResult) {
	if (this.PassThreshold != null && (this.PassThreshold < 0 || this.PassThreshold > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"PassThreshold",
			"The pass threshold must be a value between 0 and 1 (inclusive).",
			this.PassThreshold,
			ValidationErrorType.Failure
		));
	}
}', 'The pass threshold must be a value between 0 and 1 (inclusive) representing a percentage.', 'ValidatePassThresholdRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0DE57DE0-08EA-477A-A6FF-A6B5D59E69D9')
   END;

-- CHECK constraint for MJ: Rubric Versions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('d2322599-77bc-424e-9883-4eb1541b1456', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Status]=''Draft'' OR [MajorVersion] IS NOT NULL AND [MinorVersion] IS NOT NULL AND [PatchVersion] IS NOT NULL AND [ContentHash] IS NOT NULL AND [ScoringHash] IS NOT NULL AND [PublishedAt] IS NOT NULL AND [AppliedBump] IS NOT NULL)', 'public ValidatePublishedMetadataForNonDraftStatus(result: ValidationResult) {
	if (this.Status !== "Draft") {
		const missingFields: string[] = [];
		if (this.MajorVersion == null) { missingFields.push("MajorVersion"); }
		if (this.MinorVersion == null) { missingFields.push("MinorVersion"); }
		if (this.PatchVersion == null) { missingFields.push("PatchVersion"); }
		if (this.ContentHash == null) { missingFields.push("ContentHash"); }
		if (this.ScoringHash == null) { missingFields.push("ScoringHash"); }
		if (this.PublishedAt == null) { missingFields.push("PublishedAt"); }
		if (this.AppliedBump == null) { missingFields.push("AppliedBump"); }

		if (missingFields.length > 0) {
			result.Errors.push(new ValidationErrorInfo(
				"Status",
				"When the status is not ''Draft'', the following publishing metadata fields must be populated: " + missingFields.join(", ") + ".",
				this.Status,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a rubric is not in ''Draft'' status, it must have all versioning, hashing, publishing timestamp, and version bump details fully populated to ensure data integrity for published content.', 'ValidatePublishedMetadataForNonDraftStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'A60434B6-1893-45ED-9ECB-169EE8FE6241')
   END;

-- CHECK constraint for MJ: Rubric Versions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('d471e192-b1ec-4035-9832-e7213d36319b', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ScoreDisplayMax]>[ScoreDisplayMin])', 'public ValidateScoreDisplayMaxGreaterThanScoreDisplayMin(result: ValidationResult) {
	if (this.ScoreDisplayMax != null && this.ScoreDisplayMin != null && this.ScoreDisplayMax <= this.ScoreDisplayMin) {
		result.Errors.push(new ValidationErrorInfo(
			"ScoreDisplayMax",
			"The maximum display score must be greater than the minimum display score.",
			this.ScoreDisplayMax,
			ValidationErrorType.Failure
		));
	}
}', 'The maximum display score must be strictly greater than the minimum display score to ensure a valid scoring range.', 'ValidateScoreDisplayMaxGreaterThanScoreDisplayMin', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'A60434B6-1893-45ED-9ECB-169EE8FE6241')
   END;

-- CHECK constraint for MJ: Rubric Versions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('84057d2d-9433-4fce-b332-910a06a5f5bc', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(([MajorVersion] IS NULL OR [MajorVersion]>=(0)) AND ([MinorVersion] IS NULL OR [MinorVersion]>=(0)) AND ([PatchVersion] IS NULL OR [PatchVersion]>=(0)))', 'public ValidateVersionComponentsNonNegative(result: ValidationResult) {
	if (this.MajorVersion != null && this.MajorVersion < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"MajorVersion",
			"Major version must be greater than or equal to 0.",
			this.MajorVersion,
			ValidationErrorType.Failure
		));
	}
	if (this.MinorVersion != null && this.MinorVersion < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"MinorVersion",
			"Minor version must be greater than or equal to 0.",
			this.MinorVersion,
			ValidationErrorType.Failure
		));
	}
	if (this.PatchVersion != null && this.PatchVersion < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"PatchVersion",
			"Patch version must be greater than or equal to 0.",
			this.PatchVersion,
			ValidationErrorType.Failure
		));
	}
}', 'Major, minor, and patch versions must be greater than or equal to 0 if they are specified.', 'ValidateVersionComponentsNonNegative', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'A60434B6-1893-45ED-9ECB-169EE8FE6241')
   END;

/* Generated Validation Functions for MJ: Test Suite Runs */
-- CHECK constraint for MJ: Test Suite Runs: Field: Score was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '2C6A5521-BA6E-4F79-946E-5A4753E4CA38'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('cf0af157-588f-46fd-a1cb-87bc5c81f0d0', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Score] IS NULL OR [Score]>=(0) AND [Score]<=(1))', 'public ValidateScoreRange(result: ValidationResult) {
	if (this.Score != null && (this.Score < 0 || this.Score > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"Score",
			"Score must be between 0 and 1.",
			this.Score,
			ValidationErrorType.Failure
		));
	}
}', 'The score must be a value between 0 and 1, or it can be left blank.', 'ValidateScoreRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '2C6A5521-BA6E-4F79-946E-5A4753E4CA38')
   END;


/* SQL text to update entity field related entity name field map for entity field ID BCF245AC-6AD3-498C-A43F-6349C39B6319 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BCF245AC-6AD3-498C-A43F-6349C39B6319', @RelatedEntityNameFieldMap='PhoneNumber';

/* Base View SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: vwInteractions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Interactions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Interaction
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwInteractions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwInteractions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwInteractions]
AS
SELECT
    i.*,
    MJPhoneNumber_PhoneNumberID.[Number] AS [PhoneNumber]
FROM
    [${flyway:defaultSchema}].[Interaction] AS i
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PhoneNumber] AS MJPhoneNumber_PhoneNumberID
  ON
    [i].[PhoneNumberID] = MJPhoneNumber_PhoneNumberID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwInteractions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwInteractions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwInteractions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: Permissions for vwInteractions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwInteractions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwInteractions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwInteractions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwInteractions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: spCreateInteraction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Interaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateInteraction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateInteraction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateInteraction]
    @ID uniqueidentifier = NULL,
    @Channel nvarchar(20),
    @Direction nvarchar(20),
    @Status nvarchar(20) = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @RoomName_Clear bit = 0,
    @RoomName nvarchar(255) = NULL,
    @PhoneNumberID_Clear bit = 0,
    @PhoneNumberID uniqueidentifier = NULL,
    @RemoteAddress_Clear bit = 0,
    @RemoteAddress nvarchar(255) = NULL,
    @StartedAt datetimeoffset = NULL,
    @AnsweredAt_Clear bit = 0,
    @AnsweredAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @EndReason_Clear bit = 0,
    @EndReason nvarchar(100) = NULL,
    @RecordingEnabled bit = NULL,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(255) = NULL,
    @CostEstimate_Clear bit = 0,
    @CostEstimate decimal(18, 6) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Interaction]
            (
                [ID],
                [Channel],
                [Direction],
                [Status],
                [AgentSessionID],
                [RoomName],
                [PhoneNumberID],
                [RemoteAddress],
                [StartedAt],
                [AnsweredAt],
                [EndedAt],
                [EndReason],
                [RecordingEnabled],
                [ExternalID],
                [CostEstimate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Channel,
                @Direction,
                ISNULL(@Status, 'Queued'),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @RoomName_Clear = 1 THEN NULL ELSE ISNULL(@RoomName, NULL) END,
                CASE WHEN @PhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@PhoneNumberID, NULL) END,
                CASE WHEN @RemoteAddress_Clear = 1 THEN NULL ELSE ISNULL(@RemoteAddress, NULL) END,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @AnsweredAt_Clear = 1 THEN NULL ELSE ISNULL(@AnsweredAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @EndReason_Clear = 1 THEN NULL ELSE ISNULL(@EndReason, NULL) END,
                ISNULL(@RecordingEnabled, 0),
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                CASE WHEN @CostEstimate_Clear = 1 THEN NULL ELSE ISNULL(@CostEstimate, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Interaction]
            (
                [Channel],
                [Direction],
                [Status],
                [AgentSessionID],
                [RoomName],
                [PhoneNumberID],
                [RemoteAddress],
                [StartedAt],
                [AnsweredAt],
                [EndedAt],
                [EndReason],
                [RecordingEnabled],
                [ExternalID],
                [CostEstimate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Channel,
                @Direction,
                ISNULL(@Status, 'Queued'),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @RoomName_Clear = 1 THEN NULL ELSE ISNULL(@RoomName, NULL) END,
                CASE WHEN @PhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@PhoneNumberID, NULL) END,
                CASE WHEN @RemoteAddress_Clear = 1 THEN NULL ELSE ISNULL(@RemoteAddress, NULL) END,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @AnsweredAt_Clear = 1 THEN NULL ELSE ISNULL(@AnsweredAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @EndReason_Clear = 1 THEN NULL ELSE ISNULL(@EndReason, NULL) END,
                ISNULL(@RecordingEnabled, 0),
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                CASE WHEN @CostEstimate_Clear = 1 THEN NULL ELSE ISNULL(@CostEstimate, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwInteractions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateInteraction] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateInteraction] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteraction] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Interactions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateInteraction] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateInteraction] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInteraction] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: spUpdateInteraction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Interaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateInteraction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateInteraction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateInteraction]
    @ID uniqueidentifier,
    @Channel nvarchar(20) = NULL,
    @Direction nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @RoomName_Clear bit = 0,
    @RoomName nvarchar(255) = NULL,
    @PhoneNumberID_Clear bit = 0,
    @PhoneNumberID uniqueidentifier = NULL,
    @RemoteAddress_Clear bit = 0,
    @RemoteAddress nvarchar(255) = NULL,
    @StartedAt datetimeoffset = NULL,
    @AnsweredAt_Clear bit = 0,
    @AnsweredAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @EndReason_Clear bit = 0,
    @EndReason nvarchar(100) = NULL,
    @RecordingEnabled bit = NULL,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(255) = NULL,
    @CostEstimate_Clear bit = 0,
    @CostEstimate decimal(18, 6) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Interaction]
    SET
        [Channel] = ISNULL(@Channel, [Channel]),
        [Direction] = ISNULL(@Direction, [Direction]),
        [Status] = ISNULL(@Status, [Status]),
        [AgentSessionID] = CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, [AgentSessionID]) END,
        [RoomName] = CASE WHEN @RoomName_Clear = 1 THEN NULL ELSE ISNULL(@RoomName, [RoomName]) END,
        [PhoneNumberID] = CASE WHEN @PhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@PhoneNumberID, [PhoneNumberID]) END,
        [RemoteAddress] = CASE WHEN @RemoteAddress_Clear = 1 THEN NULL ELSE ISNULL(@RemoteAddress, [RemoteAddress]) END,
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [AnsweredAt] = CASE WHEN @AnsweredAt_Clear = 1 THEN NULL ELSE ISNULL(@AnsweredAt, [AnsweredAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [EndReason] = CASE WHEN @EndReason_Clear = 1 THEN NULL ELSE ISNULL(@EndReason, [EndReason]) END,
        [RecordingEnabled] = ISNULL(@RecordingEnabled, [RecordingEnabled]),
        [ExternalID] = CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, [ExternalID]) END,
        [CostEstimate] = CASE WHEN @CostEstimate_Clear = 1 THEN NULL ELSE ISNULL(@CostEstimate, [CostEstimate]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwInteractions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwInteractions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteraction] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteraction] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteraction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Interaction table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateInteraction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateInteraction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateInteraction
ON [${flyway:defaultSchema}].[Interaction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Interaction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Interaction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Interactions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteraction] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteraction] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInteraction] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Interactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Interactions
-- Item: spDeleteInteraction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Interaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteInteraction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteInteraction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteInteraction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Interaction]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteraction] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteraction] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteraction] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Interactions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteraction] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteraction] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInteraction] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 15040ACE-8782-426C-B2C1-62117E45913D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='15040ACE-8782-426C-B2C1-62117E45913D', @RelatedEntityNameFieldMap='Meeting';

/* SQL text to update entity field related entity name field map for entity field ID 6DE00DFC-503D-49BD-B527-C770F7120913 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6DE00DFC-503D-49BD-B527-C770F7120913', @RelatedEntityNameFieldMap='DialInPhoneNumber';

/* Base View SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: vwMeetingParticipants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Meeting Participants
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MeetingParticipant
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMeetingParticipants]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMeetingParticipants];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMeetingParticipants]
AS
SELECT
    m.*,
    MJMeeting_MeetingID.[Title] AS [Meeting],
    MJUser_UserID.[Name] AS [User],
    MJAIAgent_AgentID.[Name] AS [Agent]
FROM
    [${flyway:defaultSchema}].[MeetingParticipant] AS m
INNER JOIN
    [${flyway:defaultSchema}].[Meeting] AS MJMeeting_MeetingID
  ON
    [m].[MeetingID] = MJMeeting_MeetingID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [m].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [m].[AgentID] = MJAIAgent_AgentID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: Permissions for vwMeetingParticipants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMeetingParticipants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: spCreateMeetingParticipant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MeetingParticipant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMeetingParticipant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMeetingParticipant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMeetingParticipant]
    @ID uniqueidentifier = NULL,
    @MeetingID uniqueidentifier,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ExternalName_Clear bit = 0,
    @ExternalName nvarchar(255) = NULL,
    @ExternalEmail_Clear bit = 0,
    @ExternalEmail nvarchar(255) = NULL,
    @ExternalPhone_Clear bit = 0,
    @ExternalPhone nvarchar(20) = NULL,
    @Role nvarchar(20) = NULL,
    @InviteStatus nvarchar(20) = NULL,
    @JoinedAt_Clear bit = 0,
    @JoinedAt datetimeoffset = NULL,
    @LeftAt_Clear bit = 0,
    @LeftAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MeetingParticipant]
            (
                [ID],
                [MeetingID],
                [UserID],
                [AgentID],
                [ExternalName],
                [ExternalEmail],
                [ExternalPhone],
                [Role],
                [InviteStatus],
                [JoinedAt],
                [LeftAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MeetingID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ExternalName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalName, NULL) END,
                CASE WHEN @ExternalEmail_Clear = 1 THEN NULL ELSE ISNULL(@ExternalEmail, NULL) END,
                CASE WHEN @ExternalPhone_Clear = 1 THEN NULL ELSE ISNULL(@ExternalPhone, NULL) END,
                ISNULL(@Role, 'Attendee'),
                ISNULL(@InviteStatus, 'Invited'),
                CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, NULL) END,
                CASE WHEN @LeftAt_Clear = 1 THEN NULL ELSE ISNULL(@LeftAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MeetingParticipant]
            (
                [MeetingID],
                [UserID],
                [AgentID],
                [ExternalName],
                [ExternalEmail],
                [ExternalPhone],
                [Role],
                [InviteStatus],
                [JoinedAt],
                [LeftAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MeetingID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ExternalName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalName, NULL) END,
                CASE WHEN @ExternalEmail_Clear = 1 THEN NULL ELSE ISNULL(@ExternalEmail, NULL) END,
                CASE WHEN @ExternalPhone_Clear = 1 THEN NULL ELSE ISNULL(@ExternalPhone, NULL) END,
                ISNULL(@Role, 'Attendee'),
                ISNULL(@InviteStatus, 'Invited'),
                CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, NULL) END,
                CASE WHEN @LeftAt_Clear = 1 THEN NULL ELSE ISNULL(@LeftAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMeetingParticipants] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMeetingParticipant] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMeetingParticipant] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Meeting Participants */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMeetingParticipant] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMeetingParticipant] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: spUpdateMeetingParticipant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MeetingParticipant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMeetingParticipant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMeetingParticipant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMeetingParticipant]
    @ID uniqueidentifier,
    @MeetingID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ExternalName_Clear bit = 0,
    @ExternalName nvarchar(255) = NULL,
    @ExternalEmail_Clear bit = 0,
    @ExternalEmail nvarchar(255) = NULL,
    @ExternalPhone_Clear bit = 0,
    @ExternalPhone nvarchar(20) = NULL,
    @Role nvarchar(20) = NULL,
    @InviteStatus nvarchar(20) = NULL,
    @JoinedAt_Clear bit = 0,
    @JoinedAt datetimeoffset = NULL,
    @LeftAt_Clear bit = 0,
    @LeftAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MeetingParticipant]
    SET
        [MeetingID] = ISNULL(@MeetingID, [MeetingID]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [ExternalName] = CASE WHEN @ExternalName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalName, [ExternalName]) END,
        [ExternalEmail] = CASE WHEN @ExternalEmail_Clear = 1 THEN NULL ELSE ISNULL(@ExternalEmail, [ExternalEmail]) END,
        [ExternalPhone] = CASE WHEN @ExternalPhone_Clear = 1 THEN NULL ELSE ISNULL(@ExternalPhone, [ExternalPhone]) END,
        [Role] = ISNULL(@Role, [Role]),
        [InviteStatus] = ISNULL(@InviteStatus, [InviteStatus]),
        [JoinedAt] = CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, [JoinedAt]) END,
        [LeftAt] = CASE WHEN @LeftAt_Clear = 1 THEN NULL ELSE ISNULL(@LeftAt, [LeftAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMeetingParticipants] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMeetingParticipants]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeetingParticipant] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeetingParticipant] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeetingParticipant] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MeetingParticipant table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMeetingParticipant]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMeetingParticipant];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMeetingParticipant
ON [${flyway:defaultSchema}].[MeetingParticipant]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MeetingParticipant]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MeetingParticipant] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Meeting Participants */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeetingParticipant] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeetingParticipant] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Meeting Participants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meeting Participants
-- Item: spDeleteMeetingParticipant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MeetingParticipant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMeetingParticipant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMeetingParticipant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMeetingParticipant]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MeetingParticipant]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeetingParticipant] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeetingParticipant] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Meeting Participants */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeetingParticipant] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeetingParticipant] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeetingParticipant] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Meetings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Meeting
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMeetings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMeetings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMeetings]
AS
SELECT
    m.*,
    MJUser_HostUserID.[Name] AS [HostUser],
    MJPhoneNumber_DialInPhoneNumberID.[Number] AS [DialInPhoneNumber],
    MJConversation_ConversationID.[Name] AS [Conversation]
FROM
    [${flyway:defaultSchema}].[Meeting] AS m
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_HostUserID
  ON
    [m].[HostUserID] = MJUser_HostUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PhoneNumber] AS MJPhoneNumber_DialInPhoneNumberID
  ON
    [m].[DialInPhoneNumberID] = MJPhoneNumber_DialInPhoneNumberID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [m].[ConversationID] = MJConversation_ConversationID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetings] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetings] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetings] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: Permissions for vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetings] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetings] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMeetings] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: spCreateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMeeting];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMeeting]
    @ID uniqueidentifier = NULL,
    @Title nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @HostUserID uniqueidentifier,
    @RoomName nvarchar(255),
    @Status nvarchar(20) = NULL,
    @ScheduledStartAt_Clear bit = 0,
    @ScheduledStartAt datetimeoffset = NULL,
    @ScheduledEndAt_Clear bit = 0,
    @ScheduledEndAt datetimeoffset = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @AllowPhoneDialIn bit = NULL,
    @DialInPhoneNumberID_Clear bit = 0,
    @DialInPhoneNumberID uniqueidentifier = NULL,
    @DialInCode_Clear bit = 0,
    @DialInCode nvarchar(20) = NULL,
    @RecordingPolicy nvarchar(20) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Meeting]
            (
                [ID],
                [Title],
                [Description],
                [HostUserID],
                [RoomName],
                [Status],
                [ScheduledStartAt],
                [ScheduledEndAt],
                [StartedAt],
                [EndedAt],
                [AllowPhoneDialIn],
                [DialInPhoneNumberID],
                [DialInCode],
                [RecordingPolicy],
                [ConversationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Title,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @HostUserID,
                @RoomName,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @ScheduledStartAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledStartAt, NULL) END,
                CASE WHEN @ScheduledEndAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledEndAt, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                ISNULL(@AllowPhoneDialIn, 0),
                CASE WHEN @DialInPhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@DialInPhoneNumberID, NULL) END,
                CASE WHEN @DialInCode_Clear = 1 THEN NULL ELSE ISNULL(@DialInCode, NULL) END,
                ISNULL(@RecordingPolicy, 'Off'),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Meeting]
            (
                [Title],
                [Description],
                [HostUserID],
                [RoomName],
                [Status],
                [ScheduledStartAt],
                [ScheduledEndAt],
                [StartedAt],
                [EndedAt],
                [AllowPhoneDialIn],
                [DialInPhoneNumberID],
                [DialInCode],
                [RecordingPolicy],
                [ConversationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Title,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @HostUserID,
                @RoomName,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @ScheduledStartAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledStartAt, NULL) END,
                CASE WHEN @ScheduledEndAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledEndAt, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                ISNULL(@AllowPhoneDialIn, 0),
                CASE WHEN @DialInPhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@DialInPhoneNumberID, NULL) END,
                CASE WHEN @DialInCode_Clear = 1 THEN NULL ELSE ISNULL(@DialInCode, NULL) END,
                ISNULL(@RecordingPolicy, 'Off'),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMeetings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMeeting] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMeeting] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Meetings */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMeeting] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMeeting] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: spUpdateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMeeting];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMeeting]
    @ID uniqueidentifier,
    @Title nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @HostUserID uniqueidentifier = NULL,
    @RoomName nvarchar(255) = NULL,
    @Status nvarchar(20) = NULL,
    @ScheduledStartAt_Clear bit = 0,
    @ScheduledStartAt datetimeoffset = NULL,
    @ScheduledEndAt_Clear bit = 0,
    @ScheduledEndAt datetimeoffset = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @AllowPhoneDialIn bit = NULL,
    @DialInPhoneNumberID_Clear bit = 0,
    @DialInPhoneNumberID uniqueidentifier = NULL,
    @DialInCode_Clear bit = 0,
    @DialInCode nvarchar(20) = NULL,
    @RecordingPolicy nvarchar(20) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Meeting]
    SET
        [Title] = ISNULL(@Title, [Title]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [HostUserID] = ISNULL(@HostUserID, [HostUserID]),
        [RoomName] = ISNULL(@RoomName, [RoomName]),
        [Status] = ISNULL(@Status, [Status]),
        [ScheduledStartAt] = CASE WHEN @ScheduledStartAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledStartAt, [ScheduledStartAt]) END,
        [ScheduledEndAt] = CASE WHEN @ScheduledEndAt_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledEndAt, [ScheduledEndAt]) END,
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [AllowPhoneDialIn] = ISNULL(@AllowPhoneDialIn, [AllowPhoneDialIn]),
        [DialInPhoneNumberID] = CASE WHEN @DialInPhoneNumberID_Clear = 1 THEN NULL ELSE ISNULL(@DialInPhoneNumberID, [DialInPhoneNumberID]) END,
        [DialInCode] = CASE WHEN @DialInCode_Clear = 1 THEN NULL ELSE ISNULL(@DialInCode, [DialInCode]) END,
        [RecordingPolicy] = ISNULL(@RecordingPolicy, [RecordingPolicy]),
        [ConversationID] = CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, [ConversationID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMeetings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMeetings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeeting] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeeting] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Meeting table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMeeting]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMeeting];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMeeting
ON [${flyway:defaultSchema}].[Meeting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Meeting]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Meeting] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Meetings */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeeting] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeeting] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Meetings
-- Item: spDeleteMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMeeting];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMeeting]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Meeting]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeeting] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeeting] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeeting] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Meetings */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeeting] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeeting] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMeeting] TO [cdp_Developer], [cdp_Integration];

/* Hierarchy Metadata Function SQL for MJ: Rubric Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: fnRubricCategoryParentID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [RubricCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnRubricCategoryParentID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnRubricCategoryParentID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnRubricCategoryParentID_GetHierarchyMeta]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCategory]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCategory] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[RubricCategory] WHERE [ParentID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[RubricCategory] WHERE [ParentID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ: Rubric Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: fnRubricCategoryParentID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [RubricCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnRubricCategoryParentID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnRubricCategoryParentID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnRubricCategoryParentID_GetDescendants]
(
    @RootID uniqueidentifier,
    @MaxDepth INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Descendants AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCategory]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCategory] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[RubricCategory] WHERE [ParentID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[RubricCategory] WHERE [ParentID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ: Rubric Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: fnRubricCategoryParentID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [RubricCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnRubricCategoryParentID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnRubricCategoryParentID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnRubricCategoryParentID_GetAncestors]
(
    @RecordID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCategory]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCategory] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[LevelUp] < 100
    )
    SELECT
        a.[ID] AS [ID],
        a.[LevelUp],
        a.[Path]
    FROM
        CTE_Ancestors a
);
GO

/* Root ID Function SQL for MJ: Rubric Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: fnRubricCategoryParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [RubricCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnRubricCategoryParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnRubricCategoryParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnRubricCategoryParentID_GetRootID]
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
            [${flyway:defaultSchema}].[RubricCategory]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[RubricCategory] c
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

/* Base View SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: vwRubricCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RubricCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRubricCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRubricCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRubricCategories]
AS
SELECT
    r.*,
    MJRubricCategory_ParentID.[Name] AS [Parent],
    hier_ParentID.RootID AS [RootParentID],
    hier_ParentID.Depth AS [ParentIDDepth],
    hier_ParentID.Path AS [ParentIDPath],
    hier_ParentID.IsLeaf AS [ParentIDIsLeaf],
    hier_ParentID.ChildCount AS [ParentIDChildCount]
FROM
    [${flyway:defaultSchema}].[RubricCategory] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RubricCategory] AS MJRubricCategory_ParentID
  ON
    [r].[ParentID] = MJRubricCategory_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnRubricCategoryParentID_GetHierarchyMeta]([r].[ID], [r].[ParentID]) AS hier_ParentID
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: Permissions for vwRubricCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRubricCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: spCreateRubricCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RubricCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRubricCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRubricCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRubricCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RubricCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RubricCategory]
            (
                [Name],
                [Description],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRubricCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Rubric Categories */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCategory] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: spUpdateRubricCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RubricCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRubricCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRubricCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRubricCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RubricCategory]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRubricCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRubricCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRubricCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRubricCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRubricCategory
ON [${flyway:defaultSchema}].[RubricCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RubricCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RubricCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Rubric Categories */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Rubric Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Categories
-- Item: spDeleteRubricCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RubricCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRubricCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RubricCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Rubric Categories */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCategory] TO [cdp_Developer], [cdp_Integration];

/* Hierarchy Metadata Function SQL for MJ: Rubric Criteria.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: fnRubricCriterionParentID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [RubricCriterion].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnRubricCriterionParentID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnRubricCriterionParentID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnRubricCriterionParentID_GetHierarchyMeta]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCriterion]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCriterion] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[RubricCriterion] WHERE [ParentID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[RubricCriterion] WHERE [ParentID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ: Rubric Criteria.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: fnRubricCriterionParentID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [RubricCriterion].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnRubricCriterionParentID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnRubricCriterionParentID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnRubricCriterionParentID_GetDescendants]
(
    @RootID uniqueidentifier,
    @MaxDepth INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Descendants AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCriterion]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCriterion] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[RubricCriterion] WHERE [ParentID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[RubricCriterion] WHERE [ParentID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ: Rubric Criteria.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: fnRubricCriterionParentID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [RubricCriterion].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnRubricCriterionParentID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnRubricCriterionParentID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnRubricCriterionParentID_GetAncestors]
(
    @RecordID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCriterion]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[RubricCriterion] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[LevelUp] < 100
    )
    SELECT
        a.[ID] AS [ID],
        a.[LevelUp],
        a.[Path]
    FROM
        CTE_Ancestors a
);
GO

/* Root ID Function SQL for MJ: Rubric Criteria.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: fnRubricCriterionParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [RubricCriterion].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnRubricCriterionParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnRubricCriterionParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnRubricCriterionParentID_GetRootID]
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
            [${flyway:defaultSchema}].[RubricCriterion]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[RubricCriterion] c
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

/* Base View SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: vwRubricCriteria
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Criteria
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RubricCriterion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRubricCriteria]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRubricCriteria];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRubricCriteria]
AS
SELECT
    r.*,
    MJRubricCriterion_ParentID.[Name] AS [Parent],
    MJRubricScale_ScaleID.[Name] AS [Scale],
    hier_ParentID.RootID AS [RootParentID],
    hier_ParentID.Depth AS [ParentIDDepth],
    hier_ParentID.Path AS [ParentIDPath],
    hier_ParentID.IsLeaf AS [ParentIDIsLeaf],
    hier_ParentID.ChildCount AS [ParentIDChildCount]
FROM
    [${flyway:defaultSchema}].[RubricCriterion] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RubricCriterion] AS MJRubricCriterion_ParentID
  ON
    [r].[ParentID] = MJRubricCriterion_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RubricScale] AS MJRubricScale_ScaleID
  ON
    [r].[ScaleID] = MJRubricScale_ScaleID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnRubricCriterionParentID_GetHierarchyMeta]([r].[ID], [r].[ParentID]) AS hier_ParentID
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: Permissions for vwRubricCriteria
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRubricCriteria] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: spCreateRubricCriterion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RubricCriterion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRubricCriterion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRubricCriterion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRubricCriterion]
    @ID uniqueidentifier = NULL,
    @RubricVersionID uniqueidentifier,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Key nvarchar(100),
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Guidance_Clear bit = 0,
    @Guidance nvarchar(MAX) = NULL,
    @NodeType nvarchar(20) = NULL,
    @ScaleID_Clear bit = 0,
    @ScaleID uniqueidentifier = NULL,
    @Weight decimal(18, 6) = NULL,
    @IsAdvisory bit = NULL,
    @IsGate bit = NULL,
    @GateMinimumScore_Clear bit = 0,
    @GateMinimumScore decimal(9, 6) = NULL,
    @NotApplicablePolicy_Clear bit = 0,
    @NotApplicablePolicy nvarchar(30) = NULL,
    @RollupMethod_Clear bit = 0,
    @RollupMethod nvarchar(20) = NULL,
    @EvidenceRequired bit = NULL,
    @RationaleRequired bit = NULL,
    @Sequence int = NULL,
    @EvaluatorConfig_Clear bit = 0,
    @EvaluatorConfig nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RubricCriterion]
            (
                [ID],
                [RubricVersionID],
                [ParentID],
                [Key],
                [Name],
                [Description],
                [Guidance],
                [NodeType],
                [ScaleID],
                [Weight],
                [IsAdvisory],
                [IsGate],
                [GateMinimumScore],
                [NotApplicablePolicy],
                [RollupMethod],
                [EvidenceRequired],
                [RationaleRequired],
                [Sequence],
                [EvaluatorConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RubricVersionID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Key,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, NULL) END,
                ISNULL(@NodeType, 'Criterion'),
                CASE WHEN @ScaleID_Clear = 1 THEN NULL ELSE ISNULL(@ScaleID, NULL) END,
                ISNULL(@Weight, 1),
                ISNULL(@IsAdvisory, 0),
                ISNULL(@IsGate, 0),
                CASE WHEN @GateMinimumScore_Clear = 1 THEN NULL ELSE ISNULL(@GateMinimumScore, NULL) END,
                CASE WHEN @NotApplicablePolicy_Clear = 1 THEN NULL ELSE ISNULL(@NotApplicablePolicy, NULL) END,
                CASE WHEN @RollupMethod_Clear = 1 THEN NULL ELSE ISNULL(@RollupMethod, NULL) END,
                ISNULL(@EvidenceRequired, 0),
                ISNULL(@RationaleRequired, 0),
                ISNULL(@Sequence, 0),
                CASE WHEN @EvaluatorConfig_Clear = 1 THEN NULL ELSE ISNULL(@EvaluatorConfig, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RubricCriterion]
            (
                [RubricVersionID],
                [ParentID],
                [Key],
                [Name],
                [Description],
                [Guidance],
                [NodeType],
                [ScaleID],
                [Weight],
                [IsAdvisory],
                [IsGate],
                [GateMinimumScore],
                [NotApplicablePolicy],
                [RollupMethod],
                [EvidenceRequired],
                [RationaleRequired],
                [Sequence],
                [EvaluatorConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RubricVersionID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Key,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, NULL) END,
                ISNULL(@NodeType, 'Criterion'),
                CASE WHEN @ScaleID_Clear = 1 THEN NULL ELSE ISNULL(@ScaleID, NULL) END,
                ISNULL(@Weight, 1),
                ISNULL(@IsAdvisory, 0),
                ISNULL(@IsGate, 0),
                CASE WHEN @GateMinimumScore_Clear = 1 THEN NULL ELSE ISNULL(@GateMinimumScore, NULL) END,
                CASE WHEN @NotApplicablePolicy_Clear = 1 THEN NULL ELSE ISNULL(@NotApplicablePolicy, NULL) END,
                CASE WHEN @RollupMethod_Clear = 1 THEN NULL ELSE ISNULL(@RollupMethod, NULL) END,
                ISNULL(@EvidenceRequired, 0),
                ISNULL(@RationaleRequired, 0),
                ISNULL(@Sequence, 0),
                CASE WHEN @EvaluatorConfig_Clear = 1 THEN NULL ELSE ISNULL(@EvaluatorConfig, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRubricCriteria] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Rubric Criteria */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRubricCriterion] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: spUpdateRubricCriterion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RubricCriterion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRubricCriterion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRubricCriterion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRubricCriterion]
    @ID uniqueidentifier,
    @RubricVersionID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Key nvarchar(100) = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Guidance_Clear bit = 0,
    @Guidance nvarchar(MAX) = NULL,
    @NodeType nvarchar(20) = NULL,
    @ScaleID_Clear bit = 0,
    @ScaleID uniqueidentifier = NULL,
    @Weight decimal(18, 6) = NULL,
    @IsAdvisory bit = NULL,
    @IsGate bit = NULL,
    @GateMinimumScore_Clear bit = 0,
    @GateMinimumScore decimal(9, 6) = NULL,
    @NotApplicablePolicy_Clear bit = 0,
    @NotApplicablePolicy nvarchar(30) = NULL,
    @RollupMethod_Clear bit = 0,
    @RollupMethod nvarchar(20) = NULL,
    @EvidenceRequired bit = NULL,
    @RationaleRequired bit = NULL,
    @Sequence int = NULL,
    @EvaluatorConfig_Clear bit = 0,
    @EvaluatorConfig nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RubricCriterion]
    SET
        [RubricVersionID] = ISNULL(@RubricVersionID, [RubricVersionID]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Key] = ISNULL(@Key, [Key]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Guidance] = CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, [Guidance]) END,
        [NodeType] = ISNULL(@NodeType, [NodeType]),
        [ScaleID] = CASE WHEN @ScaleID_Clear = 1 THEN NULL ELSE ISNULL(@ScaleID, [ScaleID]) END,
        [Weight] = ISNULL(@Weight, [Weight]),
        [IsAdvisory] = ISNULL(@IsAdvisory, [IsAdvisory]),
        [IsGate] = ISNULL(@IsGate, [IsGate]),
        [GateMinimumScore] = CASE WHEN @GateMinimumScore_Clear = 1 THEN NULL ELSE ISNULL(@GateMinimumScore, [GateMinimumScore]) END,
        [NotApplicablePolicy] = CASE WHEN @NotApplicablePolicy_Clear = 1 THEN NULL ELSE ISNULL(@NotApplicablePolicy, [NotApplicablePolicy]) END,
        [RollupMethod] = CASE WHEN @RollupMethod_Clear = 1 THEN NULL ELSE ISNULL(@RollupMethod, [RollupMethod]) END,
        [EvidenceRequired] = ISNULL(@EvidenceRequired, [EvidenceRequired]),
        [RationaleRequired] = ISNULL(@RationaleRequired, [RationaleRequired]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [EvaluatorConfig] = CASE WHEN @EvaluatorConfig_Clear = 1 THEN NULL ELSE ISNULL(@EvaluatorConfig, [EvaluatorConfig]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRubricCriteria] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRubricCriteria]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricCriterion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRubricCriterion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRubricCriterion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRubricCriterion
ON [${flyway:defaultSchema}].[RubricCriterion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RubricCriterion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RubricCriterion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Rubric Criteria */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRubricCriterion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Rubric Criteria */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Criteria
-- Item: spDeleteRubricCriterion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RubricCriterion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRubricCriterion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricCriterion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricCriterion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RubricCriterion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Rubric Criteria */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricCriterion] TO [cdp_Developer], [cdp_Integration];

