-- Migration: Seed default Archive Configuration records
-- Description: Creates 8 default archive configurations (all shipped inactive/disabled)
--              for common high-growth MJ entities. Customers opt-in by activating and
--              configuring a storage account.
--
-- System user (ECAFCCEC-6A37-EF11-86D4-000D3A4E707E) is used as CreatedByUserID.
-- StorageAccountID is left NULL — must be configured before activation.

-- 1. Record Changes - 12 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'A1B1C1D1-0001-4000-A001-000000000001')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('A1B1C1D1-0001-4000-A001-000000000001',
         N'Record Changes - 12 Month',
         N'Archives Record Changes data older than 12 months. Strips ChangesJSON, FullRecordJSON, and ChangesDescription fields to reclaim storage while preserving row skeletons.',
         N'/archives', N'JSON', 0, 365, N'StripFields', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('B1B1C1D1-0001-4000-A001-000000000001',
         'A1B1C1D1-0001-4000-A001-000000000001',
         'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- MJ: Record Changes
         N'StripFields', 365, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[{"FieldName":"ChangesJSON","IsActive":true},{"FieldName":"FullRecordJSON","IsActive":true},{"FieldName":"ChangesDescription","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["ChangesJSON","FullRecordJSON","ChangesDescription"]}',
         0, 1);
END

-- 2. AI Prompt Runs - 6 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'A1B1C1D1-0002-4000-A002-000000000002')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('A1B1C1D1-0002-4000-A002-000000000002',
         N'AI Prompt Runs - 6 Month',
         N'Archives AI Prompt Runs data older than 6 months. Strips Messages, Result, ErrorMessage, and ValidationAttempts fields.',
         N'/archives', N'JSON', 0, 180, N'StripFields', 100, 1, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('B1B1C1D1-0002-4000-A002-000000000002',
         'A1B1C1D1-0002-4000-A002-000000000002',
         '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- MJ: AI Prompt Runs
         N'StripFields', 180, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[{"FieldName":"Messages","IsActive":true},{"FieldName":"Result","IsActive":true},{"FieldName":"ErrorMessage","IsActive":true},{"FieldName":"ValidationAttempts","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["Messages","Result"]}',
         1, 1);
END

-- 3. AI Agent Run Steps - 6 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'A1B1C1D1-0003-4000-A003-000000000003')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('A1B1C1D1-0003-4000-A003-000000000003',
         N'AI Agent Run Steps - 6 Month',
         N'Archives AI Agent Run Steps data older than 6 months. Strips InputData, OutputData, PayloadAtStart, PayloadAtEnd, ErrorMessage, and Comments fields.',
         N'/archives', N'JSON', 0, 180, N'StripFields', 100, 1, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('B1B1C1D1-0003-4000-A003-000000000003',
         'A1B1C1D1-0003-4000-A003-000000000003',
         '99273DAD-560E-4ABC-8332-C97AB58B7463', -- MJ: AI Agent Run Steps
         N'StripFields', 180, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[{"FieldName":"InputData","IsActive":true},{"FieldName":"OutputData","IsActive":true},{"FieldName":"PayloadAtStart","IsActive":true},{"FieldName":"PayloadAtEnd","IsActive":true},{"FieldName":"ErrorMessage","IsActive":true},{"FieldName":"Comments","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["InputData","OutputData"]}',
         1, 1);
END

-- 4. AI Agent Runs - 6 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'A1B1C1D1-0004-4000-A004-000000000004')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('A1B1C1D1-0004-4000-A004-000000000004',
         N'AI Agent Runs - 6 Month',
         N'Archives AI Agent Runs data older than 6 months. Strips Result, FinalPayload, StartingPayload, Data, Message, ErrorMessage, and AgentState fields.',
         N'/archives', N'JSON', 0, 180, N'StripFields', 100, 1, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('B1B1C1D1-0004-4000-A004-000000000004',
         'A1B1C1D1-0004-4000-A004-000000000004',
         '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- MJ: AI Agent Runs
         N'StripFields', 180, N'__mj_CreatedAt', 100, 2,
         N'{"Fields":[{"FieldName":"Result","IsActive":true},{"FieldName":"FinalPayload","IsActive":true},{"FieldName":"StartingPayload","IsActive":true},{"FieldName":"Data","IsActive":true},{"FieldName":"Message","IsActive":true},{"FieldName":"ErrorMessage","IsActive":true},{"FieldName":"AgentState","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["Result","FinalPayload"]}',
         1, 1);
END

-- 5. Audit Logs - 18 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'A1B1C1D1-0005-4000-A005-000000000005')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('A1B1C1D1-0005-4000-A005-000000000005',
         N'Audit Logs - 18 Month',
         N'Archives Audit Logs data older than 18 months. Strips Details and Description fields.',
         N'/archives', N'JSON', 0, 540, N'StripFields', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('B1B1C1D1-0005-4000-A005-000000000005',
         'A1B1C1D1-0005-4000-A005-000000000005',
         'F8238F34-2837-EF11-86D4-6045BDEE16E6', -- MJ: Audit Logs
         N'StripFields', 540, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[{"FieldName":"Details","IsActive":true},{"FieldName":"Description","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["Details","Description"]}',
         0, 1);
END

-- 6. Action Execution Logs - 12 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'A1B1C1D1-0006-4000-A006-000000000006')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('A1B1C1D1-0006-4000-A006-000000000006',
         N'Action Execution Logs - 12 Month',
         N'Archives Action Execution Logs data older than 12 months. Archives the full record to external storage.',
         N'/archives', N'JSON', 0, 365, N'StripFields', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('B1B1C1D1-0006-4000-A006-000000000006',
         'A1B1C1D1-0006-4000-A006-000000000006',
         '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- MJ: Action Execution Logs
         N'StripFields', 365, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[],"ArchiveFullRecord":true}',
         0, 1);
END

-- 7. Scheduled Job Runs - 12 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'A1B1C1D1-0007-4000-A007-000000000007')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('A1B1C1D1-0007-4000-A007-000000000007',
         N'Scheduled Job Runs - 12 Month',
         N'Archives Scheduled Job Runs data older than 12 months. Archives the full record to external storage.',
         N'/archives', N'JSON', 0, 365, N'StripFields', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('B1B1C1D1-0007-4000-A007-000000000007',
         'A1B1C1D1-0007-4000-A007-000000000007',
         '05853432-5E13-4F2A-8618-77857ADF17FA', -- MJ: Scheduled Job Runs
         N'StripFields', 365, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[],"ArchiveFullRecord":true}',
         0, 1);
END

-- 8. Communication Logs - 12 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'A1B1C1D1-0008-4000-A008-000000000008')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('A1B1C1D1-0008-4000-A008-000000000008',
         N'Communication Logs - 12 Month',
         N'Archives Communication Logs data older than 12 months. Archives the full record to external storage.',
         N'/archives', N'JSON', 0, 365, N'StripFields', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('B1B1C1D1-0008-4000-A008-000000000008',
         'A1B1C1D1-0008-4000-A008-000000000008',
         '46248F34-2837-EF11-86D4-6045BDEE16E6', -- MJ: Communication Logs
         N'StripFields', 365, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[],"ArchiveFullRecord":true}',
         0, 1);
END
