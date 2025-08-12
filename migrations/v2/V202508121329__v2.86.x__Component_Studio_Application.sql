-- =====================================================
-- Migration: Component Studio Application and Dashboard
-- Version: 2.86.x
-- Description: Creates Component Studio application for component discovery, testing, and management
--              with associated dashboard and entity permissions
-- =====================================================

-- =====================================================
-- SECTION 1: Create Component Studio Application
-- =====================================================
DECLARE @AppID UNIQUEIDENTIFIER = 'ADDAD2F1-BA9A-442C-A08A-6E461F60985B';
DECLARE @AdminAppID UNIQUEIDENTIFIER = 'eba5ccec-6a37-ef11-86d4-000d3a4e707e'; -- Admin app ID from existing data

-- Check if application already exists and delete if it does (for re-running migration)
IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Application WHERE ID = @AppID)
BEGIN
    -- Delete existing ApplicationEntity records
    DELETE FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = @AppID;
    
    -- Delete the application
    DELETE FROM ${flyway:defaultSchema}.Application WHERE ID = @AppID;
END

-- Insert Component Studio application
INSERT INTO ${flyway:defaultSchema}.Application (ID, Name, Description, Icon, DefaultForNewUser)
VALUES (@AppID, N'Component Studio', N'Discover, test, and manage reusable components across your organization', N'fa-solid fa-puzzle-piece', 1);

-- =====================================================
-- SECTION 2: Link Entities to Component Studio Application
-- =====================================================

-- Get entity IDs we need to link
DECLARE @ComponentEntityID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'MJ: Components');
DECLARE @ComponentRegistryEntityID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'MJ: Component Registries');
DECLARE @ComponentLibraryEntityID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'MJ: Component Libraries');
DECLARE @ComponentDependencyEntityID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'MJ: Component Dependencies');
DECLARE @ComponentLibraryLinkEntityID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'MJ: Component Library Links');

-- Also add some useful MJ system entities
DECLARE @ApplicationEntityID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Applications');
DECLARE @EntityEntityID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entities');

-- Insert ApplicationEntity records for Component Studio
-- Components (main entity) - show by default
IF @ComponentEntityID IS NOT NULL
BEGIN
    INSERT INTO ${flyway:defaultSchema}.ApplicationEntity (ID, ApplicationID, EntityID, Sequence, DefaultForNewUser)
    VALUES ('40770173-3C82-4549-A523-2D5651560BC9', @AppID, @ComponentEntityID, 10, 1);
END

-- Component Registries - show by default
IF @ComponentRegistryEntityID IS NOT NULL
BEGIN
    INSERT INTO ${flyway:defaultSchema}.ApplicationEntity (ID, ApplicationID, EntityID, Sequence, DefaultForNewUser)
    VALUES ('2A966442-33A2-425D-B2D1-B9EF21567197', @AppID, @ComponentRegistryEntityID, 20, 1);
END

-- Component Libraries - show by default
IF @ComponentLibraryEntityID IS NOT NULL
BEGIN
    INSERT INTO ${flyway:defaultSchema}.ApplicationEntity (ID, ApplicationID, EntityID, Sequence, DefaultForNewUser)
    VALUES ('BD282765-C970-4ECA-AB21-2D3FFBEAB673', @AppID, @ComponentLibraryEntityID, 30, 1);
END

-- Component Dependencies - hidden by default
IF @ComponentDependencyEntityID IS NOT NULL
BEGIN
    INSERT INTO ${flyway:defaultSchema}.ApplicationEntity (ID, ApplicationID, EntityID, Sequence, DefaultForNewUser)
    VALUES ('3129C8D7-12F7-4545-8527-FEB56567B67F', @AppID, @ComponentDependencyEntityID, 40, 0);
END

-- Component Library Links - hidden by default
IF @ComponentLibraryLinkEntityID IS NOT NULL
BEGIN
    INSERT INTO ${flyway:defaultSchema}.ApplicationEntity (ID, ApplicationID, EntityID, Sequence, DefaultForNewUser)
    VALUES ('9F9E6741-1B0F-484A-9081-EB340A5315D4', @AppID, @ComponentLibraryLinkEntityID, 50, 0);
END

-- Applications entity - useful for settings
IF @ApplicationEntityID IS NOT NULL
BEGIN
    INSERT INTO ${flyway:defaultSchema}.ApplicationEntity (ID, ApplicationID, EntityID, Sequence, DefaultForNewUser)
    VALUES ('45194711-CFD9-4013-A530-DCD7F90FBBFE', @AppID, @ApplicationEntityID, 100, 0);
END

-- Entities entity - useful for understanding data requirements
IF @EntityEntityID IS NOT NULL
BEGIN
    INSERT INTO ${flyway:defaultSchema}.ApplicationEntity (ID, ApplicationID, EntityID, Sequence, DefaultForNewUser)
    VALUES ('D988438F-610F-4BBA-A4A7-598F0EA67E7C', @AppID, @EntityEntityID, 110, 0);
END

-- =====================================================
-- SECTION 3: Create Dashboard Record
-- =====================================================
DECLARE @DashboardID UNIQUEIDENTIFIER = 'C479F2E9-774B-4432-9513-5BE640B7F0AF';
DECLARE @DashboardCategoryID UNIQUEIDENTIFIER;

-- Get or create a dashboard category for Component Management
SELECT @DashboardCategoryID = ID FROM ${flyway:defaultSchema}.DashboardCategory 
WHERE Name = 'Development Tools';

-- If category doesn't exist, create it
DECLARE @SystemUserID UNIQUEIDENTIFIER;
SELECT @SystemUserID=ID FROM ${flyway:defaultSchema}.vwUsers WHERE Name='System'

IF @DashboardCategoryID IS NULL
BEGIN
    SET @DashboardCategoryID = '40B050C6-1666-4ED0-9F45-5BD468C52FDA';
    INSERT INTO ${flyway:defaultSchema}.DashboardCategory (ID, Name, Description, ParentID, UserID)
    VALUES (@DashboardCategoryID, N'Development Tools', N'Tools for developers and system administrators', NULL, @SystemUserID);
END
 

-- Insert the Component Viewer Dashboard
INSERT INTO ${flyway:defaultSchema}.Dashboard (
    ID, 
    Name, 
    Description, 
    ApplicationID,
    CategoryID,
    DriverClass,
	UIConfigDetails,
	UserID,
    Type
)
VALUES (
    @DashboardID,
    N'Component Studio',
    N'Browse, preview, and test reusable components from your component registry',
    @AppID,
    @DashboardCategoryID,
    'ComponentStudioDashboard',
	'',
	@SystemUserID,
    'Code'
);
 