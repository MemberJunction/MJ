-- ============================================================================
-- Grant UI Role Create/Update/Delete Permissions for Lists & List Details
-- Migration: v5.50.x   (PostgreSQL counterpart)
-- ============================================================================
-- Hand-authored. The AST transpiler emits T-SQL-shaped `GRANT EXECUTE ON
-- __mj.spCreateList`, which PostgreSQL folds to lowercase and resolves as a
-- RELATION -- failing with `relation "__mj.spCreateList" does not exist` even
-- though the function is present as the quoted identifier "spCreateList".
-- PostgreSQL needs GRANT EXECUTE ON FUNCTION with the quoted name, which is the
-- form the committed ledger already uses for every CodeGen grant.
--
-- Mirrors the SQL Server original exactly: the same two EntityPermission rows by
-- hardcoded ID, and the same six CRUD grants to cdp_UI.
-- ============================================================================

UPDATE __mj."EntityPermission"
   SET "CanCreate" = TRUE, "CanUpdate" = TRUE, "CanDelete" = TRUE
 WHERE "ID" IN (
       '3779fb77-22f5-4b77-9911-eb0bff301833',   -- UI role on Lists
       '8592f446-638d-4c82-a6b4-bc935a499c70'    -- UI role on List Details
 );

-- ===================== Grants =====================
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateList" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateList" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteList" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateListDetail" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateListDetail" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteListDetail" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
