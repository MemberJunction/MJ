---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/ng-base-forms": patch
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
