---
"@memberjunction/task-graph": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/ng-task-graph-editor": patch
"@memberjunction/ng-flow-editor": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-dashboards": patch
---

Debug a Flow agent from the Agent form Run dialog. Debug starts the graph paused at Submit (`$.debug.paused` on the parent row — Pause-after-submit races the dispatcher). The harness and Runs console share a VS Code-style icon toolbar and a red-circle breakpoint toggle. The invocation-envelope sanitizer from #3783 is preserved.
