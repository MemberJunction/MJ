---
"@memberjunction/react-runtime": patch
"@memberjunction/ng-react": patch
"@memberjunction/react-test-harness": patch
---

Interactive components: persist `savedUserSettings` per-user, cross-device

The existing interactive-component settings contract (`savedUserSettings` in /
`onSaveUserSettings` out) is now durably persisted **per-user, cross-device** via
`UserInfoEngine`, automatically scoped per component — with no change to the component
contract. The Angular host (`MJReactComponent`) seeds `savedUserSettings` from the
store on load and saves (debounced) on every `onSaveUserSettings` call, under the key
`ic.<scope>` where scope defaults to `<namespace>/<name>` (override via the new
`UserStateScope` input). Set the new `PersistUserSettings` input to `false` to opt out
and own persistence via the `userSettingsChanged` output instead.

- `@memberjunction/react-runtime`: new framework-agnostic `user-state` helpers
  (`resolveUserStateScope`, `userStateStorageKey`, `parseStoredUserSettings`,
  `mergeUserSettings`) plus unit tests.
- `@memberjunction/react-test-harness`: `ComponentExecutionOptions.savedUserSettings`
  seeds the prop and `onSaveUserSettings` now mutates a real in-memory snapshot.

Fully additive — existing components that already use the blob gain durable
persistence for free.
