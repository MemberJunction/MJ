---
"@memberjunction/react-test-harness": patch
---

Add opt-in `waitForDataIdle` option to the React test harness. When enabled, wraps RunView/RunViews/RunQuery with pending-call counters and uses a debounced stabilization window to wait for all async data calls to complete before capturing the screenshot. Fixes false visual evaluation failures where screenshots were taken during the loading state before async data arrived.
