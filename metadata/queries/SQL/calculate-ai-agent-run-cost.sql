-- Calculate AI Agent Run Cost with Recursive Sub-Agent Hierarchy
WITH AgentRunHierarchy AS (
  -- Base case: Start with the specified agent run
  SELECT ID, AgentID, ParentRunID, 1 as Level
  FROM [__mj].vwAIAgentRuns
  WHERE ID = {{ AIAgentRunID | sqlString }} -- Replace with the actual Agent Run ID parameter. This is a UUID.
  
  UNION ALL
  
  -- Recursive case: Get all child agent runs
  SELECT ar.ID, ar.AgentID, ar.ParentRunID, arh.Level + 1
  FROM [__mj].vwAIAgentRuns ar
  INNER JOIN AgentRunHierarchy arh ON ar.ParentRunID = arh.ID
  WHERE arh.Level < 20  -- Prevent infinite recursion
),
PromptRunCosts AS (
  -- Get all prompt runs for the agent run hierarchy
  SELECT 
    pr.ID as PromptRunID, 
    pr.TotalCost,
    pr.TokensPrompt,
    pr.TokensCompletion,
    ars.AgentRunID
  FROM [__mj].vwAIAgentRunSteps ars
  INNER JOIN AgentRunHierarchy arh ON ars.AgentRunID = arh.ID
  INNER JOIN [__mj].vwAIPromptRuns pr ON ars.TargetLogID = pr.ID
  WHERE ars.StepType = 'Prompt'
)
SELECT 
  {{ AIAgentRunID | sqlString }} AS AgentRunID,
  COALESCE(SUM(prc.TotalCost), 0) AS TotalCost,
  COUNT(prc.PromptRunID) AS TotalPrompts,
  COALESCE(SUM(prc.TokensPrompt), 0) AS TotalTokensInput,
  COALESCE(SUM(prc.TokensCompletion), 0) AS TotalTokensOutput,
  COALESCE(SUM(prc.TokensPrompt), 0) + COALESCE(SUM(prc.TokensCompletion), 0) AS TotalTokens
FROM PromptRunCosts prc