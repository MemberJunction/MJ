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
`InteractiveComponents_UserState_Root/<scope>` where scope defaults to
`<namespace>/<name>` (override via the new
`UserStateScope` input). Set the new `PersistUserSettings` input to `false` to opt out
and own persistence via the `userSettingsChanged` output instead.

Saves **merge, never replace**: the host overlays each `onSaveUserSettings` payload
onto the saved settings, so a component that passes only the changed keys (or spreads
a stale prop) cannot wipe other preferences. Removing a key requires explicit intent —
set its value to `null`.

- `@memberjunction/react-runtime`: new framework-agnostic `user-state` helpers
  (`resolveUserStateScope`, `userStateStorageKey`, `parseStoredUserSettings`,
  `mergeUserSettings`, `applyUserSettingsUpdate`) plus unit tests.
- `@memberjunction/react-test-harness`: `ComponentExecutionOptions.savedUserSettings`
  seeds the prop and `onSaveUserSettings` now merges into a real in-memory snapshot
  with the same null-removes-key semantics as the production host.

Fully additive — existing components that already use the blob gain durable
persistence for free.
