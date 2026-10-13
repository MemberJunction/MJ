/*
    Content Pipeline demo — remove the path that made its research steps mutually exclusive.

    WHY A MIGRATION AND NOT A METADATA EDIT
    ---------------------------------------
    `mj sync push` is upsert-only. Removing a record from a metadata file creates nothing and
    deletes nothing — the row stays in every database that was pushed before the edit. The demo
    agents shipped in #3716, so every install that has them also has this path, and a metadata-only
    fix would leave all of them running the broken graph while the repository looked correct.

    WHAT WAS WRONG
    --------------
    `Research: broad` had TWO outgoing paths — one to `Research: focused`, one straight to
    `Draft the piece` — which was authored as an AND-join: both research steps feeding the draft.

    A Flow agent compiles with TraversalMode 'sequential' (see flow-graph-executor.ts), where a step
    with more than one outgoing path becomes ONE exclusive group: exactly one branch runs and the
    others are marked Skipped. So the fan-out could not mean "both". It meant "either", and with
    both edges unconditional at equal priority the tie broke by path id — `Draft the piece` won,
    `Research: focused` was Skipped, and the draft was written from half the research on every
    single run.

    Nothing reported it. The run succeeded, the reviewer rejected the thin draft, the revision loop
    exhausted its three iterations, and the workflow closed on its give-up branch — a workflow that
    could only ever fail, reporting success at every level.

    An AND-join is simply not expressible in a compiled Flow agent today: parallelism requires a
    fan-out, and sequential traversal converts every fan-out into a choice. So the demo becomes a
    chain — broad -> focused -> draft — which loses nothing, because each step's output accumulates
    into the payload and the draft still sees both research results.

    The remaining fan-out at `Review against brand rules` is CORRECT and stays: both of its edges
    carry a condition, so choosing exactly one branch is the intent.

    Idempotent: deletes by hardcoded id if present, and says so if it is already gone.
*/

DECLARE @BroadToDraftPathID UNIQUEIDENTIFIER = '3A773E7E-7C54-40FA-BF6E-E4509A3E01C5';

IF EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[AIAgentStepPath] WHERE [ID] = @BroadToDraftPathID)
BEGIN
    -- Through the platform's own delete procedure rather than a raw DELETE, so cascades and the
    -- entity's delete semantics are whatever the generated layer says they are, not whatever this
    -- migration assumes.
    EXEC [${flyway:defaultSchema}].[spDeleteAIAgentStepPath] @ID = @BroadToDraftPathID;
    PRINT 'Removed the Content Pipeline broad->draft path; its research steps now run as a chain.';
END
ELSE
BEGIN
    PRINT 'Content Pipeline broad->draft path not present; nothing to remove.';
END
GO
