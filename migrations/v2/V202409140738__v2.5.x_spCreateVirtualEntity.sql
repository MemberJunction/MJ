DROP PROC IF EXISTS [${flyway:defaultSchema}].spCreateVirtualEntity
GO
CREATE PROC [${flyway:defaultSchema}].spCreateVirtualEntity
   @Name nvarchar(255),
   @BaseView nvarchar(255),
   @SchemaName nvarchar(255),
   @PrimaryKeyFieldName nvarchar(255),
   @Description nvarchar(max) = null
AS
  DECLARE @NewEntityIDTable TABLE (ID uniqueidentifier);

  INSERT INTO
	  [${flyway:defaultSchema}].Entity
  (
	  Name,
	  BaseView,
	  BaseTable,
	  VirtualEntity,
	  SchemaName,
	  IncludeInAPI,
	  AllowCreateAPI,
	  AllowUpdateAPI,
	  AllowDeleteAPI,
	  AllowRecordMerge,
	  TrackRecordChanges
  )
  OUTPUT INSERTED.ID INTO @NewEntityIDTable
  VALUES
  (
	  @Name,
	  @BaseView,
	  @BaseView, -- use baseview as basetable, don't leave blank as we use this for the Code/Class virtual fields
	  1,
	  @SchemaName,
	  1,
	  0,
	  0,
	  0,
	  0,
	  0
  )

  -- Declare a variable to hold the actual ID value
  DECLARE @NewEntityID uniqueidentifier;
  -- Retrieve the ID from the table variable
  SELECT @NewEntityID = ID FROM @NewEntityIDTable;

  -- CREATE A SINGLE ROW IN THE EntityField table for the pkey column
  INSERT INTO [${flyway:defaultSchema}].EntityField
  (
    EntityID,
    Sequence,
    Name,
    IsPrimaryKey,
    IsUnique,
    Type
  )
  VALUES
  (
    @NewEntityID,
    1,
    @PrimaryKeyFieldName,
    1,
    1,
    'int' -- just a placeholder, when CodeGen runs the true type gets dropped in here along with other attributes like length, scale, precision
  )

  SELECT @NewEntityID -- return the new entity ID
GO
