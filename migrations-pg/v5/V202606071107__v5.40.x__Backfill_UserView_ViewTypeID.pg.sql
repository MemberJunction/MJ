-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606071107__v5.40.x__Backfill_UserView_ViewTypeID.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================= */ /* Backfill UserView.ViewTypeID from the legacy DisplayState.defaultMode */ /* ----------------------------------------------------------------------------- */ /* ViewTypeID (added in v5.40) is the new source of truth for which view type a */ /* saved view opens in, superseding DisplayState.defaultMode. Existing rows have a */ /* NULL ViewTypeID, so this one-time backfill maps the legacy defaultMode string */ /* ('grid' | 'cards' | 'timeline' | 'map') to the matching ViewType row by Name. */ /* Resilient by design: */ /*   * ISJSON guard — rows with NULL / non-JSON DisplayState are skipped (no error). */ /*   * JSON_VALUE returns NULL for a missing path — those rows are skipped. */ /*   * The JOIN only matches the four legacy modes; anything else (e.g. 'cluster', */ /*     a typo, or a future mode) simply doesn't join and is left NULL. */ /*   * Only rows where ViewTypeID IS NULL are touched — never overwrites an explicit */ /*     selection or re-runs destructively. */ /*   * ViewType rows are matched by the stable Name (not a hardcoded ID), so this */ /*     works across environments regardless of the seeded ViewType UUIDs. */ /* NULL ViewTypeID continues to mean "system default (Grid)" at runtime, so rows we */ /* can't map remain perfectly functional. */ /* ============================================================================= */
UPDATE __mj."UserView" AS "uv" SET "ViewTypeID" = "vt"."ID"
FROM __mj."ViewType" AS "vt"
WHERE
  "vt"."Name" = CASE LOWER((("uv"."DisplayState")::jsonb ->> 'defaultMode'))
    WHEN 'grid'
    THEN 'Grid'
    WHEN 'cards'
    THEN 'Cards'
    WHEN 'timeline'
    THEN 'Timeline'
    WHEN 'map'
    THEN 'Map'
    ELSE NULL
  END
  AND "uv"."ViewTypeID" IS NULL
  AND NOT "uv"."DisplayState" IS NULL
  AND "uv"."DisplayState" IS JSON
  AND NOT (("uv"."DisplayState")::jsonb ->> 'defaultMode') IS NULL;
