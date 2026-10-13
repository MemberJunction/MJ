---
'@memberjunction/ng-explorer-core': patch
'@memberjunction/ng-explorer-app': patch
---

The chat overlay's top boundary no longer throws NG0100 when the connectivity banner appears

`MJExplorerAppComponent.ChatOverlayTopBoundaryPx` read the banner height from the
`--mj-connectivity-banner-height` custom property with `getComputedStyle`. The banner publishes that
height from its `@slideDown.done` listener, which runs inside the animation flush while views are
still refreshing. Explorer is zoneless, so that listener only marks the shell view dirty, and a
targeted pass never re-reads the shell's binding — but dev-mode check-no-changes does, so every
later change-detection pass reported:

    NG0100: ExpressionChangedAfterItHasBeenCheckedError ... Previous value: '60'. Current value: '95'.

The banner now also exposes its height as a `HeightPx` signal (CSS consumers keep using the
property), and the shell reads it through a `viewChild` query of the banner. The write marks the shell
view as a stale consumer, so Angular re-refreshes it in the same pass. Dev-mode only — the overlay was
positioned correctly either way.
