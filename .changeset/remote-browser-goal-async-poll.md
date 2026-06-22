---
"@memberjunction/server": patch
"@memberjunction/ng-conversations": patch
---

Fix `browser_AchieveGoal` losing its result on long goal loops — make the goal run async (start + poll) instead of one blocking request.

A goal-driven browser run (computer-use loop) can take minutes, but `ExecuteRemoteBrowserGoal` ran the whole loop inside a single synchronous GraphQL mutation. The client held one HTTP request open for the entire loop, which died at a transport boundary (browser fetch / proxy / ngrok idle / session-janitor churn) before the loop finished — so the agent got `"no response from the server"` even though the loop completed successfully server-side (confirmed in a live run: 17 successful Gemini-3.1-Flash-Lite controller/judge prompt runs, client got null).

- **Server:** `ExecuteRemoteBrowserGoal` now STARTS the goal (fires the loop without awaiting), registers it in a new process-local `RemoteBrowserGoalRegistry` (`BaseSingleton`, keyed by agent-session id, TTL-swept), and returns a `GoalRunID` with `Status: 'Running'` immediately. The background completion finalizes the observability step and stores the terminal outcome. New `GetRemoteBrowserGoalResult(agentSessionID, goalRunID)` query reads the registry (ownership-gated).
- **Client:** the Remote Browser channel's `achieveGoal` starts the goal then POLLS `GetRemoteBrowserGoalResult` (every 2.5s, up to 5 min) until terminal — each request short, so no transport timeout. Bounds are protected fields tests can shrink.

Tests added: `RemoteBrowserGoalRegistry` lifecycle (7) and the channel start→poll→terminal flow incl. failure/no-start/still-running (5).
