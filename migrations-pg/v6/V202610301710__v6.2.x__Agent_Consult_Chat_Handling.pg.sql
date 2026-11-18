-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610301710__v6.2.x__Agent_Consult_Chat_Handling.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The transpiler reported 1 sp_updateextendedproperty call(s) as unhandled; each is written as
-- COMMENT ON COLUMN below, with the SQL Server text unchanged.
-- ╚════════════════════════════════════════╝

ALTER TABLE __mj."AIAgent"
DROP CONSTRAINT "CK_AIAgent_ChatHandlingOption" /* ===================================================================================== */ /* Agent Consult chat handling, MaxSubAgentConsultRounds, and relationship preset default */ /* 1. Widens AIAgent.ChatHandlingOption CHECK constraint to include 'Consult'. */ /* 2. Adds AIAgent.MaxSubAgentConsultRounds (INT NULL, > 0). */ /* 3. Adds AIAgentRelationship.ChatHandlingOption and ConfigurationPresetID in one ALTER TABLE. */ /* Plan: plans/video-studio.md §4.4, §6.2, §6.5, §15 (VS-CON-1). */ /* ===================================================================================== */;

ALTER TABLE __mj."AIAgent"
  ADD CONSTRAINT "CK_AIAgent_ChatHandlingOption" CHECK ("ChatHandlingOption" IN ('Consult', 'Failed', 'Retry', 'Success'));

COMMENT ON COLUMN __mj."AIAgent"."ChatHandlingOption" IS 'Controls how Chat next steps are handled. NULL (default): Chat propagates to the caller. Success, Failed or Retry: the Chat is remapped to that step. Consult: when a sub-agent of this agent returns Chat, this agent answers it itself (or asks its own caller) instead of ending its run; this agent''s own Chat still goes to its caller. AIAgentRelationship.ChatHandlingOption overrides this per sub-agent.';

ALTER TABLE __mj."AIAgent"
  ADD COLUMN "MaxSubAgentConsultRounds" INT NULL CONSTRAINT "CK_AIAgent_MaxSubAgentConsultRounds" CHECK ("MaxSubAgentConsultRounds" > 0);

ALTER TABLE __mj."AIAgentRelationship"
  ADD COLUMN "ChatHandlingOption" VARCHAR(30) NULL CONSTRAINT "CK_AIAgentRelationship_ChatHandlingOption" CHECK ("ChatHandlingOption" IN ('Consult', 'Failed', 'Retry', 'Success')),
  ADD COLUMN "ConfigurationPresetID" UUID NULL CONSTRAINT "FK_AIAgentRelationship_ConfigurationPreset" REFERENCES __mj."AIAgentConfiguration" (
    "ID"
  );

COMMENT ON COLUMN __mj."AIAgent"."MaxSubAgentConsultRounds" IS 'Maximum number of Consult rounds this agent answers for a sub-agent before that sub-agent''s question propagates to this agent''s caller. NULL uses the framework default (3).';

COMMENT ON COLUMN __mj."AIAgentRelationship"."ChatHandlingOption" IS 'How the parent agent handles a Chat step returned by this sub-agent. Same values as AIAgent.ChatHandlingOption. NULL inherits the parent agent''s ChatHandlingOption.';

COMMENT ON COLUMN __mj."AIAgentRelationship"."ConfigurationPresetID" IS 'Default configuration preset (an MJ: AI Agent Configurations row of the sub-agent) the parent uses when it calls this sub-agent. NULL runs the sub-agent under the parent''s configuration. A per-call presetName overrides it.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f898cb1f-f639-4b1c-8f10-e71f22d53cd7' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'MaxSubAgentConsultRounds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f898cb1f-f639-4b1c-8f10-e71f22d53cd7', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' /* Entity: MJ: AI Agents */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1'), 'MaxSubAgentConsultRounds', 'Max Sub Agent Consult Rounds', 'Maximum number of Consult rounds this agent answers for a sub-agent before that sub-agent''s question propagates to this agent''s caller. NULL uses the framework default (3).', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70be1e54-f129-422d-b8a2-62e3906f155d' OR ("EntityID" = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND "Name" = 'ChatHandlingOption')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('70be1e54-f129-422d-b8a2-62e3906f155d', '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' /* Entity: MJ: AI Agent Relationships */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7'), 'ChatHandlingOption', 'Chat Handling Option', 'How the parent agent handles a Chat step returned by this sub-agent. Same values as AIAgent.ChatHandlingOption. NULL inherits the parent agent''s ChatHandlingOption.', 'nvarchar', 60, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '66313bfd-c0c6-4c0e-b114-3fc42c15968a' OR ("EntityID" = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND "Name" = 'ConfigurationPresetID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('66313bfd-c0c6-4c0e-b114-3fc42c15968a', '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' /* Entity: MJ: AI Agent Relationships */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7'), 'ConfigurationPresetID', 'Configuration Preset ID', 'Default configuration preset (an MJ: AI Agent Configurations row of the sub-agent) the parent uses when it calls this sub-agent. NULL runs the sub-agent under the parent''s configuration. A per-call presetName overrides it.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to sync EntityField.Description with updated MS_Description on AIAgent.ChatHandlingOption */
UPDATE __mj."EntityField" SET "Description" = 'Controls how Chat next steps are handled. NULL (default): Chat propagates to the caller. Success, Failed or Retry: the Chat is remapped to that step. Consult: when a sub-agent of this agent returns Chat, this agent answers it itself (or asks its own caller) instead of ending its run; this agent''s own Chat still goes to its caller. AIAgentRelationship.ChatHandlingOption overrides this per sub-agent.', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51';
/* SQL text to insert entity field value with ID 50407925-37fb-4851-a687-1f216c79611c */
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
    '50407925-37fb-4851-a687-1f216c79611c',
    'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51',
    1,
    'Consult',
    'Consult',
    NOW(),
    NOW()
  );
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 2
WHERE
  "ID" = '64DB372B-17AA-44AF-A14B-82F76D83A8AA';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 3
WHERE
  "ID" = '71EA0AF7-BD9D-4883-B414-B2947B3A9310';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 4
WHERE
  "ID" = 'ECB168D8-63EA-4B64-A140-9B255B6EF260';
/* SQL text to insert entity field value with ID d2f2bcf6-6f17-440e-af49-3d0e8f99ee85 */
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
    'd2f2bcf6-6f17-440e-af49-3d0e8f99ee85',
    '70BE1E54-F129-422D-B8A2-62E3906F155D',
    1,
    'Consult',
    'Consult',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6a6aaefa-0a6b-4458-95aa-12b632925d74 */
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
    '6a6aaefa-0a6b-4458-95aa-12b632925d74',
    '70BE1E54-F129-422D-B8A2-62E3906F155D',
    2,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0d80677c-f260-4735-b82f-e42972360443 */
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
    '0d80677c-f260-4735-b82f-e42972360443',
    '70BE1E54-F129-422D-B8A2-62E3906F155D',
    3,
    'Retry',
    'Retry',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 9ae45f2f-98c3-4475-8599-6c9b49741fd3 */
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
    '9ae45f2f-98c3-4475-8599-6c9b49741fd3',
    '70BE1E54-F129-422D-B8A2-62E3906F155D',
    4,
    'Success',
    'Success',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 70BE1E54-F129-422D-B8A2-62E3906F155D */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '70BE1E54-F129-422D-B8A2-62E3906F155D';
/* Create Entity Relationship: MJ: AI Agent Configurations -> MJ: AI Agent Relationships (One To Many via ConfigurationPresetID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '13aaaabc-a3dc-4d43-9093-9777b257c4db') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('13aaaabc-a3dc-4d43-9093-9777b257c4db', '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', 'ConfigurationPresetID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6080cadd-c2df-42ee-8559-3b6c97ccc1f9' OR ("EntityID" = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND "Name" = 'ConfigurationPreset')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6080cadd-c2df-42ee-8559-3b6c97ccc1f9', '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' /* Entity: MJ: AI Agent Relationships */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7'), 'ConfigurationPreset', 'Configuration Preset', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;
