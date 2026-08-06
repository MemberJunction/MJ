import { describe, it, expect, beforeEach } from 'vitest';
import { MJWorkspaceTabStore } from '../lib/workspace-tabs/workspace-tab-store';
import { MJWorkspaceTab } from '../lib/workspace-tabs/workspace-tabs.types';

/**
 * TIER 1 — the workspace-tab state machine (UI plan §8.0).
 *
 * Exhaustive by design: this is the extracted pure seam, so every transition, every neighbour-
 * activation case, and every miss-by-id case is asserted here rather than through the DOM.
 * v1 is session-scoped — there is deliberately no persistence to test.
 */

interface DraftPayload {
  Description: string;
}

function tab(id: string, overrides: Partial<MJWorkspaceTab<DraftPayload>> = {}): MJWorkspaceTab<DraftPayload> {
  return {
    Id: id,
    Label: `Tab ${id}`,
    Status: 'draft',
    State: { Description: `draft ${id}` },
    ...overrides,
  };
}

describe('MJWorkspaceTabStore', () => {
  let store: MJWorkspaceTabStore<DraftPayload>;

  beforeEach(() => {
    store = new MJWorkspaceTabStore<DraftPayload>();
  });

  describe('Open', () => {
    it('adds a tab and makes it active', () => {
      const opened = store.Open(tab('a'));

      expect(store.Count).toBe(1);
      expect(store.ActiveId).toBe('a');
      expect(store.ActiveTab).toBe(opened);
    });

    it('activates the existing tab instead of duplicating when the Id is already open', () => {
      const first = store.Open(tab('a', { Label: 'Original' }));
      store.Open(tab('b'));
      expect(store.ActiveId).toBe('b');

      const reopened = store.Open(tab('a', { Label: 'Should not replace' }));

      expect(store.Count).toBe(2);
      expect(reopened).toBe(first);
      expect(reopened.Label).toBe('Original');
      expect(store.ActiveId).toBe('a');
    });

    it('keeps strip order as opened', () => {
      store.Open(tab('a'));
      store.Open(tab('b'));
      store.Open(tab('c'));

      expect(store.Tabs.map((t) => t.Id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Tabs accessor', () => {
    it('returns a copy so callers cannot mutate internal state', () => {
      store.Open(tab('a'));

      store.Tabs.push(tab('rogue'));

      expect(store.Count).toBe(1);
    });
  });

  describe('Activate', () => {
    it('activates a known tab and reports success', () => {
      store.Open(tab('a'));
      store.Open(tab('b'));

      expect(store.Activate('a')).toBe(true);
      expect(store.ActiveId).toBe('a');
    });

    it('returns false and leaves the active tab untouched for an unknown id', () => {
      store.Open(tab('a'));

      expect(store.Activate('nope')).toBe(false);
      expect(store.ActiveId).toBe('a');
    });
  });

  describe('Close', () => {
    it('activates the RIGHT neighbour when closing the active tab', () => {
      store.Open(tab('a'));
      store.Open(tab('b'));
      store.Open(tab('c'));
      store.Activate('b');

      expect(store.Close('b')).toBe(true);

      expect(store.Tabs.map((t) => t.Id)).toEqual(['a', 'c']);
      expect(store.ActiveId).toBe('c');
    });

    it('falls back to the LEFT neighbour when closing the last tab', () => {
      store.Open(tab('a'));
      store.Open(tab('b'));
      store.Activate('b');

      expect(store.Close('b')).toBe(true);

      expect(store.ActiveId).toBe('a');
    });

    it('leaves nothing active when the only tab is closed', () => {
      store.Open(tab('a'));

      store.Close('a');

      expect(store.Count).toBe(0);
      expect(store.ActiveId).toBeNull();
      expect(store.ActiveTab).toBeNull();
    });

    it('does not change the active tab when closing an INACTIVE tab', () => {
      store.Open(tab('a'));
      store.Open(tab('b'));
      store.Activate('b');

      store.Close('a');

      expect(store.ActiveId).toBe('b');
    });

    it('returns false for an unknown id', () => {
      store.Open(tab('a'));

      expect(store.Close('nope')).toBe(false);
      expect(store.Count).toBe(1);
    });
  });

  describe('UpdateState', () => {
    it('replaces the payload and marks the tab dirty by default', () => {
      store.Open(tab('a'));

      expect(store.UpdateState('a', { Description: 'edited' })).toBe(true);

      expect(store.ActiveTab?.State).toEqual({ Description: 'edited' });
      expect(store.ActiveTab?.Dirty).toBe(true);
      expect(store.HasDirtyTabs).toBe(true);
    });

    it('can update without marking dirty (e.g. a programmatic sync)', () => {
      store.Open(tab('a'));

      store.UpdateState('a', { Description: 'synced' }, false);

      expect(store.ActiveTab?.State).toEqual({ Description: 'synced' });
      expect(store.ActiveTab?.Dirty).toBeUndefined();
      expect(store.HasDirtyTabs).toBe(false);
    });

    it('returns false for an unknown id', () => {
      expect(store.UpdateState('nope', { Description: 'x' })).toBe(false);
    });
  });

  describe('SetStatus', () => {
    it('records the rejection reason when moving to rejected', () => {
      store.Open(tab('a'));

      expect(store.SetStatus('a', 'rejected', 'Totals do not foot')).toBe(true);

      expect(store.ActiveTab?.Status).toBe('rejected');
      expect(store.ActiveTab?.RejectionReason).toBe('Totals do not foot');
    });

    it('CLEARS a stale rejection reason when moving off rejected', () => {
      store.Open(tab('a'));
      store.SetStatus('a', 'rejected', 'Totals do not foot');

      store.SetStatus('a', 'draft');

      expect(store.ActiveTab?.Status).toBe('draft');
      expect(store.ActiveTab?.RejectionReason).toBeNull();
    });

    it('does not carry a reason onto a complete tab', () => {
      store.Open(tab('a'));
      store.SetStatus('a', 'rejected', 'nope');

      store.SetStatus('a', 'complete', 'ignored');

      expect(store.ActiveTab?.RejectionReason).toBeNull();
    });

    it('returns false for an unknown id', () => {
      expect(store.SetStatus('nope', 'complete')).toBe(false);
    });
  });

  describe('MarkClean', () => {
    it('clears dirty without touching the payload', () => {
      store.Open(tab('a'));
      store.UpdateState('a', { Description: 'edited' });

      expect(store.MarkClean('a')).toBe(true);

      expect(store.ActiveTab?.Dirty).toBe(false);
      expect(store.ActiveTab?.State).toEqual({ Description: 'edited' });
      expect(store.HasDirtyTabs).toBe(false);
    });

    it('returns false for an unknown id', () => {
      expect(store.MarkClean('nope')).toBe(false);
    });
  });

  describe('HasDirtyTabs', () => {
    it('is false with no tabs', () => {
      expect(store.HasDirtyTabs).toBe(false);
    });

    it('is true when ANY tab is dirty, not just the active one', () => {
      store.Open(tab('a'));
      store.Open(tab('b'));
      store.UpdateState('a', { Description: 'edited' });
      store.Activate('b');

      expect(store.HasDirtyTabs).toBe(true);
    });
  });

  describe('Clear', () => {
    it('drops every tab and deactivates', () => {
      store.Open(tab('a'));
      store.Open(tab('b'));

      store.Clear();

      expect(store.Count).toBe(0);
      expect(store.ActiveId).toBeNull();
      expect(store.HasDirtyTabs).toBe(false);
    });
  });
});
