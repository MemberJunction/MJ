-- Create AIPromptCategory Table
CREATE TABLE __mj.AIPromptCategory (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    Description NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT FK_AIPromptCategory_ParentID FOREIGN KEY (ParentID)
        REFERENCES __mj.AIPromptCategory(ID)
);

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Categories for organizing AI prompts in a hierarchical structure.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIPromptCategory';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Parent category ID for hierarchical organization.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIPromptCategory',
    @level2type = N'COLUMN', @level2name = 'ParentID';
     


-- Create AIPromptType Table
CREATE TABLE __mj.AIPromptType (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL
);

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Types of AI prompts such as Chat, Text-to-Image, Text-to-Video, etc.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIPromptType';

 


-- Create AIPrompt Table
CREATE TABLE __mj.AIPrompt (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    TemplateID UNIQUEIDENTIFIER NOT NULL,
    CategoryID UNIQUEIDENTIFIER NULL,
    TypeID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(50) NOT NULL CHECK (Status IN ('Pending', 'Active', 'Disabled')),
    CacheResults BIT NOT NULL DEFAULT 0,
    CacheExpiration DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- Cache expiration in hours, fractional or 0 if never expires
    __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT FK_AIPrompt_TemplateID FOREIGN KEY (TemplateID)
        REFERENCES __mj.Template(ID),
    CONSTRAINT FK_AIPrompt_CategoryID FOREIGN KEY (CategoryID)
        REFERENCES __mj.AIPromptCategory(ID),
    CONSTRAINT FK_AIPrompt_TypeID FOREIGN KEY (TypeID)
        REFERENCES __mj.AIPromptType(ID)
);

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Stores AI prompts, including references to categories, types, and templates.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIPrompt';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Reference to the template used for the prompt.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'TemplateID';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Reference to the category the prompt belongs to.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'CategoryID';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Reference to the type of the prompt.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'TypeID';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Indicates whether the results of the prompt should be cached.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'CacheResults';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Number of hours the cache is valid for; can be fractional or 0 if the cache never expires.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'CacheExpiration';
     



-- Create AIResultCache Table (combined with history functionality)
CREATE TABLE __mj.AIResultCache (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    AIPromptID UNIQUEIDENTIFIER NOT NULL,
    AIModelID UNIQUEIDENTIFIER NOT NULL,
    RunAt DATETIMEOFFSET NOT NULL,
    PromptText NVARCHAR(MAX) NOT NULL,
    ResultText NVARCHAR(MAX) NULL,  -- Renamed from Result to ResultText for consistency
    Status NVARCHAR(50) NOT NULL CHECK (Status IN ('Active', 'Expired')),
    ExpiredOn DATETIMEOFFSET NULL,
    __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT FK_AIResultCache_AIPromptID FOREIGN KEY (AIPromptID)
        REFERENCES __mj.AIPrompt(ID),
    CONSTRAINT FK_AIResultCache_AIModelID FOREIGN KEY (AIModelID)
        REFERENCES __mj.AIModel(ID)
);


EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Stores cached results of AI prompts, including multiple runs for history and tracking purposes.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIResultCache';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Reference to the AI prompt this result corresponds to.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'AIPromptID';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Reference to the AI model that generated this result.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'AIModelID';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Timestamp of when this result was generated.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'RunAt';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'The prompt text used to generate this result.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'PromptText';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'The text of the result generated by the AI model.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'ResultText';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'The status of this result, indicating whether it is currently active or expired.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty 
    @name = N'ms_description', 
    @value = N'Timestamp of when this result was marked as expired.', 
    @level0type = N'SCHEMA', @level0name = '__mj', 
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'ExpiredOn';

-- CRAIG - this needs to be done after a codegen run...
UPDATE __mj.Entity SET Name='AI Prompt Types' WHERE Name ='AIPrompt Types'
UPDATE __mj.Entity SET Name='AI Prompt Categories' WHERE Name ='AIPrompt Categories'
UPDATE __mj.Entity SET Name='AI Result Cache' WHERE Name ='AIResult Caches'
UPDATE __mj.Entity SET Name='AI Prompts' WHERE Name ='AIPrompts'
