-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609031400__v6.1.x__Conversation_Scoped_Skill_Activation.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."AISkill"
ADD COLUMN "ActivationScope" VARCHAR(20) NOT NULL DEFAULT (
  'Run'
) /* ============================================================================ */ /* v6.1.x — Conversation-scoped skill activation */ /* WHY. A skill activates for ONE RUN: `ExecuteAgentParams.requestedSkillIDs` is a per-call input and */ /* `BaseAgent._activatedSkillIDs` dies with the run. That is right for a one-shot capability and wrong */ /* for a skill that behaves as a MODE — a persona (`/sassy`), or an assistant whose reply carries a */ /* menu whose buttons are pressed on the NEXT turn, when nothing would re-activate it. Every */ /* conversational agent with a mode re-implements the same thing: a table of (conversation, skill), */ /* re-read at the start of every turn and merged into the request. First-adopter feedback (Betty). */ /* WHAT. Two additive changes, both opt-in, so nothing existing changes behaviour: */ /*   AISkill.ActivationScope   'Run' (default — today's behaviour) | 'Conversation' */ /*                             A 'Conversation' skill, once activated in a run that has a */ /*                             conversationId, stays active for that conversation until ended. */ /*   ConversationSkill         one row per (conversation, skill) that is or was active there. */ /*                             Status 'Active' rows are merged into requestedSkillIDs at the start of */ /*                             every root run in that conversation (subject to all the usual gates); */ /*                             'Ended' rows are history. Written by BaseAgent on activation; ended by */ /*                             BaseAgent.EndConversationSkill (the app's "exit" gesture) or by the UI. */ /* Precedent: UserRoutine.RequestedSkillIDs (v5.45) persists a pre-selection on the owning record and */ /* threads it per run. This is the same idea keyed on the conversation, as a junction table rather than */ /* a JSON column because rows carry a lifecycle (Active/Ended) and a provenance (which run activated). */ /* Entity permissions (Widget Guest parity with MJ: Conversation Details) ship via metadata sync in */ /* metadata/entity-permissions/. CodeGen registers the entity as "MJ: Conversation Skills". */ /* ============================================================================ */ /* 1. AISkill.ActivationScope --------------------------------------------------- */;

ALTER TABLE __mj."AISkill"
  ADD CONSTRAINT "CK_AISkill_ActivationScope" CHECK ("ActivationScope" IN ('Run', 'Conversation'));

COMMENT ON COLUMN __mj."AISkill"."ActivationScope" IS 'How long an activation lasts. Run (default): the skill is active for the run that activated it and no longer — a one-shot capability. Conversation: once activated in a run that belongs to a conversation, the skill stays active for that conversation (an MJ: Conversation Skills row, Status Active) and is re-requested at the start of every later root run there until ended — a persona, or a mode whose menu is pressed on the next turn. Subject to every availability gate on each run; ActivationMode still decides who may trigger the FIRST activation.';

/* 2. ConversationSkill  ("MJ: Conversation Skills") ----------------------------- */
CREATE TABLE __mj."ConversationSkill" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "ConversationID" UUID NOT NULL,
  "SkillID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  "ActivatedByRunID" UUID NULL,
  "EndedAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_ConversationSkill" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_ConversationSkill_Conversation" FOREIGN KEY ("ConversationID") REFERENCES __mj."Conversation" (
    "ID"
  ),
  CONSTRAINT "FK_ConversationSkill_Skill" FOREIGN KEY ("SkillID") REFERENCES __mj."AISkill" (
    "ID"
  ),
  CONSTRAINT "FK_ConversationSkill_Run" FOREIGN KEY ("ActivatedByRunID") REFERENCES __mj."AIAgentRun" (
    "ID"
  ),
  CONSTRAINT "UQ_ConversationSkill_Conversation_Skill" UNIQUE (
    "ConversationID",
    "SkillID"
  ),
  CONSTRAINT "CK_ConversationSkill_Status" CHECK ("Status" IN ('Active', 'Ended'))
);

COMMENT ON TABLE __mj."ConversationSkill" IS 'A skill that is, or was, active for a whole conversation. Written by BaseAgent when a skill whose ActivationScope is Conversation activates in a run that has a conversationId; Active rows are merged into requestedSkillIDs at the start of every later root run in the conversation (all availability gates still apply on each run), so a persona or a mode survives to the next turn. Ended when the app or the user leaves the mode (BaseAgent.EndConversationSkill / the composer). Precedent: UserRoutine.RequestedSkillIDs, the same idea keyed on a routine.';

COMMENT ON COLUMN __mj."ConversationSkill"."ConversationID" IS 'The conversation the skill is active in.';

COMMENT ON COLUMN __mj."ConversationSkill"."SkillID" IS 'The skill (AISkill.ActivationScope = Conversation) held active.';

COMMENT ON COLUMN __mj."ConversationSkill"."Status" IS 'Active: re-requested on every root run in the conversation. Ended: history — the mode was left; a later activation re-uses the row and sets it Active again.';

COMMENT ON COLUMN __mj."ConversationSkill"."ActivatedByRunID" IS 'The agent run in which the skill was (most recently) activated — provenance for the Active row.';

COMMENT ON COLUMN __mj."ConversationSkill"."EndedAt" IS 'When the mode was left. NULL while Active.';

/* *****************************************************************************************************
 * EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL — DO NOT EDIT BY HAND.
 *
 * Generated 2026-09-03 by `mj codegen --skipfiles` on a clean database built from migrations + metadata
 * (MJ_6_1_CLEAN_skills_convo), then filtered to the blocks this migration causes:
 *   - MJ: Conversation Skills — entity registration, application + role permissions, EntityField rows
 *     (current CodeGen emission: existing rows are parked at +100000 first, then catalog-ordinal
 *     Sequences 1..n, renumbered by the repeatable script), Status value list, relationships (Conversations / AI Skills / AI Agent Runs),
 *     FK indexes, vwConversationSkills + permissions, spCreate/spUpdate/spDelete + permissions, field
 *     categories / icon / DefaultForNewUser settings.
 *   - MJ: AI Skills — the ActivationScope EntityField row + value list, and the regenerated
 *     vwAISkills / spCreateAISkill / spUpdateAISkill / spDeleteAISkill (+ permissions).
 *   - MJ: AI Agent Runs / MJ: Conversations — spDeleteAIAgentRun / spDeleteConversation regenerated
 *     because ConversationSkill now references them (cascade handling).
 * Excluded on purpose: unrelated fresh-install drift the same run emitted for MJ: Identity Claims /
 * MJ: Identity Claim Types (default constraints, value lists, relationships, views, procs, categories,
 * icons) — those belong to whichever migration introduced them, not to this one.
 *
 * If the hand-written DDL above changes, re-run CodeGen and replace this entire generated section.
 * The PostgreSQL counterpart is deferred to the release build (see migrations/CLAUDE.md).
 ***************************************************************************************************** */
/* SQL generated to create new entity MJ: Conversation Skills */
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
    'd2021771-50d7-4e0f-a2a8-27ac37e01b34',
    'MJ: Conversation Skills',
    'Conversation Skills',
    'A skill that is, or was, active for a whole conversation. Written by BaseAgent when a skill whose ActivationScope is Conversation activates in a run that has a conversationId; Active rows are merged into requestedSkillIDs at the start of every later root run in the conversation (all availability gates still apply on each run), so a persona or a mode survives to the next turn. Ended when the app or the user leaves the mode (BaseAgent.EndConversationSkill / the composer). Precedent: UserRoutine.RequestedSkillIDs, the same idea keyed on a routine.',
    NULL,
    'ConversationSkill',
    'vwConversationSkills',
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
/* SQL generated to add new entity MJ: Conversation Skills to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'd2021771-50d7-4e0f-a2a8-27ac37e01b34',
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
/* SQL generated to add new permission for entity MJ: Conversation Skills for role UI */
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
    'd2021771-50d7-4e0f-a2a8-27ac37e01b34',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Conversation Skills for role Developer */
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
    'd2021771-50d7-4e0f-a2a8-27ac37e01b34',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Conversation Skills for role Integration */
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
    'd2021771-50d7-4e0f-a2a8-27ac37e01b34',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
ALTER TABLE __mj."ConversationSkill"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ConversationSkill */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ConversationSkill */
UPDATE __mj."ConversationSkill" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ConversationSkill' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ConversationSkill" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationSkill" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ConversationSkill"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationSkill */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationSkill */
UPDATE __mj."ConversationSkill" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ConversationSkill' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ConversationSkill" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationSkill" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to insert 11 new entity field(s) */
UPDATE __mj."EntityField" SET "Sequence" = "Sequence" + 100000
WHERE
  "EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34'
  AND "Sequence" < 100000
  AND NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityField"
    WHERE
      "EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Sequence" >= 100000
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5be7bba0-3d9c-46d2-aa89-12b159defbe6' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5be7bba0-3d9c-46d2-aa89-12b159defbe6', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 1, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '56693a11-25d6-48f4-90d7-ecb1a850d4d7' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = 'ConversationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('56693a11-25d6-48f4-90d7-ecb1a850d4d7', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 2, 'ConversationID', 'Conversation ID', 'The conversation the skill is active in.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '13248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88f0e3c9-f8bd-4a69-b51c-9bdd61e695d0' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = 'SkillID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('88f0e3c9-f8bd-4a69-b51c-9bdd61e695d0', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 3, 'SkillID', 'Skill ID', 'The skill (AISkill.ActivationScope = Conversation) held active.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1fc1d01a-1f6f-4492-a2b2-be5e4384a5f3' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1fc1d01a-1f6f-4492-a2b2-be5e4384a5f3', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 4, 'Status', 'Status', 'Active: re-requested on every root run in the conversation. Ended: history — the mode was left; a later activation re-uses the row and sets it Active again.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70fc39bb-0302-47c4-bab2-b931466e1e6a' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = 'ActivatedByRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('70fc39bb-0302-47c4-bab2-b931466e1e6a', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 5, 'ActivatedByRunID', 'Activated By Run ID', 'The agent run in which the skill was (most recently) activated — provenance for the Active row.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f84c2254-12d2-438c-8434-aa37db8357b1' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = 'EndedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f84c2254-12d2-438c-8434-aa37db8357b1', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 6, 'EndedAt', 'Ended At', 'When the mode was left. NULL while Active.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bdc50332-0960-4d12-96a7-7088bbccabca' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bdc50332-0960-4d12-96a7-7088bbccabca', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 7, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '17d857de-a44c-4351-b551-077362545765' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('17d857de-a44c-4351-b551-077362545765', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 8, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

UPDATE __mj."EntityField" SET "Sequence" = "Sequence" + 100000
WHERE
  "EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4'
  AND "Sequence" < 100000
  AND NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityField"
    WHERE
      "EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Sequence" >= 100000
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7184d031-59ee-42c1-8b55-d70abe05eb11' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'ActivationScope')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7184d031-59ee-42c1-8b55-d70abe05eb11', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 14, 'ActivationScope', 'Activation Scope', 'How long an activation lasts. Run (default): the skill is active for the run that activated it and no longer — a one-shot capability. Conversation: once activated in a run that belongs to a conversation, the skill stays active for that conversation (an MJ: Conversation Skills row, Status Active) and is re-requested at the start of every later root run there until ended — a persona, or a mode whose menu is pressed on the next turn. Subject to every availability gate on each run; ActivationMode still decides who may trigger the FIRST activation.', 'nvarchar', 40, 0, 0, FALSE, 'Run', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 3baade3c-afc8-48d0-87ab-00df04622735 */
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
    '3baade3c-afc8-48d0-87ab-00df04622735',
    '1FC1D01A-1F6F-4492-A2B2-BE5E4384A5F3',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 767fa42c-4da5-487c-a23d-186dfeab2b99 */
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
    '767fa42c-4da5-487c-a23d-186dfeab2b99',
    '1FC1D01A-1F6F-4492-A2B2-BE5E4384A5F3',
    2,
    'Ended',
    'Ended',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 1FC1D01A-1F6F-4492-A2B2-BE5E4384A5F3 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '1FC1D01A-1F6F-4492-A2B2-BE5E4384A5F3';
/* SQL text to insert entity field value with ID 99f73ff7-9cfd-40ca-8c6a-b4e6c1639e8d */
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
    '99f73ff7-9cfd-40ca-8c6a-b4e6c1639e8d',
    '7184D031-59EE-42C1-8B55-D70ABE05EB11',
    1,
    'Conversation',
    'Conversation',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ad19d1a8-75dc-4f8e-90be-9f9918a3e7a9 */
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
    'ad19d1a8-75dc-4f8e-90be-9f9918a3e7a9',
    '7184D031-59EE-42C1-8B55-D70ABE05EB11',
    2,
    'Run',
    'Run',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 7184D031-59EE-42C1-8B55-D70ABE05EB11 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '7184D031-59EE-42C1-8B55-D70ABE05EB11';
/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: Conversation Skills (One To Many via ActivatedByRunID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'de9bc04f-a912-4e1e-b382-c9279e83b2f2') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('de9bc04f-a912-4e1e-b382-c9279e83b2f2', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34', 'ActivatedByRunID', 'One To Many', TRUE, TRUE, 15, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '49483745-e99c-4835-84de-170b6002c7d4') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('49483745-e99c-4835-84de-170b6002c7d4', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34', 'SkillID', 'One To Many', TRUE, TRUE, 7, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '02f8af24-8064-4e15-8a71-a6d20ab86450') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('02f8af24-8064-4e15-8a71-a6d20ab86450', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34', 'ConversationID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert 4 new entity field(s) */
UPDATE __mj."EntityField" SET "Sequence" = "Sequence" + 100000
WHERE
  "EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34'
  AND "Sequence" < 100000
  AND NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityField"
    WHERE
      "EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Sequence" >= 100000
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63782154-4994-44a9-826b-59ddd9b0e1c8' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = 'Conversation')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('63782154-4994-44a9-826b-59ddd9b0e1c8', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 9, 'Conversation', 'Conversation', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8f4ef253-724b-49ea-a771-32d40cfce6a8' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = 'Skill')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8f4ef253-724b-49ea-a771-32d40cfce6a8', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 10, 'Skill', 'Skill', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5b64deaa-b6d6-40f7-820d-3cee8ea92514' OR ("EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' AND "Name" = 'ActivatedByRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5b64deaa-b6d6-40f7-820d-3cee8ea92514', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34' /* Entity: MJ: Conversation Skills */, 11, 'ActivatedByRun', 'Activated By Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1FC1D01A-1F6F-4492-A2B2-BE5E4384A5F3'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'F84C2254-12D2-438C-8434-AA37DB8357B1'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '63782154-4994-44A9-826B-59DDD9B0E1C8'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '8F4EF253-724B-49EA-A771-32D40CFCE6A8'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '7184D031-59EE-42C1-8B55-D70ABE05EB11'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 15 fields */
/* UPDATE Entity Field Category Info MJ: AI Skills.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B0738691-8E33-41FC-9E5B-EFAF4A13AB01' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BF89FCCE-6D4D-4DD0-AC89-F7785BE11F27' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '27EDDFE6-8E94-4F90-ABB3-BFD7029C3640' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Instructions */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '4EA0DE7B-5BF0-4F2A-A8C4-CC8AE1FE47A7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '58BCAF71-A955-473D-99E4-FA0997CFBE56' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Category */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '03BF582C-CBE4-4DE3-A5D9-F9B788E0D665' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.IconClass */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4F38D266-56D2-49DE-9912-3C67A28413CC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Color */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9CC2C1AD-8A1D-4DAB-BEA5-83845F7FEEC9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.CreatedByUserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A807D7C3-7083-42E5-BAF7-62EECA9C8813' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B0021E00-68FF-4499-B029-D16440781316' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '86FF4D27-32D6-4E3D-9857-DA7DA9855289' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.ActivationMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8AC2445E-06C4-4E87-90E1-960A4DF6AF81' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.SearchScopeAccess */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '816274C5-1D6E-44F6-A883-D4BAF7F85DE2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.ActivationScope */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7184D031-59EE-42C1-8B55-D70ABE05EB11' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.CreatedByUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9252D454-9CC5-4719-9604-A558224C4A4C' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 11 fields */
/* UPDATE Entity Field Category Info MJ: Conversation Skills.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5BE7BBA0-3D9C-46D2-AA89-12B159DEFBE6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.ConversationID */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '56693A11-25D6-48F4-90D7-ECB1A850D4D7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.SkillID */
UPDATE __mj."EntityField" SET "Category" = 'Skill Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'Skill', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '88F0E3C9-F8BD-4A69-B51C-9BDD61E695D0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.Status */
UPDATE __mj."EntityField" SET "Category" = 'Skill Information', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1FC1D01A-1F6F-4492-A2B2-BE5E4384A5F3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.ActivatedByRunID */
UPDATE __mj."EntityField" SET "Category" = 'Skill Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'Activated By Run', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '70FC39BB-0302-47C4-BAB2-B931466E1E6A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.EndedAt */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F84C2254-12D2-438C-8434-AA37DB8357B1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BDC50332-0960-4D12-96A7-7088BBCCABCA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '17D857DE-A44C-4351-B551-077362545765' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.Conversation */
UPDATE __mj."EntityField" SET "Category" = 'Conversation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '63782154-4994-44A9-826B-59DDD9B0E1C8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.Skill */
UPDATE __mj."EntityField" SET "Category" = 'Skill Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'Skill Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8F4EF253-724B-49EA-A771-32D40CFCE6A8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Skills.ActivatedByRun */
UPDATE __mj."EntityField" SET "Category" = 'Skill Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'Activated By Run Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5B64DEAA-B6D6-40F7-820D-3CEE8EA92514' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-comments */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-comments', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34';

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
    '06ee9b65-2626-488c-9135-46c8bee9961c',
    'D2021771-50D7-4E0F-A2A8-27AC37E01B34',
    'FieldCategoryInfo',
    '{"Conversation Details":{"icon":"fa fa-comments","description":"Information linking the skill to specific conversation sessions and lifecycle"},"Skill Information":{"icon":"fa fa-magic","description":"Details regarding the specific skill, its status, and activation provenance"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
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
    '9859d652-6dc9-4169-bedc-1f5c6bac27b9',
    'D2021771-50D7-4E0F-A2A8-27AC37E01B34',
    'FieldCategoryIcons',
    '{"Conversation Details":"fa fa-comments","Skill Information":"fa fa-magic","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'D2021771-50D7-4E0F-A2A8-27AC37E01B34';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_skill_created_by_user_id"
    ON "__mj"."AISkill" ("CreatedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: vwAISkills
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skills
-----               SCHEMA:      __mj
-----               BASE TABLE:  AISkill
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAISkills"
AS
SELECT
    a.*,
    MJUser_CreatedByUserID."Name" AS "CreatedByUser"
FROM
    "__mj"."AISkill" AS a
INNER JOIN
    "__mj"."User" AS MJUser_CreatedByUserID
  ON
    "a"."CreatedByUserID" = MJUser_CreatedByUserID."ID"
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
    AND tc.relname = 'vwAISkills'
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
    AND tc.relname = 'vwAISkills'
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
        AND tc.relname = 'vwAISkills'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAISkills" CASCADE;
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
GRANT SELECT ON "__mj"."vwAISkills" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAISkills" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAISkills" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: spCreateAISkill
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AISkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAISkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAISkill"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_instructions TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(50) DEFAULT NULL,
    p_createdbyuserid UUID DEFAULT NULL,
    p_activationmode varchar(20) DEFAULT NULL,
    p_activationscope varchar(20) DEFAULT NULL,
    p_searchscopeaccess_clear boolean DEFAULT false,
    p_searchscopeaccess varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAISkills" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AISkill"
        (
            "ID",
            "Name",
                "Description",
                "Instructions",
                "Status",
                "Category",
                "IconClass",
                "Color",
                "CreatedByUserID",
                "ActivationMode",
                "ActivationScope",
                "SearchScopeAccess"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_instructions,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, NULL) END,
                CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, NULL) END,
                CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, NULL) END,
                p_createdbyuserid,
                COALESCE(p_activationmode, 'RequestedOnly'),
                COALESCE(p_activationscope, 'Run'),
                CASE WHEN p_searchscopeaccess_clear = true THEN NULL ELSE COALESCE(p_searchscopeaccess, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAISkills"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAISkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAISkill" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: spUpdateAISkill
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AISkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAISkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAISkill"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_instructions TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(50) DEFAULT NULL,
    p_createdbyuserid UUID DEFAULT NULL,
    p_activationmode varchar(20) DEFAULT NULL,
    p_activationscope varchar(20) DEFAULT NULL,
    p_searchscopeaccess_clear boolean DEFAULT false,
    p_searchscopeaccess varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAISkills" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AISkill"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Instructions" = COALESCE(p_instructions, "Instructions"),
        "Status" = COALESCE(p_status, "Status"),
        "Category" = CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, "Category") END,
        "IconClass" = CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, "IconClass") END,
        "Color" = CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, "Color") END,
        "CreatedByUserID" = COALESCE(p_createdbyuserid, "CreatedByUserID"),
        "ActivationMode" = COALESCE(p_activationmode, "ActivationMode"),
        "ActivationScope" = COALESCE(p_activationscope, "ActivationScope"),
        "SearchScopeAccess" = CASE WHEN p_searchscopeaccess_clear = true THEN NULL ELSE COALESCE(p_searchscopeaccess, "SearchScopeAccess") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAISkills"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAISkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAISkill" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkill table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_skill"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_skill" ON "__mj"."AISkill";

CREATE TRIGGER "trg_update_ai_skill"
BEFORE UPDATE ON "__mj"."AISkill"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_skill"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: spDeleteAISkill
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AISkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAISkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAISkill"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AISkill"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAISkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAISkill" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Skills
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_skill_conversation_id"
    ON "__mj"."ConversationSkill" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_skill_skill_id"
    ON "__mj"."ConversationSkill" ("SkillID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_skill_activated_by_run_id"
    ON "__mj"."ConversationSkill" ("ActivatedByRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Skills
-- Item: vwConversationSkills
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Skills
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationSkill
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwConversationSkills"
AS
SELECT
    c.*,
    MJConversation_ConversationID."Name" AS "Conversation",
    MJAISkill_SkillID."Name" AS "Skill",
    MJAIAgentRun_ActivatedByRunID."RunName" AS "ActivatedByRun"
FROM
    "__mj"."ConversationSkill" AS c
INNER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "c"."ConversationID" = MJConversation_ConversationID."ID"
INNER JOIN
    "__mj"."AISkill" AS MJAISkill_SkillID
  ON
    "c"."SkillID" = MJAISkill_SkillID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_ActivatedByRunID
  ON
    "c"."ActivatedByRunID" = MJAIAgentRun_ActivatedByRunID."ID"
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
    AND tc.relname = 'vwConversationSkills'
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
    AND tc.relname = 'vwConversationSkills'
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
        AND tc.relname = 'vwConversationSkills'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwConversationSkills" CASCADE;
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
GRANT SELECT ON "__mj"."vwConversationSkills" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwConversationSkills" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwConversationSkills" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Skills
-- Item: spCreateConversationSkill
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationSkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationSkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateConversationSkill"(
    p_id UUID DEFAULT NULL,
    p_conversationid UUID DEFAULT NULL,
    p_skillid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_activatedbyrunid_clear boolean DEFAULT false,
    p_activatedbyrunid UUID DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationSkills" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ConversationSkill"
        (
            "ID",
            "ConversationID",
                "SkillID",
                "Status",
                "ActivatedByRunID",
                "EndedAt"
        )
    VALUES
        (
            v_new_id,
            p_conversationid,
                p_skillid,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_activatedbyrunid_clear = true THEN NULL ELSE COALESCE(p_activatedbyrunid, NULL) END,
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwConversationSkills"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationSkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateConversationSkill" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Skills
-- Item: spUpdateConversationSkill
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationSkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationSkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateConversationSkill"(
    p_id UUID,
    p_conversationid UUID DEFAULT NULL,
    p_skillid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_activatedbyrunid_clear boolean DEFAULT false,
    p_activatedbyrunid UUID DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwConversationSkills" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ConversationSkill"
    SET
        "ConversationID" = COALESCE(p_conversationid, "ConversationID"),
        "SkillID" = COALESCE(p_skillid, "SkillID"),
        "Status" = COALESCE(p_status, "Status"),
        "ActivatedByRunID" = CASE WHEN p_activatedbyrunid_clear = true THEN NULL ELSE COALESCE(p_activatedbyrunid, "ActivatedByRunID") END,
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwConversationSkills"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationSkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateConversationSkill" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationSkill table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_conversation_skill"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_skill" ON "__mj"."ConversationSkill";

CREATE TRIGGER "trg_update_conversation_skill"
BEFORE UPDATE ON "__mj"."ConversationSkill"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_conversation_skill"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Skills
-- Item: spDeleteConversationSkill
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationSkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationSkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteConversationSkill"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ConversationSkill"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationSkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversationSkill" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON "__mj"."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON "__mj"."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON "__mj"."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON "__mj"."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON "__mj"."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON "__mj"."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON "__mj"."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON "__mj"."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON "__mj"."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON "__mj"."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON "__mj"."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON "__mj"."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_session_id"
    ON "__mj"."AIAgentRun" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(
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
            "ParentRunID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentRunID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_descendants"(
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
            "ParentRunID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentRunID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun" c
        INNER JOIN
            cte_descendants p ON c."ParentRunID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
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
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIAgentRun"
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
            "__mj"."AIAgentRun" c
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRuns"
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
    hier_ParentRunID."RootID" AS "RootParentRunID",
    hier_ParentRunID."Depth" AS "ParentRunIDDepth",
    hier_ParentRunID."Path" AS "ParentRunIDPath",
    hier_ParentRunID."IsLeaf" AS "ParentRunIDIsLeaf",
    hier_ParentRunID."ChildCount" AS "ParentRunIDChildCount"
FROM
    "__mj"."AIAgentRun" AS a
INNER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    "__mj"."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(a."ID", a."ParentRunID") AS hier_ParentRunID ON true
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

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRuns" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
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
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID', 'PlanMode', 'ExternalSessionID', 'ContinuationDepth']
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
        WHEN 'TotalTokensUsed' THEN '($1->>''TotalTokensUsed'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'TotalPromptTokensUsed' THEN '($1->>''TotalPromptTokensUsed'')::INT'
        WHEN 'TotalCompletionTokensUsed' THEN '($1->>''TotalCompletionTokensUsed'')::INT'
        WHEN 'TotalTokensUsedRollup' THEN '($1->>''TotalTokensUsedRollup'')::INT'
        WHEN 'TotalPromptTokensUsedRollup' THEN '($1->>''TotalPromptTokensUsedRollup'')::INT'
        WHEN 'TotalCompletionTokensUsedRollup' THEN '($1->>''TotalCompletionTokensUsedRollup'')::INT'
        WHEN 'TotalCostRollup' THEN '($1->>''TotalCostRollup'')::DECIMAL(19, 8)'
        WHEN 'ConversationDetailID' THEN '($1->>''ConversationDetailID'')::UUID'
        WHEN 'ConversationDetailSequence' THEN '($1->>''ConversationDetailSequence'')::INT'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'FinalStep' THEN '($1->>''FinalStep'')'
        WHEN 'FinalPayload' THEN '($1->>''FinalPayload'')'
        WHEN 'Message' THEN '($1->>''Message'')'
        WHEN 'LastRunID' THEN '($1->>''LastRunID'')::UUID'
        WHEN 'StartingPayload' THEN '($1->>''StartingPayload'')'
        WHEN 'TotalPromptIterations' THEN 'COALESCE(($1->>''TotalPromptIterations'')::INT, 0)'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'OverrideModelID' THEN '($1->>''OverrideModelID'')::UUID'
        WHEN 'OverrideVendorID' THEN '($1->>''OverrideVendorID'')::UUID'
        WHEN 'Data' THEN '($1->>''Data'')'
        WHEN 'Verbose' THEN '($1->>''Verbose'')::BOOLEAN'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'ScheduledJobRunID' THEN '($1->>''ScheduledJobRunID'')::UUID'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'PrimaryScopeEntityID' THEN '($1->>''PrimaryScopeEntityID'')::UUID'
        WHEN 'PrimaryScopeRecordID' THEN '($1->>''PrimaryScopeRecordID'')'
        WHEN 'SecondaryScopes' THEN '($1->>''SecondaryScopes'')'
        WHEN 'ExternalReferenceID' THEN '($1->>''ExternalReferenceID'')'
        WHEN 'CompanyID' THEN '($1->>''CompanyID'')::UUID'
        WHEN 'TotalCacheReadTokensUsed' THEN '($1->>''TotalCacheReadTokensUsed'')::INT'
        WHEN 'TotalCacheWriteTokensUsed' THEN '($1->>''TotalCacheWriteTokensUsed'')::INT'
        WHEN 'LastHeartbeatAt' THEN '($1->>''LastHeartbeatAt'')::TIMESTAMPTZ'
        WHEN 'AgentSessionID' THEN '($1->>''AgentSessionID'')::UUID'
        WHEN 'PlanMode' THEN 'COALESCE(($1->>''PlanMode'')::BOOLEAN, FALSE)'
        WHEN 'ExternalSessionID' THEN '($1->>''ExternalSessionID'')'
        WHEN 'ContinuationDepth' THEN 'COALESCE(($1->>''ContinuationDepth'')::INTEGER, 0)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIAgentRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIAgentRun"
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
        "TotalTokensUsed" = CASE WHEN p_data ? 'TotalTokensUsed' THEN (p_data->>'TotalTokensUsed')::INT ELSE "TotalTokensUsed" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "TotalPromptTokensUsed" = CASE WHEN p_data ? 'TotalPromptTokensUsed' THEN (p_data->>'TotalPromptTokensUsed')::INT ELSE "TotalPromptTokensUsed" END,
        "TotalCompletionTokensUsed" = CASE WHEN p_data ? 'TotalCompletionTokensUsed' THEN (p_data->>'TotalCompletionTokensUsed')::INT ELSE "TotalCompletionTokensUsed" END,
        "TotalTokensUsedRollup" = CASE WHEN p_data ? 'TotalTokensUsedRollup' THEN (p_data->>'TotalTokensUsedRollup')::INT ELSE "TotalTokensUsedRollup" END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_data ? 'TotalPromptTokensUsedRollup' THEN (p_data->>'TotalPromptTokensUsedRollup')::INT ELSE "TotalPromptTokensUsedRollup" END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_data ? 'TotalCompletionTokensUsedRollup' THEN (p_data->>'TotalCompletionTokensUsedRollup')::INT ELSE "TotalCompletionTokensUsedRollup" END,
        "TotalCostRollup" = CASE WHEN p_data ? 'TotalCostRollup' THEN (p_data->>'TotalCostRollup')::DECIMAL(19, 8) ELSE "TotalCostRollup" END,
        "ConversationDetailID" = CASE WHEN p_data ? 'ConversationDetailID' THEN (p_data->>'ConversationDetailID')::UUID ELSE "ConversationDetailID" END,
        "ConversationDetailSequence" = CASE WHEN p_data ? 'ConversationDetailSequence' THEN (p_data->>'ConversationDetailSequence')::INT ELSE "ConversationDetailSequence" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "FinalStep" = CASE WHEN p_data ? 'FinalStep' THEN (p_data->>'FinalStep') ELSE "FinalStep" END,
        "FinalPayload" = CASE WHEN p_data ? 'FinalPayload' THEN (p_data->>'FinalPayload') ELSE "FinalPayload" END,
        "Message" = CASE WHEN p_data ? 'Message' THEN (p_data->>'Message') ELSE "Message" END,
        "LastRunID" = CASE WHEN p_data ? 'LastRunID' THEN (p_data->>'LastRunID')::UUID ELSE "LastRunID" END,
        "StartingPayload" = CASE WHEN p_data ? 'StartingPayload' THEN (p_data->>'StartingPayload') ELSE "StartingPayload" END,
        "TotalPromptIterations" = CASE WHEN p_data ? 'TotalPromptIterations' THEN (p_data->>'TotalPromptIterations')::INT ELSE "TotalPromptIterations" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "OverrideModelID" = CASE WHEN p_data ? 'OverrideModelID' THEN (p_data->>'OverrideModelID')::UUID ELSE "OverrideModelID" END,
        "OverrideVendorID" = CASE WHEN p_data ? 'OverrideVendorID' THEN (p_data->>'OverrideVendorID')::UUID ELSE "OverrideVendorID" END,
        "Data" = CASE WHEN p_data ? 'Data' THEN (p_data->>'Data') ELSE "Data" END,
        "Verbose" = CASE WHEN p_data ? 'Verbose' THEN (p_data->>'Verbose')::BOOLEAN ELSE "Verbose" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "ScheduledJobRunID" = CASE WHEN p_data ? 'ScheduledJobRunID' THEN (p_data->>'ScheduledJobRunID')::UUID ELSE "ScheduledJobRunID" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "PrimaryScopeEntityID" = CASE WHEN p_data ? 'PrimaryScopeEntityID' THEN (p_data->>'PrimaryScopeEntityID')::UUID ELSE "PrimaryScopeEntityID" END,
        "PrimaryScopeRecordID" = CASE WHEN p_data ? 'PrimaryScopeRecordID' THEN (p_data->>'PrimaryScopeRecordID') ELSE "PrimaryScopeRecordID" END,
        "SecondaryScopes" = CASE WHEN p_data ? 'SecondaryScopes' THEN (p_data->>'SecondaryScopes') ELSE "SecondaryScopes" END,
        "ExternalReferenceID" = CASE WHEN p_data ? 'ExternalReferenceID' THEN (p_data->>'ExternalReferenceID') ELSE "ExternalReferenceID" END,
        "CompanyID" = CASE WHEN p_data ? 'CompanyID' THEN (p_data->>'CompanyID')::UUID ELSE "CompanyID" END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_data ? 'TotalCacheReadTokensUsed' THEN (p_data->>'TotalCacheReadTokensUsed')::INT ELSE "TotalCacheReadTokensUsed" END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_data ? 'TotalCacheWriteTokensUsed' THEN (p_data->>'TotalCacheWriteTokensUsed')::INT ELSE "TotalCacheWriteTokensUsed" END,
        "LastHeartbeatAt" = CASE WHEN p_data ? 'LastHeartbeatAt' THEN (p_data->>'LastHeartbeatAt')::TIMESTAMPTZ ELSE "LastHeartbeatAt" END,
        "AgentSessionID" = CASE WHEN p_data ? 'AgentSessionID' THEN (p_data->>'AgentSessionID')::UUID ELSE "AgentSessionID" END,
        "PlanMode" = CASE WHEN p_data ? 'PlanMode' THEN (p_data->>'PlanMode')::BOOLEAN ELSE "PlanMode" END,
        "ExternalSessionID" = CASE WHEN p_data ? 'ExternalSessionID' THEN (p_data->>'ExternalSessionID') ELSE "ExternalSessionID" END,
        "ContinuationDepth" = CASE WHEN p_data ? 'ContinuationDepth' THEN (p_data->>'ContinuationDepth')::INTEGER ELSE "ContinuationDepth" END,
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
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON "__mj"."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON "__mj"."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_run"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Skills.ActivatedByRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationSkill"
        WHERE "ActivatedByRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationSkill"
        SET "ActivatedByRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Session Iterations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSessionIteration"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSessionIteration"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Sessions.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSession"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSession"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Process Run Details.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ProcessRunDetail"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ProcessRunDetail"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Integration";

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
