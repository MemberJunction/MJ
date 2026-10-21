---
"@memberjunction/ng-base-forms": patch
---

A form contribution that declares an L1 `inclusion` is no longer pinned into the Details tab by its slot. The `before-fields` / `after-fields` slot still files a contribution into Details when it says nothing more specific, but a contribution registered `inclusion: 'Primary'` (e.g. an Overview at `before-fields`) now leads the left-nav rail as its own item again instead of vanishing inside Details.
