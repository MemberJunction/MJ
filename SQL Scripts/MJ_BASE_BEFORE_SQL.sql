-- ALL THE VIEWS

DROP VIEW IF EXISTS [admin].vwForeignKeys
GO
CREATE VIEW [admin].vwForeignKeys
AS
SELECT  obj.name AS FK_NAME,
    sch.name AS [schema_name],
    tab1.name AS [table],
    col1.name AS [column],
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
GO

DROP VIEW IF EXISTS [admin].vwEntities
GO
CREATE VIEW [admin].vwEntities
AS
SELECT 
	e.*,
	IIF(1 = ISNUMERIC(LEFT(e.Name, 1)),'_','') + REPLACE(e.Name, ' ', '') CodeName,
	IIF(1 = ISNUMERIC(LEFT(e.BaseTable, 1)),'_','') + e.BaseTable + IIF(e.NameSuffix IS NULL, '', e.NameSuffix) ClassName,
	IIF(1 = ISNUMERIC(LEFT(e.BaseTable, 1)),'_','') + e.BaseTable + IIF(e.NameSuffix IS NULL, '', e.NameSuffix) BaseTableCodeName,
	par.Name ParentEntity,
	par.BaseTable ParentBaseTable,
	par.BaseView ParentBaseView
FROM 
	[admin].Entity e
LEFT OUTER JOIN 
	[admin].Entity par
ON
	e.ParentID = par.ID
GO

DROP VIEW IF EXISTS [admin].vwEntityFields
GO
CREATE VIEW [admin].vwEntityFields
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
	[admin].EntityField ef
INNER JOIN
	[admin].vwEntities e ON ef.EntityID = e.ID
LEFT OUTER JOIN
	[admin].vwEntities re ON ef.RelatedEntityID = re.ID
GO



DROP VIEW IF EXISTS [admin].vwEntityRelationships
GO
CREATE VIEW [admin].vwEntityRelationships
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
	[admin].EntityRelationship er
INNER JOIN
	[admin].Entity e
ON
	er.EntityID = e.ID
INNER JOIN
	[admin].vwEntities relatedEntity
ON
	er.RelatedEntityID = relatedEntity.ID
LEFT OUTER JOIN
	[admin].UserView uv
ON	
	er.DisplayUserViewGUID = uv.GUID
GO

 

 
GO
DROP VIEW IF EXISTS [admin].vwCompanyIntegrations
GO
CREATE VIEW [admin].vwCompanyIntegrations 
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
  admin.CompanyIntegration ci
INNER JOIN
  admin.Company c ON ci.CompanyName = c.Name
INNER JOIN
  admin.Integration i ON ci.IntegrationName = i.Name
LEFT OUTER JOIN
  admin.CompanyIntegrationRun cir 
ON 
  ci.ID = cir.CompanyIntegrationID AND
  cir.ID = (SELECT TOP 1 cirInner.ID FROM admin.CompanyIntegrationRun cirInner WHERE cirInner.CompanyIntegrationID = ci.ID ORDER BY StartedAt DESC)  
GO

DROP VIEW IF EXISTS [admin].vwCompanyIntegrationRuns
GO
CREATE VIEW [admin].vwCompanyIntegrationRuns
AS
SELECT
   cir.*,
   ci.CompanyName Company,
   ci.IntegrationName Integration
FROM
   admin.CompanyIntegrationRun cir
INNER JOIN
   admin.CompanyIntegration ci
ON
   cir.CompanyIntegrationID = ci.ID
GO

DROP VIEW IF EXISTS [admin].vwCompanyIntegrationRunDetails
GO
CREATE VIEW [admin].vwCompanyIntegrationRunDetails
AS
SELECT 
    cird.*,
	e.Name Entity,
	cir.StartedAt RunStartedAt,
	cir.EndedAt RunEndedAt
FROM
	admin.CompanyIntegrationRunDetail cird
INNER JOIN
    admin.CompanyIntegrationRun cir
ON
    cird.CompanyIntegrationRunID = cir.ID
INNER JOIN
	admin.Entity e
ON
	cird.EntityID = e.ID
GO

 
DROP VIEW IF EXISTS [admin].vwEmployees 
GO
CREATE VIEW [admin].vwEmployees 
AS
SELECT
	e.*,
	TRIM(e.FirstName) + ' ' + TRIM(e.LastName) FirstLast,
	TRIM(s.FirstName) + ' ' + TRIM(s.LastName) Supervisor,
	s.FirstName SupervisorFirstName,
	s.LastName SupervisorLastName,
	s.Email SupervisorEmail
FROM
	admin.Employee e
LEFT OUTER JOIN
	admin.Employee s
ON
	e.SupervisorID = s.ID

GO
  

DROP VIEW IF EXISTS [admin].vwCompanies
GO
CREATE VIEW [admin].vwCompanies
AS
SELECT * FROM admin.Company



GO
 

DROP VIEW IF EXISTS [admin].vwIntegrations
GO
CREATE VIEW [admin].vwIntegrations AS
SELECT * FROM admin.Integration
GO

DROP VIEW IF EXISTS [admin].vwIntegrationURLFormats 
GO
CREATE VIEW [admin].vwIntegrationURLFormats
AS
SELECT 
	iuf.*,
	i.ID IntegrationID,
	i.Name Integration,
	i.NavigationBaseURL,
	i.NavigationBaseURL + iuf.URLFormat FullURLFormat
FROM
	admin.IntegrationURLFormat iuf
INNER JOIN
	admin.Integration i
ON
	iuf.IntegrationName = i.Name
GO

DROP VIEW IF EXISTS [admin].vwUsers
GO
CREATE VIEW [admin].vwUsers 
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
	[admin].[User] u
LEFT OUTER JOIN
	vwEmployees e
ON
	u.EmployeeID = e.ID

GO




DROP VIEW IF EXISTS [admin].vwUserFavorites
GO
CREATE VIEW [admin].vwUserFavorites
AS
SELECT 
	uf.*,
	e.Name Entity,
	e.BaseTable EntityBaseTable,
	e.BaseView EntityBaseView
FROM 
	[admin].UserFavorite uf
INNER JOIN
	vwEntities e
ON
	uf.EntityID = e.ID
GO

 

DROP VIEW IF EXISTS [admin].vwUserRecordLogs
GO
CREATE VIEW [admin].vwUserRecordLogs 
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
	admin.UserRecordLog ur
INNER JOIN
	admin.Entity e 
ON
	ur.EntityID = e.ID
INNER JOIN
	vwUsers u
ON
	ur.UserID = u.ID


GO
DROP VIEW IF EXISTS [admin].vwUserViews
GO
CREATE VIEW [admin].vwUserViews
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
	admin.UserView uv
INNER JOIN
	[admin].vwUsers u
ON
	uv.UserID = u.ID
INNER JOIN
	admin.Entity e
ON
	uv.EntityID = e.ID


GO
 
 
DROP VIEW IF EXISTS [admin].vwApplicationEntities
GO
CREATE VIEW [admin].vwApplicationEntities
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
   admin.ApplicationEntity ae
INNER JOIN
   admin.Application a
ON
   ae.ApplicationName = a.Name
INNER JOIN
   [admin].vwEntities e
ON
   ae.EntityID = e.ID
GO
 

DROP VIEW IF EXISTS [admin].vwUserApplicationEntities
GO
CREATE VIEW [admin].vwUserApplicationEntities
AS
SELECT 
   uae.*,
   ua.[Application] Application,
   ua.[User] [User],
   e.Name Entity
FROM
   admin.UserApplicationEntity uae
INNER JOIN
   [admin].vwUserApplications ua
ON
   uae.UserApplicationID = ua.ID
INNER JOIN
   admin.Entity e
ON
   uae.EntityID = e.ID
GO

DROP VIEW IF EXISTS [admin].vwWorkflowRuns
GO
CREATE VIEW [admin].vwWorkflowRuns
AS
SELECT 
  wr.*,
  w.Name Workflow,
  w.WorkflowEngineName
FROM
  admin.WorkflowRun wr
INNER JOIN
  [admin].vwWorkflows w
ON
  wr.WorkflowName = w.Name
GO
  


------------------------------------------------------------
----- BASE VIEW FOR ENTITY:     User View Run Details
-----               BASE TABLE: UserViewRunDetail
------------------------------------------------------------
DROP VIEW IF EXISTS [admin].[vwUserViewRunDetails]
GO
CREATE VIEW [admin].[vwUserViewRunDetails]
AS
SELECT 
    u.*,
	uv.ID UserViewID,
	uv.EntityID
FROM
    [admin].[UserViewRunDetail] AS u
INNER JOIN
	[admin].[UserViewRun] as uvr
  ON
    u.UserViewRunID = uvr.ID
INNER JOIN
    [admin].[UserView] uv
  ON
    uvr.UserViewID = uv.ID
GO





------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordChange
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [admin].[spCreateRecordChange]
GO
CREATE PROCEDURE [admin].[spCreateRecordChange]
    @EntityName nvarchar(100),
    @RecordID int,
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
    [admin].[RecordChange]
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
            (SELECT ID FROM admin.Entity WHERE Name = @EntityName),
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
    SELECT * FROM [admin].vwRecordChanges WHERE ID = SCOPE_IDENTITY()
END




GO 




------------------------------------------------------------
----- BASE VIEW FOR ENTITY:     Entity Permissions
-----               BASE TABLE: EntityPermission
------------------------------------------------------------0
DROP VIEW IF EXISTS [admin].[vwEntityPermissions]
GO

CREATE VIEW [admin].[vwEntityPermissions]
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
    [admin].[EntityPermission] AS e
INNER JOIN
    [admin].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [admin].[Role] AS Role_RoleName
  ON
    [e].[RoleName] = Role_RoleName.[Name]
LEFT OUTER JOIN
	[admin].RowLevelSecurityFilter rlsC
  ON
    [e].CreateRLSFilterID = rlsC.ID
LEFT OUTER JOIN
	[admin].RowLevelSecurityFilter rlsR
  ON
    [e].ReadRLSFilterID = rlsR.ID
LEFT OUTER JOIN
	[admin].RowLevelSecurityFilter rlsU
  ON
    [e].UpdateRLSFilterID = rlsU.ID
LEFT OUTER JOIN
	[admin].RowLevelSecurityFilter rlsD
  ON
    [e].DeleteRLSFilterID = rlsD.ID
GO 




----------------------------------------------------------------------------------------
--- This section handles view execution stuff  ---
----------------------------------------------------------------------------------------

DROP PROC IF EXISTS [admin].spCreateUserViewRunWithDetail
GO

IF TYPE_ID('admin.IDListTableType') IS NOT NULL
	DROP TYPE admin.IDListTableType
GO

CREATE TYPE admin.IDListTableType AS TABLE
(
    ID INT
);
GO

CREATE PROCEDURE [admin].spCreateUserViewRunWithDetail(@UserViewID INT, @UserEmail NVARCHAR(255), @RecordIDList admin.IDListTableType READONLY) 
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
INSERT INTO admin.UserViewRunDetail 
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

 

DROP FUNCTION IF EXISTS [admin].ToTitleCase
GO
CREATE FUNCTION [admin].ToTitleCase (@InputString varchar(4000))
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


 
DROP PROC IF EXISTS [admin].spGetNextEntityID
GO
CREATE PROC [admin].spGetNextEntityID
    @schemaName NVARCHAR(255)
AS
BEGIN
    DECLARE @EntityIDMin INT;
    DECLARE @EntityIDMax INT;
    DECLARE @MaxEntityID INT;
	DECLARE @NextID INT;

    -- STEP 1: Get EntityIDMin and EntityIDMax from admin.SchemaInfo
    SELECT 
		@EntityIDMin = EntityIDMin, @EntityIDMax = EntityIDMax
    FROM 
		admin.SchemaInfo
    WHERE 
		SchemaName = @schemaName;

    -- STEP 2: If no matching schemaName, insert a new row into admin.SchemaInfo
    IF @EntityIDMin IS NULL OR @EntityIDMax IS NULL
    BEGIN
        -- Get the maximum ID from the admin.Entity table
		DECLARE @MaxEntityIDFromSchema INT;
        SELECT @MaxEntityID = ISNULL(MAX(ID), 0) FROM admin.Entity;
		SELECT @MaxEntityIDFromSchema = ISNULL(MAX(EntityIDMax),0) FROM admin.SchemaInfo;
		IF @MaxEntityIDFromSchema > @MaxEntityID 
			SELECT @MaxEntityID = @MaxEntityIDFromSchema; -- use the max ID From the schema info table if it is higher

        -- Calculate the new EntityIDMin
        SET @EntityIDMin = CASE 
                              WHEN @MaxEntityID >= 25000001 THEN @MaxEntityID + 1
                              ELSE 25000001
                            END;

        -- Calculate the new EntityIDMax
        SET @EntityIDMax = @EntityIDMin + 24999;

        -- Insert the new row into admin.SchemaInfo
        INSERT INTO admin.SchemaInfo (SchemaName, EntityIDMin, EntityIDMax)
        VALUES (@schemaName, @EntityIDMin, @EntityIDMax);
    END

    -- STEP 3: Get the maximum ID currently in the admin.Entity table within the range
    SELECT 
		@NextID = ISNULL(MAX(ID), @EntityIDMin - 1) -- we subtract 1 from entityIDMin as it will be used the first time if Max(EntityID) is null, and below we will increment it by one to be the first ID in that range
    FROM 
		admin.Entity
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


DROP VIEW IF EXISTS [admin].[vwSQLTablesAndEntities]
GO
CREATE VIEW [admin].[vwSQLTablesAndEntities]
AS
SELECT 
	e.ID EntityID,
	e.Name EntityName,
	e.VirtualEntity,
	t.name TableName,
	s.name SchemaName,
	t.*,
	v.object_id view_object_id,
	v.name ViewName
FROM 
	sys.all_objects t
INNER JOIN
	sys.schemas s 
ON
	t.schema_id = s.schema_id
LEFT OUTER JOIN
	admin.Entity e 
ON
	t.name = e.BaseTable AND
	s.name = e.SchemaName 
LEFT OUTER JOIN
	sys.all_objects v
ON
	e.BaseView = v.name AND v.type = 'V'
WHERE   
	t.TYPE = 'U' OR (t.Type='V' AND e.VirtualEntity=1) -- TABLE - non-virtual entities
GO

DROP VIEW IF EXISTS [admin].[vwSQLColumnsAndEntityFields]
GO
CREATE VIEW [admin].[vwSQLColumnsAndEntityFields]
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
	t.name Type,
	c.max_length Length,
	c.precision Precision,
	c.scale Scale,
	c.is_nullable AllowsNull,
	c.is_identity AutoIncrement,
	c.column_id,
	IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0) IsVirtual, -- updated so that we take into account that computed columns are virtual always, previously only looked for existence of a column in table vs. a view
	basetable_columns.object_id,
	dc.name AS DefaultConstraintName,
    dc.definition AS DefaultValue,
	cc.definition ComputedColumnDefinition
FROM
	sys.all_columns c
INNER JOIN
	[admin].vwSQLTablesAndEntities e
ON
	c.object_id = IIF(e.view_object_id IS NULL, e.object_id, e.view_object_id)
INNER JOIN
	sys.types t 
ON
	c.user_type_id = t.user_type_id
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
	admin.EntityField ef 
ON
	e.EntityID = ef.EntityID AND
	c.name = ef.Name
LEFT OUTER JOIN 
    sys.default_constraints dc 
ON 
    e.object_id = dc.parent_object_id AND
	c.column_id = dc.parent_column_id
WHERE 
	c.default_object_id IS NOT NULL
GO




DROP PROC IF EXISTS [admin].[spDeleteUnneededEntityFields]
GO
CREATE PROC [admin].[spDeleteUnneededEntityFields]
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
UPDATE admin.Entity SET UpdatedAt=GETDATE() WHERE ID IN
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
DELETE FROM admin.EntityField WHERE ID IN
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


DROP PROC IF EXISTS [admin].[spUpdateExistingEntityFieldsFromSchema]
GO
CREATE PROC [admin].[spUpdateExistingEntityFieldsFromSchema]
AS
UPDATE [admin].EntityField
SET
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
	UpdatedAt = GETDATE() -- this will reflect an update data even if no changes were made, not optimal but doesn't really matter that much either
FROM
	[admin].EntityField ef
INNER JOIN
	vwSQLColumnsAndEntityFields fromSQL
ON
	ef.EntityID = fromSQL.EntityID AND
	ef.Name = fromSQL.FieldName
INNER JOIN
    [admin].Entity e 
ON
    ef.EntityID = e.ID
LEFT OUTER JOIN
	vwForeignKeys fk
ON
	ef.Name = fk.[column] AND
	e.BaseTable = fk.[table]
LEFT OUTER JOIN 
    [admin].Entity re -- Related Entity
ON
	re.BaseTable = fk.referenced_table
WHERE
	EntityFieldID IS NOT NULL -- only where we HAVE ALREADY CREATED EntityField records
GO


DROP PROC IF EXISTS [admin].[spSetDefaultColumnWidthWhereNeeded]
GO
CREATE PROC [admin].[spSetDefaultColumnWidthWhereNeeded]
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
	admin.EntityField ef
WHERE
    ef.DefaultColumnWidth IS NULL
GO






DROP PROC IF EXISTS [admin].[spDeleteConversation]
GO
CREATE PROCEDURE [admin].[spDeleteConversation]
    @ID INT
AS  
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Report - set FK to null before deleting rows in Conversation
    UPDATE 
        [admin].[Report] 
    SET 
        [ConversationID] = NULL 
    WHERE 
        [ConversationID] = @ID

	UPDATE 
        [admin].[Report] 
    SET 
        [ConversationDetailID] = NULL 
    WHERE 
        [ConversationDetailID] IN (SELECT ID FROM admin.ConversationDetail WHERE ConversationID = @ID)

    
    -- Cascade delete from ConversationDetail
    DELETE FROM 
        [admin].[ConversationDetail] 
    WHERE 
        [ConversationID] = @ID
    
    DELETE FROM 
        [admin].[Conversation]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the ID to indicate we successfully deleted the record
END
GO


DROP PROC IF EXISTS [admin].[spCreateCompanyIntegrationRun]
GO
CREATE PROC [admin].[spCreateCompanyIntegrationRun]
@CompanyIntegrationID AS INT,
@RunByUserID AS INT,
@StartedAt AS DATETIMEOFFSET(7) = NULL, 
@Comments AS NVARCHAR(MAX) = NULL,
@TotalRecords INT = NULL,
@NewID AS INT OUTPUT
AS
INSERT INTO admin.CompanyIntegrationRun
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

DROP PROC IF EXISTS [admin].[spCreateCompanyIntegrationRunAPILog]
GO
CREATE PROC [admin].[spCreateCompanyIntegrationRunAPILog]
(@CompanyIntegrationRunID INT, @RequestMethod NVARCHAR(12), @URL NVARCHAR(MAX), @Parameters NVARCHAR(MAX)=NULL, @IsSuccess BIT)
AS
INSERT INTO [admin].[CompanyIntegrationRunAPILog]
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



DROP PROC IF EXISTS [admin].[spCreateCompanyIntegrationRunDetail]
GO
CREATE PROC [admin].[spCreateCompanyIntegrationRunDetail]
@CompanyIntegrationRunID AS INT,
@EntityID INT=NULL,
@EntityName NVARCHAR(200)=NULL,
@RecordID INT,
@Action NCHAR(20),
@IsSuccess BIT,
@ExecutedAt DATETIMEOFFSET(7) = NULL,
@NewID AS INT OUTPUT
AS
INSERT INTO admin.CompanyIntegrationRunDetail
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
  IIF (@EntityID IS NULL, (SELECT ID FROM admin.Entity WHERE REPLACE(Name,' ', '')=@EntityName), @EntityID),
  @RecordID,
  @Action,
  @IsSuccess,
  IIF (@ExecutedAt IS NULL, GETDATE(), @ExecutedAt)
)

SELECT @NewID = SCOPE_IDENTITY()
GO


DROP PROC IF EXISTS [admin].[spCreateErrorLog]
GO
CREATE PROC [admin].[spCreateErrorLog]
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


INSERT INTO [admin].[ErrorLog]
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

DROP PROC IF EXISTS [admin].[spUpdateEntityFieldRelatedEntityNameFieldMap] 
GO
CREATE PROC [admin].[spUpdateEntityFieldRelatedEntityNameFieldMap] 
(
	@EntityFieldID INT, 
	@RelatedEntityNameFieldMap NVARCHAR(50)
)
AS
UPDATE 
	admin.EntityField 
SET 
	RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap
WHERE
	ID = @EntityFieldID
GO

DROP VIEW IF EXISTS [admin].[vwCompanyIntegrationRunsRanked] 
GO
CREATE VIEW [admin].[vwCompanyIntegrationRunsRanked] AS
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
	admin.CompanyIntegrationRun ci
GO



DROP PROC IF EXISTS [admin].[spGetAuthenticationDataByExternalSystemID]
GO
CREATE PROC [admin].[spGetAuthenticationDataByExternalSystemID] 
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
	admin.CompanyIntegration ci
JOIN admin.Integration i
	ON i.Name = ci.IntegrationName
WHERE 
	i.Name = @IntegrationName
	AND ci.ExternalSystemID = @ExternalSystemID
	AND ci.IsActive = 1
GO



GO