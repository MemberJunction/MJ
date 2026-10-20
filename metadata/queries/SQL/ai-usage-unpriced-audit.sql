-- Completed prompt runs that carry no cost, newest first, for an admin backfilling price tiers.
-- Live-only.
--
-- BOUNDED: an optional RunAt window (range-seekable on IX_AIPromptRun_RunAt) and a row cap
-- (maxRows, default 500). Ordered by the base RunAt column, which the same index serves in order,
-- rather than a derived UTC expression that forces a sort of every unpriced run in history.
SELECT TOP ({% if maxRows %}{{ maxRows | sqlNumber }}{% else %}500{% endif %})
    PromptRunID,
    AgentRunID,
    ParentPromptRunID,
    RunAt,
    RunAtUTC,
    PromptID,
    ModelID,
    VendorID,
    AgentID,
    ConfigurationID,
    UserID,
    ConversationID,
    PrimaryScopeEntityID,
    PrimaryScopeRecordID,
    RunType,
    SourceKind,
    Status,
    Success,
    TokensPrompt,
    TokensCompletion,
    TokensCacheRead,
    TokensCacheWrite,
    InputUnitsUsed,
    OutputUnitsUsed,
    ExecutionTimeMS,
    IsUnmeasured,
    CASE
        WHEN IsUnmeasured = 1 THEN 'Unmeasured run: no token or unit counts recorded'
        ELSE 'Missing pricing: no price tier found for model at run time'
    END AS UnpricedReason
FROM [__mj].vwAIUsageFacts
WHERE IsCompleted = 1
  AND IsPriced = 0
  -- A parallel parent has no own cost BY DESIGN (the arms carry it), so it is not "unpriced".
  -- Without this it lands in an admin-facing "needs a price tier" list and sends someone hunting
  -- for a tier that was never missing.
  AND IsParallelParent = 0
  {% if start %}
  AND RunAt >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND RunAt < {{ end | sqlDate }}
  {% endif %}
ORDER BY
    RunAt DESC
