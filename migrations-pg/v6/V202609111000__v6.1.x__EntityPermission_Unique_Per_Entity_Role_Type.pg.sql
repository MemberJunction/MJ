-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609111000__v6.1.x__EntityPermission_Unique_Per_Entity_Role_Type.sql
-- HAND-AUTHORED. The AST transpiler reported 9 unhandled statements on this file and what it did
-- emit was not merely incomplete but wrong: it cast the BIT flags to `UTINYINT` (a DuckDB type that
-- does not exist in PostgreSQL) and aggregated the filter columns with `MAX(uuid)` — and
-- `max(uuid)` is not a PostgreSQL aggregate either (verified on PG 16: "function max(uuid) does not
-- exist"). It also dropped the conflict guard, the UPDATE, the DELETE and the UNIQUE constraint,
-- leaving a file that would have applied as a near-no-op and left the duplicates in place — which
-- the two field-level-security migrations that follow (V202609111001 / V202609111002) depend on
-- being gone. Ported by hand from the T-SQL original; the reasoning below is that original's.
-- ============================================================================
--
--     EntityPermission: one row per (EntityID, RoleID, Type)
--
--     `EntityPermission` has never carried a uniqueness constraint. Several producers created
--     duplicates: CodeGen's "grant default permissions to a new entity" paths insert
--     unconditionally, and some migrations inserted a narrow grant followed by a wider one.
--
--     `EntityInfo.GetUserPermisions` already folds every matching row into one aggregate by OR-ing
--     the verb flags, so N rows and their OR-merged equivalent are indistinguishable at runtime —
--     but field-level security needs the (entity, role, type) triple to identify exactly one row,
--     so a field permission can be tied to the entity permission it refines.
--
--     `Type` is a real discriminator: CK_EntityPermission_Type restricts it to Allow/Deny,
--     GetUserPermisions aggregates the two into separate buckets and subtracts Deny from Allow, and
--     EntityPermissionProvider is the only unified-permission provider declaring SupportsDeny.
--     Keying on (EntityID, RoleID) alone would forbid that designed pair.
--
--     Duplicates are MERGED, never deleted — deleting the extra row would silently revoke access
--     wherever duplicates disagree. The survivor takes the OR of every verb flag, which is exactly
--     what GetUserPermisions computes today, so the merge is behaviour-preserving by construction.
--
--     RLS filter columns cannot be merged that way: two rows naming DIFFERENT filters have no
--     defensible union. The migration refuses to run on such a group, names the offenders, and asks
--     a human to resolve them. A group where only one row names a filter is not a conflict.
--
--     Survivor = oldest row (earliest __mj_CreatedAt, ties broken by ID), so the original record's
--     identity and creation timestamp are preserved and the choice is deterministic.
--
-- PostgreSQL-specific notes on this port:
--   * T-SQL `MAX(CAST(flag AS TINYINT))` as a boolean OR becomes `bool_or(flag)` — the same
--     semantic, expressed directly, with no integer round-trip.
--   * `MAX(uuid)` has no PostgreSQL equivalent. Because section 1 has already established that at
--     most ONE distinct non-NULL filter exists per column per group, picking the single non-NULL
--     value is exact:  (array_agg(col) FILTER (WHERE col IS NOT NULL))[1].
--   * `#temp` tables become `CREATE TEMP TABLE`; `RAISERROR(...,16,1)` becomes `RAISE EXCEPTION`;
--     `PRINT` becomes `RAISE NOTICE`.
--   * The `sys.indexes` existence probe becomes a `pg_constraint` probe. The T-SQL adds a UNIQUE
--     CONSTRAINT (not a bare index), so the counterpart does too — `pg_constraint` is therefore the
--     right catalog, and the constraint name is preserved so both platforms report the same name.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ---------------------------------------------------------------------------------------------
-- 1. Refuse to proceed on un-mergeable RLS filter conflicts
-- ---------------------------------------------------------------------------------------------
-- COUNT(DISTINCT col) ignores NULLs, so a group where only one row names a filter counts 1 and is
-- not a conflict. Two rows naming different filters count 2 and are.
DO $mj$
DECLARE
    v_conflicts text;
BEGIN
    SELECT string_agg(detail, E'\n')
      INTO v_conflicts
      FROM (
        SELECT '    Entity=' || COALESCE(e."Name", p."EntityID"::text)
             || '  Role='    || COALESCE(r."Name", p."RoleID"::text)
             || '  Type='    || p."Type"
             || '  (rows='   || COUNT(*)::text || ')' AS detail
          FROM __mj."EntityPermission" p
          LEFT JOIN __mj."Entity" e ON e."ID" = p."EntityID"
          LEFT JOIN __mj."Role"   r ON r."ID" = p."RoleID"
         GROUP BY p."EntityID", p."RoleID", p."Type", e."Name", r."Name"
        HAVING COUNT(*) > 1
           AND (COUNT(DISTINCT p."ReadRLSFilterID")   > 1
             OR COUNT(DISTINCT p."CreateRLSFilterID") > 1
             OR COUNT(DISTINCT p."UpdateRLSFilterID") > 1
             OR COUNT(DISTINCT p."DeleteRLSFilterID") > 1)
         LIMIT 50
      ) AS conflicting;

    IF v_conflicts IS NOT NULL THEN
        RAISE EXCEPTION E'EntityPermission has duplicate (EntityID, RoleID, Type) groups whose row-level-security filters DISAGREE. Their verb flags can be merged automatically, but two different RLS filters have no safe union — choosing one would silently change which rows the role can see. Resolve these by hand (keep the correct row, delete the other) and re-run:\n%', v_conflicts;
    END IF;
END $mj$;

-- ---------------------------------------------------------------------------------------------
-- 2. Merge duplicates into the oldest row of each group
-- ---------------------------------------------------------------------------------------------
DO $mj$
DECLARE
    v_group_count    integer;
    v_rows_to_remove integer;
BEGIN
    -- The OR-merged shape of every duplicated group.
    CREATE TEMP TABLE "EPMerged" AS
    SELECT "EntityID",
           "RoleID",
           "Type",
           bool_or("CanCreate") AS "CanCreate",
           bool_or("CanRead")   AS "CanRead",
           bool_or("CanUpdate") AS "CanUpdate",
           bool_or("CanDelete") AS "CanDelete",
           (array_agg("ReadRLSFilterID")   FILTER (WHERE "ReadRLSFilterID"   IS NOT NULL))[1] AS "ReadRLSFilterID",
           (array_agg("CreateRLSFilterID") FILTER (WHERE "CreateRLSFilterID" IS NOT NULL))[1] AS "CreateRLSFilterID",
           (array_agg("UpdateRLSFilterID") FILTER (WHERE "UpdateRLSFilterID" IS NOT NULL))[1] AS "UpdateRLSFilterID",
           (array_agg("DeleteRLSFilterID") FILTER (WHERE "DeleteRLSFilterID" IS NOT NULL))[1] AS "DeleteRLSFilterID",
           COUNT(*) AS "RowCount"
      FROM __mj."EntityPermission"
     GROUP BY "EntityID", "RoleID", "Type"
    HAVING COUNT(*) > 1;

    -- The row that survives each group: oldest first, ties broken deterministically by ID.
    CREATE TEMP TABLE "EPSurvivor" AS
    SELECT ranked."ID", ranked."EntityID", ranked."RoleID", ranked."Type"
      FROM (
        SELECT p."ID", p."EntityID", p."RoleID", p."Type",
               ROW_NUMBER() OVER (
                   PARTITION BY p."EntityID", p."RoleID", p."Type"
                   ORDER BY p."__mj_CreatedAt" ASC, p."ID" ASC
               ) AS "RowRank"
          FROM __mj."EntityPermission" p
         WHERE EXISTS (
               SELECT 1 FROM "EPMerged" m
                WHERE m."EntityID" = p."EntityID"
                  AND m."RoleID"   = p."RoleID"
                  AND m."Type"     = p."Type")
      ) AS ranked
     WHERE ranked."RowRank" = 1;

    SELECT COUNT(*)                                  INTO v_group_count    FROM "EPMerged";
    SELECT COALESCE(SUM("RowCount"), 0) - COUNT(*)   INTO v_rows_to_remove FROM "EPMerged";

    IF v_group_count > 0 THEN
        RAISE NOTICE 'EntityPermission: merging % duplicated (EntityID, RoleID, Type) group(s); removing % redundant row(s).',
              v_group_count, v_rows_to_remove;

        -- Fold the group's flags onto the survivor. __mj_UpdatedAt is left to its trigger.
        UPDATE __mj."EntityPermission" p
           SET "CanCreate"         = m."CanCreate",
               "CanRead"           = m."CanRead",
               "CanUpdate"         = m."CanUpdate",
               "CanDelete"         = m."CanDelete",
               "ReadRLSFilterID"   = m."ReadRLSFilterID",
               "CreateRLSFilterID" = m."CreateRLSFilterID",
               "UpdateRLSFilterID" = m."UpdateRLSFilterID",
               "DeleteRLSFilterID" = m."DeleteRLSFilterID"
          FROM "EPSurvivor" s
          JOIN "EPMerged"   m
            ON m."EntityID" = s."EntityID" AND m."RoleID" = s."RoleID" AND m."Type" = s."Type"
         WHERE s."ID" = p."ID";

        DELETE FROM __mj."EntityPermission" p
         USING "EPMerged" m
         WHERE m."EntityID" = p."EntityID"
           AND m."RoleID"   = p."RoleID"
           AND m."Type"     = p."Type"
           AND NOT EXISTS (SELECT 1 FROM "EPSurvivor" s WHERE s."ID" = p."ID");
    ELSE
        RAISE NOTICE 'EntityPermission: no duplicate (EntityID, RoleID, Type) groups found.';
    END IF;

    DROP TABLE "EPMerged";
    DROP TABLE "EPSurvivor";
END $mj$;

-- ---------------------------------------------------------------------------------------------
-- 3. Enforce it from here on
-- ---------------------------------------------------------------------------------------------
DO $mj$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class      t ON t.oid = c.conrelid
          JOIN pg_namespace  n ON n.oid = t.relnamespace
         WHERE c.conname = 'UQ_EntityPermission_EntityID_RoleID_Type'
           AND n.nspname = '__mj'
           AND t.relname = 'EntityPermission'
    ) THEN
        ALTER TABLE __mj."EntityPermission"
            ADD CONSTRAINT "UQ_EntityPermission_EntityID_RoleID_Type"
            UNIQUE ("EntityID", "RoleID", "Type");
    END IF;
END $mj$;
