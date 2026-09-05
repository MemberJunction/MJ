---
"@memberjunction/ng-base-forms": patch
---

Fix a `fit-content` / related-entity grid clipping its last row when its columns are wider than the container (#4223).

`RelatedGridHeightPx` budgets toolbar + header + rows + pad and hands that height to AG Grid, which lays its horizontal scrollbar out *inside* the box — so whenever the columns overflow, the scrollbar (15px on classic-scrollbar platforms) is taken out of the row area and the last row is sliced. With one row the data row lost roughly half its height.

- `RelatedGridHeightPx(rowCount, maxHeight, scrollbarPx = 0)` gains a third parameter for the measured scrollbar height. It is added to the content height, never past `maxHeight`, and the default keeps every existing call site's result unchanged.
- `<mj-explorer-entity-data-grid>` measures the allowance from the DOM instead of assuming it: the height AG Grid's fake horizontal scroller (`.ag-body-horizontal-scroll`) takes in the flow, and 0 when it is collapsed or absolutely positioned (overlay scrollbars, which draw over the rows and take no space). The measurement runs two frames after each data load (after AG Grid's own layout frame) and again whenever the host or the scroller resizes, so a scrollbar that appears or disappears as the panel narrows or widens is budgeted or released without a reload.
- `RELATED_GRID_HEADER_PX` is now 49px, the height AG Grid's theme actually renders for the column header (48px + 1px border), instead of 40px. The old value left every related grid 9px short, which showed as a ~4px clip of the last row's bottom border on every platform, scrollbar or not.
