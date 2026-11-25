-- Migration: Delete list records together with their list
-- Description: FK_ListDetail_List gets ON DELETE CASCADE, the same rule that ListShare and
--              ListInvitation already have. Deleting a List row removes its ListDetail rows
--              in one set-based statement inside the database.

ALTER TABLE [${flyway:defaultSchema}].[ListDetail] DROP CONSTRAINT [FK_ListDetail_List];
GO

ALTER TABLE [${flyway:defaultSchema}].[ListDetail] WITH CHECK ADD CONSTRAINT [FK_ListDetail_List]
    FOREIGN KEY ([ListID]) REFERENCES [${flyway:defaultSchema}].[List] ([ID]) ON DELETE CASCADE;
GO
