# Building Applications Hosted in the MJ Mobile App

How to put an application you have already built on MemberJunction onto a phone, without forking
the mobile app and without maintaining a second navigation model.

**Audience:** any team shipping an application on MJ/MJE that wants a mobile presence.
**Prerequisite:** your application already exists as an `MJ: Applications` row with nav items —
i.e. it runs in MJ Explorer.
**Worked example in the repo:** `packages/MobileApp/src/sample-app/FieldNotesResource.tsx`.

---

## 1. The one idea

**MJ Explorer is not a product. It is a host.** A stock install has 27 `MJ: Applications` rows;
each declares nav items that name a `DriverClass`, resolved at runtime through
`MJGlobal.ClassFactory` against `BaseResourceComponent`. Chat, Data Explorer, Actions, AI — all
hosted applications, not hard-coded screens.

The mobile app is **the same host with a different deployment**: the same metadata rows, the same
registry, resolved against `BaseMobileResource` instead.

```
MJ: Applications  ──┬──►  MJ Explorer   ──►  ClassFactory ──► BaseResourceComponent  (Angular)
   (one row)        │
                    └──►  Mobile app    ──►  ClassFactory ──► BaseMobileResource     (React Native)
```

One metadata row. Two hosts. No duplicated navigation, no second source of truth.

---

## 2. Before you write anything — check what you already get

There are three tiers of support, and **tier 1 costs you nothing**.

| Tier | What you do | What users get |
|---|---|---|
| **T1 — Generic** | **Nothing.** | Your entities, queries, lists, dashboards and agents are already in metadata, so native record browsing, query running, dashboards and agent chat over your data already work. |
| **T2 — Native surface** | Register a `BaseMobileResource` for a nav item | A purpose-built mobile screen for that section. Your desktop driver is untouched. |
| **T3 — Mobile-only** | Add a nav item whose driver exists only on mobile | Camera capture, offline field entry, push-first approvals — workflows that make no sense on a desktop. |

**Install the mobile app against your instance and look before you build.** For many applications
T1 is most of the value, and the right T2 list is one or two screens, not a port of your whole app.

The question to ask is not "which of our screens do we have" but **"what does someone do standing
up?"** Usually: look something up, approve something, ask the agent, capture something.

---

## 3. Add a mobile surface (T2)

Three steps. Nothing else.

### Step 1 — Write a screen

An ordinary React Native function component. It receives `MobileResourceProps` and is otherwise
indistinguishable from any other screen.

```tsx
import type { MobileResourceProps } from '@/host/BaseMobileResource';

function FieldNotesScreen({ ApplicationName, NavItem }: MobileResourceProps) {
    // RunView, Metadata, GetEntityObject — the same MJ object model as everywhere else.
    return /* … */;
}
```

`MobileResourceProps` gives you `ApplicationID`, `ApplicationName` and the `NavItem` that opened
you. Deliberately nothing else — no navigation object, no shell internals — so a screen written for
this host is not quietly coupled to its chrome.

### Step 2 — Wrap it in a resource

```tsx
import { RegisterClass } from '@memberjunction/global';
import { BaseMobileResource } from '@/host/BaseMobileResource';

@RegisterClass(BaseMobileResource, 'FieldNotesResource')
export class FieldNotesMobileResource extends BaseMobileResource {
    public get Component() {
        return FieldNotesScreen;
    }

    /** Optional: overrides the header. Defaults to the nav item's label. */
    public override get Title(): string | null {
        return 'Field Notes';
    }

    /** Optional: return false to get the shell's "not available" treatment. */
    public override get IsAvailable(): boolean {
        return true;
    }
}
```

The registration key **must be the `DriverClass` your application already declares** in its
`MJ: Applications` nav metadata. That string is the entire contract between the two hosts.

> **Why a class wrapping a component, rather than the component itself?** `ClassFactory`
> instantiates whatever it resolves, and React function components must not be called as
> constructors. The class is a thin, inert holder.

### Step 3 — Register it in the build manifest

```ts
// src/host/registry.ts
export function LoadHostedMobileResources(): void {
    LoadFieldNotesMobileResource();
}
```

…and export the guard from your module:

```tsx
export function LoadFieldNotesMobileResource(): void {
    /* intentionally empty — see below */
}
```

**This guard is not ceremony.** `@RegisterClass` runs as a module side effect, and a bundler that
sees no import of your module removes it. Your class then never registers, the nav item silently
falls back to "opens on desktop", and it works in development while failing in a production build.
Every registering module in MJ carries one of these, for exactly this reason.

---

## 4. Why mobile needs a build manifest and the web does not

This is the **one real asymmetry** between the two hosts, and it is worth understanding rather than
working around.

MJ Explorer can discover application code at runtime: it ships a JavaScript bundle, and a
lazily-loaded chunk registers itself when it arrives. A native app cannot — its JavaScript is
compiled into the binary at build time, and App Store policy is hostile to shipping executable code
out of band.

So **"which applications does this build host" is a build-time decision on mobile** and a runtime
one on the web. `src/host/registry.ts` is where that decision lives. A deployment hosting a
different set of applications builds with a different manifest; no application's code changes to be
included or excluded.

Everything else — the metadata, the nav items, the driver names, the resolution — is identical.

---

## 5. What carries over, and what should not

### Carries over untouched

Entities and the generated ORM · agents, skills and plan mode · actions · queries and views ·
permissions and row-level security · artifacts · conversations and realtime sessions · metadata of
every kind.

This is the "one TypeScript brain" dividend. You are not porting your data layer; you are writing
presentation.

### Needs a native surface

Anything that is a *layout* rather than *data*: bespoke dashboards, visual editors, drag-and-drop,
multi-pane workspaces. Also anything touching device capability — camera, biometrics, push, voice,
location, offline capture.

### Should stay on desktop, deliberately

Admin and configuration · schema tooling · authoring environments · bulk operations · long-form
data entry · anything with an irreducible dense grid.

**Say so explicitly.** A nav item with no registered mobile driver renders "opens on desktop",
which is a better product than a cramped imitation. Leaving a section off mobile is a decision, not
a gap.

---

## 6. Reuse the runtimes — do not rebuild them

The most common mistake is re-implementing orchestration that already exists as a shared
pure-TypeScript package.

| You need | Use | Not |
|---|---|---|
| Chat with an agent | `@memberjunction/conversations-runtime` | Your own dispatch, mention parsing, or default-agent logic |
| Voice / realtime | `@memberjunction/realtime-runtime` | Your own session orchestration |
| Attachments | `ConversationUtility` for the inline-vs-storage decision | Your own size thresholds |
| Data | `Metadata` / `RunView` / `RunQuery` / `GetEntityObject` | A bespoke API client |

An application team should be writing presentation. If you find yourself writing agent dispatch or
session lifecycle, stop — it exists, and a second copy drifts from the first at the next protocol
change.

---

## 7. Test it

| Layer | How |
|---|---|
| **Unit** | Vitest, per the repo standard. Mock at the boundary your screen actually calls. |
| **Integration** | Against live MJAPI, gated on `MJ_TEST_JWT`. **Seed and clean up your own fixtures** — a suite that asserts against ambient data only passes on a database someone has already used. |
| **E2E** | A Maestro flow. Assert that your registered surface mounts inside the shell — that is the only thing which proves ClassFactory resolution works in the real Hermes bundle. |

`packages/MobileApp/.maestro/05-app-host.yaml` is a working example covering launcher → hosted app
→ registered surface → unregistered fallback.

Two things that will bite you, both found by writing that flow:

- **Deep links race the provider boot.** A cold launch into a deep link reaches your screen before
  the MJ provider has a token, and metadata access throws on an unset provider. Gate on
  `useMJ().status === 'ready'`.
- **`accessibilityLabel` shadows inner text** in the accessibility tree, so Maestro matches the
  label, not your `<Text>`. That is correct behaviour — assert on the accessible name, which is
  also what a screen-reader user hears.

---

## 8. Worked example: Sidecar's LXP

`learn.sidecar.ai` is an AI-native LMS on MJ/MJE. How it lands on mobile:

| LXP surface | Tier | How |
|---|---|---|
| Course / lesson catalog | **T1** | Lessons, courses and enrollments are MJ entities — native list and record surfaces render them with zero LXP code. |
| Progress dashboard | **T1** | An MJ dashboard; KPI and chart parts render natively. |
| AI tutor chat | **T1 → T2** | T1 works immediately via the generic conversation surface. T2 is where LXP's *character* lands — warm tutor persona, resume cards, voice states — as a driver over `conversations-runtime`. Same engine as web, different skin. |
| Tutor voice mode | **T2** | `realtime-runtime` + the RN media host. The co-agent voices LXP's tutor agent — the target is a runtime parameter, so **no LXP-side realtime code at all**. |
| Video lesson player | **T2 / T3** | Genuinely mobile-native: background audio, lock-screen controls, offline download. |
| Curriculum authoring | **desktop** | Correctly excluded. |

**What LXP writes:** a handful of `BaseMobileResource` drivers and their screens.
**What LXP does not write:** agent dispatch, default-agent resolution, mention parsing, streaming,
session lifecycle, transcript persistence, tool relay, narration pacing, permissions, entity access.

That ratio — app teams writing presentation, MJ providing orchestration — is the measure of whether
this architecture is working.

---

## 9. Checklist

- [ ] Installed the mobile app against your instance and checked what T1 already gives you
- [ ] Picked the one or two workflows that belong on a phone, by what people do standing up
- [ ] Screen written as a normal RN component taking `MobileResourceProps`
- [ ] `BaseMobileResource` subclass registered under the **existing** `DriverClass`
- [ ] `Load*` guard exported and called from `src/host/registry.ts`
- [ ] Orchestration delegated to the shared runtimes, not re-implemented
- [ ] Screens gate on `useMJ().status === 'ready'`
- [ ] Unit + integration + a Maestro flow that mounts your surface
- [ ] Sections that belong on desktop deliberately left unregistered

---

## Related

- [`plans/mobile-app-react-native/MOBILE-AS-APP-HOST.md`](../plans/mobile-app-react-native/MOBILE-AS-APP-HOST.md) — the architecture and its rationale
- [`packages/MobileApp/README.md`](../packages/MobileApp/README.md) — the mobile package itself
- [`guides/CONVERSATIONS_UX_STACK_GUIDE.md`](CONVERSATIONS_UX_STACK_GUIDE.md) — the chat runtime you should be reusing
- [`guides/REALTIME_CO_AGENTS_GUIDE.md`](REALTIME_CO_AGENTS_GUIDE.md) — the realtime stack
