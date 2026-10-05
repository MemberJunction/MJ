// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as shell-global-keydown.test.ts in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WorkspaceStateManager, CreateDefaultWorkspaceConfiguration, TabRequest } from '@memberjunction/ng-base-application';
import { InstanceConfigEngine } from '@memberjunction/core-entities';
import { GetRecordOpenStyle, SetRecordOpenStyle } from '@memberjunction/ng-shared';
import { ShellComponent } from './shell.component';
import { TabContainerComponent } from './components/tabs/tab-container.component';

/**
 * The records-region edit guard, pinned THROUGH the shell's own composition.
 *
 * resolveRecordOpenStyle() hands the workspace manager this predicate:
 *
 *   (tab) => IsRecordsRegionTab(tab.configuration) && !this.TabContainerRef?.IsRecordTabEditing(tab.id)
 *
 * The base-application pool tests inject their own predicate, so they prove
 * the manager honours WHATEVER it is given and nothing about this clause.
 * Delete `&& !...IsRecordTabEditing(...)` and every one of them still passes
 * while a user's in-progress edit is silently destroyed by the next record
 * click. This file is the test that goes red in that case.
 *
 * Harness: the REAL ShellComponent prototype (Object.create, no DI), the REAL
 * WorkspaceStateManager, and a fake TabContainerRef whose editing answer the
 * test flips at will. InstanceConfigEngine.Instance.Get is spied so the style
 * can be forced without a database.
 */

interface Harness {
  shell: ShellComponent;
  manager: WorkspaceStateManager;
  /** Tab ids the fake container reports as editing. Mutate between opens. */
  editing: Set<string>;
  isRecordTabEditing: ReturnType<typeof vi.fn>;
}

function createShell(opts?: { style?: string; attachTabContainer?: boolean }): Harness {
  vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockImplementation(
    (key: string) => (key === 'Shell.RecordOpen.Style' ? opts?.style : undefined)
  );

  const manager = new WorkspaceStateManager();
  manager.UpdateConfiguration(CreateDefaultWorkspaceConfiguration());

  const editing = new Set<string>();
  const isRecordTabEditing = vi.fn((tabId: string) => editing.has(tabId));

  const shell = Object.create(ShellComponent.prototype) as ShellComponent;
  const internals = shell as unknown as Record<string, unknown>;
  internals['workspaceManager'] = manager;
  if (opts?.attachTabContainer !== false) {
    shell.TabContainerRef = { IsRecordTabEditing: isRecordTabEditing } as unknown as TabContainerComponent;
  }

  (shell as unknown as { resolveRecordOpenStyle(): void }).resolveRecordOpenStyle();
  return { shell, manager, editing, isRecordTabEditing };
}

/** A plain (no-modifier) record click — the request NavigationService issues under the records style. */
function recordRequest(recordId: string, entity = 'Widgets'): TabRequest {
  return {
    ApplicationId: 'app-1',
    Title: `${entity} - ${recordId}`,
    ResourceRecordId: recordId,
    TempScope: 'records',
    Configuration: { resourceType: 'Records', Entity: entity, recordId },
  };
}
/** A record promoted out of the region with "Move to Workspace". */
function dockedRecordRequest(recordId: string): TabRequest {
  return {
    ApplicationId: 'app-1',
    Title: `Docked ${recordId}`,
    ResourceRecordId: recordId,
    PreservePinState: true,
    Configuration: { resourceType: 'Records', Entity: 'Widgets', recordId, recordDockedToWorkspace: true },
  };
}
const openRecord = (h: Harness, recordId: string) => h.manager.OpenTab(recordRequest(recordId), '#ff0000');
const tabs = (h: Harness) => h.manager.GetConfiguration()!.tabs;

describe('ShellComponent — records-region pool excludes a record being edited', () => {
  afterEach(() => {
    // The style lives in the global object store; leave the default behind.
    SetRecordOpenStyle('records');
  });

  it('baseline: a plain open consumes the region temp tab when nothing is being edited', () => {
    const h = createShell();
    const first = openRecord(h, 'r1');
    const second = openRecord(h, 'r2');
    expect(second).toBe(first);
    expect(tabs(h).length).toBe(1);
    expect(tabs(h)[0].resourceRecordId).toBe('r2');
  });

  it('an EDITING record tab is not in the pool: the next plain open gets its own tab', () => {
    const h = createShell();
    const editingId = openRecord(h, 'r1');
    // Editing starts AFTER the predicate was composed. The guard must be read
    // live on every open, not captured once at resolve time.
    h.editing.add(editingId);

    const nextId = openRecord(h, 'r2');

    expect(nextId).not.toBe(editingId);
    expect(tabs(h).length).toBe(2);
    const survivor = tabs(h).find((t) => t.id === editingId)!;
    expect(survivor.resourceRecordId).toBe('r1');
    expect(survivor.title).toBe('Widgets - r1');
    // The shell asked the container about THAT tab, by id.
    expect(h.isRecordTabEditing).toHaveBeenCalledWith(editingId);
  });

  it('the same tab is back in the pool once editing ends', () => {
    const h = createShell();
    const tabId = openRecord(h, 'r1');
    h.editing.add(tabId);
    openRecord(h, 'r2'); // protected: created a second tab
    expect(tabs(h).length).toBe(2);

    h.editing.delete(tabId);
    const tab = tabs(h).find((t) => t.id === tabId)!;
    expect(h.manager.RecordsRegionTabFilter!(tab)).toBe(true);

    // Both region tabs are now unpinned and consumable; the manager takes the
    // first in tab order, which is the one that was being edited.
    const nextId = openRecord(h, 'r3');
    expect(nextId).toBe(tabId);
    expect(tabs(h).length).toBe(2);
    expect(tabs(h).find((t) => t.id === tabId)!.resourceRecordId).toBe('r3');
  });

  it('before the tab container view child resolves, nothing counts as editing (startup fail-safe)', () => {
    // resolveRecordOpenStyle() runs in initializeShell, BEFORE AfterViewInit,
    // so TabContainerRef is undefined for the first configuration emissions.
    // The `?.` is what keeps the first record open on preview behaviour.
    const h = createShell({ attachTabContainer: false });
    expect(h.shell.TabContainerRef).toBeUndefined();
    const first = openRecord(h, 'r1');
    const second = openRecord(h, 'r2');
    expect(second).toBe(first);
    expect(tabs(h).length).toBe(1);
  });

  it('a DOCKED record is in neither pool, editing or not', () => {
    const h = createShell();
    const dockedId = h.manager.OpenTabForced(dockedRecordRequest('r1'), '#ff0000');
    for (const dockedIsEditing of [false, true]) {
      if (dockedIsEditing) {
        h.editing.add(dockedId);
      }
      const docked = tabs(h).find((t) => t.id === dockedId)!;
      expect(h.manager.RecordsRegionTabFilter!(docked)).toBe(false);
    }
    openRecord(h, 'r2');
    expect(tabs(h).some((t) => t.id === dockedId && t.resourceRecordId === 'r1')).toBe(true);
    expect(tabs(h).length).toBe(2);
  });

  it('a non-record tab is never in the records pool, so the container is not even asked about it', () => {
    const h = createShell();
    const navId = h.manager.OpenTab(
      { ApplicationId: 'app-1', Title: 'Data', Configuration: { resourceType: 'Dashboards', navItemName: 'Data' } },
      '#ff0000'
    );
    openRecord(h, 'r1');
    expect(tabs(h).find((t) => t.id === navId)!.title).toBe('Data');
    // Short-circuit: IsRecordsRegionTab is false first, so the editing clause
    // never runs for the nav tab.
    expect(h.isRecordTabEditing).not.toHaveBeenCalledWith(navId);
  });

  it("classic style: no records pool at all, and the container is never consulted", () => {
    const h = createShell({ style: 'classic' });
    expect(GetRecordOpenStyle()).toBe('classic');
    expect(h.manager.RecordsRegionTabFilter).toBeNull();
    openRecord(h, 'r1');
    openRecord(h, 'r2');
    // Empty pool: each records-scoped open creates its own tab.
    expect(tabs(h).length).toBe(2);
    expect(h.isRecordTabEditing).not.toHaveBeenCalled();
  });
});
