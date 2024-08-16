-- Create AIPromptCategory Table
CREATE TABLE ${flyway:defaultSchema}.AIPromptCategory (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    Description NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT FK_AIPromptCategory_ParentID FOREIGN KEY (ParentID)
        REFERENCES ${flyway:defaultSchema}.AIPromptCategory(ID)
);

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Categories for organizing AI prompts in a hierarchical structure.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPromptCategory';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Parent category ID for hierarchical organization.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPromptCategory',
    @level2type = N'COLUMN', @level2name = 'ParentID';



-- Create AIPromptType Table
CREATE TABLE ${flyway:defaultSchema}.AIPromptType (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL
);

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Types of AI prompts such as Chat, Text-to-Image, Text-to-Video, etc.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPromptType';




-- Create AIPrompt Table
CREATE TABLE ${flyway:defaultSchema}.AIPrompt (
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
        REFERENCES ${flyway:defaultSchema}.Template(ID),
    CONSTRAINT FK_AIPrompt_CategoryID FOREIGN KEY (CategoryID)
        REFERENCES ${flyway:defaultSchema}.AIPromptCategory(ID),
    CONSTRAINT FK_AIPrompt_TypeID FOREIGN KEY (TypeID)
        REFERENCES ${flyway:defaultSchema}.AIPromptType(ID)
);

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Stores AI prompts, including references to categories, types, and templates.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Reference to the template used for the prompt.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'TemplateID';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Reference to the category the prompt belongs to.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'CategoryID';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Reference to the type of the prompt.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'TypeID';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Indicates whether the results of the prompt should be cached.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'CacheResults';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Number of hours the cache is valid for; can be fractional or 0 if the cache never expires.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIPrompt',
    @level2type = N'COLUMN', @level2name = 'CacheExpiration';




-- Create AIResultCache Table (combined with history functionality)
CREATE TABLE ${flyway:defaultSchema}.AIResultCache (
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
        REFERENCES ${flyway:defaultSchema}.AIPrompt(ID),
    CONSTRAINT FK_AIResultCache_AIModelID FOREIGN KEY (AIModelID)
        REFERENCES ${flyway:defaultSchema}.AIModel(ID)
);


EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Stores cached results of AI prompts, including multiple runs for history and tracking purposes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIResultCache';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Reference to the AI prompt this result corresponds to.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'AIPromptID';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Reference to the AI model that generated this result.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'AIModelID';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Timestamp of when this result was generated.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'RunAt';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'The prompt text used to generate this result.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'PromptText';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'The text of the result generated by the AI model.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'ResultText';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'The status of this result, indicating whether it is currently active or expired.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Timestamp of when this result was marked as expired.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIResultCache',
    @level2type = N'COLUMN', @level2name = 'ExpiredOn';



/**********************************************
  MANUALLY CREATE Entity Records because we want custom Names for them, the CodeGen tool generates slightly different Entity Names than the below. CodeGen will pick up from here and automatically create fields and so on from these "stub" records
*******************/
INSERT INTO ${flyway:defaultSchema}.Entity (
    ID, ParentID, Name, NameSuffix, Description, AutoUpdateDescription,
    BaseTable, BaseView, BaseViewGenerated, SchemaName, VirtualEntity,
    TrackRecordChanges, AuditRecordAccess, AuditViewRuns, IncludeInAPI,
    AllowAllRowsAPI, AllowUpdateAPI, AllowCreateAPI, AllowDeleteAPI,
    CustomResolverAPI, AllowUserSearchAPI, FullTextSearchEnabled,
    FullTextCatalog, FullTextCatalogGenerated, FullTextIndex,
    FullTextIndexGenerated, FullTextSearchFunction,
    FullTextSearchFunctionGenerated, UserViewMaxRows, spCreate, spUpdate,
    spDelete, spCreateGenerated, spUpdateGenerated, spDeleteGenerated,
    CascadeDeletes, DeleteType, AllowRecordMerge, spMatch,
    RelationshipDefaultDisplayType, UserFormGenerated,
    EntityObjectSubclassName, EntityObjectSubclassImport,
    PreferredCommunicationField, Icon, __mj_CreatedAt, __mj_UpdatedAt
)
VALUES
(
    '7DAD0238-8B56-EF11-991A-6045BDEBA539', NULL, 'AI Prompt Categories', NULL,
    'Categories for organizing AI prompts in a hierarchical structure.', 1,
    'AIPromptCategory', 'vwAIPromptCategories', 1, '${flyway:defaultSchema}', 0, 1, 0, 0, 1, 0, 1, 1,
    1, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0,
    'Hard', 0, NULL, 'Search', 1, NULL, NULL, NULL, NULL,
    '2024-08-09 20:09:12.1100000 +00:00', '2024-08-09 21:19:35.2700000 +00:00'
),
(
    'F1A70B3E-8B56-EF11-991A-6045BDEBA539', NULL, 'AI Prompt Types', NULL,
    'Types of AI prompts such as Chat, Text-to-Image, Text-to-Video, etc.', 1,
    'AIPromptType', 'vwAIPromptTypes', 1, '${flyway:defaultSchema}', 0, 1, 0, 0, 1, 0, 1, 1,
    1, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0,
    'Hard', 0, NULL, 'Search', 1, NULL, NULL, NULL, NULL,
    '2024-08-09 20:09:12.9300000 +00:00', '2024-08-09 21:19:35.2700000 +00:00'
),
(
    '73AD0238-8B56-EF11-991A-6045BDEBA539', NULL, 'AI Prompts', NULL,
    'Stores AI prompts, including references to categories, types, and templates.', 1,
    'AIPrompt', 'vwAIPrompts', 1, '${flyway:defaultSchema}', 0, 1, 0, 0, 1, 0, 1, 1,
    1, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0,
    'Hard', 0, NULL, 'Search', 1, NULL, NULL, NULL, NULL,
    '2024-08-09 20:09:02.1933333 +00:00', '2024-08-09 21:19:35.2700000 +00:00'
),
(
    '78AD0238-8B56-EF11-991A-6045BDEBA539', NULL, 'AI Result Cache', NULL,
    'Stores cached results of AI prompts, including multiple runs for history and tracking purposes.', 1,
    'AIResultCache', 'vwAIResultCaches', 1, '${flyway:defaultSchema}', 0, 1, 0, 0, 1, 0, 1, 1,
    1, 0, 0, 0, NULL, 1, NULL, 1, NULL, 1, 1000, NULL, NULL, NULL, 1, 1, 1, 0,
    'Hard', 0, NULL, 'Search', 1, NULL, NULL, NULL, NULL,
    '2024-08-09 20:09:11.3200000 +00:00', '2024-08-09 21:19:35.2700000 +00:00'
);
