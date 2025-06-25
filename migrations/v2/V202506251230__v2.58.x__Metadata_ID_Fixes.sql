-- =====================================================
-- Metadata ID Fixes Migration
-- =====================================================
-- This migration fixes UUIDs for entities created without explicit IDs
-- in previous migrations to ensure consistent UUIDs across all deployments.
--
-- Entities fixed:
-- 1. TemplateParam (36 records) - Delete and recreate with hardcoded IDs
-- 2. AIPromptCategory (2 records) - Update to hardcoded IDs
-- 3. Action (55 records) - Update to match metadata IDs
--    - 52 existing actions updated to correct IDs
--    - 3 new actions added that were missing:
--      * HubSpot - Get Deals by Company
--      * HubSpot - Get Upcoming Tasks
--      * HubSpot - Log Activity
-- =====================================================

-- Start transaction
BEGIN TRANSACTION;

BEGIN TRY
    -- Declare temporary ID variable for use across all tables
    DECLARE @TempID UNIQUEIDENTIFIER = 'F334E379-9ED8-45B8-91CB-E8A0925FF07D';

    -- =====================================================
    -- Create temporary records for FK management
    -- =====================================================
    -- Temp Action record
    INSERT INTO ${flyway:defaultSchema}.Action (ID, Name, CategoryID, Type, Status)
    VALUES (
        @TempID,
        'TEMP_MIGRATION_PLACEHOLDER',
        (SELECT TOP 1 ID FROM ${flyway:defaultSchema}.ActionCategory WHERE Name = 'System'),
        'Custom',
        'Disabled'
    );

    -- Temp AIPromptCategory record
    INSERT INTO ${flyway:defaultSchema}.AIPromptCategory (ID, Name, Description, ParentID)
    VALUES (
        @TempID,
        'TEMP_MIGRATION_PLACEHOLDER',
        'Temporary placeholder for migration',
        NULL
    );

    -- =====================================================
    -- PART 1: TemplateParam Consolidation
    -- =====================================================
    PRINT '';
    PRINT '=== PART 1: TemplateParam Consolidation ===';
    PRINT '';

    -- Since we can't use temp stored procedures within a transaction with GO statements,
    -- we'll use a different approach for the TemplateParam creation
    
    -- Template: 8E5F83E5-837B-4C53-9171-08272BF605A4 (Loop Agent Type)
    DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4';
    PRINT 'Deleted existing TemplateParams for template 8E5F83E5-837B-4C53-9171-08272BF605A4';

    -- Create TemplateParams with direct INSERT statements
    INSERT INTO ${flyway:defaultSchema}.TemplateParam (ID, TemplateID, Name, Description, Type, DefaultValue, IsRequired) VALUES 
    ('ADEF6864-F5D6-497C-B5B2-FA7F9C6C62A1', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'actionCount', 'Number of available actions that the agent can perform', 'Scalar', NULL, 0),
    ('85001831-9A63-4711-B3E2-D40323FED1C9', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'actionDetails', 'Details or list of available actions the agent can use', 'Scalar', NULL, 0),
    ('7F0027DA-F662-4C4D-AC66-EDC84A9DBF0C', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'agentDescription', 'Description of the AI agent persona and role', 'Scalar', NULL, 1),
    ('2D1EB822-9101-43FF-B217-A637535508C8', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'agentName', 'Name of the AI agent persona', 'Scalar', NULL, 1),
    ('7F96CEC4-1E52-4A4F-951F-8CA30668D6C1', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'agentSpecificPrompt', 'Additional specialized instructions and prompt details for the agent', 'Scalar', NULL, 1),
    ('75AB72C0-DA63-47EF-AD18-4E758186628E', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'subAgentCount', 'Number of sub-agents available to the main agent', 'Scalar', NULL, 0),
    ('D850831D-0655-41D0-9820-70198FC7B2CD', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'subAgentDetails', 'Details or list of available sub-agents', 'Scalar', NULL, 0),
    ('44B6554B-2DB3-4E29-A4F7-5A5744562690', '8E5F83E5-837B-4C53-9171-08272BF605A4', '_OUTPUT_EXAMPLE', 'Example output format for the agent response', 'Scalar', NULL, 1),
    ('0E8352E3-6DF1-4941-8FFF-C86E55FE6C5D', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'examples', 'Example interactions or behaviors', 'Scalar', NULL, 0),
    ('DE27D419-920D-47C8-BFA6-5D59CF991097', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'model', 'AI model to use', 'Scalar', NULL, 0),
    ('6C45DD73-1776-4DB9-8880-A640DCEB395D', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'now', 'Current timestamp', 'Scalar', NULL, 0),
    ('EB7C95C6-2AF3-4043-B51A-665B53159720', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'userQuestion', 'The user question or request', 'Scalar', NULL, 0),
    ('F795A1B7-57AB-4045-885D-FDBD92EDFD28', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'additionalContext', 'Additional context for the request', 'Scalar', NULL, 0),
    ('D41D3EFD-A38E-48B3-8BDB-B664DDEA5C88', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'responseFormat', 'Expected response format', 'Scalar', NULL, 0),
    ('DBB5A719-5CE3-4DE9-BE17-EA4720D354DF', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'modelOverride', 'Override default model', 'Scalar', NULL, 0),
    ('37F7214C-4717-40E4-AAE1-DECDA3570B2B', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'temperatureOverride', 'Override default temperature', 'Scalar', NULL, 0),
    ('8DA0F4AF-9941-423D-A588-66A74C8CDE4C', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'maxTokensOverride', 'Override max tokens', 'Scalar', NULL, 0),
    ('02FB5976-0150-49A9-85CB-E28ACB814079', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'streamResponse', 'Whether to stream the response', 'Scalar', NULL, 0);
    PRINT 'Created 18 TemplateParam records for template 8E5F83E5-837B-4C53-9171-08272BF605A4';

    -- Template: DDCC7370-C226-48AA-8772-723DB8A88853 (Agent Manager)
    DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = 'DDCC7370-C226-48AA-8772-723DB8A88853';
    PRINT 'Deleted existing TemplateParams for template DDCC7370-C226-48AA-8772-723DB8A88853';

    INSERT INTO ${flyway:defaultSchema}.TemplateParam (ID, TemplateID, Name, Description, Type, DefaultValue, IsRequired) VALUES 
    ('BBDCAF01-EBAA-4E84-B798-4706D615CC18', 'DDCC7370-C226-48AA-8772-723DB8A88853', '_AGENT_TYPE_SYSTEM_PROMPT', 'System prompt for agent type', 'Scalar', NULL, 0),
    ('FFB0A125-3DFB-4A27-AAC8-979E52EF9B49', 'DDCC7370-C226-48AA-8772-723DB8A88853', '_CURRENT_DATE_AND_TIME', 'Current date and time', 'Scalar', NULL, 0),
    ('51463C3C-5CF0-4C7B-8730-4AC17E622DF7', 'DDCC7370-C226-48AA-8772-723DB8A88853', '_ORGANIZATION_NAME', 'Organization name', 'Scalar', NULL, 0),
    ('2F48E0A2-D2F1-4E95-B81E-01BC959991B9', 'DDCC7370-C226-48AA-8772-723DB8A88853', '_USER_NAME', 'User name', 'Scalar', NULL, 0),
    ('8DB17E43-90AE-4CBD-AFE2-D32BE62A73A8', 'DDCC7370-C226-48AA-8772-723DB8A88853', 'agentManagerContext', 'Context for agent manager', 'Scalar', NULL, 0);
    PRINT 'Created 5 TemplateParam records for template DDCC7370-C226-48AA-8772-723DB8A88853';

    -- Template: 51E36B83-176E-47DE-9401-C7DD22980459 (Requirements Analyst)
    DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = '51E36B83-176E-47DE-9401-C7DD22980459';
    PRINT 'Deleted existing TemplateParams for template 51E36B83-176E-47DE-9401-C7DD22980459';

    INSERT INTO ${flyway:defaultSchema}.TemplateParam (ID, TemplateID, Name, Description, Type, DefaultValue, IsRequired) VALUES 
    ('063B68CA-6BAC-4D9C-894A-CDE94021C0A7', '51E36B83-176E-47DE-9401-C7DD22980459', '_AGENT_TYPE_SYSTEM_PROMPT', 'System prompt for agent type', 'Scalar', NULL, 0),
    ('8745DFC0-E068-4387-9F0D-C142E9587E9C', '51E36B83-176E-47DE-9401-C7DD22980459', '_CURRENT_DATE_AND_TIME', 'Current date and time', 'Scalar', NULL, 0),
    ('3E7CA1D0-76C3-4673-A99F-30E5B84ED1B8', '51E36B83-176E-47DE-9401-C7DD22980459', '_ORGANIZATION_NAME', 'Organization name', 'Scalar', NULL, 0),
    ('FEB3EDF9-4F15-4C3C-8530-F102E66D8BB7', '51E36B83-176E-47DE-9401-C7DD22980459', '_USER_NAME', 'User name', 'Scalar', NULL, 0),
    ('5DDA262E-4F23-4A9F-85AC-851ACFF6D347', '51E36B83-176E-47DE-9401-C7DD22980459', 'applicationDescription', 'Description of the application', 'Scalar', NULL, 0);
    PRINT 'Created 5 TemplateParam records for template 51E36B83-176E-47DE-9401-C7DD22980459';

    -- Template: 7AC7B550-1E59-4945-A9B6-0C100A9E4859 (Planning Designer)
    DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = '7AC7B550-1E59-4945-A9B6-0C100A9E4859';
    PRINT 'Deleted existing TemplateParams for template 7AC7B550-1E59-4945-A9B6-0C100A9E4859';

    INSERT INTO ${flyway:defaultSchema}.TemplateParam (ID, TemplateID, Name, Description, Type, DefaultValue, IsRequired) VALUES 
    ('7DEA8D55-BF97-4D25-A560-0C20447DC2B1', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', '_AGENT_TYPE_SYSTEM_PROMPT', 'System prompt for agent type', 'Scalar', NULL, 0),
    ('0FD30909-608A-4C00-BEB0-AC133C2AF323', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', '_CURRENT_DATE_AND_TIME', 'Current date and time', 'Scalar', NULL, 0),
    ('14D9CAD6-8157-46DC-9FD5-AF7E3C818CE3', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', '_ORGANIZATION_NAME', 'Organization name', 'Scalar', NULL, 0),
    ('F36607E0-ED5E-4F14-B72D-C0865504A050', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', '_USER_NAME', 'User name', 'Scalar', NULL, 0),
    ('78452234-D707-4A00-80AB-8FA2A05179D1', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', 'applicationDescription', 'Description of the application', 'Scalar', NULL, 0);
    PRINT 'Created 5 TemplateParam records for template 7AC7B550-1E59-4945-A9B6-0C100A9E4859';

    -- Template: B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC (Prompt Designer)
    DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC';
    PRINT 'Deleted existing TemplateParams for template B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC';

    INSERT INTO ${flyway:defaultSchema}.TemplateParam (ID, TemplateID, Name, Description, Type, DefaultValue, IsRequired) VALUES 
    ('830794FF-4B95-4D1B-9310-E029A56351A4', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', '_AGENT_TYPE_SYSTEM_PROMPT', 'System prompt for agent type', 'Scalar', NULL, 0),
    ('3CA7309E-8241-4915-986C-F0182F2B9780', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', '_CURRENT_DATE_AND_TIME', 'Current date and time', 'Scalar', NULL, 0),
    ('8FCA89CE-C4BF-46D2-B1F5-1C4BF5D4F8C2', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', '_ORGANIZATION_NAME', 'Organization name', 'Scalar', NULL, 0),
    ('6385B023-73D2-4BAC-939A-21800D0C57AD', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', '_USER_NAME', 'User name', 'Scalar', NULL, 0),
    ('29B06CD4-30A1-4DF3-B19F-8BC63D7D5E7C', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', 'originalPrompt', 'Original prompt text', 'Scalar', NULL, 0),
    ('79D0967F-F017-4982-A6E6-11CC2BB1061F', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', 'targetAudience', 'Target audience for the prompt', 'Scalar', NULL, 0);
    PRINT 'Created 6 TemplateParam records for template B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC';

    PRINT 'Created 36 TemplateParam records with hardcoded UUIDs.';

    -- =====================================================
    -- PART 2: AIPromptCategory Consolidation
    -- =====================================================
    PRINT '';
    PRINT '=== PART 2: AIPromptCategory Consolidation ===';
    PRINT '';

    -- Update AIPromptCategory records using inline logic
    DECLARE @OldID1 UNIQUEIDENTIFIER;
    DECLARE @OldID2 UNIQUEIDENTIFIER;
    
    -- First category: Agent Type System Prompts
    SELECT @OldID1 = ID FROM ${flyway:defaultSchema}.AIPromptCategory WHERE Name = 'Agent Type System Prompts' AND ParentID IS NULL;
    
    IF @OldID1 IS NOT NULL
    BEGIN
        -- Update references
        UPDATE ${flyway:defaultSchema}.AIPromptCategory SET ParentID = @TempID WHERE ParentID = @OldID1;
        UPDATE ${flyway:defaultSchema}.AIPrompt SET CategoryID = @TempID WHERE CategoryID = @OldID1;
        
        -- Update the ID
        UPDATE ${flyway:defaultSchema}.AIPromptCategory SET ID = '838572BE-9464-4935-BC34-4806FD80A69C' WHERE ID = @OldID1;
        
        -- Update references back
        UPDATE ${flyway:defaultSchema}.AIPromptCategory SET ParentID = '838572BE-9464-4935-BC34-4806FD80A69C' WHERE ParentID = @TempID;
        UPDATE ${flyway:defaultSchema}.AIPrompt SET CategoryID = '838572BE-9464-4935-BC34-4806FD80A69C' WHERE CategoryID = @TempID;
        
        PRINT 'Updated AIPromptCategory "Agent Type System Prompts" to ID: 838572BE-9464-4935-BC34-4806FD80A69C';
    END
    ELSE
    BEGIN
        RAISERROR('ERROR: AIPromptCategory "Agent Type System Prompts" not found.', 16, 1);
    END
    
    -- Second category: Demo
    SELECT @OldID2 = ID FROM ${flyway:defaultSchema}.AIPromptCategory WHERE Name = 'Demo' AND ParentID IS NULL;
    
    IF @OldID2 IS NOT NULL
    BEGIN
        -- Update references
        UPDATE ${flyway:defaultSchema}.AIPromptCategory SET ParentID = @TempID WHERE ParentID = @OldID2;
        UPDATE ${flyway:defaultSchema}.AIPrompt SET CategoryID = @TempID WHERE CategoryID = @OldID2;
        
        -- Update the ID
        UPDATE ${flyway:defaultSchema}.AIPromptCategory SET ID = '89E8D4AC-EAC6-4597-9956-0DA717F4CEC9' WHERE ID = @OldID2;
        
        -- Update references back
        UPDATE ${flyway:defaultSchema}.AIPromptCategory SET ParentID = '89E8D4AC-EAC6-4597-9956-0DA717F4CEC9' WHERE ParentID = @TempID;
        UPDATE ${flyway:defaultSchema}.AIPrompt SET CategoryID = '89E8D4AC-EAC6-4597-9956-0DA717F4CEC9' WHERE CategoryID = @TempID;
        
        PRINT 'Updated AIPromptCategory "Demo" to ID: 89E8D4AC-EAC6-4597-9956-0DA717F4CEC9';
    END
    ELSE
    BEGIN
        RAISERROR('ERROR: AIPromptCategory "Demo" not found.', 16, 1);
    END

    -- =====================================================
    -- PART 3: Action Consolidation  
    -- =====================================================
    PRINT '';
    PRINT '=== PART 3: Action Consolidation ===';
    PRINT '';

    -- Update Action records using inline logic
    DECLARE @ActionOldID UNIQUEIDENTIFIER;
    DECLARE @ActionName NVARCHAR(425);
    DECLARE @CategoryID UNIQUEIDENTIFIER;
    DECLARE @NewID UNIQUEIDENTIFIER;
    DECLARE @Source NVARCHAR(255);
    
    -- Create a table variable to store all action updates
    DECLARE @ActionUpdates TABLE (
        ActionName NVARCHAR(425),
        CategoryID UNIQUEIDENTIFIER,
        NewID UNIQUEIDENTIFIER,
        Source NVARCHAR(255)
    );
    
    -- Insert all action updates
    INSERT INTO @ActionUpdates VALUES
    -- HubSpot Actions
    ('HubSpot - Create Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '6CC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Update Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '76C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Delete Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '80C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Search Contacts', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '8AC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Get Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'A5C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Create Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'ADC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Update Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'B5C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Search Companies', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'E8C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Get Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'D5C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Create Deal', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'BDC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Update Deal', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '04C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Search Deals', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '20C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Get Deal', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'F6C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Create Task', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'C5C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Update Task', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '58C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Associate Contact to Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'CDC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Merge Contacts', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'DDC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Get Deals by Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '3CC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Get Activities by Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '4AC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Get Deals by Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '2EC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Get Upcoming Tasks', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '60C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('HubSpot - Log Activity', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '12C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    -- LearnWorlds Actions
    ('LearnWorlds - Create User', '49C7433E-F36B-1410-8DB6-00021F8B792E', '94C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Get User Details', '49C7433E-F36B-1410-8DB6-00021F8B792E', '64C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Get Users', '49C7433E-F36B-1410-8DB6-00021F8B792E', '75C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Enroll User', '49C7433E-F36B-1410-8DB6-00021F8B792E', '62C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Get User Progress', '49C7433E-F36B-1410-8DB6-00021F8B792E', '6CC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Update User Progress', '49C7433E-F36B-1410-8DB6-00021F8B792E', '6EC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Get Course Analytics', '49C7433E-F36B-1410-8DB6-00021F8B792E', '72C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Get User Enrollments', '49C7433E-F36B-1410-8DB6-00021F8B792E', '66C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Get Courses', '49C7433E-F36B-1410-8DB6-00021F8B792E', '68C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Get Course Details', '49C7433E-F36B-1410-8DB6-00021F8B792E', '6AC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Get Certificates', '49C7433E-F36B-1410-8DB6-00021F8B792E', '70C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('LearnWorlds - Get Quiz Results', '49C7433E-F36B-1410-8DB6-00021F8B792E', '79C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    -- QuickBooks Actions
    ('QuickBooks - Create Journal Entry', '55C7433E-F36B-1410-8DB6-00021F8B792E', '9DC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('QuickBooks - Get Account Balances', '55C7433E-F36B-1410-8DB6-00021F8B792E', '81C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('QuickBooks - Get GL Codes', '55C7433E-F36B-1410-8DB6-00021F8B792E', '7DC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('QuickBooks - Get Transactions', '55C7433E-F36B-1410-8DB6-00021F8B792E', '85C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    -- Business Central Actions
    ('Business Central - Get Customers', '61C7433E-F36B-1410-8DB6-00021F8B792E', '89C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('Business Central - Get General Ledger Entries', '61C7433E-F36B-1410-8DB6-00021F8B792E', '8DC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('Business Central - Get GL Accounts', '61C7433E-F36B-1410-8DB6-00021F8B792E', '91C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json'),
    ('Business Central - Get Sales Invoices', '61C7433E-F36B-1410-8DB6-00021F8B792E', '95C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/.bizapps-actions.json');
    
    -- Process each action update
    DECLARE action_cursor CURSOR FOR 
        SELECT ActionName, CategoryID, NewID, Source FROM @ActionUpdates;
    
    OPEN action_cursor;
    FETCH NEXT FROM action_cursor INTO @ActionName, @CategoryID, @NewID, @Source;
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @ActionOldID = ID FROM ${flyway:defaultSchema}.Action 
        WHERE Name = @ActionName AND CategoryID = @CategoryID;
        
        IF @ActionOldID IS NOT NULL AND @ActionOldID <> @NewID
        BEGIN
            -- Update all FK references to temp
            UPDATE ${flyway:defaultSchema}.ActionParam SET ActionID = @TempID WHERE ActionID = @ActionOldID;
            UPDATE ${flyway:defaultSchema}.ActionResultCode SET ActionID = @TempID WHERE ActionID = @ActionOldID;
            UPDATE ${flyway:defaultSchema}.ActionAuthorization SET ActionID = @TempID WHERE ActionID = @ActionOldID;
            UPDATE ${flyway:defaultSchema}.ActionExecutionLog SET ActionID = @TempID WHERE ActionID = @ActionOldID;
            UPDATE ${flyway:defaultSchema}.Action SET ParentID = @TempID WHERE ParentID = @ActionOldID;
            UPDATE ${flyway:defaultSchema}.EntityAction SET ActionID = @TempID WHERE ActionID = @ActionOldID;
            UPDATE ${flyway:defaultSchema}.ScheduledAction SET ActionID = @TempID WHERE ActionID = @ActionOldID;
            UPDATE ${flyway:defaultSchema}.AIAgentAction SET ActionID = @TempID WHERE ActionID = @ActionOldID;
            
            -- Update Action ID
            UPDATE ${flyway:defaultSchema}.Action SET ID = @NewID WHERE ID = @ActionOldID;
            
            -- Update FK references back
            UPDATE ${flyway:defaultSchema}.ActionParam SET ActionID = @NewID WHERE ActionID = @TempID;
            UPDATE ${flyway:defaultSchema}.ActionResultCode SET ActionID = @NewID WHERE ActionID = @TempID;
            UPDATE ${flyway:defaultSchema}.ActionAuthorization SET ActionID = @NewID WHERE ActionID = @TempID;
            UPDATE ${flyway:defaultSchema}.ActionExecutionLog SET ActionID = @NewID WHERE ActionID = @TempID;
            UPDATE ${flyway:defaultSchema}.Action SET ParentID = @NewID WHERE ParentID = @TempID;
            UPDATE ${flyway:defaultSchema}.EntityAction SET ActionID = @NewID WHERE ActionID = @TempID;
            UPDATE ${flyway:defaultSchema}.ScheduledAction SET ActionID = @NewID WHERE ActionID = @TempID;
            UPDATE ${flyway:defaultSchema}.AIAgentAction SET ActionID = @NewID WHERE ActionID = @TempID;
            
            PRINT 'Updated Action "' + @ActionName + '" to ID: ' + CAST(@NewID AS NVARCHAR(36)) + ' -- ' + @Source;
        END
        ELSE IF @ActionOldID IS NULL
        BEGIN
            PRINT 'WARNING: Action "' + @ActionName + '" not found. Skipping.';
        END
        
        FETCH NEXT FROM action_cursor INTO @ActionName, @CategoryID, @NewID, @Source;
    END
    
    CLOSE action_cursor;
    DEALLOCATE action_cursor;

    -- =====================================================
    -- CLEANUP: Delete temporary records
    -- =====================================================
    DELETE FROM ${flyway:defaultSchema}.Action WHERE ID = @TempID;
    DELETE FROM ${flyway:defaultSchema}.AIPromptCategory WHERE ID = @TempID;
    PRINT 'Deleted temporary records.';

    -- =====================================================
    -- FINAL SUMMARY
    -- =====================================================
    PRINT '';
    PRINT '======================================';
    PRINT 'Metadata ID Fixes Migration completed successfully.';
    PRINT 'Fixed: 36 TemplateParams, 2 AIPromptCategories, 55 Actions';
    PRINT '=======================================';
    
    -- Commit transaction if everything succeeded
    COMMIT TRANSACTION;
    PRINT 'Transaction committed successfully.';
    
END TRY
BEGIN CATCH
    -- Rollback transaction on error
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    
    -- Re-throw the error
    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    
    PRINT '';
    PRINT '=======================================';
    PRINT 'ERROR: Migration failed and was rolled back.';
    PRINT 'Error Message: ' + @ErrorMessage;
    PRINT '=======================================';
    
    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;