-- MJ-Sync Pull/Push Qualification Test - Seed Data
-- This script seeds test data for validating mj-sync pull/push functionality
-- Run this AFTER the migration and CodeGen have been executed
-- NOTE: Do NOT insert __mj_CreatedAt or __mj_UpdatedAt - MemberJunction handles these automatically

-- ============================================================================
-- Producers (3 records)
-- ============================================================================
INSERT INTO [${flyway:defaultSchema}].[Producer] (ID, Name, Description)
VALUES
    ('F858D90F-9EAB-4613-8525-E799AAE17DF1', 'Acme Corp', 'Leading producer of quality widgets'),
    ('E8FE3F20-7CC3-4C0E-990E-B1FE646E4A9B', 'Global Inc', 'International manufacturing company'),
    ('D786FB06-2AF2-4A73-ABBC-1D43E6B66553', 'Tech Solutions', 'Innovative technology provider');

-- ============================================================================
-- Consumers (3 records)
-- ============================================================================
INSERT INTO [${flyway:defaultSchema}].[Consumer] (ID, Name, Description)
VALUES
    ('CB6B5BD9-B47A-4B4C-A4CF-CB1FC712EFF9', 'Retail Store', 'Main street retail outlet'),
    ('B2912AC0-CCFE-406F-B1C5-E9463BB116D0', 'Online Shop', 'E-commerce platform'),
    ('4B23CA12-1FCE-4600-8E3E-8D98FC08F5D0', 'Wholesale Buyer', 'Bulk purchasing distributor');

-- ============================================================================
-- ProducerConsumer Relationships (5 records)
-- ============================================================================
INSERT INTO [${flyway:defaultSchema}].[ProducerConsumer] (ID, ProducerID, ConsumerID, Notes)
VALUES
    -- Acme Corp supplies Retail Store and Online Shop
    ('87F57CC3-5EFC-41EC-99A6-52A9400012AF', 'F858D90F-9EAB-4613-8525-E799AAE17DF1', 'CB6B5BD9-B47A-4B4C-A4CF-CB1FC712EFF9', 'Primary widget supplier'),
    ('0DA8E772-E48E-40B8-BF74-663991BDBF33', 'F858D90F-9EAB-4613-8525-E799AAE17DF1', 'B2912AC0-CCFE-406F-B1C5-E9463BB116D0', 'Secondary online channel'),

    -- Global Inc supplies Wholesale Buyer
    ('613D4EF3-F9F1-4AC6-8E62-70FEA811036F', 'E8FE3F20-7CC3-4C0E-990E-B1FE646E4A9B', '4B23CA12-1FCE-4600-8E3E-8D98FC08F5D0', 'Bulk orders quarterly'),

    -- Tech Solutions supplies Online Shop and Wholesale Buyer
    ('1601FC36-D1D2-4A7A-990B-6D7D82D6C8FF', 'D786FB06-2AF2-4A73-ABBC-1D43E6B66553', 'B2912AC0-CCFE-406F-B1C5-E9463BB116D0', 'Technology products'),
    ('AAD4FEF5-D3DB-41A1-A9B2-B3F9D106C43B', 'D786FB06-2AF2-4A73-ABBC-1D43E6B66553', '4B23CA12-1FCE-4600-8E3E-8D98FC08F5D0', 'Enterprise solutions');

-- ============================================================================
-- Verification Queries
-- ============================================================================
PRINT 'Seed data inserted. Running verification...';

SELECT 'Producer' AS Entity, COUNT(*) AS RecordCount FROM [${flyway:defaultSchema}].[Producer]
UNION ALL
SELECT 'Consumer', COUNT(*) FROM [${flyway:defaultSchema}].[Consumer]
UNION ALL
SELECT 'ProducerConsumer', COUNT(*) FROM [${flyway:defaultSchema}].[ProducerConsumer];

-- Verify relationships
SELECT
    pc.ID AS RelationshipID,
    p.Name AS ProducerName,
    c.Name AS ConsumerName,
    pc.Notes
FROM [${flyway:defaultSchema}].[ProducerConsumer] pc
JOIN [${flyway:defaultSchema}].[Producer] p ON pc.ProducerID = p.ID
JOIN [${flyway:defaultSchema}].[Consumer] c ON pc.ConsumerID = c.ID
ORDER BY p.Name, c.Name;
