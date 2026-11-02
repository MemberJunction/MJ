-- PostgreSQL variant: completed prompt runs that carry no cost, newest first. Live-only.
-- Mirrors ai-usage-unpriced-audit.sql. Differences:
--   * `[__mj].vwAIUsageFacts` → `__mj."vwAIUsageFacts"`; column references double-quoted, since PG folds
--     unquoted names to lower case.
--   * `SELECT TOP (n)` → `LIMIT n`.
SELECT
    "PromptRunID",
    "AgentRunID",
    "ParentPromptRunID",
    "RunAt",
    "RunAtUTC",
    "PromptID",
    "ModelID",
    "VendorID",
    "AgentID",
    "ConfigurationID",
    "UserID",
    "ConversationID",
    "PrimaryScopeEntityID",
    "PrimaryScopeRecordID",
    "RunType",
    "SourceKind",
    "Status",
    "Success",
    "TokensPrompt",
    "TokensCompletion",
    "TokensCacheRead",
    "TokensCacheWrite",
    "InputUnitsUsed",
    "OutputUnitsUsed",
    "ExecutionTimeMS",
    "IsUnmeasured",
    CASE
        WHEN "IsUnmeasured" = 1 THEN 'Unmeasured run: no token or unit counts recorded'
        ELSE 'Missing pricing: no price tier found for model at run time'
    END AS "UnpricedReason"
FROM __mj."vwAIUsageFacts"
WHERE "IsCompleted" = 1
  AND "IsPriced" = 0
  -- A parallel parent has no own cost BY DESIGN (the arms carry it), so it is not "unpriced".
  AND "IsParallelParent" = 0
  {% if start %}
  AND "RunAt" >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND "RunAt" < {{ end | sqlDate }}
  {% endif %}
ORDER BY
    "RunAt" DESC
LIMIT {% if maxRows %}{{ maxRows | sqlNumber }}{% else %}500{% endif %}
