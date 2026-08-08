/*
    Durable After* entity-action dispatch (D14).

    THE PROBLEM. `OnAfterSaveExecute` dispatches after-save entity actions fire-and-forget — the
    provider calls `HandleEntityActions` without awaiting it, deliberately, so a user's save is not
    held open by work that happens afterwards. That is right for latency and wrong for durability:
    if the process dies between the save committing and the action finishing, the action is simply
    lost. Nothing retries it, nothing records that it was owed, and the record looks like every
    record whose trigger did run. For "when an invoice is approved, notify accounting" that is a
    missed notification nobody can discover.

    THE FIX IS NOT A NEW QUEUE. Plan decision D14 is explicit that the dispatcher's claim protocol
    is MJ's durable-async substrate going forward, and that new durable work targets
    `TaskGraphService` submission rather than `QueueManager` — a single-node durable graph is
    exactly "run this action durably, with restart recovery and orphan reclaim". Adding a third
    async substrate beside MJQueue and fire-and-forget promises is the thing that decision exists to
    prevent.

    TWO COLUMNS, AND WHY EACH IS NEEDED.

    1. EntityAction.RunMode — per-binding opt-in, defaulting to 'Inline'.
       Durability is not free: it costs a Task row per dispatch, a dispatcher hop of latency, and it
       persists the action's parameters at rest. Making every After* binding on every instance pay
       that would be a large, silent behavioural change to installations that never asked for it. So
       the default preserves today's behaviour exactly and an operator opts a binding in.

       The column lives on EntityAction rather than Action because durability is a property of *this
       binding*, not of the action: the same 'Send Notification' action can reasonably be
       fire-and-forget on a low-stakes entity and durable on an invoice.

    2. Task.ActionID — so a graph node can be an action, not only an agent or a person.
       The dispatcher executes agent-assigned nodes and waits on human ones; there was no third
       shape. Without this column a "run this action durably" graph has nowhere to record WHICH
       action, and the substrate would have to smuggle it through InputPayload — untyped, unjoinable,
       and invisible to every query that asks what a task is.

       CK_Task_Assignment is widened from a two-way exclusivity to a three-way one. Note what it
       still refuses: a task assigned to more than one of user / agent / action. The all-NULL case
       remains legal because it always was — a parent graph row is assigned to nothing.

    WHAT THIS MIGRATION DOES NOT DO. It grants no durability by itself. Every existing binding keeps
    RunMode='Inline' and behaves exactly as before; a new Task.ActionID is NULL on every existing
    row. Turning it on is a per-binding decision made after the fact, which is the shape every other
    maintenance-adjacent feature in this program has taken.
*/

-- =====================================================================================
-- EntityAction: per-binding durability opt-in
-- =====================================================================================
ALTER TABLE [${flyway:defaultSchema}].[EntityAction]
    ADD [RunMode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_EntityAction_RunMode] DEFAULT (N'Inline');
GO

ALTER TABLE [${flyway:defaultSchema}].[EntityAction]
    ADD CONSTRAINT [CK_EntityAction_RunMode] CHECK ([RunMode] IN (N'Inline', N'Durable'));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How an After* dispatch of this binding executes. Inline (the default) runs it fire-and-forget in the saving process, which is fast but lost if that process dies. Durable submits a single-node task graph instead, so the work survives a restart and is reclaimed by the dispatcher — at the cost of a Task row, a dispatcher hop of latency, and the action''s parameters being persisted (redacted) at rest. Ignored for Validate and Before* invocations, which run inside the save and cannot be deferred without changing whether the save succeeds.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAction',
    @level2type = N'COLUMN', @level2name = N'RunMode';
GO

-- =====================================================================================
-- Task: a graph node may be an action
-- =====================================================================================
ALTER TABLE [${flyway:defaultSchema}].[Task]
    ADD [ActionID] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[Task]
    ADD CONSTRAINT [FK_Task_ActionID] FOREIGN KEY ([ActionID])
        REFERENCES [${flyway:defaultSchema}].[Action] ([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Action this task executes, when the node is action-assigned rather than agent-assigned or awaiting a person. Mutually exclusive with UserID and AgentID (CK_Task_Assignment). Set by durable entity-action dispatch, where a single-node graph carries one action to run with restart recovery.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Task',
    @level2type = N'COLUMN', @level2name = N'ActionID';
GO

-- Widen the assignment exclusivity from two-way to three-way. Dropped and re-added in one
-- migration, per the value-list rule: the constraint is the source of truth CodeGen reads.
IF EXISTS (
    SELECT 1
    FROM sys.check_constraints cc
    INNER JOIN sys.schemas s ON s.schema_id = cc.schema_id
    INNER JOIN sys.tables t ON t.object_id = cc.parent_object_id
    WHERE cc.name = N'CK_Task_Assignment'
      AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'Task'
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[Task] DROP CONSTRAINT [CK_Task_Assignment];
END
GO

ALTER TABLE [${flyway:defaultSchema}].[Task]
    ADD CONSTRAINT [CK_Task_Assignment] CHECK (
        -- At most one assignment. All-NULL stays legal: a parent graph row is assigned to nothing.
        (CASE WHEN [UserID]   IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN [AgentID]  IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN [ActionID] IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );
GO
