-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606151801__v5.41.x__AI_Remote_Browser_Providers.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================
   AI Remote Browser Providers — the backend registry for the Remote Browser channel
   v5.42.x

   Companion plan: /plans/realtime/realtime-bridges-architecture.md (§4d)

   The Remote Browser channel lets an agent drive a real, live browser while it
   talks — a sales agent running an interactive demo, a support agent walking a
   user through a UI, a TRAINER agent that demonstrates a task then hands the
   wheel to the user and watches ("your turn — try X, Y, Z"). It is an in-house
   MJ realtime CHANNEL (not a bridge): its viewport renders in a console panel,
   or screen-shares into a meeting through the bridge's ScreenOut track.

   Every backend sits on the SAME primitive — a Chrome DevTools Protocol (CDP)
   endpoint our @memberjunction/computer-use layer attaches to. This table is
   the registry of those backends:

     * Self-hosted Chrome — we orchestrate a lightweight headless-Chrome
       container (just Chrome + a CDP port; no heavy image) and connect to it.
     * Browser-as-a-Service — Browserbase, Steel, Browserless, Hyperbrowser run
       the browser and expose a CDP connect endpoint (+ a live-view stream and,
       for some, a first-party AI-control harness like Browserbase Stagehand).

   ONE table, mirroring AIBridgeProvider: a driver key resolved via ClassFactory,
   a strongly-typed SupportedFeatures JSON column (the IRemoteBrowserProviderFeatures
   interface, bound via JSONType metadata — capability gating, exactly like
   bridges), and a DefaultControlMode that the channel honors and a per-channel /
   runtime override can change.

   This migration is the schema only — ONE new table, no destructive changes.

   CodeGen convention (per CLAUDE.md migrations guide):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
     * sp_addextendedproperty on business columns so CodeGen surfaces descriptions.
     * Status / enum columns use CHECK constraints so CodeGen emits string-union
       types. Server code that sets/reads the new columns ships AFTER CodeGen
       generates the typed entity properties, per the no-weak-typing rule.
     * Reference data (the five provider rows + capability flags, the JSONType
       binding) is seeded via metadata/mj-sync, NOT here.

   Entity metadata, the view, and spCreate/Update/Delete are produced by CodeGen
   after this migration runs.
   ============================================================================ */ /* ============================================================================ */ /* AIRemoteBrowserProvider  ("MJ: AI Remote Browser Providers") */ /*    The backend registry. Capability flags (SupportedFeatures JSON) declare */ /*    what each backend supports: the universal CDP-control substrate, an */ /*    optional provider-native AI-control harness (e.g. Browserbase Stagehand), */ /*    live-view streaming, human takeover, screen streaming, and operational */ /*    capabilities (stealth, proxy egress, recording, persistent profiles). */ /*    The engine gates optional driver calls on these flags; the base driver */ /*    throws RemoteBrowserCapabilityNotSupportedError when a feature is claimed */ /*    but unimplemented (defense-in-depth, exactly like bridges). */ /* ============================================================================ */
CREATE TABLE __mj."AIRemoteBrowserProvider" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(100) NOT NULL,
  "Description" VARCHAR(1000) NULL,
  "ProviderType" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIRemoteBrowserProvider_ProviderType" DEFAULT (
    'Service'
  ),
  "DriverClass" VARCHAR(250) NOT NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIRemoteBrowserProvider_Status" DEFAULT (
    'Active'
  ),
  "SupportedFeatures" TEXT NULL,
  "DefaultControlMode" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIRemoteBrowserProvider_DefaultControlMode" DEFAULT (
    'AgentOnly'
  ),
  "ConfigSchema" TEXT NULL,
  "Configuration" TEXT NULL,
  CONSTRAINT "PK_AIRemoteBrowserProvider" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_AIRemoteBrowserProvider_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "CK_AIRemoteBrowserProvider_ProviderType" CHECK ("ProviderType" IN ('SelfHost', 'Service')),
  CONSTRAINT "CK_AIRemoteBrowserProvider_Status" CHECK ("Status" IN ('Active', 'Disabled')),
  CONSTRAINT "CK_AIRemoteBrowserProvider_DefaultControlMode" CHECK ("DefaultControlMode" IN ('AgentOnly', 'ViewOnly', 'Collaborative'))
);

COMMENT ON COLUMN __mj."AIRemoteBrowserProvider"."Name" IS 'Unique backend name (e.g. Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).';

COMMENT ON COLUMN __mj."AIRemoteBrowserProvider"."Description" IS 'Optional human-readable description of the backend / driver.';

COMMENT ON COLUMN __mj."AIRemoteBrowserProvider"."ProviderType" IS 'How the browser is hosted: SelfHost (MJ orchestrates a lightweight headless-Chrome container we connect to over CDP) or Service (a browser-as-a-service such as Browserbase/Steel/Browserless/Hyperbrowser exposes a CDP connect endpoint).';

COMMENT ON COLUMN __mj."AIRemoteBrowserProvider"."DriverClass" IS 'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseRemoteBrowserProvider, DriverClass). MUST match the @RegisterClass key on the concrete provider driver.';

COMMENT ON COLUMN __mj."AIRemoteBrowserProvider"."Status" IS 'Whether this backend is available for use. Disabled backends cannot start new remote-browser sessions.';

COMMENT ON COLUMN __mj."AIRemoteBrowserProvider"."SupportedFeatures" IS 'Strongly-typed JSON of the backend''s supported features (the IRemoteBrowserProviderFeatures interface, bound via JSONType metadata): the universal CDP-control substrate (RawCdpControl), an optional provider-native AI-control harness (NativeAIControl, e.g. Browserbase Stagehand), LiveView, HumanTakeover, ScreenStreaming, and operational capabilities (Stealth, ProxyEgress, SessionRecording, PersistentContext, MultiTab, FileDownloads, CaptchaSolving). The engine gates optional driver calls on these flags; the base driver throws RemoteBrowserCapabilityNotSupportedError when a feature is claimed but unimplemented. Held as JSON so new features need no schema change. NULL/omitted = unsupported.';

COMMENT ON COLUMN __mj."AIRemoteBrowserProvider"."DefaultControlMode" IS 'Default control mode for channels using this backend, overridable per-channel and at runtime: AgentOnly (only the agent drives — e.g. a sales demo), ViewOnly (the agent drives while humans watch the live view but cannot take over), or Collaborative (a human can grab the wheel — e.g. a trainer agent that demonstrates then watches the user try). The backend must support the capabilities a mode requires (HumanTakeover for Collaborative, LiveView for ViewOnly/Collaborative).';

COMMENT ON COLUMN __mj."AIRemoteBrowserProvider"."ConfigSchema" IS 'Optional JSON Schema validating the backend Configuration and per-session remote-browser Config payloads.';

COMMENT ON COLUMN __mj."AIRemoteBrowserProvider"."Configuration" IS 'Backend-level configuration JSON (e.g. API region, default Chrome container image for SelfHost, credential references resolved via the MJ credential system, egress proxy settings). Never store secrets inline.';

/* SQL generated to create new entity MJ: AI Remote Browser Providers */
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
    '5af7b1ab-b2d7-4bca-9edc-980980ef4af2',
    'MJ: AI Remote Browser Providers',
    'AI Remote Browser Providers',
    NULL,
    NULL,
    'AIRemoteBrowserProvider',
    'vwAIRemoteBrowserProviders',
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

/* SQL generated to add new entity MJ: AI Remote Browser Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '5af7b1ab-b2d7-4bca-9edc-980980ef4af2',
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

/* SQL generated to add new permission for entity MJ: AI Remote Browser Providers for role UI */
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
    '5af7b1ab-b2d7-4bca-9edc-980980ef4af2',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Remote Browser Providers for role Developer */
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
    '5af7b1ab-b2d7-4bca-9edc-980980ef4af2',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Remote Browser Providers for role Integration */
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
    '5af7b1ab-b2d7-4bca-9edc-980980ef4af2',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

ALTER TABLE __mj."AIRemoteBrowserProvider"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIRemoteBrowserProvider */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIRemoteBrowserProvider */
UPDATE __mj."AIRemoteBrowserProvider" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'AIRemoteBrowserProvider' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIRemoteBrowserProvider" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIRemoteBrowserProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIRemoteBrowserProvider"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIRemoteBrowserProvider */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIRemoteBrowserProvider */
UPDATE __mj."AIRemoteBrowserProvider" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'AIRemoteBrowserProvider' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIRemoteBrowserProvider" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIRemoteBrowserProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dac3527e-832e-49b7-9508-1660229b8e00' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dac3527e-832e-49b7-9508-1660229b8e00', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9e21f25a-f7df-49e4-b573-31b9509f4539' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9e21f25a-f7df-49e4-b573-31b9509f4539', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100002, 'Name', 'Name', 'Unique backend name (e.g. Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4fa19a2e-3f4a-4d20-9e9e-3bec8bb595b0' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4fa19a2e-3f4a-4d20-9e9e-3bec8bb595b0', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100003, 'Description', 'Description', 'Optional human-readable description of the backend / driver.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '14eb9c61-d207-416c-bcc2-6b1ac2f65d4f' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'ProviderType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14eb9c61-d207-416c-bcc2-6b1ac2f65d4f', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100004, 'ProviderType', 'Provider Type', 'How the browser is hosted: SelfHost (MJ orchestrates a lightweight headless-Chrome container we connect to over CDP) or Service (a browser-as-a-service such as Browserbase/Steel/Browserless/Hyperbrowser exposes a CDP connect endpoint).', 'nvarchar', 40, 0, 0, FALSE, 'Service', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4bb225ed-d68c-426c-8264-4ee42e83ec22' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'DriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4bb225ed-d68c-426c-8264-4ee42e83ec22', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100005, 'DriverClass', 'Driver Class', 'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseRemoteBrowserProvider, DriverClass). MUST match the @RegisterClass key on the concrete provider driver.', 'nvarchar', 500, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9abd69b0-582d-4834-9693-e7a270f38ed0' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9abd69b0-582d-4834-9693-e7a270f38ed0', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100006, 'Status', 'Status', 'Whether this backend is available for use. Disabled backends cannot start new remote-browser sessions.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '137593f0-a214-4d70-a861-3a3cd4da2f24' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'SupportedFeatures')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('137593f0-a214-4d70-a861-3a3cd4da2f24', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100007, 'SupportedFeatures', 'Supported Features', 'Strongly-typed JSON of the backend''s supported features (the IRemoteBrowserProviderFeatures interface, bound via JSONType metadata): the universal CDP-control substrate (RawCdpControl), an optional provider-native AI-control harness (NativeAIControl, e.g. Browserbase Stagehand), LiveView, HumanTakeover, ScreenStreaming, and operational capabilities (Stealth, ProxyEgress, SessionRecording, PersistentContext, MultiTab, FileDownloads, CaptchaSolving). The engine gates optional driver calls on these flags; the base driver throws RemoteBrowserCapabilityNotSupportedError when a feature is claimed but unimplemented. Held as JSON so new features need no schema change. NULL/omitted = unsupported.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6e330bdd-9c57-4ffc-8d68-d59953393861' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'DefaultControlMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6e330bdd-9c57-4ffc-8d68-d59953393861', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100008, 'DefaultControlMode', 'Default Control Mode', 'Default control mode for channels using this backend, overridable per-channel and at runtime: AgentOnly (only the agent drives — e.g. a sales demo), ViewOnly (the agent drives while humans watch the live view but cannot take over), or Collaborative (a human can grab the wheel — e.g. a trainer agent that demonstrates then watches the user try). The backend must support the capabilities a mode requires (HumanTakeover for Collaborative, LiveView for ViewOnly/Collaborative).', 'nvarchar', 40, 0, 0, FALSE, 'AgentOnly', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b685b29f-0e6f-4a51-9e88-466d37df59a4' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'ConfigSchema')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b685b29f-0e6f-4a51-9e88-466d37df59a4', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100009, 'ConfigSchema', 'Config Schema', 'Optional JSON Schema validating the backend Configuration and per-session remote-browser Config payloads.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5ae418a0-30d9-4078-be68-3d74d33cf7be' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5ae418a0-30d9-4078-be68-3d74d33cf7be', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100010, 'Configuration', 'Configuration', 'Backend-level configuration JSON (e.g. API region, default Chrome container image for SelfHost, credential references resolved via the MJ credential system, egress proxy settings). Never store secrets inline.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9498647d-9928-4c85-a635-523b7eb615ae' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9498647d-9928-4c85-a635-523b7eb615ae', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100011, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '72589f23-fe72-49de-b13f-0bf70757e984' OR ("EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('72589f23-fe72-49de-b13f-0bf70757e984', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2' /* Entity: MJ: AI Remote Browser Providers */, 100012, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 163f42a6-37c2-49f9-a92c-431cd0bf035b */
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
    '163f42a6-37c2-49f9-a92c-431cd0bf035b',
    '14EB9C61-D207-416C-BCC2-6B1AC2F65D4F',
    1,
    'SelfHost',
    'SelfHost',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID afc46adb-d889-48c5-93ab-5c15c0b2efe7 */
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
    'afc46adb-d889-48c5-93ab-5c15c0b2efe7',
    '14EB9C61-D207-416C-BCC2-6B1AC2F65D4F',
    2,
    'Service',
    'Service',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 14EB9C61-D207-416C-BCC2-6B1AC2F65D4F */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '14EB9C61-D207-416C-BCC2-6B1AC2F65D4F';

/* SQL text to insert entity field value with ID 810644a9-226c-4f27-9851-60601b8826b2 */
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
    '810644a9-226c-4f27-9851-60601b8826b2',
    '9ABD69B0-582D-4834-9693-E7A270F38ED0',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID b886179c-2e8f-431e-a450-0c3fed5f1785 */
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
    'b886179c-2e8f-431e-a450-0c3fed5f1785',
    '9ABD69B0-582D-4834-9693-E7A270F38ED0',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 9ABD69B0-582D-4834-9693-E7A270F38ED0 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '9ABD69B0-582D-4834-9693-E7A270F38ED0';

/* SQL text to insert entity field value with ID a5a92188-b0ac-4ffc-8e5a-6a9d1bf9caa4 */
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
    'a5a92188-b0ac-4ffc-8e5a-6a9d1bf9caa4',
    '6E330BDD-9C57-4FFC-8D68-D59953393861',
    1,
    'AgentOnly',
    'AgentOnly',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID a7f87fff-05b6-413a-8085-6135c67101b3 */
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
    'a7f87fff-05b6-413a-8085-6135c67101b3',
    '6E330BDD-9C57-4FFC-8D68-D59953393861',
    2,
    'Collaborative',
    'Collaborative',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 9b287d42-9646-4aa1-a8c6-b1ba6ffc71f8 */
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
    '9b287d42-9646-4aa1-a8c6-b1ba6ffc71f8',
    '6E330BDD-9C57-4FFC-8D68-D59953393861',
    3,
    'ViewOnly',
    'ViewOnly',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 6E330BDD-9C57-4FFC-8D68-D59953393861 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '6E330BDD-9C57-4FFC-8D68-D59953393861';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '14EB9C61-D207-416C-BCC2-6B1AC2F65D4F'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '9ABD69B0-582D-4834-9693-E7A270F38ED0'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '6E330BDD-9C57-4FFC-8D68-D59953393861'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '14EB9C61-D207-416C-BCC2-6B1AC2F65D4F'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '9ABD69B0-582D-4834-9693-E7A270F38ED0'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '9E21F25A-F7DF-49E4-B573-31B9509F4539'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '14EB9C61-D207-416C-BCC2-6B1AC2F65D4F'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '9ABD69B0-582D-4834-9693-E7A270F38ED0'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '70B237B2-D508-4C19-8838-850ACC9961F1'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 12 fields */ /* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DAC3527E-832E-49B7-9508-1660229B8E00' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.Name */
UPDATE __mj."EntityField" SET "Category" = 'General Information', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9E21F25A-F7DF-49E4-B573-31B9509F4539' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.Description */
UPDATE __mj."EntityField" SET "Category" = 'General Information', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4FA19A2E-3F4A-4D20-9E9E-3BEC8BB595B0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.ProviderType */
UPDATE __mj."EntityField" SET "Category" = 'General Information', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '14EB9C61-D207-416C-BCC2-6B1AC2F65D4F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.DriverClass */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4BB225ED-D68C-426C-8264-4EE42E83EC22' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.Status */
UPDATE __mj."EntityField" SET "Category" = 'General Information', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9ABD69B0-582D-4834-9693-E7A270F38ED0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.SupportedFeatures */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '137593F0-A214-4D70-A861-3A3CD4DA2F24' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.DefaultControlMode */
UPDATE __mj."EntityField" SET "Category" = 'Operational Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6E330BDD-9C57-4FFC-8D68-D59953393861' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.ConfigSchema */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'B685B29F-0E6F-4A51-9E88-466D37DF59A4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.Configuration */
UPDATE __mj."EntityField" SET "Category" = 'Operational Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '5AE418A0-30D9-4078-BE68-3D74D33CF7BE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9498647D-9928-4C85-A635-523B7EB615AE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Remote Browser Providers.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '72589F23-FE72-49DE-B13F-0BF70757E984' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-globe */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-globe', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2';

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
    'ad075475-aad5-4be2-a5ff-40b9e3bab34e',
    '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2',
    'FieldCategoryInfo',
    '{"General Information":{"icon":"fa fa-info-circle","description":"Basic details and status of the remote browser provider"},"Technical Configuration":{"icon":"fa fa-cogs","description":"Technical driver definitions and capability schemas"},"Operational Settings":{"icon":"fa fa-sliders-h","description":"Operational parameters and default session behaviors"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}',
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
    'f705ad39-4f1e-4882-b214-23e5d5c80610',
    '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2',
    'FieldCategoryIcons',
    '{"General Information":"fa fa-info-circle","Technical Configuration":"fa fa-cogs","Operational Settings":"fa fa-sliders-h","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_agent_id"
    ON __mj."AIAgentNote" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_agent_note_type_id"
    ON __mj."AIAgentNote" ("AgentNoteTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_user_id"
    ON __mj."AIAgentNote" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_conversation_id"
    ON __mj."AIAgentNote" ("SourceConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_conversation_detail_id"
    ON __mj."AIAgentNote" ("SourceConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_ai_agent_run_id"
    ON __mj."AIAgentNote" ("SourceAIAgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_company_id"
    ON __mj."AIAgentNote" ("CompanyID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_embedding_model_id"
    ON __mj."AIAgentNote" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_primary_scope_entity_id"
    ON __mj."AIAgentNote" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_consolidated_into_note_id"
    ON __mj."AIAgentNote" ("ConsolidatedIntoNoteID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: fnAIAgentNoteConsolidatedIntoNoteID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentNote.ConsolidatedIntoNoteID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_note_consolidated_into_note_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ConsolidatedIntoNoteID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentNote"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ConsolidatedIntoNoteID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentNote" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ConsolidatedIntoNoteID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ConsolidatedIntoNoteID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: vwAIAgentNotes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Notes
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentNote
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentNotes"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentNoteType_AgentNoteTypeID."Name" AS "AgentNoteType",
    MJUser_UserID."Name" AS "User",
    MJConversation_SourceConversationID."Name" AS "SourceConversation",
    MJConversationDetail_SourceConversationDetailID."ExternalID" AS "SourceConversationDetail",
    MJAIAgentRun_SourceAIAgentRunID."RunName" AS "SourceAIAgentRun",
    MJCompany_CompanyID."Name" AS "Company",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    MJAIAgentNote_ConsolidatedIntoNoteID."Type" AS "ConsolidatedIntoNote",
    root_ConsolidatedIntoNoteID.root_id AS "RootConsolidatedIntoNoteID"
FROM
    __mj."AIAgentNote" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentNoteType" AS MJAIAgentNoteType_AgentNoteTypeID
  ON
    "a"."AgentNoteTypeID" = MJAIAgentNoteType_AgentNoteTypeID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_SourceConversationID
  ON
    "a"."SourceConversationID" = MJConversation_SourceConversationID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_SourceConversationDetailID
  ON
    "a"."SourceConversationDetailID" = MJConversationDetail_SourceConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_SourceAIAgentRunID
  ON
    "a"."SourceAIAgentRunID" = MJAIAgentRun_SourceAIAgentRunID."ID"
LEFT OUTER JOIN
    __mj."Company" AS MJCompany_CompanyID
  ON
    "a"."CompanyID" = MJCompany_CompanyID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "a"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"
LEFT OUTER JOIN
    __mj."AIAgentNote" AS MJAIAgentNote_ConsolidatedIntoNoteID
  ON
    "a"."ConsolidatedIntoNoteID" = MJAIAgentNote_ConsolidatedIntoNoteID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_note_consolidated_into_note_id_get_root_id"(a."ID", a."ConsolidatedIntoNoteID") AS root_id
) AS root_ConsolidatedIntoNoteID ON true
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
    AND tc.relname = 'vwAIAgentNotes'
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
    AND tc.relname = 'vwAIAgentNotes'
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
        AND tc.relname = 'vwAIAgentNotes'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentNotes" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: spCreateAIAgentNote
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentNote
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentNote'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentNote"(
    p_id uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_agentnotetypeid_clear boolean DEFAULT false,
    p_agentnotetypeid uuid DEFAULT NULL,
    p_note_clear boolean DEFAULT false,
    p_note text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_consolidatedintonoteid_clear boolean DEFAULT false,
    p_consolidatedintonoteid uuid DEFAULT NULL,
    p_consolidationcount integer DEFAULT NULL,
    p_derivedfromnoteids_clear boolean DEFAULT false,
    p_derivedfromnoteids text DEFAULT NULL,
    p_protectiontier text DEFAULT NULL,
    p_importancescore_clear boolean DEFAULT false,
    p_importancescore decimal(5, 2) DEFAULT NULL,
    p_authortype text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentNotes" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentNote"
        (
            "ID",
            "AgentID",
                "AgentNoteTypeID",
                "Note",
                "UserID",
                "Type",
                "IsAutoGenerated",
                "Comments",
                "Status",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "CompanyID",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt",
                "ConsolidatedIntoNoteID",
                "ConsolidationCount",
                "DerivedFromNoteIDs",
                "ProtectionTier",
                "ImportanceScore",
                "AuthorType"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                CASE WHEN p_agentnotetypeid_clear = true THEN NULL ELSE COALESCE(p_agentnotetypeid, NULL) END,
                CASE WHEN p_note_clear = true THEN NULL ELSE COALESCE(p_note, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                COALESCE(p_type, 'Preference'),
                COALESCE(p_isautogenerated, FALSE),
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, NULL) END,
                CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, NULL) END,
                CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, NULL) END,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END,
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, NULL) END,
                CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, NULL) END,
                CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, NULL) END,
                CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, NULL) END,
                COALESCE(p_accesscount, 0),
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END,
                CASE WHEN p_consolidatedintonoteid_clear = true THEN NULL ELSE COALESCE(p_consolidatedintonoteid, NULL) END,
                COALESCE(p_consolidationcount, 0),
                CASE WHEN p_derivedfromnoteids_clear = true THEN NULL ELSE COALESCE(p_derivedfromnoteids, NULL) END,
                COALESCE(p_protectiontier, 'Standard'),
                CASE WHEN p_importancescore_clear = true THEN NULL ELSE COALESCE(p_importancescore, NULL) END,
                COALESCE(p_authortype, 'MemoryManager')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentNotes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: spUpdateAIAgentNote
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentNote
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentNote'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentNote"(
    p_id uuid,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_agentnotetypeid_clear boolean DEFAULT false,
    p_agentnotetypeid uuid DEFAULT NULL,
    p_note_clear boolean DEFAULT false,
    p_note text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_consolidatedintonoteid_clear boolean DEFAULT false,
    p_consolidatedintonoteid uuid DEFAULT NULL,
    p_consolidationcount integer DEFAULT NULL,
    p_derivedfromnoteids_clear boolean DEFAULT false,
    p_derivedfromnoteids text DEFAULT NULL,
    p_protectiontier text DEFAULT NULL,
    p_importancescore_clear boolean DEFAULT false,
    p_importancescore decimal(5, 2) DEFAULT NULL,
    p_authortype text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentNotes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentNote"
    SET
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "AgentNoteTypeID" = CASE WHEN p_agentnotetypeid_clear = true THEN NULL ELSE COALESCE(p_agentnotetypeid, "AgentNoteTypeID") END,
        "Note" = CASE WHEN p_note_clear = true THEN NULL ELSE COALESCE(p_note, "Note") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "Type" = COALESCE(p_type, "Type"),
        "IsAutoGenerated" = COALESCE(p_isautogenerated, "IsAutoGenerated"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Status" = COALESCE(p_status, "Status"),
        "SourceConversationID" = CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, "SourceConversationID") END,
        "SourceConversationDetailID" = CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, "SourceConversationDetailID") END,
        "SourceAIAgentRunID" = CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, "SourceAIAgentRunID") END,
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END,
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, "SecondaryScopes") END,
        "LastAccessedAt" = CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, "LastAccessedAt") END,
        "AccessCount" = COALESCE(p_accesscount, "AccessCount"),
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END,
        "ConsolidatedIntoNoteID" = CASE WHEN p_consolidatedintonoteid_clear = true THEN NULL ELSE COALESCE(p_consolidatedintonoteid, "ConsolidatedIntoNoteID") END,
        "ConsolidationCount" = COALESCE(p_consolidationcount, "ConsolidationCount"),
        "DerivedFromNoteIDs" = CASE WHEN p_derivedfromnoteids_clear = true THEN NULL ELSE COALESCE(p_derivedfromnoteids, "DerivedFromNoteIDs") END,
        "ProtectionTier" = COALESCE(p_protectiontier, "ProtectionTier"),
        "ImportanceScore" = CASE WHEN p_importancescore_clear = true THEN NULL ELSE COALESCE(p_importancescore, "ImportanceScore") END,
        "AuthorType" = COALESCE(p_authortype, "AuthorType")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentNotes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_note"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_note" ON __mj."AIAgentNote";

CREATE TRIGGER "trg_update_ai_agent_note"
BEFORE UPDATE ON __mj."AIAgentNote"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_note"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: spDeleteAIAgentNote
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentNote
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentNote'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentNote"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentNote"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Remote Browser Providers
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Remote Browser Providers
-- Item: vwAIRemoteBrowserProviders
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Remote Browser Providers
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIRemoteBrowserProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIRemoteBrowserProviders"
AS
SELECT
    a.*
FROM
    __mj."AIRemoteBrowserProvider" AS a
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
    AND tc.relname = 'vwAIRemoteBrowserProviders'
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
    AND tc.relname = 'vwAIRemoteBrowserProviders'
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
        AND tc.relname = 'vwAIRemoteBrowserProviders'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIRemoteBrowserProviders" CASCADE;
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
GRANT SELECT ON __mj."vwAIRemoteBrowserProviders" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIRemoteBrowserProviders" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIRemoteBrowserProviders" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Remote Browser Providers
-- Item: spCreateAIRemoteBrowserProvider
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIRemoteBrowserProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIRemoteBrowserProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIRemoteBrowserProvider"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_providertype text DEFAULT NULL,
    p_driverclass text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_supportedfeatures_clear boolean DEFAULT false,
    p_supportedfeatures text DEFAULT NULL,
    p_defaultcontrolmode text DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIRemoteBrowserProviders" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIRemoteBrowserProvider"
        (
            "ID",
            "Name",
                "Description",
                "ProviderType",
                "DriverClass",
                "Status",
                "SupportedFeatures",
                "DefaultControlMode",
                "ConfigSchema",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_providertype, 'Service'),
                p_driverclass,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_supportedfeatures_clear = true THEN NULL ELSE COALESCE(p_supportedfeatures, NULL) END,
                COALESCE(p_defaultcontrolmode, 'AgentOnly'),
                CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIRemoteBrowserProviders"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIRemoteBrowserProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIRemoteBrowserProvider" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Remote Browser Providers
-- Item: spUpdateAIRemoteBrowserProvider
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIRemoteBrowserProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIRemoteBrowserProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIRemoteBrowserProvider"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_providertype text DEFAULT NULL,
    p_driverclass text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_supportedfeatures_clear boolean DEFAULT false,
    p_supportedfeatures text DEFAULT NULL,
    p_defaultcontrolmode text DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwAIRemoteBrowserProviders" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIRemoteBrowserProvider"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ProviderType" = COALESCE(p_providertype, "ProviderType"),
        "DriverClass" = COALESCE(p_driverclass, "DriverClass"),
        "Status" = COALESCE(p_status, "Status"),
        "SupportedFeatures" = CASE WHEN p_supportedfeatures_clear = true THEN NULL ELSE COALESCE(p_supportedfeatures, "SupportedFeatures") END,
        "DefaultControlMode" = COALESCE(p_defaultcontrolmode, "DefaultControlMode"),
        "ConfigSchema" = CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, "ConfigSchema") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIRemoteBrowserProviders"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIRemoteBrowserProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIRemoteBrowserProvider" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIRemoteBrowserProvider table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_remote_browser_provider"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_remote_browser_provider" ON __mj."AIRemoteBrowserProvider";

CREATE TRIGGER "trg_update_ai_remote_browser_provider"
BEFORE UPDATE ON __mj."AIRemoteBrowserProvider"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_remote_browser_provider"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Remote Browser Providers
-- Item: spDeleteAIRemoteBrowserProvider
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIRemoteBrowserProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIRemoteBrowserProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIRemoteBrowserProvider"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIRemoteBrowserProvider"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIRemoteBrowserProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIRemoteBrowserProvider" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON __mj."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON __mj."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON __mj."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON __mj."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON __mj."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON __mj."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON __mj."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON __mj."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON __mj."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON __mj."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON __mj."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON __mj."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_session_id"
    ON __mj."AIAgentRun" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
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
            __mj."AIAgentRun" c
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
-- Item: fnAIAgentRunLastRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.LastRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_last_run_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "LastRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."LastRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."LastRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "LastRunID" IS NULL
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRuns"
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
    root_ParentRunID.root_id AS "RootParentRunID",
    root_LastRunID.root_id AS "RootLastRunID"
FROM
    __mj."AIAgentRun" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    __mj."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_parent_run_id_get_root_id"(a."ID", a."ParentRunID") AS root_id
) AS root_ParentRunID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_last_run_id_get_root_id"(a."ID", a."LastRunID") AS root_id
) AS root_LastRunID ON true
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

  DROP VIEW IF EXISTS __mj."vwAIAgentRuns" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
AS $$
DECLARE
    v_id uuid;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::uuid;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::uuid';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'LastHeartbeatAt', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'AgentSessionID']
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
        WHEN 'TotalTokensUsed' THEN '($1->>''TotalTokensUsed'')::INTEGER'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'TotalPromptTokensUsed' THEN '($1->>''TotalPromptTokensUsed'')::INTEGER'
        WHEN 'TotalCompletionTokensUsed' THEN '($1->>''TotalCompletionTokensUsed'')::INTEGER'
        WHEN 'TotalTokensUsedRollup' THEN '($1->>''TotalTokensUsedRollup'')::INTEGER'
        WHEN 'TotalPromptTokensUsedRollup' THEN '($1->>''TotalPromptTokensUsedRollup'')::INTEGER'
        WHEN 'TotalCompletionTokensUsedRollup' THEN '($1->>''TotalCompletionTokensUsedRollup'')::INTEGER'
        WHEN 'TotalCostRollup' THEN '($1->>''TotalCostRollup'')::DECIMAL(19, 8)'
        WHEN 'ConversationDetailID' THEN '($1->>''ConversationDetailID'')::UUID'
        WHEN 'ConversationDetailSequence' THEN '($1->>''ConversationDetailSequence'')::INTEGER'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'FinalStep' THEN '($1->>''FinalStep'')'
        WHEN 'FinalPayload' THEN '($1->>''FinalPayload'')'
        WHEN 'Message' THEN '($1->>''Message'')'
        WHEN 'LastRunID' THEN '($1->>''LastRunID'')::UUID'
        WHEN 'StartingPayload' THEN '($1->>''StartingPayload'')'
        WHEN 'TotalPromptIterations' THEN 'COALESCE(($1->>''TotalPromptIterations'')::INTEGER, 0)'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'OverrideModelID' THEN '($1->>''OverrideModelID'')::UUID'
        WHEN 'OverrideVendorID' THEN '($1->>''OverrideVendorID'')::UUID'
        WHEN 'Data' THEN '($1->>''Data'')'
        WHEN 'Verbose' THEN '($1->>''Verbose'')::BOOLEAN'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INTEGER'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'ScheduledJobRunID' THEN '($1->>''ScheduledJobRunID'')::UUID'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'PrimaryScopeEntityID' THEN '($1->>''PrimaryScopeEntityID'')::UUID'
        WHEN 'PrimaryScopeRecordID' THEN '($1->>''PrimaryScopeRecordID'')'
        WHEN 'SecondaryScopes' THEN '($1->>''SecondaryScopes'')'
        WHEN 'ExternalReferenceID' THEN '($1->>''ExternalReferenceID'')'
        WHEN 'CompanyID' THEN '($1->>''CompanyID'')::UUID'
        WHEN 'LastHeartbeatAt' THEN '($1->>''LastHeartbeatAt'')::TIMESTAMPTZ'
        WHEN 'TotalCacheReadTokensUsed' THEN '($1->>''TotalCacheReadTokensUsed'')::INTEGER'
        WHEN 'TotalCacheWriteTokensUsed' THEN '($1->>''TotalCacheWriteTokensUsed'')::INTEGER'
        WHEN 'AgentSessionID' THEN '($1->>''AgentSessionID'')::UUID'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIAgentRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
AS $$
DECLARE
    v_id uuid := (p_data->>'ID')::uuid;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgentRun"
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
        "TotalTokensUsed" = CASE WHEN p_data ? 'TotalTokensUsed' THEN (p_data->>'TotalTokensUsed')::INTEGER ELSE "TotalTokensUsed" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "TotalPromptTokensUsed" = CASE WHEN p_data ? 'TotalPromptTokensUsed' THEN (p_data->>'TotalPromptTokensUsed')::INTEGER ELSE "TotalPromptTokensUsed" END,
        "TotalCompletionTokensUsed" = CASE WHEN p_data ? 'TotalCompletionTokensUsed' THEN (p_data->>'TotalCompletionTokensUsed')::INTEGER ELSE "TotalCompletionTokensUsed" END,
        "TotalTokensUsedRollup" = CASE WHEN p_data ? 'TotalTokensUsedRollup' THEN (p_data->>'TotalTokensUsedRollup')::INTEGER ELSE "TotalTokensUsedRollup" END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_data ? 'TotalPromptTokensUsedRollup' THEN (p_data->>'TotalPromptTokensUsedRollup')::INTEGER ELSE "TotalPromptTokensUsedRollup" END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_data ? 'TotalCompletionTokensUsedRollup' THEN (p_data->>'TotalCompletionTokensUsedRollup')::INTEGER ELSE "TotalCompletionTokensUsedRollup" END,
        "TotalCostRollup" = CASE WHEN p_data ? 'TotalCostRollup' THEN (p_data->>'TotalCostRollup')::DECIMAL(19, 8) ELSE "TotalCostRollup" END,
        "ConversationDetailID" = CASE WHEN p_data ? 'ConversationDetailID' THEN (p_data->>'ConversationDetailID')::UUID ELSE "ConversationDetailID" END,
        "ConversationDetailSequence" = CASE WHEN p_data ? 'ConversationDetailSequence' THEN (p_data->>'ConversationDetailSequence')::INTEGER ELSE "ConversationDetailSequence" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "FinalStep" = CASE WHEN p_data ? 'FinalStep' THEN (p_data->>'FinalStep') ELSE "FinalStep" END,
        "FinalPayload" = CASE WHEN p_data ? 'FinalPayload' THEN (p_data->>'FinalPayload') ELSE "FinalPayload" END,
        "Message" = CASE WHEN p_data ? 'Message' THEN (p_data->>'Message') ELSE "Message" END,
        "LastRunID" = CASE WHEN p_data ? 'LastRunID' THEN (p_data->>'LastRunID')::UUID ELSE "LastRunID" END,
        "StartingPayload" = CASE WHEN p_data ? 'StartingPayload' THEN (p_data->>'StartingPayload') ELSE "StartingPayload" END,
        "TotalPromptIterations" = CASE WHEN p_data ? 'TotalPromptIterations' THEN (p_data->>'TotalPromptIterations')::INTEGER ELSE "TotalPromptIterations" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "OverrideModelID" = CASE WHEN p_data ? 'OverrideModelID' THEN (p_data->>'OverrideModelID')::UUID ELSE "OverrideModelID" END,
        "OverrideVendorID" = CASE WHEN p_data ? 'OverrideVendorID' THEN (p_data->>'OverrideVendorID')::UUID ELSE "OverrideVendorID" END,
        "Data" = CASE WHEN p_data ? 'Data' THEN (p_data->>'Data') ELSE "Data" END,
        "Verbose" = CASE WHEN p_data ? 'Verbose' THEN (p_data->>'Verbose')::BOOLEAN ELSE "Verbose" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INTEGER ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "ScheduledJobRunID" = CASE WHEN p_data ? 'ScheduledJobRunID' THEN (p_data->>'ScheduledJobRunID')::UUID ELSE "ScheduledJobRunID" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "PrimaryScopeEntityID" = CASE WHEN p_data ? 'PrimaryScopeEntityID' THEN (p_data->>'PrimaryScopeEntityID')::UUID ELSE "PrimaryScopeEntityID" END,
        "PrimaryScopeRecordID" = CASE WHEN p_data ? 'PrimaryScopeRecordID' THEN (p_data->>'PrimaryScopeRecordID') ELSE "PrimaryScopeRecordID" END,
        "SecondaryScopes" = CASE WHEN p_data ? 'SecondaryScopes' THEN (p_data->>'SecondaryScopes') ELSE "SecondaryScopes" END,
        "ExternalReferenceID" = CASE WHEN p_data ? 'ExternalReferenceID' THEN (p_data->>'ExternalReferenceID') ELSE "ExternalReferenceID" END,
        "CompanyID" = CASE WHEN p_data ? 'CompanyID' THEN (p_data->>'CompanyID')::UUID ELSE "CompanyID" END,
        "LastHeartbeatAt" = CASE WHEN p_data ? 'LastHeartbeatAt' THEN (p_data->>'LastHeartbeatAt')::TIMESTAMPTZ ELSE "LastHeartbeatAt" END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_data ? 'TotalCacheReadTokensUsed' THEN (p_data->>'TotalCacheReadTokensUsed')::INTEGER ELSE "TotalCacheReadTokensUsed" END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_data ? 'TotalCacheWriteTokensUsed' THEN (p_data->>'TotalCacheWriteTokensUsed')::INTEGER ELSE "TotalCacheWriteTokensUsed" END,
        "AgentSessionID" = CASE WHEN p_data ? 'AgentSessionID' THEN (p_data->>'AgentSessionID')::UUID ELSE "AgentSessionID" END,
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
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON __mj."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON __mj."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_run"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRun"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_conversation_id"
    ON __mj."ConversationDetail" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_user_id"
    ON __mj."ConversationDetail" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_id"
    ON __mj."ConversationDetail" ("ArtifactID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_version_id"
    ON __mj."ConversationDetail" ("ArtifactVersionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_parent_id"
    ON __mj."ConversationDetail" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_agent_id"
    ON __mj."ConversationDetail" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_test_run_id"
    ON __mj."ConversationDetail" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_agent_session_id"
    ON __mj."ConversationDetail" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: fnConversationDetailParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ConversationDetail.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_conversation_detail_parent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."ConversationDetail"
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
            __mj."ConversationDetail" c
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetails"
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
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."ConversationDetail" AS c
INNER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "c"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "c"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."ConversationArtifact" AS MJConversationArtifact_ArtifactID
  ON
    "c"."ArtifactID" = MJConversationArtifact_ArtifactID."ID"
LEFT OUTER JOIN
    __mj."vwConversationArtifactVersions" AS MJConversationArtifactVersion_ArtifactVersionID
  ON
    "c"."ArtifactVersionID" = MJConversationArtifactVersion_ArtifactVersionID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ParentID
  ON
    "c"."ParentID" = MJConversationDetail_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "c"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "c"."TestRunID" = MJTestRun_TestRunID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_conversation_detail_parent_id_get_root_id"(c."ID", c."ParentID") AS root_id
) AS root_ParentID ON true
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
    AND tc.relname = 'vwConversationDetails'
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
    AND tc.relname = 'vwConversationDetails'
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
        AND tc.relname = 'vwConversationDetails'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversationDetails" CASCADE;
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
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetail"(
    p_id uuid DEFAULT NULL,
    p_conversationid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_error_clear boolean DEFAULT false,
    p_error text DEFAULT NULL,
    p_hiddentouser BOOLEAN DEFAULT NULL,
    p_userrating_clear boolean DEFAULT false,
    p_userrating integer DEFAULT NULL,
    p_userfeedback_clear boolean DEFAULT false,
    p_userfeedback text DEFAULT NULL,
    p_reflectioninsights_clear boolean DEFAULT false,
    p_reflectioninsights text DEFAULT NULL,
    p_summaryofearlierconversation_clear boolean DEFAULT false,
    p_summaryofearlierconversation text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_artifactid_clear boolean DEFAULT false,
    p_artifactid uuid DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL,
    p_completiontime_clear boolean DEFAULT false,
    p_completiontime bigint DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_suggestedresponses_clear boolean DEFAULT false,
    p_suggestedresponses text DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_responseform_clear boolean DEFAULT false,
    p_responseform text DEFAULT NULL,
    p_actionablecommands_clear boolean DEFAULT false,
    p_actionablecommands text DEFAULT NULL,
    p_automaticcommands_clear boolean DEFAULT false,
    p_automaticcommands text DEFAULT NULL,
    p_originalmessagechanged BOOLEAN DEFAULT NULL,
    p_agentsessionid_clear boolean DEFAULT false,
    p_agentsessionid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetails" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationDetail"
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
                "AgentSessionID"
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
                CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetail"(
    p_id uuid,
    p_conversationid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_error_clear boolean DEFAULT false,
    p_error text DEFAULT NULL,
    p_hiddentouser BOOLEAN DEFAULT NULL,
    p_userrating_clear boolean DEFAULT false,
    p_userrating integer DEFAULT NULL,
    p_userfeedback_clear boolean DEFAULT false,
    p_userfeedback text DEFAULT NULL,
    p_reflectioninsights_clear boolean DEFAULT false,
    p_reflectioninsights text DEFAULT NULL,
    p_summaryofearlierconversation_clear boolean DEFAULT false,
    p_summaryofearlierconversation text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_artifactid_clear boolean DEFAULT false,
    p_artifactid uuid DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL,
    p_completiontime_clear boolean DEFAULT false,
    p_completiontime bigint DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_suggestedresponses_clear boolean DEFAULT false,
    p_suggestedresponses text DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_responseform_clear boolean DEFAULT false,
    p_responseform text DEFAULT NULL,
    p_actionablecommands_clear boolean DEFAULT false,
    p_actionablecommands text DEFAULT NULL,
    p_automaticcommands_clear boolean DEFAULT false,
    p_automaticcommands text DEFAULT NULL,
    p_originalmessagechanged BOOLEAN DEFAULT NULL,
    p_agentsessionid_clear boolean DEFAULT false,
    p_agentsessionid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationDetail"
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
        "AgentSessionID" = CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, "AgentSessionID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_detail" ON __mj."ConversationDetail";

CREATE TRIGGER "trg_update_conversation_detail"
BEFORE UPDATE ON __mj."ConversationDetail"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation_detail"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetail"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Artifacts records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetailArtifact"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetailArtifact"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Attachments records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetailAttachment"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetailAttachment"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Ratings records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetailRating"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetailRating"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Reports.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Report"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Report"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Task"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Task"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."ConversationDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_user_id"
    ON __mj."Conversation" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_linked_entity_id"
    ON __mj."Conversation" ("LinkedEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_data_context_id"
    ON __mj."Conversation" ("DataContextID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_environment_id"
    ON __mj."Conversation" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_project_id"
    ON __mj."Conversation" ("ProjectID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_test_run_id"
    ON __mj."Conversation" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_application_id"
    ON __mj."Conversation" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_default_agent_id"
    ON __mj."Conversation" ("DefaultAgentID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversations"
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
    MJAIAgent_DefaultAgentID."Name" AS "DefaultAgent"
FROM
    __mj."Conversation" AS c
INNER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "c"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_LinkedEntityID
  ON
    "c"."LinkedEntityID" = MJEntity_LinkedEntityID."ID"
LEFT OUTER JOIN
    __mj."DataContext" AS MJDataContext_DataContextID
  ON
    "c"."DataContextID" = MJDataContext_DataContextID."ID"
INNER JOIN
    __mj."Environment" AS MJEnvironment_EnvironmentID
  ON
    "c"."EnvironmentID" = MJEnvironment_EnvironmentID."ID"
LEFT OUTER JOIN
    __mj."Project" AS MJProject_ProjectID
  ON
    "c"."ProjectID" = MJProject_ProjectID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "c"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    __mj."Application" AS MJApplication_ApplicationID
  ON
    "c"."ApplicationID" = MJApplication_ApplicationID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_DefaultAgentID
  ON
    "c"."DefaultAgentID" = MJAIAgent_DefaultAgentID."ID"
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

  DROP VIEW IF EXISTS __mj."vwConversations" CASCADE;
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
GRANT SELECT ON __mj."vwConversations" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversations" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversations" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateConversation"(
    p_id uuid DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isarchived BOOLEAN DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid uuid DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid text DEFAULT NULL,
    p_datacontextid_clear boolean DEFAULT false,
    p_datacontextid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_environmentid uuid DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid uuid DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_applicationscope text DEFAULT NULL,
    p_applicationid_clear boolean DEFAULT false,
    p_applicationid uuid DEFAULT NULL,
    p_defaultagentid_clear boolean DEFAULT false,
    p_defaultagentid uuid DEFAULT NULL,
    p_additionaldata_clear boolean DEFAULT false,
    p_additionaldata text DEFAULT NULL
) RETURNS SETOF __mj."vwConversations" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Conversation"
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
                "AdditionalData"
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
                COALESCE(p_environmentid, 'F51358F3-9447-4176-B313-BF8025FD8D09'),
                CASE WHEN p_projectid_clear = true THEN NULL ELSE COALESCE(p_projectid, NULL) END,
                COALESCE(p_ispinned, FALSE),
                CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, NULL) END,
                COALESCE(p_applicationscope, 'Global'),
                CASE WHEN p_applicationid_clear = true THEN NULL ELSE COALESCE(p_applicationid, NULL) END,
                CASE WHEN p_defaultagentid_clear = true THEN NULL ELSE COALESCE(p_defaultagentid, NULL) END,
                CASE WHEN p_additionaldata_clear = true THEN NULL ELSE COALESCE(p_additionaldata, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversation" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateConversation"(
    p_id uuid,
    p_userid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isarchived BOOLEAN DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid uuid DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid text DEFAULT NULL,
    p_datacontextid_clear boolean DEFAULT false,
    p_datacontextid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_environmentid uuid DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid uuid DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_applicationscope text DEFAULT NULL,
    p_applicationid_clear boolean DEFAULT false,
    p_applicationid uuid DEFAULT NULL,
    p_defaultagentid_clear boolean DEFAULT false,
    p_defaultagentid uuid DEFAULT NULL,
    p_additionaldata_clear boolean DEFAULT false,
    p_additionaldata text DEFAULT NULL
) RETURNS SETOF __mj."vwConversations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Conversation"
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
        "AdditionalData" = CASE WHEN p_additionaldata_clear = true THEN NULL ELSE COALESCE(p_additionaldata, "AdditionalData") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversation" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Conversation table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation" ON __mj."Conversation";

CREATE TRIGGER "trg_update_conversation"
BEFORE UPDATE ON __mj."Conversation"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteConversation"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Sessions.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSession"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentSession"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Artifacts records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationArtifact"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationArtifact"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Details records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetail"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Reports.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Report"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Report"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."Conversation"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_parent_id"
    ON __mj."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_context_compression_prompt_id"
    ON __mj."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_type_id"
    ON __mj."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_artifact_type_id"
    ON __mj."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_owner_user_id"
    ON __mj."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_attachment_storage_provider_id"
    ON __mj."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_category_id"
    ON __mj."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_storage_account_id"
    ON __mj."AIAgent" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_co_agent_id"
    ON __mj."AIAgent" ("DefaultCoAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fnAIAgentParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_parent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgent"
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
            __mj."AIAgent" c
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
-- Item: fnAIAgentDefaultCoAgentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.DefaultCoAgentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_default_co_agent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "DefaultCoAgentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."DefaultCoAgentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgent" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."DefaultCoAgentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "DefaultCoAgentID" IS NULL
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgents"
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
    root_ParentID.root_id AS "RootParentID",
    root_DefaultCoAgentID.root_id AS "RootDefaultCoAgentID"
FROM
    __mj."AIAgent" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_ParentID
  ON
    "a"."ParentID" = MJAIAgent_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ContextCompressionPromptID
  ON
    "a"."ContextCompressionPromptID" = MJAIPrompt_ContextCompressionPromptID."ID"
LEFT OUTER JOIN
    __mj."AIAgentType" AS MJAIAgentType_TypeID
  ON
    "a"."TypeID" = MJAIAgentType_TypeID."ID"
LEFT OUTER JOIN
    __mj."ArtifactType" AS MJArtifactType_DefaultArtifactTypeID
  ON
    "a"."DefaultArtifactTypeID" = MJArtifactType_DefaultArtifactTypeID."ID"
INNER JOIN
    __mj."User" AS MJUser_OwnerUserID
  ON
    "a"."OwnerUserID" = MJUser_OwnerUserID."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    "a"."AttachmentStorageProviderID" = MJFileStorageProvider_AttachmentStorageProviderID."ID"
LEFT OUTER JOIN
    __mj."AIAgentCategory" AS MJAIAgentCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIAgentCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    "a"."DefaultStorageAccountID" = MJFileStorageAccount_DefaultStorageAccountID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_DefaultCoAgentID
  ON
    "a"."DefaultCoAgentID" = MJAIAgent_DefaultCoAgentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_default_co_agent_id_get_root_id"(a."ID", a."DefaultCoAgentID") AS root_id
) AS root_DefaultCoAgentID ON true
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
    AND tc.relname = 'vwAIAgents'
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
    AND tc.relname = 'vwAIAgents'
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
        AND tc.relname = 'vwAIAgents'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgents" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
AS $$
DECLARE
    v_id uuid;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::uuid;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::uuid';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'Name' THEN '($1->>''Name'')'
        WHEN 'Description' THEN '($1->>''Description'')'
        WHEN 'LogoURL' THEN '($1->>''LogoURL'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'ExposeAsAction' THEN 'COALESCE(($1->>''ExposeAsAction'')::BOOLEAN, FALSE)'
        WHEN 'ExecutionOrder' THEN 'COALESCE(($1->>''ExecutionOrder'')::INTEGER, 0)'
        WHEN 'ExecutionMode' THEN 'COALESCE(($1->>''ExecutionMode''), ''Sequential'')'
        WHEN 'EnableContextCompression' THEN 'COALESCE(($1->>''EnableContextCompression'')::BOOLEAN, FALSE)'
        WHEN 'ContextCompressionMessageThreshold' THEN '($1->>''ContextCompressionMessageThreshold'')::INTEGER'
        WHEN 'ContextCompressionPromptID' THEN '($1->>''ContextCompressionPromptID'')::UUID'
        WHEN 'ContextCompressionMessageRetentionCount' THEN '($1->>''ContextCompressionMessageRetentionCount'')::INTEGER'
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
        WHEN 'FinalPayloadValidationMaxRetries' THEN 'COALESCE(($1->>''FinalPayloadValidationMaxRetries'')::INTEGER, 3)'
        WHEN 'MaxCostPerRun' THEN '($1->>''MaxCostPerRun'')::DECIMAL(10, 4)'
        WHEN 'MaxTokensPerRun' THEN '($1->>''MaxTokensPerRun'')::INTEGER'
        WHEN 'MaxIterationsPerRun' THEN '($1->>''MaxIterationsPerRun'')::INTEGER'
        WHEN 'MaxTimePerRun' THEN '($1->>''MaxTimePerRun'')::INTEGER'
        WHEN 'MinExecutionsPerRun' THEN '($1->>''MinExecutionsPerRun'')::INTEGER'
        WHEN 'MaxExecutionsPerRun' THEN '($1->>''MaxExecutionsPerRun'')::INTEGER'
        WHEN 'StartingPayloadValidation' THEN '($1->>''StartingPayloadValidation'')'
        WHEN 'StartingPayloadValidationMode' THEN 'COALESCE(($1->>''StartingPayloadValidationMode''), ''Fail'')'
        WHEN 'DefaultPromptEffortLevel' THEN '($1->>''DefaultPromptEffortLevel'')::INTEGER'
        WHEN 'ChatHandlingOption' THEN '($1->>''ChatHandlingOption'')'
        WHEN 'DefaultArtifactTypeID' THEN '($1->>''DefaultArtifactTypeID'')::UUID'
        WHEN 'OwnerUserID' THEN 'COALESCE(($1->>''OwnerUserID'')::UUID, ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'')'
        WHEN 'InvocationMode' THEN 'COALESCE(($1->>''InvocationMode''), ''Any'')'
        WHEN 'ArtifactCreationMode' THEN 'COALESCE(($1->>''ArtifactCreationMode''), ''Always'')'
        WHEN 'FunctionalRequirements' THEN '($1->>''FunctionalRequirements'')'
        WHEN 'TechnicalDesign' THEN '($1->>''TechnicalDesign'')'
        WHEN 'InjectNotes' THEN 'COALESCE(($1->>''InjectNotes'')::BOOLEAN, TRUE)'
        WHEN 'MaxNotesToInject' THEN 'COALESCE(($1->>''MaxNotesToInject'')::INTEGER, 5)'
        WHEN 'NoteInjectionStrategy' THEN 'COALESCE(($1->>''NoteInjectionStrategy''), ''Relevant'')'
        WHEN 'InjectExamples' THEN 'COALESCE(($1->>''InjectExamples'')::BOOLEAN, FALSE)'
        WHEN 'MaxExamplesToInject' THEN 'COALESCE(($1->>''MaxExamplesToInject'')::INTEGER, 3)'
        WHEN 'ExampleInjectionStrategy' THEN 'COALESCE(($1->>''ExampleInjectionStrategy''), ''Semantic'')'
        WHEN 'IsRestricted' THEN 'COALESCE(($1->>''IsRestricted'')::BOOLEAN, FALSE)'
        WHEN 'MessageMode' THEN 'COALESCE(($1->>''MessageMode''), ''None'')'
        WHEN 'MaxMessages' THEN '($1->>''MaxMessages'')::INTEGER'
        WHEN 'AttachmentStorageProviderID' THEN '($1->>''AttachmentStorageProviderID'')::UUID'
        WHEN 'AttachmentRootPath' THEN '($1->>''AttachmentRootPath'')'
        WHEN 'InlineStorageThresholdBytes' THEN '($1->>''InlineStorageThresholdBytes'')::INTEGER'
        WHEN 'AgentTypePromptParams' THEN '($1->>''AgentTypePromptParams'')'
        WHEN 'ScopeConfig' THEN '($1->>''ScopeConfig'')'
        WHEN 'NoteRetentionDays' THEN '($1->>''NoteRetentionDays'')::INTEGER'
        WHEN 'ExampleRetentionDays' THEN '($1->>''ExampleRetentionDays'')::INTEGER'
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
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIAgent" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
AS $$
DECLARE
    v_id uuid := (p_data->>'ID')::uuid;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgent: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgent"
    SET
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "LogoURL" = CASE WHEN p_data ? 'LogoURL' THEN (p_data->>'LogoURL') ELSE "LogoURL" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "ExposeAsAction" = CASE WHEN p_data ? 'ExposeAsAction' THEN (p_data->>'ExposeAsAction')::BOOLEAN ELSE "ExposeAsAction" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INTEGER ELSE "ExecutionOrder" END,
        "ExecutionMode" = CASE WHEN p_data ? 'ExecutionMode' THEN (p_data->>'ExecutionMode') ELSE "ExecutionMode" END,
        "EnableContextCompression" = CASE WHEN p_data ? 'EnableContextCompression' THEN (p_data->>'EnableContextCompression')::BOOLEAN ELSE "EnableContextCompression" END,
        "ContextCompressionMessageThreshold" = CASE WHEN p_data ? 'ContextCompressionMessageThreshold' THEN (p_data->>'ContextCompressionMessageThreshold')::INTEGER ELSE "ContextCompressionMessageThreshold" END,
        "ContextCompressionPromptID" = CASE WHEN p_data ? 'ContextCompressionPromptID' THEN (p_data->>'ContextCompressionPromptID')::UUID ELSE "ContextCompressionPromptID" END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_data ? 'ContextCompressionMessageRetentionCount' THEN (p_data->>'ContextCompressionMessageRetentionCount')::INTEGER ELSE "ContextCompressionMessageRetentionCount" END,
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
        "FinalPayloadValidationMaxRetries" = CASE WHEN p_data ? 'FinalPayloadValidationMaxRetries' THEN (p_data->>'FinalPayloadValidationMaxRetries')::INTEGER ELSE "FinalPayloadValidationMaxRetries" END,
        "MaxCostPerRun" = CASE WHEN p_data ? 'MaxCostPerRun' THEN (p_data->>'MaxCostPerRun')::DECIMAL(10, 4) ELSE "MaxCostPerRun" END,
        "MaxTokensPerRun" = CASE WHEN p_data ? 'MaxTokensPerRun' THEN (p_data->>'MaxTokensPerRun')::INTEGER ELSE "MaxTokensPerRun" END,
        "MaxIterationsPerRun" = CASE WHEN p_data ? 'MaxIterationsPerRun' THEN (p_data->>'MaxIterationsPerRun')::INTEGER ELSE "MaxIterationsPerRun" END,
        "MaxTimePerRun" = CASE WHEN p_data ? 'MaxTimePerRun' THEN (p_data->>'MaxTimePerRun')::INTEGER ELSE "MaxTimePerRun" END,
        "MinExecutionsPerRun" = CASE WHEN p_data ? 'MinExecutionsPerRun' THEN (p_data->>'MinExecutionsPerRun')::INTEGER ELSE "MinExecutionsPerRun" END,
        "MaxExecutionsPerRun" = CASE WHEN p_data ? 'MaxExecutionsPerRun' THEN (p_data->>'MaxExecutionsPerRun')::INTEGER ELSE "MaxExecutionsPerRun" END,
        "StartingPayloadValidation" = CASE WHEN p_data ? 'StartingPayloadValidation' THEN (p_data->>'StartingPayloadValidation') ELSE "StartingPayloadValidation" END,
        "StartingPayloadValidationMode" = CASE WHEN p_data ? 'StartingPayloadValidationMode' THEN (p_data->>'StartingPayloadValidationMode') ELSE "StartingPayloadValidationMode" END,
        "DefaultPromptEffortLevel" = CASE WHEN p_data ? 'DefaultPromptEffortLevel' THEN (p_data->>'DefaultPromptEffortLevel')::INTEGER ELSE "DefaultPromptEffortLevel" END,
        "ChatHandlingOption" = CASE WHEN p_data ? 'ChatHandlingOption' THEN (p_data->>'ChatHandlingOption') ELSE "ChatHandlingOption" END,
        "DefaultArtifactTypeID" = CASE WHEN p_data ? 'DefaultArtifactTypeID' THEN (p_data->>'DefaultArtifactTypeID')::UUID ELSE "DefaultArtifactTypeID" END,
        "OwnerUserID" = CASE WHEN p_data ? 'OwnerUserID' THEN (p_data->>'OwnerUserID')::UUID ELSE "OwnerUserID" END,
        "InvocationMode" = CASE WHEN p_data ? 'InvocationMode' THEN (p_data->>'InvocationMode') ELSE "InvocationMode" END,
        "ArtifactCreationMode" = CASE WHEN p_data ? 'ArtifactCreationMode' THEN (p_data->>'ArtifactCreationMode') ELSE "ArtifactCreationMode" END,
        "FunctionalRequirements" = CASE WHEN p_data ? 'FunctionalRequirements' THEN (p_data->>'FunctionalRequirements') ELSE "FunctionalRequirements" END,
        "TechnicalDesign" = CASE WHEN p_data ? 'TechnicalDesign' THEN (p_data->>'TechnicalDesign') ELSE "TechnicalDesign" END,
        "InjectNotes" = CASE WHEN p_data ? 'InjectNotes' THEN (p_data->>'InjectNotes')::BOOLEAN ELSE "InjectNotes" END,
        "MaxNotesToInject" = CASE WHEN p_data ? 'MaxNotesToInject' THEN (p_data->>'MaxNotesToInject')::INTEGER ELSE "MaxNotesToInject" END,
        "NoteInjectionStrategy" = CASE WHEN p_data ? 'NoteInjectionStrategy' THEN (p_data->>'NoteInjectionStrategy') ELSE "NoteInjectionStrategy" END,
        "InjectExamples" = CASE WHEN p_data ? 'InjectExamples' THEN (p_data->>'InjectExamples')::BOOLEAN ELSE "InjectExamples" END,
        "MaxExamplesToInject" = CASE WHEN p_data ? 'MaxExamplesToInject' THEN (p_data->>'MaxExamplesToInject')::INTEGER ELSE "MaxExamplesToInject" END,
        "ExampleInjectionStrategy" = CASE WHEN p_data ? 'ExampleInjectionStrategy' THEN (p_data->>'ExampleInjectionStrategy') ELSE "ExampleInjectionStrategy" END,
        "IsRestricted" = CASE WHEN p_data ? 'IsRestricted' THEN (p_data->>'IsRestricted')::BOOLEAN ELSE "IsRestricted" END,
        "MessageMode" = CASE WHEN p_data ? 'MessageMode' THEN (p_data->>'MessageMode') ELSE "MessageMode" END,
        "MaxMessages" = CASE WHEN p_data ? 'MaxMessages' THEN (p_data->>'MaxMessages')::INTEGER ELSE "MaxMessages" END,
        "AttachmentStorageProviderID" = CASE WHEN p_data ? 'AttachmentStorageProviderID' THEN (p_data->>'AttachmentStorageProviderID')::UUID ELSE "AttachmentStorageProviderID" END,
        "AttachmentRootPath" = CASE WHEN p_data ? 'AttachmentRootPath' THEN (p_data->>'AttachmentRootPath') ELSE "AttachmentRootPath" END,
        "InlineStorageThresholdBytes" = CASE WHEN p_data ? 'InlineStorageThresholdBytes' THEN (p_data->>'InlineStorageThresholdBytes')::INTEGER ELSE "InlineStorageThresholdBytes" END,
        "AgentTypePromptParams" = CASE WHEN p_data ? 'AgentTypePromptParams' THEN (p_data->>'AgentTypePromptParams') ELSE "AgentTypePromptParams" END,
        "ScopeConfig" = CASE WHEN p_data ? 'ScopeConfig' THEN (p_data->>'ScopeConfig') ELSE "ScopeConfig" END,
        "NoteRetentionDays" = CASE WHEN p_data ? 'NoteRetentionDays' THEN (p_data->>'NoteRetentionDays')::INTEGER ELSE "NoteRetentionDays" END,
        "ExampleRetentionDays" = CASE WHEN p_data ? 'ExampleRetentionDays' THEN (p_data->>'ExampleRetentionDays')::INTEGER ELSE "ExampleRetentionDays" END,
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
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent" ON __mj."AIAgent";

CREATE TRIGGER "trg_update_ai_agent"
BEFORE UPDATE ON __mj."AIAgent"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Actions.CreatedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "CreatedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Action"
        SET "CreatedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Actions.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Artifact Types records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentArtifactType"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentArtifactType"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Client Tools records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentClientTool"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentClientTool"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Co Agents records via CoAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "CoAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentCoAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Co Agents.TargetAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "TargetAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentCoAgent"
        SET "TargetAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Configurations records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentConfiguration"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentConfiguration"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Data Sources records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentDataSource"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentDataSource"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Examples records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentExample"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Learning Cycles records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentLearningCycle"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentLearningCycle"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Modalities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModality"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentModality"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Models.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModel"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentModel"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Permissions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPermission"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Requests records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRequest"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Runs records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Search Scopes records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSearchScope"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSearchScope"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Sessions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSession"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSession"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Steps records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.SubAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "SubAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "SubAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.DefaultCoAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "DefaultCoAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "DefaultCoAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Bridge Agent Identities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIBridgeAgentIdentity"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIBridgeAgentIdentity"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIResultCache"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversations.DefaultAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Conversation"
        WHERE "DefaultAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Conversation"
        SET "DefaultAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Search Execution Logs.AIAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."SearchExecutionLog"
        WHERE "AIAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."SearchExecutionLog"
        SET "AIAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Task"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Task"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration";
