/* ============================================================================
   AIAgentSession.CloseReason — authoritative close provenance
   v5.41.x

   Companion plan: /plans/ai-agent-sessions.md (Session Lifecycle, Heartbeat &
   Reconciliation). Follow-up from the Realtime Voice admin dashboard build:
   janitor-vs-explicit close is currently inferred by a heuristic
   (ClosedAt − LastActiveAt ≥ 10 min). This column makes it authoritative so
   admin tooling can filter/triage close causes exactly.

   NULL while the session is Active/Idle (and for legacy rows closed before this
   column existed — consumers must treat NULL as "unknown").

   Values:
     Explicit  — the user hung up / the API closed it deliberately
     Janitor   — closed by the SessionJanitor (own-host crash recovery or the
                 periodic staleness sweep)
     Shutdown  — closed by graceful server shutdown (SIGTERM drain)
     Error     — closed because the session failed (provider/socket/run error)

   Server code that SETS this value (SessionManager.CloseSession callers, the
   janitor sweeps, graceful shutdown) ships AFTER CodeGen generates the typed
   entity property, per the no-weak-typing rule.
   ============================================================================ */

ALTER TABLE ${flyway:defaultSchema}.AIAgentSession ADD
    CloseReason NVARCHAR(20) NULL
        CONSTRAINT CK_AIAgentSession_CloseReason
        CHECK (CloseReason IN ('Explicit', 'Janitor', 'Shutdown', 'Error'));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why the session was closed: Explicit (user hang-up / deliberate API close), Janitor (orphan or staleness sweep), Shutdown (graceful server shutdown), Error (session failure). NULL while the session is Active/Idle and for rows closed before this column existed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSession',
    @level2type = N'COLUMN', @level2name = N'CloseReason';
