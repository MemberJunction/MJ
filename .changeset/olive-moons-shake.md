---
"@memberjunction/ng-entity-viewer": patch
---

Make the grid's Delete affordance reachable

The grid wrapper has always deleted correctly: `onDeleteConfirmed()` walks every
selected record, reports per-record failures and reloads the page. But the template
renders the Delete button only when `ToolbarConfig.showDelete && AllowDelete`, both
of which default to `false`, and the wrapper set neither — so the entire path was
unreachable. In practice there was no multi-record delete anywhere the grid is used:
removing ten rows meant opening ten records, one at a time.

`showDelete` now defaults to whether the user may actually delete this entity, and
`AllowDelete` is bound to the same permission. Defaulting to the permission rather
than to `true` keeps the button off exactly where the delete would have been refused
anyway, and an explicit `showDelete` in a view's config still wins in both directions
— though it can never grant the permission itself, since `AllowDelete` is bound to
the check, not to the config.

The permission check mirrors `recycle-bin.component.ts`, the package's other delete
surface, so both agree on what "can delete" means. A metadata provider that cannot
answer is treated as "no", never as permission.
