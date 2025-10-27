/*
   Description: Temporarily disable Record Changes tracking for Conversations entity

   Context: The spDeleteConversation procedure has CASCADE UPDATE operations that
   call update stored procedures, which return result sets. This causes issues with
   the TypeScript wrapper that tries to capture results for record change tracking.

   This is a temporary fix while we implement a proper solution (generating
   spUpdate_Core procedures or using direct UPDATE statements in DELETE procedures).

   Related: ConversationDeletionIssue.md
*/

-- Disable Record Changes tracking for Conversations entity
UPDATE ${flyway:defaultSchema}.Entity
SET TrackRecordChanges = 0
WHERE ID = '13248F34-2837-EF11-86D4-6045BDEE16E6'

GO
