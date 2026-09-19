#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - Execution Trace & Diagnostic Tool
# Inspects recent agent runs, step traces, and action execution errors directly
# from the local MemberJunction database.
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Source environment variables if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

DB_PASSWORD="${DB_PASSWORD:-TestPassword123!}"

AGENT_FILTER="$1"

echo "========================================================================"
echo " Recent MemberJunction AI Agent Runs & Step Traces"
echo "========================================================================"

SQL_QUERY="
SET NOCOUNT ON;

PRINT '=== [1] LATEST AGENT RUN ===';
SELECT TOP 3 
    CAST(ID AS VARCHAR(36)) AS RunID,
    CAST(AgentName AS VARCHAR(40)) AS AgentName,
    CAST(Status AS VARCHAR(15)) AS Status,
    CAST(TotalTokens AS VARCHAR(10)) AS Tokens,
    CAST(DurationSeconds AS VARCHAR(10)) AS DurationSec,
    CAST(ErrorMessage AS VARCHAR(120)) AS ErrorMessage
FROM [__mj].[vwAIAgentRuns]
ORDER BY CreatedAt DESC;

PRINT '';
PRINT '=== [2] STEP EXECUTION TRACES (Latest Run) ===';
DECLARE @LatestRunID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [__mj].[vwAIAgentRuns] ORDER BY CreatedAt DESC);

IF @LatestRunID IS NOT NULL
BEGIN
    SELECT 
        StepNumber,
        CAST(StepType AS VARCHAR(20)) AS StepType,
        CAST(COALESCE(ActionName, 'N/A') AS VARCHAR(30)) AS ActionOrSubAgent,
        CAST(Status AS VARCHAR(15)) AS Status,
        SUBSTRING(COALESCE(PromptText, ''), 1, 200) AS PromptSnippet,
        SUBSTRING(COALESCE(ResponseText, ''), 1, 200) AS ResponseSnippet,
        CAST(COALESCE(ErrorMessage, '') AS VARCHAR(100)) AS StepError
    FROM [__mj].[vwAIAgentRunSteps]
    WHERE AgentRunID = @LatestRunID
    ORDER BY StepNumber ASC;
END

PRINT '';
PRINT '=== [3] RECENT ACTION EXECUTION ERRORS ===';
SELECT TOP 3
    CAST(ActionName AS VARCHAR(35)) AS ActionName,
    CAST(Status AS VARCHAR(15)) AS Status,
    CAST(ErrorMessage AS VARCHAR(150)) AS ErrorMessage
FROM [__mj].[vwActionExecutionLogs]
WHERE Status = 'Failed'
ORDER BY CreatedAt DESC;
"

docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$DB_PASSWORD" -d MemberJunction -C -No \
  -Q "$SQL_QUERY"
