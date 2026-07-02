-- Adds the Subpath column to OpenApp so the install engine can record which
-- in-repo subdirectory a multi-app repo installed an app from (e.g. 'CRM/HubSpot'
-- within MemberJunction/Integrations). NULL = the app's mj-app.json lives at the
-- repository root (the historical single-app-per-repo behavior). This is what lets
-- upgrade/remove re-fetch the correct manifest for a subpath app.

ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD
    Subpath NVARCHAR(500) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'In-repo subdirectory the app was installed from for multi-app repositories (e.g. ''CRM/HubSpot''). NULL when the app''s mj-app.json is at the repository root.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'Subpath';
GO
