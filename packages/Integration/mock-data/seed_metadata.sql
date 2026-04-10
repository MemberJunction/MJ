-- =============================================================================
-- seed_metadata.sql
-- =============================================================================
-- Populates MJ_Workbench integration metadata tables with entity maps, field
-- maps, integration runs, and run details for the 3 mock company integrations.
--
-- Prerequisites:
--   - MJ_Workbench database with __mj schema and integration tables
--   - Company integrations already created (HubSpot, Salesforce, YourMembership)
--   - mock_data database with hs, sf, ym schemas
--
-- Usage:
--   sqlcmd -S sql-claude -U sa -P "Claude2Sql99" -C -i seed_metadata.sql
-- =============================================================================

USE MJ_Workbench;
GO

-- =============================================================================
-- REFERENCE IDs (from create_mock_data.sql)
-- =============================================================================
-- Company:          11111111-1111-1111-1111-111111111111
-- Integrations:
--   HubSpot:        22222222-2222-2222-2222-222222222201
--   Salesforce:     22222222-2222-2222-2222-222222222202
--   YourMembership: 22222222-2222-2222-2222-222222222203
-- Company Integrations:
--   HubSpot:        33333333-3333-3333-3333-333333333301
--   Salesforce:     33333333-3333-3333-3333-333333333302
--   YourMembership: 33333333-3333-3333-3333-333333333303
-- Target Entities:
--   Members:        B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97
--   Events:         9E2B4760-B781-4CDD-ACE0-A4E1E7AF18C3
--   Donations:      E58E0F00-1090-43A3-95F4-3D1B4BE4CE46
--   MJ: Companies:  D4238F34-2837-EF11-86D4-6045BDEE16E6
-- User:
--   System:         ECAFCCEC-6A37-EF11-86D4-000D3A4E707E

-- =============================================================================
-- CLEAN EXISTING DATA (child tables first to respect FKs)
-- =============================================================================
DELETE FROM __mj.CompanyIntegrationRunDetail
  WHERE CompanyIntegrationRunID IN (
    SELECT ID FROM __mj.CompanyIntegrationRun
    WHERE CompanyIntegrationID IN (
      '33333333-3333-3333-3333-333333333301',
      '33333333-3333-3333-3333-333333333302',
      '33333333-3333-3333-3333-333333333303'
    )
  );

DELETE FROM __mj.CompanyIntegrationRun
  WHERE CompanyIntegrationID IN (
    '33333333-3333-3333-3333-333333333301',
    '33333333-3333-3333-3333-333333333302',
    '33333333-3333-3333-3333-333333333303'
  );

DELETE FROM __mj.CompanyIntegrationFieldMap
  WHERE EntityMapID IN (
    SELECT ID FROM __mj.CompanyIntegrationEntityMap
    WHERE CompanyIntegrationID IN (
      '33333333-3333-3333-3333-333333333301',
      '33333333-3333-3333-3333-333333333302',
      '33333333-3333-3333-3333-333333333303'
    )
  );

DELETE FROM __mj.CompanyIntegrationEntityMap
  WHERE CompanyIntegrationID IN (
    '33333333-3333-3333-3333-333333333301',
    '33333333-3333-3333-3333-333333333302',
    '33333333-3333-3333-3333-333333333303'
  );
GO

-- =============================================================================
-- ENTITY MAPS
-- =============================================================================
-- IDs use deterministic pattern: 44444444-4444-4444-4444-4444444444XX

-- HubSpot entity maps (3)
INSERT INTO __mj.CompanyIntegrationEntityMap
  (ID, CompanyIntegrationID, ExternalObjectName, ExternalObjectLabel, EntityID, SyncDirection, SyncEnabled, MatchStrategy, ConflictResolution, Priority, DeleteBehavior, Status)
VALUES
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301',
   'hs.contacts', 'HubSpot Contacts',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'Pull', 1,
   '{"strategy":"email_match","fields":["email"]}', 'SourceWins', 1, 'SoftDelete', 'Active'),

  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333301',
   'hs.companies', 'HubSpot Companies',
   'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'Pull', 1,
   '{"strategy":"name_match","fields":["name"]}', 'SourceWins', 2, 'SoftDelete', 'Active'),

  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333301',
   'hs.deals', 'HubSpot Deals',
   'E58E0F00-1090-43A3-95F4-3D1B4BE4CE46', 'Pull', 1,
   '{"strategy":"id_match","fields":["dealId"]}', 'SourceWins', 3, 'SoftDelete', 'Active');

-- Salesforce entity maps (3)
INSERT INTO __mj.CompanyIntegrationEntityMap
  (ID, CompanyIntegrationID, ExternalObjectName, ExternalObjectLabel, EntityID, SyncDirection, SyncEnabled, MatchStrategy, ConflictResolution, Priority, DeleteBehavior, Status)
VALUES
  ('44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333302',
   'sf.Contact', 'Salesforce Contacts',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'Pull', 1,
   '{"strategy":"email_match","fields":["Email"]}', 'SourceWins', 1, 'SoftDelete', 'Active'),

  ('44444444-4444-4444-4444-444444444405', '33333333-3333-3333-3333-333333333302',
   'sf.Account', 'Salesforce Accounts',
   'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'Bidirectional', 1,
   '{"strategy":"name_match","fields":["Name"]}', 'SourceWins', 2, 'SoftDelete', 'Active'),

  ('44444444-4444-4444-4444-444444444406', '33333333-3333-3333-3333-333333333302',
   'sf.Opportunity', 'Salesforce Opportunities',
   'E58E0F00-1090-43A3-95F4-3D1B4BE4CE46', 'Bidirectional', 1,
   '{"strategy":"id_match","fields":["Id"]}', 'SourceWins', 3, 'SoftDelete', 'Active');

-- YourMembership entity maps (3)
INSERT INTO __mj.CompanyIntegrationEntityMap
  (ID, CompanyIntegrationID, ExternalObjectName, ExternalObjectLabel, EntityID, SyncDirection, SyncEnabled, MatchStrategy, ConflictResolution, Priority, DeleteBehavior, Status)
VALUES
  ('44444444-4444-4444-4444-444444444407', '33333333-3333-3333-3333-333333333303',
   'ym.members', 'YourMembership Members',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'Pull', 1,
   '{"strategy":"email_match","fields":["email"]}', 'SourceWins', 1, 'SoftDelete', 'Active'),

  ('44444444-4444-4444-4444-444444444408', '33333333-3333-3333-3333-333333333303',
   'ym.events', 'YourMembership Events',
   '9E2B4760-B781-4CDD-ACE0-A4E1E7AF18C3', 'Pull', 1,
   '{"strategy":"name_match","fields":["event_name"]}', 'SourceWins', 2, 'SoftDelete', 'Active'),

  ('44444444-4444-4444-4444-444444444409', '33333333-3333-3333-3333-333333333303',
   'ym.membership_types', 'YourMembership Types',
   'E58E0F00-1090-43A3-95F4-3D1B4BE4CE46', 'Pull', 1,
   '{"strategy":"name_match","fields":["name"]}', 'SourceWins', 3, 'SoftDelete', 'Active');
GO

-- =============================================================================
-- FIELD MAPS
-- =============================================================================
-- IDs use pattern: 55555555-5555-5555-5555-55555555XXYY (XX=entity map, YY=field)

-- ---------------------------------------------------------------------------
-- HubSpot Contacts → Members  (entity map 01)
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationFieldMap
  (ID, EntityMapID, SourceFieldName, SourceFieldLabel, DestinationFieldName, DestinationFieldLabel, Direction, TransformPipeline, IsKeyField, IsRequired, DefaultValue, Priority, Status)
VALUES
  ('55555555-5555-5555-5555-555555550101', '44444444-4444-4444-4444-444444444401',
   'email', 'Email', 'Email', 'Email', 'SourceToDest', NULL, 1, 1, NULL, 1, 'Active'),
  ('55555555-5555-5555-5555-555555550102', '44444444-4444-4444-4444-444444444401',
   'firstname', 'First Name', 'FirstName', 'First Name', 'SourceToDest', NULL, 0, 1, NULL, 2, 'Active'),
  ('55555555-5555-5555-5555-555555550103', '44444444-4444-4444-4444-444444444401',
   'lastname', 'Last Name', 'LastName', 'Last Name', 'SourceToDest', NULL, 0, 1, NULL, 3, 'Active'),
  ('55555555-5555-5555-5555-555555550104', '44444444-4444-4444-4444-444444444401',
   'phone', 'Phone', 'Phone', 'Phone', 'SourceToDest', NULL, 0, 0, NULL, 4, 'Active'),
  ('55555555-5555-5555-5555-555555550105', '44444444-4444-4444-4444-444444444401',
   'company', 'Company', 'Company', 'Company', 'SourceToDest', NULL, 0, 0, NULL, 5, 'Active'),
  ('55555555-5555-5555-5555-555555550106', '44444444-4444-4444-4444-444444444401',
   'jobtitle', 'Job Title', 'Title', 'Title', 'SourceToDest', NULL, 0, 0, NULL, 6, 'Active'),
  ('55555555-5555-5555-5555-555555550107', '44444444-4444-4444-4444-444444444401',
   'lifecyclestage', 'Lifecycle Stage', 'Status', 'Status', 'SourceToDest',
   '{"transform":"map","mapping":{"lead":"Prospect","customer":"Active","subscriber":"Inactive"}}',
   0, 0, 'Prospect', 7, 'Active');

-- ---------------------------------------------------------------------------
-- HubSpot Companies → MJ: Companies  (entity map 02)
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationFieldMap
  (ID, EntityMapID, SourceFieldName, SourceFieldLabel, DestinationFieldName, DestinationFieldLabel, Direction, TransformPipeline, IsKeyField, IsRequired, DefaultValue, Priority, Status)
VALUES
  ('55555555-5555-5555-5555-555555550201', '44444444-4444-4444-4444-444444444402',
   'name', 'Name', 'Name', 'Company Name', 'SourceToDest', NULL, 1, 1, NULL, 1, 'Active'),
  ('55555555-5555-5555-5555-555555550202', '44444444-4444-4444-4444-444444444402',
   'domain', 'Domain', 'Website', 'Website', 'SourceToDest', NULL, 0, 0, NULL, 2, 'Active'),
  ('55555555-5555-5555-5555-555555550203', '44444444-4444-4444-4444-444444444402',
   'industry', 'Industry', 'Industry', 'Industry', 'SourceToDest', NULL, 0, 0, NULL, 3, 'Active'),
  ('55555555-5555-5555-5555-555555550204', '44444444-4444-4444-4444-444444444402',
   'phone', 'Phone', 'Phone', 'Phone', 'SourceToDest', NULL, 0, 0, NULL, 4, 'Active'),
  ('55555555-5555-5555-5555-555555550205', '44444444-4444-4444-4444-444444444402',
   'city', 'City', 'City', 'City', 'SourceToDest', NULL, 0, 0, NULL, 5, 'Active');

-- ---------------------------------------------------------------------------
-- HubSpot Deals → Donations  (entity map 03)
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationFieldMap
  (ID, EntityMapID, SourceFieldName, SourceFieldLabel, DestinationFieldName, DestinationFieldLabel, Direction, TransformPipeline, IsKeyField, IsRequired, DefaultValue, Priority, Status)
VALUES
  ('55555555-5555-5555-5555-555555550301', '44444444-4444-4444-4444-444444444403',
   'dealId', 'Deal ID', 'ExternalID', 'External ID', 'SourceToDest', NULL, 1, 1, NULL, 1, 'Active'),
  ('55555555-5555-5555-5555-555555550302', '44444444-4444-4444-4444-444444444403',
   'dealname', 'Deal Name', 'Name', 'Name', 'SourceToDest', NULL, 0, 1, NULL, 2, 'Active'),
  ('55555555-5555-5555-5555-555555550303', '44444444-4444-4444-4444-444444444403',
   'amount', 'Amount', 'Amount', 'Amount', 'SourceToDest', NULL, 0, 0, NULL, 3, 'Active'),
  ('55555555-5555-5555-5555-555555550304', '44444444-4444-4444-4444-444444444403',
   'dealstage', 'Deal Stage', 'Stage', 'Stage', 'SourceToDest', NULL, 0, 0, NULL, 4, 'Active'),
  ('55555555-5555-5555-5555-555555550305', '44444444-4444-4444-4444-444444444403',
   'closedate', 'Close Date', 'CloseDate', 'Close Date', 'SourceToDest', NULL, 0, 0, NULL, 5, 'Active');

-- ---------------------------------------------------------------------------
-- Salesforce Contacts → Members  (entity map 04)
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationFieldMap
  (ID, EntityMapID, SourceFieldName, SourceFieldLabel, DestinationFieldName, DestinationFieldLabel, Direction, TransformPipeline, IsKeyField, IsRequired, DefaultValue, Priority, Status)
VALUES
  ('55555555-5555-5555-5555-555555550401', '44444444-4444-4444-4444-444444444404',
   'Email', 'Email', 'Email', 'Email', 'SourceToDest', NULL, 1, 1, NULL, 1, 'Active'),
  ('55555555-5555-5555-5555-555555550402', '44444444-4444-4444-4444-444444444404',
   'FirstName', 'First Name', 'FirstName', 'First Name', 'SourceToDest', NULL, 0, 1, NULL, 2, 'Active'),
  ('55555555-5555-5555-5555-555555550403', '44444444-4444-4444-4444-444444444404',
   'LastName', 'Last Name', 'LastName', 'Last Name', 'SourceToDest', NULL, 0, 1, NULL, 3, 'Active'),
  ('55555555-5555-5555-5555-555555550404', '44444444-4444-4444-4444-444444444404',
   'Phone', 'Phone', 'Phone', 'Phone', 'SourceToDest', NULL, 0, 0, NULL, 4, 'Active'),
  ('55555555-5555-5555-5555-555555550405', '44444444-4444-4444-4444-444444444404',
   'Title', 'Title', 'Title', 'Title', 'SourceToDest', NULL, 0, 0, NULL, 5, 'Active'),
  ('55555555-5555-5555-5555-555555550406', '44444444-4444-4444-4444-444444444404',
   'MailingCity', 'Mailing City', 'City', 'City', 'SourceToDest', NULL, 0, 0, NULL, 6, 'Active'),
  ('55555555-5555-5555-5555-555555550407', '44444444-4444-4444-4444-444444444404',
   'LeadSource', 'Lead Source', 'Source', 'Source', 'SourceToDest', NULL, 0, 0, NULL, 7, 'Active');

-- ---------------------------------------------------------------------------
-- Salesforce Accounts → MJ: Companies  (entity map 05)
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationFieldMap
  (ID, EntityMapID, SourceFieldName, SourceFieldLabel, DestinationFieldName, DestinationFieldLabel, Direction, TransformPipeline, IsKeyField, IsRequired, DefaultValue, Priority, Status)
VALUES
  ('55555555-5555-5555-5555-555555550501', '44444444-4444-4444-4444-444444444405',
   'Name', 'Name', 'Name', 'Company Name', 'Both', NULL, 1, 1, NULL, 1, 'Active'),
  ('55555555-5555-5555-5555-555555550502', '44444444-4444-4444-4444-444444444405',
   'Industry', 'Industry', 'Industry', 'Industry', 'Both', NULL, 0, 0, NULL, 2, 'Active'),
  ('55555555-5555-5555-5555-555555550503', '44444444-4444-4444-4444-444444444405',
   'Phone', 'Phone', 'Phone', 'Phone', 'Both', NULL, 0, 0, NULL, 3, 'Active'),
  ('55555555-5555-5555-5555-555555550504', '44444444-4444-4444-4444-444444444405',
   'Website', 'Website', 'Website', 'Website', 'Both', NULL, 0, 0, NULL, 4, 'Active'),
  ('55555555-5555-5555-5555-555555550505', '44444444-4444-4444-4444-444444444405',
   'BillingCity', 'Billing City', 'City', 'City', 'Both', NULL, 0, 0, NULL, 5, 'Active');

-- ---------------------------------------------------------------------------
-- Salesforce Opportunities → Donations  (entity map 06)
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationFieldMap
  (ID, EntityMapID, SourceFieldName, SourceFieldLabel, DestinationFieldName, DestinationFieldLabel, Direction, TransformPipeline, IsKeyField, IsRequired, DefaultValue, Priority, Status)
VALUES
  ('55555555-5555-5555-5555-555555550601', '44444444-4444-4444-4444-444444444406',
   'Id', 'Id', 'ExternalID', 'External ID', 'Both', NULL, 1, 1, NULL, 1, 'Active'),
  ('55555555-5555-5555-5555-555555550602', '44444444-4444-4444-4444-444444444406',
   'Name', 'Name', 'Name', 'Name', 'Both', NULL, 0, 1, NULL, 2, 'Active'),
  ('55555555-5555-5555-5555-555555550603', '44444444-4444-4444-4444-444444444406',
   'Amount', 'Amount', 'Amount', 'Amount', 'Both', NULL, 0, 0, NULL, 3, 'Active'),
  ('55555555-5555-5555-5555-555555550604', '44444444-4444-4444-4444-444444444406',
   'StageName', 'Stage', 'Stage', 'Stage', 'Both', NULL, 0, 0, NULL, 4, 'Active'),
  ('55555555-5555-5555-5555-555555550605', '44444444-4444-4444-4444-444444444406',
   'CloseDate', 'Close Date', 'CloseDate', 'Close Date', 'Both', NULL, 0, 0, NULL, 5, 'Active');

-- ---------------------------------------------------------------------------
-- YourMembership Members → Members  (entity map 07)
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationFieldMap
  (ID, EntityMapID, SourceFieldName, SourceFieldLabel, DestinationFieldName, DestinationFieldLabel, Direction, TransformPipeline, IsKeyField, IsRequired, DefaultValue, Priority, Status)
VALUES
  ('55555555-5555-5555-5555-555555550701', '44444444-4444-4444-4444-444444444407',
   'email', 'Email', 'Email', 'Email', 'SourceToDest', NULL, 1, 1, NULL, 1, 'Active'),
  ('55555555-5555-5555-5555-555555550702', '44444444-4444-4444-4444-444444444407',
   'first_name', 'First Name', 'FirstName', 'First Name', 'SourceToDest', NULL, 0, 1, NULL, 2, 'Active'),
  ('55555555-5555-5555-5555-555555550703', '44444444-4444-4444-4444-444444444407',
   'last_name', 'Last Name', 'LastName', 'Last Name', 'SourceToDest', NULL, 0, 1, NULL, 3, 'Active'),
  ('55555555-5555-5555-5555-555555550704', '44444444-4444-4444-4444-444444444407',
   'phone', 'Phone', 'Phone', 'Phone', 'SourceToDest', NULL, 0, 0, NULL, 4, 'Active'),
  ('55555555-5555-5555-5555-555555550705', '44444444-4444-4444-4444-444444444407',
   'member_number', 'Member Number', 'MemberNumber', 'Member Number', 'SourceToDest', NULL, 0, 0, NULL, 5, 'Active'),
  ('55555555-5555-5555-5555-555555550706', '44444444-4444-4444-4444-444444444407',
   'status', 'Status', 'Status', 'Status', 'SourceToDest',
   '{"transform":"map","mapping":{"Active":"Active","Expired":"Inactive","Pending":"Prospect","Deleted":"Deleted"}}',
   0, 0, 'Prospect', 6, 'Active');

-- ---------------------------------------------------------------------------
-- YourMembership Events → Events  (entity map 08)
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationFieldMap
  (ID, EntityMapID, SourceFieldName, SourceFieldLabel, DestinationFieldName, DestinationFieldLabel, Direction, TransformPipeline, IsKeyField, IsRequired, DefaultValue, Priority, Status)
VALUES
  ('55555555-5555-5555-5555-555555550801', '44444444-4444-4444-4444-444444444408',
   'event_id', 'Event ID', 'ExternalID', 'External ID', 'SourceToDest', NULL, 1, 1, NULL, 1, 'Active'),
  ('55555555-5555-5555-5555-555555550802', '44444444-4444-4444-4444-444444444408',
   'event_name', 'Event Name', 'Name', 'Name', 'SourceToDest', NULL, 0, 1, NULL, 2, 'Active'),
  ('55555555-5555-5555-5555-555555550803', '44444444-4444-4444-4444-444444444408',
   'event_date', 'Event Date', 'StartDate', 'Start Date', 'SourceToDest', NULL, 0, 0, NULL, 3, 'Active'),
  ('55555555-5555-5555-5555-555555550804', '44444444-4444-4444-4444-444444444408',
   'location', 'Location', 'Location', 'Location', 'SourceToDest', NULL, 0, 0, NULL, 4, 'Active'),
  ('55555555-5555-5555-5555-555555550805', '44444444-4444-4444-4444-444444444408',
   'capacity', 'Capacity', 'Capacity', 'Capacity', 'SourceToDest', NULL, 0, 0, NULL, 5, 'Active');

-- ---------------------------------------------------------------------------
-- YourMembership Types → Donations  (entity map 09)
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationFieldMap
  (ID, EntityMapID, SourceFieldName, SourceFieldLabel, DestinationFieldName, DestinationFieldLabel, Direction, TransformPipeline, IsKeyField, IsRequired, DefaultValue, Priority, Status)
VALUES
  ('55555555-5555-5555-5555-555555550901', '44444444-4444-4444-4444-444444444409',
   'type_id', 'Type ID', 'ExternalID', 'External ID', 'SourceToDest', NULL, 1, 1, NULL, 1, 'Active'),
  ('55555555-5555-5555-5555-555555550902', '44444444-4444-4444-4444-444444444409',
   'name', 'Name', 'Name', 'Name', 'SourceToDest', NULL, 0, 1, NULL, 2, 'Active'),
  ('55555555-5555-5555-5555-555555550903', '44444444-4444-4444-4444-444444444409',
   'price', 'Price', 'Amount', 'Amount', 'SourceToDest', NULL, 0, 0, NULL, 3, 'Active'),
  ('55555555-5555-5555-5555-555555550904', '44444444-4444-4444-4444-444444444409',
   'duration_months', 'Duration (Months)', 'Duration', 'Duration', 'SourceToDest', NULL, 0, 0, NULL, 4, 'Active'),
  ('55555555-5555-5555-5555-555555550905', '44444444-4444-4444-4444-444444444409',
   'status', 'Status', 'Status', 'Status', 'SourceToDest', NULL, 0, 0, NULL, 5, 'Active');
GO

-- =============================================================================
-- INTEGRATION RUNS
-- =============================================================================
-- Timing pattern for UI testing:
--   HubSpot:        2 runs - success 2h ago + success 26h ago (shows "stale")
--   Salesforce:     1 run  - success 3h ago
--   YourMembership: 1 run  - FAILED 1h ago
-- IDs: 66666666-6666-6666-6666-6666666666XX

-- HubSpot run 1: success, 26 hours ago (stale indicator)
INSERT INTO __mj.CompanyIntegrationRun
  (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments, ConfigData)
VALUES
  ('66666666-6666-6666-6666-666666666601',
   '33333333-3333-3333-3333-333333333301',
   'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E',
   DATEADD(HOUR, -26, SYSDATETIMEOFFSET()),
   DATEADD(MINUTE, -1550, SYSDATETIMEOFFSET()),
   50, 'Success',
   'Full initial sync of HubSpot contacts, companies, and deals.',
   '{"syncType":"full","batchSize":100}');

-- HubSpot run 2: success, 2 hours ago
INSERT INTO __mj.CompanyIntegrationRun
  (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments, ConfigData)
VALUES
  ('66666666-6666-6666-6666-666666666602',
   '33333333-3333-3333-3333-333333333301',
   'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E',
   DATEADD(HOUR, -2, SYSDATETIMEOFFSET()),
   DATEADD(MINUTE, -110, SYSDATETIMEOFFSET()),
   12, 'Success',
   'Incremental sync: 8 updates, 4 new contacts.',
   '{"syncType":"incremental","batchSize":100}');

-- Salesforce run: success, 3 hours ago
INSERT INTO __mj.CompanyIntegrationRun
  (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments, ConfigData)
VALUES
  ('66666666-6666-6666-6666-666666666603',
   '33333333-3333-3333-3333-333333333302',
   'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E',
   DATEADD(HOUR, -3, SYSDATETIMEOFFSET()),
   DATEADD(MINUTE, -170, SYSDATETIMEOFFSET()),
   35, 'Success',
   'Salesforce contact and account sync completed successfully.',
   '{"syncType":"incremental","batchSize":200}');

-- YourMembership run: FAILED, 1 hour ago
INSERT INTO __mj.CompanyIntegrationRun
  (ID, CompanyIntegrationID, RunByUserID, StartedAt, EndedAt, TotalRecords, Status, Comments, ErrorLog, ConfigData)
VALUES
  ('66666666-6666-6666-6666-666666666604',
   '33333333-3333-3333-3333-333333333303',
   'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E',
   DATEADD(HOUR, -1, SYSDATETIMEOFFSET()),
   DATEADD(MINUTE, -45, SYSDATETIMEOFFSET()),
   23, 'Failed',
   'Sync failed after processing 23 of 54 member records. API rate limit exceeded.',
   '{"error":"HTTP 429 Too Many Requests","details":"Rate limit exceeded for /api/v2/members endpoint. Retry after 60s.","failedAt":"ym.members","recordsProcessed":23,"recordsTotal":54}',
   '{"syncType":"incremental","batchSize":50}');
GO

-- =============================================================================
-- RUN DETAILS
-- =============================================================================
-- IDs: 77777777-7777-7777-7777-7777777XXXYY (XXX=run suffix, YY=detail seq)

-- ---------------------------------------------------------------------------
-- HubSpot Run 1 (66666666-...-01): full sync, 50 records
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationRunDetail
  (ID, CompanyIntegrationRunID, EntityID, RecordID, Action, ExecutedAt, IsSuccess)
VALUES
  ('77777777-7777-7777-7777-777777700101', '66666666-6666-6666-6666-666666666601',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'hs-contact-batch-1', 'Create              ', DATEADD(HOUR, -26, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700102', '66666666-6666-6666-6666-666666666601',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'hs-contact-batch-2', 'Create              ', DATEADD(MINUTE, -1555, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700103', '66666666-6666-6666-6666-666666666601',
   'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'hs-company-batch-1', 'Create              ', DATEADD(MINUTE, -1553, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700104', '66666666-6666-6666-6666-666666666601',
   'E58E0F00-1090-43A3-95F4-3D1B4BE4CE46', 'hs-deal-batch-1', 'Create              ', DATEADD(MINUTE, -1551, SYSDATETIMEOFFSET()), 1);

-- ---------------------------------------------------------------------------
-- HubSpot Run 2 (66666666-...-02): incremental sync, 12 records
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationRunDetail
  (ID, CompanyIntegrationRunID, EntityID, RecordID, Action, ExecutedAt, IsSuccess)
VALUES
  ('77777777-7777-7777-7777-777777700201', '66666666-6666-6666-6666-666666666602',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'hs-contact-new-1', 'Create              ', DATEADD(MINUTE, -118, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700202', '66666666-6666-6666-6666-666666666602',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'hs-contact-new-2', 'Create              ', DATEADD(MINUTE, -117, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700203', '66666666-6666-6666-6666-666666666602',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'hs-contact-upd-1', 'Update              ', DATEADD(MINUTE, -116, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700204', '66666666-6666-6666-6666-666666666602',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'hs-contact-upd-2', 'Update              ', DATEADD(MINUTE, -115, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700205', '66666666-6666-6666-6666-666666666602',
   'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'hs-company-upd-1', 'Update              ', DATEADD(MINUTE, -114, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700206', '66666666-6666-6666-6666-666666666602',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'hs-contact-del-1', 'Delete              ', DATEADD(MINUTE, -113, SYSDATETIMEOFFSET()), 1);

-- ---------------------------------------------------------------------------
-- Salesforce Run (66666666-...-03): incremental, 35 records
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationRunDetail
  (ID, CompanyIntegrationRunID, EntityID, RecordID, Action, ExecutedAt, IsSuccess)
VALUES
  ('77777777-7777-7777-7777-777777700301', '66666666-6666-6666-6666-666666666603',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'sf-contact-batch-1', 'Create              ', DATEADD(MINUTE, -178, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700302', '66666666-6666-6666-6666-666666666603',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'sf-contact-upd-1', 'Update              ', DATEADD(MINUTE, -176, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700303', '66666666-6666-6666-6666-666666666603',
   'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'sf-account-batch-1', 'Create              ', DATEADD(MINUTE, -174, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700304', '66666666-6666-6666-6666-666666666603',
   'E58E0F00-1090-43A3-95F4-3D1B4BE4CE46', 'sf-opp-batch-1', 'Create              ', DATEADD(MINUTE, -172, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700305', '66666666-6666-6666-6666-666666666603',
   'E58E0F00-1090-43A3-95F4-3D1B4BE4CE46', 'sf-opp-upd-1', 'Update              ', DATEADD(MINUTE, -171, SYSDATETIMEOFFSET()), 0);

-- ---------------------------------------------------------------------------
-- YourMembership Run (66666666-...-04): FAILED after 23 records
-- ---------------------------------------------------------------------------
INSERT INTO __mj.CompanyIntegrationRunDetail
  (ID, CompanyIntegrationRunID, EntityID, RecordID, Action, ExecutedAt, IsSuccess)
VALUES
  ('77777777-7777-7777-7777-777777700401', '66666666-6666-6666-6666-666666666604',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'ym-member-batch-1', 'Create              ', DATEADD(MINUTE, -58, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700402', '66666666-6666-6666-6666-666666666604',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'ym-member-upd-1', 'Update              ', DATEADD(MINUTE, -56, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700403', '66666666-6666-6666-6666-666666666604',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'ym-member-upd-2', 'Update              ', DATEADD(MINUTE, -54, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700404', '66666666-6666-6666-6666-666666666604',
   '9E2B4760-B781-4CDD-ACE0-A4E1E7AF18C3', 'ym-event-batch-1', 'Create              ', DATEADD(MINUTE, -52, SYSDATETIMEOFFSET()), 1),
  ('77777777-7777-7777-7777-777777700405', '66666666-6666-6666-6666-666666666604',
   'B3838F19-FF8D-4AC7-8D29-B7F5C5C12A97', 'ym-member-fail-1', 'Create              ', DATEADD(MINUTE, -50, SYSDATETIMEOFFSET()), 0);
GO

-- =============================================================================
-- VERIFY COUNTS
-- =============================================================================
SELECT 'Entity Maps' AS [Table], COUNT(*) AS [Count] FROM __mj.CompanyIntegrationEntityMap
  WHERE CompanyIntegrationID IN ('33333333-3333-3333-3333-333333333301','33333333-3333-3333-3333-333333333302','33333333-3333-3333-3333-333333333303')
UNION ALL
SELECT 'Field Maps', COUNT(*) FROM __mj.CompanyIntegrationFieldMap
  WHERE EntityMapID IN (SELECT ID FROM __mj.CompanyIntegrationEntityMap WHERE CompanyIntegrationID IN ('33333333-3333-3333-3333-333333333301','33333333-3333-3333-3333-333333333302','33333333-3333-3333-3333-333333333303'))
UNION ALL
SELECT 'Runs', COUNT(*) FROM __mj.CompanyIntegrationRun
  WHERE CompanyIntegrationID IN ('33333333-3333-3333-3333-333333333301','33333333-3333-3333-3333-333333333302','33333333-3333-3333-3333-333333333303')
UNION ALL
SELECT 'Run Details', COUNT(*) FROM __mj.CompanyIntegrationRunDetail
  WHERE CompanyIntegrationRunID IN (SELECT ID FROM __mj.CompanyIntegrationRun WHERE CompanyIntegrationID IN ('33333333-3333-3333-3333-333333333301','33333333-3333-3333-3333-333333333302','33333333-3333-3333-3333-333333333303'));
GO
