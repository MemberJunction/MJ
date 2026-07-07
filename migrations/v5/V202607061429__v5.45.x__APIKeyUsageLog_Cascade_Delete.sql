-- Migration: APIKeyUsageLog -> APIKey ON DELETE CASCADE
-- Description: The APIKeyUsageLog.APIKeyID foreign key was created with NO ACTION,
--              which blocks deleting an APIKey once any usage-log rows exist for it.
--              spDeleteAPIKey performs a plain DELETE FROM APIKey and relies on
--              DB-level cascade for its children; the sibling child FKs
--              (APIKeyScope.APIKeyID, APIKeyApplication.APIKeyID) are already
--              ON DELETE CASCADE. This aligns APIKeyUsageLog with them.
--
-- Tradeoff: deleting an APIKey now also deletes its APIKeyUsageLog audit rows.
--
-- FK-only change: no table columns change, so no CodeGen / entity regeneration
-- is required (spDeleteAPIKey already relies on DB cascade for its children).

ALTER TABLE [${flyway:defaultSchema}].[APIKeyUsageLog]
    DROP CONSTRAINT [FK__APIKeyUsa__APIKe__56D4A469];
GO

ALTER TABLE [${flyway:defaultSchema}].[APIKeyUsageLog]
    ADD CONSTRAINT [FK__APIKeyUsa__APIKe__56D4A469]
    FOREIGN KEY ([APIKeyID]) REFERENCES [${flyway:defaultSchema}].[APIKey] ([ID])
    ON DELETE CASCADE;
GO
