# Interactive Component — Per-User Settings Persistence

## Goal

Make the **existing** interactive-component user-settings contract (`savedUserSettings`
in / `onSaveUserSettings` out) durably persisted **per-user, cross-device** via
`UserInfoEngine`, automatically scoped per component — with **zero changes to the
component contract** and zero work required from component authors beyond the
pattern they already use.

## Background — what already exists

Every interactive (Skip/React) component already receives two settings props:

```js
function MainComponent({ utilities, styles, components, callbacks,
                         savedUserSettings, onSaveUserSettings }) { ... }
```

- `savedUserSettings` — a read-only object the component reads its persisted prefs from.
- `onSaveUserSettings(blob)` — the component calls this with the **full** settings
  object whenever its prefs change; it owns and maintains that object across its lifetime.

The plumbing is wired end-to-end, but it does **not** persist:

- **Read side never seeded** — `savedUserSettings` is `{}` in the test harness and
  whatever a parent passes (usually nothing) in the Angular bridge.
- **Write side never persists** — the Angular bridge's `handleSaveUserSettings` only
  emits a `userSettingsChanged` event and relies on a parent container to persist.
  A codebase-wide search shows **zero consumers** of that event, so nothing persists today.

## Design decision (chosen)

Keep the single-object-in / event-out contract exactly as is — it is clean and
self-contained. Do **not** add a per-key `utilities.settings.Get/Set` sugar API.
Instead, wire the existing props to durable persistence **in the host (the Angular
bridge)**, which is the single chokepoint every Angular host path flows through.

Storage: **one `UserInfoEngine` blob per component scope** — key
`InteractiveComponents_UserState_Root/<scope>` → JSON object. Scope = explicit
host-provided `UserStateScope` → fallback `<namespace>/<name>` from the component
spec, lowercased.

## Changes by package

### 1. `@memberjunction/react-runtime` (framework-agnostic helpers)
New pure module `src/utilities/user-state.ts` (so both hosts share one tested
implementation, no framework deps):

- `resolveUserStateScope(explicit, namespace, name): string | null`
- `userStateStorageKey(scope): string | null` (`InteractiveComponents_UserState_Root/` prefix)
- `parseStoredUserSettings(raw): Record<string, unknown>` (safe JSON parse)
- `mergeUserSettings(hostDefaults, stored): Record<string, unknown>` (stored wins)

Exported from `src/index.ts`. Unit tested in `src/__tests__/user-state.test.ts`.

### 2. `@memberjunction/ng-react` (the host — `mj-react-component.component.ts`)
- New `@Input() UserStateScope?: string`.
- New `@Input() PersistUserSettings: boolean = true` (opt-out switch).
- On init (before first render): `seedUserSettingsFromStore()` — lazy
  `UserInfoEngine.Instance.Config(...)`, read `InteractiveComponents_UserState_Root/<scope>`,
  merge over host-provided defaults (stored wins), set `_savedUserSettings`.
- `handleSaveUserSettings(blob)` — store the latest blob in `_savedUserSettings`,
  persist via `UserInfoEngine.Instance.SetSettingDebounced('InteractiveComponents_UserState_Root/<scope>', JSON, user)`,
  still emit `userSettingsChanged` (back-compat), no re-render.
- Provider threaded via `this.ProviderToUse` / its `CurrentUser`, matching the
  existing `ComponentMetadataEngine.Instance.Config(...)` call in the same file.

### 3. `@memberjunction/react-test-harness` (`component-runner.ts`)
- Add optional `savedUserSettings` to `ComponentExecutionOptions`.
- Seed the prop from it and make `onSaveUserSettings` mutate a real in-memory
  snapshot instead of the `console.log` stub, so components relying on persisted
  prefs are testable.

### 4. AI generation docs (so generated components lean on it)
- `metadata/components/claude.md` — document that the props now persist per-user/
  cross-device automatically and that components SHOULD use them for prefs.
- `metadata/components/how-to-create-new-components.md` — same in the state section.
- `metadata/prompts/templates/sage/form-builder.template.md` and
  `metadata/prompts/templates/form-builder/designer.template.md` — one-line guidance
  to remember user prefs via these props.

## Backward compatibility
Fully additive. No contract change. Existing components using the blob gain durable
per-user persistence for free. `PersistUserSettings=false` restores the old
event-only behavior for any host that wants to own persistence itself.

## Validation
- `npm run build` in `@memberjunction/react-runtime`, `@memberjunction/ng-react`,
  `@memberjunction/react-test-harness`.
- `npm run test` in `@memberjunction/react-runtime` (new helper tests).
- Changeset (minor bump for the three packages).
