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
	IIF(1 = ISNUMERIC(LEFT(e.Name, 1)),'_','') + REPLACE(e.Name, ' ', '') CodeName,
	IIF(1 = ISNUMERIC(LEFT(e.BaseTable, 1)),'_','') + REPLACE(e.BaseTable, ' ', '_') + IIF(e.NameSuffix IS NULL, '', e.NameSuffix) ClassName,
	IIF(1 = ISNUMERIC(LEFT(e.BaseTable, 1)),'_','') + REPLACE(e.BaseTable, ' ', '_') + IIF(e.NameSuffix IS NULL, '', e.NameSuffix) BaseTableCodeName,
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
	uv.Name DisplayUserViewName,
	uv.ID DisplayUserViewID
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
	er.DisplayUserViewGUID = uv.GUID
GO

 

 
GO
DROP VIEW IF EXISTS [__mj].vwCompanyIntegrations
GO
CREATE VIEW [__mj].vwCompanyIntegrations 
AS
SELECT 
  ci.*,
  c.ID CompanyID,
  i.ID IntegrationID,
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
  __mj.Company c ON ci.CompanyName = c.Name
INNER JOIN
  __mj.Integration i ON ci.IntegrationName = i.Name
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
   cir.*,
   ci.CompanyName Company,
   ci.IntegrationName Integration
FROM
   __mj.CompanyIntegrationRun cir
INNER JOIN
   __mj.CompanyIntegration ci
ON
   cir.CompanyIntegrationID = ci.ID
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
	i.ID IntegrationID,
	i.Name Integration,
	i.NavigationBaseURL,
	i.NavigationBaseURL + iuf.URLFormat FullURLFormat
FROM
	__mj.IntegrationURLFormat iuf
INNER JOIN
	__mj.Integration i
ON
	iuf.IntegrationName = i.Name
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
   ae.ApplicationName = a.Name
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
  w.WorkflowEngineName
FROM
  __mj.WorkflowRun wr
INNER JOIN
  [__mj].vwWorkflows w
ON
  wr.WorkflowName = w.Name
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
----- CREATE PROCEDURE FOR RecordChange
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spCreateRecordChange]
GO
CREATE PROCEDURE [__mj].[spCreateRecordChange]
    @EntityName nvarchar(100),
    @RecordID NVARCHAR(255),
	@UserID int,
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nchar(15),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO 
    [__mj].[RecordChange]
        (
            EntityID,
            RecordID,
			UserID,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments
        )
    VALUES
        (
            (SELECT ID FROM __mj.Entity WHERE Name = @EntityName),
            @RecordID,
			@UserID,
            GETDATE(),
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @Comments
        )

    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].vwRecordChanges WHERE ID = SCOPE_IDENTITY()
END




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
    [e].[RoleName] = Role_RoleName.[Name]
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

CREATE PROCEDURE [__mj].spCreateUserViewRunWithDetail(@UserViewID INT, @UserEmail NVARCHAR(255), @RecordIDList __mj.IDListTableType READONLY) 
AS
DECLARE @RunID INT
DECLARE @Now DATETIME
SELECT @Now=GETDATE()
DECLARE @outputTable TABLE (ID INT, UserViewID INT, RunAt DATETIME, RunByUserID INT, UserView NVARCHAR(100), RunByUser NVARCHAR(100))
DECLARE @UserID INT
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


 
DROP PROC IF EXISTS [__mj].spGetNextEntityID
GO
CREATE PROC [__mj].spGetNextEntityID
    @schemaName NVARCHAR(255)
AS
BEGIN
    DECLARE @EntityIDMin INT;
    DECLARE @EntityIDMax INT;
    DECLARE @MaxEntityID INT;
	DECLARE @NextID INT;

    -- STEP 1: Get EntityIDMin and EntityIDMax from __mj.SchemaInfo
    SELECT 
		@EntityIDMin = EntityIDMin, @EntityIDMax = EntityIDMax
    FROM 
		__mj.SchemaInfo
    WHERE 
		SchemaName = @schemaName;

    -- STEP 2: If no matching schemaName, insert a new row into __mj.SchemaInfo
    IF @EntityIDMin IS NULL OR @EntityIDMax IS NULL
    BEGIN
        -- Get the maximum ID from the __mj.Entity table
		DECLARE @MaxEntityIDFromSchema INT;
        SELECT @MaxEntityID = ISNULL(MAX(ID), 0) FROM __mj.Entity;
		SELECT @MaxEntityIDFromSchema = ISNULL(MAX(EntityIDMax),0) FROM __mj.SchemaInfo;
		IF @MaxEntityIDFromSchema > @MaxEntityID 
			SELECT @MaxEntityID = @MaxEntityIDFromSchema; -- use the max ID From the schema info table if it is higher

        -- Calculate the new EntityIDMin
        SET @EntityIDMin = CASE 
                              WHEN @MaxEntityID >= 25000001 THEN @MaxEntityID + 1
                              ELSE 25000001
                            END;

        -- Calculate the new EntityIDMax
        SET @EntityIDMax = @EntityIDMin + 24999;

        -- Insert the new row into __mj.SchemaInfo
        INSERT INTO __mj.SchemaInfo (SchemaName, EntityIDMin, EntityIDMax)
        VALUES (@schemaName, @EntityIDMin, @EntityIDMax);
    END

    -- STEP 3: Get the maximum ID currently in the __mj.Entity table within the range
    SELECT 
		@NextID = ISNULL(MAX(ID), @EntityIDMin - 1) -- we subtract 1 from entityIDMin as it will be used the first time if Max(EntityID) is null, and below we will increment it by one to be the first ID in that range
    FROM 
		__mj.Entity
    WHERE 
		ID BETWEEN @EntityIDMin AND @EntityIDMax

    -- STEP 4: Increment to get the next ID
    SET @NextID = @NextID + 1;

    -- STEP 5: Check if the next ID is within the allowed range for the schema in question
    IF @NextID > @EntityIDMax
		BEGIN
			SELECT -1 AS NextID -- calling code needs to konw this is an invalid condition
		END
	ELSE
		SELECT @NextID AS NextID
END;

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
SELECT 
	e.EntityID,
	e.EntityName Entity,
	e.SchemaName,
	e.TableName TableName,
	ef.ID EntityFieldID,
	ef.Sequence EntityFieldSequence,
	ef.Name EntityFieldName,
	c.column_id Sequence,
	c.name FieldName,
	COALESCE(bt.name, t.name) Type, -- get the type from the base type (bt) if it exists, this is in the case of a user-defined type being used, t.name would be the UDT name.
	IIF(t.is_user_defined = 1, t.name, NULL) UserDefinedType, -- we have a user defined type, so pass that to the view caller too
	c.max_length Length,
	c.precision Precision,
	c.scale Scale,
	c.is_nullable AllowsNull,
	IIF(basetable_columns.is_identity IS NULL, 0, basetable_columns.is_identity) AutoIncrement,
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
	sys.all_columns c
INNER JOIN
	[__mj].vwSQLTablesAndEntities e
ON
	c.object_id = IIF(e.view_object_id IS NULL, e.object_id, e.view_object_id)
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
	c.column_id = dc.parent_column_id
LEFT OUTER JOIN 
    sys.extended_properties EP_Table 
ON 
	EP_Table.major_id = basetable_columns.object_id AND 
	EP_Table.minor_id = basetable_columns.column_id AND 
	EP_Table.name = 'MS_Description'
LEFT OUTER JOIN 
    sys.extended_properties EP_View 
ON 
	EP_View.major_id = c.object_id AND 
	EP_View.minor_id = c.column_id AND 
	EP_View.name = 'MS_Description'
WHERE 
	c.default_object_id IS NOT NULL
GO




DROP PROC IF EXISTS [__mj].[spDeleteUnneededEntityFields]
GO
CREATE PROC [__mj].[spDeleteUnneededEntityFields]
AS
/****************************************************************/
-- Step #3 
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields

-- put these two views into temp tables, for some SQL systems, this makes the join below WAY faster
SELECT * INTO #ef_spDeleteUnneededEntityFields FROM vwEntityFields
SELECT * INTO #actual_spDeleteUnneededEntityFields FROM vwSQLColumnsAndEntityFields   

-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE __mj.Entity SET UpdatedAt=GETDATE() WHERE ID IN
(
	SELECT 
	  ef.EntityID 
	FROM 
	  #ef_spDeleteUnneededEntityFields ef 
	LEFT JOIN
	  #actual_spDeleteUnneededEntityFields actual 
	  ON
	  ef.EntityID=actual.EntityID AND
	  ef.Name = actual.EntityFieldName
	WHERE 
	  actual.column_id IS NULL  
)

-- now delete the entity fields themsevles
DELETE FROM __mj.EntityField WHERE ID IN
(
	SELECT 
	  ef.ID 
	FROM 
	  #ef_spDeleteUnneededEntityFields ef 
	LEFT JOIN
	  #actual_spDeleteUnneededEntityFields actual 
	  ON
	  ef.EntityID=actual.EntityID AND
	  ef.Name = actual.EntityFieldName
	WHERE 
	  actual.column_id IS NULL  
)

-- clean up and get rid of our temp tables now
DROP TABLE #ef_spDeleteUnneededEntityFields
DROP TABLE #actual_spDeleteUnneededEntityFields
GO

DROP PROC IF EXISTS [__mj].[spUpdateExistingEntitiesFromSchema]
GO
CREATE PROC [__mj].spUpdateExistingEntitiesFromSchema
AS
	UPDATE 
		[__mj].[Entity]
	SET
		Description = IIF(e.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX),fromSQL.EntityDescription), e.Description)
	FROM
		[__mj].[Entity] e
	INNER JOIN
		[__mj].[vwSQLTablesAndEntities] fromSQL
	ON
		e.ID = fromSQL.EntityID
GO



DROP PROC IF EXISTS [__mj].[spUpdateExistingEntityFieldsFromSchema]
GO
CREATE PROC [__mj].[spUpdateExistingEntityFieldsFromSchema]
AS
BEGIN
    -- Update Statement
    UPDATE [__mj].EntityField
    SET
		Description = IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX),fromSQL.Description), ef.Description),
        Type = fromSQL.Type,
        Length = fromSQL.Length,
        Precision = fromSQL.Precision,
        Scale = fromSQL.Scale,
        AllowsNull = fromSQL.AllowsNull,
        DefaultValue = fromSQL.DefaultValue,
        AutoIncrement = fromSQL.AutoIncrement,
        IsVirtual = fromSQL.IsVirtual,
        Sequence = fromSQL.Sequence,
        RelatedEntityID = re.ID,
        RelatedEntityFieldName = fk.referenced_column,
        IsPrimaryKey =	CASE 
							WHEN pk.ColumnName IS NOT NULL THEN 1 
							ELSE 0 
						END,
        IsUnique =		CASE 
							WHEN pk.ColumnName IS NOT NULL THEN 1 
							ELSE 
								CASE 
									WHEN uk.ColumnName IS NOT NULL THEN 1 
									ELSE 0 
								END 
						END,
        UpdatedAt = GETDATE()
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
	WHERE
		fromSQL.EntityFieldID IS NOT NULL -- only where we HAVE ALREADY CREATED EntityField records
END
GO





DROP PROC IF EXISTS [__mj].[spSetDefaultColumnWidthWhereNeeded]
GO
CREATE PROC [__mj].[spSetDefaultColumnWidthWhereNeeded]
AS
/**************************************************************************************/
/* Final step - generate default column widths for columns that don't have a width set*/
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
	UpdatedAt = GETDATE()
FROM 
	__mj.EntityField ef
WHERE
    ef.DefaultColumnWidth IS NULL
GO






DROP PROC IF EXISTS [__mj].[spDeleteConversation]
GO
CREATE PROCEDURE [__mj].[spDeleteConversation]
    @ID INT
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


DROP PROC IF EXISTS [__mj].[spCreateCompanyIntegrationRun]
GO
CREATE PROC [__mj].[spCreateCompanyIntegrationRun]
@CompanyIntegrationID AS INT,
@RunByUserID AS INT,
@StartedAt AS DATETIMEOFFSET(7) = NULL, 
@Comments AS NVARCHAR(MAX) = NULL,
@TotalRecords INT = NULL,
@NewID AS INT OUTPUT
AS
INSERT INTO __mj.CompanyIntegrationRun
(  
  CompanyIntegrationID,
  RunByUserID,
  StartedAt,
  TotalRecords,
  Comments
)
VALUES
(
  @CompanyIntegrationID,
  @RunByUserID,
  IIF(@StartedAt IS NULL, GETDATE(), @StartedAt),
  IIF(@TotalRecords IS NULL, 0, @TotalRecords),
  @Comments 
)

SELECT @NewID = SCOPE_IDENTITY()
GO

DROP PROC IF EXISTS [__mj].[spCreateCompanyIntegrationRunAPILog]
GO
CREATE PROC [__mj].[spCreateCompanyIntegrationRunAPILog]
(@CompanyIntegrationRunID INT, @RequestMethod NVARCHAR(12), @URL NVARCHAR(MAX), @Parameters NVARCHAR(MAX)=NULL, @IsSuccess BIT)
AS
INSERT INTO [__mj].[CompanyIntegrationRunAPILog]
           ([CompanyIntegrationRunID]
           ,[RequestMethod]
		   ,[URL]
		   ,[Parameters]
           ,[IsSuccess])
     VALUES
           (@CompanyIntegrationRunID
           ,@RequestMethod
		   ,@URL
		   ,@Parameters
           ,@IsSuccess)
GO



DROP PROC IF EXISTS [__mj].[spCreateCompanyIntegrationRunDetail]
GO
CREATE PROC [__mj].[spCreateCompanyIntegrationRunDetail]
@CompanyIntegrationRunID AS INT,
@EntityID INT=NULL,
@EntityName NVARCHAR(200)=NULL,
@RecordID INT,
@Action NCHAR(20),
@IsSuccess BIT,
@ExecutedAt DATETIMEOFFSET(7) = NULL,
@NewID AS INT OUTPUT
AS
INSERT INTO __mj.CompanyIntegrationRunDetail
(  
  CompanyIntegrationRunID,
  EntityID,
  RecordID,
  Action,
  IsSuccess,
  ExecutedAt
)
VALUES
(
  @CompanyIntegrationRunID,
  IIF (@EntityID IS NULL, (SELECT ID FROM __mj.Entity WHERE REPLACE(Name,' ', '')=@EntityName), @EntityID),
  @RecordID,
  @Action,
  @IsSuccess,
  IIF (@ExecutedAt IS NULL, GETDATE(), @ExecutedAt)
)

SELECT @NewID = SCOPE_IDENTITY()
GO


DROP PROC IF EXISTS [__mj].[spCreateErrorLog]
GO
CREATE PROC [__mj].[spCreateErrorLog]
(
@CompanyIntegrationRunID AS INT = NULL,
@CompanyIntegrationRunDetailID AS INT = NULL,
@Code AS NCHAR(20) = NULL,
@Status AS NVARCHAR(10) = NULL,
@Category AS NVARCHAR(20) = NULL,
@Message AS NVARCHAR(MAX) = NULL,
@Details AS NVARCHAR(MAX) = NULL,
@ErrorLogID AS INT OUTPUT
)
AS


INSERT INTO [__mj].[ErrorLog]
           ([CompanyIntegrationRunID]
           ,[CompanyIntegrationRunDetailID]
           ,[Code]
		   ,[Status]
		   ,[Category]
           ,[Message]
		   ,[Details])
     VALUES
           (@CompanyIntegrationRunID,
           @CompanyIntegrationRunDetailID,
           @Code,
		   @Status,
		   @Category,
           @Message,
		   @Details)

	--Get the ID of the new ErrorLog record
	SELECT @ErrorLogID = SCOPE_IDENTITY()
GO

DROP PROC IF EXISTS [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] 
GO
CREATE PROC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] 
(
	@EntityFieldID INT, 
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
	ON i.Name = ci.IntegrationName
WHERE 
	i.Name = @IntegrationName
	AND ci.ExternalSystemID = @ExternalSystemID
	AND ci.IsActive = 1
GO



GO