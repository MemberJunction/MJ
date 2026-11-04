---
"@memberjunction/react-linter": patch
---

Fix false positives in four runtime rules. `required-queries-not-called` recognizes RunQuery through any reference to the rq service (`utilitiesRef.current.rq`, an alias of it, a destructured or renamed `rq`) and optional calls. `query-result-field-access-validation` tracks query result variables by binding, so a same-named variable in another function no longer inherits the query's fields. `noisy-settings-updates` flags a save only when its handler is wired to a per-keystroke event (onInput/onKey*, or onChange on a text input, textarea or Input-like component), recognizes `onSaveUserSettings?.(...)` and `useCallback` handlers, and its debounce check now works (it compared against `"[object Object]"`). `component-usage-without-destructuring` accepts `components || {}`, `components ?? {}` and `props.components`.
