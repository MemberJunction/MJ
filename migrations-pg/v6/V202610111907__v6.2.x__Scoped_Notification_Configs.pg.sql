-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610111907__v6.2.x__Scoped_Notification_Configs.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ===================================================================== */
/* Scoped Notification Configs (v6.2.x) */
/* ===================================================================== */
/* The notification sibling of ScopedPromptConfig. A notification type has */
/* defaults (DefaultInApp / DefaultEmail / DefaultSMS) and a recipient has a */
/* preference (UserNotificationPreference), and nothing between them: no way */
/* for an application, a role, or the thing that caused a notice to say */
/* "not this one". So every Resource Permission an application writes as */
/* plumbing — the system user bridging a roster to a resource's permissions — */
/* sends "System shared X with you" to every grantee (MJ#4946). */
/* This table is that level. One row is one config for one notification type */
/* in one scope, narrowed by the SAME polymorphic scope the AI layer carries */
/* on ScopedPromptConfig, ScopedPromptPart, AIAgentNote, AIAgentExample and */
/* AIAgentRun: a primary record of any entity (an Application, a Role, a User, */
/* a Company) plus JSON secondary dimensions. The first dimension named is */
/* `origin`: Person, System (MJ's Owner-type user) or Automation. */
/* Each channel is Allow, Deny or NULL — the Entity Field Permissions posture. */
/* NULL leaves the channel to the next row. Resolution in NotificationEngine: */
/* most specific in-scope row wins per channel (secondary match +4, primary */
/* record +2, global +1, ties by Priority); at equal specificity one Deny */
/* beats any Allow; a Deny on a row with IsLocked caps every less specific */
/* row and the recipient's own preference. The recipient's preference stays */
/* the last word on any channel no locked row denies. */
/* The one row MJ ships is metadata, not schema (metadata/scoped-notification- */
/* configs/): Resource Shared, origin System, all channels Deny, locked. */
/* Tables created */
/* -------------- */
/*   1. ScopedNotificationConfig */
/* Note: DDL + extended properties only. Views, sprocs, FK indexes, the */
/* __mj_CreatedAt/__mj_UpdatedAt columns + triggers, and the EntityField / */
/* entity-class metadata are all produced by CodeGen from this schema and */
/* appended below the CODEGEN OUTPUT banner. */
/* ===================================================================== */
CREATE TABLE __mj."ScopedNotificationConfig" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "NotificationTypeID" UUID NOT NULL,
  "Description" TEXT NULL,
  "PrimaryScopeEntityID" UUID NULL,
  "PrimaryScopeRecordID" VARCHAR(100) NULL,
  "SecondaryScopes" TEXT NULL,
  "InApp" VARCHAR(20) NULL,
  "Email" VARCHAR(20) NULL,
  "SMS" VARCHAR(20) NULL,
  "IsLocked" BOOLEAN NOT NULL DEFAULT FALSE,
  "Priority" INT NOT NULL DEFAULT (
    0
  ),
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  CONSTRAINT "PK_ScopedNotificationConfig" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_ScopedNotificationConfig_NotificationType" FOREIGN KEY ("NotificationTypeID") REFERENCES __mj."UserNotificationType" (
    "ID"
  ),
  CONSTRAINT "FK_ScopedNotificationConfig_PrimaryScopeEntity" FOREIGN KEY ("PrimaryScopeEntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "CK_ScopedNotificationConfig_PrimaryScope" CHECK ("PrimaryScopeRecordID" IS NULL OR NOT "PrimaryScopeEntityID" IS NULL),
  CONSTRAINT "CK_ScopedNotificationConfig_InApp" CHECK ("InApp" IS NULL OR "InApp" IN ('Allow', 'Deny')),
  CONSTRAINT "CK_ScopedNotificationConfig_Email" CHECK ("Email" IS NULL OR "Email" IN ('Allow', 'Deny')),
  CONSTRAINT "CK_ScopedNotificationConfig_SMS" CHECK ("SMS" IS NULL OR "SMS" IN ('Allow', 'Deny')),
  CONSTRAINT "CK_ScopedNotificationConfig_AnyChannel" CHECK (NOT "InApp" IS NULL OR NOT "Email" IS NULL OR NOT "SMS" IS NULL),
  CONSTRAINT "CK_ScopedNotificationConfig_Status" CHECK ("Status" IN ('Active', 'Provisional', 'Archived'))
);

COMMENT ON TABLE __mj."ScopedNotificationConfig" IS 'A notification config at one scope: the level between a notification type''s defaults and a recipient''s preference where an application, a role, a user or the notice''s origin can allow or deny a channel. Scoped by the same primary record + secondary dimensions as Scoped Prompt Configs. Resolution: most specific in-scope row wins per channel; at equal specificity Deny beats Allow; a locked Deny caps every level below it, the recipient''s preference included.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."NotificationTypeID" IS 'The notification type this config is for.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."Description" IS 'Why the row exists, for the administrator who finds it.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."PrimaryScopeEntityID" IS 'The entity of the primary scope record (Applications, Roles, Users, Companies, ...). NULL with PrimaryScopeRecordID NULL = a global row.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."PrimaryScopeRecordID" IS 'The record ID within the primary scope entity this config is scoped to. NULL = global. In scope when it is the caller''s primary scope record, the recipient, or a role the recipient holds.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."SecondaryScopes" IS 'JSON object of additional scope dimensions, e.g. {"origin":"System"}. Every dimension named must match the notice''s scope for the row to apply. origin is Person, System (the Owner-type user) or Automation.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."InApp" IS 'The in-app channel: Allow, Deny, or NULL to leave it to the next row.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."Email" IS 'The email channel: Allow, Deny, or NULL to leave it to the next row.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."SMS" IS 'The SMS channel: Allow, Deny, or NULL to leave it to the next row.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."IsLocked" IS 'When set, a Deny on this row is absorbing: no less specific row and no recipient preference may turn the channel on. The way a notification type''s AllowUserPreference caps the recipient today.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."Priority" IS 'Tie-break for resolution. Higher wins when two rows tie on scope specificity and neither denies. Default 0.';

COMMENT ON COLUMN __mj."ScopedNotificationConfig"."Status" IS 'Lifecycle: Active (live), Provisional (staged; eligible), Archived (excluded from resolution).';

/* *************************************************************************************************
 **************************************************************************************************
 **                                                                                              **
 **                    GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND                 **
 **                                                                                              **
 **  Everything below this block was produced by `mj codegen` against the schema above, on a    **
 **  database built from scratch for this branch (MJ_6_2_0_NOTIF_4946). It contains:            **
 **    • Entity / EntityField / EntityFieldValue / EntityPermission metadata rows                **
 **    • __mj_CreatedAt / __mj_UpdatedAt columns + their triggers                                 **
 **    • foreign-key indexes (IDX_AUTO_MJ_FKEY_*)                                                 **
 **    • base view (vwScopedNotificationConfigs)                                                  **
 **    • CRUD stored procedures (spCreate/spUpdate/spDelete)                                      **
 **                                                                                              **
 **  It is appended here — rather than left as a standalone CodeGen_Run_*.sql file — so the whole **
 **  ScopedNotificationConfig schema (hand-authored DDL + generated objects) applies as ONE       **
 **  migration, per MJ convention. DO NOT hand-edit below this line; it is regenerated by         **
 **  re-running CodeGen.                                                                          **
 **                                                                                              **
 **************************************************************************************************
 ************************************************************************************************* */
/* SQL generated to create new entity MJ: Scoped Notification Configs */
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
    '05323df8-34b1-43b0-9d2f-f8bd8e366883',
    'MJ: Scoped Notification Configs',
    'Scoped Notification Configs',
    'A notification config at one scope: the level between a notification type''s defaults and a recipient''s preference where an application, a role, a user or the notice''s origin can allow or deny a channel. Scoped by the same primary record + secondary dimensions as Scoped Prompt Configs. Resolution: most specific in-scope row wins per channel; at equal specificity Deny beats Allow; a locked Deny caps every level below it, the recipient''s preference included.',
    NULL,
    'ScopedNotificationConfig',
    'vwScopedNotificationConfigs',
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
/* SQL generated to add new entity MJ: Scoped Notification Configs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '05323df8-34b1-43b0-9d2f-f8bd8e366883',
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
/* SQL generated to add new permission for entity MJ: Scoped Notification Configs for role UI */
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
  CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS UUID),
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
      "EntityID" = CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Scoped Notification Configs for role Developer */
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
  CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS UUID),
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
      "EntityID" = CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Scoped Notification Configs for role Integration */
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
  CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS UUID),
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
      "EntityID" = CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."ScopedNotificationConfig"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ScopedNotificationConfig */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ScopedNotificationConfig */
UPDATE __mj."ScopedNotificationConfig" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ScopedNotificationConfig' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ScopedNotificationConfig" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ScopedNotificationConfig" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ScopedNotificationConfig"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ScopedNotificationConfig */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ScopedNotificationConfig */
UPDATE __mj."ScopedNotificationConfig" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ScopedNotificationConfig' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ScopedNotificationConfig" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ScopedNotificationConfig" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd7d218ec-98d8-4b67-a73c-b5cad81ea7c5' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d7d218ec-98d8-4b67-a73c-b5cad81ea7c5', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bd692a9f-45c1-45c1-8a24-1a0786a2341e' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'NotificationTypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bd692a9f-45c1-45c1-8a24-1a0786a2341e', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'NotificationTypeID', 'Notification Type ID', 'The notification type this config is for.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '7AA13345-ACE3-403F-8F5A-CB742AB1C631', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d52283e-d284-4c0e-938c-31a9c11332b8' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4d52283e-d284-4c0e-938c-31a9c11332b8', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'Description', 'Description', 'Why the row exists, for the administrator who finds it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08d78f6e-ce9c-4b72-8944-849c8d7ec97b' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'PrimaryScopeEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('08d78f6e-ce9c-4b72-8944-849c8d7ec97b', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'PrimaryScopeEntityID', 'Primary Scope Entity ID', 'The entity of the primary scope record (Applications, Roles, Users, Companies, ...). NULL with PrimaryScopeRecordID NULL = a global row.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0e5713ec-cc37-4260-b6a7-59675b81a89a' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'PrimaryScopeRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0e5713ec-cc37-4260-b6a7-59675b81a89a', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'PrimaryScopeRecordID', 'Primary Scope Record ID', 'The record ID within the primary scope entity this config is scoped to. NULL = global. In scope when it is the caller''s primary scope record, the recipient, or a role the recipient holds.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '14a0c64f-88e3-4f22-993e-1af4cd87f087' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'SecondaryScopes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14a0c64f-88e3-4f22-993e-1af4cd87f087', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'SecondaryScopes', 'Secondary Scopes', 'JSON object of additional scope dimensions, e.g. {"origin":"System"}. Every dimension named must match the notice''s scope for the row to apply. origin is Person, System (the Owner-type user) or Automation.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2010c79e-283f-4859-9a05-ca6ee1fbba99' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'InApp')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2010c79e-283f-4859-9a05-ca6ee1fbba99', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'InApp', 'In App', 'The in-app channel: Allow, Deny, or NULL to leave it to the next row.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3a550e7d-0333-489d-b0a4-26af7a3c34fd' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'Email')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3a550e7d-0333-489d-b0a4-26af7a3c34fd', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'Email', 'Email', 'The email channel: Allow, Deny, or NULL to leave it to the next row.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c101c3a9-a90e-44b4-be0c-19bab4455dfe' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'SMS')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c101c3a9-a90e-44b4-be0c-19bab4455dfe', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'SMS', 'Sms', 'The SMS channel: Allow, Deny, or NULL to leave it to the next row.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '977545aa-1e83-48ae-8fcf-fc2568d1dcac' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'IsLocked')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('977545aa-1e83-48ae-8fcf-fc2568d1dcac', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'IsLocked', 'Is Locked', 'When set, a Deny on this row is absorbing: no less specific row and no recipient preference may turn the channel on. The way a notification type''s AllowUserPreference caps the recipient today.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9fe0e033-8474-478a-882a-592fe5ad0510' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'Priority')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9fe0e033-8474-478a-882a-592fe5ad0510', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'Priority', 'Priority', 'Tie-break for resolution. Higher wins when two rows tie on scope specificity and neither denies. Default 0.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '836ef9f0-9678-41e3-a340-40d3796badca' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('836ef9f0-9678-41e3-a340-40d3796badca', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'Status', 'Status', 'Lifecycle: Active (live), Provisional (staged; eligible), Archived (excluded from resolution).', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0cf416dd-0aee-4701-b187-193223f671f5' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0cf416dd-0aee-4701-b187-193223f671f5', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e1f8f192-c3ba-4d11-8c4b-b8bb470178f4' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e1f8f192-c3ba-4d11-8c4b-b8bb470178f4', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID d3d9cbae-d5ed-42ad-b3e5-f0c5cd2c4521 */
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
    'd3d9cbae-d5ed-42ad-b3e5-f0c5cd2c4521',
    '2010C79E-283F-4859-9A05-CA6EE1FBBA99',
    1,
    'Allow',
    'Allow',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8b582747-40e9-4fdc-91c2-e8617fc544cc */
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
    '8b582747-40e9-4fdc-91c2-e8617fc544cc',
    '2010C79E-283F-4859-9A05-CA6EE1FBBA99',
    2,
    'Deny',
    'Deny',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 2010C79E-283F-4859-9A05-CA6EE1FBBA99 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '2010C79E-283F-4859-9A05-CA6EE1FBBA99';
/* SQL text to insert entity field value with ID b9250867-e6be-4a3f-8ed8-5a332a3573c7 */
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
    'b9250867-e6be-4a3f-8ed8-5a332a3573c7',
    '3A550E7D-0333-489D-B0A4-26AF7A3C34FD',
    1,
    'Allow',
    'Allow',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f2c0c83a-5d0b-49c9-9e56-980b25f6a3b8 */
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
    'f2c0c83a-5d0b-49c9-9e56-980b25f6a3b8',
    '3A550E7D-0333-489D-B0A4-26AF7A3C34FD',
    2,
    'Deny',
    'Deny',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 3A550E7D-0333-489D-B0A4-26AF7A3C34FD */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '3A550E7D-0333-489D-B0A4-26AF7A3C34FD';
/* SQL text to insert entity field value with ID ced7a9f6-e007-45d9-a5b7-8f6f4a073d24 */
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
    'ced7a9f6-e007-45d9-a5b7-8f6f4a073d24',
    'C101C3A9-A90E-44B4-BE0C-19BAB4455DFE',
    1,
    'Allow',
    'Allow',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0b39abcb-6145-457c-83a6-5180ff89c5e4 */
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
    '0b39abcb-6145-457c-83a6-5180ff89c5e4',
    'C101C3A9-A90E-44B4-BE0C-19BAB4455DFE',
    2,
    'Deny',
    'Deny',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID C101C3A9-A90E-44B4-BE0C-19BAB4455DFE */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'C101C3A9-A90E-44B4-BE0C-19BAB4455DFE';
/* SQL text to insert entity field value with ID 26d53003-6c9f-49a8-a1b1-7a6d6d00f12a */
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
    '26d53003-6c9f-49a8-a1b1-7a6d6d00f12a',
    '836EF9F0-9678-41E3-A340-40D3796BADCA',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5ff00cad-35c4-4fb8-97e3-932601353f55 */
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
    '5ff00cad-35c4-4fb8-97e3-932601353f55',
    '836EF9F0-9678-41E3-A340-40D3796BADCA',
    2,
    'Archived',
    'Archived',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 13a3df12-4cf1-4fde-979d-e0c1be3d169c */
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
    '13a3df12-4cf1-4fde-979d-e0c1be3d169c',
    '836EF9F0-9678-41E3-A340-40D3796BADCA',
    3,
    'Provisional',
    'Provisional',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 836EF9F0-9678-41E3-A340-40D3796BADCA */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '836EF9F0-9678-41E3-A340-40D3796BADCA';
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
/* Create Entity Relationship: MJ: Entities -> MJ: Scoped Notification Configs (One To Many via PrimaryScopeEntityID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '35f9deab-c9e0-4123-b1d1-982471cd670a') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('35f9deab-c9e0-4123-b1d1-982471cd670a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '05323DF8-34B1-43B0-9D2F-F8BD8E366883', 'PrimaryScopeEntityID', 'One To Many', TRUE, TRUE, 82, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b12c2d46-787a-4b85-aa3e-6b272b827601') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b12c2d46-787a-4b85-aa3e-6b272b827601', '7AA13345-ACE3-403F-8F5A-CB742AB1C631', '05323DF8-34B1-43B0-9D2F-F8BD8E366883', 'NotificationTypeID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b82dd394-590f-4a27-90fe-f25dd585e0d3' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'NotificationType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b82dd394-590f-4a27-90fe-f25dd585e0d3', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'NotificationType', 'Notification Type', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0a670edd-e388-4551-9953-5ee7a6e0f7aa' OR ("EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'PrimaryScopeEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0a670edd-e388-4551-9953-5ee7a6e0f7aa', '05323DF8-34B1-43B0-9D2F-F8BD8E366883' /* Entity: MJ: Scoped Notification Configs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'), 'PrimaryScopeEntity', 'Primary Scope Entity', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '977545AA-1E83-48AE-8FCF-FC2568D1DCAC'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '836EF9F0-9678-41E3-A340-40D3796BADCA'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B82DD394-590F-4A27-90FE-F25DD585E0D3'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '0A670EDD-E388-4551-9953-5EE7A6E0F7AA'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 14 fields */
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.NotificationTypeID */
UPDATE __mj."EntityField" SET "Category" = 'Notification Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Notification Type'
WHERE
  "ID" = 'BD692A9F-45C1-45C1-8A24-1A0786A2341E';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.Description */
UPDATE __mj."EntityField" SET "Category" = 'Notification Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4D52283E-D284-4C0E-938C-31A9C11332B8';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.PrimaryScopeEntity */
UPDATE __mj."EntityField" SET "Category" = 'Scope Definition', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0A670EDD-E388-4551-9953-5EE7A6E0F7AA';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.PrimaryScopeEntityID */
UPDATE __mj."EntityField" SET "Category" = 'Scope Definition', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '08D78F6E-CE9C-4B72-8944-849C8D7EC97B';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.PrimaryScopeRecordID */
UPDATE __mj."EntityField" SET "Category" = 'Scope Definition', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0E5713EC-CC37-4260-B6A7-59675B81A89A';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.SecondaryScopes */
UPDATE __mj."EntityField" SET "Category" = 'Scope Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '14A0C64F-88E3-4F22-993E-1AF4CD87F087';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.InApp */
UPDATE __mj."EntityField" SET "Category" = 'Channel Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'In-App Channel'
WHERE
  "ID" = '2010C79E-283F-4859-9A05-CA6EE1FBBA99';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.Email */
UPDATE __mj."EntityField" SET "Category" = 'Channel Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Email Channel'
WHERE
  "ID" = '3A550E7D-0333-489D-B0A4-26AF7A3C34FD';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.SMS */
UPDATE __mj."EntityField" SET "Category" = 'Channel Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'SMS Channel'
WHERE
  "ID" = 'C101C3A9-A90E-44B4-BE0C-19BAB4455DFE';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.Priority */
UPDATE __mj."EntityField" SET "Category" = 'Resolution Rules', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9FE0E033-8474-478A-882A-592FE5AD0510';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.Status */
UPDATE __mj."EntityField" SET "Category" = 'Resolution Rules', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '836EF9F0-9678-41E3-A340-40D3796BADCA';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.NotificationType */
UPDATE __mj."EntityField" SET "Category" = 'Notification Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Notification Type Name'
WHERE
  "ID" = 'B82DD394-590F-4A27-90FE-F25DD585E0D3';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0CF416DD-0AEE-4701-B187-193223F671F5';
/* UPDATE Entity Field Category Info MJ: Scoped Notification Configs.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E1F8F192-C3BA-4D11-8C4B-B8BB470178F4';

/* Set entity icon to fa fa-bell */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-bell', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4c0667b6-35e6-52a0-8e4e-4fc417483a93', '05323DF8-34B1-43B0-9D2F-F8BD8E366883', 'FieldCategoryInfo', '{
  "Channel Settings": {
    "description": "Determines whether specific communication channels are allowed or denied.",
    "icon": "fa fa-broadcast-tower"
  },
  "Notification Configuration": {
    "description": "General settings defining which notification type this configuration governs.",
    "icon": "fa fa-bell"
  },
  "Resolution Rules": {
    "description": "Logic for resolving conflicts and ordering of rules.",
    "icon": "fa fa-balance-scale"
  },
  "Scope Definition": {
    "description": "Defines the specific entities and records to which this notification rule applies.",
    "icon": "fa fa-crosshairs"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields.",
    "icon": "fa fa-cog"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ed68da55-db42-5324-82d1-e2baa3d6b7ab', '05323DF8-34B1-43B0-9D2F-F8BD8E366883', 'FieldCategoryIcons', '{
  "Channel Settings": "fa fa-broadcast-tower",
  "Notification Configuration": "fa fa-bell",
  "Resolution Rules": "fa fa-balance-scale",
  "Scope Definition": "fa fa-crosshairs",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '05323DF8-34B1-43B0-9D2F-F8BD8E366883';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scoped Notification Configs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_scoped_notification_config_notification_type_i"
    ON "__mj"."ScopedNotificationConfig" ("NotificationTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_scoped_notification_config_primary_scope_entit"
    ON "__mj"."ScopedNotificationConfig" ("PrimaryScopeEntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scoped Notification Configs
-- Item: vwScopedNotificationConfigs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Scoped Notification Configs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ScopedNotificationConfig
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwScopedNotificationConfigs"
AS
SELECT
    s.*,
    MJUserNotificationType_NotificationTypeID."Name" AS "NotificationType",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity"
FROM
    "__mj"."ScopedNotificationConfig" AS s
INNER JOIN
    "__mj"."UserNotificationType" AS MJUserNotificationType_NotificationTypeID
  ON
    "s"."NotificationTypeID" = MJUserNotificationType_NotificationTypeID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "s"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"
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
        AND tc.relname = 'vwScopedNotificationConfigs'
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
                           AND tc.relname = 'vwScopedNotificationConfigs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwScopedNotificationConfigs" CASCADE;
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
GRANT SELECT ON "__mj"."vwScopedNotificationConfigs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwScopedNotificationConfigs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwScopedNotificationConfigs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scoped Notification Configs
-- Item: spCreateScopedNotificationConfig
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ScopedNotificationConfig
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateScopedNotificationConfig'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateScopedNotificationConfig"(
    p_id UUID DEFAULT NULL,
    p_notificationtypeid UUID DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid UUID DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid varchar(100) DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes TEXT DEFAULT NULL,
    p_inapp_clear boolean DEFAULT false,
    p_inapp varchar(20) DEFAULT NULL,
    p_email_clear boolean DEFAULT false,
    p_email varchar(20) DEFAULT NULL,
    p_sms_clear boolean DEFAULT false,
    p_sms varchar(20) DEFAULT NULL,
    p_islocked BOOLEAN DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwScopedNotificationConfigs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ScopedNotificationConfig"
        (
            "ID",
            "NotificationTypeID",
                "Description",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "InApp",
                "Email",
                "SMS",
                "IsLocked",
                "Priority",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_notificationtypeid,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, NULL) END,
                CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, NULL) END,
                CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, NULL) END,
                CASE WHEN p_inapp_clear = true THEN NULL ELSE COALESCE(p_inapp, NULL) END,
                CASE WHEN p_email_clear = true THEN NULL ELSE COALESCE(p_email, NULL) END,
                CASE WHEN p_sms_clear = true THEN NULL ELSE COALESCE(p_sms, NULL) END,
                COALESCE(p_islocked, FALSE),
                COALESCE(p_priority, 0),
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwScopedNotificationConfigs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateScopedNotificationConfig" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateScopedNotificationConfig" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scoped Notification Configs
-- Item: spUpdateScopedNotificationConfig
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ScopedNotificationConfig
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateScopedNotificationConfig'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateScopedNotificationConfig"(
    p_id UUID,
    p_notificationtypeid UUID DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid UUID DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid varchar(100) DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes TEXT DEFAULT NULL,
    p_inapp_clear boolean DEFAULT false,
    p_inapp varchar(20) DEFAULT NULL,
    p_email_clear boolean DEFAULT false,
    p_email varchar(20) DEFAULT NULL,
    p_sms_clear boolean DEFAULT false,
    p_sms varchar(20) DEFAULT NULL,
    p_islocked BOOLEAN DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwScopedNotificationConfigs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ScopedNotificationConfig"
    SET
        "NotificationTypeID" = COALESCE(p_notificationtypeid, "NotificationTypeID"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "PrimaryScopeEntityID" = CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, "SecondaryScopes") END,
        "InApp" = CASE WHEN p_inapp_clear = true THEN NULL ELSE COALESCE(p_inapp, "InApp") END,
        "Email" = CASE WHEN p_email_clear = true THEN NULL ELSE COALESCE(p_email, "Email") END,
        "SMS" = CASE WHEN p_sms_clear = true THEN NULL ELSE COALESCE(p_sms, "SMS") END,
        "IsLocked" = COALESCE(p_islocked, "IsLocked"),
        "Priority" = COALESCE(p_priority, "Priority"),
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwScopedNotificationConfigs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateScopedNotificationConfig" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateScopedNotificationConfig" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScopedNotificationConfig table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_scoped_notification_config"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_scoped_notification_config" ON "__mj"."ScopedNotificationConfig";

CREATE TRIGGER "trg_update_scoped_notification_config"
BEFORE UPDATE ON "__mj"."ScopedNotificationConfig"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_scoped_notification_config"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scoped Notification Configs
-- Item: spDeleteScopedNotificationConfig
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ScopedNotificationConfig
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteScopedNotificationConfig'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteScopedNotificationConfig"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ScopedNotificationConfig"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteScopedNotificationConfig" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteScopedNotificationConfig" TO "cdp_Integration";
