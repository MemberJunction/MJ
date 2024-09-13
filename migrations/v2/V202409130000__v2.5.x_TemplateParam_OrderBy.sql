-- Add OrderBy to the __mj.TemplateParam table
ALTER TABLE __mj.TemplateParam ADD OrderBy NVARCHAR(MAX) NULL;

-- Add MS_Description for the new OrderBy column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'This field is used only when the Type of the TemplateParam table is "Entity". It is an optional field used to specify the sorting order for the related entity data that is used in the template for the Entity specified.', 
    @level0type = N'Schema', @level0name = '__mj',
    @level1type = N'Table',  @level1name = 'TemplateParam', 
    @level2type = N'Column', @level2name = 'OrderBy';
