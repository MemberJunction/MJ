---
"@memberjunction/ng-dashboards": patch
---

Chief of Staff pages: the Refresh button now reloads. The templates bound `(Refresh)`, but `<mj-refresh-button>` emits `Clicked`, so the button did nothing.
