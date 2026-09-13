# Model identity: personas across modalities, and fixing the modality inheritance that never ran

**Status:** proposed, not started. Companion: [`plans/realtime/gpt-live-1.md`](realtime/gpt-live-1.md),
which depends on this for voice selection but does not block on it.

Two problems with one shape. **Modalities** were normalized properly and then never wired up.
**Voices, avatars and personas** were never normalized at all. Fix the first, then build the second
on the pattern the first was supposed to establish — this time with the resolver and the seed data
shipping in the same release as the schema.

---

## Part A — `MJ: AI Modalities`: fix the inheritance and the seed

### A.1 What is wrong

Three entities exist and are correct: `MJ: AI Modalities` (6 seeded rows, extensible by INSERT),
`MJ: AI Model Modalities` (`ModelID`, `ModalityID`, `Direction`, `IsSupported`, limits), and
`MJ: AI Agent Modalities` (`AgentID`, `ModalityID`, `Direction`, `IsAllowed`, limits). The documented
precedence chain is **Agent → Model → System → Default** (`BaseAIEngine.ts:48-64`).

**Defect 1 — the inheritance is declared and never executed.** `AIModel.InheritTypeModalities` and
`AIModelType.DefaultInputModalityID` / `DefaultOutputModalityID` are read by **zero** lines of code.
The only grep hit outside generated files is a boolean-column list in the PG converter:

```
$ grep -rn "InheritTypeModalities|DefaultInputModalityID|DefaultOutputModalityID" packages \
    --include=*.ts | grep -v "/generated/" | grep -v graphql-schemas
packages/SQLConverter/src/rules/CoreMetadataBooleanColumns.ts:71:  AIModel: ['IsActive', 'InheritTypeModalities', 'SupportsPrefill'],
```

`GetModelModalities` (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts:1648`) reads the junction only;
`ModelSupportsModality` (`:1686`) falls back to a hardcoded `'text'`; `AgentSupportsModality`
(`:1666`) does the same. So every model reports text-only regardless of its type, and a Realtime
model — whose type declares Audio in *and* Audio out — reports no audio support at all.

**Defect 2 — the junction is never seeded and the vocabulary ships as a migration `INSERT`.**
`grep -rln "AI Model Modalities" metadata/` returns nothing. There is no `metadata/ai-modalities/`
folder either, breaking the convention every other lookup table follows (`ai-model-types`,
`ai-usage-types`, `ai-model-price-unit-types` all have one).

### A.2 The fix

**Resolver.** Implement the documented semantics in `BaseAIEngine`:

```
effective(model, direction) =
    InheritTypeModalities
        ? (type default for direction) ∪ junction(IsSupported = 1)  \  junction(IsSupported = 0)
        : junction(IsSupported = 1)
```

- `GetModelModalities` consults `AIModelType.DefaultInput/OutputModalityID` when
  `InheritTypeModalities = 1`, and honours `IsSupported = 0` as the explicit disable the field
  description promises.
- `ModelSupportsModality` — delete the hardcoded `'text'` fallback; the type default is the fallback.
- `AgentSupportsModality` — when an agent has no explicit rows, fall through to the **model's**
  effective set rather than hardcoded text. That is what `Agent → Model → System → Default` means.
- `AIAgentModality.IsAllowed = 0` stays a hard veto at the agent layer.

Add unit tests for each branch: inherit-on with no junction, inherit-on with an additive junction
row, inherit-on with an `IsSupported = 0` veto, inherit-off, and agent-level `IsAllowed = 0`.

**Seed.** Create `metadata/ai-modalities/` with `.mj-sync.json` + `.ai-modalities.json`, **reusing the
existing hardcoded IDs** so the rows reconcile rather than duplicate:

| ID | Name |
|---|---|
| `EA43F4CF-EC26-41D7-B2AC-CF928AF63E46` | Text |
| `AAD386E4-D6ED-4E6E-8960-B56AC1D2783B` | Image |
| `FC3CAE20-6FA8-4ABF-B02E-62CEA920313E` | Audio |
| `9AAD272B-A1C8-4498-ACFC-0C6D50D82B96` | Video |
| `3E930454-29AE-48B9-8888-10FD74BC67B9` | File |
| `BB0C8564-E79C-4AF9-82B0-26D6EAB4BC01` | Embedding |

Then seed `metadata/ai-model-modalities/` only where a model genuinely *extends* its type default
(e.g. a vision LLM adding Image input) — inheritance covers the rest, which is the point of fixing it.

Changeset `minor` (touches `metadata/`).

> **This is the cautionary tale for Part B.** A correct schema with no resolver and no seed is a dead
> normalization that reads as a working feature. Personas must not repeat it: **schema, seed and
> resolver ship together or not at all.**

---

## Part B — personas

### B.1 What exists today

**No `Voice`, `Avatar`, `Persona`, `Speaker` or `Character` entity exists.** Confirmed against every
`@RegisterClass(BaseEntity, …)` registration, all of `metadata/`, and every `CREATE TABLE` in
`migrations/`.

**Five separate declarations of "a voice has an id and a name":**

| Type | Where | Shape |
|---|---|---|
| `RealtimeVoiceOption` | `AI/Core/src/generic/baseRealtime.ts:222` | `ID`/`Name` — PascalCase |
| `VoiceInfo` | `AI/Core/src/generic/baseAudio.ts:245` | `id`/`name` — camelCase, **plus 8 ElevenLabs tuning fields leaked into the generic base** |
| `RealtimeVoiceOptionResult` | `MJServer/src/resolvers/RealtimeBridgeResolver.ts:186` | GraphQL copy |
| `RealtimeVoiceOption` | `GraphQLDataProvider/src/graphQLLiveKitClient.ts:81` | hand-written client duplicate |
| `AvatarInfo` | `AI/Core/src/generic/baseVideo.ts:27` | `id`/`name`/`gender`/preview URLs |

**Four persona shapes**, two using different casing for the same two fields:
`RealtimeVoicePersona{tone, speakingStyle, voice, firstMessage}` (`realtime-coagent-config.ts:62`),
its JSON-schema twin, `IAgentSettings.Realtime.Persona{Tone, SpeakingStyle}` (`__mj.ts:59806`), and
`RealtimeAgentPick.PreferredVoice` (a flat string).

**The catalog is worse than the type sprawl suggests:**

- **6 of 7 realtime drivers return `[]` from `SupportedVoices`.** Only `OpenAIRealtime` has a list —
  8 hardcoded strings. Gemini, ElevenLabs, AssemblyAI and Inworld never override it.
- **ElevenLabs — the one vendor whose product is user-authored voices — returns `[]` on the realtime
  side**, while its TTS driver fetches them live via `voices.getAll()`. Two drivers, same vendor, one
  blind.
- **The same vendor publishes two divergent lists.** OpenAI Realtime: `alloy, ash, ballad, coral,
  echo, sage, shimmer, verse`. OpenAI TTS: `alloy, echo, fable, onyx, nova, shimmer`. Overlap 3.
- `GetRealtimeModelVoices()` (`bridge-realtime-session-factory.ts:238`) **instantiates every active
  Realtime model's driver at request time purely to read a hardcoded array.** The picker's own
  comment says why: *"the cached models carry no voice list."*
- Persona today is modelled as **a whole extra agent row** (the co-agent chain).
- Two dead config keys: `voiceId` is documented *"DEPRECATED — never read by any driver"*, and
  `avatarId` is declared, normalized, and read by nothing.

`gpt-live-1` forces the issue: 22 built-in voices plus `CustomVoice { id }`. Our hardcoded 8 would
expose under half and make custom voices unreachable.

**Prior art, found.** `plans/audio-agent-architecture.md` (May 2026) proposes a `Voice` table —
`vendorVoiceId, name, description, gender, accent, voiceSettings, associationId` — plus an
`AudioSessionConfig` holding `voiceId`. It is in the ERD and the implementation table and was never
built. Its **Open Design Question #2** is still open and is verbatim the question this plan answers:
*"Voice Personas: Per-association, per-agent, or user preference?"* Separately,
`plans/praxis/PRAXIS_BUILD_PLAN.md` defines a `Persona` with `PreferredVoice` — but that is a
*behavioral* persona in an app schema. See B.5.

### B.2 The entities

Mirror **`AIModel` / `AIModelVendor`** — the precedent that actually *runs* (vendor resolution really
does filter `Status='Active'`, sort `Priority DESC`, skip null `DriverClass`) — rather than the
Modalities precedent, which did not.

**As built** in `migrations/v6/V202609112345__v6.1.x__AI_Personas_Schema.sql` — this block tracks the
migration, not the original sketch:

```
MJ: AI Personas              abstract, provider-agnostic presentational identity
  Name(UQ, global) · Description · PerceivedGender(null) · Locale(null)
  PerceivedAgeRangeMin · PerceivedAgeRangeMax        ← a range, not a vague "AgeRange"
  Tone(255) · SpeakingStyle(255) · StyleDescriptors(JSON)
  PreviewAudioURL · PreviewImageURL · PreviewVideoURL
  Source: BuiltIn | Custom | Cloned · IsActive

MJ: AI Persona Vendors       the concrete binding — the APIName pattern, exactly
  PersonaID · VendorID · ModalityID · APIName · Status · Priority · VendorSettings(JSON)
  UQ (PersonaID, VendorID, ModalityID)

MJ: AI Model Personas        per-model availability where it differs from the vendor default
  ModelID · PersonaID · Sequence · IsSupported
  UQ (ModelID, PersonaID)

MJ: AI Agent Personas        which personas an agent may wear, and which is default
  AgentID · PersonaID · IsDefault · Sequence · IsAllowed · StyleOverride(JSON)
  UQ (AgentID, PersonaID) + filtered UQ on (AgentID) WHERE IsDefault = 1
```

**`PerceivedAgeRangeMin`/`Max` is an improvement on the plan's original `AgeRange`** — a bounded
pair is queryable and unambiguous where a single free-text field was neither.

### B.2a Decisions taken during review of the schema commit

Settled on [PR #4397](https://github.com/MemberJunction/MJ/pull/4397) while reviewing `2ee1ea3`.
Recorded here because each is the kind of choice a later reader mistakes for an oversight.

| # | Decision | Rationale |
|---|---|---|
| 1 | **All three JSON columns get a `metadata/entities/JSONType-interfaces/` binding** | Otherwise CodeGen emits a bare `string` and every consumer hand-parses it — the weak typing the critical rules forbid. Matters most for `VendorSettings`: moving ElevenLabs' tuning out of `VoiceInfo` into an *untyped* bag relocates the vendor leak rather than fixing it |
| 2 | **`AIAgentPersona.IsDefault` gets a filtered unique index in the DDL**, not a `ValidateAsync` guard | One-default-per-agent is single-table state the schema can express, and `guides/BASE_ENTITY_SERVER_PATTERNS.md:76` reserves `ValidateAsync` for *cross-table* invariants. Needs `SET QUOTED_IDENTIFIER ON`. No CodeGen re-run — a filtered index is neither a column nor an FK, so it yields no `EntityField` row and no `IDX_AUTO_MJ_FKEY_*` |
| 3 | **`UQ_AIPersona_Name` stays global** | The catalog is curated. Say so in the extended property — an unexplained global unique reads as an oversight and invites a "fix" that breaks reconciliation |
| 4 | **`StyleDescriptors` stays**, with an interface that is deliberately empty at first | A reserved extension point, not dead weight. Use MJ's existing idiom rather than a bare `{}` — see below |

**The empty-interface idiom.** `packages/AI/Core/src/generic/modelConfiguration.ts` already has one:

```ts
export interface LLMModelConfigurationSection {
    /** Open extension point until the first typed knob lands. */
    [key: string]: unknown;
}
```

An index signature says *deliberately open, not yet typed*; a bare `{}` is an open object type that
accepts anything **and** trips lint. `VendorSettings` is the opposite case — type it properly from the
start, since ElevenLabs' `stability` / `similarityBoost` / `style` / `useSpeakerBoost` are known today
and typing them is the entire point of moving them out of `AI/Core`.

**Still open:** `Locale` (Part C.3). Language is a property of the prompt body, not a tag, so
`Locale = 'es-ES'` on an English-worded persona silently yields an English assistant with a Spanish
label. Rename to `PromptLanguage`, promote the style fields to a per-language child, or drop it until
multilingual is a real requirement — but do not leave it ambiguous. Cheapest to settle before another
migration stacks on this one.

Three things this gets right that today's code gets wrong:

- **`APIName` on the binding** carries `alloy`, an ElevenLabs `voice_id`, a HeyGen `avatar_id`, or a
  Live `CustomVoice.id` — one field, every vendor, exactly as `AIModelVendor.APIName` already does
  for models.
- **`ModalityID` makes it cross-modality for free**, reusing the vocabulary Part A just fixed. A
  HeyGen avatar binds at `Video`; an ElevenLabs voice at `Audio`. A future avatar-plus-voice model is
  one persona with two bindings.
- **`VendorSettings` JSON** is where ElevenLabs' `stability` / `similarityBoost` / `style` /
  `useSpeakerBoost` belong. They are currently sitting in `VoiceInfo` in AI/Core — a vendor leak into
  the generic base.

`MJ: AI Model Personas` exists because availability genuinely differs per model on one vendor:
OpenAI Realtime's 8, Live's 22, TTS's 6. Follow `AIModelModality`'s semantics — absent means "inherit
the vendor's full set", `IsSupported = 0` is an explicit disable.

### B.3 `MJ: AI Agent Personas` — yes, and it is load-bearing

Proposed as a "list of supported personas that bubbles up to agent level." Agreed, and it mirrors
`MJ: AI Agent Modalities` exactly. Three refinements:

**It should be an offering plus a default, not only an allowlist.** `AIAgentModality` is a pure veto
(`IsAllowed`). An agent needs more: which personas it *ships with*, in what order, and which one it
uses when nobody chooses. Hence `IsDefault` + `Sequence` alongside `IsAllowed` — the shape
`MJ: AI Agent Co Agents` already uses.

**The real argument for it: the agent link is what makes a persona a *complete* identity.**
`RealtimeVoicePersona` today bundles two different things — `voice` and `firstMessage` go to the wire,
while `tone` and `speakingStyle` are folded into the system prompt by `BuildVoiceMannerSection`. If
`Tone` and `SpeakingStyle` live on the **Persona** (they describe how *Aria* speaks, not what this
agent does), then selecting a persona yields both the vendor voice code *and* the prompt fragment in
one resolution. That is only possible if something binds agent → persona. This entity is that thing.

`firstMessage` stays on the agent — "Hi, you've reached Acme support" is agent-specific, not persona-
specific. `StyleOverride` on the junction covers "Aria, but more formal" without minting a second
persona, which is the `AIAgentModality` override pattern again.

**Do not add a fourth place persona can be set — collapse.** `MJ: AI Agent Personas` becomes the
canonical agent-level binding and **replaces** `realtime.voice.default.voice`.
`AIAgent.TypeConfiguration` keeps only `firstMessage` plus a raw `voice` escape hatch for the
un-catalogued case. `Application.AgentSettings.Realtime.Persona` becomes an app-level default
`PersonaID`, not a second copy of tone/style.

Resolution order, matching the chain Part A repairs:

```
runtime override → agent (IsDefault, filtered by IsAllowed)
                 → application default persona
                 → model/vendor default binding
                 → driver SupportedVoices fallback
```

**The payoff:** an agent references a `PersonaID`, not a vendor string. "This agent speaks as *Aria*"
resolves to `sage` on OpenAI Live, a `voice_id` on ElevenLabs, an `avatar_id` on HeyGen. That is
genuine provider-agnosticism. It also retires the longest-normalized-prefix matcher in
`MatchProviderVoiceSettings` (`realtime-coagent-config.ts:1235`) and its documented specificity
inversion, where `default.voice` in agent metadata outranks a hand-authored runtime
`providers.<key>.voice` override.

### B.4 Cleanup — breaking changes, approved

| Change | Breaking? | Note |
|---|---|---|
| `VoiceInfo`'s 8 ElevenLabs fields → `AIPersonaVendor.VendorSettings` | yes | The vendor leak into AI/Core. `VoiceInfo` keeps `id`/`name`/`description`/`previewUrl` |
| Collapse 5 voice/avatar types behind one resolved shape | yes | Keep the old exports as deprecated aliases for one minor cycle |
| Delete `voiceId` from the realtime config schema | no | Already documented dead |
| Delete `avatarId`, or wire it | yes-ish | Declared, normalized (`realtime-coagent-config.ts:1033`), read by nothing. Prefer deleting — the persona binding replaces it |
| Add `video` to `realtime-type-config.schema.json` | no | The TS interface declares it; the schema has `additionalProperties: false`, so authoring a `video` block currently **fails validation** |
| `GetRealtimeModelVoices()` reads metadata first | no | Kills the instantiate-every-driver-per-request pattern; driver lists become the fallback |

**Not doing:** no voice dimension on `MJ: AI Model Costs`. The grain is
`(ModelID, VendorID, PriceTypeID, UnitTypeID, ProcessingType)` and no vendor prices by voice — Live
is $0.05/min regardless of which of the 22 speaks.

### B.5 Naming — resolve the collision deliberately

Core `MJ: AI Personas` = **how an agent sounds and looks** (presentational identity).
Praxis's planned `Persona` = **who it is** (agenda, knowledge scope — behavioral identity). These are
different concepts that would otherwise collide. The clean layering is for Praxis's `PreferredVoice`
to become a reference to a core `PersonaID`.

### B.6 Back-compat and seeding

1. **Seed from what exists.** OpenAI's 8 realtime + 6 TTS (deduped into one persona set with
   per-model bindings), plus a one-time pull of ElevenLabs' and HeyGen's live catalogs. Ship as
   `metadata/ai-personas/` with `.mj-sync.json` — **not** a migration `INSERT` (Part A, Defect 2).
2. **Drivers keep their methods.** `SupportedVoices` / `GetVoices()` / `GetAvatars()` stay, demoted
   from source-of-truth to **fallback and seed source**.
3. **Raw strings keep working.** `realtime.voice.default.voice` remains a supported escape hatch;
   `realtime.voice.personaID` is the new canonical path. Explicit `PersonaID` wins.
4. **One minor cycle of deprecated aliases** before removing the duplicate types.

### B.7 Phasing

| Phase | Work | Gate |
|---|---|---|
| **A1** | Modality resolver fix + unit tests | every branch covered |
| **A2** | `metadata/ai-modalities/` reusing the 6 IDs; junction seeds where models extend | `mj sync validate`; no duplicate rows on an existing DB |
| **B1** | Four persona entities: migration + CodeGen | builds clean |
| **B2** | Seed `metadata/ai-personas/` from the hardcoded lists + live pulls | rows resolve on a clean DB |
| **B3** | Resolver + `GetRealtimeModelVoices()` reads metadata first | picker shows Live's 22 |
| **B4** | `MJ: AI Agent Personas` binding + `personaID` config path + cascade | an agent switches vendor and keeps its persona |
| **B5** | Breaking cleanup in B.4 | one minor cycle of aliases first |

**A1 and A2 are independent of everything else** and are worth shipping on their own — the modality
bug is live today and silently reports every model as text-only.

---

## Part C — what the GPT-Live prompting guide constrains (added 2026-09-11)

Verified against OpenAI's published `live-prompting` guide while correcting
[`plans/realtime/gpt-live-1.md`](realtime/gpt-live-1.md) to Revision 2. Four findings bear directly on
the persona schema, and one of them contradicts a column already written.

### C.1 The voice prompt is a fixed-shape template, not free text

OpenAI publishes a canonical `session.instructions` skeleton with named, keep-them sections:

```
You are [name], a calm, friendly voice assistant for [service].
Speak warmly and naturally, at an unhurried pace...

Backchannel policy: Use moderate backchannels...

Interruption policy: Stop speaking when the user interrupts. Listen to what they say.

Delegation policy:
Backend tools: ...
Delegate to the backend when: ...
Do not delegate to the backend when: ...
```

> *"**Keep the policy labels.** Customize the personality, backchannel behavior, backend capabilities,
> and delegation conditions for your product."*

**Consequence:** a persona should **fill slots**, not emit prose. `Tone` and `SpeakingStyle` map to the
opening paragraph; the delegation block is generated from the Action catalogue (see the companion
plan §2.2). A persona that renders one blob of free text cannot be composed with the delegation
policy without risking the conflicts the guide warns about: *"Copying every example makes the prompt
longer and can introduce conflicting instructions."*

### C.2 Barge-in behaviour is a persona dimension — add two fields

`Backchannel policy:` and `Interruption policy:` are first-class template lines, and the guide warns
they interact:

> *"**Do not add a blanket 'never speak while the user is speaking' rule alongside it. That can also
> suppress helpful listening sounds.**"*

This is the one lever we have over barge-in on GPT-Live — there is no wire control. It is therefore
persona configuration, not driver configuration. Suggest `BackchannelPolicy` and `InterruptionPolicy`
alongside `Tone`/`SpeakingStyle`, all four slot-shaped.

### C.3 ⚠️ `Locale` does not mean what the current column implies

> *"**Write your prompt in the language you want the model to speak.** For example, if the assistant
> will speak Spanish, write its instructions and example responses in Spanish."*
>
> *"**A voice choice does not guarantee a regional accent.**"*

Two consequences for the schema as written:

1. **Language is a property of the prompt body, not a scalar field.** A genuinely multilingual persona
   needs **per-language prompt bodies**, not one body plus a `Locale` tag. As modelled today, setting
   `Locale = 'es-ES'` on an English-worded persona produces an English-speaking assistant with a
   Spanish label — silently wrong.
2. **`Locale` cannot describe the voice.** Accent is not guaranteed by voice selection, so `Locale` on
   `AIPersona` is a statement about the *prompt*, not the *binding*.

Options, cheapest first: rename to `PromptLanguage` and document that the style fields must be written
in it; or promote the style fields to a per-language child table; or drop `Locale` until a multilingual
requirement is real. **Do not leave it ambiguous** — this is the kind of field that reads as working.

### C.4 Pronunciation is per-name and inline

> `Say the user's name Rosalia as "roh-sah-LEE-ah", IPA /rosaˈli.a/ (Spanish).`

Pronunciation guidance is *runtime, per-record* data, not persona metadata. It belongs in the
session-composition path (an agent supplying a caller's name), not on `AIPersona`. Flagged so nobody
adds a `PronunciationHints` column.

### C.5 Confirms the design

`Tone` and `SpeakingStyle` earning their place as scalars is confirmed — the guide asks for *"a few
short sentences"* of role, tone and pace, which is exactly two bounded fields plus the opening
paragraph, not a JSON bag. That strengthens the open question in the review of `2ee1ea3` about what
`StyleDescriptors` is for.
