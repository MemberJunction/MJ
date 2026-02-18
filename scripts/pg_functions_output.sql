
-- ================================================================
-- FUNCTIONS (TVFs and Scalar)
-- ================================================================

CREATE OR REPLACE FUNCTION __mj."fnAIPromptResultSelectorPromptID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ResultSelectorPromptID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIPrompt"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ResultSelectorPromptID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ResultSelectorPromptID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIPrompt" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ResultSelectorPromptID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ResultSelectorPromptID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnCredentialCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."CredentialCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."CredentialCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnReportCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."ReportCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."ReportCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnSkillParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Skill"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Skill" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAuthorizationParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Authorization"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Authorization" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."ExtractVersionComponents"(p_Description VARCHAR(500))
RETURNS TABLE("Version" VARCHAR(100), "Major" VARCHAR(10), "Minor" VARCHAR(10), "Patch" VARCHAR(10), "VersionDescription" VARCHAR(500)) AS $$
DECLARE
    v_cleaned TEXT;
    v_version TEXT;
    v_parts TEXT[];
    v_desc TEXT;
BEGIN
    v_cleaned := TRIM(p_Description);
    IF v_cleaned LIKE 'v%' THEN v_cleaned := SUBSTRING(v_cleaned, 2); END IF;
    -- Extract version number (digits and dots at the start)
    v_version := (regexp_match(v_cleaned, '^([0-9x.]+)'))[1];
    IF v_version IS NULL THEN RETURN; END IF;
    v_desc := TRIM(SUBSTRING(v_cleaned, LENGTH(v_version) + 1));
    v_parts := string_to_array(v_version, '.');
    RETURN QUERY SELECT
        v_version::VARCHAR(100),
        COALESCE(v_parts[1], '')::VARCHAR(10),
        COALESCE(v_parts[2], '')::VARCHAR(10),
        COALESCE(v_parts[3], '')::VARCHAR(10),
        v_desc::VARCHAR(500);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION __mj."fnAIAgentRunStepParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgentRunStep"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgentRunStep" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAuditLogTypeParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AuditLogType"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AuditLogType" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnConversationDetailParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."ConversationDetail"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."ConversationDetail" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."GetProgrammaticName"(p_input TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN regexp_replace(p_input, '[^a-zA-Z0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION __mj."fnQueryCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."QueryCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."QueryCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnUserViewCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."UserViewCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."UserViewCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnFileCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."FileCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."FileCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAIArchitectureParentArchitectureID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentArchitectureID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIArchitecture"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentArchitectureID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentArchitectureID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIArchitecture" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentArchitectureID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentArchitectureID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAIAgentRunParentRunID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentRunID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentRunID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentRunID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentRunID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAIAgentRunLastRunID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "LastRunID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until LastRunID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."LastRunID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."LastRunID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "LastRunID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnProjectParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Project"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Project" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAIPromptRunParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIPromptRun" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAIPromptRunRerunFromPromptRunID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "RerunFromPromptRunID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until RerunFromPromptRunID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."RerunFromPromptRunID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIPromptRun" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."RerunFromPromptRunID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "RerunFromPromptRunID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnTagParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Tag"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Tag" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnActionCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."ActionCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."ActionCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnTaskParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Task"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Task" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnVersionLabelParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."VersionLabel"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."VersionLabel" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnGeneratedCodeCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."GeneratedCodeCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."GeneratedCodeCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAIAgentParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgent" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnActionParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Action"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Action" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnCollectionParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Collection"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Collection" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAIPromptCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIPromptCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIPromptCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnTemplateCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."TemplateCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."TemplateCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnArtifactTypeParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."ArtifactType"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."ArtifactType" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnListCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."ListCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."ListCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnDashboardCategoryParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."DashboardCategory"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."DashboardCategory" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAIConfigurationParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIConfiguration"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIConfiguration" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnTestSuiteParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."TestSuite"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."TestSuite" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."fnAPIScopeParentID_GetRootID"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        -- Anchor: Start from p_ParentID if not null, otherwise start from p_RecordID
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."APIScope"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."APIScope" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT
        "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."ToProperCase"(p_string VARCHAR(255))
RETURNS VARCHAR(255) AS $$
BEGIN
    RETURN INITCAP(p_string);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION __mj."ToTitleCase"(p_InputString VARCHAR(4000))
RETURNS VARCHAR(4000) AS $$
BEGIN
    RETURN INITCAP(p_InputString);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION __mj."fnInitials"(p_text TEXT)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT := '';
    v_word TEXT;
BEGIN
    FOR v_word IN SELECT regexp_split_to_table(TRIM(p_text), '\s+') LOOP
        IF LENGTH(v_word) > 0 THEN
            v_result := v_result || UPPER(SUBSTRING(v_word, 1, 1)) || '. ';
        END IF;
    END LOOP;
    RETURN RTRIM(v_result);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION __mj."parseDomainFromEmail"(p_Email VARCHAR(320))
RETURNS TEXT AS $$
DECLARE
    v_at_pos INTEGER;
    v_domain TEXT;
BEGIN
    v_at_pos := STRPOS(p_Email, '@');
    IF v_at_pos = 0 THEN RETURN NULL; END IF;
    v_domain := SUBSTRING(p_Email, v_at_pos + 1);
    RETURN __mj."parseDomain"(v_domain);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION __mj."parseDomain"(p_url VARCHAR(1000))
RETURNS TEXT AS $$
DECLARE
    v_url TEXT;
    v_parts TEXT[];
BEGIN
    v_url := p_url;
    -- Remove protocol
    v_url := regexp_replace(v_url, '^https?://', '', 'i');
    -- Remove path
    v_url := SPLIT_PART(v_url, '/', 1);
    -- Get last two parts (domain.tld)
    v_parts := string_to_array(v_url, '.');
    IF array_length(v_parts, 1) >= 2 THEN
        RETURN v_parts[array_length(v_parts, 1) - 1] || '.' || v_parts[array_length(v_parts, 1)];
    ELSE
        RETURN v_url;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

