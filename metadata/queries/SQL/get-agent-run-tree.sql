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
  Each Run row reports TotalCost / TotalTokensUsed — its OWN spend, deliberately NOT
  TotalCostRollup. The rollup already includes descendants, so summing rollups across a tree
  double-counts every nested run. With own-cost, a total is an honest SUM over the returned rows.

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
        CAST('MJ: AI Agent Runs' AS NVARCHAR(100))           AS SourceEntity,
        CAST(NULL AS NVARCHAR(50))                           AS PromptRunID,
        -- What KIND of work this node is, in its own vocabulary: a run step's StepType
        -- ('Prompt', 'Actions', 'Sub-Agent', 'Validation', …) or a task's ('Agent', 'Action',
        -- 'ForEach', 'While', 'Human', …). Carried because every visual consumer colours and
        -- icons by kind — without it a renderer can only draw undifferentiated boxes, which is
        -- what forced the visualizations to keep reading raw step rows.
        CAST(NULL AS NVARCHAR(50))                           AS SourceKind
    FROM ${flyway:defaultSchema}.vwAIAgentRuns r
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
        CAST('MJ: AI Agent Run Steps' AS NVARCHAR(100)),
        CAST(NULL AS NVARCHAR(50)),
        CAST(s.StepType AS NVARCHAR(50))
    FROM Tree t
    INNER JOIN ${flyway:defaultSchema}.vwAIAgentRunSteps s
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
        CAST('MJ: Tasks' AS NVARCHAR(100)),
        CAST(NULL AS NVARCHAR(50)),
        CAST('TaskGraph' AS NVARCHAR(50))
    FROM Tree t
    INNER JOIN ${flyway:defaultSchema}.vwAIAgentRunSteps s
        ON s.ID = t.NodeID
    INNER JOIN ${flyway:defaultSchema}.vwTasks tk
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
        CAST('MJ: Tasks' AS NVARCHAR(100)),
        CAST(JSON_VALUE(tk.Configuration, '$.runtime.promptRunID') AS NVARCHAR(50)),
        CAST(tk.StepType AS NVARCHAR(50))
    FROM Tree t
    INNER JOIN ${flyway:defaultSchema}.vwTasks tk
        ON tk.ParentID = t.NodeID
    WHERE t.NodeType IN ('TaskGraph', 'Task')
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
        CAST('MJ: AI Agent Runs' AS NVARCHAR(100)),
        CAST(NULL AS NVARCHAR(50)),
        CAST(NULL AS NVARCHAR(50))
    FROM Tree t
    INNER JOIN ${flyway:defaultSchema}.vwTasks tk
        ON tk.ID = t.NodeID
    INNER JOIN ${flyway:defaultSchema}.vwAIAgentRuns r
        ON r.ID = tk.AgentRunID
    WHERE t.NodeType IN ('Task', 'TaskGraph')
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
    t.SourceEntity,
    t.SourceKind,
    t.NodeID                                                AS SourceID
FROM Tree t
LEFT JOIN ${flyway:defaultSchema}.vwAIPromptRuns pr
    ON pr.ID = t.PromptRunID
ORDER BY t.Depth, t.Sequence, t.StartedAt, t.NodeID
OPTION (MAXRECURSION 0);
