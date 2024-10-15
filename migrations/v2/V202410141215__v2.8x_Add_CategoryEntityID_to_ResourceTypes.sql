ALTER TABLE ${flyway:defaultSchema}.ResourceType
ADD CategoryEntityID uniqueidentifier NULL;

-- Now, add the foreign key constraint linking CategoryEntityID to ${flyway:defaultSchema}.Entity.ID
ALTER TABLE ${flyway:defaultSchema}.ResourceType
ADD CONSTRAINT FK_ResourceType_CategoryEntityID
FOREIGN KEY (CategoryEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID);

-- Add a description for the FolderEntityID column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Nullable foreign key to the ID column in Entities entity, representing the category entity. ASSUMPTION: If provided, the assumption is there is a self-referencing/recursive foreign key establishing a hierarchy within the Category Entity, commonly called ParentID, but it can be named anything.',
    @level0type = N'Schema',
    @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',
    @level1name = N'ResourceType',
    @level2type = N'Column',
    @level2name = N'CategoryEntityID';

GO

/**
   NOW, add values to the ResourceType.CategoryEntityID column for the resources that support it
**/
UPDATE
  ${flyway:defaultSchema}.ResourceType
SET
  __mj_UpdatedAt=GETUTCDATE(),
  CategoryEntityID = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name='User View Categories')
WHERE
  Name='User Views'

UPDATE
  ${flyway:defaultSchema}.ResourceType
SET
  __mj_UpdatedAt=GETUTCDATE(),
  CategoryEntityID = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name='Dashboard Categories')
WHERE
  Name='Dashboards'

UPDATE
  ${flyway:defaultSchema}.ResourceType
SET
  __mj_UpdatedAt=GETUTCDATE(),
  CategoryEntityID = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name='Report Categories')
WHERE
  Name='Reports'


UPDATE
  ${flyway:defaultSchema}.ResourceType
SET
  __mj_UpdatedAt=GETUTCDATE(),
  CategoryEntityID = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name='Query Categories')
WHERE
  Name='Queries'


UPDATE
  ${flyway:defaultSchema}.ResourceType
SET
  __mj_UpdatedAt=GETUTCDATE(),
  CategoryEntityID = (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name='List Categories')
WHERE
  Name='Lists'



/****** UPDATE OTHER METADATA ********/
UPDATE ${flyway:defaultSchema}.Entity SET Icon='fa-solid fa-table-cells' WHERE Name ='User Views'


INSERT INTO ${flyway:defaultSchema}.EntityPermission
(RoleID, EntityID, CanRead, CanCreate,CanUpdate,CanDelete )
VALUES
(
 (SELECT ID FROM ${flyway:defaultSchema}.vwRoles WHERE Name='UI'),
 (SELECT ID FROM ${flyway:defaultSchema}.vwEntities WHERE Name='AI Prompts'),
 1,
 0,
 0,
 0
)


INSERT INTO ${flyway:defaultSchema}.EntityPermission
(RoleID, EntityID, CanRead, CanCreate,CanUpdate,CanDelete )
VALUES
(
 (SELECT ID FROM ${flyway:defaultSchema}.vwRoles WHERE Name='UI'),
 (SELECT ID FROM ${flyway:defaultSchema}.vwEntities WHERE Name='AI Prompt Types'),
 1,
 0,
 0,
 0
)

INSERT INTO ${flyway:defaultSchema}.EntityPermission
(RoleID, EntityID, CanRead, CanCreate,CanUpdate,CanDelete )
VALUES
(
 (SELECT ID FROM ${flyway:defaultSchema}.vwRoles WHERE Name='UI'),
 (SELECT ID FROM ${flyway:defaultSchema}.vwEntities WHERE Name='AI Prompt Categories'),
 1,
 0,
 0,
 0
)
