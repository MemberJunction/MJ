---
"@memberjunction/ng-conversations": patch
---

Make the conversation UI's diagnostic logging opt-in instead of unconditional.

Reported from a deployed app: "the browser's dev console is absolutely packed with spam. Every single character a user types into the input box triggers a message in the console. This isn't something we can put out into the world since some users will bring that up and it looks terrible."

Nothing is removed — twelve `console.*` calls become `LogStatusEx({ …, verboseOnly: true })`, so they are silent by default and still there for anyone tracing this code. In a browser, verbose is enabled by `window.MJ_VERBOSE = true`, `localStorage.setItem('MJ_VERBOSE','true')`, or a `?mj_verbose=true` URL parameter.

**The per-keystroke pair**, which is the specific behaviour in the report: `ComposerDraftStore.SetDraft` logs on every character typed, and `conversation-chat-area` logs the same event again on the way in. Together they are the largest single source of console output in the app.

**Task-lifecycle narration**: `ActiveTasksService.add()` and `.remove()` each printed three lines per call (`➕ Task added:`, `📊 Total tasks:`, `🗂️ Conversation IDs with tasks:`), and `markMessageComplete` printed two more describing its own happy path.

**One `console.warn` that was misdiagnosing itself.** `⚠️ No task found for completed message … - task may have been removed prematurely or not added` fired on every turn, by construction. A turn registers exactly one task, against whichever message its flow chose — `activeTasks.add()` is called with the user message, a Sage delegation message, a status message, or the agent response depending on the path — while `markMessageComplete` runs for *every* message in the turn that reaches `Complete` or `Error`. Most calls therefore find no task, which is the normal case and not the lifecycle race the text described. It is now verbose-only and reworded to say what it actually means.

`console.error` is untouched — all 179 in the package.

Scoped deliberately to the per-keystroke path and this instrumentation rather than converting the package's remaining `console.*` calls: raw `console` is the prevailing style across MJ's Angular packages (863 calls vs 105 `LogStatus`), so a wholesale conversion is a convention decision rather than a bug fix.
