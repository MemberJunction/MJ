/*
   Add AgentRunID column to ConversationDetail table to track which specific agent run
   generated each conversation detail record. This enables linking back to the full
   agent run history and metrics.
*/

-- Add AgentRunID column (nullable, UNIQUEIDENTIFIER to match AIAgentRun.ID)
ALTER TABLE ${flyway:defaultSchema}.ConversationDetail
ADD AgentRunID UNIQUEIDENTIFIER NULL;
GO

-- Add foreign key to AIAgentRun table
ALTER TABLE ${flyway:defaultSchema}.ConversationDetail
ADD CONSTRAINT FK_ConversationDetail_AIAgentRun
    FOREIGN KEY (AgentRunID) REFERENCES ${flyway:defaultSchema}.AIAgentRun(ID);
GO
  


  