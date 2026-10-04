---
"@memberjunction/ai-agents": minor
"@memberjunction/task-graph": minor
"@memberjunction/server": minor
"@memberjunction/conversations-runtime": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/web-search-engine": minor
"@memberjunction/core-actions": minor
---

fix(sage): the Workflow Planner's plan approval renders a button again, and the planner remembers the plan it presented

When Sage delegated a multi-agent request to the Workflow Planner, the planner presented its plan as plain text ("Does this approach work for you?") with no `responseForm`, so the conversation had no Approve button to render. Replying "yes" made Sage re-invoke the planner, which ran with `MessageMode` unset (a fresh start), had no memory of the plan it had just shown, and presented it again. The user was stuck in a loop.

The durable task-graph work masked this: under the old `payloadChangeRequest` format the client executed any `taskGraph` it found in the payload immediately, so the missing confirmation step was skipped rather than exposed. Making submission an explicit `Tasks` step that ends the turn surfaced it.

- The planner's confirmation step now emits a `Chat` step with a single-question `decision` response form (Approve and run / I want changes), which the conversation renders as inline buttons.
- The planner's prompt now says how to read the form reply and go straight to the `Tasks` submission on approval, rather than re-planning.
- The Workflow Planner agent gets `MessageMode: Latest` with `MaxMessages: 10`, so a re-invoked planner sees its own plan and the user's answer.
- Sage's prompt tells it to route a reply to a planner plan back to the planner instead of treating it as a new request.

Metadata only; `mj sync push` applies it.

---

fix(agents): the task-graph capability gate reads the agent's own config, not just a runtime override

With the button and the search fixed, the approved plan still never ran. `LoopAgentType.taskGraphsEnabled` read `enableTaskGraphs` from `params.data.__agentTypePromptParams` alone. That bag holds a per-run override and nothing else; the merged params that render the prompt live in the prompt's template data and are never written back to `params.data`. So on every real run the gate saw an empty bag and answered no — while the prompt, rendered from the merge, was inviting the `Tasks` step. The planner emitted the graph it was told to, was told it "is not enabled to emit task graphs", concluded the feature was off, and tried to run the workflow by calling agents it has no sub-agent relationship with. Not one task graph had been submitted on the host all day. The existing unit tests all supplied the flag through the runtime bag, which is why they passed.

The gate now applies the same precedence as `BaseAgent.buildAgentTypePromptParams`: a runtime override wins when it says anything, otherwise the agent's `AgentTypePromptParams` decides, and absent or unparseable config still fails closed. Tests cover the agent-config path, both override directions, a silent override bag, and the fail-closed cases.

---

fix(task-graph): an approved workflow's results reach the conversation

With the button rendered and the graph submitted, the workflow ran to completion and the conversation still showed "I'll follow up when it finishes." Four defects in the follow-up path, each of which lost the result on its own:

- **The graph had no conversation.** Sub-agent runs were not handed `conversationDetailId`, so a graph the Workflow Planner (a sub-agent of Sage) submitted had nothing to post to. `ExecuteSubAgent` now propagates `conversationId` and `conversationDetailId`.
- **The follow-up turn wrote nothing.** `TaskGraphContinuationDeliverer.Reinvoke` ran the agent through `RunAgent`, which executes a turn but never writes to a conversation. It now creates the reply detail first and runs through `RunAgentInConversation`, the path that writes the final message, response form and artifacts onto it. It reinvokes the **root** of the submitting run's chain (Sage, not the planner) with that run's `ConfigurationID`, so the same model set that answered the user answers the follow-up. A failure inside the turn writes the plain outcome onto the reply it already created.
- **The follow-up had nothing to present.** The continuation carried "output available (N chars)" per task on the theory that the agent would pull outputs by task ID; no conversational agent has such a tool. `TaskContinuationParams.Tasks[].Output` now carries a bounded copy of each task's output (`MAX_CONTINUATION_OUTPUT_CHARS`), the rendered message includes it, and the reinvoke message says to present the results now.
- **The write was refused.** A conversation detail may only be written by the conversation's owner or a grantee (`MJConversationDetailEntityExtended` enforces this server-side), and the dispatcher runs as the System user — so both the follow-up reply and the older plain post were refused, silently. The deliverer now resolves the conversation's owner (the root run's user, else `MJ: Conversations.UserID`, via `UserCache`) and creates the reply and runs the follow-up turn as them.
- **The parent kept going.** After the Workflow Planner (a sub-agent) submitted the graph and parked, Sage's loop continued with the planner's "started" report as if it were a result to act on: it invoked the planner again, which submitted the same graph a second time, then answered the user with its own hand-off text. `processSubAgentStep` now treats a sub-agent that parked on a workflow (`Paused` with Success) as terminal: it relays the report as a Chat and ends the turn. The planner prompt also refuses to re-submit when its own "started" message already follows the approval.
- **The client never heard.** Completion pushes are addressed to the browser session that started the turn, and nothing started this one, so the reply sat in the database until a reload. The push filter now accepts `BROADCAST_SESSION_ID` (`*`), still owner-scoped; the deliverer announces the landed follow-up that way in the run resolver's own shape; `CompletionEvent` carries `conversationId`; and the chat area reloads its messages on a completion for a message it has not loaded when it belongs to the conversation on screen.

Sage's prompt now invokes the Workflow Planner as a `Sub-Agent` step rather than wrapping it in a one-task graph with `continuation: 'reinvoke'`, which ran the planner detached from the conversation and doubled the follow-up chain, and tells Sage that a re-invocation with results is to be presented, not re-planned.

---

fix(web-search): `IncludeAnswer` is a preference, not a requirement

The same workflow then failed at its next step for an unrelated reason that the fix above made visible. The Demo Loop Agent set `IncludeAnswer: true` on its Web Search calls, and the engine responded by filtering the provider list down to answer-capable providers — none, on an install with only Google Custom Search and DuckDuckGo — and failing every search with `NO_ELIGIBLE_PROVIDER`. Whether the flag got set depended on which model was driving the agent, so the identical query worked on one model and failed on another.

An agent can read hits; it cannot read an error. `WebSearchEngine.resolveByPriority` now prefers an answer-capable provider when one exists and otherwise serves plain results from the full priority list, with `IncludeAnswer` cleared before the drivers run and a new `WebSearchResult.Notice` saying what was dropped and why. The explicit-provider path is unchanged: naming a provider and demanding an answer it cannot give is a caller mistake and still returns `PROVIDER_LACKS_CAPABILITY`. The Web Search action surfaces `Notice` as an output parameter.

---

fix(server): a task's output carries the agent's answer, not just its payload

`TaskGraphAgentRunner` recorded a task's output as the agent's structured payload when one existed and the run's Message only otherwise. A Loop agent's answer lives in the Message; its payload is usually partial or an echo of the task input. So a completed weather task's output said `{"cities":[…]}` while its message listed every temperature, downstream tasks were handed the input bag, and the workflow's follow-up turn presented JSON instead of the table the user asked for — or a table only when the first task happened to have no payload. A plain-object payload now carries the message under `_message` (additive, so `@taskN.output.field` references and flow conditions keep reading what they read today); arrays and primitives keep their shape; the no-payload and no-message cases are unchanged.

The follow-up turn is also given the conversation it belongs to — the request, the approved plan, the last twenty messages, loaded through the same `ConversationEngine` helpers the run resolver uses — with the outcome appended last, and its instruction names the shape: the columns the user asked for, in that order, one row per item. It had been handed the outcome alone, so "present it in the form they asked for" had nothing to point at and one run answered with a table, the next with bulleted lists.

