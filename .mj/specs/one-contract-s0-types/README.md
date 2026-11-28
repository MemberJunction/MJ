# One Contract — Wave S0 Seam Types (`one-contract-s0-types`)

**Package:** `@memberjunction/interactive-component-types` (`packages/InteractiveComponents`)  
**Scope:** Wave S0 Slice 1 (`P6`, `P8`, `P11`, `P18`, `G9`)

---

## 1. Purpose & Architectural Invariants

Wave S0 establishes the shared, framework-free TypeScript contract seam consumed by:

- Sandboxed React / TSX widget & component runtimes (`@memberjunction/react-runtime`, Mobile DOM host)
- MJ Explorer, Companion Desktop, Tray, and Mobile shells
- Server-side `BaseRemotableOperation` sandbox bridge validation
- Platform update hosts (`SwUpdate`, `expo-updates`, `electron-updater`)

### Non-Negotiable Engineering Rules

1. **Zero `any` & Zero Lazy `unknown` Payloads**: All extensible settings, host context metadata, action params, and operation schemas use recursive `JsonValue` / `JsonObject` / `ReadonlyJsonObject` types defined in `packages/InteractiveComponents/src/json-types.ts`.
2. **Zero Cross-Package Re-Exports**: All new types and helpers live natively in `@memberjunction/interactive-component-types` and are exported only from its own barrel (`src/index.ts`).
3. **G9 Backward Compatibility**: All 117+ existing JSX `ComponentSpec` payloads remain 100% valid without modification.

---

## 2. Contract Specifications

### 2.1 Recursive JSON Value Types (`src/json-types.ts`)

| Export | Description |
|---|---|
| `JsonPrimitive` | `string \| number \| boolean \| null` |
| `JsonArray` | `JsonValue[]` |
| `JsonObject` | `{ [key: string]: JsonValue }` |
| `JsonValue` | `JsonPrimitive \| JsonObject \| JsonArray` |
| `ReadonlyJsonObject` | `Readonly<Record<string, JsonValue>>` |
| Guards | `IsPlainObject`, `IsJsonPrimitive`, `IsJsonArray`, `IsJsonObject`, `IsJsonValue`, `IsNonEmptyString` |

`IsJsonPrimitive` rejects `NaN`, `Infinity`, and `-Infinity`. `IsJsonObject` / `IsJsonArray` detect circular references via a `WeakSet<object>`.

### 2.2 Widget Host Contract (`P8` — `src/widget-host.ts`)

| Symbol | Role |
|---|---|
| `WidgetSurface` / `WIDGET_SURFACES` | `'home' \| 'dashboard' \| 'tray' \| 'desktop-widget' \| 'companion'` |
| `WidgetSizeClass` / `WIDGET_STANDARD_SIZE_CLASSES` | `'sm' \| 'md' \| 'lg' \| 'wide' \| 'tall' \| (string & Record<never, never>)` |
| `WidgetHostContext` | Strongly typed host shell metadata (`applicationId`, `applicationName`, `dashboardId`, `organizationId`, `userId`, `themeMode`, `locale`, `timezone`, `isReadOnly`, `isCompact`, `metadata`) |
| `WidgetSettingsSchema` | JSON Schema (`type: 'object'`, `properties`, `required`, `additionalProperties`) describing `userSettings` |
| `WidgetHostProps<TSettings>` | `componentRole: 'widget'`, `surface`, `placementId`, `sizeClass`, `hostContext`, `userSettings`, `settingsSchema?`, `onOpenRecord`, `onInvokeAction`, `onNotify`, `onSaveUserSettings` |
| `WidgetEventNames` | `RecordOpenRequested`, `ActionRequested`, `NotificationRequested`, `UserSettingsSaveRequested` |
| Validators | `IsWidgetRole`, `IsWidgetSurface`, `IsWidgetSizeClass`, `IsWidgetHostContext`, `IsWidgetSettingsSchema`, `IsWidgetHostProps`, `ValidateWidgetHostProps`, `ValidateWidgetSettingsAgainstSchema` |

**Host Governance & Persistence Rules**:
- `userSettings` is hydrated by the host from `UserInfoEngine` (`MJ: User Settings`) keyed by `placementId`. Widgets never read or write `localStorage` / `sessionStorage`.
- Hosts implementing `onSaveUserSettings` should apply debounce coalescing (`DEFAULT_WIDGET_SETTINGS_SAVE_DEBOUNCE_MS = 300`) and payload size bounds (`MAX_WIDGET_SETTINGS_PAYLOAD_BYTES = 65536`).

### 2.3 TSX Language & `erasableSyntaxOnly` (`P6` — `src/component-language.ts`, `src/component-spec.ts`)

- `ComponentSpec.language?: 'jsx' | 'tsx'` (defaults to `'jsx'` when omitted via `ResolveComponentLanguage`).
- `ComponentSpec.erasableSyntaxOnly?: boolean` and `ComponentSpec.tsxMetadata?: ComponentTsxMetadata`.
- When `language === 'tsx'` and `erasableSyntaxOnly` is omitted, `ResolveErasableSyntaxOnly` resolves to `true` and disallows `'enum'`, `'namespace'`, `'parameter-property'`, and `'decorator'`.
- `ValidateComponentLanguageSpec` rejects unsupported language strings, malformed `tsxMetadata`, and contradictory `spec.erasableSyntaxOnly` vs `spec.tsxMetadata.erasableSyntaxOnly` values.

### 2.4 Remote Operations Allowlist (`P11` — `src/data-requirements.ts`)

- `ComponentDataRequirements.operations?: ComponentOperationDataRequirement[]` declares allowed `BaseRemotableOperation` keys (`operationKey`, `description?`, `executionMode?`, `requiredScope?`, `inputSchema?`, `maxCallsPerMinute?`, `optional?`).
- **Default-Deny Semantics**: Omitting `operations` resolves via `ResolveAllowedOperations` to `[]` (zero permitted operations).
- **Exact-Key Enforcement**: `IsValidOperationKey` and `ValidateOperationAllowlist` reject empty keys, whitespace, duplicate keys, and wildcard characters (`*`, `?`). `IsOperationAllowed(requirements, key)` provides the exact-match check for sandbox bridges.

### 2.5 Unified Update Host Adapter (`P18` — `src/update-host-adapter.ts`)

- `UpdateStatus`: `'idle' | 'checking' | 'downloading' | 'ready-to-apply' | 'store-upgrade-required'`
- `UpdateStateSnapshot`: `status`, `currentVersion`, `targetVersion?`, `minSupportedClientVersion?`, `releaseNotesUrl?`, `downloadProgress?` (`0..100`), `platform?` (`'web' | 'mobile' | 'desktop'`), `lastCheckedAt?`, `error?: UpdateErrorDescriptor` (`code`, `message`, `recoverable`, `timestamp?`)
- `UpdateHostAdapter`: `platform?`, `checkForUpdates(): Promise<UpdateStateSnapshot>`, `applyUpdate(): Promise<void>`, `subscribe(listener): UpdateUnsubscribe`

**State Machine Transitions (`UPDATE_STATE_TRANSITIONS`)**:

```text
idle ──► checking ──► downloading (0..100%) ──► ready-to-apply ──► idle (after apply/restart)
  │         │                │                        │
  │         ├──► idle        ├──► idle (error)        └──► idle (apply error)
  │         ├──► ready-to-apply (cached)
  └─────────┴──► store-upgrade-required ──► checking (retry only; OTA download/apply forbidden)
```

- `ValidateUpdateTransition(prev, next)` rejects non-monotonic progress (`next.downloadProgress < prev.downloadProgress` while downloading), requires `downloadProgress === 100` on `'ready-to-apply'` when present, and prevents bypassing `'store-upgrade-required'` via OTA download/apply.
- Transient network, offline, or signature failures revert to `'idle'` with `snapshot.error` populated (`UpdateErrorDescriptor`).

---

## 3. Migration & Verification Checklist

1. **Existing JSX Specs**: Leave `language`, `erasableSyntaxOnly`, and `operations` omitted. Verify with `ResolveComponentLanguage(spec) === 'jsx'` and `ResolveAllowedOperations(spec.dataRequirements).length === 0`.
2. **New TSX Widgets**: Declare `componentRole: 'widget'`, `language: 'tsx'`, `erasableSyntaxOnly: true`, explicit `dataRequirements.operations`, and validate `WidgetHostProps` + `WidgetSettingsSchema`.
3. **Tests**:
   - `cd packages/InteractiveComponents && pnpm run build && pnpm test`
   - `cd packages/InteractiveComponents && pnpm run test:integration`
