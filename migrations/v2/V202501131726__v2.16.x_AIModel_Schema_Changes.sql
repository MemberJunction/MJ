-- AI Agent Table
CREATE TABLE [${flyway:defaultSchema}].[AIAgent] (
ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT (newsequentialid()),
Name NVARCHAR(255),
Description NVARCHAR(MAX),
LogoURL nvarchar(255) NULL
);


CREATE TABLE [${flyway:defaultSchema}].[AIAgentNoteType] (
ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT (newsequentialid()),
Name NVARCHAR(255),
Description NVARCHAR(MAX),
);


CREATE TABLE [${flyway:defaultSchema}].[AIAgentNote] (
ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT (newsequentialid()),
AgentID UNIQUEIDENTIFIER, 
AgentNoteTypeID UNIQUEIDENTIFIER,
Note NVARCHAR(MAX),
FOREIGN KEY (AgentID) REFERENCES [${flyway:defaultSchema}].[AIAgent](ID),
FOREIGN KEY (AgentNoteTypeID) REFERENCES [${flyway:defaultSchema}].[AIAgentNoteType](ID),
);


-- AI Agent Models Table
CREATE TABLE [${flyway:defaultSchema}].[AIAgentModel] (
ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT (newsequentialid()),
AgentID UNIQUEIDENTIFIER,
ModelID UNIQUEIDENTIFIER,
Active BIT,
Priority INT,
FOREIGN KEY (AgentID) REFERENCES [${flyway:defaultSchema}].[AIAgent](ID),
FOREIGN KEY (ModelID) REFERENCES [${flyway:defaultSchema}].[AIModel](ID)
);


-- AI Agent Actions Table
CREATE TABLE [${flyway:defaultSchema}].[AIAgentAction] (
ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT (newsequentialid()),
AgentID UNIQUEIDENTIFIER,
ActionID UNIQUEIDENTIFIER,
Status nvarchar(15) NOT NULL DEFAULT 'Active' CHECK (Status IN ('Pending','Active','Revoked')),
FOREIGN KEY (AgentID) REFERENCES [${flyway:defaultSchema}].[AIAgent](ID),
FOREIGN KEY (ActionID) REFERENCES [${flyway:defaultSchema}].[Action](ID)
);


-- Add extended properties for the table
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Table to store information about AI agents.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgent';

-- Add extended property for the ID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'The unique identifier for each AI agent. Serves as the primary key.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'ID';

-- Add extended property for the Name column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'The name of the AI agent.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'Name';

-- Add extended property for the Description column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'A detailed description of the AI agent.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'Description';

-- Add extended property for the table
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Table to store the relationship between AI agents and AI models.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentModel';

-- Add extended property for the ID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'The unique identifier for each AI agent-model mapping. Serves as the primary key.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentModel',
    @level2type = N'COLUMN', @level2name = N'ID';

-- Add extended property for the AIAgentID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'References the unique identifier of the associated AI agent from AIAgent table.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentModel',
    @level2type = N'COLUMN', @level2name = N'AgentID';

-- Add extended property for the AIModelID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'The unique identifier of the associated AI model.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentModel',
    @level2type = N'COLUMN', @level2name = N'ModelID';

-- Add extended property for the Priority column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'The priority level of the AI model for the agent, where higher values indicate higher priority.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentModel',
    @level2type = N'COLUMN', @level2name = N'Priority';

-- Add extended property for the table
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Table to store the relationship between AI agents and actions.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentAction';

-- Add extended property for the ID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'The unique identifier for each AI agent-action mapping. Serves as the primary key.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentAction',
    @level2type = N'COLUMN', @level2name = N'ID';

-- Add extended property for the AIAgentID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'References the unique identifier of the associated AI agent from the AIAgent table.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentAction',
    @level2type = N'COLUMN', @level2name = N'AgentID';

-- Add extended property for the ActionID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'References the unique identifier of the associated action from the Action table.', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentAction',
    @level2type = N'COLUMN', @level2name = N'ActionID';