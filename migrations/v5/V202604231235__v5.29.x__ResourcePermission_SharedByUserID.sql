-- =====================================================================================================================
-- Migration: Add SharedByUserID to ResourcePermission
-- Version: 5.29.x
-- Description: Adds a nullable `SharedByUserID` column to `__mj.ResourcePermission`
--              so shares created via Conversation sharing (and any other resource
--              type that uses this table) can record who issued the grant. This
--              brings ResourcePermission into parity with DashboardPermission,
--              CollectionPermission, ArtifactPermission (all of which already
--              track `SharedByUserID`) and AccessControlRule (`GrantedByUserID`),
--              which is necessary for UI surfaces that show "Shared by {user}"
--              on records the current user didn't create.
-- =====================================================================================================================

ALTER TABLE [${flyway:defaultSchema}].[ResourcePermission]
    ADD [SharedByUserID] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[ResourcePermission]
    ADD CONSTRAINT [FK_ResourcePermission_SharedByUserID]
    FOREIGN KEY ([SharedByUserID])
    REFERENCES [${flyway:defaultSchema}].[User]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who granted this permission. NULL when the share pre-dates this column or when the grantor is unknown (e.g., a system-seeded permission).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ResourcePermission',
    @level2type = N'COLUMN', @level2name = N'SharedByUserID';
GO
