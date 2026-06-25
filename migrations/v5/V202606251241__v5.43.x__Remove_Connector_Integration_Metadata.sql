-- =============================================================================
-- v5.43.x — Remove connector integration metadata (moved to MemberJunction/Integrations)
--
-- Every vendor connector now lives in the Integrations repo as an installable Open App
-- (each ships its own Integration + Objects/Fields + credential type). Deleting the
-- metadata FILES stops future seeding; this forward-fix removes the rows already seeded
-- by the baseline so existing/fresh DBs no longer carry them.
--
-- SCOPE = ALL connectors. The ONLY integrations kept are the two NOT in the repo:
--   'File Feed' (generic file import) and 'Betty AI' (deferred, unbuilt).
-- Everything else (all 34 repo connectors, incl. MJ to MJ) is removed.
--
-- CAREFUL — lose nothing that isn't already in the repo, never break runtime:
--   * IntegrationObject/Field: delete ONLY metadata-seeded rows (MetadataSource='Declared');
--     Discovered + Custom (runtime) rows are preserved.
--   * The Integration row is removed ONLY where fully clean afterward — no surviving
--     objects AND no live CompanyIntegration connection. A connected/runtime-rich install
--     keeps its row (the Open-App reinstall re-seeds; never breaks a customer connection).
--   * Audit RecordChange link is NULLed (history preserved), not deleted.
--
-- FK-safe (leaf->root), idempotent, dialect-portable (no T-SQL-only constructs).
-- =============================================================================

-- 1. Metadata-seeded (Declared) Integration Object Fields for all connectors. IOF is a leaf -> FK-safe.
DELETE FROM ${flyway:defaultSchema}.IntegrationObjectField
WHERE MetadataSource = 'Declared'
  AND IntegrationObjectID IN (
    SELECT io.ID FROM ${flyway:defaultSchema}.IntegrationObject io
    WHERE io.IntegrationID IN (
      SELECT ID FROM ${flyway:defaultSchema}.Integration WHERE Name NOT IN ('File Feed', 'Betty AI')));

-- 2. Metadata-seeded (Declared) Integration Objects, only where no field still references them
--    (so surviving Discovered/Custom fields keep their parent). FK-safe.
DELETE FROM ${flyway:defaultSchema}.IntegrationObject
WHERE MetadataSource = 'Declared'
  AND IntegrationID IN (SELECT ID FROM ${flyway:defaultSchema}.Integration WHERE Name NOT IN ('File Feed', 'Betty AI'))
  AND ID NOT IN (SELECT IntegrationObjectID FROM ${flyway:defaultSchema}.IntegrationObjectField WHERE IntegrationObjectID IS NOT NULL)
  AND ID NOT IN (SELECT RelatedIntegrationObjectID FROM ${flyway:defaultSchema}.IntegrationObjectField WHERE RelatedIntegrationObjectID IS NOT NULL);

-- 3. Connector-scoped IntegrationURLFormat rows (FK-blocks the Integration delete otherwise).
DELETE FROM ${flyway:defaultSchema}.IntegrationURLFormat
WHERE IntegrationID IN (SELECT ID FROM ${flyway:defaultSchema}.Integration WHERE Name NOT IN ('File Feed', 'Betty AI'));

-- 4. Preserve audit history — NULL the RecordChange -> Integration link (column is nullable).
UPDATE ${flyway:defaultSchema}.RecordChange SET IntegrationID = NULL
WHERE IntegrationID IN (SELECT ID FROM ${flyway:defaultSchema}.Integration WHERE Name NOT IN ('File Feed', 'Betty AI'));

-- 5. The Integration row — ONLY where fully clean: no surviving Integration Objects
--    (Discovered/Custom would survive step 2) AND no live CompanyIntegration connection.
DELETE FROM ${flyway:defaultSchema}.Integration
WHERE Name NOT IN ('File Feed', 'Betty AI')
  AND ID NOT IN (SELECT IntegrationID FROM ${flyway:defaultSchema}.IntegrationObject WHERE IntegrationID IS NOT NULL)
  AND ID NOT IN (SELECT IntegrationID FROM ${flyway:defaultSchema}.CompanyIntegration WHERE IntegrationID IS NOT NULL);

-- 6. Connector-specific credential types — now shipped by each connector in the Integrations repo
--    (the 22 the repo ships). Explicit list (the safe scope: generic types like API Key / OAuth2
--    grants / Azure SP are used by AIVendor/MCP/kept connectors and must NOT be touched). Guarded:
--    delete only where unreferenced by any remaining Integration / AIVendor / MCPServer / Credential —
--    so a guarded-connected connector that kept its Integration also keeps its credential type.
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
