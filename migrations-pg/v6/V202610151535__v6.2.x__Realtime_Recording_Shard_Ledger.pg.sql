-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610151535__v6.2.x__Realtime_Recording_Shard_Ledger.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The AST transpiler reported the 6 guarded-write CREATE PROCEDUREs as unhandled. Each is
-- hand-authored below. See the T-SQL original's header for WHY they exist (least-privilege cdp_*
-- roles; conditional writes whose outcome is the arbitration signal).
-- ╚════════════════════════════════════════╝
--
-- TRANSLATION DECISIONS (same idiom as V202610061701__v6.2.x__Work_Queue_Guarded_Write_Sprocs.pg.sql):
--
--  * CALL SHAPE. RealtimeRecordingLedger (packages/AI/Agents/src/realtime/realtime-recording-ledger.ts)
--    calls each routine through Dialect.ProcedureCallSyntax, which on PostgreSQL emits
--    `SELECT * FROM __mj."spX"($1, $2, …)`. Each T-SQL procedure is a plpgsql FUNCTION … RETURNS TABLE
--    with the T-SQL result-set column names, and parameters in the T-SQL declaration order.
--
--  * INSERT-IF-ABSENT. MERGE … WITH (HOLDLOCK) WHEN NOT MATCHED THEN INSERT becomes
--    INSERT … ON CONFLICT ON CONSTRAINT "UQ_AIAgentSessionRecordingShard_Session_Index" DO NOTHING,
--    which waits for a concurrent inserter of the same (session, index) and then inserts nothing, as
--    the key-range lock did. A plpgsql function runs inside the caller's statement, so the shard
--    insert and the session update are atomic without the explicit BEGIN/COMMIT.
--
--  * ARBITRATION. OUTPUT … INTO a table variable becomes UPDATE … RETURNING (a data-modifying CTE
--    where rows are returned); `@@ROWCOUNT` becomes GET DIAGNOSTICS … = ROW_COUNT, returned as
--    "AffectedRows" INTEGER.
--
--  * READPAST on the purge DELETE becomes a candidate SELECT … LIMIT p_MaxRows FOR UPDATE OF … SKIP
--    LOCKED; DELETE TOP (n) has no PostgreSQL form.
--
--  * ERRORS. THROW 51100 / 51101 become RAISE EXCEPTION with the same message text.
--
--  * CLOCK AND TYPES. SYSDATETIMEOFFSET() becomes NOW(); DATEADD(HOUR, -24, …) becomes
--    NOW() - INTERVAL '24 hours'; ISNULL becomes COALESCE; UNIQUEIDENTIFIER → UUID,
--    NVARCHAR → VARCHAR / TEXT, VARBINARY(MAX) → BYTEA, DATETIMEOFFSET → TIMESTAMPTZ.
--
--  * QUALIFIED COLUMNS. RETURNS TABLE introduces OUT parameters that share names with table columns,
--    so every function sets `#variable_conflict use_column` and table-qualifies its column references.
--
--  * GRANTS. cdp_Developer and cdp_Integration only, mirroring the T-SQL file. Each grant tolerates
--    only a missing role (undefined_object), with a NOTICE naming it.


ALTER TABLE __mj."AIAgentSession"
  ADD COLUMN "RecordingStatus" VARCHAR(20) NULL CONSTRAINT "CK_AIAgentSession_RecordingStatus" CHECK ("RecordingStatus" IN ('Pending', 'Assembling', 'Complete', 'Partial', 'Failed')),
  ADD COLUMN "RecordingExpectedShards" INT NULL,
  ADD COLUMN "RecordingCapturedSamples" BIGINT NULL,
  ADD COLUMN "RecordingGaps" TEXT NULL,
  ADD COLUMN "RecordingAssemblyVersion" INT NOT NULL DEFAULT 0;

CREATE TABLE __mj."AIAgentSessionRecordingShard" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "AgentSessionID" UUID NOT NULL,
  "Index" INT NOT NULL,
  "StartSample" BIGINT NOT NULL,
  "SampleCount" INT NOT NULL,
  "Bytes" INT NOT NULL,
  "Sha256" VARCHAR(64) NOT NULL,
  "Data" BYTEA NOT NULL,
  "ReceivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PK_AIAgentSessionRecordingShard" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIAgentSessionRecordingShard_AgentSession" FOREIGN KEY ("AgentSessionID") REFERENCES __mj."AIAgentSession" (
    "ID"
  ),
  CONSTRAINT "UQ_AIAgentSessionRecordingShard_Session_Index" UNIQUE (
    "AgentSessionID",
    "Index"
  ),
  CONSTRAINT "CK_AIAgentSessionRecordingShard_Index" CHECK ("Index" >= 0),
  CONSTRAINT "CK_AIAgentSessionRecordingShard_Counts" CHECK ("StartSample" >= 0 AND "SampleCount" >= 0 AND "Bytes" >= 0)
);

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Guarded-write procedures (hand-authored PostgreSQL; see TRANSLATION DECISIONS above) */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
             FROM pg_proc p
            WHERE p.pronamespace = '__mj'::regnamespace
              AND p.proname = ANY (ARRAY[
                  'spRecordAIAgentSessionRecordingShard', 'spStampAIAgentSessionRecordingTerminal',
                  'spClaimAIAgentSessionRecordingAssembly', 'spFinishAIAgentSessionRecordingAssembly',
                  'spDeleteAIAgentSessionRecordingShards', 'spPurgeAIAgentSessionRecordingShards'])
  LOOP
    EXECUTE 'DROP ROUTINE IF EXISTS ' || r.sig;
  END LOOP;
END $$;

/* Records one shard. Insert-if-absent: */
/*   * absent            → inserted; a NULL status becomes Pending, and a Complete/Partial session given a */
/*                         shard at or past its expected count becomes Pending again — but only within 24 h of */
/*                         close. An insert while Assembling also re-opens it AND bumps the version. */
/*   * same index + hash → Duplicate (a retry; acknowledged as success). */
/*   * same index, other hash → Conflict; the session is marked Failed for a human to look at. */
/* Returns one row: Outcome plus the session's status, expected shard count and ClosedAt after the write. */
CREATE OR REPLACE FUNCTION __mj."spRecordAIAgentSessionRecordingShard"(
    IN p_AgentSessionID UUID,
    IN p_Index          INTEGER,
    IN p_StartSample    BIGINT,
    IN p_SampleCount    INTEGER,
    IN p_Bytes          INTEGER,
    IN p_Sha256         VARCHAR(64),
    IN p_Data           BYTEA
)
RETURNS TABLE("Outcome" VARCHAR, "RecordingStatus" VARCHAR, "RecordingExpectedShards" INTEGER, "ClosedAt" TIMESTAMPTZ) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_inserted INTEGER;
    _v_outcome  VARCHAR(20);
BEGIN
    INSERT INTO __mj."AIAgentSessionRecordingShard" AS "t"
           ("AgentSessionID", "Index", "StartSample", "SampleCount", "Bytes", "Sha256", "Data")
    VALUES (p_AgentSessionID, p_Index, p_StartSample, p_SampleCount, p_Bytes, p_Sha256, p_Data)
    ON CONFLICT ON CONSTRAINT "UQ_AIAgentSessionRecordingShard_Session_Index" DO NOTHING;
    GET DIAGNOSTICS _v_inserted = ROW_COUNT;

    IF _v_inserted > 0 THEN
        _v_outcome := 'Inserted';
        UPDATE __mj."AIAgentSession" AS "s"
           SET "RecordingStatus" = 'Pending',
               "RecordingAssemblyVersion" = CASE WHEN "s"."RecordingStatus" = 'Assembling'
                                                 THEN "s"."RecordingAssemblyVersion" + 1
                                                 ELSE "s"."RecordingAssemblyVersion" END
         WHERE "s"."ID" = p_AgentSessionID
           AND ("s"."RecordingStatus" IS NULL
                OR "s"."RecordingStatus" = 'Assembling'
                OR ("s"."RecordingStatus" IN ('Complete', 'Partial')
                    AND p_Index >= COALESCE("s"."RecordingExpectedShards", 0)
                    AND ("s"."ClosedAt" IS NULL OR "s"."ClosedAt" > NOW() - INTERVAL '24 hours')));
    ELSIF EXISTS (SELECT 1 FROM __mj."AIAgentSessionRecordingShard" AS "x"
                   WHERE "x"."AgentSessionID" = p_AgentSessionID AND "x"."Index" = p_Index AND "x"."Sha256" = p_Sha256) THEN
        _v_outcome := 'Duplicate';
    ELSE
        _v_outcome := 'Conflict';
        UPDATE __mj."AIAgentSession" AS "s"
           SET "RecordingStatus" = 'Failed'
         WHERE "s"."ID" = p_AgentSessionID;
    END IF;

    RETURN QUERY
    SELECT _v_outcome::VARCHAR, "s"."RecordingStatus"::VARCHAR, "s"."RecordingExpectedShards", "s"."ClosedAt"
      FROM __mj."AIAgentSession" AS "s"
     WHERE "s"."ID" = p_AgentSessionID;
END;
$mjfn$ LANGUAGE plpgsql;

/* Stamps the terminal signal. Idempotent: accepted when both counts are at or above what is stored (or */
/* nothing is stored yet); a lower terminal is Ignored. A strictly higher terminal on a Complete/Partial/ */
/* Assembling session re-opens it (Pending); on Assembling the version is bumped too. A NULL status becomes */
/* Pending; Failed stays Failed. NULL or negative counts are refused. */
CREATE OR REPLACE FUNCTION __mj."spStampAIAgentSessionRecordingTerminal"(
    IN p_AgentSessionID  UUID,
    IN p_ExpectedShards  INTEGER,
    IN p_CapturedSamples BIGINT
)
RETURNS TABLE("Outcome" VARCHAR, "RecordingStatus" VARCHAR) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_status VARCHAR(20);
    _v_found  BOOLEAN;
BEGIN
    IF p_ExpectedShards IS NULL OR p_ExpectedShards < 0 OR p_CapturedSamples IS NULL OR p_CapturedSamples < 0 THEN
        RAISE EXCEPTION 'spStampAIAgentSessionRecordingTerminal: expected shards and captured samples must be non-negative';
    END IF;

    UPDATE __mj."AIAgentSession" AS "s"
       SET "RecordingStatus" = CASE
               WHEN "s"."RecordingStatus" IS NULL THEN 'Pending'
               WHEN "s"."RecordingStatus" IN ('Complete', 'Partial', 'Assembling')
                    AND (p_ExpectedShards > COALESCE("s"."RecordingExpectedShards", -1)
                         OR p_CapturedSamples > COALESCE("s"."RecordingCapturedSamples", -1))
                    THEN 'Pending'
               ELSE "s"."RecordingStatus" END,
           "RecordingAssemblyVersion" = CASE
               WHEN "s"."RecordingStatus" = 'Assembling'
                    AND (p_ExpectedShards > COALESCE("s"."RecordingExpectedShards", -1)
                         OR p_CapturedSamples > COALESCE("s"."RecordingCapturedSamples", -1))
                    THEN "s"."RecordingAssemblyVersion" + 1
               ELSE "s"."RecordingAssemblyVersion" END,
           "RecordingExpectedShards" = p_ExpectedShards,
           "RecordingCapturedSamples" = p_CapturedSamples
     WHERE "s"."ID" = p_AgentSessionID
       AND ("s"."RecordingExpectedShards" IS NULL OR p_ExpectedShards >= "s"."RecordingExpectedShards")
       AND ("s"."RecordingCapturedSamples" IS NULL OR p_CapturedSamples >= "s"."RecordingCapturedSamples")
    RETURNING "s"."RecordingStatus" INTO _v_status;
    _v_found := FOUND;

    IF _v_found THEN
        RETURN QUERY SELECT 'Stamped'::VARCHAR, _v_status::VARCHAR;
    ELSE
        RETURN QUERY
        SELECT 'Ignored'::VARCHAR, "s"."RecordingStatus"::VARCHAR
          FROM __mj."AIAgentSession" AS "s"
         WHERE "s"."ID" = p_AgentSessionID;
    END IF;
END;
$mjfn$ LANGUAGE plpgsql;

/* Claims assembly: one conditional UPDATE, so of two concurrent callers exactly one gets a row back. */
/* Claimable from Pending or Partial; also from Assembling when the previous claim is older than */
/* p_StaleBefore (the janitor passes its attempt timeout; request paths pass NULL). Staleness reads */
/* __mj_UpdatedAt, which the update trigger stamps on any update. Returns the new version, or no row. */
CREATE OR REPLACE FUNCTION __mj."spClaimAIAgentSessionRecordingAssembly"(
    IN p_AgentSessionID UUID,
    IN p_StaleBefore    TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE("RecordingAssemblyVersion" INTEGER) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH "claimed" AS (
        UPDATE __mj."AIAgentSession" AS "s"
           SET "RecordingStatus" = 'Assembling',
               "RecordingAssemblyVersion" = "s"."RecordingAssemblyVersion" + 1
         WHERE "s"."ID" = p_AgentSessionID
           AND ("s"."RecordingStatus" IN ('Pending', 'Partial')
                OR (p_StaleBefore IS NOT NULL AND "s"."RecordingStatus" = 'Assembling' AND "s"."__mj_UpdatedAt" < p_StaleBefore))
        RETURNING "s"."RecordingAssemblyVersion"
    )
    SELECT "claimed"."RecordingAssemblyVersion" FROM "claimed";
END;
$mjfn$ LANGUAGE plpgsql;

/* Finishes an assembly, fenced on the version the assembler claimed: a newer claim makes this a no-op */
/* (AffectedRows 0). p_FileID NULL leaves the recording file unchanged (a Failed assembly). */
CREATE OR REPLACE FUNCTION __mj."spFinishAIAgentSessionRecordingAssembly"(
    IN p_AgentSessionID UUID,
    IN p_Version        INTEGER,
    IN p_Status         VARCHAR(20),
    IN p_Gaps           TEXT,
    IN p_FileID         UUID DEFAULT NULL
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentSession" AS "s"
       SET "RecordingStatus" = p_Status,
           "RecordingGaps" = p_Gaps,
           "RecordingFileID" = COALESCE(p_FileID, "s"."RecordingFileID"),
           "RecordingMedia" = CASE WHEN p_FileID IS NULL THEN "s"."RecordingMedia" ELSE 'Audio' END
     WHERE "s"."ID" = p_AgentSessionID
       AND "s"."RecordingAssemblyVersion" = p_Version
       AND "s"."RecordingStatus" = 'Assembling';
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Deletes a session's assembled shards (indexes below the count that went into a Complete recording). */
/* A shard at or past that count arrived after the assembly read the ledger and is kept. */
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentSessionRecordingShards"(
    IN p_AgentSessionID UUID,
    IN p_IndexBelow     INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentSessionRecordingShard" AS "x"
     WHERE "x"."AgentSessionID" = p_AgentSessionID AND "x"."Index" < p_IndexBelow;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Janitor purge: shards of sessions closed before the cutoff, bounded per call. Rows another */
/* transaction holds are skipped (READPAST in T-SQL). */
CREATE OR REPLACE FUNCTION __mj."spPurgeAIAgentSessionRecordingShards"(
    IN p_ClosedBefore TIMESTAMPTZ,
    IN p_MaxRows      INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    IF p_ClosedBefore IS NULL OR p_MaxRows IS NULL OR p_MaxRows <= 0 THEN
        RAISE EXCEPTION 'spPurgeAIAgentSessionRecordingShards: a cutoff and a positive row limit are required';
    END IF;

    DELETE FROM __mj."AIAgentSessionRecordingShard" AS "x"
     WHERE "x"."ID" IN (
            SELECT "shard"."ID"
              FROM __mj."AIAgentSessionRecordingShard" AS "shard"
              JOIN __mj."AIAgentSession" AS "s" ON "s"."ID" = "shard"."AgentSessionID"
             WHERE "s"."ClosedAt" IS NOT NULL AND "s"."ClosedAt" < p_ClosedBefore
             LIMIT p_MaxRows
               FOR UPDATE OF "shard" SKIP LOCKED);
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

DO $$
DECLARE
    _fn   TEXT;
    _role TEXT;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
      'spRecordAIAgentSessionRecordingShard', 'spStampAIAgentSessionRecordingTerminal',
      'spClaimAIAgentSessionRecordingAssembly', 'spFinishAIAgentSessionRecordingAssembly',
      'spDeleteAIAgentSessionRecordingShards', 'spPurgeAIAgentSessionRecordingShards']
  LOOP
    FOREACH _role IN ARRAY ARRAY['cdp_Developer', 'cdp_Integration']
    LOOP
      BEGIN
        EXECUTE format('GRANT EXECUTE ON FUNCTION __mj.%I TO %I', _fn, _role);
      EXCEPTION WHEN undefined_object THEN
        RAISE NOTICE 'Skipping GRANT EXECUTE ON __mj.% TO %: role does not exist on this install', _fn, _role;
      END;
    END LOOP;
  END LOOP;
END $$;

COMMENT ON COLUMN __mj."AIAgentSession"."RecordingStatus" IS 'State of the server-side recording assembly for a client-direct session recorded as Opus shards: Pending (shards or a terminal signal are waiting to be assembled), Assembling (claimed by one server instance), Complete (recording.wav holds every captured sample), Partial (assembled with silent gaps, listed in RecordingGaps), Failed (a shard conflict or an assembly error needs a human). NULL when the session was not recorded this way.';

COMMENT ON COLUMN __mj."AIAgentSession"."RecordingExpectedShards" IS 'Number of recording shards the browser reported in its terminal signal (last shard index + 1). NULL until a terminal signal arrives.';

COMMENT ON COLUMN __mj."AIAgentSession"."RecordingCapturedSamples" IS 'Total audio samples (48 kHz mono) the browser captured, from its terminal signal. The assembled recording.wav is exactly this long. NULL until a terminal signal arrives.';

COMMENT ON COLUMN __mj."AIAgentSession"."RecordingGaps" IS 'JSON array of the silent gaps in a Partial recording: [{startSample, sampleCount, indexes}], sample positions at 48 kHz and the shard indexes that were missing. Empty or NULL when nothing is missing.';

COMMENT ON COLUMN __mj."AIAgentSession"."RecordingAssemblyVersion" IS 'Incremented by every assembly claim. The assembler finishes only if the version is still the one it claimed, so a newer assembly always wins over a slower older one.';

COMMENT ON TABLE __mj."AIAgentSessionRecordingShard" IS 'One 5-second Opus recording shard (MJOPUS1 format) uploaded by the browser during a client-direct realtime call, staged here until the server assembles the session recording. Deleted once the recording is Complete, or by the session janitor after its lookback window.';

COMMENT ON COLUMN __mj."AIAgentSessionRecordingShard"."Index" IS 'Zero-based position of the shard in the recording. Unique per session; a retry of the same index with the same bytes is acknowledged, with different bytes it is refused.';

COMMENT ON COLUMN __mj."AIAgentSessionRecordingShard"."StartSample" IS 'Sample position (48 kHz) where this shard''s audio starts in the recording.';

COMMENT ON COLUMN __mj."AIAgentSessionRecordingShard"."SampleCount" IS 'Number of audio samples (48 kHz) the shard covers.';

COMMENT ON COLUMN __mj."AIAgentSessionRecordingShard"."Bytes" IS 'Size of Data in bytes.';

COMMENT ON COLUMN __mj."AIAgentSessionRecordingShard"."Sha256" IS 'Lowercase hex SHA-256 of Data; decides whether a repeated upload of the same index is a retry or a conflict.';

COMMENT ON COLUMN __mj."AIAgentSessionRecordingShard"."Data" IS 'The shard bytes as uploaded (MJOPUS1 header followed by length-prefixed Opus packets).';

COMMENT ON COLUMN __mj."AIAgentSessionRecordingShard"."ReceivedAt" IS 'When the server first stored this shard.';

/* ============================================================================================
 * EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * It contains the metadata and database objects CodeGen derived from the hand-written DDL above:
 * the Entity / EntityField / EntityFieldValue / EntityRelationship / EntityPermission inserts for
 * MJ: AI Agent Session Recording Shards and the new MJ: AI Agent Sessions columns (EntityField
 * Sequence values are apply-time MAX(Sequence)+1 expressions), the foreign-key indexes, the
 * regenerated vwAIAgentSessionRecordingShards / vwAIAgentSessions views, the spCreate / spUpdate /
 * spDelete procedures (including the spDeleteConversation and spDeleteAIAgent cascades that now
 * reach the shard table), permission grants, extended properties and the generated validators of the
 * new table's CHECK constraints. Validator rows CodeGen emitted for unrelated entities (drift in the
 * generating database) were removed.
 *
 * Do NOT edit it by hand. If the hand-written DDL above changes, re-run CodeGen against a database
 * at the last released version and replace this entire generated section.
 * ============================================================================================ */
/* SQL generated to create new entity MJ: AI Agent Session Recording Shards */
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
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ebaed427-2514-46b1-a20c-777a2055c937',
    'MJ: AI Agent Session Recording Shards',
    'AI Agent Session Recording Shards',
    'One 5-second Opus recording shard (MJOPUS1 format) uploaded by the browser during a client-direct realtime call, staged here until the server assembles the session recording. Deleted once the recording is Complete, or by the session janitor after its lookback window.',
    NULL,
    'AIAgentSessionRecordingShard',
    'vwAIAgentSessionRecordingShards',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: AI Agent Session Recording Shards to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'ebaed427-2514-46b1-a20c-777a2055c937',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: AI Agent Session Recording Shards for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: AI Agent Session Recording Shards for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: AI Agent Session Recording Shards for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."AIAgentSessionRecordingShard"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSessionRecordingShard */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSessionRecordingShard */
UPDATE __mj."AIAgentSessionRecordingShard" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIAgentSessionRecordingShard' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSessionRecordingShard" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSessionRecordingShard" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentSessionRecordingShard"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSessionRecordingShard */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSessionRecordingShard */
UPDATE __mj."AIAgentSessionRecordingShard" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIAgentSessionRecordingShard' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSessionRecordingShard" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSessionRecordingShard" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c74a743f-f9c8-432a-928e-23cd6af909ff' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c74a743f-f9c8-432a-928e-23cd6af909ff', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ee88087e-de03-4409-9eec-b00007d32dc2' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'AgentSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ee88087e-de03-4409-9eec-b00007d32dc2', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), 'AgentSessionID', 'Agent Session ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '17198778-E25A-4457-80AF-9E8C4961DC29', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ae248773-4fcc-4d86-8b40-9bdc469b4eff' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'Index')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ae248773-4fcc-4d86-8b40-9bdc469b4eff', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), 'Index', 'Index', 'Zero-based position of the shard in the recording. Unique per session; a retry of the same index with the same bytes is acknowledged, with different bytes it is refused.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '85d6c6b3-d9e3-4819-bf87-306bda555116' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'StartSample')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('85d6c6b3-d9e3-4819-bf87-306bda555116', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), 'StartSample', 'Start Sample', 'Sample position (48 kHz) where this shard''s audio starts in the recording.', 'bigint', 8, 19, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c660de10-8126-4d24-9360-5dc26126613c' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'SampleCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c660de10-8126-4d24-9360-5dc26126613c', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), 'SampleCount', 'Sample Count', 'Number of audio samples (48 kHz) the shard covers.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2a7f15fb-580a-439b-9de4-4fccf8907ddb' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'Bytes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2a7f15fb-580a-439b-9de4-4fccf8907ddb', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), 'Bytes', 'Bytes', 'Size of Data in bytes.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ee2b8659-543c-4b72-bb5b-7cc1df073f3c' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'Sha256')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ee2b8659-543c-4b72-bb5b-7cc1df073f3c', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), 'Sha256', 'Sha 256', 'Lowercase hex SHA-256 of Data; decides whether a repeated upload of the same index is a retry or a conflict.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6866304a-1522-4fb6-bd42-1570dcc808ac' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'Data')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6866304a-1522-4fb6-bd42-1570dcc808ac', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), 'Data', 'Data', 'The shard bytes as uploaded (MJOPUS1 header followed by length-prefixed Opus packets).', 'varbinary', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0202b8c4-a0cf-41e6-b68b-769e25a5b4ea' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'ReceivedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0202b8c4-a0cf-41e6-b68b-769e25a5b4ea', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), 'ReceivedAt', 'Received At', 'When the server first stored this shard.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e7fc05d6-d76c-45e3-8d56-f659a98c529a' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e7fc05d6-d76c-45e3-8d56-f659a98c529a', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6ced36c5-6456-4f71-8a9a-6ec1c7951e95' OR ("EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6ced36c5-6456-4f71-8a9a-6ec1c7951e95', 'EBAED427-2514-46B1-A20C-777A2055C937' /* Entity: MJ: AI Agent Session Recording Shards */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5c1a2e3d-fbe8-45dc-8a85-9ee2164a1356' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'RecordingStatus')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5c1a2e3d-fbe8-45dc-8a85-9ee2164a1356', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29'), 'RecordingStatus', 'Recording Status', 'State of the server-side recording assembly for a client-direct session recorded as Opus shards: Pending (shards or a terminal signal are waiting to be assembled), Assembling (claimed by one server instance), Complete (recording.wav holds every captured sample), Partial (assembled with silent gaps, listed in RecordingGaps), Failed (a shard conflict or an assembly error needs a human). NULL when the session was not recorded this way.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '68b99430-0bd8-4496-8b90-08d2cf58ea5b' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'RecordingExpectedShards')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('68b99430-0bd8-4496-8b90-08d2cf58ea5b', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29'), 'RecordingExpectedShards', 'Recording Expected Shards', 'Number of recording shards the browser reported in its terminal signal (last shard index + 1). NULL until a terminal signal arrives.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ce50980-e993-49d8-a45c-76dced905a2f' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'RecordingCapturedSamples')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1ce50980-e993-49d8-a45c-76dced905a2f', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29'), 'RecordingCapturedSamples', 'Recording Captured Samples', 'Total audio samples (48 kHz mono) the browser captured, from its terminal signal. The assembled recording.wav is exactly this long. NULL until a terminal signal arrives.', 'bigint', 8, 19, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70a98238-7aee-40b1-a1d4-0f2c03393316' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'RecordingGaps')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('70a98238-7aee-40b1-a1d4-0f2c03393316', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29'), 'RecordingGaps', 'Recording Gaps', 'JSON array of the silent gaps in a Partial recording: [{startSample, sampleCount, indexes}], sample positions at 48 kHz and the shard indexes that were missing. Empty or NULL when nothing is missing.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5506b605-5358-471c-b1d3-0677dbc00780' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'RecordingAssemblyVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5506b605-5358-471c-b1d3-0677dbc00780', '17198778-E25A-4457-80AF-9E8C4961DC29' /* Entity: MJ: AI Agent Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29'), 'RecordingAssemblyVersion', 'Recording Assembly Version', 'Incremented by every assembly claim. The assembler finishes only if the version is still the one it claimed, so a newer assembly always wins over a slower older one.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 22fb7cff-5259-4cd6-96c1-7abe8ad38454 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '22fb7cff-5259-4cd6-96c1-7abe8ad38454',
    '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356',
    1,
    'Assembling',
    'Assembling',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d4f2e074-ad0b-4485-8802-5619169fd0f2 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd4f2e074-ad0b-4485-8802-5619169fd0f2',
    '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356',
    2,
    'Complete',
    'Complete',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 510b210f-a167-490e-8372-6e8ce6959239 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '510b210f-a167-490e-8372-6e8ce6959239',
    '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356',
    3,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 15a740e1-98ed-4206-a9fd-fd0429fab9ff */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '15a740e1-98ed-4206-a9fd-fd0429fab9ff',
    '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356',
    4,
    'Partial',
    'Partial',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID dfefc0ce-e837-4bc4-b45b-c836674672e0 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'dfefc0ce-e837-4bc4-b45b-c836674672e0',
    '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356',
    5,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356';
/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" IN (
    SELECT
      "e"."ID"
    FROM __mj."Entity" AS "e"
    WHERE
      "e"."AllowUserSearchAPI" = TRUE
      AND "e"."AutoUpdateAllowUserSearchAPI" = TRUE
      AND "e"."VirtualEntity" = FALSE
      AND COALESCE("e"."FullTextSearchEnabled", FALSE) = FALSE
      AND NOT "e"."SchemaName" IN ('sys', 'staging')
      AND NOT EXISTS(
        SELECT
          1
        FROM __mj."EntityField" AS "f2"
        WHERE
          "f2"."EntityID" = "e"."ID" AND "f2"."IncludeInUserSearchAPI" = TRUE
      )
  );
/* Create Entity Relationship: MJ: AI Agent Sessions -> MJ: AI Agent Session Recording Shards (One To Many via AgentSessionID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '79321923-b223-45b8-8365-fa8a9cb229c8') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('79321923-b223-45b8-8365-fa8a9cb229c8', '17198778-E25A-4457-80AF-9E8C4961DC29', 'EBAED427-2514-46B1-A20C-777A2055C937', 'AgentSessionID', 'One To Many', TRUE, TRUE, 7, NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'EE88087E-DE03-4409-9EEC-B00007D32DC2'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '2A7F15FB-580A-439B-9DE4-4FCCF8907DDB'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '0202B8C4-A0CF-41E6-B68B-769E25A5B4EA'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 8 fields */
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.LinkedEntityID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '39D168D2-F07B-4D85-BB95-08CB2D786E0F';
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.LinkedRecordID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F69E7371-7F9C-4C91-A5FE-CA430F295583';
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.LinkedEntity */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A216D3DE-11C4-44BE-86DE-C7AA488A3189';
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingStatus */
UPDATE __mj."EntityField" SET "Category" = 'Session Recording', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356';
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingExpectedShards */
UPDATE __mj."EntityField" SET "Category" = 'Session Recording', "GeneratedFormSection" = 'Category', "DisplayName" = 'Expected Shards'
WHERE
  "ID" = '68B99430-0BD8-4496-8B90-08D2CF58EA5B';
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingCapturedSamples */
UPDATE __mj."EntityField" SET "Category" = 'Session Recording', "GeneratedFormSection" = 'Category', "DisplayName" = 'Captured Samples'
WHERE
  "ID" = '1CE50980-E993-49D8-A45C-76DCED905A2F';
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingGaps */
UPDATE __mj."EntityField" SET "Category" = 'Session Recording', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '70A98238-7AEE-40B1-A1D4-0F2C03393316';
/* UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingAssemblyVersion */
UPDATE __mj."EntityField" SET "Category" = 'Session Recording', "GeneratedFormSection" = 'Category', "DisplayName" = 'Assembly Version'
WHERE
  "ID" = '5506B605-5358-471C-B1D3-0677DBC00780';

/* Set categories for 11 fields */
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C74A743F-F9C8-432A-928E-23CD6AF909FF';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.AgentSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Session Association', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Session'
WHERE
  "ID" = 'EE88087E-DE03-4409-9EEC-B00007D32DC2';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.Index */
UPDATE __mj."EntityField" SET "Category" = 'Shard Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AE248773-4FCC-4D86-8B40-9BDC469B4EFF';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.StartSample */
UPDATE __mj."EntityField" SET "Category" = 'Audio Properties', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '85D6C6B3-D9E3-4819-BF87-306BDA555116';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.SampleCount */
UPDATE __mj."EntityField" SET "Category" = 'Audio Properties', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C660DE10-8126-4D24-9360-5DC26126613C';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.Bytes */
UPDATE __mj."EntityField" SET "Category" = 'Audio Properties', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2A7F15FB-580A-439B-9DE4-4FCCF8907DDB';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.Sha256 */
UPDATE __mj."EntityField" SET "Category" = 'Shard Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'SHA-256'
WHERE
  "ID" = 'EE2B8659-543C-4B72-BB5B-7CC1DF073F3C';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.Data */
UPDATE __mj."EntityField" SET "Category" = 'Audio Data', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6866304A-1522-4FB6-BD42-1570DCC808AC';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.ReceivedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0202B8C4-A0CF-41E6-B68B-769E25A5B4EA';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E7FC05D6-D76C-45E3-8D56-F659A98C529A';
/* UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6CED36C5-6456-4F71-8A9A-6EC1C7951E95';

/* Set entity icon to fa fa-microphone-alt */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-microphone-alt', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'EBAED427-2514-46B1-A20C-777A2055C937';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('87a2549f-06a8-5941-91c6-242e3f05069d', 'EBAED427-2514-46B1-A20C-777A2055C937', 'FieldCategoryInfo', '{
  "Audio Data": {
    "description": "Raw binary payload representing the Opus audio recording packets",
    "icon": "fa fa-file-audio"
  },
  "Audio Properties": {
    "description": "Technical audio sample metrics and data size specifications",
    "icon": "fa fa-sliders-h"
  },
  "Session Association": {
    "description": "Association linking the shard to the overarching agent session",
    "icon": "fa fa-link"
  },
  "Shard Details": {
    "description": "Sequential positioning and validation identifiers for the shard",
    "icon": "fa fa-list-ol"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c58c71f-46f2-56f8-b01a-43e6855ca7e2', 'EBAED427-2514-46B1-A20C-777A2055C937', 'FieldCategoryIcons', '{
  "Audio Data": "fa fa-file-audio",
  "Audio Properties": "fa fa-sliders-h",
  "Session Association": "fa fa-link",
  "Shard Details": "fa fa-list-ol",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'EBAED427-2514-46B1-A20C-777A2055C937';
