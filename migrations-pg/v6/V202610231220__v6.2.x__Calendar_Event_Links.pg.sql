-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610231220__v6.2.x__Calendar_Event_Links.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================ */
/* Calendars in Communication (plan: plans/bound-data-access-and-calendars.md, A18) */
/* ============================================================================ */
/* CalendarEventLink ties any record to an event in one external calendar */
/* (Outlook through MS Graph, Google Calendar), so an app needs no calendar */
/* column on its own tables. The provider's event ID is per mailbox; the */
/* iCalendar UID is the same in every attendee's calendar, so it is what */
/* another app matches on. */
/* CalendarSyncState holds one sync cursor per calendar (a Graph delta link or a */
/* Google sync token). Both providers issue cursors per calendar, not per event, */
/* so the cursor does not live on the link. */
/* Additive only. CodeGen owns the entities, views, procedures and generated */
/* classes. PostgreSQL counterpart is produced by the release build. */
/* ============================================================================ */
CREATE TABLE __mj."CalendarEventLink" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "CommunicationProviderID" UUID NOT NULL,
  "AccountIdentifier" VARCHAR(255) NOT NULL,
  "CalendarID" VARCHAR(500) NULL,
  "ExternalEventID" VARCHAR(500) NOT NULL,
  "ExternalSeriesID" VARCHAR(500) NULL,
  "ICalUID" VARCHAR(1000) NULL,
  "EntityID" UUID NOT NULL,
  "RecordID" VARCHAR(450) NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
  "LastSyncedAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_CalendarEventLink" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_CalendarEventLink_CommunicationProvider" FOREIGN KEY ("CommunicationProviderID") REFERENCES __mj."CommunicationProvider" (
    "ID"
  ),
  CONSTRAINT "FK_CalendarEventLink_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "CK_CalendarEventLink_Status" CHECK ("Status" IN ('Active', 'Cancelled'))
);

CREATE TABLE __mj."CalendarSyncState" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "CommunicationProviderID" UUID NOT NULL,
  "AccountIdentifier" VARCHAR(255) NOT NULL,
  "CalendarID" VARCHAR(500) NULL,
  "SyncToken" TEXT NULL,
  "LastSyncedAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_CalendarSyncState" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_CalendarSyncState_CommunicationProvider" FOREIGN KEY ("CommunicationProviderID") REFERENCES __mj."CommunicationProvider" (
    "ID"
  ),
  CONSTRAINT "UQ_CalendarSyncState_Calendar" UNIQUE (
    "CommunicationProviderID",
    "AccountIdentifier",
    "CalendarID"
  )
);

COMMENT ON TABLE __mj."CalendarEventLink" IS 'Ties a record to an event in an external calendar (MS Graph, Google Calendar), so any record can be linked to an event without a calendar column on its own table.';

COMMENT ON COLUMN __mj."CalendarEventLink"."AccountIdentifier" IS 'The calendar account the event lives in: a mailbox address for MS Graph, the account for Google. Later syncs and changes go to the same account.';

COMMENT ON COLUMN __mj."CalendarEventLink"."CalendarID" IS 'The calendar within the account. Null means the account''s default calendar.';

COMMENT ON COLUMN __mj."CalendarEventLink"."ExternalEventID" IS 'The provider''s ID for the event in this account. It differs between attendees'' calendars; match across calendars on ICalUID.';

COMMENT ON COLUMN __mj."CalendarEventLink"."ExternalSeriesID" IS 'The provider''s ID for the recurring series this event belongs to, when it is an occurrence or exception of one.';

COMMENT ON COLUMN __mj."CalendarEventLink"."ICalUID" IS 'The event''s iCalendar UID (Graph iCalUId, Google iCalUID). The same in every attendee''s calendar, so other apps match an imported event to this link by it.';

COMMENT ON COLUMN __mj."CalendarEventLink"."EntityID" IS 'The entity of the linked record.';

COMMENT ON COLUMN __mj."CalendarEventLink"."RecordID" IS 'The linked record''s primary key, in the compact URL-segment form (a bare value for a single-column key).';

COMMENT ON COLUMN __mj."CalendarEventLink"."Status" IS 'Active, or Cancelled once the event is cancelled, in the calendar or through MemberJunction.';

COMMENT ON COLUMN __mj."CalendarEventLink"."LastSyncedAt" IS 'When a change to this event was last read from or written to the calendar.';

COMMENT ON TABLE __mj."CalendarSyncState" IS 'One sync cursor per external calendar, so an incremental sync reads only what changed since the last one.';

COMMENT ON COLUMN __mj."CalendarSyncState"."AccountIdentifier" IS 'The calendar account: a mailbox address for MS Graph, the account for Google.';

COMMENT ON COLUMN __mj."CalendarSyncState"."CalendarID" IS 'The calendar within the account. Null means the account''s default calendar.';

COMMENT ON COLUMN __mj."CalendarSyncState"."SyncToken" IS 'The provider''s cursor for the next incremental sync: a Graph delta link or a Google sync token. Null until the first sync.';

COMMENT ON COLUMN __mj."CalendarSyncState"."LastSyncedAt" IS 'When this calendar was last synced.';

/* ============================================================================
   EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.

   It holds the Entity and EntityField rows for MJ: Calendar Event Links and
   MJ: Calendar Sync States, their timestamp columns, value lists, foreign-key
   indexes, base views, spCreate / spUpdate / spDelete procedures, update
   triggers, entity permissions, application entities and grants.

   DO NOT EDIT BY HAND. If the DDL above changes, re-run CodeGen and replace
   this entire generated section.
   ============================================================================ */
/* SQL generated to create new entity MJ: Calendar Event Links */
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
    'bd4b67c8-001b-4cd3-af76-29f56b9f28b9',
    'MJ: Calendar Event Links',
    'Calendar Event Links',
    'Ties a record to an event in an external calendar (MS Graph, Google Calendar), so any record can be linked to an event without a calendar column on its own table.',
    NULL,
    'CalendarEventLink',
    'vwCalendarEventLinks',
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
/* SQL generated to add new entity MJ: Calendar Event Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'bd4b67c8-001b-4cd3-af76-29f56b9f28b9',
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
/* SQL generated to add new permission for entity MJ: Calendar Event Links for role UI */
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
  CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS UUID),
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
      "EntityID" = CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Calendar Event Links for role Developer */
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
  CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS UUID),
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
      "EntityID" = CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Calendar Event Links for role Integration */
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
  CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS UUID),
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
      "EntityID" = CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Calendar Sync States */
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
    '4b414728-c375-4cb4-987d-1b6a440fd239',
    'MJ: Calendar Sync States',
    'Calendar Sync States',
    'One sync cursor per external calendar, so an incremental sync reads only what changed since the last one.',
    NULL,
    'CalendarSyncState',
    'vwCalendarSyncStates',
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
/* SQL generated to add new entity MJ: Calendar Sync States to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '4b414728-c375-4cb4-987d-1b6a440fd239',
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
/* SQL generated to add new permission for entity MJ: Calendar Sync States for role UI */
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
  CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS UUID),
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
      "EntityID" = CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Calendar Sync States for role Developer */
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
  CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS UUID),
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
      "EntityID" = CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Calendar Sync States for role Integration */
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
  CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS UUID),
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
      "EntityID" = CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."CalendarSyncState"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.CalendarSyncState */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.CalendarSyncState */
UPDATE __mj."CalendarSyncState" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'CalendarSyncState' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CalendarSyncState" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."CalendarSyncState" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."CalendarSyncState"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.CalendarSyncState */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.CalendarSyncState */
UPDATE __mj."CalendarSyncState" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'CalendarSyncState' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CalendarSyncState" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."CalendarSyncState" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."CalendarEventLink"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.CalendarEventLink */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.CalendarEventLink */
UPDATE __mj."CalendarEventLink" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'CalendarEventLink' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CalendarEventLink" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."CalendarEventLink" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."CalendarEventLink"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.CalendarEventLink */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.CalendarEventLink */
UPDATE __mj."CalendarEventLink" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'CalendarEventLink' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CalendarEventLink" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."CalendarEventLink" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d8098f4-1b36-4d5d-9696-a8c80d4a5ec1' OR ("EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2d8098f4-1b36-4d5d-9696-a8c80d4a5ec1', '4B414728-C375-4CB4-987D-1B6A440FD239' /* Entity: MJ: Calendar Sync States */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '59798844-986f-4d66-86c0-209d1fbe0b03' OR ("EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239' AND "Name" = 'CommunicationProviderID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('59798844-986f-4d66-86c0-209d1fbe0b03', '4B414728-C375-4CB4-987D-1B6A440FD239' /* Entity: MJ: Calendar Sync States */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239'), 'CommunicationProviderID', 'Communication Provider ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '43248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a717a8d3-2df6-4f4e-bc57-9038a241ccd4' OR ("EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239' AND "Name" = 'AccountIdentifier')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a717a8d3-2df6-4f4e-bc57-9038a241ccd4', '4B414728-C375-4CB4-987D-1B6A440FD239' /* Entity: MJ: Calendar Sync States */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239'), 'AccountIdentifier', 'Account Identifier', 'The calendar account: a mailbox address for MS Graph, the account for Google.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e076a5b1-a440-4e75-b540-73ba54eae106' OR ("EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239' AND "Name" = 'CalendarID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e076a5b1-a440-4e75-b540-73ba54eae106', '4B414728-C375-4CB4-987D-1B6A440FD239' /* Entity: MJ: Calendar Sync States */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239'), 'CalendarID', 'Calendar ID', 'The calendar within the account. Null means the account''s default calendar.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1fa9467c-804d-4ecd-832d-fa54e9a57625' OR ("EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239' AND "Name" = 'SyncToken')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1fa9467c-804d-4ecd-832d-fa54e9a57625', '4B414728-C375-4CB4-987D-1B6A440FD239' /* Entity: MJ: Calendar Sync States */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239'), 'SyncToken', 'Sync Token', 'The provider''s cursor for the next incremental sync: a Graph delta link or a Google sync token. Null until the first sync.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8399b914-7dc5-47a8-942b-726b09744fd4' OR ("EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239' AND "Name" = 'LastSyncedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8399b914-7dc5-47a8-942b-726b09744fd4', '4B414728-C375-4CB4-987D-1B6A440FD239' /* Entity: MJ: Calendar Sync States */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239'), 'LastSyncedAt', 'Last Synced At', 'When this calendar was last synced.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '96e27352-008a-4cb6-946d-becc6ce900ba' OR ("EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('96e27352-008a-4cb6-946d-becc6ce900ba', '4B414728-C375-4CB4-987D-1B6A440FD239' /* Entity: MJ: Calendar Sync States */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9196cfac-7cba-4474-85bb-9a685b23feae' OR ("EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9196cfac-7cba-4474-85bb-9a685b23feae', '4B414728-C375-4CB4-987D-1B6A440FD239' /* Entity: MJ: Calendar Sync States */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd752fc0e-9358-4d9d-876c-1cde14c0c609' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d752fc0e-9358-4d9d-876c-1cde14c0c609', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6b9d4f74-59ab-474b-8994-d1914aca3269' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'CommunicationProviderID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6b9d4f74-59ab-474b-8994-d1914aca3269', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'CommunicationProviderID', 'Communication Provider ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '43248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd91c61bf-50e9-42fa-bde2-df2b2ec64da3' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'AccountIdentifier')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d91c61bf-50e9-42fa-bde2-df2b2ec64da3', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'AccountIdentifier', 'Account Identifier', 'The calendar account the event lives in: a mailbox address for MS Graph, the account for Google. Later syncs and changes go to the same account.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ab26805-577c-4379-9de1-bbf9e3ee41df' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'CalendarID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8ab26805-577c-4379-9de1-bbf9e3ee41df', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'CalendarID', 'Calendar ID', 'The calendar within the account. Null means the account''s default calendar.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '96c68d32-f638-48c6-9795-c8d1ce40cdb0' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'ExternalEventID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('96c68d32-f638-48c6-9795-c8d1ce40cdb0', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'ExternalEventID', 'External Event ID', 'The provider''s ID for the event in this account. It differs between attendees'' calendars; match across calendars on ICalUID.', 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a6aaf851-0c4f-404d-b9bb-527078f71f21' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'ExternalSeriesID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a6aaf851-0c4f-404d-b9bb-527078f71f21', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'ExternalSeriesID', 'External Series ID', 'The provider''s ID for the recurring series this event belongs to, when it is an occurrence or exception of one.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bc3dbd3e-db48-4d6b-8ade-829ec3d288d3' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'ICalUID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bc3dbd3e-db48-4d6b-8ade-829ec3d288d3', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'ICalUID', 'I Cal UID', 'The event''s iCalendar UID (Graph iCalUId, Google iCalUID). The same in every attendee''s calendar, so other apps match an imported event to this link by it.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2a7150bb-fb99-4a8d-ae7d-8ef317a41953' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2a7150bb-fb99-4a8d-ae7d-8ef317a41953', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'EntityID', 'Entity ID', 'The entity of the linked record.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b3628115-c987-45d2-96fa-d482c85c1879' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'RecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3628115-c987-45d2-96fa-d482c85c1879', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'RecordID', 'Record ID', 'The linked record''s primary key, in the compact URL-segment form (a bare value for a single-column key).', 'nvarchar', 900, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9fac1feb-d5ec-497d-9f3f-24c6147cb148' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9fac1feb-d5ec-497d-9f3f-24c6147cb148', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'Status', 'Status', 'Active, or Cancelled once the event is cancelled, in the calendar or through MemberJunction.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dd96f403-d05c-4c4d-b24f-2a425dbacf3d' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'LastSyncedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dd96f403-d05c-4c4d-b24f-2a425dbacf3d', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'LastSyncedAt', 'Last Synced At', 'When a change to this event was last read from or written to the calendar.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4950ff63-fcbb-4aa6-8684-efd491c7f6a3' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4950ff63-fcbb-4aa6-8684-efd491c7f6a3', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '28232699-5752-419f-8dea-e4b527810adb' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('28232699-5752-419f-8dea-e4b527810adb', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 5b787265-f0da-4d1c-8b15-66afd975dac4 */
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
    '5b787265-f0da-4d1c-8b15-66afd975dac4',
    '9FAC1FEB-D5EC-497D-9F3F-24C6147CB148',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 9644d709-7e89-4a6e-8f6e-8b9f23051fef */
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
    '9644d709-7e89-4a6e-8f6e-8b9f23051fef',
    '9FAC1FEB-D5EC-497D-9F3F-24C6147CB148',
    2,
    'Cancelled',
    'Cancelled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 9FAC1FEB-D5EC-497D-9F3F-24C6147CB148 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '9FAC1FEB-D5EC-497D-9F3F-24C6147CB148';
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
/* Create Entity Relationship: MJ: Entities -> MJ: Calendar Event Links (One To Many via EntityID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8e3987cb-f354-4804-ae9f-5a8b7c8287c8') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8e3987cb-f354-4804-ae9f-5a8b7c8287c8', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', 'EntityID', 'One To Many', TRUE, TRUE, 88, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '82bc6220-cef0-4acd-af81-2cec55fc9b5d') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('82bc6220-cef0-4acd-af81-2cec55fc9b5d', '43248F34-2837-EF11-86D4-6045BDEE16E6', '4B414728-C375-4CB4-987D-1B6A440FD239', 'CommunicationProviderID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '841ae652-0c62-48a2-91b1-64fa900ac561') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('841ae652-0c62-48a2-91b1-64fa900ac561', '43248F34-2837-EF11-86D4-6045BDEE16E6', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', 'CommunicationProviderID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c23fab56-bc38-4457-b851-14906e156e11' OR ("EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239' AND "Name" = 'CommunicationProvider')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c23fab56-bc38-4457-b851-14906e156e11', '4B414728-C375-4CB4-987D-1B6A440FD239' /* Entity: MJ: Calendar Sync States */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4B414728-C375-4CB4-987D-1B6A440FD239'), 'CommunicationProvider', 'Communication Provider', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0e646f61-86fa-4175-ba64-d8a33693116a' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'CommunicationProvider')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0e646f61-86fa-4175-ba64-d8a33693116a', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'CommunicationProvider', 'Communication Provider', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bcdc3528-74bc-4906-a8aa-798500d72e68' OR ("EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bcdc3528-74bc-4906-a8aa-798500d72e68', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' /* Entity: MJ: Calendar Event Links */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'), 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Event Links
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_calendar_event_link_communication_provider_id"
    ON "__mj"."CalendarEventLink" ("CommunicationProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_calendar_event_link_entity_id"
    ON "__mj"."CalendarEventLink" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Event Links
-- Item: vwCalendarEventLinks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Calendar Event Links
-----               SCHEMA:      __mj
-----               BASE TABLE:  CalendarEventLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwCalendarEventLinks"
AS
SELECT
    c.*,
    MJCommunicationProvider_CommunicationProviderID."Name" AS "CommunicationProvider",
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."CalendarEventLink" AS c
INNER JOIN
    "__mj"."CommunicationProvider" AS MJCommunicationProvider_CommunicationProviderID
  ON
    "c"."CommunicationProviderID" = MJCommunicationProvider_CommunicationProviderID."ID"
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "c"."EntityID" = MJEntity_EntityID."ID"
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
        AND tc.relname = 'vwCalendarEventLinks'
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
                           AND tc.relname = 'vwCalendarEventLinks'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwCalendarEventLinks" CASCADE;
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
GRANT SELECT ON "__mj"."vwCalendarEventLinks" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCalendarEventLinks" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwCalendarEventLinks" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Event Links
-- Item: spCreateCalendarEventLink
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CalendarEventLink
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCalendarEventLink'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCalendarEventLink"(
    p_id UUID DEFAULT NULL,
    p_communicationproviderid UUID DEFAULT NULL,
    p_accountidentifier varchar(255) DEFAULT NULL,
    p_calendarid_clear boolean DEFAULT false,
    p_calendarid varchar(500) DEFAULT NULL,
    p_externaleventid varchar(500) DEFAULT NULL,
    p_externalseriesid_clear boolean DEFAULT false,
    p_externalseriesid varchar(500) DEFAULT NULL,
    p_icaluid_clear boolean DEFAULT false,
    p_icaluid varchar(1000) DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwCalendarEventLinks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CalendarEventLink"
        (
            "ID",
            "CommunicationProviderID",
                "AccountIdentifier",
                "CalendarID",
                "ExternalEventID",
                "ExternalSeriesID",
                "ICalUID",
                "EntityID",
                "RecordID",
                "Status",
                "LastSyncedAt"
        )
    VALUES
        (
            v_new_id,
            p_communicationproviderid,
                p_accountidentifier,
                CASE WHEN p_calendarid_clear = true THEN NULL ELSE COALESCE(p_calendarid, NULL) END,
                p_externaleventid,
                CASE WHEN p_externalseriesid_clear = true THEN NULL ELSE COALESCE(p_externalseriesid, NULL) END,
                CASE WHEN p_icaluid_clear = true THEN NULL ELSE COALESCE(p_icaluid, NULL) END,
                p_entityid,
                p_recordid,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCalendarEventLinks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCalendarEventLink" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCalendarEventLink" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Event Links
-- Item: spUpdateCalendarEventLink
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CalendarEventLink
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCalendarEventLink'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCalendarEventLink"(
    p_id UUID,
    p_communicationproviderid UUID DEFAULT NULL,
    p_accountidentifier varchar(255) DEFAULT NULL,
    p_calendarid_clear boolean DEFAULT false,
    p_calendarid varchar(500) DEFAULT NULL,
    p_externaleventid varchar(500) DEFAULT NULL,
    p_externalseriesid_clear boolean DEFAULT false,
    p_externalseriesid varchar(500) DEFAULT NULL,
    p_icaluid_clear boolean DEFAULT false,
    p_icaluid varchar(1000) DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwCalendarEventLinks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CalendarEventLink"
    SET
        "CommunicationProviderID" = COALESCE(p_communicationproviderid, "CommunicationProviderID"),
        "AccountIdentifier" = COALESCE(p_accountidentifier, "AccountIdentifier"),
        "CalendarID" = CASE WHEN p_calendarid_clear = true THEN NULL ELSE COALESCE(p_calendarid, "CalendarID") END,
        "ExternalEventID" = COALESCE(p_externaleventid, "ExternalEventID"),
        "ExternalSeriesID" = CASE WHEN p_externalseriesid_clear = true THEN NULL ELSE COALESCE(p_externalseriesid, "ExternalSeriesID") END,
        "ICalUID" = CASE WHEN p_icaluid_clear = true THEN NULL ELSE COALESCE(p_icaluid, "ICalUID") END,
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "Status" = COALESCE(p_status, "Status"),
        "LastSyncedAt" = CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, "LastSyncedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCalendarEventLinks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCalendarEventLink" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCalendarEventLink" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CalendarEventLink table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_calendar_event_link"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_calendar_event_link" ON "__mj"."CalendarEventLink";

CREATE TRIGGER "trg_update_calendar_event_link"
BEFORE UPDATE ON "__mj"."CalendarEventLink"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_calendar_event_link"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Event Links
-- Item: spDeleteCalendarEventLink
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CalendarEventLink
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCalendarEventLink'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCalendarEventLink"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CalendarEventLink"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCalendarEventLink" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCalendarEventLink" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Sync States
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_calendar_sync_state_communication_provider_id"
    ON "__mj"."CalendarSyncState" ("CommunicationProviderID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Sync States
-- Item: vwCalendarSyncStates
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Calendar Sync States
-----               SCHEMA:      __mj
-----               BASE TABLE:  CalendarSyncState
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwCalendarSyncStates"
AS
SELECT
    c.*,
    MJCommunicationProvider_CommunicationProviderID."Name" AS "CommunicationProvider"
FROM
    "__mj"."CalendarSyncState" AS c
INNER JOIN
    "__mj"."CommunicationProvider" AS MJCommunicationProvider_CommunicationProviderID
  ON
    "c"."CommunicationProviderID" = MJCommunicationProvider_CommunicationProviderID."ID"
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
        AND tc.relname = 'vwCalendarSyncStates'
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
                           AND tc.relname = 'vwCalendarSyncStates'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwCalendarSyncStates" CASCADE;
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
GRANT SELECT ON "__mj"."vwCalendarSyncStates" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCalendarSyncStates" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwCalendarSyncStates" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Sync States
-- Item: spCreateCalendarSyncState
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CalendarSyncState
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCalendarSyncState'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCalendarSyncState"(
    p_id UUID DEFAULT NULL,
    p_communicationproviderid UUID DEFAULT NULL,
    p_accountidentifier varchar(255) DEFAULT NULL,
    p_calendarid_clear boolean DEFAULT false,
    p_calendarid varchar(500) DEFAULT NULL,
    p_synctoken_clear boolean DEFAULT false,
    p_synctoken TEXT DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwCalendarSyncStates" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CalendarSyncState"
        (
            "ID",
            "CommunicationProviderID",
                "AccountIdentifier",
                "CalendarID",
                "SyncToken",
                "LastSyncedAt"
        )
    VALUES
        (
            v_new_id,
            p_communicationproviderid,
                p_accountidentifier,
                CASE WHEN p_calendarid_clear = true THEN NULL ELSE COALESCE(p_calendarid, NULL) END,
                CASE WHEN p_synctoken_clear = true THEN NULL ELSE COALESCE(p_synctoken, NULL) END,
                CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCalendarSyncStates"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCalendarSyncState" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCalendarSyncState" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Sync States
-- Item: spUpdateCalendarSyncState
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CalendarSyncState
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCalendarSyncState'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCalendarSyncState"(
    p_id UUID,
    p_communicationproviderid UUID DEFAULT NULL,
    p_accountidentifier varchar(255) DEFAULT NULL,
    p_calendarid_clear boolean DEFAULT false,
    p_calendarid varchar(500) DEFAULT NULL,
    p_synctoken_clear boolean DEFAULT false,
    p_synctoken TEXT DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwCalendarSyncStates" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CalendarSyncState"
    SET
        "CommunicationProviderID" = COALESCE(p_communicationproviderid, "CommunicationProviderID"),
        "AccountIdentifier" = COALESCE(p_accountidentifier, "AccountIdentifier"),
        "CalendarID" = CASE WHEN p_calendarid_clear = true THEN NULL ELSE COALESCE(p_calendarid, "CalendarID") END,
        "SyncToken" = CASE WHEN p_synctoken_clear = true THEN NULL ELSE COALESCE(p_synctoken, "SyncToken") END,
        "LastSyncedAt" = CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, "LastSyncedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCalendarSyncStates"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCalendarSyncState" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCalendarSyncState" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CalendarSyncState table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_calendar_sync_state"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_calendar_sync_state" ON "__mj"."CalendarSyncState";

CREATE TRIGGER "trg_update_calendar_sync_state"
BEFORE UPDATE ON "__mj"."CalendarSyncState"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_calendar_sync_state"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Calendar Sync States
-- Item: spDeleteCalendarSyncState
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CalendarSyncState
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCalendarSyncState'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCalendarSyncState"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CalendarSyncState"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCalendarSyncState" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCalendarSyncState" TO "cdp_Integration";
