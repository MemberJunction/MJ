-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606251241__v5.43.x__Remove_Connector_Integration_Metadata.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================= */ /* v5.43.x — Remove connector integration metadata (moved to MemberJunction/Integrations) */ /* Every vendor connector now lives in the Integrations repo as an installable Open App */ /* (each ships its own Integration + Objects/Fields + credential type). Deleting the */ /* metadata FILES stops future seeding; this forward-fix removes the rows already seeded */ /* by the baseline so existing/fresh DBs no longer carry them. */ /* ONE migration, ALL removal. Single scope, applied to every step: */ /*   a connector to remove = Integration whose Name is NOT one of the two kept-in-MJ */ /*   ('File Feed' generic file import, 'Betty AI' deferred/unbuilt) AND which has NO live */ /*   CompanyIntegration connection. A connector with a live connection is left fully intact */ /*   (Integration + Objects/Fields + credential type) so a core migration never breaks a */ /*   customer's connection or sync history; the Open-App reinstall handles its migration. */ /* "Metadata" here = the DEFINITION tables (Integration / Object / Field / URLFormat / */ /* CredentialType). Runtime data (CompanyIntegration, runs, record maps) is never touched. */ /* FK-safe (leaf->root), idempotent, dialect-portable (no T-SQL-only constructs). */ /* ============================================================================= */ /* 1. Integration Object Fields for the connectors being removed (leaf -> FK-safe). */
DELETE FROM __mj."IntegrationObjectField"
WHERE
  "IntegrationObjectID" IN (
    SELECT
      "io"."ID"
    FROM __mj."IntegrationObject" AS "io"
    WHERE
      "io"."IntegrationID" IN (
        SELECT
          "ID"
        FROM __mj."Integration"
        WHERE
          NOT "Name" IN ('File Feed', 'Betty AI')
          AND NOT "ID" IN (
            SELECT
              "IntegrationID"
            FROM __mj."CompanyIntegration"
            WHERE
              NOT "IntegrationID" IS NULL
          )
      )
  );
/* 2. Integration Objects for the connectors being removed. */
DELETE FROM __mj."IntegrationObject"
WHERE
  "IntegrationID" IN (
    SELECT
      "ID"
    FROM __mj."Integration"
    WHERE
      NOT "Name" IN ('File Feed', 'Betty AI')
      AND NOT "ID" IN (
        SELECT
          "IntegrationID"
        FROM __mj."CompanyIntegration"
        WHERE
          NOT "IntegrationID" IS NULL
      )
  );
/* 3. IntegrationURLFormat rows for the connectors being removed. */
DELETE FROM __mj."IntegrationURLFormat"
WHERE
  "IntegrationID" IN (
    SELECT
      "ID"
    FROM __mj."Integration"
    WHERE
      NOT "Name" IN ('File Feed', 'Betty AI')
      AND NOT "ID" IN (
        SELECT
          "IntegrationID"
        FROM __mj."CompanyIntegration"
        WHERE
          NOT "IntegrationID" IS NULL
      )
  );
/* 4. Preserve audit history — NULL the RecordChange -> Integration link (column is nullable). */
UPDATE __mj."RecordChange" SET "IntegrationID" = NULL
WHERE
  "IntegrationID" IN (
    SELECT
      "ID"
    FROM __mj."Integration"
    WHERE
      NOT "Name" IN ('File Feed', 'Betty AI')
      AND NOT "ID" IN (
        SELECT
          "IntegrationID"
        FROM __mj."CompanyIntegration"
        WHERE
          NOT "IntegrationID" IS NULL
      )
  );
/* 5. The Integration rows themselves (children removed above; connected ones excluded by scope). */
DELETE FROM __mj."Integration"
WHERE
  NOT "Name" IN ('File Feed', 'Betty AI')
  AND NOT "ID" IN (
    SELECT
      "IntegrationID"
    FROM __mj."CompanyIntegration"
    WHERE
      NOT "IntegrationID" IS NULL
  );
/* 6. The 22 connector-specific credential types (now shipped by each connector in the repo). */ /*    Explicit list = the safe scope (generic types — API Key, OAuth2 grants, Azure SP, AWS, GCP, */ /*    MCP — are used by AIVendor/MCP/kept connectors and must NOT be touched). Guarded: delete only */ /*    where unreferenced by any remaining Integration / AIVendor / MCPServer / Credential, so a */ /*    connected connector that kept its Integration also keeps its credential type. */
DELETE FROM __mj."CredentialType"
WHERE
  "Name" IN (
    'Aptify Authentication',
    'Blackbaud SKY API',
    'Constant Contact OAuth',
    'GrowthZone OAuth2',
    'MagnetMail API',
    'MemberSuite API',
    'Neon CRM API Key',
    'NetForum Enterprise Token',
    'NetSuite TBA',
    'Nimble AMS OAuth',
    'OpenWater API',
    'Path LMS Reporting API',
    'PheedLoop API',
    'PropFuel API',
    'QuickBooks Online OAuth',
    'Rhythm OAuth2',
    'Sage Intacct',
    'Salesforce JWT Bearer',
    'Wicket API',
    'YourMembership API',
    'iMIS OAuth',
    'rasa.io API'
  )
  AND NOT "ID" IN (
    SELECT
      "CredentialTypeID"
    FROM __mj."Integration"
    WHERE
      NOT "CredentialTypeID" IS NULL
  )
  AND NOT "ID" IN (
    SELECT
      "CredentialTypeID"
    FROM __mj."AIVendor"
    WHERE
      NOT "CredentialTypeID" IS NULL
  )
  AND NOT "ID" IN (
    SELECT
      "CredentialTypeID"
    FROM __mj."MCPServer"
    WHERE
      NOT "CredentialTypeID" IS NULL
  )
  AND NOT "ID" IN (
    SELECT
      "CredentialTypeID"
    FROM __mj."Credential"
    WHERE
      NOT "CredentialTypeID" IS NULL
  );
