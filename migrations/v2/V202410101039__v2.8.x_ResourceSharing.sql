/****
Create ResourcePermission table - which will result in the creation of a Resource Shares entity when we run CodeGen. This will be used for sharing information for any resource type
****/
CREATE TABLE ${flyway:defaultSchema}.ResourcePermission (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),

    ResourceTypeID UNIQUEIDENTIFIER NOT NULL, -- Foreign key to ResourceType table
    CONSTRAINT FK_ResourceTypeID FOREIGN KEY (ResourceTypeID) REFERENCES ${flyway:defaultSchema}.ResourceType(ID),

    ResourceRecordID NVARCHAR(255) NOT NULL,  -- The specific resource being shared
    Type NVARCHAR(10) CHECK (Type IN ('Role', 'User')) NOT NULL, -- Defines if shared with a role or a user
    StartSharingAt DATETIMEOFFSET NULL,       -- Optional: When sharing starts
    EndSharingAt DATETIMEOFFSET NULL,         -- Optional: When sharing ends
    
    RoleID UNIQUEIDENTIFIER NULL,             -- Nullable, required if Type == 'Role'
    CONSTRAINT FK_RoleID FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.[Role](ID),

    UserID UNIQUEIDENTIFIER NULL,             -- Nullable, required if Type == 'User'
    CONSTRAINT FK_UserID FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    
    -- PermissionLevel constraint
    PermissionLevel NVARCHAR(20) NULL,       
    -- PermissionLevel constraint limiting values
    CONSTRAINT CK_PermissionLevel CHECK (PermissionLevel IN ('View', 'Edit', 'Owner')),

    -- Foreign Key Constraints

    -- Check Constraints for RoleID and UserID based on Type
    CONSTRAINT CK_RoleID_UserID CHECK (
        (Type = 'Role' AND RoleID IS NOT NULL AND UserID IS NULL) OR 
        (Type = 'User' AND UserID IS NOT NULL AND RoleID IS NULL)
    )
);

-- Add extended properties for table and columns
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Table for managing sharing of resources to users or roles with time constraints and permission levels', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourcePermission';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Reference to the type of resource being shared (View, Dashboard, Report, etc.)', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourcePermission', 
    @level2type = N'COLUMN', @level2name = N'ResourceTypeID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'ID of the specific resource being shared', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourcePermission', 
    @level2type = N'COLUMN', @level2name = N'ResourceRecordID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Optional: Date when sharing starts', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourcePermission', 
    @level2type = N'COLUMN', @level2name = N'StartSharingAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Optional: Date when sharing ends', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourcePermission', 
    @level2type = N'COLUMN', @level2name = N'EndSharingAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'The level of sharing either Role or User', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourcePermission', 
    @level2type = N'COLUMN', @level2name = N'Type';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Permission level defining the type of access (View, Edit, Owner)', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'ResourcePermission', 
    @level2type = N'COLUMN', @level2name = N'PermissionLevel';


