---
'@memberjunction/ng-entity-viewer': patch
'@memberjunction/ng-dashboards': patch
---

Reveal hover-gated row actions on keyboard focus, and stop a card collapsing under
its own content.

- `view-selector` and `home-dashboard` gated row/pin actions on `:hover` alone. At
  `opacity: 0` they were pointer-only — invisible to a tabbing keyboard user and
  unreachable without a mouse. Added `:focus-within`.
- `ps-catalog` cards had no `flex-shrink: 0`. The default shrink compressed the guide
  card below its own content at 1280x720 (46px vs 166px) and the overflow landed
  *behind* the `position: relative` gallery cards, making filter chips genuinely
  unclickable.

Note: roughly 20 other stylesheets still gate row actions on `:hover` alone. Not
addressed here — worth a dedicated sweep.
