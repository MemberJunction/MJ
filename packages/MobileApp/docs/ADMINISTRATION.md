# Administering MJ Mobile

What a MemberJunction administrator needs to configure so the mobile app works, and how to
diagnose it when it does not.

This is the operator's companion to [`ARCHITECTURE.md`](ARCHITECTURE.md) (how it is built) and
[`CONTRIBUTING.md`](CONTRIBUTING.md) (how to work on it). Everything here is server-side or
metadata — none of it requires rebuilding the app.

---

## 1. What the app needs from a deployment

The mobile app is a **client of your MJAPI**, exactly like MJ Explorer. It brings no server of its
own and stores nothing a browser would not. If Explorer works for a user, mobile mostly works too —
the exceptions are listed below, and each one is a deliberate server-side switch rather than
something the app can decide for itself.

| Capability | Needs | Fails as |
|---|---|---|
| Sign-in | Your existing auth provider (Auth0 / MSAL) | Login screen loops |
| Chat, Explorer, apps | Nothing beyond Explorer's own requirements | — |
| **Realtime voice** | `realtime.enabled` **and** a realtime model with a resolvable key | See §3 |
| **Push notifications** | `UI` role Update on `MJ: User Settings` | Token silently not stored |
| **Agent sessions** | `UI` role permissions + RLS filters (§4) | Voice cannot mint a session |

---

## 2. Permissions the app relies on

Mobile runs as an ordinary signed-in user holding the **`UI`** role. Two grants were added for the
realtime co-agent and are part of this feature's metadata:

| Entity | Read | Create | Update | Delete | Row-level filter |
|---|---|---|---|---|---|
| `MJ: AI Agent Sessions` | ✅ | ✅ | ✅ | ❌ | `UI: Own Agent Sessions` |
| `MJ: AI Agent Session Channels` | ✅ | ✅ | ✅ | ❌ | `UI: Own Agent Session Channels` |

**The row-level filters are not optional.** Both entities are keyed to a user, and the `UI` role is
held by *every* ordinary user — unscoped, one person could read and modify another's sessions,
including `Config_`, `RecordingFileID` and `LinkedRecordID`. The filters scope each to
`UserID = '{{UserID}}'` (and, for channels, through the parent session).

They ship as a **migration** rather than under `metadata/`, because `MJ: Row Level Security Filters`
grants Create to no role and `mj sync push` is therefore refused. That is the same reason the
`Widget Guest` filters were seeded that way.

> **Delete is deliberately withheld.** The app never deletes a session or a user setting. Turning
> notifications off clears the stored value rather than removing the row, so the feature does not
> depend on a permission end users are not given.

---

## 3. Enabling realtime voice

Voice is the one feature with real configuration. Three things must all be true.

### 3.1 Turn on the SDP broker

```js
// mj.config.cjs
realtime: {
  enabled: true,
},
```

**Defaults to `false`.** When off, the ticket-gated WebRTC SDP broker route is never mounted, the
client's offer falls through to the authenticated catch-all, and the app reports:

```
OpenAI Live WebRTC handshake failed (401): {"error":"Authentication required"}
```

That message reads exactly like a bad API key and is not one. **If you see a 401 mentioning
"Authentication required" rather than an OpenAI error shape, check this switch first.** A genuine
OpenAI rejection looks like `{"error":{"message":…,"type":…}}`.

### 3.2 Supply a key for a model the app can carry

Keys resolve by **driver class**, not by vendor name:

```bash
# GPT-Live 1 — the highest-ranked realtime model in a stock deployment
AI_VENDOR_API_KEY__OpenAILiveRealtime = 'sk-...'

# GPT Realtime 2.x — same key, different driver class
AI_VENDOR_API_KEY__OpenAIRealtime = 'sk-...'
```

The server ranks realtime models by `PowerRank` and picks the highest whose driver has a
**resolvable key**. A model with no key is skipped silently, which is why a deployment with only a
Gemini key resolves Gemini Live even though GPT-Live outranks it.

### 3.3 Understand which providers a mobile build can carry

| Provider | Transport | Mobile |
|---|---|---|
| OpenAI GPT-Live (`openai-live`) | WebRTC | ✅ |
| OpenAI GPT Realtime (`openai`) | WebRTC | ✅ |
| Gemini Live, Grok Voice, ElevenLabs Agents, AssemblyAI | WebSocket + PCM16 | ❌ |

The WebSocket providers own their audio plane and need a Web Audio API that does not exist under
Hermes. The app **declines them up front** — minting the session, closing it server-side, and
naming the provider — rather than opening a call that would be silent in both directions.

So if voice shows *"This workspace's voice provider (gemini) needs audio support this app build
doesn't have"*, the app is working correctly and the deployment needs a WebRTC provider key.

---

## 4. Applications on mobile

The launcher reads the **same `MJ: Applications` metadata Explorer reads**. There is no mobile app
list to maintain. An application appears when:

1. its `Status` is `Active` — retired applications are filtered exactly as on the web; and
2. the user has an active `MJ: User Applications` row, **or** (for a user with no rows at all) the
   application is flagged `DefaultForNewUser`.

Nav items are filtered the same way: an item with a `Status` other than `Active` is hidden.

**What opens on a phone** depends on the nav item's `ResourceType`:

| `ResourceType` | Mobile behaviour |
|---|---|
| `Custom` | Opens if this build registers a surface for its `DriverClass`; otherwise an honest "opens on desktop" card |
| `Dashboards` | Renders the dashboard named by `RecordID` |
| anything else | "opens on desktop" |

That is a **build-time** decision on mobile and a runtime one on the web: a native binary cannot
load application code out of band, so which applications ship a phone surface is fixed when the app
is built. Nothing about your metadata changes.

---

## 5. Push notifications

Tokens are stored per user in `MJ: User Settings` under `mobile.pushDeviceToken`, keyed by
installation, so one person's phone and tablet coexist. The `UI` role needs **Update** on that
entity; without it registration fails quietly and the user simply never receives anything.

Delivery goes through the existing communication framework's Expo provider — a push token is just a
recipient address, so no new entity or provider configuration is required.

---

## 6. Diagnosing a broken install

Work down this list; each step rules out a whole class of failure.

| Symptom | Most likely cause |
|---|---|
| Login loops | Auth provider not configured for the app's redirect scheme |
| `GraphQL Error (Code: unknown)` on every screen | App cannot reach MJAPI — check the host/port, and on an Android emulator remember `localhost` is the *emulator* (use `10.0.2.2`) |
| Screens load but lists are empty | Entity permissions for the `UI` role |
| "Dashboards · 0 available" with dashboards present | Historically an entity-name bug, fixed in v6.1; if it recurs, check `MJ: Dashboards` read permission |
| Voice: 401 "Authentication required" | `realtime.enabled` is false (§3.1) |
| Voice: "needs audio support this app build doesn't have" | Deployment resolved a WebSocket provider (§3.3) |
| Voice: "server doesn't have voice enabled yet" | No realtime model resolved at all — no key for any of them |
| Notifications never arrive | `UI` role lacks Update on `MJ: User Settings` (§5) |

---

## 7. What the app stores on the device

| Data | Where | Cleared by |
|---|---|---|
| Auth tokens | Expo SecureStore (Keychain / Keystore) | Sign out, app uninstall |
| Cached conversations, entity metadata | MMKV | Sign out, app uninstall |
| Preferences (default agent, appearance) | MMKV **and** `MJ: User Settings` | — |
| Offline mutation queue | MMKV | Successful sync, sign out |

Sign-out clears local caches and the stored auth material. Nothing is written to a location a
backup would capture in plaintext.
