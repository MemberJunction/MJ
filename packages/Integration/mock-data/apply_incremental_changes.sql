-- =============================================================================
-- apply_incremental_changes.sql
-- =============================================================================
-- Standalone script that applies incremental changes to the mock_data database.
-- Run AFTER the initial data load (create_mock_data.sql) to simulate changes
-- that arrive between sync cycles. This is used to test watermark-based
-- incremental sync, including new records, field updates, and soft deletes.
--
-- Usage:
--   sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -i apply_incremental_changes.sql
-- =============================================================================

USE mock_data;
GO

-- =============================================================================
-- Schema alterations: add soft-delete columns that the initial schema omitted
-- =============================================================================

-- HubSpot contacts: add is_deleted flag
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'hs' AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'is_deleted'
)
BEGIN
    ALTER TABLE hs.contacts ADD is_deleted BIT NOT NULL DEFAULT 0;
END
GO

-- Salesforce Contact: add IsDeleted flag
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'sf' AND TABLE_NAME = 'Contact' AND COLUMN_NAME = 'IsDeleted'
)
BEGIN
    ALTER TABLE sf.Contact ADD IsDeleted BIT NOT NULL DEFAULT 0;
END
GO

-- Salesforce Account: add IsDeleted flag
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'sf' AND TABLE_NAME = 'Account' AND COLUMN_NAME = 'IsDeleted'
)
BEGIN
    ALTER TABLE sf.Account ADD IsDeleted BIT NOT NULL DEFAULT 0;
END
GO

-- Salesforce Opportunity: add IsDeleted flag
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'sf' AND TABLE_NAME = 'Opportunity' AND COLUMN_NAME = 'IsDeleted'
)
BEGIN
    ALTER TABLE sf.Opportunity ADD IsDeleted BIT NOT NULL DEFAULT 0;
END
GO

-- =============================================================================
-- NEW RECORDS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HubSpot: ADD 5 new contacts
-- ---------------------------------------------------------------------------
INSERT INTO hs.contacts (email, firstname, lastname, phone, company, jobtitle, lifecyclestage, lastmodifieddate) VALUES
('delta.new1@example.com', 'Delta', 'NewOne', '555-9901', 'DeltaCorp', 'Engineer', 'customer', SYSDATETIMEOFFSET()),
('delta.new2@example.com', 'Delta', 'NewTwo', '555-9902', 'DeltaCorp', 'Manager', 'lead', SYSDATETIMEOFFSET()),
('delta.new3@example.com', 'Delta', 'NewThree', '555-9903', 'DeltaCorp', 'Director', 'customer', SYSDATETIMEOFFSET()),
('delta.new4@example.com', 'Delta', 'NewFour', '555-9904', 'DeltaCorp', 'VP', 'lead', SYSDATETIMEOFFSET()),
('delta.new5@example.com', 'Delta', 'NewFive', '555-9905', 'DeltaCorp', 'CEO', 'customer', SYSDATETIMEOFFSET());
GO

-- ---------------------------------------------------------------------------
-- Salesforce: ADD 3 new contacts (sf-style Id values, referencing existing Accounts)
-- ---------------------------------------------------------------------------
INSERT INTO sf.Contact (Id, FirstName, LastName, Email, Phone, Title, AccountId, LeadSource, LastModifiedDate) VALUES
('003000000000051AA', 'Delta', 'SfOne', 'delta.sf1@example.com', '555-8801', 'Engineer', '001000000000001AA', 'Web', SYSDATETIMEOFFSET()),
('003000000000052AA', 'Delta', 'SfTwo', 'delta.sf2@example.com', '555-8802', 'Manager', '001000000000001AA', 'Partner', SYSDATETIMEOFFSET()),
('003000000000053AA', 'Delta', 'SfThree', 'delta.sf3@example.com', '555-8803', 'Director', '001000000000002AA', 'Referral', SYSDATETIMEOFFSET());
GO

-- ---------------------------------------------------------------------------
-- YourMembership: ADD 4 new members
-- ---------------------------------------------------------------------------
INSERT INTO ym.members (member_number, first_name, last_name, email, phone, membership_type_id, join_date, expiration_date, status) VALUES
('MEM-DELTA-001', 'Delta', 'YmOne', 'delta.ym1@example.com', '555-7701', 1, '2026-03-01', '2029-03-01', 'Active'),
('MEM-DELTA-002', 'Delta', 'YmTwo', 'delta.ym2@example.com', '555-7702', 2, '2026-03-01', '2029-03-01', 'Active'),
('MEM-DELTA-003', 'Delta', 'YmThree', 'delta.ym3@example.com', '555-7703', 1, '2026-03-01', '2029-03-01', 'Active'),
('MEM-DELTA-004', 'Delta', 'YmFour', 'delta.ym4@example.com', '555-7704', 3, '2026-03-01', '2027-03-01', 'Pending');
GO

-- =============================================================================
-- UPDATES (simulate field modifications detected by watermark sync)
-- =============================================================================

-- HubSpot: update company name for John Smith (vid=1)
UPDATE hs.contacts SET company = 'Updated Corp', lastmodifieddate = SYSDATETIMEOFFSET() WHERE email = 'john.smith@acme.com';
GO

-- Salesforce: promote Alex Rivera (Id 003000000000001AA)
UPDATE sf.Contact SET Title = 'Senior VP', LastModifiedDate = SYSDATETIMEOFFSET() WHERE Email = 'alex.rivera@techvista.com';
GO

-- YourMembership: expire Alice Monroe (member_id=1)
UPDATE ym.members SET status = 'Expired', updated_at = SYSDATETIMEOFFSET() WHERE email = 'alice.monroe@email.com';
GO

-- =============================================================================
-- SOFT DELETES
-- =============================================================================

-- HubSpot: soft-delete Sarah Johnson (vid=2)
UPDATE hs.contacts SET is_deleted = 1, lastmodifieddate = SYSDATETIMEOFFSET() WHERE email = 'sarah.johnson@acme.com';
GO

-- Salesforce: soft-delete Maria Santos (Id 003000000000002AA)
UPDATE sf.Contact SET IsDeleted = 1, LastModifiedDate = SYSDATETIMEOFFSET() WHERE Email = 'maria.santos@techvista.com';
GO

-- YourMembership: mark Bob Harrison as Deleted (member_id=2)
UPDATE ym.members SET status = 'Deleted', updated_at = SYSDATETIMEOFFSET() WHERE email = 'bob.harrison@email.com';
GO
