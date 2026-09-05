---
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-timeline": patch
---

Photo/logo/avatar cells crop, center, and scale to the cell (28px circle in the grid, 48px circle on cards, 40px circle on timeline). AG Grid injects HTML without Angular attributes, so size is also inlined on the img. Timeline auto-binds PhotoURL/LogoURL as the card image. The header/pager total is a `count_only` RunView with IgnoreMaxRows so UserViewMaxRows (default 1000) cannot cap the count.
