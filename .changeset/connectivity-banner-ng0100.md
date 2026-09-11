---
'@memberjunction/ng-explorer-core': patch
---

The connectivity banner no longer throws NG0100 when the socket drops mid-render

`ServerConnectivityBannerComponent` held its visibility in a plain property assigned from an
`IsConnected$` subscription. That observable is driven by graphql-ws, which reports "socket closed"
from whatever callback happens to be running — and during Explorer startup that lands *inside* an
in-flight change-detection pass, after the banner's own view has already been checked. The
assignment then contradicts the `@if` Angular just evaluated, and the dev-mode check-no-changes pass
reports it:

    NG0100: ExpressionChangedAfterItHasBeenCheckedError ... Previous value: '-1'. Current value: '0'.

`-1` and `0` are not the connectivity state; they are `@if`'s branch index, where `-1` means "no
branch rendered". So the error is precisely the banner appearing a fraction of a pass too late. It
fired once per socket drop or refresh during load, four times on a cold start.

The state is now a signal (`toSignal(IsConnected$)`) read as `IsConnected()` in the template.
Reading a signal from a template registers the view as its consumer, so a write marks that view
dirty and Angular re-refreshes it inside the same pass — the DOM and the expression can no longer
disagree, whenever the write arrives. That is a structural fix rather than a deferral: nothing is
pushed to a later tick, and no error is suppressed.

`toSignal` also owns the subscription through `DestroyRef`, which retires the manual `Subscription`
field and the `OnInit` hook; `ngOnDestroy` stays, because it still has to clear the
`--mj-connectivity-banner-height` custom property it publishes on `<html>`.

The DOM spec gains a host component that drops the connection from `ngAfterViewInit` — a hook that
runs inside the pass, after child views are refreshed — which reproduced the reported error verbatim
against the old code. The existing specs drop the `detectChanges(false)` + `markForCheck` nursing
they needed to work around the bug, and now assert through the strict check-no-changes path.
