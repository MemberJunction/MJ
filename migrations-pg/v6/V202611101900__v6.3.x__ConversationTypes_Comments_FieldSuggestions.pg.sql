-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611101900__v6.3.x__ConversationTypes_Comments_FieldSuggestions.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ HAND-FINISHED FOR POSTGRESQL: sections 1–2 (ConversationType + Conversation.TypeID) ══╗
-- Sections 1 and 2 of the SQL Server migration are below; the rest of the file (sections 3–6 and
-- the CodeGen section) was transpiled and baked natively from a copy of the SQL Server source with
-- sections 1–2 removed, after these statements had been applied to the working database.
-- Section 1's table + seed rows are the transpiler's output, unchanged. Hand-written:
--  a. Custom legacy Conversation.Type values -> ConversationType. The transpiler turned
--     CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(400), LOWER(name))), 2) into a
--     TO_CHAR(..., 'YY.MM.DD') date format — wrong. Ported as the first 8 upper-case hex digits of
--     sha256(lower(name)). SQL Server hashes the UTF-16LE bytes of the NVARCHAR, PostgreSQL the UTF-8
--     bytes, so a collided Code's suffix differs between platforms; it only has to be deterministic
--     and unique within one database. Name/Code matches are case-insensitive, as SQL Server's CI
--     collation makes them.
--  b. The backfill UPDATE (UPDATE ... FROM with two LEFT OUTER JOINs, not emitted by the
--     transpiler). Without it SET NOT NULL fails on any database that has conversations — a fresh
--     database has none, so the clean-apply gate cannot see this. Ported as UPDATE ... FROM a derived
--     table that keeps the outer joins.
--  c. ADD CONSTRAINT ... DEFAULT ... FOR [TypeID] (not emitted) -> ALTER COLUMN SET DEFAULT, plus the FK.
--  d. DROP CONSTRAINT DF_Conversation_Type: SQL Server's named default has no PostgreSQL object
--     (the default is part of the column and goes with DROP COLUMN), so it is not ported.
--  e. DROP COLUMN "Type": vwConversations is the only view that depends on it (checked on the
--     working DB; no view depends on vwConversations). It is dropped first with CASCADE, which also
--     drops spCreateConversation / spUpdateConversation (they return its row type) — the same
--     DROP VIEW ... CASCADE CodeGen emits. The CodeGen section below recreates the view (with the
--     virtual Type display field from TypeID) and both functions.
--  f. Metadata for the old physical Conversation.Type EntityField row. The CodeGen section's insert
--     of the virtual Type field is guarded by IF NOT EXISTS (... Name = 'Type'), so on a migrated
--     database it is skipped and the old row stays (on SQL Server too). SQL Server's
--     R__RefreshMetadata then runs spUpdateExistingEntityFieldsFromSchema, which flips that row to
--     IsVirtual = 1 / AllowUpdateAPI = 0. PostgreSQL's R__RefreshMetadata does not run that routine
--     (it is CodeGen-owned there), so the row would stay a writable physical field while the baked
--     spCreateConversation / spUpdateConversation no longer take a Type argument. This UPDATE applies
--     the same two flags SQL Server's refresh applies. (The working database used for baking needed
--     the same flag before CodeGen ran, or vwComments selected a non-existent "Type" column.)
-- ╚══════════════════════════════════════════════════════════════════════════════════════════╝

/* ------------------------------------------------------------------------------------- */
/* 1. ConversationType */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."ConversationType" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "Name" VARCHAR(100) NOT NULL,
  "Code" VARCHAR(50) NOT NULL,
  "Description" TEXT NULL,
  "ExtensionEntity" VARCHAR(255) NULL,
  "DriverClass" VARCHAR(255) NULL,
  CONSTRAINT "PK_ConversationType" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_ConversationType_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "UQ_ConversationType_Code" UNIQUE (
    "Code"
  )
);

INSERT INTO __mj."ConversationType" (
  "ID",
  "Name",
  "Code",
  "Description",
  "ExtensionEntity",
  "DriverClass"
)
VALUES
  (
    '7F81FF57-C5A8-464D-B3B4-35A4FCF10717',
    'Chat',
    'CHAT',
    'Standard interactive chat conversation between a user and one or more AI agents.',
    NULL,
    NULL
  ),
  (
    'FDAE66B9-CF87-48EA-8A12-8E521740A66A',
    'Skip',
    'SKIP',
    'Ask Skip analytical or Component Studio conversation.',
    NULL,
    NULL
  ),
  (
    '18D12ABA-BE8C-4087-B440-835B6D077DD7',
    'Routine',
    'ROUTINE',
    'Background conversation owned by a scheduled or event-driven User Routine execution.',
    NULL,
    NULL
  ),
  (
    '2E9EF85D-D18A-4B8E-B6AB-F65C7F91A926',
    'Meeting Room',
    'MEETING_ROOM',
    'Realtime multi-participant voice or video meeting room transcript conversation.',
    NULL,
    NULL
  ),
  (
    '17E6A105-AE51-43A2-9D56-290BC8D1D6BB',
    'Comment',
    'COMMENT',
    'Anchored comment or suggestion thread attached to an entity record, field, section, or artifact.',
    'MJ: Comments',
    NULL
  );

/* Preserve any distinct custom Conversation.Type strings present in existing customer data. */
/* Deduplicates normalized Code collisions (e.g. 'my type' vs 'my-type') with a deterministic hash suffix. */
INSERT INTO __mj."ConversationType" ("Name", "Code", "Description")
SELECT
    ranked."CleanName",
    CASE
        WHEN ranked."CodeSeq" = 1 THEN ranked."BaseCode"
        ELSE LEFT(ranked."BaseCode", 41) || '_' ||
             UPPER(SUBSTRING(ENCODE(SHA256(CONVERT_TO(LOWER(ranked."CleanName"), 'UTF8')), 'hex') FROM 1 FOR 8))
    END,
    'Migrated from legacy Conversation.Type value.'
FROM (
    SELECT
        src."CleanName",
        src."BaseCode",
        ROW_NUMBER() OVER (PARTITION BY src."BaseCode" ORDER BY src."CleanName") AS "CodeSeq"
    FROM (
        SELECT DISTINCT
            BTRIM(c."Type") AS "CleanName",
            LEFT(UPPER(REPLACE(REPLACE(BTRIM(c."Type"), ' ', '_'), '-', '_')), 50) AS "BaseCode"
        FROM __mj."Conversation" AS c
        WHERE c."Type" IS NOT NULL
          AND BTRIM(c."Type") <> ''
    ) AS src
    LEFT OUTER JOIN __mj."ConversationType" AS "existingByName"
        ON LOWER("existingByName"."Name") = LOWER(src."CleanName")
    LEFT OUTER JOIN __mj."ConversationType" AS "existingByCode"
        ON UPPER("existingByCode"."Code") = src."BaseCode"
    WHERE "existingByName"."ID" IS NULL
      AND "existingByCode"."ID" IS NULL
) AS ranked;

/* 2. Alter Conversation: add TypeID, backfill, drop physical Type, add composite index */
-- Flush pending deferred trigger events from prior DML so the ALTERs below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE __mj."Conversation" ADD COLUMN "TypeID" UUID NULL;

UPDATE __mj."Conversation" AS tgt
SET "TypeID" = m."NewTypeID"
FROM (
    SELECT
        c."ID",
        CASE
            WHEN c."AnchorType" IS NOT NULL THEN '17E6A105-AE51-43A2-9D56-290BC8D1D6BB'::uuid
            ELSE COALESCE("ctByName"."ID", "ctByCode"."ID", '7F81FF57-C5A8-464D-B3B4-35A4FCF10717'::uuid)
        END AS "NewTypeID"
    FROM __mj."Conversation" AS c
    LEFT OUTER JOIN __mj."ConversationType" AS "ctByName"
        ON LOWER("ctByName"."Name") = LOWER(BTRIM(c."Type"))
    LEFT OUTER JOIN __mj."ConversationType" AS "ctByCode"
        ON UPPER("ctByCode"."Code") = LEFT(UPPER(REPLACE(REPLACE(BTRIM(c."Type"), ' ', '_'), '-', '_')), 50)
) AS m
WHERE m."ID" = tgt."ID";

SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE __mj."Conversation" ALTER COLUMN "TypeID" SET NOT NULL;

ALTER TABLE __mj."Conversation" ALTER COLUMN "TypeID" SET DEFAULT '7F81FF57-C5A8-464D-B3B4-35A4FCF10717';

ALTER TABLE __mj."Conversation"
    ADD CONSTRAINT "FK_Conversation_ConversationType" FOREIGN KEY ("TypeID")
        REFERENCES __mj."ConversationType" ("ID");

DROP VIEW IF EXISTS __mj."vwConversations" CASCADE;

ALTER TABLE __mj."Conversation" DROP COLUMN "Type";

CREATE INDEX "IDX_Conversation_LinkedRecord_Anchor_Type"
    ON __mj."Conversation" ("LinkedEntityID", "LinkedRecordID", "AnchorType", "TypeID");

/* f. Conversation.Type is now the virtual display field of TypeID (see banner, point f). */
UPDATE __mj."EntityField"
SET "IsVirtual" = TRUE,
    "AllowUpdateAPI" = FALSE
WHERE "EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6' /* MJ: Conversations */
  AND "Name" = 'Type'
  AND "IsVirtual" = FALSE;


/* ------------------------------------------------------------------------------------- */
/* 3. CommentType */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."CommentType" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "Name" VARCHAR(100) NOT NULL,
  "Code" VARCHAR(50) NOT NULL,
  "Description" TEXT NULL,
  "ExtensionEntity" VARCHAR(255) NULL,
  "DriverClass" VARCHAR(255) NULL,
  "UIDriverClass" VARCHAR(255) NULL,
  "AllowedAnchorTypes" TEXT NULL,
  CONSTRAINT "PK_CommentType" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_CommentType_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "UQ_CommentType_Code" UNIQUE (
    "Code"
  )
);

INSERT INTO __mj."CommentType" (
  "ID",
  "Name",
  "Code",
  "Description",
  "ExtensionEntity",
  "DriverClass",
  "UIDriverClass",
  "AllowedAnchorTypes"
)
VALUES
  (
    '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8',
    'Comment',
    'COMMENT',
    'Plain discussion note or comment thread anchored to a record, field, section, group, contribution, or artifact.',
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    '8918DBA5-EDDD-4AF4-A518-FEB387ED02F9',
    'Field Suggestion',
    'FIELD_SUGGESTION',
    'Proposed value for a specific field on a record, with source provenance, confidence, and Accept / Reject / Discuss workflow.',
    'MJ: Field Suggestions',
    'FieldSuggestionCommentDriver',
    'FieldSuggestionCardComponent',
    '["Field"]'
  );

/* ------------------------------------------------------------------------------------- */
/* 4. Comment (IS-A Conversation) */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."Comment" (
  "ID" UUID NOT NULL,
  "CommentTypeID" UUID NOT NULL DEFAULT (
    '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8'
  ),
  CONSTRAINT "PK_Comment" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_Comment_Conversation" FOREIGN KEY ("ID") REFERENCES __mj."Conversation" (
    "ID"
  ),
  CONSTRAINT "FK_Comment_CommentType" FOREIGN KEY ("CommentTypeID") REFERENCES __mj."CommentType" (
    "ID"
  )
);

/* Backfill Comment extension rows for any existing anchored conversations */
INSERT INTO __mj."Comment" (
  "ID",
  "CommentTypeID"
)
SELECT
  "c"."ID",
  '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8'
FROM __mj."Conversation" AS "c"
WHERE
  NOT "c"."AnchorType" IS NULL;

/* ------------------------------------------------------------------------------------- */
/* 5. FieldSuggestion (IS-A Comment) */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."FieldSuggestion" (
  "ID" UUID NOT NULL,
  "SuggestedValue" TEXT NULL,
  "Confidence" DECIMAL(5, 4) NULL,
  "Source" VARCHAR(20) NOT NULL DEFAULT (
    'Agent'
  ),
  "Outcome" VARCHAR(20) NULL,
  "AIPromptRunID" UUID NULL,
  CONSTRAINT "PK_FieldSuggestion" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FieldSuggestion_Comment" FOREIGN KEY ("ID") REFERENCES __mj."Comment" (
    "ID"
  ),
  CONSTRAINT "FK_FieldSuggestion_AIPromptRun" FOREIGN KEY ("AIPromptRunID") REFERENCES __mj."AIPromptRun" (
    "ID"
  ),
  CONSTRAINT "CK_FieldSuggestion_Source" CHECK ("Source" IN ('LLM', 'Integration', 'Agent', 'Person')),
  CONSTRAINT "CK_FieldSuggestion_Outcome" CHECK ("Outcome" IN ('Accepted', 'Rejected', 'Superseded')),
  CONSTRAINT "CK_FieldSuggestion_Confidence" CHECK ("Confidence" >= 0 AND "Confidence" <= 1)
);

COMMENT ON TABLE __mj."ConversationType" IS 'Lookup table of conversation classifications (Chat, Skip, Routine, Meeting Room, Comment, etc.). Drives IS-A extension entities via ExtensionEntity and server behavior hooks via DriverClass.';

COMMENT ON COLUMN __mj."ConversationType"."Name" IS 'Human-readable display name of the conversation type (exposed on vwConversations as the virtual Type field).';

COMMENT ON COLUMN __mj."ConversationType"."Code" IS 'Stable uppercase programmatic identifier for looking up this conversation type in code (for example CHAT, SKIP, ROUTINE, MEETING_ROOM, COMMENT) without coupling to display names.';

COMMENT ON COLUMN __mj."ConversationType"."Description" IS 'Explanation of when this conversation type is used and how surfaces treat conversations of this type.';

COMMENT ON COLUMN __mj."ConversationType"."ExtensionEntity" IS 'Optional MJ entity name of the declared IS-A child of MJ: Conversations automatically created and loaded for conversations of this type (for example MJ: Comments).';

COMMENT ON COLUMN __mj."ConversationType"."DriverClass" IS 'Optional ClassFactory registration key of a ConversationTypeDriver subclass providing custom validation and save lifecycle behavior for conversations of this type.';

COMMENT ON COLUMN __mj."Conversation"."TypeID" IS 'Foreign key to ConversationType identifying the kind of conversation (defaults to Chat). CodeGen exposes the joined ConversationType.Name as the virtual Type field.';

COMMENT ON TABLE __mj."CommentType" IS 'Lookup table of anchored comment classifications (plain Comment, Field Suggestion, and extensible domain comment types) with optional IS-A extension entity, server driver class, and UI card component.';

COMMENT ON COLUMN __mj."CommentType"."Name" IS 'Human-readable display name of the comment type (for example Comment or Field Suggestion).';

COMMENT ON COLUMN __mj."CommentType"."Code" IS 'Stable uppercase programmatic code for this comment type (for example COMMENT or FIELD_SUGGESTION), referenced in Entity Configuration.Comments.AllowedCommentTypes and driver lookups.';

COMMENT ON COLUMN __mj."CommentType"."Description" IS 'Explanation of this comment type and its collaboration or review workflow.';

COMMENT ON COLUMN __mj."CommentType"."ExtensionEntity" IS 'Optional MJ entity name of the declared IS-A child of MJ: Comments holding structured fields for this comment type (for example MJ: Field Suggestions).';

COMMENT ON COLUMN __mj."CommentType"."DriverClass" IS 'Optional ClassFactory registration key of a CommentTypeDriver subclass implementing server behavior such as OnAccept, OnReject, and OnRecordChanged.';

COMMENT ON COLUMN __mj."CommentType"."UIDriverClass" IS 'Optional ClassFactory registration key of an EntitySubtypeUIDriverBase component used by the Notes & suggestions panel to render cards of this comment type (for example FieldSuggestionCardComponent).';

COMMENT ON COLUMN __mj."CommentType"."AllowedAnchorTypes" IS 'Optional JSON array of Conversation.AnchorType values permitted for this comment type (for example ["Field"] for Field Suggestion). NULL allows all anchor types.';

COMMENT ON TABLE __mj."Comment" IS 'IS-A child extension of Conversation for anchored record, field, section, and artifact comments. Shares Conversation.ID as its primary key and classifies each comment via CommentTypeID.';

COMMENT ON COLUMN __mj."Comment"."CommentTypeID" IS 'Foreign key to CommentType classifying this comment (defaults to plain Comment) and driving its optional IS-A extension entity, server driver, and UI card component.';

COMMENT ON TABLE __mj."FieldSuggestion" IS 'IS-A child extension of Comment representing a proposed value for a specific field on a linked record (AnchorType = Field, AnchorKey = EntityField.Name), with provenance, confidence, outcome, and discussion thread.';

COMMENT ON COLUMN __mj."FieldSuggestion"."SuggestedValue" IS 'Proposed value for the target field serialized as text (or JSON for structured fields). NULL proposes clearing the field.';

COMMENT ON COLUMN __mj."FieldSuggestion"."Confidence" IS 'Optional confidence score between 0.0000 and 1.0000 reported by the model, agent, or integration that proposed the value.';

COMMENT ON COLUMN __mj."FieldSuggestion"."Source" IS 'Origin category of the suggestion: LLM (prompt inference), Integration (external system sync), Agent (autonomous AI agent), or Person (human collaborator).';

COMMENT ON COLUMN __mj."FieldSuggestion"."Outcome" IS 'Terminal disposition of the suggestion: NULL while pending review, Accepted when applied to the record, Rejected when declined by a user, or Superseded when replaced by a newer suggestion or direct field edit. Who closed it and when live on Conversation.ResolvedByUserID and Conversation.ResolvedAt.';

COMMENT ON COLUMN __mj."FieldSuggestion"."AIPromptRunID" IS 'Optional foreign key to AIPromptRun linking an LLM- or agent-generated suggestion to the exact prompt execution that produced it.';

/* ============================================================================= */
/* GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND */
/* Everything below this banner was emitted by `mj codegen` (`CodeGen_Run_*.sql`) */
/* and contains Entity / EntityField metadata inserts, IS-A ParentID & */
/* SubtypeSelector declarations, regenerated base views, spCreate / spUpdate / */
/* spDelete stored procedures, update triggers, permission grants, and extended */
/* properties. If the hand-written DDL above changes, re-run `mj codegen` and */
/* replace this entire generated section. */
/* ============================================================================= */
/* SQL generated to create new entity MJ: Conversation Types */
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
    'c2483d63-b4b3-4297-9282-4f5ec7d085af',
    'MJ: Conversation Types',
    'Conversation Types',
    'Lookup table of conversation classifications (Chat, Skip, Routine, Meeting Room, Comment, etc.). Drives IS-A extension entities via ExtensionEntity and server behavior hooks via DriverClass.',
    NULL,
    'ConversationType',
    'vwConversationTypes',
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
/* SQL generated to add entity MJ: Conversation Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'c2483d63-b4b3-4297-9282-4f5ec7d085af',
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
/* SQL generated to add new permission for entity MJ: Conversation Types for role UI */
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
  CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS UUID),
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
      "EntityID" = CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Conversation Types for role Developer */
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
  CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS UUID),
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
      "EntityID" = CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Conversation Types for role Integration */
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
  CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS UUID),
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
      "EntityID" = CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Comment Types */
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
    '2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe',
    'MJ: Comment Types',
    'Comment Types',
    'Lookup table of anchored comment classifications (plain Comment, Field Suggestion, and extensible domain comment types) with optional IS-A extension entity, server driver class, and UI card component.',
    NULL,
    'CommentType',
    'vwCommentTypes',
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
/* SQL generated to add entity MJ: Comment Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe',
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
/* SQL generated to add new permission for entity MJ: Comment Types for role UI */
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
  CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS UUID),
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
      "EntityID" = CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Comment Types for role Developer */
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
  CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS UUID),
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
      "EntityID" = CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Comment Types for role Integration */
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
  CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS UUID),
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
      "EntityID" = CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Comments */
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
    'b46e1990-487d-45d6-b91e-a77d58ed0229',
    'MJ: Comments',
    'Comments',
    'IS-A child extension of Conversation for anchored record, field, section, and artifact comments. Shares Conversation.ID as its primary key and classifies each comment via CommentTypeID.',
    NULL,
    'Comment',
    'vwComments',
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
/* SQL generated to add entity MJ: Comments to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'b46e1990-487d-45d6-b91e-a77d58ed0229',
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
/* SQL generated to add new permission for entity MJ: Comments for role UI */
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
  CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS UUID),
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
      "EntityID" = CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Comments for role Developer */
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
  CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS UUID),
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
      "EntityID" = CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Comments for role Integration */
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
  CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS UUID),
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
      "EntityID" = CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Field Suggestions */
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
    '02e26617-130c-4a5a-b4d2-76f06f01c6a1',
    'MJ: Field Suggestions',
    'Field Suggestions',
    'IS-A child extension of Comment representing a proposed value for a specific field on a linked record (AnchorType = Field, AnchorKey = EntityField.Name), with provenance, confidence, outcome, and discussion thread.',
    NULL,
    'FieldSuggestion',
    'vwFieldSuggestions',
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
/* SQL generated to add entity MJ: Field Suggestions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '02e26617-130c-4a5a-b4d2-76f06f01c6a1',
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
/* SQL generated to add new permission for entity MJ: Field Suggestions for role UI */
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
  CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS UUID),
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
      "EntityID" = CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Field Suggestions for role Developer */
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
  CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS UUID),
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
      "EntityID" = CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Field Suggestions for role Integration */
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
  CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS UUID),
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
      "EntityID" = CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."CommentType"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.CommentType */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.CommentType */
UPDATE __mj."CommentType" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'CommentType' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CommentType" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."CommentType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."CommentType"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.CommentType */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.CommentType */
UPDATE __mj."CommentType" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'CommentType' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CommentType" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."CommentType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ConversationType"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ConversationType */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ConversationType */
UPDATE __mj."ConversationType" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ConversationType' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ConversationType" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ConversationType"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationType */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationType */
UPDATE __mj."ConversationType" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ConversationType' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ConversationType" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."FieldSuggestion"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.FieldSuggestion */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.FieldSuggestion */
UPDATE __mj."FieldSuggestion" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'FieldSuggestion' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."FieldSuggestion" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."FieldSuggestion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."FieldSuggestion"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.FieldSuggestion */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.FieldSuggestion */
UPDATE __mj."FieldSuggestion" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'FieldSuggestion' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."FieldSuggestion" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."FieldSuggestion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Comment"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.Comment */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.Comment */
UPDATE __mj."Comment" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'Comment' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Comment" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."Comment" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Comment"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.Comment */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.Comment */
UPDATE __mj."Comment" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'Comment' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Comment" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."Comment" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9728c10e-c788-43a4-9e67-fabb88e46be1' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9728c10e-c788-43a4-9e67-fabb88e46be1', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '097f7f7c-44d2-4d4d-b95b-3177b8b57243' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('097f7f7c-44d2-4d4d-b95b-3177b8b57243', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), 'Name', 'Name', 'Human-readable display name of the comment type (for example Comment or Field Suggestion).', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '77c74296-5649-4e5c-a23f-6888b08a9075' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'Code')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('77c74296-5649-4e5c-a23f-6888b08a9075', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), 'Code', 'Code', 'Stable uppercase programmatic code for this comment type (for example COMMENT or FIELD_SUGGESTION), referenced in Entity Configuration.Comments.AllowedCommentTypes and driver lookups.', 'nvarchar', 100, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cde9861f-2798-4e94-9d44-7cd0865e771b' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cde9861f-2798-4e94-9d44-7cd0865e771b', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), 'Description', 'Description', 'Explanation of this comment type and its collaboration or review workflow.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '281fd4ce-8b3e-467d-a4f1-0903af5d4a1c' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'ExtensionEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('281fd4ce-8b3e-467d-a4f1-0903af5d4a1c', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), 'ExtensionEntity', 'Extension Entity', 'Optional MJ entity name of the declared IS-A child of MJ: Comments holding structured fields for this comment type (for example MJ: Field Suggestions).', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1d9c8d64-40f7-42f0-ae34-1f4a88080c12' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'DriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1d9c8d64-40f7-42f0-ae34-1f4a88080c12', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), 'DriverClass', 'Driver Class', 'Optional ClassFactory registration key of a CommentTypeDriver subclass implementing server behavior such as OnAccept, OnReject, and OnRecordChanged.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '74540df4-3226-48aa-86a9-6cb1c0cda60a' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'UIDriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('74540df4-3226-48aa-86a9-6cb1c0cda60a', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), 'UIDriverClass', 'UI Driver Class', 'Optional ClassFactory registration key of an EntitySubtypeUIDriverBase component used by the Notes & suggestions panel to render cards of this comment type (for example FieldSuggestionCardComponent).', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '96099148-77d6-4982-9175-4775bf8779b7' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'AllowedAnchorTypes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('96099148-77d6-4982-9175-4775bf8779b7', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), 'AllowedAnchorTypes', 'Allowed Anchor Types', 'Optional JSON array of Conversation.AnchorType values permitted for this comment type (for example ["Field"] for Field Suggestion). NULL allows all anchor types.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6f7ec804-b1fc-4876-b96e-8213d22dde6a' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6f7ec804-b1fc-4876-b96e-8213d22dde6a', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '73445091-843f-4e0a-b3c1-5593a6022f9e' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('73445091-843f-4e0a-b3c1-5593a6022f9e', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' /* Entity: MJ: Comment Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '776bb1c3-c0ee-4feb-b356-b17ef67a5a3c' OR ("EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('776bb1c3-c0ee-4feb-b356-b17ef67a5a3c', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' /* Entity: MJ: Conversation Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b5bad141-28be-404e-8fd3-71ee08ddcf0b' OR ("EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b5bad141-28be-404e-8fd3-71ee08ddcf0b', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' /* Entity: MJ: Conversation Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'), 'Name', 'Name', 'Human-readable display name of the conversation type (exposed on vwConversations as the virtual Type field).', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8de1bf29-728c-41f5-8589-8c692ad733c2' OR ("EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = 'Code')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8de1bf29-728c-41f5-8589-8c692ad733c2', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' /* Entity: MJ: Conversation Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'), 'Code', 'Code', 'Stable uppercase programmatic identifier for looking up this conversation type in code (for example CHAT, SKIP, ROUTINE, MEETING_ROOM, COMMENT) without coupling to display names.', 'nvarchar', 100, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86dfd3da-6bd3-4454-b30d-fda97842d441' OR ("EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86dfd3da-6bd3-4454-b30d-fda97842d441', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' /* Entity: MJ: Conversation Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'), 'Description', 'Description', 'Explanation of when this conversation type is used and how surfaces treat conversations of this type.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e4350ef1-6633-4612-a4ea-bdf834a02ebb' OR ("EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = 'ExtensionEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e4350ef1-6633-4612-a4ea-bdf834a02ebb', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' /* Entity: MJ: Conversation Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'), 'ExtensionEntity', 'Extension Entity', 'Optional MJ entity name of the declared IS-A child of MJ: Conversations automatically created and loaded for conversations of this type (for example MJ: Comments).', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '26e94e90-1eff-4c64-8443-8f64d7d45917' OR ("EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = 'DriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('26e94e90-1eff-4c64-8443-8f64d7d45917', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' /* Entity: MJ: Conversation Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'), 'DriverClass', 'Driver Class', 'Optional ClassFactory registration key of a ConversationTypeDriver subclass providing custom validation and save lifecycle behavior for conversations of this type.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '951f8f04-2a6e-4dc4-bdae-cbffba5a650b' OR ("EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('951f8f04-2a6e-4dc4-bdae-cbffba5a650b', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' /* Entity: MJ: Conversation Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4bf0d12e-4ca9-4c49-be24-6adbdc46f1ee' OR ("EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4bf0d12e-4ca9-4c49-be24-6adbdc46f1ee', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' /* Entity: MJ: Conversation Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '34120559-280e-43a9-9bd5-63959c192b31' OR ("EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'TypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('34120559-280e-43a9-9bd5-63959c192b31', '13248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Conversations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6'), 'TypeID', 'Type ID', 'Foreign key to ConversationType identifying the kind of conversation (defaults to Chat). CodeGen exposes the joined ConversationType.Name as the virtual Type field.', 'uniqueidentifier', 16, 0, 0, FALSE, '7F81FF57-C5A8-464D-B3B4-35A4FCF10717', FALSE, TRUE, FALSE, FALSE, 'C2483D63-B4B3-4297-9282-4F5EC7D085AF', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9cbccd6a-eba9-437f-8413-b14d97e2470c' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9cbccd6a-eba9-437f-8413-b14d97e2470c', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, FALSE, FALSE, 'B46E1990-487D-45D6-B91E-A77D58ED0229', 'ID', FALSE, FALSE, TRUE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6c58e49-e196-4148-b4a6-be58026cd249' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'SuggestedValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d6c58e49-e196-4148-b4a6-be58026cd249', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'SuggestedValue', 'Suggested Value', 'Proposed value for the target field serialized as text (or JSON for structured fields). NULL proposes clearing the field.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f6d1f394-8df2-4360-b3bc-f7aa11df3801' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'Confidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f6d1f394-8df2-4360-b3bc-f7aa11df3801', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'Confidence', 'Confidence', 'Optional confidence score between 0.0000 and 1.0000 reported by the model, agent, or integration that proposed the value.', 'decimal', 5, 5, 4, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40a7df8e-e415-4b54-a45d-7e1c8c5b9476' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'Source')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('40a7df8e-e415-4b54-a45d-7e1c8c5b9476', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'Source', 'Source', 'Origin category of the suggestion: LLM (prompt inference), Integration (external system sync), Agent (autonomous AI agent), or Person (human collaborator).', 'nvarchar', 40, 0, 0, FALSE, 'Agent', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '191079ee-ef74-4bba-b055-2e03e5ec3d44' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'Outcome')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('191079ee-ef74-4bba-b055-2e03e5ec3d44', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'Outcome', 'Outcome', 'Terminal disposition of the suggestion: NULL while pending review, Accepted when applied to the record, Rejected when declined by a user, or Superseded when replaced by a newer suggestion or direct field edit. Who closed it and when live on Conversation.ResolvedByUserID and Conversation.ResolvedAt.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bc23540c-e14d-4fa7-9d22-34b050cf5403' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'AIPromptRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bc23540c-e14d-4fa7-9d22-34b050cf5403', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'AIPromptRunID', 'AI Prompt Run ID', 'Optional foreign key to AIPromptRun linking an LLM- or agent-generated suggestion to the exact prompt execution that produced it.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58a4bc6f-66f2-40f3-a9f8-1b2ebd0c1697' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58a4bc6f-66f2-40f3-a9f8-1b2ebd0c1697', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '040e559d-c0dd-421a-b132-2893cd036635' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('040e559d-c0dd-421a-b132-2893cd036635', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ecf2ca0f-0b79-4ffb-9a40-626ad3d2de77' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ecf2ca0f-0b79-4ffb-9a40-626ad3d2de77', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, FALSE, FALSE, '13248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '59a76206-93d7-4244-a0a9-a400f7f2da98' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'CommentTypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('59a76206-93d7-4244-a0a9-a400f7f2da98', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'CommentTypeID', 'Comment Type ID', 'Foreign key to CommentType classifying this comment (defaults to plain Comment) and driving its optional IS-A extension entity, server driver, and UI card component.', 'uniqueidentifier', 16, 0, 0, FALSE, '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8', FALSE, TRUE, FALSE, FALSE, '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9a365c90-4881-4471-922d-78fab82f78ca' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9a365c90-4881-4471-922d-78fab82f78ca', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5002620f-db50-4762-99f0-e1d4fb05c39d' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5002620f-db50-4762-99f0-e1d4fb05c39d', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to sync entity unique keys (4 added, 0 updated, 0 removed) */
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'cfe2932d-0a14-4496-9cb0-bf685e814657',
    '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE',
    'UQ_CommentType_Code',
    'Code',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '60da78c9-dcbc-4e1e-980e-0143cbaa02ec',
    '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE',
    'UQ_CommentType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '72b04128-57fc-4c44-b92e-f0265bd48a89',
    'C2483D63-B4B3-4297-9282-4F5EC7D085AF',
    'UQ_ConversationType_Code',
    'Code',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '647fc749-c735-465c-8dea-92b35cb2aab0',
    'C2483D63-B4B3-4297-9282-4F5EC7D085AF',
    'UQ_ConversationType_Name',
    'Name',
    NULL
  );
/* SQL text to insert entity field value with ID ce6bb8b6-2c7f-4276-9159-ab9d74bf4f18 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ce6bb8b6-2c7f-4276-9159-ab9d74bf4f18',
    '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476',
    1,
    'Agent',
    'Agent',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 2b22fa32-a0c3-4f24-8364-417d9ad46580 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '2b22fa32-a0c3-4f24-8364-417d9ad46580',
    '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476',
    2,
    'Integration',
    'Integration',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 1dd7b483-2488-4614-bede-9d05595c69cc */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1dd7b483-2488-4614-bede-9d05595c69cc',
    '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476',
    3,
    'LLM',
    'LLM',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 9ccc285f-2c73-470c-a192-01ec3c37137e */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9ccc285f-2c73-470c-a192-01ec3c37137e',
    '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476',
    4,
    'Person',
    'Person',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 40A7DF8E-E415-4B54-A45D-7E1C8C5B9476 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476';
/* SQL text to insert entity field value with ID a4dac5da-09fe-421d-a879-e0f4ccbcff52 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a4dac5da-09fe-421d-a879-e0f4ccbcff52',
    '191079EE-EF74-4BBA-B055-2E03E5EC3D44',
    1,
    'Accepted',
    'Accepted',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 71d1c742-7f33-4170-8769-092db138b1d6 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '71d1c742-7f33-4170-8769-092db138b1d6',
    '191079EE-EF74-4BBA-B055-2E03E5EC3D44',
    2,
    'Rejected',
    'Rejected',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b5ffb136-f213-4968-8cbc-a89729519388 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b5ffb136-f213-4968-8cbc-a89729519388',
    '191079EE-EF74-4BBA-B055-2E03E5EC3D44',
    3,
    'Superseded',
    'Superseded',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 191079EE-EF74-4BBA-B055-2E03E5EC3D44 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '191079EE-EF74-4BBA-B055-2E03E5EC3D44';
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
/* Create Entity Relationship: MJ: Comment Types -> MJ: Comments (One To Many via CommentTypeID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '639fef7e-ed3e-44f6-b6fc-b37ad59356fc' OR ("EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "RelatedEntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "RelatedEntityJoinField" = 'CommentTypeID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('639fef7e-ed3e-44f6-b6fc-b37ad59356fc', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', 'B46E1990-487D-45D6-B91E-A77D58ED0229', 'CommentTypeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5881c22d-caec-46e7-9297-d6073503efea' OR ("EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "RelatedEntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityJoinField" = 'TypeID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5881c22d-caec-46e7-9297-d6073503efea', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'TypeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '04a69af7-761a-43bb-926e-783eb7bf0ceb' OR ("EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "RelatedEntityJoinField" = 'ID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('04a69af7-761a-43bb-926e-783eb7bf0ceb', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'B46E1990-487D-45D6-B91E-A77D58ED0229', 'ID', 'One To Many', TRUE, TRUE, 12, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5c67ae47-f533-49bb-a8f3-3f8d61fcbf42' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "RelatedEntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "RelatedEntityJoinField" = 'ID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5c67ae47-f533-49bb-a8f3-3f8d61fcbf42', 'B46E1990-487D-45D6-B91E-A77D58ED0229', '02E26617-130C-4A5A-B4D2-76F06F01C6A1', 'ID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '742ad29c-fc5d-4de9-9acc-a7784ea7cc2c' OR ("EntityID" = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND "RelatedEntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "RelatedEntityJoinField" = 'AIPromptRunID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('742ad29c-fc5d-4de9-9acc-a7784ea7cc2c', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '02E26617-130C-4A5A-B4D2-76F06F01C6A1', 'AIPromptRunID', 'One To Many', TRUE, TRUE, 11, NOW(), NOW());
  END IF;
END $$;

/* Set IS-A ParentID for "MJ: Comments" → "MJ: Conversations" */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "ParentID" = '13248F34-2837-EF11-86D4-6045BDEE16E6'
WHERE
  "ID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229';
/* Set IS-A ParentID for "MJ: Field Suggestions" → "MJ: Comments" */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "ParentID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'
WHERE
  "ID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1';
/* Update attributes on "MJ: Conversations" from additionalSchemaInfo */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "SubtypeSelector" = '{"Path": "TypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "TypeID.DriverClass", "BaseClass": "ConversationTypeDriver"}}'
WHERE
  "ID" = '13248F34-2837-EF11-86D4-6045BDEE16E6';
/* Update attributes on "MJ: Comments" from additionalSchemaInfo */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "SubtypeSelector" = '{"Path": "CommentTypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "CommentTypeID.DriverClass", "BaseClass": "CommentTypeDriver"}, "UIDriver": {"Path": "CommentTypeID.UIDriverClass"}}'
WHERE
  "ID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd9f8acbb-e916-4fe3-abec-b124be42ff8d' OR ("EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Type')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d9f8acbb-e916-4fe3-abec-b124be42ff8d', '13248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Conversations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6'), 'Type', 'Type', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b94d8162-7fbc-441f-9843-60ef3a2e57e1' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'CommentTypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b94d8162-7fbc-441f-9843-60ef3a2e57e1', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'CommentTypeID', 'Comment Type ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '31671ef7-03c1-4b33-aca2-4363743b702b' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('31671ef7-03c1-4b33-aca2-4363743b702b', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'UserID', 'User ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0eb5aa9e-3f62-476a-9492-8333099ada59' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'ExternalID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0eb5aa9e-3f62-476a-9492-8333099ada59', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'ExternalID', 'External ID', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03bc315a-9ae2-4996-a1d8-f2b7862358c2' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03bc315a-9ae2-4996-a1d8-f2b7862358c2', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '60973300-2ca8-41c7-a453-fed4e6bc54a2' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('60973300-2ca8-41c7-a453-fed4e6bc54a2', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '332dfb73-abd0-46da-b135-bca7d378ee12' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'IsArchived')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('332dfb73-abd0-46da-b135-bca7d378ee12', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'IsArchived', 'Is Archived', NULL, 'bit', 1, 1, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '42cbb605-c57c-48fd-b783-780d5ebc9b20' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'LinkedEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('42cbb605-c57c-48fd-b783-780d5ebc9b20', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'LinkedEntityID', 'Linked Entity ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '94c36755-effe-4e9b-8f30-84afe0c6442d' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'LinkedRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('94c36755-effe-4e9b-8f30-84afe0c6442d', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'LinkedRecordID', 'Linked Record ID', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c6fc01c-1b24-4170-b88e-0a03734b8174' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'DataContextID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0c6fc01c-1b24-4170-b88e-0a03734b8174', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'DataContextID', 'Data Context ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2b977e33-7325-4684-9acf-881a06a4bba8' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2b977e33-7325-4684-9acf-881a06a4bba8', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'Status', 'Status', NULL, 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aeb5e04d-0ab4-4388-b198-a936643bf14b' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'EnvironmentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aeb5e04d-0ab4-4388-b198-a936643bf14b', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'EnvironmentID', 'Environment ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '951f2723-a5d0-4f52-b772-59ab83c9c366' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'ProjectID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('951f2723-a5d0-4f52-b772-59ab83c9c366', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'ProjectID', 'Project ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4b9aeb23-664c-402a-9a7a-dab0f98349df' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'IsPinned')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b9aeb23-664c-402a-9a7a-dab0f98349df', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'IsPinned', 'Is Pinned', NULL, 'bit', 1, 1, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '43f9cd15-4fe2-4bac-a924-8e81016b221b' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'TestRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('43f9cd15-4fe2-4bac-a924-8e81016b221b', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'TestRunID', 'Test Run ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9e72fb58-563a-494e-bba0-c27336cbd319' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'ApplicationScope')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9e72fb58-563a-494e-bba0-c27336cbd319', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'ApplicationScope', 'Application Scope', NULL, 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '26d2f374-84d6-42eb-8f34-bebeaa8bdc98' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'ApplicationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('26d2f374-84d6-42eb-8f34-bebeaa8bdc98', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'ApplicationID', 'Application ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd447656-3260-48dd-8fcb-096ef3073689' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'DefaultAgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd447656-3260-48dd-8fcb-096ef3073689', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'DefaultAgentID', 'Default Agent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e3ddc5fd-0238-43d7-b19b-3b03094e947a' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'AdditionalData')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e3ddc5fd-0238-43d7-b19b-3b03094e947a', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'AdditionalData', 'Additional Data', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '118d4ffa-e163-4443-9b61-b5ff1cffc261' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'RecordingFileID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('118d4ffa-e163-4443-9b61-b5ff1cffc261', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'RecordingFileID', 'Recording File ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '97299232-eeb8-4b86-bb3f-8e172789b8e5' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'EgressID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('97299232-eeb8-4b86-bb3f-8e172789b8e5', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'EgressID', 'Egress ID', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '16c2b77d-7e8c-41f0-8734-b281a232525d' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'VisitorKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('16c2b77d-7e8c-41f0-8734-b281a232525d', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'VisitorKey', 'Visitor Key', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '822e5493-bcd0-4764-a353-e364f6566e0c' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'LastConversationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('822e5493-bcd0-4764-a353-e364f6566e0c', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'LastConversationID', 'Last Conversation ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4f9b3cf7-f11e-445e-b1c7-11f68bf49008' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'AnchorType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4f9b3cf7-f11e-445e-b1c7-11f68bf49008', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'AnchorType', 'Anchor Type', NULL, 'nvarchar', 60, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15f26c79-054a-4521-ac55-b7181a2aa112' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'AnchorKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('15f26c79-054a-4521-ac55-b7181a2aa112', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'AnchorKey', 'Anchor Key', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f400d164-608a-4941-a5a9-8d6509740d36' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'AnchorMetadata')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f400d164-608a-4941-a5a9-8d6509740d36', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'AnchorMetadata', 'Anchor Metadata', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8bc2540b-e755-4a52-81bf-24cb825be882' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'IsResolved')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8bc2540b-e755-4a52-81bf-24cb825be882', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'IsResolved', 'Is Resolved', NULL, 'bit', 1, 1, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '69a4804f-38cd-4e7e-a864-7e388d8fced6' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'ResolvedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('69a4804f-38cd-4e7e-a864-7e388d8fced6', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'ResolvedByUserID', 'Resolved By User ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e5eaeec3-b57d-449f-b495-67610111dc5d' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'ResolvedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e5eaeec3-b57d-449f-b495-67610111dc5d', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'ResolvedAt', 'Resolved At', NULL, 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4e9fec3b-50d9-4a18-9107-8e15257ff4a6' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'TypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4e9fec3b-50d9-4a18-9107-8e15257ff4a6', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'TypeID', 'Type ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '84fe8a6f-4588-4b2c-9318-32b09d80fb6b' OR ("EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'AIPromptRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('84fe8a6f-4588-4b2c-9318-32b09d80fb6b', '02E26617-130C-4A5A-B4D2-76F06F01C6A1' /* Entity: MJ: Field Suggestions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'), 'AIPromptRun', 'AI Prompt Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '26f885aa-94b1-476f-9d06-5df65d1d60b8' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('26f885aa-94b1-476f-9d06-5df65d1d60b8', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'UserID', 'User ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6a9e05f4-c086-4c5a-9bdd-79e54e155fd9' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'ExternalID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6a9e05f4-c086-4c5a-9bdd-79e54e155fd9', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'ExternalID', 'External ID', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aee74709-406f-43f0-a502-f6d6880ad595' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aee74709-406f-43f0-a502-f6d6880ad595', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'db495b1c-07c5-423c-95f8-945c83ea2890' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('db495b1c-07c5-423c-95f8-945c83ea2890', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86535efb-1bc6-452a-9eff-f3209c3e53b5' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'IsArchived')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86535efb-1bc6-452a-9eff-f3209c3e53b5', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'IsArchived', 'Is Archived', NULL, 'bit', 1, 1, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb94fd0c-1db9-47dd-a342-525c1770288e' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'LinkedEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eb94fd0c-1db9-47dd-a342-525c1770288e', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'LinkedEntityID', 'Linked Entity ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44ffdfd8-e8c8-476d-a39b-0fbf2ba843f4' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'LinkedRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('44ffdfd8-e8c8-476d-a39b-0fbf2ba843f4', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'LinkedRecordID', 'Linked Record ID', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '67987b2c-9876-4010-b3a4-245e64508104' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'DataContextID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('67987b2c-9876-4010-b3a4-245e64508104', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'DataContextID', 'Data Context ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6c9c9d9f-52f0-4a9a-8317-218e8cc66ccc' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6c9c9d9f-52f0-4a9a-8317-218e8cc66ccc', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'Status', 'Status', NULL, 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e090aa13-add1-4fed-8448-ec6e34ac669b' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'EnvironmentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e090aa13-add1-4fed-8448-ec6e34ac669b', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'EnvironmentID', 'Environment ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '98c84a78-d928-44e4-b14d-1bd0345e0e63' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'ProjectID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('98c84a78-d928-44e4-b14d-1bd0345e0e63', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'ProjectID', 'Project ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'daa1e97b-c326-458a-8770-5f1b608928fb' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'IsPinned')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('daa1e97b-c326-458a-8770-5f1b608928fb', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'IsPinned', 'Is Pinned', NULL, 'bit', 1, 1, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a439b0c4-2cd7-42b8-bd24-3015a4bc97a5' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'TestRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a439b0c4-2cd7-42b8-bd24-3015a4bc97a5', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'TestRunID', 'Test Run ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '151d685d-ac88-4fdf-8a4c-e4b951379d1b' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'ApplicationScope')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('151d685d-ac88-4fdf-8a4c-e4b951379d1b', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'ApplicationScope', 'Application Scope', NULL, 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44398d16-4b9e-4684-9e9a-0d2d9635345c' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'ApplicationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('44398d16-4b9e-4684-9e9a-0d2d9635345c', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'ApplicationID', 'Application ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '824ce7e1-0419-4d81-8303-6fc12e88eb94' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'DefaultAgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('824ce7e1-0419-4d81-8303-6fc12e88eb94', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'DefaultAgentID', 'Default Agent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af9b7334-c31b-4bca-94db-c581e2d8565c' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'AdditionalData')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('af9b7334-c31b-4bca-94db-c581e2d8565c', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'AdditionalData', 'Additional Data', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4708ae2e-8041-4ebd-9418-3948a5eb98a8' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'RecordingFileID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4708ae2e-8041-4ebd-9418-3948a5eb98a8', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'RecordingFileID', 'Recording File ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9a4d6e44-7dee-4ae6-b385-3da9325bd45a' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'EgressID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9a4d6e44-7dee-4ae6-b385-3da9325bd45a', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'EgressID', 'Egress ID', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '78c6c069-4108-464e-828c-29140bfbc289' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'VisitorKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('78c6c069-4108-464e-828c-29140bfbc289', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'VisitorKey', 'Visitor Key', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6d323611-7957-404f-b384-8b8185c9b6cb' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'LastConversationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6d323611-7957-404f-b384-8b8185c9b6cb', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'LastConversationID', 'Last Conversation ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8f3abad-a90f-4071-b02a-791e0b5f57c7' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'AnchorType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d8f3abad-a90f-4071-b02a-791e0b5f57c7', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'AnchorType', 'Anchor Type', NULL, 'nvarchar', 60, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '641e0699-4437-4b76-b5c3-aaa75ca1894f' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'AnchorKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('641e0699-4437-4b76-b5c3-aaa75ca1894f', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'AnchorKey', 'Anchor Key', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5aea0e64-fff7-460e-89d3-a2dc211402be' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'AnchorMetadata')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5aea0e64-fff7-460e-89d3-a2dc211402be', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'AnchorMetadata', 'Anchor Metadata', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9667cf57-f598-4f76-815a-695927a2f12b' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'IsResolved')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9667cf57-f598-4f76-815a-695927a2f12b', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'IsResolved', 'Is Resolved', NULL, 'bit', 1, 1, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '24daf18b-16a9-44f5-9445-696d4c6da46f' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'ResolvedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('24daf18b-16a9-44f5-9445-696d4c6da46f', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'ResolvedByUserID', 'Resolved By User ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4635dc3e-99aa-4725-9a9f-c30b3a08e076' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'ResolvedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4635dc3e-99aa-4725-9a9f-c30b3a08e076', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'ResolvedAt', 'Resolved At', NULL, 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ba38aaed-97a9-4cde-8872-1ae1e9fb43a6' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'TypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ba38aaed-97a9-4cde-8872-1ae1e9fb43a6', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'TypeID', 'Type ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '764b7ae0-e92e-4765-989e-ba847c93574d' OR ("EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'CommentType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('764b7ae0-e92e-4765-989e-ba847c93574d', 'B46E1990-487D-45D6-B91E-A77D58ED0229' /* Entity: MJ: Comments */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'), 'CommentType', 'Comment Type', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Update IS-A parent field UserID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '26F885AA-94B1-476F-9D06-5DF65D1D60B8';

/* Update IS-A parent field ExternalID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 1000, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '6A9E05F4-C086-4C5A-9BDD-79E54E155FD9';

/* Update IS-A parent field Name on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 510, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'AEE74709-406F-43F0-A502-F6D6880AD595';

/* Update IS-A parent field Description on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = -1, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'DB495B1C-07C5-423C-95F8-945C83EA2890';

/* Update IS-A parent field IsArchived on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'bit', "Length" = 1, "Precision" = 1, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '86535EFB-1BC6-452A-9EFF-F3209C3E53B5';

/* Update IS-A parent field LinkedEntityID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'EB94FD0C-1DB9-47DD-A342-525C1770288E';

/* Update IS-A parent field LinkedRecordID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 1000, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '44FFDFD8-E8C8-476D-A39B-0FBF2BA843F4';

/* Update IS-A parent field DataContextID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '24248F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '67987B2C-9876-4010-B3A4-245E64508104';

/* Update IS-A parent field Status on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 40, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '6C9C9D9F-52F0-4A9A-8317-218E8CC66CCC';

/* Update IS-A parent field EnvironmentID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '72975471-6AAB-45C6-B58A-3F1115C921C3', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'E090AA13-ADD1-4FED-8448-EC6E34AC669B';

/* Update IS-A parent field ProjectID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '98C84A78-D928-44E4-B14D-1BD0345E0E63';

/* Update IS-A parent field IsPinned on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'bit', "Length" = 1, "Precision" = 1, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'DAA1E97B-C326-458A-8770-5F1B608928FB';

/* Update IS-A parent field TestRunID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'A439B0C4-2CD7-42B8-BD24-3015A4BC97A5';

/* Update IS-A parent field ApplicationScope on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 40, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '151D685D-AC88-4FDF-8A4C-E4B951379D1B';

/* Update IS-A parent field ApplicationID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'E8238F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '44398D16-4B9E-4684-9E9A-0D2D9635345C';

/* Update IS-A parent field DefaultAgentID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '824CE7E1-0419-4D81-8303-6FC12E88EB94';

/* Update IS-A parent field AdditionalData on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = -1, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'AF9B7334-C31B-4BCA-94DB-C581E2D8565C';

/* Update IS-A parent field RecordingFileID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '29248F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '4708AE2E-8041-4EBD-9418-3948A5EB98A8';

/* Update IS-A parent field EgressID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 510, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '9A4D6E44-7DEE-4AE6-B385-3DA9325BD45A';

/* Update IS-A parent field VisitorKey on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 510, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '78C6C069-4108-464E-828C-29140BFBC289';

/* Update IS-A parent field LastConversationID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '6D323611-7957-404F-B384-8B8185C9B6CB';

/* Update IS-A parent field AnchorType on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 60, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'D8F3ABAD-A90F-4071-B02A-791E0B5F57C7';

/* Update IS-A parent field AnchorKey on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 510, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '641E0699-4437-4B76-B5C3-AAA75CA1894F';

/* Update IS-A parent field AnchorMetadata on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = -1, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '5AEA0E64-FFF7-460E-89D3-A2DC211402BE';

/* Update IS-A parent field IsResolved on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'bit', "Length" = 1, "Precision" = 1, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '9667CF57-F598-4F76-815A-695927A2F12B';

/* Update IS-A parent field ResolvedByUserID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '24DAF18B-16A9-44F5-9445-696D4C6DA46F';

/* Update IS-A parent field ResolvedAt on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'datetimeoffset', "Length" = 10, "Precision" = 34, "Scale" = 7, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '4635DC3E-99AA-4725-9A9F-C30B3A08E076';

/* Update IS-A parent field TypeID on MJ: Comments */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'BA38AAED-97A9-4CDE-8872-1AE1E9FB43A6';

/* Update entity timestamp for MJ: Comments after IS-A field sync */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

/* Update IS-A parent field CommentTypeID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'B94D8162-7FBC-441F-9843-60EF3A2E57E1';

/* Update IS-A parent field UserID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '31671EF7-03C1-4B33-ACA2-4363743B702B';

/* Update IS-A parent field ExternalID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 1000, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '0EB5AA9E-3F62-476A-9492-8333099ADA59';

/* Update IS-A parent field Name on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 510, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '03BC315A-9AE2-4996-A1D8-F2B7862358C2';

/* Update IS-A parent field Description on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = -1, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '60973300-2CA8-41C7-A453-FED4E6BC54A2';

/* Update IS-A parent field IsArchived on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'bit', "Length" = 1, "Precision" = 1, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '332DFB73-ABD0-46DA-B135-BCA7D378EE12';

/* Update IS-A parent field LinkedEntityID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '42CBB605-C57C-48FD-B783-780D5EBC9B20';

/* Update IS-A parent field LinkedRecordID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 1000, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '94C36755-EFFE-4E9B-8F30-84AFE0C6442D';

/* Update IS-A parent field DataContextID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '24248F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '0C6FC01C-1B24-4170-B88E-0A03734B8174';

/* Update IS-A parent field Status on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 40, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '2B977E33-7325-4684-9ACF-881A06A4BBA8';

/* Update IS-A parent field EnvironmentID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '72975471-6AAB-45C6-B58A-3F1115C921C3', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'AEB5E04D-0AB4-4388-B198-A936643BF14B';

/* Update IS-A parent field ProjectID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '951F2723-A5D0-4F52-B772-59AB83C9C366';

/* Update IS-A parent field IsPinned on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'bit', "Length" = 1, "Precision" = 1, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '4B9AEB23-664C-402A-9A7A-DAB0F98349DF';

/* Update IS-A parent field TestRunID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '43F9CD15-4FE2-4BAC-A924-8E81016B221B';

/* Update IS-A parent field ApplicationScope on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 40, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '9E72FB58-563A-494E-BBA0-C27336CBD319';

/* Update IS-A parent field ApplicationID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'E8238F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '26D2F374-84D6-42EB-8F34-BEBEAA8BDC98';

/* Update IS-A parent field DefaultAgentID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'FD447656-3260-48DD-8FCB-096EF3073689';

/* Update IS-A parent field AdditionalData on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = -1, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'E3DDC5FD-0238-43D7-B19B-3B03094E947A';

/* Update IS-A parent field RecordingFileID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '29248F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '118D4FFA-E163-4443-9B61-B5FF1CFFC261';

/* Update IS-A parent field EgressID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 510, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '97299232-EEB8-4B86-BB3F-8E172789B8E5';

/* Update IS-A parent field VisitorKey on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 510, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '16C2B77D-7E8C-41F0-8734-B281A232525D';

/* Update IS-A parent field LastConversationID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '822E5493-BCD0-4764-A353-E364F6566E0C';

/* Update IS-A parent field AnchorType on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 60, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '4F9B3CF7-F11E-445E-B1C7-11F68BF49008';

/* Update IS-A parent field AnchorKey on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = 510, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '15F26C79-054A-4521-AC55-B7181A2AA112';

/* Update IS-A parent field AnchorMetadata on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'nvarchar', "Length" = -1, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'F400D164-608A-4941-A5A9-8D6509740D36';

/* Update IS-A parent field IsResolved on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'bit', "Length" = 1, "Precision" = 1, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '8BC2540B-E755-4A52-81BF-24CB825BE882';

/* Update IS-A parent field ResolvedByUserID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '69A4804F-38CD-4E7E-A864-7E388D8FCED6';

/* Update IS-A parent field ResolvedAt on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'datetimeoffset', "Length" = 10, "Precision" = 34, "Scale" = 7, "AllowsNull" = TRUE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = NULL, "RelatedEntityFieldName" = NULL, "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = 'E5EAEEC3-B57D-449F-B495-67610111DC5D';

/* Update IS-A parent field TypeID on MJ: Field Suggestions */
UPDATE __mj."EntityField" SET "IsVirtual" = TRUE, "Type" = 'uniqueidentifier', "Length" = 16, "Precision" = 0, "Scale" = 0, "AllowsNull" = FALSE, "AllowUpdateAPI" = TRUE, "IncludeRelatedEntityNameFieldInBaseView" = FALSE, "RelatedEntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF', "RelatedEntityFieldName" = 'ID', "RelatedEntityDisplayType" = 'Search'
WHERE
  "ID" = '4E9FEC3B-50D9-4A18-9107-8E15257FF4A6';

/* Update entity timestamp for MJ: Field Suggestions after IS-A field sync */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1';

/* Set field properties for entity */
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1D9C8D64-40F7-42F0-AE34-1F4A88080C12'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 2 fields */
/* UPDATE Entity Field Category Info MJ: Conversations.TypeID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Core', "GeneratedFormSection" = 'Category', "DisplayName" = 'Type'
WHERE
  "ID" = '34120559-280E-43A9-9BD5-63959C192B31';
/* UPDATE Entity Field Category Info MJ: Conversations.Type */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Core', "GeneratedFormSection" = 'Category', "DisplayName" = 'Type'
WHERE
  "ID" = 'D9F8ACBB-E916-4FE3-ABEC-B124BE42FF8D';

/* Set categories for 7 fields */
/* UPDATE Entity Field Category Info MJ: Conversation Types.Name */
UPDATE __mj."EntityField" SET "Category" = 'Classification Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B5BAD141-28BE-404E-8FD3-71EE08DDCF0B';
/* UPDATE Entity Field Category Info MJ: Conversation Types.Code */
UPDATE __mj."EntityField" SET "Category" = 'Classification Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8DE1BF29-728C-41F5-8589-8C692AD733C2';
/* UPDATE Entity Field Category Info MJ: Conversation Types.Description */
UPDATE __mj."EntityField" SET "Category" = 'Classification Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '86DFD3DA-6BD3-4454-B30D-FDA97842D441';
/* UPDATE Entity Field Category Info MJ: Conversation Types.ExtensionEntity */
UPDATE __mj."EntityField" SET "Category" = 'Behavior and Extensions', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E4350EF1-6633-4612-A4EA-BDF834A02EBB';
/* UPDATE Entity Field Category Info MJ: Conversation Types.DriverClass */
UPDATE __mj."EntityField" SET "Category" = 'Behavior and Extensions', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '26E94E90-1EFF-4C64-8443-8F64D7D45917';
/* UPDATE Entity Field Category Info MJ: Conversation Types.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '951F8F04-2A6E-4DC4-BDAE-CBFFBA5A650B';
/* UPDATE Entity Field Category Info MJ: Conversation Types.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4BF0D12E-4CA9-4C49-BE24-6ADBDC46F1EE';

/* Set entity icon to fa fa-comments */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-comments', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dfaed207-a8d3-54cd-b545-7e8509471733', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF', 'FieldCategoryInfo', '{
  "Behavior and Extensions": {
    "description": "Configuration for extension entities and custom server behavior drivers",
    "icon": "fa fa-cogs"
  },
  "Classification Details": {
    "description": "Core display name, programmatic code, and description of the conversation type",
    "icon": "fa fa-info-circle"
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
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9b7948f7-96b8-518e-a72b-455b44c90aac', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF', 'FieldCategoryIcons', '{
  "Behavior and Extensions": "fa fa-cogs",
  "Classification Details": "fa fa-info-circle",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF';

/* Set categories for 10 fields */
/* UPDATE Entity Field Category Info MJ: Comment Types.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9728C10E-C788-43A4-9E67-FABB88E46BE1';
/* UPDATE Entity Field Category Info MJ: Comment Types.Name */
UPDATE __mj."EntityField" SET "Category" = 'Comment Type Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '097F7F7C-44D2-4D4D-B95B-3177B8B57243';
/* UPDATE Entity Field Category Info MJ: Comment Types.Code */
UPDATE __mj."EntityField" SET "Category" = 'Comment Type Details', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '77C74296-5649-4E5C-A23F-6888B08A9075';
/* UPDATE Entity Field Category Info MJ: Comment Types.Description */
UPDATE __mj."EntityField" SET "Category" = 'Comment Type Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CDE9861F-2798-4E94-9D44-7CD0865E771B';
/* UPDATE Entity Field Category Info MJ: Comment Types.ExtensionEntity */
UPDATE __mj."EntityField" SET "Category" = 'Configuration and Drivers', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '281FD4CE-8B3E-467D-A4F1-0903AF5D4A1C';
/* UPDATE Entity Field Category Info MJ: Comment Types.DriverClass */
UPDATE __mj."EntityField" SET "Category" = 'Configuration and Drivers', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1D9C8D64-40F7-42F0-AE34-1F4A88080C12';
/* UPDATE Entity Field Category Info MJ: Comment Types.UIDriverClass */
UPDATE __mj."EntityField" SET "Category" = 'Configuration and Drivers', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '74540DF4-3226-48AA-86A9-6CB1C0CDA60A';
/* UPDATE Entity Field Category Info MJ: Comment Types.AllowedAnchorTypes */
UPDATE __mj."EntityField" SET "Category" = 'Configuration and Drivers', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '96099148-77D6-4982-9175-4775BF8779B7';
/* UPDATE Entity Field Category Info MJ: Comment Types.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6F7EC804-B1FC-4876-B96E-8213D22DDE6A';
/* UPDATE Entity Field Category Info MJ: Comment Types.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '73445091-843F-4E0A-B3C1-5593A6022F9E';

/* Set entity icon to fa fa-comments */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-comments', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('53efa2d0-4929-560b-9927-718668c183e4', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', 'FieldCategoryInfo', '{
  "Comment Type Details": {
    "description": "Core identifying information for the comment type",
    "icon": "fa fa-comment"
  },
  "Configuration and Drivers": {
    "description": "Technical configuration, driver classes, and extension definitions",
    "icon": "fa fa-sliders-h"
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
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a1d3b3e8-b56c-56bf-9253-3dd6c32db9be', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', 'FieldCategoryIcons', '{
  "Comment Type Details": "fa fa-comment",
  "Configuration and Drivers": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '6C9C9D9F-52F0-4A9A-8317-218E8CC66CCC'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'DAA1E97B-C326-458A-8770-5F1B608928FB'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '9667CF57-F598-4F76-815A-695927A2F12B'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'AEE74709-406F-43F0-A502-F6D6880AD595'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 38 fields */
/* UPDATE Entity Field Category Info MJ: Field Suggestions.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9CBCCD6A-EBA9-437F-8413-B14D97E2470C';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.SuggestedValue */
UPDATE __mj."EntityField" SET "Category" = 'Suggestion Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D6C58E49-E196-4148-B4A6-BE58026CD249';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.Confidence */
UPDATE __mj."EntityField" SET "Category" = 'Suggestion Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F6D1F394-8DF2-4360-B3BC-F7AA11DF3801';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.Source */
UPDATE __mj."EntityField" SET "Category" = 'Suggestion Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.Outcome */
UPDATE __mj."EntityField" SET "Category" = 'Suggestion Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '191079EE-EF74-4BBA-B055-2E03E5EC3D44';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.AIPromptRunID */
UPDATE __mj."EntityField" SET "Category" = 'Suggestion Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Prompt Run'
WHERE
  "ID" = 'BC23540C-E14D-4FA7-9D22-34B050CF5403';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.AIPromptRun */
UPDATE __mj."EntityField" SET "Category" = 'Suggestion Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Prompt Run Details'
WHERE
  "ID" = '84FE8A6F-4588-4B2C-9318-32B09D80FB6B';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.CommentTypeID */
UPDATE __mj."EntityField" SET "Category" = 'Comment Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Comment Type'
WHERE
  "ID" = 'B94D8162-7FBC-441F-9843-60EF3A2E57E1';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'User'
WHERE
  "ID" = '31671EF7-03C1-4B33-ACA2-4363743B702B';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.ExternalID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0EB5AA9E-3F62-476A-9492-8333099ADA59';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.Name */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '03BC315A-9AE2-4996-A1D8-F2B7862358C2';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.Description */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '60973300-2CA8-41C7-A453-FED4E6BC54A2';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.IsArchived */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '332DFB73-ABD0-46DA-B135-BCA7D378EE12';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.LinkedEntityID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Linked Entity'
WHERE
  "ID" = '42CBB605-C57C-48FD-B783-780D5EBC9B20';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.LinkedRecordID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Linked Record'
WHERE
  "ID" = '94C36755-EFFE-4E9B-8F30-84AFE0C6442D';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.DataContextID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Data Context'
WHERE
  "ID" = '0C6FC01C-1B24-4170-B88E-0A03734B8174';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.Status */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2B977E33-7325-4684-9ACF-881A06A4BBA8';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.EnvironmentID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Environment'
WHERE
  "ID" = 'AEB5E04D-0AB4-4388-B198-A936643BF14B';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.ProjectID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Project'
WHERE
  "ID" = '951F2723-A5D0-4F52-B772-59AB83C9C366';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.IsPinned */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4B9AEB23-664C-402A-9A7A-DAB0F98349DF';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.TestRunID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Test Run'
WHERE
  "ID" = '43F9CD15-4FE2-4BAC-A924-8E81016B221B';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.ApplicationScope */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9E72FB58-563A-494E-BBA0-C27336CBD319';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.ApplicationID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Application'
WHERE
  "ID" = '26D2F374-84D6-42EB-8F34-BEBEAA8BDC98';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.DefaultAgentID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Default Agent'
WHERE
  "ID" = 'FD447656-3260-48DD-8FCB-096EF3073689';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.AdditionalData */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'E3DDC5FD-0238-43D7-B19B-3B03094E947A';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.RecordingFileID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Recording File'
WHERE
  "ID" = '118D4FFA-E163-4443-9B61-B5FF1CFFC261';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.EgressID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '97299232-EEB8-4B86-BB3F-8E172789B8E5';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.VisitorKey */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '16C2B77D-7E8C-41F0-8734-B281A232525D';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.LastConversationID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Last Conversation'
WHERE
  "ID" = '822E5493-BCD0-4764-A353-E364F6566E0C';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.AnchorType */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4F9B3CF7-F11E-445E-B1C7-11F68BF49008';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.AnchorKey */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '15F26C79-054A-4521-AC55-B7181A2AA112';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.AnchorMetadata */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F400D164-608A-4941-A5A9-8D6509740D36';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.IsResolved */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8BC2540B-E755-4A52-81BF-24CB825BE882';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.ResolvedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Resolved By User'
WHERE
  "ID" = '69A4804F-38CD-4E7E-A864-7E388D8FCED6';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.ResolvedAt */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E5EAEEC3-B57D-449F-B495-67610111DC5D';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.TypeID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Type'
WHERE
  "ID" = '4E9FEC3B-50D9-4A18-9107-8E15257FF4A6';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '58A4BC6F-66F2-40F3-A9F8-1B2EBD0C1697';
/* UPDATE Entity Field Category Info MJ: Field Suggestions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '040E559D-C0DD-421A-B132-2893CD036635';

/* Set entity icon to fa fa-comment-dots */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-comment-dots', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2d83715e-173d-5b6b-ae27-88996f36d0d1', '02E26617-130C-4A5A-B4D2-76F06F01C6A1', 'FieldCategoryInfo', '{
  "Comment Details": {
    "description": "Fields inherited from the MJ: Comments entity",
    "icon": "fa fa-comment",
    "inheritedFromEntityID": "B46E1990-487D-45D6-B91E-A77D58ED0229",
    "inheritedFromEntityName": "MJ: Comments"
  },
  "Conversation Details": {
    "description": "Fields inherited from the MJ: Conversations entity",
    "icon": "fa fa-comments",
    "inheritedFromEntityID": "13248F34-2837-EF11-86D4-6045BDEE16E6",
    "inheritedFromEntityName": "MJ: Conversations"
  },
  "Suggestion Details": {
    "description": "Specific details, confidence scores, and provenance for the field suggestion",
    "icon": "fa fa-lightbulb"
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
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1c1a2cd7-35be-527f-a1f8-c30dfcdf9892', '02E26617-130C-4A5A-B4D2-76F06F01C6A1', 'FieldCategoryIcons', '{
  "Comment Details": "fa fa-comment",
  "Conversation Details": "fa fa-comments",
  "Suggestion Details": "fa fa-lightbulb",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '02E26617-130C-4A5A-B4D2-76F06F01C6A1';

/* Set categories for 33 fields */
/* UPDATE Entity Field Category Info MJ: Comments.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'ECF2CA0F-0B79-4FFB-9A40-626AD3D2DE77';
/* UPDATE Entity Field Category Info MJ: Comments.CommentTypeID */
UPDATE __mj."EntityField" SET "Category" = 'Comment Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Comment Type'
WHERE
  "ID" = '59A76206-93D7-4244-A0A9-A400F7F2DA98';
/* UPDATE Entity Field Category Info MJ: Comments.CommentType */
UPDATE __mj."EntityField" SET "Category" = 'Comment Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Comment Type Name'
WHERE
  "ID" = '764B7AE0-E92E-4765-989E-BA847C93574D';
/* UPDATE Entity Field Category Info MJ: Comments.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9A365C90-4881-4471-922D-78FAB82F78CA';
/* UPDATE Entity Field Category Info MJ: Comments.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5002620F-DB50-4762-99F0-E1D4FB05C39D';
/* UPDATE Entity Field Category Info MJ: Comments.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'User'
WHERE
  "ID" = '26F885AA-94B1-476F-9D06-5DF65D1D60B8';
/* UPDATE Entity Field Category Info MJ: Comments.ExternalID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6A9E05F4-C086-4C5A-9BDD-79E54E155FD9';
/* UPDATE Entity Field Category Info MJ: Comments.Name */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AEE74709-406F-43F0-A502-F6D6880AD595';
/* UPDATE Entity Field Category Info MJ: Comments.Description */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DB495B1C-07C5-423C-95F8-945C83EA2890';
/* UPDATE Entity Field Category Info MJ: Comments.IsArchived */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '86535EFB-1BC6-452A-9EFF-F3209C3E53B5';
/* UPDATE Entity Field Category Info MJ: Comments.LinkedEntityID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Linked Entity'
WHERE
  "ID" = 'EB94FD0C-1DB9-47DD-A342-525C1770288E';
/* UPDATE Entity Field Category Info MJ: Comments.LinkedRecordID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Linked Record'
WHERE
  "ID" = '44FFDFD8-E8C8-476D-A39B-0FBF2BA843F4';
/* UPDATE Entity Field Category Info MJ: Comments.DataContextID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Data Context'
WHERE
  "ID" = '67987B2C-9876-4010-B3A4-245E64508104';
/* UPDATE Entity Field Category Info MJ: Comments.Status */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6C9C9D9F-52F0-4A9A-8317-218E8CC66CCC';
/* UPDATE Entity Field Category Info MJ: Comments.EnvironmentID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Environment'
WHERE
  "ID" = 'E090AA13-ADD1-4FED-8448-EC6E34AC669B';
/* UPDATE Entity Field Category Info MJ: Comments.ProjectID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Project'
WHERE
  "ID" = '98C84A78-D928-44E4-B14D-1BD0345E0E63';
/* UPDATE Entity Field Category Info MJ: Comments.IsPinned */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DAA1E97B-C326-458A-8770-5F1B608928FB';
/* UPDATE Entity Field Category Info MJ: Comments.TestRunID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Test Run'
WHERE
  "ID" = 'A439B0C4-2CD7-42B8-BD24-3015A4BC97A5';
/* UPDATE Entity Field Category Info MJ: Comments.ApplicationScope */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '151D685D-AC88-4FDF-8A4C-E4B951379D1B';
/* UPDATE Entity Field Category Info MJ: Comments.ApplicationID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Application'
WHERE
  "ID" = '44398D16-4B9E-4684-9E9A-0D2D9635345C';
/* UPDATE Entity Field Category Info MJ: Comments.DefaultAgentID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Default Agent'
WHERE
  "ID" = '824CE7E1-0419-4D81-8303-6FC12E88EB94';
/* UPDATE Entity Field Category Info MJ: Comments.AdditionalData */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'AF9B7334-C31B-4BCA-94DB-C581E2D8565C';
/* UPDATE Entity Field Category Info MJ: Comments.RecordingFileID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Recording File'
WHERE
  "ID" = '4708AE2E-8041-4EBD-9418-3948A5EB98A8';
/* UPDATE Entity Field Category Info MJ: Comments.EgressID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9A4D6E44-7DEE-4AE6-B385-3DA9325BD45A';
/* UPDATE Entity Field Category Info MJ: Comments.VisitorKey */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '78C6C069-4108-464E-828C-29140BFBC289';
/* UPDATE Entity Field Category Info MJ: Comments.LastConversationID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Last Conversation'
WHERE
  "ID" = '6D323611-7957-404F-B384-8B8185C9B6CB';
/* UPDATE Entity Field Category Info MJ: Comments.AnchorType */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D8F3ABAD-A90F-4071-B02A-791E0B5F57C7';
/* UPDATE Entity Field Category Info MJ: Comments.AnchorKey */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '641E0699-4437-4B76-B5C3-AAA75CA1894F';
/* UPDATE Entity Field Category Info MJ: Comments.AnchorMetadata */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '5AEA0E64-FFF7-460E-89D3-A2DC211402BE';
/* UPDATE Entity Field Category Info MJ: Comments.IsResolved */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9667CF57-F598-4F76-815A-695927A2F12B';
/* UPDATE Entity Field Category Info MJ: Comments.ResolvedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Resolved By User'
WHERE
  "ID" = '24DAF18B-16A9-44F5-9445-696D4C6DA46F';
/* UPDATE Entity Field Category Info MJ: Comments.ResolvedAt */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4635DC3E-99AA-4725-9A9F-C30B3A08E076';
/* UPDATE Entity Field Category Info MJ: Comments.TypeID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Type'
WHERE
  "ID" = 'BA38AAED-97A9-4CDE-8872-1AE1E9FB43A6';

/* Set entity icon to fa fa-comments */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-comments', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('714c0b0d-0af5-53c9-b2be-4017aae28cb4', 'B46E1990-487D-45D6-B91E-A77D58ED0229', 'FieldCategoryInfo', '{
  "Comment Details": {
    "description": "Specific classification and properties of the comment record",
    "icon": "fa fa-comment"
  },
  "Conversation Details": {
    "description": "Fields inherited from the MJ: Conversations parent entity",
    "icon": "fa fa-comments",
    "inheritedFromEntityID": "13248F34-2837-EF11-86D4-6045BDEE16E6",
    "inheritedFromEntityName": "MJ: Conversations"
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
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e2ffe388-8cfc-5f17-93f6-dbcda3f68d59', 'B46E1990-487D-45D6-B91E-A77D58ED0229', 'FieldCategoryIcons', '{
  "Comment Details": "fa fa-comment",
  "Conversation Details": "fa fa-comments",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comment Types
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comment Types
-- Item: vwCommentTypes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Comment Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  CommentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwCommentTypes"
AS
SELECT
    c.*
FROM
    "__mj"."CommentType" AS c
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
        AND tc.relname = 'vwCommentTypes'
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
                           AND tc.relname = 'vwCommentTypes'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwCommentTypes" CASCADE;
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
GRANT SELECT ON "__mj"."vwCommentTypes" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCommentTypes" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwCommentTypes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comment Types
-- Item: spCreateCommentType
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CommentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCommentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCommentType"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_code varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_extensionentity_clear boolean DEFAULT false,
    p_extensionentity varchar(255) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(255) DEFAULT NULL,
    p_uidriverclass_clear boolean DEFAULT false,
    p_uidriverclass varchar(255) DEFAULT NULL,
    p_allowedanchortypes_clear boolean DEFAULT false,
    p_allowedanchortypes TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwCommentTypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CommentType"
        (
            "ID",
            "Name",
                "Code",
                "Description",
                "ExtensionEntity",
                "DriverClass",
                "UIDriverClass",
                "AllowedAnchorTypes"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_code,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_extensionentity_clear = true THEN NULL ELSE COALESCE(p_extensionentity, NULL) END,
                CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, NULL) END,
                CASE WHEN p_uidriverclass_clear = true THEN NULL ELSE COALESCE(p_uidriverclass, NULL) END,
                CASE WHEN p_allowedanchortypes_clear = true THEN NULL ELSE COALESCE(p_allowedanchortypes, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCommentTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCommentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCommentType" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comment Types
-- Item: spUpdateCommentType
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CommentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCommentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCommentType"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_code varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_extensionentity_clear boolean DEFAULT false,
    p_extensionentity varchar(255) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(255) DEFAULT NULL,
    p_uidriverclass_clear boolean DEFAULT false,
    p_uidriverclass varchar(255) DEFAULT NULL,
    p_allowedanchortypes_clear boolean DEFAULT false,
    p_allowedanchortypes TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwCommentTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CommentType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Code" = COALESCE(p_code, "Code"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ExtensionEntity" = CASE WHEN p_extensionentity_clear = true THEN NULL ELSE COALESCE(p_extensionentity, "ExtensionEntity") END,
        "DriverClass" = CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, "DriverClass") END,
        "UIDriverClass" = CASE WHEN p_uidriverclass_clear = true THEN NULL ELSE COALESCE(p_uidriverclass, "UIDriverClass") END,
        "AllowedAnchorTypes" = CASE WHEN p_allowedanchortypes_clear = true THEN NULL ELSE COALESCE(p_allowedanchortypes, "AllowedAnchorTypes") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCommentTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCommentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCommentType" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommentType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_comment_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_comment_type" ON "__mj"."CommentType";

CREATE TRIGGER "trg_update_comment_type"
BEFORE UPDATE ON "__mj"."CommentType"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_comment_type"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comment Types
-- Item: spDeleteCommentType
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CommentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCommentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCommentType"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CommentType"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCommentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCommentType" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comments
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_comment_comment_type_id"
    ON "__mj"."Comment" ("CommentTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comments
-- Item: vwComments
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Comments
-----               SCHEMA:      __mj
-----               BASE TABLE:  Comment
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwComments"
AS
SELECT
    c.*,
    __mj_isa_p1."UserID",
    __mj_isa_p1."ExternalID",
    __mj_isa_p1."Name",
    __mj_isa_p1."Description",
    __mj_isa_p1."IsArchived",
    __mj_isa_p1."LinkedEntityID",
    __mj_isa_p1."LinkedRecordID",
    __mj_isa_p1."DataContextID",
    __mj_isa_p1."Status",
    __mj_isa_p1."EnvironmentID",
    __mj_isa_p1."ProjectID",
    __mj_isa_p1."IsPinned",
    __mj_isa_p1."TestRunID",
    __mj_isa_p1."ApplicationScope",
    __mj_isa_p1."ApplicationID",
    __mj_isa_p1."DefaultAgentID",
    __mj_isa_p1."AdditionalData",
    __mj_isa_p1."RecordingFileID",
    __mj_isa_p1."EgressID",
    __mj_isa_p1."VisitorKey",
    __mj_isa_p1."LastConversationID",
    __mj_isa_p1."AnchorType",
    __mj_isa_p1."AnchorKey",
    __mj_isa_p1."AnchorMetadata",
    __mj_isa_p1."IsResolved",
    __mj_isa_p1."ResolvedByUserID",
    __mj_isa_p1."ResolvedAt",
    __mj_isa_p1."TypeID",
    MJCommentType_CommentTypeID."Name" AS "CommentType"
FROM
    "__mj"."Comment" AS c
INNER JOIN
    "__mj"."Conversation" AS __mj_isa_p1
  ON
    "c"."ID" = __mj_isa_p1."ID"
LEFT OUTER JOIN
    "__mj"."CommentType" AS MJCommentType_CommentTypeID
  ON
    "c"."CommentTypeID" = MJCommentType_CommentTypeID."ID"
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
        AND tc.relname = 'vwComments'
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
                           AND tc.relname = 'vwComments'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwComments" CASCADE;
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
GRANT SELECT ON "__mj"."vwComments" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwComments" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwComments" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comments
-- Item: spCreateComment
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Comment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateComment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateComment"(
    p_id UUID DEFAULT NULL,
    p_commenttypeid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwComments" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Comment"
        (
            "ID",
            "CommentTypeID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_commenttypeid = '00000000-0000-0000-0000-000000000000'::UUID THEN '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8' ELSE COALESCE(p_commenttypeid, '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8') END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwComments"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateComment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateComment" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comments
-- Item: spUpdateComment
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Comment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateComment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateComment"(
    p_id UUID,
    p_commenttypeid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwComments" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Comment"
    SET
        "CommentTypeID" = COALESCE(p_commenttypeid, "CommentTypeID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwComments"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateComment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateComment" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Comment table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_comment"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_comment" ON "__mj"."Comment";

CREATE TRIGGER "trg_update_comment"
BEFORE UPDATE ON "__mj"."Comment"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_comment"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Comments
-- Item: spDeleteComment
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Comment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteComment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteComment"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Comment"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteComment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteComment" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Types
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Types
-- Item: vwConversationTypes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwConversationTypes"
AS
SELECT
    c.*
FROM
    "__mj"."ConversationType" AS c
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
        AND tc.relname = 'vwConversationTypes'
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
                           AND tc.relname = 'vwConversationTypes'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwConversationTypes" CASCADE;
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
GRANT SELECT ON "__mj"."vwConversationTypes" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwConversationTypes" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwConversationTypes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Types
-- Item: spCreateConversationType
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateConversationType"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_code varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_extensionentity_clear boolean DEFAULT false,
    p_extensionentity varchar(255) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(255) DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationTypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ConversationType"
        (
            "ID",
            "Name",
                "Code",
                "Description",
                "ExtensionEntity",
                "DriverClass"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_code,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_extensionentity_clear = true THEN NULL ELSE COALESCE(p_extensionentity, NULL) END,
                CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwConversationTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationType" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Types
-- Item: spUpdateConversationType
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateConversationType"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_code varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_extensionentity_clear boolean DEFAULT false,
    p_extensionentity varchar(255) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(255) DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ConversationType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Code" = COALESCE(p_code, "Code"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ExtensionEntity" = CASE WHEN p_extensionentity_clear = true THEN NULL ELSE COALESCE(p_extensionentity, "ExtensionEntity") END,
        "DriverClass" = CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, "DriverClass") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwConversationTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationType" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_conversation_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_type" ON "__mj"."ConversationType";

CREATE TRIGGER "trg_update_conversation_type"
BEFORE UPDATE ON "__mj"."ConversationType"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_conversation_type"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Types
-- Item: spDeleteConversationType
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteConversationType"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ConversationType"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationType" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_organic_key_entity_id"
    ON "__mj"."EntityOrganicKey" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: vwEntityOrganicKeys
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Organic Keys
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityOrganicKey
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwEntityOrganicKeys"
AS
SELECT
    e.*,
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."EntityOrganicKey" AS e
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
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
        AND tc.relname = 'vwEntityOrganicKeys'
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
                           AND tc.relname = 'vwEntityOrganicKeys'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwEntityOrganicKeys" CASCADE;
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
GRANT SELECT ON "__mj"."vwEntityOrganicKeys" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwEntityOrganicKeys" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntityOrganicKeys" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: spCreateEntityOrganicKey
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityOrganicKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityOrganicKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityOrganicKey"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_matchfieldnames varchar(500) DEFAULT NULL,
    p_normalizationstrategy varchar(50) DEFAULT NULL,
    p_customnormalizationexpression_clear boolean DEFAULT false,
    p_customnormalizationexpression TEXT DEFAULT NULL,
    p_autocreaterelatedviewonform BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityOrganicKeys" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityOrganicKey"
        (
            "ID",
            "EntityID",
                "Name",
                "Description",
                "MatchFieldNames",
                "NormalizationStrategy",
                "CustomNormalizationExpression",
                "AutoCreateRelatedViewOnForm",
                "Sequence",
                "Status",
                "Source"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_matchfieldnames,
                COALESCE(p_normalizationstrategy, 'LowerCaseTrim'),
                CASE WHEN p_customnormalizationexpression_clear = true THEN NULL ELSE COALESCE(p_customnormalizationexpression, NULL) END,
                COALESCE(p_autocreaterelatedviewonform, FALSE),
                COALESCE(p_sequence, 0),
                COALESCE(p_status, 'Active'),
                COALESCE(p_source, 'Manual')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityOrganicKeys"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityOrganicKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityOrganicKey" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: spUpdateEntityOrganicKey
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityOrganicKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityOrganicKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityOrganicKey"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_matchfieldnames varchar(500) DEFAULT NULL,
    p_normalizationstrategy varchar(50) DEFAULT NULL,
    p_customnormalizationexpression_clear boolean DEFAULT false,
    p_customnormalizationexpression TEXT DEFAULT NULL,
    p_autocreaterelatedviewonform BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityOrganicKeys" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityOrganicKey"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "MatchFieldNames" = COALESCE(p_matchfieldnames, "MatchFieldNames"),
        "NormalizationStrategy" = COALESCE(p_normalizationstrategy, "NormalizationStrategy"),
        "CustomNormalizationExpression" = CASE WHEN p_customnormalizationexpression_clear = true THEN NULL ELSE COALESCE(p_customnormalizationexpression, "CustomNormalizationExpression") END,
        "AutoCreateRelatedViewOnForm" = COALESCE(p_autocreaterelatedviewonform, "AutoCreateRelatedViewOnForm"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Status" = COALESCE(p_status, "Status"),
        "Source" = COALESCE(p_source, "Source")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityOrganicKeys"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityOrganicKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityOrganicKey" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityOrganicKey table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_organic_key"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_organic_key" ON "__mj"."EntityOrganicKey";

CREATE TRIGGER "trg_update_entity_organic_key"
BEFORE UPDATE ON "__mj"."EntityOrganicKey"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_organic_key"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: spDeleteEntityOrganicKey
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityOrganicKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityOrganicKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityOrganicKey"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityOrganicKey"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityOrganicKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityOrganicKey" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Field Suggestions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_field_suggestion_ai_prompt_run_id"
    ON "__mj"."FieldSuggestion" ("AIPromptRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Field Suggestions
-- Item: vwFieldSuggestions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Field Suggestions
-----               SCHEMA:      __mj
-----               BASE TABLE:  FieldSuggestion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwFieldSuggestions"
AS
SELECT
    f.*,
    __mj_isa_p1."CommentTypeID",
    __mj_isa_p2."UserID",
    __mj_isa_p2."ExternalID",
    __mj_isa_p2."Name",
    __mj_isa_p2."Description",
    __mj_isa_p2."IsArchived",
    __mj_isa_p2."LinkedEntityID",
    __mj_isa_p2."LinkedRecordID",
    __mj_isa_p2."DataContextID",
    __mj_isa_p2."Status",
    __mj_isa_p2."EnvironmentID",
    __mj_isa_p2."ProjectID",
    __mj_isa_p2."IsPinned",
    __mj_isa_p2."TestRunID",
    __mj_isa_p2."ApplicationScope",
    __mj_isa_p2."ApplicationID",
    __mj_isa_p2."DefaultAgentID",
    __mj_isa_p2."AdditionalData",
    __mj_isa_p2."RecordingFileID",
    __mj_isa_p2."EgressID",
    __mj_isa_p2."VisitorKey",
    __mj_isa_p2."LastConversationID",
    __mj_isa_p2."AnchorType",
    __mj_isa_p2."AnchorKey",
    __mj_isa_p2."AnchorMetadata",
    __mj_isa_p2."IsResolved",
    __mj_isa_p2."ResolvedByUserID",
    __mj_isa_p2."ResolvedAt",
    __mj_isa_p2."TypeID",
    MJAIPromptRun_AIPromptRunID."RunName" AS "AIPromptRun"
FROM
    "__mj"."FieldSuggestion" AS f
INNER JOIN
    "__mj"."Comment" AS __mj_isa_p1
  ON
    "f"."ID" = __mj_isa_p1."ID"
INNER JOIN
    "__mj"."Conversation" AS __mj_isa_p2
  ON
    "__mj_isa_p1"."ID" = __mj_isa_p2."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_AIPromptRunID
  ON
    "f"."AIPromptRunID" = MJAIPromptRun_AIPromptRunID."ID"
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
        AND tc.relname = 'vwFieldSuggestions'
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
                           AND tc.relname = 'vwFieldSuggestions'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwFieldSuggestions" CASCADE;
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
GRANT SELECT ON "__mj"."vwFieldSuggestions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwFieldSuggestions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwFieldSuggestions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Field Suggestions
-- Item: spCreateFieldSuggestion
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR FieldSuggestion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateFieldSuggestion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateFieldSuggestion"(
    p_id UUID DEFAULT NULL,
    p_suggestedvalue_clear boolean DEFAULT false,
    p_suggestedvalue TEXT DEFAULT NULL,
    p_confidence_clear boolean DEFAULT false,
    p_confidence decimal(5, 4) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_outcome_clear boolean DEFAULT false,
    p_outcome varchar(20) DEFAULT NULL,
    p_aipromptrunid_clear boolean DEFAULT false,
    p_aipromptrunid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwFieldSuggestions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."FieldSuggestion"
        (
            "ID",
            "SuggestedValue",
                "Confidence",
                "Source",
                "Outcome",
                "AIPromptRunID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_suggestedvalue_clear = true THEN NULL ELSE COALESCE(p_suggestedvalue, NULL) END,
                CASE WHEN p_confidence_clear = true THEN NULL ELSE COALESCE(p_confidence, NULL) END,
                COALESCE(p_source, 'Agent'),
                CASE WHEN p_outcome_clear = true THEN NULL ELSE COALESCE(p_outcome, NULL) END,
                CASE WHEN p_aipromptrunid_clear = true THEN NULL ELSE COALESCE(p_aipromptrunid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwFieldSuggestions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFieldSuggestion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFieldSuggestion" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Field Suggestions
-- Item: spUpdateFieldSuggestion
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR FieldSuggestion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateFieldSuggestion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateFieldSuggestion"(
    p_id UUID,
    p_suggestedvalue_clear boolean DEFAULT false,
    p_suggestedvalue TEXT DEFAULT NULL,
    p_confidence_clear boolean DEFAULT false,
    p_confidence decimal(5, 4) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_outcome_clear boolean DEFAULT false,
    p_outcome varchar(20) DEFAULT NULL,
    p_aipromptrunid_clear boolean DEFAULT false,
    p_aipromptrunid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwFieldSuggestions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."FieldSuggestion"
    SET
        "SuggestedValue" = CASE WHEN p_suggestedvalue_clear = true THEN NULL ELSE COALESCE(p_suggestedvalue, "SuggestedValue") END,
        "Confidence" = CASE WHEN p_confidence_clear = true THEN NULL ELSE COALESCE(p_confidence, "Confidence") END,
        "Source" = COALESCE(p_source, "Source"),
        "Outcome" = CASE WHEN p_outcome_clear = true THEN NULL ELSE COALESCE(p_outcome, "Outcome") END,
        "AIPromptRunID" = CASE WHEN p_aipromptrunid_clear = true THEN NULL ELSE COALESCE(p_aipromptrunid, "AIPromptRunID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwFieldSuggestions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFieldSuggestion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFieldSuggestion" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FieldSuggestion table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_field_suggestion"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_field_suggestion" ON "__mj"."FieldSuggestion";

CREATE TRIGGER "trg_update_field_suggestion"
BEFORE UPDATE ON "__mj"."FieldSuggestion"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_field_suggestion"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Field Suggestions
-- Item: spDeleteFieldSuggestion
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR FieldSuggestion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteFieldSuggestion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteFieldSuggestion"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."FieldSuggestion"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFieldSuggestion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFieldSuggestion" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_usage_type_id"
    ON "__mj"."AIPromptRun" ("UsageTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_prompt_id"
    ON "__mj"."AIPromptRun" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_model_id"
    ON "__mj"."AIPromptRun" ("ModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_vendor_id"
    ON "__mj"."AIPromptRun" ("VendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_agent_id"
    ON "__mj"."AIPromptRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_configuration_id"
    ON "__mj"."AIPromptRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_parent_id"
    ON "__mj"."AIPromptRun" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_original_model_id"
    ON "__mj"."AIPromptRun" ("OriginalModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_rerun_from_prompt_run_id"
    ON "__mj"."AIPromptRun" ("RerunFromPromptRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_judge_id"
    ON "__mj"."AIPromptRun" ("JudgeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_child_prompt_id"
    ON "__mj"."AIPromptRun" ("ChildPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_test_run_id"
    ON "__mj"."AIPromptRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_user_id"
    ON "__mj"."AIPromptRun" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_hierarchy_meta"(
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
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIPromptRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIPromptRun" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIPromptRun" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_descendants"(
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
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun" c
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
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIPromptRun" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIPromptRun" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_ancestors"(
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
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIPromptRun" p
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
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_root_id"(
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
            "__mj"."AIPromptRun"
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
            "__mj"."AIPromptRun" c
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
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIPromptRuns"
AS
SELECT
    a.*,
    MJAIUsageType_UsageTypeID."Name" AS "UsageType",
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJAIModel_ModelID."Name" AS "Model",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIPromptRun_ParentID."RunName" AS "Parent",
    MJAIModel_OriginalModelID."Name" AS "OriginalModel",
    MJAIPromptRun_RerunFromPromptRunID."RunName" AS "RerunFromPromptRun",
    MJAIPrompt_JudgeID."Name" AS "Judge",
    MJAIPrompt_ChildPromptID."Name" AS "ChildPrompt",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJUser_UserID."Name" AS "User",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIPromptRun" AS a
LEFT OUTER JOIN
    "__mj"."AIUsageType" AS MJAIUsageType_UsageTypeID
  ON
    "a"."UsageTypeID" = MJAIUsageType_UsageTypeID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "a"."PromptID" = MJAIPrompt_PromptID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_ModelID
  ON
    "a"."ModelID" = MJAIModel_ModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_ParentID
  ON
    "a"."ParentID" = MJAIPromptRun_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_OriginalModelID
  ON
    "a"."OriginalModelID" = MJAIModel_OriginalModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_RerunFromPromptRunID
  ON
    "a"."RerunFromPromptRunID" = MJAIPromptRun_RerunFromPromptRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_JudgeID
  ON
    "a"."JudgeID" = MJAIPrompt_JudgeID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ChildPromptID
  ON
    "a"."ChildPromptID" = MJAIPrompt_ChildPromptID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_prompt_run_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
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
        AND tc.relname = 'vwAIPromptRuns'
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
                           AND tc.relname = 'vwAIPromptRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIPromptRuns" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIPromptRun"(p_data JSONB)
RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ)
AS $$
#variable_conflict use_column
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
    FOREACH v_field_name IN ARRAY ARRAY['InputUnitsUsed', 'OutputUnitsUsed', 'UsageTypeID', 'PromptID', 'ModelID', 'VendorID', 'AgentID', 'ConfigurationID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 'Messages', 'Result', 'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TotalCost', 'Success', 'ErrorMessage', 'ParentID', 'RunType', 'ExecutionOrder', 'Cost', 'CostCurrency', 'TokensUsedRollup', 'TokensPromptRollup', 'TokensCompletionRollup', 'Temperature', 'TopP', 'TopK', 'MinP', 'FrequencyPenalty', 'PresencePenalty', 'Seed', 'StopSequences', 'ResponseFormat', 'LogProbs', 'TopLogProbs', 'DescendantCost', 'ValidationAttemptCount', 'SuccessfulValidationCount', 'FinalValidationPassed', 'ValidationBehavior', 'RetryStrategy', 'MaxRetriesConfigured', 'FinalValidationError', 'ValidationErrorCount', 'CommonValidationError', 'FirstAttemptAt', 'LastAttemptAt', 'TotalRetryDurationMS', 'ValidationAttempts', 'ValidationSummary', 'FailoverAttempts', 'FailoverErrors', 'FailoverDurations', 'OriginalModelID', 'OriginalRequestStartTime', 'TotalFailoverDuration', 'RerunFromPromptRunID', 'ModelSelection', 'Status', 'Cancelled', 'CancellationReason', 'ModelPowerRank', 'SelectionStrategy', 'CacheHit', 'CacheKey', 'JudgeID', 'JudgeScore', 'WasSelectedResult', 'StreamingEnabled', 'FirstTokenTime', 'ErrorDetails', 'ChildPromptID', 'QueueTime', 'PromptTime', 'CompletionTime', 'ModelSpecificResponseDetails', 'EffortLevel', 'RunName', 'Comments', 'TestRunID', 'AssistantPrefill', 'TokensCacheRead', 'TokensCacheWrite', 'TokensCacheReadRollup', 'TokensCacheWriteRollup', 'ToolCallingMode', 'UserID']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'InputUnitsUsed' THEN '($1->>''InputUnitsUsed'')::DECIMAL(19, 8)'
        WHEN 'OutputUnitsUsed' THEN '($1->>''OutputUnitsUsed'')::DECIMAL(19, 8)'
        WHEN 'UsageTypeID' THEN '($1->>''UsageTypeID'')::UUID'
        WHEN 'PromptID' THEN '($1->>''PromptID'')::UUID'
        WHEN 'ModelID' THEN '($1->>''ModelID'')::UUID'
        WHEN 'VendorID' THEN '($1->>''VendorID'')::UUID'
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'RunAt' THEN 'COALESCE(($1->>''RunAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'ExecutionTimeMS' THEN '($1->>''ExecutionTimeMS'')::INT'
        WHEN 'Messages' THEN '($1->>''Messages'')'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'TokensUsed' THEN '($1->>''TokensUsed'')::INT'
        WHEN 'TokensPrompt' THEN '($1->>''TokensPrompt'')::INT'
        WHEN 'TokensCompletion' THEN '($1->>''TokensCompletion'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'Success' THEN 'COALESCE(($1->>''Success'')::BOOLEAN, FALSE)'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'RunType' THEN 'COALESCE(($1->>''RunType''), ''Single'')'
        WHEN 'ExecutionOrder' THEN '($1->>''ExecutionOrder'')::INT'
        WHEN 'Cost' THEN '($1->>''Cost'')::DECIMAL(19, 8)'
        WHEN 'CostCurrency' THEN '($1->>''CostCurrency'')'
        WHEN 'TokensUsedRollup' THEN '($1->>''TokensUsedRollup'')::INT'
        WHEN 'TokensPromptRollup' THEN '($1->>''TokensPromptRollup'')::INT'
        WHEN 'TokensCompletionRollup' THEN '($1->>''TokensCompletionRollup'')::INT'
        WHEN 'Temperature' THEN '($1->>''Temperature'')::DECIMAL(3, 2)'
        WHEN 'TopP' THEN '($1->>''TopP'')::DECIMAL(3, 2)'
        WHEN 'TopK' THEN '($1->>''TopK'')::INT'
        WHEN 'MinP' THEN '($1->>''MinP'')::DECIMAL(3, 2)'
        WHEN 'FrequencyPenalty' THEN '($1->>''FrequencyPenalty'')::DECIMAL(3, 2)'
        WHEN 'PresencePenalty' THEN '($1->>''PresencePenalty'')::DECIMAL(3, 2)'
        WHEN 'Seed' THEN '($1->>''Seed'')::INT'
        WHEN 'StopSequences' THEN '($1->>''StopSequences'')'
        WHEN 'ResponseFormat' THEN '($1->>''ResponseFormat'')'
        WHEN 'LogProbs' THEN '($1->>''LogProbs'')::BOOLEAN'
        WHEN 'TopLogProbs' THEN '($1->>''TopLogProbs'')::INT'
        WHEN 'DescendantCost' THEN '($1->>''DescendantCost'')::DECIMAL(18, 6)'
        WHEN 'ValidationAttemptCount' THEN '($1->>''ValidationAttemptCount'')::INT'
        WHEN 'SuccessfulValidationCount' THEN '($1->>''SuccessfulValidationCount'')::INT'
        WHEN 'FinalValidationPassed' THEN '($1->>''FinalValidationPassed'')::BOOLEAN'
        WHEN 'ValidationBehavior' THEN '($1->>''ValidationBehavior'')'
        WHEN 'RetryStrategy' THEN '($1->>''RetryStrategy'')'
        WHEN 'MaxRetriesConfigured' THEN '($1->>''MaxRetriesConfigured'')::INT'
        WHEN 'FinalValidationError' THEN '($1->>''FinalValidationError'')'
        WHEN 'ValidationErrorCount' THEN '($1->>''ValidationErrorCount'')::INT'
        WHEN 'CommonValidationError' THEN '($1->>''CommonValidationError'')'
        WHEN 'FirstAttemptAt' THEN '($1->>''FirstAttemptAt'')::TIMESTAMPTZ'
        WHEN 'LastAttemptAt' THEN '($1->>''LastAttemptAt'')::TIMESTAMPTZ'
        WHEN 'TotalRetryDurationMS' THEN '($1->>''TotalRetryDurationMS'')::INT'
        WHEN 'ValidationAttempts' THEN '($1->>''ValidationAttempts'')'
        WHEN 'ValidationSummary' THEN '($1->>''ValidationSummary'')'
        WHEN 'FailoverAttempts' THEN '($1->>''FailoverAttempts'')::INT'
        WHEN 'FailoverErrors' THEN '($1->>''FailoverErrors'')'
        WHEN 'FailoverDurations' THEN '($1->>''FailoverDurations'')'
        WHEN 'OriginalModelID' THEN '($1->>''OriginalModelID'')::UUID'
        WHEN 'OriginalRequestStartTime' THEN '($1->>''OriginalRequestStartTime'')::TIMESTAMPTZ'
        WHEN 'TotalFailoverDuration' THEN '($1->>''TotalFailoverDuration'')::INT'
        WHEN 'RerunFromPromptRunID' THEN '($1->>''RerunFromPromptRunID'')::UUID'
        WHEN 'ModelSelection' THEN '($1->>''ModelSelection'')'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'Cancelled' THEN 'COALESCE(($1->>''Cancelled'')::BOOLEAN, FALSE)'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'ModelPowerRank' THEN '($1->>''ModelPowerRank'')::INT'
        WHEN 'SelectionStrategy' THEN '($1->>''SelectionStrategy'')'
        WHEN 'CacheHit' THEN 'COALESCE(($1->>''CacheHit'')::BOOLEAN, FALSE)'
        WHEN 'CacheKey' THEN '($1->>''CacheKey'')'
        WHEN 'JudgeID' THEN '($1->>''JudgeID'')::UUID'
        WHEN 'JudgeScore' THEN '($1->>''JudgeScore'')::FLOAT(53)'
        WHEN 'WasSelectedResult' THEN 'COALESCE(($1->>''WasSelectedResult'')::BOOLEAN, FALSE)'
        WHEN 'StreamingEnabled' THEN 'COALESCE(($1->>''StreamingEnabled'')::BOOLEAN, FALSE)'
        WHEN 'FirstTokenTime' THEN '($1->>''FirstTokenTime'')::INT'
        WHEN 'ErrorDetails' THEN '($1->>''ErrorDetails'')'
        WHEN 'ChildPromptID' THEN '($1->>''ChildPromptID'')::UUID'
        WHEN 'QueueTime' THEN '($1->>''QueueTime'')::INT'
        WHEN 'PromptTime' THEN '($1->>''PromptTime'')::INT'
        WHEN 'CompletionTime' THEN '($1->>''CompletionTime'')::INT'
        WHEN 'ModelSpecificResponseDetails' THEN '($1->>''ModelSpecificResponseDetails'')'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'AssistantPrefill' THEN '($1->>''AssistantPrefill'')'
        WHEN 'TokensCacheRead' THEN '($1->>''TokensCacheRead'')::INT'
        WHEN 'TokensCacheWrite' THEN '($1->>''TokensCacheWrite'')::INT'
        WHEN 'TokensCacheReadRollup' THEN '($1->>''TokensCacheReadRollup'')::INT'
        WHEN 'TokensCacheWriteRollup' THEN '($1->>''TokensCacheWriteRollup'')::INT'
        WHEN 'ToolCallingMode' THEN '($1->>''ToolCallingMode'')'
        WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIPromptRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM "__mj"."AIPromptRun"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIPromptRun"(p_data JSONB)
RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ)
AS $$
#variable_conflict use_column
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIPromptRun: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIPromptRun"
    SET
        "InputUnitsUsed" = CASE WHEN p_data ? 'InputUnitsUsed' THEN (p_data->>'InputUnitsUsed')::DECIMAL(19, 8) ELSE "InputUnitsUsed" END,
        "OutputUnitsUsed" = CASE WHEN p_data ? 'OutputUnitsUsed' THEN (p_data->>'OutputUnitsUsed')::DECIMAL(19, 8) ELSE "OutputUnitsUsed" END,
        "UsageTypeID" = CASE WHEN p_data ? 'UsageTypeID' THEN (p_data->>'UsageTypeID')::UUID ELSE "UsageTypeID" END,
        "PromptID" = CASE WHEN p_data ? 'PromptID' THEN (p_data->>'PromptID')::UUID ELSE "PromptID" END,
        "ModelID" = CASE WHEN p_data ? 'ModelID' THEN (p_data->>'ModelID')::UUID ELSE "ModelID" END,
        "VendorID" = CASE WHEN p_data ? 'VendorID' THEN (p_data->>'VendorID')::UUID ELSE "VendorID" END,
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "RunAt" = CASE WHEN p_data ? 'RunAt' THEN (p_data->>'RunAt')::TIMESTAMPTZ ELSE "RunAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "ExecutionTimeMS" = CASE WHEN p_data ? 'ExecutionTimeMS' THEN (p_data->>'ExecutionTimeMS')::INT ELSE "ExecutionTimeMS" END,
        "Messages" = CASE WHEN p_data ? 'Messages' THEN (p_data->>'Messages') ELSE "Messages" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "TokensUsed" = CASE WHEN p_data ? 'TokensUsed' THEN (p_data->>'TokensUsed')::INT ELSE "TokensUsed" END,
        "TokensPrompt" = CASE WHEN p_data ? 'TokensPrompt' THEN (p_data->>'TokensPrompt')::INT ELSE "TokensPrompt" END,
        "TokensCompletion" = CASE WHEN p_data ? 'TokensCompletion' THEN (p_data->>'TokensCompletion')::INT ELSE "TokensCompletion" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "RunType" = CASE WHEN p_data ? 'RunType' THEN (p_data->>'RunType') ELSE "RunType" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "Cost" = CASE WHEN p_data ? 'Cost' THEN (p_data->>'Cost')::DECIMAL(19, 8) ELSE "Cost" END,
        "CostCurrency" = CASE WHEN p_data ? 'CostCurrency' THEN (p_data->>'CostCurrency') ELSE "CostCurrency" END,
        "TokensUsedRollup" = CASE WHEN p_data ? 'TokensUsedRollup' THEN (p_data->>'TokensUsedRollup')::INT ELSE "TokensUsedRollup" END,
        "TokensPromptRollup" = CASE WHEN p_data ? 'TokensPromptRollup' THEN (p_data->>'TokensPromptRollup')::INT ELSE "TokensPromptRollup" END,
        "TokensCompletionRollup" = CASE WHEN p_data ? 'TokensCompletionRollup' THEN (p_data->>'TokensCompletionRollup')::INT ELSE "TokensCompletionRollup" END,
        "Temperature" = CASE WHEN p_data ? 'Temperature' THEN (p_data->>'Temperature')::DECIMAL(3, 2) ELSE "Temperature" END,
        "TopP" = CASE WHEN p_data ? 'TopP' THEN (p_data->>'TopP')::DECIMAL(3, 2) ELSE "TopP" END,
        "TopK" = CASE WHEN p_data ? 'TopK' THEN (p_data->>'TopK')::INT ELSE "TopK" END,
        "MinP" = CASE WHEN p_data ? 'MinP' THEN (p_data->>'MinP')::DECIMAL(3, 2) ELSE "MinP" END,
        "FrequencyPenalty" = CASE WHEN p_data ? 'FrequencyPenalty' THEN (p_data->>'FrequencyPenalty')::DECIMAL(3, 2) ELSE "FrequencyPenalty" END,
        "PresencePenalty" = CASE WHEN p_data ? 'PresencePenalty' THEN (p_data->>'PresencePenalty')::DECIMAL(3, 2) ELSE "PresencePenalty" END,
        "Seed" = CASE WHEN p_data ? 'Seed' THEN (p_data->>'Seed')::INT ELSE "Seed" END,
        "StopSequences" = CASE WHEN p_data ? 'StopSequences' THEN (p_data->>'StopSequences') ELSE "StopSequences" END,
        "ResponseFormat" = CASE WHEN p_data ? 'ResponseFormat' THEN (p_data->>'ResponseFormat') ELSE "ResponseFormat" END,
        "LogProbs" = CASE WHEN p_data ? 'LogProbs' THEN (p_data->>'LogProbs')::BOOLEAN ELSE "LogProbs" END,
        "TopLogProbs" = CASE WHEN p_data ? 'TopLogProbs' THEN (p_data->>'TopLogProbs')::INT ELSE "TopLogProbs" END,
        "DescendantCost" = CASE WHEN p_data ? 'DescendantCost' THEN (p_data->>'DescendantCost')::DECIMAL(18, 6) ELSE "DescendantCost" END,
        "ValidationAttemptCount" = CASE WHEN p_data ? 'ValidationAttemptCount' THEN (p_data->>'ValidationAttemptCount')::INT ELSE "ValidationAttemptCount" END,
        "SuccessfulValidationCount" = CASE WHEN p_data ? 'SuccessfulValidationCount' THEN (p_data->>'SuccessfulValidationCount')::INT ELSE "SuccessfulValidationCount" END,
        "FinalValidationPassed" = CASE WHEN p_data ? 'FinalValidationPassed' THEN (p_data->>'FinalValidationPassed')::BOOLEAN ELSE "FinalValidationPassed" END,
        "ValidationBehavior" = CASE WHEN p_data ? 'ValidationBehavior' THEN (p_data->>'ValidationBehavior') ELSE "ValidationBehavior" END,
        "RetryStrategy" = CASE WHEN p_data ? 'RetryStrategy' THEN (p_data->>'RetryStrategy') ELSE "RetryStrategy" END,
        "MaxRetriesConfigured" = CASE WHEN p_data ? 'MaxRetriesConfigured' THEN (p_data->>'MaxRetriesConfigured')::INT ELSE "MaxRetriesConfigured" END,
        "FinalValidationError" = CASE WHEN p_data ? 'FinalValidationError' THEN (p_data->>'FinalValidationError') ELSE "FinalValidationError" END,
        "ValidationErrorCount" = CASE WHEN p_data ? 'ValidationErrorCount' THEN (p_data->>'ValidationErrorCount')::INT ELSE "ValidationErrorCount" END,
        "CommonValidationError" = CASE WHEN p_data ? 'CommonValidationError' THEN (p_data->>'CommonValidationError') ELSE "CommonValidationError" END,
        "FirstAttemptAt" = CASE WHEN p_data ? 'FirstAttemptAt' THEN (p_data->>'FirstAttemptAt')::TIMESTAMPTZ ELSE "FirstAttemptAt" END,
        "LastAttemptAt" = CASE WHEN p_data ? 'LastAttemptAt' THEN (p_data->>'LastAttemptAt')::TIMESTAMPTZ ELSE "LastAttemptAt" END,
        "TotalRetryDurationMS" = CASE WHEN p_data ? 'TotalRetryDurationMS' THEN (p_data->>'TotalRetryDurationMS')::INT ELSE "TotalRetryDurationMS" END,
        "ValidationAttempts" = CASE WHEN p_data ? 'ValidationAttempts' THEN (p_data->>'ValidationAttempts') ELSE "ValidationAttempts" END,
        "ValidationSummary" = CASE WHEN p_data ? 'ValidationSummary' THEN (p_data->>'ValidationSummary') ELSE "ValidationSummary" END,
        "FailoverAttempts" = CASE WHEN p_data ? 'FailoverAttempts' THEN (p_data->>'FailoverAttempts')::INT ELSE "FailoverAttempts" END,
        "FailoverErrors" = CASE WHEN p_data ? 'FailoverErrors' THEN (p_data->>'FailoverErrors') ELSE "FailoverErrors" END,
        "FailoverDurations" = CASE WHEN p_data ? 'FailoverDurations' THEN (p_data->>'FailoverDurations') ELSE "FailoverDurations" END,
        "OriginalModelID" = CASE WHEN p_data ? 'OriginalModelID' THEN (p_data->>'OriginalModelID')::UUID ELSE "OriginalModelID" END,
        "OriginalRequestStartTime" = CASE WHEN p_data ? 'OriginalRequestStartTime' THEN (p_data->>'OriginalRequestStartTime')::TIMESTAMPTZ ELSE "OriginalRequestStartTime" END,
        "TotalFailoverDuration" = CASE WHEN p_data ? 'TotalFailoverDuration' THEN (p_data->>'TotalFailoverDuration')::INT ELSE "TotalFailoverDuration" END,
        "RerunFromPromptRunID" = CASE WHEN p_data ? 'RerunFromPromptRunID' THEN (p_data->>'RerunFromPromptRunID')::UUID ELSE "RerunFromPromptRunID" END,
        "ModelSelection" = CASE WHEN p_data ? 'ModelSelection' THEN (p_data->>'ModelSelection') ELSE "ModelSelection" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "Cancelled" = CASE WHEN p_data ? 'Cancelled' THEN (p_data->>'Cancelled')::BOOLEAN ELSE "Cancelled" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "ModelPowerRank" = CASE WHEN p_data ? 'ModelPowerRank' THEN (p_data->>'ModelPowerRank')::INT ELSE "ModelPowerRank" END,
        "SelectionStrategy" = CASE WHEN p_data ? 'SelectionStrategy' THEN (p_data->>'SelectionStrategy') ELSE "SelectionStrategy" END,
        "CacheHit" = CASE WHEN p_data ? 'CacheHit' THEN (p_data->>'CacheHit')::BOOLEAN ELSE "CacheHit" END,
        "CacheKey" = CASE WHEN p_data ? 'CacheKey' THEN (p_data->>'CacheKey') ELSE "CacheKey" END,
        "JudgeID" = CASE WHEN p_data ? 'JudgeID' THEN (p_data->>'JudgeID')::UUID ELSE "JudgeID" END,
        "JudgeScore" = CASE WHEN p_data ? 'JudgeScore' THEN (p_data->>'JudgeScore')::FLOAT(53) ELSE "JudgeScore" END,
        "WasSelectedResult" = CASE WHEN p_data ? 'WasSelectedResult' THEN (p_data->>'WasSelectedResult')::BOOLEAN ELSE "WasSelectedResult" END,
        "StreamingEnabled" = CASE WHEN p_data ? 'StreamingEnabled' THEN (p_data->>'StreamingEnabled')::BOOLEAN ELSE "StreamingEnabled" END,
        "FirstTokenTime" = CASE WHEN p_data ? 'FirstTokenTime' THEN (p_data->>'FirstTokenTime')::INT ELSE "FirstTokenTime" END,
        "ErrorDetails" = CASE WHEN p_data ? 'ErrorDetails' THEN (p_data->>'ErrorDetails') ELSE "ErrorDetails" END,
        "ChildPromptID" = CASE WHEN p_data ? 'ChildPromptID' THEN (p_data->>'ChildPromptID')::UUID ELSE "ChildPromptID" END,
        "QueueTime" = CASE WHEN p_data ? 'QueueTime' THEN (p_data->>'QueueTime')::INT ELSE "QueueTime" END,
        "PromptTime" = CASE WHEN p_data ? 'PromptTime' THEN (p_data->>'PromptTime')::INT ELSE "PromptTime" END,
        "CompletionTime" = CASE WHEN p_data ? 'CompletionTime' THEN (p_data->>'CompletionTime')::INT ELSE "CompletionTime" END,
        "ModelSpecificResponseDetails" = CASE WHEN p_data ? 'ModelSpecificResponseDetails' THEN (p_data->>'ModelSpecificResponseDetails') ELSE "ModelSpecificResponseDetails" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "AssistantPrefill" = CASE WHEN p_data ? 'AssistantPrefill' THEN (p_data->>'AssistantPrefill') ELSE "AssistantPrefill" END,
        "TokensCacheRead" = CASE WHEN p_data ? 'TokensCacheRead' THEN (p_data->>'TokensCacheRead')::INT ELSE "TokensCacheRead" END,
        "TokensCacheWrite" = CASE WHEN p_data ? 'TokensCacheWrite' THEN (p_data->>'TokensCacheWrite')::INT ELSE "TokensCacheWrite" END,
        "TokensCacheReadRollup" = CASE WHEN p_data ? 'TokensCacheReadRollup' THEN (p_data->>'TokensCacheReadRollup')::INT ELSE "TokensCacheReadRollup" END,
        "TokensCacheWriteRollup" = CASE WHEN p_data ? 'TokensCacheWriteRollup' THEN (p_data->>'TokensCacheWriteRollup')::INT ELSE "TokensCacheWriteRollup" END,
        "ToolCallingMode" = CASE WHEN p_data ? 'ToolCallingMode' THEN (p_data->>'ToolCallingMode') ELSE "ToolCallingMode" END,
        "UserID" = CASE WHEN p_data ? 'UserID' THEN (p_data->>'UserID')::UUID ELSE "UserID" END,
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
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM "__mj"."AIPromptRun"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_prompt_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt_run" ON "__mj"."AIPromptRun";

CREATE TRIGGER "trg_update_ai_prompt_run"
BEFORE UPDATE ON "__mj"."AIPromptRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_prompt_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPromptRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPromptRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: AI Prompt Run Medias records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRunMedia"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.RerunFromPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "RerunFromPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "RerunFromPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIResultCache"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Content Item Tags.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentItemTag"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ContentItemTag"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Content Process Run Prompt Runs records via AIPromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentProcessRunPromptRun"
        WHERE "AIPromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteContentProcessRunPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Compaction Runs records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationCompactionRun"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationCompactionRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Field Suggestions.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."FieldSuggestion"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."FieldSuggestion"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Rubric Evaluations.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RubricEvaluation"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RubricEvaluation"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIPromptRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Integration";

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

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_resolved_by_user_id"
    ON "__mj"."Conversation" ("ResolvedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_type_id"
    ON "__mj"."Conversation" ("TypeID");

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
    MJConversation_LastConversationID."Name" AS "LastConversation",
    MJUser_ResolvedByUserID."Name" AS "ResolvedByUser",
    MJConversationType_TypeID."Name" AS "Type"
FROM
    "__mj"."Conversation" AS c
LEFT OUTER JOIN
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
LEFT OUTER JOIN
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
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_ResolvedByUserID
  ON
    "c"."ResolvedByUserID" = MJUser_ResolvedByUserID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationType" AS MJConversationType_TypeID
  ON
    "c"."TypeID" = MJConversationType_TypeID."ID"
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
    p_lastconversationid UUID DEFAULT NULL,
    p_anchortype_clear boolean DEFAULT false,
    p_anchortype varchar(30) DEFAULT NULL,
    p_anchorkey_clear boolean DEFAULT false,
    p_anchorkey varchar(255) DEFAULT NULL,
    p_anchormetadata_clear boolean DEFAULT false,
    p_anchormetadata TEXT DEFAULT NULL,
    p_isresolved BOOLEAN DEFAULT NULL,
    p_resolvedbyuserid_clear boolean DEFAULT false,
    p_resolvedbyuserid UUID DEFAULT NULL,
    p_resolvedat_clear boolean DEFAULT false,
    p_resolvedat TIMESTAMPTZ DEFAULT NULL,
    p_typeid UUID DEFAULT NULL
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
                "LastConversationID",
                "AnchorType",
                "AnchorKey",
                "AnchorMetadata",
                "IsResolved",
                "ResolvedByUserID",
                "ResolvedAt",
                "TypeID"
        )
    VALUES
        (
            v_new_id,
            p_userid,
                CASE WHEN p_externalid_clear = true THEN NULL ELSE COALESCE(p_externalid, NULL) END,
                CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
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
                CASE WHEN p_lastconversationid_clear = true THEN NULL ELSE COALESCE(p_lastconversationid, NULL) END,
                CASE WHEN p_anchortype_clear = true THEN NULL ELSE COALESCE(p_anchortype, NULL) END,
                CASE WHEN p_anchorkey_clear = true THEN NULL ELSE COALESCE(p_anchorkey, NULL) END,
                CASE WHEN p_anchormetadata_clear = true THEN NULL ELSE COALESCE(p_anchormetadata, NULL) END,
                COALESCE(p_isresolved, FALSE),
                CASE WHEN p_resolvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_resolvedbyuserid, NULL) END,
                CASE WHEN p_resolvedat_clear = true THEN NULL ELSE COALESCE(p_resolvedat, NULL) END,
                CASE WHEN p_typeid = '00000000-0000-0000-0000-000000000000'::UUID THEN '7F81FF57-C5A8-464D-B3B4-35A4FCF10717' ELSE COALESCE(p_typeid, '7F81FF57-C5A8-464D-B3B4-35A4FCF10717') END
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
    p_lastconversationid UUID DEFAULT NULL,
    p_anchortype_clear boolean DEFAULT false,
    p_anchortype varchar(30) DEFAULT NULL,
    p_anchorkey_clear boolean DEFAULT false,
    p_anchorkey varchar(255) DEFAULT NULL,
    p_anchormetadata_clear boolean DEFAULT false,
    p_anchormetadata TEXT DEFAULT NULL,
    p_isresolved BOOLEAN DEFAULT NULL,
    p_resolvedbyuserid_clear boolean DEFAULT false,
    p_resolvedbyuserid UUID DEFAULT NULL,
    p_resolvedat_clear boolean DEFAULT false,
    p_resolvedat TIMESTAMPTZ DEFAULT NULL,
    p_typeid UUID DEFAULT NULL
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
        "LastConversationID" = CASE WHEN p_lastconversationid_clear = true THEN NULL ELSE COALESCE(p_lastconversationid, "LastConversationID") END,
        "AnchorType" = CASE WHEN p_anchortype_clear = true THEN NULL ELSE COALESCE(p_anchortype, "AnchorType") END,
        "AnchorKey" = CASE WHEN p_anchorkey_clear = true THEN NULL ELSE COALESCE(p_anchorkey, "AnchorKey") END,
        "AnchorMetadata" = CASE WHEN p_anchormetadata_clear = true THEN NULL ELSE COALESCE(p_anchormetadata, "AnchorMetadata") END,
        "IsResolved" = COALESCE(p_isresolved, "IsResolved"),
        "ResolvedByUserID" = CASE WHEN p_resolvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_resolvedbyuserid, "ResolvedByUserID") END,
        "ResolvedAt" = CASE WHEN p_resolvedat_clear = true THEN NULL ELSE COALESCE(p_resolvedat, "ResolvedAt") END,
        "TypeID" = COALESCE(p_typeid, "TypeID")
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

        -- Cascade: Delete MJ: Comments records via ID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Comment"
        WHERE "ID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteComment"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Artifacts records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationArtifact"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationArtifact"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Branches records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationBranch"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationBranch"(v_rec."ID");
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
LEFT OUTER JOIN
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
DO $if_view_exists$
BEGIN
  IF to_regclass('"__mj"."vwAIAgentsActive"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON "__mj"."vwAIAgentsActive" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentsActive" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentsActive" TO "cdp_Integration";';
  END IF;
END
$if_view_exists$;


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
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite', 'RecordingDefault', 'RecordingStorageProviderID', 'DefaultMediaCollectionID', 'SupportsPlanMode', 'AcceptsSkills', 'SkillActivationMode', 'RequirePlanMode', 'ContextWindowMaxTokens', 'CompactionTriggerPercent', 'CompactionTargetPercent', 'ConversationSummaryPromptID', 'DeclareActionsAsNativeTools', 'MaxSubAgentConsultRounds']
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
        WHEN 'MaxSubAgentConsultRounds' THEN '($1->>''MaxSubAgentConsultRounds'')::INT'
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
        "MaxSubAgentConsultRounds" = CASE WHEN p_data ? 'MaxSubAgentConsultRounds' THEN (p_data->>'MaxSubAgentConsultRounds')::INT ELSE "MaxSubAgentConsultRounds" END,
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

        -- Cascade: Delete MJ: AI Agent User Policies records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentUserPolicy"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentUserPolicy"(v_rec."ID");
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

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: vwApplications
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Applications
-----               SCHEMA:      __mj
-----               BASE TABLE:  Application
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwApplications"
AS
SELECT
    a.*
FROM
    "__mj"."Application" AS a
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
        AND tc.relname = 'vwApplications'
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
                           AND tc.relname = 'vwApplications'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwApplications" CASCADE;
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
GRANT SELECT ON "__mj"."vwApplications" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwApplications" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwApplications" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: spCreateApplication
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Application
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateApplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateApplication"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(500) DEFAULT NULL,
    p_defaultfornewuser BOOLEAN DEFAULT NULL,
    p_schemaautoaddnewentities_clear boolean DEFAULT false,
    p_schemaautoaddnewentities TEXT DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(20) DEFAULT NULL,
    p_defaultnavitems_clear boolean DEFAULT false,
    p_defaultnavitems TEXT DEFAULT NULL,
    p_classname_clear boolean DEFAULT false,
    p_classname varchar(255) DEFAULT NULL,
    p_defaultsequence int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_navigationstyle varchar(20) DEFAULT NULL,
    p_topnavlocation_clear boolean DEFAULT false,
    p_topnavlocation varchar(30) DEFAULT NULL,
    p_hidenavbariconwhenactive BOOLEAN DEFAULT NULL,
    p_path varchar(100) DEFAULT NULL,
    p_autoupdatepath BOOLEAN DEFAULT NULL,
    p_agentsettings_clear boolean DEFAULT false,
    p_agentsettings TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwApplications" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Application"
        (
            "ID",
            "Name",
                "Description",
                "Icon",
                "DefaultForNewUser",
                "SchemaAutoAddNewEntities",
                "Color",
                "DefaultNavItems",
                "ClassName",
                "DefaultSequence",
                "Status",
                "NavigationStyle",
                "TopNavLocation",
                "HideNavBarIconWhenActive",
                "Path",
                "AutoUpdatePath",
                "AgentSettings"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                COALESCE(p_defaultfornewuser, TRUE),
                CASE WHEN p_schemaautoaddnewentities_clear = true THEN NULL ELSE COALESCE(p_schemaautoaddnewentities, NULL) END,
                CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, NULL) END,
                CASE WHEN p_defaultnavitems_clear = true THEN NULL ELSE COALESCE(p_defaultnavitems, NULL) END,
                CASE WHEN p_classname_clear = true THEN NULL ELSE COALESCE(p_classname, NULL) END,
                COALESCE(p_defaultsequence, 100),
                COALESCE(p_status, 'Active'),
                COALESCE(p_navigationstyle, 'App Switcher'),
                CASE WHEN p_topnavlocation_clear = true THEN NULL ELSE COALESCE(p_topnavlocation, NULL) END,
                COALESCE(p_hidenavbariconwhenactive, FALSE),
                p_path,
                COALESCE(p_autoupdatepath, TRUE),
                CASE WHEN p_agentsettings_clear = true THEN NULL ELSE COALESCE(p_agentsettings, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwApplications"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateApplication" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: spUpdateApplication
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Application
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateApplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateApplication"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(500) DEFAULT NULL,
    p_defaultfornewuser BOOLEAN DEFAULT NULL,
    p_schemaautoaddnewentities_clear boolean DEFAULT false,
    p_schemaautoaddnewentities TEXT DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(20) DEFAULT NULL,
    p_defaultnavitems_clear boolean DEFAULT false,
    p_defaultnavitems TEXT DEFAULT NULL,
    p_classname_clear boolean DEFAULT false,
    p_classname varchar(255) DEFAULT NULL,
    p_defaultsequence int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_navigationstyle varchar(20) DEFAULT NULL,
    p_topnavlocation_clear boolean DEFAULT false,
    p_topnavlocation varchar(30) DEFAULT NULL,
    p_hidenavbariconwhenactive BOOLEAN DEFAULT NULL,
    p_path varchar(100) DEFAULT NULL,
    p_autoupdatepath BOOLEAN DEFAULT NULL,
    p_agentsettings_clear boolean DEFAULT false,
    p_agentsettings TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwApplications" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Application"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "DefaultForNewUser" = COALESCE(p_defaultfornewuser, "DefaultForNewUser"),
        "SchemaAutoAddNewEntities" = CASE WHEN p_schemaautoaddnewentities_clear = true THEN NULL ELSE COALESCE(p_schemaautoaddnewentities, "SchemaAutoAddNewEntities") END,
        "Color" = CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, "Color") END,
        "DefaultNavItems" = CASE WHEN p_defaultnavitems_clear = true THEN NULL ELSE COALESCE(p_defaultnavitems, "DefaultNavItems") END,
        "ClassName" = CASE WHEN p_classname_clear = true THEN NULL ELSE COALESCE(p_classname, "ClassName") END,
        "DefaultSequence" = COALESCE(p_defaultsequence, "DefaultSequence"),
        "Status" = COALESCE(p_status, "Status"),
        "NavigationStyle" = COALESCE(p_navigationstyle, "NavigationStyle"),
        "TopNavLocation" = CASE WHEN p_topnavlocation_clear = true THEN NULL ELSE COALESCE(p_topnavlocation, "TopNavLocation") END,
        "HideNavBarIconWhenActive" = COALESCE(p_hidenavbariconwhenactive, "HideNavBarIconWhenActive"),
        "Path" = COALESCE(p_path, "Path"),
        "AutoUpdatePath" = COALESCE(p_autoupdatepath, "AutoUpdatePath"),
        "AgentSettings" = CASE WHEN p_agentsettings_clear = true THEN NULL ELSE COALESCE(p_agentsettings, "AgentSettings") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwApplications"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateApplication" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Application table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_application"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_application" ON "__mj"."Application";

CREATE TRIGGER "trg_update_application"
BEFORE UPDATE ON "__mj"."Application"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_application"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: spDeleteApplication
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Application
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteApplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteApplication"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: Application Entities records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ApplicationEntity"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteApplicationEntity"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Application Roles records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ApplicationRole"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteApplicationRole"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Application Settings records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ApplicationSetting"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteApplicationSetting"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Widget Instances records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationWidgetInstance"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationWidgetInstance"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversations.ApplicationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Conversation"
        WHERE "ApplicationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Conversation"
        SET "ApplicationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Dashboard User Preferences records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DashboardUserPreference"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteDashboardUserPreference"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Dashboards.ApplicationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Dashboard"
        WHERE "ApplicationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Dashboard"
        SET "ApplicationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Magic Link Invite Applications records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."MagicLinkInviteApplication"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteMagicLinkInviteApplication"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Magic Link Invites records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."MagicLinkInvite"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteMagicLinkInvite"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: User Applications records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserApplication"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteUserApplication"(v_rec."ID");
    END LOOP;

    
    DELETE FROM "__mj"."Application"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteApplication" TO "cdp_Integration";
