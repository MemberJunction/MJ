-- =============================================================================
-- Migration: Fix Entity Name References in JSON Configuration Columns
-- Version:   5.2.x
-- Purpose:   Update all JSON configuration columns that store entity names
--            to use the new "MJ: " prefixed names introduced in v5.0
--
-- Background:
--   The migration V202602131500__v5.0.x__Entity_Name_Normalization_And_ClassName_Prefix_Fix.sql
--   correctly renamed all __mj schema entities in the Entity table to use the "MJ: " prefix.
--   However, other tables that store entity names as strings inside JSON columns were NOT updated.
--   This migration fixes those references.
--
-- Affected Tables & Columns:
--   - Workspace.Configuration          (tab config with "Entity":"..." keys)
--   - WorkspaceItem.Configuration      (workspace item config)
--   - UserNotification.ResourceConfiguration (notification resource config)
--   - Dashboard.UIConfigDetails        (dashboard layout with "entityName":"..." keys)
--   - DashboardUserState.UserState     (persisted user dashboard state)
--   - Report.Configuration             (report config)
--   - ReportVersion.Configuration      (report version config)
--   - ReportUserState.ReportState      (persisted user report state)
--   - DataContextItem.SQL              (SQL text that may reference entity names)
--   - DataContextItem.DataJSON         (cached data JSON)
--   - ConversationArtifactVersion.Configuration
--   - ArtifactVersion.Configuration
--   - Application.DefaultNavItems      (nav items that may reference entity names)
--   - UserView.FilterState             (persisted filter state JSON)
--   - UserView.DisplayState            (persisted display state JSON)
--   - UserView.GridState               (persisted grid state JSON)
--   - UserView.CardState               (persisted card state JSON)
--   - UserView.SortState               (persisted sort state JSON)
--   - EntityRelationship.DisplayComponentConfiguration
--
-- JSON Patterns Updated:
--   "Entity":"OldName"     -> "Entity":"MJ: OldName"
--   "EntityName":"OldName" -> "EntityName":"MJ: OldName"
--   "entity":"OldName"     -> "entity":"MJ: OldName"
--   "entityName":"OldName" -> "entityName":"MJ: OldName"
-- =============================================================================

SET NOCOUNT ON;
GO

PRINT N'Starting Fix Entity Name References in JSON Configuration Columns migration'
GO

-- =============================================================================
-- STEP 1: Create a temporary table with entity name mappings
-- =============================================================================
PRINT N'Creating entity name mapping table'
GO

IF OBJECT_ID('tempdb..#EntityNameMapping') IS NOT NULL
    DROP TABLE #EntityNameMapping;
GO

CREATE TABLE #EntityNameMapping (
    OldName NVARCHAR(255) NOT NULL,
    NewName NVARCHAR(255) NOT NULL
);
GO

-- Insert all entity name mappings (old name -> new name with "MJ: " prefix)
INSERT INTO #EntityNameMapping (OldName, NewName) VALUES
('Action Authorizations', 'MJ: Action Authorizations'),
('Action Categories', 'MJ: Action Categories'),
('Action Context Types', 'MJ: Action Context Types'),
('Action Contexts', 'MJ: Action Contexts'),
('Action Execution Logs', 'MJ: Action Execution Logs'),
('Action Filters', 'MJ: Action Filters'),
('Action Libraries', 'MJ: Action Libraries'),
('Action Params', 'MJ: Action Params'),
('Action Result Codes', 'MJ: Action Result Codes'),
('Actions', 'MJ: Actions'),
('AI Actions', 'MJ: AI Actions'),
('AI Agent Actions', 'MJ: AI Agent Actions'),
('AI Agent Learning Cycles', 'MJ: AI Agent Learning Cycles'),
('AI Agent Models', 'MJ: AI Agent Models'),
('AI Agent Note Types', 'MJ: AI Agent Note Types'),
('AI Agent Notes', 'MJ: AI Agent Notes'),
('AI Agent Requests', 'MJ: AI Agent Requests'),
('AI Agents', 'MJ: AI Agents'),
('AI Model Actions', 'MJ: AI Model Actions'),
('AI Model Types', 'MJ: AI Model Types'),
('AI Models', 'MJ: AI Models'),
('AI Prompt Categories', 'MJ: AI Prompt Categories'),
('AI Prompt Types', 'MJ: AI Prompt Types'),
('AI Prompts', 'MJ: AI Prompts'),
('AI Result Cache', 'MJ: AI Result Cache'),
('Application Entities', 'MJ: Application Entities'),
('Application Settings', 'MJ: Application Settings'),
('Applications', 'MJ: Applications'),
('Audit Log Types', 'MJ: Audit Log Types'),
('Audit Logs', 'MJ: Audit Logs'),
('Authorization Roles', 'MJ: Authorization Roles'),
('Authorizations', 'MJ: Authorizations'),
('Communication Base Message Types', 'MJ: Communication Base Message Types'),
('Communication Logs', 'MJ: Communication Logs'),
('Communication Provider Message Types', 'MJ: Communication Provider Message Types'),
('Communication Providers', 'MJ: Communication Providers'),
('Communication Runs', 'MJ: Communication Runs'),
('Companies', 'MJ: Companies'),
('Company Integration Record Maps', 'MJ: Company Integration Record Maps'),
('Company Integration Run API Logs', 'MJ: Company Integration Run API Logs'),
('Company Integration Run Details', 'MJ: Company Integration Run Details'),
('Company Integration Runs', 'MJ: Company Integration Runs'),
('Company Integrations', 'MJ: Company Integrations'),
('Content File Types', 'MJ: Content File Types'),
('Content Item Attributes', 'MJ: Content Item Attributes'),
('Content Item Tags', 'MJ: Content Item Tags'),
('Content Items', 'MJ: Content Items'),
('Content Process Runs', 'MJ: Content Process Runs'),
('Content Source Params', 'MJ: Content Source Params'),
('Content Source Type Params', 'MJ: Content Source Type Params'),
('Content Source Types', 'MJ: Content Source Types'),
('Content Sources', 'MJ: Content Sources'),
('Content Type Attributes', 'MJ: Content Type Attributes'),
('Content Types', 'MJ: Content Types'),
('Conversation Details', 'MJ: Conversation Details'),
('Conversations', 'MJ: Conversations'),
('Dashboard Categories', 'MJ: Dashboard Categories'),
('Dashboards', 'MJ: Dashboards'),
('Data Context Items', 'MJ: Data Context Items'),
('Data Contexts', 'MJ: Data Contexts'),
('Dataset Items', 'MJ: Dataset Items'),
('Datasets', 'MJ: Datasets'),
('Duplicate Run Detail Matches', 'MJ: Duplicate Run Detail Matches'),
('Duplicate Run Details', 'MJ: Duplicate Run Details'),
('Duplicate Runs', 'MJ: Duplicate Runs'),
('Employee Company Integrations', 'MJ: Employee Company Integrations'),
('Employee Roles', 'MJ: Employee Roles'),
('Employee Skills', 'MJ: Employee Skills'),
('Employees', 'MJ: Employees'),
('Entities', 'MJ: Entities'),
('Entity Action Filters', 'MJ: Entity Action Filters'),
('Entity Action Invocation Types', 'MJ: Entity Action Invocation Types'),
('Entity Action Invocations', 'MJ: Entity Action Invocations'),
('Entity Action Params', 'MJ: Entity Action Params'),
('Entity Actions', 'MJ: Entity Actions'),
('Entity AI Actions', 'MJ: Entity AI Actions'),
('Entity Communication Fields', 'MJ: Entity Communication Fields'),
('Entity Communication Message Types', 'MJ: Entity Communication Message Types'),
('Entity Document Runs', 'MJ: Entity Document Runs'),
('Entity Document Settings', 'MJ: Entity Document Settings'),
('Entity Document Types', 'MJ: Entity Document Types'),
('Entity Documents', 'MJ: Entity Documents'),
('Entity Field Values', 'MJ: Entity Field Values'),
('Entity Fields', 'MJ: Entity Fields'),
('Entity Permissions', 'MJ: Entity Permissions'),
('Entity Record Documents', 'MJ: Entity Record Documents'),
('Entity Relationship Display Components', 'MJ: Entity Relationship Display Components'),
('Entity Relationships', 'MJ: Entity Relationships'),
('Entity Settings', 'MJ: Entity Settings'),
('Error Logs', 'MJ: Error Logs'),
('Explorer Navigation Items', 'MJ: Explorer Navigation Items'),
('File Categories', 'MJ: File Categories'),
('File Entity Record Links', 'MJ: File Entity Record Links'),
('File Storage Providers', 'MJ: File Storage Providers'),
('Files', 'MJ: Files'),
('Generated Code Categories', 'MJ: Generated Code Categories'),
('Generated Codes', 'MJ: Generated Codes'),
('Integration URL Formats', 'MJ: Integration URL Formats'),
('Integrations', 'MJ: Integrations'),
('Libraries', 'MJ: Libraries'),
('Library Items', 'MJ: Library Items'),
('List Categories', 'MJ: List Categories'),
('List Details', 'MJ: List Details'),
('Lists', 'MJ: Lists'),
('Output Delivery Types', 'MJ: Output Delivery Types'),
('Output Format Types', 'MJ: Output Format Types'),
('Output Trigger Types', 'MJ: Output Trigger Types'),
('Queries', 'MJ: Queries'),
('Query Categories', 'MJ: Query Categories'),
('Query Entities', 'MJ: Query Entities'),
('Query Fields', 'MJ: Query Fields'),
('Query Permissions', 'MJ: Query Permissions'),
('Queue Tasks', 'MJ: Queue Tasks'),
('Queue Types', 'MJ: Queue Types'),
('Queues', 'MJ: Queues'),
('Recommendation Items', 'MJ: Recommendation Items'),
('Recommendation Providers', 'MJ: Recommendation Providers'),
('Recommendation Runs', 'MJ: Recommendation Runs'),
('Recommendations', 'MJ: Recommendations'),
('Record Change Replay Runs', 'MJ: Record Change Replay Runs'),
('Record Changes', 'MJ: Record Changes'),
('Record Merge Deletion Logs', 'MJ: Record Merge Deletion Logs'),
('Record Merge Logs', 'MJ: Record Merge Logs'),
('Report Categories', 'MJ: Report Categories'),
('Report Snapshots', 'MJ: Report Snapshots'),
('Reports', 'MJ: Reports'),
('Resource Links', 'MJ: Resource Links'),
('Resource Permissions', 'MJ: Resource Permissions'),
('Resource Types', 'MJ: Resource Types'),
('Roles', 'MJ: Roles'),
('Row Level Security Filters', 'MJ: Row Level Security Filters'),
('Scheduled Action Params', 'MJ: Scheduled Action Params'),
('Scheduled Actions', 'MJ: Scheduled Actions'),
('Schema Info', 'MJ: Schema Info'),
('Skills', 'MJ: Skills'),
('Tagged Items', 'MJ: Tagged Items'),
('Tags', 'MJ: Tags'),
('Template Categories', 'MJ: Template Categories'),
('Template Content Types', 'MJ: Template Content Types'),
('Template Contents', 'MJ: Template Contents'),
('Template Params', 'MJ: Template Params'),
('Templates', 'MJ: Templates'),
('User Application Entities', 'MJ: User Application Entities'),
('User Applications', 'MJ: User Applications'),
('User Favorites', 'MJ: User Favorites'),
('User Notifications', 'MJ: User Notifications'),
('User Record Logs', 'MJ: User Record Logs'),
('User Roles', 'MJ: User Roles'),
('User View Categories', 'MJ: User View Categories'),
('User View Run Details', 'MJ: User View Run Details'),
('User View Runs', 'MJ: User View Runs'),
('User Views', 'MJ: User Views'),
('Users', 'MJ: Users'),
('Vector Databases', 'MJ: Vector Databases'),
('Vector Indexes', 'MJ: Vector Indexes'),
('Version Installations', 'MJ: Version Installations'),
('Workflow Engines', 'MJ: Workflow Engines'),
('Workflow Runs', 'MJ: Workflow Runs'),
('Workflows', 'MJ: Workflows'),
('Workspace Items', 'MJ: Workspace Items'),
('Workspaces', 'MJ: Workspaces');
GO

DECLARE @MappingCount INT;
SELECT @MappingCount = COUNT(*) FROM #EntityNameMapping;
PRINT N'Entity name mapping table created with ' + CAST(@MappingCount AS NVARCHAR(10)) + ' mappings'
GO

-- =============================================================================
-- STEP 2: Create a reusable helper procedure for updating entity name
--         references in a given table/column. This avoids repeating the same
--         cursor logic for every table.
-- =============================================================================
PRINT N'Creating helper procedure for entity name replacement'
GO

IF OBJECT_ID('tempdb..#UpdateEntityRefsInColumn') IS NOT NULL
    EXEC('DROP PROCEDURE #UpdateEntityRefsInColumn');
GO

CREATE PROCEDURE #UpdateEntityRefsInColumn
    @SchemaName NVARCHAR(128),
    @TableName  NVARCHAR(128),
    @ColumnName NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    -- Verify the table and column exist before proceeding
    IF NOT EXISTS (
        SELECT 1
        FROM sys.columns c
        JOIN sys.tables t ON c.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = @SchemaName AND t.name = @TableName AND c.name = @ColumnName
    )
    BEGIN
        PRINT N'  SKIPPED: ' + @SchemaName + '.' + @TableName + '.' + @ColumnName + ' does not exist'
        RETURN
    END

    DECLARE @OldName NVARCHAR(255), @NewName NVARCHAR(255);
    DECLARE @UpdateCount INT = 0;
    DECLARE @SQL NVARCHAR(MAX);

    DECLARE entity_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT OldName, NewName FROM #EntityNameMapping;

    OPEN entity_cursor;
    FETCH NEXT FROM entity_cursor INTO @OldName, @NewName;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Pattern 1: "Entity":"OldName"
        SET @SQL = N'UPDATE ' + QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName) +
            N' SET ' + QUOTENAME(@ColumnName) + N' = REPLACE(' + QUOTENAME(@ColumnName) +
            N', ''"Entity":"'' + @pOld + ''"'', ''"Entity":"'' + @pNew + ''"'')' +
            N' WHERE ' + QUOTENAME(@ColumnName) + N' LIKE ''%"Entity":"'' + @pOld + ''"%''';
        EXEC sp_executesql @SQL, N'@pOld NVARCHAR(255), @pNew NVARCHAR(255)', @OldName, @NewName;
        SET @UpdateCount = @UpdateCount + @@ROWCOUNT;

        -- Pattern 2: "EntityName":"OldName"
        SET @SQL = N'UPDATE ' + QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName) +
            N' SET ' + QUOTENAME(@ColumnName) + N' = REPLACE(' + QUOTENAME(@ColumnName) +
            N', ''"EntityName":"'' + @pOld + ''"'', ''"EntityName":"'' + @pNew + ''"'')' +
            N' WHERE ' + QUOTENAME(@ColumnName) + N' LIKE ''%"EntityName":"'' + @pOld + ''"%''';
        EXEC sp_executesql @SQL, N'@pOld NVARCHAR(255), @pNew NVARCHAR(255)', @OldName, @NewName;
        SET @UpdateCount = @UpdateCount + @@ROWCOUNT;

        -- Pattern 3: "entity":"OldName" (lowercase key)
        SET @SQL = N'UPDATE ' + QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName) +
            N' SET ' + QUOTENAME(@ColumnName) + N' = REPLACE(' + QUOTENAME(@ColumnName) +
            N', ''"entity":"'' + @pOld + ''"'', ''"entity":"'' + @pNew + ''"'')' +
            N' WHERE ' + QUOTENAME(@ColumnName) + N' LIKE ''%"entity":"'' + @pOld + ''"%''';
        EXEC sp_executesql @SQL, N'@pOld NVARCHAR(255), @pNew NVARCHAR(255)', @OldName, @NewName;
        SET @UpdateCount = @UpdateCount + @@ROWCOUNT;

        -- Pattern 4: "entityName":"OldName" (camelCase key, used by dashboard panels)
        SET @SQL = N'UPDATE ' + QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName) +
            N' SET ' + QUOTENAME(@ColumnName) + N' = REPLACE(' + QUOTENAME(@ColumnName) +
            N', ''"entityName":"'' + @pOld + ''"'', ''"entityName":"'' + @pNew + ''"'')' +
            N' WHERE ' + QUOTENAME(@ColumnName) + N' LIKE ''%"entityName":"'' + @pOld + ''"%''';
        EXEC sp_executesql @SQL, N'@pOld NVARCHAR(255), @pNew NVARCHAR(255)', @OldName, @NewName;
        SET @UpdateCount = @UpdateCount + @@ROWCOUNT;

        FETCH NEXT FROM entity_cursor INTO @OldName, @NewName;
    END

    CLOSE entity_cursor;
    DEALLOCATE entity_cursor;

    PRINT N'  ' + @SchemaName + '.' + @TableName + '.' + @ColumnName + ': Updated ' + CAST(@UpdateCount AS NVARCHAR(10)) + ' rows'
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- =============================================================================
-- STEP 3: Run the updates for all affected tables/columns
-- =============================================================================

-- ---- Workspace & WorkspaceItem ----
PRINT N'Updating Workspace tables...'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'Workspace', 'Configuration'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'WorkspaceItem', 'Configuration'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- ---- UserNotification ----
PRINT N'Updating UserNotification...'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'UserNotification', 'ResourceConfiguration'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- ---- Dashboard & DashboardUserState ----
PRINT N'Updating Dashboard tables...'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'Dashboard', 'UIConfigDetails'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'DashboardUserState', 'UserState'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- ---- Report, ReportVersion, ReportUserState ----
PRINT N'Updating Report tables...'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'Report', 'Configuration'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'ReportVersion', 'Configuration'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'ReportUserState', 'ReportState'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- ---- DataContextItem ----
PRINT N'Updating DataContextItem...'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'DataContextItem', 'SQL'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'DataContextItem', 'DataJSON'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- ---- ConversationArtifactVersion & ArtifactVersion ----
PRINT N'Updating Artifact tables...'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'ConversationArtifactVersion', 'Configuration'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'ArtifactVersion', 'Configuration'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- ---- Application.DefaultNavItems ----
PRINT N'Updating Application...'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'Application', 'DefaultNavItems'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- ---- UserView state columns ----
PRINT N'Updating UserView state columns...'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'UserView', 'FilterState'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'UserView', 'DisplayState'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'UserView', 'GridState'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'UserView', 'CardState'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'UserView', 'SortState'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- ---- EntityRelationship ----
PRINT N'Updating EntityRelationship...'
GO
EXEC #UpdateEntityRefsInColumn '${flyway:defaultSchema}', 'EntityRelationship', 'DisplayComponentConfiguration'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- =============================================================================
-- STEP 4: Cleanup
-- =============================================================================
PRINT N'Cleaning up temporary objects'
GO

DROP TABLE #EntityNameMapping;
GO

DROP PROCEDURE #UpdateEntityRefsInColumn;
GO

PRINT N'Migration complete: Entity name references in JSON configuration columns have been updated'
GO
