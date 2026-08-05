-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606272000__v5.44.x__AgentSettings_And_Channel_UIConfig.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — resolve before relying on this migration ══╗
-- UNHANDLED BY THE AST TRANSPILER (1 statement(s)):
--   [1] (parse-error) -- Metadata update as other 5.44 script before this affected some of the above t
--   Each statement above was REPORTED, not silently dropped — port it manually.
-- ╚════════════════════════════════════════════════════════════════╝

ALTER TABLE __mj."Application"
ADD COLUMN "AgentSettings" TEXT NULL /* ============================================================================= */ /* Realtime Client-Context Co-Agent — schema foundation */ /*   Move 1: Application.AgentSettings  (JSONType = IAgentSettings) */ /*   Move 3: AIAgentChannel.IsHeadless (behavioral) + UIConfig (JSONType = IChannelUIConfig) */ /* JSONType metadata for AgentSettings / UIConfig is seeded via metadata sync */ /* (metadata/entities/.entity-field-jsontype-agent-settings.json and */ /*  .entity-field-jsontype-channel-uiconfig.json). Run mj sync after this migration */ /* and before CodeGen so the typed *Object accessors generate. */ /* ============================================================================= */ /* --------------------------------------------------------------------------- */ /* Move 1 — Application.AgentSettings */ /* --------------------------------------------------------------------------- */;

COMMENT ON COLUMN __mj."Application"."AgentSettings" IS 'App-scoped agent configuration JSON (shape = IAgentSettings). Declares the default/lead agent, relevant agents available to conversational and realtime co-agents, app-scoped client tool references, and realtime persona/disclosure overrides that layer into the agent config cascade. Null = no app-level agent config.';

ALTER TABLE __mj."AIAgentChannel"
  ADD COLUMN "IsHeadless" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "UIConfig" TEXT NULL
 /* --------------------------------------------------------------------------- */ /* Move 3 — AIAgentChannel.IsHeadless + UIConfig */ /* --------------------------------------------------------------------------- */;

COMMENT ON COLUMN __mj."AIAgentChannel"."IsHeadless" IS 'When 1, the channel has no visible surface and is never mounted as a tab — it is a live wire (e.g. the headless ClientContextChannel that streams app context + capability manifest to the co-agent). When 0 (default), the channel renders a surface.';

COMMENT ON COLUMN __mj."AIAgentChannel"."UIConfig" IS 'Channel-definition-level presentation/chrome config JSON (shape = IChannelUIConfig): tab DisplayName, GroupName, Color (prefer a design-token name), Icon, SortOrder. Distinct from ConfigSchema, which validates per-session AIAgentSessionChannel.Config state-of-record. Null = host defaults.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ce2a185-77e7-4d14-860c-2e51618ebe35' OR ("EntityID" = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AgentSettings')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1ce2a185-77e7-4d14-860c-2e51618ebe35', 'E8238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Applications */, 100037, 'AgentSettings', 'Agent Settings', 'App-scoped agent configuration JSON (shape = IAgentSettings). Declares the default/lead agent, relevant agents available to conversational and realtime co-agents, app-scoped client tool references, and realtime persona/disclosure overrides that layer into the agent config cascade. Null = no app-level agent config.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Dropdown', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '64a66fbc-25bd-4112-9ba4-0e7d7eeb7865' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'IsHeadless')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('64a66fbc-25bd-4112-9ba4-0e7d7eeb7865', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100021, 'IsHeadless', 'Is Headless', 'When 1, the channel has no visible surface and is never mounted as a tab — it is a live wire (e.g. the headless ClientContextChannel that streams app context + capability manifest to the co-agent). When 0 (default), the channel renders a surface.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '64ceff3e-9e6c-43e8-8b3c-559fa0e7eea1' OR ("EntityID" = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND "Name" = 'UIConfig')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('64ceff3e-9e6c-43e8-8b3c-559fa0e7eea1', '31A90934-E8E7-4EF9-8430-D63E8F224ABD' /* Entity: MJ: AI Agent Channels */, 100022, 'UIConfig', 'UI Config', 'Channel-definition-level presentation/chrome config JSON (shape = IChannelUIConfig): tab DisplayName, GroupName, Color (prefer a design-token name), Icon, SortOrder. Distinct from ConfigSchema, which validates per-session AIAgentSessionChannel.Config state-of-record. Null = host defaults.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '799CC5FB-663D-413B-AD76-8DE5F8C373EE'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '474F17F0-6F36-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '799CC5FB-663D-413B-AD76-8DE5F8C373EE'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '464F17F0-6F36-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '799CC5FB-663D-413B-AD76-8DE5F8C373EE'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'E8238F34-2837-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 19 fields */
/* UPDATE Entity Field Category Info MJ: Applications.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '454F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '464F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '474F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.Icon */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B25717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.DefaultForNewUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B35717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '054D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '064D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.SchemaAutoAddNewEntities */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Auto Add Entities From Schema', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FCFF872D-0B33-4C53-BB9F-15910F91AD83' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.Color */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9A6D6C48-40DC-45ED-A524-D82B7B2F9EC6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.DefaultNavItems */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '6A46A06E-7B1C-466D-9447-1924D9EF2FA0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.ClassName */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9A21A856-C791-4363-9B29-2DE6BC6AFB29' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.DefaultSequence */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B80AC534-6341-4F99-AA26-B119BAD3DE45' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A584A155-01F7-4D79-BF72-47513BFFD6E7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.NavigationStyle */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '09A7FABC-07CF-48E3-9985-DC92F3AF6F81' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.TopNavLocation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '866E22FF-8E97-4436-9186-276076961988' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.HideNavBarIconWhenActive */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1E997F79-B97C-47D4-8A84-1936227F577A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.Path */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '799CC5FB-663D-413B-AD76-8DE5F8C373EE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.AutoUpdatePath */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BD572C5C-1276-4495-8061-2C52BF71B437' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Applications.AgentSettings */
UPDATE __mj."EntityField" SET "Category" = 'Agent Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '1CE2A185-77E7-4D14-860C-2E51618EBE35' AND "AutoUpdateCategory" = TRUE;

/* Update FieldCategoryInfo setting for entity */
UPDATE __mj."EntitySetting" SET "Value" = '{"Agent Configuration":{"icon":"fa fa-robot","description":"Settings for conversational agents and co-agent integration"}}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'E8238F34-2837-EF11-86D4-6045BDEE16E6'
  AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */
UPDATE __mj."EntitySetting" SET "Value" = '{"Agent Configuration":"fa fa-robot"}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'E8238F34-2837-EF11-86D4-6045BDEE16E6'
  AND "Name" = 'FieldCategoryIcons';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '64A66FBC-25BD-4112-9BA4-0E7D7EEB7865'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 12 fields */
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DB44A6C4-BAF0-4359-B418-E5FB718EE90E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C90CE2DA-E8D8-4D71-973C-FE59F5D418C4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0AD5C52D-1798-4641-AD57-FFBA62E2C76B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.IsActive */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Active', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C8CBC42F-51B8-45D1-8881-E2919A9C7F57' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.IsHeadless */
UPDATE __mj."EntityField" SET "Category" = 'Channel Definition', "GeneratedFormSection" = 'Category', "DisplayName" = 'Headless', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '64A66FBC-25BD-4112-9BA4-0E7D7EEB7865' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.ServerPluginClass */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F73F7460-FF98-4456-BA1B-DC4DE6AA4084' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.ClientPluginClass */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '082ADEA5-D3DC-45FE-94BF-3EF4F00213B7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.TransportType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1156A613-E382-407F-B854-78726BEA9935' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.ConfigSchema */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'AA605081-B521-4529-990F-3A6F0CA7BB6C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.UIConfig */
UPDATE __mj."EntityField" SET "Category" = 'Technical Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'UI Configuration', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '64CEFF3E-9E6C-43E8-8B3C-559FA0E7EEA1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7F7E3F6B-81AB-438C-94F8-7DE7DD4D1FBB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Channels.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7EA84205-06E2-4257-BD39-3DE60EB0969F' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: vwAIAgentChannels
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Channels
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentChannel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentChannels"
AS
SELECT
    a.*
FROM
    __mj."AIAgentChannel" AS a
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
    AND tc.relname = 'vwAIAgentChannels'
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
    AND tc.relname = 'vwAIAgentChannels'
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
        AND tc.relname = 'vwAIAgentChannels'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentChannels" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentChannels" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentChannels" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentChannels" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: spCreateAIAgentChannel
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentChannel"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description varchar(1000) DEFAULT NULL,
    p_serverpluginclass varchar(250) DEFAULT NULL,
    p_clientpluginclass varchar(250) DEFAULT NULL,
    p_transporttype varchar(20) DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema TEXT DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_isheadless BOOLEAN DEFAULT NULL,
    p_uiconfig_clear boolean DEFAULT false,
    p_uiconfig TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentChannels" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentChannel"
        (
            "ID",
            "Name",
                "Description",
                "ServerPluginClass",
                "ClientPluginClass",
                "TransportType",
                "ConfigSchema",
                "IsActive",
                "IsHeadless",
                "UIConfig"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_serverpluginclass,
                p_clientpluginclass,
                COALESCE(p_transporttype, 'PubSub'),
                CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, NULL) END,
                COALESCE(p_isactive, TRUE),
                COALESCE(p_isheadless, FALSE),
                CASE WHEN p_uiconfig_clear = true THEN NULL ELSE COALESCE(p_uiconfig, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentChannels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentChannel" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: spUpdateAIAgentChannel
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentChannel"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description varchar(1000) DEFAULT NULL,
    p_serverpluginclass varchar(250) DEFAULT NULL,
    p_clientpluginclass varchar(250) DEFAULT NULL,
    p_transporttype varchar(20) DEFAULT NULL,
    p_configschema_clear boolean DEFAULT false,
    p_configschema TEXT DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_isheadless BOOLEAN DEFAULT NULL,
    p_uiconfig_clear boolean DEFAULT false,
    p_uiconfig TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentChannels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentChannel"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ServerPluginClass" = COALESCE(p_serverpluginclass, "ServerPluginClass"),
        "ClientPluginClass" = COALESCE(p_clientpluginclass, "ClientPluginClass"),
        "TransportType" = COALESCE(p_transporttype, "TransportType"),
        "ConfigSchema" = CASE WHEN p_configschema_clear = true THEN NULL ELSE COALESCE(p_configschema, "ConfigSchema") END,
        "IsActive" = COALESCE(p_isactive, "IsActive"),
        "IsHeadless" = COALESCE(p_isheadless, "IsHeadless"),
        "UIConfig" = CASE WHEN p_uiconfig_clear = true THEN NULL ELSE COALESCE(p_uiconfig, "UIConfig") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentChannels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentChannel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentChannel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_channel"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_channel" ON __mj."AIAgentChannel";

CREATE TRIGGER "trg_update_ai_agent_channel"
BEFORE UPDATE ON __mj."AIAgentChannel"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_channel"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Channels
-- Item: spDeleteAIAgentChannel
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentChannel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentChannel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentChannel"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentChannel"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentChannel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentChannel" TO "cdp_Integration";

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwApplications"
AS
SELECT
    a.*
FROM
    __mj."Application" AS a
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
    AND tc.relname = 'vwApplications'
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
    AND tc.relname = 'vwApplications'
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
        AND tc.relname = 'vwApplications'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwApplications" CASCADE;
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
GRANT SELECT ON __mj."vwApplications" TO "cdp_Developer";
GRANT SELECT ON __mj."vwApplications" TO "cdp_Integration";
GRANT SELECT ON __mj."vwApplications" TO "cdp_UI";

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

CREATE OR REPLACE FUNCTION __mj."spCreateApplication"(
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
) RETURNS SETOF __mj."vwApplications" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Application"
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
    SELECT * FROM __mj."vwApplications"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateApplication" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateApplication"(
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
) RETURNS SETOF __mj."vwApplications" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Application"
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
    SELECT * FROM __mj."vwApplications"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateApplication" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Application table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_application"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_application" ON __mj."Application";

CREATE TRIGGER "trg_update_application"
BEFORE UPDATE ON __mj."Application"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_application"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteApplication"(
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
        FROM __mj."ApplicationEntity"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteApplicationEntity"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Application Roles records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ApplicationRole"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteApplicationRole"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Application Settings records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ApplicationSetting"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteApplicationSetting"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversations.ApplicationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Conversation"
        WHERE "ApplicationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Conversation"
        SET "ApplicationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Dashboard User Preferences records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."DashboardUserPreference"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteDashboardUserPreference"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Dashboards.ApplicationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Dashboard"
        WHERE "ApplicationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Dashboard"
        SET "ApplicationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Magic Link Invite Applications records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."MagicLinkInviteApplication"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteMagicLinkInviteApplication"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Magic Link Invites records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."MagicLinkInvite"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteMagicLinkInvite"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: User Applications records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."UserApplication"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteUserApplication"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."Application"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteApplication" TO "cdp_Integration";
