---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/standards": patch
---

- **Record Links Slide-In Drawer, Embeddable `<mj-record-links>` Widget & Core `GetRecordDependencies` Upgrades**:
  - Added `GetRecordDependenciesOptions` (`LinkType?: 'both' | 'hard' | 'soft'`, `IncludeSystemEntities?: boolean`, `EntityNames?: string[]`) and `FieldDisplayName` hydration across `@memberjunction/core`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/postgresql-dataprovider`, `@memberjunction/graphql-dataprovider`, and `@memberjunction/server`.
  - Updated `BuildSoftLinkDependencySQL` to match both canonical `ID|<guid>` and bare `<guid>` single-PK references and scan physical `[Schema].[BaseTable]` objects instead of views when all referenced columns are non-virtual.
  - Added `<mj-record-links>` and `<mj-record-links-drawer>` plus the built-in **Links** toolbar action (`'links'`) on `<mj-form-toolbar>` and `<mj-record-form-container>`.
- **Generic `<mj-form-field>` Original-Value Popover, Clean-Field Live Auto-Merge & Dirty-Field Conflict Resolution**:
  - Added a subtle `fa-clock-rotate-left` original-value popover with one-click **Restore** on modified fields in `<mj-form-field>`.
  - Upgraded `record-form-container` and `FormRecordRefreshCoordinator` so remote record updates arriving during Edit Mode auto-merge clean fields in place and surface inline **Keep mine** / **Use new value** conflict resolution cards on dirty fields whose server value changed.
- **Zero-Restart Cache Auto-Reconciliation (`GetDatasetByName` & `RunViewsWithCacheCheck`)**:
  - Added `lastVerifiedAt` tracking on `LocalCacheManager` RunView slots, bounded server-slot freshness verification (`ServerCacheVerificationTTLMs`), client-monotonicity guard in `RunViewsWithCacheCheck`, `GetDatasetByName` SQL status reconciliation, and per-item row-count verification in `adoptServerMetadata()`.
- **`polymorphic-fk` Standard Check (`@memberjunction/standards`)**:
  - Added `PolymorphicFKCheck` (`polymorphic-fk`) to enforce that polymorphic Entity+Record FK pairs declare `EntityField.EntityIDFieldName` in metadata.
- **Calm Voice-First Realtime UI Declutter (`@memberjunction/ng-conversations`)**:
  - Suppressed the top audio-only avatar notice alert by default (`ShowAvatarNotice = false`) and hid the bottom `"Agent can see"` perception chip until the user actively captures their camera or screen (`CameraOn || Sharing`, or `ShowPerceptionChip = true`), while giving `RemoteBrowserChannel` its proper descriptor `SourceID` and `Label` (`Remote Browser`).
  - Deduplicated live speaking/listening status pills between `<mj-realtime-agent-banner>` and the center hero orb (`[HideState]="ShowHero && !PresenterOnStage"`), and tucked inactive Camera/Screen Share controls into the `•••` More menu in orb/compact mode so the primary bottom dock stays a clean 4-button bar (`Mic`, `Captions`, `More •••`, `End call`).
