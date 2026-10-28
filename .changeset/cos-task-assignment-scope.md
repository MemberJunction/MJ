---
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/scheduling-engine": patch
"@memberjunction/ai-agents": minor
---

Chief of Staff cockpit: the Priorities & OKRs tab failed with `Invalid column name 'PersonID'` as soon as the signed-in user had a linked `MJ_BizApps_Common: People` record. `ResolvePersonTaskScope` now matches `MJ_BizApps_Tasks: Task Assignments` on the polymorphic assignee pair (`AssigneeEntityID` = the People entity, `AssigneeRecordID` = the person) and takes the People entity ID as a parameter; the cockpit resolves it through its provider and reports no linked person when the BizApps Common app is not installed.

The cockpit also falls back to an exact, case-insensitive match on the user's email when no People record is linked to their user, so an administrator-entered person works without a manual link.

The task scope now covers the whole tree of every root objective the person owns: milestones added under their objective by an administrator, a teammate or the agent load with it, whoever created them. Children of a task the person is only assigned to are not pulled in.

Chief of Staff prompt (metadata): the agent resolves the user's People record (`LinkedUserID`, then email) before reading or writing tasks, sets `CreatedByPersonID` on every task or issue it creates so the cockpit can show them, and, when no person exists, says so and offers to create one, deferring to an administrator on `PERMISSION_DENIED`. The built-in agents guide documents the People record as a setup step. The prompt also tells the user that a scheduled wake reports in the routine's own conversation and a notification rather than in the chat it was asked from, and no longer creates new recurring routines on its own at the end of a wake; the guide documents where wake output lands.

Chat area: a reply whose row had already settled could stay in the in-flight list, so the composer kept showing "<agent> is working" with a running timer and a Stop button long after the run finished (seen in the overlay after Regenerate-as-fork). Every reconcile path scanned the rows for `In-Progress`, so nothing ever looked at that ID again. The chat area now drops any in-flight ID whose row has settled: after a completion is handled, whatever the context check said after the row was loaded; when a settled row arrives through `OnMessageSent`; and before the reconnect scan.

A routine run's output is now reachable by click. The dispatcher's in-app notification carries the routine's `conversationId`; clicking it opens that conversation in the Chat app (a notification written before the field existed reads it off the routine, and a routine with no conversation opens in the Routines app). The Routines app's "Conversation" button, which Explorer never handled, deep-links into the Chat app the same way. The Chat app's Conversations resource loads a selected conversation the sidebar does not list (an application-scoped one, such as a wake thread) through the engine, so the title and pinned agent show.

Chief of Staff cockpit: every wake routine card has "Read Briefing", which opens the routine's conversation in a slide-in reader inside the cockpit (read-only, the embedded chat area), and "Open in Chat", which deep-links into the Chat app. Both are disabled until the routine has run once, since the conversation is created on the first run. The Overview tab's routine list gets the same "Read" button.

Chief of Staff cockpit: reloads itself when something it shows changes. MJAPI broadcasts every entity save and delete to browsers (a wake run creating an approval request included) as a `remote-invalidate` event; the cockpit now listens for its own entities, reloads once per burst, and defers the reload while its tab is detached.
