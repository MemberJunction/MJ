-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610122220__v6.2.x__Conversation_Branches.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ===================================================================================== */
/* Conversation Forks */
/* ===================================================================================== */
/* A ConversationBranch is a fork: another path of a conversation that starts at a message. */
/* Main (the trunk) is the messages with BranchID NULL. A fork's path is its own messages plus */
/* each ancestor's messages up to that ancestor's ForkFromSequence. Messages keep their global */
/* per-conversation Sequence (trgConversationDetail_AssignSequence). */
/* Deliberately NO FK from ConversationBranch to ConversationDetail (ForkFromSequence names */
/* a Sequence, SourceDetailID a detail): it would form an FK cycle that CodeGen's cascade */
/* ordering cannot resolve (see V202607241645__v5.50.x__Break_CodeGen_Cycle_Remove_PromptRun_AgentRunID). */
/* ConversationDetail.ReplacedAt marks an answer that a rerun of its turn replaced (Edit or */
/* Regenerate in place, for a person whose forking is off). The row is kept for audit; it is */
/* never shown and never sent to an agent. */
/* Design: docs/superpowers/specs/2026-10-07-conversation-forks-design.md */
/* ===================================================================================== */
CREATE TABLE __mj."ConversationBranch" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "ConversationID" UUID NOT NULL,
  "ParentBranchID" UUID NULL,
  "ForkFromSequence" INT NULL,
  "Name" VARCHAR(255) NULL,
  "Kind" VARCHAR(20) NOT NULL DEFAULT (
    'Fork'
  ),
  "SourceDetailID" UUID NULL,
  "UserID" UUID NOT NULL,
  CONSTRAINT "PK_ConversationBranch" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_ConversationBranch_Conversation" FOREIGN KEY ("ConversationID") REFERENCES __mj."Conversation" (
    "ID"
  ),
  CONSTRAINT "FK_ConversationBranch_ParentBranch" FOREIGN KEY ("ParentBranchID") REFERENCES __mj."ConversationBranch" (
    "ID"
  ),
  CONSTRAINT "FK_ConversationBranch_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "CK_ConversationBranch_Kind" CHECK ("Kind" IN ('Fork', 'Edit', 'Regenerate'))
);

ALTER TABLE __mj."ConversationDetail"
ADD COLUMN "BranchID" UUID NULL;

ALTER TABLE __mj."ConversationDetail"
  ADD CONSTRAINT "FK_ConversationDetail_Branch" FOREIGN KEY ("BranchID") REFERENCES __mj."ConversationBranch" (
    "ID"
  );

ALTER TABLE __mj."ConversationDetail"
ADD COLUMN "ReplacedAt" TIMESTAMPTZ NULL;

COMMENT ON TABLE __mj."ConversationBranch" IS 'A fork of a conversation: another path that starts at a message. Main (the trunk) is the messages with no branch. A fork''s path is its own messages plus each ancestor''s messages up to that ancestor''s ForkFromSequence.';

COMMENT ON COLUMN __mj."ConversationBranch"."ConversationID" IS 'The conversation this fork belongs to.';

COMMENT ON COLUMN __mj."ConversationBranch"."ParentBranchID" IS 'The fork this one started from. NULL means it started from Main, or before the first message when ForkFromSequence is also NULL.';

COMMENT ON COLUMN __mj."ConversationBranch"."ForkFromSequence" IS 'Sequence of the last message shared with the parent path. NULL means the fork starts before the first message, in which case ParentBranchID is also NULL.';

COMMENT ON COLUMN __mj."ConversationBranch"."Name" IS 'Optional name of the fork. With no name, the UI shows a default label from Kind: a Fork is named from its first message.';

COMMENT ON COLUMN __mj."ConversationBranch"."Kind" IS 'How the fork started: Fork (Fork from here), Edit (a sent message was edited) or Regenerate (an answer was regenerated).';

COMMENT ON COLUMN __mj."ConversationBranch"."SourceDetailID" IS 'The edited message (Kind Edit) or the replaced answer (Kind Regenerate); NULL otherwise. Not a foreign key, to avoid a CodeGen cascade cycle with ConversationDetail.';

COMMENT ON COLUMN __mj."ConversationBranch"."UserID" IS 'The person who started the fork.';

COMMENT ON COLUMN __mj."ConversationDetail"."BranchID" IS 'The fork this message belongs to. NULL means Main (the trunk). Every writer sets it explicitly.';

COMMENT ON COLUMN __mj."ConversationDetail"."ReplacedAt" IS 'When a rerun of this message''s turn replaced it (Regenerate or Save and resend while forking is off). A replaced row is kept for audit, is hidden from the user and is never sent to an agent. NULL means the row is live.';

/* ===================================================================================== */
/* GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND */
/* Everything below was produced by `mj codegen` from the hand-written DDL above: */
/* Entity/EntityField/EntityPermission/ApplicationEntity rows, regenerated views, */
/* spCreate/spUpdate/spDelete procedures, FK indexes, grants and extended properties. */
/* If the DDL above changes, re-run CodeGen and replace this whole section. */
/* The PostgreSQL counterpart is deferred to the release build. */
/* ===================================================================================== */
/* SQL generated to create new entity MJ: Conversation Branches */
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
    'c43a32a6-3400-4a03-a0e3-8817d24c341d',
    'MJ: Conversation Branches',
    'Conversation Branches',
    'A fork of a conversation: another path that starts at a message. Main (the trunk) is the messages with no branch. A fork''s path is its own messages plus each ancestor''s messages up to that ancestor''s ForkFromSequence.',
    NULL,
    'ConversationBranch',
    'vwConversationBranches',
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
/* SQL generated to add new entity MJ: Conversation Branches to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'c43a32a6-3400-4a03-a0e3-8817d24c341d',
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
/* SQL generated to add new permission for entity MJ: Conversation Branches for role UI */
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
  CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS UUID),
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
      "EntityID" = CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Conversation Branches for role Developer */
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
  CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS UUID),
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
      "EntityID" = CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Conversation Branches for role Integration */
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
  CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS UUID),
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
      "EntityID" = CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."ConversationBranch"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ConversationBranch */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ConversationBranch */
UPDATE __mj."ConversationBranch" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ConversationBranch' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ConversationBranch" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationBranch" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ConversationBranch"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationBranch */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationBranch */
UPDATE __mj."ConversationBranch" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ConversationBranch' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ConversationBranch" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationBranch" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eea65c41-e1ff-4976-ba32-aa4e0ba70463' OR ("EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'BranchID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eea65c41-e1ff-4976-ba32-aa4e0ba70463', '12248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Conversation Details */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6'), 'BranchID', 'Branch ID', 'The fork this message belongs to. NULL means Main (the trunk). Every writer sets it explicitly.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '240c11f0-66f7-4242-a207-0b65e1d51067' OR ("EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ReplacedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('240c11f0-66f7-4242-a207-0b65e1d51067', '12248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Conversation Details */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6'), 'ReplacedAt', 'Replaced At', 'When a rerun of this message''s turn replaced it (Regenerate or Save and resend while forking is off). A replaced row is kept for audit, is hidden from the user and is never sent to an agent. NULL means the row is live.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cefe126b-0df6-4f94-b0b1-b5ea48c0c443' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cefe126b-0df6-4f94-b0b1-b5ea48c0c443', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5caaea2f-4fab-444c-8997-7d18220e5e29' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'ConversationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5caaea2f-4fab-444c-8997-7d18220e5e29', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'ConversationID', 'Conversation ID', 'The conversation this fork belongs to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '13248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ece1c405-0c2e-42ae-8840-9de6faa5c029' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'ParentBranchID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ece1c405-0c2e-42ae-8840-9de6faa5c029', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'ParentBranchID', 'Parent Branch ID', 'The fork this one started from. NULL means it started from Main, or before the first message when ForkFromSequence is also NULL.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b9abb056-d80b-419a-b818-60f62ba07638' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'ForkFromSequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b9abb056-d80b-419a-b818-60f62ba07638', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'ForkFromSequence', 'Fork From Sequence', 'Sequence of the last message shared with the parent path. NULL means the fork starts before the first message, in which case ParentBranchID is also NULL.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9d996e7b-e635-49de-a677-a9c2dd6530ba' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9d996e7b-e635-49de-a677-a9c2dd6530ba', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'Name', 'Name', 'Optional name of the fork. With no name, the UI shows a default label from Kind: a Fork is named from its first message.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '649a9cdc-326b-4916-b469-a045204de013' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'Kind')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('649a9cdc-326b-4916-b469-a045204de013', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'Kind', 'Kind', 'How the fork started: Fork (Fork from here), Edit (a sent message was edited) or Regenerate (an answer was regenerated).', 'nvarchar', 40, 0, 0, FALSE, 'Fork', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ec7d4c23-7652-468f-be0a-4873967125a7' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'SourceDetailID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ec7d4c23-7652-468f-be0a-4873967125a7', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'SourceDetailID', 'Source Detail ID', 'The edited message (Kind Edit) or the replaced answer (Kind Regenerate); NULL otherwise. Not a foreign key, to avoid a CodeGen cascade cycle with ConversationDetail.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ec1290ea-a783-4dd5-b374-f22ff6805f02' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ec1290ea-a783-4dd5-b374-f22ff6805f02', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'UserID', 'User ID', 'The person who started the fork.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ea4cb32-3ac6-498e-a032-5a9a415dc14f' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1ea4cb32-3ac6-498e-a032-5a9a415dc14f', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '04101288-1659-433b-9f81-0a8a49e43547' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('04101288-1659-433b-9f81-0a8a49e43547', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID aada0665-57c6-4fa9-9abe-5bcfa8147319 */
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
    'aada0665-57c6-4fa9-9abe-5bcfa8147319',
    '649A9CDC-326B-4916-B469-A045204DE013',
    1,
    'Edit',
    'Edit',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 737335d8-20c4-4b1b-b509-d984be6c3b8e */
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
    '737335d8-20c4-4b1b-b509-d984be6c3b8e',
    '649A9CDC-326B-4916-B469-A045204DE013',
    2,
    'Fork',
    'Fork',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3c375eb7-3913-4de9-8113-854bd545c31d */
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
    '3c375eb7-3913-4de9-8113-854bd545c31d',
    '649A9CDC-326B-4916-B469-A045204DE013',
    3,
    'Regenerate',
    'Regenerate',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 649A9CDC-326B-4916-B469-A045204DE013 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '649A9CDC-326B-4916-B469-A045204DE013';
/* Create Entity Relationship: MJ: Users -> MJ: Conversation Branches (One To Many via UserID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bea04ea5-cb08-497b-9e29-6730cbd5536c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bea04ea5-cb08-497b-9e29-6730cbd5536c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'UserID', 'One To Many', TRUE, TRUE, 118, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0b5144a8-c7ad-49c2-b8b7-142c224f86ea') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0b5144a8-c7ad-49c2-b8b7-142c224f86ea', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'ConversationID', 'One To Many', TRUE, TRUE, 11, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd36a4884-e5a4-43e1-8f0a-a3e09440eb60') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d36a4884-e5a4-43e1-8f0a-a3e09440eb60', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', '12248F34-2837-EF11-86D4-6045BDEE16E6', 'BranchID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0e18636b-23bc-4a6d-b8c2-019daeb233a9') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0e18636b-23bc-4a6d-b8c2-019daeb233a9', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'ParentBranchID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6d60af4e-b4e8-40f4-a1b7-23db23f604c8' OR ("EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Branch')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6d60af4e-b4e8-40f4-a1b7-23db23f604c8', '12248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Conversation Details */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6'), 'Branch', 'Branch', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cbd0ddc3-67be-4190-b3d8-48832d1cd971' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'Conversation')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cbd0ddc3-67be-4190-b3d8-48832d1cd971', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'Conversation', 'Conversation', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b4c8575b-1c0d-452e-931d-8fbf03febe71' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'ParentBranch')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b4c8575b-1c0d-452e-931d-8fbf03febe71', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'ParentBranch', 'Parent Branch', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44243d08-adf6-4b2d-9305-b7b0fa512e01' OR ("EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('44243d08-adf6-4b2d-9305-b7b0fa512e01', 'C43A32A6-3400-4A03-A0E3-8817D24C341D' /* Entity: MJ: Conversation Branches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'), 'User', 'User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '649A9CDC-326B-4916-B469-A045204DE013'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1EA4CB32-3AC6-498E-A032-5A9A415DC14F'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'CBD0DDC3-67BE-4190-B3D8-48832D1CD971'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '44243D08-ADF6-4B2D-9305-B7B0FA512E01'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '9D996E7B-E635-49DE-A677-A9C2DD6530BA'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 7 fields */
/* UPDATE Entity Field Category Info MJ: Conversation Details.BranchID */
UPDATE __mj."EntityField" SET "Category" = 'Message Core', "GeneratedFormSection" = 'Category', "DisplayName" = 'Branch'
WHERE
  "ID" = 'EEA65C41-E1FF-4976-BA32-AA4E0BA70463';
/* UPDATE Entity Field Category Info MJ: Conversation Details.ReplacedAt */
UPDATE __mj."EntityField" SET "Category" = 'Media and Timing', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '240C11F0-66F7-4242-A207-0B65E1D51067';
/* UPDATE Entity Field Category Info MJ: Conversation Details.Branch */
UPDATE __mj."EntityField" SET "Category" = 'Related Entities', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6D60AF4E-B4E8-40F4-A1B7-23DB23F604C8';
/* UPDATE Entity Field Category Info MJ: Conversation Details.ParentIDDepth */
UPDATE __mj."EntityField" SET "Category" = 'Related Entities', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A9CCE4B0-A049-47B9-9C53-7258679276BB';
/* UPDATE Entity Field Category Info MJ: Conversation Details.ParentIDPath */
UPDATE __mj."EntityField" SET "Category" = 'Related Entities', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '88573442-79DE-4932-B3BC-7EB928848FE6';
/* UPDATE Entity Field Category Info MJ: Conversation Details.ParentIDIsLeaf */
UPDATE __mj."EntityField" SET "Category" = 'Related Entities', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '411C4BD1-F4AC-49B3-A29B-82ECB312B1DA';
/* UPDATE Entity Field Category Info MJ: Conversation Details.ParentIDChildCount */
UPDATE __mj."EntityField" SET "Category" = 'Related Entities', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '98714A89-8808-4141-B105-42497BB3067B';

/* Set categories for 13 fields */
/* UPDATE Entity Field Category Info MJ: Conversation Branches.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CEFE126B-0DF6-4F94-B0B1-B5EA48C0C443';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.ConversationID */
UPDATE __mj."EntityField" SET "Category" = 'Branch Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation'
WHERE
  "ID" = '5CAAEA2F-4FAB-444C-8997-7D18220E5E29';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.ParentBranchID */
UPDATE __mj."EntityField" SET "Category" = 'Branch Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Branch'
WHERE
  "ID" = 'ECE1C405-0C2E-42AE-8840-9DE6FAA5C029';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.ForkFromSequence */
UPDATE __mj."EntityField" SET "Category" = 'Branch Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B9ABB056-D80B-419A-B818-60F62BA07638';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.Name */
UPDATE __mj."EntityField" SET "Category" = 'Branch Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9D996E7B-E635-49DE-A677-A9C2DD6530BA';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.Kind */
UPDATE __mj."EntityField" SET "Category" = 'Branch Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '649A9CDC-326B-4916-B469-A045204DE013';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.SourceDetailID */
UPDATE __mj."EntityField" SET "Category" = 'Branch Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Source Detail'
WHERE
  "ID" = 'EC7D4C23-7652-468F-BE0A-4873967125A7';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Branch Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'User'
WHERE
  "ID" = 'EC1290EA-A783-4DD5-B374-F22FF6805F02';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.Conversation */
UPDATE __mj."EntityField" SET "Category" = 'Related Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation Detail'
WHERE
  "ID" = 'CBD0DDC3-67BE-4190-B3D8-48832D1CD971';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.ParentBranch */
UPDATE __mj."EntityField" SET "Category" = 'Related Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Branch Detail'
WHERE
  "ID" = 'B4C8575B-1C0D-452E-931D-8FBF03FEBE71';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.User */
UPDATE __mj."EntityField" SET "Category" = 'Related Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'User Name'
WHERE
  "ID" = '44243D08-ADF6-4B2D-9305-B7B0FA512E01';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1EA4CB32-3AC6-498E-A032-5A9A415DC14F';
/* UPDATE Entity Field Category Info MJ: Conversation Branches.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '04101288-1659-433B-9F81-0A8A49E43547';

/* Set entity icon to fa fa-code-branch */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-code-branch', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8649007a-3765-5463-a293-cdba0fa709b7', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'FieldCategoryInfo', '{
  "Branch Details": {
    "description": "Core configuration and lineage details for conversation forks",
    "icon": "fa fa-code-branch"
  },
  "Related Information": {
    "description": "Additional descriptive fields and denormalized context",
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
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e634a5a7-0e2d-5c4f-b8bc-e13823df2115', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'FieldCategoryIcons', '{
  "Branch Details": "fa fa-code-branch",
  "Related Information": "fa fa-info-circle",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'C43A32A6-3400-4A03-A0E3-8817D24C341D';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Branches
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_branch_conversation_id"
    ON "__mj"."ConversationBranch" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_branch_parent_branch_id"
    ON "__mj"."ConversationBranch" ("ParentBranchID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_branch_user_id"
    ON "__mj"."ConversationBranch" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Branches
-- Item: vwConversationBranches
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Branches
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationBranch
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwConversationBranches"
AS
SELECT
    c.*,
    MJConversation_ConversationID."Name" AS "Conversation",
    MJConversationBranch_ParentBranchID."Name" AS "ParentBranch",
    MJUser_UserID."Name" AS "User"
FROM
    "__mj"."ConversationBranch" AS c
INNER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "c"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationBranch" AS MJConversationBranch_ParentBranchID
  ON
    "c"."ParentBranchID" = MJConversationBranch_ParentBranchID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_UserID
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
        AND tc.relname = 'vwConversationBranches'
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
                           AND tc.relname = 'vwConversationBranches'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwConversationBranches" CASCADE;
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
GRANT SELECT ON "__mj"."vwConversationBranches" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwConversationBranches" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwConversationBranches" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Branches
-- Item: spCreateConversationBranch
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationBranch
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationBranch'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateConversationBranch"(
    p_id UUID DEFAULT NULL,
    p_conversationid UUID DEFAULT NULL,
    p_parentbranchid_clear boolean DEFAULT false,
    p_parentbranchid UUID DEFAULT NULL,
    p_forkfromsequence_clear boolean DEFAULT false,
    p_forkfromsequence int DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_kind varchar(20) DEFAULT NULL,
    p_sourcedetailid_clear boolean DEFAULT false,
    p_sourcedetailid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationBranches" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ConversationBranch"
        (
            "ID",
            "ConversationID",
                "ParentBranchID",
                "ForkFromSequence",
                "Name",
                "Kind",
                "SourceDetailID",
                "UserID"
        )
    VALUES
        (
            v_new_id,
            p_conversationid,
                CASE WHEN p_parentbranchid_clear = true THEN NULL ELSE COALESCE(p_parentbranchid, NULL) END,
                CASE WHEN p_forkfromsequence_clear = true THEN NULL ELSE COALESCE(p_forkfromsequence, NULL) END,
                CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                COALESCE(p_kind, 'Fork'),
                CASE WHEN p_sourcedetailid_clear = true THEN NULL ELSE COALESCE(p_sourcedetailid, NULL) END,
                p_userid
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwConversationBranches"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationBranch" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationBranch" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Branches
-- Item: spUpdateConversationBranch
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationBranch
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationBranch'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateConversationBranch"(
    p_id UUID,
    p_conversationid UUID DEFAULT NULL,
    p_parentbranchid_clear boolean DEFAULT false,
    p_parentbranchid UUID DEFAULT NULL,
    p_forkfromsequence_clear boolean DEFAULT false,
    p_forkfromsequence int DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_kind varchar(20) DEFAULT NULL,
    p_sourcedetailid_clear boolean DEFAULT false,
    p_sourcedetailid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationBranches" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ConversationBranch"
    SET
        "ConversationID" = COALESCE(p_conversationid, "ConversationID"),
        "ParentBranchID" = CASE WHEN p_parentbranchid_clear = true THEN NULL ELSE COALESCE(p_parentbranchid, "ParentBranchID") END,
        "ForkFromSequence" = CASE WHEN p_forkfromsequence_clear = true THEN NULL ELSE COALESCE(p_forkfromsequence, "ForkFromSequence") END,
        "Name" = CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, "Name") END,
        "Kind" = COALESCE(p_kind, "Kind"),
        "SourceDetailID" = CASE WHEN p_sourcedetailid_clear = true THEN NULL ELSE COALESCE(p_sourcedetailid, "SourceDetailID") END,
        "UserID" = COALESCE(p_userid, "UserID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwConversationBranches"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationBranch" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationBranch" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationBranch table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_conversation_branch"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_branch" ON "__mj"."ConversationBranch";

CREATE TRIGGER "trg_update_conversation_branch"
BEFORE UPDATE ON "__mj"."ConversationBranch"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_conversation_branch"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Branches
-- Item: spDeleteConversationBranch
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationBranch
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationBranch'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteConversationBranch"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ConversationBranch"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationBranch" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationBranch" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_conversation_id"
    ON "__mj"."ConversationDetail" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_user_id"
    ON "__mj"."ConversationDetail" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_id"
    ON "__mj"."ConversationDetail" ("ArtifactID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_version_id"
    ON "__mj"."ConversationDetail" ("ArtifactVersionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_parent_id"
    ON "__mj"."ConversationDetail" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_agent_id"
    ON "__mj"."ConversationDetail" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_test_run_id"
    ON "__mj"."ConversationDetail" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_agent_session_id"
    ON "__mj"."ConversationDetail" ("AgentSessionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_branch_id"
    ON "__mj"."ConversationDetail" ("BranchID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: fn_conversation_detail_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: ConversationDetail.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_conversation_detail_parent_id_get_hierarchy_meta"(
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
            "__mj"."ConversationDetail"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ConversationDetail" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."ConversationDetail" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."ConversationDetail" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: fn_conversation_detail_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: ConversationDetail.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_conversation_detail_parent_id_get_descendants"(
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
            "__mj"."ConversationDetail"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."ConversationDetail" c
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
        (NOT EXISTS (SELECT 1 FROM "__mj"."ConversationDetail" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."ConversationDetail" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: fn_conversation_detail_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: ConversationDetail.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_conversation_detail_parent_id_get_ancestors"(
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
            "__mj"."ConversationDetail"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ConversationDetail" p
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
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: fn_conversation_detail_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ConversationDetail.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_conversation_detail_parent_id_get_root_id"(
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
            "__mj"."ConversationDetail"
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
            "__mj"."ConversationDetail" c
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwConversationDetails"
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
    MJConversationBranch_BranchID."Name" AS "Branch",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."ConversationDetail" AS c
INNER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "c"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "c"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationArtifact" AS MJConversationArtifact_ArtifactID
  ON
    "c"."ArtifactID" = MJConversationArtifact_ArtifactID."ID"
LEFT OUTER JOIN
    "__mj"."vwConversationArtifactVersions" AS MJConversationArtifactVersion_ArtifactVersionID
  ON
    "c"."ArtifactVersionID" = MJConversationArtifactVersion_ArtifactVersionID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationDetail" AS MJConversationDetail_ParentID
  ON
    "c"."ParentID" = MJConversationDetail_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "c"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "c"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationBranch" AS MJConversationBranch_BranchID
  ON
    "c"."BranchID" = MJConversationBranch_BranchID."ID"

LEFT JOIN LATERAL "__mj"."fn_conversation_detail_parent_id_get_hierarchy_meta"(c."ID", c."ParentID") AS hier_ParentID ON true
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
        AND tc.relname = 'vwConversationDetails'
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
                           AND tc.relname = 'vwConversationDetails'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwConversationDetails" CASCADE;
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
GRANT SELECT ON "__mj"."vwConversationDetails" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwConversationDetails" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwConversationDetails" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION "__mj"."spCreateConversationDetail"(
    p_id UUID DEFAULT NULL,
    p_conversationid UUID DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid varchar(100) DEFAULT NULL,
    p_role varchar(20) DEFAULT NULL,
    p_message TEXT DEFAULT NULL,
    p_error_clear boolean DEFAULT false,
    p_error TEXT DEFAULT NULL,
    p_hiddentouser BOOLEAN DEFAULT NULL,
    p_userrating_clear boolean DEFAULT false,
    p_userrating int DEFAULT NULL,
    p_userfeedback_clear boolean DEFAULT false,
    p_userfeedback TEXT DEFAULT NULL,
    p_reflectioninsights_clear boolean DEFAULT false,
    p_reflectioninsights TEXT DEFAULT NULL,
    p_summaryofearlierconversation_clear boolean DEFAULT false,
    p_summaryofearlierconversation TEXT DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_artifactid_clear boolean DEFAULT false,
    p_artifactid UUID DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid UUID DEFAULT NULL,
    p_completiontime_clear boolean DEFAULT false,
    p_completiontime bigint DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_suggestedresponses_clear boolean DEFAULT false,
    p_suggestedresponses TEXT DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid UUID DEFAULT NULL,
    p_responseform_clear boolean DEFAULT false,
    p_responseform TEXT DEFAULT NULL,
    p_actionablecommands_clear boolean DEFAULT false,
    p_actionablecommands TEXT DEFAULT NULL,
    p_automaticcommands_clear boolean DEFAULT false,
    p_automaticcommands TEXT DEFAULT NULL,
    p_originalmessagechanged BOOLEAN DEFAULT NULL,
    p_agentsessionid_clear boolean DEFAULT false,
    p_agentsessionid UUID DEFAULT NULL,
    p_turnendedat_clear boolean DEFAULT false,
    p_turnendedat TIMESTAMPTZ DEFAULT NULL,
    p_utterancestartms_clear boolean DEFAULT false,
    p_utterancestartms int DEFAULT NULL,
    p_utteranceendms_clear boolean DEFAULT false,
    p_utteranceendms int DEFAULT NULL,
    p_mediatype_clear boolean DEFAULT false,
    p_mediatype varchar(20) DEFAULT NULL,
    p_branchid_clear boolean DEFAULT false,
    p_branchid UUID DEFAULT NULL,
    p_replacedat_clear boolean DEFAULT false,
    p_replacedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationDetails" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ConversationDetail"
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
                "AgentSessionID",
                "TurnEndedAt",
                "UtteranceStartMs",
                "UtteranceEndMs",
                "MediaType",
                "BranchID",
                "ReplacedAt"
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
                CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, NULL) END,
                CASE WHEN p_turnendedat_clear = true THEN NULL ELSE COALESCE(p_turnendedat, NULL) END,
                CASE WHEN p_utterancestartms_clear = true THEN NULL ELSE COALESCE(p_utterancestartms, NULL) END,
                CASE WHEN p_utteranceendms_clear = true THEN NULL ELSE COALESCE(p_utteranceendms, NULL) END,
                CASE WHEN p_mediatype_clear = true THEN NULL ELSE COALESCE(p_mediatype, NULL) END,
                CASE WHEN p_branchid_clear = true THEN NULL ELSE COALESCE(p_branchid, NULL) END,
                CASE WHEN p_replacedat_clear = true THEN NULL ELSE COALESCE(p_replacedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwConversationDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationDetail" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateConversationDetail"(
    p_id UUID,
    p_conversationid UUID DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid varchar(100) DEFAULT NULL,
    p_role varchar(20) DEFAULT NULL,
    p_message TEXT DEFAULT NULL,
    p_error_clear boolean DEFAULT false,
    p_error TEXT DEFAULT NULL,
    p_hiddentouser BOOLEAN DEFAULT NULL,
    p_userrating_clear boolean DEFAULT false,
    p_userrating int DEFAULT NULL,
    p_userfeedback_clear boolean DEFAULT false,
    p_userfeedback TEXT DEFAULT NULL,
    p_reflectioninsights_clear boolean DEFAULT false,
    p_reflectioninsights TEXT DEFAULT NULL,
    p_summaryofearlierconversation_clear boolean DEFAULT false,
    p_summaryofearlierconversation TEXT DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_artifactid_clear boolean DEFAULT false,
    p_artifactid UUID DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid UUID DEFAULT NULL,
    p_completiontime_clear boolean DEFAULT false,
    p_completiontime bigint DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_suggestedresponses_clear boolean DEFAULT false,
    p_suggestedresponses TEXT DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid UUID DEFAULT NULL,
    p_responseform_clear boolean DEFAULT false,
    p_responseform TEXT DEFAULT NULL,
    p_actionablecommands_clear boolean DEFAULT false,
    p_actionablecommands TEXT DEFAULT NULL,
    p_automaticcommands_clear boolean DEFAULT false,
    p_automaticcommands TEXT DEFAULT NULL,
    p_originalmessagechanged BOOLEAN DEFAULT NULL,
    p_agentsessionid_clear boolean DEFAULT false,
    p_agentsessionid UUID DEFAULT NULL,
    p_turnendedat_clear boolean DEFAULT false,
    p_turnendedat TIMESTAMPTZ DEFAULT NULL,
    p_utterancestartms_clear boolean DEFAULT false,
    p_utterancestartms int DEFAULT NULL,
    p_utteranceendms_clear boolean DEFAULT false,
    p_utteranceendms int DEFAULT NULL,
    p_mediatype_clear boolean DEFAULT false,
    p_mediatype varchar(20) DEFAULT NULL,
    p_branchid_clear boolean DEFAULT false,
    p_branchid UUID DEFAULT NULL,
    p_replacedat_clear boolean DEFAULT false,
    p_replacedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ConversationDetail"
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
        "AgentSessionID" = CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, "AgentSessionID") END,
        "TurnEndedAt" = CASE WHEN p_turnendedat_clear = true THEN NULL ELSE COALESCE(p_turnendedat, "TurnEndedAt") END,
        "UtteranceStartMs" = CASE WHEN p_utterancestartms_clear = true THEN NULL ELSE COALESCE(p_utterancestartms, "UtteranceStartMs") END,
        "UtteranceEndMs" = CASE WHEN p_utteranceendms_clear = true THEN NULL ELSE COALESCE(p_utteranceendms, "UtteranceEndMs") END,
        "MediaType" = CASE WHEN p_mediatype_clear = true THEN NULL ELSE COALESCE(p_mediatype, "MediaType") END,
        "BranchID" = CASE WHEN p_branchid_clear = true THEN NULL ELSE COALESCE(p_branchid, "BranchID") END,
        "ReplacedAt" = CASE WHEN p_replacedat_clear = true THEN NULL ELSE COALESCE(p_replacedat, "ReplacedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwConversationDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_conversation_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_detail" ON "__mj"."ConversationDetail";

CREATE TRIGGER "trg_update_conversation_detail"
BEFORE UPDATE ON "__mj"."ConversationDetail"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_conversation_detail"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteConversationDetail"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "SourceConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentExample"
        SET "SourceConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "SourceConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "SourceConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Compaction Runs records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationCompactionRun"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationCompactionRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Artifacts records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetailArtifact"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationDetailArtifact"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Attachments records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetailAttachment"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationDetailAttachment"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Ratings records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetailRating"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationDetailRating"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetail"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationDetail"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."ConversationDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationDetail" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifact Versions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_artifact_version_conversation_art"
    ON "__mj"."ConversationArtifactVersion" ("ConversationArtifactID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwConversationArtifactVersions"
AS
SELECT
    c.*,
    MJConversationArtifact_ConversationArtifactID."Name" AS "ConversationArtifact"
FROM
    "__mj"."ConversationArtifactVersion" AS c
INNER JOIN
    "__mj"."ConversationArtifact" AS MJConversationArtifact_ConversationArtifactID
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
        AND tc.relname = 'vwConversationArtifactVersions'
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
                           AND tc.relname = 'vwConversationArtifactVersions'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwConversationArtifactVersions" CASCADE;
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
GRANT SELECT ON "__mj"."vwConversationArtifactVersions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwConversationArtifactVersions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwConversationArtifactVersions" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION "__mj"."spCreateConversationArtifactVersion"(
    p_id UUID DEFAULT NULL,
    p_conversationartifactid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_configuration TEXT DEFAULT NULL,
    p_content_clear boolean DEFAULT false,
    p_content TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationArtifactVersions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ConversationArtifactVersion"
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
    SELECT * FROM "__mj"."vwConversationArtifactVersions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationArtifactVersion" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationArtifactVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationArtifactVersion" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateConversationArtifactVersion"(
    p_id UUID,
    p_conversationartifactid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_configuration TEXT DEFAULT NULL,
    p_content_clear boolean DEFAULT false,
    p_content TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationArtifactVersions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ConversationArtifactVersion"
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
    SELECT * FROM "__mj"."vwConversationArtifactVersions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationArtifactVersion" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationArtifactVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationArtifactVersion" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifactVersion table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_conversation_artifact_version"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_artifact_version" ON "__mj"."ConversationArtifactVersion";

CREATE TRIGGER "trg_update_conversation_artifact_version"
BEFORE UPDATE ON "__mj"."ConversationArtifactVersion"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_conversation_artifact_version"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteConversationArtifactVersion"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Conversation Details.ArtifactVersionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetail"
        WHERE "ArtifactVersionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationDetail"
        SET "ArtifactVersionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."ConversationArtifactVersion"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationArtifactVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationArtifactVersion" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Artifacts
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_artifact_conversation_id"
    ON "__mj"."ConversationArtifact" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_artifact_artifact_type_id"
    ON "__mj"."ConversationArtifact" ("ArtifactTypeID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwConversationArtifacts"
AS
SELECT
    c.*,
    MJConversation_ConversationID."Name" AS "Conversation",
    MJArtifactType_ArtifactTypeID."Name" AS "ArtifactType"
FROM
    "__mj"."ConversationArtifact" AS c
INNER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "c"."ConversationID" = MJConversation_ConversationID."ID"
INNER JOIN
    "__mj"."ArtifactType" AS MJArtifactType_ArtifactTypeID
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
        AND tc.relname = 'vwConversationArtifacts'
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
                           AND tc.relname = 'vwConversationArtifacts'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwConversationArtifacts" CASCADE;
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
GRANT SELECT ON "__mj"."vwConversationArtifacts" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwConversationArtifacts" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwConversationArtifacts" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION "__mj"."spCreateConversationArtifact"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_conversationid UUID DEFAULT NULL,
    p_artifacttypeid UUID DEFAULT NULL,
    p_sharingscope varchar(50) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationArtifacts" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ConversationArtifact"
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
    SELECT * FROM "__mj"."vwConversationArtifacts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationArtifact" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationArtifact" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationArtifact" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateConversationArtifact"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_conversationid UUID DEFAULT NULL,
    p_artifacttypeid UUID DEFAULT NULL,
    p_sharingscope varchar(50) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationArtifacts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ConversationArtifact"
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
    SELECT * FROM "__mj"."vwConversationArtifacts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationArtifact" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationArtifact" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationArtifact" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifact table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_conversation_artifact"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_artifact" ON "__mj"."ConversationArtifact";

CREATE TRIGGER "trg_update_conversation_artifact"
BEFORE UPDATE ON "__mj"."ConversationArtifact"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_conversation_artifact"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteConversationArtifact"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: Conversation Artifact Permissions records via ConversationArtifactID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationArtifactPermission"
        WHERE "ConversationArtifactID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationArtifactPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Artifact Versions records via ConversationArtifactID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationArtifactVersion"
        WHERE "ConversationArtifactID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationArtifactVersion"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.ArtifactID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetail"
        WHERE "ArtifactID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationDetail"
        SET "ArtifactID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."ConversationArtifact"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationArtifact" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationArtifact" TO "cdp_Integration";

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
