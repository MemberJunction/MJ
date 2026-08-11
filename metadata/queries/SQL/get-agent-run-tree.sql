/*
  GetAgentRunTree — one row per node of everything an agent run caused.

  WHY THIS EXISTS
  ---------------
  A run's shape used to be assembled by the client one level at a time: load the run, load its
  steps, notice a step is a task graph, load the graph's tasks, notice a task spawned an agent run,
  load that run's steps... Each level is a round trip, the count depends on how deep the work went,
  and nothing could ask "what did this run cost in total" without walking the whole thing first.

  This returns the entire structure in a single call — the run, its steps, any task graphs those
  steps submitted, the tasks in them, and the runs those tasks spawned, recursively.

  ONE ROW PER NODE, NOT ONE ROW PER PATH
  --------------------------------------
  Every row is a node with a ParentNodeID; the caller assembles the tree in memory
  (BuildAgentRunTree in @memberjunction/ai-core-plus). Widening the row per level would fix the
  depth at whatever the widest query allowed, which is the exact limitation this replaces.

  COST IS PER-NODE AND NEVER A ROLLUP
  -----------------------------------
  Each Run row reports TotalCost / TotalTokensUsed (and the prompt/completion split) — its OWN
  spend, deliberately NOT TotalCostRollup. The rollup already includes descendants, so summing
  rollups across a tree double-counts every nested run. With own-cost, a total is an honest SUM
  over the returned rows.

  🚨 DO NOT "improve" this to read the …Rollup columns. Since v6.1 the settlement-time cost rollup
  on AIAgentRun is WRITTEN FROM this query (TaskGraphDispatcher.rollUpCostToSubmittingRun sums the
  tree). Reading a rollup here would make the column an input to its own computation: every
  re-settlement would fold the previous total back in and inflate it, compounding, with no error and
  no visible symptom until someone questions a bill. Own-cost is what keeps the write-back idempotent.

  Prompt steps get their cost by joining through Configuration.runtime.promptRunID: a Prompt task
  has no agent run, so without that join its spend is invisible and a total silently under-reports.

  DEPTH IS BOUNDED INSIDE THE RECURSIVE TERM
  ------------------------------------------
  `Depth < {{ maxDepth }}` appears in every recursive member, and OPTION (MAXRECURSION 0) turns the
  engine's own limit OFF so that predicate is the only bound. That ordering is deliberate: T-SQL's
  MAXRECURSION ERRORS OUT when hit, losing the partial answer, and it does not exist in PostgreSQL
  at all. A predicate degrades instead — the tree comes back truncated and the caller can detect it
  (any row at MaxDepth means there may be more below). A cycle, which a self-referencing workflow
  can create, therefore terminates rather than running away.

  PARAMETERS
  ----------
    {{ agentRunID }} — the run at the top of the tree
    {{ maxDepth }}   — hard depth cap (MAX_AGENT_RUN_TREE_DEPTH, 100)
*/
WITH Tree AS (
    -- ── Anchor: the run itself ────────────────────────────────────────────────────────────────
    SELECT
        CAST(r.ID AS NVARCHAR(50))                          AS NodeID,
        CAST(NULL AS NVARCHAR(50))                          AS ParentNodeID,
        0                                                   AS Depth,
        0                                                   AS Sequence,
        CAST('Run' AS NVARCHAR(20))                          AS NodeType,
        CAST(COALESCE(r.RunName, r.Agent, 'Agent Run') AS NVARCHAR(500)) AS Name,
        CAST(r.Status AS NVARCHAR(50))                       AS Status,
        r.StartedAt                                          AS StartedAt,
        r.CompletedAt                                        AS CompletedAt,
        r.TotalCost                                          AS Cost,
        r.TotalTokensUsed                                    AS Tokens,
        r.TotalPromptTokensUsed                              AS PromptTokens,
        r.TotalCompletionTokensUsed                          AS CompletionTokens,
        CAST('MJ: AI Agent Runs' AS NVARCHAR(100))           AS SourceEntity,
        CAST(NULL AS NVARCHAR(50))                           AS PromptRunID,
        -- A loop step's per-pass trace, carried through the recursion and expanded into nodes in a
        -- second SELECT below (APPLY is illegal inside a recursive member).
        CAST(NULL AS NVARCHAR(MAX))                          AS Iterations,
        -- What KIND of work this node is, in its own vocabulary: a run step's StepType
        -- ('Prompt', 'Actions', 'Sub-Agent', 'Validation', …) or a task's ('Agent', 'Action',
        -- 'ForEach', 'While', 'Human', …). Carried because every visual consumer colours and
        -- icons by kind — without it a renderer can only draw undifferentiated boxes, which is
        -- what forced the visualizations to keep reading raw step rows.
        CAST(NULL AS NVARCHAR(50))                           AS SourceKind
    FROM [__mj].[vwAIAgentRuns] r
    WHERE r.ID = '{{ agentRunID }}'

    UNION ALL

    -- ── A run's steps ─────────────────────────────────────────────────────────────────────────
    SELECT
        CAST(s.ID AS NVARCHAR(50)),
        t.NodeID,
        t.Depth + 1,
        ISNULL(s.StepNumber, 0),
        CAST('Step' AS NVARCHAR(20)),
        CAST(COALESCE(s.StepName, s.StepType, 'Step') AS NVARCHAR(500)),
        CAST(s.Status AS NVARCHAR(50)),
        s.StartedAt,
        s.CompletedAt,
        -- A step has no cost of its own; its spend belongs to the run or the prompt underneath it.
        -- Reporting 0 here rather than NULL would make an unpriced step indistinguishable from a
        -- free one.
        CAST(NULL AS DECIMAL(18, 6)),
        CAST(NULL AS INT),
        CAST(NULL AS INT),
        CAST(NULL AS INT),
        CAST('MJ: AI Agent Run Steps' AS NVARCHAR(100)),
        CAST(NULL AS NVARCHAR(50)),
        CAST(NULL AS NVARCHAR(MAX)),
        CAST(s.StepType AS NVARCHAR(50))
    FROM Tree t
    INNER JOIN [__mj].[vwAIAgentRunSteps] s
        ON s.AgentRunID = t.NodeID
    WHERE t.NodeType = 'Run'
      AND t.Depth < {{ maxDepth }}

    UNION ALL

    -- ── A task-graph step's graph ─────────────────────────────────────────────────────────────
    -- The link is the parent task id the step recorded when it submitted the graph. This is the
    -- seam where a run stops being a run and becomes durable work that outlives it.
    SELECT
        CAST(tk.ID AS NVARCHAR(50)),
        t.NodeID,
        t.Depth + 1,
        0,
        CAST('TaskGraph' AS NVARCHAR(20)),
        CAST(COALESCE(tk.Name, 'Workflow') AS NVARCHAR(500)),
        CAST(tk.Status AS NVARCHAR(50)),
        tk.StartedAt,
        tk.CompletedAt,
        CAST(NULL AS DECIMAL(18, 6)),
        CAST(NULL AS INT),
        CAST(NULL AS INT),
        CAST(NULL AS INT),
        CAST('MJ: Tasks' AS NVARCHAR(100)),
        CAST(NULL AS NVARCHAR(50)),
        CAST(NULL AS NVARCHAR(MAX)),
        CAST('TaskGraph' AS NVARCHAR(50))
    FROM Tree t
    INNER JOIN [__mj].[vwAIAgentRunSteps] s
        ON s.ID = t.NodeID
    INNER JOIN [__mj].[vwTasks] tk
        ON tk.ID = JSON_VALUE(s.OutputData, '$.parentTaskID')
    WHERE t.NodeType = 'Step'
      AND t.Depth < {{ maxDepth }}

    UNION ALL

    -- ── The steps inside a graph ──────────────────────────────────────────────────────────────
    SELECT
        CAST(tk.ID AS NVARCHAR(50)),
        t.NodeID,
        t.Depth + 1,
        0,
        CAST('Task' AS NVARCHAR(20)),
        CAST(COALESCE(tk.Name, 'Step') AS NVARCHAR(500)),
        CAST(tk.Status AS NVARCHAR(50)),
        tk.StartedAt,
        tk.CompletedAt,
        -- Cost is resolved OUTSIDE the recursion. SQL Server forbids an outer join in a recursive
        -- member, and the prompt run must be an outer join because most tasks are not prompts. So
        -- the id is carried here and joined once in the final SELECT.
        CAST(NULL AS DECIMAL(18, 6)),
        CAST(NULL AS INT),
        CAST(NULL AS INT),
        CAST(NULL AS INT),
        CAST('MJ: Tasks' AS NVARCHAR(100)),
        CAST(JSON_VALUE(tk.Configuration, '$.runtime.promptRunID') AS NVARCHAR(50)),
        -- JSON_QUERY, not JSON_VALUE: this is an ARRAY, and JSON_VALUE returns NULL for one.
        CAST(JSON_QUERY(tk.Configuration, '$.runtime.iterations') AS NVARCHAR(MAX)),
        CAST(tk.StepType AS NVARCHAR(50))
    FROM Tree t
    INNER JOIN [__mj].[vwTasks] tk
        ON tk.ParentID = t.NodeID
    WHERE t.NodeType IN ('TaskGraph', 'Task')
      AND t.Depth < {{ maxDepth }}

    UNION ALL

    -- ── The run a SUB-AGENT step started ──────────────────────────────────────────────────────
    -- The other way a run nests, and the common one: an agent calling a sub-agent directly, with no
    -- task graph involved. Without this member such a run appears in the tree as a single childless
    -- Step — which is why a directly-invoked sub-agent rendered as an empty line in the run
    -- visualizations while its steps sat in the database untouched.
    --
    -- Linked through TargetLogID, which is where a Sub-Agent step records the run it started.
    SELECT
        CAST(r.ID AS NVARCHAR(50)),
        t.NodeID,
        t.Depth + 1,
        0,
        CAST('Run' AS NVARCHAR(20)),
        CAST(COALESCE(r.RunName, r.Agent, 'Agent Run') AS NVARCHAR(500)),
        CAST(r.Status AS NVARCHAR(50)),
        r.StartedAt,
        r.CompletedAt,
        r.TotalCost,
        r.TotalTokensUsed,
        r.TotalPromptTokensUsed,
        r.TotalCompletionTokensUsed,
        CAST('MJ: AI Agent Runs' AS NVARCHAR(100)),
        CAST(NULL AS NVARCHAR(50)),
        CAST(NULL AS NVARCHAR(MAX)),
        CAST(NULL AS NVARCHAR(50))
    FROM Tree t
    INNER JOIN [__mj].[vwAIAgentRunSteps] s
        ON s.ID = t.NodeID
    INNER JOIN [__mj].[vwAIAgentRuns] r
        ON r.ID = s.TargetLogID
    WHERE t.NodeType = 'Step'
      AND s.StepType = 'Sub-Agent'
      AND t.Depth < {{ maxDepth }}

    UNION ALL

    -- ── The run a task spawned ────────────────────────────────────────────────────────────────
    -- This is what makes the structure genuinely recursive rather than three fixed levels: a task
    -- can run an agent, that agent can submit another graph, and so on.
    SELECT
        CAST(r.ID AS NVARCHAR(50)),
        t.NodeID,
        t.Depth + 1,
        0,
        CAST('Run' AS NVARCHAR(20)),
        CAST(COALESCE(r.RunName, r.Agent, 'Agent Run') AS NVARCHAR(500)),
        CAST(r.Status AS NVARCHAR(50)),
        r.StartedAt,
        r.CompletedAt,
        r.TotalCost,
        r.TotalTokensUsed,
        r.TotalPromptTokensUsed,
        r.TotalCompletionTokensUsed,
        CAST('MJ: AI Agent Runs' AS NVARCHAR(100)),
        CAST(NULL AS NVARCHAR(50)),
        CAST(NULL AS NVARCHAR(MAX)),
        CAST(NULL AS NVARCHAR(50))
    FROM Tree t
    INNER JOIN [__mj].[vwTasks] tk
        ON tk.ID = t.NodeID
    INNER JOIN [__mj].[vwAIAgentRuns] r
        ON r.ID = tk.AgentRunID
    -- 'Task' ONLY — never 'TaskGraph'. A child task's AgentRunID is the run it STARTED, which is
    -- downward. The graph's own parent row uses the same column for the opposite direction: the run
    -- that SUBMITTED it. Following that link descends into the run we came from, which re-enters
    -- this graph, forever — a cycle bounded only by the depth cap, producing a tree a hundred
    -- levels deep that is the same five nodes repeated.
    WHERE t.NodeType = 'Task'
      AND t.Depth < {{ maxDepth }}
)
SELECT
    t.NodeID,
    t.ParentNodeID,
    t.Depth,
    t.Sequence,
    t.NodeType,
    t.Name,
    t.Status,
    t.StartedAt,
    t.CompletedAt,
    -- Computed here rather than in the client so a caller that only wants a duration does not have
    -- to parse two timestamps. NULL while a node is still running: an in-flight step has no
    -- duration yet, and reporting elapsed-so-far as a duration would read as a finished one.
    CASE
        WHEN t.StartedAt IS NOT NULL AND t.CompletedAt IS NOT NULL
        THEN DATEDIFF(MILLISECOND, t.StartedAt, t.CompletedAt)
        ELSE NULL
    END                                                     AS DurationMs,
    -- A Prompt task has no cost of its own on the Task row; it lives on the prompt run the step
    -- produced. COALESCE rather than a second column so every node reports cost the same way,
    -- whichever kind it is.
    COALESCE(t.Cost, pr.Cost)                               AS Cost,
    COALESCE(t.Tokens, pr.TokensUsed)                       AS Tokens,
    -- The prompt/completion split, on the SAME basis as Tokens. Carried rather than left to the
    -- caller because the settlement-time cost rollup writes four columns on AIAgentRun, and a tree
    -- that answered only two of them would force the other two back onto a second, differently-based
    -- computation — which is exactly the mixed-basis arithmetic this query exists to replace.
    COALESCE(t.PromptTokens, pr.TokensPrompt)               AS PromptTokens,
    COALESCE(t.CompletionTokens, pr.TokensCompletion)       AS CompletionTokens,
    -- Where clicking this node should GO. For a Prompt task that is the prompt run, not the Task
    -- row: the run carries the messages, the model, the tokens and the result, which is the whole
    -- reason someone clicks a prompt step. Pointing at the Task instead showed a row whose only
    -- interesting content was a foreign key to the thing they wanted. Every other node keeps its own
    -- record, and a prompt task whose run is missing falls back to its Task rather than to nothing.
    CASE WHEN pr.ID IS NOT NULL THEN 'MJ: AI Prompt Runs' ELSE t.SourceEntity END AS SourceEntity,
    t.SourceKind,
    CASE WHEN pr.ID IS NOT NULL THEN CAST(pr.ID AS NVARCHAR(50)) ELSE t.NodeID END AS SourceID
FROM Tree t
LEFT JOIN [__mj].[vwAIPromptRuns] pr
    ON pr.ID = t.PromptRunID

UNION ALL

-- ── A loop step's individual passes ───────────────────────────────────────────────────────────
-- Emitted OUTSIDE the recursion on purpose: an iteration is always a leaf (a pass cannot itself
-- contain the loop), and T-SQL forbids APPLY inside a recursive member, so reading the JSON array
-- there is not an option. Producing them here costs one pass over the tasks already returned.
--
-- Without this a loop is a single childless node. The six recursive members reach nested work
-- through a run's steps, a task-graph step's graph, a graph's tasks, a Sub-Agent step's run, and a
-- task's own AgentRunID — a loop iteration is none of them, and AIAgentRun.ParentRunID records
-- parentage without being a link this query follows. So a While that spent real money over three
-- passes reported no children and no cost: the timeline had nothing to expand, and the settlement
-- rollup under-counted every loop-bearing workflow.
--
-- 🚧 KNOWN BOUNDARY: a pass is a LEAF. Being emitted after the CTE, it cannot recurse — so if a
-- loop body is a sub-agent that dispatches a graph of its OWN, this counts that agent run's own
-- spend and stops. The nested graph's tasks are not reached, and the rollup under-reports by
-- exactly that subtree.
--
-- Deliberately not "fixed" by adding a `r.ParentRunID = t.NodeID` recursive member: a sub-agent run
-- is already reachable through its Sub-Agent step's TargetLogID, so a parentage member would return
-- the same run twice and the SUM would double-count it — reintroducing precisely the compounding
-- this file's header warns about, in exchange for a subtree that is rare today. Nor by refusing
-- graph-capable agents as loop bodies at submission, which would ban a legitimate composition to
-- protect a number.
--
-- The honest fix is to make an iteration's run a first-class node the recursion can descend from,
-- which needs the pass to exist as a row rather than a JSON entry. Until then this limit is stated
-- rather than hidden, because a total that is quietly short is the failure mode this whole area has
-- been fixing.
SELECT
    CAST(t.NodeID + ':' + CAST(it.[index] AS NVARCHAR(10)) AS NVARCHAR(50)) AS NodeID,
    t.NodeID                                                AS ParentNodeID,
    t.Depth + 1                                             AS Depth,
    it.[index]                                              AS Sequence,
    CAST('Step' AS NVARCHAR(20))                            AS NodeType,
    CAST('Pass ' + CAST(it.[index] + 1 AS NVARCHAR(10)) AS NVARCHAR(500)) AS Name,
    CAST(CASE WHEN it.success = 1 THEN 'Complete' ELSE 'Failed' END AS NVARCHAR(50)) AS Status,
    ipr.RunAt                                               AS StartedAt,
    ipr.CompletedAt                                         AS CompletedAt,
    CASE
        WHEN ipr.RunAt IS NOT NULL AND ipr.CompletedAt IS NOT NULL
        THEN DATEDIFF(MILLISECOND, ipr.RunAt, ipr.CompletedAt)
        ELSE NULL
    END                                                     AS DurationMs,
    -- Own cost of whichever run the pass produced. A pass has exactly one of the two.
    COALESCE(ipr.Cost, iar.TotalCost)                       AS Cost,
    COALESCE(ipr.TokensUsed, iar.TotalTokensUsed)           AS Tokens,
    COALESCE(ipr.TokensPrompt, iar.TotalPromptTokensUsed)   AS PromptTokens,
    COALESCE(ipr.TokensCompletion, iar.TotalCompletionTokensUsed) AS CompletionTokens,
    CAST(CASE WHEN ipr.ID IS NOT NULL THEN 'MJ: AI Prompt Runs' ELSE 'MJ: AI Agent Runs' END AS NVARCHAR(100)) AS SourceEntity,
    CAST(CASE WHEN ipr.ID IS NOT NULL THEN 'Prompt' ELSE 'Sub-Agent' END AS NVARCHAR(50)) AS SourceKind,
    CAST(COALESCE(CAST(ipr.ID AS NVARCHAR(50)), CAST(iar.ID AS NVARCHAR(50)), t.NodeID) AS NVARCHAR(50)) AS SourceID
FROM Tree t
CROSS APPLY OPENJSON(t.Iterations)
    WITH (
        [index]      INT            '$.index',
        promptRunID  NVARCHAR(50)   '$.promptRunID',
        agentRunID   NVARCHAR(50)   '$.agentRunID',
        success      BIT            '$.success'
    ) AS it
LEFT JOIN [__mj].[vwAIPromptRuns] ipr ON ipr.ID = it.promptRunID
LEFT JOIN [__mj].[vwAIAgentRuns]  iar ON iar.ID = it.agentRunID
WHERE t.Iterations IS NOT NULL

ORDER BY Depth, Sequence, StartedAt, NodeID
OPTION (MAXRECURSION 0);
