/*

   MemberJunction Upgrade Script
   TYPE: STRUCTURE
   FROM: 1.3.x
   TO:   1.4.x
*/
SET NUMERIC_ROUNDABORT OFF
GO
SET ANSI_PADDING, ANSI_WARNINGS, CONCAT_NULL_YIELDS_NULL, ARITHABORT, QUOTED_IDENTIFIER, ANSI_NULLS ON
GO
SET XACT_ABORT ON
GO
SET TRANSACTION ISOLATION LEVEL Serializable
GO
BEGIN TRANSACTION
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Application]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Application] ALTER COLUMN [Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[ApplicationSetting]'
GO
CREATE TABLE [__mj].[ApplicationSetting]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[ApplicationName] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Value] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Comments] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_ApplicationSetting_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_ApplicationSetting_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_ApplicationSetting] on [__mj].[ApplicationSetting]'
GO
ALTER TABLE [__mj].[ApplicationSetting] ADD CONSTRAINT [PK_ApplicationSetting] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityBehavior]'
GO
CREATE TABLE [__mj].[EntityBehavior]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[EntityID] [int] NOT NULL,
[BehaviorTypeID] [int] NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[RegenerateCode] [bit] NOT NULL CONSTRAINT [DF_EntityBehavior_RegenerateCode] DEFAULT ((0)),
[Code] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CodeExplanation] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CodeGenerated] [bit] NOT NULL CONSTRAINT [DF_EntityBehavior_CodeGenerated] DEFAULT ((1)),
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityBehavior_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityBehavior_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityBehavior] on [__mj].[EntityBehavior]'
GO
ALTER TABLE [__mj].[EntityBehavior] ADD CONSTRAINT [PK_EntityBehavior] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[EntityBehaviorType]'
GO
CREATE TABLE [__mj].[EntityBehaviorType]
(
[ID] [int] NOT NULL IDENTITY(1, 1),
[Name] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
[Description] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityBehaviorType_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_EntityBehaviorType_UpdatedAt] DEFAULT (getdate())
)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating primary key [PK_EntityBehaviorType] on [__mj].[EntityBehaviorType]'
GO
ALTER TABLE [__mj].[EntityBehaviorType] ADD CONSTRAINT [PK_EntityBehaviorType] PRIMARY KEY CLUSTERED ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [UQ_EntityBehaviorType_Name] on [__mj].[EntityBehaviorType]'
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_EntityBehaviorType_Name] ON [__mj].[EntityBehaviorType] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityBehaviors]'
GO


CREATE VIEW [__mj].[vwEntityBehaviors]
AS
SELECT 
    e.*,
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[EntityBehavior] AS e
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityBehavior]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityBehavior]
    @ID int,
    @EntityID int,
    @BehaviorTypeID int,
    @Description nvarchar(MAX),
    @RegenerateCode bit,
    @Code nvarchar(MAX),
    @CodeExplanation nvarchar(MAX),
    @CodeGenerated bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehavior]
    SET 
        [EntityID] = @EntityID,
        [BehaviorTypeID] = @BehaviorTypeID,
        [Description] = @Description,
        [RegenerateCode] = @RegenerateCode,
        [Code] = @Code,
        [CodeExplanation] = @CodeExplanation,
        [CodeGenerated] = @CodeGenerated,
        [UpdatedAt] = GETDATE()
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityBehaviors] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityBehavior]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityBehavior]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityBehavior]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[GetProgrammaticName]'
GO

CREATE FUNCTION [__mj].[GetProgrammaticName](@input NVARCHAR(MAX))
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
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[vwEntities]'
GO

ALTER VIEW [__mj].[vwEntities]
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
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntityBehaviorTypes]'
GO


CREATE VIEW [__mj].[vwEntityBehaviorTypes]
AS
SELECT 
    e.*
FROM
    [__mj].[EntityBehaviorType] AS e
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwApplicationSettings]'
GO


CREATE VIEW [__mj].[vwApplicationSettings]
AS
SELECT 
    a.*
FROM
    [__mj].[ApplicationSetting] AS a
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityBehaviorType]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityBehaviorType]
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityBehaviorType]
        (
            [Name],
            [Description]
        )
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityBehaviorTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateApplication]'
GO


ALTER PROCEDURE [__mj].[spCreateApplication]
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Application]
        (
            [Name],
            [Description]
        )
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwApplications] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateApplicationSetting]'
GO


CREATE PROCEDURE [__mj].[spCreateApplicationSetting]
    @ApplicationName nvarchar(50),
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[ApplicationSetting]
        (
            [ApplicationName],
            [Name],
            [Value],
            [Comments]
        )
    VALUES
        (
            @ApplicationName,
            @Name,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwApplicationSettings] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateEntityBehaviorType]'
GO


CREATE PROCEDURE [__mj].[spUpdateEntityBehaviorType]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehaviorType]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UpdatedAt] = GETDATE()
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityBehaviorTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateApplication]'
GO


ALTER PROCEDURE [__mj].[spUpdateApplication]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Application]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UpdatedAt] = GETDATE()
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwApplications] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spUpdateApplicationSetting]'
GO


CREATE PROCEDURE [__mj].[spUpdateApplicationSetting]
    @ID int,
    @ApplicationName nvarchar(50),
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationSetting]
    SET 
        [ApplicationName] = @ApplicationName,
        [Name] = @Name,
        [Value] = @Value,
        [Comments] = @Comments,
        [UpdatedAt] = GETDATE()
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwApplicationSettings] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteEntityBehaviorType]'
GO


CREATE PROCEDURE [__mj].[spDeleteEntityBehaviorType]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[EntityBehaviorType]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spDeleteApplicationSetting]'
GO


CREATE PROCEDURE [__mj].[spDeleteApplicationSetting]
    @ID int
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [__mj].[ApplicationSetting]
    WHERE 
        [ID] = @ID

    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateEntityRelationship]'
GO


ALTER PROCEDURE [__mj].[spCreateEntityRelationship]
    @EntityID int,
    @Sequence int,
    @RelatedEntityID int,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayName nvarchar(255),
    @DisplayUserViewGUID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityRelationship]
        (
            [EntityID],
            [Sequence],
            [RelatedEntityID],
            [BundleInAPI],
            [IncludeInParentAllQuery],
            [Type],
            [EntityKeyField],
            [RelatedEntityJoinField],
            [JoinView],
            [JoinEntityJoinField],
            [JoinEntityInverseJoinField],
            [DisplayInForm],
            [DisplayName]
        )
    VALUES
        (
            @EntityID,
            @Sequence,
            @RelatedEntityID,
            @BundleInAPI,
            @IncludeInParentAllQuery,
            @Type,
            @EntityKeyField,
            @RelatedEntityJoinField,
            @JoinView,
            @JoinEntityJoinField,
            @JoinEntityInverseJoinField,
            @DisplayInForm,
            @DisplayName
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityRelationships] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityRelationship]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityRelationship]
    @ID int,
    @EntityID int,
    @Sequence int,
    @RelatedEntityID int,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayName nvarchar(255),
    @DisplayUserViewGUID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationship]
    SET 
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayName] = @DisplayName,
        [UpdatedAt] = GETDATE()
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityRelationships] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateEntityBehavior]'
GO


CREATE PROCEDURE [__mj].[spCreateEntityBehavior]
    @EntityID int,
    @BehaviorTypeID int,
    @Description nvarchar(MAX),
    @RegenerateCode bit,
    @Code nvarchar(MAX),
    @CodeExplanation nvarchar(MAX),
    @CodeGenerated bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[EntityBehavior]
        (
            [EntityID],
            [BehaviorTypeID],
            [Description],
            [RegenerateCode],
            [Code],
            [CodeExplanation],
            [CodeGenerated]
        )
    VALUES
        (
            @EntityID,
            @BehaviorTypeID,
            @Description,
            @RegenerateCode,
            @Code,
            @CodeExplanation,
            @CodeGenerated
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityBehaviors] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[ApplicationSetting]'
GO
ALTER TABLE [__mj].[ApplicationSetting] ADD CONSTRAINT [FK_ApplicationSetting_Application] FOREIGN KEY ([ApplicationName]) REFERENCES [__mj].[Application] ([Name])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[EntityBehavior]'
GO
ALTER TABLE [__mj].[EntityBehavior] ADD CONSTRAINT [FK_EntityBehavior_Entity] FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity] ([ID])
GO
ALTER TABLE [__mj].[EntityBehavior] ADD CONSTRAINT [FK_EntityBehavior_EntityBehaviorType] FOREIGN KEY ([BehaviorTypeID]) REFERENCES [__mj].[EntityBehaviorType] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating extended properties'
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'ms_description', N'This table stores the list of possible behavior types to use in the Entity Behavior Types entity. ', 'SCHEMA', N'__mj', 'TABLE', N'EntityBehaviorType', NULL, NULL
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The name of the behavior, a unique column for the table. ', 'SCHEMA', N'__mj', 'TABLE', N'EntityBehaviorType', 'COLUMN', N'Name'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'ms_description', N'Stores the behaviors for each entity and is used for code generation and injection of behavior code into various areas of the system.', 'SCHEMA', N'__mj', 'TABLE', N'EntityBehavior', NULL, NULL
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'This is the code that implements the desired behavior. If the CodeGenerated bit is set to 1, each time CodeGen runs, it will use the Code specified here in the appropriate place(s). To override the generated code and prevent it from being changed in the future, set CodeGenerated = 0', 'SCHEMA', N'__mj', 'TABLE', N'EntityBehavior', 'COLUMN', N'Code'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When an AI model generates code this will be populated with the AI''s explanation of how the code works to meet the requirements of the behavior. For a non-generated piece of code a developer could manually place an explanation in this field.', 'SCHEMA', N'__mj', 'TABLE', N'EntityBehavior', 'COLUMN', N'CodeExplanation'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'This field will be used by the AI system to generate code that corresponds to the requested behavior and inject the code into the appropriate part(s) of the system.', 'SCHEMA', N'__mj', 'TABLE', N'EntityBehavior', 'COLUMN', N'Description'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'This bit field is automatically turned on whenever the Description field is changed so that a future server process will pick it up and regenerate the code. This might happen asynchronously or synchronously depending on system setup.', 'SCHEMA', N'__mj', 'TABLE', N'EntityBehavior', 'COLUMN', N'RegenerateCode'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
PRINT N'Altering permissions on  [__mj].[GetProgrammaticName]'
GO
GRANT EXECUTE ON  [__mj].[GetProgrammaticName] TO [public]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateApplicationSetting]'
GO
GRANT EXECUTE ON  [__mj].[spCreateApplicationSetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateApplicationSetting] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityBehaviorType]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityBehaviorType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityBehaviorType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spCreateEntityBehavior]'
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityBehavior] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateEntityBehavior] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteApplicationSetting]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteApplicationSetting] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityBehaviorType]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityBehaviorType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spDeleteEntityBehavior]'
GO
GRANT EXECUTE ON  [__mj].[spDeleteEntityBehavior] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateApplicationSetting]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateApplicationSetting] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateApplicationSetting] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityBehaviorType]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityBehaviorType] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityBehaviorType] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[spUpdateEntityBehavior]'
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityBehavior] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spUpdateEntityBehavior] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwApplicationSettings]'
GO
GRANT SELECT ON  [__mj].[vwApplicationSettings] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwApplicationSettings] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwApplicationSettings] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityBehaviorTypes]'
GO
GRANT SELECT ON  [__mj].[vwEntityBehaviorTypes] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityBehaviorTypes] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityBehaviorTypes] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntityBehaviors]'
GO
GRANT SELECT ON  [__mj].[vwEntityBehaviors] TO [cdp_Developer]
GO
GRANT SELECT ON  [__mj].[vwEntityBehaviors] TO [cdp_Integration]
GO
GRANT SELECT ON  [__mj].[vwEntityBehaviors] TO [cdp_UI]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
COMMIT TRANSACTION
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
-- This statement writes to the SQL Server Log so SQL Monitor can show this deployment.
IF HAS_PERMS_BY_NAME(N'sys.xp_logevent', N'OBJECT', N'EXECUTE') = 1
BEGIN
    DECLARE @databaseName AS nvarchar(2048), @eventMessage AS nvarchar(2048)
    SET @databaseName = REPLACE(REPLACE(DB_NAME(), N'\', N'\\'), N'"', N'\"')
    SET @eventMessage = N'Redgate SQL Compare: { "deployment": { "description": "Redgate SQL Compare deployed to ' + @databaseName + N'", "database": "' + @databaseName + N'" }}'
    EXECUTE sys.xp_logevent 55000, @eventMessage
END
GO
DECLARE @Success AS BIT
SET @Success = 1
SET NOEXEC OFF
IF (@Success = 1) PRINT 'The database update succeeded'
ELSE BEGIN
	IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION
	PRINT 'The database update failed'
END
GO
