CREATE TABLE ${flyway:defaultSchema}.ResourceLink (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(), -- Unique ID for each resource link
    UserID UNIQUEIDENTIFIER NOT NULL, -- Foreign key to the user who is linking the resource
    ResourceTypeID UNIQUEIDENTIFIER NOT NULL, -- Foreign key to ResourceType
    ResourceRecordID NVARCHAR(255) NOT NULL, -- ID of the specific resource (acts as a flexible foreign key)
    FolderID NVARCHAR(255) NULL, -- Optional folder ID where the resource is stored in the user's organization system
    
    -- Foreign key constraints
    CONSTRAINT FK_ResourceLink_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_ResourceLink_ResourceType FOREIGN KEY (ResourceTypeID) REFERENCES ${flyway:defaultSchema}.ResourceType(ID)
);

-- Add extended properties for table and columns

-- Description of the table
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Table to track user links to shared resources such as views, dashboards, etc.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourceLink';

-- Description for ID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Unique identifier for each resource link', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourceLink', 
    @level2type = N'COLUMN', @level2name = N'ID';

-- Description for UserID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Foreign key to the user linking the resource', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourceLink', 
    @level2type = N'COLUMN', @level2name = N'UserID';

-- Description for ResourceTypeID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Foreign key to the resource type (view, dashboard, etc.)', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourceLink', 
    @level2type = N'COLUMN', @level2name = N'ResourceTypeID';

-- Description for ResourceRecordID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'ID of the specific resource being linked', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourceLink', 
    @level2type = N'COLUMN', @level2name = N'ResourceRecordID';

-- Description for FolderID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Optional folder where the user organizes the linked resource', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourceLink', 
    @level2type = N'COLUMN', @level2name = N'FolderID';
