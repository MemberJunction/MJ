---
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
---

Records region gets VS Code preview-tab behavior, matching the main Golden Layout tabset.

Record tabs were born unpinned — and therefore italic, the shell's visual vocabulary for
"temporary" — but the temp-tab machinery was switched off for them when the region shipped, so
every record open minted a tab that nothing could replace or promote. Italic was inherited; the
behavior never was. Browsing records in an Open App produced a tab per click with no way out.

- **A second temp-tab pool.** `TabRequest.TempScope` (`'main' | 'records'`, default `'main'`)
  scopes both consumption in `OpenTab` and the pin cascade in `OpenTabForced`, selected by a new
  settable `WorkspaceStateManager.RecordsRegionTabFilter` predicate. The pools are disjoint in both
  directions: a nav click still can never consume an open record (the pre-existing protection is
  untouched), and a record open no longer disturbs the nav tab's temp status. This replaces the
  blunt `PreservePinState` opt-out that record opens used to pass; the flag remains for callers
  that genuinely want no cascade.
- **Gestures.** A plain record click reuses the region's single temporary tab; shift-click (or an
  explicit `forceNewTab`, which finally makes single-record's "Open in New Tab" do something) adds
  a tab and promotes the previous one. Double-click and right-click → Pin already worked.
- **Content follows the tab.** Consumption reuses the tab id — which is what keeps saved split
  layouts covering the exact tab set — so the records sync path gained the main path's
  `needsReload` treatment: detect the Entity/record change on a reused id, detach the outgoing
  record into the component cache, reload, re-capture the origin crumb.
- **Edits are never silently destroyed.** A record whose form is in edit mode leaves the pool, so
  the next plain open lands in its own tab instead of replacing it. New (unsaved) records open
  pinned for the same reason. `BaseResourceComponent.IsEditing()` is the new hook, default `false`.
- Deep-link and URL-driven record opens are scoped the same way, closing an asymmetry where a
  deep link could consume the nav temp tab and convert it into a records tab.
- Fixes `updateTabTitleFromResource` writing records-tab titles to the main layout manager, which
  no longer owned that tab id. Previously masked by the next configuration emission re-applying
  the title; replacement retitles a records tab on every plain click, so it stopped being cosmetic.

Open Apps inherit all of this through the shell with no changes on their side.
