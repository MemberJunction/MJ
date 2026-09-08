---
'@memberjunction/task-graph': minor
'@memberjunction/server': minor
'@memberjunction/graphql-dataprovider': minor
'@memberjunction/ng-task-graph-editor': minor
'@memberjunction/ng-dashboards': minor
---

Workflow Run Console — realtime runner and debugger for task graphs (`plans/task-graph-realtime-runner.md`).

Engine: new frame kinds (`GateDecision`, `ClaimChanged`, `PassCompleted`, `GraphPaused`, `GraphResumed`, `BreakpointHit`, `NodeProgress`) emitting state the dispatcher already computes; durable debug state (`$.debug` in the parent metadata bag) gating the claim filter — pause, single-step, breakpoints, and edge-condition overrides are claim gating, never new execution machinery. New Remote Operations: `TaskGraph.Pause/.Resume/.Step/.SetBreakpoints/.OverrideEdge/.SkipTask/.ForceCompleteTask/.UpdateTaskInput`; `RetryTask` accepts an edited input. Metadata rows for the new operations ride the branch (bump is `minor` per the metadata-branch rule).

Client: `GraphQLDataProvider.TaskGraphFrames(parentTaskId)` — the first consumer of the `taskGraphFrames` subscription (shared, refcounted per graph). The run view accepts a `LiveFrame` input (frames patch the canvas; cascade frames trigger a debounced row reconcile — frames advisory, rows truth) and a `ReplayAt` input (post-settle scrubbing from row timestamps). The Workflows app's Runs surface becomes the console: pause/resume/step toolbar, engine pass strip, stall banner, step inspector (claim, path verdicts, live progress, what-if via the engine's own algorithms), and replay scrub.
