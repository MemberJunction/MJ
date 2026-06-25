-- =============================================================================
-- v5.43.x — Remove connector integration metadata (moved to MemberJunction/Integrations)
--
-- Every vendor connector now lives in the Integrations repo as an installable Open App
-- (each ships its own Integration + Objects/Fields + credential type). Deleting the
-- metadata FILES stops future seeding; this forward-fix removes the rows already seeded
-- by the baseline so existing/fresh DBs no longer carry them.
--
-- ONE migration, ALL removal. Single scope, applied to every step:
--   a connector to remove = Integration whose Name is NOT one of the two kept-in-MJ
--   ('File Feed' generic file import, 'Betty AI' deferred/unbuilt) AND which has NO live
--   CompanyIntegration connection. A connector with a live connection is left fully intact
--   (Integration + Objects/Fields + credential type) so a core migration never breaks a
--   customer's connection or sync history; the Open-App reinstall handles its migration.
--
-- "Metadata" here = the DEFINITION tables (Integration / Object / Field / URLFormat /
-- CredentialType). Runtime data (CompanyIntegration, runs, record maps) is never touched.
-- FK-safe (leaf->root), idempotent, dialect-portable (no T-SQL-only constructs).
-- =============================================================================

-- 1. Integration Object Fields for the connectors being removed (leaf -> FK-safe).
DELETE FROM ${flyway:defaultSchema}.IntegrationObjectField
WHERE IntegrationObjectID IN (
  SELECT io.ID FROM ${flyway:defaultSchema}.IntegrationObject io
  WHERE io.IntegrationID IN (
    SELECT ID FROM ${flyway:defaultSchema}.Integration
    WHERE Name NOT IN ('File Feed', 'Betty AI')
      AND ID NOT IN (SELECT IntegrationID FROM ${flyway:defaultSchema}.CompanyIntegration WHERE IntegrationID IS NOT NULL)));

-- 2. Integration Objects for the connectors being removed.
DELETE FROM ${flyway:defaultSchema}.IntegrationObject
WHERE IntegrationID IN (
  SELECT ID FROM ${flyway:defaultSchema}.Integration
  WHERE Name NOT IN ('File Feed', 'Betty AI')
    AND ID NOT IN (SELECT IntegrationID FROM ${flyway:defaultSchema}.CompanyIntegration WHERE IntegrationID IS NOT NULL));

-- 3. IntegrationURLFormat rows for the connectors being removed.
DELETE FROM ${flyway:defaultSchema}.IntegrationURLFormat
WHERE IntegrationID IN (
  SELECT ID FROM ${flyway:defaultSchema}.Integration
  WHERE Name NOT IN ('File Feed', 'Betty AI')
    AND ID NOT IN (SELECT IntegrationID FROM ${flyway:defaultSchema}.CompanyIntegration WHERE IntegrationID IS NOT NULL));

-- 4. Preserve audit history — NULL the RecordChange -> Integration link (column is nullable).
UPDATE ${flyway:defaultSchema}.RecordChange SET IntegrationID = NULL
WHERE IntegrationID IN (
  SELECT ID FROM ${flyway:defaultSchema}.Integration
  WHERE Name NOT IN ('File Feed', 'Betty AI')
    AND ID NOT IN (SELECT IntegrationID FROM ${flyway:defaultSchema}.CompanyIntegration WHERE IntegrationID IS NOT NULL));

-- 5. The Integration rows themselves (children removed above; connected ones excluded by scope).
DELETE FROM ${flyway:defaultSchema}.Integration
WHERE Name NOT IN ('File Feed', 'Betty AI')
  AND ID NOT IN (SELECT IntegrationID FROM ${flyway:defaultSchema}.CompanyIntegration WHERE IntegrationID IS NOT NULL);

-- 6. The 22 connector-specific credential types (now shipped by each connector in the repo).
--    Explicit list = the safe scope (generic types — API Key, OAuth2 grants, Azure SP, AWS, GCP,
--    MCP — are used by AIVendor/MCP/kept connectors and must NOT be touched). Guarded: delete only
--    where unreferenced by any remaining Integration / AIVendor / MCPServer / Credential, so a
--    connected connector that kept its Integration also keeps its credential type.
DELETE FROM ${flyway:defaultSchema}.CredentialType
WHERE Name IN (
    'Aptify Authentication','Blackbaud SKY API','Constant Contact OAuth','GrowthZone OAuth2','MagnetMail API',
    'MemberSuite API','Neon CRM API Key','NetForum Enterprise Token','NetSuite TBA','Nimble AMS OAuth',
    'OpenWater API','Path LMS Reporting API','PheedLoop API','PropFuel API','QuickBooks Online OAuth',
    'Rhythm OAuth2','Sage Intacct','Salesforce JWT Bearer','Wicket API','YourMembership API','iMIS OAuth','rasa.io API')
  AND ID NOT IN (SELECT CredentialTypeID FROM ${flyway:defaultSchema}.Integration WHERE CredentialTypeID IS NOT NULL)
  AND ID NOT IN (SELECT CredentialTypeID FROM ${flyway:defaultSchema}.AIVendor WHERE CredentialTypeID IS NOT NULL)
  AND ID NOT IN (SELECT CredentialTypeID FROM ${flyway:defaultSchema}.MCPServer WHERE CredentialTypeID IS NOT NULL)
  AND ID NOT IN (SELECT CredentialTypeID FROM ${flyway:defaultSchema}.Credential WHERE CredentialTypeID IS NOT NULL);
