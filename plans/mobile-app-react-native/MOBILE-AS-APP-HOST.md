# The MJ Mobile App as an Application Host

**Status:** plan of record for the hosting architecture. Companion to
[`PHASE4-V6-REALTIME.md`](PHASE4-V6-REALTIME.md), which covers completion and realtime.
**Audience:** MJ core maintainers, and any team shipping an application on MJ/MJE that wants a
mobile presence.

---

## 1. Executive summary

### What the mobile app is for

MemberJunction's mobile app exists to put the **two things people actually do away from a desk** in
their pocket: *talk to their agents*, and *look something up or capture something in the field*. It
is the third UI in MJ's "one TypeScript brain, three UIs" model — the entire non-visual stack
(`core`, `core-entities`, `graphql-dataprovider`, agents, actions, permissions, metadata) runs
unchanged under Hermes, and only presentation is new.

### What it is not

It is **not** MJ Explorer on a small screen. Explorer is a power-tool workspace — dense grids,
multi-pane layouts, admin surfaces, long-form authoring. Porting that to a phone produces something
worse than either. Mobile deliberately carries a *subset*, chosen by whether the workflow makes
sense one-handed.

### The thesis of this document

**The mobile app is a host, not a product.**

MJ Explorer is not a monolithic application — it is a *shell* that hosts many applications, resolved
from metadata at runtime. There are 27 `MJ: Applications` rows in a stock install, each declaring
nav items that resolve to driver classes through `MJGlobal.ClassFactory`. Chat, Data Explorer,
Actions, AI, Component Studio, Scheduling — all of them are *hosted apps*, not hard-coded screens.

The mobile app must express **the same paradigm with a different deployment**. Same metadata, same
registry, same permissions — a native shell instead of a browser one. Get this right and an
application already running in MJE has a short, well-lit path to a phone. Get it wrong — hardcode
mobile's screens — and every app that wants mobile has to fork the mobile app, which means none of
them will.

This is explicitly **not** "customization." A customizable app has a fixed feature set with knobs.
A host runs applications it has never heard of.

---

## 2. The paradigm MJE already established

Worth stating precisely, because mobile is going to reuse it rather than reinterpret it.

### The metadata

```jsonc
// metadata/applications/.actions-application.json
{ "fields": {
    "Name": "Actions",
    "Description": "Manage and monitor all system actions and workflows",
    "Icon": "fa-solid fa-bolt",
    "Color": "#ff9800",
    "DefaultForNewUser": true,
    "DefaultSequence": 1000,
    "DefaultNavItems": [
      { "Label": "Overview", "Icon": "fa-solid fa-bolt",
        "ResourceType": "Custom", "DriverClass": "ActionsOverviewResource", "isDefault": true },
      { "Label": "Explorer", "Icon": "fa-solid fa-folder-tree",
        "ResourceType": "Custom", "DriverClass": "ActionExplorerResource" }
    ] },
  "relatedEntities": { "MJ: Application Entities": [] } }
```

### The three moving parts

| Part | What it does |
|---|---|
| **`MJ: Applications`** + `DefaultNavItems` | Declares an app, its identity (icon, color, order), and its navigation — as *data*. |
| **`ResourceType`** (10 shipped: Conversations, Dashboards, Records, Queries, Lists, User Views, Artifacts, Search Results, Cluster Analysis, **Custom**) | Says *what kind of thing* a nav item opens. Nine are generic and renderable by the shell with no app-specific code. `Custom` is the escape hatch. |
| **`DriverClass`** → `@RegisterClass(BaseResourceComponent, 'X')` | Resolves a `Custom` nav item to a component at runtime through `MJGlobal.ClassFactory`. The shell never imports it by name. |

### Why this matters for mobile

The shell's contract with a hosted app is **a metadata row and a registered class**. Nothing in that
contract is inherently browser-shaped. The nine generic resource types describe *data*, not widgets.
Only `BaseResourceComponent` — the base class the driver extends — is Angular.

So the port is not "reimplement Explorer." It is: **keep the metadata and the registry, swap the
base class and the renderers.**

---

## 3. The same paradigm, different deployment

### The mobile host

```
MJ: Applications (same rows)  ─────────────┐
MJ: Application Entities (same rows)       │  read at runtime,
User's app list + permissions (same)  ─────┤  per user, per provider
                                           ▼
                              ┌────────────────────────┐
                              │   Mobile App Shell     │
                              │  (drawer / tab host)   │
                              └────────┬───────────────┘
                                       │ ResourceType
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
   Generic native renderers     BaseMobileResource      "Open on desktop"
   (Records, Queries,           via ClassFactory        (honest fallback)
    Dashboards, Conversations,  ← app-supplied
    Lists, Artifacts, …)          native surface
```

The one new primitive is **`BaseMobileResource`** — the RN sibling of `BaseResourceComponent`,
resolved from the *same* `DriverClass` string through the *same* `ClassFactory`. An app that wants a
bespoke mobile surface registers a second driver under the same name against a different base class.

### Three tiers of app support

The point of the tiers is that **tier 1 costs an app team nothing**.

| Tier | What the app does | What the user gets |
|---|---|---|
| **T1 — Generic** | **Nothing.** The app's entities, queries, dashboards, lists and conversations are already in metadata. | Native record browsing, query running, list views, dashboard KPIs, and agent chat over the app's data. Already true today for Explorer's surfaces. |
| **T2 — Native surface** | Registers `@RegisterClass(BaseMobileResource, 'ThatSameDriverClass')` | A purpose-built mobile screen for that nav item, with the desktop one untouched. |
| **T3 — Mobile-only** | Adds a nav item whose driver exists *only* on mobile | Camera capture, offline field entry, push-first approval flows — workflows that make no sense on a desktop. |

An app with no mobile driver for a `Custom` nav item gets an honest **"Open on desktop"** card
rather than a broken screen. That is the same decision the dashboard renderer already makes.

### What makes this credible rather than aspirational

Every mechanism above **already exists and already runs under Hermes**:

- `MJGlobal.ClassFactory` and `@RegisterClass` — verified working in the RN bundle since Phase 1.
- `Metadata` / `RunView` / `RunQuery` / `GetEntityObject` — the mobile app's only data path today.
- Permissions, row-level security, and the unified `PermissionEngine` — server-side, unchanged.
- Generic renderers for records, queries, dashboards and conversations — **shipped** in Phase 1.

The gap is not capability. It is that the mobile app currently **hardcodes its screen list** instead
of reading `MJ: Applications`. That is the change this document asks for.

---

## 4. What carries over, what needs work, what stays behind

### Carries over untouched

Entities and the generated ORM · agents, skills and plan mode · actions · queries and views ·
permissions and RLS · artifacts · conversations and realtime sessions · metadata of every kind.
This is the "one TypeScript brain" dividend, and it is the whole reason RN was chosen over Flutter.

### Needs a native surface

Anything that is a *layout* rather than *data*: bespoke dashboards, visual editors, drag-and-drop,
multi-pane workspaces. Also anything touching device capability — camera, biometrics, push, voice,
location, offline capture.

### Should stay desktop-only, deliberately

Admin and configuration surfaces · CodeGen and schema tooling · Component Studio and other authoring
environments · bulk operations and long-form data entry · anything with an irreducible dense grid.
Saying so explicitly is a feature: it stops app teams from porting screens that will disappoint.

---

## 5. The porting path

For a team with an app already on MJ/MJE:

1. **Do nothing, and check what you already get.** Install the mobile app against your instance. Your
   entities, queries, lists, dashboards and agents are already there (T1). For many apps this is
   most of the mobile value.
2. **Pick the one or two workflows that belong on a phone.** Not "which screens do we have" — "what
   does someone do standing up." Usually: look something up, approve something, ask the agent, capture
   something.
3. **Register a mobile driver for those nav items** (T2): `@RegisterClass(BaseMobileResource, '<DriverClass>')`
   in a package the mobile host loads. Your desktop driver is untouched; the metadata row is shared.
4. **Reuse the runtimes, don't rebuild them.** Chat goes through `@memberjunction/conversations-runtime`;
   voice through `@memberjunction/realtime-runtime`. Both are pure TypeScript with no UX dependency —
   you supply presentation, not orchestration.
5. **Add mobile-only surfaces where the phone earns it** (T3).

Steps 1 and 2 are the whole story for most apps. Step 4 is where the leverage is: an app team should
never be writing agent-dispatch or session-orchestration code.

---

## 6. Worked example — Sidecar's LXP

**learn.sidecar.ai** is an AI-native LMS being launched on MJ/MJE. It is the right worked example for
two reasons: it is real, and it has **already been the forcing function for exactly this kind of
extraction once before** — the `conversations-runtime` extraction plan names LXP's always-present AI
tutor as the reason MJ's chat orchestration had to leave the Angular package. Mobile is the second
instance of the same pattern, which is a good sign the pattern is real.

LXP's tutor needs, as recorded in that plan: a full-page tutor home, a tutor surface composited over
a paused video player, a corner-bubble assistant, client tools (the agent calling app functions like
"navigate to lesson"), inline response forms, and streaming progress.

### How LXP lands on mobile

| LXP surface | Tier | How |
|---|---|---|
| **Course / lesson catalog** | **T1** | Lessons, courses, enrollments are MJ entities. Native list + record surfaces render them with zero LXP code. |
| **Progress dashboard** | **T1** | An MJ dashboard — KPI and chart parts already render natively; complex parts degrade honestly. |
| **AI tutor chat** | **T1 → T2** | T1 gives it immediately via the generic conversation surface. T2 is where LXP's *character* lands — the warm tutor persona, resume cards, voice states — as a mobile driver over `conversations-runtime`. Same engine as web; different skin. |
| **Tutor voice mode** | **T2** | `realtime-runtime` + the RN media host. The co-agent voices LXP's tutor agent — target agent is a runtime parameter, so **no LXP-side realtime code at all**. Progress narration ("let me pull up that lesson") is worth more here than anywhere: a learner is often walking or commuting. |
| **Video lesson player** | **T2 / T3** | Genuinely mobile-native — background audio, lock-screen controls, offline download. The composited tutor-over-paused-video surface is a mobile driver. |
| **Authoring / curriculum design** | **desktop-only** | Correctly excluded. |

### What LXP would have to write

A handful of `BaseMobileResource` drivers and their RN screens. **Not**: agent dispatch, default-agent
resolution, mention parsing, streaming, session lifecycle, transcript persistence, tool relay,
narration pacing, permissions, or entity access. Those are MJ primitives on both platforms.

That ratio — app teams writing presentation, MJ providing orchestration — is the measure of whether
this architecture succeeded.

---

## 7. What this requires of Phase 4

This document constrains the work in [`PHASE4-V6-REALTIME.md`](PHASE4-V6-REALTIME.md):

1. **The shell must read `MJ: Applications`**, not a hardcoded screen list. The current drawer is the
   thing to replace.
2. **`BaseMobileResource` + ClassFactory resolution** must exist before any app can reach T2.
3. **The nine generic resource types get native renderers**; `Custom` without a mobile driver degrades
   to "Open on desktop."
4. **No mobile-only forks of shared orchestration.** Every time mobile reimplements something core
   already does, an app team inherits that duplication too. This is the same DRY argument that
   produced the realtime extraction — applied preemptively.
5. **Mobile drivers must be loadable without forking the app shell** — a packaging question (native
   builds are compiled, unlike a web bundle) to be answered in Phase 4: most likely a registry package
   the host depends on, with per-deployment builds, since App Store distribution makes runtime code
   loading both technically and legally fraught.

Item 5 is the genuinely hard one and the honest open question: **the web host can load an app's code
at runtime; a native host generally cannot.** The likely answer is a build-time manifest — the same
shape as MJ's existing class-registration manifests — plus per-customer builds via EAS. That is a
Phase 4 design task, flagged here rather than hand-waved.
