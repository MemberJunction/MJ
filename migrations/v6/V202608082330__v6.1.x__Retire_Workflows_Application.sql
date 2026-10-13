/*
  Retires the Workflows application.

  WHY
  ---
  The Workflows app was a second front door onto Flow agents: its own list of the same rows the AI
  app already lists, plus a create/edit canvas that duplicated the Flow agent editor and — because it
  had no Save path at all — could never turn a draft into anything. Everything it was for now lives
  where the substrate lives: a workflow IS a Flow agent, so it is authored in the AI Agents form
  (which now leads with the flow diagram) or conversationally through the Agent Manager, and every
  automated pathway that invokes it is listed on that same record's Invocations tab.

  Nothing the app owned is lost, because it owned nothing. There is no Workflow table and never was
  (see packages/TaskGraph/src/WorkflowSpecSync.ts) — the app was a view, and the rows it viewed are
  untouched by this migration.

  The `Workflow.Draft` / `Workflow.Save` / `Workflow.Validate` Remote Operations are deliberately
  KEPT. They are the agent- and MCP-facing contract for reconciling a workflow's graph and its
  triggers atomically, and they matter more now that creation is conversational, not less. Only the
  Angular app is retired.

  WHAT THIS DOES
  --------------
  Deletes the Application row and everything that hangs off it. The nav item lives inside the
  application's own `DefaultNavItems` JSON, so it goes with the row; the per-user copies live in
  UserApplication / UserApplicationEntity and are removed explicitly, because a user row pointing at
  a deleted application is what puts a dead tile on someone's home screen.

  Idempotent, and a no-op on a database that never had the app (a clean install built after the
  metadata file was removed).
*/

DECLARE @WorkflowsAppID UNIQUEIDENTIFIER = 'A715122C-F912-4BF5-B4BB-9B94DFDD2A9E';

IF EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Application] WHERE [ID] = @WorkflowsAppID)
BEGIN
    PRINT 'Retiring the Workflows application...';

    -- Per-user application state first: these carry FKs to Application, and a user row surviving its
    -- application is exactly what renders a tile that navigates nowhere.
    DELETE FROM [${flyway:defaultSchema}].[UserApplicationEntity]
    WHERE [UserApplicationID] IN (
        SELECT [ID] FROM [${flyway:defaultSchema}].[UserApplication] WHERE [ApplicationID] = @WorkflowsAppID
    );

    DELETE FROM [${flyway:defaultSchema}].[UserApplication] WHERE [ApplicationID] = @WorkflowsAppID;

    -- The app declared no entities and no settings, but delete defensively: an instance that added
    -- its own would otherwise block the parent delete on a foreign key, and the failure would read
    -- as an unrelated FK error rather than as "someone customised this app".
    DELETE FROM [${flyway:defaultSchema}].[ApplicationEntity]  WHERE [ApplicationID] = @WorkflowsAppID;
    DELETE FROM [${flyway:defaultSchema}].[ApplicationSetting] WHERE [ApplicationID] = @WorkflowsAppID;
    DELETE FROM [${flyway:defaultSchema}].[ApplicationRole]    WHERE [ApplicationID] = @WorkflowsAppID;

    -- The nav item is a property of the row (Application.DefaultNavItems, JSON), so it needs no
    -- separate delete — it goes with its parent.
    DELETE FROM [${flyway:defaultSchema}].[Application] WHERE [ID] = @WorkflowsAppID;

    PRINT 'Workflows application retired. Flow agents are authored in the AI app.';
END
ELSE
BEGIN
    PRINT 'Workflows application not present — nothing to retire.';
END
GO
