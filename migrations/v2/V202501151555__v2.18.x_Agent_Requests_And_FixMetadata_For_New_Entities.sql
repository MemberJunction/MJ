-- FIX UP METADATA from prior poor naming generation

-- Update the Name for AIAgent Actions
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Actions'
WHERE ID = '196B0316-6078-47A4-94B9-44A2FC5E8A55';

-- Update the Name for AIAgent Learning Cycles
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Learning Cycles'
WHERE ID = '96A815C7-49E4-4794-8739-DC5A2D3B2D9C';

-- Update the Name for AIAgent Models
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Models'
WHERE ID = '785C70B0-A456-4844-AF74-03AB8B55F633';

-- Update the Name for AIAgent Note Types
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Note Types'
WHERE ID = '9538A453-8EA3-444E-AAA8-0A5EC806A5A7';

-- Update the Name for AIAgent Notes
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Notes'
WHERE ID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6';

-- Update the Name for AIAgents
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agents'
WHERE ID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1';





CREATE TABLE ${flyway:defaultSchema}.AIAgentRequest (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(), -- Primary key with UUID defaulting to NEWSEQUENTIALID
    AgentID UNIQUEIDENTIFIER NOT NULL, -- Foreign key referencing AIAgent.ID
    RequestedAt DATETIME NOT NULL, -- When the agent made the request
    RequestForUserID UNIQUEIDENTIFIER NULL, -- optional, user the AI is sending the request to
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Requested', 'Approved', 'Rejected', 'Canceled')), -- Status of the request
    Request NVARCHAR(MAX) NOT NULL, -- Details of what the agent is asking
    Response NVARCHAR(MAX) NULL, -- Response from the human
    ResponseByUserID UNIQUEIDENTIFIER NULL, -- the user who responded
    RespondedAt DATETIME NULL, -- When the human responded
    Comments NVARCHAR(MAX) NULL, -- Optional: additional notes or comments about the request
    CONSTRAINT FK_AIAgentRequest_AIAgent FOREIGN KEY (AgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID), -- Foreign key to AIAgent.ID
    CONSTRAINT FK_AIAgentRequest_RequestForUserID FOREIGN KEY (RequestForUserID) REFERENCES ${flyway:defaultSchema}.[User](ID), -- Foreign key to User.ID
    CONSTRAINT FK_AIAgentRequest_ResponseByUserID FOREIGN KEY (ResponseByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID) -- Foreign key to User.ID
);
-- Add extended property for the table
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Table to log AI Agent requests, responses, and their statuses.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest';

-- Add extended properties for each column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Primary key for the AIAgentRequest table, uniquely identifies each record.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'ID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Foreign key referencing the ID column in the AIAgent table.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'AgentID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Timestamp when the request was made by the agent.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'RequestedAt';

  EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Optional, a user that the AI specifically is directing the request to, if null intended for general system owner.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'RequestForUserID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Current status of the request (Requested, Approved, Rejected, Canceled).', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Details of what the AI Agent is requesting.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'Request';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Response provided by the human to the agent request.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'Response';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Timestamp when the response was provided by the human.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'RespondedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Populated when a user responds indicating which user responded to the request.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'ResponseByUserID';


EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Additional comments about the request. Not shared with the agent, purely record keeping.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRequest',
    @level2type = N'COLUMN', @level2name = N'Comments';
GO
