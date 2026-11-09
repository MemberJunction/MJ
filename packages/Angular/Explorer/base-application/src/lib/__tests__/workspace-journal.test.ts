/**
 * A refresh within a few seconds of a workspace change used to come back one step behind: the
 * change was only in memory until the 500ms debounce fired AND the async entity save landed.
 * These tests pin the fix — a synchronous browser journal, a flush on page hide, and the
 * PrepareConfiguration hook the shell uses to make a deep link win over the saved workspace.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkspaceConfiguration } from '../interfaces/workspace-configuration.interface';
import {
  ShouldUseWorkspaceJournal,
  WorkspaceJournal,
  WorkspaceJournalEntry,
  WorkspaceJournalStorage
} from '../workspace-journal';

vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

/** A minimal stand-in for MJWorkspaceEntity: Save() stamps a new server __mj_UpdatedAt. */
class FakeWorkspace {
  ID = 'WS-1';
  UserID = 'user-1';
  Configuration = '';
  __mj_UpdatedAt: Date = new Date('2026-10-01T10:00:00.000Z');
  saves: string[] = [];
  Save = vi.fn(async () => {
    this.saves.push(this.Configuration);
    this.__mj_UpdatedAt = new Date(this.__mj_UpdatedAt.getTime() + 60_000);
    return true;
  });
}

const engineState: { workspaces: FakeWorkspace[]; constrained: boolean } = { workspaces: [], constrained: false };

vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    get Instance() {
      return {
        get IsPermissionConstrained() { return engineState.constrained; },
        get Workspaces() { return engineState.workspaces; },
      };
    }
  },
  MJWorkspaceEntity: class {},
}));

import { WorkspaceStateManager } from '../workspace-state-manager';

class MemoryStorage implements WorkspaceJournalStorage {
  data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

function config(tabIds: string[], active: string | null, params?: Record<string, string>): WorkspaceConfiguration {
  return {
    version: 1,
    activeTabId: active,
    theme: 'light',
    preferences: { tabPosition: 'top', showTabIcons: true, autoSaveInterval: 5000 },
    tabs: tabIds.map((id, i) => ({
      id, applicationId: 'app-1', title: id, resourceTypeId: '', resourceRecordId: '', isPinned: true, sequence: i,
      lastAccessedAt: '2026-10-01T10:00:00.000Z',
      configuration: params ? { resourceType: 'Custom', queryParams: params } : { resourceType: 'Custom' }
    }))
  };
}

function managerWith(storage: MemoryStorage): WorkspaceStateManager {
  const m = new WorkspaceStateManager();
  m.Journal = new WorkspaceJournal(() => storage);
  return m;
}

describe('ShouldUseWorkspaceJournal', () => {
  const entry = (base: string | null, ws: string | null = 'WS-1'): WorkspaceJournalEntry =>
    ({ Version: 1, UserID: 'user-1', WorkspaceID: ws, BaseUpdatedAt: base, Configuration: config(['a'], 'a') });

  it('wins when the server row has not been saved since the snapshot base', () => {
    expect(ShouldUseWorkspaceJournal(entry('2026-10-01T10:00:00.000Z'), 'WS-1', new Date('2026-10-01T10:00:00.000Z'))).toBe(true);
  });
  it('wins over an OLDER row (a stale locally cached copy)', () => {
    expect(ShouldUseWorkspaceJournal(entry('2026-10-01T10:05:00.000Z'), 'ws-1', '2026-10-01T10:00:00.000Z')).toBe(true);
  });
  it('loses to a row saved later by something this browser never saw (another device)', () => {
    expect(ShouldUseWorkspaceJournal(entry('2026-10-01T10:00:00.000Z'), 'WS-1', new Date('2026-10-01T10:00:01.000Z'))).toBe(false);
  });
  it('loses when it belongs to another workspace row, or has no base to compare', () => {
    expect(ShouldUseWorkspaceJournal(entry('2026-10-01T10:00:00.000Z', 'WS-2'), 'WS-1', new Date('2026-10-01T09:00:00.000Z'))).toBe(false);
    expect(ShouldUseWorkspaceJournal(entry(null), 'WS-1', new Date('2026-10-01T09:00:00.000Z'))).toBe(false);
    expect(ShouldUseWorkspaceJournal(null, 'WS-1', null)).toBe(false);
  });
  it('wins over a later row that is exactly its own in-flight save (landed after the page unloaded)', () => {
    const inFlight = JSON.stringify(config(['a', 'b'], 'b'));
    const e = { ...entry('2026-10-01T10:00:00.000Z'), InFlightConfiguration: inFlight };
    expect(ShouldUseWorkspaceJournal(e, 'WS-1', new Date('2026-10-01T10:01:00.000Z'), inFlight)).toBe(true);
    expect(ShouldUseWorkspaceJournal(e, 'WS-1', new Date('2026-10-01T10:01:00.000Z'), JSON.stringify(config(['z'], 'z'))), 'another device\'s row still wins').toBe(false);
  });
  it('is used for a session with no workspace row only when the entry has none either', () => {
    expect(ShouldUseWorkspaceJournal(entry(null, null), null, null)).toBe(true);
    expect(ShouldUseWorkspaceJournal(entry(null, 'WS-1'), null, null)).toBe(false);
  });
});

describe('WorkspaceJournal', () => {
  it('ignores unreadable, foreign-user and wrong-version entries, and survives a throwing storage', () => {
    const storage = new MemoryStorage();
    const journal = new WorkspaceJournal(() => storage);
    storage.setItem(WorkspaceJournal.KeyFor('user-1'), '{not json');
    expect(journal.Read('user-1')).toBeNull();
    storage.setItem(WorkspaceJournal.KeyFor('user-1'), JSON.stringify({ Version: 2, UserID: 'user-1', Configuration: config([], null) }));
    expect(journal.Read('user-1')).toBeNull();

    const throwing = new WorkspaceJournal(() => { throw new Error('SecurityError'); });
    expect(() => throwing.Write({ Version: 1, UserID: 'u', WorkspaceID: null, BaseUpdatedAt: null, Configuration: config([], null) })).not.toThrow();
    expect(throwing.Read('u')).toBeNull();
  });
});

describe('WorkspaceStateManager — refresh inside the save window', () => {
  beforeEach(() => {
    engineState.constrained = false;
    engineState.workspaces = [];
  });

  it('journals every change synchronously, before the debounced save runs', () => {
    const storage = new MemoryStorage();
    const ws = new FakeWorkspace();
    ws.Configuration = JSON.stringify(config(['a', 'b'], 'a'));
    engineState.workspaces = [ws];
    const m = managerWith(storage);
    return m.Initialize('user-1').then(() => {
      m.SetActiveTab('b');
      const entry = m.Journal.Read('user-1');
      expect(entry?.Configuration.activeTabId).toBe('b');
      expect(ws.Save, 'nothing has reached the database yet').not.toHaveBeenCalled();
      expect(m.HasPendingSave).toBe(true);
    });
  });

  it('a reload that finds the row one step behind restores the journal and re-saves it', async () => {
    const storage = new MemoryStorage();
    // Session 1: a change is made, the page is reloaded before any save lands.
    const ws1 = new FakeWorkspace();
    ws1.Configuration = JSON.stringify(config(['a', 'b'], 'a'));
    engineState.workspaces = [ws1];
    const first = managerWith(storage);
    await first.Initialize('user-1');
    first.SetActiveTab('b');

    // Session 2: the server row is still the pre-change one.
    const ws2 = new FakeWorkspace();
    ws2.Configuration = JSON.stringify(config(['a', 'b'], 'a'));
    engineState.workspaces = [ws2];
    const second = managerWith(storage);
    await second.Initialize('user-1');

    expect(second.GetConfiguration()?.activeTabId, 'the newest change survived the reload').toBe('b');
    expect(second.HasPendingSave, 'the restored snapshot is queued for the database').toBe(true);
    await second.FlushPendingSave();
    expect(JSON.parse(ws2.saves[0]).activeTabId).toBe('b');
  });

  it('a row saved later elsewhere beats the local journal', async () => {
    const storage = new MemoryStorage();
    const ws1 = new FakeWorkspace();
    ws1.Configuration = JSON.stringify(config(['a', 'b'], 'a'));
    engineState.workspaces = [ws1];
    const first = managerWith(storage);
    await first.Initialize('user-1');
    first.SetActiveTab('b');

    const ws2 = new FakeWorkspace();
    ws2.Configuration = JSON.stringify(config(['a', 'c'], 'c'));
    ws2.__mj_UpdatedAt = new Date('2026-10-02T00:00:00.000Z'); // saved by another device afterwards
    engineState.workspaces = [ws2];
    const second = managerWith(storage);
    await second.Initialize('user-1');
    expect(second.GetConfiguration()?.activeTabId).toBe('c');
    expect(second.HasPendingSave).toBe(false);
  });

  it('FlushPendingSave persists immediately, then the debounce has nothing left to do', async () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const ws = new FakeWorkspace();
      ws.Configuration = JSON.stringify(config(['a', 'b'], 'a'));
      engineState.workspaces = [ws];
      const m = managerWith(storage);
      await m.Initialize('user-1');
      m.SetActiveTab('b');
      await m.FlushPendingSave();
      expect(ws.Save).toHaveBeenCalledTimes(1);
      expect(JSON.parse(ws.saves[0]).activeTabId).toBe('b');
      await vi.advanceTimersByTimeAsync(1000);
      expect(ws.Save, 'the debounced save must not run a second time').toHaveBeenCalledTimes(1);
      // The journal is re-based on the stamp the save produced, so the next load trusts it.
      expect(m.Journal.Read('user-1')?.BaseUpdatedAt).toBe(ws.__mj_UpdatedAt.toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it('a change made while a save is in flight survives that save landing after the page unloaded', async () => {
    const storage = new MemoryStorage();
    const ws1 = new FakeWorkspace();
    ws1.Configuration = JSON.stringify(config(['a', 'b', 'c'], 'a'));
    engineState.workspaces = [ws1];
    let landSave: () => void = () => undefined;
    ws1.Save.mockImplementationOnce(() => new Promise<boolean>(resolve => { landSave = () => resolve(true); }));
    const first = managerWith(storage);
    await first.Initialize('user-1');

    first.SetActiveTab('b');
    const saving = first.FlushPendingSave(); // save of B is now in flight
    first.SetActiveTab('c');                  // change C journaled while it flies
    const unloadSnapshot = new Map(storage.data); // the page unloads here; B still lands on the server
    landSave();
    await saving;

    const ws2 = new FakeWorkspace();
    ws2.Configuration = ws1.Configuration; // the server row holds exactly what the save of B sent ...
    ws2.__mj_UpdatedAt = new Date('2026-10-01T10:01:00.000Z');        // ... stamped after the journal's base
    engineState.workspaces = [ws2];
    const reloaded = new MemoryStorage();
    reloaded.data = unloadSnapshot;
    const second = managerWith(reloaded);
    await second.Initialize('user-1');
    expect(second.GetConfiguration()?.activeTabId, 'C was not discarded in favour of the older B').toBe('c');
  });

  it('runs one save at a time: a flush during an in-flight save waits for it, then saves the newest change', async () => {
    const storage = new MemoryStorage();
    const ws = new FakeWorkspace();
    ws.Configuration = JSON.stringify(config(['a', 'b', 'c'], 'a'));
    engineState.workspaces = [ws];
    let landFirst: () => void = () => undefined;
    let concurrent = 0;
    let maxConcurrent = 0;
    const original = ws.Save.getMockImplementation();
    ws.Save.mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      if (ws.saves.length === 0) {
        await new Promise<void>(resolve => { landFirst = resolve; });
      }
      const ok = await original!();
      concurrent--;
      return ok;
    });
    const m = managerWith(storage);
    await m.Initialize('user-1');

    m.SetActiveTab('b');
    const firstSave = m.FlushPendingSave();
    m.SetActiveTab('c');
    const secondFlush = m.FlushPendingSave(); // e.g. pagehide while the debounced save flies
    await Promise.resolve();
    expect(ws.Save, 'the second save waits for the first').toHaveBeenCalledTimes(1);
    landFirst();
    await Promise.all([firstSave, secondFlush]);
    expect(maxConcurrent).toBe(1);
    expect(ws.saves.map(c => JSON.parse(c).activeTabId)).toEqual(['b', 'c']);
  });

  it('flushes on pagehide', async () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('window', { addEventListener: (name: string, fn: () => void) => listeners.set(name, fn) });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: (name: string, fn: () => void) => listeners.set(`doc:${name}`, fn) });
    try {
      const storage = new MemoryStorage();
      const ws = new FakeWorkspace();
      ws.Configuration = JSON.stringify(config(['a', 'b'], 'a'));
      engineState.workspaces = [ws];
      const m = managerWith(storage);
      await m.Initialize('user-1');
      m.SetActiveTab('b');
      listeners.get('pagehide')?.();
      await Promise.resolve();
      expect(ws.Save).toHaveBeenCalledTimes(1);
      expect(listeners.has('doc:visibilitychange')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('WorkspaceStateManager.Initialize — PrepareConfiguration', () => {
  beforeEach(() => {
    engineState.constrained = false;
    engineState.workspaces = [];
  });

  it('publishes the PREPARED configuration as the very first value, and persists it', async () => {
    const ws = new FakeWorkspace();
    ws.Configuration = JSON.stringify(config(['a', 'b'], 'a', { ballot: 'old' }));
    engineState.workspaces = [ws];
    const m = managerWith(new MemoryStorage());
    const seen: (string | null)[] = [];
    m.Configuration.subscribe(c => { if (c) seen.push(c.activeTabId); });

    await m.Initialize('user-1', {
      PrepareConfiguration: c => ({ ...c, activeTabId: 'b' })
    });

    expect(seen, 'no subscriber ever saw the unprepared configuration').toEqual(['b']);
    expect(m.HasPendingSave).toBe(true);
  });

  it('a hook that returns the same object changes nothing and queues no save', async () => {
    const ws = new FakeWorkspace();
    ws.Configuration = JSON.stringify(config(['a'], 'a'));
    engineState.workspaces = [ws];
    const m = managerWith(new MemoryStorage());
    await m.Initialize('user-1', { PrepareConfiguration: c => c });
    expect(m.HasPendingSave).toBe(false);
  });

  it('a brand-new user (no workspace row yet) gets the hook too, and a journal seeded on the new row', async () => {
    const created = new FakeWorkspace();
    const m = managerWith(new MemoryStorage());
    m.Provider = {
      CurrentUser: { ID: 'user-1' },
      GetEntityObject: async () => created,
    } as unknown as WorkspaceStateManager['Provider'];
    await m.Initialize('user-1', {
      PrepareConfiguration: c => ({ ...c, activeTabId: 'deep-linked' })
    });
    expect(m.GetConfiguration()?.activeTabId).toBe('deep-linked');
    expect(m.Journal.Read('user-1')?.WorkspaceID).toBe('WS-1');
  });

  it('a throwing hook never blocks startup', async () => {
    const ws = new FakeWorkspace();
    ws.Configuration = JSON.stringify(config(['a'], 'a'));
    engineState.workspaces = [ws];
    const m = managerWith(new MemoryStorage());
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await m.Initialize('user-1', { PrepareConfiguration: () => { throw new Error('boom'); } });
    expect(m.GetConfiguration()?.activeTabId).toBe('a');
    err.mockRestore();
  });
});
