---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
"@memberjunction/ng-workspace-initializer": patch
"@memberjunction/ng-realtime-widget": patch
"@memberjunction/ng-markdown": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-explorer-core": patch
---

Wave 4.2a Angular idle CPU, FK record-name microtask coalescing, `AngularGraphQLDataProvider` background transport hook, and O(1) streaming markdown:
- `@memberjunction/graphql-dataprovider`: coalesce concurrent `GetEntityRecordName` cache misses within a microtask tick into a single batched `GetEntityRecordNames` query, add framework-neutral `ExecuteInBackgroundScope` hook on `GraphQLDataProvider` around WebSocket setup/watchdogs/subscriptions/timers, and support pre-constructed or `ClassFactory`-registered provider subclasses in `SetupGraphQLClient` and `ConnectGraphQLClient`.
- `@memberjunction/ng-shared-generic`, `@memberjunction/ng-bootstrap`, `@memberjunction/ng-workspace-initializer`, `@memberjunction/ng-realtime-widget`: add `@RegisterClass(GraphQLDataProvider)` `AngularGraphQLDataProvider` + `SetupAngularGraphQLClient` / `ConnectAngularGraphQLClient` delegating `ExecuteInBackgroundScope` to `NgZone.runOutsideAngular` so WebSocket traffic never triggers spurious Angular change-detection ticks while keeping `@memberjunction/graphql-dataprovider` 100% framework-agnostic.
- `@memberjunction/ng-markdown`: memoize `Marked` configuration in `MarkdownService` and incrementally render only the uncommitted tail block in `MarkdownComponent` during streaming (`O(1)` per chunk instead of `O(N^2)` full-document re-parse and `innerHTML` replacement).
- `@memberjunction/ng-base-forms`: replace unconditional 200ms `NgZone` dirty-state `setInterval` polling in `MjRecordFormContainerComponent` with event-driven `FormFieldEditCoordinator` + `BaseEntity` listeners and an edit-mode-only `runOutsideAngular` fallback; normalize UUID case comparison and sequence-guard async FK name lookups in `MjFormFieldComponent`.
- `@memberjunction/ng-entity-viewer`: defer `RecycleBinChipComponent` deleted-record count queries via `IntersectionObserver` until the chip enters the viewport and project only `Fields: ['RecordID']` with `SkipTotalRowCount: true`.
- `@memberjunction/ng-explorer-core`: detach `ChangeDetectorRef` for hidden/stacked tabs, off-DOM cached components, and inactive dual-region layouts while keeping active and visible side-by-side Golden Layout split-pane tabs live.
