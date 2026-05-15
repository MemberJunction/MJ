
-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE __mj."Country" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "ISO2" VARCHAR(2) NOT NULL,
 "ISO3" VARCHAR(3) NOT NULL,
 "NumericCode" INTEGER NULL,
 "Latitude" DECIMAL(10,6) NULL,
 "Longitude" DECIMAL(10,6) NULL,
 "BoundaryGeoJSON" TEXT NULL,
 "CommonAliases" TEXT NULL,
 CONSTRAINT PK_Country PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Country_ISO2 UNIQUE ("ISO2"),
 CONSTRAINT UQ_Country_ISO3 UNIQUE ("ISO3"),
 CONSTRAINT UQ_Country_Name UNIQUE ("Name")
);

-- Extended properties: Country table;

CREATE TABLE __mj."StateProvince" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "CountryID" UUID NOT NULL,
 "Name" VARCHAR(200) NOT NULL,
 "Code" VARCHAR(10) NOT NULL,
 "ISO3166_2" VARCHAR(10) NOT NULL,
 "Latitude" DECIMAL(10,6) NULL,
 "Longitude" DECIMAL(10,6) NULL,
 "BoundaryGeoJSON" TEXT NULL,
 "CommonAliases" TEXT NULL,
 CONSTRAINT PK_StateProvince PRIMARY KEY ("ID"),
 CONSTRAINT FK_StateProvince_Country FOREIGN KEY ("CountryID")
 REFERENCES __mj."Country"("ID"),
 CONSTRAINT UQ_StateProvince_ISO3166_2 UNIQUE ("ISO3166_2"),
 CONSTRAINT UQ_StateProvince_CountryCode UNIQUE ("CountryID", "Code")
);

-- Extended properties: StateProvince table;

CREATE TABLE __mj."RecordGeoCode" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EntityID" UUID NOT NULL,
 "RecordID" VARCHAR(450) NOT NULL,
 "LocationType" VARCHAR(50) NOT NULL DEFAULT 'Primary',
 "Latitude" DECIMAL(10,6) NULL,
 "Longitude" DECIMAL(10,6) NULL,
 "Precision" VARCHAR(20) NULL,
 "CountryID" UUID NULL,
 "StateProvinceID" UUID NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'pending',
 "ErrorMessage" TEXT NULL,
 "RetryCount" INTEGER NOT NULL DEFAULT 0,
 "SourceFieldHash" VARCHAR(64) NULL,
 "GeocodedAt" TIMESTAMPTZ NULL,
 "GeocodingSource" VARCHAR(30) NULL,
 CONSTRAINT PK_RecordGeoCode PRIMARY KEY ("ID"),
 CONSTRAINT FK_RecordGeoCode_Entity FOREIGN KEY ("EntityID")
 REFERENCES __mj."Entity"("ID"),
 CONSTRAINT FK_RecordGeoCode_Country FOREIGN KEY ("CountryID")
 REFERENCES __mj."Country"("ID"),
 CONSTRAINT FK_RecordGeoCode_StateProvince FOREIGN KEY ("StateProvinceID")
 REFERENCES __mj."StateProvince"("ID"),
 CONSTRAINT UQ_RecordGeoCode_EntityRecordLocation UNIQUE ("EntityID", "RecordID", "LocationType"),
 CONSTRAINT CK_RecordGeoCode_Precision
 CHECK ("Precision" IN ('exact', 'postal_code', 'city', 'county', 'state_province', 'country')),
 CONSTRAINT CK_RecordGeoCode_Status
 CHECK ("Status" IN ('success', 'failed', 'pending')),
 CONSTRAINT CK_RecordGeoCode_GeocodingSource
 CHECK ("GeocodingSource" IN ('google', 'reference_data', 'manual', 'ip_geolocation', 'native', 'reverse'))
);

-- Extended properties: RecordGeoCode table;

ALTER TABLE __mj."RecordGeoCode"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."RecordGeoCode" */
ALTER TABLE __mj."RecordGeoCode"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."Country" */
ALTER TABLE __mj."Country"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."Country" */
ALTER TABLE __mj."Country"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."StateProvince" */
ALTER TABLE __mj."StateProvince"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."StateProvince" */
ALTER TABLE __mj."StateProvince"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ApplicationEntity_ApplicationID" ON __mj."ApplicationEntity" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ApplicationEntity_EntityID" ON __mj."ApplicationEntity" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID" ON __mj."EntityFieldValue" ("EntityFieldID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_RecordGeoCode_EntityID" ON __mj."RecordGeoCode" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_RecordGeoCode_CountryID" ON __mj."RecordGeoCode" ("CountryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_RecordGeoCode_StateProvinceID" ON __mj."RecordGeoCode" ("StateProvinceID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_StateProvince_CountryID" ON __mj."StateProvince" ("CountryID");


-- ===================== Helper Functions (fn*) =====================

-- Manual fix: the T-SQL source defines fn_MJ_GeoDistance and fn_MJ_GeoRecordsNear,
-- but the auto-conversion produces invalid PG syntax (DECLARE x FLOAT = ...,
-- ATN2 vs ATAN2, RETURNS TABLE AS RETURN (...), single $ delimiter).
-- The hand-written PG versions live in V202604090002__v5.25.x__Geo_Functions.pg.sql
-- which runs BEFORE this migration (earlier timestamp). Omit the broken
-- auto-converted definitions here.


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwCountries';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCountries"
AS SELECT
    c.*
FROM
    __mj."Country" AS c$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwRecordGeoCodes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwRecordGeoCodes"
AS SELECT
    r.*,
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJCountry_CountryID"."Name" AS "Country",
    "MJStateProvince_StateProvinceID"."Name" AS "StateProvince"
FROM
    __mj."RecordGeoCode" AS r
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    r."EntityID" = "MJEntity_EntityID"."ID"
LEFT OUTER JOIN
    __mj."Country" AS "MJCountry_CountryID"
  ON
    r."CountryID" = "MJCountry_CountryID"."ID"
LEFT OUTER JOIN
    __mj."StateProvince" AS "MJStateProvince_StateProvinceID"
  ON
    r."StateProvinceID" = "MJStateProvince_StateProvinceID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwStateProvinces';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwStateProvinces"
AS SELECT
    s.*,
    "MJCountry_CountryID"."Name" AS "Country"
FROM
    __mj."StateProvince" AS s
INNER JOIN
    __mj."Country" AS "MJCountry_CountryID"
  ON
    s."CountryID" = "MJCountry_CountryID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateApplicationEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_DefaultForNewUser BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwApplicationEntities" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ApplicationEntity"
            (
                "ID",
                "ApplicationID",
                "EntityID",
                "Sequence",
                "DefaultForNewUser"
            )
        VALUES
            (
                p_ID,
                p_ApplicationID,
                p_EntityID,
                p_Sequence,
                COALESCE(p_DefaultForNewUser, TRUE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ApplicationEntity"
            (
                "ApplicationID",
                "EntityID",
                "Sequence",
                "DefaultForNewUser"
            )
        VALUES
            (
                p_ApplicationID,
                p_EntityID,
                p_Sequence,
                COALESCE(p_DefaultForNewUser, TRUE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateApplicationEntity"(
    IN p_ID UUID,
    IN p_ApplicationID UUID,
    IN p_EntityID UUID,
    IN p_Sequence INTEGER,
    IN p_DefaultForNewUser BOOLEAN
)
RETURNS SETOF __mj."vwApplicationEntities" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ApplicationEntity"
    SET
        "ApplicationID" = p_ApplicationID,
        "EntityID" = p_EntityID,
        "Sequence" = p_Sequence,
        "DefaultForNewUser" = p_DefaultForNewUser
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteApplicationEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ApplicationEntity"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCountry"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_ISO2 VARCHAR(2) DEFAULT NULL,
    IN p_ISO3 VARCHAR(3) DEFAULT NULL,
    IN p_NumericCode INTEGER DEFAULT NULL,
    IN p_Latitude NUMERIC(10,6) DEFAULT NULL,
    IN p_Longitude NUMERIC(10,6) DEFAULT NULL,
    IN p_BoundaryGeoJSON TEXT DEFAULT NULL,
    IN p_CommonAliases TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwCountries" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Country"
            (
                "ID",
                "Name",
                "ISO2",
                "ISO3",
                "NumericCode",
                "Latitude",
                "Longitude",
                "BoundaryGeoJSON",
                "CommonAliases"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_ISO2,
                p_ISO3,
                p_NumericCode,
                p_Latitude,
                p_Longitude,
                p_BoundaryGeoJSON,
                p_CommonAliases
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Country"
            (
                "Name",
                "ISO2",
                "ISO3",
                "NumericCode",
                "Latitude",
                "Longitude",
                "BoundaryGeoJSON",
                "CommonAliases"
            )
        VALUES
            (
                p_Name,
                p_ISO2,
                p_ISO3,
                p_NumericCode,
                p_Latitude,
                p_Longitude,
                p_BoundaryGeoJSON,
                p_CommonAliases
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCountries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCountry"(
    IN p_ID UUID,
    IN p_Name VARCHAR(200),
    IN p_ISO2 VARCHAR(2),
    IN p_ISO3 VARCHAR(3),
    IN p_NumericCode INTEGER,
    IN p_Latitude NUMERIC(10,6),
    IN p_Longitude NUMERIC(10,6),
    IN p_BoundaryGeoJSON TEXT,
    IN p_CommonAliases TEXT
)
RETURNS SETOF __mj."vwCountries" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Country"
    SET
        "Name" = p_Name,
        "ISO2" = p_ISO2,
        "ISO3" = p_ISO3,
        "NumericCode" = p_NumericCode,
        "Latitude" = p_Latitude,
        "Longitude" = p_Longitude,
        "BoundaryGeoJSON" = p_BoundaryGeoJSON,
        "CommonAliases" = p_CommonAliases
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCountries" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCountries" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCountry"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Country"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityFieldValue"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityFieldID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Value VARCHAR(255) DEFAULT NULL,
    IN p_Code VARCHAR(50) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFieldValues" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityFieldValue"
            (
                "ID",
                "EntityFieldID",
                "Sequence",
                "Value",
                "Code",
                "Description"
            )
        VALUES
            (
                p_ID,
                p_EntityFieldID,
                p_Sequence,
                p_Value,
                p_Code,
                p_Description
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityFieldValue"
            (
                "EntityFieldID",
                "Sequence",
                "Value",
                "Code",
                "Description"
            )
        VALUES
            (
                p_EntityFieldID,
                p_Sequence,
                p_Value,
                p_Code,
                p_Description
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityFieldValue"(
    IN p_ID UUID,
    IN p_EntityFieldID UUID,
    IN p_Sequence INTEGER,
    IN p_Value VARCHAR(255),
    IN p_Code VARCHAR(50),
    IN p_Description TEXT
)
RETURNS SETOF __mj."vwEntityFieldValues" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityFieldValue"
    SET
        "EntityFieldID" = p_EntityFieldID,
        "Sequence" = p_Sequence,
        "Value" = p_Value,
        "Code" = p_Code,
        "Description" = p_Description
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityFieldValue"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityFieldValue"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordGeoCode"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(450) DEFAULT NULL,
    IN p_LocationType VARCHAR(50) DEFAULT NULL,
    IN p_Latitude NUMERIC(10,6) DEFAULT NULL,
    IN p_Longitude NUMERIC(10,6) DEFAULT NULL,
    IN p_Precision VARCHAR(20) DEFAULT NULL,
    IN p_CountryID UUID DEFAULT NULL,
    IN p_StateProvinceID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_RetryCount INTEGER DEFAULT NULL,
    IN p_SourceFieldHash VARCHAR(64) DEFAULT NULL,
    IN p_GeocodedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_GeocodingSource VARCHAR(30) DEFAULT NULL
)
RETURNS SETOF __mj."vwRecordGeoCodes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."RecordGeoCode"
            (
                "ID",
                "EntityID",
                "RecordID",
                "LocationType",
                "Latitude",
                "Longitude",
                "Precision",
                "CountryID",
                "StateProvinceID",
                "Status",
                "ErrorMessage",
                "RetryCount",
                "SourceFieldHash",
                "GeocodedAt",
                "GeocodingSource"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                p_RecordID,
                COALESCE(p_LocationType, 'Primary'),
                p_Latitude,
                p_Longitude,
                p_Precision,
                p_CountryID,
                p_StateProvinceID,
                COALESCE(p_Status, 'pending'),
                p_ErrorMessage,
                COALESCE(p_RetryCount, 0),
                p_SourceFieldHash,
                p_GeocodedAt,
                p_GeocodingSource
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."RecordGeoCode"
            (
                "EntityID",
                "RecordID",
                "LocationType",
                "Latitude",
                "Longitude",
                "Precision",
                "CountryID",
                "StateProvinceID",
                "Status",
                "ErrorMessage",
                "RetryCount",
                "SourceFieldHash",
                "GeocodedAt",
                "GeocodingSource"
            )
        VALUES
            (
                p_EntityID,
                p_RecordID,
                COALESCE(p_LocationType, 'Primary'),
                p_Latitude,
                p_Longitude,
                p_Precision,
                p_CountryID,
                p_StateProvinceID,
                COALESCE(p_Status, 'pending'),
                p_ErrorMessage,
                COALESCE(p_RetryCount, 0),
                p_SourceFieldHash,
                p_GeocodedAt,
                p_GeocodingSource
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwRecordGeoCodes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordGeoCode"(
    IN p_ID UUID,
    IN p_EntityID UUID,
    IN p_RecordID VARCHAR(450),
    IN p_LocationType VARCHAR(50),
    IN p_Latitude NUMERIC(10,6),
    IN p_Longitude NUMERIC(10,6),
    IN p_Precision VARCHAR(20),
    IN p_CountryID UUID,
    IN p_StateProvinceID UUID,
    IN p_Status VARCHAR(20),
    IN p_ErrorMessage TEXT,
    IN p_RetryCount INTEGER,
    IN p_SourceFieldHash VARCHAR(64),
    IN p_GeocodedAt TIMESTAMPTZ,
    IN p_GeocodingSource VARCHAR(30)
)
RETURNS SETOF __mj."vwRecordGeoCodes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."RecordGeoCode"
    SET
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "LocationType" = p_LocationType,
        "Latitude" = p_Latitude,
        "Longitude" = p_Longitude,
        "Precision" = p_Precision,
        "CountryID" = p_CountryID,
        "StateProvinceID" = p_StateProvinceID,
        "Status" = p_Status,
        "ErrorMessage" = p_ErrorMessage,
        "RetryCount" = p_RetryCount,
        "SourceFieldHash" = p_SourceFieldHash,
        "GeocodedAt" = p_GeocodedAt,
        "GeocodingSource" = p_GeocodingSource
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwRecordGeoCodes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwRecordGeoCodes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordGeoCode"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecordGeoCode"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateStateProvince"(
    IN p_ID UUID DEFAULT NULL,
    IN p_CountryID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Code VARCHAR(10) DEFAULT NULL,
    IN p_ISO3166_2 VARCHAR(10) DEFAULT NULL,
    IN p_Latitude NUMERIC(10,6) DEFAULT NULL,
    IN p_Longitude NUMERIC(10,6) DEFAULT NULL,
    IN p_BoundaryGeoJSON TEXT DEFAULT NULL,
    IN p_CommonAliases TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwStateProvinces" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."StateProvince"
            (
                "ID",
                "CountryID",
                "Name",
                "Code",
                "ISO3166_2",
                "Latitude",
                "Longitude",
                "BoundaryGeoJSON",
                "CommonAliases"
            )
        VALUES
            (
                p_ID,
                p_CountryID,
                p_Name,
                p_Code,
                p_ISO3166_2,
                p_Latitude,
                p_Longitude,
                p_BoundaryGeoJSON,
                p_CommonAliases
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."StateProvince"
            (
                "CountryID",
                "Name",
                "Code",
                "ISO3166_2",
                "Latitude",
                "Longitude",
                "BoundaryGeoJSON",
                "CommonAliases"
            )
        VALUES
            (
                p_CountryID,
                p_Name,
                p_Code,
                p_ISO3166_2,
                p_Latitude,
                p_Longitude,
                p_BoundaryGeoJSON,
                p_CommonAliases
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwStateProvinces" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateStateProvince"(
    IN p_ID UUID,
    IN p_CountryID UUID,
    IN p_Name VARCHAR(200),
    IN p_Code VARCHAR(10),
    IN p_ISO3166_2 VARCHAR(10),
    IN p_Latitude NUMERIC(10,6),
    IN p_Longitude NUMERIC(10,6),
    IN p_BoundaryGeoJSON TEXT,
    IN p_CommonAliases TEXT
)
RETURNS SETOF __mj."vwStateProvinces" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."StateProvince"
    SET
        "CountryID" = p_CountryID,
        "Name" = p_Name,
        "Code" = p_Code,
        "ISO3166_2" = p_ISO3166_2,
        "Latitude" = p_Latitude,
        "Longitude" = p_Longitude,
        "BoundaryGeoJSON" = p_BoundaryGeoJSON,
        "CommonAliases" = p_CommonAliases
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwStateProvinces" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwStateProvinces" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteStateProvince"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."StateProvince"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ===================== Triggers =====================

CREATE OR REPLACE FUNCTION __mj."trgUpdateApplicationEntity_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateApplicationEntity" ON __mj."ApplicationEntity";
CREATE TRIGGER "trgUpdateApplicationEntity"
    BEFORE UPDATE ON __mj."ApplicationEntity"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateApplicationEntity_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCountry_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCountry" ON __mj."Country";
CREATE TRIGGER "trgUpdateCountry"
    BEFORE UPDATE ON __mj."Country"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCountry_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityFieldValue_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityFieldValue" ON __mj."EntityFieldValue";
CREATE TRIGGER "trgUpdateEntityFieldValue"
    BEFORE UPDATE ON __mj."EntityFieldValue"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityFieldValue_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateRecordGeoCode_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateRecordGeoCode" ON __mj."RecordGeoCode";
CREATE TRIGGER "trgUpdateRecordGeoCode"
    BEFORE UPDATE ON __mj."RecordGeoCode"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateRecordGeoCode_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateStateProvince_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateStateProvince" ON __mj."StateProvince";
CREATE TRIGGER "trgUpdateStateProvince"
    BEFORE UPDATE ON __mj."StateProvince"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateStateProvince_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '3bfe55c1-8fd5-44a4-accb-dabb4e8428e2',
         'MJ: Countries',
         'Countries',
         'Reference table for countries with ISO 3166-1 codes, geographic centroids, and optional medium-resolution boundary GeoJSON for choropleth rendering. Seeded with ~250 countries.',
         NULL,
         'Country',
         'vwCountries',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Countries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3bfe55c1-8fd5-44a4-accb-dabb4e8428e2', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Countries for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3bfe55c1-8fd5-44a4-accb-dabb4e8428e2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Countries for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3bfe55c1-8fd5-44a4-accb-dabb4e8428e2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Countries for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3bfe55c1-8fd5-44a4-accb-dabb4e8428e2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: State Provinces */

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '12c21789-12cc-4a8c-81ed-ffcbc1d69336',
         'MJ: State Provinces',
         'State Provinces',
         'Reference table for states, provinces, and first-level administrative divisions. Linked to Country via FK. Seeded with ~5,000 records with ISO 3166-2 codes, centroids, and optional boundary GeoJSON.',
         NULL,
         'StateProvince',
         'vwStateProvinces',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: State Provinces to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '12c21789-12cc-4a8c-81ed-ffcbc1d69336', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: State Provinces for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('12c21789-12cc-4a8c-81ed-ffcbc1d69336', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: State Provinces for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('12c21789-12cc-4a8c-81ed-ffcbc1d69336', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: State Provinces for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('12c21789-12cc-4a8c-81ed-ffcbc1d69336', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Record Geo Codes */

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '54ef915a-9902-4958-8e09-ae6e7b525e97',
         'MJ: Record Geo Codes',
         'Record Geo Codes',
         'Polymorphic table storing persisted geocoding results for any MJ entity record. Each row maps an entity record + location type to a lat/lng coordinate, with optional country/state references for choropleth grouping. Supports multi-location entities via LocationType discriminator.',
         NULL,
         'RecordGeoCode',
         'vwRecordGeoCodes',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Record Geo Codes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '54ef915a-9902-4958-8e09-ae6e7b525e97', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Record Geo Codes for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('54ef915a-9902-4958-8e09-ae6e7b525e97', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Record Geo Codes for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('54ef915a-9902-4958-8e09-ae6e7b525e97', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Record Geo Codes for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('54ef915a-9902-4958-8e09-ae6e7b525e97', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."RecordGeoCode" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."RecordGeoCode" */
UPDATE __mj."RecordGeoCode" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."RecordGeoCode" */
ALTER TABLE __mj."RecordGeoCode" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordGeoCode"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."RecordGeoCode" */
UPDATE __mj."RecordGeoCode" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."RecordGeoCode" */
ALTER TABLE __mj."RecordGeoCode" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordGeoCode"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."Country" */
UPDATE __mj."Country" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."Country" */
ALTER TABLE __mj."Country" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."Country"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."Country" */
UPDATE __mj."Country" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."Country" */
ALTER TABLE __mj."Country" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."Country"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."StateProvince" */
UPDATE __mj."StateProvince" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."StateProvince" */
ALTER TABLE __mj."StateProvince" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."StateProvince"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."StateProvince" */
UPDATE __mj."StateProvince" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."StateProvince" */
ALTER TABLE __mj."StateProvince" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."StateProvince"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '797360ef-109d-4a8f-b040-5b2141db37c5' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'ID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '797360ef-109d-4a8f-b040-5b2141db37c5',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2174c80e-d364-4dba-92f6-eeaada410bd7' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'EntityID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2174c80e-d364-4dba-92f6-eeaada410bd7',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100002,
        'EntityID',
        'Entity ID',
        'Foreign key to Entity. Identifies which entity this geocode belongs to.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'E0238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f51815bb-b7f2-476f-b0b4-8119eeede33b' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'RecordID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f51815bb-b7f2-476f-b0b4-8119eeede33b',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100003,
        'RecordID',
        'Record ID',
        'MJ composite primary key format string identifying the source record (e.g., "ID|<uuid>"). Max 450 chars for SQL Server index support.',
        'TEXT',
        900,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f3e3af4a-10e0-443a-a744-c6cd004c5c31' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'LocationType')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f3e3af4a-10e0-443a-a744-c6cd004c5c31',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100004,
        'LocationType',
        'Location Type',
        'Discriminator for multi-location entities. Default "Primary" for single-address entities. Multi-address examples: "Home", "Business", "Mailing", "PO Box".',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'Primary',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bad1868e-5d5a-4287-afcf-352c2a3e6699' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'Latitude')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'bad1868e-5d5a-4287-afcf-352c2a3e6699',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100005,
        'Latitude',
        'Latitude',
        'Geocoded latitude coordinate. NULL when Status is "pending" or "failed".',
        'decimal',
        9,
        10,
        6,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ec46b3e9-73ab-48cd-b231-4d7312badbbe' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'Longitude')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'ec46b3e9-73ab-48cd-b231-4d7312badbbe',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100006,
        'Longitude',
        'Longitude',
        'Geocoded longitude coordinate. NULL when Status is "pending" or "failed".',
        'decimal',
        9,
        10,
        6,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4ccd7fd8-7341-499f-b199-4d65d87203db' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'Precision')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '4ccd7fd8-7341-499f-b199-4d65d87203db',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100007,
        'Precision',
        'Precision',
        'Precision level of the geocoded result: exact (street address), postal_code, city, county, state_province, or country.',
        'TEXT',
        40,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '82f838dd-b57b-4aad-aef1-04e381e2971f' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'CountryID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '82f838dd-b57b-4aad-aef1-04e381e2971f',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100008,
        'CountryID',
        'Country ID',
        'Optional FK to Country reference table. Populated alongside lat/lng to enable choropleth grouping without reverse-geocoding at render time.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '73458121-bbfc-40fa-a093-d2b939839211' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'StateProvinceID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '73458121-bbfc-40fa-a093-d2b939839211',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100009,
        'StateProvinceID',
        'State Province ID',
        'Optional FK to StateProvince reference table. Populated alongside lat/lng to enable state-level choropleth grouping.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32396f7d-f786-4612-ba91-78006867fc63' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'Status')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '32396f7d-f786-4612-ba91-78006867fc63',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100010,
        'Status',
        'Status',
        'Current geocoding status: "pending" (awaiting geocode), "success" (geocoded), or "failed" (geocoding error). Used by scheduled job for retry logic.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'pending',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2b5fe6b9-b64f-401b-aef2-1613456109e5' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'ErrorMessage')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2b5fe6b9-b64f-401b-aef2-1613456109e5',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100011,
        'ErrorMessage',
        'Error Message',
        'Error details when Status is "failed". Captures API error messages, rate limit info, etc. for debugging.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4dae2800-36fc-49c5-8d3e-64eaf15708a0' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'RetryCount')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '4dae2800-36fc-49c5-8d3e-64eaf15708a0',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100012,
        'RetryCount',
        'Retry Count',
        'Number of geocoding attempts. Used for exponential backoff in the scheduled retry job. Stops retrying at configurable maxRetries (default 3).',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b1b38354-d8a9-4079-a15f-8eccfd558576' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'SourceFieldHash')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'b1b38354-d8a9-4079-a15f-8eccfd558576',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100013,
        'SourceFieldHash',
        'Source Field Hash',
        'SHA-256 hash of the source field values that produced this geocode. When source fields change on save, the hash won''t match and re-geocoding is triggered. Format: SHA-256(concat(field1, "|", field2, ...)).',
        'TEXT',
        128,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '46621b92-adb4-4206-a660-2d93b634e7a4' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'GeocodedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '46621b92-adb4-4206-a660-2d93b634e7a4',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100014,
        'GeocodedAt',
        'Geocoded At',
        'Timestamp of when geocoding was last attempted (success or failure).',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bca87cf8-5989-4a92-ba21-3b3b409401ab' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'GeocodingSource')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'bca87cf8-5989-4a92-ba21-3b3b409401ab',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100015,
        'GeocodingSource',
        'Geocoding Source',
        'How this geocode was produced: google (Google Geocoding API), reference_data (resolved via Country/StateProvince tables), manual (user-entered), ip_geolocation (IP lookup), native (copied from entity lat/lng fields), reverse (reverse geocode from coordinates).',
        'TEXT',
        60,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '04104288-e86f-4f22-a8cf-3a6ae181311e' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '04104288-e86f-4f22-a8cf-3a6ae181311e',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100016,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '731bba14-51fc-47dd-9240-62cb3ec58af6' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '731bba14-51fc-47dd-9240-62cb3ec58af6',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100017,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c45f5a7d-ab58-482e-9a71-1997f54736c4' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = 'ID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c45f5a7d-ab58-482e-9a71-1997f54736c4',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ff0e4edf-1d03-40d5-bfac-659fea2d4047' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = 'Name')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'ff0e4edf-1d03-40d5-bfac-659fea2d4047',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100002,
        'Name',
        'Name',
        'Full country name (e.g., "United States", "Canada").',
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ec04f8e-5f7b-4d54-9cfa-3eddece50637' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = 'ISO2')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1ec04f8e-5f7b-4d54-9cfa-3eddece50637',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100003,
        'ISO2',
        'Iso 2',
        'ISO 3166-1 alpha-2 code (e.g., "US", "CA"). Unique business key for lookups.',
        'TEXT',
        4,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3ae14f22-8e67-4428-a540-7210fd37d4f3' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = 'ISO3')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '3ae14f22-8e67-4428-a540-7210fd37d4f3',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100004,
        'ISO3',
        'Iso 3',
        'ISO 3166-1 alpha-3 code (e.g., "USA", "CAN"). Unique business key for lookups.',
        'TEXT',
        6,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ac735dfc-8a31-4450-a0bd-eb42dc50f4dd' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = 'NumericCode')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'ac735dfc-8a31-4450-a0bd-eb42dc50f4dd',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100005,
        'NumericCode',
        'Numeric Code',
        'ISO 3166-1 numeric code (e.g., 840 for US, 124 for Canada).',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e9de72d2-0320-42d6-b367-512ea1fb6a61' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = 'Latitude')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e9de72d2-0320-42d6-b367-512ea1fb6a61',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100006,
        'Latitude',
        'Latitude',
        'Geographic centroid latitude. Used as fallback point for country-level geocoding.',
        'decimal',
        9,
        10,
        6,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd0b9cd33-3b5d-48d5-9e0c-979d906a89a7' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = 'Longitude')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd0b9cd33-3b5d-48d5-9e0c-979d906a89a7',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100007,
        'Longitude',
        'Longitude',
        'Geographic centroid longitude. Used as fallback point for country-level geocoding.',
        'decimal',
        9,
        10,
        6,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '16649f72-2bc6-4849-9f04-ed5152af4973' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = 'BoundaryGeoJSON')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '16649f72-2bc6-4849-9f04-ed5152af4973',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100008,
        'BoundaryGeoJSON',
        'Boundary Geo JSON',
        'Medium-resolution (~50m) GeoJSON boundary polygon for choropleth map rendering. Nullable — point map falls back to centroid if absent. Total ~3MB for all countries.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5c2d067e-8e65-4734-8aa6-d15a4616423f' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = 'CommonAliases')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '5c2d067e-8e65-4734-8aa6-d15a4616423f',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100009,
        'CommonAliases',
        'Common Aliases',
        'JSON array of common aliases and alternate names (e.g., ["United States","USA","U.S.","America"]). Used by GeoResolver for fuzzy text-to-country matching.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2fab840e-b124-4da6-8b93-83e04e1ccec5' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2fab840e-b124-4da6-8b93-83e04e1ccec5',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100010,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '547f24f8-8693-44aa-94a3-46d9d920b538' OR ("EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '547f24f8-8693-44aa-94a3-46d9d920b538',
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- "Entity": "MJ": "Countries"
        100011,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd152568a-2ade-444c-b90d-25e0ea572e5d' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'ID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd152568a-2ade-444c-b90d-25e0ea572e5d',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '91bf2a06-1c23-46f9-8d79-a81015836573' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'CountryID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '91bf2a06-1c23-46f9-8d79-a81015836573',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100002,
        'CountryID',
        'Country ID',
        'Foreign key to Country. Establishes the parent country for this state/province.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '22834f17-39bf-4b4f-bb12-ac82b5d27812' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'Name')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '22834f17-39bf-4b4f-bb12-ac82b5d27812',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100003,
        'Name',
        'Name',
        'Full state/province name (e.g., "California", "Ontario").',
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '67b42824-236e-4d32-a44e-ba69b2675d85' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'Code')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '67b42824-236e-4d32-a44e-ba69b2675d85',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100004,
        'Code',
        'Code',
        'Short code within the country (e.g., "CA", "ON"). Unique per country via compound constraint.',
        'TEXT',
        20,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a32988c3-192d-4cc2-a84a-2080546bc47d' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'ISO3166_2')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a32988c3-192d-4cc2-a84a-2080546bc47d',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100005,
        'ISO3166_2',
        'Iso 31662',
        'ISO 3166-2 subdivision code (e.g., "US-CA", "CA-ON"). Globally unique.',
        'TEXT',
        20,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f53e01c8-6574-4ae2-9bce-6b4872e4e768' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'Latitude')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f53e01c8-6574-4ae2-9bce-6b4872e4e768',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100006,
        'Latitude',
        'Latitude',
        'Geographic centroid latitude. Used as fallback point for state-level geocoding.',
        'decimal',
        9,
        10,
        6,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '69d0fb57-2826-4db9-a4f9-8f5f1eae68a1' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'Longitude')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '69d0fb57-2826-4db9-a4f9-8f5f1eae68a1',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100007,
        'Longitude',
        'Longitude',
        'Geographic centroid longitude. Used as fallback point for state-level geocoding.',
        'decimal',
        9,
        10,
        6,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1e447afd-91e9-4d6b-9ec7-d1a55b82145b' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'BoundaryGeoJSON')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1e447afd-91e9-4d6b-9ec7-d1a55b82145b',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100008,
        'BoundaryGeoJSON',
        'Boundary Geo JSON',
        'Medium-resolution (~50m) GeoJSON boundary polygon for choropleth map rendering. Nullable. Total ~15-20MB for all states/provinces worldwide.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1614c4f0-7ec6-440b-835f-6a5d826e4eb8' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'CommonAliases')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1614c4f0-7ec6-440b-835f-6a5d826e4eb8',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100009,
        'CommonAliases',
        'Common Aliases',
        'JSON array of common aliases (e.g., ["Calif.","California","Cal"]). Used by GeoResolver for fuzzy text-to-state matching.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dce8dadc-f9ff-4cf7-bb42-5e361dd4a582' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'dce8dadc-f9ff-4cf7-bb42-5e361dd4a582',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100010,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9e6c31e8-d3ab-478b-8a5e-639a60ca0fd1' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '9e6c31e8-d3ab-478b-8a5e-639a60ca0fd1',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100011,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4fc56d01-b080-4ea7-850d-3ca91a48ee9f', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 1, 'city', 'city', NOW(), NOW());
/* SQL text to insert entity field value with ID f79b8613-89e5-431a-94ea-bd13f5007f59 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f79b8613-89e5-431a-94ea-bd13f5007f59', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 2, 'country', 'country', NOW(), NOW());
/* SQL text to insert entity field value with ID ec878e18-0a70-4d2c-aa1e-75ff460787c9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ec878e18-0a70-4d2c-aa1e-75ff460787c9', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 3, 'county', 'county', NOW(), NOW());
/* SQL text to insert entity field value with ID db0047cf-7899-4465-aaed-7123f4d8a49f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('db0047cf-7899-4465-aaed-7123f4d8a49f', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 4, 'exact', 'exact', NOW(), NOW());
/* SQL text to insert entity field value with ID faf85ba4-421e-45c5-964a-107ba06ef68f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('faf85ba4-421e-45c5-964a-107ba06ef68f', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 5, 'postal_code', 'postal_code', NOW(), NOW());
/* SQL text to insert entity field value with ID 862d3ae5-ee6c-424f-b1d4-1de629cfb84a */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('862d3ae5-ee6c-424f-b1d4-1de629cfb84a', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 6, 'state_province', 'state_province', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 4CCD7FD8-7341-499F-B199-4D65D87203DB */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='4CCD7FD8-7341-499F-B199-4D65D87203DB';
/* SQL text to insert entity field value with ID b7b9d7b7-fb1e-470b-bdf9-7591a51d70c1 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b7b9d7b7-fb1e-470b-bdf9-7591a51d70c1', '32396F7D-F786-4612-BA91-78006867FC63', 1, 'failed', 'failed', NOW(), NOW());
/* SQL text to insert entity field value with ID 25692691-a9ce-45b1-b77e-0cf4f027d95b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('25692691-a9ce-45b1-b77e-0cf4f027d95b', '32396F7D-F786-4612-BA91-78006867FC63', 2, 'pending', 'pending', NOW(), NOW());
/* SQL text to insert entity field value with ID 357b6064-947e-4a81-a78b-df0cc42d0cf9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('357b6064-947e-4a81-a78b-df0cc42d0cf9', '32396F7D-F786-4612-BA91-78006867FC63', 3, 'success', 'success', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 32396F7D-F786-4612-BA91-78006867FC63 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='32396F7D-F786-4612-BA91-78006867FC63';
/* SQL text to insert entity field value with ID 13834a14-5c08-4125-bd68-46cf939850b3 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('13834a14-5c08-4125-bd68-46cf939850b3', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 1, 'google', 'google', NOW(), NOW());
/* SQL text to insert entity field value with ID 86d9583e-8de4-436f-905a-61572273bdb7 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('86d9583e-8de4-436f-905a-61572273bdb7', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 2, 'ip_geolocation', 'ip_geolocation', NOW(), NOW());
/* SQL text to insert entity field value with ID 19ffd25e-c31f-4d80-9523-e4ffe623c1e7 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('19ffd25e-c31f-4d80-9523-e4ffe623c1e7', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 3, 'manual', 'manual', NOW(), NOW());
/* SQL text to insert entity field value with ID e8e2a502-5c51-4937-af6e-9d13e3a3735c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e8e2a502-5c51-4937-af6e-9d13e3a3735c', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 4, 'native', 'native', NOW(), NOW());
/* SQL text to insert entity field value with ID 786b8847-be88-4460-bcff-5aa41afce2ff */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('786b8847-be88-4460-bcff-5aa41afce2ff', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 5, 'reference_data', 'reference_data', NOW(), NOW());
/* SQL text to insert entity field value with ID d12f1417-677f-46f9-a337-d9d002ce2b2e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d12f1417-677f-46f9-a337-d9d002ce2b2e', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 6, 'reverse', 'reverse', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID BCA87CF8-5989-4A92-BA21-3B3B409401AB */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='BCA87CF8-5989-4A92-BA21-3B3B409401AB';
/* Create Entity Relationship: MJ: Entities -> MJ: Record Geo Codes (One To Many via EntityID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'dbc9cb91-f2de-4e75-a4a6-4390e8ae7015'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('dbc9cb91-f2de-4e75-a4a6-4390e8ae7015', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'EntityID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd55a888d-11b0-47c0-89bc-b90aed85ad00'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d55a888d-11b0-47c0-89bc-b90aed85ad00', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'CountryID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c8d7452a-bf0b-4697-92c9-e5242fc5dcde'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('c8d7452a-bf0b-4697-92c9-e5242fc5dcde', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', 'CountryID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '61911e66-8e4d-4eb3-82aa-80234bc9e6e6'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('61911e66-8e4d-4eb3-82aa-80234bc9e6e6', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'StateProvinceID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '419bc535-b734-4b60-8fa6-ca0406b40463' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'Entity')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '419bc535-b734-4b60-8fa6-ca0406b40463',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100035,
        'Entity',
        'Entity',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dd63ac51-ece5-44af-a737-8dd9398237f1' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'Country')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'dd63ac51-ece5-44af-a737-8dd9398237f1',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100036,
        'Country',
        'Country',
        NULL,
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e32baf2a-fb99-44f7-a9d3-1f437e44d2ae' OR ("EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND "Name" = 'StateProvince')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e32baf2a-fb99-44f7-a9d3-1f437e44d2ae',
        '54EF915A-9902-4958-8E09-AE6E7B525E97', -- "Entity": "MJ": "Record" "Geo" "Codes"
        100037,
        'StateProvince',
        'State Province',
        NULL,
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '900a7d60-efc9-4174-b614-74ad4709962a' OR ("EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND "Name" = 'Country')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '900a7d60-efc9-4174-b614-74ad4709962a',
        '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- "Entity": "MJ": "State" "Provinces"
        100023,
        'Country',
        'Country',
        NULL,
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'AD4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'AE4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '419BC535-B734-4B60-8FA6-CA0406B40463'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'F51815BB-B7F2-476F-B0B4-8119EEEDE33B'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'F3E3AF4A-10E0-443A-A744-C6CD004C5C31'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F51815BB-B7F2-476F-B0B4-8119EEEDE33B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F3E3AF4A-10E0-443A-A744-C6CD004C5C31'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4CCD7FD8-7341-499F-B199-4D65D87203DB'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '32396F7D-F786-4612-BA91-78006867FC63'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '419BC535-B734-4B60-8FA6-CA0406B40463'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'DD63AC51-ECE5-44AF-A737-8DD9398237F1'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E32BAF2A-FB99-44F7-A9D3-1F437E44D2AE'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'F51815BB-B7F2-476F-B0B4-8119EEEDE33B'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'F3E3AF4A-10E0-443A-A744-C6CD004C5C31'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '419BC535-B734-4B60-8FA6-CA0406B40463'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'DD63AC51-ECE5-44AF-A737-8DD9398237F1'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'E32BAF2A-FB99-44F7-A9D3-1F437E44D2AE'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '524E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '204F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '524E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1EC04F8E-5F7B-4D54-9CFA-3EDDECE50637'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '3AE14F22-8E67-4428-A540-7210FD37D4F3'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'AC735DFC-8A31-4450-A0BD-EB42DC50F4DD'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '1EC04F8E-5F7B-4D54-9CFA-3EDDECE50637'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '3AE14F22-8E67-4428-A540-7210FD37D4F3'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '5C2D067E-8E65-4734-8AA6-D15A4616423F'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '67B42824-236E-4D32-A44E-BA69B2675D85'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A32988C3-192D-4CC2-A84A-2080546BC47D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '900A7D60-EFC9-4174-B614-74AD4709962A'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '67B42824-236E-4D32-A44E-BA69B2675D85'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'A32988C3-192D-4CC2-A84A-2080546BC47D'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '1614C4F0-7EC6-440B-835F-6A5D826E4EB8'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '900A7D60-EFC9-4174-B614-74AD4709962A'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 20 fields */
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Record Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2174C80E-D364-4DBA-92F6-EEAADA410BD7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."RecordID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Record Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Record',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F51815BB-B7F2-476F-B0B4-8119EEEDE33B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Record Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '419BC535-B734-4B60-8FA6-CA0406B40463' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."LocationType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Record Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F3E3AF4A-10E0-443A-A744-C6CD004C5C31' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."SourceFieldHash"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Record Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B1B38354-D8A9-4079-A15F-8ECCFD558576' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."Latitude"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geocoding Results',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Geo',
   "CodeType" = NULL
WHERE 
   "ID" = 'BAD1868E-5D5A-4287-AFCF-352C2A3E6699' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."Longitude"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geocoding Results',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Geo',
   "CodeType" = NULL
WHERE 
   "ID" = 'EC46B3E9-73AB-48CD-B231-4D7312BADBBE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."Precision"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geocoding Results',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4CCD7FD8-7341-499F-B199-4D65D87203DB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."CountryID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geocoding Results',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Country',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '82F838DD-B57B-4AAD-AEF1-04E381E2971F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."StateProvinceID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geocoding Results',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'State Province',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '73458121-BBFC-40FA-A093-D2B939839211' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."Country"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geocoding Results',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Country Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DD63AC51-ECE5-44AF-A737-8DD9398237F1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."StateProvince"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geocoding Results',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'State Province Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E32BAF2A-FB99-44F7-A9D3-1F437E44D2AE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '32396F7D-F786-4612-BA91-78006867FC63' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."GeocodingSource"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BCA87CF8-5989-4A92-BA21-3B3B409401AB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."GeocodedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '46621B92-ADB4-4206-A660-2D93B634E7A4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."RetryCount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4DAE2800-36FC-49C5-8D3E-64EAF15708A0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."ErrorMessage"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2B5FE6B9-B64F-401B-AEF2-1613456109E5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '797360EF-109D-4A8F-B040-5B2141DB37C5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '04104288-E86F-4F22-A8CF-3A6AE181311E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Record Geo Codes.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '731BBA14-51FC-47DD-9240-62CB3EC58AF6' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-map-marked-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-map-marked-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '54EF915A-9902-4958-8E09-AE6E7B525E97';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('2aca268b-65ec-4042-b994-feff632b6ac3', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'FieldCategoryInfo', '{"Record Mapping":{"icon":"fa fa-link","description":"Information linking the geocode to its source entity and record"},"Geocoding Results":{"icon":"fa fa-map-marker-alt","description":"The resulting coordinates and geographic regional classifications"},"Processing Status":{"icon":"fa fa-sync","description":"Technical status, error logs, and metadata for the geocoding process"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('3d5f5205-de54-499d-9d7e-c0e44841db6e', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'FieldCategoryIcons', '{"Record Mapping":"fa fa-link","Geocoding Results":"fa fa-map-marker-alt","Processing Status":"fa fa-sync","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '54EF915A-9902-4958-8E09-AE6E7B525E97';
/* Set categories for 12 fields */
-- UPDATE Entity Field Category Info MJ: State Provinces."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D152568A-2ADE-444C-B90D-25E0EA572E5D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces."CountryID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Administrative Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Country',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '91BF2A06-1C23-46F9-8D79-A81015836573' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Administrative Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '22834F17-39BF-4B4F-BB12-AC82B5D27812' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces."Code"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Administrative Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'State Code',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '67B42824-236E-4D32-A44E-BA69B2675D85' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces."ISO3166_2"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Administrative Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'ISO 3166-2 Code',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A32988C3-192D-4CC2-A84A-2080546BC47D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces."Country"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Administrative Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Country Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '900A7D60-EFC9-4174-B614-74AD4709962A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces."Latitude"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geospatial Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Geo',
   "CodeType" = NULL
WHERE 
   "ID" = 'F53E01C8-6574-4AE2-9BCE-6B4872E4E768' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces."Longitude"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geospatial Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Geo',
   "CodeType" = NULL
WHERE 
   "ID" = '69D0FB57-2826-4DB9-A4F9-8F5F1EAE68A1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces."BoundaryGeoJSON"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geospatial Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Boundary GeoJSON',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '1E447AFD-91E9-4D6B-9EC7-D1A55B82145B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces."CommonAliases"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geospatial Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '1614C4F0-7EC6-440B-835F-6A5D826E4EB8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DCE8DADC-F9FF-4CF7-BB42-5E361DD4A582' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: State Provinces.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9E6C31E8-D3AB-478B-8A5E-639A60CA0FD1' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-map */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-map', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('94b1acee-2f0b-4e01-a0a9-2b1c5dbcb7f8', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', 'FieldCategoryInfo', '{"Administrative Details":{"icon":"fa fa-id-card","description":"Core identification, names, and standardized codes for the administrative division."},"Geospatial Information":{"icon":"fa fa-globe-americas","description":"Coordinates, boundary data, and aliases used for mapping and geographic resolution."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('eff0ea3f-936c-4aa9-acc9-984cef72a06f', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', 'FieldCategoryIcons', '{"Administrative Details":"fa fa-id-card","Geospatial Information":"fa fa-globe-americas","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '12C21789-12CC-4A8C-81ED-FFCBC1D69336';
/* Set categories for 11 fields */
-- UPDATE Entity Field Category Info MJ: Countries."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C45F5A7D-AB58-482E-9A71-1997F54736C4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Country Identification',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF0E4EDF-1D03-40D5-BFAC-659FEA2D4047' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries."ISO2"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Country Identification',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'ISO 2',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1EC04F8E-5F7B-4D54-9CFA-3EDDECE50637' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries."ISO3"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Country Identification',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'ISO 3',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3AE14F22-8E67-4428-A540-7210FD37D4F3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries."NumericCode"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Country Identification',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AC735DFC-8A31-4450-A0BD-EB42DC50F4DD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries."CommonAliases"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Country Identification',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5C2D067E-8E65-4734-8AA6-D15A4616423F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries."Latitude"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geographic Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Geo',
   "CodeType" = NULL
WHERE 
   "ID" = 'E9DE72D2-0320-42D6-B367-512EA1FB6A61' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries."Longitude"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geographic Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Geo',
   "CodeType" = NULL
WHERE 
   "ID" = 'D0B9CD33-3B5D-48D5-9E0C-979D906A89A7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries."BoundaryGeoJSON"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Geographic Data',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Boundary GeoJSON',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '16649F72-2BC6-4849-9F04-ED5152AF4973' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2FAB840E-B124-4DA6-8B93-83E04E1CCEC5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Countries.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '547F24F8-8693-44AA-94A3-46D9D920B538' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-globe-americas */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-globe-americas', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('ebb4fc21-b341-4f6a-b5fe-a1a15e73e8af', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', 'FieldCategoryInfo', '{"Country Identification":{"icon":"fa fa-id-card","description":"Official names, standard ISO codes, and common aliases used to identify countries."},"Geographic Data":{"icon":"fa fa-map-marked-alt","description":"Centroid coordinates and spatial boundary data for mapping and geocoding."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and technical identifiers."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('17d67c26-f2f6-4b83-a0be-d5e6226a2174', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', 'FieldCategoryIcons', '{"Country Identification":"fa fa-id-card","Geographic Data":"fa fa-map-marked-alt","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2';
/* Refresh custom base views for modified entities so schema changes are picked up */


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwApplicationEntities" TO "cdp_Developer", "cdp_Integration", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spCreateApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Application Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spUpdateApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spDeleteApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Application Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for Country */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: vwCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Countries
-----               SCHEMA:      __mj
-----               BASE TABLE:  Country
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCountries" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: Permissions for vwCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCountries" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: spCreateCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Country
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCountry" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Countries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCountry" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: spUpdateCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Country
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCountry" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCountry" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: spDeleteCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Country
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCountry" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Countries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCountry" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for EntityFieldValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityFieldID in table EntityFieldValue;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityFieldValues" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spCreateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwRecordGeoCodes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: Permissions for vwRecordGeoCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwRecordGeoCodes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: spCreateRecordGeoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordGeoCode
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateRecordGeoCode" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Record Geo Codes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateRecordGeoCode" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: spUpdateRecordGeoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordGeoCode
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordGeoCode" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordGeoCode" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: spDeleteRecordGeoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordGeoCode
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordGeoCode" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Record Geo Codes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordGeoCode" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for StateProvince */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CountryID in table StateProvince;

DO $$ BEGIN GRANT SELECT ON __mj."vwStateProvinces" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: Permissions for vwStateProvinces
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwStateProvinces" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: spCreateStateProvince
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR StateProvince
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateStateProvince" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: State Provinces */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateStateProvince" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: spUpdateStateProvince
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR StateProvince
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateStateProvince" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateStateProvince" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: spDeleteStateProvince
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR StateProvince
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteStateProvince" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: State Provinces */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteStateProvince" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."Country" IS 'Reference table for countries with ISO 3166-1 codes, geographic centroids, and optional medium-resolution boundary GeoJSON for choropleth rendering. Seeded with ~250 countries.';

COMMENT ON COLUMN __mj."Country"."Name" IS 'Full country name (e.g., "United States", "Canada").';

COMMENT ON COLUMN __mj."Country"."ISO2" IS 'ISO 3166-1 alpha-2 code (e.g., "US", "CA"). Unique business key for lookups.';

COMMENT ON COLUMN __mj."Country"."ISO3" IS 'ISO 3166-1 alpha-3 code (e.g., "USA", "CAN"). Unique business key for lookups.';

COMMENT ON COLUMN __mj."Country"."NumericCode" IS 'ISO 3166-1 numeric code (e.g., 840 for US, 124 for Canada).';

COMMENT ON COLUMN __mj."Country"."Latitude" IS 'Geographic centroid latitude. Used as fallback point for country-level geocoding.';

COMMENT ON COLUMN __mj."Country"."Longitude" IS 'Geographic centroid longitude. Used as fallback point for country-level geocoding.';

COMMENT ON COLUMN __mj."Country"."BoundaryGeoJSON" IS 'Medium-resolution (~50m) GeoJSON boundary polygon for choropleth map rendering. Nullable — point map falls back to centroid if absent. Total ~3MB for all countries.';

COMMENT ON COLUMN __mj."Country"."CommonAliases" IS 'JSON array of common aliases and alternate names (e.g., ["United States","USA","U.S.","America"]). Used by GeoResolver for fuzzy text-to-country matching.';

COMMENT ON TABLE __mj."StateProvince" IS 'Reference table for states, provinces, and first-level administrative divisions. Linked to Country via FK. Seeded with ~5,000 records with ISO 3166-2 codes, centroids, and optional boundary GeoJSON.';

COMMENT ON COLUMN __mj."StateProvince"."CountryID" IS 'Foreign key to Country. Establishes the parent country for this state/province.';

COMMENT ON COLUMN __mj."StateProvince"."Name" IS 'Full state/province name (e.g., "California", "Ontario").';

COMMENT ON COLUMN __mj."StateProvince"."Code" IS 'Short code within the country (e.g., "CA", "ON"). Unique per country via compound constraint.';

COMMENT ON COLUMN __mj."StateProvince"."ISO3166_2" IS 'ISO 3166-2 subdivision code (e.g., "US-CA", "CA-ON"). Globally unique.';

COMMENT ON COLUMN __mj."StateProvince"."Latitude" IS 'Geographic centroid latitude. Used as fallback point for state-level geocoding.';

COMMENT ON COLUMN __mj."StateProvince"."Longitude" IS 'Geographic centroid longitude. Used as fallback point for state-level geocoding.';

COMMENT ON COLUMN __mj."StateProvince"."BoundaryGeoJSON" IS 'Medium-resolution (~50m) GeoJSON boundary polygon for choropleth map rendering. Nullable. Total ~15-20MB for all states/provinces worldwide.';

COMMENT ON COLUMN __mj."StateProvince"."CommonAliases" IS 'JSON array of common aliases (e.g., ["Calif.","California","Cal"]). Used by GeoResolver for fuzzy text-to-state matching.';

COMMENT ON TABLE __mj."RecordGeoCode" IS 'Polymorphic table storing persisted geocoding results for any MJ entity record. Each row maps an entity record + location type to a lat/lng coordinate, with optional country/state references for choropleth grouping. Supports multi-location entities via LocationType discriminator.';

COMMENT ON COLUMN __mj."RecordGeoCode"."EntityID" IS 'Foreign key to Entity. Identifies which entity this geocode belongs to.';

COMMENT ON COLUMN __mj."RecordGeoCode"."RecordID" IS 'MJ composite primary key format string identifying the source record (e.g., "ID|<uuid>"). Max 450 chars for SQL Server index support.';

COMMENT ON COLUMN __mj."RecordGeoCode"."LocationType" IS 'Discriminator for multi-location entities. Default "Primary" for single-address entities. Multi-address examples: "Home", "Business", "Mailing", "PO Box".';

COMMENT ON COLUMN __mj."RecordGeoCode"."Latitude" IS 'Geocoded latitude coordinate. NULL when Status is "pending" or "failed".';

COMMENT ON COLUMN __mj."RecordGeoCode"."Longitude" IS 'Geocoded longitude coordinate. NULL when Status is "pending" or "failed".';

COMMENT ON COLUMN __mj."RecordGeoCode"."Precision" IS 'Precision level of the geocoded result: exact (street address), postal_code, city, county, state_province, or country.';

COMMENT ON COLUMN __mj."RecordGeoCode"."CountryID" IS 'Optional FK to Country reference table. Populated alongside lat/lng to enable choropleth grouping without reverse-geocoding at render time.';

COMMENT ON COLUMN __mj."RecordGeoCode"."StateProvinceID" IS 'Optional FK to StateProvince reference table. Populated alongside lat/lng to enable state-level choropleth grouping.';

COMMENT ON COLUMN __mj."RecordGeoCode"."Status" IS 'Current geocoding status: "pending" (awaiting geocode), "success" (geocoded), or "failed" (geocoding error). Used by scheduled job for retry logic.';

COMMENT ON COLUMN __mj."RecordGeoCode"."ErrorMessage" IS 'Error details when Status is "failed". Captures API error messages, rate limit info, etc. for debugging.';

COMMENT ON COLUMN __mj."RecordGeoCode"."RetryCount" IS 'Number of geocoding attempts. Used for exponential backoff in the scheduled retry job. Stops retrying at configurable maxRetries (default 3).';

COMMENT ON COLUMN __mj."RecordGeoCode"."SourceFieldHash" IS 'SHA-256 hash of the source field values that produced this geocode. When source fields change on save, the hash won';

COMMENT ON COLUMN __mj."RecordGeoCode"."GeocodedAt" IS 'Timestamp of when geocoding was last attempted (success or failure).';

COMMENT ON COLUMN __mj."RecordGeoCode"."GeocodingSource" IS 'How this geocode was produced: google (Google Geocoding API), reference_data (resolved via Country/StateProvince tables), manual (user-entered), ip_geolocation (IP lookup), native (copied from entity lat/lng fields), reverse (reverse geocode from coordinates).';

-- COMMENT ON FUNCTION __mj."fn_MJ_GeoDistance" (procedure-level comment skipped)

-- COMMENT ON FUNCTION __mj."fn_MJ_GeoRecordsNear" (procedure-level comment skipped)


-- ===================== Other =====================

-- Migration: Geo Features — Reference Tables, RecordGeoCode, SQL Functions, Entity Metadata
-- Description: Phase 1 foundation for universal geo mapping capabilities in MemberJunction.
--              Creates Country and StateProvince reference tables, RecordGeoCode polymorphic
--              geocoding results table, Haversine distance scalar function, radius query TVF,
--              and adds SupportsGeoCoding / AutoUpdateSupportsGeoCoding to Entity table and
--              AutoUpdateExtendedType to EntityField table.


-- fix a stale view

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Application Entities */

/* spUpdate Permissions for MJ: Countries */

/* spDelete Permissions for MJ: Entity Field Values */


/* Index for Foreign Keys for RecordGeoCode */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table RecordGeoCode

/* spUpdate Permissions for MJ: Record Geo Codes */

/* spUpdate Permissions for MJ: State Provinces */
