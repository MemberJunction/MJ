-- =============================================================================
-- V202605031200__v5.31.x__Add_vwFlywayVersionHistoryParsed_For_PG_Parity.pg-only.sql
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS:
--   The SS baseline (B202602151200__v5.0__Baseline.sql) creates a view named
--   vwFlywayVersionHistoryParsed that joins flyway_schema_history with
--   ExtractVersionComponents(description) to expose parsed version components
--   (Version / VersionDescription / Major / Minor / Patch) alongside raw
--   flyway columns. The same baseline ALSO inserts a Query metadata row called
--   "Server Installed Version History" whose SQL is literally:
--       SELECT * FROM __mj."vwFlywayVersionHistoryParsed" ORDER BY installed_on DESC
--
--   When the SS baseline was converted to PG, the view was intentionally
--   skipped (the SS version uses CROSS APPLY against a SS-style table-valued
--   function with a 5-column shape — the PG converter wrote a comment saying
--   "PostgreSQL Flyway uses its own migration tracking mechanism. This view is
--   not needed for PG.") However, the Query metadata row was NOT updated, so
--   the row points at a view that never existed on PG. Anyone executing that
--   Query from MJ Explorer on a PG-backed install gets:
--       relation "__mj.vwFlywayVersionHistoryParsed" does not exist.
--
--   This migration restores PG↔SS behavioral parity by:
--     1. Replacing __mj.ExtractVersionComponents with a PL/pgSQL implementation
--        that exactly mirrors the SS algorithm (char-by-char scan, 'v' prefix
--        strip, dot-then-x handling, trailing-dot trim, dot-count splitting)
--        and returns the same 5-column shape (Version, Major, Minor, Patch,
--        VersionDescription) — matching SS NVARCHAR semantics with TEXT.
--     2. Creating __mj."vwFlywayVersionHistoryParsed" using CROSS JOIN LATERAL
--        (PG equivalent of SS CROSS APPLY for set-returning functions) so the
--        view returns the same 10 columns in the same order with the same
--        WHERE filter (version IS NOT NULL AND success = TRUE — PG boolean
--        equivalent of SS's `success = 1`).
--
--   After this migration, the "Server Installed Version History" Query row
--   that ships in the baseline works on PG identically to SS.
--
-- WHY .pg-only.sql:
--   This is a PG-side correction; SS already has the view + function from
--   the baseline. No SS counterpart needed.
--
-- DATA SAFETY:
--   The previous PG ExtractVersionComponents function (3-column INTEGER shape)
--   was only referenced by the baseline's own commented-out CREATE VIEW
--   attempt; no production view, sproc, or application code calls it. Verified
--   via grep across migrations-pg/, packages/, and the baseline file. CASCADE
--   on the DROP is therefore safe — there are no dependents to lose.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Replace ExtractVersionComponents with the SS-shape signature
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."ExtractVersionComponents"(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."ExtractVersionComponents"(
    "p_Description" TEXT
)
RETURNS TABLE (
    "Version"            TEXT,
    "Major"              TEXT,
    "Minor"              TEXT,
    "Patch"              TEXT,
    "VersionDescription" TEXT
) AS $$
DECLARE
    v_cleaned             TEXT;
    v_i                   INTEGER := 1;
    v_len                 INTEGER;
    v_extracted           TEXT := '';
    v_char                CHAR(1);
    v_versionDescription  TEXT := '';
    v_dotCount            INTEGER;
    v_parts               TEXT[];
    v_major               TEXT := '';
    v_minor               TEXT := '';
    v_patch               TEXT := '';
BEGIN
    -- Mirror SS: trim spaces, then strip a single leading 'v' if present.
    v_cleaned := TRIM(COALESCE("p_Description", ''));
    IF v_cleaned LIKE 'v%' THEN
        v_cleaned := SUBSTRING(v_cleaned FROM 2);
    END IF;

    v_len := LENGTH(v_cleaned);

    -- Mirror SS: walk char-by-char accumulating digits and dots; allow 'x'
    -- only when the previous char was a dot (so "5.30.x" extracts as version
    -- but "vNext" stops immediately). Stop on first non-version char.
    WHILE v_i <= v_len LOOP
        v_char := SUBSTRING(v_cleaned FROM v_i FOR 1);

        IF (v_char BETWEEN '0' AND '9') OR (v_char = '.') THEN
            v_extracted := v_extracted || v_char;
            v_i := v_i + 1;
        ELSIF v_char = 'x' THEN
            IF LENGTH(v_extracted) > 0 AND RIGHT(v_extracted, 1) = '.' THEN
                v_extracted := v_extracted || v_char;
                v_i := v_i + 1;
            ELSE
                EXIT;
            END IF;
        ELSE
            -- If we ended on a trailing dot (e.g. "5.30." followed by space)
            -- mirror SS and trim the trailing dot off the version.
            IF LENGTH(v_extracted) > 0 AND RIGHT(v_extracted, 1) = '.' THEN
                v_extracted := LEFT(v_extracted, LENGTH(v_extracted) - 1);
            END IF;
            EXIT;
        END IF;
    END LOOP;

    -- Mirror SS: remainder of the string (trimmed) becomes the description.
    IF v_i <= v_len THEN
        v_versionDescription := TRIM(SUBSTRING(v_cleaned FROM v_i));
    ELSE
        v_versionDescription := '';
    END IF;

    -- Mirror SS: count dots, split, assign Major/Minor/Patch by dot count.
    v_dotCount := LENGTH(v_extracted) - LENGTH(REPLACE(v_extracted, '.', ''));
    v_parts := STRING_TO_ARRAY(v_extracted, '.');

    IF v_dotCount = 0 THEN
        v_major := v_extracted;
    ELSIF v_dotCount = 1 THEN
        v_major := COALESCE(v_parts[1], '');
        v_minor := COALESCE(v_parts[2], '');
    ELSIF v_dotCount = 2 THEN
        v_major := COALESCE(v_parts[1], '');
        v_minor := COALESCE(v_parts[2], '');
        v_patch := COALESCE(v_parts[3], '');
    END IF;

    RETURN QUERY SELECT v_extracted, v_major, v_minor, v_patch, v_versionDescription;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION ${flyway:defaultSchema}."ExtractVersionComponents"(TEXT) IS
    'Parses a Flyway/Skyway migration description like "v5.31.x Some Description" '
    'into (Version, Major, Minor, Patch, VersionDescription). Mirrors the SS '
    'baseline implementation char-for-char so vwFlywayVersionHistoryParsed yields '
    'identical results across SS and PG.';

-- ---------------------------------------------------------------------------
-- 2. Create vwFlywayVersionHistoryParsed (matches SS view column-for-column)
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwFlywayVersionHistoryParsed";

CREATE VIEW ${flyway:defaultSchema}."vwFlywayVersionHistoryParsed" AS
SELECT
    f.installed_rank,
    f.installed_by,
    f.installed_on,
    f.execution_time,
    f.description           AS "RawDescription",
    v."Version",
    v."VersionDescription",
    v."Major",
    v."Minor",
    v."Patch"
FROM ${flyway:defaultSchema}.flyway_schema_history f
CROSS JOIN LATERAL ${flyway:defaultSchema}."ExtractVersionComponents"(f.description) v
WHERE f.version IS NOT NULL
  AND f.success = TRUE;

COMMENT ON VIEW ${flyway:defaultSchema}."vwFlywayVersionHistoryParsed" IS
    'Server installed version history with parsed version components. Mirrors '
    'the SS baseline view by joining flyway_schema_history with '
    'ExtractVersionComponents(description) via CROSS JOIN LATERAL (PG '
    'equivalent of SS CROSS APPLY). Backs the "Server Installed Version '
    'History" Query metadata row.';
