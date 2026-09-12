-- PostgreSQL variant: Calculate AI Agent Run Cost with Recursive Sub-Agent Hierarchy
-- Mirrors calculate-ai-agent-run-cost.sql for PG. Differences:
--   * Schema/view references use double-quoted identifiers ("vwAIAgentRuns" etc.)
--     because PG folds unquoted PascalCase to lowercase and the actual views are
--     case-preserved.
--   * Column references inside CTE bodies and SELECT lists are also double-quoted
--     for the same reason — bare "f.OwnCost" would fold to "f.owncost".
--   * `WITH` → `WITH RECURSIVE` because the AgentRunHierarchy CTE self-references
--     itself in the UNION ALL recursive case. PG requires RECURSIVE on the WITH
--     keyword whenever any CTE in the list is recursive (T-SQL doesn't need it).
WITH RECURSIVE "AgentRunHierarchy" AS (
  -- Base case: Start with the specified agent run
  SELECT "ID", "AgentID", "ParentRunID", 1 AS "Level"
  FROM __mj."vwAIAgentRuns"
  WHERE "ID" = {{ AIAgentRunID | sqlString }} -- Replace with the actual Agent Run ID parameter. This is a UUID.

  UNION ALL

  -- Recursive case: Get all child agent runs
  SELECT ar."ID", ar."AgentID", ar."ParentRunID", arh."Level" + 1
  FROM __mj."vwAIAgentRuns" ar
  INNER JOIN "AgentRunHierarchy" arh ON ar."ParentRunID" = arh."ID"
  WHERE arh."Level" < 20  -- Prevent infinite recursion
)
SELECT
  {{ AIAgentRunID | sqlString }} AS "AgentRunID",
  SUM(CASE WHEN f."IsPriced" = 1 AND f."IsParallelParent" = 0 THEN f."OwnCost" END) AS "TotalCost",
  COUNT(f."PromptRunID") AS "TotalPrompts",
  SUM(f."TokensPrompt") AS "TotalTokensInput",
  SUM(f."TokensCompletion") AS "TotalTokensOutput",
  SUM(f."TokensPrompt") + SUM(f."TokensCompletion") AS "TotalTokens"
FROM __mj."vwAIUsageFacts" f
INNER JOIN "AgentRunHierarchy" arh ON f."AgentRunID" = arh."ID"
WHERE f."IsCompleted" = 1
