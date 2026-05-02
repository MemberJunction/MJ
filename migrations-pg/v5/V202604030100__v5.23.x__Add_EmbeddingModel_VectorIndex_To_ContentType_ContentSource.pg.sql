
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Add EmbeddingModelID and VectorIndexID to ContentType and ContentSource tables.
-- ContentType provides the default embedding model and vector index for all sources of that type.
-- ContentSource can override these per-source. When NULL, falls back to ContentType defaults.

ALTER TABLE __mj."ContentType"
 ADD COLUMN "EmbeddingModelID" UUID NULL
            CONSTRAINT FK_ContentType_EmbeddingModel REFERENCES __mj."AIModel"("ID"),
 ADD COLUMN "VectorIndexID" UUID NULL
            CONSTRAINT FK_ContentType_VectorIndex REFERENCES __mj."VectorIndex"("ID");

ALTER TABLE __mj."ContentSource"
 ADD COLUMN "EmbeddingModelID" UUID NULL
            CONSTRAINT FK_ContentSource_EmbeddingModel REFERENCES __mj."AIModel"("ID"),
 ADD COLUMN "VectorIndexID" UUID NULL
            CONSTRAINT FK_ContentSource_VectorIndex REFERENCES __mj."VectorIndex"("ID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID" ON __mj."ContentSource" ("ContentTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID" ON __mj."ContentSource" ("ContentSourceTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID" ON __mj."ContentSource" ("ContentFileTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID" ON __mj."ContentSource" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID" ON __mj."ContentSource" ("VectorIndexID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentType_AIModelID" ON __mj."ContentType" ("AIModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentType_EmbeddingModelID" ON __mj."ContentType" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentType_VectorIndexID" ON __mj."ContentType" ("VectorIndexID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwContentSources';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentSources"
AS SELECT
    c.*,
    "MJContentType_ContentTypeID"."Name" AS "ContentType",
    "MJContentSourceType_ContentSourceTypeID"."Name" AS "ContentSourceType",
    "MJContentFileType_ContentFileTypeID"."Name" AS "ContentFileType",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJVectorIndex_VectorIndexID"."Name" AS "VectorIndex"
FROM
    __mj."ContentSource" AS c
INNER JOIN
    __mj."ContentType" AS "MJContentType_ContentTypeID"
  ON
    c."ContentTypeID" = "MJContentType_ContentTypeID"."ID"
INNER JOIN
    __mj."ContentSourceType" AS "MJContentSourceType_ContentSourceTypeID"
  ON
    c."ContentSourceTypeID" = "MJContentSourceType_ContentSourceTypeID"."ID"
INNER JOIN
    __mj."ContentFileType" AS "MJContentFileType_ContentFileTypeID"
  ON
    c."ContentFileTypeID" = "MJContentFileType_ContentFileTypeID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    c."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS "MJVectorIndex_VectorIndexID"
  ON
    c."VectorIndexID" = "MJVectorIndex_VectorIndexID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentTypes"
AS SELECT
    c.*,
    "MJAIModel_AIModelID"."Name" AS "AIModel",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJVectorIndex_VectorIndexID"."Name" AS "VectorIndex"
FROM
    __mj."ContentType" AS c
INNER JOIN
    __mj."AIModel" AS "MJAIModel_AIModelID"
  ON
    c."AIModelID" = "MJAIModel_AIModelID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    c."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS "MJVectorIndex_VectorIndexID"
  ON
    c."VectorIndexID" = "MJVectorIndex_VectorIndexID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentSource"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_ContentTypeID UUID DEFAULT NULL,
    IN p_ContentSourceTypeID UUID DEFAULT NULL,
    IN p_ContentFileTypeID UUID DEFAULT NULL,
    IN p_URL VARCHAR(2000) DEFAULT NULL,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_VectorIndexID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwContentSources" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentSource"
            (
                "ID",
                "Name",
                "ContentTypeID",
                "ContentSourceTypeID",
                "ContentFileTypeID",
                "URL",
                "EmbeddingModelID",
                "VectorIndexID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_ContentTypeID,
                p_ContentSourceTypeID,
                p_ContentFileTypeID,
                p_URL,
                p_EmbeddingModelID,
                p_VectorIndexID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentSource"
            (
                "Name",
                "ContentTypeID",
                "ContentSourceTypeID",
                "ContentFileTypeID",
                "URL",
                "EmbeddingModelID",
                "VectorIndexID"
            )
        VALUES
            (
                p_Name,
                p_ContentTypeID,
                p_ContentSourceTypeID,
                p_ContentFileTypeID,
                p_URL,
                p_EmbeddingModelID,
                p_VectorIndexID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentSource"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_ContentTypeID UUID,
    IN p_ContentSourceTypeID UUID,
    IN p_ContentFileTypeID UUID,
    IN p_URL VARCHAR(2000),
    IN p_EmbeddingModelID UUID,
    IN p_VectorIndexID UUID
)
RETURNS SETOF __mj."vwContentSources" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentSource"
    SET
        "Name" = p_Name,
        "ContentTypeID" = p_ContentTypeID,
        "ContentSourceTypeID" = p_ContentSourceTypeID,
        "ContentFileTypeID" = p_ContentFileTypeID,
        "URL" = p_URL,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "VectorIndexID" = p_VectorIndexID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentSource"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentSource"
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AIModelID UUID DEFAULT NULL,
    IN p_MinTags INTEGER DEFAULT NULL,
    IN p_MaxTags INTEGER DEFAULT NULL,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_VectorIndexID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwContentTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentType"
            (
                "ID",
                "Name",
                "Description",
                "AIModelID",
                "MinTags",
                "MaxTags",
                "EmbeddingModelID",
                "VectorIndexID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_AIModelID,
                p_MinTags,
                p_MaxTags,
                p_EmbeddingModelID,
                p_VectorIndexID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentType"
            (
                "Name",
                "Description",
                "AIModelID",
                "MinTags",
                "MaxTags",
                "EmbeddingModelID",
                "VectorIndexID"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_AIModelID,
                p_MinTags,
                p_MaxTags,
                p_EmbeddingModelID,
                p_VectorIndexID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_AIModelID UUID,
    IN p_MinTags INTEGER,
    IN p_MaxTags INTEGER,
    IN p_EmbeddingModelID UUID,
    IN p_VectorIndexID UUID
)
RETURNS SETOF __mj."vwContentTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "AIModelID" = p_AIModelID,
        "MinTags" = p_MinTags,
        "MaxTags" = p_MaxTags,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "VectorIndexID" = p_VectorIndexID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentType"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentSource_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentSource" ON __mj."ContentSource";
CREATE TRIGGER "trgUpdateContentSource"
    BEFORE UPDATE ON __mj."ContentSource"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentSource_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentType" ON __mj."ContentType";
CREATE TRIGGER "trgUpdateContentType"
    BEFORE UPDATE ON __mj."ContentType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentType_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '045043fd-61a9-477f-82a7-72a7fc615a3c' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EmbeddingModelID')
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
        '045043fd-61a9-477f-82a7-72a7fc615a3c',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100020,
        'EmbeddingModelID',
        'Embedding Model ID',
        'Per-source override for the AI embedding model. When NULL, falls back to the ContentType default.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'FD238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '11091434-73bd-4006-8c65-8639ea9af1f3' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'VectorIndexID')
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
        '11091434-73bd-4006-8c65-8639ea9af1f3',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100021,
        'VectorIndexID',
        'Vector Index ID',
        'Per-source override for the vector index. When NULL, falls back to the ContentType default.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '1D248F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0706ebd4-7d99-4f16-99df-0e398e319aa3' OR ("EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EmbeddingModelID')
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
        '0706ebd4-7d99-4f16-99df-0e398e319aa3',
        'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Types"
        100018,
        'EmbeddingModelID',
        'Embedding Model ID',
        'Default AI embedding model for vectorizing content items of this type. Sources can override per-source. If NULL, uses the first available embedding model.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'FD238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '93d4f3c4-3110-41cd-85fd-7a6a2c28b2a4' OR ("EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'VectorIndexID')
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
        '93d4f3c4-3110-41cd-85fd-7a6a2c28b2a4',
        'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Types"
        100019,
        'VectorIndexID',
        'Vector Index ID',
        'Default vector index for storing embeddings of this content type. Sources can override per-source. If NULL, uses the first available vector index.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '1D248F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '55eb97e2-6359-4f17-aabb-659bdb56596b'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('55eb97e2-6359-4f17-aabb-659bdb56596b', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'EmbeddingModelID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '51cd24aa-6737-4d06-810a-251c93953f9c'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('51cd24aa-6737-4d06-810a-251c93953f9c', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'EmbeddingModelID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f7bfc7f4-5e0a-471a-af4f-64e5b9655919'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f7bfc7f4-5e0a-471a-af4f-64e5b9655919', '1D248F34-2837-EF11-86D4-6045BDEE16E6', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'VectorIndexID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'fcabd159-2211-4477-ba69-3bbbda54cf40'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('fcabd159-2211-4477-ba69-3bbbda54cf40', '1D248F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'VectorIndexID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '12de0fa4-7538-42be-9c11-7638b15b2d78' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EmbeddingModel')
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
        '12de0fa4-7538-42be-9c11-7638b15b2d78',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100027,
        'EmbeddingModel',
        'Embedding Model',
        NULL,
        'TEXT',
        100,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9ca2dc63-66ec-405b-9974-81fd5129b693' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'VectorIndex')
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
        '9ca2dc63-66ec-405b-9974-81fd5129b693',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100028,
        'VectorIndex',
        'Vector Index',
        NULL,
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'baab3cb5-accb-4594-bc69-8031edbf0aa7' OR ("EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EmbeddingModel')
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
        'baab3cb5-accb-4594-bc69-8031edbf0aa7',
        'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Types"
        100023,
        'EmbeddingModel',
        'Embedding Model',
        NULL,
        'TEXT',
        100,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3c4fec28-2617-418e-b476-09722b4a0858' OR ("EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'VectorIndex')
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
        '3c4fec28-2617-418e-b476-09722b4a0858',
        'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Types"
        100024,
        'VectorIndex',
        'Vector Index',
        NULL,
        'TEXT',
        510,
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

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'BFB7433E-F36B-1410-867F-007B559E242F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'BFB7433E-F36B-1410-867F-007B559E242F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '8E282AD9-2695-4F04-AC1F-79A5380D4E4D'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'FBB09B21-50A3-4CCE-A114-44B0C9835251'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'ABA84E45-FDE6-4FD0-ACC9-BDA83A8CDE17'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '3C4FEC28-2617-418E-B476-09722B4A0858'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '4FB8433E-F36B-1410-867F-007B559E242F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'ADDF8AC9-BF3A-4ECB-AF21-5C04DA27C396'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '3C4FEC28-2617-418E-B476-09722B4A0858'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 15 fields */
-- UPDATE Entity Field Category Info MJ: Content Sources."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A1B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Connection Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A7B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Classification',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ADB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentSourceTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Connection Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Source Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B3B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentFileTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Classification',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content File Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B9B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."URL"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Connection Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = 'BFB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CBB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."EmbeddingModelID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Indexing',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Embedding Model',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '045043FD-61A9-477F-82A7-72A7FC615A3C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."VectorIndexID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Indexing',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vector Index',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '11091434-73BD-4006-8C65-8639EA9AF1F3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8E282AD9-2695-4F04-AC1F-79A5380D4E4D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentSourceType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBB09B21-50A3-4CCE-A114-44B0C9835251' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentFileType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ABA84E45-FDE6-4FD0-ACC9-BDA83A8CDE17' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."EmbeddingModel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Indexing',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '12DE0FA4-7538-42BE-9C11-7638B15B2D78' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."VectorIndex"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Indexing',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9CA2DC63-66EC-405B-9974-81FD5129B693' AND "AutoUpdateCategory" = TRUE;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('e301296b-555a-45d5-825e-6dee281dd0de', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"AI & Indexing":{"icon":"fa fa-robot","description":"Configuration for AI embedding models and vector search indexing specific to this content source."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and technical identifiers."}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"AI & Indexing":"fa fa-robot","System Metadata":"fa fa-cog"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 13 fields */
-- UPDATE Entity Field Category Info MJ: Content Types."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Type Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '49B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Type Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4FB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."MinTags"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tagging Rules',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Minimum Tags',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5BB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."MaxTags"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tagging Rules',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Maximum Tags',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '61B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."AIModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'AI Model Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ADDF8AC9-BF3A-4ECB-AF21-5C04DA27C396' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."AIModelID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI Model Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'AI Model',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '55B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."EmbeddingModel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI Model Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Embedding Model Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."EmbeddingModelID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI Model Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Embedding Model',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0706EBD4-7D99-4F16-99DF-0E398E319AA3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."VectorIndex"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI Model Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vector Index Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C4FEC28-2617-418E-B476-09722B4A0858' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."VectorIndexID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI Model Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vector Index',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93D4F3C4-3110-41CD-85FD-7A6A2C28B2A4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '43B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '67B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6DB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('39d88c22-f56a-4d0e-9358-4cf77816a116', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"Content Type Details":{"icon":"fa fa-file-alt","description":"Basic identification and descriptive information for the content type"},"Tagging Rules":{"icon":"fa fa-tags","description":"Constraints and requirements for tag application on content of this type"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Content Type Details":"fa fa-file-alt","Tagging Rules":"fa fa-tags","System Metadata":"fa fa-cog"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryIcons';


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwContentSources" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentSources" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spCreateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Sources */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spUpdateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Sources */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentType
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Permissions for vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spCreateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spUpdateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spDeleteContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ContentType"."EmbeddingModelID" IS 'Default AI embedding model for vectorizing content items of this type. Sources can override per-source. If NULL, uses the first available embedding model.';

COMMENT ON COLUMN __mj."ContentType"."VectorIndexID" IS 'Default vector index for storing embeddings of this content type. Sources can override per-source. If NULL, uses the first available vector index.';

COMMENT ON COLUMN __mj."ContentSource"."EmbeddingModelID" IS 'Per-source override for the AI embedding model. When NULL, falls back to the ContentType default.';

COMMENT ON COLUMN __mj."ContentSource"."VectorIndexID" IS 'Per-source override for the vector index. When NULL, falls back to the ContentType default.';


-- ===================== Other =====================

-- Extended Properties

/* spUpdate Permissions for MJ: Content Sources */

/* spUpdate Permissions for MJ: Content Types */
