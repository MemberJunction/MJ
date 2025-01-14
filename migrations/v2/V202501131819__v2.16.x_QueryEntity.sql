CREATE TABLE ${flyway:defaultSchema}.QueryEntity 
(
    ID UNIQUEIDENTIFIER PRIMARY KEY NOT NULL DEFAULT (newsequentialid()),
    QueryID UNIQUEIDENTIFIER NOT NULL,
    EntityID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT FK_QueryEntity_Query FOREIGN KEY (QueryID) REFERENCES ${flyway:defaultSchema}.Query(ID),
    CONSTRAINT FK_QueryEntity_Entity FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID)
);

-- Table-level description
EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Tracks which entities are involved in a given query. The Queries table stores SQL and descriptions for stored queries that can be executed and serve as examples for AI.', 
    @level0type = N'SCHEMA', 
    @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', 
    @level1name = N'QueryEntity';

-- Column-level descriptions
EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Unique identifier for the QueryEntity record.', 
    @level0type = N'SCHEMA', 
    @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', 
    @level1name = N'QueryEntity', 
    @level2type = N'COLUMN', 
    @level2name = N'ID';

EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'References the ID of the query in the Queries table.', 
    @level0type = N'SCHEMA', 
    @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', 
    @level1name = N'QueryEntity', 
    @level2type = N'COLUMN', 
    @level2name = N'QueryID';

EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'References the ID of the entity in the Entities table.', 
    @level0type = N'SCHEMA', 
    @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', 
    @level1name = N'QueryEntity', 
    @level2type = N'COLUMN', 
    @level2name = N'EntityID';
