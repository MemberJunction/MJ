-- Add __mj_CreatedAt and __mj_UpdatedAt columns to all 4 archive tables.
-- Using single-statement ADD with NOT NULL DEFAULT to avoid transaction isolation issues.
-- CodeGen normally generates a multi-step ADD NULL/UPDATE/ALTER NOT NULL pattern,
-- but Skyway wraps each migration in a single transaction, which prevents the UPDATE
-- from seeing the newly-added column. This approach is functionally equivalent.

ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration]
  ADD [__mj_CreatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_ArchiveConfiguration___mj_CreatedAt] DEFAULT GETUTCDATE(),
      [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_ArchiveConfiguration___mj_UpdatedAt] DEFAULT GETUTCDATE();

ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun]
  ADD [__mj_CreatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_ArchiveRun___mj_CreatedAt] DEFAULT GETUTCDATE(),
      [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_ArchiveRun___mj_UpdatedAt] DEFAULT GETUTCDATE();

ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail]
  ADD [__mj_CreatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_ArchiveRunDetail___mj_CreatedAt] DEFAULT GETUTCDATE(),
      [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_ArchiveRunDetail___mj_UpdatedAt] DEFAULT GETUTCDATE();

ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
  ADD [__mj_CreatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_ArchiveConfigurationEntity___mj_CreatedAt] DEFAULT GETUTCDATE(),
      [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_ArchiveConfigurationEntity___mj_UpdatedAt] DEFAULT GETUTCDATE();
