/* =============================================================================
   seed-local-data.sql — local-dev screenshot seed (collapsible-section work)
   -----------------------------------------------------------------------------
   Lights up the data-sparse panels so their collapsible sections can actually be
   seen + screenshotted. LOCAL, THROWAWAY DB ONLY — never run against a real DB.

   Why this is the "sure-fire" method: it calls MJ's *generated* spCreate* stored
   procedures — the exact code path the GraphQL API uses — so every row is
   schema-valid (defaults, audit columns, FKs all handled) and renders correctly
   in the views the UI reads. No hand-crafted INSERTs fighting CHECK/FK constraints.

   Idempotent: every block is guarded by Name, so it's safe to re-run.

   Run (from repo root; password lives in packages/MJAPI/.env):
     DBP=$(grep -E "^DB_PASSWORD=" packages/MJAPI/.env | sed -E "s/^DB_PASSWORD=//;s/^'//;s/'$//")
     sqlcmd -S localhost,1433 -U sa -P "$DBP" -d AssociationDBv541 -C \
       -i plans/collapsible-section-screenshots/seed-local-data.sql

   Covers:
     - MJ: Queries              -> query-viewer / query-info-panel   (target #10)
     - MJ: MCP Tool Exec Logs   -> mcp-log-detail-panel              (target #5)
   Deliberately NOT covered (deep FK chain, low ROI): Integration pipelines (#3/#4)

   -----------------------------------------------------------------------------
   MAKING SEEDED DATA VISIBLE (the catch with direct-SQL seeding)
   -----------------------------------------------------------------------------
   Direct SQL bypasses MJ's BaseEntity event-driven cache invalidation, so seeded
   rows aren't always immediately visible. Two cases:

   1. TRANSACTIONAL data read via RunView (MCP logs, most entity grids/panels):
      just RELOAD the page. The grid re-queries and the rows appear. No restart.
      (Verified: MCP logs + mcp-log-detail-panel light up on reload.)

   2. STARTUP-ENGINE-CACHED metadata (Queries via QueryEngine, AI Models, etc. —
      anything loaded once by a @RegisterForStartup BaseEngine): MJAPI holds it in
      memory from boot, so a SQL insert won't surface until the server reloads.
      -> RESTART MJAPI after seeding. (Queries fall in this bucket. Some, like
         Queries, also apply a per-user permission filter — an admin/owner user
         passes it; otherwise also seed a permission row.)

   DON'T blanket-clear localStorage to bust the client cache — it wipes the MSAL
   auth tokens and logs you out. Prefer a plain reload; clear IndexedDB only, or
   just re-login, if you must drop the GraphQLDataProvider client cache.
   ============================================================================= */

SET NOCOUNT ON;

DECLARE @userId    UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.[User] WHERE Email = 'not.set@nowhere.com');
DECLARE @mcpServer UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.MCPServer WHERE Name = 'Test');

/* ---- 1. A saved Query (query-info-panel Overview section) ----------------- */
IF NOT EXISTS (SELECT 1 FROM __mj.Query WHERE Name = 'Active Members by Join Year')
BEGIN
    EXEC __mj.spCreateQuery
        @Name        = N'Active Members by Join Year',
        @Description = N'Counts active members grouped by the year they joined. Powers the membership-overview dashboard tile.',
        @UserQuestion= N'How many active members joined in each year?',
        @SQL         = N'SELECT YEAR(JoinDate) AS JoinYear, COUNT(*) AS MemberCount
FROM Members
WHERE Status = ''Active''
GROUP BY YEAR(JoinDate)
ORDER BY JoinYear DESC;',
        @TechnicalDescription = N'Aggregates the Members table by JoinDate year; the Active filter is applied pre-aggregation.',
        @Status         = N'Approved',
        @AuditQueryRuns = 1,
        @CacheEnabled   = 0,
        @UsesTemplate   = 0,
        @Reusable       = 1;
    PRINT '  + created Query: Active Members by Join Year';
END
ELSE PRINT '  = Query already present, skipped';

/* ---- 2. MCP connection + tool-execution logs (mcp-log-detail-panel) ------- */
DECLARE @connId UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.MCPServerConnection WHERE Name = 'Test Connection (seed)');
IF @connId IS NULL AND @mcpServer IS NOT NULL
BEGIN
    EXEC __mj.spCreateMCPServerConnection
        @MCPServerID         = @mcpServer,
        @Name                = N'Test Connection (seed)',
        @Description         = N'Seeded connection so MCP tool-execution logs have a parent.',
        @Status              = N'Connected',
        @AutoSyncTools       = 0,
        @AutoGenerateActions = 0,
        @LogToolCalls        = 1,
        @LogInputParameters  = 1,
        @LogOutputContent    = 1;
    SET @connId = (SELECT TOP 1 ID FROM __mj.MCPServerConnection WHERE Name = 'Test Connection (seed)');
    PRINT '  + created MCP connection';
END

IF @connId IS NOT NULL AND @userId IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM __mj.MCPToolExecutionLog WHERE MCPServerConnectionID = @connId AND ToolName = 'search_documents')
    BEGIN
        EXEC __mj.spCreateMCPToolExecutionLog
            @MCPServerConnectionID = @connId,
            @ToolName        = N'search_documents',
            @UserID          = @userId,
            @StartedAt       = '2026-06-25T14:05:11Z',
            @EndedAt         = '2026-06-25T14:05:11Z',
            @DurationMs      = 342,
            @Success         = 1,
            @InputParameters = N'{ "query": "membership renewal policy", "limit": 10 }',
            @OutputContent   = N'{ "results": [ { "title": "2026 Renewal Policy", "score": 0.94 }, { "title": "Grace Period FAQ", "score": 0.81 } ], "count": 2 }',
            @OutputTruncated = 0;
        PRINT '  + created MCP log: search_documents (success)';
    END
    IF NOT EXISTS (SELECT 1 FROM __mj.MCPToolExecutionLog WHERE MCPServerConnectionID = @connId AND ToolName = 'fetch_record')
    BEGIN
        EXEC __mj.spCreateMCPToolExecutionLog
            @MCPServerConnectionID = @connId,
            @ToolName        = N'fetch_record',
            @UserID          = @userId,
            @StartedAt       = '2026-06-25T14:06:02Z',
            @EndedAt         = '2026-06-25T14:06:32Z',
            @DurationMs      = 30012,
            @Success         = 0,
            @ErrorMessage    = N'Connection timed out after 30000ms while awaiting tool response from the upstream MCP server.',
            @InputParameters = N'{ "recordId": "abc-123", "includeRelated": true }',
            @OutputTruncated = 0;
        PRINT '  + created MCP log: fetch_record (failure)';
    END
END

PRINT 'Seed complete.';
