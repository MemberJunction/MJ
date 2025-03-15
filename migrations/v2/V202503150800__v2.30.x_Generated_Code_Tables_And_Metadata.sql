-- Create the GenerateCodeCategory Table (for categorization)
CREATE TABLE __mj.GeneratedCodeCategory (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL UNIQUE,
    Description NVARCHAR(MAX) NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_GenerateCodeCategory_Parent FOREIGN KEY (ParentID) REFERENCES __mj.GeneratedCodeCategory(ID)
);
GO

-- Add extended properties for GenerateCodeCategory table
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Categorization for generated code, including optional parent-child relationships.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCodeCategory';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Parent category ID, allowing for hierarchical categorization.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCodeCategory',
    @level2type = N'Column', @level2name = 'ParentID';
GO

-- Create the GeneratedCode Table
CREATE TABLE __mj.GeneratedCode (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    GeneratedAt DATETIMEOFFSET(7) NOT NULL DEFAULT GETUTCDATE(), 
    CategoryID UNIQUEIDENTIFIER NOT NULL,
    GeneratedByModelID UNIQUEIDENTIFIER NOT NULL, -- FKey to AIModel
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Code NVARCHAR(MAX) NOT NULL,
    Source NVARCHAR(MAX) NOT NULL,
    LinkedEntityID UNIQUEIDENTIFIER NULL,
    LinkedRecordPrimaryKey NVARCHAR(MAX) NULL,

    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    Language NVARCHAR(50) NOT NULL DEFAULT 'TypeScript',

    -- Foreign Key Constraints
    CONSTRAINT FK_GeneratedCode_Category FOREIGN KEY (CategoryID) REFERENCES __mj.GeneratedCodeCategory(ID),
    CONSTRAINT FK_GeneratedCode_GeneratedByModel FOREIGN KEY (GeneratedByModelID) REFERENCES __mj.AIModel(ID),

    -- Check constraint for Status
    CONSTRAINT CHK_GeneratedCode_Status CHECK (Status IN ('Pending', 'Approved', 'Rejected')),

    -- Check constraint for Language
    CONSTRAINT CHK_GeneratedCode_Language CHECK (Language IN ('TypeScript', 'SQL', 'HTML', 'CSS', 'JavaScript', 'Python', 'Other')),

    CONSTRAINT FK_GeneratedCode_LinkedEntity FOREIGN KEY (LinkedEntityID) REFERENCES __mj.Entity(ID)
);
GO


-- Add extended properties for GeneratedCode table
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Stores LLM-generated code snippets, tracking their source, category, and validation status.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode';
GO

-- Document non-key columns in GeneratedCode
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'When the code was generated.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'GeneratedAt';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Reference to the category of generated code.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'CategoryID';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'AI model responsible for generating this code.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'GeneratedByModelID';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Descriptive name of the generated code.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Name';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Optional description of the generated code.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Description';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'The actual generated code.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Code';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Source material used to generate the code, e.g., a SQL CHECK constraint.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Source';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Status of the generated code, e.g., Pending, Approved, or Rejected.', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Status';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Programming language of the generated code (TypeScript, SQL, HTML, CSS, JavaScript, Python, or Other).', 
    @level0type = N'Schema', @level0name = '__mj', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Language';
GO




  
/***** MODIFY THE BELOW VIEW TO RETURN TABLE LEVEL CHECK CONSTRAINTS *****/

DROP VIEW IF EXISTS __mj.vwEntityFieldsWithCheckConstraints
GO
CREATE VIEW __mj.vwEntityFieldsWithCheckConstraints
AS
SELECT 
    e.ID as EntityID,
  	e.Name as EntityName,
    ef.ID as EntityFieldID,
    ef.Name as EntityFieldName,
    ef.GeneratedValidationFunctionName,
    ef.GeneratedValidationFunctionDescription,
    ef.GeneratedValidationFunctionCode,
    ef.GeneratedValidationFunctionCheckConstraint,
    sch.name AS SchemaName,
    obj.name AS TableName,
    col.name AS ColumnName,
    cc.name AS ConstraintName,
    cc.definition AS ConstraintDefinition
FROM 
    sys.check_constraints cc
INNER JOIN 
    sys.objects obj ON cc.parent_object_id = obj.object_id
INNER JOIN 
    sys.schemas sch ON obj.schema_id = sch.schema_id
INNER JOIN
	__mj.Entity e
	ON
	e.SchemaName = sch.Name AND
	e.BaseTable = obj.name
LEFT OUTER JOIN 
    sys.columns col ON col.object_id = obj.object_id AND col.column_id = cc.parent_column_id
LEFT OUTER JOIN
  __mj.EntityField ef
  ON
  e.ID = ef.EntityID AND
  ef.Name = col.name
GO


/**** --------------- GENERATED METADATA FOR THE ABOVE -------------------  ****/

 
