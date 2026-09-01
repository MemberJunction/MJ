---
"@memberjunction/schema-engine": patch
"@memberjunction/server": patch
---

Post-restart RSU work gets a bounded second chance instead of failing on first error.

RSU is a long chain — migrations, CodeGen, a git commit, a compile, a restart — and a failure
partway through the post-restart consumer is frequently transient: the process was restarted
mid-consumption, or one provider call failed. That item was marked Failed terminally, so the objects
it would have mapped were silently never mapped and the only recovery was for someone to notice and
re-apply the connector by hand.

`RuntimeSchemaManager.RetryPendingWork` re-queues such an item with an incremented `Attempts` count,
leaving the row Pending. Two guards keep it from becoming a loop: the attempt budget
(`MAX_RSU_PENDING_ATTEMPTS`, 3) and the requirement that something still be outstanding.

The retry carries only the objects that have NOT been mapped yet, so each attempt is strictly
smaller and one poison object cannot keep re-running its healthy siblings. When the budget is spent
the item is failed terminally as before, but the message now names the objects that were never
mapped — that message is the operator's only signal.
