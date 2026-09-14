# Extending the MJ Chat Surface — Web and Native

How to tailor MemberJunction's conversational UI for a product (Sidecar's Sid, a tutor surface, an
embedded assistant) **without forking it**, on Angular and React Native alike.

Read this before building a bespoke chat UI on top of MJ. Almost everything teams reach for a fork
to do is already an extension point.

---

## 1. The shape of the thing

MJ's conversational stack is split so that **no decision lives in a renderer**:

```
        @memberjunction/conversations-runtime          ← pure TypeScript, no DOM
        ────────────────────────────────────
        MentionParser         the @{"type":…} wire format
        MentionAutocomplete   who/what you may mention, permission-filtered + ranked
        ConversationAgentRunner   turn execution
        DefaultAgentResolver, Streaming, Sessions, …
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
   ng-conversations             MobileApp/src/chat
   (Angular templates)          (React Native)
```

A renderer owns **pixels and gestures**. Which agents you may address, which skills an agent
accepts, how a turn is routed, what a mention serializes to — all runtime. That is what keeps two
surfaces from disagreeing, and it is why extending is cheap: you are replacing presentation over an
engine that already knows the rules.

---

## 2. The four extension mechanisms

| Angular | React Native | Use it for |
|---|---|---|
| `@Input()` | props | configuration, feature switches |
| `@Output() EventEmitter` | `On*` callback props | observing and **intercepting** |
| public methods | `ref` + `useImperativeHandle` | commands (send this, refresh, focus) |
| `<ng-template mjChatSlot="x">` | component props with typed contracts | replacing whole visual zones |

Plus a fifth that is literally identical on both: **`MJGlobal.ClassFactory` registries**. Composer
trigger providers, artifact viewers and channel plugins resolve by key from the same registry with
the same base classes, so a plugin registered for the web is registered for both.

### 2.1 Slots

Seven named zones, same names on both surfaces:

`emptyState` · `agentPresence` · `header` · `headerActions` · `messageExtra` ·
`demonstrationSurface` · `messageRenderer`

Each has a typed contract and a **shipped default that is exported**, which is what makes three
different override styles possible:

| Pattern | When |
|---|---|
| **Replace** — supply your own component | The zone is wholly yours (Sid's character, Sid's welcome) |
| **Wrap** — render the default inside yours | You want framing/chrome but not to reimplement behaviour |
| **Extend** — override part of the contract, pass the rest through | You want the default with a different greeting, count, or title |

```html
<!-- Angular -->
<mj-conversation-chat-area>
  <ng-template mjChatSlot="emptyState"><sid-welcome /></ng-template>
  <ng-template mjChatSlot="agentPresence" let-state>
    <sid-character [State]="state" />
  </ng-template>
</mj-conversation-chat-area>
```

```tsx
// React Native
<MJChat
    ConversationID={id}
    Slots={{
        emptyState: SidWelcome,
        agentPresence: SidCharacter,
        header: (p) => <SidFrame><MJChatHeaderDefault {...p} /></SidFrame>,
    }}
/>
```

Two rules worth knowing before you design around them:

- **`headerActions` is additive** — it renders inside the default header's action strip, after the
  stock buttons. It is deliberately **not** rendered when a full `header` slot is supplied, because
  that slot owns the whole header including its actions.
- **`messageRenderer` is per-item**, not positional. It replaces the feed-vs-bubble decision itself,
  so you can change how every message looks without touching the list, its scrolling, or its
  pending/progress handling. Two defaults ship on both surfaces: a **feed** layout (avatar, name,
  timestamp — the default) and a **bubble** layout (identity from side and colour).

### 2.2 Intercepting, not just observing

The `Before*` half of MJ's cancelable event contract (see
[UI Layering Guide](UI_LAYERING_GUIDE.md)) lets a host veto rather than merely react:

```tsx
<MJChat
    OnBeforeSend={async (text) => (await containsPII(text)) ? false : true}
    OnTurnComplete={({ Success, ErrorMessage }) => track(Success, ErrorMessage)}
/>
```

---

## 3. Theming

Both surfaces read the same token vocabulary. The chat-specific group exists precisely so a product
can retheme the conversation without disturbing the rest of the palette:

```
--mj-chat-bubble-user-bg     --mj-chat-composer-bg
--mj-chat-bubble-user-text   --mj-chat-composer-border
--mj-chat-bubble-agent-bg    --mj-chat-presence-pulse-color
--mj-chat-bubble-agent-text  --mj-chat-voice-thinking
```

On the web these are CSS custom properties. React Native has no CSS, so the values are mirrored in
TypeScript (`MobileApp/src/theme/tokens.ts` → `ChatColors`); `@memberjunction/realtime-widget` does
the same for its shadow root. **`_tokens.scss` is the source of truth** — if a mirror disagrees with
it, the mirror is wrong.

> **Known duplication.** Three mirrors of one palette is a standing argument for promoting the
> values into a framework-neutral package that emits both the SCSS and a TS object. Not yet done;
> it touches the token pipeline and the `check:ui` gate.

---

## 4. The mention wire format

A message composed anywhere must be the same message. Mentions serialize to JSON tokens inside the
message text, and the runtime parses them back:

```
@{"type":"agent","id":"E7B3…","name":"Sage"}
@{"type":"skill","id":"9A21…","name":"Summarize"}
```

| Token | Becomes | Enforced where |
|---|---|---|
| `agent` | `explicitAgentId` — outranks any stored default | runtime |
| `skill` | `requestedSkillIDs` | server: ∩ agent's accepted skills ∩ your Run permission |
| `entity` / `query` | `entityMentions` | resolved by the target agent |
| `user` | `userMentions` | addressing / notification |

**Parse on send, not in the composer.** That keeps the wire format the single source of truth, so a
token typed by hand behaves exactly like one inserted from a picker.

---

## 5. When an extension point is missing

If you find yourself needing logic that lives inside a renderer, that is usually a packaging bug
rather than a reason to fork. The test:

> **Does the file import from `@angular/*`? If not, and a non-Angular host needs it, it is in the
> wrong package.**

Two capabilities have already made that trip — `RealtimeSessionRuntime` (2,768 lines) and
`MentionAutocomplete` (503 lines), both pure TypeScript stranded in an Angular package. Both moved
into runtime packages with a thin shim left behind so existing call sites did not change. Propose
the same rather than copying: a second copy of a permission rule is the copy that drifts.

---

## 6. Where things are

| | |
|---|---|
| Runtime | `packages/ConversationsRuntime/src/` |
| Angular surface | `packages/Angular/Generic/conversations/src/lib/` |
| Angular slot contracts | `…/components/slots/slot-interfaces.ts` |
| Native surface | `packages/MobileApp/src/chat/` |
| Native slot contracts | `packages/MobileApp/src/chat/slots.ts` |
| Native deep-dive | [`packages/MobileApp/src/chat/README.md`](../packages/MobileApp/src/chat/README.md) |
| Hosting an app on mobile | [MOBILE_APP_HOSTING_GUIDE.md](MOBILE_APP_HOSTING_GUIDE.md) |
