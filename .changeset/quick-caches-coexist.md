---
"@memberjunction/react-runtime": patch
"@memberjunction/ng-react": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-dashboards": patch
---

Component Studio: React runtime now keys cached components by content fingerprint so artifact versions sharing `(name, namespace, version)` but differing in code coexist as separate cache entries — fixes the conversation panel's version dropdown showing stale compiled code when toggling between Skip-authored registry-reference stubs and Studio-authored inline-code exports of the same component. Adds change-detection fixes to the artifact-load and artifact-selection dialogs, wires the React bridge's `(initialized)` event into `UpdateWithResolvedSpec` so registry-resolved code populates the code editor on first load, and unwraps Skip's `componentOptions` envelope when reading from the artifact `Content` field.
