---
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-bootstrap": patch
---

Add the Work Queue operator dashboard to Explorer (`WorkQueueDashboard`, lazy chunk `@memberjunction/ng-dashboards/work-queue-dashboards.module`): an Overview of every transport, topic and subscription joined with live `WorkQueue.GetSubscriptionStats` reads (15 s auto-refresh while visible), a Dead Letters tab with envelope and payload viewer and confirmed replay / discard-with-reason, a Partitions tab for blocked, in-flight and idle Ordered keys with head replay / discard, and a Bindings tab over `WorkQueue.ValidateBindings`. State round-trips through the `section`, `subscription` and `condition` query params, replay and discard are gated on Update permission for `MJ: Work Queue Subscriptions`, and the surface publishes read-only agent context and navigation tools. A `Work Queue` application record (`metadata/applications`) carries the dashboard as its default nav item plus the five work-queue entities.
