-- Add documentation for the Report Thumbnail column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Thumbnail image for the report that can be displayed in gallery views. Can contain either a URL to an image file or a Base64-encoded image string.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Report',
    @level2type = N'COLUMN', @level2name = N'Thumbnail';

-- Add documentation for the UserView Thumbnail column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Thumbnail image for the user view that can be displayed in gallery views. Can contain either a URL to an image file or a Base64-encoded image string.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserView',
    @level2type = N'COLUMN', @level2name = N'Thumbnail';

-- Add documentation for the AutoRowCountFrequency column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Frequency in hours for automatically performing row counts on this entity. If NULL, automatic row counting is disabled. If greater than 0, schedules recurring SELECT COUNT(*) queries at the specified interval.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AutoRowCountFrequency';

-- Add documentation for the RowCount column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cached row count for this entity, populated by automatic row count processes when AutoRowCountFrequency is configured.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'RowCount';

-- Add documentation for the RowCountRunAt column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp indicating when the last automatic row count was performed for this entity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'RowCountRunAt';

-- Add documentation for the Status column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Status of the entity. Active: fully functional; Deprecated: functional but generates console warnings when used; Disabled: not available for use even though metadata and physical table remain.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'Status';    
 