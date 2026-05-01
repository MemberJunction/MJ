-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE __mj."Entity" SET "AllowAllRowsAPI" = TRUE WHERE "Name" LIKE 'MJ: Archive%';

-- 1. Record Changes - 12 Month

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ArchiveConfiguration" WHERE "ID" = 'C510C95C-8477-468C-A2E1-CA90B40743D3'
    ) THEN
        INSERT INTO __mj."ArchiveConfiguration"
        ("ID", "Name", "Description", "RootPath", "ArchiveFormat", "IsActive", "DefaultRetentionDays", "DefaultMode", "DefaultBatchSize", "ArchiveRelatedRecordChanges", "Status", "CreatedByUserID")
        VALUES
        ('C510C95C-8477-468C-A2E1-CA90B40743D3',
        'Record Changes - 12 Month',
        'Archives Record Changes data older than 12 months. Strips ChangesJSON, FullRecordJSON, and ChangesDescription fields to reclaim storage while preserving row skeletons.',
        '/archives', 'JSON', FALSE, 365, 'StripFields', 100, FALSE, 'Disabled',
        'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');
        
        INSERT INTO __mj."ArchiveConfigurationEntity"
        ("ID", "ArchiveConfigurationID", "EntityID", "Mode", "RetentionDays", "DateField", "BatchSize", "Priority", "FieldConfiguration", "ArchiveRelatedRecordChanges", "IsActive")
        VALUES
        ('3A4ABE71-09AE-4F29-838A-675FCA5110DC',
        'C510C95C-8477-468C-A2E1-CA90B40743D3',
        'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- "MJ": "Record" "Changes"
        'StripFields', 365, 'ChangedAt', 100, 1,
        '{"Fields":[{"FieldName":"ChangesJSON","IsActive":true},{"FieldName":"FullRecordJSON","IsActive":true},{"FieldName":"ChangesDescription","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["ChangesJSON","FullRecordJSON","ChangesDescription"]}',
        FALSE, TRUE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ArchiveConfiguration" WHERE "ID" = 'E62D1C73-4194-4370-98DF-20227CF39478'
    ) THEN
        INSERT INTO __mj."ArchiveConfiguration"
        ("ID", "Name", "Description", "RootPath", "ArchiveFormat", "IsActive", "DefaultRetentionDays", "DefaultMode", "DefaultBatchSize", "ArchiveRelatedRecordChanges", "Status", "CreatedByUserID")
        VALUES
        ('E62D1C73-4194-4370-98DF-20227CF39478',
        'AI Prompt Runs - 6 Month',
        'Archives AI Prompt Runs data older than 6 months. Strips Messages, Result, ErrorMessage, and ValidationAttempts fields.',
        '/archives', 'JSON', FALSE, 180, 'StripFields', 100, TRUE, 'Disabled',
        'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');
        
        INSERT INTO __mj."ArchiveConfigurationEntity"
        ("ID", "ArchiveConfigurationID", "EntityID", "Mode", "RetentionDays", "DateField", "BatchSize", "Priority", "FieldConfiguration", "ArchiveRelatedRecordChanges", "IsActive")
        VALUES
        ('D4985B43-47C0-4BD3-9DFC-14FCEE6EE6A1',
        'E62D1C73-4194-4370-98DF-20227CF39478',
        '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- "MJ": "AI" "Prompt" "Runs"
        'StripFields', 180, '__mj_CreatedAt', 100, 1,
        '{"Fields":[{"FieldName":"Messages","IsActive":true},{"FieldName":"Result","IsActive":true},{"FieldName":"ErrorMessage","IsActive":true},{"FieldName":"ValidationAttempts","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["Messages","Result"]}',
        TRUE, TRUE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ArchiveConfiguration" WHERE "ID" = '1826C646-0293-4724-AB1E-84EF683C00A5'
    ) THEN
        INSERT INTO __mj."ArchiveConfiguration"
        ("ID", "Name", "Description", "RootPath", "ArchiveFormat", "IsActive", "DefaultRetentionDays", "DefaultMode", "DefaultBatchSize", "ArchiveRelatedRecordChanges", "Status", "CreatedByUserID")
        VALUES
        ('1826C646-0293-4724-AB1E-84EF683C00A5',
        'AI Agent Run Steps - 6 Month',
        'Archives AI Agent Run Steps data older than 6 months. Strips InputData, OutputData, PayloadAtStart, PayloadAtEnd, ErrorMessage, and Comments fields.',
        '/archives', 'JSON', FALSE, 180, 'StripFields', 100, TRUE, 'Disabled',
        'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');
        
        INSERT INTO __mj."ArchiveConfigurationEntity"
        ("ID", "ArchiveConfigurationID", "EntityID", "Mode", "RetentionDays", "DateField", "BatchSize", "Priority", "FieldConfiguration", "ArchiveRelatedRecordChanges", "IsActive")
        VALUES
        ('E6B49021-E88E-49AF-A538-079C5BC04189',
        '1826C646-0293-4724-AB1E-84EF683C00A5',
        '99273DAD-560E-4ABC-8332-C97AB58B7463', -- "MJ": "AI" "Agent" "Run" "Steps"
        'StripFields', 180, '__mj_CreatedAt', 100, 1,
        '{"Fields":[{"FieldName":"InputData","IsActive":true},{"FieldName":"OutputData","IsActive":true},{"FieldName":"PayloadAtStart","IsActive":true},{"FieldName":"PayloadAtEnd","IsActive":true},{"FieldName":"ErrorMessage","IsActive":true},{"FieldName":"Comments","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["InputData","OutputData"]}',
        TRUE, TRUE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ArchiveConfiguration" WHERE "ID" = '48AC178D-4C4B-4C3E-9F07-FB6774B3D624'
    ) THEN
        INSERT INTO __mj."ArchiveConfiguration"
        ("ID", "Name", "Description", "RootPath", "ArchiveFormat", "IsActive", "DefaultRetentionDays", "DefaultMode", "DefaultBatchSize", "ArchiveRelatedRecordChanges", "Status", "CreatedByUserID")
        VALUES
        ('48AC178D-4C4B-4C3E-9F07-FB6774B3D624',
        'AI Agent Runs - 6 Month',
        'Archives AI Agent Runs data older than 6 months. Strips Result, FinalPayload, StartingPayload, Data, Message, ErrorMessage, and AgentState fields.',
        '/archives', 'JSON', FALSE, 180, 'StripFields', 100, TRUE, 'Disabled',
        'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');
        
        INSERT INTO __mj."ArchiveConfigurationEntity"
        ("ID", "ArchiveConfigurationID", "EntityID", "Mode", "RetentionDays", "DateField", "BatchSize", "Priority", "FieldConfiguration", "ArchiveRelatedRecordChanges", "IsActive")
        VALUES
        ('25C71331-AAFD-4CE8-B076-5B0A540391E4',
        '48AC178D-4C4B-4C3E-9F07-FB6774B3D624',
        '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- "MJ": "AI" "Agent" "Runs"
        'StripFields', 180, '__mj_CreatedAt', 100, 2,
        '{"Fields":[{"FieldName":"Result","IsActive":true},{"FieldName":"FinalPayload","IsActive":true},{"FieldName":"StartingPayload","IsActive":true},{"FieldName":"Data","IsActive":true},{"FieldName":"Message","IsActive":true},{"FieldName":"ErrorMessage","IsActive":true},{"FieldName":"AgentState","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["Result","FinalPayload"]}',
        TRUE, TRUE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ArchiveConfiguration" WHERE "ID" = '769134EB-D384-48CE-915F-5836E9009A6C'
    ) THEN
        INSERT INTO __mj."ArchiveConfiguration"
        ("ID", "Name", "Description", "RootPath", "ArchiveFormat", "IsActive", "DefaultRetentionDays", "DefaultMode", "DefaultBatchSize", "ArchiveRelatedRecordChanges", "Status", "CreatedByUserID")
        VALUES
        ('769134EB-D384-48CE-915F-5836E9009A6C',
        'Audit Logs - 18 Month',
        'Archives Audit Logs data older than 18 months. Strips Details and Description fields.',
        '/archives', 'JSON', FALSE, 540, 'StripFields', 100, FALSE, 'Disabled',
        'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');
        
        INSERT INTO __mj."ArchiveConfigurationEntity"
        ("ID", "ArchiveConfigurationID", "EntityID", "Mode", "RetentionDays", "DateField", "BatchSize", "Priority", "FieldConfiguration", "ArchiveRelatedRecordChanges", "IsActive")
        VALUES
        ('C1BD8AF1-9B26-49F0-A943-818CBF0BC5AC',
        '769134EB-D384-48CE-915F-5836E9009A6C',
        'F8238F34-2837-EF11-86D4-6045BDEE16E6', -- "MJ": "Audit" "Logs"
        'StripFields', 540, '__mj_CreatedAt', 100, 1,
        '{"Fields":[{"FieldName":"Details","IsActive":true},{"FieldName":"Description","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["Details","Description"]}',
        FALSE, TRUE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ArchiveConfiguration" WHERE "ID" = '12D1DBB2-B2DE-4F8B-985A-839E0D21FE62'
    ) THEN
        INSERT INTO __mj."ArchiveConfiguration"
        ("ID", "Name", "Description", "RootPath", "ArchiveFormat", "IsActive", "DefaultRetentionDays", "DefaultMode", "DefaultBatchSize", "ArchiveRelatedRecordChanges", "Status", "CreatedByUserID")
        VALUES
        ('12D1DBB2-B2DE-4F8B-985A-839E0D21FE62',
        'Action Execution Logs - 12 Month',
        'Archives Action Execution Logs data older than 12 months. Archives the full record to external storage then deletes the source row.',
        '/archives', 'JSON', FALSE, 365, 'HardDelete', 100, FALSE, 'Disabled',
        'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');
        
        INSERT INTO __mj."ArchiveConfigurationEntity"
        ("ID", "ArchiveConfigurationID", "EntityID", "Mode", "RetentionDays", "DateField", "BatchSize", "Priority", "FieldConfiguration", "ArchiveRelatedRecordChanges", "IsActive")
        VALUES
        ('9AE11DDD-3F6F-4737-8A3D-15D31817F6A9',
        '12D1DBB2-B2DE-4F8B-985A-839E0D21FE62',
        '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- "MJ": "Action" "Execution" "Logs"
        'HardDelete', 365, '__mj_CreatedAt', 100, 1,
        '{"Fields":[],"ArchiveFullRecord":true}',
        FALSE, TRUE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ArchiveConfiguration" WHERE "ID" = '4FFE84AA-617B-4E88-AB81-C0EB412E9426'
    ) THEN
        INSERT INTO __mj."ArchiveConfiguration"
        ("ID", "Name", "Description", "RootPath", "ArchiveFormat", "IsActive", "DefaultRetentionDays", "DefaultMode", "DefaultBatchSize", "ArchiveRelatedRecordChanges", "Status", "CreatedByUserID")
        VALUES
        ('4FFE84AA-617B-4E88-AB81-C0EB412E9426',
        'Scheduled Job Runs - 12 Month',
        'Archives Scheduled Job Runs data older than 12 months. Archives the full record to external storage then deletes the source row.',
        '/archives', 'JSON', FALSE, 365, 'HardDelete', 100, FALSE, 'Disabled',
        'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');
        
        INSERT INTO __mj."ArchiveConfigurationEntity"
        ("ID", "ArchiveConfigurationID", "EntityID", "Mode", "RetentionDays", "DateField", "BatchSize", "Priority", "FieldConfiguration", "ArchiveRelatedRecordChanges", "IsActive")
        VALUES
        ('3DD38EA5-A698-4104-9E9B-C22258C9DCF4',
        '4FFE84AA-617B-4E88-AB81-C0EB412E9426',
        '05853432-5E13-4F2A-8618-77857ADF17FA', -- "MJ": "Scheduled" "Job" "Runs"
        'HardDelete', 365, '__mj_CreatedAt', 100, 1,
        '{"Fields":[],"ArchiveFullRecord":true}',
        FALSE, TRUE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ArchiveConfiguration" WHERE "ID" = '8C3AD877-0BAE-4CC6-970D-9249BAABCE53'
    ) THEN
        INSERT INTO __mj."ArchiveConfiguration"
        ("ID", "Name", "Description", "RootPath", "ArchiveFormat", "IsActive", "DefaultRetentionDays", "DefaultMode", "DefaultBatchSize", "ArchiveRelatedRecordChanges", "Status", "CreatedByUserID")
        VALUES
        ('8C3AD877-0BAE-4CC6-970D-9249BAABCE53',
        'Communication Logs - 12 Month',
        'Archives Communication Logs data older than 12 months. Archives the full record to external storage then deletes the source row.',
        '/archives', 'JSON', FALSE, 365, 'HardDelete', 100, FALSE, 'Disabled',
        'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');
        
        INSERT INTO __mj."ArchiveConfigurationEntity"
        ("ID", "ArchiveConfigurationID", "EntityID", "Mode", "RetentionDays", "DateField", "BatchSize", "Priority", "FieldConfiguration", "ArchiveRelatedRecordChanges", "IsActive")
        VALUES
        ('6CF03B58-511D-4751-983D-B5AFF04538E2',
        '8C3AD877-0BAE-4CC6-970D-9249BAABCE53',
        '46248F34-2837-EF11-86D4-6045BDEE16E6', -- "MJ": "Communication" "Logs"
        'HardDelete', 365, '__mj_CreatedAt', 100, 1,
        '{"Fields":[],"ArchiveFullRecord":true}',
        FALSE, TRUE);
    END IF;
END $$;


-- ===================== Other =====================

-- Migration: Seed default Archive Configuration records
-- Description: Creates 8 default archive configurations (all shipped inactive/disabled)
--              for common high-growth MJ entities. Customers opt-in by activating and
--              configuring a storage account.
--
-- System user (ECAFCCEC-6A37-EF11-86D4-000D3A4E707E) is used as CreatedByUserID.
-- StorageAccountID is left NULL — must be configured before activation.

-- Enable AllowAllRowsAPI for all archive entities (admin configuration entities)
