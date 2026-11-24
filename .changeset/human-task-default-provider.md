---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/task-graph": minor
"@memberjunction/server": minor
"@memberjunction/core-entities": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/integration-test-suite": minor
---

Human-task providers can now be the install's default, opt-in, for workflows and for agents.

- **The contract moved to `@memberjunction/ai-core-plus`** (`BaseHumanTaskProvider`, `ResolveHumanTaskProvider`) so agents can use it; `@memberjunction/task-graph` no longer exports it. `RaiseTask` and `WithdrawTask` now receive a `Subject`: `{ Kind: 'WorkflowStep', TaskID, ParentTaskID }` or `{ Kind: 'AgentRequest', AgentRequestID, AgentRunID }`. `WithdrawTask` also receives a `Reason` (`'expired'`, `'cancelled'`, `'completed-elsewhere'`).
- **Opt-in default.** A provider declares it may be the default with `@RegisterClassEx(BaseHumanTaskProvider, { key, metadata: { CanBeDefault: true } })`; an install chooses it with `humanTasks.defaultProvider` in `mj.config.cjs` (env `MJ_HUMAN_TASKS_DEFAULT_PROVIDER`). Both are needed: installing a provider never reroutes approvals by itself. A configured provider that is missing or ineligible is ignored with an error and asks stay in the inbox.
- **Workflows.** Human steps that name no provider go to the default, chosen at submit and written into the step, so running workflows are not rerouted when the setting changes. `'AgentRequest'` still means the built-in inbox.
- **Agents.** A Chat step's feedback request is also raised through the default provider; the `MJ: AI Agent Requests` row stays the source of truth and still resumes the agent. New columns `HumanTaskProvider` and `HumanTaskExternalReference` record where it went. Providers answer with `AnswerAgentRequestFromProvider` (`@memberjunction/ai-agents`), which accepts only the provider the request was raised through, only while it is open, and saves as the request's owner. An answer given in the inbox or the conversation withdraws the provider's copy. Plan approvals stay in the inbox.
