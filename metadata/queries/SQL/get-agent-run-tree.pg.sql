/*
  GetAgentRunTree (PostgreSQL variant) — one row per node of everything an agent run caused.

  Mirrors get-agent-run-tree.sql, which documents what the query returns and why (per-node own cost,
  never a rollup; the depth bound inside every recursive member; the loop passes emitted after the
  recursion). Same columns, same order, same rows. Differences:

    * `[__mj].[X]` → `__mj."X"`; column names double-quoted, since PG folds unquoted names to lower
      case. `WITH` → `WITH RECURSIVE`; no `OPTION (MAXRECURSION 0)` (PG has no engine limit to turn
      off, so the `Depth < maxDepth` predicate is the only bound here too).
    * PG allows the recursive reference once, in a single SELECT after the anchor, so the five
      recursive members become branches of one LATERAL subquery that reads the current node `t`.
      Each branch keeps only the node kind it expands, exactly as each member's WHERE does there.
    * Node IDs are text, as on SQL Server (NVARCHAR(50)). A recursive member joins back to a view
      through `"NodeID"::uuid`: every node inside the recursion is a row ID.
    * JSON: `TaskJson` / `StepJson` parse a column only when `pg_input_is_valid(…, 'jsonb')` says it
      is JSON, so a malformed value reads as absent. (SQL Server's JSON_VALUE raises an error on
      malformed JSON instead; this variant degrades rather than failing the whole tree.) They are NOT
      MATERIALIZED, so each use is inlined and filtered first. JSON_VALUE is `->>` on a scalar;
      JSON_QUERY is the value as text when it is an object or array.
    * IDs read from JSON are compared as lower-case text with the row ID cast to text, so a value
      that is not a UUID matches nothing instead of failing the cast.
    * `OPENJSON … WITH (…)` → `jsonb_array_elements` over the iterations array (an empty array when
      the value is not an array) in a LATERAL join; each member is read with `->>` / `->`.
    * `DATEDIFF(MILLISECOND, a, b)` → the epoch difference in milliseconds, as BIGINT.
    * `ISNULL` → `COALESCE`; `TRY_CAST(… AS INT)` → a CASE that casts only an integer literal;
      `+` string concatenation → `||`.
    * PG sorts NULL after other values (SQL Server sorts it first). The ORDER BY reads NotStarted
      before StartedAt, so every NULL StartedAt is already in its own group and the order is the same.
*/
WITH RECURSIVE "TaskJson" AS NOT MATERIALIZED (
    SELECT
        tk.*,
        CASE WHEN pg_input_is_valid(tk."Configuration", 'jsonb') THEN CAST(tk."Configuration" AS JSONB) END AS "Config"
    FROM __mj."vwTasks" tk
),
"StepJson" AS NOT MATERIALIZED (
    SELECT
        s.*,
        CASE WHEN pg_input_is_valid(s."OutputData", 'jsonb') THEN CAST(s."OutputData" AS JSONB) END AS "Output"
    FROM __mj."vwAIAgentRunSteps" s
),
"Tree" AS (
    -- ── Anchor: the run itself ────────────────────────────────────────────────────────────────
    SELECT
        CAST(r."ID" AS VARCHAR(50))                                       AS "NodeID",
        CAST(NULL AS VARCHAR(50))                                         AS "ParentNodeID",
        0                                                                 AS "Depth",
        0                                                                 AS "Sequence",
        CAST('Run' AS VARCHAR(20))                                        AS "NodeType",
        CAST(COALESCE(r."RunName", r."Agent", 'Agent Run') AS VARCHAR(500)) AS "Name",
        CAST(r."Status" AS VARCHAR(50))                                   AS "Status",
        r."StartedAt"                                                     AS "StartedAt",
        r."CompletedAt"                                                   AS "CompletedAt",
        CAST(r."TotalCost" AS DECIMAL(19, 8))                             AS "Cost",
        r."TotalTokensUsed"                                               AS "Tokens",
        r."TotalPromptTokensUsed"                                         AS "PromptTokens",
        r."TotalCompletionTokensUsed"                                     AS "CompletionTokens",
        CAST('MJ: AI Agent Runs' AS VARCHAR(100))                         AS "SourceEntity",
        CAST(NULL AS VARCHAR(50))                                         AS "PromptRunID",
        CAST(NULL AS VARCHAR(50))                                         AS "ActionLogID",
        CAST(NULL AS TEXT)                                                AS "InputPayload",
        CAST(NULL AS TEXT)                                                AS "OutputPayload",
        CAST(NULL AS TEXT)                                                AS "Iterations",
        CAST(NULL AS VARCHAR(50))                                         AS "SourceKind",
        r."__mj_CreatedAt"                                                AS "CreatedAt"
    FROM __mj."vwAIAgentRuns" r
    WHERE r."ID" = {{ agentRunID | sqlString }}

    UNION ALL

    -- ── Every recursive member, as one: PG allows the recursive reference once, in one SELECT ──
    -- Each branch reads the current node through `t` and keeps only the node kind it expands.
    SELECT c.*
    FROM "Tree" t
    CROSS JOIN LATERAL (
            -- ── A run's steps ─────────────────────────────────────────────────────────────────────────
            SELECT
                CAST(s."ID" AS VARCHAR(50)),
                t."NodeID",
                t."Depth" + 1,
                COALESCE(s."StepNumber", 0),
                CAST('Step' AS VARCHAR(20)),
                CAST(COALESCE(s."StepName", s."StepType", 'Step') AS VARCHAR(500)),
                CAST(s."Status" AS VARCHAR(50)),
                s."StartedAt",
                s."CompletedAt",
                CAST(NULL AS DECIMAL(19, 8)),
                CAST(NULL AS INT),
                CAST(NULL AS INT),
                CAST(NULL AS INT),
                CAST('MJ: AI Agent Run Steps' AS VARCHAR(100)),
                CAST(NULL AS VARCHAR(50)),
                CAST(NULL AS VARCHAR(50)),
                CAST(NULL AS TEXT),
                CAST(NULL AS TEXT),
                CAST(NULL AS TEXT),
                CAST(s."StepType" AS VARCHAR(50)),
                s."__mj_CreatedAt"
            FROM __mj."vwAIAgentRunSteps" s
            WHERE s."AgentRunID" = CAST(t."NodeID" AS UUID)
              AND t."NodeType" = 'Run'

            UNION ALL

            -- ── A task-graph step's graph ─────────────────────────────────────────────────────────────
            SELECT
                CAST(tk."ID" AS VARCHAR(50)),
                t."NodeID",
                t."Depth" + 1,
                0,
                CAST('TaskGraph' AS VARCHAR(20)),
                CAST(COALESCE(tk."Name", 'Workflow') AS VARCHAR(500)),
                CAST(tk."Status" AS VARCHAR(50)),
                tk."StartedAt",
                tk."CompletedAt",
                CAST(NULL AS DECIMAL(19, 8)),
                CAST(NULL AS INT),
                CAST(NULL AS INT),
                CAST(NULL AS INT),
                CAST('MJ: Tasks' AS VARCHAR(100)),
                CAST(NULL AS VARCHAR(50)),
                CAST(NULL AS VARCHAR(50)),
                CAST(NULL AS TEXT),
                CAST(NULL AS TEXT),
                CAST(NULL AS TEXT),
                CAST('TaskGraph' AS VARCHAR(50)),
                tk."__mj_CreatedAt"
            FROM "StepJson" s
            INNER JOIN __mj."vwTasks" tk
                ON CAST(tk."ID" AS TEXT) = LOWER(s."Output" ->> 'parentTaskID')
            WHERE s."ID" = CAST(t."NodeID" AS UUID)
              AND t."NodeType" = 'Step'

            UNION ALL

            -- ── The steps inside a graph ──────────────────────────────────────────────────────────────
            SELECT
                CAST(tk."ID" AS VARCHAR(50)),
                t."NodeID",
                t."Depth" + 1,
                CASE WHEN (tk."Config" ->> 'sequence') ~ '^-?[0-9]{1,9}$' THEN CAST(tk."Config" ->> 'sequence' AS INT) ELSE 0 END,
                CAST('Task' AS VARCHAR(20)),
                CAST(COALESCE(tk."Name", 'Step') AS VARCHAR(500)),
                CAST(tk."Status" AS VARCHAR(50)),
                tk."StartedAt",
                tk."CompletedAt",
                CAST(NULL AS DECIMAL(19, 8)),
                CAST(NULL AS INT),
                CAST(NULL AS INT),
                CAST(NULL AS INT),
                CAST('MJ: Tasks' AS VARCHAR(100)),
                CAST(tk."Config" -> 'runtime' ->> 'promptRunID' AS VARCHAR(50)),
                CAST(tk."Config" -> 'runtime' ->> 'actionLogID' AS VARCHAR(50)),
                COALESCE(
                    CASE WHEN jsonb_typeof(tk."Config" -> 'runtime' -> 'payloadAtStart') IN ('object', 'array')
                         THEN CAST(tk."Config" -> 'runtime' -> 'payloadAtStart' AS TEXT) END,
                    tk."InputPayload"
                ),
                tk."OutputPayload",
                CASE WHEN jsonb_typeof(tk."Config" -> 'runtime' -> 'iterations') IN ('object', 'array')
                     THEN CAST(tk."Config" -> 'runtime' -> 'iterations' AS TEXT) END,
                CAST(tk."StepType" AS VARCHAR(50)),
                tk."__mj_CreatedAt"
            FROM "TaskJson" tk
            WHERE tk."ParentID" = CAST(t."NodeID" AS UUID)
              AND t."NodeType" IN ('TaskGraph', 'Task')

            UNION ALL

            -- ── The run a SUB-AGENT step started ──────────────────────────────────────────────────────
            SELECT
                CAST(r."ID" AS VARCHAR(50)),
                t."NodeID",
                t."Depth" + 1,
                0,
                CAST('Run' AS VARCHAR(20)),
                CAST(COALESCE(r."RunName", r."Agent", 'Agent Run') AS VARCHAR(500)),
                CAST(r."Status" AS VARCHAR(50)),
                r."StartedAt",
                r."CompletedAt",
                CAST(r."TotalCost" AS DECIMAL(19, 8)),
                r."TotalTokensUsed",
                r."TotalPromptTokensUsed",
                r."TotalCompletionTokensUsed",
                CAST('MJ: AI Agent Runs' AS VARCHAR(100)),
                CAST(NULL AS VARCHAR(50)),
                CAST(NULL AS VARCHAR(50)),
                CAST(NULL AS TEXT),
                CAST(NULL AS TEXT),
                CAST(NULL AS TEXT),
                CAST(NULL AS VARCHAR(50)),
                r."__mj_CreatedAt"
            FROM __mj."vwAIAgentRunSteps" s
            INNER JOIN __mj."vwAIAgentRuns" r
                ON r."ID" = s."TargetLogID"
            WHERE s."ID" = CAST(t."NodeID" AS UUID)
              AND t."NodeType" = 'Step'
              AND s."StepType" = 'Sub-Agent'

            UNION ALL

            -- ── The run a task spawned ('Task' only, never 'TaskGraph': see the SQL Server file) ───────
            SELECT
                CAST(r."ID" AS VARCHAR(50)),
                t."NodeID",
                t."Depth" + 1,
                0,
                CAST('Run' AS VARCHAR(20)),
                CAST(COALESCE(r."RunName", r."Agent", 'Agent Run') AS VARCHAR(500)),
                CAST(r."Status" AS VARCHAR(50)),
                r."StartedAt",
                r."CompletedAt",
                CAST(r."TotalCost" AS DECIMAL(19, 8)),
                r."TotalTokensUsed",
                r."TotalPromptTokensUsed",
                r."TotalCompletionTokensUsed",
                CAST('MJ: AI Agent Runs' AS VARCHAR(100)),
                CAST(NULL AS VARCHAR(50)),
                CAST(NULL AS VARCHAR(50)),
                CAST(NULL AS TEXT),
                CAST(NULL AS TEXT),
                CAST(NULL AS TEXT),
                CAST(NULL AS VARCHAR(50)),
                r."__mj_CreatedAt"
            FROM __mj."vwTasks" tk
            INNER JOIN __mj."vwAIAgentRuns" r
                ON r."ID" = tk."AgentRunID"
            WHERE tk."ID" = CAST(t."NodeID" AS UUID)
              AND t."NodeType" = 'Task'
    ) c
    WHERE t."Depth" < {{ maxDepth | sqlNumber }}
)
SELECT
    t."NodeID",
    t."ParentNodeID",
    t."Depth",
    t."Sequence",
    t."NodeType",
    t."Name",
    t."Status",
    t."StartedAt",
    t."CompletedAt",
    CASE
        WHEN t."StartedAt" IS NOT NULL AND t."CompletedAt" IS NOT NULL
        THEN CAST(FLOOR(EXTRACT(EPOCH FROM (t."CompletedAt" - t."StartedAt")) * 1000) AS BIGINT)
        ELSE NULL
    END                                                               AS "DurationMs",
    COALESCE(t."Cost", pr."Cost")                                     AS "Cost",
    COALESCE(t."Tokens", pr."TokensUsed")                             AS "Tokens",
    COALESCE(t."PromptTokens", pr."TokensPrompt")                     AS "PromptTokens",
    COALESCE(t."CompletionTokens", pr."TokensCompletion")             AS "CompletionTokens",
    CASE
        WHEN pr."ID" IS NOT NULL THEN 'MJ: AI Prompt Runs'
        WHEN al."ID" IS NOT NULL THEN 'MJ: Action Execution Logs'
        ELSE t."SourceEntity"
    END                                                               AS "SourceEntity",
    t."SourceKind",
    CASE
        WHEN pr."ID" IS NOT NULL THEN CAST(pr."ID" AS VARCHAR(50))
        WHEN al."ID" IS NOT NULL THEN CAST(al."ID" AS VARCHAR(50))
        ELSE t."NodeID"
    END                                                               AS "SourceID",
    pr."Model"                                                        AS "Model",
    pr."Vendor"                                                       AS "Vendor",
    t."InputPayload"                                                  AS "InputPayload",
    t."OutputPayload"                                                 AS "OutputPayload",
    CAST(ltk."Config" -> 'forEach' ->> 'executionMode' AS VARCHAR(20)) AS "LoopMode",
    CAST(COALESCE(ltk."ActionID", al."ActionID") AS VARCHAR(50))      AS "ActionID",
    CAST(ltk."AgentID" AS VARCHAR(50))                                AS "AgentID",
    t."CreatedAt"                                                     AS "CreatedAt",
    CASE WHEN t."StartedAt" IS NULL THEN 1 ELSE 0 END                 AS "NotStarted"
FROM "Tree" t
LEFT JOIN __mj."vwAIPromptRuns" pr
    ON CAST(pr."ID" AS TEXT) = LOWER(t."PromptRunID")
LEFT JOIN __mj."vwActionExecutionLogs" al
    ON CAST(al."ID" AS TEXT) = LOWER(t."ActionLogID")
-- Only Task nodes carry step configuration; the predicate keeps a run or step id from matching a
-- Task by coincidence and reading a foreign row's settings.
LEFT JOIN "TaskJson" ltk
    ON CAST(ltk."ID" AS TEXT) = t."NodeID" AND t."NodeType" IN ('Task', 'TaskGraph')

UNION ALL

-- ── A loop step's individual passes (a pass is a leaf: see the SQL Server file) ───────────────
SELECT
    CAST(t."NodeID" || ':' || CAST(it."index" AS VARCHAR(10)) AS VARCHAR(50)) AS "NodeID",
    t."NodeID"                                                        AS "ParentNodeID",
    t."Depth" + 1                                                     AS "Depth",
    it."index"                                                        AS "Sequence",
    CAST('Step' AS VARCHAR(20))                                       AS "NodeType",
    CAST(CAST(it."index" + 1 AS VARCHAR(10))
         || COALESCE(': ' || ial."Action", ': ' || iar."Agent", ': ' || ipr."Prompt", '')
         AS VARCHAR(500))                                             AS "Name",
    CAST(CASE WHEN it."success" = true THEN 'Complete' ELSE 'Failed' END AS VARCHAR(50)) AS "Status",
    COALESCE(ipr."RunAt", iar."StartedAt", ial."StartedAt")           AS "StartedAt",
    COALESCE(ipr."CompletedAt", iar."CompletedAt", ial."EndedAt")     AS "CompletedAt",
    CASE
        WHEN COALESCE(ipr."RunAt", iar."StartedAt", ial."StartedAt") IS NOT NULL
         AND COALESCE(ipr."CompletedAt", iar."CompletedAt", ial."EndedAt") IS NOT NULL
        THEN CAST(FLOOR(EXTRACT(EPOCH FROM (
                COALESCE(ipr."CompletedAt", iar."CompletedAt", ial."EndedAt")
                - COALESCE(ipr."RunAt", iar."StartedAt", ial."StartedAt"))) * 1000) AS BIGINT)
        ELSE NULL
    END                                                               AS "DurationMs",
    COALESCE(ipr."Cost", iar."TotalCost")                             AS "Cost",
    COALESCE(ipr."TokensUsed", iar."TotalTokensUsed")                 AS "Tokens",
    COALESCE(ipr."TokensPrompt", iar."TotalPromptTokensUsed")         AS "PromptTokens",
    COALESCE(ipr."TokensCompletion", iar."TotalCompletionTokensUsed") AS "CompletionTokens",
    CAST(CASE
        WHEN ipr."ID" IS NOT NULL THEN 'MJ: AI Prompt Runs'
        WHEN iar."ID" IS NOT NULL THEN 'MJ: AI Agent Runs'
        WHEN ial."ID" IS NOT NULL THEN 'MJ: Action Execution Logs'
        ELSE 'MJ: Tasks'
    END AS VARCHAR(100))                                              AS "SourceEntity",
    CAST(CASE
        WHEN ipr."ID" IS NOT NULL THEN 'Prompt'
        WHEN iar."ID" IS NOT NULL THEN 'Sub-Agent'
        WHEN ial."ID" IS NOT NULL THEN 'Actions'
        ELSE NULL
    END AS VARCHAR(50))                                               AS "SourceKind",
    CAST(COALESCE(CAST(ipr."ID" AS VARCHAR(50)), CAST(iar."ID" AS VARCHAR(50)), CAST(ial."ID" AS VARCHAR(50)), t."NodeID") AS VARCHAR(50)) AS "SourceID",
    ipr."Model"                                                       AS "Model",
    ipr."Vendor"                                                      AS "Vendor",
    it."payloadAtStart"                                               AS "InputPayload",
    it."payloadAtEnd"                                                 AS "OutputPayload",
    CAST(NULL AS VARCHAR(20))                                         AS "LoopMode",
    CAST(ial."ActionID" AS VARCHAR(50))                               AS "ActionID",
    CAST(iar."AgentID" AS VARCHAR(50))                                AS "AgentID",
    t."CreatedAt"                                                     AS "CreatedAt",
    CASE WHEN COALESCE(ipr."RunAt", iar."StartedAt", ial."StartedAt") IS NULL THEN 1 ELSE 0 END AS "NotStarted"
FROM "Tree" t
CROSS JOIN LATERAL (
    SELECT
        CASE WHEN (e ->> 'index') ~ '^-?[0-9]{1,9}$' THEN CAST(e ->> 'index' AS INT) END AS "index",
        CAST(e ->> 'promptRunID' AS VARCHAR(50))                       AS "promptRunID",
        CAST(e ->> 'agentRunID' AS VARCHAR(50))                        AS "agentRunID",
        CAST(e ->> 'actionLogID' AS VARCHAR(50))                       AS "actionLogID",
        CASE WHEN jsonb_typeof(e -> 'success') = 'boolean' THEN CAST(e ->> 'success' AS BOOLEAN) END AS "success",
        CASE WHEN jsonb_typeof(e -> 'payloadAtStart') IN ('object', 'array') THEN CAST(e -> 'payloadAtStart' AS TEXT) END AS "payloadAtStart",
        CASE WHEN jsonb_typeof(e -> 'payloadAtEnd') IN ('object', 'array') THEN CAST(e -> 'payloadAtEnd' AS TEXT) END AS "payloadAtEnd"
    FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(CAST(t."Iterations" AS JSONB)) = 'array' THEN CAST(t."Iterations" AS JSONB) ELSE CAST('[]' AS JSONB) END
    ) AS e
) it
LEFT JOIN __mj."vwAIPromptRuns" ipr ON CAST(ipr."ID" AS TEXT) = LOWER(it."promptRunID")
LEFT JOIN __mj."vwAIAgentRuns"  iar ON CAST(iar."ID" AS TEXT) = LOWER(it."agentRunID")
LEFT JOIN __mj."vwActionExecutionLogs" ial ON CAST(ial."ID" AS TEXT) = LOWER(it."actionLogID")
WHERE t."Iterations" IS NOT NULL
ORDER BY
    "Depth",
    "Sequence",
    "NotStarted",
    "StartedAt",
    "CreatedAt",
    "NodeID"
