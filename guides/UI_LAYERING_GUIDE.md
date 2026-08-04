# UI Layering Guide

How to build MemberJunction UI so that the same component works in MJ Explorer, in
a standalone Angular app, in someone else's product, and in a test — without a
fork, without a routing dependency, and without copy-and-paste.

> **TL;DR** — Four layers, two hard boundaries.
> **L0** pure TS domain logic (no Angular). **L1** presentational widgets (props in,
> events out, no data access). **L2** composite widgets (may read data through
> `ProviderToUse`, still no navigation). **L3** MJ Explorer surfaces — entity forms
> and resource/dashboard components — thin shells that own `NavigationService`.
>
> **Boundary 1:** nothing at L0–L2 may import `@angular/router` or any Explorer
> package. **Boundary 2:** nothing at L3 may contain domain logic or presentation
> a widget should own.
>
> Layers talk **downward with `@Input()`** and **upward with `@Output()`**, using the
> `Before*` / `After*` cancelable event contract. Enforce it with
> `npm run check:ui-layers`, not with good intentions.

---

## 1. Why this exists

Every UI in this ecosystem eventually gets asked to appear somewhere it wasn't
built for. An order editor built inside an Explorer tab gets asked for on the
Order record's form. A journal-entry line grid built inside a workspace gets asked
for read-only on the JE detail page. A chat pane built for Explorer gets asked for
in a React host.

There are exactly two ways that request can be answered:

| | What happens |
|---|---|
| **Component knows about its host** (imports `Router`, injects `NavigationService`, calls `SharedService`) | It cannot be moved. The second surface gets a **copy** — and from that moment the two copies drift. Bugs get fixed in one. Validation rules diverge. |
| **Component knows only its props and its events** | It gets **embedded**. One implementation, two surfaces, one place to fix a bug. |

This is not a style preference. It is the difference between a component library
and a pile of screens. MJ has already made this choice three times — in
`packages/Angular/Generic/**`, in the [Forms Architecture](FORMS_ARCHITECTURE_GUIDE.md)
stack, and in the [Conversations UX](CONVERSATIONS_UX_STACK_GUIDE.md) stack. This
guide is the general rule those three are instances of, written down once so every
MJ app and every app built **on** MJ can follow it.

---

## 2. The four layers

```
┌─ L3  MJ Explorer surface                    ← the ONLY layer that may navigate
│      ├── Entity form:      BaseFormComponent + @RegisterClass('<Entity Name>')
│      └── Resource/dashboard: BaseResourceComponent / BaseDashboard
│      Owns: NavigationService, NotifyLoadComplete(), query-param round-trip,
│            toasts, tab/deep-link decisions.
│      Contains: NO domain logic, NO markup a widget should own. Thin by rule.
│      Package: <app>-ng            (may depend on @memberjunction/ng-shared)
│
├─ L2  Composite widget                       ← assembles L1 into a working thing
│      Framework-clean Angular. MAY read data — ONLY via ProviderToUse.
│      Prefers entities and models as inputs; may take a key when loading IS its job.
│      Emits intent (RecordOpenRequested, SaveRequested), never performs it.
│      Package: <app>-ng-widgets    (NO ng-shared, NO @angular/router)
│
├─ L1  Presentational widget                  ← props in, events out, that's all
│      Zero data access. Zero injected services beyond Angular's own.
│      Renders what it is given. Testable with a plain object.
│      Package: <app>-ng-widgets
│
└─ L0  Domain runtime                         ← pure TS, no Angular at all
       Money math, validation, state machines, draft models, remote-op clients.
       Importable from Node, a test, a worker, a React app.
       Package: <app>-entities / <app>-engine-base / a *-runtime package
```

**The test for which layer a thing belongs in:**

| Ask | If yes |
|---|---|
| Would this still be correct with no DOM at all? | **L0** |
| Can I render it from a hand-written object literal with no network? | **L1** |
| Does it need to *fetch* something, or coordinate several L1 widgets? | **L2** |
| Does it decide **where the user goes next**, or plug into Explorer's class factory? | **L3** |

If a component answers yes to both "renders a lot of markup" and "decides where the
user goes next", it is two components that haven't been separated yet.

---

## 3. Boundary 1 — no navigation below L3

### The rule

Nothing in an L0/L1/L2 package may import, inject, or reference:

```typescript
// ❌ BANNED below L3
import { Router, ActivatedRoute, NavigationEnd, RouterModule } from '@angular/router';
import { Location } from '@angular/common';                 // when used to navigate
import { NavigationService, SharedService, BaseResourceComponent } from '@memberjunction/ng-shared';
import { ... } from '@memberjunction/ng-explorer-...';
```

The ban covers `package.json` too: a widgets package that *declares*
`@angular/router` or `@memberjunction/ng-shared` as a dependency has already lost the
property, because nothing stops the next commit from using it.

### Why `NavigationService` and not just `Router`

Explorer is a **tabbed SPA, not a set of URLs**. A `/app/<App>/<NavItem>` URL only
works on a cold load, because the shell bootstraps its tab from the address bar.
Once the shell is running, changing the URL does not navigate — navigation means
asking `NavigationService` to open or switch a **tab**. Calling `Router.navigate()`
inside Explorer desynchronizes the shell's tab state from the URL and produces a
tab that shows one thing while the address bar claims another.

So the rule has two halves, and both matter:

- **Below L3:** no routing of any kind. Emit an event.
- **At L3:** routing only through `NavigationService`. Never `Router`.

Full detail: [Navigation & Routing Guide](NAVIGATION_AND_ROUTING_GUIDE.md).

### What a widget does instead

It says *what the user asked for* and lets the host decide what that means:

```typescript
// L2 composite — declares the intent
/** The user asked to open a related record. The host decides how. */
@Output() RecordOpenRequested = new EventEmitter<AfterRecordOpenRequestedEventArgs>();

protected onLineAccountClick(line: JELineModel): void {
    this.RecordOpenRequested.emit(
        new AfterRecordOpenRequestedEventArgs('MJ_BizApps_Accounting: GL Accounts', line.GLAccountID)
    );
}
```

```typescript
// L3 Explorer surface — supplies the meaning
protected async OnRecordOpenRequested(e: AfterRecordOpenRequestedEventArgs): Promise<void> {
    await this.navigationService.OpenEntityRecord(e.EntityName, e.PrimaryKey);
}
```

The same widget in a standalone app opens a dialog instead. In a test, the handler
pushes to an array and asserts. Nothing about the widget changes.

---

## 4. Boundary 2 — no domain logic at L3

An L3 surface is allowed to be boring. Its whole job:

1. Resolve the record or the data scope it was mounted for.
2. Hand it to an L2 composite.
3. Translate the composite's events into `NavigationService` calls, notifications,
   and saves.
4. Call `NotifyLoadComplete()` (required for every `BaseResourceComponent` — see
   [packages/Angular/Explorer/CLAUDE.md](../packages/Angular/Explorer/CLAUDE.md)).

If an entity form's `.html` is 200 lines of table markup, that markup belongs to a
widget. If the form class computes a running balance, that math belongs at L0. The
smell to watch for: **an L3 class that would need editing to change how something
looks.**

A healthy L3 entity form:

```typescript
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Accounting: Journal Entries')
@Component({
    standalone: false,
    selector: 'mj-journal-entry-form',
    template: `
      <mj-record-form-container [Record]="record" [FormComponent]="this">
        <mjacc-journal-entry-detail
          [Entry]="record"
          [Provider]="ProviderToUse"
          (BeforeReversalRequested)="OnBeforeReversal($event)"
          (AfterReversalRequested)="OnAfterReversal($event)"
          (RecordOpenRequested)="OnOpenRecord($event)" />
      </mj-record-form-container>`,
})
export class JournalEntryFormComponentExtended extends mjBizAppsAccountingJournalEntryFormComponent {
    private readonly nav = inject(NavigationService);
    // ... three short handlers, nothing else
}
```

---

## 5. Data access per layer

The rule that actually protects you is **not** "widgets may not touch data." MJ's own
Generic components read data — `entity-data-grid`, `find-record`, `record-selector`
all run views. The rule is **which provider they read through**.

The browser is not inherently single-provider: one Angular app may talk to several
MJ servers, and a component tree can be mounted under a non-default provider. A
component that calls `new RunView()` silently binds itself to the global default and
breaks the moment it is embedded somewhere else.

| Layer | Data access |
|---|---|
| **L0** | Whatever it is given. Pure functions and clients take a provider/connection as an argument. |
| **L1** | **None.** If a presentational widget needs data, it needs an `@Input()`. |
| **L2** | Allowed, but **only** through `BaseAngularComponent`: extend it, and use `this.ProviderToUse`, `RunView.FromMetadataProvider(this.ProviderToUse)`, `this.ProviderToUse.GetEntityObject(...)`. |

**On composite inputs.** Prefer a model or an already-loaded entity — a composite whose input is a
plain object is testable with an object literal. But a composite whose *job* is "show everything
about record X" may legitimately take a key and own the load; that is a design choice, not a
violation. The useful pattern is to accept **both**: a key for hosts that only have one, and a
pre-loaded record for hosts (like an entity form) that already have it, so those skip a round trip.
What a composite may never do is *navigate* — that is the boundary, not data acquisition.
| **L3** | Same provider discipline; additionally owns record loading for the surface. |

```typescript
// ✅ L2 composite
export class JournalEntryDetailComponent extends BaseAngularComponent {
    // inherits @Input() Provider and ProviderToUse

    private async loadLines(): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<mjBizAppsAccountingJournalEntryLineEntity>(
            { EntityName: JE_LINES, ExtraFilter: `JournalEntryID='${this.Entry.ID}'`, ResultType: 'simple' },
            this.ProviderToUse.CurrentUser,
        );
        if (!result.Success) { this.LoadError = result.ErrorMessage ?? 'Failed to load lines.'; return; }
        // ...
    }
}
```

`RunView` does not throw — always check `.Success`. Full rules:
[`.claude/rules/data-access.md`](../.claude/rules/data-access.md) and the
multi-provider section of [packages/Angular/CLAUDE.md](../packages/Angular/CLAUDE.md).

---

## 6. The event contract

Layers communicate **downward with `@Input()`** and **upward with `@Output()`**. The
upward half follows MJ's `Before*` / `After*` cancelable pattern, already used by
`ng-base-forms`, `ng-trees`, `ng-entity-viewer`, `ng-conversations`, and
`ng-record-changes`.

### The rules

1. An **action** that a host might want to veto ships as a **pair**:
   `Before<Verb>` and `After<Verb>`.
2. `Before*` args extend a cancelable base carrying `Cancel: boolean` and an optional
   `CancelReason?: string`.
3. The component checks `if (args.Cancel) return;` and **does not emit `After*`** on the
   canceled path. This is a contract, not a suggestion — hosts rely on it.
4. **Informational** events (progress, a selection changed, a load finished) are a
   single emitter with no `Before` pair. Don't invent a veto for something that
   cannot be vetoed.
5. Event args are **classes**, not interfaces — the component has to `new` them, and a
   class gives one place for defaults and future fields.
6. Everything public is **PascalCase**: inputs, outputs, event-arg properties,
   public methods. Private/protected members are camelCase. (Repo-wide convention —
   see [`.claude/rules/typescript-style.md`](../.claude/rules/typescript-style.md).)

### The shape

```typescript
/**
 * Base for cancelable journal-entry events. A listener flips `Cancel = true` to
 * halt the default behavior; the matching `After*` event will NOT fire.
 */
export class CancellableJournalEntryEventArgs {
    public Cancel: boolean = false;
    public CancelReason?: string;
}

/** Fired BEFORE a reversal is requested. Cancel to block it (e.g. period is closed). */
export class BeforeReversalRequestedEventArgs extends CancellableJournalEntryEventArgs {
    constructor(
        public readonly JournalEntryID: string,
        public readonly Reason: string,
    ) { super(); }
}

/** Fired AFTER the reversal request completed. NOT fired when the Before was canceled. */
export class AfterReversalRequestedEventArgs {
    constructor(
        public readonly JournalEntryID: string,
        public readonly ReversalEntryNumber: string | null,
        public readonly Success: boolean,
        public readonly ErrorMessage: string | null = null,
    ) {}
}
```

```typescript
// In the component — the canonical emit sequence
public async RequestReversal(): Promise<void> {
    const before = new BeforeReversalRequestedEventArgs(this.Entry.ID, this.ReversalReason);
    this.BeforeReversalRequested.emit(before);
    if (before.Cancel) {
        this.StatusMessage = before.CancelReason ?? 'Reversal canceled.';
        return;                                   // ← After* deliberately NOT emitted
    }

    const result = await this.performReversal();
    this.AfterReversalRequested.emit(
        new AfterReversalRequestedEventArgs(this.Entry.ID, result.ReversalEntryNumber, result.Success, result.ErrorMessage),
    );
}
```

### Naming

| Thing | Convention | Example |
|---|---|---|
| Cancelable base | `Cancellable<Domain>EventArgs` | `CancellableJournalEntryEventArgs` |
| Before event | `Before<Verb><Noun>` | `BeforeLineRemoved` |
| After event | `After<Verb><Noun>` | `AfterLineRemoved` |
| Args class | `<EventName>EventArgs` | `BeforeLineRemovedEventArgs` |
| Intent-only event | `<Noun><Verb>Requested` | `RecordOpenRequested` |
| Selector prefix | app-scoped, 3–4 chars | `mjacc-`, `mjo-`, `mj-` |

### Why a class and not just a payload

Because `Cancel` has to travel **back**. Angular `EventEmitter` is synchronous for
synchronous listeners, so the emitting component can read the mutated object after
`.emit()` returns. That is the whole mechanism, and it is why `Before*` args must be
a mutable object and why `Before*` handlers must not be `async` — an `await` inside
the handler returns control before it sets `Cancel`. If a host genuinely needs to
`await` (a confirm dialog), the widget should expose the action as an imperative
method the host calls after its own await, rather than pretending the veto is
asynchronous.

---

## 7. Packaging

Layers you can't enforce are layers you don't have. The enforcement mechanism is the
**package boundary**, because npm dependencies are checkable and import discipline is not.

```
@mj-biz-apps/<app>-entities        L0   pure TS · CodeGen entities · draft models · math
@mj-biz-apps/<app>-engine-base     L0   pure TS · caches, validation, remote-op clients
@mj-biz-apps/<app>-ng-widgets      L1+L2  Angular · NO @angular/router · NO ng-shared
@mj-biz-apps/<app>-ng              L3   Angular · forms + resource components · ng-shared OK
```

**Allowed dependencies, by package:**

| Package | May depend on |
|---|---|
| `*-entities`, `*-engine-base` | `@memberjunction/core`, `core-entities`, `global`, `graphql-dataprovider` |
| `*-ng-widgets` | the L0 packages · `@angular/{core,common,forms,animations}` · `@memberjunction/ng-base-types`, `ng-ui-components`, `ng-shared-generic`, `ng-base-forms`, `ng-entity-viewer`, any `Generic/**` package |
| `*-ng` | everything above **plus** `@memberjunction/ng-shared` (`NavigationService`, `BaseResourceComponent`) |

**No cross-package re-exports.** `*-ng` must not re-export the widgets package's
symbols for convenience; consumers import from the package that defines them. (See
critical rule 5 in the app CLAUDE.md files and
[`.claude/rules/typescript-style.md`](../.claude/rules/typescript-style.md).) Splitting a
published package therefore *is* a breaking change — take the version bump rather
than papering over it with re-exports.

### Check MJ first

The cheapest widget is the one you don't write. Before adding anything to a widgets
package, search `packages/Angular/Generic/**` and `@memberjunction/ng-ui-components`
for the idiom. MJ already ships left nav, page chrome, stat badges, loading states,
dialogs, data grids, trees, timelines, kanban, tab strips and record selectors. A
locally-built duplicate is a maintenance debt with no upside.

---

## 8. Enforcement

Prose rules drift. `packages/Angular/Generic/CLAUDE.md` has banned Router imports for
a long time, and at the time this guide was written six source files and roughly a
dozen `package.json` files in that tree had drifted anyway. So the rule ships with a
gate.

```bash
npm run check:ui-layers        # opt-in packages only; exits 1 on a violation
```

A package opts in by declaring its layer in its own `package.json`:

```jsonc
{
  "name": "@mj-biz-apps/accounting-ng-widgets",
  "mjUILayer": "widgets"        // "widgets" (L1+L2) | "surface" (L3) | "runtime" (L0)
}
```

| Layer value | What the gate checks |
|---|---|
| `runtime` | No `@angular/*` imports or dependencies at all. |
| `widgets` | No `@angular/router`, no `@memberjunction/ng-shared`, no `@memberjunction/ng-explorer-*` — in **source or manifest**. No `Router` / `ActivatedRoute` / `NavigationService` / `SharedService` / `BaseResourceComponent` / `BaseDashboard` symbols. No global `new RunView()` / `new Metadata()` / `new RunQuery()` (use `ProviderToUse`). |
| `surface` | No `Router` / `ActivatedRoute` / `NavigationEnd` symbols — L3 navigates through `NavigationService` only. Importing `RouterModule` for declarative `routerLink` chrome is allowed; L3 already lives inside an app that has Router configured, and what breaks the shell is *imperative* navigation. |
| `shell` | Nothing. This is the navigation layer **itself** — `ng-explorer-core`, `ng-explorer-app` and `ng-shared` are what `NavigationService` is implemented on top of, so banning Router there would ban the implementation of the rule. Declaring the layer makes the exception **enumerable** instead of leaving those packages looking un-reviewed. In MJ it is exactly four: `ng-explorer-core`, `ng-explorer-app`, `ng-shared`, `ng-bootstrap` (auth shell + app initialization). A `shell` declaration on anything that is not literally the navigation or bootstrap layer is a rule being avoided, not applied. |

Comments are stripped before matching, so a JSDoc block that *explains* a banned
construct is not itself a violation — a gate that can't tell those apart is a gate
people turn off.

The script lives at
[`.github/scripts/check-ui-layers.mjs`](../.github/scripts/check-ui-layers.mjs) and is
**self-contained on purpose** — it has no MJ-specific imports, so app repos and
external teams copy the single file, add the npm script, and get the same gate. It is
opt-in per package so a repo can adopt it one package at a time instead of blocking on
a full cleanup.

An app repo can also express the boundary as a unit test — see
`bizapps-accounting`'s `transfer-pending-purity.test.ts` for that idiom. Either is
fine; having neither is not.

---

## 9. Worked examples in this repo

| Example | Layers | Read it for |
|---|---|---|
| [Forms Architecture Guide](FORMS_ARCHITECTURE_GUIDE.md) | L1–L3 | How `MjEntityFormHostComponent` renders any entity on any surface and **emits `Navigate` instead of routing**. The canonical L2→L3 seam. |
| [Conversations UX Stack Guide](CONVERSATIONS_UX_STACK_GUIDE.md) | L0–L3 | A pure-TS runtime under an Angular widget, with **adapter interfaces** for the host concerns (notifications, task tracking) the widget must not own. |
| `packages/Angular/Generic/trees` | L1 | A clean `Before*`/`After*` event module (`events/tree-events.ts`) with tests. |
| `packages/Angular/Generic/entity-viewer` | L2 | Data-reading widget done right — `ProviderToUse` throughout, grid events as cancelable pairs. |
| `packages/Angular/Explorer/shared` | L3 | `BaseResourceComponent`, `NavigationService`, the query-param round-trip. |

---

## 10. Migrating an existing screen

You will usually meet this pattern as a 400-line component that does everything. Take
it apart in this order — each step is independently shippable and independently
reviewable.

1. **Find the duplicate first.** The strongest case for layering is two components
   rendering the same concept. Extract *that* first: it pays for itself immediately
   and makes the argument for the rest.
2. **Push math down to L0.** Balance checks, totals, validation, state transitions.
   Pure functions, unit-tested with object literals, no Angular import.
3. **Carve the markup into L1 widgets.** One widget per visual concept. Inputs are
   plain models, not entities, wherever a plain model will do.
4. **Assemble an L2 composite.** It owns loading (via `ProviderToUse`) and the
   arrangement. It emits `Before*`/`After*` and `*Requested`. It never navigates.
5. **Reduce the original component to L3.** It should end up as a template embedding
   the composite plus a handful of short event handlers. If it doesn't, something in
   steps 2–4 is unfinished.
6. **Move L1+L2 into the widgets package** and turn on the gate. Do this last — the
   gate is what stops the next commit from undoing steps 1–5.

**Do not do this as one big-bang sweep.** One vertical slice, fully migrated with
tests, teaches the pattern and gives the rest a template. A 40-file mechanical sweep
teaches nothing and reviews badly.

---

## 11. Scope: this applies to every MJ repo

This pattern is the standard for **all MemberJunction repositories** — MJ core, every
BizApps Open App (`bizapps-common`, `bizapps-orders`, `bizapps-accounting`,
`bizapps-contracts`, and their siblings), and every other Blue Cypress product built
on MJ, including BCSaaS. It is also the **recommended pattern for external teams**
building on MemberJunction: the guide, the layer table, and
`.github/scripts/check-ui-layers.mjs` are all copyable without modification.

Adoption is incremental by design: declare `mjUILayer` on packages that already
comply, migrate one vertical slice at a time, and let the gate hold each gain. A repo
does not have to be clean to start; it has to stop getting dirtier.

---

## Related

- [Navigation & Routing Guide](NAVIGATION_AND_ROUTING_GUIDE.md) — why `NavigationService`, never `Router`
- [Forms Architecture Guide](FORMS_ARCHITECTURE_GUIDE.md) — the L1–L3 stack for entity forms
- [Conversations UX Stack Guide](CONVERSATIONS_UX_STACK_GUIDE.md) — the L0–L3 stack with adapters
- [Dashboard Best Practices](DASHBOARD_BEST_PRACTICES.md) — L3 resource components
- [Building Apps on MJ](BUILDING_APPS_ON_MJ.md) — the wider app-authoring picture
- [packages/Angular/CLAUDE.md](../packages/Angular/CLAUDE.md) — multi-provider `@Input() Provider`
- [packages/Angular/Generic/CLAUDE.md](../packages/Angular/Generic/CLAUDE.md) — the no-Router rule
- [packages/Angular/Explorer/CLAUDE.md](../packages/Angular/Explorer/CLAUDE.md) — `NotifyLoadComplete`, query params
