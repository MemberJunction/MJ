-- =====================================================
-- Metadata ID Fixes Migration
-- =====================================================
-- This migration fixes UUIDs for entities created without explicit IDs
-- in previous migrations to ensure consistent UUIDs across all deployments.
--
-- Entities fixed:
-- 1. TemplateParam (36 records) - Delete and recreate with hardcoded IDs
-- 2. AIPromptCategory (2 records) - Update to hardcoded IDs
-- 3. Action (42 records) - Update to match metadata IDs
-- =====================================================

-- Declare temporary ID variable for use across all tables
DECLARE @TempID UNIQUEIDENTIFIER = 'F334E379-9ED8-45B8-91CB-E8A0925FF07D';

-- =====================================================
-- Create temporary records for FK management
-- =====================================================
-- Temp Action record
INSERT INTO ${flyway:defaultSchema}.Action (ID, Name, CategoryID, Type, Status, CreatedByUserID, UpdatedByUserID)
VALUES (
    @TempID,
    'TEMP_MIGRATION_PLACEHOLDER',
    (SELECT TOP 1 ID FROM ${flyway:defaultSchema}.ActionCategory WHERE Name = 'System'),
    'Custom',
    'Disabled',
    (SELECT TOP 1 ID FROM ${flyway:defaultSchema}.[User] WHERE Email = 'system@memberjunction.com'),
    (SELECT TOP 1 ID FROM ${flyway:defaultSchema}.[User] WHERE Email = 'system@memberjunction.com')
);

-- Temp AIPromptCategory record
INSERT INTO ${flyway:defaultSchema}.AIPromptCategory (ID, Name, Description, ParentID, CreatedByUserID, UpdatedByUserID)
VALUES (
    @TempID,
    'TEMP_MIGRATION_PLACEHOLDER',
    'Temporary placeholder for migration',
    NULL,
    (SELECT TOP 1 ID FROM ${flyway:defaultSchema}.[User] WHERE Email = 'system@memberjunction.com'),
    (SELECT TOP 1 ID FROM ${flyway:defaultSchema}.[User] WHERE Email = 'system@memberjunction.com')
);

-- =====================================================
-- PART 1: TemplateParam Consolidation
-- =====================================================
PRINT '';
PRINT '=== PART 1: TemplateParam Consolidation ===';
PRINT '';

-- Create procedure for TemplateParam creation
CREATE PROCEDURE #CreateTemplateParam
    @ID UNIQUEIDENTIFIER,
    @TemplateID UNIQUEIDENTIFIER,
    @Name NVARCHAR(255),
    @Description NVARCHAR(MAX),
    @Type NVARCHAR(50),
    @DefaultValue NVARCHAR(MAX) = NULL,
    @IsRequired BIT,
    @Source NVARCHAR(255) = 'Generated UUID (not in metadata)'
AS
BEGIN
    EXEC ${flyway:defaultSchema}.spCreateTemplateParam 
        @ID = @ID,
        @TemplateID = @TemplateID,
        @Name = @Name,
        @Description = @Description,
        @Type = @Type,
        @DefaultValue = @DefaultValue,
        @IsRequired = @IsRequired;
    
    PRINT 'Created TemplateParam "' + @Name + '" with ID: ' + CAST(@ID AS NVARCHAR(36)) + ' -- ' + @Source;
END;
GO

-- Template: 8E5F83E5-837B-4C53-9171-08272BF605A4 (Loop Agent Type)
DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4';
PRINT 'Deleted existing TemplateParams for template 8E5F83E5-837B-4C53-9171-08272BF605A4';

EXEC #CreateTemplateParam 'ADEF6864-F5D6-497C-B5B2-FA7F9C6C62A1', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'actionCount', 'Number of available actions that the agent can perform', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '85001831-9A63-4711-B3E2-D40323FED1C9', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'actionDetails', 'Details or list of available actions the agent can use', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '7F0027DA-F662-4C4D-AC66-EDC84A9DBF0C', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'agentDescription', 'Description of the AI agent persona and role', 'Scalar', NULL, 1, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '2D1EB822-9101-43FF-B217-A637535508C8', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'agentName', 'Name of the AI agent persona', 'Scalar', NULL, 1, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '7F96CEC4-1E52-4A4F-951F-8CA30668D6C1', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'agentSpecificPrompt', 'Additional specialized instructions and prompt details for the agent', 'Scalar', NULL, 1, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '75AB72C0-DA63-47EF-AD18-4E758186628E', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'subAgentCount', 'Number of sub-agents available to the main agent', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam 'D850831D-0655-41D0-9820-70198FC7B2CD', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'subAgentDetails', 'Details or list of available sub-agents', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '44B6554B-2DB3-4E29-A4F7-5A5744562690', '8E5F83E5-837B-4C53-9171-08272BF605A4', '_OUTPUT_EXAMPLE', 'Example output format for the agent response', 'Scalar', NULL, 1, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '0E8352E3-6DF1-4941-8FFF-C86E55FE6C5D', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'examples', 'Example interactions or behaviors', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam 'DE27D419-920D-47C8-BFA6-5D59CF991097', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'model', 'AI model to use', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '6C45DD73-1776-4DB9-8880-A640DCEB395D', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'now', 'Current timestamp', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam 'EB7C95C6-2AF3-4043-B51A-665B53159720', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'userQuestion', 'The user question or request', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam 'F795A1B7-57AB-4045-885D-FDBD92EDFD28', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'additionalContext', 'Additional context for the request', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam 'D41D3EFD-A38E-48B3-8BDB-B664DDEA5C88', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'responseFormat', 'Expected response format', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam 'DBB5A719-5CE3-4DE9-BE17-EA4720D354DF', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'modelOverride', 'Override default model', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '37F7214C-4717-40E4-AAE1-DECDA3570B2B', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'temperatureOverride', 'Override default temperature', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '8DA0F4AF-9941-423D-A588-66A74C8CDE4C', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'maxTokensOverride', 'Override max tokens', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '02FB5976-0150-49A9-85CB-E28ACB814079', '8E5F83E5-837B-4C53-9171-08272BF605A4', 'streamResponse', 'Whether to stream the response', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';

-- Template: DDCC7370-C226-48AA-8772-723DB8A88853 (Agent Manager)
DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = 'DDCC7370-C226-48AA-8772-723DB8A88853';
PRINT 'Deleted existing TemplateParams for template DDCC7370-C226-48AA-8772-723DB8A88853';

EXEC #CreateTemplateParam 'BBDCAF01-EBAA-4E84-B798-4706D615CC18', 'DDCC7370-C226-48AA-8772-723DB8A88853', '_AGENT_TYPE_SYSTEM_PROMPT', 'System prompt for agent type', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam 'FFB0A125-3DFB-4A27-AAC8-979E52EF9B49', 'DDCC7370-C226-48AA-8772-723DB8A88853', '_CURRENT_DATE_AND_TIME', 'Current date and time', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '51463C3C-5CF0-4C7B-8730-4AC17E622DF7', 'DDCC7370-C226-48AA-8772-723DB8A88853', '_ORGANIZATION_NAME', 'Organization name', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '2F48E0A2-D2F1-4E95-B81E-01BC959991B9', 'DDCC7370-C226-48AA-8772-723DB8A88853', '_USER_NAME', 'User name', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '8DB17E43-90AE-4CBD-AFE2-D32BE62A73A8', 'DDCC7370-C226-48AA-8772-723DB8A88853', 'agentManagerContext', 'Context for agent manager', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';

-- Template: 51E36B83-176E-47DE-9401-C7DD22980459 (Requirements Analyst)
DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = '51E36B83-176E-47DE-9401-C7DD22980459';
PRINT 'Deleted existing TemplateParams for template 51E36B83-176E-47DE-9401-C7DD22980459';

EXEC #CreateTemplateParam '063B68CA-6BAC-4D9C-894A-CDE94021C0A7', '51E36B83-176E-47DE-9401-C7DD22980459', '_AGENT_TYPE_SYSTEM_PROMPT', 'System prompt for agent type', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '8745DFC0-E068-4387-9F0D-C142E9587E9C', '51E36B83-176E-47DE-9401-C7DD22980459', '_CURRENT_DATE_AND_TIME', 'Current date and time', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '3E7CA1D0-76C3-4673-A99F-30E5B84ED1B8', '51E36B83-176E-47DE-9401-C7DD22980459', '_ORGANIZATION_NAME', 'Organization name', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam 'FEB3EDF9-4F15-4C3C-8530-F102E66D8BB7', '51E36B83-176E-47DE-9401-C7DD22980459', '_USER_NAME', 'User name', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '5DDA262E-4F23-4A9F-85AC-851ACFF6D347', '51E36B83-176E-47DE-9401-C7DD22980459', 'applicationDescription', 'Description of the application', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';

-- Template: 7AC7B550-1E59-4945-A9B6-0C100A9E4859 (Planning Designer)
DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = '7AC7B550-1E59-4945-A9B6-0C100A9E4859';
PRINT 'Deleted existing TemplateParams for template 7AC7B550-1E59-4945-A9B6-0C100A9E4859';

EXEC #CreateTemplateParam '7DEA8D55-BF97-4D25-A560-0C20447DC2B1', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', '_AGENT_TYPE_SYSTEM_PROMPT', 'System prompt for agent type', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '0FD30909-608A-4C00-BEB0-AC133C2AF323', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', '_CURRENT_DATE_AND_TIME', 'Current date and time', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '14D9CAD6-8157-46DC-9FD5-AF7E3C818CE3', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', '_ORGANIZATION_NAME', 'Organization name', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam 'F36607E0-ED5E-4F14-B72D-C0865504A050', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', '_USER_NAME', 'User name', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '78452234-D707-4A00-80AB-8FA2A05179D1', '7AC7B550-1E59-4945-A9B6-0C100A9E4859', 'applicationDescription', 'Description of the application', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';

-- Template: B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC (Prompt Designer)
DELETE FROM ${flyway:defaultSchema}.TemplateParam WHERE TemplateID = 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC';
PRINT 'Deleted existing TemplateParams for template B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC';

EXEC #CreateTemplateParam '830794FF-4B95-4D1B-9310-E029A56351A4', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', '_AGENT_TYPE_SYSTEM_PROMPT', 'System prompt for agent type', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '3CA7309E-8241-4915-986C-F0182F2B9780', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', '_CURRENT_DATE_AND_TIME', 'Current date and time', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '8FCA89CE-C4BF-46D2-B1F5-1C4BF5D4F8C2', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', '_ORGANIZATION_NAME', 'Organization name', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '6385B023-73D2-4BAC-939A-21800D0C57AD', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', '_USER_NAME', 'User name', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '29B06CD4-30A1-4DF3-B19F-8BC63D7D5E7C', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', 'originalPrompt', 'Original prompt text', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';
EXEC #CreateTemplateParam '79D0967F-F017-4982-A6E6-11CC2BB1061F', 'B152CB5E-1E40-4EFC-89B7-AEB7E389B4DC', 'targetAudience', 'Target audience for the prompt', 'Scalar', NULL, 0, 'Generated UUID (not in metadata)';

DROP PROCEDURE #CreateTemplateParam;
PRINT 'Created 36 TemplateParam records with hardcoded UUIDs.';

-- =====================================================
-- PART 2: AIPromptCategory Consolidation
-- =====================================================
PRINT '';
PRINT '=== PART 2: AIPromptCategory Consolidation ===';
PRINT '';

-- Create procedure for AIPromptCategory updates
CREATE PROCEDURE #UpdateAIPromptCategoryID
    @Name NVARCHAR(255),
    @ParentID UNIQUEIDENTIFIER,
    @NewID UNIQUEIDENTIFIER,
    @Source NVARCHAR(255) = 'Generated UUID (not in metadata)'
AS
BEGIN
    DECLARE @OldID UNIQUEIDENTIFIER;
    DECLARE @RowCount INT;
    
    -- Check for duplicates
    SELECT @RowCount = COUNT(*) 
    FROM ${flyway:defaultSchema}.AIPromptCategory 
    WHERE Name = @Name AND (ParentID = @ParentID OR (ParentID IS NULL AND @ParentID IS NULL));
    
    IF @RowCount > 1
    BEGIN
        RAISERROR('ERROR: Multiple AIPromptCategory records found with name "%s". Migration aborted.', 16, 1, @Name);
        RETURN;
    END
    
    SELECT @OldID = ID 
    FROM ${flyway:defaultSchema}.AIPromptCategory 
    WHERE Name = @Name AND (ParentID = @ParentID OR (ParentID IS NULL AND @ParentID IS NULL));
    
    IF @OldID IS NOT NULL
    BEGIN
        -- Update references in AIPromptCategory (children)
        UPDATE ${flyway:defaultSchema}.AIPromptCategory 
        SET ParentID = @TempID
        WHERE ParentID = @OldID;

        -- Update references in AIPrompt
        UPDATE ${flyway:defaultSchema}.AIPrompt 
        SET CategoryID = @TempID
        WHERE CategoryID = @OldID;

        -- Update the category ID
        UPDATE ${flyway:defaultSchema}.AIPromptCategory 
        SET ID = @NewID
        WHERE ID = @OldID;

        -- Update references back from temp
        UPDATE ${flyway:defaultSchema}.AIPromptCategory 
        SET ParentID = @NewID
        WHERE ParentID = @TempID;

        UPDATE ${flyway:defaultSchema}.AIPrompt 
        SET CategoryID = @NewID
        WHERE CategoryID = @TempID;

        PRINT 'Updated AIPromptCategory "' + @Name + '" to ID: ' + CAST(@NewID AS NVARCHAR(36)) + ' -- ' + @Source;
    END
END;
GO

-- Update categories
EXEC #UpdateAIPromptCategoryID 'Agent Type System Prompts', NULL, '838572BE-9464-4935-BC34-4806FD80A69C', 'Generated UUID (not in metadata)';
EXEC #UpdateAIPromptCategoryID 'Demo', NULL, '89E8D4AC-EAC6-4597-9956-0DA717F4CEC9', 'Generated UUID (not in metadata)';

DROP PROCEDURE #UpdateAIPromptCategoryID;

-- =====================================================
-- PART 3: Action Consolidation  
-- =====================================================
PRINT '';
PRINT '=== PART 3: Action Consolidation ===';
PRINT '';

-- Create procedure for Action updates
CREATE PROCEDURE #UpdateActionID
    @ActionName NVARCHAR(425),
    @CategoryID UNIQUEIDENTIFIER,
    @NewID UNIQUEIDENTIFIER,
    @Source NVARCHAR(255) = 'Generated UUID'
AS
BEGIN
    DECLARE @OldID UNIQUEIDENTIFIER;
    DECLARE @RowCount INT;
    
    -- Check for duplicates
    SELECT @RowCount = COUNT(*) 
    FROM ${flyway:defaultSchema}.Action 
    WHERE Name = @ActionName AND CategoryID = @CategoryID;
    
    IF @RowCount > 1
    BEGIN
        RAISERROR('ERROR: Multiple Action records found with name "%s" and CategoryID %s. Migration aborted.', 16, 1, @ActionName, @CategoryID);
        RETURN;
    END
    
    SELECT @OldID = ID FROM ${flyway:defaultSchema}.Action 
    WHERE Name = @ActionName AND CategoryID = @CategoryID;
    
    IF @OldID IS NOT NULL
    BEGIN
        -- Update all FK references to temp
        UPDATE ${flyway:defaultSchema}.ActionParam SET ActionID = @TempID WHERE ActionID = @OldID;
        UPDATE ${flyway:defaultSchema}.ActionResultCode SET ActionID = @TempID WHERE ActionID = @OldID;
        UPDATE ${flyway:defaultSchema}.ActionContextType SET ActionID = @TempID WHERE ActionID = @OldID;
        UPDATE ${flyway:defaultSchema}.ActionAuthorization SET ActionID = @TempID WHERE ActionID = @OldID;
        UPDATE ${flyway:defaultSchema}.ActionExecution SET ActionID = @TempID WHERE ActionID = @OldID;
        UPDATE ${flyway:defaultSchema}.ActionExecution SET SubActionID = @TempID WHERE SubActionID = @OldID;
        UPDATE ${flyway:defaultSchema}.ActionExecution SET ParentActionID = @TempID WHERE ParentActionID = @OldID;
        UPDATE ${flyway:defaultSchema}.Action SET ParentID = @TempID WHERE ParentID = @OldID;
        UPDATE ${flyway:defaultSchema}.EntityAction SET ActionID = @TempID WHERE ActionID = @OldID;
        UPDATE ${flyway:defaultSchema}.ScheduledAction SET ActionID = @TempID WHERE ActionID = @OldID;
        UPDATE ${flyway:defaultSchema}.AIAgentAction SET ActionID = @TempID WHERE ActionID = @OldID;
        
        -- Update Action ID
        UPDATE ${flyway:defaultSchema}.Action SET ID = @NewID WHERE ID = @OldID;
        
        -- Update FK references back
        UPDATE ${flyway:defaultSchema}.ActionParam SET ActionID = @NewID WHERE ActionID = @TempID;
        UPDATE ${flyway:defaultSchema}.ActionResultCode SET ActionID = @NewID WHERE ActionID = @TempID;
        UPDATE ${flyway:defaultSchema}.ActionContextType SET ActionID = @NewID WHERE ActionID = @TempID;
        UPDATE ${flyway:defaultSchema}.ActionAuthorization SET ActionID = @NewID WHERE ActionID = @TempID;
        UPDATE ${flyway:defaultSchema}.ActionExecution SET ActionID = @NewID WHERE ActionID = @TempID;
        UPDATE ${flyway:defaultSchema}.ActionExecution SET SubActionID = @NewID WHERE SubActionID = @TempID;
        UPDATE ${flyway:defaultSchema}.ActionExecution SET ParentActionID = @NewID WHERE ParentActionID = @TempID;
        UPDATE ${flyway:defaultSchema}.Action SET ParentID = @NewID WHERE ParentID = @TempID;
        UPDATE ${flyway:defaultSchema}.EntityAction SET ActionID = @NewID WHERE ActionID = @TempID;
        UPDATE ${flyway:defaultSchema}.ScheduledAction SET ActionID = @NewID WHERE ActionID = @TempID;
        UPDATE ${flyway:defaultSchema}.AIAgentAction SET ActionID = @NewID WHERE ActionID = @TempID;
        
        PRINT 'Updated Action "' + @ActionName + '" to ID: ' + CAST(@NewID AS NVARCHAR(36)) + ' -- ' + @Source;
    END
END;
GO

-- HubSpot Actions
EXEC #UpdateActionID 'HubSpot - Create Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '6CC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/create-contact.json';
EXEC #UpdateActionID 'HubSpot - Update Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '76C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/update-contact.json';
EXEC #UpdateActionID 'HubSpot - Delete Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '80C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/delete-contact.json';
EXEC #UpdateActionID 'HubSpot - Search Contacts', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '8AC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/search-contacts.json';
EXEC #UpdateActionID 'HubSpot - Get Contact', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'A5C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/get-contact.json';
EXEC #UpdateActionID 'HubSpot - Create Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'ADC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/create-company.json';
EXEC #UpdateActionID 'HubSpot - Update Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'B5C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/update-company.json';
EXEC #UpdateActionID 'HubSpot - Delete Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '80B852CB-4223-493E-A8D6-B909D0CF7F1D', 'Generated UUID';
EXEC #UpdateActionID 'HubSpot - Search Companies', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'E8C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/search-companies.json';
EXEC #UpdateActionID 'HubSpot - Get Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'D5C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/get-company.json';
EXEC #UpdateActionID 'HubSpot - Create Deal', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'BDC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/create-deal.json';
EXEC #UpdateActionID 'HubSpot - Update Deal', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '04C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/update-deal.json';
EXEC #UpdateActionID 'HubSpot - Delete Deal', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'A148FF92-24D0-4D24-A038-E7FF43E6F70A', 'Generated UUID';
EXEC #UpdateActionID 'HubSpot - Search Deals', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '20C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/search-deals.json';
EXEC #UpdateActionID 'HubSpot - Get Deal', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'F6C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/get-deal.json';
EXEC #UpdateActionID 'HubSpot - Create Task', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'C5C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/create-task.json';
EXEC #UpdateActionID 'HubSpot - Update Task', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '58C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/update-task.json';
EXEC #UpdateActionID 'HubSpot - Delete Task', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '978FDF5E-47D9-4AEA-9B94-8734A72E05FE', 'Generated UUID';
EXEC #UpdateActionID 'HubSpot - Search Tasks', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '58190BAC-45E4-4197-B905-02567969D67E', 'Generated UUID';
EXEC #UpdateActionID 'HubSpot - Get Task', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '010F8C2B-F925-41FE-86E2-39B88CC5CBCD', 'Generated UUID';
EXEC #UpdateActionID 'HubSpot - Get Recent Engagements', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '5DFDB3F8-9094-4A58-90D5-F12A6CA90580', 'Generated UUID';
EXEC #UpdateActionID 'HubSpot - Get Contact Activities', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '1B360EB6-15B6-49D3-B166-5103D8E52A33', 'Generated UUID';
EXEC #UpdateActionID 'HubSpot - Associate Contact to Company', '3DC7433E-F36B-1410-8DB6-00021F8B792E', 'CDC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/hubspot/associate-contact-to-company.json';
EXEC #UpdateActionID 'HubSpot - Get Contact Properties', '3DC7433E-F36B-1410-8DB6-00021F8B792E', '58107646-4E79-412C-BE84-A9EF54CA3C08', 'Generated UUID';

-- LearnWorlds Actions
EXEC #UpdateActionID 'LearnWorlds - Create User', '49C7433E-F36B-1410-8DB6-00021F8B792E', '94C7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/learnworlds/create-user.json';
EXEC #UpdateActionID 'LearnWorlds - Update User', '49C7433E-F36B-1410-8DB6-00021F8B792E', '6169CF14-6A81-4235-BF31-52BDEBDEED4D', 'Generated UUID';
EXEC #UpdateActionID 'LearnWorlds - Get User', '49C7433E-F36B-1410-8DB6-00021F8B792E', '64C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/learnworlds/get-user-details.json';
EXEC #UpdateActionID 'LearnWorlds - Search Users', '49C7433E-F36B-1410-8DB6-00021F8B792E', '75C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/learnworlds/get-users.json';
EXEC #UpdateActionID 'LearnWorlds - Enroll User in Course', '49C7433E-F36B-1410-8DB6-00021F8B792E', '62C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/learnworlds/enroll-user.json';
EXEC #UpdateActionID 'LearnWorlds - Get User Course Progress', '49C7433E-F36B-1410-8DB6-00021F8B792E', '6CC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/learnworlds/get-user-progress.json';
EXEC #UpdateActionID 'LearnWorlds - Update Course Progress', '49C7433E-F36B-1410-8DB6-00021F8B792E', '6EC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/learnworlds/update-user-progress.json';
EXEC #UpdateActionID 'LearnWorlds - Get User Certificates', '49C7433E-F36B-1410-8DB6-00021F8B792E', 'E1234567-8901-2345-6789-012345678901', 'Generated UUID';
EXEC #UpdateActionID 'LearnWorlds - Issue Certificate', '49C7433E-F36B-1410-8DB6-00021F8B792E', 'E2234567-8901-2345-6789-012345678902', 'Generated UUID';
EXEC #UpdateActionID 'LearnWorlds - Get Course Analytics', '49C7433E-F36B-1410-8DB6-00021F8B792E', '72C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/learnworlds/get-course-analytics.json';

-- QuickBooks Actions
EXEC #UpdateActionID 'QuickBooks - Create Journal Entry', '55C7433E-F36B-1410-8DB6-00021F8B792E', '9DC7433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/quickbooks/create-journal-entry.json';
EXEC #UpdateActionID 'QuickBooks - Create GL Account', '55C7433E-F36B-1410-8DB6-00021F8B792E', 'E3234567-8901-2345-6789-012345678903', 'Generated UUID';
EXEC #UpdateActionID 'QuickBooks - Get Account Balance', '55C7433E-F36B-1410-8DB6-00021F8B792E', '81C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/quickbooks/get-account-balances.json';
EXEC #UpdateActionID 'QuickBooks - Get GL Transactions', '55C7433E-F36B-1410-8DB6-00021F8B792E', 'E4234567-8901-2345-6789-012345678904', 'Generated UUID';

-- Business Central Actions
EXEC #UpdateActionID 'Business Central - Get Customers', '61C7433E-F36B-1410-8DB6-00021F8B792E', '89C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/business-central/get-customers.json';
EXEC #UpdateActionID 'Business Central - Get GL Entries', '61C7433E-F36B-1410-8DB6-00021F8B792E', '8DC8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/business-central/get-general-ledger-entries.json';
EXEC #UpdateActionID 'Business Central - Get GL Accounts', '61C7433E-F36B-1410-8DB6-00021F8B792E', '91C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/business-central/get-gl-accounts.json';
EXEC #UpdateActionID 'Business Central - Get Sales Invoices', '61C7433E-F36B-1410-8DB6-00021F8B792E', '95C8433E-F36B-1410-8DB6-00021F8B792E', 'Metadata: actions/business-central/get-sales-invoices.json';

DROP PROCEDURE #UpdateActionID;

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
PRINT 'Fixed: 36 TemplateParams, 2 AIPromptCategories, 42 Actions';
PRINT '=======================================';