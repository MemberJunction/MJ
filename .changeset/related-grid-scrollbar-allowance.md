---
"@memberjunction/ng-base-forms": patch
---

Fix a `fit-content` / related-entity grid clipping its last row when its columns are wider than the container (#4223).

`RelatedGridHeightPx` budgets toolbar + header + rows + pad and hands that height to AG Grid, which lays its horizontal scrollbar out *inside* the box — so whenever the columns overflow, the scrollbar (15px on classic-scrollbar platforms) is taken out of the row area and the last row is sliced. With one row the data row lost roughly half its height.

- `RelatedGridHeightPx(rowCount, maxHeight, scrollbarPx?)` gains a third parameter for the measured scrollbar height. A measurement replaces the fixed `RELATED_GRID_HSCROLLBAR_PX` reserve that #4245 introduced (0 releases it entirely; a real bar is budgeted exactly), never past `maxHeight`. A caller that omits it keeps #4245's fixed reserve, so every existing call site's result is unchanged.
- `<mj-explorer-entity-data-grid>` measures the allowance from the DOM instead of assuming it: the height AG Grid's fake horizontal scroller (`.ag-body-horizontal-scroll`) takes in the flow, and 0 when it is collapsed or absolutely positioned (overlay scrollbars, which draw over the rows and take no space). The measurement runs two frames after each data load (after AG Grid's own layout frame) and again whenever the host or the scroller resizes, so a scrollbar that appears or disappears as the panel narrows or widens is budgeted or released without a reload.
- The chrome constants are the live-measured set #4245 landed (toolbar 49, header 49, wrapper borders 4, bottom pad 2, empty body 56); this change adds the measured scrollbar on top rather than a second set of numbers.
