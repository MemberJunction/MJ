---
"@memberjunction/ng-conversations": minor
---

Realtime: close ONE live channel without ending the call (#3498)

Once two channel surfaces were open there was no way to close just one. A user done with the browser
but still wanting the whiteboard had a single option: end the call — which tore down both surfaces
plus the voice session.

`RealtimeSurfaceTabsComponent.RemoveTab` already existed and did the right thing, but its only
callers were review-mode cleanup, and **hiding a tab is not closing a channel**: the plugin stayed
initialized, its tools stayed advertised to the model, and (for Remote Browser) a server-side headless
Chrome kept running. So the agent could still act on a surface the user believed they had dismissed.

`RealtimeSessionService.CloseChannel(channelName)` is the real action. It flushes the channel's
debounced state save (a board closed three seconds after the last stroke does not lose those
strokes), points its tool prefix at a refusal, disposes the plugin — which is where the Remote Browser
channel stops its screencast and audio stream — drops it from the live set, tells the model the
surface is gone, and announces on the new `ChannelClosed$`. Tab removal is a **consequence** of that,
driven by the observable.

The tool prefix is re-registered with a refusal rather than unregistered, and that distinction
matters: the model was handed its vocabulary at connect and there is no mid-session way to withdraw
part of it, so `browser_*` stays callable regardless. An *unregistered* prefix is not inert — unrouted
tools fall through to the **server relay**, so the agent would keep driving the very browser the user
dismissed, now with no surface showing it. A refusal keeps the call local and gives the model an
answer it can narrate.

Tabs carry a `Closable` flag (channel tabs default to closable; Activity never is, being the panel's
fallback focus with nothing to release). A host can set `Closable: false` for a channel the session
depends on — closing withdraws a channel's tools for the rest of the session and is not undoable.

**Not covered here:** releasing the server-side browser on a per-channel close. The server-side
`RemoteBrowserChannel` ends it on SESSION close, and there is no mutation for "this one channel is
going away" — that needs a server change and is tracked separately.
