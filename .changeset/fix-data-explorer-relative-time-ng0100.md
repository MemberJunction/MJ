---
"@memberjunction/ng-dashboards": patch
---

Fix: the Data Explorer home dashboard no longer throws `NG0100: ExpressionChangedAfterItHasBeenCheckedError` from its Recent Records relative-time labels. The template bound `formatRelativeTime(record.latestAt)`, which reads `Date.now()` and was therefore evaluated during change detection; when a CD cycle crossed a minute boundary the two dev-mode passes produced different strings. The label is now pre-computed into `RecentRecordAccess.relativeTime` when the record set loads and on a 30s timer (cleared in `ngOnDestroy`), and the template binds that stable field — so no template binding reads `Date.now()` during change detection.
