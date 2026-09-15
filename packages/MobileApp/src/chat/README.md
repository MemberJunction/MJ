# The mobile chat surface

A native chat experience that is **the same product** as MJ Explorer's chat — same metadata, same
runtime, same mention wire format, same extension model — rendered with React Native primitives
instead of Angular templates.

This document is the contract. If you are tailoring the chat for a product (Sidecar's Sid, a tutor
surface, an embedded assistant), everything you need is here.

---

## 1. The principle: one engine, many renderers

MJ's conversational stack is deliberately split so that **no decision lives in a renderer**:

```
                    ┌─────────────────────────────────────────┐
                    │  @memberjunction/conversations-runtime   │
                    │  ─────────────────────────────────────  │
                    │  MentionParser      — @{"type":…} tokens │
                    │  MentionAutocomplete— who/what you may   │
                    │                       mention, ranked    │
                    │  ConversationAgentRunner — turn execution│
                    │  DefaultAgentResolver, Streaming, …      │
                    └──────────────┬──────────────────────────┘
                                   │  pure TypeScript, no DOM
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
    ┌───────────────────────┐            ┌───────────────────────┐
    │  ng-conversations     │            │  MobileApp/src/chat   │
    │  (Angular templates)  │            │  (RN components)      │
    └───────────────────────┘            └───────────────────────┘
```

A renderer owns **pixels and gestures**. Everything else — which agents you may address, which
skills an agent accepts, how a turn is routed, what a mention serializes to — belongs to the
runtime, so both surfaces cannot disagree.

**When you find logic in a renderer that isn't about pixels, promote it.** Three things have already
made this trip: `RealtimeSessionRuntime` (2,768 lines), `MentionAutocomplete` (503 lines), and the
realtime-session **timeline grouping** with its card derivations. All were pure TypeScript sitting
in an Angular package, and each was blocking mobile until it moved. The test is simple: *does this
file import anything from `@angular/*`?* If not, and a native host needs it, it is in the wrong
package.

The third is the clearest illustration of why the test matters. Its own file header said it was
pure and existed so the grouping could be unit-tested — and it was both of those things. It was
still in the wrong package, and the cost was not theoretical: this app rendered every voice turn as
an ordinary chat bubble, which is exactly what that header describes as wrong, because the only
implementation of the rule was behind an Angular import.

---

## 2. Wire-format compatibility is not optional

A message composed on a phone and one composed in a browser must be **the same message**. That is
what lets a conversation move between devices, and what keeps the server from needing a
mobile-specific code path.

The composer serializes a picked mention exactly as the Angular editor does:

```
@{"type":"agent","id":"E7B3…","name":"Sage"}
@{"type":"skill","id":"9A21…","name":"Summarize"}
@{"type":"agent","id":"E7B3…","name":"Sage","configId":"FAST"}
```

On send, the runtime's own `MentionParser` reads them back:

| Token type | Becomes | Effect |
|---|---|---|
| `agent` | `explicitAgentId` | routes the turn — **outranks** the caller's default, matching web |
| `skill` | `requestedSkillIDs` | server intersects with the agent's accepted skills **and** your Run permission |
| `entity` / `query` | `entityMentions` | resolved downstream by the target agent |
| `user` | `userMentions` | notification / addressing |

Parsing happens on **send**, not in the composer. That keeps the wire format the single source of
truth: a token typed by hand behaves exactly like one inserted from the picker.

---

## 3. Extending the chat

The Angular chat is extensible four ways. Each has a direct React idiom, so a consumer who has
tailored the web surface does not learn a second vocabulary.

| Angular | React Native | Defined in |
|---|---|---|
| `@Input()` | props | `MJChatProps` |
| `@Output() EventEmitter` | `On*` callback props | `MJChatEvents` |
| public methods on the component | `ref` + `useImperativeHandle` | `MJChatHandle` |
| `<ng-template mjChatSlot="x">` | component props with typed contracts | `MJChatSlots` |
| `MJGlobal.ClassFactory` registries | *identical* — same keys, same base classes | — |

### 3.1 Slots

Slot **names and contracts match `ng-conversations/slot-interfaces.ts` exactly**:

`emptyState` · `agentPresence` · `header` · `headerActions` · `messageExtra` ·
`demonstrationSurface` · `messageRenderer`

Angular projects an `<ng-template>`; React's equivalent of content projection is passing a
component. So a slot is an optional `ComponentType` prop taking that slot's contract as its props.

All three Angular usage patterns survive the translation:

```tsx
import { MJChat } from '@/chat/MJChat';
import { MJChatHeaderDefault, MJChatEmptyStateDefault } from '@/chat/slots/defaults';

<MJChat
    ConversationID={id}
    Slots={{
        // 1. REPLACE — your component, your rules
        emptyState: SidWelcome,
        agentPresence: SidCharacter,

        // 2. WRAP — add framing without losing the default's behaviour
        header: (p) => (
            <SidFrame>
                <MJChatHeaderDefault {...p} />
            </SidFrame>
        ),

        // 3. EXTEND — override some of the contract, pass the rest through
        emptyState: (p) => <MJChatEmptyStateDefault {...p} Greeting="Welcome back!" />,
    }}
/>
```

`headerActions` is **additive** — it renders inside the default header's action strip — and is
deliberately **not** rendered when a full `header` slot is supplied, because that slot owns the
whole header including its actions. Same rule as the web.

### 3.2 Events, including the cancelable hook

`OnBeforeSend` returns `false` to cancel — the `Before*` half of the cancelable contract MJ's
[UI Layering Guide](../../../../guides/UI_LAYERING_GUIDE.md) specifies, so a host can validate or
reroute a turn without forking the composer.

```tsx
<MJChat
    ConversationID={id}
    OnBeforeSend={async (text) => {
        if (await containsPII(text)) { warn(); return false; }
        return true;
    }}
    OnTurnComplete={({ Success, ErrorMessage }) => track(Success, ErrorMessage)}
/>
```

### 3.3 The imperative surface

```tsx
const chat = useRef<MJChatHandle>(null);

chat.current?.Send('Summarize this lesson');
chat.current?.SetComposerText('/summarize ');
await chat.current?.Refresh();
```

---

## 4. The composer's triggers

| Trigger | Searches | Narrowed by |
|---|---|---|
| `@` | agents + people | your Run permission on each agent |
| `#` | entities + queries | your read/run permission |
| `/` | skills | your Run permission **∩** the target agent's accepted skills |

Suggestions come from `MentionAutocomplete` in the runtime — mobile owns the list view and nothing
else. The `/` narrowing is `IntersectAcceptedSkills`: intersection only, so an agent's set can
remove a skill you could run but never add one you could not. The server enforces the same
intersection; the picker matching it just avoids offering something that would be rejected.

**Trigger detection** (`src/chat/mentions/trigger.ts`) is pure and separately tested, because the
interesting cases are all false positives:

- `amith@bluecypress.io` must not open the agent picker
- `docs/guide` and `https://x.test/a` must not open the skill picker
- a space closes the query
- a caret inside an already-inserted `@{"type":…}` token must not reopen anything

### What Return does

Same precedence as the web composer (`mention-editor.component.ts`): an open picker **with results**
completes the mention, Shift+Return inserts a newline, otherwise Return sends.

Native React Native cannot express that faithfully — `TextInputKeyPressEventData` is `{ key: string }`
with **no modifier bits**, so a hardware Shift+Return is indistinguishable from a plain Return on
iOS and Android. React-native-web does report `shiftKey`, and `ResolveEnterAction` honours it
wherever a platform supplies one rather than branching on `Platform.OS`.

That is why `SubmitOnEnter` defaults to `hardware-keyboard` rather than `always`: an on-screen
keyboard has no Shift to escape to, so sending there would leave a user unable to type a second line
at all. `useHardwareKeyboard` infers it from whether a soft keyboard actually appeared, since the
platforms only raise one when there is no physical keyboard.

The lever that suppresses the newline is `submitBehavior="submit"` on the `TextInput`, computed
before the press — RN decides inside the native text view, and there is no `preventDefault` to reach
for afterwards.

---

## 5. Visual parity with Explorer

The target is MJ Explorer's chat at its **responsive/phone breakpoint**, compared element by
element rather than by memory. The workflow, reproducible:

```bash
# MJAPI on 4001, MJExplorer on 4201
npx playwright-cli -s=mjchat open --browser=chrome http://localhost:4201
npx playwright-cli -s=mjchat resize 390 844        # phone form factor
npx playwright-cli -s=mjchat screenshot --filename=web-chat.png

# the same screen on the simulator
xcrun simctl io booted screenshot native-chat.png
```

Note `environment.development.ts` is gitignored and ships pointing at port **4000**; a local MJAPI
on 4001 needs it repointed or Explorer fails with `GraphQL Error (Code: unknown)` at the loading
screen.

---

## 6. Layout of this directory

```
src/chat/
  README.md              ← this file
  slots.ts               ← slot contracts (mirrors ng-conversations/slot-interfaces.ts)
  MJChat.types.ts        ← props, events, imperative handle
  slots/
    defaults.tsx         ← the shipped default for each slot; exported so hosts can WRAP them
  composer/
    MJComposer.tsx       ← the ONE composer, shared by the thread and new-conversation
    enter-key.ts         ← what Return does (pure, tested); see §4
  mentions/
    trigger.ts           ← trigger detection + mention serialization (pure, tested)
    MentionSuggestions.tsx ← the suggestion list; everything behind it is the runtime's
    ChipText.tsx         ← renders inserted mentions as chips inside the TextInput
  realtime/
    RealtimeSessionCard.tsx ← a whole voice session, collapsed to one timeline element
    session-card-view.ts    ← what that card displays (pure, tested)
```

### Voice sessions in the thread

Every turn of a live call is persisted as an ordinary `MJ: Conversation Detail` stamped with its
`AgentSessionID`. `BuildThreadTimeline` (`src/data/adapt.ts`) runs the runtime's
`BuildConversationTimeline` over the loaded rows and collapses each session into a single card at
the position of its first turn, expandable in place to the turns it counted.

Everything the card decides — the title, the status chip and its tone, whether the time range needs
a second date, which rows count as turns — comes from the runtime, so this card and the web's
cannot describe the same session two different ways.
