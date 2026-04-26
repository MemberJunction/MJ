-- Migration: Seed default Archive Configuration records
-- Description: Creates 8 default archive configurations (all shipped inactive/disabled)
--              for common high-growth MJ entities. Customers opt-in by activating and
--              configuring a storage account.
--
-- System user (ECAFCCEC-6A37-EF11-86D4-000D3A4E707E) is used as CreatedByUserID.
-- StorageAccountID is left NULL — must be configured before activation.

-- Enable AllowAllRowsAPI for all archive entities (admin configuration entities)
UPDATE [${flyway:defaultSchema}].[Entity] SET [AllowAllRowsAPI] = 1 WHERE [Name] LIKE 'MJ: Archive%';

-- 1. Record Changes - 12 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'C510C95C-8477-468C-A2E1-CA90B40743D3')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('C510C95C-8477-468C-A2E1-CA90B40743D3',
         N'Record Changes - 12 Month',
         N'Archives Record Changes data older than 12 months. Strips ChangesJSON, FullRecordJSON, and ChangesDescription fields to reclaim storage while preserving row skeletons.',
         N'/archives', N'JSON', 0, 365, N'StripFields', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('3A4ABE71-09AE-4F29-838A-675FCA5110DC',
         'C510C95C-8477-468C-A2E1-CA90B40743D3',
         'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- MJ: Record Changes
         N'StripFields', 365, N'ChangedAt', 100, 1,
         N'{"Fields":[{"FieldName":"ChangesJSON","IsActive":true},{"FieldName":"FullRecordJSON","IsActive":true},{"FieldName":"ChangesDescription","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["ChangesJSON","FullRecordJSON","ChangesDescription"]}',
         0, 1);
END

-- 2. AI Prompt Runs - 6 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = 'E62D1C73-4194-4370-98DF-20227CF39478')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('E62D1C73-4194-4370-98DF-20227CF39478',
         N'AI Prompt Runs - 6 Month',
         N'Archives AI Prompt Runs data older than 6 months. Strips Messages, Result, ErrorMessage, and ValidationAttempts fields.',
         N'/archives', N'JSON', 0, 180, N'StripFields', 100, 1, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('D4985B43-47C0-4BD3-9DFC-14FCEE6EE6A1',
         'E62D1C73-4194-4370-98DF-20227CF39478',
         '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- MJ: AI Prompt Runs
         N'StripFields', 180, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[{"FieldName":"Messages","IsActive":true},{"FieldName":"Result","IsActive":true},{"FieldName":"ErrorMessage","IsActive":true},{"FieldName":"ValidationAttempts","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["Messages","Result"]}',
         1, 1);
END

-- 3. AI Agent Run Steps - 6 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = '1826C646-0293-4724-AB1E-84EF683C00A5')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('1826C646-0293-4724-AB1E-84EF683C00A5',
         N'AI Agent Run Steps - 6 Month',
         N'Archives AI Agent Run Steps data older than 6 months. Strips InputData, OutputData, PayloadAtStart, PayloadAtEnd, ErrorMessage, and Comments fields.',
         N'/archives', N'JSON', 0, 180, N'StripFields', 100, 1, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('E6B49021-E88E-49AF-A538-079C5BC04189',
         '1826C646-0293-4724-AB1E-84EF683C00A5',
         '99273DAD-560E-4ABC-8332-C97AB58B7463', -- MJ: AI Agent Run Steps
         N'StripFields', 180, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[{"FieldName":"InputData","IsActive":true},{"FieldName":"OutputData","IsActive":true},{"FieldName":"PayloadAtStart","IsActive":true},{"FieldName":"PayloadAtEnd","IsActive":true},{"FieldName":"ErrorMessage","IsActive":true},{"FieldName":"Comments","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["InputData","OutputData"]}',
         1, 1);
END

-- 4. AI Agent Runs - 6 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = '48AC178D-4C4B-4C3E-9F07-FB6774B3D624')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('48AC178D-4C4B-4C3E-9F07-FB6774B3D624',
         N'AI Agent Runs - 6 Month',
         N'Archives AI Agent Runs data older than 6 months. Strips Result, FinalPayload, StartingPayload, Data, Message, ErrorMessage, and AgentState fields.',
         N'/archives', N'JSON', 0, 180, N'StripFields', 100, 1, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('25C71331-AAFD-4CE8-B076-5B0A540391E4',
         '48AC178D-4C4B-4C3E-9F07-FB6774B3D624',
         '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- MJ: AI Agent Runs
         N'StripFields', 180, N'__mj_CreatedAt', 100, 2,
         N'{"Fields":[{"FieldName":"Result","IsActive":true},{"FieldName":"FinalPayload","IsActive":true},{"FieldName":"StartingPayload","IsActive":true},{"FieldName":"Data","IsActive":true},{"FieldName":"Message","IsActive":true},{"FieldName":"ErrorMessage","IsActive":true},{"FieldName":"AgentState","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["Result","FinalPayload"]}',
         1, 1);
END

-- 5. Audit Logs - 18 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = '769134EB-D384-48CE-915F-5836E9009A6C')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('769134EB-D384-48CE-915F-5836E9009A6C',
         N'Audit Logs - 18 Month',
         N'Archives Audit Logs data older than 18 months. Strips Details and Description fields.',
         N'/archives', N'JSON', 0, 540, N'StripFields', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('C1BD8AF1-9B26-49F0-A943-818CBF0BC5AC',
         '769134EB-D384-48CE-915F-5836E9009A6C',
         'F8238F34-2837-EF11-86D4-6045BDEE16E6', -- MJ: Audit Logs
         N'StripFields', 540, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[{"FieldName":"Details","IsActive":true},{"FieldName":"Description","IsActive":true}],"ArchiveFullRecord":true,"SkipIfAllNullFields":["Details","Description"]}',
         0, 1);
END

-- 6. Action Execution Logs - 12 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = '12D1DBB2-B2DE-4F8B-985A-839E0D21FE62')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('12D1DBB2-B2DE-4F8B-985A-839E0D21FE62',
         N'Action Execution Logs - 12 Month',
         N'Archives Action Execution Logs data older than 12 months. Archives the full record to external storage then deletes the source row.',
         N'/archives', N'JSON', 0, 365, N'HardDelete', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('9AE11DDD-3F6F-4737-8A3D-15D31817F6A9',
         '12D1DBB2-B2DE-4F8B-985A-839E0D21FE62',
         '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- MJ: Action Execution Logs
         N'HardDelete', 365, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[],"ArchiveFullRecord":true}',
         0, 1);
END

-- 7. Scheduled Job Runs - 12 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = '4FFE84AA-617B-4E88-AB81-C0EB412E9426')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('4FFE84AA-617B-4E88-AB81-C0EB412E9426',
         N'Scheduled Job Runs - 12 Month',
         N'Archives Scheduled Job Runs data older than 12 months. Archives the full record to external storage then deletes the source row.',
         N'/archives', N'JSON', 0, 365, N'HardDelete', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('3DD38EA5-A698-4104-9E9B-C22258C9DCF4',
         '4FFE84AA-617B-4E88-AB81-C0EB412E9426',
         '05853432-5E13-4F2A-8618-77857ADF17FA', -- MJ: Scheduled Job Runs
         N'HardDelete', 365, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[],"ArchiveFullRecord":true}',
         0, 1);
END

-- 8. Communication Logs - 12 Month
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ArchiveConfiguration] WHERE [ID] = '8C3AD877-0BAE-4CC6-970D-9249BAABCE53')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
        ([ID], [Name], [Description], [RootPath], [ArchiveFormat], [IsActive], [DefaultRetentionDays], [DefaultMode], [DefaultBatchSize], [ArchiveRelatedRecordChanges], [Status], [CreatedByUserID])
    VALUES
        ('8C3AD877-0BAE-4CC6-970D-9249BAABCE53',
         N'Communication Logs - 12 Month',
         N'Archives Communication Logs data older than 12 months. Archives the full record to external storage then deletes the source row.',
         N'/archives', N'JSON', 0, 365, N'HardDelete', 100, 0, N'Disabled',
         'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E');

    INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
        ([ID], [ArchiveConfigurationID], [EntityID], [Mode], [RetentionDays], [DateField], [BatchSize], [Priority], [FieldConfiguration], [ArchiveRelatedRecordChanges], [IsActive])
    VALUES
        ('6CF03B58-511D-4751-983D-B5AFF04538E2',
         '8C3AD877-0BAE-4CC6-970D-9249BAABCE53',
         '46248F34-2837-EF11-86D4-6045BDEE16E6', -- MJ: Communication Logs
         N'HardDelete', 365, N'__mj_CreatedAt', 100, 1,
         N'{"Fields":[],"ArchiveFullRecord":true}',
         0, 1);
END
