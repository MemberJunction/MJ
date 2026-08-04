-- =============================================================================
-- Backfill UserView.ViewTypeID from the legacy DisplayState.defaultMode
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

UPDATE uv
   SET uv.ViewTypeID = vt.ID
  FROM ${flyway:defaultSchema}.UserView AS uv
  INNER JOIN ${flyway:defaultSchema}.ViewType AS vt
          ON vt.Name = CASE LOWER(JSON_VALUE(uv.DisplayState, '$.defaultMode'))
                            WHEN 'grid'     THEN 'Grid'
                            WHEN 'cards'    THEN 'Cards'
                            WHEN 'timeline' THEN 'Timeline'
                            WHEN 'map'      THEN 'Map'
                            ELSE NULL
                       END
 WHERE uv.ViewTypeID IS NULL
   AND uv.DisplayState IS NOT NULL
   AND ISJSON(uv.DisplayState) = 1
   AND JSON_VALUE(uv.DisplayState, '$.defaultMode') IS NOT NULL;
GO
