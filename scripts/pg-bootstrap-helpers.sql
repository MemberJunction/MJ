-- Bootstrap helpers for PG CodeGen: procs + roles + user seeding
-- Run against a PG DB that has migrations applied but hasn't had CodeGen run yet.

-- 1. Create database roles (referenced by GRANT statements in migrations/CodeGen)
DO $$ BEGIN
  CREATE ROLE "cdp_UI" NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE "cdp_Developer" NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE "cdp_Integration" NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
GRANT USAGE ON SCHEMA __mj TO "cdp_UI", "cdp_Developer", "cdp_Integration";
GRANT SELECT ON ALL TABLES IN SCHEMA __mj TO "cdp_UI";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA __mj TO "cdp_Developer";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA __mj TO "cdp_Integration";

-- 2. spGetPrimaryKeyForTable — required by CodeGen entity validation
CREATE OR REPLACE FUNCTION __mj."spGetPrimaryKeyForTable"(
  p_schema_name text, p_table_name text
) RETURNS TABLE("ColumnName" text, "DataType" text) AS $$
BEGIN
  RETURN QUERY
  SELECT kcu.column_name::text, c.data_type::text
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.columns c
    ON c.table_schema = kcu.table_schema AND c.table_name = kcu.table_name
    AND c.column_name = kcu.column_name
  WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = p_schema_name AND tc.table_name = p_table_name
  ORDER BY kcu.ordinal_position;
END;
$$ LANGUAGE plpgsql;

-- 3. Seed System user with Developer role (if not already exists)
INSERT INTO __mj."User" ("ID", "Name", "Email", "Type", "IsActive", "LinkedRecordType")
VALUES ('00000000-0000-0000-0000-000000000001', 'System', 'system@memberjunction.local', 'User', TRUE, 'None')
ON CONFLICT ("ID") DO UPDATE SET "IsActive" = TRUE;

-- Link System user to Developer role
DO $$
DECLARE
  v_role_id UUID;
BEGIN
  SELECT "ID" INTO v_role_id FROM __mj."Role" WHERE "Name" = 'Developer' LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM __mj."UserRole" WHERE "UserID" = '00000000-0000-0000-0000-000000000001' AND "RoleID" = v_role_id) THEN
      INSERT INTO __mj."UserRole" ("ID", "UserID", "RoleID")
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_role_id);
    END IF;
  END IF;
  -- Also link to UI role
  SELECT "ID" INTO v_role_id FROM __mj."Role" WHERE "Name" = 'UI' LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM __mj."UserRole" WHERE "UserID" = '00000000-0000-0000-0000-000000000001' AND "RoleID" = v_role_id) THEN
      INSERT INTO __mj."UserRole" ("ID", "UserID", "RoleID")
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_role_id);
    END IF;
  END IF;
END $$;

SELECT 'Bootstrap complete: roles created, spGetPrimaryKeyForTable installed, System user seeded' AS status;
