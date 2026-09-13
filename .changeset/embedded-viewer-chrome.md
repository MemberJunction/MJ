---
"@memberjunction/ng-entity-viewer": patch
---

Add EntityViewerConfig.chrome (`workspace` | `embedded`). Embedded hides filter, view-mode toggle, record count, and pagination, and seeds the Grid plug-in with toolbar and pager off. Hosted grids no longer show a second Search box — the container already owns filter text.
