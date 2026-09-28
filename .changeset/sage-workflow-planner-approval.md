---
"@memberjunction/ai-agents": minor
---

fix(sage): the Workflow Planner's plan approval renders a button again, and the planner remembers the plan it presented

When Sage delegated a multi-agent request to the Workflow Planner, the planner presented its plan as plain text ("Does this approach work for you?") with no `responseForm`, so the conversation had no Approve button to render. Replying "yes" made Sage re-invoke the planner, which ran with `MessageMode` unset (a fresh start), had no memory of the plan it had just shown, and presented it again. The user was stuck in a loop.

The durable task-graph work masked this: under the old `payloadChangeRequest` format the client executed any `taskGraph` it found in the payload immediately, so the missing confirmation step was skipped rather than exposed. Making submission an explicit `Tasks` step that ends the turn surfaced it.

- The planner's confirmation step now emits a `Chat` step with a single-question `decision` response form (Approve and run / I want changes), which the conversation renders as inline buttons.
- The planner's prompt now says how to read the form reply and go straight to the `Tasks` submission on approval, rather than re-planning.
- The Workflow Planner agent gets `MessageMode: Latest` with `MaxMessages: 10`, so a re-invoked planner sees its own plan and the user's answer.
- Sage's prompt tells it to route a reply to a planner plan back to the planner instead of treating it as a new request.

Metadata only; `mj sync push` applies it.
