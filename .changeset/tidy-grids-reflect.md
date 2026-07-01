---
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-list-detail-grid": patch
---

Fix MJ Explorer view configuration (#2974): "Visible Columns" edits now reflect in the grid (the grid view type is backed by the canonical UserView.GridState rather than a divergent per-view-type copy), and the "Manage Columns" toolbar item now opens the config panel instead of doing nothing. Embedded/related-entity grids (custom-form and list-detail) suppress the column chooser since they aren't saved User Views.
