---
"@memberjunction/ng-shared": patch
---

fix(explorer): guarantee the loading screen is released even when a resource's load throws or hangs.

The Explorer shell's loading screen blocks on the first resource's `NotifyLoadComplete()` signal. `BaseDashboard` called it *after* `await this.loadData()` with no `try/finally`, so if `initDashboard()` or `loadData()` threw — e.g. an in-flight query rejecting while MJAPI is restarting, or missing data — the signal never fired and the **entire** Explorer hung on the loading screen forever. This reliably reproduced on any full reload of a deep resource URL (dev-server live-reload after an edit, or a browser refresh) while the API was momentarily down.

Two-part fix:

- **`BaseDashboard`** now wraps `initDashboard()` + `loadData()` (in `ngOnInit`) and `loadData()` (in `Refresh`) in `try/catch/finally`. On error it logs via `LogError` and emits the existing `Error` output so the dashboard/container can show its own error state; `NotifyLoadComplete()` runs in `finally`, so the loading screen always clears.
- **`BaseResourceComponent`**'s load-complete watchdog now **fails open**: if a resource hasn't signalled within the window it forces `NotifyLoadComplete()` (still logging a warning naming the culprit) rather than only warning. This covers every `BaseResourceComponent` subclass — including ones whose own `ngOnInit` bypasses `BaseDashboard`'s guarded lifecycle, or whose load genuinely hangs — so no single resource can brick the shell.
