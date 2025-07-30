-- ======================================================================
-- Migration: Parameterized Query Support
-- Version: 2.74.x
-- Description: Add support for parameterized queries using Nunjucks templates
--              with automatic LLM-based metadata extraction
-- ======================================================================

-- ===========================
-- 1. Query Table Modifications
-- ===========================

-- Add UsesTemplate flag for tracking whether SQL contains Nunjucks template markers
ALTER TABLE ${flyway:defaultSchema}.Query
ADD UsesTemplate BIT DEFAULT 0;

-- Add descriptions for new column
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Automatically set to true when the SQL column contains Nunjucks template markers (e.g., {{ paramName }}). This flag is maintained by the QueryEntityServer for performance optimization and discovery purposes. It allows quick filtering of parameterized queries and enables the UI to show parameter inputs only when needed. The system will automatically update this flag when the SQL content changes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Query',
    @level2type = N'COLUMN', @level2name = 'UsesTemplate';

-- ===========================
-- 2. Create QueryParameter Table
-- ===========================

CREATE TABLE ${flyway:defaultSchema}.QueryParameter (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    QueryID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Type NVARCHAR(50) NOT NULL, -- string, number, date, boolean, array
    IsRequired BIT DEFAULT 0,
    DefaultValue NVARCHAR(MAX),
    Description NVARCHAR(MAX),
    SampleValue NVARCHAR(MAX),
    ValidationFilters NVARCHAR(MAX), -- JSON array of filter definitions
    DetectionMethod NVARCHAR(50) NOT NULL DEFAULT 'Manual', -- AI, Manual
    AutoDetectConfidenceScore DECIMAL(3,2) NULL,
    CONSTRAINT FK_QueryParameter_Query FOREIGN KEY (QueryID) REFERENCES ${flyway:defaultSchema}.Query(ID),
    CONSTRAINT UQ_QueryParameter_QueryID_Name UNIQUE(QueryID, Name),
    CONSTRAINT CK_QueryParameter_Type CHECK (Type IN ('string', 'number', 'date', 'boolean', 'array')),
    CONSTRAINT CK_QueryParameter_DetectionMethod CHECK (DetectionMethod IN ('AI', 'Manual'))
);

-- Add extended properties for QueryParameter
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Stores parameter definitions for parameterized queries that use Nunjucks templates. Each parameter represents a dynamic value that can be passed when executing the query. Parameters are automatically extracted from the query template by the QueryEntityServer using LLM analysis, or can be manually defined. The combination of parameter metadata and validation filters creates a self-documenting, type-safe query execution system.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'The name of the parameter as it appears in the Nunjucks template. This must match exactly with the parameter reference in the SQL template. For example, if the template contains {{ userEmail | required | email }}, the Name would be "userEmail". Parameter names should follow JavaScript identifier rules: start with a letter, and contain only letters, numbers, and underscores.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'The data type of the parameter used for validation and type conversion. Valid values are: "string" for text values, "number" for integers or decimals, "date" for date/datetime values (ISO 8601 format expected), "boolean" for true/false values, and "array" for multiple values (typically used with IN clauses). The type determines which validation filters can be applied and how the parameter is processed.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter',
    @level2type = N'COLUMN', @level2name = 'Type';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates whether this parameter must be provided when executing the query. When true, the query execution will fail if the parameter is not supplied and no DefaultValue is set. This is automatically determined by the presence of the "required" filter in the template, but can be manually overridden. Required parameters ensure data integrity and prevent unintended query behavior.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter',
    @level2type = N'COLUMN', @level2name = 'IsRequired';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'The default value to use when the parameter is not provided during query execution. This value must be compatible with the parameter Type. For arrays, use JSON format like ["value1","value2"]. Default values allow queries to have sensible fallbacks while still accepting custom inputs. If a parameter is required (IsRequired=true), the default value is ignored.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter',
    @level2type = N'COLUMN', @level2name = 'DefaultValue';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Human-readable description explaining the purpose and usage of this parameter. This is typically generated by LLM analysis of the query context but can be manually edited. Good descriptions include: what the parameter filters or controls, valid value ranges or formats, business meaning, and any special considerations. This text is shown in UI to help users understand what value to provide.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'A concrete example value demonstrating the proper format for this parameter. Generated by LLM based on the query context and validation filters. For example: "john@example.com" for an email parameter, "2024-01-15" for a date, or "["active","pending"]" for a status array. Sample values help users understand the expected format and can be used in API documentation.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter',
    @level2type = N'COLUMN', @level2name = 'SampleValue';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON array of Nunjucks filter definitions that validate and transform the parameter value. Each filter is an object with "name" and optional "args" properties. Filters are applied in order and can include: validation (required, email, min, max), transformation (trim, upper, lower), SQL safety (sqlsafe, sqljoin), and type conversion (number, date). Example: [{"name":"required"},{"name":"email"},{"name":"sqlsafe"}]. The filter chain ensures type safety and prevents SQL injection.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter',
    @level2type = N'COLUMN', @level2name = 'ValidationFilters';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates how this parameter was identified and added to the system. "AI" means it was automatically detected by LLM analysis of the query template, including extraction of parameter name, type inference from filters, and generation of description. "Manual" means it was explicitly defined by a user. This helps track which parameters might need human review and provides transparency about the source of metadata.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter',
    @level2type = N'COLUMN', @level2name = 'DetectionMethod';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Confidence score (0.00-1.00) indicating how certain the AI was about this parameter detection. Only populated when DetectionMethod="AI". Higher scores indicate the LLM was more confident about the parameter name, type, and usage. Scores above 0.80 are generally reliable, 0.60-0.80 may benefit from human review, and below 0.60 should be manually verified. This helps prioritize which auto-detected parameters need human attention.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryParameter',
    @level2type = N'COLUMN', @level2name = 'AutoDetectConfidenceScore';

-- ===========================
-- 3. QueryEntity Table Modifications
-- ===========================

-- Add AI detection tracking columns
ALTER TABLE ${flyway:defaultSchema}.QueryEntity
ADD DetectionMethod NVARCHAR(50) NOT NULL DEFAULT 'Manual',
    AutoDetectConfidenceScore DECIMAL(3,2) NULL,
    CONSTRAINT CK_QueryEntity_DetectionMethod CHECK (DetectionMethod IN ('AI', 'Manual'));

-- Add descriptions for new columns
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates how this entity-query relationship was identified. "AI" means the QueryEntityServer used LLM analysis to parse the SQL/template and identify which MemberJunction entities are referenced (by analyzing table names, joins, and query structure). "Manual" means a user explicitly marked this entity as being used by the query. AI detection helps maintain accurate metadata automatically as queries evolve.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryEntity',
    @level2type = N'COLUMN', @level2name = 'DetectionMethod';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Confidence score (0.00-1.00) indicating how certain the AI was that this entity is actually used in the query. Only populated when DetectionMethod="AI". Considers factors like: direct table references vs indirect joins, clear entity names vs ambiguous aliases, and context from the query purpose. Lower scores might indicate the entity is only peripherally involved or the detection was uncertain.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryEntity',
    @level2type = N'COLUMN', @level2name = 'AutoDetectConfidenceScore';

-- ===========================
-- 4. QueryField Table Modifications
-- ===========================

-- Add AI detection tracking columns
ALTER TABLE ${flyway:defaultSchema}.QueryField
ADD DetectionMethod NVARCHAR(50) NOT NULL DEFAULT 'Manual',
    AutoDetectConfidenceScore DECIMAL(3,2) NULL,
    CONSTRAINT CK_QueryField_DetectionMethod CHECK (DetectionMethod IN ('AI', 'Manual'));

-- Add descriptions for new columns
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates how this field was identified in the query output. "AI" means the QueryEntityServer used LLM analysis to parse the SELECT clause and determine field names, types, and their source entities/columns. This includes handling aliased columns, computed expressions, aggregations, and CASE statements. "Manual" means a user explicitly defined this output field. AI detection ensures the field list stays synchronized with query changes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryField',
    @level2type = N'COLUMN', @level2name = 'DetectionMethod';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Confidence score (0.00-1.00) indicating how certain the AI was about this field detection. Only populated when DetectionMethod="AI". Factors include: clarity of the SELECT clause, complexity of any expressions or transformations, confidence in type inference, and ability to trace back to source entity/column. Complex computed fields or ambiguous aliases result in lower scores. This helps identify fields that may need manual verification.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryField',
    @level2type = N'COLUMN', @level2name = 'AutoDetectConfidenceScore';













/************ CODE GEN RUN *************/

/* SQL generated to create new entity MJ: Query Parameters */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '3d08228d-8d64-46d3-aed9-aabd54bbbdbe',
         'MJ: Query Parameters',
         NULL,
         NULL,
         'QueryParameter',
         'vwQueryParameters',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Query Parameters to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3d08228d-8d64-46d3-aed9-aabd54bbbdbe', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Query Parameters for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3d08228d-8d64-46d3-aed9-aabd54bbbdbe', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Query Parameters for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3d08228d-8d64-46d3-aed9-aabd54bbbdbe', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Query Parameters for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3d08228d-8d64-46d3-aed9-aabd54bbbdbe', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.QueryParameter */
ALTER TABLE [${flyway:defaultSchema}].[QueryParameter] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.QueryParameter */
ALTER TABLE [${flyway:defaultSchema}].[QueryParameter] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5c15f0a2-70d3-47cc-90bf-e22491999802'  OR 
               (EntityID = '19248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DetectionMethod')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5c15f0a2-70d3-47cc-90bf-e22491999802',
            '19248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Query Fields
            100016,
            'DetectionMethod',
            'Detection Method',
            'Indicates how this field was identified in the query output. "AI" means the QueryEntityServer used LLM analysis to parse the SELECT clause and determine field names, types, and their source entities/columns. This includes handling aliased columns, computed expressions, aggregations, and CASE statements. "Manual" means a user explicitly defined this output field. AI detection ensures the field list stays synchronized with query changes.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Manual',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '938cd7f7-72a7-4437-8a28-b5e12f5d2ffc'  OR 
               (EntityID = '19248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoDetectConfidenceScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '938cd7f7-72a7-4437-8a28-b5e12f5d2ffc',
            '19248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Query Fields
            100017,
            'AutoDetectConfidenceScore',
            'Auto Detect Confidence Score',
            'Confidence score (0.00-1.00) indicating how certain the AI was about this field detection. Only populated when DetectionMethod="AI". Factors include: clarity of the SELECT clause, complexity of any expressions or transformations, confidence in type inference, and ability to trace back to source entity/column. Complex computed fields or ambiguous aliases result in lower scores. This helps identify fields that may need manual verification.',
            'decimal',
            5,
            3,
            2,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8f2bfc6f-5e7f-4de7-9a35-66fd6e8731ab'  OR 
               (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UsesTemplate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8f2bfc6f-5e7f-4de7-9a35-66fd6e8731ab',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Queries
            100015,
            'UsesTemplate',
            'Uses Template',
            'Automatically set to true when the SQL column contains Nunjucks template markers (e.g., {{ paramName }}). This flag is maintained by the QueryEntityServer for performance optimization and discovery purposes. It allows quick filtering of parameterized queries and enables the UI to show parameter inputs only when needed. The system will automatically update this flag when the SQL content changes.',
            'bit',
            1,
            1,
            0,
            1,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c5ae02d3-8b9d-4c6f-a2b1-ed511aaae2bc'  OR 
               (EntityID = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' AND Name = 'DetectionMethod')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c5ae02d3-8b9d-4c6f-a2b1-ed511aaae2bc',
            'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', -- Entity: Query Entities
            100006,
            'DetectionMethod',
            'Detection Method',
            'Indicates how this entity-query relationship was identified. "AI" means the QueryEntityServer used LLM analysis to parse the SQL/template and identify which MemberJunction entities are referenced (by analyzing table names, joins, and query structure). "Manual" means a user explicitly marked this entity as being used by the query. AI detection helps maintain accurate metadata automatically as queries evolve.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Manual',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7aa33e3a-f9e1-4e1b-8597-ae9898c36d38'  OR 
               (EntityID = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' AND Name = 'AutoDetectConfidenceScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7aa33e3a-f9e1-4e1b-8597-ae9898c36d38',
            'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', -- Entity: Query Entities
            100007,
            'AutoDetectConfidenceScore',
            'Auto Detect Confidence Score',
            'Confidence score (0.00-1.00) indicating how certain the AI was that this entity is actually used in the query. Only populated when DetectionMethod="AI". Considers factors like: direct table references vs indirect joins, clear entity names vs ambiguous aliases, and context from the query purpose. Lower scores might indicate the entity is only peripherally involved or the detection was uncertain.',
            'decimal',
            5,
            3,
            2,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '156401e0-085d-4d19-af4c-163da7e27e5f'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '156401e0-085d-4d19-af4c-163da7e27e5f',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8c934ab0-af3e-4e6e-b2c7-ab14cfa98adf'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'QueryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8c934ab0-af3e-4e6e-b2c7-ab14cfa98adf',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100002,
            'QueryID',
            'Query ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '1B248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '476207ba-c827-4e9d-aba2-32132c5c05a9'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '476207ba-c827-4e9d-aba2-32132c5c05a9',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100003,
            'Name',
            'Name',
            'The name of the parameter as it appears in the Nunjucks template. This must match exactly with the parameter reference in the SQL template. For example, if the template contains {{ userEmail | required | email }}, the Name would be "userEmail". Parameter names should follow JavaScript identifier rules: start with a letter, and contain only letters, numbers, and underscores.',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7e6f4e9b-9284-4a45-87a7-5b777c88f625'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'Type')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7e6f4e9b-9284-4a45-87a7-5b777c88f625',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100004,
            'Type',
            'Type',
            'The data type of the parameter used for validation and type conversion. Valid values are: "string" for text values, "number" for integers or decimals, "date" for date/datetime values (ISO 8601 format expected), "boolean" for true/false values, and "array" for multiple values (typically used with IN clauses). The type determines which validation filters can be applied and how the parameter is processed.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ff05dfeb-61df-48e6-8d2b-37c936f9c310'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'IsRequired')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ff05dfeb-61df-48e6-8d2b-37c936f9c310',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100005,
            'IsRequired',
            'Is Required',
            'Indicates whether this parameter must be provided when executing the query. When true, the query execution will fail if the parameter is not supplied and no DefaultValue is set. This is automatically determined by the presence of the "required" filter in the template, but can be manually overridden. Required parameters ensure data integrity and prevent unintended query behavior.',
            'bit',
            1,
            1,
            0,
            1,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c2584fc4-4b03-4b0f-918c-ff5cf339e0e3'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'DefaultValue')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c2584fc4-4b03-4b0f-918c-ff5cf339e0e3',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100006,
            'DefaultValue',
            'Default Value',
            'The default value to use when the parameter is not provided during query execution. This value must be compatible with the parameter Type. For arrays, use JSON format like ["value1","value2"]. Default values allow queries to have sensible fallbacks while still accepting custom inputs. If a parameter is required (IsRequired=true), the default value is ignored.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '09e7348c-29f8-4501-a5a8-5268cedda57f'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '09e7348c-29f8-4501-a5a8-5268cedda57f',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100007,
            'Description',
            'Description',
            'Human-readable description explaining the purpose and usage of this parameter. This is typically generated by LLM analysis of the query context but can be manually edited. Good descriptions include: what the parameter filters or controls, valid value ranges or formats, business meaning, and any special considerations. This text is shown in UI to help users understand what value to provide.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6f89c435-6c83-4518-84c8-8bea3855e890'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'SampleValue')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6f89c435-6c83-4518-84c8-8bea3855e890',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100008,
            'SampleValue',
            'Sample Value',
            'A concrete example value demonstrating the proper format for this parameter. Generated by LLM based on the query context and validation filters. For example: "john@example.com" for an email parameter, "2024-01-15" for a date, or "["active","pending"]" for a status array. Sample values help users understand the expected format and can be used in API documentation.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7ca573db-9758-4dea-8c4a-1cd60c7bd8e6'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'ValidationFilters')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7ca573db-9758-4dea-8c4a-1cd60c7bd8e6',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100009,
            'ValidationFilters',
            'Validation Filters',
            'JSON array of Nunjucks filter definitions that validate and transform the parameter value. Each filter is an object with "name" and optional "args" properties. Filters are applied in order and can include: validation (required, email, min, max), transformation (trim, upper, lower), SQL safety (sqlsafe, sqljoin), and type conversion (number, date). Example: [{"name":"required"},{"name":"email"},{"name":"sqlsafe"}]. The filter chain ensures type safety and prevents SQL injection.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '37039c00-e3af-400b-a376-ffa23ab65b66'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'DetectionMethod')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '37039c00-e3af-400b-a376-ffa23ab65b66',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100010,
            'DetectionMethod',
            'Detection Method',
            'Indicates how this parameter was identified and added to the system. "AI" means it was automatically detected by LLM analysis of the query template, including extraction of parameter name, type inference from filters, and generation of description. "Manual" means it was explicitly defined by a user. This helps track which parameters might need human review and provides transparency about the source of metadata.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Manual',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '54ff0d89-b7a6-4777-a122-a3f70bb3513d'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'AutoDetectConfidenceScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '54ff0d89-b7a6-4777-a122-a3f70bb3513d',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100011,
            'AutoDetectConfidenceScore',
            'Auto Detect Confidence Score',
            'Confidence score (0.00-1.00) indicating how certain the AI was about this parameter detection. Only populated when DetectionMethod="AI". Higher scores indicate the LLM was more confident about the parameter name, type, and usage. Scores above 0.80 are generally reliable, 0.60-0.80 may benefit from human review, and below 0.60 should be manually verified. This helps prioritize which auto-detected parameters need human attention.',
            'decimal',
            5,
            3,
            2,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '51d0b113-bf3d-49a7-9492-e25d4712e7d5'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '51d0b113-bf3d-49a7-9492-e25d4712e7d5',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100012,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5f3bae39-bd6d-46b0-8df5-66d89d13d92c'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5f3bae39-bd6d-46b0-8df5-66d89d13d92c',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100013,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('37039C00-E3AF-400B-A376-FFA23AB65B66', 1, 'AI', 'AI')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('37039C00-E3AF-400B-A376-FFA23AB65B66', 2, 'Manual', 'Manual')

/* SQL text to update ValueListType for entity field ID 37039C00-E3AF-400B-A376-FFA23AB65B66 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='37039C00-E3AF-400B-A376-FFA23AB65B66'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C5AE02D3-8B9D-4C6F-A2B1-ED511AAAE2BC', 1, 'AI', 'AI')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C5AE02D3-8B9D-4C6F-A2B1-ED511AAAE2BC', 2, 'Manual', 'Manual')

/* SQL text to update ValueListType for entity field ID C5AE02D3-8B9D-4C6F-A2B1-ED511AAAE2BC */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C5AE02D3-8B9D-4C6F-A2B1-ED511AAAE2BC'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5C15F0A2-70D3-47CC-90BF-E22491999802', 1, 'AI', 'AI')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5C15F0A2-70D3-47CC-90BF-E22491999802', 2, 'Manual', 'Manual')

/* SQL text to update ValueListType for entity field ID 5C15F0A2-70D3-47CC-90BF-E22491999802 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5C15F0A2-70D3-47CC-90BF-E22491999802'

/* SQL text to delete entity field value ID DF5E453E-F36B-1410-8DB9-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='DF5E453E-F36B-1410-8DB9-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='3F60453E-F36B-1410-8DB9-00021F8B792E'

/* SQL text to delete entity field value ID FD5E453E-F36B-1410-8DB9-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='FD5E453E-F36B-1410-8DB9-00021F8B792E'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7E6F4E9B-9284-4A45-87A7-5B777C88F625', 1, 'string', 'string')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7E6F4E9B-9284-4A45-87A7-5B777C88F625', 2, 'number', 'number')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7E6F4E9B-9284-4A45-87A7-5B777C88F625', 3, 'date', 'date')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7E6F4E9B-9284-4A45-87A7-5B777C88F625', 4, 'boolean', 'boolean')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7E6F4E9B-9284-4A45-87A7-5B777C88F625', 5, 'array', 'array')

/* SQL text to update ValueListType for entity field ID 7E6F4E9B-9284-4A45-87A7-5B777C88F625 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7E6F4E9B-9284-4A45-87A7-5B777C88F625'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5e908db4-4d46-4e6d-901d-13c733c01c70'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5e908db4-4d46-4e6d-901d-13c733c01c70', '1B248F34-2837-EF11-86D4-6045BDEE16E6', '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', 'QueryID', 'One To Many', 1, 1, 'MJ: Query Parameters', 1);
   END
                              

/* Index for Foreign Keys for QueryField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueryID in table QueryField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryField_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryField_QueryID ON [${flyway:defaultSchema}].[QueryField] ([QueryID]);

-- Index for foreign key SourceEntityID in table QueryField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryField_SourceEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryField_SourceEntityID ON [${flyway:defaultSchema}].[QueryField] ([SourceEntityID]);

/* Base View SQL for Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Fields
-- Item: vwQueryFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Query Fields
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryField
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwQueryFields]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryFields]
AS
SELECT
    q.*,
    Query_QueryID.[Name] AS [Query],
    Entity_SourceEntityID.[Name] AS [SourceEntity]
FROM
    [${flyway:defaultSchema}].[QueryField] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS Query_QueryID
  ON
    [q].[QueryID] = Query_QueryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_SourceEntityID
  ON
    [q].[SourceEntityID] = Entity_SourceEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Fields
-- Item: Permissions for vwQueryFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Fields
-- Item: spCreateQueryField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateQueryField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryField]
    @ID uniqueidentifier = NULL,
    @QueryID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Sequence int,
    @SQLBaseType nvarchar(50),
    @SQLFullType nvarchar(100),
    @SourceEntityID uniqueidentifier,
    @SourceFieldName nvarchar(255),
    @IsComputed bit,
    @ComputationDescription nvarchar(MAX),
    @IsSummary bit,
    @SummaryDescription nvarchar(MAX),
    @DetectionMethod nvarchar(50),
    @AutoDetectConfidenceScore decimal(3, 2)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueryField]
            (
                [ID],
                [QueryID],
                [Name],
                [Description],
                [Sequence],
                [SQLBaseType],
                [SQLFullType],
                [SourceEntityID],
                [SourceFieldName],
                [IsComputed],
                [ComputationDescription],
                [IsSummary],
                [SummaryDescription],
                [DetectionMethod],
                [AutoDetectConfidenceScore]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueryID,
                @Name,
                @Description,
                @Sequence,
                @SQLBaseType,
                @SQLFullType,
                @SourceEntityID,
                @SourceFieldName,
                @IsComputed,
                @ComputationDescription,
                @IsSummary,
                @SummaryDescription,
                @DetectionMethod,
                @AutoDetectConfidenceScore
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueryField]
            (
                [QueryID],
                [Name],
                [Description],
                [Sequence],
                [SQLBaseType],
                [SQLFullType],
                [SourceEntityID],
                [SourceFieldName],
                [IsComputed],
                [ComputationDescription],
                [IsSummary],
                [SummaryDescription],
                [DetectionMethod],
                [AutoDetectConfidenceScore]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueryID,
                @Name,
                @Description,
                @Sequence,
                @SQLBaseType,
                @SQLFullType,
                @SourceEntityID,
                @SourceFieldName,
                @IsComputed,
                @ComputationDescription,
                @IsSummary,
                @SummaryDescription,
                @DetectionMethod,
                @AutoDetectConfidenceScore
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryField] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Query Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryField] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Fields
-- Item: spUpdateQueryField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateQueryField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryField]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Sequence int,
    @SQLBaseType nvarchar(50),
    @SQLFullType nvarchar(100),
    @SourceEntityID uniqueidentifier,
    @SourceFieldName nvarchar(255),
    @IsComputed bit,
    @ComputationDescription nvarchar(MAX),
    @IsSummary bit,
    @SummaryDescription nvarchar(MAX),
    @DetectionMethod nvarchar(50),
    @AutoDetectConfidenceScore decimal(3, 2)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryField]
    SET
        [QueryID] = @QueryID,
        [Name] = @Name,
        [Description] = @Description,
        [Sequence] = @Sequence,
        [SQLBaseType] = @SQLBaseType,
        [SQLFullType] = @SQLFullType,
        [SourceEntityID] = @SourceEntityID,
        [SourceFieldName] = @SourceFieldName,
        [IsComputed] = @IsComputed,
        [ComputationDescription] = @ComputationDescription,
        [IsSummary] = @IsSummary,
        [SummaryDescription] = @SummaryDescription,
        [DetectionMethod] = @DetectionMethod,
        [AutoDetectConfidenceScore] = @AutoDetectConfidenceScore
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueryFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryField] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryField table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateQueryField
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryField
ON [${flyway:defaultSchema}].[QueryField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Query Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryField] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Fields
-- Item: spDeleteQueryField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteQueryField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueryField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryField] TO [cdp_Integration]
    

/* spDelete Permissions for Query Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryField] TO [cdp_Integration]



/* Index for Foreign Keys for Query */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_CategoryID ON [${flyway:defaultSchema}].[Query] ([CategoryID]);

/* Base View SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwQueries]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueries]
AS
SELECT
    q.*,
    QueryCategory_CategoryID.[Name] AS [Category]
FROM
    [${flyway:defaultSchema}].[Query] AS q
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[QueryCategory] AS QueryCategory_CategoryID
  ON
    [q].[CategoryID] = QueryCategory_CategoryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: spCreateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Query
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateQuery]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQuery]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [ID],
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                @Status,
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                @Status,
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: spUpdateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Query
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateQuery]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = @Name,
        [CategoryID] = @CategoryID,
        [UserQuestion] = @UserQuestion,
        [Description] = @Description,
        [SQL] = @SQL,
        [TechnicalDescription] = @TechnicalDescription,
        [OriginalSQL] = @OriginalSQL,
        [Feedback] = @Feedback,
        [Status] = @Status,
        [QualityRank] = @QualityRank,
        [ExecutionCostRank] = @ExecutionCostRank,
        [UsesTemplate] = @UsesTemplate
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateQuery
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQuery
ON [${flyway:defaultSchema}].[Query]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Query] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteQuery]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Query]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]
    

/* spDelete Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 9158453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9158453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID F558453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F558453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID FB58453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FB58453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID A158453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A158453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID A558453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A558453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for QueryEntity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueryID in table QueryEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryEntity_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryEntity_QueryID ON [${flyway:defaultSchema}].[QueryEntity] ([QueryID]);

-- Index for foreign key EntityID in table QueryEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryEntity_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryEntity_EntityID ON [${flyway:defaultSchema}].[QueryEntity] ([EntityID]);

/* Base View SQL for Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Entities
-- Item: vwQueryEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Query Entities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryEntity
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwQueryEntities]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryEntities]
AS
SELECT
    q.*,
    Query_QueryID.[Name] AS [Query],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[QueryEntity] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS Query_QueryID
  ON
    [q].[QueryID] = Query_QueryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [q].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Entities
-- Item: Permissions for vwQueryEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Entities
-- Item: spCreateQueryEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryEntity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateQueryEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryEntity]
    @ID uniqueidentifier = NULL,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @DetectionMethod nvarchar(50),
    @AutoDetectConfidenceScore decimal(3, 2)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueryEntity]
            (
                [ID],
                [QueryID],
                [EntityID],
                [DetectionMethod],
                [AutoDetectConfidenceScore]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueryID,
                @EntityID,
                @DetectionMethod,
                @AutoDetectConfidenceScore
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueryEntity]
            (
                [QueryID],
                [EntityID],
                [DetectionMethod],
                [AutoDetectConfidenceScore]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueryID,
                @EntityID,
                @DetectionMethod,
                @AutoDetectConfidenceScore
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Query Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Entities
-- Item: spUpdateQueryEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryEntity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateQueryEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryEntity]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @DetectionMethod nvarchar(50),
    @AutoDetectConfidenceScore decimal(3, 2)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryEntity]
    SET
        [QueryID] = @QueryID,
        [EntityID] = @EntityID,
        [DetectionMethod] = @DetectionMethod,
        [AutoDetectConfidenceScore] = @AutoDetectConfidenceScore
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueryEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryEntity table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateQueryEntity
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryEntity
ON [${flyway:defaultSchema}].[QueryEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryEntity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryEntity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Query Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Entities
-- Item: spDeleteQueryEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryEntity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteQueryEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueryEntity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryEntity] TO [cdp_Integration]
    

/* spDelete Permissions for Query Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryEntity] TO [cdp_Integration]



/* Index for Foreign Keys for QueryParameter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Parameters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueryID in table QueryParameter
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryParameter_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryParameter]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryParameter_QueryID ON [${flyway:defaultSchema}].[QueryParameter] ([QueryID]);

/* SQL text to update entity field related entity name field map for entity field ID 8C934AB0-AF3E-4E6E-B2C7-AB14CFA98ADF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8C934AB0-AF3E-4E6E-B2C7-AB14CFA98ADF',
         @RelatedEntityNameFieldMap='Query'

/* SQL text to update entity field related entity name field map for entity field ID D557453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D557453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID E757453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E757453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID F557453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F557453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* Base View SQL for MJ: Query Parameters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Parameters
-- Item: vwQueryParameters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Query Parameters
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryParameter
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwQueryParameters]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryParameters]
AS
SELECT
    q.*,
    Query_QueryID.[Name] AS [Query]
FROM
    [${flyway:defaultSchema}].[QueryParameter] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS Query_QueryID
  ON
    [q].[QueryID] = Query_QueryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryParameters] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Query Parameters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Parameters
-- Item: Permissions for vwQueryParameters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryParameters] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Query Parameters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Parameters
-- Item: spCreateQueryParameter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryParameter
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateQueryParameter]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryParameter]
    @ID uniqueidentifier = NULL,
    @QueryID uniqueidentifier,
    @Name nvarchar(255),
    @Type nvarchar(50),
    @IsRequired bit,
    @DefaultValue nvarchar(MAX),
    @Description nvarchar(MAX),
    @SampleValue nvarchar(MAX),
    @ValidationFilters nvarchar(MAX),
    @DetectionMethod nvarchar(50),
    @AutoDetectConfidenceScore decimal(3, 2)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueryParameter]
            (
                [ID],
                [QueryID],
                [Name],
                [Type],
                [IsRequired],
                [DefaultValue],
                [Description],
                [SampleValue],
                [ValidationFilters],
                [DetectionMethod],
                [AutoDetectConfidenceScore]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueryID,
                @Name,
                @Type,
                @IsRequired,
                @DefaultValue,
                @Description,
                @SampleValue,
                @ValidationFilters,
                @DetectionMethod,
                @AutoDetectConfidenceScore
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueryParameter]
            (
                [QueryID],
                [Name],
                [Type],
                [IsRequired],
                [DefaultValue],
                [Description],
                [SampleValue],
                [ValidationFilters],
                [DetectionMethod],
                [AutoDetectConfidenceScore]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueryID,
                @Name,
                @Type,
                @IsRequired,
                @DefaultValue,
                @Description,
                @SampleValue,
                @ValidationFilters,
                @DetectionMethod,
                @AutoDetectConfidenceScore
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryParameters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryParameter] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Query Parameters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryParameter] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Query Parameters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Parameters
-- Item: spUpdateQueryParameter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryParameter
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateQueryParameter]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryParameter]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @Name nvarchar(255),
    @Type nvarchar(50),
    @IsRequired bit,
    @DefaultValue nvarchar(MAX),
    @Description nvarchar(MAX),
    @SampleValue nvarchar(MAX),
    @ValidationFilters nvarchar(MAX),
    @DetectionMethod nvarchar(50),
    @AutoDetectConfidenceScore decimal(3, 2)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryParameter]
    SET
        [QueryID] = @QueryID,
        [Name] = @Name,
        [Type] = @Type,
        [IsRequired] = @IsRequired,
        [DefaultValue] = @DefaultValue,
        [Description] = @Description,
        [SampleValue] = @SampleValue,
        [ValidationFilters] = @ValidationFilters,
        [DetectionMethod] = @DetectionMethod,
        [AutoDetectConfidenceScore] = @AutoDetectConfidenceScore
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueryParameters] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryParameters]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryParameter] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryParameter table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateQueryParameter
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryParameter
ON [${flyway:defaultSchema}].[QueryParameter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryParameter]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryParameter] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Query Parameters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryParameter] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Query Parameters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Parameters
-- Item: spDeleteQueryParameter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryParameter
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteQueryParameter]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryParameter]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueryParameter]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryParameter] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Query Parameters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryParameter] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID E957453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E957453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID EB57453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EB57453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 1F58453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1F58453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 4358453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4358453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 4958453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4958453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 4B58453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4B58453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 4D58453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4D58453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 5B58453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5B58453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 6758453E-F36B-1410-8DB9-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6758453E-F36B-1410-8DB9-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9d84d6df-7d77-4dd1-9296-05647e877e26'  OR 
               (EntityID = 'D7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegration')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9d84d6df-7d77-4dd1-9296-05647e877e26',
            'D7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Company Integrations
            100008,
            'CompanyIntegration',
            'Company Integration',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c7240363-f600-414c-af06-7d768ab5e6ca'  OR 
               (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegration')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c7240363-f600-414c-af06-7d768ab5e6ca',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Lists
            100014,
            'CompanyIntegration',
            'Company Integration',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ca8b88fa-7ccf-4174-bf76-9918c02233c9'  OR 
               (EntityID = '16248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegration')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ca8b88fa-7ccf-4174-bf76-9918c02233c9',
            '16248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Company Integration Record Maps
            100008,
            'CompanyIntegration',
            'Company Integration',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a6829b0a-d2c2-41f3-b8ac-25862fc6b420'  OR 
               (EntityID = '3D08228D-8D64-46D3-AED9-AABD54BBBDBE' AND Name = 'Query')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a6829b0a-d2c2-41f3-b8ac-25862fc6b420',
            '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', -- Entity: MJ: Query Parameters
            100014,
            'Query',
            'Query',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

