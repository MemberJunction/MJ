DROP PROCEDURE IF EXISTS __mj.spRecompileAllViews
GO
CREATE PROCEDURE __mj.spRecompileAllViews
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ViewSchema NVARCHAR(128);
    DECLARE @ViewName NVARCHAR(128);
    DECLARE @FullViewName NVARCHAR(256);

    -- Cursor to fetch all views with their schema names
    DECLARE cur CURSOR FOR
        SELECT s.name AS SchemaName, v.name AS ViewName
        FROM sys.views v
        INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
		WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA'); -- Exclude system schemas

    OPEN cur;
    FETCH NEXT FROM cur INTO @ViewSchema, @ViewName;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Construct the full view name with schema
        SET @FullViewName = QUOTENAME(@ViewSchema) + '.' + QUOTENAME(@ViewName);
        
        -- Refresh the view
        EXEC sp_refreshview @FullViewName;
        
        -- Fetch the next view
        FETCH NEXT FROM cur INTO @ViewSchema, @ViewName;
    END

    -- Clean up
    CLOSE cur;
    DEALLOCATE cur;
END
GO

---------------------------
DROP FUNCTION IF EXISTS __mj.GetProgrammaticName
GO
CREATE FUNCTION __mj.GetProgrammaticName(@input NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    DECLARE @output NVARCHAR(MAX) = '';
    DECLARE @i INT = 1;
    DECLARE @currentChar NCHAR(1);
    DECLARE @isValid BIT;
    
    -- Loop through each character in the input string
    WHILE @i <= LEN(@input)
    BEGIN
        SET @currentChar = SUBSTRING(@input, @i, 1);
        
        -- Check if the character is alphanumeric or underscore
        SET @isValid = CASE
            WHEN @currentChar LIKE '[A-Za-z0-9_]' THEN 1
            ELSE 0
        END;
        
        -- Append the character or an underscore to the output
        IF @isValid = 1
        BEGIN
            SET @output = @output + @currentChar;
        END
        ELSE
        BEGIN
            SET @output = @output + '_';
        END;
        
        SET @i = @i + 1;
    END;
    
    -- Prepend an underscore if the first character is a number
    IF @output LIKE '[0-9]%'
    BEGIN
        SET @output = '_' + @output;
    END;
    
    RETURN @output;
END;
GO
GRANT EXEC ON __mj.GetProgrammaticName to public

GO

DROP VIEW IF EXISTS [__mj].[vwTablePrimaryKeys] 
GO 
CREATE VIEW [__mj].[vwTablePrimaryKeys] AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName
FROM 
    sys.tables t
INNER JOIN 
    sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN 
    sys.indexes i ON t.object_id = i.object_id
INNER JOIN 
    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN 
    sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
WHERE 
    i.is_primary_key = 1;
GO

DROP VIEW IF EXISTS [__mj].[vwTableUniqueKeys]
GO
CREATE VIEW [__mj].[vwTableUniqueKeys] AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName
FROM 
    sys.tables t
INNER JOIN 
    sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN 
    sys.indexes i ON t.object_id = i.object_id
INNER JOIN 
    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN 
    sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
WHERE 
    i.is_unique = 1
    AND i.is_primary_key = 0;
GO


DROP PROC IF EXISTS __mj.spGetPrimaryKeyForTable
GO
CREATE PROC __mj.spGetPrimaryKeyForTable 
  @TableName NVARCHAR(255),
  @SchemaName NVARCHAR(255)
AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS DataType,
    c.max_length,
    c.precision,
    c.scale,
    c.is_nullable
FROM 
    sys.tables t
INNER JOIN 
    sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN 
    sys.indexes i ON t.object_id = i.object_id
INNER JOIN 
    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN 
    sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
INNER JOIN 
    sys.types ty ON c.user_type_id = ty.user_type_id
WHERE 
    i.is_primary_key = 1
    AND t.name = @TableName
    AND s.name = @SchemaName;
GO
 

-- ALL THE VIEWS

DROP VIEW IF EXISTS [__mj].vwForeignKeys
GO
CREATE VIEW [__mj].vwForeignKeys
AS
SELECT  obj.name AS FK_NAME,
    sch.name AS [schema_name],
    tab1.name AS [table],
    col1.name AS [column],
	sch2.name AS [referenced_schema],
    tab2.name AS [referenced_table],
    col2.name AS [referenced_column]
FROM sys.foreign_key_columns fkc
INNER JOIN sys.objects obj
    ON obj.object_id = fkc.constraint_object_id
INNER JOIN sys.tables tab1
    ON tab1.object_id = fkc.parent_object_id
INNER JOIN sys.schemas sch
    ON tab1.schema_id = sch.schema_id
INNER JOIN sys.columns col1
    ON col1.column_id = parent_column_id AND col1.object_id = tab1.object_id
INNER JOIN sys.tables tab2
    ON tab2.object_id = fkc.referenced_object_id
INNER JOIN sys.columns col2
    ON col2.column_id = referenced_column_id AND col2.object_id = tab2.object_id
INNER JOIN sys.schemas sch2
    ON tab2.schema_id = sch2.schema_id
GO

DROP VIEW IF EXISTS [__mj].vwEntities
GO
CREATE VIEW [__mj].vwEntities
AS
SELECT 
	e.*,
	__mj.GetProgrammaticName(REPLACE(e.Name,' ','')) AS CodeName, /*For just the CodeName for the entity, we remove spaces before we convert to a programmatic name as many entity names have spaces automatically added to them and it is not needed to make those into _ characters*/
	__mj.GetProgrammaticName(e.BaseTable + ISNULL(e.NameSuffix, '')) AS ClassName,
	__mj.GetProgrammaticName(e.BaseTable + ISNULL(e.NameSuffix, '')) AS BaseTableCodeName,
	par.Name ParentEntity,
	par.BaseTable ParentBaseTable,
	par.BaseView ParentBaseView
FROM 
	[__mj].Entity e
LEFT OUTER JOIN 
	[__mj].Entity par
ON
	e.ParentID = par.ID
GO

DROP VIEW IF EXISTS [__mj].vwEntityFields
GO
CREATE VIEW [__mj].vwEntityFields
AS
SELECT
	ef.*,
  __mj.GetProgrammaticName(REPLACE(ef.Name,' ','')) AS FieldCodeName,
	e.Name Entity,
	e.SchemaName,
	e.BaseTable,
	e.BaseView,
	e.CodeName EntityCodeName,
	e.ClassName EntityClassName,
	re.Name RelatedEntity,
	re.SchemaName RelatedEntitySchemaName,
	re.BaseTable RelatedEntityBaseTable,
	re.BaseView RelatedEntityBaseView,
	re.CodeName RelatedEntityCodeName,
	re.ClassName RelatedEntityClassName
FROM
	[__mj].EntityField ef
INNER JOIN
	[__mj].vwEntities e ON ef.EntityID = e.ID
LEFT OUTER JOIN
	[__mj].vwEntities re ON ef.RelatedEntityID = re.ID
GO



DROP VIEW IF EXISTS [__mj].vwEntityRelationships
GO
CREATE VIEW [__mj].vwEntityRelationships
AS
SELECT
	er.*,
	e.Name Entity,
	e.BaseTable EntityBaseTable,
	e.BaseView EntityBaseView,
	relatedEntity.Name RelatedEntity,
	relatedEntity.BaseTable RelatedEntityBaseTable,
	relatedEntity.BaseView RelatedEntityBaseView,
	relatedEntity.ClassName RelatedEntityClassName,
	relatedEntity.CodeName RelatedEntityCodeName,
	relatedEntity.BaseTableCodeName RelatedEntityBaseTableCodeName,
	uv.Name DisplayUserViewName
FROM
	[__mj].EntityRelationship er
INNER JOIN
	[__mj].Entity e
ON
	er.EntityID = e.ID
INNER JOIN
	[__mj].vwEntities relatedEntity
ON
	er.RelatedEntityID = relatedEntity.ID
LEFT OUTER JOIN
	[__mj].UserView uv
ON	
	er.DisplayUserViewID = uv.ID
GO

 

 
GO
DROP VIEW IF EXISTS [__mj].vwCompanyIntegrations
GO
CREATE VIEW [__mj].vwCompanyIntegrations 
AS
SELECT 
  ci.*,
  c.Name Company,
  i.Name Integration,
  i.ClassName DriverClassName,
  i.ImportPath DriverImportPath,
  cir.ID LastRunID,
  cir.StartedAt LastRunStartedAt,
  cir.EndedAt LastRunEndedAt
FROM 
  __mj.CompanyIntegration ci
INNER JOIN
  __mj.Company c ON ci.CompanyID = c.ID
INNER JOIN
  __mj.Integration i ON ci.IntegrationID = i.ID
LEFT OUTER JOIN
  __mj.CompanyIntegrationRun cir 
ON 
  ci.ID = cir.CompanyIntegrationID AND
  cir.ID = (SELECT TOP 1 cirInner.ID FROM __mj.CompanyIntegrationRun cirInner WHERE cirInner.CompanyIntegrationID = ci.ID ORDER BY StartedAt DESC)  
GO

DROP VIEW IF EXISTS [__mj].vwCompanyIntegrationRuns
GO
CREATE VIEW [__mj].vwCompanyIntegrationRuns
AS
SELECT
    [cir].*,
	[i].Name Integration,
	[c].Name Company,
    [u].[Name] AS [RunByUser]
FROM
    [__mj].[CompanyIntegrationRun] AS [cir]
INNER JOIN
	[__mj].[CompanyIntegration] AS [ci]
  ON
	[cir].[CompanyIntegrationID] = [ci].[ID]
INNER JOIN 
	[__mj].[Company] AS [c]
  ON
	[ci].CompanyID = [c].ID
INNER JOIN
    [__mj].[User] AS [u]
  ON
    [cir].[RunByUserID] = [u].[ID]
INNER JOIN
	[__mj].[Integration] AS [i]
  ON
	[ci].[IntegrationID] = [i].[ID]
GO

DROP VIEW IF EXISTS [__mj].vwCompanyIntegrationRunDetails
GO
CREATE VIEW [__mj].vwCompanyIntegrationRunDetails
AS
SELECT 
    cird.*,
	e.Name Entity,
	cir.StartedAt RunStartedAt,
	cir.EndedAt RunEndedAt
FROM
	__mj.CompanyIntegrationRunDetail cird
INNER JOIN
    __mj.CompanyIntegrationRun cir
ON
    cird.CompanyIntegrationRunID = cir.ID
INNER JOIN
	__mj.Entity e
ON
	cird.EntityID = e.ID
GO

 
DROP VIEW IF EXISTS [__mj].vwEmployees 
GO
CREATE VIEW [__mj].vwEmployees 
AS
SELECT
	e.*,
	TRIM(e.FirstName) + ' ' + TRIM(e.LastName) FirstLast,
	TRIM(s.FirstName) + ' ' + TRIM(s.LastName) Supervisor,
	s.FirstName SupervisorFirstName,
	s.LastName SupervisorLastName,
	s.Email SupervisorEmail
FROM
	__mj.Employee e
LEFT OUTER JOIN
	__mj.Employee s
ON
	e.SupervisorID = s.ID

GO
  

DROP VIEW IF EXISTS [__mj].vwCompanies
GO
CREATE VIEW [__mj].vwCompanies
AS
SELECT * FROM __mj.Company



GO
 

DROP VIEW IF EXISTS [__mj].vwIntegrations
GO
CREATE VIEW [__mj].vwIntegrations AS
SELECT * FROM __mj.Integration
GO

DROP VIEW IF EXISTS [__mj].vwIntegrationURLFormats 
GO
CREATE VIEW [__mj].vwIntegrationURLFormats
AS
SELECT 
	iuf.*,
	i.Name Integration,
	i.NavigationBaseURL,
	i.NavigationBaseURL + iuf.URLFormat FullURLFormat
FROM
	__mj.IntegrationURLFormat iuf
INNER JOIN
	__mj.Integration i
ON
	iuf.IntegrationID = i.ID
GO

DROP VIEW IF EXISTS [__mj].vwUsers
GO
CREATE VIEW [__mj].vwUsers 
AS
SELECT 
	u.*,
	u.FirstName + ' ' + u.LastName FirstLast,
	e.FirstLast EmployeeFirstLast,
	e.Email EmployeeEmail,
	e.Title EmployeeTitle,
	e.Supervisor EmployeeSupervisor,
	e.SupervisorEmail EmployeeSupervisorEmail
FROM 
	[__mj].[User] u
LEFT OUTER JOIN
	vwEmployees e
ON
	u.EmployeeID = e.ID

GO 



DROP VIEW IF EXISTS [__mj].vwUserFavorites
GO
CREATE VIEW [__mj].vwUserFavorites
AS
SELECT 
	uf.*,
	e.Name Entity,
	e.BaseTable EntityBaseTable,
	e.BaseView EntityBaseView
FROM 
	[__mj].UserFavorite uf
INNER JOIN
	vwEntities e
ON
	uf.EntityID = e.ID
GO

 

DROP VIEW IF EXISTS [__mj].vwUserRecordLogs
GO
CREATE VIEW [__mj].vwUserRecordLogs 
AS
SELECT 
	ur.*,
	e.Name Entity,
	u.Name UserName,
	u.FirstLast UserFirstLast,
	u.Email UserEmail,
	u.EmployeeSupervisor UserSupervisor,
	u.EmployeeSupervisorEmail UserSupervisorEmail
FROM
	__mj.UserRecordLog ur
INNER JOIN
	__mj.Entity e 
ON
	ur.EntityID = e.ID
INNER JOIN
	vwUsers u
ON
	ur.UserID = u.ID


GO
DROP VIEW IF EXISTS [__mj].vwUserViews
GO
CREATE VIEW [__mj].vwUserViews
AS
SELECT 
	uv.*,
	u.Name UserName,
	u.FirstLast UserFirstLast,
	u.Email UserEmail,
	u.Type UserType,
	e.Name Entity,
	e.BaseView EntityBaseView
FROM
	__mj.UserView uv
INNER JOIN
	[__mj].vwUsers u
ON
	uv.UserID = u.ID
INNER JOIN
	__mj.Entity e
ON
	uv.EntityID = e.ID


GO
 
 
DROP VIEW IF EXISTS [__mj].vwApplicationEntities
GO
CREATE VIEW [__mj].vwApplicationEntities
AS
SELECT 
   ae.*,
   a.Name Application,
   e.Name Entity,
   e.BaseTable EntityBaseTable,
   e.CodeName EntityCodeName,
   e.ClassName EntityClassName,
   e.BaseTableCodeName EntityBaseTableCodeName
FROM
   __mj.ApplicationEntity ae
INNER JOIN
   __mj.Application a
ON
   ae.ApplicationID = a.ID
INNER JOIN
   [__mj].vwEntities e
ON
   ae.EntityID = e.ID
GO
 

DROP VIEW IF EXISTS [__mj].vwUserApplicationEntities
GO
CREATE VIEW [__mj].vwUserApplicationEntities
AS
SELECT 
   uae.*,
   ua.[Application] Application,
   ua.[User] [User],
   e.Name Entity
FROM
   __mj.UserApplicationEntity uae
INNER JOIN
   [__mj].vwUserApplications ua
ON
   uae.UserApplicationID = ua.ID
INNER JOIN
   __mj.Entity e
ON
   uae.EntityID = e.ID
GO

DROP VIEW IF EXISTS [__mj].vwWorkflowRuns
GO
CREATE VIEW [__mj].vwWorkflowRuns
AS
SELECT 
  wr.*,
  w.Name Workflow,
  we.Name WorkflowEngineName
FROM
  __mj.WorkflowRun wr
INNER JOIN
  [__mj].vwWorkflows w
ON
  wr.WorkflowID = w.ID
INNER JOIN
  __mj.WorkflowEngine we
ON
  w.WorkflowEngineID = we.ID
GO
  


------------------------------------------------------------
----- BASE VIEW FOR ENTITY:     User View Run Details
-----               BASE TABLE: UserViewRunDetail
------------------------------------------------------------
DROP VIEW IF EXISTS [__mj].[vwUserViewRunDetails]
GO
CREATE VIEW [__mj].[vwUserViewRunDetails]
AS
SELECT 
    u.*,
	uv.ID UserViewID,
	uv.EntityID
FROM
    [__mj].[UserViewRunDetail] AS u
INNER JOIN
	[__mj].[UserViewRun] as uvr
  ON
    u.UserViewRunID = uvr.ID
INNER JOIN
    [__mj].[UserView] uv
  ON
    uvr.UserViewID = uv.ID
GO





------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordChange for INTERNAL USE WITHIN DataProvider
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spCreateRecordChange_Internal]
GO
CREATE PROCEDURE [__mj].[spCreateRecordChange_Internal]
    @EntityName nvarchar(100),
    @RecordID NVARCHAR(750),
	  @UserID uniqueidentifier,
    @Type nvarchar(20),
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nchar(15),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [__mj].[RecordChange]
        (
            EntityID,
            RecordID,
			      UserID,
            Type,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            (SELECT ID FROM __mj.Entity WHERE Name = @EntityName),
            @RecordID,
			      @UserID,
            @Type,
            GETUTCDATE(),
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @Comments
        )

    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].vwRecordChanges WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END

GO 
GRANT EXEC ON __mj.spCreateRecordChange_Internal TO cdp_Developer, cdp_Integration, cdp_UI

GO



------------------------------------------------------------
----- BASE VIEW FOR ENTITY:     Entity Permissions
-----               BASE TABLE: EntityPermission
------------------------------------------------------------0
DROP VIEW IF EXISTS [__mj].[vwEntityPermissions]
GO

CREATE VIEW [__mj].[vwEntityPermissions]
AS
SELECT 
    e.*,
    Entity_EntityID.[Name] AS [Entity],
    Role_RoleName.Name as RoleName,
    Role_RoleName.[SQLName] as [RoleSQLName], -- custom bit here to add in this field for vwEntityPermissions
    rlsC.Name as [CreateRLSFilter],
    rlsR.Name as [ReadRLSFilter],
    rlsU.Name as [UpdateRLSFilter],
    rlsD.Name as [DeleteRLSFilter]
FROM
    [__mj].[EntityPermission] AS e
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[Role] AS Role_RoleName
  ON
    [e].[RoleID] = Role_RoleName.ID
LEFT OUTER JOIN
	[__mj].RowLevelSecurityFilter rlsC
  ON
    [e].CreateRLSFilterID = rlsC.ID
LEFT OUTER JOIN
	[__mj].RowLevelSecurityFilter rlsR
  ON
    [e].ReadRLSFilterID = rlsR.ID
LEFT OUTER JOIN
	[__mj].RowLevelSecurityFilter rlsU
  ON
    [e].UpdateRLSFilterID = rlsU.ID
LEFT OUTER JOIN
	[__mj].RowLevelSecurityFilter rlsD
  ON
    [e].DeleteRLSFilterID = rlsD.ID
GO 




----------------------------------------------------------------------------------------
--- This section handles view execution stuff  ---
----------------------------------------------------------------------------------------

DROP PROC IF EXISTS [__mj].spCreateUserViewRunWithDetail
GO

IF TYPE_ID('__mj.IDListTableType') IS NOT NULL
	DROP TYPE __mj.IDListTableType
GO

CREATE TYPE __mj.IDListTableType AS TABLE
(
    ID NVARCHAR(255) NOT NULL
);
GO

CREATE PROCEDURE [__mj].spCreateUserViewRunWithDetail(@UserViewID uniqueidentifier, @UserEmail NVARCHAR(255), @RecordIDList __mj.IDListTableType READONLY) 
AS
DECLARE @RunID uniqueidentifier
DECLARE @Now DATETIME
SELECT @Now=GETDATE()
DECLARE @outputTable TABLE (ID uniqueidentifier, UserViewID uniqueidentifier, RunAt DATETIME, RunByUserID INT, UserView NVARCHAR(100), RunByUser NVARCHAR(100))
DECLARE @UserID uniqueidentifier
SELECT @UserID=ID FROM vwUsers WHERE Email=@UserEmail
INSERT INTO @outputTable
EXEC spCreateUserViewRun @UserViewID=@UserViewID,@RunAt=@Now,@RunByUserID=@UserID
SELECT @RunID = ID FROM @outputTable
INSERT INTO __mj.UserViewRunDetail 
(
    UserViewRunID,
    RecordID
)
(
    SELECT @RunID, ID FROM @RecordIDList
)
SELECT @RunID 'UserViewRunID'
GO
----------------------------------------------------------------------------------------
--- END: SECTION --- This section handles view execution stuff  ---
----------------------------------------------------------------------------------------

 

DROP FUNCTION IF EXISTS [__mj].ToTitleCase
GO
CREATE FUNCTION [__mj].ToTitleCase (@InputString varchar(4000))
RETURNS varchar(4000)
AS
BEGIN
    DECLARE @Index INT
    DECLARE @Char CHAR(1)
    DECLARE @OutputString varchar(255)
    SET @OutputString = LOWER(@InputString)
    SET @Index = 2
    SET @OutputString = STUFF(@OutputString, 1, 1, UPPER(SUBSTRING(@InputString,1,1)))

    WHILE @Index <= LEN(@InputString)
    BEGIN
        SET @Char = SUBSTRING(@InputString, @Index, 1)
        IF @Char IN (' ', ';', ':', '!', '?', ',', '.', '_', '-', '/', '&', '''', '(')
        BEGIN
            IF @Index + 1 <= LEN(@InputString)
            BEGIN
                SET @OutputString = STUFF(@OutputString, @Index + 1, 1, UPPER(SUBSTRING(@InputString, @Index + 1, 1)))
            END
        END
        SET @Index = @Index + 1
    END

    RETURN @OutputString

END
GO

 

DROP VIEW IF EXISTS [__mj].[vwSQLTablesAndEntities]
GO
CREATE VIEW [__mj].[vwSQLTablesAndEntities]
AS
SELECT 
	e.ID EntityID,
	e.Name EntityName,
	e.VirtualEntity,
	t.name TableName,
	s.name SchemaName,
	t.*,
	v.object_id view_object_id,
	v.name ViewName,
    EP_Table.value AS TableDescription, -- Join with sys.extended_properties to get the table description
    EP_View.value AS ViewDescription, -- Join with sys.extended_properties to get the view description
	COALESCE(EP_View.value, EP_Table.value) AS EntityDescription -- grab the view description first and if that doesn't exist, grab the table description and we'll use this as the description for the entity
FROM 
	sys.all_objects t
INNER JOIN
	sys.schemas s 
ON
	t.schema_id = s.schema_id
LEFT OUTER JOIN
	__mj.Entity e 
ON
	t.name = e.BaseTable AND
	s.name = e.SchemaName 
LEFT OUTER JOIN
	sys.all_objects v
ON
	e.BaseView = v.name AND 
	v.type = 'V' 
LEFT OUTER JOIN
    sys.schemas s_v
ON   
    v.schema_id = s_v.schema_id
LEFT OUTER JOIN
    sys.extended_properties EP_Table
ON
    EP_Table.major_id = t.object_id
    AND EP_Table.minor_id = 0
    AND EP_Table.name = 'MS_Description'
LEFT OUTER JOIN
    sys.extended_properties EP_View
ON
    EP_View.major_id = v.object_id
    AND EP_View.minor_id = 0
    AND EP_View.name = 'MS_Description'
WHERE   
    (s_v.name = e.SchemaName OR s_v.name IS NULL) AND
	( t.TYPE = 'U' OR (t.Type='V' AND e.VirtualEntity=1)) -- TABLE - non-virtual entities 
GO

DROP VIEW IF EXISTS [__mj].[vwSQLColumnsAndEntityFields]
GO
CREATE VIEW [__mj].[vwSQLColumnsAndEntityFields]
AS
WITH FilteredColumns AS (
    SELECT *
    FROM sys.all_columns
    WHERE default_object_id IS NOT NULL
)
SELECT 
	e.EntityID,
	e.EntityName Entity,
	e.SchemaName,
	e.TableName TableName,
	ef.ID EntityFieldID,
	ef.Sequence EntityFieldSequence,
	ef.Name EntityFieldName,
	c.column_id Sequence,
  basetable_columns.column_id BaseTableSequence,
	c.name FieldName,
	COALESCE(bt.name, t.name) Type, -- get the type from the base type (bt) if it exists, this is in the case of a user-defined type being used, t.name would be the UDT name.
	IIF(t.is_user_defined = 1, t.name, NULL) UserDefinedType, -- we have a user defined type, so pass that to the view caller too
	c.max_length Length,
	c.precision Precision,
	c.scale Scale,
	c.is_nullable AllowsNull,
	IIF(COALESCE(bt.name, t.name) IN ('timestamp', 'rowversion'), 1, IIF(basetable_columns.is_identity IS NULL, 0, basetable_columns.is_identity)) AutoIncrement,
	c.column_id,
	IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0) IsVirtual, -- updated so that we take into account that computed columns are virtual always, previously only looked for existence of a column in table vs. a view
	basetable_columns.object_id,
	dc.name AS DefaultConstraintName,
  dc.definition AS DefaultValue,
	cc.definition ComputedColumnDefinition,
	COALESCE(EP_View.value, EP_Table.value) AS [Description], -- Dynamically choose description - first look at view level if a description was defined there (rare) and then go to table if it was defined there (often not there either)
	EP_View.value AS ViewColumnDescription,
	EP_Table.value AS TableColumnDescription
FROM
	FilteredColumns c
INNER JOIN
	[__mj].vwSQLTablesAndEntities e
ON
  c.object_id = COALESCE(e.view_object_id, e.object_id)
INNER JOIN
	sys.types t 
ON
	c.user_type_id = t.user_type_id
LEFT OUTER JOIN
    sys.types bt
ON
    t.system_type_id = bt.user_type_id AND t.is_user_defined = 1 -- Join to fetch base type for UDTs
INNER JOIN
	sys.all_objects basetable 
ON
	e.object_id = basetable.object_id
LEFT OUTER JOIN 
    sys.computed_columns cc 
ON 
	e.object_id = cc.object_id AND 
	c.name = cc.name
LEFT OUTER JOIN
	sys.all_columns basetable_columns -- join in all columns from base table and line them up - that way we know if a field is a VIEW only field or a TABLE field (virtual vs. in table)
ON
	basetable.object_id = basetable_columns.object_id AND
	c.name = basetable_columns.name 
LEFT OUTER JOIN
	__mj.EntityField ef 
ON
	e.EntityID = ef.EntityID AND
	c.name = ef.Name
LEFT OUTER JOIN 
    sys.default_constraints dc 
ON 
  e.object_id = dc.parent_object_id AND
	basetable_columns.column_id = dc.parent_column_id
LEFT OUTER JOIN 
    sys.extended_properties EP_Table 
ON 
	EP_Table.major_id = basetable_columns.object_id AND 
	EP_Table.minor_id = basetable_columns.column_id AND 
	EP_Table.name = 'MS_Description' AND
	EP_Table.class_desc = 'OBJECT_OR_COLUMN'
LEFT OUTER JOIN 
    sys.extended_properties EP_View 
ON 
	EP_View.major_id = c.object_id AND 
	EP_View.minor_id = c.column_id AND 
	EP_View.name = 'MS_Description' AND
	EP_View.class_desc = 'OBJECT_OR_COLUMN'
GO



DROP PROC IF EXISTS [__mj].[spDeleteUnneededEntityFields]
GO
CREATE PROC [__mj].[spDeleteUnneededEntityFields]
    @ExcludedSchemaNames NVARCHAR(MAX)

AS
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#DeletedFields') IS NOT NULL
    DROP TABLE #DeletedFields

-- put these two views into temp tables, for some SQL systems, this makes the join below WAY faster
SELECT 
	ef.* 
INTO 
	#ef_spDeleteUnneededEntityFields 
FROM 
	vwEntityFields ef
INNER JOIN
	vwEntities e
ON 
	ef.EntityID = e.ID
-- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    e.VirtualEntity = 0 AND -- exclude virtual entities from this always
    excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded

-- get actual fields from the database so we can compare MJ metadata to the SQL catalog
SELECT * INTO #actual_spDeleteUnneededEntityFields FROM vwSQLColumnsAndEntityFields   

-- now figure out which fields are NO longer in the DB and should be removed from MJ metadata
SELECT ef.* INTO #DeletedFields 	 
	FROM 
	  #ef_spDeleteUnneededEntityFields ef 
	LEFT JOIN
	  #actual_spDeleteUnneededEntityFields actual 
	  ON
	  ef.EntityID=actual.EntityID AND
	  ef.Name = actual.EntityFieldName
	WHERE 
	  actual.column_id IS NULL  


-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE __mj.Entity SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN
(
  SELECT DISTINCT EntityID FROM #DeletedFields
)

-- next delete the entity field values
DELETE FROM __mj.EntityFieldValue WHERE EntityFieldID IN (
  SELECT ID FROM #DeletedFields
)

-- now delete the entity fields themsevles
DELETE FROM __mj.EntityField WHERE ID IN
(
  SELECT ID FROM #DeletedFields
)

-- return the deleted fields to the caller
SELECT * FROM #DeletedFields

-- clean up and get rid of our temp tables now
DROP TABLE #ef_spDeleteUnneededEntityFields
DROP TABLE #actual_spDeleteUnneededEntityFields
DROP TABLE #DeletedFields
GO













DROP PROCEDURE IF EXISTS [__mj].[spUpdateExistingEntitiesFromSchema];
GO

CREATE PROCEDURE [__mj].spUpdateExistingEntitiesFromSchema
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    -- Declare a table variable to store the filtered rows
    DECLARE @FilteredRows TABLE (
        ID UNIQUEIDENTIFIER,
        Name NVARCHAR(500),
        CurrentDescription NVARCHAR(MAX),
        NewDescription NVARCHAR(MAX),
        EntityDescription NVARCHAR(MAX),
        SchemaName NVARCHAR(MAX)
    );

    INSERT INTO @FilteredRows
        SELECT 
            e.ID,
            e.Name,
            e.Description AS CurrentDescription,
            IIF(e.AutoUpdateDescription = 1, CONVERT(NVARCHAR(MAX), fromSQL.EntityDescription), e.Description) AS NewDescription,
            CONVERT(NVARCHAR(MAX),fromSQL.EntityDescription),
            CONVERT(NVARCHAR(MAX),fromSQL.SchemaName)
        FROM
            [__mj].[Entity] e
        INNER JOIN
            [__mj].[vwSQLTablesAndEntities] fromSQL
        ON
            e.ID = fromSQL.EntityID
        LEFT JOIN
            STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
        ON
            fromSQL.SchemaName = excludedSchemas.value
        WHERE
            e.VirtualEntity = 0 
            AND excludedSchemas.value IS NULL -- Exclude rows with matching SchemaName
            AND ISNULL(IIF(e.AutoUpdateDescription = 1, CONVERT(NVARCHAR(MAX), fromSQL.EntityDescription), e.Description),'') <> ISNULL(e.Description,'') -- Only rows with changes

    -- Perform the update
    UPDATE e
    SET
        Description = fr.NewDescription
    FROM
        [__mj].[Entity] e
    INNER JOIN
        @FilteredRows fr
    ON
        e.ID = fr.ID;

    -- Return the modified rows
    SELECT * FROM @FilteredRows;
END;
GO
 


DROP PROC IF EXISTS [__mj].[spUpdateExistingEntityFieldsFromSchema]
GO
CREATE PROC [__mj].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    -- Step 1: Parse the excluded schema names into a table variable
    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

    -- Step 2: Declare a table variable to store filtered rows
    DECLARE @FilteredRows TABLE (
        EntityID UNIQUEIDENTIFIER,
        EntityName NVARCHAR(500),
        EntityFieldID UNIQUEIDENTIFIER,
        EntityFieldName NVARCHAR(500),
        AutoUpdateDescription BIT,
        ExistingDescription NVARCHAR(MAX),
        SQLDescription NVARCHAR(MAX),
        Type NVARCHAR(255),
        Length INT,
        Precision INT,
        Scale INT,
        AllowsNull BIT,
        DefaultValue NVARCHAR(MAX),
        AutoIncrement BIT,
        IsVirtual BIT,
        Sequence INT,
        RelatedEntityID UNIQUEIDENTIFIER,
        RelatedEntityFieldName NVARCHAR(255),
        IsPrimaryKey BIT,
        IsUnique BIT
    );

    -- Step 3: Populate the table variable with filtered rows
    INSERT INTO @FilteredRows
    SELECT
        e.ID as EntityID,
        e.Name as EntityName,
        ef.ID AS EntityFieldID,
        ef.Name as EntityFieldName,
        ef.AutoUpdateDescription,
        ef.Description AS ExistingDescription,
        CONVERT(nvarchar(max),fromSQL.Description) AS SQLDescription,
        fromSQL.Type,
        fromSQL.Length,
        fromSQL.Precision,
        fromSQL.Scale,
        fromSQL.AllowsNull,
        CONVERT(nvarchar(max),fromSQL.DefaultValue),
        fromSQL.AutoIncrement,
        fromSQL.IsVirtual,
        fromSQL.Sequence,
        re.ID AS RelatedEntityID,
        fk.referenced_column AS RelatedEntityFieldName,
        CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey,
        CASE 
            WHEN pk.ColumnName IS NOT NULL THEN 1 
            ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
        END AS IsUnique
    FROM
        [__mj].EntityField ef
    INNER JOIN
        vwSQLColumnsAndEntityFields fromSQL
    ON
        ef.EntityID = fromSQL.EntityID AND
        ef.Name = fromSQL.FieldName
    INNER JOIN
        [__mj].Entity e 
    ON
        ef.EntityID = e.ID
    LEFT OUTER JOIN
        vwForeignKeys fk
    ON
        ef.Name = fk.[column] AND
        e.BaseTable = fk.[table] AND
        e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN 
        [__mj].Entity re -- Related Entity
    ON
        re.BaseTable = fk.referenced_table AND
        re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN 
        [__mj].vwTablePrimaryKeys pk
    ON
        e.BaseTable = pk.TableName AND
        ef.Name = pk.ColumnName AND
        e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN 
        [__mj].vwTableUniqueKeys uk
    ON
        e.BaseTable = uk.TableName AND
        ef.Name = uk.ColumnName AND
        e.SchemaName = uk.SchemaName
    LEFT OUTER JOIN
        @ExcludedSchemas excludedSchemas
    ON
        e.SchemaName = excludedSchemas.SchemaName
    WHERE
        e.VirtualEntity = 0
        AND excludedSchemas.SchemaName IS NULL -- Only include non-excluded schemas
        AND ef.ID IS NOT NULL -- Only where we have already created EntityField records
        AND (
          -- this large filtering block includes ONLY the rows that have changes
          ISNULL(LTRIM(RTRIM(ef.Description)), '') <> ISNULL(LTRIM(RTRIM(IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX), fromSQL.Description), ef.Description))), '') OR
          ef.Type <> fromSQL.Type OR
          ef.Length <> fromSQL.Length OR
          ef.Precision <> fromSQL.Precision OR
          ef.Scale <> fromSQL.Scale OR
          ef.AllowsNull <> fromSQL.AllowsNull OR
          ISNULL(LTRIM(RTRIM(ef.DefaultValue)), '') <> ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), fromSQL.DefaultValue))), '') OR
          ef.AutoIncrement <> fromSQL.AutoIncrement OR
          ef.IsVirtual <> fromSQL.IsVirtual OR
          ef.Sequence <> fromSQL.Sequence OR
          ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, ef.RelatedEntityID), '00000000-0000-0000-0000-000000000000') <> ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, re.ID), '00000000-0000-0000-0000-000000000000') OR -- Use TRY_CONVERT here
          ISNULL(LTRIM(RTRIM(ef.RelatedEntityFieldName)), '') <> ISNULL(LTRIM(RTRIM(fk.referenced_column)), '') OR
          ef.IsPrimaryKey <> CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END OR
          ef.IsUnique <> CASE 
              WHEN pk.ColumnName IS NOT NULL THEN 1 
              ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
          END
        );

    -- Step 4: Perform the update using the table variable
    UPDATE ef
    SET
        ef.Description = IIF(fr.AutoUpdateDescription=1, fr.SQLDescription, ef.Description),
        ef.Type = fr.Type,
        ef.Length = fr.Length,
        ef.Precision = fr.Precision,
        ef.Scale = fr.Scale,
        ef.AllowsNull = fr.AllowsNull,
        ef.DefaultValue = fr.DefaultValue,
        ef.AutoIncrement = fr.AutoIncrement,
        ef.IsVirtual = fr.IsVirtual,
        ef.Sequence = fr.Sequence,
        ef.RelatedEntityID = IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityID, ef.RelatedEntityID), -- if AutoUpdate is not on, respect the current value
        ef.RelatedEntityFieldName = IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityFieldName, ef.RelatedEntityFieldName), -- if AutoUpdate is not on, respect the current value
        ef.IsPrimaryKey = fr.IsPrimaryKey,
        ef.IsUnique = fr.IsUnique,
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].EntityField ef
    INNER JOIN
        @FilteredRows fr
    ON
        ef.ID = fr.EntityFieldID;

    -- Step 5: Return the modified rows
    SELECT * FROM @FilteredRows;
END;
GO
 

DROP VIEW IF EXISTS [__mj].[vwEntityFieldValues]
GO

CREATE VIEW [__mj].[vwEntityFieldValues]
AS
SELECT 
    efv.*,
    ef.[Name] AS [EntityField],
    ef.[Entity],
    ef.[EntityID]
FROM
    [__mj].[EntityFieldValue] AS efv
INNER JOIN
    [__mj].[vwEntityFields] AS ef
  ON
    [efv].[EntityFieldID] = ef.ID 
GO



DROP VIEW IF EXISTS [__mj].[vwVersionInstallations]
GO

CREATE VIEW [__mj].[vwVersionInstallations]
AS
SELECT 
    v.*,
	CONVERT(nvarchar(100),v.MajorVersion) + '.' + CONVERT(nvarchar(100),v.MinorVersion) + '.' + CONVERT(nvarchar(100),v.PatchVersion,100) AS CompleteVersion
FROM
    [__mj].[VersionInstallation] AS v
GO



DROP VIEW IF EXISTS [__mj].[vwWorkflows]
GO

CREATE VIEW [__mj].[vwWorkflows]
AS
SELECT 
    w.*,
	AutoRunInterval * (CASE AutoRunIntervalUnits
        WHEN 'Minutes' THEN 1
        WHEN 'Hours' THEN 60 -- 60 minutes in an hour
        WHEN 'Days' THEN 60 * 24 -- 1440 minutes in a day
        WHEN 'Weeks' THEN 60 * 24 * 7 -- 10080 minutes in a week
        WHEN 'Months' THEN 60 * 24 * 30 -- Approximately 43200 minutes in a month
        ELSE 0 END) AS AutoRunIntervalMinutes
FROM
    [__mj].[Workflow] AS w
GO



DROP PROC IF EXISTS [__mj].[spSetDefaultColumnWidthWhereNeeded]
GO
CREATE PROC [__mj].[spSetDefaultColumnWidthWhereNeeded]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
/**************************************************************************************/
/* Generate default column widths for columns that don't have a width set*/
/**************************************************************************************/

UPDATE
	ef 
SET 
	DefaultColumnWidth =  
	IIF(ef.Type = 'int', 50, 
		IIF(ef.Type = 'datetimeoffset', 100,
			IIF(ef.Type = 'money', 100, 
				IIF(ef.Type ='nchar', 75,
					150)))
		), 
	__mj_UpdatedAt = GETUTCDATE()
FROM 
	__mj.EntityField ef
INNER JOIN
	__mj.Entity e
ON
	ef.EntityID = e.ID
-- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    ef.DefaultColumnWidth IS NULL AND
	excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded
GO




DROP PROC IF EXISTS [__mj].[spDeleteConversation]
GO
CREATE PROCEDURE [__mj].[spDeleteConversation]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Report - set FK to null before deleting rows in Conversation
    UPDATE 
        [__mj].[Report] 
    SET 
        [ConversationID] = NULL 
    WHERE 
        [ConversationID] = @ID

	UPDATE 
        [__mj].[Report] 
    SET 
        [ConversationDetailID] = NULL 
    WHERE 
        [ConversationDetailID] IN (SELECT ID FROM __mj.ConversationDetail WHERE ConversationID = @ID)

    
    -- Cascade delete from ConversationDetail
    DELETE FROM 
        [__mj].[ConversationDetail] 
    WHERE 
        [ConversationID] = @ID
    
    DELETE FROM 
        [__mj].[Conversation]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the ID to indicate we successfully deleted the record
END
GO

DROP PROC IF EXISTS [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] 
GO
CREATE PROC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] 
(
	@EntityFieldID uniqueidentifier, 
	@RelatedEntityNameFieldMap NVARCHAR(50)
)
AS
UPDATE 
	__mj.EntityField 
SET 
	RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap
WHERE
	ID = @EntityFieldID
GO

DROP VIEW IF EXISTS [__mj].[vwCompanyIntegrationRunsRanked] 
GO
CREATE VIEW [__mj].[vwCompanyIntegrationRunsRanked] AS
SELECT
	ci.ID,
	ci.CompanyIntegrationID,
	ci.StartedAt,
	ci.EndedAt,
	ci.TotalRecords,
	ci.RunByUserID,
	ci.Comments,
	RANK() OVER(PARTITION BY ci.CompanyIntegrationID ORDER BY ci.ID DESC) [RunOrder]
 FROM
	__mj.CompanyIntegrationRun ci
GO



DROP PROC IF EXISTS [__mj].[spGetAuthenticationDataByExternalSystemID]
GO
CREATE PROC [__mj].[spGetAuthenticationDataByExternalSystemID] 
	@IntegrationName NVARCHAR(100), 
	@ExternalSystemID NVARCHAR(100),
	@AccessToken NVARCHAR(255)=NULL OUTPUT,
	@RefreshToken NVARCHAR(255)=NULL OUTPUT,
	@TokenExpirationDate DATETIME=NULL OUTPUT,
	@APIKey NVARCHAR(255)=NULL OUTPUT
AS

SET @IntegrationName = TRIM(@IntegrationName)
SET @ExternalSystemID = TRIM(@ExternalSystemID)

SELECT
	@AccessToken = ci.AccessToken,
	@RefreshToken = ci.RefreshToken,
	@TokenExpirationDate = ci.TokenExpirationDate,
	@APIKey = ci.APIKey
FROM
	__mj.CompanyIntegration ci
JOIN __mj.Integration i
	ON i.ID = ci.IntegrationID
WHERE 
	i.Name = @IntegrationName
	AND ci.ExternalSystemID = @ExternalSystemID
	AND ci.IsActive = 1
GO


DROP VIEW IF EXISTS __mj.vwEntityFieldsWithCheckConstraints
GO
CREATE VIEW __mj.vwEntityFieldsWithCheckConstraints
AS
SELECT 
    e.ID as EntityID,
    e.Name as EntityName,
    ef.ID as EntityFieldID,
    ef.Name as EntityFieldName,
	  gc.ID as GeneratedCodeID,
	  gc.Name as GeneratedValidationFunctionName,
	  gc.Description as GeneratedValidationFunctionDescription,
    gc.Code as GeneratedValidationFunctionCode,
    gc.Source as GeneratedValidationFunctionCheckConstraint,
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
LEFT OUTER JOIN -- left join since can have table level constraints
    sys.columns col ON col.object_id = obj.object_id AND col.column_id = cc.parent_column_id
LEFT OUTER JOIN -- left join since can have table level constraints
  __mj.EntityField ef
  ON
  e.ID = ef.EntityID AND
  ef.Name = col.name
LEFT OUTER JOIN
  __mj.vwGeneratedCodes gc 
  ON -- EITHER JOIN ON EntityField or Entity depending on which type of constraint we have here
  (   (ef.ID IS NOT NULL AND gc.LinkedEntity='Entity Fields' AND gc.LinkedRecordPrimaryKey=ef.ID)
        OR
      (ef.ID IS NULL and gc.LinkedEntity='Entities' AND gc.LinkedRecordPrimaryKey=e.ID)   
  ) AND -- MUST MATCH Source=definition
  cc.definition = gc.Source
GO





/************* EXTERNAL TRACK CHANGES STUFF HERE *********/
DROP VIEW IF EXISTS __mj.vwEntitiesWithExternalChangeTracking 
GO
CREATE VIEW __mj.vwEntitiesWithExternalChangeTracking 
AS
SELECT   
  e.* 
FROM 
  __mj.vwEntities e
WHERE
  e.TrackRecordChanges=1
  AND
    EXISTS (
		  SELECT 
			  1 
		  FROM 
			  __mj.vwEntityFields ef 
		  WHERE 
			  ef.Name='__mj_UpdatedAt' AND ef.Type='datetimeoffset' AND ef.EntityID = e.ID
		  )
  AND
    EXISTS (
		  SELECT 
			  1 
		  FROM 
			  __mj.vwEntityFields ef 
		  WHERE 
			  ef.Name='__mj_CreatedAt' AND ef.Type='datetimeoffset' AND ef.EntityID = e.ID
		  )
GO

GRANT SELECT ON __mj.vwEntitiesWithExternalChangeTracking TO cdp_Developer, cdp_Integration, cdp_UI
GO


DROP VIEW IF EXISTS  __mj.vwEntitiesWithMissingBaseTables
GO
CREATE VIEW __mj.vwEntitiesWithMissingBaseTables
AS
SELECT 
    e.*
FROM 
    __mj.vwEntities e
LEFT JOIN 
    INFORMATION_SCHEMA.TABLES t
ON 
    e.SchemaName = t.TABLE_SCHEMA AND 
    e.BaseTable = t.TABLE_NAME
WHERE 
    t.TABLE_NAME IS NULL
GO
GRANT SELECT ON __mj.vwEntitiesWithMissingBaseTables TO cdp_Developer

GO




DROP PROC IF EXISTS __mj.spDeleteEntityWithCoreDependencies
GO
CREATE PROC __mj.spDeleteEntityWithCoreDependencies
  @EntityID uniqueidentifier
AS
DELETE FROM __mj.EntityFieldValue WHERE EntityFieldID IN (SELECT ID FROM __mj.EntityField WHERE EntityID = @EntityID)
DELETE FROM __mj.EntitySetting WHERE EntityID = @EntityID
DELETE FROM __mj.EntityField WHERE EntityID = @EntityID
DELETE FROM __mj.EntityPermission WHERE EntityID = @EntityID
DELETE FROM __mj.EntityRelationship WHERE EntityID = @EntityID OR RelatedEntityID = @EntityID
DELETE FROM __mj.UserApplicationEntity WHERE EntityID = @EntityID
DELETE FROM __mj.ApplicationEntity WHERE EntityID = @EntityID
DELETE FROM __mj.RecordChange WHERE EntityID = @EntityID
DELETE FROM __mj.AuditLog WHERE EntityID=@EntityID
DELETE FROM __mj.[Conversation] WHERE LinkedEntityID=@EntityID
DELETE FROM __mj.ListDetail WHERE ListID IN (SELECT ID FROM __mj.List WHERE EntityID=@EntityID)
DELETE FROM __mj.List WHERE EntityID=@EntityID

DELETE FROM [__mj].[EntityDocument] WHERE [EntityID] = @EntityID;
DELETE FROM [__mj].[CompanyIntegrationRecordMap] WHERE [EntityID] = @EntityID;
DELETE FROM [__mj].[ResourceType] WHERE [EntityID] = @EntityID;
DELETE FROM [__mj].[UserApplicationEntity] WHERE [EntityID] = @EntityID;

UPDATE __mj.Dataset SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN (SELECT DatasetID FROM __mj.DatasetItem WHERE EntityID=@EntityID)
DELETE FROM [__mj].[DatasetItem] WHERE [EntityID] = @EntityID;

DELETE FROM [__mj].[UserViewCategory] WHERE [EntityID] = @EntityID;
DELETE FROM [__mj].[UserView] WHERE [EntityID] = @EntityID;

DELETE FROM [__mj].[EntityAIAction] WHERE [EntityID] = @EntityID;
DELETE FROM [__mj].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;
DELETE FROM [__mj].[EntityAIAction] WHERE [OutputEntityID] = @EntityID;

DELETE FROM __mj.Entity WHERE ID = @EntityID
GO




/****
 Utility SPROC for migrating CreatedAt/UpdatedAt columns to the new __mj_CreatedAt and __mj_UpdatedAt columns
 !!!USE WITH CAUTION!!!!
***/
DROP PROC IF EXISTS __mj.CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns
GO
CREATE PROCEDURE __mj.CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns
    @SchemaName NVARCHAR(255),
    @TableName NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @sql NVARCHAR(MAX);
    DECLARE @constraintName NVARCHAR(255);

    BEGIN TRY
        -- Construct the SQL command for updating the columns
        SET @sql = 'UPDATE [' + @SchemaName + '].[' + @TableName + '] SET __mj_CreatedAt = CreatedAt, __mj_UpdatedAt = UpdatedAt;';
        EXEC sp_executesql @sql;

        -- Drop default constraint on CreatedAt
        SELECT @constraintName = d.name
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.columns c ON t.object_id = c.object_id
        JOIN sys.default_constraints d ON c.default_object_id = d.object_id
        WHERE s.name = @SchemaName 
        AND t.name = @TableName 
        AND c.name = 'CreatedAt';
        
        IF @constraintName IS NOT NULL
        BEGIN
            SET @sql = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP CONSTRAINT ' + @constraintName + ';';
            EXEC sp_executesql @sql;
        END

        -- Drop default constraint on UpdatedAt
        SELECT @constraintName = d.name
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.columns c ON t.object_id = c.object_id
        JOIN sys.default_constraints d ON c.default_object_id = d.object_id
        WHERE s.name = @SchemaName 
        AND t.name = @TableName 
        AND c.name = 'UpdatedAt';
        
        IF @constraintName IS NOT NULL
        BEGIN
            SET @sql = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP CONSTRAINT ' + @constraintName + ';';
            EXEC sp_executesql @sql;
        END

        -- Construct the SQL command for dropping the old columns
        SET @sql = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP COLUMN CreatedAt, UpdatedAt;';
        EXEC sp_executesql @sql;

        PRINT 'Finished Updating ' + @SchemaName + '.' + @TableName + ' below is the new data for that table'

        SET @sql = 'SELECT * FROM [' + @SchemaName + '].[' + @TableName + '];';
        EXEC sp_executesql @sql;
    END TRY
    BEGIN CATCH
        -- Error handling
        DECLARE @ErrorMessage NVARCHAR(4000);
        DECLARE @ErrorSeverity INT;
        DECLARE @ErrorState INT;

        SELECT 
            @ErrorMessage = ERROR_MESSAGE(),
            @ErrorSeverity = ERROR_SEVERITY(),
            @ErrorState = ERROR_STATE();

        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END

/**
    UNIQUE CONSTRAINT on EntityField to ensure that no two fields can have the same EntityID and Sequence
**/

-- Drop the constraint if it exists
IF OBJECT_ID('UQ_EntityField_EntityID_Sequence', 'UQ') IS NOT NULL
BEGIN
    ALTER TABLE [__mj].[EntityField]
    DROP CONSTRAINT UQ_EntityField_EntityID_Sequence;
END

-- Add the unique constraint
ALTER TABLE [__mj].[EntityField]
ADD CONSTRAINT UQ_EntityField_EntityID_Sequence 
UNIQUE (EntityID, Sequence);

GO

-- Create stored procedure to recompile all stored procedures in dependency order
-- This preserves code, comments, and permissions while forcing new execution plans
DROP PROCEDURE IF EXISTS [__mj].[spRecompileAllProceduresInDependencyOrder]
GO

CREATE PROCEDURE [__mj].[spRecompileAllProceduresInDependencyOrder]
    @ExcludedSchemaNames NVARCHAR(MAX) = 'sys,staging',
    @LogOutput BIT = 1,
    @ContinueOnError BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    -- Create table to hold all procedures with dependency count
    CREATE TABLE #Procedures (
        ObjectId INT PRIMARY KEY,
        FullObjectName NVARCHAR(260),
        SchemaName NVARCHAR(128),
        DependencyCount INT DEFAULT 0,
        IsProcessed BIT DEFAULT 0,
        ProcessOrder INT NULL
    );

    -- Create table for excluded schemas
    CREATE TABLE #ExcludedSchemas (SchemaName NVARCHAR(128));
    
    -- Parse excluded schemas using simple string manipulation
    DECLARE @Pos INT = 1;
    DECLARE @NextPos INT;
    DECLARE @Schema NVARCHAR(128);
    
    IF @ExcludedSchemaNames IS NOT NULL AND LEN(@ExcludedSchemaNames) > 0
    BEGIN
        SET @ExcludedSchemaNames = @ExcludedSchemaNames + ',';
        
        WHILE @Pos <= LEN(@ExcludedSchemaNames)
        BEGIN
            SET @NextPos = CHARINDEX(',', @ExcludedSchemaNames, @Pos);
            IF @NextPos > 0
            BEGIN
                SET @Schema = LTRIM(RTRIM(SUBSTRING(@ExcludedSchemaNames, @Pos, @NextPos - @Pos)));
                IF LEN(@Schema) > 0
                    INSERT INTO #ExcludedSchemas (SchemaName) VALUES (@Schema);
                SET @Pos = @NextPos + 1;
            END
            ELSE
                BREAK;
        END
    END

    -- Get all procedures not in excluded schemas
    INSERT INTO #Procedures (ObjectId, FullObjectName, SchemaName)
    SELECT 
        o.object_id,
        QUOTENAME(s.name) + '.' + QUOTENAME(o.name),
        s.name
    FROM sys.objects o
    INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
    WHERE o.type = 'P'
        AND NOT EXISTS (SELECT 1 FROM #ExcludedSchemas es WHERE es.SchemaName = s.name);

    -- Count dependencies for each procedure
    UPDATE p
    SET DependencyCount = (
        SELECT COUNT(DISTINCT d.referenced_id)
        FROM sys.sql_expression_dependencies d
        INNER JOIN sys.objects do ON d.referenced_id = do.object_id
        WHERE d.referencing_id = p.ObjectId
            AND do.type = 'P'
            AND d.referenced_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM #Procedures p2 WHERE p2.ObjectId = d.referenced_id)
    )
    FROM #Procedures p;

    -- Process procedures in order of dependency count
    DECLARE @ProcessOrder INT = 1;
    DECLARE @CurrentCount INT = 0;
    DECLARE @MaxIterations INT = 100; -- Safety limit
    DECLARE @Iteration INT = 0;

    -- First, process all procedures with no dependencies
    UPDATE #Procedures
    SET IsProcessed = 1, ProcessOrder = @ProcessOrder
    WHERE DependencyCount = 0;

    -- Then process remaining procedures
    WHILE EXISTS (SELECT 1 FROM #Procedures WHERE IsProcessed = 0) AND @Iteration < @MaxIterations
    BEGIN
        SET @Iteration = @Iteration + 1;
        SET @ProcessOrder = @ProcessOrder + 1;
        
        -- Mark procedures as ready if all their dependencies are processed
        UPDATE p
        SET IsProcessed = 1, ProcessOrder = @ProcessOrder
        FROM #Procedures p
        WHERE p.IsProcessed = 0
            AND NOT EXISTS (
                SELECT 1
                FROM sys.sql_expression_dependencies d
                INNER JOIN #Procedures dp ON dp.ObjectId = d.referenced_id
                WHERE d.referencing_id = p.ObjectId
                    AND dp.IsProcessed = 0
            );
            
        -- If nothing was processed in this iteration, process remaining (circular dependencies)
        IF @@ROWCOUNT = 0
        BEGIN
            UPDATE #Procedures
            SET IsProcessed = 1, ProcessOrder = 999
            WHERE IsProcessed = 0;
            BREAK;
        END
    END

    -- Execute recompilation in order
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ObjectName NVARCHAR(260);
    DECLARE @Success INT = 0, @Errors INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    DECLARE obj_cursor CURSOR FOR
    SELECT FullObjectName
    FROM #Procedures
    ORDER BY ProcessOrder, FullObjectName;

    OPEN obj_cursor;
    FETCH NEXT FROM obj_cursor INTO @ObjectName;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @SQL = 'EXEC sp_recompile ''' + @ObjectName + '''';
        
        BEGIN TRY
            EXEC sp_executesql @SQL;
            SET @Success = @Success + 1;
            
            IF @LogOutput = 1
                PRINT 'SUCCESS: Recompiled ' + @ObjectName;
        END TRY
        BEGIN CATCH
            SET @Errors = @Errors + 1;
            
            IF @LogOutput = 1
                PRINT 'ERROR: ' + @ObjectName + ' - ' + ERROR_MESSAGE();
            
            IF @ContinueOnError = 0
            BEGIN
                CLOSE obj_cursor;
                DEALLOCATE obj_cursor;
                THROW;
            END
        END CATCH
        
        FETCH NEXT FROM obj_cursor INTO @ObjectName;
    END

    CLOSE obj_cursor;
    DEALLOCATE obj_cursor;

    -- Summary report
    IF @LogOutput = 1
    BEGIN
        DECLARE @Duration INT = DATEDIFF(SECOND, @StartTime, GETDATE());
        DECLARE @TotalObjects INT = (SELECT COUNT(*) FROM #Procedures);
        
        PRINT '';
        PRINT '=== Recompilation Summary ===';
        PRINT 'Total Objects: ' + CAST(@TotalObjects AS VARCHAR(10));
        PRINT 'Successful Recompilations: ' + CAST(@Success AS VARCHAR(10));
        PRINT 'Errors: ' + CAST(@Errors AS VARCHAR(10));
        PRINT 'Duration: ' + CAST(@Duration AS VARCHAR(10)) + ' seconds';
        PRINT '===========================';
    END

    -- Clean up
    DROP TABLE #Procedures;
    DROP TABLE #ExcludedSchemas;
END
GO