-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610061701__v6.2.x__Work_Queue_Guarded_Write_Sprocs.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The AST transpiler reported all 32 CREATE PROCEDUREs as unhandled. Every routine is
-- hand-authored below. See the T-SQL original's header for WHY these exist (least-privilege
-- cdp_* logins; guarded writes whose row count is the arbitration signal).
-- ╚════════════════════════════════════════╝
--
-- TRANSLATION DECISIONS (same idiom as V202609191819__v6.2.x__TaskGraph_Guarded_Write_Sprocs.pg.sql):
--
--  * CALL SHAPE. The work-queue engine calls every routine through ProcedureCallBuilder, which on
--    PostgreSQL emits `SELECT * FROM __mj."spX"($1, $2, …)` — positional, reading a result set. Each
--    T-SQL procedure therefore becomes a plpgsql FUNCTION … RETURNS TABLE whose columns carry the
--    T-SQL result-set names exactly (the row mappers in work-queue-engine/src/sql/rows.ts read them
--    by name). Parameter ORDER is the T-SQL declaration order, which is the order the builders pass.
--    Do not reorder parameters: PostgreSQL binds by position here.
--
--  * ARBITRATION. `@@ROWCOUNT` becomes `GET DIAGNOSTICS … = ROW_COUNT`, returned as "AffectedRows"
--    INTEGER. Row-returning writes use UPDATE/INSERT/DELETE … RETURNING in a data-modifying CTE, the
--    PostgreSQL form of T-SQL's OUTPUT … INTO a table variable.
--
--  * LOCKING HINTS.
--      - UPDLOCK, READPAST, ROWLOCK (claim)     → SELECT … FOR UPDATE OF d SKIP LOCKED.
--      - READPAST on a purge DELETE             → the candidate SELECT takes FOR UPDATE … SKIP LOCKED.
--      - UPDLOCK, HOLDLOCK on an insert-if-absent → INSERT … ON CONFLICT … DO NOTHING, which waits for a
--        concurrent inserter to finish and then inserts nothing, as the range lock did.
--      - UPDATE TOP (n) without READPAST (lease expiry) → a candidate SELECT … LIMIT n FOR UPDATE
--        (no SKIP LOCKED): it waits on a locked row exactly as the T-SQL UPDATE did.
--      - OPTION (RECOMPILE) has no PostgreSQL meaning; plpgsql plans a RETURN QUERY with its
--        parameter values (custom plans for the first executions), so it is dropped.
--
--  * APPLICATION LOCKS. sp_getapplock with @LockOwner = N'Transaction' becomes a transaction-scoped
--    advisory lock on hashtextextended(resource, 0): released at commit or rollback, as the T-SQL lock
--    is. spWorkQueueAcquirePublishOrderLock first tries without waiting (LockResult 0, "granted"),
--    then waits under a lock_timeout of @TimeoutMs (LockResult 1, "granted after waiting"). The
--    caller's lock_timeout is restored before returning. A timeout raises SQLSTATE 55P03 with the
--    T-SQL message text ("…lock timeout"), which IsTransientDatabaseError retries on both platforms.
--    spWorkQueueAcquireSweepLock is pg_try_advisory_xact_lock (@LockTimeout = 0 → never waits).
--
--  * ONE CLOCK. SYSDATETIMEOFFSET() becomes NOW() on both sides of every comparison and in every
--    stamp; DATEADD(SECOND|HOUR|DAY, n, …) becomes `+ make_interval(…)`. The columns are TIMESTAMPTZ.
--    DATEDIFF(SECOND, a, NOW()) becomes floor(extract(epoch from NOW() - a)).
--
--  * TYPES. BIT parameters become BOOLEAN (the engine binds JS booleans). NEWID() becomes
--    gen_random_uuid(). OPENJSON(@Deliveries) WITH (…) becomes jsonb_to_recordset(…).
--    READ_COMMITTED_SNAPSHOT has no PostgreSQL setting: PostgreSQL is MVCC by design, so
--    spWorkQueueReadCommittedSnapshotState returns TRUE (rows.ts documents exactly this).
--
--  * QUALIFIED COLUMNS. RETURNS TABLE introduces OUT parameters that share names with table
--    columns, so every function sets `#variable_conflict use_column` and every column reference is
--    table-qualified.
--
--  * DROP. A prior version of any of these (a stale function, or a procedure of the same name) is
--    dropped up front by name so re-applying on a database that already has them is clean.
--
--  * GRANTS. cdp_Developer and cdp_Integration only — NOT cdp_UI — mirroring the T-SQL file. Each
--    grant tolerates only a missing role (undefined_object), with a NOTICE naming it.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
             FROM pg_proc p
            WHERE p.pronamespace = '__mj'::regnamespace
              AND p.proname = ANY (ARRAY[
                  'spWorkQueueAcquirePublishOrderLock', 'spWorkQueueInsertMessage', 'spWorkQueueSelectMessage',
                  'spWorkQueueInsertDeliveries', 'spWorkQueueReserveDeduplication', 'spWorkQueueSelectDeduplicationOwner',
                  'spWorkQueueConfirmDeduplication', 'spWorkQueueReleaseDeduplication', 'spWorkQueuePurgeExpiredDeduplications',
                  'spWorkQueueExpireLeases', 'spWorkQueueSubscriptionBacklog', 'spWorkQueueClaimUnpartitioned',
                  'spWorkQueueSelectPartitionCandidates', 'spWorkQueueClaimPartitionCandidate', 'spWorkQueueExtendLease',
                  'spWorkQueueSelectLeaseState', 'spWorkQueueCompleteDelivery', 'spWorkQueueRetryDelivery',
                  'spWorkQueueDeadLetterDelivery', 'spWorkQueueReleaseDelivery', 'spWorkQueueAcknowledgeCancel',
                  'spWorkQueueSubscriptionStats', 'spWorkQueueListDeadLetters', 'spWorkQueueListPartitions',
                  'spWorkQueueReplayDelivery', 'spWorkQueueDiscardDelivery', 'spWorkQueueCancelInFlightDelivery',
                  'spWorkQueueExpireLeasesAll', 'spWorkQueueAcquireSweepLock', 'spWorkQueueReadCommittedSnapshotState',
                  'spWorkQueuePurgeTerminalDeliveries', 'spWorkQueuePurgeOrphanMessages'])
  LOOP
    EXECUTE 'DROP ROUTINE IF EXISTS ' || r.sig;
  END LOOP;
END $$;

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Publish and the deduplication ledger (03 §2.1) */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/* Serialises publishes per (topic, partition key) so PublishOrdinal is monotonic per key in commit */
/* order. Transaction-owned: the caller must be inside a transaction, which also releases the lock. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueAcquirePublishOrderLock"(
    IN p_Resource  VARCHAR(255),
    IN p_TimeoutMs INTEGER
)
RETURNS TABLE("LockResult" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_key          BIGINT := hashtextextended(p_Resource, 0);
    _v_prior_timeout TEXT  := current_setting('lock_timeout');
BEGIN
    IF pg_try_advisory_xact_lock(_v_key) THEN
        RETURN QUERY SELECT 0;
        RETURN;
    END IF;
    PERFORM set_config('lock_timeout', GREATEST(p_TimeoutMs, 1)::TEXT || 'ms', true);
    BEGIN
        PERFORM pg_advisory_xact_lock(_v_key);
    EXCEPTION WHEN lock_not_available THEN
        PERFORM set_config('lock_timeout', _v_prior_timeout, true);
        RAISE EXCEPTION 'WorkQueue publish-order lock timeout' USING ERRCODE = '55P03';
    END;
    PERFORM set_config('lock_timeout', _v_prior_timeout, true);
    RETURN QUERY SELECT 1;
END;
$mjfn$ LANGUAGE plpgsql;

/* Inserts only when no message has this ID (MessageID is globally unique, F10). Returns the inserted */
/* row, or nothing when a row already exists — the driver then reads it with SelectMessage and */
/* compares canonical envelopes. PublishedAt is the column default. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueInsertMessage"(
    IN p_ID                UUID,
    IN p_TopicID           UUID,
    IN p_PartitionKey      VARCHAR(200),
    IN p_Attributes        VARCHAR(4000),
    IN p_Payload           TEXT,
    IN p_PayloadRef        VARCHAR(2000),
    IN p_CorrelationID     VARCHAR(200),
    IN p_PublishedByUserID UUID
)
RETURNS TABLE("ID" UUID, "PublishOrdinal" BIGINT) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    INSERT INTO __mj."WorkQueueMessage" AS "m"
        ("ID", "TopicID", "PartitionKey", "Attributes", "Payload", "PayloadRef", "CorrelationID", "PublishedByUserID")
    VALUES (p_ID, p_TopicID, p_PartitionKey, p_Attributes, p_Payload, p_PayloadRef, p_CorrelationID, p_PublishedByUserID)
    ON CONFLICT ON CONSTRAINT "PK_WorkQueueMessage" DO NOTHING
    RETURNING "m"."ID", "m"."PublishOrdinal";
END;
$mjfn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spWorkQueueSelectMessage"(
    IN p_MessageID UUID
)
RETURNS TABLE("ID" UUID, "TopicID" UUID, "PartitionKey" VARCHAR, "Attributes" VARCHAR, "Payload" TEXT,
              "PayloadRef" VARCHAR, "CorrelationID" VARCHAR) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    SELECT "m"."ID", "m"."TopicID", "m"."PartitionKey", "m"."Attributes", "m"."Payload", "m"."PayloadRef", "m"."CorrelationID"
      FROM __mj."WorkQueueMessage" AS "m"
     WHERE "m"."ID" = p_MessageID;
END;
$mjfn$ LANGUAGE plpgsql;

/* One Pending delivery per element of the JSON array [{MessageID, SubscriptionID, PartitionKey, OrderKey}]. */
/* Status, AttemptCount, IsReplay and VisibleAt come from the column defaults. Chunked by the driver. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueInsertDeliveries"(
    IN p_Deliveries TEXT
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    INSERT INTO __mj."WorkQueueDelivery" ("MessageID", "SubscriptionID", "PartitionKey", "OrderKey")
    SELECT "j"."MessageID", "j"."SubscriptionID", "j"."PartitionKey", "j"."OrderKey"
      FROM jsonb_to_recordset(p_Deliveries::JSONB)
           AS "j"("MessageID" UUID, "SubscriptionID" UUID, "PartitionKey" VARCHAR(200), "OrderKey" BIGINT);
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* F1: takes a free key, replaces an expired row in place, or re-takes a Reserved row owned by the SAME */
/* MessageID (a retry after a crash). Never re-takes a Confirmed row or another message's reservation: */
/* those return no row and the caller reads the owner. Returns the row it now owns (0-1). */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueReserveDeduplication"(
    IN p_TopicID          UUID,
    IN p_DeduplicationKey VARCHAR(200),
    IN p_MessageID        UUID,
    IN p_ReserveSeconds   INTEGER
)
RETURNS TABLE("MessageID" UUID, "Status" VARCHAR) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_message UUID;
    _v_status  VARCHAR(20);
BEGIN
    UPDATE __mj."WorkQueueDeduplication" AS "x"
       SET "MessageID" = p_MessageID,
           "Status"    = 'Reserved',
           "ExpiresAt" = NOW() + make_interval(secs => p_ReserveSeconds)
     WHERE "x"."TopicID" = p_TopicID
       AND "x"."DeduplicationKey" = p_DeduplicationKey
       AND ("x"."ExpiresAt" <= NOW() OR ("x"."Status" = 'Reserved' AND "x"."MessageID" = p_MessageID))
    RETURNING "x"."MessageID", "x"."Status" INTO _v_message, _v_status;

    IF _v_message IS NULL THEN
        INSERT INTO __mj."WorkQueueDeduplication" AS "x" ("TopicID", "DeduplicationKey", "MessageID", "Status", "ExpiresAt")
        VALUES (p_TopicID, p_DeduplicationKey, p_MessageID, 'Reserved', NOW() + make_interval(secs => p_ReserveSeconds))
        ON CONFLICT ON CONSTRAINT "UQ_WorkQueueDeduplication_Topic_Key" DO NOTHING
        RETURNING "x"."MessageID", "x"."Status" INTO _v_message, _v_status;
    END IF;

    IF _v_message IS NOT NULL THEN
        RETURN QUERY SELECT _v_message, _v_status;
    END IF;
END;
$mjfn$ LANGUAGE plpgsql;

/* A separate statement on purpose: it must see a row committed while the reserve was waiting. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueSelectDeduplicationOwner"(
    IN p_TopicID          UUID,
    IN p_DeduplicationKey VARCHAR(200)
)
RETURNS TABLE("MessageID" UUID, "Status" VARCHAR) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    SELECT "x"."MessageID", "x"."Status"
      FROM __mj."WorkQueueDeduplication" AS "x"
     WHERE "x"."TopicID" = p_TopicID
       AND "x"."DeduplicationKey" = p_DeduplicationKey
       AND "x"."ExpiresAt" > NOW();
END;
$mjfn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spWorkQueueConfirmDeduplication"(
    IN p_TopicID          UUID,
    IN p_DeduplicationKey VARCHAR(200),
    IN p_MessageID        UUID,
    IN p_TtlSeconds       INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDeduplication" AS "x"
       SET "Status"    = 'Confirmed',
           "ExpiresAt" = NOW() + make_interval(secs => p_TtlSeconds)
     WHERE "x"."TopicID" = p_TopicID
       AND "x"."DeduplicationKey" = p_DeduplicationKey
       AND "x"."MessageID" = p_MessageID;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spWorkQueueReleaseDeduplication"(
    IN p_TopicID          UUID,
    IN p_DeduplicationKey VARCHAR(200),
    IN p_MessageID        UUID
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    DELETE FROM __mj."WorkQueueDeduplication" AS "x"
     WHERE "x"."TopicID" = p_TopicID
       AND "x"."DeduplicationKey" = p_DeduplicationKey
       AND "x"."MessageID" = p_MessageID
       AND "x"."Status" = 'Reserved';
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* IX_WorkQueueDeduplication_ExpiresAt; SKIP LOCKED so sweeps and publishers never wait on each other. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueuePurgeExpiredDeduplications"(
    IN p_BatchSize INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    DELETE FROM __mj."WorkQueueDeduplication" AS "x"
     WHERE "x"."ID" IN (SELECT "e"."ID"
                          FROM __mj."WorkQueueDeduplication" AS "e"
                         WHERE "e"."ExpiresAt" <= NOW()
                         LIMIT p_BatchSize
                           FOR UPDATE SKIP LOCKED);
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Consume: expire, claim, heartbeat, settle, acknowledge a cancel (03 §7) */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/* An expired in-flight row is Discarded when a cancel was requested (the holder is dead), Pending when */
/* attempts remain, otherwise DeadLettered with reason 'LeaseExpired'. Bounded to 500 rows per pass; the */
/* next cycle continues. Returns ONLY the rows it dead-lettered (the engine's NotifyDeadLettered seam). */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueExpireLeases"(
    IN p_SubscriptionID UUID,
    IN p_MaxAttempts    INTEGER
)
RETURNS TABLE("DeliveryID" UUID, "SubscriptionID" UUID, "PartitionKey" VARCHAR, "Reason" VARCHAR) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH "candidates" AS (
        SELECT "c"."ID"
          FROM __mj."WorkQueueDelivery" AS "c"
         WHERE "c"."SubscriptionID" = p_SubscriptionID
           AND "c"."Status" = 'InFlight'
           AND "c"."LeaseExpiresAt" < NOW()
         LIMIT 500
           FOR UPDATE
    ), "expired" AS (
        UPDATE __mj."WorkQueueDelivery" AS "d"
           SET "Status"           = CASE WHEN "d"."CancelRequestedAt" IS NOT NULL THEN 'Discarded'
                                         WHEN "d"."AttemptCount" >= p_MaxAttempts THEN 'DeadLettered' ELSE 'Pending' END,
               "DeadLetterReason" = CASE WHEN "d"."CancelRequestedAt" IS NULL AND "d"."AttemptCount" >= p_MaxAttempts
                                         THEN 'LeaseExpired' ELSE "d"."DeadLetterReason" END,
               "DeadLetteredAt"   = CASE WHEN "d"."CancelRequestedAt" IS NULL AND "d"."AttemptCount" >= p_MaxAttempts
                                         THEN NOW() ELSE "d"."DeadLetteredAt" END,
               "CompletedAt"      = CASE WHEN "d"."CancelRequestedAt" IS NOT NULL THEN NOW() ELSE "d"."CompletedAt" END,
               "LastError"        = CASE WHEN "d"."CancelRequestedAt" IS NOT NULL THEN "d"."LastError" ELSE 'LeaseExpired' END,
               "VisibleAt"        = NOW(),
               "LeaseToken"       = NULL,
               "LeaseOwner"       = NULL,
               "LeaseExpiresAt"   = NULL
          FROM "candidates"
         WHERE "d"."ID" = "candidates"."ID"
        RETURNING "d"."ID", "d"."SubscriptionID", "d"."PartitionKey", "d"."Status", "d"."DeadLetterReason"
    )
    SELECT "expired"."ID", "expired"."SubscriptionID", "expired"."PartitionKey", "expired"."DeadLetterReason"
      FROM "expired"
     WHERE "expired"."Status" = 'DeadLettered';
END;
$mjfn$ LANGUAGE plpgsql;

/* Autoscaler metric (03 §11): claimable Pending under the partition rules PLUS InFlight (a scaler */
/* subtracts running executions, so a Pending-only count starves the queue). Every count stops at p_Cap. */
/* p_Mode: 'None' | 'Exclusive' (distinct idle keys) | 'Ordered' (heads). */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueSubscriptionBacklog"(
    IN p_SubscriptionID UUID,
    IN p_Mode           VARCHAR(20),
    IN p_Cap            INTEGER
)
RETURNS TABLE("Claimable" BIGINT, "InFlight" BIGINT) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM (SELECT 1 AS "x" FROM __mj."WorkQueueDelivery" AS "d"
                                WHERE "d"."SubscriptionID" = p_SubscriptionID AND "d"."Status" = 'Pending' AND "d"."VisibleAt" <= NOW()
                                  AND "d"."PartitionKey" IS NULL
                                  AND EXISTS (SELECT 1 FROM __mj."WorkQueueSubscription" AS "s" WHERE "s"."ID" = p_SubscriptionID AND "s"."Status" = 'Active')
                                LIMIT p_Cap) AS "k")
        + CASE
            WHEN p_Mode = 'Exclusive' THEN
                (SELECT COUNT(*) FROM (SELECT DISTINCT "d"."PartitionKey" FROM __mj."WorkQueueDelivery" AS "d"
                                        WHERE "d"."SubscriptionID" = p_SubscriptionID AND "d"."Status" = 'Pending' AND "d"."VisibleAt" <= NOW()
                                          AND "d"."PartitionKey" IS NOT NULL
                                          AND EXISTS (SELECT 1 FROM __mj."WorkQueueSubscription" AS "s" WHERE "s"."ID" = p_SubscriptionID AND "s"."Status" = 'Active')
                                          AND NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "f"
                                                           WHERE "f"."SubscriptionID" = "d"."SubscriptionID" AND "f"."PartitionKey" = "d"."PartitionKey" AND "f"."Status" = 'InFlight')
                                        LIMIT p_Cap) AS "h")
            WHEN p_Mode = 'Ordered' THEN
                (SELECT COUNT(*) FROM (SELECT 1 AS "x" FROM __mj."WorkQueueDelivery" AS "d"
                                        WHERE "d"."SubscriptionID" = p_SubscriptionID AND "d"."Status" = 'Pending' AND "d"."VisibleAt" <= NOW()
                                          AND "d"."PartitionKey" IS NOT NULL
                                          AND EXISTS (SELECT 1 FROM __mj."WorkQueueSubscription" AS "s" WHERE "s"."ID" = p_SubscriptionID AND "s"."Status" = 'Active')
                                          AND NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "f"
                                                           WHERE "f"."SubscriptionID" = "d"."SubscriptionID" AND "f"."PartitionKey" = "d"."PartitionKey" AND "f"."Status" = 'InFlight')
                                          AND NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "e"
                                                           WHERE "e"."SubscriptionID" = "d"."SubscriptionID" AND "e"."PartitionKey" = "d"."PartitionKey"
                                                             AND "e"."OrderKey" < "d"."OrderKey" AND "e"."Status" IN ('Pending', 'InFlight', 'DeadLettered'))
                                        LIMIT p_Cap) AS "h")
            ELSE 0
          END,
        (SELECT COUNT(*) FROM (SELECT 1 AS "x" FROM __mj."WorkQueueDelivery" AS "d"
                                WHERE "d"."SubscriptionID" = p_SubscriptionID AND "d"."Status" = 'InFlight'
                                LIMIT p_Cap) AS "f");
END;
$mjfn$ LANGUAGE plpgsql;

/* Claims up to p_MaxRows keyless, visible, uncancelled Pending rows of an active subscription, skipping */
/* locked rows, issuing a fresh lease token and counting the attempt. Returns the claimed deliveries */
/* joined to their messages. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueClaimUnpartitioned"(
    IN p_SubscriptionID UUID,
    IN p_LeaseOwner     VARCHAR(200),
    IN p_LeaseSeconds   INTEGER,
    IN p_MaxRows        INTEGER
)
RETURNS TABLE("DeliveryID" UUID, "AttemptCount" INTEGER, "LeaseToken" UUID, "LeaseExpiresAt" TIMESTAMPTZ, "IsReplay" BOOLEAN,
              "MessageID" UUID, "PartitionKey" VARCHAR, "Attributes" VARCHAR, "Payload" TEXT, "PayloadRef" VARCHAR,
              "CorrelationID" VARCHAR, "PublishedAt" TIMESTAMPTZ) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH "ready" AS (
        SELECT "r"."ID"
          FROM __mj."WorkQueueDelivery" AS "r"
         WHERE "r"."SubscriptionID" = p_SubscriptionID AND "r"."Status" = 'Pending' AND "r"."PartitionKey" IS NULL
           AND "r"."VisibleAt" <= NOW() AND "r"."CancelRequestedAt" IS NULL
           AND EXISTS (SELECT 1 FROM __mj."WorkQueueSubscription" AS "s" WHERE "s"."ID" = p_SubscriptionID AND "s"."Status" = 'Active')
         ORDER BY "r"."VisibleAt"
         LIMIT p_MaxRows
           FOR UPDATE OF "r" SKIP LOCKED
    ), "claimed" AS (
        UPDATE __mj."WorkQueueDelivery" AS "d"
           SET "Status"          = 'InFlight',
               "LeaseToken"      = gen_random_uuid(),
               "LeaseOwner"      = p_LeaseOwner,
               "LeaseExpiresAt"  = NOW() + make_interval(secs => p_LeaseSeconds),
               "LastHeartbeatAt" = NOW(),
               "AttemptCount"    = "d"."AttemptCount" + 1,
               "Progress"        = NULL
          FROM "ready"
         WHERE "d"."ID" = "ready"."ID"
        RETURNING "d"."ID", "d"."MessageID", "d"."AttemptCount", "d"."LeaseToken", "d"."LeaseExpiresAt", "d"."IsReplay"
    )
    SELECT "c"."ID", "c"."AttemptCount", "c"."LeaseToken", "c"."LeaseExpiresAt", "c"."IsReplay",
           "m"."ID", "m"."PartitionKey", "m"."Attributes", "m"."Payload", "m"."PayloadRef", "m"."CorrelationID", "m"."PublishedAt"
      FROM "claimed" AS "c"
      JOIN __mj."WorkQueueMessage" AS "m" ON "m"."ID" = "c"."MessageID";
END;
$mjfn$ LANGUAGE plpgsql;

/* Streams IX_WorkQueueDelivery_Claim in VisibleAt order and stops after p_MaxRows qualifying rows. */
/* Exclusive: keys with nothing in flight. Ordered (p_Ordered): additionally the head of its key. */
/* Several rows of one idle key may come back for Exclusive; the consumer keeps the first per key. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueSelectPartitionCandidates"(
    IN p_SubscriptionID UUID,
    IN p_Ordered        BOOLEAN,
    IN p_MaxRows        INTEGER
)
RETURNS TABLE("DeliveryID" UUID, "PartitionKey" VARCHAR) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    SELECT "d"."ID", "d"."PartitionKey"
      FROM __mj."WorkQueueDelivery" AS "d"
     WHERE "d"."SubscriptionID" = p_SubscriptionID AND "d"."Status" = 'Pending' AND "d"."PartitionKey" IS NOT NULL AND "d"."VisibleAt" <= NOW()
       AND "d"."CancelRequestedAt" IS NULL
       AND EXISTS (SELECT 1 FROM __mj."WorkQueueSubscription" AS "s" WHERE "s"."ID" = p_SubscriptionID AND "s"."Status" = 'Active')
       AND NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "f"
                        WHERE "f"."SubscriptionID" = "d"."SubscriptionID" AND "f"."PartitionKey" = "d"."PartitionKey" AND "f"."Status" = 'InFlight')
       AND (NOT p_Ordered OR NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "e"
                                          WHERE "e"."SubscriptionID" = "d"."SubscriptionID" AND "e"."PartitionKey" = "d"."PartitionKey"
                                            AND "e"."OrderKey" < "d"."OrderKey" AND "e"."Status" IN ('Pending', 'InFlight', 'DeadLettered')))
     ORDER BY "d"."VisibleAt"
     LIMIT p_MaxRows;
END;
$mjfn$ LANGUAGE plpgsql;

/* Claims ONE candidate, re-checking every rule on the row. UQ_WorkQueueDelivery_InFlightPartition is the */
/* race-proof backstop; a unique violation here means another worker claimed the key first. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueClaimPartitionCandidate"(
    IN p_SubscriptionID UUID,
    IN p_DeliveryID     UUID,
    IN p_Ordered        BOOLEAN,
    IN p_LeaseOwner     VARCHAR(200),
    IN p_LeaseSeconds   INTEGER
)
RETURNS TABLE("DeliveryID" UUID, "AttemptCount" INTEGER, "LeaseToken" UUID, "LeaseExpiresAt" TIMESTAMPTZ, "IsReplay" BOOLEAN,
              "MessageID" UUID, "PartitionKey" VARCHAR, "Attributes" VARCHAR, "Payload" TEXT, "PayloadRef" VARCHAR,
              "CorrelationID" VARCHAR, "PublishedAt" TIMESTAMPTZ) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH "claimed" AS (
        UPDATE __mj."WorkQueueDelivery" AS "d"
           SET "Status"          = 'InFlight',
               "LeaseToken"      = gen_random_uuid(),
               "LeaseOwner"      = p_LeaseOwner,
               "LeaseExpiresAt"  = NOW() + make_interval(secs => p_LeaseSeconds),
               "LastHeartbeatAt" = NOW(),
               "AttemptCount"    = "d"."AttemptCount" + 1,
               "Progress"        = NULL
         WHERE "d"."ID" = p_DeliveryID AND "d"."SubscriptionID" = p_SubscriptionID AND "d"."Status" = 'Pending'
           AND "d"."VisibleAt" <= NOW() AND "d"."PartitionKey" IS NOT NULL AND "d"."CancelRequestedAt" IS NULL
           AND EXISTS (SELECT 1 FROM __mj."WorkQueueSubscription" AS "s" WHERE "s"."ID" = p_SubscriptionID AND "s"."Status" = 'Active')
           AND NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "f"
                            WHERE "f"."SubscriptionID" = "d"."SubscriptionID" AND "f"."PartitionKey" = "d"."PartitionKey" AND "f"."Status" = 'InFlight')
           AND (NOT p_Ordered OR NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "e"
                                              WHERE "e"."SubscriptionID" = "d"."SubscriptionID" AND "e"."PartitionKey" = "d"."PartitionKey"
                                                AND "e"."OrderKey" < "d"."OrderKey" AND "e"."Status" IN ('Pending', 'InFlight', 'DeadLettered')))
        RETURNING "d"."ID", "d"."MessageID", "d"."AttemptCount", "d"."LeaseToken", "d"."LeaseExpiresAt", "d"."IsReplay"
    )
    SELECT "c"."ID", "c"."AttemptCount", "c"."LeaseToken", "c"."LeaseExpiresAt", "c"."IsReplay",
           "m"."ID", "m"."PartitionKey", "m"."Attributes", "m"."Payload", "m"."PayloadRef", "m"."CorrelationID", "m"."PublishedAt"
      FROM "claimed" AS "c"
      JOIN __mj."WorkQueueMessage" AS "m" ON "m"."ID" = "c"."MessageID";
END;
$mjfn$ LANGUAGE plpgsql;

/* Heartbeat. Fenced on the holder's token and the cancel flag: zero rows means Lost or Cancelled, and */
/* SelectLeaseState tells the two apart. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueExtendLease"(
    IN p_DeliveryID   UUID,
    IN p_LeaseToken   UUID,
    IN p_LeaseSeconds INTEGER,
    IN p_Progress     VARCHAR(4000)
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDelivery" AS "d"
       SET "LeaseExpiresAt"  = NOW() + make_interval(secs => p_LeaseSeconds),
           "LastHeartbeatAt" = NOW(),
           "Progress"        = COALESCE(p_Progress, "d"."Progress")
     WHERE "d"."ID" = p_DeliveryID AND "d"."LeaseToken" = p_LeaseToken AND "d"."Status" = 'InFlight' AND "d"."CancelRequestedAt" IS NULL;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spWorkQueueSelectLeaseState"(
    IN p_DeliveryID UUID,
    IN p_LeaseToken UUID
)
RETURNS TABLE("CancelRequested" BOOLEAN) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    SELECT ("d"."CancelRequestedAt" IS NOT NULL)
      FROM __mj."WorkQueueDelivery" AS "d"
     WHERE "d"."ID" = p_DeliveryID AND "d"."LeaseToken" = p_LeaseToken AND "d"."Status" = 'InFlight';
END;
$mjfn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spWorkQueueCompleteDelivery"(
    IN p_DeliveryID UUID,
    IN p_LeaseToken UUID
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDelivery" AS "d"
       SET "Status" = 'Completed', "CompletedAt" = NOW(), "LeaseToken" = NULL, "LeaseOwner" = NULL, "LeaseExpiresAt" = NULL
     WHERE "d"."ID" = p_DeliveryID AND "d"."LeaseToken" = p_LeaseToken AND "d"."Status" = 'InFlight' AND "d"."CancelRequestedAt" IS NULL;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spWorkQueueRetryDelivery"(
    IN p_DeliveryID   UUID,
    IN p_LeaseToken   UUID,
    IN p_DelaySeconds INTEGER,
    IN p_Error        TEXT
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDelivery" AS "d"
       SET "Status" = 'Pending', "VisibleAt" = NOW() + make_interval(secs => p_DelaySeconds), "LastError" = p_Error,
           "LeaseToken" = NULL, "LeaseOwner" = NULL, "LeaseExpiresAt" = NULL
     WHERE "d"."ID" = p_DeliveryID AND "d"."LeaseToken" = p_LeaseToken AND "d"."Status" = 'InFlight' AND "d"."CancelRequestedAt" IS NULL;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spWorkQueueDeadLetterDelivery"(
    IN p_DeliveryID UUID,
    IN p_LeaseToken UUID,
    IN p_Reason     VARCHAR(100),
    IN p_Error      TEXT
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDelivery" AS "d"
       SET "Status" = 'DeadLettered', "DeadLetterReason" = p_Reason, "DeadLetteredAt" = NOW(), "LastError" = COALESCE(p_Error, "d"."LastError"),
           "LeaseToken" = NULL, "LeaseOwner" = NULL, "LeaseExpiresAt" = NULL
     WHERE "d"."ID" = p_DeliveryID AND "d"."LeaseToken" = p_LeaseToken AND "d"."Status" = 'InFlight' AND "d"."CancelRequestedAt" IS NULL;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Release on shutdown: back to Pending without consuming the attempt. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueReleaseDelivery"(
    IN p_DeliveryID UUID,
    IN p_LeaseToken UUID
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDelivery" AS "d"
       SET "Status" = 'Pending', "AttemptCount" = CASE WHEN "d"."AttemptCount" > 0 THEN "d"."AttemptCount" - 1 ELSE 0 END, "VisibleAt" = NOW(),
           "LeaseToken" = NULL, "LeaseOwner" = NULL, "LeaseExpiresAt" = NULL
     WHERE "d"."ID" = p_DeliveryID AND "d"."LeaseToken" = p_LeaseToken AND "d"."Status" = 'InFlight' AND "d"."CancelRequestedAt" IS NULL;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* The one holder write allowed after a cancel (F2): token-fenced, requires the flag, discards now so the */
/* key frees the moment the handler has stopped. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueAcknowledgeCancel"(
    IN p_DeliveryID UUID,
    IN p_LeaseToken UUID
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDelivery" AS "d"
       SET "Status" = 'Discarded', "CompletedAt" = NOW(), "LeaseToken" = NULL, "LeaseOwner" = NULL, "LeaseExpiresAt" = NULL
     WHERE "d"."ID" = p_DeliveryID AND "d"."LeaseToken" = p_LeaseToken AND "d"."Status" = 'InFlight' AND "d"."CancelRequestedAt" IS NOT NULL;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Operator, sweeper and topology validation (03 §5.2, §7) */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/* Per-status index seeks, never one aggregate over the subscription. BlockedKeys only for Ordered. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueSubscriptionStats"(
    IN p_SubscriptionID UUID,
    IN p_Ordered        BOOLEAN
)
RETURNS TABLE("Pending" BIGINT, "InFlight" BIGINT, "DeadLettered" BIGINT, "BlockedKeys" BIGINT,
              "OldestPendingAgeSeconds" BIGINT, "CompletedLastHour" BIGINT) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM __mj."WorkQueueDelivery" AS "p" WHERE "p"."SubscriptionID" = p_SubscriptionID AND "p"."Status" = 'Pending'),
        (SELECT COUNT(*) FROM __mj."WorkQueueDelivery" AS "f" WHERE "f"."SubscriptionID" = p_SubscriptionID AND "f"."Status" = 'InFlight'),
        (SELECT COUNT(*) FROM __mj."WorkQueueDelivery" AS "x" WHERE "x"."SubscriptionID" = p_SubscriptionID AND "x"."Status" = 'DeadLettered'),
        CASE WHEN p_Ordered THEN
            (SELECT COUNT(*) FROM __mj."WorkQueueDelivery" AS "h"
              WHERE "h"."SubscriptionID" = p_SubscriptionID AND "h"."Status" = 'DeadLettered' AND "h"."PartitionKey" IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "e"
                                 WHERE "e"."SubscriptionID" = "h"."SubscriptionID" AND "e"."PartitionKey" = "h"."PartitionKey"
                                   AND "e"."OrderKey" < "h"."OrderKey" AND "e"."Status" IN ('Pending', 'InFlight', 'DeadLettered')))
        ELSE NULL::BIGINT END,
        (SELECT floor(extract(epoch FROM NOW() - MIN("o"."VisibleAt")))::BIGINT FROM __mj."WorkQueueDelivery" AS "o"
          WHERE "o"."SubscriptionID" = p_SubscriptionID AND "o"."Status" = 'Pending'),
        (SELECT COUNT(*) FROM __mj."WorkQueueDelivery" AS "c"
          WHERE "c"."Status" = 'Completed' AND "c"."CompletedAt" >= NOW() - make_interval(hours => 1) AND "c"."SubscriptionID" = p_SubscriptionID);
END;
$mjfn$ LANGUAGE plpgsql;

/* Keyset page of dead letters by delivery ID, message joined. BlocksKey: an Ordered head. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueListDeadLetters"(
    IN p_SubscriptionID  UUID,
    IN p_Ordered         BOOLEAN,
    IN p_AfterDeliveryID UUID,
    IN p_PageSize        INTEGER
)
RETURNS TABLE("DeliveryID" UUID, "AttemptCount" INTEGER, "DeadLetterReason" VARCHAR, "LastError" TEXT, "DeadLetteredAt" TIMESTAMPTZ,
              "DeliveryPartitionKey" VARCHAR, "BlocksKey" BOOLEAN, "MessageID" UUID, "PartitionKey" VARCHAR, "Attributes" VARCHAR,
              "Payload" TEXT, "PayloadRef" VARCHAR, "CorrelationID" VARCHAR, "PublishedAt" TIMESTAMPTZ) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    SELECT "d"."ID", "d"."AttemptCount", "d"."DeadLetterReason", "d"."LastError", "d"."DeadLetteredAt",
           "d"."PartitionKey",
           (p_Ordered AND "d"."PartitionKey" IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "e"
                              WHERE "e"."SubscriptionID" = "d"."SubscriptionID" AND "e"."PartitionKey" = "d"."PartitionKey"
                                AND "e"."OrderKey" < "d"."OrderKey" AND "e"."Status" IN ('Pending', 'InFlight', 'DeadLettered'))),
           "m"."ID", "m"."PartitionKey", "m"."Attributes", "m"."Payload", "m"."PayloadRef", "m"."CorrelationID", "m"."PublishedAt"
      FROM __mj."WorkQueueDelivery" AS "d"
      JOIN __mj."WorkQueueMessage" AS "m" ON "m"."ID" = "d"."MessageID"
     WHERE "d"."SubscriptionID" = p_SubscriptionID AND "d"."Status" = 'DeadLettered'
       AND (p_AfterDeliveryID IS NULL OR "d"."ID" > p_AfterDeliveryID)
     ORDER BY "d"."ID"
     LIMIT p_PageSize;
END;
$mjfn$ LANGUAGE plpgsql;

/* Partition conditions derived from the delivery rows alone: InFlight, Blocked (Ordered head is dead- */
/* lettered), else Idle. p_Condition NULL = every non-Idle key. Keyset by partition key. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueListPartitions"(
    IN p_SubscriptionID    UUID,
    IN p_Ordered           BOOLEAN,
    IN p_Condition         VARCHAR(20),
    IN p_AfterPartitionKey VARCHAR(200),
    IN p_PageSize          INTEGER
)
RETURNS TABLE("PartitionKey" VARCHAR, "Condition" VARCHAR, "HeadDeliveryID" UUID, "WaitingItems" BIGINT) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH "keys" AS (
        SELECT "d"."PartitionKey",
               SUM(CASE WHEN "d"."Status" = 'InFlight' THEN 1 ELSE 0 END) AS "InFlightCount",
               SUM(CASE WHEN "d"."Status" = 'Pending' THEN 1 ELSE 0 END) AS "WaitingItems",
               MIN("d"."OrderKey") AS "HeadOrderKey"
          FROM __mj."WorkQueueDelivery" AS "d"
         WHERE "d"."SubscriptionID" = p_SubscriptionID AND "d"."PartitionKey" IS NOT NULL
           AND "d"."Status" IN ('Pending', 'InFlight', 'DeadLettered')
           AND (p_AfterPartitionKey IS NULL OR "d"."PartitionKey" > p_AfterPartitionKey)
         GROUP BY "d"."PartitionKey"
    ), "shaped" AS (
        SELECT "k"."PartitionKey", "k"."WaitingItems", "h"."ID" AS "HeadDeliveryID",
               CASE WHEN "k"."InFlightCount" > 0 THEN 'InFlight'
                    WHEN p_Ordered AND "h"."Status" = 'DeadLettered' THEN 'Blocked'
                    ELSE 'Idle' END::VARCHAR AS "Condition"
          FROM "keys" AS "k"
          JOIN __mj."WorkQueueDelivery" AS "h"
            ON "h"."SubscriptionID" = p_SubscriptionID AND "h"."PartitionKey" = "k"."PartitionKey" AND "h"."OrderKey" = "k"."HeadOrderKey"
    )
    SELECT "s"."PartitionKey", "s"."Condition", "s"."HeadDeliveryID", "s"."WaitingItems"
      FROM "shaped" AS "s"
     WHERE (p_Condition IS NULL AND "s"."Condition" <> 'Idle') OR "s"."Condition" = p_Condition
     ORDER BY "s"."PartitionKey"
     LIMIT p_PageSize;
END;
$mjfn$ LANGUAGE plpgsql;

/* Replay keeps the delivery's OrderKey, so an Ordered head keeps its place. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueReplayDelivery"(
    IN p_SubscriptionID UUID,
    IN p_DeliveryID     UUID,
    IN p_ActorUserID    UUID,
    IN p_Note           VARCHAR(1000)
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDelivery" AS "d"
       SET "Status" = 'Pending', "AttemptCount" = 0, "IsReplay" = TRUE, "VisibleAt" = NOW(),
           "DeadLetterReason" = NULL, "DeadLetteredAt" = NULL, "ResolvedByUserID" = p_ActorUserID, "ResolutionNote" = p_Note
     WHERE "d"."ID" = p_DeliveryID AND "d"."SubscriptionID" = p_SubscriptionID AND "d"."Status" = 'DeadLettered';
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Discards a dead letter, or a Pending delivery when p_AllowPending. InFlight rows are cancelled */
/* through spWorkQueueCancelInFlightDelivery instead. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueDiscardDelivery"(
    IN p_SubscriptionID UUID,
    IN p_DeliveryID     UUID,
    IN p_AllowPending   BOOLEAN,
    IN p_ActorUserID    UUID,
    IN p_Reason         VARCHAR(1000)
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDelivery" AS "d"
       SET "Status" = 'Discarded', "CompletedAt" = NOW(), "ResolvedByUserID" = p_ActorUserID, "ResolutionNote" = p_Reason,
           "LeaseToken" = NULL, "LeaseOwner" = NULL, "LeaseExpiresAt" = NULL
     WHERE "d"."ID" = p_DeliveryID AND "d"."SubscriptionID" = p_SubscriptionID
       AND ("d"."Status" = 'DeadLettered' OR (p_AllowPending AND "d"."Status" = 'Pending'));
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Cancel in flight (F2): stamps CancelRequestedAt and leaves the lease token UNCHANGED so the holder can */
/* acknowledge. The row becomes Discarded when the holder acknowledges or when its lease expires. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueCancelInFlightDelivery"(
    IN p_SubscriptionID UUID,
    IN p_DeliveryID     UUID,
    IN p_ActorUserID    UUID,
    IN p_Reason         VARCHAR(1000)
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."WorkQueueDelivery" AS "d"
       SET "CancelRequestedAt" = NOW(), "ResolvedByUserID" = p_ActorUserID, "ResolutionNote" = p_Reason
     WHERE "d"."ID" = p_DeliveryID AND "d"."SubscriptionID" = p_SubscriptionID AND "d"."Status" = 'InFlight' AND "d"."CancelRequestedAt" IS NULL;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Sweeper-wide expiry using each subscription's own MaxAttempts, in a bounded batch. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueExpireLeasesAll"(
    IN p_BatchSize INTEGER
)
RETURNS TABLE("DeliveryID" UUID, "SubscriptionID" UUID, "PartitionKey" VARCHAR, "Reason" VARCHAR) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH "candidates" AS (
        SELECT "c"."ID"
          FROM __mj."WorkQueueDelivery" AS "c"
         WHERE "c"."Status" = 'InFlight' AND "c"."LeaseExpiresAt" < NOW()
         LIMIT p_BatchSize
           FOR UPDATE
    ), "expired" AS (
        UPDATE __mj."WorkQueueDelivery" AS "d"
           SET "Status"           = CASE WHEN "d"."CancelRequestedAt" IS NOT NULL THEN 'Discarded'
                                         WHEN "d"."AttemptCount" >= "s"."MaxAttempts" THEN 'DeadLettered' ELSE 'Pending' END,
               "DeadLetterReason" = CASE WHEN "d"."CancelRequestedAt" IS NULL AND "d"."AttemptCount" >= "s"."MaxAttempts"
                                         THEN 'LeaseExpired' ELSE "d"."DeadLetterReason" END,
               "DeadLetteredAt"   = CASE WHEN "d"."CancelRequestedAt" IS NULL AND "d"."AttemptCount" >= "s"."MaxAttempts"
                                         THEN NOW() ELSE "d"."DeadLetteredAt" END,
               "CompletedAt"      = CASE WHEN "d"."CancelRequestedAt" IS NOT NULL THEN NOW() ELSE "d"."CompletedAt" END,
               "LastError"        = CASE WHEN "d"."CancelRequestedAt" IS NOT NULL THEN "d"."LastError" ELSE 'LeaseExpired' END,
               "VisibleAt"        = NOW(),
               "LeaseToken"       = NULL,
               "LeaseOwner"       = NULL,
               "LeaseExpiresAt"   = NULL
          FROM "candidates", __mj."WorkQueueSubscription" AS "s"
         WHERE "d"."ID" = "candidates"."ID" AND "s"."ID" = "d"."SubscriptionID"
        RETURNING "d"."ID", "d"."SubscriptionID", "d"."PartitionKey", "d"."Status", "d"."DeadLetterReason"
    )
    SELECT "expired"."ID", "expired"."SubscriptionID", "expired"."PartitionKey", "expired"."DeadLetterReason"
      FROM "expired"
     WHERE "expired"."Status" = 'DeadLettered';
END;
$mjfn$ LANGUAGE plpgsql;

/* One sweeper at a time (F9): a non-blocking lock owned by the caller's transaction (pooled connections */
/* make a session lock unsafe). The transaction is held open by TryAcquireSweepLock until Release(). */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueAcquireSweepLock"(
    IN p_Resource VARCHAR(255)
)
RETURNS TABLE("Acquired" BOOLEAN) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY SELECT pg_try_advisory_xact_lock(hashtextextended(p_Resource, 0));
END;
$mjfn$ LANGUAGE plpgsql;

/* Database prerequisite (03 §6): the Database transport requires READ_COMMITTED_SNAPSHOT on SQL */
/* Server. PostgreSQL is MVCC by design and has no such setting, so the answer is always TRUE. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueueReadCommittedSnapshotState"()
RETURNS TABLE("SnapshotOn" BOOLEAN) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY SELECT TRUE;
END;
$mjfn$ LANGUAGE plpgsql;

/* Retention purge of terminal deliveries. The first CompletedAt predicate uses IX_WorkQueueDelivery_Purge */
/* (nothing is purgeable before the smallest retention of any topic has passed); the second applies each */
/* row's own topic retention. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueuePurgeTerminalDeliveries"(
    IN p_BatchSize INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    DELETE FROM __mj."WorkQueueDelivery" AS "x"
     WHERE "x"."ID" IN (
        SELECT "d"."ID"
          FROM __mj."WorkQueueDelivery" AS "d"
          JOIN __mj."WorkQueueSubscription" AS "s" ON "s"."ID" = "d"."SubscriptionID"
          JOIN __mj."WorkQueueTopic" AS "t" ON "t"."ID" = "s"."TopicID"
         WHERE "d"."Status" IN ('Completed', 'Discarded')
           AND "d"."CompletedAt" < NOW() - make_interval(days => (SELECT MIN("mt"."RetentionDays") FROM __mj."WorkQueueTopic" AS "mt"))
           AND "d"."CompletedAt" < NOW() - make_interval(days => "t"."RetentionDays")
         LIMIT p_BatchSize
           FOR UPDATE OF "d" SKIP LOCKED);
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* A message is an orphan once every delivery of it is gone: one IX_WorkQueueMessage_Purge range seek */
/* per topic. */
CREATE OR REPLACE FUNCTION __mj."spWorkQueuePurgeOrphanMessages"(
    IN p_BatchSize INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
#variable_conflict use_column
DECLARE
    _v_row_count INTEGER;
BEGIN
    DELETE FROM __mj."WorkQueueMessage" AS "x"
     WHERE "x"."ID" IN (
        SELECT "m"."ID"
          FROM __mj."WorkQueueTopic" AS "t"
          JOIN __mj."WorkQueueMessage" AS "m"
            ON "m"."TopicID" = "t"."ID" AND "m"."PublishedAt" < NOW() - make_interval(days => "t"."RetentionDays")
         WHERE NOT EXISTS (SELECT 1 FROM __mj."WorkQueueDelivery" AS "d" WHERE "d"."MessageID" = "m"."ID")
         LIMIT p_BatchSize
           FOR UPDATE OF "m" SKIP LOCKED);
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Grants — cdp_Developer and cdp_Integration only (NOT cdp_UI), matching the T-SQL file */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
DO $$
DECLARE
    _fn   TEXT;
    _role TEXT;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
      'spWorkQueueAcquirePublishOrderLock', 'spWorkQueueInsertMessage', 'spWorkQueueSelectMessage',
      'spWorkQueueInsertDeliveries', 'spWorkQueueReserveDeduplication', 'spWorkQueueSelectDeduplicationOwner',
      'spWorkQueueConfirmDeduplication', 'spWorkQueueReleaseDeduplication', 'spWorkQueuePurgeExpiredDeduplications',
      'spWorkQueueExpireLeases', 'spWorkQueueSubscriptionBacklog', 'spWorkQueueClaimUnpartitioned',
      'spWorkQueueSelectPartitionCandidates', 'spWorkQueueClaimPartitionCandidate', 'spWorkQueueExtendLease',
      'spWorkQueueSelectLeaseState', 'spWorkQueueCompleteDelivery', 'spWorkQueueRetryDelivery',
      'spWorkQueueDeadLetterDelivery', 'spWorkQueueReleaseDelivery', 'spWorkQueueAcknowledgeCancel',
      'spWorkQueueSubscriptionStats', 'spWorkQueueListDeadLetters', 'spWorkQueueListPartitions',
      'spWorkQueueReplayDelivery', 'spWorkQueueDiscardDelivery', 'spWorkQueueCancelInFlightDelivery',
      'spWorkQueueExpireLeasesAll', 'spWorkQueueAcquireSweepLock', 'spWorkQueueReadCommittedSnapshotState',
      'spWorkQueuePurgeTerminalDeliveries', 'spWorkQueuePurgeOrphanMessages']
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
