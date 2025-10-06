/*
   Migration: Add Mentions field to Conversation Details
   Version: v2.105.x
   Date: 2025-10-06

   Description:
   - Adds Mentions field to store @mention metadata (agents and users)
   - Format: JSON array of mention objects [{type, id, name}]
*/

-- Add Mentions column to Conversation Details
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
ADD [Mentions] NVARCHAR(MAX) NULL;

-- Add description for the new column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of mentions in this message. Format: [{"type": "agent|user", "id": "uuid", "name": "Display Name"}]',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetail',
    @level2type = N'COLUMN', @level2name = 'Mentions';
