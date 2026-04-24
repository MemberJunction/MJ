-- =====================================================================================================================
-- Migration: Add ON DELETE CASCADE to Dashboard child-table foreign keys
-- Version: 5.29.x
-- Description: Without ON DELETE CASCADE, deleting a Dashboard fails when any
--              DashboardPermission / DashboardCategoryLink / DashboardUserPreference /
--              DashboardUserState row references it, surfacing as
--              "DELETE statement conflicted with the REFERENCE constraint
--              FK_DashboardPermission_DashboardID" from spDeleteDashboard.
--              Each of these child tables is meaningless without its parent
--              dashboard, so cascading the delete is the correct semantics.
-- =====================================================================================================================

ALTER TABLE [${flyway:defaultSchema}].[DashboardPermission]
    DROP CONSTRAINT [FK_DashboardPermission_DashboardID];
GO

ALTER TABLE [${flyway:defaultSchema}].[DashboardPermission]
    ADD CONSTRAINT [FK_DashboardPermission_DashboardID]
    FOREIGN KEY ([DashboardID])
    REFERENCES [${flyway:defaultSchema}].[Dashboard]([ID])
    ON DELETE CASCADE;
GO

ALTER TABLE [${flyway:defaultSchema}].[DashboardCategoryLink]
    DROP CONSTRAINT [FK_DashboardCategoryLink_DashboardID];
GO

ALTER TABLE [${flyway:defaultSchema}].[DashboardCategoryLink]
    ADD CONSTRAINT [FK_DashboardCategoryLink_DashboardID]
    FOREIGN KEY ([DashboardID])
    REFERENCES [${flyway:defaultSchema}].[Dashboard]([ID])
    ON DELETE CASCADE;
GO

ALTER TABLE [${flyway:defaultSchema}].[DashboardUserPreference]
    DROP CONSTRAINT [FK_DashboardUserPreference_Dashboard];
GO

ALTER TABLE [${flyway:defaultSchema}].[DashboardUserPreference]
    ADD CONSTRAINT [FK_DashboardUserPreference_Dashboard]
    FOREIGN KEY ([DashboardID])
    REFERENCES [${flyway:defaultSchema}].[Dashboard]([ID])
    ON DELETE CASCADE;
GO

ALTER TABLE [${flyway:defaultSchema}].[DashboardUserState]
    DROP CONSTRAINT [FK_DashboardUserState_Dashboard];
GO

ALTER TABLE [${flyway:defaultSchema}].[DashboardUserState]
    ADD CONSTRAINT [FK_DashboardUserState_Dashboard]
    FOREIGN KEY ([DashboardID])
    REFERENCES [${flyway:defaultSchema}].[Dashboard]([ID])
    ON DELETE CASCADE;
GO
