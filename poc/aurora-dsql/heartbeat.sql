CREATE OR REPLACE FUNCTION __mj."spStampAIAgentRunHeartbeat"(p_agentrunid uuid) RETURNS void
    LANGUAGE sql
    AS $fn$
UPDATE __mj."AIAgentRun" SET "LastHeartbeatAt" = NOW() WHERE "ID" = p_agentrunid AND "Status" = 'Running';
$fn$;
