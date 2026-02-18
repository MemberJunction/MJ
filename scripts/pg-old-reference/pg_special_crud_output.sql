-- Special utility PostgreSQL functions converted from SQL Server stored procedures

-- 1. spCreateVirtualEntity
-- Inserts into Entity table AND EntityField table
CREATE OR REPLACE FUNCTION __mj."spCreateVirtualEntity"(
    p_Name CHARACTER VARYING(255),
    p_BaseView CHARACTER VARYING(255),
    p_SchemaName CHARACTER VARYING(255),
    p_PrimaryKeyFieldName CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $function$
DECLARE
    v_NewEntityID UUID;
BEGIN
    INSERT INTO __mj."Entity"
    (
        "Name",
        "BaseView",
        "BaseTable",
        "VirtualEntity",
        "SchemaName",
        "IncludeInAPI",
        "AllowCreateAPI",
        "AllowUpdateAPI",
        "AllowDeleteAPI",
        "AllowRecordMerge",
        "TrackRecordChanges"
    )
    VALUES
    (
        p_Name,
        p_BaseView,
        p_BaseView, -- use baseview as basetable
        TRUE,
        p_SchemaName,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE
    )
    RETURNING "ID" INTO v_NewEntityID;

    -- Create a single row in EntityField table for the pkey column
    INSERT INTO __mj."EntityField"
    (
        "EntityID",
        "Sequence",
        "Name",
        "IsPrimaryKey",
        "IsUnique",
        "Type"
    )
    VALUES
    (
        v_NewEntityID,
        1,
        p_PrimaryKeyFieldName,
        TRUE,
        TRUE,
        'int' -- placeholder, CodeGen updates this
    );

    RETURN v_NewEntityID;
END;
$function$;


-- 2. spCreateUserViewRunWithDetail
-- Creates a user view run and inserts detail records
-- Uses UUID[] instead of SQL Server TABLE TYPE parameter
CREATE OR REPLACE FUNCTION __mj."spCreateUserViewRunWithDetail"(
    p_UserViewID UUID,
    p_UserEmail CHARACTER VARYING(255),
    p_RecordIDList UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
AS $function$
DECLARE
    v_RunID UUID;
    v_Now TIMESTAMP;
    v_UserID UUID;
    v_OutputRow RECORD;
BEGIN
    v_Now := NOW();
    SELECT "ID" INTO v_UserID FROM __mj."vwUsers" WHERE "Email" = p_UserEmail;

    -- Call spCreateUserViewRun and capture result
    SELECT "ID" INTO v_RunID
    FROM __mj."spCreateUserViewRun"(
        p_UserViewID := p_UserViewID,
        p_RunAt := v_Now,
        p_RunByUserID := v_UserID
    );

    -- Insert detail records from array
    INSERT INTO __mj."UserViewRunDetail"
    (
        "UserViewRunID",
        "RecordID"
    )
    SELECT v_RunID, unnest(p_RecordIDList)::CHARACTER VARYING(255);

    RETURN v_RunID;
END;
$function$;


-- 3. spDeleteEntityWithCoreDependencies
-- Deletes an entity and all its core dependency records
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityWithCoreDependencies"(
    p_EntityID UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
    DELETE FROM __mj."EntityFieldValue" WHERE "EntityFieldID" IN (SELECT "ID" FROM __mj."EntityField" WHERE "EntityID" = p_EntityID);
    DELETE FROM __mj."EntitySetting" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityField" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityPermission" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityRelationship" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;
    DELETE FROM __mj."UserApplicationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ApplicationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."RecordChange" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."AuditLog" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."Conversation" WHERE "LinkedEntityID" = p_EntityID;
    DELETE FROM __mj."ListDetail" WHERE "ListID" IN (SELECT "ID" FROM __mj."List" WHERE "EntityID" = p_EntityID);
    DELETE FROM __mj."List" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."EntityDocument" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."CompanyIntegrationRecordMap" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ResourceType" WHERE "EntityID" = p_EntityID;

    UPDATE __mj."Dataset" SET "__mj_UpdatedAt" = NOW() WHERE "ID" IN (SELECT "DatasetID" FROM __mj."DatasetItem" WHERE "EntityID" = p_EntityID);
    DELETE FROM __mj."DatasetItem" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."UserViewCategory" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."UserView" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."EntityAIAction" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityCommunicationMessageType" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityAIAction" WHERE "OutputEntityID" = p_EntityID;

    DELETE FROM __mj."Entity" WHERE "ID" = p_EntityID;
END;
$function$;


-- 4. spDeleteUnneededEntityFields
-- Removes orphaned EntityField metadata records
CREATE OR REPLACE FUNCTION __mj."spDeleteUnneededEntityFields"(
    p_ExcludedSchemaNames TEXT
)
RETURNS SETOF __mj."vwEntityFields"
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Create temp tables
    CREATE TEMP TABLE tmp_ef_fields ON COMMIT DROP AS
    SELECT ef.*
    FROM __mj."vwEntityFields" ef
    INNER JOIN __mj."vwEntities" e ON ef."EntityID" = e."ID"
    LEFT JOIN string_to_table(p_ExcludedSchemaNames, ',') AS excluded_schema ON e."SchemaName" = TRIM(excluded_schema)
    WHERE e."VirtualEntity" = FALSE
      AND excluded_schema IS NULL;

    CREATE TEMP TABLE tmp_actual_fields ON COMMIT DROP AS
    SELECT * FROM __mj."vwSQLColumnsAndEntityFields";

    CREATE TEMP TABLE tmp_deleted_fields ON COMMIT DROP AS
    SELECT ef.*
    FROM tmp_ef_fields ef
    LEFT JOIN tmp_actual_fields actual
        ON ef."EntityID" = actual."EntityID"
        AND ef."Name" = actual."EntityFieldName"
    WHERE actual."column_id" IS NULL;

    -- Update entity timestamps
    UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW()
    WHERE "ID" IN (SELECT DISTINCT "EntityID" FROM tmp_deleted_fields);

    -- Delete entity field values
    DELETE FROM __mj."EntityFieldValue" WHERE "EntityFieldID" IN (SELECT "ID" FROM tmp_deleted_fields);

    -- Delete entity fields
    DELETE FROM __mj."EntityField" WHERE "ID" IN (SELECT "ID" FROM tmp_deleted_fields);

    -- Return deleted fields
    RETURN QUERY SELECT * FROM tmp_deleted_fields;
END;
$function$;


-- 5. spUpdateExistingEntitiesFromSchema
-- Updates entity descriptions from database schema
CREATE OR REPLACE FUNCTION __mj."spUpdateExistingEntitiesFromSchema"(
    p_ExcludedSchemaNames TEXT
)
RETURNS TABLE(
    "ID" UUID,
    "Name" CHARACTER VARYING(500),
    "CurrentDescription" TEXT,
    "NewDescription" TEXT,
    "EntityDescription" TEXT,
    "SchemaName" TEXT
)
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Create temp table with filtered rows
    CREATE TEMP TABLE tmp_filtered_rows ON COMMIT DROP AS
    SELECT
        e."ID",
        e."Name",
        e."Description" AS "CurrentDescription",
        CASE WHEN e."AutoUpdateDescription" = TRUE THEN CAST("fromSQL"."EntityDescription" AS TEXT) ELSE e."Description" END AS "NewDescription",
        CAST("fromSQL"."EntityDescription" AS TEXT) AS "EntityDescription",
        CAST("fromSQL"."SchemaName" AS TEXT) AS "SchemaName"
    FROM
        __mj."Entity" e
    INNER JOIN
        __mj."vwSQLTablesAndEntities" "fromSQL" ON e."ID" = "fromSQL"."EntityID"
    LEFT JOIN
        string_to_table(p_ExcludedSchemaNames, ',') AS excluded ON "fromSQL"."SchemaName" = TRIM(excluded)
    WHERE
        e."VirtualEntity" = FALSE
        AND excluded IS NULL
        AND COALESCE(CASE WHEN e."AutoUpdateDescription" = TRUE THEN CAST("fromSQL"."EntityDescription" AS TEXT) ELSE e."Description" END, '')
            <> COALESCE(e."Description", '');

    -- Perform the update
    UPDATE __mj."Entity" e
    SET "Description" = fr."NewDescription"
    FROM tmp_filtered_rows fr
    WHERE e."ID" = fr."ID";

    -- Return the modified rows
    RETURN QUERY SELECT * FROM tmp_filtered_rows;
END;
$function$;


-- 6. spUpdateExistingEntityFieldsFromSchema
-- Updates entity fields from database schema metadata
CREATE OR REPLACE FUNCTION __mj."spUpdateExistingEntityFieldsFromSchema"(
    p_ExcludedSchemaNames TEXT
)
RETURNS TABLE(
    "EntityID" UUID,
    "EntityName" CHARACTER VARYING(500),
    "EntityFieldID" UUID,
    "EntityFieldName" CHARACTER VARYING(500),
    "AutoUpdateDescription" BOOLEAN,
    "ExistingDescription" TEXT,
    "SQLDescription" TEXT,
    "Type" CHARACTER VARYING(255),
    "Length" INTEGER,
    "Precision" INTEGER,
    "Scale" INTEGER,
    "AllowsNull" BOOLEAN,
    "DefaultValue" TEXT,
    "AutoIncrement" BOOLEAN,
    "IsVirtual" BOOLEAN,
    "Sequence" INTEGER,
    "RelatedEntityID" UUID,
    "RelatedEntityFieldName" CHARACTER VARYING(255),
    "IsPrimaryKey" BOOLEAN,
    "IsUnique" BOOLEAN
)
LANGUAGE plpgsql
AS $function$
BEGIN
    CREATE TEMP TABLE tmp_excluded_schemas ON COMMIT DROP AS
    SELECT TRIM(s) AS "SchemaName" FROM string_to_table(p_ExcludedSchemaNames, ',') s;

    CREATE TEMP TABLE tmp_filtered_field_rows ON COMMIT DROP AS
    SELECT
        e."ID" AS "EntityID",
        e."Name" AS "EntityName",
        ef."ID" AS "EntityFieldID",
        ef."Name" AS "EntityFieldName",
        ef."AutoUpdateDescription",
        ef."Description" AS "ExistingDescription",
        CAST("fromSQL"."Description" AS TEXT) AS "SQLDescription",
        "fromSQL"."Type",
        "fromSQL"."Length",
        "fromSQL"."Precision",
        "fromSQL"."Scale",
        "fromSQL"."AllowsNull",
        CAST("fromSQL"."DefaultValue" AS TEXT) AS "DefaultValue",
        "fromSQL"."AutoIncrement",
        "fromSQL"."IsVirtual",
        "fromSQL"."Sequence",
        re."ID" AS "RelatedEntityID",
        fk."referenced_column" AS "RelatedEntityFieldName",
        CASE WHEN pk."ColumnName" IS NOT NULL THEN TRUE ELSE FALSE END AS "IsPrimaryKey",
        CASE
            WHEN pk."ColumnName" IS NOT NULL THEN TRUE
            ELSE CASE WHEN uk."ColumnName" IS NOT NULL THEN TRUE ELSE FALSE END
        END AS "IsUnique"
    FROM
        __mj."EntityField" ef
    INNER JOIN
        __mj."vwSQLColumnsAndEntityFields" "fromSQL"
        ON ef."EntityID" = "fromSQL"."EntityID" AND ef."Name" = "fromSQL"."FieldName"
    INNER JOIN
        __mj."Entity" e ON ef."EntityID" = e."ID"
    LEFT OUTER JOIN
        __mj."vwForeignKeys" fk
        ON ef."Name" = fk."column" AND e."BaseTable" = fk."table" AND e."SchemaName" = fk."schema_name"
    LEFT OUTER JOIN
        __mj."Entity" re ON re."BaseTable" = fk."referenced_table" AND re."SchemaName" = fk."referenced_schema"
    LEFT OUTER JOIN
        __mj."vwTablePrimaryKeys" pk
        ON e."BaseTable" = pk."TableName" AND ef."Name" = pk."ColumnName" AND e."SchemaName" = pk."SchemaName"
    LEFT OUTER JOIN
        __mj."vwTableUniqueKeys" uk
        ON e."BaseTable" = uk."TableName" AND ef."Name" = uk."ColumnName" AND e."SchemaName" = uk."SchemaName"
    LEFT OUTER JOIN
        tmp_excluded_schemas es ON e."SchemaName" = es."SchemaName"
    WHERE
        e."VirtualEntity" = FALSE
        AND es."SchemaName" IS NULL
        AND ef."ID" IS NOT NULL
        AND (
            COALESCE(TRIM(ef."Description"), '') <> COALESCE(TRIM(CASE WHEN ef."AutoUpdateDescription" = TRUE THEN CAST("fromSQL"."Description" AS TEXT) ELSE ef."Description" END), '') OR
            ef."Type" <> "fromSQL"."Type" OR
            ef."Length" <> "fromSQL"."Length" OR
            ef."Precision" <> "fromSQL"."Precision" OR
            ef."Scale" <> "fromSQL"."Scale" OR
            ef."AllowsNull" <> "fromSQL"."AllowsNull" OR
            COALESCE(TRIM(ef."DefaultValue"), '') <> COALESCE(TRIM(CAST("fromSQL"."DefaultValue" AS TEXT)), '') OR
            ef."AutoIncrement" <> "fromSQL"."AutoIncrement" OR
            ef."IsVirtual" <> "fromSQL"."IsVirtual" OR
            ef."Sequence" <> "fromSQL"."Sequence" OR
            COALESCE(ef."RelatedEntityID", '00000000-0000-0000-0000-000000000000'::UUID) <> COALESCE(re."ID", '00000000-0000-0000-0000-000000000000'::UUID) OR
            COALESCE(TRIM(ef."RelatedEntityFieldName"), '') <> COALESCE(TRIM(fk."referenced_column"), '') OR
            ef."IsPrimaryKey" <> (CASE WHEN pk."ColumnName" IS NOT NULL THEN TRUE ELSE FALSE END) OR
            ef."IsUnique" <> CASE
                WHEN pk."ColumnName" IS NOT NULL THEN TRUE
                ELSE CASE WHEN uk."ColumnName" IS NOT NULL THEN TRUE ELSE FALSE END
            END
        );

    -- Perform the update
    UPDATE __mj."EntityField" ef
    SET
        "Description" = CASE WHEN fr."AutoUpdateDescription" = TRUE THEN fr."SQLDescription" ELSE ef."Description" END,
        "Type" = fr."Type",
        "Length" = fr."Length",
        "Precision" = fr."Precision",
        "Scale" = fr."Scale",
        "AllowsNull" = fr."AllowsNull",
        "DefaultValue" = fr."DefaultValue",
        "AutoIncrement" = fr."AutoIncrement",
        "IsVirtual" = fr."IsVirtual",
        "Sequence" = fr."Sequence",
        "RelatedEntityID" = CASE WHEN ef."AutoUpdateRelatedEntityInfo" = TRUE AND ef."IsSoftForeignKey" = FALSE THEN fr."RelatedEntityID" ELSE ef."RelatedEntityID" END,
        "RelatedEntityFieldName" = CASE WHEN ef."AutoUpdateRelatedEntityInfo" = TRUE AND ef."IsSoftForeignKey" = FALSE THEN fr."RelatedEntityFieldName" ELSE ef."RelatedEntityFieldName" END,
        "IsPrimaryKey" = CASE WHEN ef."IsSoftPrimaryKey" = FALSE THEN fr."IsPrimaryKey" ELSE ef."IsPrimaryKey" END,
        "IsUnique" = fr."IsUnique",
        "__mj_UpdatedAt" = NOW()
    FROM tmp_filtered_field_rows fr
    WHERE ef."ID" = fr."EntityFieldID";

    -- Return the modified rows
    RETURN QUERY SELECT * FROM tmp_filtered_field_rows;
END;
$function$;


-- 7. spUpdateSchemaInfoFromDatabase
-- Updates/inserts SchemaInfo records from database schemas
CREATE OR REPLACE FUNCTION __mj."spUpdateSchemaInfoFromDatabase"(
    p_ExcludedSchemaNames TEXT DEFAULT NULL
)
RETURNS SETOF __mj."SchemaInfo"
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Create temp table for excluded schemas
    CREATE TEMP TABLE tmp_excluded_schemas_info ON COMMIT DROP AS
    SELECT TRIM(s) AS "SchemaName"
    FROM string_to_table(COALESCE(p_ExcludedSchemaNames, ''), ',') s
    WHERE TRIM(s) <> '';

    -- Update descriptions for existing SchemaInfo records
    UPDATE __mj."SchemaInfo" si
    SET "Description" = ss."SchemaDescription"
    FROM __mj."vwSQLSchemas" ss
    WHERE si."SchemaName" = ss."SchemaName"
      AND (si."Description" IS NULL OR si."Description" <> COALESCE(ss."SchemaDescription", ''))
      AND ss."SchemaName" NOT IN (SELECT "SchemaName" FROM tmp_excluded_schemas_info);

    -- Insert new SchemaInfo records for schemas that don't exist yet
    INSERT INTO __mj."SchemaInfo"
    (
        "SchemaName",
        "EntityIDMin",
        "EntityIDMax",
        "Comments",
        "Description"
    )
    SELECT
        ss."SchemaName",
        1,
        999999999,
        'Auto-created by CodeGen. Please update EntityIDMin and EntityIDMax to appropriate values for this schema.',
        ss."SchemaDescription"
    FROM
        __mj."vwSQLSchemas" ss
    LEFT OUTER JOIN
        __mj."SchemaInfo" si ON ss."SchemaName" = si."SchemaName"
    WHERE
        si."ID" IS NULL
        AND ss."SchemaName" NOT IN (SELECT "SchemaName" FROM tmp_excluded_schemas_info);

    -- Return the updated/inserted records
    RETURN QUERY
    SELECT si.*
    FROM __mj."SchemaInfo" si
    INNER JOIN __mj."vwSQLSchemas" ss ON si."SchemaName" = ss."SchemaName"
    WHERE ss."SchemaName" NOT IN (SELECT "SchemaName" FROM tmp_excluded_schemas_info);
END;
$function$;


-- 8. spUpdateEntityFieldRelatedEntityNameFieldMap
-- Simple single-column update
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_EntityFieldID UUID,
    p_RelatedEntityNameFieldMap CHARACTER VARYING(50)
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE __mj."EntityField"
    SET "RelatedEntityNameFieldMap" = p_RelatedEntityNameFieldMap
    WHERE "ID" = p_EntityFieldID;
END;
$function$;
