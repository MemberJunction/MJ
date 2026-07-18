-- RSU-spec §metadata modeling — an Integration's credential type "can be one or more".
-- Integration.CredentialTypeID is a single FK; this adds the additive junction
-- IntegrationCredentialType so an integration can declare MULTIPLE acceptable credential
-- types (e.g. API key OR OAuth2). Publish-no-break: the legacy single column is KEPT and
-- remains the primary/default; consumers treat the allowed set as junction ∪ legacy column.
-- CodeGen adds __mj timestamps + FK indexes — deliberately not included here.

CREATE TABLE [${flyway:defaultSchema}].[IntegrationCredentialType] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [IntegrationID] UNIQUEIDENTIFIER NOT NULL,
    [CredentialTypeID] UNIQUEIDENTIFIER NOT NULL,
    [IsPrimary] BIT NOT NULL DEFAULT 0,
    [Sequence] INT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_IntegrationCredentialType] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_IntegrationCredentialType_Integration] FOREIGN KEY ([IntegrationID]) REFERENCES [${flyway:defaultSchema}].[Integration] ([ID]),
    CONSTRAINT [FK_IntegrationCredentialType_CredentialType] FOREIGN KEY ([CredentialTypeID]) REFERENCES [${flyway:defaultSchema}].[CredentialType] ([ID]),
    CONSTRAINT [UQ_IntegrationCredentialType] UNIQUE ([IntegrationID], [CredentialTypeID])
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Junction between an Integration and the credential types it accepts (RSU-spec: one or more per integration). The legacy Integration.CredentialTypeID remains the primary/default type; the allowed set a connection-create validates against is this junction unioned with that column.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationCredentialType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this is the integration''s preferred/default credential type (mirrors the legacy Integration.CredentialTypeID). At most one row per integration should be primary.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationCredentialType',
    @level2type = N'COLUMN', @level2name = N'IsPrimary';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display/preference order of the credential types offered for this integration (lower first).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationCredentialType',
    @level2type = N'COLUMN', @level2name = N'Sequence';
GO

-- Seed: one junction row per existing Integration that already declares a credential type.
-- Data migration over tenant rows (IDs are inherently per-install; NEWID() is correct here —
-- these are NOT fixed metadata rows that must share an ID across installs).
INSERT INTO [${flyway:defaultSchema}].[IntegrationCredentialType] ([ID], [IntegrationID], [CredentialTypeID], [IsPrimary], [Sequence])
SELECT NEWID(), i.[ID], i.[CredentialTypeID], 1, 0
FROM [${flyway:defaultSchema}].[Integration] i
WHERE i.[CredentialTypeID] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[IntegrationCredentialType] j
      WHERE j.[IntegrationID] = i.[ID] AND j.[CredentialTypeID] = i.[CredentialTypeID]
  );
GO
