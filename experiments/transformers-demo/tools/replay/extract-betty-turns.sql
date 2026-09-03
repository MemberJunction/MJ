-- Every top-level Betty agent run with the user message that triggered it and whether the run
-- spawned the Topic-Refined Search sub-agent (= "Betty researched"). Run against a Betty MJ database
-- (read-only) and save the single JSON document as betty-turns.json next to replay.mjs:
--   sqlcmd -S <host,port> -U <user> -d <db> -C -h -1 -y 0 -i extract-betty-turns.sql | tr -d '\n' > betty-turns.json
SET NOCOUNT ON;
WITH betty AS (
  SELECT r.ID RunID, r.Status, r.ConversationID, r.ConversationDetailID, DATEDIFF(ms, r.StartedAt, r.CompletedAt) ServerMs,
    COALESCE(o.Name, (SELECT TOP 1 o2.Name FROM __mj.AIAgentRun r2 JOIN __mj_BizAppsCommon.Organization o2 ON o2.ID = r2.PrimaryScopeRecordID WHERE r2.ConversationID = r.ConversationID)) Org,
    CASE WHEN EXISTS (SELECT 1 FROM __mj.AIAgentRun c JOIN __mj.AIAgent ca ON ca.ID = c.AgentID WHERE c.ParentRunID = r.ID AND ca.Name = 'Topic-Refined Search') THEN 1 ELSE 0 END Researched
  FROM __mj.AIAgentRun r
  JOIN __mj.AIAgent a ON a.ID = r.AgentID
  LEFT JOIN __mj_BizAppsCommon.Organization o ON o.ID = r.PrimaryScopeRecordID
  WHERE a.Name = 'Betty' AND r.ParentRunID IS NULL AND r.ConversationDetailID IS NOT NULL)
SELECT b.RunID, b.Status, b.Researched, b.ServerMs, b.Org, b.ConversationID, ai.__mj_CreatedAt AiAt,
       u.ID UserDetailID, u.Message UserMessage, LEFT(ai.Message, 400) AiMessage
FROM betty b
JOIN __mj.ConversationDetail ai ON ai.ID = b.ConversationDetailID
OUTER APPLY (SELECT TOP 1 x.ID, x.Message FROM __mj.ConversationDetail x
             WHERE x.ConversationID = b.ConversationID AND x.Role = 'User' AND x.__mj_CreatedAt <= ai.__mj_CreatedAt
             ORDER BY x.__mj_CreatedAt DESC) u
ORDER BY b.ConversationID, ai.__mj_CreatedAt
FOR JSON PATH;
