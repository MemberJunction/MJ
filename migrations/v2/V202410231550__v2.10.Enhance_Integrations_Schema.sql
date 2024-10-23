-- Alter the table to add new columns
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegrationRun
ADD
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    ErrorLog NVARCHAR(MAX) NULL,
    ConfigData NVARCHAR(MAX) NULL;
GO

-- Add check constraint for Status column
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegrationRun
ADD CONSTRAINT CK_CompanyIntegrationRun_Status
CHECK ([Status] IN ('Pending', 'In Progress', 'Success', 'Failed'));

-- Add extended properties for the new columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Status of the integration run. Possible values: Pending, In Progress, Success, Failed.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'CompanyIntegrationRun',
    @level2type = N'Column', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional error log information for the integration run.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'CompanyIntegrationRun',
    @level2type = N'Column', @level2name = 'ErrorLog';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional configuration data in JSON format for the request that started the integration run for audit purposes.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'CompanyIntegrationRun',
    @level2type = N'Column', @level2name = 'ConfigData';
