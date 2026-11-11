---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-markdown": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-explorer-core": patch
---

Wave 4.2a Angular idle CPU, FK record-name microtask coalescing, and O(1) streaming markdown:
- `@memberjunction/graphql-dataprovider`: coalesce concurrent `GetEntityRecordName` cache misses within a microtask tick into a single batched `GetEntityRecordNames` query, and run WebSocket connection/heartbeat/subscription callbacks outside Angular's `NgZone` (`Zone.root`) to eliminate idle change-detection churn.
- `@memberjunction/ng-markdown`: memoize `Marked` configuration in `MarkdownService` and incrementally render only the uncommitted tail block in `MarkdownComponent` during streaming (`O(1)` per chunk instead of `O(N^2)` full-document re-parse and `innerHTML` replacement).
- `@memberjunction/ng-base-forms`: replace unconditional 200ms `NgZone` dirty-state `setInterval` polling in `MjRecordFormContainerComponent` with event-driven `FormFieldEditCoordinator` + `BaseEntity` listeners and an edit-mode-only `runOutsideAngular` fallback; normalize UUID case comparison and sequence-guard async FK name lookups in `MjFormFieldComponent`.
- `@memberjunction/ng-entity-viewer`: defer `RecycleBinChipComponent` deleted-record count queries via `IntersectionObserver` until the chip enters the viewport and project only `Fields: ['RecordID']` with `SkipTotalRowCount: true`.
- `@memberjunction/ng-explorer-core`: detach `ChangeDetectorRef` for hidden/stacked tabs, off-DOM cached components, and inactive dual-region layouts while keeping active and visible side-by-side Golden Layout split-pane tabs live.
