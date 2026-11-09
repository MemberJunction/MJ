# Records Preview Tabs: Promote on First Edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A records-region preview tab is permanently promoted (pinned) the moment its form enters edit mode, so a just-saved record is never replaced by the next plain click and never renders italic while being edited.

**Architecture:** Add one event, `EditModeChanged`, to `BaseFormComponent` and relay it up the chain that already carries `Navigate` / `RecordSaved`: form → `MjEntityFormHostComponent` → `SingleRecordComponent` → `EntityRecordResource` → `BaseResourceComponent` callback → `TabContainerComponent`, which calls a new idempotent `WorkspaceStateManager.PinTab(tabId)`. The existing `IsEditing()` read-through guard stays as a fallback for resources that report edit state without raising the event. Nothing in this plan touches `MJAPI` or `MJExplorer`.

**Tech Stack:** Angular (non-standalone components, `@Output()` EventEmitters), Vitest (node preset for logic specs that `vi.mock('@angular/core')`, `.dom.test.ts` preset for specs that need real Angular), pnpm workspace.

**Spec:** GitHub issue [MemberJunction/MJ#4345](https://github.com/MemberJunction/MJ/issues/4345), Option 1 ("Promote on first edit"). Background and the design it amends: [`plans/records-temporary-tabs-plan.md`](records-temporary-tabs-plan.md) (PR #4154), decision D1.

## Why Option 1 and not Option 2

Option 2 (keep the transient guard, fix the wording) leaves the user-visible behavior the issue describes: edit, save, click the next row, and the record you just worked on disappears. Option 1 is what the #4154 description promised, matches VS Code, and fixes the italic-while-editing inconsistency with the same change. The cost is one new `@Output` on `BaseFormComponent` and a relay through four packages, all additive.

**One UX consequence to flag for Matt:** a pinned tab in this shell shows a thumbtack and hides its close X (`tab-container.component.css:550`). After this change, every record the user edits gets that treatment, exactly as new-record tabs already do since #4154 ("a UX call and can be revisited"). Closing a promoted tab means unpin first (double-click or the thumbtack) or use the context menu. That is the existing vocabulary for "promoted", so this plan does not change it; if Matt wants promoted record tabs to keep a close X, that is a separate design decision on the pinned-tab chrome, not on this mechanism.

## Global Constraints

- **No commits.** Repo rule: never run `git commit` without Matt's explicit per-commit request. Tasks below end at "tests pass"; there are deliberately no commit steps.
- **No `any`, no `as any`, no `.Get()`/`.Set()`** (`.claude/rules/typescript-style.md`). Every new handler is typed `(editing: boolean) => void`.
- **Never modify `packages/MJAPI` or `packages/MJExplorer`.** All changes live in `ng-base-forms`, `ng-shared`, `ng-base-application`, `ng-explorer-core`.
- **Build order matters** (live-linked workspace): `Generic/base-forms` → `Explorer/shared` → `Explorer/base-application` → `Explorer/explorer-core`. Build each with `cd packages/Angular/<path> && pnpm run build`, never turbo from root.
- **Worktree has no `node_modules`.** Matt runs `pnpm install` at the repo root himself before any build or test can run here. Surface the need; do not run it.
- **Changeset bump level is `patch`** for all four packages (`.claude/rules/changesets.md`: `minor` is reserved for migration/metadata branches).
- **Records region only.** Promotion is gated on `TabContainerComponent.isRecordTab(tab)`, i.e. records style active AND `IsRecordsRegionTab(configuration)`. Classic style and docked records keep today's behavior (see Review Focus).
- **Idempotent pin.** `PinTab` on an already-pinned tab must not emit a configuration update: new-record tabs are born pinned and the form emits `EditModeChanged(true)` on init, so a non-idempotent pin would write workspace state on every new record open.

## Review Focus

Inputs the issue implies but does not spell out, each pinned by a test in the owning task:

1. **Save, then click the next row.** `SaveRecord(true)` calls `EndEditMode()`, which emits `EditModeChanged(false)`. The tab must STAY pinned: promotion is sticky, exactly like VS Code. Pinned by Task 5 ("`editing=false` never unpins") and Task 1 (pool test: a pinned record survives the next plain open).
2. **Cancel an edit without saving.** Same emission as (1). The tab stays promoted. VS Code also keeps a once-modified preview promoted after undo. Covered by the same Task 5 test.
3. **A record opened straight into edit mode** via `EntityFormConfig.StartInEditMode` (the host assigns `instance.EditMode = true` directly; `StartEditMode()` never runs). Without a post-mount emission the tab would be editing, unpinned, italic. Pinned by Task 2 ("host emits `true` after mount when the form starts in edit mode").
4. **A brand-new record** (born pinned per `navigation.service.ts:1089`). `ngOnInit` calls `StartEditMode()` and emits `true`; `PinTab` must be a no-op with no configuration write. Pinned by Task 1 ("already pinned: no emission") and Task 5 ("already pinned: `PinTab` not called").
5. **A record docked to the workspace, or any tab under classic style.** `isRecordTab` is false, so no promotion; that tab's pin state stays user-owned. Pinned by Task 5 (docked and classic cases). Classic-style record tabs are consumable by a nav click today with no edit guard at all; that is pre-existing and out of scope here, noted as a follow-up in Task 6.

---

### Task 1: `WorkspaceStateManager.PinTab` (ng-base-application)

**Files:**
- Modify: `packages/Angular/Explorer/base-application/src/lib/workspace-state-manager.ts` (next to `TogglePin`, around line 660)
- Test: `packages/Angular/Explorer/base-application/src/lib/__tests__/base-application.test.ts` (inside the existing `describe` that sets `RecordsRegionTabFilter`, after the `'never replaces a PINNED (promoted) record'` case around line 650)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PinTab(tabId: string): void` on `WorkspaceStateManager`. Idempotent: no-op (no `UpdateConfiguration` call) when the tab is missing or already pinned. Task 5 calls it.

- [ ] **Step 1: Write the failing tests**

Add to `base-application.test.ts`, inside the records-pool `describe` (the one whose `beforeEach` assigns the three filters), as a new nested `describe`:

```ts
  describe('PinTab (promote-on-edit)', () => {
    it('pins an unpinned region record', () => {
      const id = openRecord('r1');
      manager.PinTab(id);
      expect(tabs().find(t => t.id === id)!.isPinned).toBe(true);
    });

    it('is a no-op for an already-pinned tab: no configuration emission', () => {
      const id = openRecord('r1');
      manager.PinTab(id);
      const spy = vi.spyOn(manager, 'UpdateConfiguration');
      manager.PinTab(id);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('is a no-op for an unknown tab id', () => {
      openRecord('r1');
      const spy = vi.spyOn(manager, 'UpdateConfiguration');
      manager.PinTab('no-such-tab');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('a promoted record survives the next plain open, and survives after the edit ends', () => {
      // The issue's repro: edit (promote), save (edit mode ends), click the next row.
      const editedId = openRecord('r1');
      manager.PinTab(editedId);
      // Nothing unpins on save — promotion is sticky. The next plain open must
      // land in its own tab rather than replacing r1.
      const nextId = openRecord('r2');
      expect(nextId).not.toBe(editedId);
      expect(tabs().length).toBe(2);
      expect(tabs().find(t => t.id === editedId)!.resourceRecordId).toBe('r1');
      expect(tabs().find(t => t.id === editedId)!.isPinned).toBe(true);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/Angular/Explorer/base-application && pnpm test -- base-application.test.ts`
Expected: the four new cases FAIL with `manager.PinTab is not a function`.

- [ ] **Step 3: Implement `PinTab`**

In `workspace-state-manager.ts`, directly above `TogglePin`:

```ts
  /**
   * Pin a tab, idempotently. Used to PROMOTE a records-region preview tab the
   * moment its form enters edit mode (VS Code's promote-on-modify): a promoted
   * tab is pinned, so it is neither replaceable by the next plain open nor
   * rendered italic. Unlike TogglePin this never unpins, and it emits NO
   * configuration update when the tab is already pinned or does not exist —
   * new-record tabs are born pinned and report edit mode on init, so a
   * non-idempotent pin would persist workspace state on every new record.
   */
  PinTab(tabId: string): void {
    const config = this.configuration$.value;
    if (!config) return;
    const tab = config.tabs.find(t => t.id === tabId);
    if (!tab || tab.isPinned) return;

    this.UpdateConfiguration({
      ...config,
      tabs: config.tabs.map(t => (t.id === tabId ? { ...t, isPinned: true } : t))
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/Angular/Explorer/base-application && pnpm test`
Expected: all cases PASS (the suite was 53 passing at #4154; expect 57).

- [ ] **Step 5: Build the package**

Run: `cd packages/Angular/Explorer/base-application && pnpm run build`
Expected: clean TypeScript build.

---

### Task 2: `EditModeChanged` on `BaseFormComponent` and the host relay (ng-base-forms)

**Files:**
- Modify: `packages/Angular/Generic/base-forms/src/lib/base-form-component.ts` (outputs region around line 231; `StartEditMode`/`EndEditMode` at lines 384–399)
- Modify: `packages/Angular/Generic/base-forms/src/lib/host/entity-form-host.component.ts` (outputs around line 153; mount at line 309; `subscribeToFormEvents` at line 429)
- Test (new): `packages/Angular/Generic/base-forms/src/lib/base-form-component.edit-mode-changed.dom.test.ts`
- Test (new): `packages/Angular/Generic/base-forms/src/lib/host/entity-form-host.edit-mode-relay.dom.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `BaseFormComponent.EditModeChanged: EventEmitter<boolean>` — emits `true` from `StartEditMode()`, `false` from `EndEditMode()`, every call (not transition-gated; see Review Focus 4 for why that is safe).
  - `MjEntityFormHostComponent.EditModeChanged: EventEmitter<boolean>` — relays the form's emitter, and additionally emits `true` once right after mount when the freshly created form's `EditMode` is already true (covers `StartInEditMode` and new records). Task 4 binds it in `single-record.component.html`.

- [ ] **Step 1: Write the failing form test**

Create `base-form-component.edit-mode-changed.dom.test.ts` next to `base-form-component.ts`. It follows `base-form-component.validation.dom.test.ts`: a real `BaseEntity`, `TestBed.runInInjectionContext`, no template, no lifecycle.

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { capture } from '@memberjunction/ng-test-utils';
import { BaseEntity, BaseEntityResult, EntityInfo } from '@memberjunction/core';
import { BaseFormComponent } from './base-form-component';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() };
});

/**
 * `EditModeChanged` is the signal the Explorer shell uses to PROMOTE a records
 * preview tab (pin it) the moment the user starts editing — VS Code's
 * promote-on-modify. It must fire on StartEditMode (true) and EndEditMode
 * (false), including the EndEditMode that SaveRecord(true) performs, so the
 * shell can prove it never UNpins on save.
 */
@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;
}

class SavingEntity extends BaseEntity {
  public override async Save(): Promise<boolean> {
    const result = new BaseEntityResult();
    result.Type = 'update';
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    result.Success = true;
    this.RegisterResultHistoryEntry(result);
    return true;
  }
}

function makeRecord(): SavingEntity {
  const info = new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000003',
    Name: 'Test Widgets',
    Status: 'Active',
    BaseTable: 'TestWidget',
    BaseView: 'vwTestWidgets',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
    ],
  });
  const entity = new SavingEntity(info);
  entity.SetMany({ ID: '11111111-2222-3333-4444-555555555555', Name: 'Widget A' }, true, true);
  return entity;
}

function makeForm(): TestForm {
  const form = TestBed.runInInjectionContext(() => new TestForm());
  form.record = makeRecord();
  return form;
}

describe('BaseFormComponent.EditModeChanged', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
  });

  it('emits true when edit mode starts', () => {
    const form = makeForm();
    const emitted = capture(form.EditModeChanged);
    form.StartEditMode();
    expect(form.EditMode).toBe(true);
    expect(emitted).toEqual([true]);
  });

  it('emits false when edit mode ends', () => {
    const form = makeForm();
    form.StartEditMode();
    const emitted = capture(form.EditModeChanged);
    form.EndEditMode();
    expect(form.EditMode).toBe(false);
    expect(emitted).toEqual([false]);
  });

  it('a save that stops edit mode emits false (the shell must not treat this as "unpin")', async () => {
    const form = makeForm();
    form.StartEditMode();
    const emitted = capture(form.EditModeChanged);
    const ok = await form.SaveRecord(true);
    expect(ok).toBe(true);
    expect(emitted).toEqual([false]);
  });

  it('a save that keeps edit mode emits nothing', async () => {
    const form = makeForm();
    form.StartEditMode();
    const emitted = capture(form.EditModeChanged);
    await form.SaveRecord(false);
    expect(emitted).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Angular/Generic/base-forms && pnpm test -- base-form-component.edit-mode-changed`
Expected: FAIL — `capture(form.EditModeChanged)` throws because the property is undefined.

- [ ] **Step 3: Add the output and the emissions to `BaseFormComponent`**

In the `// #region @Output Events` block (after `RecordReady` at line 262):

```ts
  /**
   * Emitted whenever edit mode starts (`true`) or ends (`false`). The Explorer
   * shell uses the `true` edge to PROMOTE a records preview tab — pin it — the
   * moment the user starts editing (VS Code's promote-on-modify), so a record
   * being edited is neither replaceable by the next plain open nor italic.
   * Fires on every call, not only on transitions: a new record's ngOnInit
   * re-asserts edit mode and the shell's pin is idempotent.
   */
  @Output() EditModeChanged = new EventEmitter<boolean>();
```

Then in `StartEditMode()` / `EndEditMode()`:

```ts
  public StartEditMode(): void {
    this.EditMode = true;
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.setEditMode(entityName, true);
    }
    this.EditModeChanged.emit(true);
  }

  public EndEditMode(): void {
    this.EditMode = false;
    this.clearValidationState();
    const entityName = this.getEntityName();
    if (entityName) {
      this.formStateService.setEditMode(entityName, false);
    }
    this.EditModeChanged.emit(false);
  }
```

`InteractiveFormComponent` overrides both and calls `super`, so React-backed forms emit too with no change.

- [ ] **Step 4: Run the form test to verify it passes**

Run: `cd packages/Angular/Generic/base-forms && pnpm test -- base-form-component.edit-mode-changed`
Expected: 4 PASS.

- [ ] **Step 5: Write the failing host relay test**

Create `host/entity-form-host.edit-mode-relay.dom.test.ts`. The host cannot mount a real form without metadata (see the comment at the top of `entity-form-host.component.dom.test.ts`), so this reaches the private `subscribeToFormEvents` through the prototype with a fake form that has real `EventEmitter`s. Runs under the dom preset only because it imports the real `@angular/core`.

```ts
import { describe, it, expect } from 'vitest';
import { EventEmitter } from '@angular/core';
import { MjEntityFormHostComponent } from './entity-form-host.component';

/**
 * The host re-emits the form's EditModeChanged so the Explorer wrapper
 * (SingleRecordComponent) can bind it in its template without reaching into
 * the live form. Tested through subscribeToFormEvents with a fake form: a real
 * mount needs metadata, and the relay is the only thing under test here.
 */
type FakeForm = {
  Navigate: EventEmitter<unknown>;
  Notification: EventEmitter<unknown>;
  RecordSaved: EventEmitter<unknown>;
  RecordRefreshed: EventEmitter<{ Record: unknown }>;
  RecordDeleted: EventEmitter<unknown>;
  RecordSaveFailed: EventEmitter<unknown>;
  ValidationFailed: EventEmitter<unknown>;
  RecordReady: EventEmitter<unknown>;
  EditModeChanged: EventEmitter<boolean>;
  EditMode: boolean;
};

function fakeForm(editMode = false): FakeForm {
  return {
    Navigate: new EventEmitter(),
    Notification: new EventEmitter(),
    RecordSaved: new EventEmitter(),
    RecordRefreshed: new EventEmitter(),
    RecordDeleted: new EventEmitter(),
    RecordSaveFailed: new EventEmitter(),
    ValidationFailed: new EventEmitter(),
    RecordReady: new EventEmitter(),
    EditModeChanged: new EventEmitter<boolean>(),
    EditMode: editMode,
  };
}

function hostWithRelay(form: FakeForm): { host: MjEntityFormHostComponent; emitted: boolean[] } {
  const host = Object.create(MjEntityFormHostComponent.prototype) as MjEntityFormHostComponent;
  const internals = host as unknown as Record<string, unknown>;
  internals['_formEventSubs'] = [];
  internals['cleanupFormSubs'] = () => undefined;
  for (const key of ['Navigate', 'Notification', 'RecordSaved', 'RecordRefreshed', 'RecordDeleted',
    'RecordSaveFailed', 'ValidationFailed', 'RecordReady', 'Dismissed', 'EditModeChanged']) {
    internals[key] = new EventEmitter();
  }
  const emitted: boolean[] = [];
  host.EditModeChanged.subscribe((v: boolean) => emitted.push(v));
  (host as unknown as { subscribeToFormEvents(f: unknown): void }).subscribeToFormEvents(form);
  return { host, emitted };
}

describe('MjEntityFormHostComponent relays EditModeChanged', () => {
  it('re-emits true and false from the form', () => {
    const form = fakeForm();
    const { emitted } = hostWithRelay(form);
    form.EditModeChanged.emit(true);
    form.EditModeChanged.emit(false);
    expect(emitted).toEqual([true, false]);
  });

  it('emits true once after mount when the form already starts in edit mode (StartInEditMode / new record)', () => {
    const form = fakeForm(true);
    const { host, emitted } = hostWithRelay(form);
    (host as unknown as { announceInitialEditMode(f: unknown): void }).announceInitialEditMode(form);
    expect(emitted).toEqual([true]);
  });

  it('emits nothing after mount when the form starts in read mode', () => {
    const form = fakeForm(false);
    const { host, emitted } = hostWithRelay(form);
    (host as unknown as { announceInitialEditMode(f: unknown): void }).announceInitialEditMode(form);
    expect(emitted).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd packages/Angular/Generic/base-forms && pnpm test -- entity-form-host.edit-mode-relay`
Expected: FAIL — `form.EditModeChanged` is never relayed (first case gets `[]`), and `announceInitialEditMode` is not a function.

- [ ] **Step 7: Add the host output, relay, and post-mount announcement**

In `entity-form-host.component.ts`, outputs block (after `FormCreated` at line 153):

```ts
  /**
   * Re-emitted form `EditModeChanged` (true = edit started, false = ended),
   * plus one `true` right after mount when the form was created already in
   * edit mode (`StartInEditMode`, or a new record) — StartEditMode never runs
   * in that path, so without this the shell would never hear about it.
   */
  @Output() EditModeChanged = new EventEmitter<boolean>();
```

In `subscribeToFormEvents` add one line to the first `push`:

```ts
      form.RecordReady.subscribe(e => this.RecordReady.emit(e)),
      form.EditModeChanged.subscribe(e => this.EditModeChanged.emit(e)),
```

Add the helper next to `subscribeToFormEvents`:

```ts
  /**
   * Announce edit mode that was set by ASSIGNMENT rather than by
   * StartEditMode() — the mount path writes `instance.EditMode` directly, so
   * a form that starts in edit mode would otherwise be editing, unpinned and
   * italic in a records preview tab. Safe to fire alongside ngOnInit's own
   * StartEditMode for a new record: the shell's pin is idempotent.
   */
  private announceInitialEditMode(form: BaseFormComponent): void {
    if (form.EditMode) {
      this.EditModeChanged.emit(true);
    }
  }
```

And call it in the mount path (line 313, right after `this.subscribeToFormEvents(instance);`):

```ts
      this.subscribeToFormEvents(instance);
      this.announceInitialEditMode(instance);
```

- [ ] **Step 8: Run the whole package suite**

Run: `cd packages/Angular/Generic/base-forms && pnpm test`
Expected: all PASS, both projects (node and dom). Report pass/fail/skip counts.

- [ ] **Step 9: Build the package**

Run: `cd packages/Angular/Generic/base-forms && pnpm run build`
Expected: clean build. (Explorer packages compile against this `dist`; it must be rebuilt before Task 4.)

---

### Task 3: `ResourceEditModeChangedEvent` on `BaseResourceComponent` (ng-shared)

**Files:**
- Modify: `packages/Angular/Explorer/shared/src/lib/base-resource-component.ts` (callback properties at lines 102–108; `NotifyCloseRequested` / `IsEditing` at lines 438–456)
- Test (new): `packages/Angular/Explorer/shared/src/lib/__tests__/base-resource-edit-mode.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `BaseResourceComponent.ResourceEditModeChangedEvent: ((editing: boolean) => void) | null` getter/setter, same shape as `ResourceCloseRequestedEvent`. Task 5 assigns it.
  - `protected NotifyEditModeChanged(editing: boolean): void` — invokes the handler if set. Task 4 calls it from `EntityRecordResource`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/base-resource-edit-mode.test.ts`, following the mock preamble of `base-dashboard-loadcomplete.test.ts` in the same folder (node preset; `@angular/core` mocked to no-op decorators):

```ts
import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';

const injectStub = {
   QueryParamChanged$: new Subject<unknown>(),
   ObserveTabQueryParams: () => new Subject<unknown>(),
   markForCheck: vi.fn(),
};
vi.mock('@angular/core', () => ({
   Directive: () => (target: unknown) => target,
   Injectable: () => (target: unknown) => target,
   Input: () => () => {},
   Output: () => () => {},
   inject: () => injectStub,
   ChangeDetectorRef: class {},
   EventEmitter: class<T> { public emit = vi.fn<(value?: T) => void>(); },
}));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('../navigation.service', () => ({ NavigationService: class {}, TabQueryParamUpdateGuard: class {} }));
vi.mock('@memberjunction/core-entities', () => ({
   ResourceData: class { public Configuration: Record<string, unknown> = {}; },
   MJDashboardEntityExtended: class {},
}));
vi.mock('@memberjunction/core', () => ({
   LogError: vi.fn(),
   CompositeKey: class {},
   BaseEntity: class {},
}));

import { BaseResourceComponent } from '../base-resource-component';

/**
 * The edit-mode callback is how a hosted form's "edit started" reaches the
 * tab container, which promotes (pins) the records preview tab. Same shape as
 * ResourceCloseRequestedEvent: a settable callback the shell wires at creation.
 */
class TestResource extends BaseResourceComponent {
   async GetResourceDisplayName(): Promise<string> { return 'x'; }
   async GetResourceIconClass(): Promise<string> { return ''; }
   public editModeChanged(editing: boolean): void { this.NotifyEditModeChanged(editing); }
}

describe('BaseResourceComponent.NotifyEditModeChanged', () => {
   it('invokes the wired handler with the edit flag', () => {
      const r = new TestResource();
      const handler = vi.fn<(editing: boolean) => void>();
      r.ResourceEditModeChangedEvent = handler;
      r.editModeChanged(true);
      r.editModeChanged(false);
      expect(handler.mock.calls).toEqual([[true], [false]]);
   });

   it('is a no-op when nothing is wired (resources hosted outside the shell)', () => {
      const r = new TestResource();
      expect(() => r.editModeChanged(true)).not.toThrow();
   });

   it('keeps the IsEditing() fallback at its default of false', () => {
      expect(new TestResource().IsEditing()).toBe(false);
   });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Angular/Explorer/shared && pnpm test -- base-resource-edit-mode`
Expected: FAIL — `NotifyEditModeChanged` is not a function (TypeScript error at compile, or runtime TypeError under vitest's esbuild transform).

- [ ] **Step 3: Add the callback and the notifier**

In `base-resource-component.ts`, after the `ResourceCloseRequestedEvent` setter (line 108):

```ts
    private _resourceEditModeChangedEvent: ((editing: boolean) => void) | null = null;
    /**
     * Wired by the tab container. `true` means the hosted form just entered edit
     * mode; the shell PROMOTES (pins) a records preview tab on that edge so the
     * record is never replaced by the next plain open — VS Code's
     * promote-on-modify. `false` is informational; promotion is sticky.
     */
    public get ResourceEditModeChangedEvent(): ((editing: boolean) => void) | null {
        return this._resourceEditModeChangedEvent;
    }
    public set ResourceEditModeChangedEvent(value: ((editing: boolean) => void) | null) {
        this._resourceEditModeChangedEvent = value;
    }
```

After `NotifyCloseRequested()` (line 442):

```ts
    /**
     * Tell the host shell the hosted form's edit mode changed. Subclasses that
     * host an editable form call this from the form's EditModeChanged output.
     */
    protected NotifyEditModeChanged(editing: boolean): void {
        if (this._resourceEditModeChangedEvent) {
            this._resourceEditModeChangedEvent(editing);
        }
    }
```

Update the `IsEditing()` doc comment (line 444–453) so it reads as the fallback it now is:

```ts
    /**
     * True when this resource holds in-progress user edits that a silent
     * replacement would destroy.
     *
     * Since #4345 the PRIMARY protection is promotion: the shell pins a records
     * preview tab on the `ResourceEditModeChangedEvent(true)` edge. This read
     * remains as the fallback the pool predicate consults for resources that
     * report edit state without raising that event, so such a tab still leaves
     * the consumption pool while editing.
     *
     * Default false: most resources are read-only surfaces with nothing to
     * lose. Resources that host an editable form override it.
     */
    public IsEditing(): boolean {
        return false;
    }
```

- [ ] **Step 4: Run the package suite**

Run: `cd packages/Angular/Explorer/shared && pnpm test`
Expected: all PASS (was 99 at #4154; expect 102).

- [ ] **Step 5: Build the package**

Run: `cd packages/Angular/Explorer/shared && pnpm run build`
Expected: clean build.

---

### Task 4: Explorer relay — `SingleRecordComponent` → `EntityRecordResource` (ng-explorer-core)

**Files:**
- Modify: `packages/Angular/Explorer/explorer-core/src/lib/single-record/single-record.component.ts` (outputs around line 60; `IsEditing()` at line 83)
- Modify: `packages/Angular/Explorer/explorer-core/src/lib/single-record/single-record.component.html`
- Modify: `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/record-resource.component.ts` (template at line 13; `IsEditing()` at line 18)
- Test (new): `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/record-resource.component.test.ts`

**Interfaces:**
- Consumes: `MjEntityFormHostComponent.EditModeChanged` (Task 2), `BaseResourceComponent.NotifyEditModeChanged` (Task 3).
- Produces:
  - `SingleRecordComponent.EditModeChanged: EventEmitter<boolean>` and `OnEditModeChanged(editing: boolean): void`.
  - `EntityRecordResource.ResourceEditModeChanged(editing: boolean): void` → `NotifyEditModeChanged(editing)`.

- [ ] **Step 1: Write the failing resource test**

Create `record-resource.component.test.ts` beside `record-resource.component.ts`, in the node style of `dashboard-resource.component.test.ts` (mock `@angular/core` and the base class; reach the class through `Object.create`):

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  EventEmitter: class { emit() {} },
}));
vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {
    public NotifyEditModeChanged = vi.fn<(editing: boolean) => void>();
  },
}));
vi.mock('@memberjunction/core-entities', () => ({ ResourceData: class {} }));
vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (target: Function) => target }));
vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  CompositeKey: class {},
  EntityInfo: class {},
  IsNewEntityRecordUrlId: vi.fn(() => false),
}));
vi.mock('../single-record/single-record.component', () => ({ SingleRecordComponent: class {} }));

import { EntityRecordResource } from './record-resource.component';

/**
 * EntityRecordResource is the last Explorer hop before BaseResourceComponent's
 * callback: it must forward the hosted form's edit-mode edge verbatim so the
 * tab container can promote the records preview tab.
 */
describe('EntityRecordResource.ResourceEditModeChanged', () => {
  it('forwards the edit flag to NotifyEditModeChanged', () => {
    const r = new EntityRecordResource();
    r.ResourceEditModeChanged(true);
    r.ResourceEditModeChanged(false);
    const notify = (r as unknown as { NotifyEditModeChanged: ReturnType<typeof vi.fn> }).NotifyEditModeChanged;
    expect(notify.mock.calls).toEqual([[true], [false]]);
  });

  it('IsEditing() stays a read of the live single-record (fallback path)', () => {
    const r = new EntityRecordResource();
    (r as unknown as { singleRecord: { IsEditing(): boolean } }).singleRecord = { IsEditing: () => true };
    expect(r.IsEditing()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Angular/Explorer/explorer-core && pnpm test -- record-resource.component`
Expected: FAIL — `r.ResourceEditModeChanged is not a function`.

- [ ] **Step 3: Relay through `SingleRecordComponent`**

In `single-record.component.ts`, after the `recordDismissed` alias (line 68):

```ts
  /**
   * Edit mode of the hosted form started (true) or ended (false). Relayed from
   * `<mj-entity-form-host>` so the resource wrapper can tell the shell to
   * promote this tab. {@link IsEditing} remains as the synchronous fallback.
   */
  @Output() public EditModeChanged: EventEmitter<boolean> = new EventEmitter<boolean>();
```

After `OnSaved` / `onSaved` (around line 125):

```ts
  OnEditModeChanged(editing: boolean): void {
    this.EditModeChanged.emit(editing);
  }
```

In `single-record.component.html`, add the binding before `(Dismissed)`:

```html
  (Notification)="onNotification($event)"
  (EditModeChanged)="OnEditModeChanged($event)"
  (Dismissed)="recordDismissed.emit()">
```

- [ ] **Step 4: Relay through `EntityRecordResource`**

In `record-resource.component.ts`, template (line 13) gains `(EditModeChanged)="ResourceEditModeChanged($event)"`:

```ts
    template: `<mj-single-record [PrimaryKey]="this.PrimaryKey" [entityName]="Data.Configuration.Entity" [newRecordValues]="Data.Configuration.NewRecordValues" (loadComplete)="NotifyLoadComplete()" (recordSaved)="ResourceRecordSaved($event)" (recordDismissed)="NotifyCloseRequested()" (EditModeChanged)="ResourceEditModeChanged($event)"></mj-single-record>`
```

And below `IsEditing()`:

```ts
    /** The hosted form entered or left edit mode; the shell promotes the tab on `true`. */
    public ResourceEditModeChanged(editing: boolean): void {
        this.NotifyEditModeChanged(editing);
    }
```

Update the `IsEditing()` comment on line 17 to `/** Fallback read for the pool predicate; promotion via ResourceEditModeChanged is the primary guard. */`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/Angular/Explorer/explorer-core && pnpm test -- record-resource.component`
Expected: 2 PASS.

- [ ] **Step 6: Build the package**

Run: `cd packages/Angular/Explorer/explorer-core && pnpm run build`
Expected: clean build. The template binding `(EditModeChanged)` compiles only if Task 2's `dist` was rebuilt; if the build reports an unknown output on `mj-entity-form-host`, rebuild `Generic/base-forms` first.

---

### Task 5: Promote in `TabContainerComponent`, and re-document the shell predicate (ng-explorer-core)

**Files:**
- Modify: `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts` (callback wiring at lines 1540–1542 and 2045–2047; new method next to `IsRecordTabEditing` at line 508)
- Modify: `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` (comment block at lines 497–509)
- Test (new): `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/records-tab-promote-on-edit.test.ts`

**Interfaces:**
- Consumes: `BaseResourceComponent.ResourceEditModeChangedEvent` and `getTabId()` (Task 3 / existing), `WorkspaceStateManager.PinTab` and `GetTab` (Task 1 / existing).
- Produces: `TabContainerComponent.PromoteRecordTabOnEdit(tabId: string): void` (public, so the shell or a test can call it; no other caller planned).

- [ ] **Step 1: Write the failing test**

Create `records-tab-promote-on-edit.test.ts` beside `records-tab-reload.test.ts`, copying that file's entire `vi.mock(...)` preamble verbatim (the `@angular/core`, `@memberjunction/*`, `../record-open/*`, `./component-cache-manager` mocks), then:

```ts
import { TabContainerComponent } from './tab-container.component';
import { IsRecordsRegionTab } from '@memberjunction/ng-shared';

/**
 * Promote-on-edit: the records preview tab is PINNED the moment its form
 * enters edit mode, so it is neither replaceable nor italic from then on
 * (VS Code's promote-on-modify). Promotion is sticky — the `false` edge that
 * SaveRecord / Cancel emit never unpins — and scoped to the records REGION:
 * docked records and classic-style tabs keep user-owned pin state.
 */
interface Harness {
  component: TabContainerComponent;
  pinTab: ReturnType<typeof vi.fn>;
}

function tab(overrides: Partial<{ isPinned: boolean; configuration: Record<string, unknown> }> = {}) {
  return {
    id: 'tab-1',
    applicationId: 'app-1',
    title: 'Widgets - r1',
    resourceRecordId: 'r1',
    isPinned: false,
    configuration: { resourceType: 'Records', Entity: 'Widgets', recordId: 'r1' },
    ...overrides,
  };
}

function createHarness(opts: { tab: ReturnType<typeof tab> | undefined; recordsStyle?: boolean }): Harness {
  const pinTab = vi.fn();
  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;
  internals['workspaceManager'] = { GetTab: () => opts.tab, PinTab: pinTab };
  Object.defineProperty(component, 'RecordsStyleActive', { get: () => opts.recordsStyle ?? true });
  return { component, pinTab };
}

describe('records region — promote on first edit', () => {
  beforeEach(() => {
    vi.mocked(IsRecordsRegionTab).mockReturnValue(true);
  });

  it('pins an unpinned region record when its form enters edit mode', () => {
    const h = createHarness({ tab: tab() });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).toHaveBeenCalledWith('tab-1');
  });

  it('does nothing for an already-pinned tab (new records are born pinned)', () => {
    const h = createHarness({ tab: tab({ isPinned: true }) });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).not.toHaveBeenCalled();
  });

  it('does nothing for a record DOCKED to the workspace (not in the region)', () => {
    vi.mocked(IsRecordsRegionTab).mockReturnValue(false);
    const h = createHarness({ tab: tab({ configuration: { resourceType: 'Records', recordDockedToWorkspace: true } }) });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).not.toHaveBeenCalled();
  });

  it('does nothing under the classic style (no records region exists)', () => {
    const h = createHarness({ tab: tab(), recordsStyle: false });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown tab id', () => {
    const h = createHarness({ tab: undefined });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).not.toHaveBeenCalled();
  });

  it('the wired callback pins on true and NEVER unpins on false (save / cancel)', () => {
    const h = createHarness({ tab: tab() });
    const instance = { getTabId: () => 'tab-1', ResourceEditModeChangedEvent: null as ((editing: boolean) => void) | null };
    (h.component as unknown as { wireEditModePromotion(i: typeof instance): void }).wireEditModePromotion(instance);
    expect(instance.ResourceEditModeChangedEvent).not.toBeNull();
    instance.ResourceEditModeChangedEvent!(true);
    instance.ResourceEditModeChangedEvent!(false);
    expect(h.pinTab).toHaveBeenCalledTimes(1);
    expect(h.pinTab).toHaveBeenCalledWith('tab-1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/Angular/Explorer/explorer-core && pnpm test -- records-tab-promote-on-edit`
Expected: FAIL — `PromoteRecordTabOnEdit is not a function`.

- [ ] **Step 3: Add the promotion method and the wiring helper**

In `tab-container.component.ts`, directly after `IsRecordTabEditing` (line 510):

```ts
  /**
   * Promote (pin) a records-region preview tab because its form just entered
   * edit mode — VS Code's promote-on-modify. A pinned tab is neither
   * replaceable by the next plain open nor rendered italic, which is the
   * permanent form of the protection the pool predicate's IsEditing() read
   * gives only transiently (#4345: that read ends the moment the user saves,
   * so the just-saved record was replaced by the next row click).
   *
   * Region-scoped on purpose: a record DOCKED to the workspace and every tab
   * under the classic style keep user-owned pin state — pinning a main-layout
   * tab also flips the shell out of single-resource mode, which is not this
   * feature's call to make.
   */
  public PromoteRecordTabOnEdit(tabId: string): void {
    const tab = this.workspaceManager.GetTab(tabId);
    if (!tab || tab.isPinned || !this.isRecordTab(tab)) {
      return;
    }
    this.workspaceManager.PinTab(tabId);
  }

  /**
   * Wire a resource's edit-mode callback to promotion. Resolves the tab id at
   * event time through the instance (not a closure) because cached components
   * are re-homed under a different tab id by RebindTabId when reattached.
   * Only the `true` edge acts: promotion is sticky, so the `false` that
   * SaveRecord / Cancel emit must never unpin.
   */
  private wireEditModePromotion(instance: Pick<BaseResourceComponent, 'getTabId' | 'ResourceEditModeChangedEvent'>): void {
    instance.ResourceEditModeChangedEvent = (editing: boolean) => {
      if (editing) {
        this.PromoteRecordTabOnEdit(instance.getTabId());
      }
    };
  }
```

- [ ] **Step 4: Call the wiring helper at both component-creation sites**

Single-resource path (after the `ResourceCloseRequestedEvent` assignment at lines 1540–1542):

```ts
    instance.ResourceCloseRequestedEvent = () => {
      this.handleResourceCloseRequested(activeTab.id, instance);
    };

    // Promote-on-edit: pin the records preview tab when its form starts editing.
    this.wireEditModePromotion(instance);
```

Multi-tab path (after the `ResourceCloseRequestedEvent` assignment at lines 2045–2047):

```ts
      instance.ResourceCloseRequestedEvent = () => {
        this.handleResourceCloseRequested(tabId, instance);
      };

      // Promote-on-edit: pin the records preview tab when its form starts editing.
      this.wireEditModePromotion(instance);
```

Cached components keep the callback they were created with, and `getTabId()` follows `RebindTabId`, so the reattach path at line 1988 needs no change.

- [ ] **Step 5: Re-document the shell predicate**

In `shell.component.ts`, replace the comment at lines 497–506 (keep the predicate itself unchanged):

```ts
      // The records region's OWN temp-tab pool (TabRequest.TempScope 'records').
      // Region membership again, not record identity, so a record docked to the
      // workspace is in neither pool: "Move to Workspace" takes a record out of
      // preview replacement, which is the point of docking it.
      // A tab whose form enters edit mode is PROMOTED — pinned by
      // TabContainerComponent.PromoteRecordTabOnEdit — and so leaves this pool
      // permanently (VS Code's promote-on-modify). The IsRecordTabEditing read
      // below is the fallback for resources that report IsEditing() without
      // raising ResourceEditModeChangedEvent: such a tab still leaves the pool
      // while editing, though only transiently (#4345).
```

- [ ] **Step 6: Run the test to verify it passes, then the package suite**

Run: `cd packages/Angular/Explorer/explorer-core && pnpm test -- records-tab-promote-on-edit`
Expected: 6 PASS.

Run: `cd packages/Angular/Explorer/explorer-core && pnpm test`
Expected: all PASS, both projects (was 175 at #4154; expect 183). Report counts.

- [ ] **Step 7: Build the package**

Run: `cd packages/Angular/Explorer/explorer-core && pnpm run build`
Expected: clean build.

---

### Task 6: Docs, changeset, and live verification

**Files:**
- Modify: `plans/records-temporary-tabs-plan.md` (decision D1 at lines 96–97)
- Create: `.changeset/records-preview-tab-promote-on-edit.md`

**Interfaces:** none.

- [ ] **Step 1: Amend decision D1 in the #4154 plan doc**

Append this paragraph directly after the D1 "Shipped instead" paragraph (line 97):

```markdown
  **Amended by #4345 (promote on first edit).** The pool exclusion above is transient: `IsEditing()` reads `Form.EditMode`, which `SaveRecord(true)` clears, so a just-saved record rejoined the pool and the next plain click replaced it — and while editing, the tab was still unpinned and therefore italic. Now `BaseFormComponent.EditModeChanged` fires from `StartEditMode`/`EndEditMode`, is relayed `MjEntityFormHostComponent` → `SingleRecordComponent` → `EntityRecordResource` → `BaseResourceComponent.ResourceEditModeChangedEvent`, and `TabContainerComponent.PromoteRecordTabOnEdit` pins the tab via the idempotent `WorkspaceStateManager.PinTab` on the `true` edge. Promotion is sticky (save and cancel never unpin), region-scoped (docked records and classic style untouched), and the `IsEditing()` read stays in the predicate as a fallback. The `FormStateService` entity-name keying noted above is still true and still irrelevant: the event rides the per-instance output chain, not the service.
```

- [ ] **Step 2: Write the changeset**

```markdown
---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-explorer-core": patch
---

Records preview tabs are promoted on first edit (#4345).

The edit protection #4154 shipped was transient: a record left the records region's
temp-tab pool only while its form was in edit mode, so the moment the user saved, the
tab silently rejoined the pool and the next plain row click replaced it. While editing,
the tab also stayed unpinned and therefore italic — the shell's vocabulary for
"replaceable" — on a tab that was in fact protected.

A records preview tab is now **pinned the moment its form enters edit mode**, matching
VS Code's promote-on-modify: it is neither replaceable nor italic from then on, and
promotion is sticky across save and cancel.

- `BaseFormComponent.EditModeChanged` (`EventEmitter<boolean>`) fires from
  `StartEditMode` / `EndEditMode`; `MjEntityFormHostComponent` relays it and emits
  `true` after mount when a form starts in edit mode (`StartInEditMode`, new records).
- `BaseResourceComponent.ResourceEditModeChangedEvent` is the shell-side callback;
  `EntityRecordResource` forwards the form's edge to it. `IsEditing()` stays as the
  fallback the pool predicate consults.
- `WorkspaceStateManager.PinTab(tabId)` pins idempotently (no configuration write when
  already pinned, so born-pinned new-record tabs stay quiet).
- `TabContainerComponent.PromoteRecordTabOnEdit` pins on the `true` edge, scoped to the
  records region: docked records and classic-style tabs keep user-owned pin state.
```

- [ ] **Step 3: Run the changeset and standards self-checks**

Run from the repo root:

```bash
npm run check:changeset
npm run check:standards
```

Expected: both pass.

- [ ] **Step 4: Run all four package suites and record counts**

```bash
cd packages/Angular/Generic/base-forms && pnpm test
cd packages/Angular/Explorer/shared && pnpm test
cd packages/Angular/Explorer/base-application && pnpm test
cd packages/Angular/Explorer/explorer-core && pnpm test
```

Expected: all PASS. Report pass/fail/skip per package in the final message.

- [ ] **Step 5: Live verification in MJExplorer (Matt restarts the servers)**

No SQL, migration, metadata, or generated entity changes are involved, so the deterministic integration tier is not the relevant gate here; the behavior is shell-side. Matt restarts MJAPI + MJExplorer himself (repo feedback: do not manage dev servers). Then walk the issue's repro in the browser:

1. Open the Data Explorer, click a record row. The records-region tab is italic.
2. Click Edit. **Expected:** the tab immediately drops italic and shows the thumbtack; the close X is hidden.
3. Change a field, Save. **Expected:** the tab stays pinned.
4. Click the next row. **Expected:** record B opens in a NEW tab; record A's tab is still there with A loaded.
5. Open a third record plain, click Edit, then Cancel. **Expected:** that tab is pinned too.
6. Right-click → "Move to Workspace" on a record, click Edit. **Expected:** no change to that tab's pin state (docked records are out of scope).
7. Click "Create New" on an entity. **Expected:** the tab is pinned as before, with no console error and no extra workspace save (check the Network tab for a single `UpdateConfiguration` persistence call, not two).

Capture full-page screenshots of steps 2 and 4 in light and dark mode for the PR (repo feedback: screenshots are full page, every changed surface, both themes).

- [ ] **Step 6: Follow-up to file, not to build here**

Classic style (`Shell.RecordOpen.Style = classic`) has no edit guard at all: an unpinned record tab in the main pool is consumable by the next nav click, edit or no edit. That predates #4154. Promoting main-layout tabs on edit would also flip the shell out of single-resource mode, which is a design call. File it as a separate issue referencing #4345 and this plan.

---

## Self-review notes

- **Spec coverage:** issue's Option 1 (pin on first `EditMode` true) → Tasks 1–5. "Fixes the italic inconsistency" → pinned tabs render `fontStyle: normal` in `golden-layout-manager.ts:665`, no CSS change needed. Issue's Option 2 wording fix is folded into Task 6 Step 1 so the plan doc no longer over-claims.
- **Type consistency:** `EditModeChanged: EventEmitter<boolean>` (Tasks 2, 4); `ResourceEditModeChangedEvent: ((editing: boolean) => void) | null` and `NotifyEditModeChanged(editing: boolean)` (Tasks 3, 4, 5); `PinTab(tabId: string): void` (Tasks 1, 5); `PromoteRecordTabOnEdit(tabId: string): void` and `wireEditModePromotion(instance)` (Task 5 only); `announceInitialEditMode(form: BaseFormComponent)` (Task 2 only).
- **Review Focus:** all five lines have an owning test (Task 5 cases 2, 3, 4, 6; Task 2 host case 2; Task 1 cases 2 and 4).
