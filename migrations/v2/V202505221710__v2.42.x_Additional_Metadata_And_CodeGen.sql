-- Add Thumbnail field to ${flyway:defaultSchema}.Report table
ALTER TABLE [${flyway:defaultSchema}].[Report]
ADD [Thumbnail] nvarchar(max) NULL;

-- Add Thumbnail field to ${flyway:defaultSchema}.UserView table
ALTER TABLE [${flyway:defaultSchema}].[UserView]
ADD [Thumbnail] nvarchar(max) NULL;

-- Add multiple fields to ${flyway:defaultSchema}.Entity table in single ALTER TABLE statement

ALTER TABLE [${flyway:defaultSchema}].[Entity]
ADD [AutoRowCountFrequency] int NULL,
    [RowCount] bigint NULL,
    [RowCountRunAt] datetimeoffset(7) NULL,
    [Status] nvarchar(25) NOT NULL DEFAULT N'Active',
    CONSTRAINT [CK_Entity_Status] CHECK ([Status] IN (N'Active', N'Deprecated', N'Disabled'));


