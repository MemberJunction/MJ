-- Add SupportedResponseFormats column to AIModel table
ALTER TABLE ${flyway:defaultSchema}.AIModel
ADD SupportedResponseFormats NVARCHAR(100) DEFAULT 'Any' NOT NULL;

-- Add extended property for documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'A comma-delimited string indicating the supported response formats for the AI model. Options include Any, Text, Markdown, JSON, and ModelSpecific. Defaults to Any if not specified.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'AIModel',
    @level2type = N'Column', @level2name = N'SupportedResponseFormats';

-- Alter AIPrompt table to add new columns with a check constraint
ALTER TABLE ${flyway:defaultSchema}.AIPrompt
ADD ResponseFormat NVARCHAR(20) DEFAULT 'Any' NOT NULL
    CONSTRAINT CHK_AIPrompt_ResponseFormat CHECK (ResponseFormat IN ('Any', 'Text', 'Markdown', 'JSON', 'ModelSpecific')),
    ModelSpecificResponseFormat NVARCHAR(MAX) NULL;

-- Add extended property for ResponseFormat column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Specifies the expected response format for the AI model. Options include Any, Text, Markdown, JSON, and ModelSpecific. Defaults to Any if not specified.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'AIPrompt',
    @level2type = N'Column', @level2name = N'ResponseFormat';

-- Add extended property for ModelSpecificResponseFormat column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'A JSON-formatted string containing model-specific response format instructions. This will be parsed and provided as a JSON object to the model.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'AIPrompt',
    @level2type = N'Column', @level2name = N'ModelSpecificResponseFormat';


-- Alter Entity table to add new columns with constraints
ALTER TABLE ${flyway:defaultSchema}.Entity
ADD 
    ScopeDefault NVARCHAR(100) NULL,
    RowsToPackWithSchema NVARCHAR(20) NOT NULL DEFAULT 'None'
        CONSTRAINT CHK_Entity_RowsToPackWithSchema CHECK (RowsToPackWithSchema IN ('None', 'Sample', 'All')),
    RowsToPackSampleMethod NVARCHAR(20) NOT NULL DEFAULT 'random'
        CONSTRAINT CHK_Entity_RowsToPackSampleMethod CHECK (RowsToPackSampleMethod IN ('random', 'top n', 'bottom n')),
    RowsToPackSampleCount INT NOT NULL DEFAULT 0,
    RowsToPackSampleOrder NVARCHAR(MAX) NULL;

-- Add extended property for ScopeDefault column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Optional, comma-delimited string indicating the default scope for entity visibility. Options include Users, Admins, AI, and All. Defaults to All when NULL. This is used for simple defaults for filtering entity visibility, not security enforcement.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'Entity',
    @level2type = N'Column', @level2name = N'ScopeDefault';

-- Add extended property for RowsToPackWithSchema column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Determines how entity rows should be packaged for external use. Options include None, Sample, and All. Defaults to None.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'Entity',
    @level2type = N'Column', @level2name = N'RowsToPackWithSchema';

-- Add extended property for RowsToPackSampleMethod column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Defines the sampling method for row packing when RowsToPackWithSchema is set to Sample. Options include random, top n, and bottom n. Defaults to random.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'Entity',
    @level2type = N'Column', @level2name = N'RowsToPackSampleMethod';

-- Add extended property for RowsToPackSampleCount column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'The number of rows to pack when RowsToPackWithSchema is set to Sample, based on the designated sampling method. Defaults to 0.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'Entity',
    @level2type = N'Column', @level2name = N'RowsToPackSampleCount';

-- Add extended property for RowsToPackSampleOrder column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'An optional ORDER BY clause for row packing when RowsToPackWithSchema is set to Sample. Allows custom ordering for selected entity data when using top n and bottom n.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'Entity',
    @level2type = N'Column', @level2name = N'RowsToPackSampleOrder';



-- Alter EntityField table to add new columns with constraints
ALTER TABLE ${flyway:defaultSchema}.EntityField
ADD 
    ScopeDefault NVARCHAR(100) NULL,
    AutoUpdateRelatedEntityInfo BIT NOT NULL DEFAULT 1,
    ValuesToPackWithSchema NVARCHAR(10) NOT NULL DEFAULT 'Auto'
        CONSTRAINT CHK_EntityField_ValuesToPackWithSchema CHECK (ValuesToPackWithSchema IN ('Auto', 'None', 'All'));

-- Add extended property for ScopeDefault column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'A comma-delimited string indicating the default scope for field visibility. Options include Users, Admins, AI, and All. Defaults to All when NULL. This is used for a simple method of filtering field defaults for visibility, not security enforcement.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'EntityField',
    @level2type = N'Column', @level2name = N'ScopeDefault';

-- Add extended property for AutoUpdateRelatedEntityInfo column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Indicates whether the related entity information should be automatically updated from the database schema. When set to 0, relationships not part of the database schema can be manually defined at the application and AI agent level. Defaults to 1.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'EntityField',
    @level2type = N'Column', @level2name = N'AutoUpdateRelatedEntityInfo';

-- Add extended property for ValuesToPackWithSchema column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Determines whether values for the field should be included when the schema is packed. Options: Auto (include manually set or auto-derived values), None (exclude all values), All (include all distinct values from the table). Defaults to Auto.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'EntityField',
    @level2type = N'Column', @level2name = N'ValuesToPackWithSchema';



-------------------- 
-- Alter EntityRelationship table to add the AutoUpdateFromSchema column
ALTER TABLE ${flyway:defaultSchema}.EntityRelationship
ADD AutoUpdateFromSchema BIT NOT NULL DEFAULT 1;

-- Add extended property for AutoUpdateFromSchema column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Indicates whether this relationship should be automatically updated by CodeGen. When set to 0, the record will not be modified by CodeGen. Defaults to 1.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'EntityRelationship',
    @level2type = N'Column', @level2name = N'AutoUpdateFromSchema';

