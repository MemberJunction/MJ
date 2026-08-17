---
"@memberjunction/ng-conversations": minor
---

Realtime surface panel: show surfaces side by side, through the component's own API (#3535)

`RealtimeSurfaceTabsComponent` showed exactly one pane at a time, and arranging two from outside
could not be done honestly. MJ emits `.surface { display: flex }` at specificity (0,2,0) with
Angular's attribute scoping; a host writing `.surface.my-split { display: grid }` is **also** (0,2,0);
ties break on document order, and component styles are injected when the component first renders —
after a host stylesheet added at startup. So MJ won, and the failure was invisible:
`grid-template-columns` computed correctly and was silently ignored on a flex container. The
workaround was doubling the class (`.surface.my-split.my-split`), which works and which nobody should
have to know.

`[SplitKeys]` names the tab keys to show side by side, in the order the panes should read.
`null`/`[]` is the ordinary tabbed panel, which is the default and what every existing host gets.

**One input rather than a `Layout` mode plus a key list**, deliberately: two inputs make "split with
no keys" expressible, and that state has no good answer — an empty panel or a silent downgrade, both
surprises. "Split these" is the whole instruction, so the invalid combination does not exist.
`Layout` is a read-only `'tabs' | 'split'` derived from it, and it reports `'tabs'` when fewer than
two named surfaces are actually present, so naming a channel before it exists is safe.

Host order is honoured through CSS `order`, not by reordering the DOM — moving pane elements would
tear down and recreate the dynamically-created channel surfaces inside them, blanking a live browser
canvas because someone wanted it on the left. A focused tab outside the arrangement stays hidden, so
choosing a third surface cannot drop an extra pane into a two-column grid, and the focused pane keeps
an accent so "which one am I acting on" stays answerable.

Also addresses the issue's secondary ask: every pane now carries `data-channel` and `data-tab-kind`,
so a host pairs a pane with its channel by identity instead of by index — which only ever worked
because both lists render from the same array in the same order.
