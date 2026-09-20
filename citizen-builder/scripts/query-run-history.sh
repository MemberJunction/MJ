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

if [ -n "$AGENT_FILTER" ]; then
  SQL_FILTER_VAR="DECLARE @AgentFilter NVARCHAR(100) = '${AGENT_FILTER//\'/\'\'}';"
else
  SQL_FILTER_VAR="DECLARE @AgentFilter NVARCHAR(100) = NULL;"
fi

SQL_QUERY="
SET NOCOUNT ON;
${SQL_FILTER_VAR}

PRINT '=== [1] AGENT RUNS ===';
SELECT TOP 5 
    CAST(ID AS VARCHAR(36)) AS RunID,
    CAST(Agent AS VARCHAR(40)) AS AgentName,
    CAST(Status AS VARCHAR(15)) AS Status,
    Success,
    CAST(TotalTokensUsed AS VARCHAR(10)) AS Tokens,
    CAST(DATEDIFF(second, StartedAt, CompletedAt) AS VARCHAR(10)) AS DurationSec,
    CAST(COALESCE(ErrorMessage, '') AS VARCHAR(120)) AS ErrorMessage
FROM [__mj].[vwAIAgentRuns]
WHERE (@AgentFilter IS NULL OR Agent LIKE '%' + @AgentFilter + '%')
ORDER BY __mj_CreatedAt DESC;

PRINT '';
PRINT '=== [2] STEP EXECUTION TRACES ===';
DECLARE @TargetRunID UNIQUEIDENTIFIER = (
    SELECT TOP 1 ID FROM [__mj].[vwAIAgentRuns] 
    WHERE (@AgentFilter IS NULL OR Agent LIKE '%' + @AgentFilter + '%')
    ORDER BY __mj_CreatedAt DESC
);

IF @TargetRunID IS NOT NULL
BEGIN
    SELECT 
        StepNumber,
        CAST(StepType AS VARCHAR(20)) AS StepType,
        CAST(COALESCE(StepName, 'N/A') AS VARCHAR(45)) AS StepName,
        CAST(Status AS VARCHAR(15)) AS Status,
        Success,
        SUBSTRING(COALESCE(InputData, ''), 1, 80) AS InputSnippet,
        SUBSTRING(COALESCE(OutputData, ''), 1, 100) AS OutputSnippet,
        CAST(COALESCE(ErrorMessage, '') AS VARCHAR(100)) AS StepError
    FROM [__mj].[vwAIAgentRunSteps]
    WHERE AgentRunID = @TargetRunID
    ORDER BY StepNumber ASC;
END

PRINT '';
PRINT '=== [3] RECENT ACTION EXECUTION ERRORS ===';
SELECT TOP 5
    CAST(Action AS VARCHAR(35)) AS ActionName,
    CAST(ResultCode AS VARCHAR(15)) AS ResultCode,
    CAST(COALESCE(Message, '') AS VARCHAR(150)) AS ErrorMessage
FROM [__mj].[vwActionExecutionLogs]
WHERE ResultCode <> 'Success'
ORDER BY __mj_CreatedAt DESC;
"

docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$DB_PASSWORD" -d MemberJunction -C -No \
  -Q "$SQL_QUERY"
