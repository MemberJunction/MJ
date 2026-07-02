-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- =============================================================================
-- Backfill UserView."ViewTypeID" from the legacy DisplayState.defaultMode
-- -----------------------------------------------------------------------------
-- ViewTypeID (added in v5.40) is the new source of truth for which view type a
-- saved view opens in, superseding DisplayState.defaultMode. Existing rows have a
-- NULL ViewTypeID, so this one-time backfill maps the legacy defaultMode string
-- ('grid' | 'cards' | 'timeline' | 'map') to the matching ViewType row by Name.
--
-- Resilient by design:
--   * ISJSON guard — rows with NULL / non-JSON DisplayState are skipped (no error).
--   * JSON_VALUE returns NULL for a missing path — those rows are skipped.
--   * The JOIN only matches the four legacy modes; anything else (e.g. 'cluster',
--     a typo, or a future mode) simply doesn't join and is left NULL.
--   * Only rows where ViewTypeID IS NULL are touched — never overwrites an explicit
--     selection or re-runs destructively.
--   * ViewType rows are matched by the stable Name (not a hardcoded ID), so this
--     works across environments regardless of the seeded ViewType UUIDs.
-- NULL ViewTypeID continues to mean "system default (Grid)" at runtime, so rows we
-- can't map remain perfectly functional.
-- =============================================================================

UPDATE __mj."UserView" AS uv
   SET "ViewTypeID" = vt."ID"
  FROM
	__mj."ViewType" AS vt
WHERE
	vt."Name" = CASE LOWER((uv."DisplayState")::jsonb ->> 'defaultMode')
                            WHEN 'grid'     THEN 'Grid'
                            WHEN 'cards'    THEN 'Cards'
                            WHEN 'timeline' THEN 'Timeline'
                            WHEN 'map'      THEN 'Map'
                            ELSE NULL
                       END
	AND uv."ViewTypeID" IS NULL
   AND uv."DisplayState" IS NOT NULL
   AND (uv."DisplayState") IS JSON
   AND (uv."DisplayState")::jsonb ->> 'defaultMode' IS NOT NULL;
