# Double toast per request — investigation handoff

**Report (Amith, 2026-09-03, via Slack):** "toast messages have moved to top right corner in
latest MJ. that is good by me but I also seem to see two toast messages for every request,
something to address in above PR pls."

Status: **root cause not yet confirmed.** Static analysis of the entire toast pipeline on
`next` (2026-09-03) found every delivery path to be single-shot. The doubling is therefore
almost certainly a *runtime* condition (a stacked subscription, a duplicated bundle copy, or
a server double-publish for one logical event) that needs a live repro to pin. Everything
ruled out below is ruled out with file:line receipts so nobody re-treads it.

## Context: what moved the toasts (not a bug)

`4dd3cd0562` (AN-BC, 2026-08-18, on `next`) — "feat(notifications): modernize global toast
UI". Moved the container from top-center to top-right, added card styling + auto-hide.
The renderer is DOM-based, not Angular: `MJNotificationService.showToast()` appends children
to a singleton `#mj-toast-container` div
([notifications.service.ts:281-301](../packages/Angular/Generic/notifications/src/lib/notifications.service.ts)).

Important detail for the repro: **both the old and new implementations stack toasts in a
flex column with a gap**. If duplication were long-standing it would have been visible
before the redesign too — so treat the doubling as *probably recent*, but don't trust that
assumption blindly; duplicates at top-center may simply have gone unnoticed.

## The toast pipeline (all paths that can render a toast)

Everything funnels into `MJNotificationService.CreateSimpleNotification()` →
`showToast()`. Callers:

1. **Direct calls** from components (`MJNotificationService.Instance.CreateSimpleNotification(...)`).
2. **`MJEventType.DisplaySimpleNotificationRequest`** events on the MJGlobal bus — the
   service's constructor subscribes once ([notifications.service.ts:74-80](../packages/Angular/Generic/notifications/src/lib/notifications.service.ts)).
3. **Push status updates** (WebSocket): the service's `LoggedIn` handler subscribes to
   `GraphQLDataProvider.PushStatusUpdates()` and toasts:
   - `type: 'notification'` + `action: 'create'` → toasts `statusObj.title`
     ([notifications.service.ts:120-135](../packages/Angular/Generic/notifications/src/lib/notifications.service.ts))
   - any other type with a top-level `message` string, except `askskip`,
     `entityobjectstatusmessage`, `realtimedelegationprogress` → toasts `statusObj.message`
     ([notifications.service.ts:136-143](../packages/Angular/Generic/notifications/src/lib/notifications.service.ts))
4. **Agent client tool** `ShowNotification` registered in
   [explorer-app.component.ts:909-928](../packages/Angular/Explorer/explorer-app/src/lib/explorer-app.component.ts)
   — an agent can ask the browser to toast.

## Ruled out (with receipts)

- **Two `MJNotificationService` instances / double bus subscription.** Constructor has a
  global-object-store singleton guard (returns the existing instance before subscribing) —
  [notifications.service.ts:67-73](../packages/Angular/Generic/notifications/src/lib/notifications.service.ts).
  Guard has existed since `b643ed7eb0` (2026-02-23). Angular DI, `Instance` static, and any
  duplicated module copy ≥ that vintage all converge on one instance.
- **`LoggedIn` raised twice** (which would stack a second `PushStatusUpdates` subscription —
  see "latent bug" below). Only one raiser exists:
  `setupGraphQLClient` ([GraphQLDataProvider/src/config.ts:30](../packages/GraphQLDataProvider/src/config.ts)).
  Both app shells reach it through a `take(1)` auth subscription:
  [explorer-app.component.ts:354-355](../packages/Angular/Explorer/explorer-app/src/lib/explorer-app.component.ts),
  [auth-shell.component.ts:132-133](../packages/Angular/Bootstrap/src/lib/components/auth-shell.component.ts).
  `RefreshToken()` / `Config()` do not re-raise it.
- **Event bus double delivery.** `MJGlobal.RaiseEvent` nexts a plain Subject + a
  ReplaySubject(100, 30s); one subscriber receives each event once
  ([MJGlobal/src/Global.ts:66-93](../packages/MJGlobal/src/Global.ts)).
- **Client WS fan-in.** `PushStatusUpdates()` multiplexes per sessionId through a cached
  Subject (`_pushStatusSubjects`) — N calls share one GraphQL subscription
  ([graphQLDataProvider.ts:3309-3340](../packages/GraphQLDataProvider/src/graphQLDataProvider.ts)).
- **Server subscription filter.** `statusUpdatesFilter` requires sessionId AND
  connection-identity match; a publish reaches a given subscription once
  ([PushStatusResolver.ts:85-99](../packages/MJServer/src/generic/PushStatusResolver.ts)).
- **Server double-publish per agent request.** For one run, completion notification and
  feedback-request notification are mutually exclusive in practice (artifact success vs
  paused-for-input), each publishing one `type:'notification'` message
  ([RunAIAgentResolver.ts:480-517](../packages/MJServer/src/resolvers/RunAIAgentResolver.ts)).
  Progress/streaming/final events use `{resolver,type,status,data}` envelopes with **no
  top-level `message`** → never toast ([RunAIAgentResolver.ts:307-325, 615-660](../packages/MJServer/src/resolvers/RunAIAgentResolver.ts)).
  Heartbeat pulses likewise ([FireAndForgetHeartbeat.ts:78-90](../packages/MJServer/src/generic/FireAndForgetHeartbeat.ts)).
  `EntityObjectStatusMessage` relays DO carry `message` but are excluded client-side.
- **`NotificationEngine.SendNotification` double-pushing.** It creates the DB row + email/SMS
  only; no pubsub publish anywhere in `packages/Communication/notifications`.
- **A second push consumer that toasts.** The service re-raises every push as
  `ComponentEvent "PushStatusUpdates"`; grep found zero consumers that toast on it.
- **Cache-invalidation lane.** The `MJ: User Notifications` remote-invalidate updates
  `UserInfoEngine` arrays / badge counts only; no subscriber of `Notifications$` /
  `UnreadCount$` toasts (shell uses it purely for the bell badge,
  [shell.component.ts:526-531](../packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts)).
- **Conversations' second `NotificationService`** (`packages/Angular/Generic/conversations/src/lib/services/notification.service.ts`)
  is badge/unread state + cross-tab localStorage sync; renders no toasts.
- **PR #4121 (a11y shell)** touched no notification code; its commits are shell landmarks,
  focus containment, whiteboard shortcuts, focus-ring tokens.

## Remaining hypotheses, ranked

1. **Stacked `PushStatusUpdates` subscription at runtime.** The `LoggedIn` handler
   subscribes with **no guard and no teardown**
   ([notifications.service.ts:103-144](../packages/Angular/Generic/notifications/src/lib/notifications.service.ts)).
   Static analysis says `LoggedIn` fires once — but any runtime path that re-fires it
   (magic-link flows? MJ Central's shell? a second provider Config in a multi-provider
   setup? something in Amith's deployment that calls `setupGraphQLClient` again) instantly
   produces exactly "two toasts for every push-driven event" while leaving direct-call
   toasts single. **This is also a latent bug regardless of whether it's Amith's bug** —
   fix it defensively (see below).
2. **Same logical event published twice server-side in Amith's flow.** E.g. his "request"
   flow hits a resolver path that publishes the completion twice, or two servers behind a
   load balancer both publish (cross-server pubsub echo). Needs his repro details.
3. **Two service copies in the deployed bundle** (one older than the 2026-02 singleton
   guard). Both would append into the *same* `#mj-toast-container` (first creator wins on
   position), rendering two near-identical toasts per event. Unlikely on "latest MJ" but
   trivially distinguished by the repro step below (two different toast styles = smoking gun).

## 5-minute repro instrumentation (do this first)

In the running app's DevTools, before triggering a request:

```js
const svc = Object.getPrototypeOf(MJNotificationService?.Instance ??
  window.__MJGlobalObjectStore?.['___SINGLETON__MJNotificationService']);
const orig = svc.CreateSimpleNotification;
svc.CreateSimpleNotification = function(...args) {
  console.log('TOAST', args[0], new Error().stack);
  return orig.apply(this, args);
};
```

Then trigger one request and read the console:
- **Two logs, different stacks** → two callers/subscriptions; the stacks name the culprit
  (hypothesis 1 or 2 — a stack through the push handler twice = stacked subscription).
- **Two logs, identical stacks** → same event delivered twice (server double-publish).
- **One log but two DOM toasts** → duplicated bundle copy (hypothesis 3); confirm via
  subtle style differences between the two toasts.

Also ask Amith (or observe): are the two toasts pixel-identical? Do BOTH auto-dismiss on
the new timers? What exactly is "a request" in his repro — a conversation/agent message, a
record save, or something else?

## Fix to ship regardless of root cause

Guard the push subscription so it can never stack — in the `LoggedIn` case of
`MJNotificationService`'s constructor, keep the `Subscription` and tear down before
re-subscribing:

```ts
private pushStatusSub: Subscription | null = null;
// in the LoggedIn case:
this.pushStatusSub?.unsubscribe();
this.pushStatusSub = this.PushStatusUpdates().subscribe(...)
```

This converts every re-login/re-config path from "double toasts forever" to "clean
re-subscribe", and costs nothing. Package: `@memberjunction/ng-notifications`, patch
changeset. (Separately worth noting while in there: after a JWT-expiry cycle the push
subject completes and the service never re-subscribes — pushes silently stop toasting until
reload. Same guard structure is the natural home for a re-subscribe.)

## Open questions for the fix PR

- Which PR did Amith mean by "above PR"? His comment came via Slack; PR #4121 (this
  branch's PR) was already merged and contains no toast code. The fix likely wants its own
  small PR against `next`.
- Whether MJ Central / the deployment Amith uses runs `mj-explorer-app` or a different
  shell (different auth flow = different `LoggedIn` cardinality).
