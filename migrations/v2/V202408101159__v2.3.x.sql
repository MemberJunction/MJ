ALTER TABLE __mj.AIModel ADD ModelSelectionInsights NVARCHAR(MAX) NULL

EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'This column stores unstructured text notes that provide insights into what the model is particularly good at and areas where it may not perform as well. These notes can be used by a human or an AI to determine if the model is a good fit for various purposes.', 
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'AIModel',
    @level2type = N'COLUMN', @level2name = N'ModelSelectionInsights';
