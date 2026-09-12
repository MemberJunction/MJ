-- Calculate AI Agent Run Cost with Recursive Sub-Agent Hierarchy
WITH AgentRunHierarchy AS (
  -- Base case: Start with the specified agent run
  SELECT ID, AgentID, ParentRunID, 1 as Level
  FROM [__mj].vwAIAgentRuns
  WHERE ID = TRY_CONVERT(uniqueidentifier, {{ AIAgentRunID | sqlString }}) -- Replace with the actual Agent Run ID parameter. This is a UUID.
  
  UNION ALL
  
  -- Recursive case: Get all child agent runs
  SELECT ar.ID, ar.AgentID, ar.ParentRunID, arh.Level + 1
  FROM [__mj].vwAIAgentRuns ar
  INNER JOIN AgentRunHierarchy arh ON ar.ParentRunID = arh.ID
  WHERE arh.Level < 20  -- Prevent infinite recursion
)
SELECT 
  {{ AIAgentRunID | sqlString }} AS AgentRunID,
  SUM(CASE WHEN f.IsPriced = 1 AND f.IsParallelParent = 0 THEN f.OwnCost END) AS TotalCost,
  SUM(CASE WHEN f.IsParallelParent = 0 THEN 1 ELSE 0 END) AS TotalPrompts,
  SUM(f.TokensPrompt) AS TotalTokensInput,
  SUM(f.TokensCompletion) AS TotalTokensOutput,
  SUM(f.TokensPrompt) + SUM(f.TokensCompletion) AS TotalTokens
FROM [__mj].vwAIUsageFacts f
INNER JOIN AgentRunHierarchy arh ON f.AgentRunID = arh.ID
WHERE f.IsCompleted = 1
