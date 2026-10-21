-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610032200__v6.2.x__Telephony_PhoneNumber_NumberPool_Interaction.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

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
/* ============================================================================ */
/* 1. NumberPool  ("MJ: Number Pools") */
/*    A named group of phone numbers with a selection rule for outbound caller ID. */
/*    Created first because PhoneNumber references it. */
/* ============================================================================ */
CREATE TABLE __mj."NumberPool" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "SelectionRule" VARCHAR(20) NOT NULL DEFAULT (
    'RoundRobin'
  ),
  "MaxConcurrentPerNumber" INT NULL,
  "Description" TEXT NULL,
  CONSTRAINT "PK_NumberPool" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_NumberPool_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "CK_NumberPool_SelectionRule" CHECK ("SelectionRule" IN ('RoundRobin', 'LocalPresence', 'Random')),
  CONSTRAINT "CK_NumberPool_MaxConcurrentPerNumber" CHECK ("MaxConcurrentPerNumber" IS NULL OR "MaxConcurrentPerNumber" > 0)
);

COMMENT ON TABLE __mj."NumberPool" IS 'A named group of phone numbers used together for outbound calling, with a rule for which number is chosen as the caller ID on each call. Inbound routing does not use pools.';

COMMENT ON COLUMN __mj."NumberPool"."Name" IS 'Unique, human-readable name of the pool (e.g. Sales Outbound US, Support Callback).';

COMMENT ON COLUMN __mj."NumberPool"."SelectionRule" IS 'How an outbound call picks a number from the pool: RoundRobin (rotate evenly through active numbers), LocalPresence (prefer a number whose area code / region matches the callee, falling back to round robin), or Random.';

COMMENT ON COLUMN __mj."NumberPool"."MaxConcurrentPerNumber" IS 'Optional ceiling on simultaneous active Interactions per number in this pool. A number at the ceiling is skipped during selection. NULL means no ceiling is enforced by MJ (the carrier may still impose one).';

COMMENT ON COLUMN __mj."NumberPool"."Description" IS 'Optional description of what the pool is for and any selection policy notes.';

/* ============================================================================ */
/* 2. PhoneNumber  ("MJ: Phone Numbers") */
/*    A telephone number the organization owns through a telephony bridge provider. */
/*    Distinct from AIBridgeAgentIdentity (which maps a number to an AGENT for inbound */
/*    routing): this is the inventory record for the number itself. */
/* ============================================================================ */
CREATE TABLE __mj."PhoneNumber" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Number" VARCHAR(20) NOT NULL,
  "ProviderID" UUID NOT NULL,
  "Capabilities" VARCHAR(20) NOT NULL DEFAULT (
    'Voice'
  ),
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  "NumberPoolID" UUID NULL,
  "Label" VARCHAR(255) NULL,
  "Description" TEXT NULL,
  CONSTRAINT "PK_PhoneNumber" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_PhoneNumber_Number" UNIQUE (
    "Number"
  ),
  CONSTRAINT "FK_PhoneNumber_Provider" FOREIGN KEY ("ProviderID") REFERENCES __mj."AIBridgeProvider" (
    "ID"
  ),
  CONSTRAINT "FK_PhoneNumber_NumberPool" FOREIGN KEY ("NumberPoolID") REFERENCES __mj."NumberPool" (
    "ID"
  ),
  CONSTRAINT "CK_PhoneNumber_E164" CHECK ("Number" LIKE '+[1-9]%'
  AND "Number" NOT LIKE '+%[^0-9]%'
  AND LENGTH(CAST("Number" AS TEXT)) BETWEEN 5 AND 16),
  CONSTRAINT "CK_PhoneNumber_Capabilities" CHECK ("Capabilities" IN ('Voice', 'VoiceAndSMS')),
  CONSTRAINT "CK_PhoneNumber_Status" CHECK ("Status" IN ('Active', 'Inactive', 'Porting'))
);

COMMENT ON TABLE __mj."PhoneNumber" IS 'A telephone number owned or leased through a telephony bridge provider. The inventory record the contact center selects from for outbound caller ID and routes inbound calls against.';

COMMENT ON COLUMN __mj."PhoneNumber"."Number" IS 'The number in E.164 format: a leading plus sign, a country code, and digits only, with no spaces or punctuation (e.g. +14155550123). Globally unique.';

COMMENT ON COLUMN __mj."PhoneNumber"."ProviderID" IS 'The telephony bridge provider (carrier / CPaaS account such as Twilio or Vonage) through which this number is owned and through which its calls are placed and received.';

COMMENT ON COLUMN __mj."PhoneNumber"."Capabilities" IS 'What the number can do: Voice (calls only) or VoiceAndSMS (calls and text messages).';

COMMENT ON COLUMN __mj."PhoneNumber"."Status" IS 'Lifecycle state of the number: Active (usable), Inactive (retained but not used for new calls), or Porting (being transferred to or from another carrier and not yet usable).';

COMMENT ON COLUMN __mj."PhoneNumber"."NumberPoolID" IS 'Optional number pool this number belongs to for outbound caller-ID selection. NULL when the number is not pooled (for example a dedicated inbound line).';

COMMENT ON COLUMN __mj."PhoneNumber"."Label" IS 'Short human-readable label shown in the UI (e.g. Main Support Line, Sales West).';

COMMENT ON COLUMN __mj."PhoneNumber"."Description" IS 'Optional longer description of the number and how it is used.';

/* ============================================================================ */
/* 3. Interaction  ("MJ: Interactions") */
/*    One live conversation, on any channel. The durable, queryable record that sits */
/*    ABOVE the realtime session: a session is the engine's runtime object, an */
/*    Interaction is the business-facing thing a supervisor sees in a queue, a */
/*    report counts, and a CRM links to. Rows are created at the start of a */
/*    conversation and closed (EndedAt / EndReason) when it finishes. */
/* ============================================================================ */
CREATE TABLE __mj."Interaction" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Channel" VARCHAR(20) NOT NULL,
  "Direction" VARCHAR(20) NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Queued'
  ),
  "AgentSessionID" UUID NULL,
  "RoomName" VARCHAR(255) NULL,
  "PhoneNumberID" UUID NULL,
  "RemoteAddress" VARCHAR(255) NULL,
  "StartedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "AnsweredAt" TIMESTAMPTZ NULL,
  "EndedAt" TIMESTAMPTZ NULL,
  "EndReason" VARCHAR(100) NULL,
  "RecordingEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "ExternalID" VARCHAR(255) NULL,
  "CostEstimate" DECIMAL(18, 6) NULL,
  CONSTRAINT "PK_Interaction" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_Interaction_AgentSession" FOREIGN KEY ("AgentSessionID") REFERENCES __mj."AIAgentSession" (
    "ID"
  ),
  CONSTRAINT "FK_Interaction_PhoneNumber" FOREIGN KEY ("PhoneNumberID") REFERENCES __mj."PhoneNumber" (
    "ID"
  ),
  CONSTRAINT "CK_Interaction_Channel" CHECK ("Channel" IN ('Phone', 'Web', 'Meeting')),
  CONSTRAINT "CK_Interaction_Direction" CHECK ("Direction" IN ('Inbound', 'Outbound', 'Internal')),
  CONSTRAINT "CK_Interaction_Status" CHECK ("Status" IN ('Queued', 'Active', 'Ended', 'Abandoned', 'Failed')),
  CONSTRAINT "CK_Interaction_EndedAfterStarted" CHECK ("EndedAt" IS NULL OR "EndedAt" >= "StartedAt"),
  CONSTRAINT "CK_Interaction_AnsweredAfterStarted" CHECK ("AnsweredAt" IS NULL OR "AnsweredAt" >= "StartedAt"),
  CONSTRAINT "CK_Interaction_CostEstimate" CHECK ("CostEstimate" IS NULL OR "CostEstimate" >= 0)
);

COMMENT ON TABLE __mj."Interaction" IS 'One live conversation on any channel (phone call, web widget chat/voice, or meeting). The durable business record above the realtime agent session: what queues display, reports count, and CRM records link to. Its lifecycle is logged in InteractionEvent and its subject records are attached through InteractionLink.';

COMMENT ON COLUMN __mj."Interaction"."Channel" IS 'The medium the conversation runs over: Phone (a telephone call through a telephony bridge), Web (an embedded web widget session), or Meeting (a multi-party conferencing room).';

COMMENT ON COLUMN __mj."Interaction"."Direction" IS 'Who initiated the conversation: Inbound (the remote party reached us), Outbound (we reached the remote party), or Internal (between participants inside the organization, such as an agent-to-agent or staff consult).';

COMMENT ON COLUMN __mj."Interaction"."Status" IS 'Lifecycle state: Queued (waiting for a handler), Active (a handler is engaged), Ended (completed normally), Abandoned (the remote party left before being answered), or Failed (could not be established or ended in error).';

COMMENT ON COLUMN __mj."Interaction"."AgentSessionID" IS 'The AI agent session driving this conversation, when an agent is handling it. NULL for conversations handled entirely by humans or not yet assigned.';

COMMENT ON COLUMN __mj."Interaction"."RoomName" IS 'Name of the realtime media room (for example the LiveKit room) the conversation runs in, which humans and agents join to participate. NULL when no room is involved.';

COMMENT ON COLUMN __mj."Interaction"."PhoneNumberID" IS 'The organization-owned phone number used for a Phone conversation: the dialed number for Inbound, the caller ID for Outbound. NULL for non-phone channels.';

COMMENT ON COLUMN __mj."Interaction"."RemoteAddress" IS 'The address of the remote party: the caller or callee number for phone, an anonymous session or visitor identifier for web, or the remote party identifier for meetings. Free-form text because the form depends on the channel.';

COMMENT ON COLUMN __mj."Interaction"."StartedAt" IS 'When the conversation was created (call placed or received, widget session opened). Defaults to the current time.';

COMMENT ON COLUMN __mj."Interaction"."AnsweredAt" IS 'When a handler (agent or human) answered and the parties were connected. NULL if never answered. The gap from StartedAt is the wait time.';

COMMENT ON COLUMN __mj."Interaction"."EndedAt" IS 'When the conversation ended. NULL while it is still queued or active. Must not precede StartedAt.';

COMMENT ON COLUMN __mj."Interaction"."EndReason" IS 'Short reason the conversation ended (for example CallerHangup, AgentHangup, Transferred, Timeout, ProviderError). Free-form so new reasons need no schema change. NULL while still open.';

COMMENT ON COLUMN __mj."Interaction"."RecordingEnabled" IS 'Whether media from this conversation is being recorded. Set at creation from the applicable policy and consent rules; it is the intent flag, not proof a recording file exists.';

COMMENT ON COLUMN __mj."Interaction"."ExternalID" IS 'The carrier or platform identifier for the conversation (for example a Twilio call SID), used to correlate provider webhooks and billing records with this row.';

COMMENT ON COLUMN __mj."Interaction"."CostEstimate" IS 'Estimated total cost of the conversation (carrier minutes, speech and model usage) in the organization''s reporting currency, accumulated as it runs. NULL when no estimate is available. An estimate, not an invoice.';

/* ============================================================================ */
/* 4. InteractionEvent  ("MJ: Interaction Events") */
/*    Append-only lifecycle log. Rows are inserted as things happen and are never */
/*    updated or deleted (to be enforced by the server-side entity subclass that */
/*    follows this migration; the schema just provides the shape). */
/* ============================================================================ */
CREATE TABLE __mj."InteractionEvent" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "InteractionID" UUID NOT NULL,
  "EventType" VARCHAR(20) NOT NULL,
  "OccurredAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "ActorUserID" UUID NULL,
  "ActorAgentID" UUID NULL,
  "Details" TEXT NULL,
  CONSTRAINT "PK_InteractionEvent" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_InteractionEvent_Interaction" FOREIGN KEY ("InteractionID") REFERENCES __mj."Interaction" (
    "ID"
  ),
  CONSTRAINT "FK_InteractionEvent_ActorUser" FOREIGN KEY ("ActorUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_InteractionEvent_ActorAgent" FOREIGN KEY ("ActorAgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "CK_InteractionEvent_EventType" CHECK ("EventType" IN (
    'Created',
    'Queued',
    'Offered',
    'Accepted',
    'Declined',
    'Answered',
    'Transferred',
    'Escalated',
    'Held',
    'Resumed',
    'RecordingStarted',
    'RecordingStopped',
    'Ended',
    'Abandoned'
  ))
);

COMMENT ON TABLE __mj."InteractionEvent" IS 'Append-only lifecycle log of an Interaction: each routing decision, hand-off and state change, stamped with when it happened and who or what caused it. Rows are never edited; corrections are new events.';

COMMENT ON COLUMN __mj."InteractionEvent"."EventType" IS 'What happened: Created, Queued (placed in a queue), Offered (offered to a handler), Accepted or Declined (handler response to an offer), Answered (parties connected), Transferred (moved to another handler), Escalated (raised to a human or higher tier), Held, Resumed, RecordingStarted or RecordingStopped (recording consent was announced to every party), Ended, or Abandoned (remote party left before an answer).';

COMMENT ON COLUMN __mj."InteractionEvent"."OccurredAt" IS 'When the event occurred. Defaults to the current time; set explicitly when recording an event reported later by a carrier webhook.';

COMMENT ON COLUMN __mj."InteractionEvent"."ActorUserID" IS 'The human user who caused the event (accepted an offer, transferred, ended the call). NULL when the actor was an agent or the system.';

COMMENT ON COLUMN __mj."InteractionEvent"."ActorAgentID" IS 'The AI agent that caused the event (answered, escalated, transferred). NULL when the actor was a human user or the system.';

COMMENT ON COLUMN __mj."InteractionEvent"."Details" IS 'Optional event-specific JSON detail (for example the transfer target, escalation reason, or queue name). Shape depends on EventType.';

/* ============================================================================ */
/* 5. InteractionLink  ("MJ: Interaction Links") */
/*    Polymorphic link from an Interaction to any MJ record, modelled like TaggedItem */
/*    (EntityID + RecordID). Lets a call be tied to the Person who called, the case it */
/*    was regarding, and any record it created, without the core schema knowing about */
/*    any application's tables. */
/* ============================================================================ */
CREATE TABLE __mj."InteractionLink" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "InteractionID" UUID NOT NULL,
  "EntityID" UUID NOT NULL,
  "RecordID" VARCHAR(450) NOT NULL,
  "Role" VARCHAR(20) NOT NULL,
  CONSTRAINT "PK_InteractionLink" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_InteractionLink_Interaction" FOREIGN KEY ("InteractionID") REFERENCES __mj."Interaction" (
    "ID"
  ),
  CONSTRAINT "FK_InteractionLink_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "UQ_InteractionLink" UNIQUE (
    "InteractionID",
    "EntityID",
    "RecordID",
    "Role"
  ),
  CONSTRAINT "CK_InteractionLink_Role" CHECK ("Role" IN ('Caller', 'Regarding', 'Created'))
);

COMMENT ON TABLE __mj."InteractionLink" IS 'Polymorphic link from an Interaction to any record in any entity, with the role that record played. Modelled like TaggedItem: EntityID plus RecordID identify the target without a foreign key to it.';

COMMENT ON COLUMN __mj."InteractionLink"."EntityID" IS 'The entity (table) of the linked record.';

COMMENT ON COLUMN __mj."InteractionLink"."RecordID" IS 'The primary key of the linked record, as text. For composite keys use the standard MJ concatenated key format. Sized to 450 characters, matching TaggedItem.RecordID.';

COMMENT ON COLUMN __mj."InteractionLink"."Role" IS 'What part the linked record played: Caller (the person or organization on the other end), Regarding (what the conversation was about, such as a case or order), or Created (a record produced during the conversation, such as a ticket or follow-up task).';

/* ============================================================================ */
/* 6. InteractionOffer  ("MJ: Interaction Offers") */
/*    An offer to a person to take over (or join) a live Interaction. Durable so */
/*    that any MJAPI instance can list, accept or decline it, and so expiries and */
/*    responses are auditable. The live push still goes over the GraphQL */
/*    subscription; this table is the source of truth. */
/* ============================================================================ */
CREATE TABLE __mj."InteractionOffer" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "InteractionID" UUID NOT NULL,
  "TargetUserID" UUID NOT NULL,
  "OfferedByAgentID" UUID NULL,
  "Mode" VARCHAR(20) NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Pending'
  ),
  "RoomName" VARCHAR(255) NOT NULL,
  "CallerLabel" VARCHAR(255) NULL,
  "Summary" TEXT NULL,
  "OfferedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "ExpiresAt" TIMESTAMPTZ NOT NULL,
  "RespondedAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_InteractionOffer" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_InteractionOffer_Interaction" FOREIGN KEY ("InteractionID") REFERENCES __mj."Interaction" (
    "ID"
  ),
  CONSTRAINT "FK_InteractionOffer_TargetUser" FOREIGN KEY ("TargetUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_InteractionOffer_OfferedByAgent" FOREIGN KEY ("OfferedByAgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "CK_InteractionOffer_Mode" CHECK ("Mode" IN ('Warm', 'Blind')),
  CONSTRAINT "CK_InteractionOffer_Status" CHECK ("Status" IN ('Pending', 'Accepted', 'Declined', 'Expired', 'Cancelled')),
  CONSTRAINT "CK_InteractionOffer_ExpiresAfterOffered" CHECK ("ExpiresAt" > "OfferedAt"),
  CONSTRAINT "CK_InteractionOffer_RespondedAfterOffered" CHECK ("RespondedAt" IS NULL OR "RespondedAt" >= "OfferedAt")
);

CREATE UNIQUE INDEX "UX_InteractionOffer_OneAccepted" ON __mj."InteractionOffer"("InteractionID")
WHERE
  "Status" = 'Accepted';

COMMENT ON TABLE __mj."InteractionOffer" IS 'An offer to a specific person to take over or join a live Interaction (a warm or blind hand-off from an AI agent). Durable so any server instance can list, accept or decline it and so every response or expiry is auditable. Only the target user may accept or decline.';

COMMENT ON COLUMN __mj."InteractionOffer"."InteractionID" IS 'The Interaction being handed off.';

COMMENT ON COLUMN __mj."InteractionOffer"."TargetUserID" IS 'The person the offer is for. Only this user may accept or decline it.';

COMMENT ON COLUMN __mj."InteractionOffer"."OfferedByAgentID" IS 'The AI agent that made the offer, when an agent made it.';

COMMENT ON COLUMN __mj."InteractionOffer"."Mode" IS 'Warm (the agent stays and introduces the person before leaving) or Blind (the agent leaves as soon as the person joins).';

COMMENT ON COLUMN __mj."InteractionOffer"."Status" IS 'Pending (awaiting a response), Accepted, Declined, Expired (no response before ExpiresAt), or Cancelled (the conversation ended or the offer was withdrawn first).';

COMMENT ON COLUMN __mj."InteractionOffer"."RoomName" IS 'The LiveKit room the person joins on accepting.';

COMMENT ON COLUMN __mj."InteractionOffer"."CallerLabel" IS 'A short label for who is on the other end, shown on the offer (for example a masked number or a known name). Never a full phone number.';

COMMENT ON COLUMN __mj."InteractionOffer"."Summary" IS 'The agent''s brief for the person: why the conversation is being handed over and what has happened so far.';

COMMENT ON COLUMN __mj."InteractionOffer"."OfferedAt" IS 'When the offer was made.';

COMMENT ON COLUMN __mj."InteractionOffer"."ExpiresAt" IS 'When an unanswered offer lapses. A Pending offer past this time is treated as Expired.';

COMMENT ON COLUMN __mj."InteractionOffer"."RespondedAt" IS 'When the offer left Pending (accepted, declined, expired or cancelled).';

/* ============================================================================ */
/* 7. Meeting  ("MJ: Meetings") */
/*    A Zoom-style meeting held in a LiveKit room inside MJ Explorer: ad hoc or */
/*    scheduled, optionally with phone dial-in and AI agents as participants. */
/*    The transcript lives in the linked MJ Conversation (Type 'Meeting Room'). */
/* ============================================================================ */
CREATE TABLE __mj."Meeting" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Title" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "HostUserID" UUID NOT NULL,
  "RoomName" VARCHAR(255) NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Scheduled'
  ),
  "ScheduledStartAt" TIMESTAMPTZ NULL,
  "ScheduledEndAt" TIMESTAMPTZ NULL,
  "StartedAt" TIMESTAMPTZ NULL,
  "EndedAt" TIMESTAMPTZ NULL,
  "AllowPhoneDialIn" BOOLEAN NOT NULL DEFAULT FALSE,
  "DialInPhoneNumberID" UUID NULL,
  "DialInCode" VARCHAR(20) NULL,
  "RecordingPolicy" VARCHAR(20) NOT NULL DEFAULT (
    'Off'
  ),
  "ConversationID" UUID NULL,
  CONSTRAINT "PK_Meeting" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_Meeting_RoomName" UNIQUE (
    "RoomName"
  ),
  CONSTRAINT "FK_Meeting_HostUser" FOREIGN KEY ("HostUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_Meeting_DialInPhoneNumber" FOREIGN KEY ("DialInPhoneNumberID") REFERENCES __mj."PhoneNumber" (
    "ID"
  ),
  CONSTRAINT "FK_Meeting_Conversation" FOREIGN KEY ("ConversationID") REFERENCES __mj."Conversation" (
    "ID"
  ),
  CONSTRAINT "CK_Meeting_Status" CHECK ("Status" IN ('Scheduled', 'Live', 'Ended', 'Cancelled')),
  CONSTRAINT "CK_Meeting_RecordingPolicy" CHECK ("RecordingPolicy" IN ('Off', 'Allowed', 'Automatic')),
  CONSTRAINT "CK_Meeting_ScheduledEndAfterStart" CHECK ("ScheduledEndAt" IS NULL
  OR (
    NOT "ScheduledStartAt" IS NULL AND "ScheduledEndAt" > "ScheduledStartAt"
  )),
  CONSTRAINT "CK_Meeting_EndedAfterStarted" CHECK ("EndedAt" IS NULL OR (
    NOT "StartedAt" IS NULL AND "EndedAt" >= "StartedAt"
  )),
  CONSTRAINT "CK_Meeting_DialInConfigured" CHECK ("AllowPhoneDialIn" = FALSE
  OR (
    NOT "DialInPhoneNumberID" IS NULL AND NOT "DialInCode" IS NULL
  )),
  CONSTRAINT "CK_Meeting_DialInCodeDigits" CHECK ("DialInCode" IS NULL
  OR (
    "DialInCode" NOT LIKE '%[^0-9]%'
    AND LENGTH(CAST("DialInCode" AS TEXT)) BETWEEN 6 AND 20
  ))
);

COMMENT ON TABLE __mj."Meeting" IS 'A Zoom-style meeting held in a LiveKit room inside MJ Explorer. Ad hoc (no schedule) or scheduled; people join from the browser, by phone when dial-in is enabled, and AI agents can take part. The transcript is kept in the linked Conversation.';

COMMENT ON COLUMN __mj."Meeting"."Title" IS 'The meeting title shown to participants and in invitations.';

COMMENT ON COLUMN __mj."Meeting"."Description" IS 'Optional agenda or description.';

COMMENT ON COLUMN __mj."Meeting"."HostUserID" IS 'The user who owns the meeting. The host can start and end it, admit participants and change its settings.';

COMMENT ON COLUMN __mj."Meeting"."RoomName" IS 'The LiveKit room the meeting runs in. Unique, and unguessable (generated, never user-chosen), because room names are also join handles.';

COMMENT ON COLUMN __mj."Meeting"."Status" IS 'Scheduled (not yet started), Live (in progress), Ended, or Cancelled.';

COMMENT ON COLUMN __mj."Meeting"."ScheduledStartAt" IS 'Planned start time. NULL for an ad hoc meeting.';

COMMENT ON COLUMN __mj."Meeting"."ScheduledEndAt" IS 'Planned end time. Requires ScheduledStartAt and must be after it.';

COMMENT ON COLUMN __mj."Meeting"."StartedAt" IS 'When the meeting actually started (first participant joined).';

COMMENT ON COLUMN __mj."Meeting"."EndedAt" IS 'When the meeting actually ended.';

COMMENT ON COLUMN __mj."Meeting"."AllowPhoneDialIn" IS 'Whether people may join by phone. When on, DialInPhoneNumberID and DialInCode are required.';

COMMENT ON COLUMN __mj."Meeting"."DialInPhoneNumberID" IS 'The phone number callers dial to reach the meeting. Several meetings may share one number; the DialInCode picks the meeting.';

COMMENT ON COLUMN __mj."Meeting"."DialInCode" IS 'Digits a phone caller enters to join this meeting (6 to 20 digits). A meeting join code shown on invitations, not an account credential; generate it randomly and never reuse one across live meetings on the same number.';

COMMENT ON COLUMN __mj."Meeting"."RecordingPolicy" IS 'Off (never recorded), Allowed (the host may start a recording, which is announced to everyone), or Automatic (recording starts with the meeting and is announced to everyone).';

COMMENT ON COLUMN __mj."Meeting"."ConversationID" IS 'The Conversation (Type ''Meeting Room'') that holds the meeting transcript and any recording file.';

/* ============================================================================ */
/* 8. MeetingParticipant  ("MJ: Meeting Participants") */
/*    Who is invited to, or took part in, a Meeting: an MJ user, an AI agent, */
/*    or an external guest identified by email and/or phone. */
/* ============================================================================ */
CREATE TABLE __mj."MeetingParticipant" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "MeetingID" UUID NOT NULL,
  "UserID" UUID NULL,
  "AgentID" UUID NULL,
  "ExternalName" VARCHAR(255) NULL,
  "ExternalEmail" VARCHAR(255) NULL,
  "ExternalPhone" VARCHAR(20) NULL,
  "Role" VARCHAR(20) NOT NULL DEFAULT (
    'Attendee'
  ),
  "InviteStatus" VARCHAR(20) NOT NULL DEFAULT (
    'Invited'
  ),
  "JoinedAt" TIMESTAMPTZ NULL,
  "LeftAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_MeetingParticipant" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MeetingParticipant_Meeting" FOREIGN KEY ("MeetingID") REFERENCES __mj."Meeting" (
    "ID"
  ),
  CONSTRAINT "FK_MeetingParticipant_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_MeetingParticipant_Agent" FOREIGN KEY ("AgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "CK_MeetingParticipant_ExactlyOneKind" CHECK ((
    CASE WHEN NOT "UserID" IS NULL THEN 1 ELSE 0 END
  ) + (
    CASE WHEN NOT "AgentID" IS NULL THEN 1 ELSE 0 END
  ) + (
    CASE
      WHEN NOT "ExternalEmail" IS NULL OR NOT "ExternalPhone" IS NULL
      THEN 1
      ELSE 0
    END
  ) = 1),
  CONSTRAINT "CK_MeetingParticipant_AgentRole" CHECK ((
    "AgentID" IS NULL AND "Role" <> 'Agent'
  )
  OR (
    NOT "AgentID" IS NULL AND "Role" = 'Agent'
  )),
  CONSTRAINT "CK_MeetingParticipant_ExternalPhoneE164" CHECK ("ExternalPhone" IS NULL
  OR (
    "ExternalPhone" LIKE '+[1-9]%'
    AND "ExternalPhone" NOT LIKE '+%[^0-9]%'
    AND LENGTH(CAST("ExternalPhone" AS TEXT)) BETWEEN 5 AND 16
  )),
  CONSTRAINT "CK_MeetingParticipant_Role" CHECK ("Role" IN ('Host', 'CoHost', 'Attendee', 'Agent')),
  CONSTRAINT "CK_MeetingParticipant_InviteStatus" CHECK ("InviteStatus" IN ('Invited', 'Accepted', 'Declined', 'Tentative')),
  CONSTRAINT "CK_MeetingParticipant_LeftAfterJoined" CHECK ("LeftAt" IS NULL OR (
    NOT "JoinedAt" IS NULL AND "LeftAt" >= "JoinedAt"
  ))
);

COMMENT ON TABLE __mj."MeetingParticipant" IS 'A person or AI agent invited to, or present in, a Meeting. Exactly one of: an MJ user (UserID), an AI agent (AgentID, Role Agent), or an external guest (ExternalEmail and/or ExternalPhone).';

COMMENT ON COLUMN __mj."MeetingParticipant"."MeetingID" IS 'The meeting.';

COMMENT ON COLUMN __mj."MeetingParticipant"."UserID" IS 'The MJ user, when the participant is a user.';

COMMENT ON COLUMN __mj."MeetingParticipant"."AgentID" IS 'The AI agent, when the participant is an agent. Requires Role Agent.';

COMMENT ON COLUMN __mj."MeetingParticipant"."ExternalName" IS 'Display name for an external guest.';

COMMENT ON COLUMN __mj."MeetingParticipant"."ExternalEmail" IS 'Email address an external guest is invited at.';

COMMENT ON COLUMN __mj."MeetingParticipant"."ExternalPhone" IS 'E.164 phone number an external guest is dialed at or joins from.';

COMMENT ON COLUMN __mj."MeetingParticipant"."Role" IS 'Host, CoHost (same controls as the host), Attendee, or Agent (an AI agent participant).';

COMMENT ON COLUMN __mj."MeetingParticipant"."InviteStatus" IS 'The response to the invitation: Invited (no response yet), Accepted, Declined, or Tentative.';

COMMENT ON COLUMN __mj."MeetingParticipant"."JoinedAt" IS 'When the participant most recently joined the meeting room.';

COMMENT ON COLUMN __mj."MeetingParticipant"."LeftAt" IS 'When the participant most recently left the meeting room.';

ALTER TABLE __mj."AIAgentSessionBridge"
  ADD COLUMN "TurnAddressing" VARCHAR(20) NULL CONSTRAINT "CK_AIAgentSessionBridge_TurnAddressing" CHECK ("TurnAddressing" IS NULL OR "TurnAddressing" IN ('Auto', 'ModelSide', 'Regex'))
 /* ============================================================================ */ /* 9. AIAgentSessionBridge.TurnAddressing  (existing table, one new column) */ /*    Records how a bridged agent decided it was being addressed, next to the */ /*    TurnMode the table already stores. NULL for rows written before this */ /*    column existed, and for sessions that never chose a mode. */ /* ============================================================================ */;

COMMENT ON COLUMN __mj."AIAgentSessionBridge"."TurnAddressing" IS 'How the agent decided speech was addressed to it: Auto (the model''s own judgement when it is full-duplex, name matching otherwise), ModelSide (the model''s own judgement), or Regex (matching the agent''s names). NULL when not recorded.';

/* ===================================================================================== */
/* ===================================================================================== */
/* ==  EVERYTHING BELOW THIS BANNER IS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL    == */
/* ==  (Entity + EntityField + EntityRelationship rows, base views, spCreate / spUpdate == */
/* ==  / spDelete procedures, permission grants, extended properties).                  == */
/* ==  DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen and   == */
/* ==  replace this section wholesale.                                                  == */
/* ==                                                                                   == */
/* ==  CODEGEN OUTPUT TO BE APPENDED LOCALLY                                            == */
/* ==  The owner applies this migration and runs CodeGen against a dedicated database,  == */
/* ==  then pastes the CodeGen_Run_*.sql capture here. EntityField INSERTs in the       == */
/* ==  capture must use the apply-time MAX(Sequence)+1 expression, never a literal      == */
/* ==  (run: node .github/scripts/check-migration-entityfield-sequence.mjs).            == */
/* ===================================================================================== */
/* ===================================================================================== */
/* SQL generated to create new entity MJ: Number Pools */
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
    '59be3eba-3c9a-41d1-b725-a1ca92e0411c',
    'MJ: Number Pools',
    'Number Pools',
    'A named group of phone numbers used together for outbound calling, with a rule for which number is chosen as the caller ID on each call. Inbound routing does not use pools.',
    NULL,
    'NumberPool',
    'vwNumberPools',
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
/* SQL generated to add new entity MJ: Number Pools to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '59be3eba-3c9a-41d1-b725-a1ca92e0411c',
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
/* SQL generated to add new permission for entity MJ: Number Pools for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Number Pools for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Number Pools for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('59be3eba-3c9a-41d1-b725-a1ca92e0411c' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Phone Numbers */
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
    '8d7a7bd5-95e8-428c-874a-3829bad6685e',
    'MJ: Phone Numbers',
    'Phone Numbers',
    'A telephone number owned or leased through a telephony bridge provider. The inventory record the contact center selects from for outbound caller ID and routes inbound calls against.',
    NULL,
    'PhoneNumber',
    'vwPhoneNumbers',
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
/* SQL generated to add new entity MJ: Phone Numbers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '8d7a7bd5-95e8-428c-874a-3829bad6685e',
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
/* SQL generated to add new permission for entity MJ: Phone Numbers for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Phone Numbers for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Phone Numbers for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('8d7a7bd5-95e8-428c-874a-3829bad6685e' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Interactions */
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
    '4a355a56-eae0-47d9-84cd-ce2bb49160db',
    'MJ: Interactions',
    'Interactions',
    'One live conversation on any channel (phone call, web widget chat/voice, or meeting). The durable business record above the realtime agent session: what queues display, reports count, and CRM records link to. Its lifecycle is logged in InteractionEvent and its subject records are attached through InteractionLink.',
    NULL,
    'Interaction',
    'vwInteractions',
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
/* SQL generated to add new entity MJ: Interactions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '4a355a56-eae0-47d9-84cd-ce2bb49160db',
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
/* SQL generated to add new permission for entity MJ: Interactions for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Interactions for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Interactions for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('4a355a56-eae0-47d9-84cd-ce2bb49160db' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Interaction Events */
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
    '57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3',
    'MJ: Interaction Events',
    'Interaction Events',
    'Append-only lifecycle log of an Interaction: each routing decision, hand-off and state change, stamped with when it happened and who or what caused it. Rows are never edited; corrections are new events.',
    NULL,
    'InteractionEvent',
    'vwInteractionEvents',
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
/* SQL generated to add new entity MJ: Interaction Events to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3',
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
/* SQL generated to add new permission for entity MJ: Interaction Events for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Interaction Events for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Interaction Events for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('57c600e9-7eaf-4ff9-b0e7-04f7c2586ef3' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Interaction Links */
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
    '5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a',
    'MJ: Interaction Links',
    'Interaction Links',
    'Polymorphic link from an Interaction to any record in any entity, with the role that record played. Modelled like TaggedItem: EntityID plus RecordID identify the target without a foreign key to it.',
    NULL,
    'InteractionLink',
    'vwInteractionLinks',
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
/* SQL generated to add new entity MJ: Interaction Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a',
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
/* SQL generated to add new permission for entity MJ: Interaction Links for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Interaction Links for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Interaction Links for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('5cc79ce4-bb4c-4ed0-8a02-4dcdc3140e4a' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Interaction Offers */
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
    '6dc12139-38a1-43c6-85ee-8066450e762b',
    'MJ: Interaction Offers',
    'Interaction Offers',
    'An offer to a specific person to take over or join a live Interaction (a warm or blind hand-off from an AI agent). Durable so any server instance can list, accept or decline it and so every response or expiry is auditable. Only the target user may accept or decline.',
    NULL,
    'InteractionOffer',
    'vwInteractionOffers',
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
/* SQL generated to add new entity MJ: Interaction Offers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '6dc12139-38a1-43c6-85ee-8066450e762b',
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
/* SQL generated to add new permission for entity MJ: Interaction Offers for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Interaction Offers for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Interaction Offers for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('6dc12139-38a1-43c6-85ee-8066450e762b' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Meetings */
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
    'd2a67d87-f495-43e3-a91b-5a46e5553c31',
    'MJ: Meetings',
    'Meetings',
    'A Zoom-style meeting held in a LiveKit room inside MJ Explorer. Ad hoc (no schedule) or scheduled; people join from the browser, by phone when dial-in is enabled, and AI agents can take part. The transcript is kept in the linked Conversation.',
    NULL,
    'Meeting',
    'vwMeetings',
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
/* SQL generated to add new entity MJ: Meetings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'd2a67d87-f495-43e3-a91b-5a46e5553c31',
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
/* SQL generated to add new permission for entity MJ: Meetings for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Meetings for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Meetings for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('d2a67d87-f495-43e3-a91b-5a46e5553c31' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Meeting Participants */
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
    'db511323-5673-45f9-a47f-5a4604fb19b0',
    'MJ: Meeting Participants',
    'Meeting Participants',
    'A person or AI agent invited to, or present in, a Meeting. Exactly one of: an MJ user (UserID), an AI agent (AgentID, Role Agent), or an external guest (ExternalEmail and/or ExternalPhone).',
    NULL,
    'MeetingParticipant',
    'vwMeetingParticipants',
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
/* SQL generated to add new entity MJ: Meeting Participants to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'db511323-5673-45f9-a47f-5a4604fb19b0',
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
/* SQL generated to add new permission for entity MJ: Meeting Participants for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Meeting Participants for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Meeting Participants for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('db511323-5673-45f9-a47f-5a4604fb19b0' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."InteractionEvent"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.InteractionEvent */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.InteractionEvent */
UPDATE __mj."InteractionEvent" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'InteractionEvent' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."InteractionEvent" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."InteractionEvent" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."InteractionEvent"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.InteractionEvent */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.InteractionEvent */
UPDATE __mj."InteractionEvent" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'InteractionEvent' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."InteractionEvent" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."InteractionEvent" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."PhoneNumber"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.PhoneNumber */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.PhoneNumber */
UPDATE __mj."PhoneNumber" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'PhoneNumber' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."PhoneNumber" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."PhoneNumber" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."PhoneNumber"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.PhoneNumber */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.PhoneNumber */
UPDATE __mj."PhoneNumber" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'PhoneNumber' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."PhoneNumber" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."PhoneNumber" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."InteractionLink"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.InteractionLink */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.InteractionLink */
UPDATE __mj."InteractionLink" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'InteractionLink' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."InteractionLink" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."InteractionLink" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."InteractionLink"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.InteractionLink */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.InteractionLink */
UPDATE __mj."InteractionLink" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'InteractionLink' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."InteractionLink" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."InteractionLink" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MeetingParticipant"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MeetingParticipant */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MeetingParticipant */
UPDATE __mj."MeetingParticipant" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MeetingParticipant' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MeetingParticipant" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MeetingParticipant" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MeetingParticipant"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MeetingParticipant */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MeetingParticipant */
UPDATE __mj."MeetingParticipant" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MeetingParticipant' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MeetingParticipant" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MeetingParticipant" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Meeting"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.Meeting */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.Meeting */
UPDATE __mj."Meeting" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'Meeting' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Meeting" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."Meeting" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Meeting"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.Meeting */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.Meeting */
UPDATE __mj."Meeting" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'Meeting' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Meeting" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."Meeting" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."InteractionOffer"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.InteractionOffer */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.InteractionOffer */
UPDATE __mj."InteractionOffer" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'InteractionOffer' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."InteractionOffer" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."InteractionOffer" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."InteractionOffer"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.InteractionOffer */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.InteractionOffer */
UPDATE __mj."InteractionOffer" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'InteractionOffer' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."InteractionOffer" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."InteractionOffer" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."NumberPool"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.NumberPool */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.NumberPool */
UPDATE __mj."NumberPool" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'NumberPool' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."NumberPool" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."NumberPool" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."NumberPool"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.NumberPool */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.NumberPool */
UPDATE __mj."NumberPool" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'NumberPool' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."NumberPool" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."NumberPool" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Interaction"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.Interaction */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.Interaction */
UPDATE __mj."Interaction" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'Interaction' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Interaction" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."Interaction" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Interaction"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.Interaction */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.Interaction */
UPDATE __mj."Interaction" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'Interaction' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Interaction" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."Interaction" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd4b554e4-a81b-4856-8219-b383d6026759' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d4b554e4-a81b-4856-8219-b383d6026759', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4bedf078-b1b1-4e35-a9e0-cd88952d1acb' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'InteractionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4bedf078-b1b1-4e35-a9e0-cd88952d1acb', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), 'InteractionID', 'Interaction ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c0278f57-7911-448c-91d3-ce8f34ce03f1' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'EventType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c0278f57-7911-448c-91d3-ce8f34ce03f1', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), 'EventType', 'Event Type', 'What happened: Created, Queued (placed in a queue), Offered (offered to a handler), Accepted or Declined (handler response to an offer), Answered (parties connected), Transferred (moved to another handler), Escalated (raised to a human or higher tier), Held, Resumed, RecordingStarted or RecordingStopped (recording consent was announced to every party), Ended, or Abandoned (remote party left before an answer).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd93cda9d-e87e-4744-8844-e124aff94169' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'OccurredAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d93cda9d-e87e-4744-8844-e124aff94169', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), 'OccurredAt', 'Occurred At', 'When the event occurred. Defaults to the current time; set explicitly when recording an event reported later by a carrier webhook.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bd207912-2d3c-4800-8c37-179db85ab4a9' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'ActorUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bd207912-2d3c-4800-8c37-179db85ab4a9', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), 'ActorUserID', 'Actor User ID', 'The human user who caused the event (accepted an offer, transferred, ended the call). NULL when the actor was an agent or the system.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cb4b0e76-a6d2-49c1-9cc1-41f548cad78d' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'ActorAgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cb4b0e76-a6d2-49c1-9cc1-41f548cad78d', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), 'ActorAgentID', 'Actor Agent ID', 'The AI agent that caused the event (answered, escalated, transferred). NULL when the actor was a human user or the system.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd05086c-c0ce-403a-8939-e77468d908be' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'Details')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd05086c-c0ce-403a-8939-e77468d908be', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), 'Details', 'Details', 'Optional event-specific JSON detail (for example the transfer target, escalation reason, or queue name). Shape depends on EventType.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '34068729-3004-4212-ae09-7236f89e045e' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('34068729-3004-4212-ae09-7236f89e045e', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '16b0d3b4-26c3-444a-b617-66dad6fa6058' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('16b0d3b4-26c3-444a-b617-66dad6fa6058', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d87c35d-628d-405f-92bf-ea5442c5c425' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2d87c35d-628d-405f-92bf-ea5442c5c425', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3b41c1dd-758f-47d3-a3ba-c368b166b8f3' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'Number')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3b41c1dd-758f-47d3-a3ba-c368b166b8f3', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'Number', 'Number', 'The number in E.164 format: a leading plus sign, a country code, and digits only, with no spaces or punctuation (e.g. +14155550123). Globally unique.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2fc8f97f-3a59-4053-9c3c-4ad7f19ff6b5' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'ProviderID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2fc8f97f-3a59-4053-9c3c-4ad7f19ff6b5', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'ProviderID', 'Provider ID', 'The telephony bridge provider (carrier / CPaaS account such as Twilio or Vonage) through which this number is owned and through which its calls are placed and received.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '840A51D1-7436-45F9-9176-31E1FE785635', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7b398e84-9f18-4157-afa1-8fd3756e42cd' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'Capabilities')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7b398e84-9f18-4157-afa1-8fd3756e42cd', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'Capabilities', 'Capabilities', 'What the number can do: Voice (calls only) or VoiceAndSMS (calls and text messages).', 'nvarchar', 40, 0, 0, FALSE, 'Voice', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2fec2316-9558-4db7-9e87-97c84b742404' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2fec2316-9558-4db7-9e87-97c84b742404', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'Status', 'Status', 'Lifecycle state of the number: Active (usable), Inactive (retained but not used for new calls), or Porting (being transferred to or from another carrier and not yet usable).', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ffad7d30-f020-4ee9-9452-c283032f833a' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'NumberPoolID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ffad7d30-f020-4ee9-9452-c283032f833a', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'NumberPoolID', 'Number Pool ID', 'Optional number pool this number belongs to for outbound caller-ID selection. NULL when the number is not pooled (for example a dedicated inbound line).', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f066bb7c-c684-4327-baaa-e82a7f028ff5' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'Label')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f066bb7c-c684-4327-baaa-e82a7f028ff5', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'Label', 'Label', 'Short human-readable label shown in the UI (e.g. Main Support Line, Sales West).', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39dbfc58-6334-4131-9552-3573d34cb88a' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39dbfc58-6334-4131-9552-3573d34cb88a', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'Description', 'Description', 'Optional longer description of the number and how it is used.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '69676e28-47fb-41b0-a0cd-5125abd2da76' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('69676e28-47fb-41b0-a0cd-5125abd2da76', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fb592e30-5b27-4c8c-93ae-53c04b45bb48' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fb592e30-5b27-4c8c-93ae-53c04b45bb48', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7372acce-16a0-4ade-9c75-72a512197f5a' OR ("EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7372acce-16a0-4ade-9c75-72a512197f5a', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' /* Entity: MJ: Interaction Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '55297f30-9b4c-470c-a13f-1e0d8ae43866' OR ("EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = 'InteractionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('55297f30-9b4c-470c-a13f-1e0d8ae43866', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' /* Entity: MJ: Interaction Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'), 'InteractionID', 'Interaction ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3ce1ede7-ae95-476e-b7c3-12406f9f6f3a' OR ("EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3ce1ede7-ae95-476e-b7c3-12406f9f6f3a', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' /* Entity: MJ: Interaction Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'), 'EntityID', 'Entity ID', 'The entity (table) of the linked record.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dfc97246-0832-42dd-b3aa-8c61221c463e' OR ("EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = 'RecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dfc97246-0832-42dd-b3aa-8c61221c463e', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' /* Entity: MJ: Interaction Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'), 'RecordID', 'Record ID', 'The primary key of the linked record, as text. For composite keys use the standard MJ concatenated key format. Sized to 450 characters, matching TaggedItem.RecordID.', 'nvarchar', 900, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '20988255-327a-46ee-aaba-60b8df1ac2a4' OR ("EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = 'Role')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('20988255-327a-46ee-aaba-60b8df1ac2a4', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' /* Entity: MJ: Interaction Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'), 'Role', 'Role', 'What part the linked record played: Caller (the person or organization on the other end), Regarding (what the conversation was about, such as a case or order), or Created (a record produced during the conversation, such as a ticket or follow-up task).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1293d1da-9692-4400-84ca-de8717f1be10' OR ("EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1293d1da-9692-4400-84ca-de8717f1be10', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' /* Entity: MJ: Interaction Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '60b609a0-fdf7-4a6b-96a3-3b78cb083d02' OR ("EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('60b609a0-fdf7-4a6b-96a3-3b78cb083d02', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' /* Entity: MJ: Interaction Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e2361941-23ea-466a-9360-e8c980ebfacc' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e2361941-23ea-466a-9360-e8c980ebfacc', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15040ace-8782-426c-b2c1-62117e45913d' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'MeetingID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('15040ace-8782-426c-b2c1-62117e45913d', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'MeetingID', 'Meeting ID', 'The meeting.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b55b3d09-0a92-48b5-8654-f8ce7ca2101f' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b55b3d09-0a92-48b5-8654-f8ce7ca2101f', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'UserID', 'User ID', 'The MJ user, when the participant is a user.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c366bdb-25b2-4783-b1d6-444628aed556' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'AgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c366bdb-25b2-4783-b1d6-444628aed556', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'AgentID', 'Agent ID', 'The AI agent, when the participant is an agent. Requires Role Agent.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ccbc94bb-3dd7-42bb-9af4-1e4f26851015' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'ExternalName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ccbc94bb-3dd7-42bb-9af4-1e4f26851015', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'ExternalName', 'External Name', 'Display name for an external guest.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '717ea04c-c814-47e8-9f02-44a95fe336e7' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'ExternalEmail')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('717ea04c-c814-47e8-9f02-44a95fe336e7', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'ExternalEmail', 'External Email', 'Email address an external guest is invited at.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '97f9d011-24b7-4775-8305-0eff11cb4fd9' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'ExternalPhone')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('97f9d011-24b7-4775-8305-0eff11cb4fd9', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'ExternalPhone', 'External Phone', 'E.164 phone number an external guest is dialed at or joins from.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1627e4df-796a-4e73-ba99-fc9fbe9f1981' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'Role')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1627e4df-796a-4e73-ba99-fc9fbe9f1981', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'Role', 'Role', 'Host, CoHost (same controls as the host), Attendee, or Agent (an AI agent participant).', 'nvarchar', 40, 0, 0, FALSE, 'Attendee', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4a872147-e34e-44c7-be8b-b8584a12a22c' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'InviteStatus')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4a872147-e34e-44c7-be8b-b8584a12a22c', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'InviteStatus', 'Invite Status', 'The response to the invitation: Invited (no response yet), Accepted, Declined, or Tentative.', 'nvarchar', 40, 0, 0, FALSE, 'Invited', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c3587eb5-7cec-4751-a7b1-7c485c1dbc1a' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'JoinedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c3587eb5-7cec-4751-a7b1-7c485c1dbc1a', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'JoinedAt', 'Joined At', 'When the participant most recently joined the meeting room.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4a76ba73-9777-4ee1-83fd-6ecfcd56e8dd' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'LeftAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4a76ba73-9777-4ee1-83fd-6ecfcd56e8dd', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'LeftAt', 'Left At', 'When the participant most recently left the meeting room.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7b08be5b-88b7-4763-847c-d2fe09533cff' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7b08be5b-88b7-4763-847c-d2fe09533cff', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3bca8f13-2716-42e4-b1ef-19645a05a774' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3bca8f13-2716-42e4-b1ef-19645a05a774', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '875f94a4-ec81-4464-9715-bc8aec15a677' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('875f94a4-ec81-4464-9715-bc8aec15a677', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39f217d9-1541-4164-b739-da850f044aa4' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'Title')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39f217d9-1541-4164-b739-da850f044aa4', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'Title', 'Title', 'The meeting title shown to participants and in invitations.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5a2c1e9b-6c83-4803-a5ea-639ed7689a71' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5a2c1e9b-6c83-4803-a5ea-639ed7689a71', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'Description', 'Description', 'Optional agenda or description.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b8c2f7c9-6de0-4741-8f19-81ecd08a2b6e' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'HostUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b8c2f7c9-6de0-4741-8f19-81ecd08a2b6e', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'HostUserID', 'Host User ID', 'The user who owns the meeting. The host can start and end it, admit participants and change its settings.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1d05dcdd-ac68-49d7-a0e9-a3701f2f1912' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'RoomName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1d05dcdd-ac68-49d7-a0e9-a3701f2f1912', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'RoomName', 'Room Name', 'The LiveKit room the meeting runs in. Unique, and unguessable (generated, never user-chosen), because room names are also join handles.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1e62e57a-f360-4b72-a675-f0799dffee6f' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1e62e57a-f360-4b72-a675-f0799dffee6f', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'Status', 'Status', 'Scheduled (not yet started), Live (in progress), Ended, or Cancelled.', 'nvarchar', 40, 0, 0, FALSE, 'Scheduled', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63e402d5-1469-41ed-b8f5-0d31590eca4d' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'ScheduledStartAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('63e402d5-1469-41ed-b8f5-0d31590eca4d', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'ScheduledStartAt', 'Scheduled Start At', 'Planned start time. NULL for an ad hoc meeting.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '91dc7642-d457-4d7b-b8c0-77804db37695' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'ScheduledEndAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('91dc7642-d457-4d7b-b8c0-77804db37695', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'ScheduledEndAt', 'Scheduled End At', 'Planned end time. Requires ScheduledStartAt and must be after it.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '782b4288-581d-44ca-a18b-af32af7dc08c' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'StartedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('782b4288-581d-44ca-a18b-af32af7dc08c', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'StartedAt', 'Started At', 'When the meeting actually started (first participant joined).', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fadde66d-a143-4125-afbf-061e91a6aa37' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'EndedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fadde66d-a143-4125-afbf-061e91a6aa37', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'EndedAt', 'Ended At', 'When the meeting actually ended.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '00945934-7691-4dfe-b0b5-8dc7d6102ebd' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'AllowPhoneDialIn')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('00945934-7691-4dfe-b0b5-8dc7d6102ebd', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'AllowPhoneDialIn', 'Allow Phone Dial In', 'Whether people may join by phone. When on, DialInPhoneNumberID and DialInCode are required.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6de00dfc-503d-49bd-b527-c770f7120913' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'DialInPhoneNumberID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6de00dfc-503d-49bd-b527-c770f7120913', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'DialInPhoneNumberID', 'Dial In Phone Number ID', 'The phone number callers dial to reach the meeting. Several meetings may share one number; the DialInCode picks the meeting.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc559752-25dd-4e8e-aa3b-51a66bc82473' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'DialInCode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cc559752-25dd-4e8e-aa3b-51a66bc82473', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'DialInCode', 'Dial In Code', 'Digits a phone caller enters to join this meeting (6 to 20 digits). A meeting join code shown on invitations, not an account credential; generate it randomly and never reuse one across live meetings on the same number.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '12d4612e-1bc0-4d67-bf74-6c1ceae0116d' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'RecordingPolicy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('12d4612e-1bc0-4d67-bf74-6c1ceae0116d', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'RecordingPolicy', 'Recording Policy', 'Off (never recorded), Allowed (the host may start a recording, which is announced to everyone), or Automatic (recording starts with the meeting and is announced to everyone).', 'nvarchar', 40, 0, 0, FALSE, 'Off', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fc10509e-ecdb-411d-9cd9-96da88dddd6f' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'ConversationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fc10509e-ecdb-411d-9cd9-96da88dddd6f', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'ConversationID', 'Conversation ID', 'The Conversation (Type ''Meeting Room'') that holds the meeting transcript and any recording file.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '13248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a9dc6a28-ac90-40ef-bb3b-635ae9b77539' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a9dc6a28-ac90-40ef-bb3b-635ae9b77539', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41b2e1e4-62b2-4890-b06a-c71ecec16e85' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('41b2e1e4-62b2-4890-b06a-c71ecec16e85', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9d30f606-8737-4390-ada7-a73e4a067798' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9d30f606-8737-4390-ada7-a73e4a067798', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1819b575-246c-4aba-ad85-742f523054a8' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'InteractionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1819b575-246c-4aba-ad85-742f523054a8', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'InteractionID', 'Interaction ID', 'The Interaction being handed off.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3de69740-7fa4-4719-af4e-6c274f846eeb' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'TargetUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3de69740-7fa4-4719-af4e-6c274f846eeb', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'TargetUserID', 'Target User ID', 'The person the offer is for. Only this user may accept or decline it.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f08d5a5f-d0c0-485d-bc76-08cdfcafa3c3' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'OfferedByAgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f08d5a5f-d0c0-485d-bc76-08cdfcafa3c3', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'OfferedByAgentID', 'Offered By Agent ID', 'The AI agent that made the offer, when an agent made it.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1233ca0b-7596-4362-a6c7-cc24a670273c' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'Mode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1233ca0b-7596-4362-a6c7-cc24a670273c', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'Mode', 'Mode', 'Warm (the agent stays and introduces the person before leaving) or Blind (the agent leaves as soon as the person joins).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aec569b3-0e6e-4236-b8bf-d91314801f7f' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aec569b3-0e6e-4236-b8bf-d91314801f7f', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'Status', 'Status', 'Pending (awaiting a response), Accepted, Declined, Expired (no response before ExpiresAt), or Cancelled (the conversation ended or the offer was withdrawn first).', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd0490039-c5a3-4203-a5bb-e4be61f51c1f' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'RoomName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d0490039-c5a3-4203-a5bb-e4be61f51c1f', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'RoomName', 'Room Name', 'The LiveKit room the person joins on accepting.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '289065f3-bba3-440d-9de7-10735487bcbe' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'CallerLabel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('289065f3-bba3-440d-9de7-10735487bcbe', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'CallerLabel', 'Caller Label', 'A short label for who is on the other end, shown on the offer (for example a masked number or a known name). Never a full phone number.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '30eb5d7d-bd6a-478d-9e29-7f904b111ab8' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'Summary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('30eb5d7d-bd6a-478d-9e29-7f904b111ab8', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'Summary', 'Summary', 'The agent''s brief for the person: why the conversation is being handed over and what has happened so far.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b9966af0-e7b1-4b23-8170-95b16f7b0dc8' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'OfferedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b9966af0-e7b1-4b23-8170-95b16f7b0dc8', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'OfferedAt', 'Offered At', 'When the offer was made.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '71b68d69-ae66-4685-890e-661f29bef358' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'ExpiresAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('71b68d69-ae66-4685-890e-661f29bef358', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'ExpiresAt', 'Expires At', 'When an unanswered offer lapses. A Pending offer past this time is treated as Expired.', 'datetimeoffset', 10, 34, 7, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '38e1e98e-ff12-4b4f-84fb-ac4d9a255be7' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'RespondedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38e1e98e-ff12-4b4f-84fb-ac4d9a255be7', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'RespondedAt', 'Responded At', 'When the offer left Pending (accepted, declined, expired or cancelled).', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '55e2322c-3f37-4d56-8f78-59c9e905a00f' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('55e2322c-3f37-4d56-8f78-59c9e905a00f', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5d125f1d-3f6c-4c82-ae51-87c1d9a322b3' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5d125f1d-3f6c-4c82-ae51-87c1d9a322b3', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd88de1cd-4bd3-4148-b810-dc31a7105775' OR ("EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d88de1cd-4bd3-4148-b810-dc31a7105775', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' /* Entity: MJ: Number Pools */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bfe7a1fb-adfe-4156-bfa1-05e2462e0afe' OR ("EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bfe7a1fb-adfe-4156-bfa1-05e2462e0afe', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' /* Entity: MJ: Number Pools */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'), 'Name', 'Name', 'Unique, human-readable name of the pool (e.g. Sales Outbound US, Support Callback).', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad14e7d5-2350-47b7-9b98-d269076b2d19' OR ("EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND "Name" = 'SelectionRule')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad14e7d5-2350-47b7-9b98-d269076b2d19', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' /* Entity: MJ: Number Pools */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'), 'SelectionRule', 'Selection Rule', 'How an outbound call picks a number from the pool: RoundRobin (rotate evenly through active numbers), LocalPresence (prefer a number whose area code / region matches the callee, falling back to round robin), or Random.', 'nvarchar', 40, 0, 0, FALSE, 'RoundRobin', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f4c28018-3ec2-48d6-a2de-29e81499466a' OR ("EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND "Name" = 'MaxConcurrentPerNumber')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f4c28018-3ec2-48d6-a2de-29e81499466a', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' /* Entity: MJ: Number Pools */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'), 'MaxConcurrentPerNumber', 'Max Concurrent Per Number', 'Optional ceiling on simultaneous active Interactions per number in this pool. A number at the ceiling is skipped during selection. NULL means no ceiling is enforced by MJ (the carrier may still impose one).', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1fb3ef3e-ae8a-4b00-81d9-9c5c1e6777d9' OR ("EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1fb3ef3e-ae8a-4b00-81d9-9c5c1e6777d9', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' /* Entity: MJ: Number Pools */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'), 'Description', 'Description', 'Optional description of what the pool is for and any selection policy notes.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e69d38e2-71e8-4f83-845b-3ac13f180a63' OR ("EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e69d38e2-71e8-4f83-845b-3ac13f180a63', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' /* Entity: MJ: Number Pools */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e0f76e25-4c63-4016-bc04-9ca19dfb4b9a' OR ("EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e0f76e25-4c63-4016-bc04-9ca19dfb4b9a', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' /* Entity: MJ: Number Pools */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '57d8e2c5-ad8f-4bd6-8b98-66944a7d94c9' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('57d8e2c5-ad8f-4bd6-8b98-66944a7d94c9', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bc7f26d8-f03a-468a-92e5-ebe475e99bda' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'Channel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bc7f26d8-f03a-468a-92e5-ebe475e99bda', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'Channel', 'Channel', 'The medium the conversation runs over: Phone (a telephone call through a telephony bridge), Web (an embedded web widget session), or Meeting (a multi-party conferencing room).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c5fc364-9f32-484b-8067-2da6535058e9' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'Direction')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c5fc364-9f32-484b-8067-2da6535058e9', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'Direction', 'Direction', 'Who initiated the conversation: Inbound (the remote party reached us), Outbound (we reached the remote party), or Internal (between participants inside the organization, such as an agent-to-agent or staff consult).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5da9a3ea-66a5-4791-99c9-b8d45ea8d1a6' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5da9a3ea-66a5-4791-99c9-b8d45ea8d1a6', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'Status', 'Status', 'Lifecycle state: Queued (waiting for a handler), Active (a handler is engaged), Ended (completed normally), Abandoned (the remote party left before being answered), or Failed (could not be established or ended in error).', 'nvarchar', 40, 0, 0, FALSE, 'Queued', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd1741839-8e45-4e5e-8071-3ee3e871b1ce' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'AgentSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d1741839-8e45-4e5e-8071-3ee3e871b1ce', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'AgentSessionID', 'Agent Session ID', 'The AI agent session driving this conversation, when an agent is handling it. NULL for conversations handled entirely by humans or not yet assigned.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '17198778-E25A-4457-80AF-9E8C4961DC29', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e60cc1ef-2cf4-4c43-81f2-d53fb81ae344' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'RoomName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e60cc1ef-2cf4-4c43-81f2-d53fb81ae344', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'RoomName', 'Room Name', 'Name of the realtime media room (for example the LiveKit room) the conversation runs in, which humans and agents join to participate. NULL when no room is involved.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bcf245ac-6ad3-498c-a43f-6349c39b6319' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'PhoneNumberID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bcf245ac-6ad3-498c-a43f-6349c39b6319', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'PhoneNumberID', 'Phone Number ID', 'The organization-owned phone number used for a Phone conversation: the dialed number for Inbound, the caller ID for Outbound. NULL for non-phone channels.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc2fca9d-7e93-4f97-9501-604926548779' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'RemoteAddress')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cc2fca9d-7e93-4f97-9501-604926548779', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'RemoteAddress', 'Remote Address', 'The address of the remote party: the caller or callee number for phone, an anonymous session or visitor identifier for web, or the remote party identifier for meetings. Free-form text because the form depends on the channel.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9c8afa68-a349-414a-96ad-945bbf309e53' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'StartedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9c8afa68-a349-414a-96ad-945bbf309e53', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'StartedAt', 'Started At', 'When the conversation was created (call placed or received, widget session opened). Defaults to the current time.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f8ea7452-315a-4413-9e3f-8f99e9aedf8e' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'AnsweredAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f8ea7452-315a-4413-9e3f-8f99e9aedf8e', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'AnsweredAt', 'Answered At', 'When a handler (agent or human) answered and the parties were connected. NULL if never answered. The gap from StartedAt is the wait time.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '61f03b68-5772-405d-bc1d-27ff1da50088' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'EndedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('61f03b68-5772-405d-bc1d-27ff1da50088', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'EndedAt', 'Ended At', 'When the conversation ended. NULL while it is still queued or active. Must not precede StartedAt.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1aa3f25d-0051-4c76-8539-85e5f9681aab' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'EndReason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1aa3f25d-0051-4c76-8539-85e5f9681aab', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'EndReason', 'End Reason', 'Short reason the conversation ended (for example CallerHangup, AgentHangup, Transferred, Timeout, ProviderError). Free-form so new reasons need no schema change. NULL while still open.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d58ace5-0caf-4a6f-9346-3f90c1982b26' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'RecordingEnabled')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d58ace5-0caf-4a6f-9346-3f90c1982b26', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'RecordingEnabled', 'Recording Enabled', 'Whether media from this conversation is being recorded. Set at creation from the applicable policy and consent rules; it is the intent flag, not proof a recording file exists.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '05daf2cf-4866-40b5-b135-4cb459a3bab6' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'ExternalID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('05daf2cf-4866-40b5-b135-4cb459a3bab6', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'ExternalID', 'External ID', 'The carrier or platform identifier for the conversation (for example a Twilio call SID), used to correlate provider webhooks and billing records with this row.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fe9afda9-6f51-428b-bd7c-d8c908ae0fdf' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'CostEstimate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fe9afda9-6f51-428b-bd7c-d8c908ae0fdf', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'CostEstimate', 'Cost Estimate', 'Estimated total cost of the conversation (carrier minutes, speech and model usage) in the organization''s reporting currency, accumulated as it runs. NULL when no estimate is available. An estimate, not an invoice.', 'decimal', 9, 18, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '34c13914-4dc6-474e-8545-f3823151d39a' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('34c13914-4dc6-474e-8545-f3823151d39a', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9a5c5289-8d3f-451d-8d92-814cb7c896c8' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9a5c5289-8d3f-451d-8d92-814cb7c896c8', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1607593c-cf57-41a3-b452-9da4b6559d4c' OR ("EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'PhoneNumber')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1607593c-cf57-41a3-b452-9da4b6559d4c', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' /* Entity: MJ: Interactions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'), 'PhoneNumber', 'Phone Number', NULL, 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '833a2074-2a11-42f5-9979-2e1eedecd4aa' OR ("EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2' AND "Name" = 'TurnAddressing')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('833a2074-2a11-42f5-9979-2e1eedecd4aa', '58D95AA3-52C3-4131-BF62-E84E75B04BD2' /* Entity: MJ: AI Agent Session Bridges */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '58D95AA3-52C3-4131-BF62-E84E75B04BD2'), 'TurnAddressing', 'Turn Addressing', 'How the agent decided speech was addressed to it: Auto (the model''s own judgement when it is full-duplex, name matching otherwise), ModelSide (the model''s own judgement), or Regex (matching the agent''s names). NULL when not recorded.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 6c203e19-2d2c-4d3a-9550-a0f7b64975b6 */
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
    '6c203e19-2d2c-4d3a-9550-a0f7b64975b6',
    'AD14E7D5-2350-47B7-9B98-D269076B2D19',
    1,
    'LocalPresence',
    'LocalPresence',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bad65a42-888b-4504-a435-606aaed18a2d */
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
    'bad65a42-888b-4504-a435-606aaed18a2d',
    'AD14E7D5-2350-47B7-9B98-D269076B2D19',
    2,
    'Random',
    'Random',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID fe3e8573-ce93-49a7-bdc7-9d7b74bb3537 */
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
    'fe3e8573-ce93-49a7-bdc7-9d7b74bb3537',
    'AD14E7D5-2350-47B7-9B98-D269076B2D19',
    3,
    'RoundRobin',
    'RoundRobin',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID AD14E7D5-2350-47B7-9B98-D269076B2D19 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'AD14E7D5-2350-47B7-9B98-D269076B2D19';
/* SQL text to insert entity field value with ID 8cb78363-0db7-4b1c-a025-e33aeec54bac */
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
    '8cb78363-0db7-4b1c-a025-e33aeec54bac',
    '7B398E84-9F18-4157-AFA1-8FD3756E42CD',
    1,
    'Voice',
    'Voice',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0690818a-b531-4296-9828-3c4987ecd1e1 */
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
    '0690818a-b531-4296-9828-3c4987ecd1e1',
    '7B398E84-9F18-4157-AFA1-8FD3756E42CD',
    2,
    'VoiceAndSMS',
    'VoiceAndSMS',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 7B398E84-9F18-4157-AFA1-8FD3756E42CD */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '7B398E84-9F18-4157-AFA1-8FD3756E42CD';
/* SQL text to insert entity field value with ID 4899e48a-8e88-4754-9506-09d198c867ae */
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
    '4899e48a-8e88-4754-9506-09d198c867ae',
    '2FEC2316-9558-4DB7-9E87-97C84B742404',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b52dfb1a-7598-4a14-ba1a-cb8f9abaaac1 */
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
    'b52dfb1a-7598-4a14-ba1a-cb8f9abaaac1',
    '2FEC2316-9558-4DB7-9E87-97C84B742404',
    2,
    'Inactive',
    'Inactive',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 711ad453-f4db-4a55-8959-54e9a6115e48 */
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
    '711ad453-f4db-4a55-8959-54e9a6115e48',
    '2FEC2316-9558-4DB7-9E87-97C84B742404',
    3,
    'Porting',
    'Porting',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 2FEC2316-9558-4DB7-9E87-97C84B742404 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '2FEC2316-9558-4DB7-9E87-97C84B742404';
/* SQL text to insert entity field value with ID 816c974b-6079-435c-9a55-3c9fc62019a9 */
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
    '816c974b-6079-435c-9a55-3c9fc62019a9',
    'BC7F26D8-F03A-468A-92E5-EBE475E99BDA',
    1,
    'Meeting',
    'Meeting',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e7e23aea-0472-4d62-8d15-ad32036a8c5c */
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
    'e7e23aea-0472-4d62-8d15-ad32036a8c5c',
    'BC7F26D8-F03A-468A-92E5-EBE475E99BDA',
    2,
    'Phone',
    'Phone',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4d37cfed-1557-478f-bc65-8cc6b3acfee5 */
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
    '4d37cfed-1557-478f-bc65-8cc6b3acfee5',
    'BC7F26D8-F03A-468A-92E5-EBE475E99BDA',
    3,
    'Web',
    'Web',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID BC7F26D8-F03A-468A-92E5-EBE475E99BDA */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'BC7F26D8-F03A-468A-92E5-EBE475E99BDA';
/* SQL text to insert entity field value with ID 6e7c518a-915a-4ee2-91e8-f7fd1089821e */
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
    '6e7c518a-915a-4ee2-91e8-f7fd1089821e',
    '2C5FC364-9F32-484B-8067-2DA6535058E9',
    1,
    'Inbound',
    'Inbound',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7871f822-173d-4d0b-837f-351b01663101 */
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
    '7871f822-173d-4d0b-837f-351b01663101',
    '2C5FC364-9F32-484B-8067-2DA6535058E9',
    2,
    'Internal',
    'Internal',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 37036fca-4f2a-49e4-af17-2f41bf9f00da */
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
    '37036fca-4f2a-49e4-af17-2f41bf9f00da',
    '2C5FC364-9F32-484B-8067-2DA6535058E9',
    3,
    'Outbound',
    'Outbound',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 2C5FC364-9F32-484B-8067-2DA6535058E9 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '2C5FC364-9F32-484B-8067-2DA6535058E9';
/* SQL text to insert entity field value with ID 708c3ef7-7a6a-4400-bc66-9aa7b2ff8644 */
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
    '708c3ef7-7a6a-4400-bc66-9aa7b2ff8644',
    '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6',
    1,
    'Abandoned',
    'Abandoned',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b3aaecd7-583b-48a6-96b7-77c951c578d5 */
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
    'b3aaecd7-583b-48a6-96b7-77c951c578d5',
    '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6',
    2,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 15066175-b60c-4e38-b975-21ec4cdbca82 */
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
    '15066175-b60c-4e38-b975-21ec4cdbca82',
    '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6',
    3,
    'Ended',
    'Ended',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c7095314-aba0-472e-8ebf-478a02cde363 */
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
    'c7095314-aba0-472e-8ebf-478a02cde363',
    '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6',
    4,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3968959d-9623-441b-90d2-be08e9508f31 */
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
    '3968959d-9623-441b-90d2-be08e9508f31',
    '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6',
    5,
    'Queued',
    'Queued',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6';
/* SQL text to insert entity field value with ID 6b51d381-81ba-4813-8abd-033b89d7d14e */
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
    '6b51d381-81ba-4813-8abd-033b89d7d14e',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    1,
    'Abandoned',
    'Abandoned',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0f5bb670-821b-4507-86fb-264a724d15d9 */
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
    '0f5bb670-821b-4507-86fb-264a724d15d9',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    2,
    'Accepted',
    'Accepted',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f87ec7bd-0d12-443d-9443-681dcae12801 */
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
    'f87ec7bd-0d12-443d-9443-681dcae12801',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    3,
    'Answered',
    'Answered',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 84889e56-6375-4afc-b0e0-ece04e9a6d2d */
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
    '84889e56-6375-4afc-b0e0-ece04e9a6d2d',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    4,
    'Created',
    'Created',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bb496627-8bef-4dff-9d33-d002bc5320a6 */
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
    'bb496627-8bef-4dff-9d33-d002bc5320a6',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    5,
    'Declined',
    'Declined',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a3b61fd3-2c56-44df-8d6f-685348ce95f3 */
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
    'a3b61fd3-2c56-44df-8d6f-685348ce95f3',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    6,
    'Ended',
    'Ended',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e946c905-8dd8-4bd5-91d2-37e57d923f99 */
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
    'e946c905-8dd8-4bd5-91d2-37e57d923f99',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    7,
    'Escalated',
    'Escalated',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 1d6021f1-4fdc-4c65-b302-fb80e8f2066f */
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
    '1d6021f1-4fdc-4c65-b302-fb80e8f2066f',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    8,
    'Held',
    'Held',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b4badbe9-9337-46a9-a416-41ff76c2455e */
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
    'b4badbe9-9337-46a9-a416-41ff76c2455e',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    9,
    'Offered',
    'Offered',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 805cb446-408b-4ee7-93f5-cb7b42074cea */
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
    '805cb446-408b-4ee7-93f5-cb7b42074cea',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    10,
    'Queued',
    'Queued',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ea5e19c0-84a1-43d6-980a-df8106c849f9 */
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
    'ea5e19c0-84a1-43d6-980a-df8106c849f9',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    11,
    'RecordingStarted',
    'RecordingStarted',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e8fe9bee-06ea-4613-b300-a61bbd29356f */
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
    'e8fe9bee-06ea-4613-b300-a61bbd29356f',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    12,
    'RecordingStopped',
    'RecordingStopped',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID fc02e30c-faf4-47f6-8ad6-6e0eb1846e0f */
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
    'fc02e30c-faf4-47f6-8ad6-6e0eb1846e0f',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    13,
    'Resumed',
    'Resumed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 2e39ca96-3ee6-49ea-8c7d-b65f31e54cbe */
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
    '2e39ca96-3ee6-49ea-8c7d-b65f31e54cbe',
    'C0278F57-7911-448C-91D3-CE8F34CE03F1',
    14,
    'Transferred',
    'Transferred',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID C0278F57-7911-448C-91D3-CE8F34CE03F1 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'C0278F57-7911-448C-91D3-CE8F34CE03F1';
/* SQL text to insert entity field value with ID 8c5fee51-f82a-46d1-a718-00225c9ea0f6 */
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
    '8c5fee51-f82a-46d1-a718-00225c9ea0f6',
    '20988255-327A-46EE-AABA-60B8DF1AC2A4',
    1,
    'Caller',
    'Caller',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f08cfc4e-11c7-4bbf-83a9-19dc24336ee3 */
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
    'f08cfc4e-11c7-4bbf-83a9-19dc24336ee3',
    '20988255-327A-46EE-AABA-60B8DF1AC2A4',
    2,
    'Created',
    'Created',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f1e9e8e4-d040-408e-9506-dbf2d0f6ca34 */
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
    'f1e9e8e4-d040-408e-9506-dbf2d0f6ca34',
    '20988255-327A-46EE-AABA-60B8DF1AC2A4',
    3,
    'Regarding',
    'Regarding',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 20988255-327A-46EE-AABA-60B8DF1AC2A4 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '20988255-327A-46EE-AABA-60B8DF1AC2A4';
/* SQL text to insert entity field value with ID e2d91587-8498-46bf-95ec-57300265119a */
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
    'e2d91587-8498-46bf-95ec-57300265119a',
    '1233CA0B-7596-4362-A6C7-CC24A670273C',
    1,
    'Blind',
    'Blind',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 683a2121-ba71-4df0-9a3d-4777a2ddd3f5 */
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
    '683a2121-ba71-4df0-9a3d-4777a2ddd3f5',
    '1233CA0B-7596-4362-A6C7-CC24A670273C',
    2,
    'Warm',
    'Warm',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 1233CA0B-7596-4362-A6C7-CC24A670273C */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '1233CA0B-7596-4362-A6C7-CC24A670273C';
/* SQL text to insert entity field value with ID 014c0beb-40e2-496f-9687-f646713e12be */
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
    '014c0beb-40e2-496f-9687-f646713e12be',
    'AEC569B3-0E6E-4236-B8BF-D91314801F7F',
    1,
    'Accepted',
    'Accepted',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID afa73be8-1a96-4579-84c4-a837f11fe3a6 */
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
    'afa73be8-1a96-4579-84c4-a837f11fe3a6',
    'AEC569B3-0E6E-4236-B8BF-D91314801F7F',
    2,
    'Cancelled',
    'Cancelled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID dbf4475a-f38c-478e-9ec1-0285fffbe50e */
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
    'dbf4475a-f38c-478e-9ec1-0285fffbe50e',
    'AEC569B3-0E6E-4236-B8BF-D91314801F7F',
    3,
    'Declined',
    'Declined',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 71c1a43b-75ff-47ff-b10d-0776cf7d207c */
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
    '71c1a43b-75ff-47ff-b10d-0776cf7d207c',
    'AEC569B3-0E6E-4236-B8BF-D91314801F7F',
    4,
    'Expired',
    'Expired',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c68b578f-ae23-42cf-925d-c2127009adde */
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
    'c68b578f-ae23-42cf-925d-c2127009adde',
    'AEC569B3-0E6E-4236-B8BF-D91314801F7F',
    5,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID AEC569B3-0E6E-4236-B8BF-D91314801F7F */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'AEC569B3-0E6E-4236-B8BF-D91314801F7F';
/* SQL text to insert entity field value with ID 4704836c-845c-4327-9ea7-fb149a652496 */
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
    '4704836c-845c-4327-9ea7-fb149a652496',
    '1E62E57A-F360-4B72-A675-F0799DFFEE6F',
    1,
    'Cancelled',
    'Cancelled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 88965ecc-818c-4dcb-aa42-99c00e67a761 */
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
    '88965ecc-818c-4dcb-aa42-99c00e67a761',
    '1E62E57A-F360-4B72-A675-F0799DFFEE6F',
    2,
    'Ended',
    'Ended',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d6bf6997-1d32-48b9-adea-2a7fecd34787 */
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
    'd6bf6997-1d32-48b9-adea-2a7fecd34787',
    '1E62E57A-F360-4B72-A675-F0799DFFEE6F',
    3,
    'Live',
    'Live',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 1943a3a6-7a1c-43c0-8e62-de9181fb5523 */
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
    '1943a3a6-7a1c-43c0-8e62-de9181fb5523',
    '1E62E57A-F360-4B72-A675-F0799DFFEE6F',
    4,
    'Scheduled',
    'Scheduled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 1E62E57A-F360-4B72-A675-F0799DFFEE6F */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '1E62E57A-F360-4B72-A675-F0799DFFEE6F';
/* SQL text to insert entity field value with ID 91c8f1c4-4f26-4866-98e2-539bb551fa39 */
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
    '91c8f1c4-4f26-4866-98e2-539bb551fa39',
    '12D4612E-1BC0-4D67-BF74-6C1CEAE0116D',
    1,
    'Allowed',
    'Allowed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c359df25-e105-42c5-b737-fa2704039dcd */
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
    'c359df25-e105-42c5-b737-fa2704039dcd',
    '12D4612E-1BC0-4D67-BF74-6C1CEAE0116D',
    2,
    'Automatic',
    'Automatic',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID af5e8ce1-9b17-46e8-8e3c-2a46ab049127 */
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
    'af5e8ce1-9b17-46e8-8e3c-2a46ab049127',
    '12D4612E-1BC0-4D67-BF74-6C1CEAE0116D',
    3,
    'Off',
    'Off',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 12D4612E-1BC0-4D67-BF74-6C1CEAE0116D */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '12D4612E-1BC0-4D67-BF74-6C1CEAE0116D';
/* SQL text to insert entity field value with ID 74bfc3ca-00ec-4dbd-81b4-d573254c4858 */
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
    '74bfc3ca-00ec-4dbd-81b4-d573254c4858',
    '1627E4DF-796A-4E73-BA99-FC9FBE9F1981',
    1,
    'Agent',
    'Agent',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 24234ef1-2789-44c8-b0bb-ff9159979ff9 */
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
    '24234ef1-2789-44c8-b0bb-ff9159979ff9',
    '1627E4DF-796A-4E73-BA99-FC9FBE9F1981',
    2,
    'Attendee',
    'Attendee',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 36a9497d-1352-45f6-bab9-a249664caced */
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
    '36a9497d-1352-45f6-bab9-a249664caced',
    '1627E4DF-796A-4E73-BA99-FC9FBE9F1981',
    3,
    'CoHost',
    'CoHost',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID cd8f2b13-5ca1-4606-9780-3d440814e6ed */
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
    'cd8f2b13-5ca1-4606-9780-3d440814e6ed',
    '1627E4DF-796A-4E73-BA99-FC9FBE9F1981',
    4,
    'Host',
    'Host',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 1627E4DF-796A-4E73-BA99-FC9FBE9F1981 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '1627E4DF-796A-4E73-BA99-FC9FBE9F1981';
/* SQL text to insert entity field value with ID 75c8d772-92e0-4ef4-83e5-9111daa32a97 */
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
    '75c8d772-92e0-4ef4-83e5-9111daa32a97',
    '4A872147-E34E-44C7-BE8B-B8584A12A22C',
    1,
    'Accepted',
    'Accepted',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 17e4d637-749d-4bcd-89c7-5852e7346e6c */
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
    '17e4d637-749d-4bcd-89c7-5852e7346e6c',
    '4A872147-E34E-44C7-BE8B-B8584A12A22C',
    2,
    'Declined',
    'Declined',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 675847de-8334-4265-b137-eb66b95a0327 */
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
    '675847de-8334-4265-b137-eb66b95a0327',
    '4A872147-E34E-44C7-BE8B-B8584A12A22C',
    3,
    'Invited',
    'Invited',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 22424efa-f810-4e3c-9520-16746ff5ab3f */
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
    '22424efa-f810-4e3c-9520-16746ff5ab3f',
    '4A872147-E34E-44C7-BE8B-B8584A12A22C',
    4,
    'Tentative',
    'Tentative',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 4A872147-E34E-44C7-BE8B-B8584A12A22C */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '4A872147-E34E-44C7-BE8B-B8584A12A22C';
/* SQL text to insert entity field value with ID ee27f970-00e2-4a9e-88e0-89f3917c0899 */
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
    'ee27f970-00e2-4a9e-88e0-89f3917c0899',
    '833A2074-2A11-42F5-9979-2E1EEDECD4AA',
    1,
    'Auto',
    'Auto',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c6f495d6-047f-4da0-af9d-8cf6c215ff59 */
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
    'c6f495d6-047f-4da0-af9d-8cf6c215ff59',
    '833A2074-2A11-42F5-9979-2E1EEDECD4AA',
    2,
    'ModelSide',
    'ModelSide',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f09b8019-2a31-4dc9-95fb-0c08e9ce2878 */
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
    'f09b8019-2a31-4dc9-95fb-0c08e9ce2878',
    '833A2074-2A11-42F5-9979-2E1EEDECD4AA',
    3,
    'Regex',
    'Regex',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 833A2074-2A11-42F5-9979-2E1EEDECD4AA */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '833A2074-2A11-42F5-9979-2E1EEDECD4AA';
/* Deterministic search-flag hygiene — seed name fields */
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE, "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" IN (
    SELECT
      "ranked"."ID"
    FROM (
      SELECT
        "f"."ID",
        ROW_NUMBER() OVER (PARTITION BY "f"."EntityID" ORDER BY "f"."Sequence", "f"."Name") AS "rn"
      FROM __mj."EntityField" AS "f"
      INNER JOIN __mj."Entity" AS "e"
        ON "e"."ID" = "f"."EntityID"
      WHERE
        LOWER("f"."Name") IN (
          'name',
          'title',
          'firstname',
          'lastname',
          'middlename',
          'displayname',
          'fullname',
          'label'
        )
        AND "f"."AutoUpdateIncludeInUserSearchAPI" = TRUE
        AND "f"."IncludeInUserSearchAPI" = FALSE
        AND COALESCE("f"."IsPrimaryKey", FALSE) = FALSE
        AND COALESCE("f"."IsVirtual", FALSE) = FALSE
        AND LOWER("f"."Type") IN ('nvarchar', 'varchar', 'char', 'nchar')
        AND COALESCE("f"."Length", 0) <> -1
        AND "e"."VirtualEntity" = FALSE
        AND "e"."AllowUserSearchAPI" = TRUE
        AND COALESCE("e"."FullTextSearchEnabled", FALSE) = FALSE
        AND NOT (
          (
            "e"."Name" = 'Logs' OR "e"."Name" LIKE '% Logs'
          )
          OR (
            "e"."Name" = 'Log' OR "e"."Name" LIKE '% Log'
          )
          OR (
            "e"."Name" = 'Runs' OR "e"."Name" LIKE '% Runs'
          )
          OR (
            "e"."Name" = 'Run' OR "e"."Name" LIKE '% Run'
          )
          OR (
            "e"."Name" = 'Run History' OR "e"."Name" LIKE '% Run History'
          )
          OR (
            "e"."Name" = 'Run Steps' OR "e"."Name" LIKE '% Run Steps'
          )
          OR (
            "e"."Name" = 'Run Messages' OR "e"."Name" LIKE '% Run Messages'
          )
          OR (
            "e"."Name" = 'Execution Logs' OR "e"."Name" LIKE '% Execution Logs'
          )
          OR (
            "e"."Name" = 'Details' OR "e"."Name" LIKE '% Details'
          )
          OR (
            "e"."Name" = 'Detail' OR "e"."Name" LIKE '% Detail'
          )
          OR (
            "e"."Name" = 'Lines' OR "e"."Name" LIKE '% Lines'
          )
          OR (
            "e"."Name" = 'Line' OR "e"."Name" LIKE '% Line'
          )
          OR (
            "e"."Name" = 'Items' OR "e"."Name" LIKE '% Items'
          )
          OR (
            "e"."Name" = 'Item' OR "e"."Name" LIKE '% Item'
          )
          OR (
            "e"."Name" = 'Steps' OR "e"."Name" LIKE '% Steps'
          )
          OR (
            "e"."Name" = 'Step' OR "e"."Name" LIKE '% Step'
          )
          OR (
            "e"."Name" = 'Params' OR "e"."Name" LIKE '% Params'
          )
          OR (
            "e"."Name" = 'Param' OR "e"."Name" LIKE '% Param'
          )
          OR (
            "e"."Name" = 'Mappings' OR "e"."Name" LIKE '% Mappings'
          )
          OR (
            "e"."Name" = 'Mapping' OR "e"."Name" LIKE '% Mapping'
          )
          OR (
            "e"."Name" = 'Audit'
            OR "e"."Name" LIKE 'Audit %'
            OR "e"."Name" LIKE '% Audit'
            OR "e"."Name" LIKE '% Audit %'
          )
          OR (
            "e"."Name" = 'Record Change'
            OR "e"."Name" LIKE 'Record Change %'
            OR "e"."Name" LIKE '% Record Change'
            OR "e"."Name" LIKE '% Record Change %'
          )
        )
        AND NOT "e"."SchemaName" IN ('sys', 'staging')
        AND NOT EXISTS(
          SELECT
            1
          FROM __mj."EntityField" AS "f2"
          WHERE
            "f2"."EntityID" = "e"."ID" AND "f2"."IncludeInUserSearchAPI" = TRUE
        )
    ) AS "ranked"
    WHERE
      "ranked"."rn" <= 3
  );
/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" IN (
    SELECT
      "e"."ID"
    FROM __mj."Entity" AS "e"
    WHERE
      "e"."AllowUserSearchAPI" = TRUE
      AND "e"."AutoUpdateAllowUserSearchAPI" = TRUE
      AND "e"."VirtualEntity" = FALSE
      AND COALESCE("e"."FullTextSearchEnabled", FALSE) = FALSE
      AND NOT "e"."SchemaName" IN ('sys', 'staging')
      AND NOT EXISTS(
        SELECT
          1
        FROM __mj."EntityField" AS "f2"
        WHERE
          "f2"."EntityID" = "e"."ID" AND "f2"."IncludeInUserSearchAPI" = TRUE
      )
  );
/* Create Entity Relationship: MJ: AI Agents -> MJ: Interaction Events (One To Many via ActorAgentID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '984b5cb1-0cb8-4d17-ada8-c5236be7ceaf') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('984b5cb1-0cb8-4d17-ada8-c5236be7ceaf', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'ActorAgentID', 'One To Many', TRUE, TRUE, 41, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2f031291-c10f-4733-b784-46e135cc5510') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2f031291-c10f-4733-b784-46e135cc5510', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'AgentID', 'One To Many', TRUE, TRUE, 42, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '93d33605-b40d-4a39-bfef-65bb6c64c25d') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('93d33605-b40d-4a39-bfef-65bb6c64c25d', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '6DC12139-38A1-43C6-85EE-8066450E762B', 'OfferedByAgentID', 'One To Many', TRUE, TRUE, 43, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5c9c9718-2676-4d59-bd70-5e74b71dd4a8') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5c9c9718-2676-4d59-bd70-5e74b71dd4a8', '840A51D1-7436-45F9-9176-31E1FE785635', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'ProviderID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6fdbbf55-f017-402e-91b6-93404b1acce4') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6fdbbf55-f017-402e-91b6-93404b1acce4', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'DialInPhoneNumberID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd52f432f-8d17-4449-b776-8c6043d8edf8') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d52f432f-8d17-4449-b776-8c6043d8edf8', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'PhoneNumberID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b3cce56b-c372-4732-b626-900d3e4c5f1c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3cce56b-c372-4732-b626-900d3e4c5f1c', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'MeetingID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '82480ed1-0493-4ed3-9f9d-4b52b7d1311a') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('82480ed1-0493-4ed3-9f9d-4b52b7d1311a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', 'EntityID', 'One To Many', TRUE, TRUE, 84, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'be02e949-82c6-420b-a404-801a878a98d4') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('be02e949-82c6-420b-a404-801a878a98d4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'ActorUserID', 'One To Many', TRUE, TRUE, 111, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e3fb8c9c-8f85-4c2d-87ad-91cf4753c089') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e3fb8c9c-8f85-4c2d-87ad-91cf4753c089', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'UserID', 'One To Many', TRUE, TRUE, 112, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '30a86fec-c1d7-49dc-9211-c20dfb28a894') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('30a86fec-c1d7-49dc-9211-c20dfb28a894', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'HostUserID', 'One To Many', TRUE, TRUE, 113, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '481766dd-585b-4abf-83f8-46a5ed53d013') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('481766dd-585b-4abf-83f8-46a5ed53d013', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '6DC12139-38A1-43C6-85EE-8066450E762B', 'TargetUserID', 'One To Many', TRUE, TRUE, 114, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1006d8e2-f526-44b4-b577-2ba7212a8a88') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1006d8e2-f526-44b4-b577-2ba7212a8a88', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'ConversationID', 'One To Many', TRUE, TRUE, 10, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a278943f-e32a-40d2-83fe-298f4133204c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a278943f-e32a-40d2-83fe-298f4133204c', '17198778-E25A-4457-80AF-9E8C4961DC29', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'AgentSessionID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd7f6c3b3-f412-4eaa-87aa-bccfd4422265') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d7f6c3b3-f412-4eaa-87aa-bccfd4422265', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'NumberPoolID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2109a096-1586-49d2-ae49-11f1b331b26b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2109a096-1586-49d2-ae49-11f1b331b26b', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'InteractionID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b300c018-e238-4202-9839-f812aaf36ff0') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b300c018-e238-4202-9839-f812aaf36ff0', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', 'InteractionID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '03e03247-9379-43cd-bac0-a3a26bedb771') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03e03247-9379-43cd-bac0-a3a26bedb771', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', '6DC12139-38A1-43C6-85EE-8066450E762B', 'InteractionID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1a03c9f8-592e-4052-ba65-5d3dc14b4347' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'ActorUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1a03c9f8-592e-4052-ba65-5d3dc14b4347', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), 'ActorUser', 'Actor User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fa678a84-8b38-4bd1-921e-db04778e79fa' OR ("EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'ActorAgent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fa678a84-8b38-4bd1-921e-db04778e79fa', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' /* Entity: MJ: Interaction Events */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3'), 'ActorAgent', 'Actor Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef67cc6c-e228-4fca-b343-1b177129d199' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'Provider')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ef67cc6c-e228-4fca-b343-1b177129d199', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'Provider', 'Provider', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1e2e9818-8b2a-4679-82c3-2d71d78ff24e' OR ("EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'NumberPool')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1e2e9818-8b2a-4679-82c3-2d71d78ff24e', '8D7A7BD5-95E8-428C-874A-3829BAD6685E' /* Entity: MJ: Phone Numbers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E'), 'NumberPool', 'Number Pool', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb401657-8929-481c-9f64-b92528c381f3' OR ("EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eb401657-8929-481c-9f64-b92528c381f3', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' /* Entity: MJ: Interaction Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A'), 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e55f0b48-3561-4df2-a3ce-8f0a9db519b0' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'Meeting')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e55f0b48-3561-4df2-a3ce-8f0a9db519b0', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'Meeting', 'Meeting', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a7bca307-8f6b-43cb-9705-db186c0c8105' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a7bca307-8f6b-43cb-9705-db186c0c8105', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'User', 'User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4dce5ea0-3e6d-4db1-b74a-18646c268141' OR ("EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'Agent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4dce5ea0-3e6d-4db1-b74a-18646c268141', 'DB511323-5673-45F9-A47F-5A4604FB19B0' /* Entity: MJ: Meeting Participants */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'), 'Agent', 'Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '443ed482-5163-4176-a13c-5509edbfd766' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'HostUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('443ed482-5163-4176-a13c-5509edbfd766', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'HostUser', 'Host User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b72b8314-871d-4726-b816-5a46e5553c31' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'DialInPhoneNumber')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b72b8314-871d-4726-b816-5a46e5553c31', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'DialInPhoneNumber', 'Dial-In Phone Number', NULL, 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '14d2b100-b3c1-4c04-a264-78017c272ffb' OR ("EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'Conversation')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14d2b100-b3c1-4c04-a264-78017c272ffb', 'D2A67D87-F495-43E3-A91B-5A46E5553C31' /* Entity: MJ: Meetings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31'), 'Conversation', 'Conversation', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '566a23e4-e776-4650-a177-2b71caf6d81d' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'TargetUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('566a23e4-e776-4650-a177-2b71caf6d81d', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'TargetUser', 'Target User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e47b3708-6724-4b6b-b04d-161cdef08015' OR ("EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'OfferedByAgent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e47b3708-6724-4b6b-b04d-161cdef08015', '6DC12139-38A1-43C6-85EE-8066450E762B' /* Entity: MJ: Interaction Offers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B'), 'OfferedByAgent', 'Offered By Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '289065F3-BBA3-440D-9DE7-10735487BCBE' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'AEC569B3-0E6E-4236-B8BF-D91314801F7F'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '289065F3-BBA3-440D-9DE7-10735487BCBE'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B9966AF0-E7B1-4B23-8170-95B16F7B0DC8'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '566A23E4-E776-4650-A177-2B71CAF6D81D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '289065F3-BBA3-440D-9DE7-10735487BCBE'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '289065F3-BBA3-440D-9DE7-10735487BCBE'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = '6DC12139-38A1-43C6-85EE-8066450E762B'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '3B41C1DD-758F-47D3-A3BA-C368B166B8F3' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'F066BB7C-C684-4327-BAAA-E82A7F028FF5'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'EF67CC6C-E228-4FCA-B343-1B177129D199'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '3B41C1DD-758F-47D3-A3BA-C368B166B8F3'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '3B41C1DD-758F-47D3-A3BA-C368B166B8F3'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'BFE7A1FB-ADFE-4156-BFA1-05E2462E0AFE'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '20988255-327A-46EE-AABA-60B8DF1AC2A4' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1293D1DA-9692-4400-84CA-DE8717F1BE10'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'EB401657-8929-481C-9F64-B92528C381F3'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = 'C0278F57-7911-448C-91D3-CE8F34CE03F1' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1A03C9F8-592E-4052-BA65-5D3DC14B4347'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'FA678A84-8B38-4BD1-921E-DB04778E79FA'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'CC2FCA9D-7E93-4F97-9501-604926548779'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '9C8AFA68-A349-414A-96AD-945BBF309E53'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'CC2FCA9D-7E93-4F97-9501-604926548779'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '05DAF2CF-4866-40B5-B135-4CB459A3BAB6'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'CC2FCA9D-7E93-4F97-9501-604926548779'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '05DAF2CF-4866-40B5-B135-4CB459A3BAB6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = 'CCBC94BB-3DD7-42BB-9AF4-1E4F26851015' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1627E4DF-796A-4E73-BA99-FC9FBE9F1981'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4A872147-E34E-44C7-BE8B-B8584A12A22C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C3587EB5-7CEC-4751-A7B1-7C485C1DBC1A'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A7BCA307-8F6B-43CB-9705-DB186C0C8105'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4DCE5EA0-3E6D-4DB1-B74A-18646C268141'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'CCBC94BB-3DD7-42BB-9AF4-1E4F26851015'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'A7BCA307-8F6B-43CB-9705-DB186C0C8105'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '4DCE5EA0-3E6D-4DB1-B74A-18646C268141'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'A7BCA307-8F6B-43CB-9705-DB186C0C8105'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '4DCE5EA0-3E6D-4DB1-B74A-18646C268141'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'CCBC94BB-3DD7-42BB-9AF4-1E4F26851015'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '39F217D9-1541-4164-B739-DA850F044AA4' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1E62E57A-F360-4B72-A675-F0799DFFEE6F'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '63E402D5-1469-41ED-B8F5-0D31590ECA4D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '443ED482-5163-4176-A13C-5509EDBFD766'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: AI Agent Session Bridges.TurnAddressing */
UPDATE __mj."EntityField" SET "Category" = 'Connection Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Turn Addressing Mode'
WHERE
  "ID" = '833A2074-2A11-42F5-9979-2E1EEDECD4AA';

/* Set categories for 7 fields */
/* UPDATE Entity Field Category Info MJ: Number Pools.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D88DE1CD-4BD3-4148-B810-DC31A7105775';
/* UPDATE Entity Field Category Info MJ: Number Pools.Name */
UPDATE __mj."EntityField" SET "Category" = 'Pool Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BFE7A1FB-ADFE-4156-BFA1-05E2462E0AFE';
/* UPDATE Entity Field Category Info MJ: Number Pools.SelectionRule */
UPDATE __mj."EntityField" SET "Category" = 'Pool Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AD14E7D5-2350-47B7-9B98-D269076B2D19';
/* UPDATE Entity Field Category Info MJ: Number Pools.MaxConcurrentPerNumber */
UPDATE __mj."EntityField" SET "Category" = 'Pool Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F4C28018-3EC2-48D6-A2DE-29E81499466A';
/* UPDATE Entity Field Category Info MJ: Number Pools.Description */
UPDATE __mj."EntityField" SET "Category" = 'Pool Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1FB3EF3E-AE8A-4B00-81D9-9C5C1E6777D9';
/* UPDATE Entity Field Category Info MJ: Number Pools.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E69D38E2-71E8-4F83-845B-3AC13F180A63';
/* UPDATE Entity Field Category Info MJ: Number Pools.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E0F76E25-4C63-4016-BC04-9CA19DFB4B9A';

/* Set categories for 7 fields */
/* UPDATE Entity Field Category Info MJ: Interaction Links.InteractionID */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Association', "GeneratedFormSection" = 'Category', "DisplayName" = 'Interaction'
WHERE
  "ID" = '55297F30-9B4C-470C-A13F-1E0D8AE43866';
/* UPDATE Entity Field Category Info MJ: Interaction Links.Entity */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Association', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'EB401657-8929-481C-9F64-B92528C381F3';
/* UPDATE Entity Field Category Info MJ: Interaction Links.EntityID */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Association', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3CE1EDE7-AE95-476E-B7C3-12406F9F6F3A';
/* UPDATE Entity Field Category Info MJ: Interaction Links.RecordID */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Association', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DFC97246-0832-42DD-B3AA-8C61221C463E';
/* UPDATE Entity Field Category Info MJ: Interaction Links.Role */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Association', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '20988255-327A-46EE-AABA-60B8DF1AC2A4';
/* UPDATE Entity Field Category Info MJ: Interaction Links.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1293D1DA-9692-4400-84CA-DE8717F1BE10';
/* UPDATE Entity Field Category Info MJ: Interaction Links.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '60B609A0-FDF7-4A6B-96A3-3B78CB083D02';

/* Set entity icon to fa fa-phone-alt */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-phone-alt', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('762868c5-11f9-5bdc-8157-7a0da90c172b', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', 'FieldCategoryInfo', '{
  "Pool Configuration": {
    "description": "Settings defining how the phone number pool operates and selects numbers for outbound calls",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', NOW(), NOW());
  END IF;
END $$;

/* Set entity icon to fa fa-link */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-link', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9ab93dab-43ea-57da-b06c-9bcf28697c93', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', 'FieldCategoryInfo', '{
  "Interaction Association": {
    "description": "Defines the polymorphic relationship between an interaction and other system records",
    "icon": "fa fa-link"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8fc6c253-3b08-569b-b74e-0ea8fc6e08b0', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', 'FieldCategoryIcons', '{
  "Pool Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f0c6494e-e751-5d79-83d6-2183e657c01e', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', 'FieldCategoryIcons', '{
  "Interaction Association": "fa fa-link",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C';

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A';

/* Set categories for 11 fields */
/* UPDATE Entity Field Category Info MJ: Phone Numbers.Number */
UPDATE __mj."EntityField" SET "Category" = 'Phone Number Details', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Tel'
WHERE
  "ID" = '3B41C1DD-758F-47D3-A3BA-C368B166B8F3';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.Label */
UPDATE __mj."EntityField" SET "Category" = 'Phone Number Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F066BB7C-C684-4327-BAAA-E82A7F028FF5';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.Description */
UPDATE __mj."EntityField" SET "Category" = 'Phone Number Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '39DBFC58-6334-4131-9552-3573D34CB88A';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.Capabilities */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7B398E84-9F18-4157-AFA1-8FD3756E42CD';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.Status */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2FEC2316-9558-4DB7-9E87-97C84B742404';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.Provider */
UPDATE __mj."EntityField" SET "Category" = 'Carrier Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'EF67CC6C-E228-4FCA-B343-1B177129D199';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.ProviderID */
UPDATE __mj."EntityField" SET "Category" = 'Carrier Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2FC8F97F-3A59-4053-9C3C-4AD7F19FF6B5';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.NumberPool */
UPDATE __mj."EntityField" SET "Category" = 'Routing and Pooling', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1E2E9818-8B2A-4679-82C3-2D71D78FF24E';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.NumberPoolID */
UPDATE __mj."EntityField" SET "Category" = 'Routing and Pooling', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FFAD7D30-F020-4EE9-9452-C283032F833A';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '69676E28-47FB-41B0-A0CD-5125ABD2DA76';
/* UPDATE Entity Field Category Info MJ: Phone Numbers.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FB592E30-5B27-4C8C-93AE-53C04B45BB48';

/* Set entity icon to fa fa-phone */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-phone', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b2380936-30ef-5c74-9e0c-9e98dfc7dafe', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'FieldCategoryInfo', '{
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
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e86ee2ac-a4cc-5e60-b7f7-88095d5e1f81', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'FieldCategoryIcons', '{
  "Carrier Information": "fa fa-building",
  "Configuration": "fa fa-sliders-h",
  "Phone Number Details": "fa fa-phone",
  "Routing and Pooling": "fa fa-network-wired",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '8D7A7BD5-95E8-428C-874A-3829BAD6685E';

/* Set categories for 11 fields */
/* UPDATE Entity Field Category Info MJ: Interaction Events.InteractionID */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Interaction'
WHERE
  "ID" = '4BEDF078-B1B1-4E35-A9E0-CD88952D1ACB';
/* UPDATE Entity Field Category Info MJ: Interaction Events.EventType */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C0278F57-7911-448C-91D3-CE8F34CE03F1';
/* UPDATE Entity Field Category Info MJ: Interaction Events.OccurredAt */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D93CDA9D-E87E-4744-8844-E124AFF94169';
/* UPDATE Entity Field Category Info MJ: Interaction Events.Details */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Context', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'FD05086C-C0CE-403A-8939-E77468D908BE';
/* UPDATE Entity Field Category Info MJ: Interaction Events.ActorUserID */
UPDATE __mj."EntityField" SET "Category" = 'Actor Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BD207912-2D3C-4800-8C37-179DB85AB4A9';
/* UPDATE Entity Field Category Info MJ: Interaction Events.ActorUser */
UPDATE __mj."EntityField" SET "Category" = 'Actor Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1A03C9F8-592E-4052-BA65-5D3DC14B4347';
/* UPDATE Entity Field Category Info MJ: Interaction Events.ActorAgentID */
UPDATE __mj."EntityField" SET "Category" = 'Actor Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CB4B0E76-A6D2-49C1-9CC1-41F548CAD78D';
/* UPDATE Entity Field Category Info MJ: Interaction Events.ActorAgent */
UPDATE __mj."EntityField" SET "Category" = 'Actor Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FA678A84-8B38-4BD1-921E-DB04778E79FA';
/* UPDATE Entity Field Category Info MJ: Interaction Events.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D4B554E4-A81B-4856-8219-B383D6026759';
/* UPDATE Entity Field Category Info MJ: Interaction Events.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '34068729-3004-4212-AE09-7236F89E045E';
/* UPDATE Entity Field Category Info MJ: Interaction Events.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '16B0D3B4-26C3-444A-B617-66DAD6FA6058';

/* Set entity icon to fa fa-history */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-history', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('77c67673-a124-55a8-a6f3-3fb6e9c64802', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'FieldCategoryInfo', '{
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
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0b3a7bad-c08c-59f7-84b4-c264713b3068', '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3', 'FieldCategoryIcons', '{
  "Actor Information": "fa fa-user-cog",
  "Interaction Context": "fa fa-info-circle",
  "System Metadata": "fa fa-database"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '57C600E9-7EAF-4FF9-B0E7-04F7C2586EF3';

/* Set categories for 16 fields */
/* UPDATE Entity Field Category Info MJ: Interaction Offers.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9D30F606-8737-4390-ADA7-A73E4A067798';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.InteractionID */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Interaction'
WHERE
  "ID" = '1819B575-246C-4ABA-AD85-742F523054A8';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.TargetUserID */
UPDATE __mj."EntityField" SET "Category" = 'Participant Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3DE69740-7FA4-4719-AF4E-6C274F846EEB';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.TargetUser */
UPDATE __mj."EntityField" SET "Category" = 'Participant Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '566A23E4-E776-4650-A177-2B71CAF6D81D';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.OfferedByAgentID */
UPDATE __mj."EntityField" SET "Category" = 'Participant Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F08D5A5F-D0C0-485D-BC76-08CDFCAFA3C3';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.OfferedByAgent */
UPDATE __mj."EntityField" SET "Category" = 'Participant Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E47B3708-6724-4B6B-B04D-161CDEF08015';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.Mode */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1233CA0B-7596-4362-A6C7-CC24A670273C';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.Status */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AEC569B3-0E6E-4236-B8BF-D91314801F7F';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.RoomName */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D0490039-C5A3-4203-A5BB-E4BE61F51C1F';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.CallerLabel */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '289065F3-BBA3-440D-9DE7-10735487BCBE';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.Summary */
UPDATE __mj."EntityField" SET "Category" = 'Handover Context', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Markdown'
WHERE
  "ID" = '30EB5D7D-BD6A-478D-9E29-7F904B111AB8';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.OfferedAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B9966AF0-E7B1-4B23-8170-95B16F7B0DC8';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.ExpiresAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '71B68D69-AE66-4685-890E-661F29BEF358';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.RespondedAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '38E1E98E-FF12-4B4F-84FB-AC4D9A255BE7';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '55E2322C-3F37-4D56-8F78-59C9E905A00F';
/* UPDATE Entity Field Category Info MJ: Interaction Offers.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5D125F1D-3F6C-4C82-AE51-87C1D9A322B3';

/* Set entity icon to fa fa-headset */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-headset', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '6DC12139-38A1-43C6-85EE-8066450E762B';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39acc3ee-1dfc-5695-a454-681acce53180', '6DC12139-38A1-43C6-85EE-8066450E762B', 'FieldCategoryInfo', '{
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
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b8b1ab29-28e0-5014-8d85-5d14191c8510', '6DC12139-38A1-43C6-85EE-8066450E762B', 'FieldCategoryIcons', '{
  "Handover Context": "fa fa-align-left",
  "Interaction Details": "fa fa-comments",
  "Participant Details": "fa fa-user-friends",
  "System Metadata": "fa fa-cog",
  "Timeline": "fa fa-clock"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '6DC12139-38A1-43C6-85EE-8066450E762B';

/* Set categories for 15 fields */
/* UPDATE Entity Field Category Info MJ: Meeting Participants.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E2361941-23EA-466A-9360-E8C980EBFACC';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.MeetingID */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Meeting'
WHERE
  "ID" = '15040ACE-8782-426C-B2C1-62117E45913D';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Participant Identity', "GeneratedFormSection" = 'Category', "DisplayName" = 'User'
WHERE
  "ID" = 'B55B3D09-0A92-48B5-8654-F8CE7CA2101F';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.AgentID */
UPDATE __mj."EntityField" SET "Category" = 'Participant Identity', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent'
WHERE
  "ID" = '2C366BDB-25B2-4783-B1D6-444628AED556';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.ExternalName */
UPDATE __mj."EntityField" SET "Category" = 'Participant Identity', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CCBC94BB-3DD7-42BB-9AF4-1E4F26851015';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.ExternalEmail */
UPDATE __mj."EntityField" SET "Category" = 'Participant Identity', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Email'
WHERE
  "ID" = '717EA04C-C814-47E8-9F02-44A95FE336E7';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.ExternalPhone */
UPDATE __mj."EntityField" SET "Category" = 'Participant Identity', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Tel'
WHERE
  "ID" = '97F9D011-24B7-4775-8305-0EFF11CB4FD9';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.User */
UPDATE __mj."EntityField" SET "Category" = 'Participant Identity', "GeneratedFormSection" = 'Category', "DisplayName" = 'User Name'
WHERE
  "ID" = 'A7BCA307-8F6B-43CB-9705-DB186C0C8105';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.Agent */
UPDATE __mj."EntityField" SET "Category" = 'Participant Identity', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Name'
WHERE
  "ID" = '4DCE5EA0-3E6D-4DB1-B74A-18646C268141';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.Role */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Participation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1627E4DF-796A-4E73-BA99-FC9FBE9F1981';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.InviteStatus */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Participation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4A872147-E34E-44C7-BE8B-B8584A12A22C';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.JoinedAt */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Participation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C3587EB5-7CEC-4751-A7B1-7C485C1DBC1A';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.LeftAt */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Participation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4A76BA73-9777-4EE1-83FD-6ECFCD56E8DD';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7B08BE5B-88B7-4763-847C-D2FE09533CFF';
/* UPDATE Entity Field Category Info MJ: Meeting Participants.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3BCA8F13-2716-42E4-B1EF-19645A05A774';

/* Set entity icon to fa fa-users */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-users', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39a98d1c-c71c-59be-9ab3-94a88339ea1c', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'FieldCategoryInfo', '{
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
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3902f9c6-a589-5163-98eb-8b19c1497028', 'DB511323-5673-45F9-A47F-5A4604FB19B0', 'FieldCategoryIcons', '{
  "Meeting Context": "fa fa-calendar-alt",
  "Meeting Participation": "fa fa-user-clock",
  "Participant Identity": "fa fa-id-card",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'DB511323-5673-45F9-A47F-5A4604FB19B0';

/* Set categories for 17 fields */
/* UPDATE Entity Field Category Info MJ: Interactions.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '57D8E2C5-AD8F-4BD6-8B98-66944A7D94C9';
/* UPDATE Entity Field Category Info MJ: Interactions.Channel */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BC7F26D8-F03A-468A-92E5-EBE475E99BDA';
/* UPDATE Entity Field Category Info MJ: Interactions.Direction */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2C5FC364-9F32-484B-8067-2DA6535058E9';
/* UPDATE Entity Field Category Info MJ: Interactions.Status */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5DA9A3EA-66A5-4791-99C9-B8D45EA8D1A6';
/* UPDATE Entity Field Category Info MJ: Interactions.AgentSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Technical Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Session'
WHERE
  "ID" = 'D1741839-8E45-4E5E-8071-3EE3E871B1CE';
/* UPDATE Entity Field Category Info MJ: Interactions.RoomName */
UPDATE __mj."EntityField" SET "Category" = 'Technical Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E60CC1EF-2CF4-4C43-81F2-D53FB81AE344';
/* UPDATE Entity Field Category Info MJ: Interactions.PhoneNumberID */
UPDATE __mj."EntityField" SET "Category" = 'Technical Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BCF245AC-6AD3-498C-A43F-6349C39B6319';
/* UPDATE Entity Field Category Info MJ: Interactions.RemoteAddress */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CC2FCA9D-7E93-4F97-9501-604926548779';
/* UPDATE Entity Field Category Info MJ: Interactions.StartedAt */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9C8AFA68-A349-414A-96AD-945BBF309E53';
/* UPDATE Entity Field Category Info MJ: Interactions.AnsweredAt */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F8EA7452-315A-4413-9E3F-8F99E9AEDF8E';
/* UPDATE Entity Field Category Info MJ: Interactions.EndedAt */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '61F03B68-5772-405D-BC1D-27FF1DA50088';
/* UPDATE Entity Field Category Info MJ: Interactions.EndReason */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1AA3F25D-0051-4C76-8539-85E5F9681AAB';
/* UPDATE Entity Field Category Info MJ: Interactions.RecordingEnabled */
UPDATE __mj."EntityField" SET "Category" = 'Interaction Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7D58ACE5-0CAF-4A6F-9346-3F90C1982B26';
/* UPDATE Entity Field Category Info MJ: Interactions.ExternalID */
UPDATE __mj."EntityField" SET "Category" = 'Technical Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '05DAF2CF-4866-40B5-B135-4CB459A3BAB6';
/* UPDATE Entity Field Category Info MJ: Interactions.CostEstimate */
UPDATE __mj."EntityField" SET "Category" = 'Financial Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FE9AFDA9-6F51-428B-BD7C-D8C908AE0FDF';
/* UPDATE Entity Field Category Info MJ: Interactions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '34C13914-4DC6-474E-8545-F3823151D39A';
/* UPDATE Entity Field Category Info MJ: Interactions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9A5C5289-8D3F-451D-8D92-814CB7C896C8';

/* Set entity icon to fa fa-comments */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-comments', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dbe41c6b-396c-5d5f-ae06-781138e2ae7d', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'FieldCategoryInfo', '{
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
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a6905b66-de52-53c2-bbba-9e742b57a224', '4A355A56-EAE0-47D9-84CD-CE2BB49160DB', 'FieldCategoryIcons', '{
  "Financial Details": "fa fa-dollar-sign",
  "Interaction Details": "fa fa-info-circle",
  "Interaction Timeline": "fa fa-clock",
  "System Metadata": "fa fa-cog",
  "Technical Context": "fa fa-server"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '4A355A56-EAE0-47D9-84CD-CE2BB49160DB';

/* Set categories for 16 fields */
/* UPDATE Entity Field Category Info MJ: Meetings.Title */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '39F217D9-1541-4164-B739-DA850F044AA4';
/* UPDATE Entity Field Category Info MJ: Meetings.Description */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5A2C1E9B-6C83-4803-A5EA-639ED7689A71';
/* UPDATE Entity Field Category Info MJ: Meetings.HostUserID */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Host User'
WHERE
  "ID" = 'B8C2F7C9-6DE0-4741-8F19-81ECD08A2B6E';
/* UPDATE Entity Field Category Info MJ: Meetings.RoomName */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1D05DCDD-AC68-49D7-A0E9-A3701F2F1912';
/* UPDATE Entity Field Category Info MJ: Meetings.Status */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Status and Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1E62E57A-F360-4B72-A675-F0799DFFEE6F';
/* UPDATE Entity Field Category Info MJ: Meetings.ScheduledStartAt */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Status and Timeline', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scheduled Start'
WHERE
  "ID" = '63E402D5-1469-41ED-B8F5-0D31590ECA4D';
/* UPDATE Entity Field Category Info MJ: Meetings.ScheduledEndAt */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Status and Timeline', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scheduled End'
WHERE
  "ID" = '91DC7642-D457-4D7B-B8C0-77804DB37695';
/* UPDATE Entity Field Category Info MJ: Meetings.StartedAt */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Status and Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '782B4288-581D-44CA-A18B-AF32AF7DC08C';
/* UPDATE Entity Field Category Info MJ: Meetings.EndedAt */
UPDATE __mj."EntityField" SET "Category" = 'Meeting Status and Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FADDE66D-A143-4125-AFBF-061E91A6AA37';
/* UPDATE Entity Field Category Info MJ: Meetings.AllowPhoneDialIn */
UPDATE __mj."EntityField" SET "Category" = 'Access and Recording', "GeneratedFormSection" = 'Category', "DisplayName" = 'Allow Phone Dial-In'
WHERE
  "ID" = '00945934-7691-4DFE-B0B5-8DC7D6102EBD';
/* UPDATE Entity Field Category Info MJ: Meetings.DialInPhoneNumberID */
UPDATE __mj."EntityField" SET "Category" = 'Access and Recording', "GeneratedFormSection" = 'Category', "DisplayName" = 'Dial-In Phone Number'
WHERE
  "ID" = '6DE00DFC-503D-49BD-B527-C770F7120913';
/* UPDATE Entity Field Category Info MJ: Meetings.DialInCode */
UPDATE __mj."EntityField" SET "Category" = 'Access and Recording', "GeneratedFormSection" = 'Category', "DisplayName" = 'Dial-In Code'
WHERE
  "ID" = 'CC559752-25DD-4E8E-AA3B-51A66BC82473';
/* UPDATE Entity Field Category Info MJ: Meetings.RecordingPolicy */
UPDATE __mj."EntityField" SET "Category" = 'Access and Recording', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '12D4612E-1BC0-4D67-BF74-6C1CEAE0116D';
/* UPDATE Entity Field Category Info MJ: Meetings.ConversationID */
UPDATE __mj."EntityField" SET "Category" = 'Access and Recording', "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation'
WHERE
  "ID" = 'FC10509E-ECDB-411D-9CD9-96DA88DDDD6F';
/* UPDATE Entity Field Category Info MJ: Meetings.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A9DC6A28-AC90-40EF-BB3B-635AE9B77539';
/* UPDATE Entity Field Category Info MJ: Meetings.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '41B2E1E4-62B2-4890-B06A-C71ECEC16E85';

/* Set entity icon to fa fa-video */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-video', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4fe36d99-4b6f-5ef2-be49-765f7c49bc0a', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'FieldCategoryInfo', '{
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
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('80108c86-1c89-5240-a663-1b527a919c16', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'FieldCategoryIcons', '{
  "Access and Recording": "fa fa-shield-alt",
  "Meeting Details": "fa fa-info-circle",
  "Meeting Status and Timeline": "fa fa-clock",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'D2A67D87-F495-43E3-A91B-5A46E5553C31';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Bridges
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_bridge_agent_session_id"
    ON "__mj"."AIAgentSessionBridge" ("AgentSessionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_bridge_provider_id"
    ON "__mj"."AIAgentSessionBridge" ("ProviderID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentSessionBridges"
AS
SELECT
    a.*,
    MJAIBridgeProvider_ProviderID."Name" AS "Provider"
FROM
    "__mj"."AIAgentSessionBridge" AS a
INNER JOIN
    "__mj"."AIBridgeProvider" AS MJAIBridgeProvider_ProviderID
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentSessionBridges'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAIAgentSessionBridges'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentSessionBridges" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIAgentSessionBridges" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentSessionBridges" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIAgentSessionBridges" TO "cdp_UI";

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

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentSessionBridge"(
    p_id UUID DEFAULT NULL,
    p_agentsessionid UUID DEFAULT NULL,
    p_providerid UUID DEFAULT NULL,
    p_direction varchar(20) DEFAULT NULL,
    p_joinmethod varchar(30) DEFAULT NULL,
    p_turnmode varchar(20) DEFAULT NULL,
    p_externalconnectionid_clear boolean DEFAULT false,
    p_externalconnectionid varchar(500) DEFAULT NULL,
    p_address_clear boolean DEFAULT false,
    p_address varchar(2000) DEFAULT NULL,
    p_botparticipantid_clear boolean DEFAULT false,
    p_botparticipantid varchar(500) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_scheduledstarttime_clear boolean DEFAULT false,
    p_scheduledstarttime TIMESTAMPTZ DEFAULT NULL,
    p_connectedat_clear boolean DEFAULT false,
    p_connectedat TIMESTAMPTZ DEFAULT NULL,
    p_disconnectedat_clear boolean DEFAULT false,
    p_disconnectedat TIMESTAMPTZ DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason varchar(20) DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid varchar(200) DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_turnaddressing_clear boolean DEFAULT false,
    p_turnaddressing varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentSessionBridges" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentSessionBridge"
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
                "Config",
                "TurnAddressing"
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
                CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, NULL) END,
                CASE WHEN p_turnaddressing_clear = true THEN NULL ELSE COALESCE(p_turnaddressing, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentSessionBridges"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSessionBridge" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSessionBridge" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentSessionBridge"(
    p_id UUID,
    p_agentsessionid UUID DEFAULT NULL,
    p_providerid UUID DEFAULT NULL,
    p_direction varchar(20) DEFAULT NULL,
    p_joinmethod varchar(30) DEFAULT NULL,
    p_turnmode varchar(20) DEFAULT NULL,
    p_externalconnectionid_clear boolean DEFAULT false,
    p_externalconnectionid varchar(500) DEFAULT NULL,
    p_address_clear boolean DEFAULT false,
    p_address varchar(2000) DEFAULT NULL,
    p_botparticipantid_clear boolean DEFAULT false,
    p_botparticipantid varchar(500) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_scheduledstarttime_clear boolean DEFAULT false,
    p_scheduledstarttime TIMESTAMPTZ DEFAULT NULL,
    p_connectedat_clear boolean DEFAULT false,
    p_connectedat TIMESTAMPTZ DEFAULT NULL,
    p_disconnectedat_clear boolean DEFAULT false,
    p_disconnectedat TIMESTAMPTZ DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason varchar(20) DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid varchar(200) DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_turnaddressing_clear boolean DEFAULT false,
    p_turnaddressing varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentSessionBridges" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentSessionBridge"
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
        "Config" = CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, "Config") END,
        "TurnAddressing" = CASE WHEN p_turnaddressing_clear = true THEN NULL ELSE COALESCE(p_turnaddressing, "TurnAddressing") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentSessionBridges"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSessionBridge" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSessionBridge" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSessionBridge table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_session_bridge"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_session_bridge" ON "__mj"."AIAgentSessionBridge";

CREATE TRIGGER "trg_update_ai_agent_session_bridge"
BEFORE UPDATE ON "__mj"."AIAgentSessionBridge"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_session_bridge"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentSessionBridge"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentSessionBridge"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSessionBridge" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSessionBridge" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Events
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_event_interaction_id"
    ON "__mj"."InteractionEvent" ("InteractionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_event_actor_user_id"
    ON "__mj"."InteractionEvent" ("ActorUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_event_actor_agent_id"
    ON "__mj"."InteractionEvent" ("ActorAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Events
-- Item: vwInteractionEvents
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Interaction Events
-----               SCHEMA:      __mj
-----               BASE TABLE:  InteractionEvent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwInteractionEvents"
AS
SELECT
    i.*,
    MJUser_ActorUserID."Name" AS "ActorUser",
    MJAIAgent_ActorAgentID."Name" AS "ActorAgent"
FROM
    "__mj"."InteractionEvent" AS i
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_ActorUserID
  ON
    "i"."ActorUserID" = MJUser_ActorUserID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_ActorAgentID
  ON
    "i"."ActorAgentID" = MJAIAgent_ActorAgentID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwInteractionEvents'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwInteractionEvents'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwInteractionEvents" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwInteractionEvents" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwInteractionEvents" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwInteractionEvents" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Events
-- Item: spCreateInteractionEvent
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR InteractionEvent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateInteractionEvent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateInteractionEvent"(
    p_id UUID DEFAULT NULL,
    p_interactionid UUID DEFAULT NULL,
    p_eventtype varchar(20) DEFAULT NULL,
    p_occurredat TIMESTAMPTZ DEFAULT NULL,
    p_actoruserid_clear boolean DEFAULT false,
    p_actoruserid UUID DEFAULT NULL,
    p_actoragentid_clear boolean DEFAULT false,
    p_actoragentid UUID DEFAULT NULL,
    p_details_clear boolean DEFAULT false,
    p_details TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwInteractionEvents" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."InteractionEvent"
        (
            "ID",
            "InteractionID",
                "EventType",
                "OccurredAt",
                "ActorUserID",
                "ActorAgentID",
                "Details"
        )
    VALUES
        (
            v_new_id,
            p_interactionid,
                p_eventtype,
                COALESCE(p_occurredat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_actoruserid_clear = true THEN NULL ELSE COALESCE(p_actoruserid, NULL) END,
                CASE WHEN p_actoragentid_clear = true THEN NULL ELSE COALESCE(p_actoragentid, NULL) END,
                CASE WHEN p_details_clear = true THEN NULL ELSE COALESCE(p_details, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwInteractionEvents"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateInteractionEvent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateInteractionEvent" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Events
-- Item: spUpdateInteractionEvent
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR InteractionEvent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateInteractionEvent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateInteractionEvent"(
    p_id UUID,
    p_interactionid UUID DEFAULT NULL,
    p_eventtype varchar(20) DEFAULT NULL,
    p_occurredat TIMESTAMPTZ DEFAULT NULL,
    p_actoruserid_clear boolean DEFAULT false,
    p_actoruserid UUID DEFAULT NULL,
    p_actoragentid_clear boolean DEFAULT false,
    p_actoragentid UUID DEFAULT NULL,
    p_details_clear boolean DEFAULT false,
    p_details TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwInteractionEvents" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."InteractionEvent"
    SET
        "InteractionID" = COALESCE(p_interactionid, "InteractionID"),
        "EventType" = COALESCE(p_eventtype, "EventType"),
        "OccurredAt" = COALESCE(p_occurredat, "OccurredAt"),
        "ActorUserID" = CASE WHEN p_actoruserid_clear = true THEN NULL ELSE COALESCE(p_actoruserid, "ActorUserID") END,
        "ActorAgentID" = CASE WHEN p_actoragentid_clear = true THEN NULL ELSE COALESCE(p_actoragentid, "ActorAgentID") END,
        "Details" = CASE WHEN p_details_clear = true THEN NULL ELSE COALESCE(p_details, "Details") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwInteractionEvents"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateInteractionEvent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateInteractionEvent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InteractionEvent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_interaction_event"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_interaction_event" ON "__mj"."InteractionEvent";

CREATE TRIGGER "trg_update_interaction_event"
BEFORE UPDATE ON "__mj"."InteractionEvent"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_interaction_event"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Events
-- Item: spDeleteInteractionEvent
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR InteractionEvent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteInteractionEvent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteInteractionEvent"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."InteractionEvent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteInteractionEvent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteInteractionEvent" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Links
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_link_interaction_id"
    ON "__mj"."InteractionLink" ("InteractionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_link_entity_id"
    ON "__mj"."InteractionLink" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Links
-- Item: vwInteractionLinks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Interaction Links
-----               SCHEMA:      __mj
-----               BASE TABLE:  InteractionLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwInteractionLinks"
AS
SELECT
    i.*,
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."InteractionLink" AS i
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "i"."EntityID" = MJEntity_EntityID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwInteractionLinks'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwInteractionLinks'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwInteractionLinks" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwInteractionLinks" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwInteractionLinks" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwInteractionLinks" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Links
-- Item: spCreateInteractionLink
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR InteractionLink
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateInteractionLink'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateInteractionLink"(
    p_id UUID DEFAULT NULL,
    p_interactionid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_role varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwInteractionLinks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."InteractionLink"
        (
            "ID",
            "InteractionID",
                "EntityID",
                "RecordID",
                "Role"
        )
    VALUES
        (
            v_new_id,
            p_interactionid,
                p_entityid,
                p_recordid,
                p_role
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwInteractionLinks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateInteractionLink" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateInteractionLink" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Links
-- Item: spUpdateInteractionLink
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR InteractionLink
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateInteractionLink'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateInteractionLink"(
    p_id UUID,
    p_interactionid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_role varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwInteractionLinks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."InteractionLink"
    SET
        "InteractionID" = COALESCE(p_interactionid, "InteractionID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "Role" = COALESCE(p_role, "Role")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwInteractionLinks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateInteractionLink" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateInteractionLink" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InteractionLink table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_interaction_link"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_interaction_link" ON "__mj"."InteractionLink";

CREATE TRIGGER "trg_update_interaction_link"
BEFORE UPDATE ON "__mj"."InteractionLink"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_interaction_link"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Links
-- Item: spDeleteInteractionLink
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR InteractionLink
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteInteractionLink'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteInteractionLink"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."InteractionLink"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteInteractionLink" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteInteractionLink" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Offers
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_offer_interaction_id"
    ON "__mj"."InteractionOffer" ("InteractionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_offer_target_user_id"
    ON "__mj"."InteractionOffer" ("TargetUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_offer_offered_by_agent_id"
    ON "__mj"."InteractionOffer" ("OfferedByAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Offers
-- Item: vwInteractionOffers
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Interaction Offers
-----               SCHEMA:      __mj
-----               BASE TABLE:  InteractionOffer
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwInteractionOffers"
AS
SELECT
    i.*,
    MJUser_TargetUserID."Name" AS "TargetUser",
    MJAIAgent_OfferedByAgentID."Name" AS "OfferedByAgent"
FROM
    "__mj"."InteractionOffer" AS i
INNER JOIN
    "__mj"."User" AS MJUser_TargetUserID
  ON
    "i"."TargetUserID" = MJUser_TargetUserID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_OfferedByAgentID
  ON
    "i"."OfferedByAgentID" = MJAIAgent_OfferedByAgentID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwInteractionOffers'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwInteractionOffers'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwInteractionOffers" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwInteractionOffers" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwInteractionOffers" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwInteractionOffers" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Offers
-- Item: spCreateInteractionOffer
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR InteractionOffer
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateInteractionOffer'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateInteractionOffer"(
    p_id UUID DEFAULT NULL,
    p_interactionid UUID DEFAULT NULL,
    p_targetuserid UUID DEFAULT NULL,
    p_offeredbyagentid_clear boolean DEFAULT false,
    p_offeredbyagentid UUID DEFAULT NULL,
    p_mode varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_roomname varchar(255) DEFAULT NULL,
    p_callerlabel_clear boolean DEFAULT false,
    p_callerlabel varchar(255) DEFAULT NULL,
    p_summary_clear boolean DEFAULT false,
    p_summary TEXT DEFAULT NULL,
    p_offeredat TIMESTAMPTZ DEFAULT NULL,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_respondedat_clear boolean DEFAULT false,
    p_respondedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwInteractionOffers" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."InteractionOffer"
        (
            "ID",
            "InteractionID",
                "TargetUserID",
                "OfferedByAgentID",
                "Mode",
                "Status",
                "RoomName",
                "CallerLabel",
                "Summary",
                "OfferedAt",
                "ExpiresAt",
                "RespondedAt"
        )
    VALUES
        (
            v_new_id,
            p_interactionid,
                p_targetuserid,
                CASE WHEN p_offeredbyagentid_clear = true THEN NULL ELSE COALESCE(p_offeredbyagentid, NULL) END,
                p_mode,
                COALESCE(p_status, 'Pending'),
                p_roomname,
                CASE WHEN p_callerlabel_clear = true THEN NULL ELSE COALESCE(p_callerlabel, NULL) END,
                CASE WHEN p_summary_clear = true THEN NULL ELSE COALESCE(p_summary, NULL) END,
                COALESCE(p_offeredat, NOW() AT TIME ZONE 'UTC'),
                p_expiresat,
                CASE WHEN p_respondedat_clear = true THEN NULL ELSE COALESCE(p_respondedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwInteractionOffers"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateInteractionOffer" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateInteractionOffer" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Offers
-- Item: spUpdateInteractionOffer
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR InteractionOffer
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateInteractionOffer'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateInteractionOffer"(
    p_id UUID,
    p_interactionid UUID DEFAULT NULL,
    p_targetuserid UUID DEFAULT NULL,
    p_offeredbyagentid_clear boolean DEFAULT false,
    p_offeredbyagentid UUID DEFAULT NULL,
    p_mode varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_roomname varchar(255) DEFAULT NULL,
    p_callerlabel_clear boolean DEFAULT false,
    p_callerlabel varchar(255) DEFAULT NULL,
    p_summary_clear boolean DEFAULT false,
    p_summary TEXT DEFAULT NULL,
    p_offeredat TIMESTAMPTZ DEFAULT NULL,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_respondedat_clear boolean DEFAULT false,
    p_respondedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwInteractionOffers" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."InteractionOffer"
    SET
        "InteractionID" = COALESCE(p_interactionid, "InteractionID"),
        "TargetUserID" = COALESCE(p_targetuserid, "TargetUserID"),
        "OfferedByAgentID" = CASE WHEN p_offeredbyagentid_clear = true THEN NULL ELSE COALESCE(p_offeredbyagentid, "OfferedByAgentID") END,
        "Mode" = COALESCE(p_mode, "Mode"),
        "Status" = COALESCE(p_status, "Status"),
        "RoomName" = COALESCE(p_roomname, "RoomName"),
        "CallerLabel" = CASE WHEN p_callerlabel_clear = true THEN NULL ELSE COALESCE(p_callerlabel, "CallerLabel") END,
        "Summary" = CASE WHEN p_summary_clear = true THEN NULL ELSE COALESCE(p_summary, "Summary") END,
        "OfferedAt" = COALESCE(p_offeredat, "OfferedAt"),
        "ExpiresAt" = COALESCE(p_expiresat, "ExpiresAt"),
        "RespondedAt" = CASE WHEN p_respondedat_clear = true THEN NULL ELSE COALESCE(p_respondedat, "RespondedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwInteractionOffers"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateInteractionOffer" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateInteractionOffer" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InteractionOffer table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_interaction_offer"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_interaction_offer" ON "__mj"."InteractionOffer";

CREATE TRIGGER "trg_update_interaction_offer"
BEFORE UPDATE ON "__mj"."InteractionOffer"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_interaction_offer"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interaction Offers
-- Item: spDeleteInteractionOffer
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR InteractionOffer
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteInteractionOffer'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteInteractionOffer"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."InteractionOffer"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteInteractionOffer" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteInteractionOffer" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interactions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_agent_session_id"
    ON "__mj"."Interaction" ("AgentSessionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_interaction_phone_number_id"
    ON "__mj"."Interaction" ("PhoneNumberID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interactions
-- Item: vwInteractions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Interactions
-----               SCHEMA:      __mj
-----               BASE TABLE:  Interaction
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwInteractions"
AS
SELECT
    i.*,
    MJPhoneNumber_PhoneNumberID."Number" AS "PhoneNumber"
FROM
    "__mj"."Interaction" AS i
LEFT OUTER JOIN
    "__mj"."PhoneNumber" AS MJPhoneNumber_PhoneNumberID
  ON
    "i"."PhoneNumberID" = MJPhoneNumber_PhoneNumberID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwInteractions'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwInteractions'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwInteractions" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwInteractions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwInteractions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwInteractions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interactions
-- Item: spCreateInteraction
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Interaction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateInteraction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateInteraction"(
    p_id UUID DEFAULT NULL,
    p_channel varchar(20) DEFAULT NULL,
    p_direction varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_agentsessionid_clear boolean DEFAULT false,
    p_agentsessionid UUID DEFAULT NULL,
    p_roomname_clear boolean DEFAULT false,
    p_roomname varchar(255) DEFAULT NULL,
    p_phonenumberid_clear boolean DEFAULT false,
    p_phonenumberid UUID DEFAULT NULL,
    p_remoteaddress_clear boolean DEFAULT false,
    p_remoteaddress varchar(255) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_answeredat_clear boolean DEFAULT false,
    p_answeredat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_endreason_clear boolean DEFAULT false,
    p_endreason varchar(100) DEFAULT NULL,
    p_recordingenabled BOOLEAN DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid varchar(255) DEFAULT NULL,
    p_costestimate_clear boolean DEFAULT false,
    p_costestimate decimal(18, 6) DEFAULT NULL
) RETURNS SETOF "__mj"."vwInteractions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Interaction"
        (
            "ID",
            "Channel",
                "Direction",
                "Status",
                "AgentSessionID",
                "RoomName",
                "PhoneNumberID",
                "RemoteAddress",
                "StartedAt",
                "AnsweredAt",
                "EndedAt",
                "EndReason",
                "RecordingEnabled",
                "ExternalID",
                "CostEstimate"
        )
    VALUES
        (
            v_new_id,
            p_channel,
                p_direction,
                COALESCE(p_status, 'Queued'),
                CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, NULL) END,
                CASE WHEN p_roomname_clear = true THEN NULL ELSE COALESCE(p_roomname, NULL) END,
                CASE WHEN p_phonenumberid_clear = true THEN NULL ELSE COALESCE(p_phonenumberid, NULL) END,
                CASE WHEN p_remoteaddress_clear = true THEN NULL ELSE COALESCE(p_remoteaddress, NULL) END,
                COALESCE(p_startedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_answeredat_clear = true THEN NULL ELSE COALESCE(p_answeredat, NULL) END,
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                CASE WHEN p_endreason_clear = true THEN NULL ELSE COALESCE(p_endreason, NULL) END,
                COALESCE(p_recordingenabled, FALSE),
                CASE WHEN p_externalid_clear = true THEN NULL ELSE COALESCE(p_externalid, NULL) END,
                CASE WHEN p_costestimate_clear = true THEN NULL ELSE COALESCE(p_costestimate, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwInteractions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateInteraction" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateInteraction" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interactions
-- Item: spUpdateInteraction
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Interaction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateInteraction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateInteraction"(
    p_id UUID,
    p_channel varchar(20) DEFAULT NULL,
    p_direction varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_agentsessionid_clear boolean DEFAULT false,
    p_agentsessionid UUID DEFAULT NULL,
    p_roomname_clear boolean DEFAULT false,
    p_roomname varchar(255) DEFAULT NULL,
    p_phonenumberid_clear boolean DEFAULT false,
    p_phonenumberid UUID DEFAULT NULL,
    p_remoteaddress_clear boolean DEFAULT false,
    p_remoteaddress varchar(255) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_answeredat_clear boolean DEFAULT false,
    p_answeredat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_endreason_clear boolean DEFAULT false,
    p_endreason varchar(100) DEFAULT NULL,
    p_recordingenabled BOOLEAN DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid varchar(255) DEFAULT NULL,
    p_costestimate_clear boolean DEFAULT false,
    p_costestimate decimal(18, 6) DEFAULT NULL
) RETURNS SETOF "__mj"."vwInteractions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Interaction"
    SET
        "Channel" = COALESCE(p_channel, "Channel"),
        "Direction" = COALESCE(p_direction, "Direction"),
        "Status" = COALESCE(p_status, "Status"),
        "AgentSessionID" = CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, "AgentSessionID") END,
        "RoomName" = CASE WHEN p_roomname_clear = true THEN NULL ELSE COALESCE(p_roomname, "RoomName") END,
        "PhoneNumberID" = CASE WHEN p_phonenumberid_clear = true THEN NULL ELSE COALESCE(p_phonenumberid, "PhoneNumberID") END,
        "RemoteAddress" = CASE WHEN p_remoteaddress_clear = true THEN NULL ELSE COALESCE(p_remoteaddress, "RemoteAddress") END,
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "AnsweredAt" = CASE WHEN p_answeredat_clear = true THEN NULL ELSE COALESCE(p_answeredat, "AnsweredAt") END,
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "EndReason" = CASE WHEN p_endreason_clear = true THEN NULL ELSE COALESCE(p_endreason, "EndReason") END,
        "RecordingEnabled" = COALESCE(p_recordingenabled, "RecordingEnabled"),
        "ExternalID" = CASE WHEN p_externalid_clear = true THEN NULL ELSE COALESCE(p_externalid, "ExternalID") END,
        "CostEstimate" = CASE WHEN p_costestimate_clear = true THEN NULL ELSE COALESCE(p_costestimate, "CostEstimate") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwInteractions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateInteraction" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateInteraction" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Interaction table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_interaction"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_interaction" ON "__mj"."Interaction";

CREATE TRIGGER "trg_update_interaction"
BEFORE UPDATE ON "__mj"."Interaction"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_interaction"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Interactions
-- Item: spDeleteInteraction
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Interaction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteInteraction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteInteraction"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Interaction"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteInteraction" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteInteraction" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meeting Participants
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_meeting_participant_meeting_id"
    ON "__mj"."MeetingParticipant" ("MeetingID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_meeting_participant_user_id"
    ON "__mj"."MeetingParticipant" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_meeting_participant_agent_id"
    ON "__mj"."MeetingParticipant" ("AgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meeting Participants
-- Item: vwMeetingParticipants
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Meeting Participants
-----               SCHEMA:      __mj
-----               BASE TABLE:  MeetingParticipant
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMeetingParticipants"
AS
SELECT
    m.*,
    MJMeeting_MeetingID."Title" AS "Meeting",
    MJUser_UserID."Name" AS "User",
    MJAIAgent_AgentID."Name" AS "Agent"
FROM
    "__mj"."MeetingParticipant" AS m
INNER JOIN
    "__mj"."Meeting" AS MJMeeting_MeetingID
  ON
    "m"."MeetingID" = MJMeeting_MeetingID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "m"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "m"."AgentID" = MJAIAgent_AgentID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwMeetingParticipants'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwMeetingParticipants'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMeetingParticipants" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMeetingParticipants" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMeetingParticipants" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMeetingParticipants" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meeting Participants
-- Item: spCreateMeetingParticipant
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MeetingParticipant
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMeetingParticipant'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMeetingParticipant"(
    p_id UUID DEFAULT NULL,
    p_meetingid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_externalname_clear boolean DEFAULT false,
    p_externalname varchar(255) DEFAULT NULL,
    p_externalemail_clear boolean DEFAULT false,
    p_externalemail varchar(255) DEFAULT NULL,
    p_externalphone_clear boolean DEFAULT false,
    p_externalphone varchar(20) DEFAULT NULL,
    p_role varchar(20) DEFAULT NULL,
    p_invitestatus varchar(20) DEFAULT NULL,
    p_joinedat_clear boolean DEFAULT false,
    p_joinedat TIMESTAMPTZ DEFAULT NULL,
    p_leftat_clear boolean DEFAULT false,
    p_leftat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwMeetingParticipants" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MeetingParticipant"
        (
            "ID",
            "MeetingID",
                "UserID",
                "AgentID",
                "ExternalName",
                "ExternalEmail",
                "ExternalPhone",
                "Role",
                "InviteStatus",
                "JoinedAt",
                "LeftAt"
        )
    VALUES
        (
            v_new_id,
            p_meetingid,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                CASE WHEN p_externalname_clear = true THEN NULL ELSE COALESCE(p_externalname, NULL) END,
                CASE WHEN p_externalemail_clear = true THEN NULL ELSE COALESCE(p_externalemail, NULL) END,
                CASE WHEN p_externalphone_clear = true THEN NULL ELSE COALESCE(p_externalphone, NULL) END,
                COALESCE(p_role, 'Attendee'),
                COALESCE(p_invitestatus, 'Invited'),
                CASE WHEN p_joinedat_clear = true THEN NULL ELSE COALESCE(p_joinedat, NULL) END,
                CASE WHEN p_leftat_clear = true THEN NULL ELSE COALESCE(p_leftat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMeetingParticipants"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMeetingParticipant" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMeetingParticipant" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meeting Participants
-- Item: spUpdateMeetingParticipant
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MeetingParticipant
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMeetingParticipant'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMeetingParticipant"(
    p_id UUID,
    p_meetingid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_externalname_clear boolean DEFAULT false,
    p_externalname varchar(255) DEFAULT NULL,
    p_externalemail_clear boolean DEFAULT false,
    p_externalemail varchar(255) DEFAULT NULL,
    p_externalphone_clear boolean DEFAULT false,
    p_externalphone varchar(20) DEFAULT NULL,
    p_role varchar(20) DEFAULT NULL,
    p_invitestatus varchar(20) DEFAULT NULL,
    p_joinedat_clear boolean DEFAULT false,
    p_joinedat TIMESTAMPTZ DEFAULT NULL,
    p_leftat_clear boolean DEFAULT false,
    p_leftat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwMeetingParticipants" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MeetingParticipant"
    SET
        "MeetingID" = COALESCE(p_meetingid, "MeetingID"),
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "ExternalName" = CASE WHEN p_externalname_clear = true THEN NULL ELSE COALESCE(p_externalname, "ExternalName") END,
        "ExternalEmail" = CASE WHEN p_externalemail_clear = true THEN NULL ELSE COALESCE(p_externalemail, "ExternalEmail") END,
        "ExternalPhone" = CASE WHEN p_externalphone_clear = true THEN NULL ELSE COALESCE(p_externalphone, "ExternalPhone") END,
        "Role" = COALESCE(p_role, "Role"),
        "InviteStatus" = COALESCE(p_invitestatus, "InviteStatus"),
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
    SELECT * FROM "__mj"."vwMeetingParticipants"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMeetingParticipant" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMeetingParticipant" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MeetingParticipant table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_meeting_participant"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_meeting_participant" ON "__mj"."MeetingParticipant";

CREATE TRIGGER "trg_update_meeting_participant"
BEFORE UPDATE ON "__mj"."MeetingParticipant"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_meeting_participant"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meeting Participants
-- Item: spDeleteMeetingParticipant
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MeetingParticipant
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMeetingParticipant'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMeetingParticipant"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MeetingParticipant"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMeetingParticipant" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMeetingParticipant" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meetings
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_meeting_host_user_id"
    ON "__mj"."Meeting" ("HostUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_meeting_dial_in_phone_number_id"
    ON "__mj"."Meeting" ("DialInPhoneNumberID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_meeting_conversation_id"
    ON "__mj"."Meeting" ("ConversationID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meetings
-- Item: vwMeetings
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Meetings
-----               SCHEMA:      __mj
-----               BASE TABLE:  Meeting
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMeetings"
AS
SELECT
    m.*,
    MJUser_HostUserID."Name" AS "HostUser",
    MJPhoneNumber_DialInPhoneNumberID."Number" AS "DialInPhoneNumber",
    MJConversation_ConversationID."Name" AS "Conversation"
FROM
    "__mj"."Meeting" AS m
INNER JOIN
    "__mj"."User" AS MJUser_HostUserID
  ON
    "m"."HostUserID" = MJUser_HostUserID."ID"
LEFT OUTER JOIN
    "__mj"."PhoneNumber" AS MJPhoneNumber_DialInPhoneNumberID
  ON
    "m"."DialInPhoneNumberID" = MJPhoneNumber_DialInPhoneNumberID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "m"."ConversationID" = MJConversation_ConversationID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwMeetings'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwMeetings'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMeetings" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMeetings" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMeetings" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMeetings" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meetings
-- Item: spCreateMeeting
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Meeting
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMeeting'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMeeting"(
    p_id UUID DEFAULT NULL,
    p_title varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_hostuserid UUID DEFAULT NULL,
    p_roomname varchar(255) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_scheduledstartat_clear boolean DEFAULT false,
    p_scheduledstartat TIMESTAMPTZ DEFAULT NULL,
    p_scheduledendat_clear boolean DEFAULT false,
    p_scheduledendat TIMESTAMPTZ DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_allowphonedialin BOOLEAN DEFAULT NULL,
    p_dialinphonenumberid_clear boolean DEFAULT false,
    p_dialinphonenumberid UUID DEFAULT NULL,
    p_dialincode_clear boolean DEFAULT false,
    p_dialincode varchar(20) DEFAULT NULL,
    p_recordingpolicy varchar(20) DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwMeetings" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Meeting"
        (
            "ID",
            "Title",
                "Description",
                "HostUserID",
                "RoomName",
                "Status",
                "ScheduledStartAt",
                "ScheduledEndAt",
                "StartedAt",
                "EndedAt",
                "AllowPhoneDialIn",
                "DialInPhoneNumberID",
                "DialInCode",
                "RecordingPolicy",
                "ConversationID"
        )
    VALUES
        (
            v_new_id,
            p_title,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_hostuserid,
                p_roomname,
                COALESCE(p_status, 'Scheduled'),
                CASE WHEN p_scheduledstartat_clear = true THEN NULL ELSE COALESCE(p_scheduledstartat, NULL) END,
                CASE WHEN p_scheduledendat_clear = true THEN NULL ELSE COALESCE(p_scheduledendat, NULL) END,
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                COALESCE(p_allowphonedialin, FALSE),
                CASE WHEN p_dialinphonenumberid_clear = true THEN NULL ELSE COALESCE(p_dialinphonenumberid, NULL) END,
                CASE WHEN p_dialincode_clear = true THEN NULL ELSE COALESCE(p_dialincode, NULL) END,
                COALESCE(p_recordingpolicy, 'Off'),
                CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMeetings"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMeeting" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMeeting" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meetings
-- Item: spUpdateMeeting
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Meeting
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMeeting'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMeeting"(
    p_id UUID,
    p_title varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_hostuserid UUID DEFAULT NULL,
    p_roomname varchar(255) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_scheduledstartat_clear boolean DEFAULT false,
    p_scheduledstartat TIMESTAMPTZ DEFAULT NULL,
    p_scheduledendat_clear boolean DEFAULT false,
    p_scheduledendat TIMESTAMPTZ DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_allowphonedialin BOOLEAN DEFAULT NULL,
    p_dialinphonenumberid_clear boolean DEFAULT false,
    p_dialinphonenumberid UUID DEFAULT NULL,
    p_dialincode_clear boolean DEFAULT false,
    p_dialincode varchar(20) DEFAULT NULL,
    p_recordingpolicy varchar(20) DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwMeetings" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Meeting"
    SET
        "Title" = COALESCE(p_title, "Title"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "HostUserID" = COALESCE(p_hostuserid, "HostUserID"),
        "RoomName" = COALESCE(p_roomname, "RoomName"),
        "Status" = COALESCE(p_status, "Status"),
        "ScheduledStartAt" = CASE WHEN p_scheduledstartat_clear = true THEN NULL ELSE COALESCE(p_scheduledstartat, "ScheduledStartAt") END,
        "ScheduledEndAt" = CASE WHEN p_scheduledendat_clear = true THEN NULL ELSE COALESCE(p_scheduledendat, "ScheduledEndAt") END,
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "AllowPhoneDialIn" = COALESCE(p_allowphonedialin, "AllowPhoneDialIn"),
        "DialInPhoneNumberID" = CASE WHEN p_dialinphonenumberid_clear = true THEN NULL ELSE COALESCE(p_dialinphonenumberid, "DialInPhoneNumberID") END,
        "DialInCode" = CASE WHEN p_dialincode_clear = true THEN NULL ELSE COALESCE(p_dialincode, "DialInCode") END,
        "RecordingPolicy" = COALESCE(p_recordingpolicy, "RecordingPolicy"),
        "ConversationID" = CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, "ConversationID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMeetings"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMeeting" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMeeting" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Meeting table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_meeting"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_meeting" ON "__mj"."Meeting";

CREATE TRIGGER "trg_update_meeting"
BEFORE UPDATE ON "__mj"."Meeting"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_meeting"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Meetings
-- Item: spDeleteMeeting
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Meeting
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMeeting'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMeeting"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Meeting"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMeeting" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMeeting" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Number Pools
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Number Pools
-- Item: vwNumberPools
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Number Pools
-----               SCHEMA:      __mj
-----               BASE TABLE:  NumberPool
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwNumberPools"
AS
SELECT
    n.*
FROM
    "__mj"."NumberPool" AS n
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwNumberPools'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwNumberPools'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwNumberPools" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwNumberPools" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwNumberPools" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwNumberPools" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Number Pools
-- Item: spCreateNumberPool
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR NumberPool
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateNumberPool'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateNumberPool"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_selectionrule varchar(20) DEFAULT NULL,
    p_maxconcurrentpernumber_clear boolean DEFAULT false,
    p_maxconcurrentpernumber int DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwNumberPools" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."NumberPool"
        (
            "ID",
            "Name",
                "SelectionRule",
                "MaxConcurrentPerNumber",
                "Description"
        )
    VALUES
        (
            v_new_id,
            p_name,
                COALESCE(p_selectionrule, 'RoundRobin'),
                CASE WHEN p_maxconcurrentpernumber_clear = true THEN NULL ELSE COALESCE(p_maxconcurrentpernumber, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwNumberPools"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateNumberPool" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateNumberPool" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Number Pools
-- Item: spUpdateNumberPool
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR NumberPool
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateNumberPool'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateNumberPool"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_selectionrule varchar(20) DEFAULT NULL,
    p_maxconcurrentpernumber_clear boolean DEFAULT false,
    p_maxconcurrentpernumber int DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwNumberPools" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."NumberPool"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "SelectionRule" = COALESCE(p_selectionrule, "SelectionRule"),
        "MaxConcurrentPerNumber" = CASE WHEN p_maxconcurrentpernumber_clear = true THEN NULL ELSE COALESCE(p_maxconcurrentpernumber, "MaxConcurrentPerNumber") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwNumberPools"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateNumberPool" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateNumberPool" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the NumberPool table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_number_pool"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_number_pool" ON "__mj"."NumberPool";

CREATE TRIGGER "trg_update_number_pool"
BEFORE UPDATE ON "__mj"."NumberPool"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_number_pool"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Number Pools
-- Item: spDeleteNumberPool
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR NumberPool
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteNumberPool'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteNumberPool"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."NumberPool"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteNumberPool" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteNumberPool" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Phone Numbers
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_phone_number_provider_id"
    ON "__mj"."PhoneNumber" ("ProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_phone_number_number_pool_id"
    ON "__mj"."PhoneNumber" ("NumberPoolID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Phone Numbers
-- Item: vwPhoneNumbers
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Phone Numbers
-----               SCHEMA:      __mj
-----               BASE TABLE:  PhoneNumber
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwPhoneNumbers"
AS
SELECT
    p.*,
    MJAIBridgeProvider_ProviderID."Name" AS "Provider",
    MJNumberPool_NumberPoolID."Name" AS "NumberPool"
FROM
    "__mj"."PhoneNumber" AS p
INNER JOIN
    "__mj"."AIBridgeProvider" AS MJAIBridgeProvider_ProviderID
  ON
    "p"."ProviderID" = MJAIBridgeProvider_ProviderID."ID"
LEFT OUTER JOIN
    "__mj"."NumberPool" AS MJNumberPool_NumberPoolID
  ON
    "p"."NumberPoolID" = MJNumberPool_NumberPoolID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwPhoneNumbers'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwPhoneNumbers'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwPhoneNumbers" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwPhoneNumbers" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwPhoneNumbers" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwPhoneNumbers" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Phone Numbers
-- Item: spCreatePhoneNumber
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR PhoneNumber
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreatePhoneNumber'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreatePhoneNumber"(
    p_id UUID DEFAULT NULL,
    p_number varchar(20) DEFAULT NULL,
    p_providerid UUID DEFAULT NULL,
    p_capabilities varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_numberpoolid_clear boolean DEFAULT false,
    p_numberpoolid UUID DEFAULT NULL,
    p_label_clear boolean DEFAULT false,
    p_label varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwPhoneNumbers" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."PhoneNumber"
        (
            "ID",
            "Number",
                "ProviderID",
                "Capabilities",
                "Status",
                "NumberPoolID",
                "Label",
                "Description"
        )
    VALUES
        (
            v_new_id,
            p_number,
                p_providerid,
                COALESCE(p_capabilities, 'Voice'),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_numberpoolid_clear = true THEN NULL ELSE COALESCE(p_numberpoolid, NULL) END,
                CASE WHEN p_label_clear = true THEN NULL ELSE COALESCE(p_label, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwPhoneNumbers"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreatePhoneNumber" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreatePhoneNumber" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Phone Numbers
-- Item: spUpdatePhoneNumber
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR PhoneNumber
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdatePhoneNumber'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdatePhoneNumber"(
    p_id UUID,
    p_number varchar(20) DEFAULT NULL,
    p_providerid UUID DEFAULT NULL,
    p_capabilities varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_numberpoolid_clear boolean DEFAULT false,
    p_numberpoolid UUID DEFAULT NULL,
    p_label_clear boolean DEFAULT false,
    p_label varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwPhoneNumbers" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."PhoneNumber"
    SET
        "Number" = COALESCE(p_number, "Number"),
        "ProviderID" = COALESCE(p_providerid, "ProviderID"),
        "Capabilities" = COALESCE(p_capabilities, "Capabilities"),
        "Status" = COALESCE(p_status, "Status"),
        "NumberPoolID" = CASE WHEN p_numberpoolid_clear = true THEN NULL ELSE COALESCE(p_numberpoolid, "NumberPoolID") END,
        "Label" = CASE WHEN p_label_clear = true THEN NULL ELSE COALESCE(p_label, "Label") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwPhoneNumbers"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdatePhoneNumber" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdatePhoneNumber" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PhoneNumber table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_phone_number"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_phone_number" ON "__mj"."PhoneNumber";

CREATE TRIGGER "trg_update_phone_number"
BEFORE UPDATE ON "__mj"."PhoneNumber"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_phone_number"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Phone Numbers
-- Item: spDeletePhoneNumber
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR PhoneNumber
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeletePhoneNumber'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeletePhoneNumber"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."PhoneNumber"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeletePhoneNumber" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeletePhoneNumber" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_criterion_rubric_version_id"
    ON "__mj"."RubricCriterion" ("RubricVersionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_criterion_parent_id"
    ON "__mj"."RubricCriterion" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_criterion_scale_id"
    ON "__mj"."RubricCriterion" ("ScaleID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: fn_rubric_criterion_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: RubricCriterion.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_rubric_criterion_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."RubricCriterion"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."RubricCriterion" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."RubricCriterion" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."RubricCriterion" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: fn_rubric_criterion_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: RubricCriterion.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_rubric_criterion_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."RubricCriterion"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."RubricCriterion" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."RubricCriterion" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."RubricCriterion" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: fn_rubric_criterion_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: RubricCriterion.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_rubric_criterion_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."RubricCriterion"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."RubricCriterion" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: fn_rubric_criterion_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: RubricCriterion.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_rubric_criterion_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."RubricCriterion"
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
            "__mj"."RubricCriterion" c
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
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: vwRubricCriteria
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Criteria
-----               SCHEMA:      __mj
-----               BASE TABLE:  RubricCriterion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubricCriteria"
AS
SELECT
    r.*,
    MJRubricCriterion_ParentID."Name" AS "Parent",
    MJRubricScale_ScaleID."Name" AS "Scale",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."RubricCriterion" AS r
LEFT OUTER JOIN
    "__mj"."RubricCriterion" AS MJRubricCriterion_ParentID
  ON
    "r"."ParentID" = MJRubricCriterion_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."RubricScale" AS MJRubricScale_ScaleID
  ON
    "r"."ScaleID" = MJRubricScale_ScaleID."ID"

LEFT JOIN LATERAL "__mj"."fn_rubric_criterion_parent_id_get_hierarchy_meta"(r."ID", r."ParentID") AS hier_ParentID ON true
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwRubricCriteria'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwRubricCriteria'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubricCriteria" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwRubricCriteria" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubricCriteria" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubricCriteria" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: spCreateRubricCriterion
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RubricCriterion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubricCriterion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubricCriterion"(
    p_id UUID DEFAULT NULL,
    p_rubricversionid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_key varchar(100) DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_guidance_clear boolean DEFAULT false,
    p_guidance TEXT DEFAULT NULL,
    p_nodetype varchar(20) DEFAULT NULL,
    p_scaleid_clear boolean DEFAULT false,
    p_scaleid UUID DEFAULT NULL,
    p_weight decimal(18, 6) DEFAULT NULL,
    p_isadvisory BOOLEAN DEFAULT NULL,
    p_isgate BOOLEAN DEFAULT NULL,
    p_gateminimumscore_clear boolean DEFAULT false,
    p_gateminimumscore decimal(9, 6) DEFAULT NULL,
    p_notapplicablepolicy_clear boolean DEFAULT false,
    p_notapplicablepolicy varchar(30) DEFAULT NULL,
    p_rollupmethod_clear boolean DEFAULT false,
    p_rollupmethod varchar(20) DEFAULT NULL,
    p_evidencerequired BOOLEAN DEFAULT NULL,
    p_rationalerequired BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_evaluatorconfig_clear boolean DEFAULT false,
    p_evaluatorconfig TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCriteria" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RubricCriterion"
        (
            "ID",
            "RubricVersionID",
                "ParentID",
                "Key",
                "Name",
                "Description",
                "Guidance",
                "NodeType",
                "ScaleID",
                "Weight",
                "IsAdvisory",
                "IsGate",
                "GateMinimumScore",
                "NotApplicablePolicy",
                "RollupMethod",
                "EvidenceRequired",
                "RationaleRequired",
                "Sequence",
                "EvaluatorConfig"
        )
    VALUES
        (
            v_new_id,
            p_rubricversionid,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_key,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_guidance_clear = true THEN NULL ELSE COALESCE(p_guidance, NULL) END,
                COALESCE(p_nodetype, 'Criterion'),
                CASE WHEN p_scaleid_clear = true THEN NULL ELSE COALESCE(p_scaleid, NULL) END,
                COALESCE(p_weight, 1),
                COALESCE(p_isadvisory, FALSE),
                COALESCE(p_isgate, FALSE),
                CASE WHEN p_gateminimumscore_clear = true THEN NULL ELSE COALESCE(p_gateminimumscore, NULL) END,
                CASE WHEN p_notapplicablepolicy_clear = true THEN NULL ELSE COALESCE(p_notapplicablepolicy, NULL) END,
                CASE WHEN p_rollupmethod_clear = true THEN NULL ELSE COALESCE(p_rollupmethod, NULL) END,
                COALESCE(p_evidencerequired, FALSE),
                COALESCE(p_rationalerequired, FALSE),
                COALESCE(p_sequence, 0),
                CASE WHEN p_evaluatorconfig_clear = true THEN NULL ELSE COALESCE(p_evaluatorconfig, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricCriteria"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCriterion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCriterion" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: spUpdateRubricCriterion
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RubricCriterion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubricCriterion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubricCriterion"(
    p_id UUID,
    p_rubricversionid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_key varchar(100) DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_guidance_clear boolean DEFAULT false,
    p_guidance TEXT DEFAULT NULL,
    p_nodetype varchar(20) DEFAULT NULL,
    p_scaleid_clear boolean DEFAULT false,
    p_scaleid UUID DEFAULT NULL,
    p_weight decimal(18, 6) DEFAULT NULL,
    p_isadvisory BOOLEAN DEFAULT NULL,
    p_isgate BOOLEAN DEFAULT NULL,
    p_gateminimumscore_clear boolean DEFAULT false,
    p_gateminimumscore decimal(9, 6) DEFAULT NULL,
    p_notapplicablepolicy_clear boolean DEFAULT false,
    p_notapplicablepolicy varchar(30) DEFAULT NULL,
    p_rollupmethod_clear boolean DEFAULT false,
    p_rollupmethod varchar(20) DEFAULT NULL,
    p_evidencerequired BOOLEAN DEFAULT NULL,
    p_rationalerequired BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_evaluatorconfig_clear boolean DEFAULT false,
    p_evaluatorconfig TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCriteria" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RubricCriterion"
    SET
        "RubricVersionID" = COALESCE(p_rubricversionid, "RubricVersionID"),
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Key" = COALESCE(p_key, "Key"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Guidance" = CASE WHEN p_guidance_clear = true THEN NULL ELSE COALESCE(p_guidance, "Guidance") END,
        "NodeType" = COALESCE(p_nodetype, "NodeType"),
        "ScaleID" = CASE WHEN p_scaleid_clear = true THEN NULL ELSE COALESCE(p_scaleid, "ScaleID") END,
        "Weight" = COALESCE(p_weight, "Weight"),
        "IsAdvisory" = COALESCE(p_isadvisory, "IsAdvisory"),
        "IsGate" = COALESCE(p_isgate, "IsGate"),
        "GateMinimumScore" = CASE WHEN p_gateminimumscore_clear = true THEN NULL ELSE COALESCE(p_gateminimumscore, "GateMinimumScore") END,
        "NotApplicablePolicy" = CASE WHEN p_notapplicablepolicy_clear = true THEN NULL ELSE COALESCE(p_notapplicablepolicy, "NotApplicablePolicy") END,
        "RollupMethod" = CASE WHEN p_rollupmethod_clear = true THEN NULL ELSE COALESCE(p_rollupmethod, "RollupMethod") END,
        "EvidenceRequired" = COALESCE(p_evidencerequired, "EvidenceRequired"),
        "RationaleRequired" = COALESCE(p_rationalerequired, "RationaleRequired"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "EvaluatorConfig" = CASE WHEN p_evaluatorconfig_clear = true THEN NULL ELSE COALESCE(p_evaluatorconfig, "EvaluatorConfig") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricCriteria"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCriterion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCriterion" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricCriterion table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric_criterion"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric_criterion" ON "__mj"."RubricCriterion";

CREATE TRIGGER "trg_update_rubric_criterion"
BEFORE UPDATE ON "__mj"."RubricCriterion"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric_criterion"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: spDeleteRubricCriterion
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricCriterion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricCriterion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricCriterion"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RubricCriterion"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCriterion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCriterion" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_category_parent_id"
    ON "__mj"."RubricCategory" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: fn_rubric_category_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: RubricCategory.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_rubric_category_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."RubricCategory"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."RubricCategory" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."RubricCategory" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."RubricCategory" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: fn_rubric_category_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: RubricCategory.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_rubric_category_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."RubricCategory"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."RubricCategory" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."RubricCategory" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."RubricCategory" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: fn_rubric_category_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: RubricCategory.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_rubric_category_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."RubricCategory"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."RubricCategory" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: fn_rubric_category_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: RubricCategory.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_rubric_category_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."RubricCategory"
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
            "__mj"."RubricCategory" c
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
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: vwRubricCategories
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Categories
-----               SCHEMA:      __mj
-----               BASE TABLE:  RubricCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubricCategories"
AS
SELECT
    r.*,
    MJRubricCategory_ParentID."Name" AS "Parent",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."RubricCategory" AS r
LEFT OUTER JOIN
    "__mj"."RubricCategory" AS MJRubricCategory_ParentID
  ON
    "r"."ParentID" = MJRubricCategory_ParentID."ID"

LEFT JOIN LATERAL "__mj"."fn_rubric_category_parent_id_get_hierarchy_meta"(r."ID", r."ParentID") AS hier_ParentID ON true
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwRubricCategories'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwRubricCategories'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubricCategories" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwRubricCategories" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubricCategories" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubricCategories" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: spCreateRubricCategory
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RubricCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubricCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubricCategory"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCategories" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RubricCategory"
        (
            "ID",
            "Name",
                "Description",
                "ParentID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricCategories"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCategory" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: spUpdateRubricCategory
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RubricCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubricCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubricCategory"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCategories" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RubricCategory"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
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
    SELECT * FROM "__mj"."vwRubricCategories"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCategory" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricCategory table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric_category"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric_category" ON "__mj"."RubricCategory";

CREATE TRIGGER "trg_update_rubric_category"
BEFORE UPDATE ON "__mj"."RubricCategory"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric_category"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: spDeleteRubricCategory
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricCategory"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RubricCategory"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCategory" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_user_id"
    ON "__mj"."Conversation" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_linked_entity_id"
    ON "__mj"."Conversation" ("LinkedEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_data_context_id"
    ON "__mj"."Conversation" ("DataContextID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_environment_id"
    ON "__mj"."Conversation" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_project_id"
    ON "__mj"."Conversation" ("ProjectID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_test_run_id"
    ON "__mj"."Conversation" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_application_id"
    ON "__mj"."Conversation" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_default_agent_id"
    ON "__mj"."Conversation" ("DefaultAgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_recording_file_id"
    ON "__mj"."Conversation" ("RecordingFileID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_last_conversation_id"
    ON "__mj"."Conversation" ("LastConversationID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwConversations"
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
    MJAIAgent_DefaultAgentID."Name" AS "DefaultAgent",
    MJFile_RecordingFileID."Name" AS "RecordingFile",
    MJConversation_LastConversationID."Name" AS "LastConversation"
FROM
    "__mj"."Conversation" AS c
INNER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "c"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_LinkedEntityID
  ON
    "c"."LinkedEntityID" = MJEntity_LinkedEntityID."ID"
LEFT OUTER JOIN
    "__mj"."DataContext" AS MJDataContext_DataContextID
  ON
    "c"."DataContextID" = MJDataContext_DataContextID."ID"
INNER JOIN
    "__mj"."Environment" AS MJEnvironment_EnvironmentID
  ON
    "c"."EnvironmentID" = MJEnvironment_EnvironmentID."ID"
LEFT OUTER JOIN
    "__mj"."Project" AS MJProject_ProjectID
  ON
    "c"."ProjectID" = MJProject_ProjectID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "c"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."Application" AS MJApplication_ApplicationID
  ON
    "c"."ApplicationID" = MJApplication_ApplicationID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_DefaultAgentID
  ON
    "c"."DefaultAgentID" = MJAIAgent_DefaultAgentID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_RecordingFileID
  ON
    "c"."RecordingFileID" = MJFile_RecordingFileID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_LastConversationID
  ON
    "c"."LastConversationID" = MJConversation_LastConversationID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwConversations'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwConversations'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwConversations" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwConversations" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwConversations" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwConversations" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION "__mj"."spCreateConversation"(
    p_id UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid varchar(500) DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_type varchar(50) DEFAULT NULL,
    p_isarchived BOOLEAN DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid UUID DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid varchar(500) DEFAULT NULL,
    p_datacontextid_clear boolean DEFAULT false,
    p_datacontextid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_environmentid UUID DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid UUID DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid UUID DEFAULT NULL,
    p_applicationscope varchar(20) DEFAULT NULL,
    p_applicationid_clear boolean DEFAULT false,
    p_applicationid UUID DEFAULT NULL,
    p_defaultagentid_clear boolean DEFAULT false,
    p_defaultagentid UUID DEFAULT NULL,
    p_additionaldata_clear boolean DEFAULT false,
    p_additionaldata TEXT DEFAULT NULL,
    p_recordingfileid_clear boolean DEFAULT false,
    p_recordingfileid UUID DEFAULT NULL,
    p_egressid_clear boolean DEFAULT false,
    p_egressid varchar(255) DEFAULT NULL,
    p_visitorkey_clear boolean DEFAULT false,
    p_visitorkey varchar(255) DEFAULT NULL,
    p_lastconversationid_clear boolean DEFAULT false,
    p_lastconversationid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Conversation"
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
                "AdditionalData",
                "RecordingFileID",
                "EgressID",
                "VisitorKey",
                "LastConversationID"
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
                CASE WHEN p_environmentid = '00000000-0000-0000-0000-000000000000'::UUID THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_environmentid, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN p_projectid_clear = true THEN NULL ELSE COALESCE(p_projectid, NULL) END,
                COALESCE(p_ispinned, FALSE),
                CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, NULL) END,
                COALESCE(p_applicationscope, 'Global'),
                CASE WHEN p_applicationid_clear = true THEN NULL ELSE COALESCE(p_applicationid, NULL) END,
                CASE WHEN p_defaultagentid_clear = true THEN NULL ELSE COALESCE(p_defaultagentid, NULL) END,
                CASE WHEN p_additionaldata_clear = true THEN NULL ELSE COALESCE(p_additionaldata, NULL) END,
                CASE WHEN p_recordingfileid_clear = true THEN NULL ELSE COALESCE(p_recordingfileid, NULL) END,
                CASE WHEN p_egressid_clear = true THEN NULL ELSE COALESCE(p_egressid, NULL) END,
                CASE WHEN p_visitorkey_clear = true THEN NULL ELSE COALESCE(p_visitorkey, NULL) END,
                CASE WHEN p_lastconversationid_clear = true THEN NULL ELSE COALESCE(p_lastconversationid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwConversations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversation" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateConversation"(
    p_id UUID,
    p_userid UUID DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid varchar(500) DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_type varchar(50) DEFAULT NULL,
    p_isarchived BOOLEAN DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid UUID DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid varchar(500) DEFAULT NULL,
    p_datacontextid_clear boolean DEFAULT false,
    p_datacontextid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_environmentid UUID DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid UUID DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid UUID DEFAULT NULL,
    p_applicationscope varchar(20) DEFAULT NULL,
    p_applicationid_clear boolean DEFAULT false,
    p_applicationid UUID DEFAULT NULL,
    p_defaultagentid_clear boolean DEFAULT false,
    p_defaultagentid UUID DEFAULT NULL,
    p_additionaldata_clear boolean DEFAULT false,
    p_additionaldata TEXT DEFAULT NULL,
    p_recordingfileid_clear boolean DEFAULT false,
    p_recordingfileid UUID DEFAULT NULL,
    p_egressid_clear boolean DEFAULT false,
    p_egressid varchar(255) DEFAULT NULL,
    p_visitorkey_clear boolean DEFAULT false,
    p_visitorkey varchar(255) DEFAULT NULL,
    p_lastconversationid_clear boolean DEFAULT false,
    p_lastconversationid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Conversation"
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
        "AdditionalData" = CASE WHEN p_additionaldata_clear = true THEN NULL ELSE COALESCE(p_additionaldata, "AdditionalData") END,
        "RecordingFileID" = CASE WHEN p_recordingfileid_clear = true THEN NULL ELSE COALESCE(p_recordingfileid, "RecordingFileID") END,
        "EgressID" = CASE WHEN p_egressid_clear = true THEN NULL ELSE COALESCE(p_egressid, "EgressID") END,
        "VisitorKey" = CASE WHEN p_visitorkey_clear = true THEN NULL ELSE COALESCE(p_visitorkey, "VisitorKey") END,
        "LastConversationID" = CASE WHEN p_lastconversationid_clear = true THEN NULL ELSE COALESCE(p_lastconversationid, "LastConversationID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwConversations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversation" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Conversation table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_conversation"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation" ON "__mj"."Conversation";

CREATE TRIGGER "trg_update_conversation"
BEFORE UPDATE ON "__mj"."Conversation"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_conversation"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteConversation"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "SourceConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentExample"
        SET "SourceConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "SourceConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "SourceConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Sessions.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSession"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentSession"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Artifacts records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationArtifact"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationArtifact"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Details records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetail"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationDetail"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Skills records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationSkill"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationSkill"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversations.LastConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Conversation"
        WHERE "LastConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Conversation"
        SET "LastConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Meetings.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Meeting"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Meeting"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routines.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutine"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutine"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."Conversation"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversation" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_parent_id"
    ON "__mj"."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_context_compression_prompt_id"
    ON "__mj"."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_type_id"
    ON "__mj"."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_artifact_type_id"
    ON "__mj"."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_owner_user_id"
    ON "__mj"."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_attachment_storage_provider_id"
    ON "__mj"."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_category_id"
    ON "__mj"."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_storage_account_id"
    ON "__mj"."AIAgent" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_co_agent_id"
    ON "__mj"."AIAgent" ("DefaultCoAgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_recording_storage_provider_id"
    ON "__mj"."AIAgent" ("RecordingStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_media_collection_id"
    ON "__mj"."AIAgent" ("DefaultMediaCollectionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_conversation_summary_prompt_id"
    ON "__mj"."AIAgent" ("ConversationSummaryPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgent" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgent" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgent" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgent" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgent" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgent" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIAgent"
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
            "__mj"."AIAgent" c
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgents"
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
    MJFileStorageProvider_RecordingStorageProviderID."Name" AS "RecordingStorageProvider",
    MJCollection_DefaultMediaCollectionID."Name" AS "DefaultMediaCollection",
    MJAIPrompt_ConversationSummaryPromptID."Name" AS "ConversationSummaryPrompt",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIAgent" AS a
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_ParentID
  ON
    "a"."ParentID" = MJAIAgent_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ContextCompressionPromptID
  ON
    "a"."ContextCompressionPromptID" = MJAIPrompt_ContextCompressionPromptID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentType" AS MJAIAgentType_TypeID
  ON
    "a"."TypeID" = MJAIAgentType_TypeID."ID"
LEFT OUTER JOIN
    "__mj"."ArtifactType" AS MJArtifactType_DefaultArtifactTypeID
  ON
    "a"."DefaultArtifactTypeID" = MJArtifactType_DefaultArtifactTypeID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_OwnerUserID
  ON
    "a"."OwnerUserID" = MJUser_OwnerUserID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageProvider" AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    "a"."AttachmentStorageProviderID" = MJFileStorageProvider_AttachmentStorageProviderID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentCategory" AS MJAIAgentCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIAgentCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageAccount" AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    "a"."DefaultStorageAccountID" = MJFileStorageAccount_DefaultStorageAccountID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_DefaultCoAgentID
  ON
    "a"."DefaultCoAgentID" = MJAIAgent_DefaultCoAgentID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageProvider" AS MJFileStorageProvider_RecordingStorageProviderID
  ON
    "a"."RecordingStorageProviderID" = MJFileStorageProvider_RecordingStorageProviderID."ID"
LEFT OUTER JOIN
    "__mj"."Collection" AS MJCollection_DefaultMediaCollectionID
  ON
    "a"."DefaultMediaCollectionID" = MJCollection_DefaultMediaCollectionID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ConversationSummaryPromptID
  ON
    "a"."ConversationSummaryPromptID" = MJAIPrompt_ConversationSummaryPromptID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgents'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAIAgents'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgents" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIAgents" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgents" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgents" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgent"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgents"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite', 'RecordingDefault', 'RecordingStorageProviderID', 'DefaultMediaCollectionID', 'SupportsPlanMode', 'AcceptsSkills', 'SkillActivationMode', 'RequirePlanMode', 'ContextWindowMaxTokens', 'CompactionTriggerPercent', 'CompactionTargetPercent', 'ConversationSummaryPromptID', 'DeclareActionsAsNativeTools']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'Name' THEN '($1->>''Name'')'
        WHEN 'Description' THEN '($1->>''Description'')'
        WHEN 'LogoURL' THEN '($1->>''LogoURL'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'ExposeAsAction' THEN 'COALESCE(($1->>''ExposeAsAction'')::BOOLEAN, FALSE)'
        WHEN 'ExecutionOrder' THEN 'COALESCE(($1->>''ExecutionOrder'')::INT, 0)'
        WHEN 'ExecutionMode' THEN 'COALESCE(($1->>''ExecutionMode''), ''Sequential'')'
        WHEN 'EnableContextCompression' THEN 'COALESCE(($1->>''EnableContextCompression'')::BOOLEAN, FALSE)'
        WHEN 'ContextCompressionMessageThreshold' THEN '($1->>''ContextCompressionMessageThreshold'')::INT'
        WHEN 'ContextCompressionPromptID' THEN '($1->>''ContextCompressionPromptID'')::UUID'
        WHEN 'ContextCompressionMessageRetentionCount' THEN '($1->>''ContextCompressionMessageRetentionCount'')::INT'
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
        WHEN 'FinalPayloadValidationMaxRetries' THEN 'COALESCE(($1->>''FinalPayloadValidationMaxRetries'')::INT, 3)'
        WHEN 'MaxCostPerRun' THEN '($1->>''MaxCostPerRun'')::DECIMAL(10, 4)'
        WHEN 'MaxTokensPerRun' THEN '($1->>''MaxTokensPerRun'')::INT'
        WHEN 'MaxIterationsPerRun' THEN '($1->>''MaxIterationsPerRun'')::INT'
        WHEN 'MaxTimePerRun' THEN '($1->>''MaxTimePerRun'')::INT'
        WHEN 'MinExecutionsPerRun' THEN '($1->>''MinExecutionsPerRun'')::INT'
        WHEN 'MaxExecutionsPerRun' THEN '($1->>''MaxExecutionsPerRun'')::INT'
        WHEN 'StartingPayloadValidation' THEN '($1->>''StartingPayloadValidation'')'
        WHEN 'StartingPayloadValidationMode' THEN 'COALESCE(($1->>''StartingPayloadValidationMode''), ''Fail'')'
        WHEN 'DefaultPromptEffortLevel' THEN '($1->>''DefaultPromptEffortLevel'')::INT'
        WHEN 'ChatHandlingOption' THEN '($1->>''ChatHandlingOption'')'
        WHEN 'DefaultArtifactTypeID' THEN '($1->>''DefaultArtifactTypeID'')::UUID'
        WHEN 'OwnerUserID' THEN 'CASE WHEN ($1->>''OwnerUserID'')::UUID = ''00000000-0000-0000-0000-000000000000''::uuid THEN ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'' ELSE COALESCE(($1->>''OwnerUserID'')::UUID, ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'') END'
        WHEN 'InvocationMode' THEN 'COALESCE(($1->>''InvocationMode''), ''Any'')'
        WHEN 'ArtifactCreationMode' THEN 'COALESCE(($1->>''ArtifactCreationMode''), ''Always'')'
        WHEN 'FunctionalRequirements' THEN '($1->>''FunctionalRequirements'')'
        WHEN 'TechnicalDesign' THEN '($1->>''TechnicalDesign'')'
        WHEN 'InjectNotes' THEN 'COALESCE(($1->>''InjectNotes'')::BOOLEAN, TRUE)'
        WHEN 'MaxNotesToInject' THEN 'COALESCE(($1->>''MaxNotesToInject'')::INT, 5)'
        WHEN 'NoteInjectionStrategy' THEN 'COALESCE(($1->>''NoteInjectionStrategy''), ''Relevant'')'
        WHEN 'InjectExamples' THEN 'COALESCE(($1->>''InjectExamples'')::BOOLEAN, FALSE)'
        WHEN 'MaxExamplesToInject' THEN 'COALESCE(($1->>''MaxExamplesToInject'')::INT, 3)'
        WHEN 'ExampleInjectionStrategy' THEN 'COALESCE(($1->>''ExampleInjectionStrategy''), ''Semantic'')'
        WHEN 'IsRestricted' THEN 'COALESCE(($1->>''IsRestricted'')::BOOLEAN, FALSE)'
        WHEN 'MessageMode' THEN 'COALESCE(($1->>''MessageMode''), ''None'')'
        WHEN 'MaxMessages' THEN '($1->>''MaxMessages'')::INT'
        WHEN 'AttachmentStorageProviderID' THEN '($1->>''AttachmentStorageProviderID'')::UUID'
        WHEN 'AttachmentRootPath' THEN '($1->>''AttachmentRootPath'')'
        WHEN 'InlineStorageThresholdBytes' THEN '($1->>''InlineStorageThresholdBytes'')::INT'
        WHEN 'AgentTypePromptParams' THEN '($1->>''AgentTypePromptParams'')'
        WHEN 'ScopeConfig' THEN '($1->>''ScopeConfig'')'
        WHEN 'NoteRetentionDays' THEN '($1->>''NoteRetentionDays'')::INT'
        WHEN 'ExampleRetentionDays' THEN '($1->>''ExampleRetentionDays'')::INT'
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
        WHEN 'RecordingDefault' THEN '($1->>''RecordingDefault'')'
        WHEN 'RecordingStorageProviderID' THEN '($1->>''RecordingStorageProviderID'')::UUID'
        WHEN 'DefaultMediaCollectionID' THEN '($1->>''DefaultMediaCollectionID'')::UUID'
        WHEN 'SupportsPlanMode' THEN 'COALESCE(($1->>''SupportsPlanMode'')::BOOLEAN, TRUE)'
        WHEN 'AcceptsSkills' THEN 'COALESCE(($1->>''AcceptsSkills''), ''None'')'
        WHEN 'SkillActivationMode' THEN 'COALESCE(($1->>''SkillActivationMode''), ''RequestedOnly'')'
        WHEN 'RequirePlanMode' THEN 'COALESCE(($1->>''RequirePlanMode'')::BOOLEAN, FALSE)'
        WHEN 'ContextWindowMaxTokens' THEN '($1->>''ContextWindowMaxTokens'')::INT'
        WHEN 'CompactionTriggerPercent' THEN '($1->>''CompactionTriggerPercent'')::INT'
        WHEN 'CompactionTargetPercent' THEN '($1->>''CompactionTargetPercent'')::INT'
        WHEN 'ConversationSummaryPromptID' THEN '($1->>''ConversationSummaryPromptID'')::UUID'
        WHEN 'DeclareActionsAsNativeTools' THEN 'COALESCE(($1->>''DeclareActionsAsNativeTools'')::BOOLEAN, TRUE)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIAgent" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgent" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgent"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgents"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgent: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIAgent"
    SET
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "LogoURL" = CASE WHEN p_data ? 'LogoURL' THEN (p_data->>'LogoURL') ELSE "LogoURL" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "ExposeAsAction" = CASE WHEN p_data ? 'ExposeAsAction' THEN (p_data->>'ExposeAsAction')::BOOLEAN ELSE "ExposeAsAction" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "ExecutionMode" = CASE WHEN p_data ? 'ExecutionMode' THEN (p_data->>'ExecutionMode') ELSE "ExecutionMode" END,
        "EnableContextCompression" = CASE WHEN p_data ? 'EnableContextCompression' THEN (p_data->>'EnableContextCompression')::BOOLEAN ELSE "EnableContextCompression" END,
        "ContextCompressionMessageThreshold" = CASE WHEN p_data ? 'ContextCompressionMessageThreshold' THEN (p_data->>'ContextCompressionMessageThreshold')::INT ELSE "ContextCompressionMessageThreshold" END,
        "ContextCompressionPromptID" = CASE WHEN p_data ? 'ContextCompressionPromptID' THEN (p_data->>'ContextCompressionPromptID')::UUID ELSE "ContextCompressionPromptID" END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_data ? 'ContextCompressionMessageRetentionCount' THEN (p_data->>'ContextCompressionMessageRetentionCount')::INT ELSE "ContextCompressionMessageRetentionCount" END,
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
        "FinalPayloadValidationMaxRetries" = CASE WHEN p_data ? 'FinalPayloadValidationMaxRetries' THEN (p_data->>'FinalPayloadValidationMaxRetries')::INT ELSE "FinalPayloadValidationMaxRetries" END,
        "MaxCostPerRun" = CASE WHEN p_data ? 'MaxCostPerRun' THEN (p_data->>'MaxCostPerRun')::DECIMAL(10, 4) ELSE "MaxCostPerRun" END,
        "MaxTokensPerRun" = CASE WHEN p_data ? 'MaxTokensPerRun' THEN (p_data->>'MaxTokensPerRun')::INT ELSE "MaxTokensPerRun" END,
        "MaxIterationsPerRun" = CASE WHEN p_data ? 'MaxIterationsPerRun' THEN (p_data->>'MaxIterationsPerRun')::INT ELSE "MaxIterationsPerRun" END,
        "MaxTimePerRun" = CASE WHEN p_data ? 'MaxTimePerRun' THEN (p_data->>'MaxTimePerRun')::INT ELSE "MaxTimePerRun" END,
        "MinExecutionsPerRun" = CASE WHEN p_data ? 'MinExecutionsPerRun' THEN (p_data->>'MinExecutionsPerRun')::INT ELSE "MinExecutionsPerRun" END,
        "MaxExecutionsPerRun" = CASE WHEN p_data ? 'MaxExecutionsPerRun' THEN (p_data->>'MaxExecutionsPerRun')::INT ELSE "MaxExecutionsPerRun" END,
        "StartingPayloadValidation" = CASE WHEN p_data ? 'StartingPayloadValidation' THEN (p_data->>'StartingPayloadValidation') ELSE "StartingPayloadValidation" END,
        "StartingPayloadValidationMode" = CASE WHEN p_data ? 'StartingPayloadValidationMode' THEN (p_data->>'StartingPayloadValidationMode') ELSE "StartingPayloadValidationMode" END,
        "DefaultPromptEffortLevel" = CASE WHEN p_data ? 'DefaultPromptEffortLevel' THEN (p_data->>'DefaultPromptEffortLevel')::INT ELSE "DefaultPromptEffortLevel" END,
        "ChatHandlingOption" = CASE WHEN p_data ? 'ChatHandlingOption' THEN (p_data->>'ChatHandlingOption') ELSE "ChatHandlingOption" END,
        "DefaultArtifactTypeID" = CASE WHEN p_data ? 'DefaultArtifactTypeID' THEN (p_data->>'DefaultArtifactTypeID')::UUID ELSE "DefaultArtifactTypeID" END,
        "OwnerUserID" = CASE WHEN p_data ? 'OwnerUserID' THEN (p_data->>'OwnerUserID')::UUID ELSE "OwnerUserID" END,
        "InvocationMode" = CASE WHEN p_data ? 'InvocationMode' THEN (p_data->>'InvocationMode') ELSE "InvocationMode" END,
        "ArtifactCreationMode" = CASE WHEN p_data ? 'ArtifactCreationMode' THEN (p_data->>'ArtifactCreationMode') ELSE "ArtifactCreationMode" END,
        "FunctionalRequirements" = CASE WHEN p_data ? 'FunctionalRequirements' THEN (p_data->>'FunctionalRequirements') ELSE "FunctionalRequirements" END,
        "TechnicalDesign" = CASE WHEN p_data ? 'TechnicalDesign' THEN (p_data->>'TechnicalDesign') ELSE "TechnicalDesign" END,
        "InjectNotes" = CASE WHEN p_data ? 'InjectNotes' THEN (p_data->>'InjectNotes')::BOOLEAN ELSE "InjectNotes" END,
        "MaxNotesToInject" = CASE WHEN p_data ? 'MaxNotesToInject' THEN (p_data->>'MaxNotesToInject')::INT ELSE "MaxNotesToInject" END,
        "NoteInjectionStrategy" = CASE WHEN p_data ? 'NoteInjectionStrategy' THEN (p_data->>'NoteInjectionStrategy') ELSE "NoteInjectionStrategy" END,
        "InjectExamples" = CASE WHEN p_data ? 'InjectExamples' THEN (p_data->>'InjectExamples')::BOOLEAN ELSE "InjectExamples" END,
        "MaxExamplesToInject" = CASE WHEN p_data ? 'MaxExamplesToInject' THEN (p_data->>'MaxExamplesToInject')::INT ELSE "MaxExamplesToInject" END,
        "ExampleInjectionStrategy" = CASE WHEN p_data ? 'ExampleInjectionStrategy' THEN (p_data->>'ExampleInjectionStrategy') ELSE "ExampleInjectionStrategy" END,
        "IsRestricted" = CASE WHEN p_data ? 'IsRestricted' THEN (p_data->>'IsRestricted')::BOOLEAN ELSE "IsRestricted" END,
        "MessageMode" = CASE WHEN p_data ? 'MessageMode' THEN (p_data->>'MessageMode') ELSE "MessageMode" END,
        "MaxMessages" = CASE WHEN p_data ? 'MaxMessages' THEN (p_data->>'MaxMessages')::INT ELSE "MaxMessages" END,
        "AttachmentStorageProviderID" = CASE WHEN p_data ? 'AttachmentStorageProviderID' THEN (p_data->>'AttachmentStorageProviderID')::UUID ELSE "AttachmentStorageProviderID" END,
        "AttachmentRootPath" = CASE WHEN p_data ? 'AttachmentRootPath' THEN (p_data->>'AttachmentRootPath') ELSE "AttachmentRootPath" END,
        "InlineStorageThresholdBytes" = CASE WHEN p_data ? 'InlineStorageThresholdBytes' THEN (p_data->>'InlineStorageThresholdBytes')::INT ELSE "InlineStorageThresholdBytes" END,
        "AgentTypePromptParams" = CASE WHEN p_data ? 'AgentTypePromptParams' THEN (p_data->>'AgentTypePromptParams') ELSE "AgentTypePromptParams" END,
        "ScopeConfig" = CASE WHEN p_data ? 'ScopeConfig' THEN (p_data->>'ScopeConfig') ELSE "ScopeConfig" END,
        "NoteRetentionDays" = CASE WHEN p_data ? 'NoteRetentionDays' THEN (p_data->>'NoteRetentionDays')::INT ELSE "NoteRetentionDays" END,
        "ExampleRetentionDays" = CASE WHEN p_data ? 'ExampleRetentionDays' THEN (p_data->>'ExampleRetentionDays')::INT ELSE "ExampleRetentionDays" END,
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
        "RecordingDefault" = CASE WHEN p_data ? 'RecordingDefault' THEN (p_data->>'RecordingDefault') ELSE "RecordingDefault" END,
        "RecordingStorageProviderID" = CASE WHEN p_data ? 'RecordingStorageProviderID' THEN (p_data->>'RecordingStorageProviderID')::UUID ELSE "RecordingStorageProviderID" END,
        "DefaultMediaCollectionID" = CASE WHEN p_data ? 'DefaultMediaCollectionID' THEN (p_data->>'DefaultMediaCollectionID')::UUID ELSE "DefaultMediaCollectionID" END,
        "SupportsPlanMode" = CASE WHEN p_data ? 'SupportsPlanMode' THEN (p_data->>'SupportsPlanMode')::BOOLEAN ELSE "SupportsPlanMode" END,
        "AcceptsSkills" = CASE WHEN p_data ? 'AcceptsSkills' THEN (p_data->>'AcceptsSkills') ELSE "AcceptsSkills" END,
        "SkillActivationMode" = CASE WHEN p_data ? 'SkillActivationMode' THEN (p_data->>'SkillActivationMode') ELSE "SkillActivationMode" END,
        "RequirePlanMode" = CASE WHEN p_data ? 'RequirePlanMode' THEN (p_data->>'RequirePlanMode')::BOOLEAN ELSE "RequirePlanMode" END,
        "ContextWindowMaxTokens" = CASE WHEN p_data ? 'ContextWindowMaxTokens' THEN (p_data->>'ContextWindowMaxTokens')::INT ELSE "ContextWindowMaxTokens" END,
        "CompactionTriggerPercent" = CASE WHEN p_data ? 'CompactionTriggerPercent' THEN (p_data->>'CompactionTriggerPercent')::INT ELSE "CompactionTriggerPercent" END,
        "CompactionTargetPercent" = CASE WHEN p_data ? 'CompactionTargetPercent' THEN (p_data->>'CompactionTargetPercent')::INT ELSE "CompactionTargetPercent" END,
        "ConversationSummaryPromptID" = CASE WHEN p_data ? 'ConversationSummaryPromptID' THEN (p_data->>'ConversationSummaryPromptID')::UUID ELSE "ConversationSummaryPromptID" END,
        "DeclareActionsAsNativeTools" = CASE WHEN p_data ? 'DeclareActionsAsNativeTools' THEN (p_data->>'DeclareActionsAsNativeTools')::BOOLEAN ELSE "DeclareActionsAsNativeTools" END,
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
    SELECT * FROM "__mj"."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent" ON "__mj"."AIAgent";

CREATE TRIGGER "trg_update_ai_agent"
BEFORE UPDATE ON "__mj"."AIAgent"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgent"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Actions.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentAction"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentAction"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Artifact Types records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentArtifactType"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentArtifactType"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Client Tools records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentClientTool"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentClientTool"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Co Agents records via CoAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentCoAgent"
        WHERE "CoAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentCoAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Co Agents.TargetAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentCoAgent"
        WHERE "TargetAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentCoAgent"
        SET "TargetAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Configurations records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentConfiguration"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentConfiguration"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Credentials records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentCredential"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentCredential"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Data Sources records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentDataSource"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentDataSource"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Examples records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentExample"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Learning Cycles records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentLearningCycle"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentLearningCycle"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Modalities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentModality"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentModality"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Models.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentModel"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentModel"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Permissions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPermission"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Personas records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPersona"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPersona"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPrompt"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRelationship"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRelationship"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Requests records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRequest"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Rubrics records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRubric"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRubric"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Runs records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Search Scopes records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSearchScope"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentSearchScope"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Sessions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSession"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentSession"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Skills records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSkill"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentSkill"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Steps records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.SubAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "SubAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentStep"
        SET "SubAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.DefaultCoAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "DefaultCoAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "DefaultCoAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Bridge Agent Identities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIBridgeAgentIdentity"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIBridgeAgentIdentity"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIResultCache"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Skill Sub Agents records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AISkillSubAgent"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAISkillSubAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Actions.CreatedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Action"
        WHERE "CreatedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Action"
        SET "CreatedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetail"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationDetail"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Widget Instances records via PinnedAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationWidgetInstance"
        WHERE "PinnedAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationWidgetInstance"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversations.DefaultAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Conversation"
        WHERE "DefaultAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Conversation"
        SET "DefaultAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocument"
        WHERE "ReasoningAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."EntityDocument"
        SET "ReasoningAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Interaction Events.ActorAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."InteractionEvent"
        WHERE "ActorAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."InteractionEvent"
        SET "ActorAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Interaction Offers.OfferedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."InteractionOffer"
        WHERE "OfferedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."InteractionOffer"
        SET "OfferedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Meeting Participants.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."MeetingParticipant"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."MeetingParticipant"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RecordProcess"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RecordProcess"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Search Execution Logs.AIAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."SearchExecutionLog"
        WHERE "AIAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."SearchExecutionLog"
        SET "AIAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgent" TO "cdp_Integration";
